using System.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Dapper;

namespace PosApi.Services;

internal enum BiznessEventDocumentKind
{
    Invoice,
    PosSales,
    Collection,
    BuyerCustomer,
    Supplier
}

/// <summary>
/// Shared BiznessEvent â†’ EventNoFormat â†’ serial-table allocator for InvoiceNo,
/// SalesOrderNo, CollectionNo, BuyerNo, and SupplierNo.
/// </summary>
internal static class BiznessEventDocumentNumberService
{
    private static readonly Regex TagPattern = new(
        @"^(?<name>[A-Za-z./]+|\-|/)(?:\((?<len>\d+)\))?$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public sealed record GenerateContext(
        long CompanyId,
        long LocationId,
        long? PaymentModeId,
        long? BiznessEventTypeId,
        long EmployeeId,
        long SecurityUserId,
        long? BuyerId,
        DateTime DocumentDate);

    public static Task<string> GenerateAsync(
        IDbConnection conn,
        IDbTransaction tx,
        BiznessEventDocumentKind kind,
        GenerateContext ctx)
        => GenerateCoreAsync(conn, tx, GetProfile(kind), ctx);

    private static async Task<string> GenerateCoreAsync(
        IDbConnection conn,
        IDbTransaction tx,
        DocumentProfile profile,
        GenerateContext ctx)
    {
        if (profile.FilterPaymentAndEventType)
        {
            if (ctx.PaymentModeId is null or <= 0 || ctx.BiznessEventTypeId is null or <= 0)
                throw new InvalidOperationException(profile.MissingConfigMessage);
        }

        var eventId = await conn.ExecuteScalarAsync<long?>(
            """
            SELECT TOP 1 BiznessEventId
            FROM BiznessEvent
            WHERE LTRIM(RTRIM(Name)) = @EventName
            ORDER BY BiznessEventId
            """,
            new { profile.EventName },
            tx);

        if (eventId is null or <= 0)
            throw new InvalidOperationException(profile.MissingConfigMessage);

        EventDetailRow? detail;
        if (profile.FilterPaymentAndEventType)
        {
            detail = await conn.QueryFirstOrDefaultAsync<EventDetailRow>(
                """
                SELECT TOP 1
                    EventNoFormat,
                    EventInitial,
                    SequenceStartsFrom
                FROM BiznessEventTypeDetail
                WHERE BiznessEventId = @BiznessEventId
                  AND LocationId = @LocationId
                  AND CompanyId = @CompanyId
                  AND PaymentModeId = @PaymentModeId
                  AND BiznessEventTypeId = @BiznessEventTypeId
                ORDER BY BiznessEventTypeDetailId
                """,
                new
                {
                    BiznessEventId = eventId.Value,
                    ctx.LocationId,
                    ctx.CompanyId,
                    PaymentModeId = ctx.PaymentModeId!.Value,
                    BiznessEventTypeId = ctx.BiznessEventTypeId!.Value
                },
                tx);
        }
        else
        {
            detail = await conn.QueryFirstOrDefaultAsync<EventDetailRow>(
                """
                SELECT TOP 1
                    EventNoFormat,
                    EventInitial,
                    SequenceStartsFrom
                FROM BiznessEventTypeDetail
                WHERE BiznessEventId = @BiznessEventId
                  AND LocationId = @LocationId
                  AND CompanyId = @CompanyId
                ORDER BY BiznessEventTypeDetailId
                """,
                new
                {
                    BiznessEventId = eventId.Value,
                    ctx.LocationId,
                    ctx.CompanyId
                },
                tx);
        }

        if (detail is null || string.IsNullOrWhiteSpace(detail.EventNoFormat))
            throw new InvalidOperationException(profile.MissingConfigMessage);

        var tagIds = detail.EventNoFormat
            .Split('#', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => long.TryParse(part, out var id) ? id : 0L)
            .Where(id => id > 0)
            .ToList();

        if (tagIds.Count == 0)
            throw new InvalidOperationException(profile.MissingConfigMessage);

        var tags = (await conn.QueryAsync<EventNoTagRow>(
            """
            SELECT BiznessEventNoTagId, TagShortName
            FROM BiznessEventNoTag
            WHERE BiznessEventNoTagId IN @TagIds
            """,
            new { TagIds = tagIds },
            tx)).ToDictionary(t => t.BiznessEventNoTagId);

        var prefix = new StringBuilder();
        int? serialWidth = null;

        foreach (var tagId in tagIds)
        {
            if (!tags.TryGetValue(tagId, out var tag) || string.IsNullOrWhiteSpace(tag.TagShortName))
                throw new InvalidOperationException($"BiznessEventNoTag {tagId} is not configured.");

            var shortName = tag.TagShortName.Trim();
            var match = TagPattern.Match(shortName);
            if (!match.Success)
                throw new InvalidOperationException($"Unsupported BiznessEventNoTag '{shortName}'.");

            var name = match.Groups["name"].Value;
            var lenGroup = match.Groups["len"];
            int? len = lenGroup.Success ? int.Parse(lenGroup.Value, CultureInfo.InvariantCulture) : null;

            if (name.Equals("Number", StringComparison.OrdinalIgnoreCase))
            {
                serialWidth = len is > 0 ? len.Value : 6;
                continue;
            }

            prefix.Append(await ResolveLiteralTagAsync(conn, tx, ctx, detail.EventInitial, name, len));
        }

        if (serialWidth is null or <= 0)
            throw new InvalidOperationException("Bizness Event number format is missing a Number(n) tag.");

        var prefixText = prefix.ToString();
        var nextSerial = await ResolveNextSerialAsync(
            conn, tx, profile.TableName, profile.CodeColumn, prefixText, serialWidth.Value, detail.SequenceStartsFrom);
        var documentNo = prefixText + nextSerial.ToString(CultureInfo.InvariantCulture).PadLeft(serialWidth.Value, '0');

        await conn.ExecuteAsync(
            $"DELETE FROM {profile.TableName} WHERE {profile.CodeColumn} LIKE @PrefixLike",
            new { PrefixLike = prefixText + "%" },
            tx);

        await InsertSerialRowAsync(conn, tx, profile, ctx, documentNo, detail.EventInitial);

        return documentNo;
    }

    private static async Task InsertSerialRowAsync(
        IDbConnection conn,
        IDbTransaction tx,
        DocumentProfile profile,
        GenerateContext ctx,
        string documentNo,
        string? eventInitial)
    {
        var yearText = ctx.DocumentDate.Year.ToString(CultureInfo.InvariantCulture);

        switch (profile.Kind)
        {
            case BiznessEventDocumentKind.Invoice:
            {
                var countryId = await ResolveBangladeshCountryIdAsync(conn, tx);
                await conn.ExecuteAsync(
                    """
                    INSERT INTO InvoiceNo (InvoiceNo, Year, CompanyId, LocationId, CountryId, DateOfEntry)
                    VALUES (@Code, @Year, @CompanyId, @LocationId, @CountryId, GETDATE())
                    """,
                    new
                    {
                        Code = documentNo,
                        Year = yearText,
                        ctx.CompanyId,
                        ctx.LocationId,
                        CountryId = countryId
                    },
                    tx);
                break;
            }
            case BiznessEventDocumentKind.PosSales:
            {
                var countryId = await ResolveBangladeshCountryIdAsync(conn, tx);
                await conn.ExecuteAsync(
                    """
                    INSERT INTO SalesOrderNo (SalesOrderNo, Year, CompanyId, LocationId, CountryId, DateOfEntry)
                    VALUES (@Code, @Year, @CompanyId, @LocationId, @CountryId, GETDATE())
                    """,
                    new
                    {
                        Code = documentNo,
                        Year = yearText,
                        ctx.CompanyId,
                        ctx.LocationId,
                        CountryId = countryId
                    },
                    tx);
                break;
            }
            case BiznessEventDocumentKind.Collection:
                await conn.ExecuteAsync(
                    """
                    INSERT INTO CollectionNo (CollectionNo, Year, Initial, LocationId, CompanyId)
                    VALUES (@Code, @Year, @Initial, @LocationId, @CompanyId)
                    """,
                    new
                    {
                        Code = documentNo,
                        Year = yearText,
                        Initial = string.IsNullOrWhiteSpace(eventInitial) ? null : eventInitial.Trim(),
                        ctx.LocationId,
                        ctx.CompanyId
                    },
                    tx);
                break;
            case BiznessEventDocumentKind.BuyerCustomer:
                await conn.ExecuteAsync(
                    """
                    INSERT INTO BuyerNo (BuyerCode, Initial, Year, LocationId, CompanyId, DateOfEntry)
                    VALUES (@Code, @Initial, @Year, @LocationId, @CompanyId, GETDATE())
                    """,
                    new
                    {
                        Code = documentNo,
                        Initial = string.IsNullOrWhiteSpace(eventInitial) ? null : eventInitial.Trim(),
                        Year = yearText,
                        ctx.LocationId,
                        ctx.CompanyId
                    },
                    tx);
                break;
            case BiznessEventDocumentKind.Supplier:
                await conn.ExecuteAsync(
                    """
                    INSERT INTO SupplierNo (SupplierCode, Initial, Year, LocationId, CompanyId, DateOfEntry)
                    VALUES (@Code, @Initial, @Year, @LocationId, @CompanyId, GETDATE())
                    """,
                    new
                    {
                        Code = documentNo,
                        Initial = string.IsNullOrWhiteSpace(eventInitial) ? null : eventInitial.Trim(),
                        Year = yearText,
                        ctx.LocationId,
                        ctx.CompanyId
                    },
                    tx);
                break;
            default:
                throw new InvalidOperationException($"Unsupported document kind: {profile.Kind}");
        }
    }

    private static async Task<string> ResolveLiteralTagAsync(
        IDbConnection conn,
        IDbTransaction tx,
        GenerateContext ctx,
        string? eventInitial,
        string name,
        int? len)
    {
        if (name == "-" || name == "/")
            return name;

        if (name.Equals("INITIAL", StringComparison.OrdinalIgnoreCase))
            return ApplyLength(eventInitial ?? string.Empty, len);

        if (name.Equals("COMPANY", StringComparison.OrdinalIgnoreCase))
        {
            var code = await conn.ExecuteScalarAsync<string?>(
                "SELECT Code FROM Company WHERE CompanyId = @CompanyId",
                new { ctx.CompanyId },
                tx) ?? string.Empty;
            return ApplyLength(code.Trim(), len);
        }

        if (name.Equals("LOCATION", StringComparison.OrdinalIgnoreCase))
        {
            var code = await conn.ExecuteScalarAsync<string?>(
                "SELECT Code FROM Location WHERE LocationId = @LocationId",
                new { ctx.LocationId },
                tx) ?? string.Empty;
            return ApplyLength(code.Trim(), len);
        }

        // BiznessEvent tags: USER / UserName -> SecurityUser.UserName (login id), never display Name.
        if (name.Equals("USER", StringComparison.OrdinalIgnoreCase)
            || name.Equals("USERNAME", StringComparison.OrdinalIgnoreCase))
        {
            if (ctx.SecurityUserId <= 0)
                return string.Empty;

            var userName = await conn.ExecuteScalarAsync<string?>(
                """
                SELECT TOP 1 LTRIM(RTRIM(UserName))
                FROM SecurityUser
                WHERE SecurityUserId = @SecurityUserId
                """,
                new { ctx.SecurityUserId },
                tx);

            return ApplyLength((userName ?? string.Empty).Trim(), len);
        }

        if (name.Equals("S.PERSON", StringComparison.OrdinalIgnoreCase)
            || name.Equals("SPERSON", StringComparison.OrdinalIgnoreCase)
            || name.Equals("Employee", StringComparison.OrdinalIgnoreCase))
        {
            var code = await conn.ExecuteScalarAsync<string?>(
                "SELECT Code FROM Employee WHERE EmployeeId = @EmployeeId",
                new { ctx.EmployeeId },
                tx) ?? string.Empty;
            return ApplyLength(code.Trim(), len);
        }

        if (name.Equals("YEAR", StringComparison.OrdinalIgnoreCase))
        {
            var year = ctx.DocumentDate.Year.ToString(CultureInfo.InvariantCulture);
            if (len == 2)
                return year.Length >= 2 ? year[^2..] : year.PadLeft(2, '0');
            return year.PadLeft(4, '0');
        }

        if (name.Equals("MONTH", StringComparison.OrdinalIgnoreCase))
        {
            var month = ctx.DocumentDate.Month.ToString(CultureInfo.InvariantCulture);
            var width = len is > 0 ? len.Value : 2;
            return month.PadLeft(width, '0');
        }

        if (name.Equals("Buyer", StringComparison.OrdinalIgnoreCase))
        {
            if (ctx.BuyerId is not > 0)
                return string.Empty;
            var code = await conn.ExecuteScalarAsync<string?>(
                "SELECT Code FROM Buyer WHERE BuyerId = @BuyerId",
                new { BuyerId = ctx.BuyerId.Value },
                tx) ?? string.Empty;
            return ApplyLength(code.Trim(), len);
        }

        throw new InvalidOperationException($"Unsupported BiznessEventNoTag '{name}'.");
    }

    private static string ApplyLength(string value, int? len)
    {
        if (len is null or <= 0)
            return value;
        if (value.Length <= len.Value)
            return value;
        return value[..len.Value];
    }

    private static async Task<int> ResolveNextSerialAsync(
        IDbConnection conn,
        IDbTransaction tx,
        string tableName,
        string codeColumn,
        string prefix,
        int serialWidth,
        decimal? sequenceStartsFrom)
    {
        var existing = (await conn.QueryAsync<string>(
            $"SELECT {codeColumn} FROM {tableName} WHERE {codeColumn} LIKE @PrefixLike",
            new { PrefixLike = prefix + "%" },
            tx)).ToList();

        var max = 0;
        foreach (var code in existing)
        {
            if (string.IsNullOrWhiteSpace(code) || !code.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                continue;

            var suffix = code[prefix.Length..];
            if (int.TryParse(suffix, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n > max)
                max = n;
        }

        if (max > 0)
            return max + 1;

        var start = sequenceStartsFrom is > 0 ? (int)sequenceStartsFrom.Value : 1;
        return start <= 0 ? 1 : start;
    }

    private static async Task<long> ResolveBangladeshCountryIdAsync(IDbConnection conn, IDbTransaction tx)
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

    private static DocumentProfile GetProfile(BiznessEventDocumentKind kind) => kind switch
    {
        BiznessEventDocumentKind.Invoice => new(
            kind,
            "Invoice",
            "Bizness Event configuration missing for Invoice",
            FilterPaymentAndEventType: true,
            "InvoiceNo",
            "InvoiceNo"),
        BiznessEventDocumentKind.PosSales => new(
            kind,
            "PosSales",
            "Bizness Event configuration missing for PosSales",
            FilterPaymentAndEventType: true,
            "SalesOrderNo",
            "SalesOrderNo"),
        BiznessEventDocumentKind.Collection => new(
            kind,
            "Collection",
            "Bizness Event configuration missing for Collection",
            FilterPaymentAndEventType: true,
            "CollectionNo",
            "CollectionNo"),
        BiznessEventDocumentKind.BuyerCustomer => new(
            kind,
            "Customer",
            "Bizness Event configuration missing for Buyer/Customer",
            FilterPaymentAndEventType: false,
            "BuyerNo",
            "BuyerCode"),
        BiznessEventDocumentKind.Supplier => new(
            kind,
            "Supplier",
            "Bizness Event configuration missing for Supplier",
            FilterPaymentAndEventType: false,
            "SupplierNo",
            "SupplierCode"),
        _ => throw new InvalidOperationException($"Unsupported document kind: {kind}")
    };

    private sealed record DocumentProfile(
        BiznessEventDocumentKind Kind,
        string EventName,
        string MissingConfigMessage,
        bool FilterPaymentAndEventType,
        string TableName,
        string CodeColumn);

    private sealed class EventDetailRow
    {
        public string? EventNoFormat { get; init; }
        public string? EventInitial { get; init; }
        public decimal? SequenceStartsFrom { get; init; }
    }

    private sealed class EventNoTagRow
    {
        public long BiznessEventNoTagId { get; init; }
        public string TagShortName { get; init; } = string.Empty;
    }
}
