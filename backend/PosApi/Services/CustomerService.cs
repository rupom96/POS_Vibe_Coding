using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using PosApi.Data;
using PosApi.Exceptions;
using PosApi.Models.Dtos;

namespace PosApi.Services;

public interface ICustomerService
{
    Task<IReadOnlyList<CustomerSearchResultDto>> SearchAsync(string? term, long? employeeId = null, long? companyId = null, long? locationId = null, int limit = 5000);
    Task<CustomerDto?> GetByIdAsync(long buyerId);
    Task<CustomerStatsDto?> GetStatsAsync(long buyerId);
    Task<CustomerDto> CreateAsync(CreateCustomerRequest request);
    Task<decimal> GetLedgerDueAsync(long buyerId, long? userId = null);
    Task<BuyerPreferredPaymentModeDto> GetPreferredPaymentModeAsync(long buyerId);
}

public class CustomerService(IDbConnectionFactory db) : ICustomerService
{
    private const string AssignedEmployeeSql = """
        COALESCE(
            b.EmployeeId,
            (
                SELECT TOP 1 so.EmployeeId
                FROM SalesOrder so
                WHERE so.BuyerId = b.BuyerId AND so.EmployeeId IS NOT NULL
                ORDER BY so.InvoiceDate DESC, so.DateOFEntry DESC
            )
        )
        """;

    public async Task<IReadOnlyList<CustomerSearchResultDto>> SearchAsync(string? term, long? employeeId = null, long? companyId = null, long? locationId = null, int limit = 5000)
    {
        var effectiveLimit = limit > 0 ? limit : 5000;
        var sql = $"""
            SELECT TOP (@Limit)
                b.BuyerId,
                b.Name AS BuyerName,
                b.Code,
                b.Phone,
                b.Address,
                emp.EmployeeId,
                e.Name AS EmployeeName
            FROM Buyer b
            OUTER APPLY (
                SELECT {AssignedEmployeeSql} AS EmployeeId
            ) emp
            LEFT JOIN Employee e ON e.EmployeeId = emp.EmployeeId
            WHERE b.Active = 1
            """;

        var parameters = new DynamicParameters();
        parameters.Add("Limit", effectiveLimit);

        if (!string.IsNullOrWhiteSpace(term) && term.Trim().Length < 2)
            return [];

        if (!string.IsNullOrWhiteSpace(term))
        {
            sql += """
                 AND (
                    b.Name LIKE @Term OR b.Phone LIKE @Term OR b.Address LIKE @Term OR b.Code LIKE @Term
                 )
                """;
            parameters.Add("Term", $"%{term.Trim()}%");
        }

        if (companyId is > 0)
        {
            sql += " AND b.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        // Buyer autocomplete is company-scoped only (not location-filtered).

        if (employeeId is > 0)
        {
            sql += """
                 AND (
                    b.EmployeeId = @EmployeeId
                    OR EXISTS (
                        SELECT 1 FROM SalesOrder so
                        WHERE so.BuyerId = b.BuyerId AND so.EmployeeId = @EmployeeId
                    )
                 )
                """;
            parameters.Add("EmployeeId", employeeId.Value);
        }

        sql += " ORDER BY b.Name";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<CustomerSearchResultDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<CustomerDto?> GetByIdAsync(long buyerId)
    {
        var sql = $"""
            SELECT
                b.BuyerId,
                b.Name,
                b.Code,
                b.Phone,
                b.Address,
                b.Initial,
                b.ReferenceName AS Remarks,
                ISNULL(bb.Balance, 0) AS LedgerDue,
                emp.EmployeeId,
                e.Name AS SalesPersonName
            FROM Buyer b
            LEFT JOIN Buyer_balance bb ON bb.BuyerName = b.Name
            OUTER APPLY (
                SELECT {AssignedEmployeeSql} AS EmployeeId
            ) emp
            LEFT JOIN Employee e ON e.EmployeeId = emp.EmployeeId
            WHERE b.BuyerId = @BuyerId
            """;

        using var conn = db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<CustomerDto>(sql, new { BuyerId = buyerId });
    }

    public async Task<CustomerStatsDto?> GetStatsAsync(long buyerId)
    {
        const string sql = """
            SELECT
                LTRIM(RTRIM(ISNULL(b.Initial, '') + ' ' + b.Name)) AS CustomerName,
                YEAR(ISNULL(b.DateOfEntry, GETDATE())) AS SinceYear,
                COUNT(so.SalesOrderId) AS InvoiceCount,
                ISNULL(SUM(so.TotalAmount), 0) AS TotalSales,
                ISNULL(SUM(so.ReceiveAmount), 0) AS TotalCollected,
                ISNULL(MAX(bb.Balance), 0) AS LedgerDue,
                CONVERT(varchar(10), MAX(so.InvoiceDate), 23) AS LastPurchaseDate,
                CASE WHEN COUNT(so.SalesOrderId) > 0
                    THEN ISNULL(SUM(so.TotalAmount), 0) / COUNT(so.SalesOrderId)
                    ELSE 0 END AS AverageOrder
            FROM Buyer b
            LEFT JOIN SalesOrder so ON so.BuyerId = b.BuyerId
            LEFT JOIN Buyer_balance bb ON bb.BuyerName = b.Name
            WHERE b.BuyerId = @BuyerId
            GROUP BY b.BuyerId, b.Initial, b.Name, b.DateOfEntry
            """;

        using var conn = db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<CustomerStatsDto>(sql, new { BuyerId = buyerId });
    }

    public async Task<CustomerDto> CreateAsync(CreateCustomerRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Customer name is required.");
        if (string.IsNullOrWhiteSpace(request.Phone))
            throw new ArgumentException("Customer mobile number is required.");

        var companyId = request.CompanyId ?? 1;
        var locationId = request.LocationId ?? 1;
        var groupId = request.GroupId ?? 1;
        var employeeId = request.EmployeeId ?? 1;
        var entryBy = request.EntryBy ?? 1;
        var initial = string.IsNullOrWhiteSpace(request.Initial) ? "Mr." : request.Initial.Trim();
        // "N/A" means the buyer name is stored without any initial (Mr./Mrs./etc.).
        if (string.Equals(initial, "N/A", StringComparison.OrdinalIgnoreCase))
            initial = string.Empty;
        var name = request.Name.Trim();
        var phone = request.Phone.Trim();
        var address = request.Address?.Trim();
        var remarks = request.Remarks?.Trim();
        var normalizedName = BuyerNormalization.NormalizeName(name);
        var normalizedPhone = BuyerNormalization.NormalizePhone(phone);

        if (normalizedPhone.Length == 0)
            throw new ArgumentException("Customer mobile number is required.");

        using var conn = db.CreateConnection();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        try
        {
            await EnsureUniquePhoneAsync(conn, tx, companyId, normalizedPhone);

            var openingDate = await GetCompanyOpeningDateAsync(conn, tx, companyId);

            // Never auto-combine with supplier / existing parties on POS create (TC-03).
            var buyerCode = await PartyCodeGenerator.GenerateBuyerCodeAsync(
                conn, tx, companyId, locationId, employeeId, entryBy);

            var buyerId = await conn.ExecuteScalarAsync<long>(
                """
                INSERT INTO Buyer (
                    CompanyId, LocationId, Code, GroupId, Initial, Name, Phone, Address, ReferenceName,
                    Active, Combind, DateOfEntry, EntryBy, EmployeeId, SupplierId
                )
                OUTPUT INSERTED.BuyerId
                VALUES (
                    @CompanyId, @LocationId, @Code, @GroupId, @Initial, @Name, @Phone, @Address, @Remarks,
                    1, 0, GETDATE(), @EntryBy, @EmployeeId, NULL
                )
                """,
                new
                {
                    CompanyId = companyId,
                    LocationId = locationId,
                    Code = buyerCode,
                    GroupId = groupId,
                    Initial = initial,
                    Name = name,
                    Phone = phone,
                    Address = address,
                    Remarks = remarks,
                    EntryBy = entryBy,
                    EmployeeId = employeeId,
                },
                tx);

            await conn.ExecuteAsync(
                """
                INSERT INTO Buyer_Financial (
                    BuyerId, OpeningDate, OpeningBalance, DateOfEntry, EntryBy
                )
                VALUES (
                    @BuyerId, @OpeningDate, 0, GETDATE(), @EntryBy
                )
                """,
                new { BuyerId = buyerId, OpeningDate = openingDate, EntryBy = entryBy },
                tx);

            await tx.CommitAsync();
            return (await GetByIdAsync(buyerId))!;
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            await tx.RollbackAsync();
            throw new DuplicateBuyerException();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    private static async Task<DateTime> GetCompanyOpeningDateAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId)
    {
        var openingDate = await conn.QueryFirstOrDefaultAsync<DateTime?>(
            """
            SELECT OpeningDate
            FROM Company
            WHERE CompanyId = @CompanyId
            """,
            new { CompanyId = companyId },
            tx);

        if (openingDate is null)
            throw new InvalidOperationException($"Company opening date is not configured for CompanyId {companyId}.");

        return openingDate.Value;
    }

    private static async Task EnsureUniquePhoneAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        string normalizedPhone)
    {
        // Buyer.Name may repeat, but Buyer.Phone must be unique per company.
        var phones = await conn.QueryAsync<string?>(
            """
            SELECT b.Phone
            FROM Buyer b
            WHERE b.Active = 1
              AND b.CompanyId = @CompanyId
              AND b.Phone IS NOT NULL
            """,
            new { CompanyId = companyId },
            tx);

        if (phones.Any(phone => BuyerNormalization.NormalizePhone(phone) == normalizedPhone))
            throw new DuplicateBuyerException("A customer with this mobile number already exists.");
    }

    public async Task<decimal> GetLedgerDueAsync(long buyerId, long? userId = null)
    {
        using var conn = db.CreateConnection();
        var row = await conn.QueryFirstOrDefaultAsync<BuyerCurrentFinancialRow>(
            "SP_Buyer_CurrentFinancial",
            new { BuyerId = buyerId, UserId = userId ?? 1 },
            commandType: CommandType.StoredProcedure);

        return row is null ? 0 : Convert.ToDecimal(row.LedgerDue);
    }

    public async Task<BuyerPreferredPaymentModeDto> GetPreferredPaymentModeAsync(long buyerId)
    {
        using var conn = db.CreateConnection();

        var agreementModeId = await conn.ExecuteScalarAsync<long?>("""
            SELECT TOP 1 bac.PreferredPaymentModeId
            FROM Buyer_AgreementCredit bac
            WHERE bac.BuyerId = @BuyerId
              AND bac.PreferredPaymentModeId IS NOT NULL
              AND bac.PreferredPaymentModeId > 0
            ORDER BY bac.PreferredPaymentModeId
            """, new { BuyerId = buyerId });

        if (agreementModeId is not > 0)
            return new BuyerPreferredPaymentModeDto();

        var mode = await conn.QueryFirstOrDefaultAsync<PaymentModeParentRow>("""
            SELECT PaymentModeId, ParentId
            FROM PaymentMode
            WHERE PaymentModeId = @PaymentModeId
            """, new { PaymentModeId = agreementModeId.Value });

        if (mode is null)
            return new BuyerPreferredPaymentModeDto();

        if (mode.ParentId is > 0)
        {
            return new BuyerPreferredPaymentModeDto
            {
                PaymentModeId = mode.ParentId,
                SubPaymentModeId = mode.PaymentModeId,
            };
        }

        return new BuyerPreferredPaymentModeDto
        {
            PaymentModeId = mode.PaymentModeId,
        };
    }

    private sealed class BuyerCurrentFinancialRow
    {
        public double LedgerDue { get; set; }
    }

    private sealed class PaymentModeParentRow
    {
        public long PaymentModeId { get; set; }
        public long? ParentId { get; set; }
    }
}
