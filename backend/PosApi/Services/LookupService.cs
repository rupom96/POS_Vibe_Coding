using Dapper;
using PosApi.Data;
using PosApi.Models.Dtos;

namespace PosApi.Services;

public interface ILookupService
{
    Task<IReadOnlyList<LocationDto>> GetLocationsAsync(long? companyId = null);
    Task<IReadOnlyList<PaymentModeDto>> GetPaymentModesAsync(long? companyId = null, long? locationId = null);
    Task<IReadOnlyList<SalesPersonDto>> GetSalesPersonsAsync(long? companyId = null, long? locationId = null);
    Task<IReadOnlyList<ReferenceOptionDto>> GetReferencesAsync(long? companyId = null);
    Task<IReadOnlyList<BankOptionDto>> GetBanksAsync(long? companyId = null);
    Task<PosFeatureFlagsDto> GetPosFeatureFlagsAsync(long companyId, long securityUserId);
    Task<BankExpenseChargeDto?> GetBankExpenseChargeAsync(long bankId, long companyId);
    Task<IReadOnlyList<CardEmiDeductionDto>> GetCardEmiDeductionsAsync(long bankId);
    Task<IReadOnlyList<BiznessEventTypeOptionDto>> GetPosBiznessEventTypesAsync(long companyId, long locationId);
    Task<IReadOnlyList<ProjectOptionDto>> GetProjectsAsync(long companyId);
    Task<CompanyLetterheadDto?> GetCompanyLetterheadAsync(long companyId);
}

public class LookupService(IDbConnectionFactory db) : ILookupService
{
    public async Task<IReadOnlyList<LocationDto>> GetLocationsAsync(long? companyId = null)
    {
        var sql = """
            SELECT LocationId, Name, Code
            FROM Location
            WHERE 1 = 1
            """;

        var parameters = new DynamicParameters();
        if (companyId is > 0)
        {
            sql += " AND CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        sql += " ORDER BY Name";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<LocationDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<PaymentModeDto>> GetPaymentModesAsync(long? companyId = null, long? locationId = null)
    {
        // POS payment modes are scoped through BiznessEvent('PosSales') → BiznessEventTypeDetail,
        // then resolved from PaymentMode. Sub-modes of those parents are included for the existing UI filter.
        if (companyId is not > 0 || locationId is not > 0)
            return [];

        const string sql = """
            ;WITH AllowedModes AS (
                SELECT DISTINCT det.PaymentModeId
                FROM BiznessEvent be
                INNER JOIN BiznessEventTypeDetail det
                    ON det.BiznessEventId = be.BiznessEventId
                WHERE LTRIM(RTRIM(be.Name)) = 'PosSales'
                  AND det.LocationId = @LocationId
                  AND det.CompanyId = @CompanyId
                  AND det.PaymentModeId IS NOT NULL
                  AND det.PaymentModeId > 0
            )
            SELECT
                pm.PaymentModeId,
                pm.Name,
                pm.ParentId,
                parent.Name AS ParentName
            FROM PaymentMode pm
            LEFT JOIN PaymentMode parent ON parent.PaymentModeId = pm.ParentId
            WHERE
                pm.PaymentModeId IN (SELECT PaymentModeId FROM AllowedModes)
                OR (
                    pm.ParentId IS NOT NULL
                    AND pm.ParentId > 0
                    AND pm.ParentId IN (SELECT PaymentModeId FROM AllowedModes)
                )
            ORDER BY
                CASE WHEN pm.ParentId IS NULL OR pm.ParentId = 0 THEN 0 ELSE 1 END,
                pm.ParentId,
                pm.Name
            """;

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<PaymentModeDto>(sql, new
        {
            CompanyId = companyId.Value,
            LocationId = locationId.Value
        });
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SalesPersonDto>> GetSalesPersonsAsync(long? companyId = null, long? locationId = null)
    {
        var sql = """
            SELECT EmployeeId, Name
            FROM Employee
            WHERE Name IS NOT NULL AND LTRIM(RTRIM(Name)) <> ''
            """;

        var parameters = new DynamicParameters();
        if (companyId is > 0)
        {
            sql += " AND CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        // Sales person autocomplete is company-scoped only (not location-filtered).

        sql += " ORDER BY Name";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<SalesPersonDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<ReferenceOptionDto>> GetReferencesAsync(long? companyId = null)
    {
        var sql = """
            SELECT AllCompanyId, Name
            FROM AllCompany
            WHERE Type = 'REF'
              AND Name IS NOT NULL AND LTRIM(RTRIM(Name)) <> ''
            """;

        var parameters = new DynamicParameters();
        if (companyId is > 0)
        {
            sql += " AND CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        sql += " ORDER BY Name";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<ReferenceOptionDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<BankOptionDto>> GetBanksAsync(long? companyId = null)
    {
        var sql = """
            SELECT BankId, BankName
            FROM Bank
            WHERE BankName IS NOT NULL AND LTRIM(RTRIM(BankName)) <> ''
            """;
        if (companyId is > 0)
            sql += " AND (CompanyId = @CompanyId OR CompanyId IS NULL)";
        sql += " ORDER BY BankName";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<BankOptionDto>(sql, new { CompanyId = companyId });
        return rows.ToList();
    }

    private const string PosEditAfterApprovalMenuPath = "/Edit/Edit_AfterApproval?value=POSNEW";

    public async Task<PosFeatureFlagsDto> GetPosFeatureFlagsAsync(long companyId, long securityUserId)
    {
        using var conn = db.CreateConnection();
        var posSalesEditFeature = await IsFeatureAllowedAsync(conn, companyId, "PosSalesEdit");
        var hasPosEditMenu = await HasSecurityMenuPermissionAsync(
            conn, companyId, securityUserId, PosEditAfterApprovalMenuPath);

        return new PosFeatureFlagsDto
        {
            LoginUserWiseSalesPersonSet = await IsFeatureAllowedAsync(conn, companyId, "LoginUserWiseSalesPersonSet"),
            SalesOrderEnableSalesPerson = await IsFeatureAllowedAsync(conn, companyId, "SalesOrderEnableSalesPerson"),
            MixedModeCrossCheck = await IsFeatureAllowedAsync(conn, companyId, "MixedModeCrossCheck"),
            BackDateEntrySales = await IsFeatureAllowedAsync(conn, companyId, "BackDateEntrySales"),
            SalesWithoutPriceSetup = await IsFeatureAllowedAsync(conn, companyId, "SalesWithoutPriceSetup"),
            CashBackOffer = await IsFeatureAllowedAsync(conn, companyId, "CashBackOffer"),
            PosMachineChargeFromBankSetup = await IsFeatureAllowedAsync(conn, companyId, "POSMachineChargeFromBankSetup"),
            // Both BRFeature PosSalesEdit AND SecurityMenu_User grant for POSNEW path are required.
            PosSalesEdit = posSalesEditFeature && hasPosEditMenu,
        };
    }

    private static async Task<bool> HasSecurityMenuPermissionAsync(
        System.Data.IDbConnection conn,
        long companyId,
        long securityUserId,
        string menuPath)
    {
        if (companyId <= 0 || securityUserId <= 0 || string.IsNullOrWhiteSpace(menuPath))
            return false;

        var menuId = await conn.ExecuteScalarAsync<long?>(
            """
            SELECT TOP 1 SecurityMenuId
            FROM SecurityMenu
            WHERE Path = @Path
            ORDER BY SecurityMenuId
            """,
            new { Path = menuPath });

        if (menuId is null or <= 0)
            return false;

        var granted = await conn.ExecuteScalarAsync<int?>(
            """
            SELECT TOP 1 1
            FROM SecurityMenu_User
            WHERE SecurityMenuId = @SecurityMenuId
              AND UserId = @UserId
              AND CompanyId = @CompanyId
            """,
            new { SecurityMenuId = menuId.Value, UserId = securityUserId, CompanyId = companyId });

        return granted == 1;
    }

    public async Task<BankExpenseChargeDto?> GetBankExpenseChargeAsync(long bankId, long companyId)
    {
        const string sql = """
            SELECT TOP 1
                ISNULL(CreditCardChargeP, 0) AS CreditCardChargeP,
                ISNULL(POSMachineChargeP, 0) AS PosMachineChargeP,
                ISNULL(CashBackAmount, 0) AS CashBackAmount
            FROM BankExpense
            WHERE BankId = @BankId
              AND CompanyId = @CompanyId
            """;

        using var conn = db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<BankExpenseChargeDto>(sql, new { BankId = bankId, CompanyId = companyId });
    }

    public async Task<IReadOnlyList<CardEmiDeductionDto>> GetCardEmiDeductionsAsync(long bankId)
    {
        // CardEMIDeduction links banks via EMIBankId (not BankId).
        const string sql = """
            SELECT
                CardEMIDeductionId AS CardEmiDeductionId,
                NoOfInstallment,
                ISNULL(DeductionRate, 0) AS DeductionRate
            FROM CardEMIDeduction
            WHERE EMIBankId = @BankId
            ORDER BY NoOfInstallment
            """;

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<CardEmiDeductionDto>(sql, new { BankId = bankId });
        return rows.ToList();
    }

    private static async Task<bool> IsFeatureAllowedAsync(System.Data.IDbConnection conn, long companyId, string featureName)
    {
        // IsAllowed may be bit/bool or Y/N-style; normalize to true only for known "allowed" values.
        var raw = await conn.ExecuteScalarAsync<object?>(
            """
            SELECT TOP 1 IsAllowed
            FROM BRFeature
            WHERE Name = @Name AND (CompanyId = @CompanyId OR CompanyId IS NULL)
            ORDER BY CASE WHEN CompanyId = @CompanyId THEN 0 ELSE 1 END
            """,
            new { Name = featureName, CompanyId = companyId });

        if (raw is null || raw is DBNull)
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

        var text = Convert.ToString(raw)?.Trim();
        if (string.IsNullOrEmpty(text))
            return false;

        return text.Equals("Y", StringComparison.OrdinalIgnoreCase)
            || text.Equals("Yes", StringComparison.OrdinalIgnoreCase)
            || text.Equals("true", StringComparison.OrdinalIgnoreCase)
            || text.Equals("1", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<IReadOnlyList<BiznessEventTypeOptionDto>> GetPosBiznessEventTypesAsync(long companyId, long locationId)
    {
        const string sql = """
            SELECT DISTINCT
                bet.BiznessEventTypeId,
                bet.Name
            FROM BiznessEvent be
            INNER JOIN BiznessEventTypeDetail det
                ON det.BiznessEventId = be.BiznessEventId
            INNER JOIN BiznessEventType bet
                ON bet.BiznessEventTypeId = det.BiznessEventTypeId
            WHERE LTRIM(RTRIM(be.Name)) = 'PosSales'
              AND det.LocationId = @LocationId
              AND det.CompanyId = @CompanyId
              AND bet.Name IS NOT NULL
              AND LTRIM(RTRIM(bet.Name)) <> ''
            ORDER BY bet.Name
            """;

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<BiznessEventTypeOptionDto>(sql, new { CompanyId = companyId, LocationId = locationId });
        return rows.ToList();
    }

    public async Task<IReadOnlyList<ProjectOptionDto>> GetProjectsAsync(long companyId)
    {
        const string sql = """
            SELECT ProjectId, Name
            FROM Project
            WHERE CompanyId = @CompanyId
              AND Name IS NOT NULL
              AND LTRIM(RTRIM(Name)) <> ''
            ORDER BY Name
            """;

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<ProjectOptionDto>(sql, new { CompanyId = companyId });
        return rows.ToList();
    }

    public async Task<CompanyLetterheadDto?> GetCompanyLetterheadAsync(long companyId)
    {
        const string sql = """
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
            """;

        using var conn = db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<CompanyLetterheadDto>(sql, new { CompanyId = companyId });
    }
}
