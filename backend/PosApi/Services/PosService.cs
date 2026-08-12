using System.Data;
using Dapper;
using Microsoft.Extensions.Options;
using PosApi.Configuration;
using PosApi.Data;
using PosApi.Models.Dtos;

namespace PosApi.Services;

public interface IPosService
{
    Task<NextInvoiceDto> GetNextInvoiceAsync(long companyId, long locationId);
    Task<IReadOnlyList<InvoiceSearchResultDto>> SearchInvoicesAsync(string? term, long companyId, long locationId, int limit = 50);
    Task<IReadOnlyList<TodayInvoiceListItemDto>> GetTodayInvoicesAsync(long companyId, long locationId, long employeeId, int limit = 100);
    Task<LoadedInvoiceDto?> GetInvoiceAsync(string invoiceNo, long companyId, long locationId);
    Task<InvoicePrintContextDto?> GetInvoicePrintContextAsync(string invoiceNo, long companyId, long locationId);
    Task<SaveInvoiceResponse> SaveInvoiceAsync(SaveInvoiceRequest request);
    Task<MultiScanResultDto?> MultiScanAsync(string term, long? companyId, long? locationId);
    Task<IReadOnlyList<MultiScanSearchItemDto>> SearchMultiScanAsync(string term, long? companyId, long? locationId, int limit = 25);
}

public class PosService(
    IDbConnectionFactory db,
    ICustomerService customerService,
    IProductService productService,
    IOptions<PosSettings> settings) : IPosService
{
    private const long VatTaxId = 2;
    private const long AitTaxId = 1;

    private readonly PosSettings _settings = settings.Value;

    public async Task<NextInvoiceDto> GetNextInvoiceAsync(long companyId, long locationId)
    {
        using var conn = db.CreateConnection();
        var year = DateTime.Now.Year;
        var invoiceNo = await PosDocumentNumberService.PeekInvoiceNoAsync(conn, null, companyId, locationId, year);
        var salesOrderNo = await PosDocumentNumberService.PeekSalesOrderNoAsync(conn, null, companyId, locationId, year);
        return new NextInvoiceDto(invoiceNo, salesOrderNo);
    }

    public async Task<IReadOnlyList<InvoiceSearchResultDto>> SearchInvoicesAsync(
        string? term,
        long companyId,
        long locationId,
        int limit = 50)
    {
        var effectiveLimit = limit > 0 ? Math.Min(limit, 100) : 50;
        var sql = """
            SELECT TOP (@Limit)
                so.InvoiceNo,
                so.SalesOrderId,
                so.InvoiceDate,
                b.Name AS CustomerName
            FROM SalesOrder so
            LEFT JOIN Buyer b ON b.BuyerId = so.BuyerId
            WHERE so.CompanyId = @CompanyId
              AND so.LocationId = @LocationId
              AND so.InvoiceNo IS NOT NULL
            """;

        var parameters = new DynamicParameters();
        parameters.Add("Limit", effectiveLimit);
        parameters.Add("CompanyId", companyId);
        parameters.Add("LocationId", locationId);

        if (!string.IsNullOrWhiteSpace(term))
        {
            sql += " AND (so.InvoiceNo LIKE @Term OR so.SalesOrderNo LIKE @Term)";
            parameters.Add("Term", $"%{term.Trim()}%");
        }

        sql += " ORDER BY so.DateOFEntry DESC";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<InvoiceSearchResultDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<TodayInvoiceListItemDto>> GetTodayInvoicesAsync(
        long companyId, long locationId, long employeeId, int limit = 100)
    {
        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<TodayInvoiceListItemDto>(
            """
            SELECT TOP (@Limit)
                so.InvoiceNo,
                so.SalesOrderId,
                so.InvoiceDate,
                ISNULL(b.Name, '') AS CustomerName,
                ISNULL(ic.ItemCount, 0) AS ItemCount,
                so.TotalAmount AS GrandTotal,
                CASE WHEN so.Approved = 'Y' THEN 'Active' ELSE 'Saved' END AS Status
            FROM SalesOrder so
            LEFT JOIN Buyer b ON b.BuyerId = so.BuyerId
            OUTER APPLY (
                SELECT COUNT(*) AS ItemCount
                FROM SalesOrderDetail sod
                WHERE sod.SalesOrderId = so.SalesOrderId
            ) ic
            WHERE so.CompanyId = @CompanyId
              AND so.LocationId = @LocationId
              AND so.EmployeeId = @EmployeeId
              AND so.InvoiceNo IS NOT NULL
              AND CAST(ISNULL(so.InvoiceDate, so.DateOFEntry) AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY so.DateOFEntry DESC
            """,
            new { CompanyId = companyId, LocationId = locationId, EmployeeId = employeeId, Limit = limit });
        return rows.ToList();
    }

    public async Task<LoadedInvoiceDto?> GetInvoiceAsync(string invoiceNo, long companyId, long locationId)
    {
        using var conn = db.CreateConnection();

        var header = await conn.QueryFirstOrDefaultAsync<InvoiceHeaderRow>("""
            SELECT
                so.SalesOrderId,
                so.InvoiceNo,
                so.SalesOrderNo,
                so.BuyerId,
                ISNULL(b.Name, '') AS CustomerName,
                b.Phone AS Mobile,
                b.Address,
                so.Remarks,
                so.ReferenceId,
                so.BiznessEventTypeId,
                so.ProjectId,
                so.EmployeeId,
                so.PaymentModeId,
                so.InvoiceDate,
                so.PaymentPromiseDate,
                so.InvoiceDiscount,
                so.InvoiceDiscountType,
                so.TotalTax,
                ISNULL(so.TotalCharge, 0) AS OthersCharge,
                so.TotalAmount,
                ISNULL(pos.GivenAmount, so.ReceiveAmount) AS GivenAmount
            FROM SalesOrder so
            LEFT JOIN Buyer b ON b.BuyerId = so.BuyerId
            LEFT JOIN SalesOrder_POS pos ON pos.SalesOrderId = so.SalesOrderId
            WHERE so.InvoiceNo = @InvoiceNo
              AND so.CompanyId = @CompanyId
              AND so.LocationId = @LocationId
            """, new { InvoiceNo = invoiceNo.Trim(), CompanyId = companyId, LocationId = locationId });

        if (header is null)
            return null;

        var detailRows = (await conn.QueryAsync<InvoiceDetailRow>("""
            SELECT
                sod.SalesOrderDetailId,
                sod.ProductId,
                p.Name AS ProductName,
                p.ModelNo,
                sod.Quantity,
                sod.Price AS UnitPrice,
                ISNULL(sod.Discount, 0) AS Discount,
                ISNULL(sod.Warranty, 0) AS WarrantyDays,
                CASE WHEN p.SerialAvailable = 'Y' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS IsSerial,
                ut.Name AS UnitName,
                CASE
                    WHEN UPPER(LTRIM(RTRIM(ISNULL(p.ProductType, '')))) = 'S' THEN CAST(0 AS decimal(18,4))
                    ELSE ISNULL(stock.StockQty, 0) + ISNULL(reserved.ReservedQty, 0)
                END AS StockQty,
                ISNULL(vat.TaxAmount, 0) AS VatAmount,
                ISNULL(ait.TaxAmount, 0) AS AitAmount,
                p.ProductType,
                CASE
                    WHEN EXISTS (SELECT 1 FROM Price prSetup WHERE prSetup.ProductId = p.ProductId)
                    THEN CAST(1 AS bit) ELSE CAST(0 AS bit)
                END AS HasPriceSetup
            FROM SalesOrderDetail sod
            INNER JOIN Product p ON p.ProductId = sod.ProductId
            LEFT JOIN UnitType ut ON ut.UnitTypeId = p.UnitTypeId
            OUTER APPLY (
                SELECT ISNULL(SUM(cs.Unit), 0) AS StockQty
                FROM CurrentStock cs
                WHERE cs.ProductId = p.ProductId AND cs.LocationId = @LocationId
            ) stock
            OUTER APPLY (
                -- Qty already sold on this invoice is still available while editing it.
                SELECT ISNULL(SUM(sod2.Quantity), 0) AS ReservedQty
                FROM SalesOrderDetail sod2
                WHERE sod2.SalesOrderId = sod.SalesOrderId
                  AND sod2.ProductId = sod.ProductId
            ) reserved
            LEFT JOIN SalesOrderDetail_Tax vat
                ON vat.SalesOrderDetailId = sod.SalesOrderDetailId AND vat.TaxId = @VatTaxId
            LEFT JOIN SalesOrderDetail_Tax ait
                ON ait.SalesOrderDetailId = sod.SalesOrderDetailId AND ait.TaxId = @AitTaxId
            WHERE sod.SalesOrderId = @SalesOrderId
            ORDER BY sod.ColOrder, sod.DateOfEntry
            """, new
        {
            header.SalesOrderId,
            LocationId = locationId,
            VatTaxId,
            AitTaxId
        })).ToList();

        var serialRows = (await conn.QueryAsync<(Guid SalesOrderDetailId, string SerialNo)>("""
            SELECT SalesOrderDetailId, SerialNo
            FROM SalesDetail
            WHERE SalesOrderId = @SalesOrderId
            """, new { header.SalesOrderId })).ToLookup(x => x.SalesOrderDetailId, x => x.SerialNo);

        var lines = detailRows.Select(row =>
        {
            // SalesOrderDetail.Discount stores total line discount; grid uses per-unit.
            var unitDiscount = row.Quantity != 0
                ? Math.Round(row.Discount / row.Quantity, 4)
                : row.Discount;
            var subtotal = row.Quantity * row.UnitPrice - row.Discount;
            var vatPercent = subtotal > 0 ? Math.Round(row.VatAmount / subtotal * 100m, 4) : 0m;
            var taxPercent = subtotal > 0 ? Math.Round(row.AitAmount / subtotal * 100m, 4) : 0m;
            var serials = serialRows[row.SalesOrderDetailId]
                .Select(s => new LoadedInvoiceSerialDto(s, 0))
                .ToList();

            return new LoadedInvoiceLineDto(
                row.SalesOrderDetailId,
                row.ProductId,
                row.ProductName,
                row.ModelNo,
                row.Quantity,
                row.UnitPrice,
                unitDiscount,
                row.WarrantyDays,
                vatPercent,
                taxPercent,
                row.IsSerial,
                row.UnitName,
                row.StockQty,
                serials,
                row.ProductType,
                row.HasPriceSetup);
        }).ToList();

        var (mixedPayment, cardPayment, subPaymentModeId) = await LoadPaymentAsync(
            conn,
            header.SalesOrderId,
            header.PaymentModeId,
            header.GivenAmount);

        return new LoadedInvoiceDto(
            header.SalesOrderId,
            header.InvoiceNo,
            header.SalesOrderNo,
            header.BuyerId,
            header.CustomerName,
            header.Mobile,
            header.Address,
            header.Remarks,
            header.ReferenceId,
            header.BiznessEventTypeId,
            header.ProjectId,
            header.EmployeeId,
            header.PaymentModeId,
            subPaymentModeId,
            header.InvoiceDate,
            header.PaymentPromiseDate,
            header.InvoiceDiscount,
            header.InvoiceDiscountType,
            header.TotalTax,
            header.OthersCharge,
            header.GivenAmount,
            header.TotalAmount,
            mixedPayment,
            cardPayment,
            lines);
    }

    public async Task<InvoicePrintContextDto?> GetInvoicePrintContextAsync(
        string invoiceNo,
        long companyId,
        long locationId)
    {
        using var conn = db.CreateConnection();

        var so = await conn.QueryFirstOrDefaultAsync<(
            string InvoiceNo,
            string SalesOrderNo,
            string? BillingByName,
            string? VerifiedByName,
            decimal CollectedAmount,
            decimal SalesAmount)>("""
            SELECT
                so.InvoiceNo,
                so.SalesOrderNo,
                l.Name AS BillingByName,
                su.Name AS VerifiedByName,
                (
                    SELECT ISNULL(SUM(c.CollectedAmount), 0)
                    FROM Collection c
                    WHERE c.CollectionAgainst = so.InvoiceNo
                      AND LTRIM(RTRIM(ISNULL(c.Approved, ''))) = 'Y'
                ) AS CollectedAmount,
                ISNULL(so.TotalAmount, 0) AS SalesAmount
            FROM SalesOrder so
            LEFT JOIN Location l ON l.LocationId = so.LocationId
            LEFT JOIN SecurityUser su ON su.SecurityUserId = so.ApprovedBy
            WHERE so.InvoiceNo = @InvoiceNo
              AND so.CompanyId = @CompanyId
              AND so.LocationId = @LocationId
            """, new { InvoiceNo = invoiceNo.Trim(), CompanyId = companyId, LocationId = locationId });

        if (so.InvoiceNo is null)
            return null;

        var company = await conn.QueryFirstOrDefaultAsync<CompanyLetterheadDto>("""
            SELECT
                CompanyId,
                ISNULL(Name, '') AS Name,
                Address,
                Phone,
                Fax,
                Email,
                URL AS Url
            FROM Company
            WHERE CompanyId = @CompanyId
            """, new { CompanyId = companyId });

        company ??= new CompanyLetterheadDto { CompanyId = companyId, Name = "" };

        return new InvoicePrintContextDto(
            company,
            so.InvoiceNo,
            so.SalesOrderNo ?? "",
            so.BillingByName,
            so.VerifiedByName,
            so.CollectedAmount,
            so.SalesAmount);
    }

    public async Task<SaveInvoiceResponse> SaveInvoiceAsync(SaveInvoiceRequest request)
    {
        if (request.Lines.Count == 0)
            throw new InvalidOperationException("At least one invoice line is required.");

        if (request.BiznessEventTypeId <= 0)
            throw new InvalidOperationException("Bizness event type is required.");

        if (request.ProjectId is null or <= 0)
            throw new InvalidOperationException("Project is required.");

        var projectId = request.ProjectId.Value;

        var isEdit = request.SalesOrderId is not null && request.SalesOrderId != Guid.Empty;
        var salesOrderId = isEdit ? request.SalesOrderId!.Value : Guid.NewGuid();
        var now = DateTime.Now;

        decimal lineTotal = 0;
        decimal totalQty = 0;

        foreach (var line in request.Lines)
        {
            // Discount on request is per-unit; total line discount = unit * qty.
            var lineDiscountTotal = line.Discount * line.Quantity;
            var subtotal = (line.Quantity * line.UnitPrice) - lineDiscountTotal;
            var vatAmount = subtotal * line.VatPercent / 100m;
            var aitAmount = subtotal * line.TaxPercent / 100m;
            lineTotal += subtotal + vatAmount + aitAmount;
            totalQty += line.Quantity;
        }

        var discountType = string.Equals(request.InvoiceDiscountType, "Percentage", StringComparison.OrdinalIgnoreCase)
            ? "Percentage"
            : "Amount";

        if (request.InvoiceDiscount < 0)
            throw new InvalidOperationException("Discount cannot be negative.");
        if (discountType == "Percentage" && request.InvoiceDiscount > 100)
            throw new InvalidOperationException("Percentage discount cannot be greater than 100%.");

        var discountAmount = discountType == "Percentage"
            ? lineTotal * request.InvoiceDiscount / 100m
            : request.InvoiceDiscount;

        if (discountAmount > lineTotal)
            throw new InvalidOperationException("Inv. discount cannot be greater than Total bill.");

        var grandTotal = lineTotal - discountAmount + request.VatAit + request.OthersCharge;

        // Nothing depends on the given/received amount for saving â€” the total bill is the collected amount.
        var collectedAmount = grandTotal;
        var changeAmount = 0m;

        long buyerId = request.BuyerId ?? 0;
        if (buyerId <= 0)
            throw new InvalidOperationException(
                "Select or create a customer before saving. Typed buyer details are not saved as a master buyer record.");

        using var conn = db.CreateConnection();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        try
        {
            string invoiceNo;
            string salesOrderNo;
            IReadOnlyDictionary<Guid, PosStockService.OriginalLineSnapshot>? originalLines = null;
            var entryBy = request.EntryBy > 0 ? request.EntryBy : _settings.DefaultEntryBy;

            // BackDateEntrySales OFF â†’ lock date (new = now; edit = existing InvoiceDate).
            var invoiceDate = request.InvoiceDate;
            if (!await IsFeatureAllowedAsync(conn, tx, _settings.CompanyId, "BackDateEntrySales"))
            {
                if (isEdit)
                {
                    var existingDate = await conn.ExecuteScalarAsync<DateTime?>(
                        "SELECT InvoiceDate FROM SalesOrder WHERE SalesOrderId = @SalesOrderId",
                        new { SalesOrderId = salesOrderId },
                        tx);
                    if (existingDate is null)
                        throw new InvalidOperationException("Invoice not found for update.");
                    invoiceDate = existingDate.Value;
                }
                else
                {
                    invoiceDate = now;
                }
            }

            // PaymentPromiseDate from form; fall back to invoice date when omitted.
            var paymentPromiseDate = request.PaymentPromiseDate is { } ppd && ppd != default
                ? ppd
                : invoiceDate;

            // Buyer ledger due at save time (POS Ledger Due field).
            var previousDues = request.PreviousDues;

            if (isEdit)
            {
                var existing = await conn.QueryFirstOrDefaultAsync<(string InvoiceNo, string SalesOrderNo)>("""
                    SELECT InvoiceNo, SalesOrderNo
                    FROM SalesOrder
                    WHERE SalesOrderId = @SalesOrderId
                    """, new { SalesOrderId = salesOrderId }, tx);

                if (existing == default)
                    throw new InvalidOperationException("Invoice not found for update.");

                invoiceNo = existing.InvoiceNo;
                salesOrderNo = existing.SalesOrderNo;

                originalLines = await PosStockService.LoadOriginalLinesAsync(conn, tx, salesOrderId);

                await conn.ExecuteAsync("""
                    UPDATE SalesOrder SET
                        EmployeeId = @EmployeeId,
                        Date = @Date,
                        BuyerId = @BuyerId,
                        Remarks = @Remarks,
                        TotalAmount = @TotalAmount,
                        PaymentModeId = @PaymentModeId,
                        PaymentPromiseDate = @PaymentPromiseDate,
                        PreviousDues = @PreviousDues,
                        InvoiceDiscount = @InvoiceDiscount,
                        InvoiceDiscountType = @InvoiceDiscountType,
                        InvoicedBy = @InvoicedBy,
                        InvoiceDate = @InvoiceDate,
                        OrderAmount = @OrderAmount,
                        ReceiveAmount = @ReceiveAmount,
                        ReferenceId = @ReferenceId,
                        BiznessEventTypeId = @BiznessEventTypeId,
                        ProjectId = @ProjectId,
                        TotalTax = @TotalTax,
                        TotalDiscountOfProducts = @TotalDiscountOfProducts,
                        TotalCharge = @OthersCharge
                    WHERE SalesOrderId = @SalesOrderId
                    """, new
                {
                    SalesOrderId = salesOrderId,
                    EmployeeId = request.EmployeeId,
                    Date = invoiceDate,
                    BuyerId = buyerId,
                    Remarks = request.Remarks,
                    TotalAmount = grandTotal,
                    PaymentModeId = request.PaymentModeId,
                    PaymentPromiseDate = paymentPromiseDate,
                    PreviousDues = previousDues,
                    InvoiceDiscount = request.InvoiceDiscount,
                    InvoiceDiscountType = discountType,
                    InvoicedBy = request.EntryBy > 0 ? request.EntryBy : _settings.DefaultEntryBy,
                    InvoiceDate = invoiceDate,
                    OrderAmount = lineTotal,
                    ReceiveAmount = collectedAmount,
                    ReferenceId = request.ReferenceId,
                    BiznessEventTypeId = request.BiznessEventTypeId,
                    ProjectId = projectId,
                    TotalTax = request.VatAit,
                    TotalDiscountOfProducts = request.Lines.Sum(l => l.Discount * l.Quantity),
                    OthersCharge = request.OthersCharge
                }, tx);

                await PosCollectionService.DeleteCollectionsForSalesOrderAsync(
                    conn, tx, salesOrderId, invoiceNo, entryBy);
            }
            else
            {
                var numberCtx = new BiznessEventDocumentNumberService.GenerateContext(
                    CompanyId: _settings.CompanyId,
                    LocationId: request.LocationId,
                    PaymentModeId: request.PaymentModeId,
                    BiznessEventTypeId: request.BiznessEventTypeId,
                    EmployeeId: request.EmployeeId,
                    SecurityUserId: entryBy,
                    BuyerId: buyerId > 0 ? buyerId : null,
                    DocumentDate: invoiceDate);
                invoiceNo = await BiznessEventDocumentNumberService.GenerateAsync(
                    conn, tx, BiznessEventDocumentKind.Invoice, numberCtx);
                salesOrderNo = await BiznessEventDocumentNumberService.GenerateAsync(
                    conn, tx, BiznessEventDocumentKind.PosSales, numberCtx);

                var approvedBy = entryBy;

                await conn.ExecuteAsync("""
                    INSERT INTO SalesOrder (
                        SalesOrderId, SalesOrderNo, UserId, EmployeeId, Date, Approved, ApprovedBy, Approvaltime, BuyerId,
                        Remarks, TotalAmount, InvoiceNo, QuotationYN, PaymentModeId, PaymentTermsId,
                        PaymentPromiseDate, BiznessEventTypeId, InvoiceDiscount, InvoiceDiscountType, InvoicedBy, PreviousDues, CompanyId,
                        LocationId, DateOFEntry, CurrencyRate, InvoiceDate, OrderAmount, FullCollected,
                        ReceiveAmount, ReferenceId, TotalTax, TotalDiscountOfProducts, ProjectId, TotalCharge
                    ) VALUES (
                        @SalesOrderId, @SalesOrderNo, @UserId, @EmployeeId, @Date, 'Y', @ApprovedBy, @ApprovalTime, @BuyerId,
                        @Remarks, @TotalAmount, @InvoiceNo, 'N', @PaymentModeId, @PaymentTermsId,
                        @PaymentPromiseDate, @BiznessEventTypeId, @InvoiceDiscount, @InvoiceDiscountType, @InvoicedBy, @PreviousDues, @CompanyId,
                        @LocationId, @DateOFEntry, 1, @InvoiceDate, @OrderAmount, 'Y',
                        @ReceiveAmount, @ReferenceId, @TotalTax, @TotalDiscountOfProducts, @ProjectId, @OthersCharge
                    )
                    """, new
                {
                    SalesOrderId = salesOrderId,
                    SalesOrderNo = salesOrderNo,
                    UserId = entryBy, // session securityUserId (request.EntryBy)
                    EmployeeId = request.EmployeeId,
                    Date = invoiceDate,
                    ApprovedBy = approvedBy,
                    ApprovalTime = now,
                    BuyerId = buyerId,
                    Remarks = request.Remarks,
                    TotalAmount = grandTotal,
                    InvoiceNo = invoiceNo,
                    PaymentModeId = request.PaymentModeId,
                    PaymentTermsId = 1L,
                    PaymentPromiseDate = paymentPromiseDate,
                    BiznessEventTypeId = request.BiznessEventTypeId,
                    InvoiceDiscount = request.InvoiceDiscount,
                    InvoiceDiscountType = discountType,
                    InvoicedBy = approvedBy,
                    PreviousDues = previousDues,
                    CompanyId = _settings.CompanyId,
                    LocationId = request.LocationId,
                    DateOFEntry = now,
                    InvoiceDate = invoiceDate,
                    OrderAmount = lineTotal,
                    ReceiveAmount = collectedAmount,
                    ReferenceId = request.ReferenceId,
                    TotalTax = request.VatAit,
                    TotalDiscountOfProducts = request.Lines.Sum(l => l.Discount * l.Quantity),
                    ProjectId = projectId,
                    OthersCharge = request.OthersCharge
                }, tx);
            }

            foreach (var deletedId in request.DeletedLineIds ?? [])
                await DeleteLineAsync(conn, tx, deletedId);

            // PriceTakenBy is varchar(10); always persist SecurityUser.UserName (login id).
            var priceTakenBy = await conn.ExecuteScalarAsync<string?>(
                """
                SELECT TOP 1 LTRIM(RTRIM(UserName))
                FROM SecurityUser
                WHERE SecurityUserId = @SecurityUserId
                """,
                new { SecurityUserId = entryBy },
                tx);
            priceTakenBy = string.IsNullOrWhiteSpace(priceTakenBy)
                ? (string.IsNullOrWhiteSpace(request.EntryByUserName) ? "POS" : request.EntryByUserName.Trim())
                : priceTakenBy.Trim();
            if (priceTakenBy.Length > 10)
                priceTakenBy = priceTakenBy[..10];

            var colOrder = 1;
            var savedLines = new List<(Guid DetailId, SaveInvoiceLineRequest Line)>();
            foreach (var line in request.Lines)
            {
                var detailId = line.SalesOrderDetailId ?? Guid.NewGuid();
                // API discount is per-unit; persist total line discount on SalesOrderDetail.Discount.
                var lineDiscountTotal = line.Discount * line.Quantity;
                var subtotal = line.Quantity * line.UnitPrice - lineDiscountTotal;
                var vatAmount = subtotal * line.VatPercent / 100m;
                var aitAmount = subtotal * line.TaxPercent / 100m;

                if (line.SalesOrderDetailId is not null)
                {
                    await conn.ExecuteAsync("""
                        UPDATE SalesOrderDetail SET
                            ProductId = @ProductId,
                            Quantity = @Quantity,
                            InvoiceQuantity = @Quantity,
                            Price = @Price,
                            Discount = @Discount,
                            Warranty = @Warranty,
                            VatAmount = @VatAmount,
                            ColOrder = @ColOrder
                        WHERE SalesOrderDetailId = @SalesOrderDetailId
                        """, new
                    {
                        SalesOrderDetailId = detailId,
                        line.ProductId,
                        line.Quantity,
                        Price = line.UnitPrice,
                        Discount = lineDiscountTotal,
                        Warranty = line.WarrantyDays,
                        VatAmount = vatAmount,
                        ColOrder = colOrder++
                    }, tx);
                }
                else
                {
                    await conn.ExecuteAsync("""
                        INSERT INTO SalesOrderDetail (
                            SalesOrderDetailId, SalesOrderId, ProductId, Quantity, InvoiceQuantity,
                            UnitTypeId, Price, PriceTakenBy, DiscountTakenBy, DateOfEntry, Cost, StockInType,
                            CurrencyRate, Discount, Warranty, VatAmount, ColOrder
                        )
                        SELECT
                            @SalesOrderDetailId, @SalesOrderId, @ProductId, @Quantity, @Quantity,
                            p.UnitTypeId, @Price, @PriceTakenBy, @DiscountTakenBy, @DateOfEntry, 0, 'SO',
                            1, @Discount, @Warranty, @VatAmount, @ColOrder
                        FROM Product p
                        WHERE p.ProductId = @ProductId
                        """, new
                    {
                        SalesOrderDetailId = detailId,
                        SalesOrderId = salesOrderId,
                        line.ProductId,
                        line.Quantity,
                        Price = line.UnitPrice,
                        PriceTakenBy = priceTakenBy,
                        DiscountTakenBy = entryBy,
                        DateOfEntry = now,
                        Discount = lineDiscountTotal,
                        Warranty = line.WarrantyDays,
                        VatAmount = vatAmount,
                        ColOrder = colOrder++
                    }, tx);
                }

                await SaveLineTaxesAsync(conn, tx, detailId, vatAmount, aitAmount, now);
                await SaveSerialsAsync(conn, tx, detailId, salesOrderId, line.Serials, now);
                savedLines.Add((detailId, line));
            }

            IReadOnlyList<(Guid DetailId, SaveInvoiceLineRequest Line)> linesNeedingCostAndDeduct;
            if (isEdit && originalLines is not null)
            {
                // Cost only for brand-new lines or product changes (before stock moves).
                var costTargets = savedLines
                    .Where(item =>
                    {
                        if (item.Line.SalesOrderDetailId is not Guid detailId)
                            return true;
                        if (!originalLines.TryGetValue(detailId, out var original))
                            return true;
                        return original.ProductId != item.Line.ProductId;
                    })
                    .ToList();

                foreach (var (detailId, line) in costTargets)
                {
                    var unitCost = await PosStockService.ComputeLineUnitCostAsync(
                        conn, tx, _settings.CompanyId, request.LocationId, line);

                    await conn.ExecuteAsync(
                        """
                        UPDATE SalesOrderDetail
                        SET Cost = @Cost
                        WHERE SalesOrderDetailId = @SalesOrderDetailId
                        """,
                        new { SalesOrderDetailId = detailId, Cost = unitCost },
                        tx);
                }

                // Qty decrease â†’ new CurrentStock row (SalesOrderNo in PurchaseId + SalesOrderNo).
                // Qty increase / new lines â†’ FIFO deduct delta only. Never update old lots on stock-in.
                await PosStockService.ApplyEditStockAsync(
                    conn,
                    tx,
                    _settings.CompanyId,
                    request.LocationId,
                    entryBy,
                    salesOrderNo,
                    originalLines,
                    request.DeletedLineIds ?? [],
                    request.Lines);

                linesNeedingCostAndDeduct = [];
            }
            else
            {
                linesNeedingCostAndDeduct = savedLines;
            }

            // Set SalesOrderDetail.Cost from FIFO (non-serial) or serial-lot average BEFORE stock deduct.
            foreach (var (detailId, line) in linesNeedingCostAndDeduct)
            {
                var unitCost = await PosStockService.ComputeLineUnitCostAsync(
                    conn,
                    tx,
                    _settings.CompanyId,
                    request.LocationId,
                    line);

                await conn.ExecuteAsync(
                    """
                    UPDATE SalesOrderDetail
                    SET Cost = @Cost
                    WHERE SalesOrderDetailId = @SalesOrderDetailId
                    """,
                    new { SalesOrderDetailId = detailId, Cost = unitCost },
                    tx);
            }

            if (linesNeedingCostAndDeduct.Count > 0)
            {
                await PosStockService.DeductForInvoiceAsync(
                    conn,
                    tx,
                    _settings.CompanyId,
                    request.LocationId,
                    linesNeedingCostAndDeduct.Select(x => x.Line).ToList());
            }
            var posExists = await conn.ExecuteScalarAsync<int?>(
                "SELECT 1 FROM SalesOrder_POS WHERE SalesOrderId = @SalesOrderId",
                new { SalesOrderId = salesOrderId },
                tx);

            if (posExists is 1)
            {
                await conn.ExecuteAsync("""
                    UPDATE SalesOrder_POS SET GivenAmount = @GivenAmount, ChangeAmount = @ChangeAmount
                    WHERE SalesOrderId = @SalesOrderId
                    """, new
                {
                    SalesOrderId = salesOrderId,
                    GivenAmount = collectedAmount,
                    ChangeAmount = changeAmount
                }, tx);
            }
            else
            {
                await conn.ExecuteAsync("""
                    INSERT INTO SalesOrder_POS (SalesOrderPOSId, SalesOrderId, GivenAmount, ChangeAmount)
                    VALUES (@SalesOrderPOSId, @SalesOrderId, @GivenAmount, @ChangeAmount)
                    """, new
                {
                    SalesOrderPOSId = Guid.NewGuid(),
                    SalesOrderId = salesOrderId,
                    GivenAmount = collectedAmount,
                    ChangeAmount = changeAmount
                }, tx);
            }

            // New POS invoices are always Approved='Y'; edits leave Approved unchanged (still Y).
            // Queue voucher generation for the approved invoice.
            var salesOrderApproved = isEdit
                ? await conn.ExecuteScalarAsync<string?>(
                    "SELECT Approved FROM SalesOrder WHERE SalesOrderId = @SalesOrderId",
                    new { SalesOrderId = salesOrderId },
                    tx)
                : "Y";

            if (string.Equals(salesOrderApproved, "Y", StringComparison.OrdinalIgnoreCase))
            {
                await TmpVoucherGenerationService.InsertAsync(
                    conn,
                    tx,
                    biznessEventName: "Invoice",
                    eventNo: invoiceNo,
                    eventDate: invoiceDate,
                    eventModeId: request.PaymentModeId,
                    eventTotalAmount: grandTotal,
                    biznessEventTypeId: request.BiznessEventTypeId,
                    userId: entryBy,
                    locationId: request.LocationId,
                    companyId: _settings.CompanyId,
                    projectId: projectId);
            }

            var collectionService = new PosCollectionService();
            await collectionService.InsertCollectionsAsync(
                conn,
                tx,
                request,
                _settings.CompanyId,
                buyerId,
                salesOrderId,
                invoiceNo,
                grandTotal,
                previousDues,
                invoiceDate,
                now,
                entryBy);

            await tx.CommitAsync();

            return new SaveInvoiceResponse(
                salesOrderId,
                invoiceNo,
                salesOrderNo,
                grandTotal,
                changeAmount,
                isEdit ? "Invoice updated successfully." : "Invoice saved successfully.");
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<MultiScanResultDto?> MultiScanAsync(string term, long? companyId, long? locationId)
    {
        if (string.IsNullOrWhiteSpace(term))
            return null;

        var trimmed = term.Trim();

        var product = await productService.GetByBarcodeOrNameAsync(trimmed, locationId, companyId);
        if (product is not null)
            return new MultiScanResultDto { Type = "product", Product = product };

        var serial = await productService.GetSerialByNoAsync(trimmed, locationId, companyId);
        if (serial is not null)
            return new MultiScanResultDto { Type = "serial", Serial = serial };

        var customers = await customerService.SearchAsync(trimmed, null, companyId, locationId, 5);
        var customer = customers.FirstOrDefault(c =>
            (!string.IsNullOrWhiteSpace(c.Phone) && c.Phone.Contains(trimmed, StringComparison.OrdinalIgnoreCase))
            || c.BuyerName.Contains(trimmed, StringComparison.OrdinalIgnoreCase));
        if (customer is not null)
            return new MultiScanResultDto { Type = "customer", Customer = customer };

        using var conn = db.CreateConnection();
        var invoiceNo = await conn.ExecuteScalarAsync<string?>("""
            SELECT TOP 1 InvoiceNo FROM SalesOrder
            WHERE InvoiceNo = @Term OR SalesOrderNo = @Term
            """, new { Term = trimmed });
        if (!string.IsNullOrWhiteSpace(invoiceNo))
            return new MultiScanResultDto { Type = "invoice", InvoiceNo = invoiceNo };

        var salesPerson = await conn.QuerySingleOrDefaultAsync<SalesPersonDto>("""
            SELECT TOP 1 EmployeeId, Name
            FROM Employee
            WHERE Name = @Term
            """, new { Term = trimmed });
        if (salesPerson is not null)
            return new MultiScanResultDto { Type = "salesPerson", SalesPerson = salesPerson };

        return null;
    }

    public async Task<IReadOnlyList<MultiScanSearchItemDto>> SearchMultiScanAsync(
        string term,
        long? companyId,
        long? locationId,
        int limit = 25)
    {
        if (string.IsNullOrWhiteSpace(term) || term.Trim().Length < 2)
            return [];

        var trimmed = term.Trim();
        var perType = Math.Max(4, limit / 5);
        var results = new List<MultiScanSearchItemDto>();

        var customers = await customerService.SearchAsync(trimmed, null, companyId, locationId, perType);
        foreach (var customer in customers)
        {
            results.Add(new MultiScanSearchItemDto
            {
                Type = "customer",
                Key = $"customer-{customer.BuyerId}",
                Label = customer.BuyerName,
                SubLabel = customer.Phone,
                Customer = customer,
            });
        }

        var products = await productService.SearchAsync(trimmed, locationId, companyId, perType);
        foreach (var product in products)
        {
            results.Add(new MultiScanSearchItemDto
            {
                Type = "product",
                Key = $"product-{product.ProductId}",
                Label = product.Name,
                SubLabel = string.Join(" Â· ", new[] { product.ModelNo, product.Barcode, product.GroupName }.Where(s => !string.IsNullOrWhiteSpace(s))),
                ProductId = product.ProductId,
            });
        }

        using var conn = db.CreateConnection();
        var invoices = await conn.QueryAsync<(string InvoiceNo, string CustomerName)>("""
            SELECT TOP (@Limit) so.InvoiceNo, b.Name AS CustomerName
            FROM SalesOrder so
            LEFT JOIN Buyer b ON b.BuyerId = so.BuyerId
            WHERE so.InvoiceNo LIKE @Term OR so.SalesOrderNo LIKE @Term
            ORDER BY so.InvoiceDate DESC
            """, new { Limit = perType, Term = $"%{trimmed}%" });

        foreach (var invoice in invoices)
        {
            results.Add(new MultiScanSearchItemDto
            {
                Type = "invoice",
                Key = $"invoice-{invoice.InvoiceNo}",
                Label = invoice.InvoiceNo,
                SubLabel = invoice.CustomerName,
                InvoiceNo = invoice.InvoiceNo,
            });
        }

        var serials = await productService.SearchSerialsGlobalAsync(trimmed, locationId, companyId, perType);
        foreach (var serial in serials)
        {
            results.Add(new MultiScanSearchItemDto
            {
                Type = "serial",
                Key = $"serial-{serial.ProductId}-{serial.SerialNo}",
                Label = serial.SerialNo,
                SubLabel = serial.ProductName,
                Serial = serial,
            });
        }

        var salesPersonSql = """
            SELECT TOP (@Limit) EmployeeId, Name
            FROM Employee
            WHERE Name LIKE @Term
            """;
        var salesParams = new DynamicParameters();
        salesParams.Add("Limit", perType);
        salesParams.Add("Term", $"%{trimmed}%");
        if (companyId is > 0)
        {
            salesPersonSql += " AND CompanyId = @CompanyId";
            salesParams.Add("CompanyId", companyId.Value);
        }
        salesPersonSql += " ORDER BY Name";

        var salesPersons = await conn.QueryAsync<SalesPersonDto>(salesPersonSql, salesParams);
        foreach (var sp in salesPersons)
        {
            results.Add(new MultiScanSearchItemDto
            {
                Type = "salesPerson",
                Key = $"salesPerson-{sp.EmployeeId}",
                Label = sp.Name,
                SubLabel = "Sales Person",
                SalesPerson = sp,
            });
        }

        return results.Take(limit).ToList();
    }

    private static async Task SaveLineTaxesAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid detailId,
        decimal vatAmount,
        decimal aitAmount,
        DateTime now)
    {
        await conn.ExecuteAsync(
            "DELETE FROM SalesOrderDetail_Tax WHERE SalesOrderDetailId = @SalesOrderDetailId",
            new { SalesOrderDetailId = detailId },
            tx);

        await conn.ExecuteAsync("""
            INSERT INTO SalesOrderDetail_Tax (SalesOrderDetailId, TaxId, TaxAmount, DateOfEntry)
            VALUES (@SalesOrderDetailId, @TaxId, @TaxAmount, @DateOfEntry)
            """, new[]
        {
            new { SalesOrderDetailId = detailId, TaxId = VatTaxId, TaxAmount = vatAmount, DateOfEntry = now },
            new { SalesOrderDetailId = detailId, TaxId = AitTaxId, TaxAmount = aitAmount, DateOfEntry = now }
        }, tx);
    }

    private static async Task SaveSerialsAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid detailId,
        Guid salesOrderId,
        IReadOnlyList<SaveInvoiceSerialRequest>? serials,
        DateTime now)
    {
        await conn.ExecuteAsync(
            "DELETE FROM SalesDetail WHERE SalesOrderDetailId = @SalesOrderDetailId",
            new { SalesOrderDetailId = detailId },
            tx);

        if (serials is null || serials.Count == 0)
            return;

        foreach (var serial in serials.Where(s => !string.IsNullOrWhiteSpace(s.SerialNo)))
        {
            await conn.ExecuteAsync("""
                INSERT INTO SalesDetail (
                    SalesDetailId, SalesOrderDetailId, SalesOrderId, SerialNo, DateOfEntry
                ) VALUES (
                    @SalesDetailId, @SalesOrderDetailId, @SalesOrderId, @SerialNo, @DateOfEntry
                )
                """, new
            {
                SalesDetailId = Guid.NewGuid(),
                SalesOrderDetailId = detailId,
                SalesOrderId = salesOrderId,
                SerialNo = serial.SerialNo.Trim(),
                DateOfEntry = now
            }, tx);
        }
    }

    private static async Task DeleteLineAsync(IDbConnection conn, IDbTransaction tx, Guid detailId)
    {
        await conn.ExecuteAsync(
            "DELETE FROM SalesDetail WHERE SalesOrderDetailId = @SalesOrderDetailId",
            new { SalesOrderDetailId = detailId },
            tx);
        await conn.ExecuteAsync(
            "DELETE FROM SalesOrderDetail_Tax WHERE SalesOrderDetailId = @SalesOrderDetailId",
            new { SalesOrderDetailId = detailId },
            tx);
        await conn.ExecuteAsync(
            "DELETE FROM SalesOrderDetail WHERE SalesOrderDetailId = @SalesOrderDetailId",
            new { SalesOrderDetailId = detailId },
            tx);
    }

    private static async Task<(SaveInvoiceMixedPaymentRequest? Mixed, SaveInvoiceCardPaymentRequest? Card, long? SubPaymentModeId)>
        LoadPaymentAsync(IDbConnection conn, Guid salesOrderId, long paymentModeId, decimal givenAmount)
    {
        var rows = (await conn.QueryAsync<CollectionPaymentRow>("""
            SELECT
                c.CollectionModeId,
                c.CollectedAmount,
                pm.Name AS ModeName,
                pm.ParentId,
                cd.ChequeNo,
                cd.BankId,
                cd.ChequeDate,
                cd.ExpiryDate,
                cd.CreditCardChargeP,
                cd.POSMachineBankId,
                cd.CashBackAmount,
                cd.EMIBankId,
                cd.EMIId,
                cd.EMIDeductionPercentage,
                b.BankName
            FROM Collection_Invoice ci
            INNER JOIN Collection c ON c.CollectionId = ci.CollectionId
            INNER JOIN PaymentMode pm ON pm.PaymentModeId = c.CollectionModeId
            LEFT JOIN ChequeDetail cd ON cd.CollectionId = c.CollectionId
            LEFT JOIN Bank b ON b.BankId = cd.BankId
            WHERE ci.SalesOrderId = @SalesOrderId
            ORDER BY c.DateOfEntry
            """, new { SalesOrderId = salesOrderId })).ToList();

        if (rows.Count == 0)
            return (null, null, null);

        if (rows.Count > 1 || rows.Any(r => Normalize(r.ModeName).Contains("mixed")))
        {
            var cards = new List<SaveInvoiceMixedCardRequest>
            {
                EmptyMixedCard(), EmptyMixedCard(), EmptyMixedCard()
            };
            decimal cash = 0;
            decimal cheque = 0;
            string chequeNo = "";
            string chequeBank = "";
            long? chequeBankId = null;
            string chequeDate = localDateTimeString(DateTime.Now);
            var cardIndex = 0;

            foreach (var row in rows)
            {
                var mode = Normalize(row.ModeName);
                if (mode == "cash")
                {
                    cash += row.CollectedAmount;
                    continue;
                }

                if (mode == "cheque")
                {
                    cheque += row.CollectedAmount;
                    chequeNo = row.ChequeNo ?? "";
                    chequeBank = row.BankName ?? "";
                    chequeBankId = row.BankId;
                    chequeDate = localDateTimeString(row.ChequeDate ?? DateTime.Now);
                    continue;
                }

                if (mode.Contains("card") && cardIndex < 3)
                {
                    var isEmi = row.EmiId is > 0 || row.EmiBankId is > 0;
                    cards[cardIndex++] = new SaveInvoiceMixedCardRequest(
                        row.CollectedAmount,
                        row.ChequeNo ?? "",
                        row.BankName ?? "",
                        row.BankId,
                        localDateTimeString(row.ExpiryDate),
                        row.PosMachineBankId is > 0,
                        row.CreditCardChargeP > 0 ? $"{row.CreditCardChargeP}" : "",
                        row.PosMachineBankId,
                        row.CashBackAmount,
                        isEmi,
                        row.EmiBankId,
                        row.EmiId,
                        row.EmiDeductionPercentage);
                }
            }

            return (new SaveInvoiceMixedPaymentRequest(
                cash,
                cheque,
                chequeNo,
                chequeBank,
                chequeBankId,
                chequeDate,
                cardIndex > 1,
                cards,
                true), null, null);
        }

        var only = rows[0];
        var onlyMode = Normalize(only.ModeName);
        long? subModeId = only.ParentId is > 0 ? only.CollectionModeId : null;

        if (onlyMode.Contains("card"))
        {
            return (null, new SaveInvoiceCardPaymentRequest(
                only.ChequeNo ?? "",
                only.BankName ?? only.ModeName,
                only.BankId,
                localDateTimeString(only.ExpiryDate),
                only.PosMachineBankId is > 0,
                only.CreditCardChargeP > 0 ? $"{only.CreditCardChargeP}%" : "",
                true), subModeId);
        }

        return (null, null, subModeId);
    }

    private static async Task<bool> IsFeatureAllowedAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        string featureName)
    {
        var raw = await conn.ExecuteScalarAsync<object?>(
            """
            SELECT TOP 1 IsAllowed
            FROM BRFeature
            WHERE Name = @Name AND (CompanyId = @CompanyId OR CompanyId IS NULL)
            ORDER BY CASE WHEN CompanyId = @CompanyId THEN 0 ELSE 1 END
            """,
            new { Name = featureName, CompanyId = companyId },
            tx);

        if (raw is null or DBNull)
            return false;
        if (raw is bool b)
            return b;
        if (raw is byte by)
            return by != 0;
        if (raw is short s)
            return s != 0;
        if (raw is int i)
            return i != 0;
        if (raw is long l)
            return l != 0;
        var text = raw.ToString()?.Trim();
        return text is "1" or "Y" or "y" or "true" or "True" or "TRUE";
    }

    private static SaveInvoiceMixedCardRequest EmptyMixedCard()
        => new(0, "", "", null, localDateTimeString(DateTime.Now), false, "", null, null, false, null, null, null);

    private static string localDateTimeString(DateTime? value)
        => (value ?? DateTime.Now).ToString("yyyy-MM-ddTHH:mm");

    private static string Normalize(string? value)
        => (value ?? string.Empty).Trim().ToLowerInvariant();

    private sealed class InvoiceHeaderRow
    {
        public Guid SalesOrderId { get; set; }
        public string InvoiceNo { get; set; } = string.Empty;
        public string SalesOrderNo { get; set; } = string.Empty;
        public long BuyerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public string? Mobile { get; set; }
        public string? Address { get; set; }
        public string? Remarks { get; set; }
        public long? ReferenceId { get; set; }
        public long BiznessEventTypeId { get; set; }
        public long? ProjectId { get; set; }
        public long EmployeeId { get; set; }
        public long PaymentModeId { get; set; }
        public DateTime InvoiceDate { get; set; }
        public DateTime? PaymentPromiseDate { get; set; }
        public decimal InvoiceDiscount { get; set; }
        public string? InvoiceDiscountType { get; set; }
        public decimal TotalTax { get; set; }
        public decimal OthersCharge { get; set; }
        public decimal GivenAmount { get; set; }
        public decimal TotalAmount { get; set; }
    }

    private sealed class InvoiceDetailRow
    {
        public Guid SalesOrderDetailId { get; set; }
        public long ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? ModelNo { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Discount { get; set; }
        public decimal WarrantyDays { get; set; }
        public bool IsSerial { get; set; }
        public string? UnitName { get; set; }
        public decimal StockQty { get; set; }
        public decimal VatAmount { get; set; }
        public decimal AitAmount { get; set; }
        public string? ProductType { get; set; }
        public bool HasPriceSetup { get; set; }
    }

    private sealed class CollectionPaymentRow
    {
        public long CollectionModeId { get; set; }
        public decimal CollectedAmount { get; set; }
        public string ModeName { get; set; } = string.Empty;
        public long? ParentId { get; set; }
        public string? ChequeNo { get; set; }
        public long? BankId { get; set; }
        public DateTime? ChequeDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public double CreditCardChargeP { get; set; }
        public long? PosMachineBankId { get; set; }
        public decimal? CashBackAmount { get; set; }
        public long? EmiBankId { get; set; }
        public long? EmiId { get; set; }
        public decimal? EmiDeductionPercentage { get; set; }
        public string? BankName { get; set; }
    }
}
