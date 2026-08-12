using System.Data;
using System.Globalization;
using Dapper;
using PosApi.Models.Dtos;

namespace PosApi.Services;

internal sealed class PosCollectionService
{
    private const long CollectionTypeId = 1;
    private const long DefaultProjectId = 1;

    public async Task InsertCollectionsAsync(
        IDbConnection conn,
        IDbTransaction tx,
        SaveInvoiceRequest request,
        long companyId,
        long buyerId,
        Guid salesOrderId,
        string invoiceNo,
        decimal grandTotal,
        decimal previousDue,
        DateTime invoiceDate,
        DateTime now,
        long entryBy)
    {
        var modes = await LoadPaymentModesAsync(conn, tx, companyId, request.LocationId);

        // Credit / credit-sale modes do not create Collection rows.
        if (modes.IsCreditMode(request.PaymentModeId, request.SubPaymentModeId))
            return;

        if (request.ProjectId is null or <= 0)
            throw new InvalidOperationException("Project is required.");

        var projectId = request.ProjectId.Value;
        var cashAutoApprove = await IsFeatureAllowedAsync(conn, tx, companyId, "POSSalesCashAutoApprove");
        var plans = BuildPlans(request, modes, grandTotal);

        if (plans.Count == 0)
            throw new InvalidOperationException("No collection amount found for this invoice.");

        if (modes.IsMixedMode(request.PaymentModeId)
            && await IsFeatureAllowedAsync(conn, tx, companyId, "MixedModeCrossCheck"))
        {
            var paid = plans.Sum(p => p.Amount);
            var diff = Math.Round(paid - (double)grandTotal, 2, MidpointRounding.AwayFromZero);
            if (diff < 0)
                throw new InvalidOperationException("Paid Amount is less than Grand Total");
            if (diff > 0)
                throw new InvalidOperationException("Paid Amount is more than Grand Total");
        }

        foreach (var plan in plans)
        {
            var collectionId = Guid.NewGuid();
            var collectionNo = await BiznessEventDocumentNumberService.GenerateAsync(
                conn,
                tx,
                BiznessEventDocumentKind.Collection,
                new BiznessEventDocumentNumberService.GenerateContext(
                    CompanyId: companyId,
                    LocationId: request.LocationId,
                    // Use the actual collection mode (Cash/Cheque/Card), not Mixed parent —
                    // Mixed's EventNoFormat wrongly includes USER; per-mode formats do not.
                    PaymentModeId: plan.CollectionModeId,
                    BiznessEventTypeId: request.BiznessEventTypeId,
                    EmployeeId: request.EmployeeId,
                    SecurityUserId: entryBy,
                    BuyerId: buyerId > 0 ? buyerId : null,
                    DocumentDate: invoiceDate));
            var approved = plan.IsCash && cashAutoApprove;
            var approvedFlag = approved ? "Y" : "N";

            await conn.ExecuteAsync(
                """
                INSERT INTO Collection (
                    CollectionId, CollectionNo, CollectedBy, BuyerId, CollectionAgainst, Date,
                    CollectionTypeId, CollectionModeId, CollectedAmount, Approved, ApprovedBy, ApprovalTime,
                    DateOfEntry, CompanyId, LocationId, CurrencyRate, InvoiceNo, EntryBy, ProjectId, ReferenceNo
                ) VALUES (
                    @CollectionId, @CollectionNo, @CollectedBy, @BuyerId, @CollectionAgainst, @Date,
                    @CollectionTypeId, @CollectionModeId, @CollectedAmount, @Approved, @ApprovedBy, @ApprovalTime,
                    @DateOfEntry, @CompanyId, @LocationId, 1, @InvoiceNo, @EntryBy, @ProjectId, @ReferenceNo
                )
                """,
                new
                {
                    CollectionId = collectionId,
                    CollectionNo = collectionNo,
                    CollectedBy = request.EmployeeId,
                    BuyerId = buyerId,
                    CollectionAgainst = invoiceNo,
                    Date = invoiceDate,
                    CollectionTypeId,
                    plan.CollectionModeId,
                    CollectedAmount = plan.Amount,
                    Approved = approvedFlag,
                    ApprovedBy = approved ? entryBy : (long?)null,
                    ApprovalTime = approved ? now : (DateTime?)null,
                    DateOfEntry = now,
                    CompanyId = companyId,
                    LocationId = request.LocationId,
                    InvoiceNo = invoiceNo,
                    EntryBy = entryBy,
                    ProjectId = projectId,
                    ReferenceNo = (string?)null
                },
                tx);

            if (approved)
            {
                await TmpVoucherGenerationService.InsertAsync(
                    conn,
                    tx,
                    biznessEventName: "Collection",
                    eventNo: collectionNo,
                    eventDate: invoiceDate,
                    eventModeId: request.PaymentModeId,
                    eventTotalAmount: (decimal)plan.Amount,
                    biznessEventTypeId: request.BiznessEventTypeId,
                    userId: entryBy,
                    locationId: request.LocationId,
                    companyId: companyId,
                    projectId: projectId);
            }

            await conn.ExecuteAsync(
                """
                INSERT INTO Collection_Invoice (
                    CollectionInvoiceId, CollectionId, SalesOrderId, InvoiceNoM, InvoiceTotal,
                    PreviousDue, CollectedAmount, FullCollected, CurrencyRate, DateOfEntry
                ) VALUES (
                    @CollectionInvoiceId, @CollectionId, @SalesOrderId, @InvoiceNoM, @InvoiceTotal,
                    @PreviousDue, @CollectedAmount, 'Y', 1, @DateOfEntry
                )
                """,
                new
                {
                    CollectionInvoiceId = Guid.NewGuid(),
                    CollectionId = collectionId,
                    SalesOrderId = salesOrderId,
                    InvoiceNoM = invoiceNo,
                    InvoiceTotal = (double)grandTotal,
                    PreviousDue = (double)previousDue,
                    CollectedAmount = plan.Amount,
                    DateOfEntry = now
                },
                tx);

            if (plan.Cheque is not null)
            {
                var bankId = await RequireBankIdAsync(conn, tx, plan.Cheque.BankId, plan.Cheque.BankName);
                await conn.ExecuteAsync(
                    """
                    INSERT INTO ChequeDetail (
                        ChequeDetailId, CollectionId, ChequeNo, BankId, ChequeDate, ChequeAmount, Dateofentry
                    ) VALUES (
                        @ChequeDetailId, @CollectionId, @ChequeNo, @BankId, @ChequeDate, @ChequeAmount, @Dateofentry
                    )
                    """,
                    new
                    {
                        ChequeDetailId = Guid.NewGuid(),
                        CollectionId = collectionId,
                        ChequeNo = plan.Cheque.ChequeNo,
                        BankId = bankId,
                        ChequeDate = plan.Cheque.ChequeDate,
                        ChequeAmount = plan.Amount,
                        Dateofentry = now
                    },
                    tx);
            }

            if (plan.CardCollection is not null)
            {
                var bankId = await RequireBankIdAsync(conn, tx, plan.CardCollection.BankId, plan.CardCollection.BankName);
                var chargePercent = plan.CardCollection.ChargePercent;
                var posMachineBankId = plan.CardCollection.PosMachineBankId is > 0
                    ? plan.CardCollection.PosMachineBankId.Value
                    : bankId;

                await conn.ExecuteAsync(
                    """
                    INSERT INTO ChequeDetail (
                        ChequeDetailId, CollectionId, ChequeNo, BankId, ChequeDate, ChequeAmount, Dateofentry,
                        ExpiryDate, POSMachineBankId, CreditCardChargeP, BankCharge,
                        CashBackAmount, EMIBankId, EMIId, EMIDeductionPercentage
                    ) VALUES (
                        @ChequeDetailId, @CollectionId, @ChequeNo, @BankId, @ChequeDate, @ChequeAmount, @Dateofentry,
                        @ExpiryDate, @PosMachineBankId, @CreditCardChargeP, @BankCharge,
                        @CashBackAmount, @EmiBankId, @EmiId, @EmiDeductionPercentage
                    )
                    """,
                    new
                    {
                        ChequeDetailId = Guid.NewGuid(),
                        CollectionId = collectionId,
                        ChequeNo = plan.CardCollection.CardNo,
                        BankId = bankId,
                        ChequeDate = invoiceDate,
                        ChequeAmount = plan.Amount,
                        Dateofentry = now,
                        ExpiryDate = ParseDateTime(plan.CardCollection.ExpiryDate, invoiceDate),
                        PosMachineBankId = posMachineBankId,
                        CreditCardChargeP = chargePercent,
                        BankCharge = chargePercent,
                        CashBackAmount = plan.CardCollection.CashBackAmount,
                        EmiBankId = plan.CardCollection.IsEmi ? plan.CardCollection.EmiBankId : null,
                        EmiId = plan.CardCollection.IsEmi ? plan.CardCollection.EmiId : null,
                        EmiDeductionPercentage = plan.CardCollection.IsEmi
                            ? plan.CardCollection.EmiDeductionPercentage
                            : null
                    },
                    tx);

                if (plan.CardCollection.PosMachine && chargePercent > 0)
                {
                    await conn.ExecuteAsync(
                        """
                        INSERT INTO BankExpense (BankId, CompanyId, POSMachineChargeP)
                        VALUES (@BankId, @CompanyId, @PosMachineChargeP)
                        """,
                        new
                        {
                            BankId = posMachineBankId,
                            CompanyId = companyId,
                            PosMachineChargeP = chargePercent
                        },
                        tx);
                }
            }
        }
    }

    public static async Task DeleteCollectionsForSalesOrderAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid salesOrderId,
        string? invoiceNo = null,
        long securityUserId = 0)
    {
        var collections = (await conn.QueryAsync<(Guid CollectionId, string? CollectionNo, Guid? VoucherId)>(
            """
            SELECT c.CollectionId, c.CollectionNo, c.VoucherId
            FROM Collection_Invoice ci
            INNER JOIN Collection c ON c.CollectionId = ci.CollectionId
            WHERE ci.SalesOrderId = @SalesOrderId
            """,
            new { SalesOrderId = salesOrderId },
            tx)).ToList();

        var eventNos = new List<string>();
        if (!string.IsNullOrWhiteSpace(invoiceNo))
            eventNos.Add(invoiceNo);
        eventNos.AddRange(
            collections
                .Select(c => c.CollectionNo)
                .Where(n => !string.IsNullOrWhiteSpace(n))!);

        // Edit: cancel vouchers + delete PostedTransaction only, then TMP rows.
        // Voucher / VoucherDetail stay. Fresh TMP after approved save.
        await PosVoucherEditService.ResetForSalesOrderEditAsync(
            conn, tx, salesOrderId, eventNos, securityUserId);

        if (collections.Count == 0)
            return;

        var collectionIds = collections.Select(c => c.CollectionId).ToList();

        await conn.ExecuteAsync(
            "DELETE FROM ChequeDetail WHERE CollectionId IN @CollectionIds",
            new { CollectionIds = collectionIds },
            tx);
        await conn.ExecuteAsync(
            "DELETE FROM Collection_Invoice WHERE SalesOrderId = @SalesOrderId",
            new { SalesOrderId = salesOrderId },
            tx);
        await conn.ExecuteAsync(
            "DELETE FROM Collection WHERE CollectionId IN @CollectionIds",
            new { CollectionIds = collectionIds },
            tx);
    }

    private static List<CollectionPlan> BuildPlans(SaveInvoiceRequest request, PaymentModeIndex modes, decimal collectedAmount)
    {
        if (modes.IsMixedMode(request.PaymentModeId))
        {
            if (request.MixedPayment is null || !request.MixedPayment.Confirmed)
                throw new InvalidOperationException("Mixed payment details are required.");

            var mixed = request.MixedPayment;
            var plans = new List<CollectionPlan>();

            if (mixed.CashAmount > 0)
            {
                plans.Add(new CollectionPlan(
                    modes.RequireId("Cash"),
                    (double)mixed.CashAmount,
                    IsCash: true));
            }

            if (mixed.ChequeAmount > 0)
            {
                plans.Add(new CollectionPlan(
                    modes.RequireId("Cheque"),
                    (double)mixed.ChequeAmount,
                    IsCash: false,
                    Cheque: new ChequePlan(
                        mixed.ChequeNo ?? string.Empty,
                        mixed.ChequeBank ?? string.Empty,
                        mixed.ChequeBankId,
                        ParseDateTime(mixed.ChequeDate, request.InvoiceDate))));
            }

            var cardModeId = modes.RequireId("Card");
            foreach (var mixedCard in mixed.Cards.Where(c => c.Amount > 0))
            {
                if (mixedCard.IsEmi)
                {
                    if (mixedCard.EmiBankId is null or <= 0)
                        throw new InvalidOperationException("EMI Bank is required for card EMI payment.");
                    if (mixedCard.EmiId is null or <= 0)
                        throw new InvalidOperationException("EMI Duration is required for card EMI payment.");
                }

                plans.Add(new CollectionPlan(
                    cardModeId,
                    (double)mixedCard.Amount,
                    IsCash: false,
                    CardCollection: new CardCollectionPlan(
                        mixedCard.CardNo,
                        mixedCard.BankId,
                        mixedCard.Bank,
                        mixedCard.ExpiryDate,
                        mixedCard.PosMachine,
                        ParseChargePercent(mixedCard.Charge),
                        mixedCard.PosMachineBankId,
                        mixedCard.CashBackAmount,
                        mixedCard.IsEmi,
                        mixedCard.EmiBankId,
                        mixedCard.EmiId,
                        mixedCard.EmiDeductionPercentage)));
            }

            return plans;
        }

        var modeId = request.SubPaymentModeId is > 0 ? request.SubPaymentModeId.Value : request.PaymentModeId;
        var amount = (double)collectedAmount;
        if (amount <= 0)
            throw new InvalidOperationException("Total bill must be greater than zero.");

        CardCollectionPlan? cardCollection = null;
        if (modes.IsCardMode(modeId) && request.CardPayment is { Confirmed: true } card)
        {
            var bankName = !string.IsNullOrWhiteSpace(card.Bank)
                ? card.Bank
                : modes.GetModeName(modeId);
            cardCollection = new CardCollectionPlan(
                card.CardNo,
                card.BankId,
                bankName,
                card.ExpiryDate,
                card.PosMachine,
                ParseChargePercent(card.Charge),
                null,
                null,
                false,
                null,
                null,
                null);
        }

        return
        [
            new CollectionPlan(
                modeId,
                amount,
                modes.IsCashMode(modeId),
                CardCollection: cardCollection)
        ];
    }

    private static async Task<PaymentModeIndex> LoadPaymentModesAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId)
    {
        var rows = await conn.QueryAsync<PaymentModeRow>(
            """
            SELECT PaymentModeId, Name, ParentId
            FROM PaymentMode
            WHERE (CompanyId IS NULL OR CompanyId = @CompanyId)
              AND (LocationId IS NULL OR LocationId = @LocationId)
            """,
            new { CompanyId = companyId, LocationId = locationId },
            tx);

        return new PaymentModeIndex(rows.ToList());
    }

    private static async Task<bool> IsFeatureAllowedAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        string featureName)
    {
        var allowed = await conn.ExecuteScalarAsync<bool?>(
            """
            SELECT TOP 1 IsAllowed
            FROM BRFeature
            WHERE Name = @Name AND (CompanyId = @CompanyId OR CompanyId IS NULL)
            ORDER BY CASE WHEN CompanyId = @CompanyId THEN 0 ELSE 1 END
            """,
            new { Name = featureName, CompanyId = companyId },
            tx);

        return allowed == true;
    }

    private static async Task<long> RequireBankIdAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long? bankId,
        string? bankName)
    {
        if (bankId is > 0)
            return bankId.Value;

        if (!string.IsNullOrWhiteSpace(bankName))
            return await ResolveBankIdAsync(conn, tx, bankName);

        throw new InvalidOperationException("Bank is required.");
    }

    private static async Task<long> ResolveBankIdAsync(IDbConnection conn, IDbTransaction tx, string bankName)
    {
        if (string.IsNullOrWhiteSpace(bankName))
            throw new InvalidOperationException("Bank is required.");

        var trimmed = bankName.Trim();
        var simplified = trimmed.Replace(" POS", "", StringComparison.OrdinalIgnoreCase).Trim();

        var bankId = await conn.ExecuteScalarAsync<long?>(
            """
            SELECT TOP 1 BankId
            FROM Bank
            WHERE BankName = @Exact
               OR BankName LIKE @Like
               OR @Exact LIKE BankName + '%'
            ORDER BY CASE WHEN BankName = @Exact THEN 0 WHEN BankName LIKE @Like THEN 1 ELSE 2 END
            """,
            new { Exact = simplified, Like = $"%{simplified}%" },
            tx);

        if (bankId is null or 0)
            throw new InvalidOperationException($"Bank not found for '{bankName}'.");

        return bankId.Value;
    }

    private static double ParseChargePercent(string? charge)
    {
        if (string.IsNullOrWhiteSpace(charge)) return 0;
        var text = charge.Trim().TrimEnd('%').Trim();
        return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private static DateTime ParseDateTime(string? value, DateTime fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed)
            ? parsed
            : fallback;
    }

    private sealed record CollectionPlan(
        long CollectionModeId,
        double Amount,
        bool IsCash,
        ChequePlan? Cheque = null,
        CardCollectionPlan? CardCollection = null);

    private sealed record ChequePlan(string ChequeNo, string BankName, long? BankId, DateTime ChequeDate);

    private sealed record CardCollectionPlan(
        string CardNo,
        long? BankId,
        string BankName,
        string? ExpiryDate,
        bool PosMachine,
        double ChargePercent,
        long? PosMachineBankId = null,
        decimal? CashBackAmount = null,
        bool IsEmi = false,
        long? EmiBankId = null,
        long? EmiId = null,
        decimal? EmiDeductionPercentage = null);

    private sealed class PaymentModeRow
    {
        public long PaymentModeId { get; set; }
        public string Name { get; set; } = string.Empty;
        public long? ParentId { get; set; }
    }

    private sealed class PaymentModeIndex
    {
        private readonly Dictionary<long, PaymentModeRow> _byId;
        private readonly Dictionary<string, long> _parentByName;

        public PaymentModeIndex(List<PaymentModeRow> rows)
        {
            _byId = rows.ToDictionary(r => r.PaymentModeId);
            _parentByName = rows
                .Where(r => r.ParentId is null or 0)
                .GroupBy(r => NormalizeName(r.Name))
                .ToDictionary(g => g.Key, g => g.First().PaymentModeId);
        }

        public bool IsMixedMode(long paymentModeId)
            => _byId.TryGetValue(paymentModeId, out var row)
               && row.Name.Contains("Mixed", StringComparison.OrdinalIgnoreCase);

        public long RequireId(string name)
            => _parentByName.TryGetValue(NormalizeName(name), out var id)
                ? id
                : throw new InvalidOperationException($"Payment mode '{name}' was not found for this location.");

        public bool IsCashMode(long paymentModeId)
        {
            if (!_byId.TryGetValue(paymentModeId, out var row))
                return false;

            if (NormalizeName(row.Name) == "cash")
                return true;

            if (row.ParentId is > 0 && _byId.TryGetValue(row.ParentId.Value, out var parent))
                return NormalizeName(parent.Name) == "cash";

            return false;
        }

        public bool IsCardMode(long paymentModeId)
        {
            if (!_byId.TryGetValue(paymentModeId, out var row))
                return false;

            if (NormalizeName(row.Name).Contains("card"))
                return true;

            if (row.ParentId is > 0 && _byId.TryGetValue(row.ParentId.Value, out var parent))
                return NormalizeName(parent.Name).Contains("card");

            return false;
        }

        public bool IsCreditMode(long paymentModeId, long? subPaymentModeId)
        {
            if (ContainsCredit(paymentModeId))
                return true;

            return subPaymentModeId is > 0 && ContainsCredit(subPaymentModeId.Value);
        }

        public string GetModeName(long paymentModeId)
            => _byId.TryGetValue(paymentModeId, out var row) ? row.Name : string.Empty;

        private bool ContainsCredit(long paymentModeId)
        {
            if (!_byId.TryGetValue(paymentModeId, out var row))
                return false;

            return row.Name.Contains("credit", StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeName(string name)
            => name.Trim().ToLowerInvariant();
    }
}
