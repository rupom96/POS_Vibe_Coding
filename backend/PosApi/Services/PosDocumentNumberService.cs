using System.Data;
using Dapper;

namespace PosApi.Services;

internal static class PosDocumentNumberService
{
    public static async Task<string> PeekInvoiceNoAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        int year)
        => await PeekCodeAsync(conn, tx, companyId, locationId, year, "InvoiceNo", "InvoiceNo", "InvoiceNoId");

    public static async Task<string> PeekCollectionNoAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        int year)
        => await PeekCodeAsync(conn, tx, companyId, locationId, year, "CollectionNo", "CollectionNo", "CollectionNoId");

    public static async Task<string> PeekSalesOrderNoAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        int year)
        => await PeekCodeAsync(conn, tx, companyId, locationId, year, "SalesOrderNo", "SalesOrderNo", "SalesOrderNoId");

    public static Task<string> GenerateInvoiceNoAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        int year)
        => GenerateCodeAsync(conn, tx, companyId, locationId, year, "INV", "InvoiceNo", "InvoiceNo", "InvoiceNoId");

    public static Task<string> GenerateCollectionNoAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        int year)
        => GenerateCodeAsync(conn, tx, companyId, locationId, year, "CL", "CollectionNo", "CollectionNo", "CollectionNoId");

    public static Task<string> GenerateSalesOrderNoAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        int year)
        => GenerateCodeAsync(conn, tx, companyId, locationId, year, "SO", "SalesOrderNo", "SalesOrderNo", "SalesOrderNoId");

    private static async Task<string> PeekCodeAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        int year,
        string tableName,
        string codeColumn,
        string idColumn)
    {
        var yearText = year.ToString();
        var lastCode = await QueryLastCodeAsync(conn, tx, companyId, locationId, yearText, tableName, codeColumn, idColumn);

        return string.IsNullOrWhiteSpace(lastCode)
            ? await BuildFirstCodeAsync(conn, tx, companyId, locationId, yearText, PrefixForTable(tableName))
            : IncrementSuffix(lastCode);
    }

    private static string PrefixForTable(string tableName) => tableName switch
    {
        "InvoiceNo" => "INV",
        "SalesOrderNo" => "SO",
        "CollectionNo" => "CL",
        _ => throw new InvalidOperationException($"Unsupported document table: {tableName}")
    };

    private static async Task<string> GenerateCodeAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        int year,
        string prefix,
        string tableName,
        string codeColumn,
        string idColumn)
    {
        var yearText = year.ToString();
        var lastCode = await QueryLastCodeAsync(conn, tx, companyId, locationId, yearText, tableName, codeColumn, idColumn);

        var newCode = string.IsNullOrWhiteSpace(lastCode)
            ? await BuildFirstCodeAsync(conn, tx, companyId, locationId, yearText, prefix)
            : IncrementSuffix(lastCode);

        // Keep only the latest number: delete the previous last entry before inserting the new one.
        if (!string.IsNullOrWhiteSpace(lastCode))
            await DeleteLastCodeAsync(conn, tx, companyId, locationId, yearText, tableName, idColumn);

        if (tableName == "InvoiceNo")
        {
            var countryId = await ResolveCountryIdAsync(conn, tx, companyId);
            await conn.ExecuteAsync(
                """
                INSERT INTO InvoiceNo (InvoiceNo, Year, CompanyId, LocationId, CountryId, DateOfEntry)
                VALUES (@InvoiceNo, @Year, @CompanyId, @LocationId, @CountryId, GETDATE())
                """,
                new { InvoiceNo = newCode, Year = yearText, CompanyId = companyId, LocationId = locationId, CountryId = countryId },
                tx);
        }
        else if (tableName == "SalesOrderNo")
        {
            var countryId = await ResolveCountryIdAsync(conn, tx, companyId);
            await conn.ExecuteAsync(
                """
                INSERT INTO SalesOrderNo (SalesOrderNo, Year, CompanyId, LocationId, CountryId, DateOfEntry)
                VALUES (@SalesOrderNo, @Year, @CompanyId, @LocationId, @CountryId, GETDATE())
                """,
                new { SalesOrderNo = newCode, Year = yearText, CompanyId = companyId, LocationId = locationId, CountryId = countryId },
                tx);
        }
        else if (tableName == "CollectionNo")
        {
            await conn.ExecuteAsync(
                """
                INSERT INTO CollectionNo (CollectionNo, Year, Initial, LocationId, CompanyId)
                VALUES (@CollectionNo, @Year, @Initial, @LocationId, @CompanyId)
                """,
                new
                {
                    CollectionNo = newCode,
                    Year = yearText,
                    Initial = prefix,
                    LocationId = locationId,
                    CompanyId = companyId
                },
                tx);
        }

        return newCode;
    }

    private static async Task DeleteLastCodeAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        string yearText,
        string tableName,
        string idColumn)
    {
        var sql = $"""
            DELETE FROM {tableName}
            WHERE {idColumn} = (
                SELECT TOP 1 {idColumn}
                FROM {tableName}
                WHERE CompanyId = @CompanyId
                  AND LocationId = @LocationId
                  AND Year = @Year
                ORDER BY {idColumn} DESC
            )
            """;

        await conn.ExecuteAsync(
            sql,
            new { CompanyId = companyId, LocationId = locationId, Year = yearText },
            tx);
    }

    private static async Task<string?> QueryLastCodeAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        string yearText,
        string tableName,
        string codeColumn,
        string idColumn)
    {
        var sql = $"""
            SELECT TOP 1 {codeColumn}
            FROM {tableName}
            WHERE CompanyId = @CompanyId
              AND LocationId = @LocationId
              AND Year = @Year
            ORDER BY {idColumn} DESC
            """;

        return await conn.QueryFirstOrDefaultAsync<string?>(
            sql,
            new { CompanyId = companyId, LocationId = locationId, Year = yearText },
            tx);
    }

    private static async Task<string> BuildFirstCodeAsync(
        IDbConnection conn,
        IDbTransaction? tx,
        long companyId,
        long locationId,
        string year,
        string prefix)
    {
        var codes = await conn.QueryFirstAsync<(string CompanyCode, string LocationCode)>(
            """
            SELECT
                ISNULL(NULLIF(LTRIM(RTRIM(c.Code)), ''), 'CO') AS CompanyCode,
                ISNULL(NULLIF(LTRIM(RTRIM(l.Code)), ''), 'LO') AS LocationCode
            FROM Company c
            CROSS JOIN Location l
            WHERE c.CompanyId = @CompanyId AND l.LocationId = @LocationId
            """,
            new { CompanyId = companyId, LocationId = locationId },
            tx);

        return $"{prefix}-{codes.CompanyCode}{codes.LocationCode}-{year}-000001";
    }

    private static string IncrementSuffix(string code)
    {
        var lastDash = code.LastIndexOf('-');
        if (lastDash < 0 || lastDash >= code.Length - 1)
            throw new InvalidOperationException($"Invalid document code format: {code}");

        var numPart = code[(lastDash + 1)..];
        if (!int.TryParse(numPart, out var num))
            throw new InvalidOperationException($"Invalid document code suffix: {code}");

        return code[..(lastDash + 1)] + (num + 1).ToString().PadLeft(numPart.Length, '0');
    }

    private static async Task<long> ResolveCountryIdAsync(IDbConnection conn, IDbTransaction? tx, long companyId)
    {
        var countryId = await conn.ExecuteScalarAsync<long?>(
            """
            SELECT TOP 1 CountryId
            FROM Country
            WHERE UPPER(LTRIM(RTRIM(Name))) = 'BANGLADESH'
            ORDER BY CountryId
            """,
            transaction: tx);

        if (countryId is null or 0)
            throw new InvalidOperationException("Country 'BANGLADESH' is not configured.");

        return countryId.Value;
    }
}
