using Dapper;
using PosApi.Data;
using PosApi.Models.Dtos;

namespace PosApi.Services;

public interface IProductService
{
    Task<IReadOnlyList<ProductSearchResultDto>> SearchAsync(string? term, long? locationId, long? companyId = null, int limit = 5000);
    Task<ProductDetailDto?> GetByIdAsync(long productId, long? locationId, long? companyId = null);
    Task<ProductDetailDto?> GetByBarcodeOrNameAsync(string term, long? locationId, long? companyId = null);
    Task<IReadOnlyList<PriceHistoryItemDto>> GetPriceHistoryAsync(long productId, long? buyerId);
    Task<PosSalesPriceDto?> GetPosSalesPriceAsync(long productId, double quantity, long companyId, long locationId);
    Task<IReadOnlyList<ProductTreeNodeDto>> GetProductTreeAsync();
    Task<IReadOnlyList<ProductTreeSearchResultDto>> SearchTreeAsync(
        string? term,
        string? filter = "all",
        long? companyId = null,
        long? locationId = null,
        int limit = 200);
    Task<IReadOnlyList<ProductSerialOptionDto>> SearchSerialsAsync(
        long productId,
        long locationId,
        string? term,
        int limit,
        IReadOnlyList<string>? exclude = null);
    Task<IReadOnlyList<ProductSerialOptionDto>> GetBulkSerialsAsync(
        long productId,
        long locationId,
        int count,
        IReadOnlyList<string>? exclude = null);
    Task<IReadOnlyList<string>> GetSerialPrefixesAsync(long productId, long locationId, string? term);
    Task<ResolveSerialSequenceResultDto> ResolveSerialSequenceAsync(
        long productId,
        long locationId,
        string prefix,
        int from,
        int to);
    Task<MultiScanSerialItemDto?> GetSerialByNoAsync(string serialNo, long? locationId, long? companyId = null);
    Task<IReadOnlyList<MultiScanSerialItemDto>> SearchSerialsGlobalAsync(
        string term,
        long? locationId,
        long? companyId = null,
        int limit = 10);
}

public class ProductService(IDbConnectionFactory db) : IProductService
{
    public async Task<IReadOnlyList<ProductSearchResultDto>> SearchAsync(string? term, long? locationId, long? companyId = null, int limit = 5000)
    {
        var effectiveLimit = limit > 0 ? limit : 5000;
        var sql = """
            SELECT TOP (@Limit)
                p.ProductId,
                p.Name,
                p.ModelNo,
                p.Code AS Barcode,
                pg.Name AS GroupName,
                CASE WHEN p.SerialAvailable = 'Y' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS IsSerial,
                p.ProductType
            FROM Product p
            LEFT JOIN ProductGroup pg ON p.GroupId = pg.ProductGroupId
            WHERE p.Active = 'Y'
            """;

        var parameters = new DynamicParameters();
        parameters.Add("Limit", effectiveLimit);

        if (companyId is > 0)
        {
            sql += " AND p.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        if (locationId is > 0)
        {
            // Service products (ProductType = S) have no stock rows but must still be searchable.
            sql += """
                 AND (
                    UPPER(LTRIM(RTRIM(ISNULL(p.ProductType, '')))) = 'S'
                    OR EXISTS (
                        SELECT 1
                        FROM CurrentStock cs
                        WHERE cs.ProductId = p.ProductId AND cs.LocationId = @LocationId
                    )
                 )
                """;
            parameters.Add("LocationId", locationId.Value);
        }

        if (!string.IsNullOrWhiteSpace(term) && term.Trim().Length < 2)
            return [];

        if (!string.IsNullOrWhiteSpace(term))
        {
            sql += """
                 AND (
                    p.Name LIKE @Term OR p.ModelNo LIKE @Term OR p.Code LIKE @Term OR pg.Name LIKE @Term
                 )
                """;
            parameters.Add("Term", $"%{term.Trim()}%");
        }

        sql += " ORDER BY p.Name";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<ProductSearchResultDto>(sql, parameters);
        return rows.ToList();
    }

    public async Task<ProductDetailDto?> GetByIdAsync(long productId, long? locationId, long? companyId = null)
    {
        const string sql = """
            SELECT
                p.ProductId,
                p.Name,
                p.ModelNo,
                p.Code AS Barcode,
                ut.Name AS UnitName,
                CASE
                    WHEN UPPER(LTRIM(RTRIM(ISNULL(p.ProductType, '')))) = 'S' THEN CAST(0 AS decimal(18,4))
                    ELSE ISNULL(stock.StockQty, 0)
                END AS StockQty,
                ISNULL(price.LastPrice, 0) AS LastPrice,
                CASE WHEN p.SerialAvailable = 'Y' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS IsSerial,
                ISNULL(pw.WarrantyMonths, 0) AS WarrantyDays,
                ISNULL(stock.MinCost, 0) AS CostMin,
                ISNULL(stock.MaxCost, 0) AS CostMax,
                ISNULL(stock.AvgCost, 0) AS CostAvg,
                CASE WHEN ISNULL(stock.StockRowCount, 0) > 0 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS HasCurrentStock,
                p.ProductType,
                CASE
                    WHEN EXISTS (SELECT 1 FROM Price prSetup WHERE prSetup.ProductId = p.ProductId)
                    THEN CAST(1 AS bit) ELSE CAST(0 AS bit)
                END AS HasPriceSetup
            FROM Product p
            LEFT JOIN UnitType ut ON p.UnitTypeId = ut.UnitTypeId
            LEFT JOIN Product_Warranty pw ON pw.ProductId = p.ProductId
            OUTER APPLY (
                SELECT
                    SUM(CASE WHEN cs.Unit > 0 THEN cs.Unit ELSE 0 END) AS StockQty,
                    COUNT_BIG(1) AS StockRowCount,
                    MIN(CASE WHEN cs.PurchaseId IS NOT NULL THEN cs.Cost END) AS MinCost,
                    MAX(CASE WHEN cs.PurchaseId IS NOT NULL THEN cs.Cost END) AS MaxCost,
                    CASE
                        WHEN SUM(CASE WHEN cs.PurchaseId IS NOT NULL AND cs.Unit > 0 THEN cs.Unit ELSE 0 END) > 0
                        THEN SUM(CASE WHEN cs.PurchaseId IS NOT NULL THEN cs.Cost * cs.Unit ELSE 0 END)
                             / SUM(CASE WHEN cs.PurchaseId IS NOT NULL AND cs.Unit > 0 THEN cs.Unit ELSE 0 END)
                        ELSE AVG(CASE WHEN cs.PurchaseId IS NOT NULL THEN cs.Cost END)
                    END AS AvgCost
                FROM CurrentStock cs
                WHERE cs.ProductId = p.ProductId
                  AND (@LocationId IS NULL OR cs.LocationId = @LocationId)
                  AND (@CompanyId IS NULL OR p.CompanyId = @CompanyId)
            ) stock
            OUTER APPLY (
                SELECT TOP 1 pr.ProductPrice AS LastPrice
                FROM Price pr
                WHERE pr.ProductId = p.ProductId
                  AND (@LocationId IS NULL OR pr.LocationId = @LocationId)
                ORDER BY pr.DateofEntry DESC
            ) price
            WHERE p.ProductId = @ProductId AND p.Active = 'Y'
            """;

        using var conn = db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<ProductDetailDto>(sql, new { ProductId = productId, LocationId = locationId, CompanyId = companyId });
    }

    public async Task<ProductDetailDto?> GetByBarcodeOrNameAsync(string term, long? locationId, long? companyId = null)
    {
        var sql = """
            SELECT TOP 1 p.ProductId
            FROM Product p
            WHERE p.Active = 'Y'
              AND (p.Name = @Term OR p.Code = @Term OR p.ModelNo = @Term)
            """;

        var parameters = new DynamicParameters();
        parameters.Add("Term", term.Trim());

        if (companyId is > 0)
        {
            sql += " AND p.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        if (locationId is > 0)
        {
            sql += """
                 AND (
                    UPPER(LTRIM(RTRIM(ISNULL(p.ProductType, '')))) = 'S'
                    OR EXISTS (
                        SELECT 1
                        FROM CurrentStock cs
                        WHERE cs.ProductId = p.ProductId AND cs.LocationId = @LocationId
                    )
                 )
                """;
            parameters.Add("LocationId", locationId.Value);
        }

        sql += " ORDER BY p.ProductId";

        using var conn = db.CreateConnection();
        var productId = await conn.ExecuteScalarAsync<long?>(sql, parameters);
        return productId is null ? null : await GetByIdAsync(productId.Value, locationId, companyId);
    }

    public async Task<IReadOnlyList<PriceHistoryItemDto>> GetPriceHistoryAsync(long productId, long? buyerId)
    {
        const string sql = """
            SELECT TOP 3
                CASE
                    WHEN ROW_NUMBER() OVER (ORDER BY sod.DateOfEntry DESC) = 1 THEN 'Last'
                    WHEN ROW_NUMBER() OVER (ORDER BY sod.DateOfEntry DESC) = 2 THEN '2nd last'
                    ELSE '3rd last'
                END AS Label,
                sod.Price AS Value
            FROM SalesOrderDetail sod
            INNER JOIN SalesOrder so ON so.SalesOrderId = sod.SalesOrderId
            WHERE sod.ProductId = @ProductId
              AND (@BuyerId IS NULL OR so.BuyerId = @BuyerId)
            ORDER BY sod.DateOfEntry DESC
            """;

        using var conn = db.CreateConnection();
        var history = (await conn.QueryAsync<PriceHistoryItemDto>(sql, new { ProductId = productId, BuyerId = buyerId })).ToList();

        if (history.Count > 0)
            return history;

        const string fallbackSql = """
            SELECT TOP 3
                'List' AS Label,
                pr.ProductPrice AS Value
            FROM Price pr
            WHERE pr.ProductId = @ProductId
            ORDER BY pr.DateofEntry DESC
            """;

        history = (await conn.QueryAsync<PriceHistoryItemDto>(fallbackSql, new { ProductId = productId })).ToList();
        return history;
    }

    public async Task<PosSalesPriceDto?> GetPosSalesPriceAsync(long productId, double quantity, long companyId, long locationId)
    {
        if (quantity == 0)
            return new PosSalesPriceDto { Price = 0, MinPrice = 0, MaxPrice = 0 };

        const string baseSql = """
            SELECT TOP 1
                p.PriceId,
                p.ProductPrice,
                pt.IsDetail,
                ISNULL(pt.IncreasePercent, 0) AS IncreasePercent,
                ISNULL(pt.DecreasePercent, 0) AS DecreasePercent
            FROM BiznessEvent be
            INNER JOIN BiznessEventTypeDetail det
                ON det.BiznessEventId = be.BiznessEventId
            INNER JOIN PriceType pt
                ON pt.PriceTypeId = det.PriceTypeId
               AND pt.CompanyId = @CompanyId
            INNER JOIN Price p
                ON p.PriceTypeId = pt.PriceTypeId
               AND p.CompanyId = @CompanyId
            WHERE LTRIM(RTRIM(be.Name)) = 'PosSales'
              AND p.ProductId = @ProductId
              AND det.CompanyId = @CompanyId
              AND det.LocationId = @LocationId
              AND det.PriceTypeId IS NOT NULL
              AND det.PriceTypeId > 0
            ORDER BY p.DateofEntry DESC
            """;

        using var conn = db.CreateConnection();
        var row = await conn.QueryFirstOrDefaultAsync<(
            long PriceId,
            double? ProductPrice,
            string? IsDetail,
            double IncreasePercent,
            double DecreasePercent)>(
            baseSql,
            new { ProductId = productId, CompanyId = companyId, LocationId = locationId });

        if (row.PriceId <= 0)
            return null;

        double? price;
        var isDetail = string.Equals(row.IsDetail?.Trim(), "Y", StringComparison.OrdinalIgnoreCase);
        if (!isDetail)
        {
            price = row.ProductPrice;
        }
        else
        {
            const string detailSql = """
                SELECT TOP 1 pd.Price
                FROM PriceDetail pd
                WHERE pd.PriceId = @PriceId
                  AND @Quantity BETWEEN CONVERT(FLOAT, pd.LowerRange) AND CONVERT(FLOAT, pd.UpperRange)
                """;
            price = await conn.QueryFirstOrDefaultAsync<double?>(
                detailSql,
                new { PriceId = row.PriceId, Quantity = quantity });
        }

        if (price is null)
            return null;

        var recommended = price.Value;
        // PriceType.IncreasePercent / DecreasePercent apply against the recommended price:
        // max = price + price * IncreasePercent,  min = price - price * DecreasePercent.
        var maxPrice = recommended + recommended * row.IncreasePercent;
        var minPrice = recommended - recommended * row.DecreasePercent;
        if (minPrice < 0)
            minPrice = 0;

        return new PosSalesPriceDto
        {
            Price = recommended,
            MinPrice = minPrice,
            MaxPrice = maxPrice,
        };
    }

    public async Task<IReadOnlyList<ProductTreeNodeDto>> GetProductTreeAsync()
    {
        const string sql = """
            SELECT
                pg.ProductGroupId AS GroupId,
                pg.Name AS GroupName,
                ISNULL(p.BrandId, 0) AS BrandKey,
                ISNULL(NULLIF(LTRIM(RTRIM(b.Name)), ''), '(No Brand)') AS BrandName,
                ISNULL(p.CategoryId, 0) AS CategoryKey,
                ISNULL(NULLIF(LTRIM(RTRIM(c.Name)), ''), '(No Category)') AS CategoryName,
                p.ProductId,
                COALESCE(NULLIF(LTRIM(RTRIM(p.ModelNo)), ''), p.Name) AS ProductLabel
            FROM Product p
            INNER JOIN ProductGroup pg ON p.GroupId = pg.ProductGroupId
            LEFT JOIN Brand b ON p.BrandId = b.BrandId
            LEFT JOIN Category c ON p.CategoryId = c.CategoryId AND c.GroupId = p.GroupId
            WHERE p.Active = 'Y'
            ORDER BY pg.Name, BrandName, CategoryName, ProductLabel
            """;

        using var conn = db.CreateConnection();
        var rows = (await conn.QueryAsync<ProductTreeRow>(sql)).ToList();

        var groupNodes = rows
            .GroupBy(r => (r.GroupId, r.GroupName))
            .OrderBy(g => g.Key.GroupName, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ProductTreeNodeDto
            {
                Id = $"g-{g.Key.GroupId}",
                Label = g.Key.GroupName,
                Icon = "📂",
                Children = g
                    .GroupBy(r => (r.BrandKey, r.BrandName))
                    .OrderBy(b => b.Key.BrandName, StringComparer.OrdinalIgnoreCase)
                    .Select(b => new ProductTreeNodeDto
                    {
                        Id = $"b-{g.Key.GroupId}-{b.Key.BrandKey}",
                        Label = b.Key.BrandName,
                        Icon = "🏷️",
                        Children = b
                            .GroupBy(r => (r.CategoryKey, r.CategoryName))
                            .OrderBy(c => c.Key.CategoryName, StringComparer.OrdinalIgnoreCase)
                            .Select(c => new ProductTreeNodeDto
                            {
                                Id = $"c-{g.Key.GroupId}-{b.Key.BrandKey}-{c.Key.CategoryKey}",
                                Label = c.Key.CategoryName,
                                Icon = "📂",
                                Children = c
                                    .OrderBy(p => p.ProductLabel, StringComparer.OrdinalIgnoreCase)
                                    .Select(p => new ProductTreeNodeDto
                                    {
                                        Id = $"p-{p.ProductId}",
                                        Label = p.ProductLabel,
                                        Icon = "📄",
                                        IsModel = true,
                                        Children = []
                                    })
                                    .ToList()
                            })
                            .Where(c => c.Children.Count > 0)
                            .ToList()
                    })
                    .Where(b => b.Children.Count > 0)
                    .ToList()
            })
            .Where(g => g.Children.Count > 0)
            .ToList();

        return
        [
            new ProductTreeNodeDto
            {
                Id = "root",
                Label = "Product",
                Icon = "📦",
                Bold = true,
                Open = true,
                Children = groupNodes
            }
        ];
    }

    public async Task<IReadOnlyList<ProductTreeSearchResultDto>> SearchTreeAsync(
        string? term,
        string? filter = "all",
        long? companyId = null,
        long? locationId = null,
        int limit = 200)
    {
        if (string.IsNullOrWhiteSpace(term) || term.Trim().Length < 2)
            return [];

        var effectiveLimit = limit > 0 ? Math.Min(limit, 500) : 200;
        var typeFilter = normalizedFilter(filter);
        var perTypeLimit = typeFilter == "all"
            ? Math.Max(50, effectiveLimit / 5)
            : effectiveLimit;
        var likeTerm = $"%{term.Trim()}%";
        var results = new List<ProductTreeSearchResultDto>();

        using var conn = db.CreateConnection();

        if (typeFilter is "all" or "group")
        {
            var sql = """
                SELECT TOP (@Limit)
                    pg.ProductGroupId AS GroupId,
                    CAST(0 AS bigint) AS CategoryKey,
                    CAST(0 AS bigint) AS BrandKey,
                    pg.Name AS Label,
                    pg.Name AS PathLabel
                FROM ProductGroup pg
                WHERE pg.Name LIKE @Term
                """;
            var parameters = new DynamicParameters();
            parameters.Add("Limit", perTypeLimit);
            parameters.Add("Term", likeTerm);
            if (companyId is > 0)
            {
                sql += " AND pg.CompanyId = @CompanyId";
                parameters.Add("CompanyId", companyId.Value);
            }
            sql += " ORDER BY pg.Name";

            var rows = await conn.QueryAsync<TreeSearchRow>(sql, parameters);
            results.AddRange(rows.Select(r => ToSearchResult(r, "group", "📂")));
        }

        if (typeFilter is "all" or "brand")
        {
            var sql = """
                SELECT TOP (@Limit)
                    pg.ProductGroupId AS GroupId,
                    CAST(0 AS bigint) AS CategoryKey,
                    b.BrandId AS BrandKey,
                    b.Name AS Label,
                    pg.Name + N' › ' + b.Name AS PathLabel
                FROM Brand b
                INNER JOIN Product p ON p.BrandId = b.BrandId AND p.Active = 'Y'
                INNER JOIN ProductGroup pg ON pg.ProductGroupId = p.GroupId
                WHERE b.Name LIKE @Term
                """;
            var parameters = new DynamicParameters();
            parameters.Add("Limit", perTypeLimit);
            parameters.Add("Term", likeTerm);
            AppendProductScope(ref sql, parameters, companyId, locationId);
            sql += " GROUP BY pg.ProductGroupId, pg.Name, b.BrandId, b.Name";
            sql += " ORDER BY pg.Name, b.Name";

            var rows = await conn.QueryAsync<TreeSearchRow>(sql, parameters);
            results.AddRange(rows.Select(r => ToSearchResult(r, "brand", "🏷️")));
        }

        if (typeFilter is "all" or "category")
        {
            var sql = """
                SELECT TOP (@Limit)
                    pg.ProductGroupId AS GroupId,
                    c.CategoryId AS CategoryKey,
                    ISNULL(p.BrandId, 0) AS BrandKey,
                    c.Name AS Label,
                    pg.Name + N' › ' + ISNULL(NULLIF(LTRIM(RTRIM(b.Name)), ''), N'(No Brand)') + N' › ' + c.Name AS PathLabel
                FROM Category c
                INNER JOIN ProductGroup pg ON pg.ProductGroupId = c.GroupId
                INNER JOIN Product p ON p.CategoryId = c.CategoryId AND p.GroupId = pg.ProductGroupId AND p.Active = 'Y'
                LEFT JOIN Brand b ON b.BrandId = p.BrandId
                WHERE c.Name LIKE @Term
                """;
            var parameters = new DynamicParameters();
            parameters.Add("Limit", perTypeLimit);
            parameters.Add("Term", likeTerm);
            AppendProductScope(ref sql, parameters, companyId, locationId);
            sql += " GROUP BY pg.ProductGroupId, pg.Name, c.CategoryId, c.Name, p.BrandId, b.Name";
            sql += " ORDER BY pg.Name, b.Name, c.Name";

            var rows = await conn.QueryAsync<TreeSearchRow>(sql, parameters);
            results.AddRange(rows.Select(r => ToSearchResult(r, "category", "📂")));
        }

        if (typeFilter is "all" or "product")
        {
            var sql = """
                SELECT TOP (@Limit)
                    pg.ProductGroupId AS GroupId,
                    ISNULL(p.CategoryId, 0) AS CategoryKey,
                    ISNULL(p.BrandId, 0) AS BrandKey,
                    p.ProductId,
                    COALESCE(NULLIF(LTRIM(RTRIM(p.ModelNo)), ''), p.Name) AS Label,
                    pg.Name + N' › ' + ISNULL(NULLIF(LTRIM(RTRIM(b.Name)), ''), N'(No Brand)') + N' › '
                        + ISNULL(NULLIF(LTRIM(RTRIM(c.Name)), ''), N'(No Category)') + N' › '
                        + COALESCE(NULLIF(LTRIM(RTRIM(p.ModelNo)), ''), p.Name) AS PathLabel
                FROM Product p
                INNER JOIN ProductGroup pg ON pg.ProductGroupId = p.GroupId
                LEFT JOIN Category c ON c.CategoryId = p.CategoryId AND c.GroupId = p.GroupId
                LEFT JOIN Brand b ON b.BrandId = p.BrandId
                WHERE p.Active = 'Y'
                  AND COALESCE(NULLIF(LTRIM(RTRIM(p.ModelNo)), ''), p.Name) LIKE @Term
                """;
            var parameters = new DynamicParameters();
            parameters.Add("Limit", perTypeLimit);
            parameters.Add("Term", likeTerm);
            AppendProductScope(ref sql, parameters, companyId, locationId);
            sql += " ORDER BY pg.Name, b.Name, c.Name, p.Name";

            var rows = await conn.QueryAsync<TreeSearchProductRow>(sql, parameters);
            results.AddRange(rows.Select(r => ToProductSearchResult(r, "product", "📄")));
        }

        if (typeFilter is "all" or "serial")
        {
            var sql = """
                SELECT TOP (@Limit)
                    pg.ProductGroupId AS GroupId,
                    ISNULL(p.CategoryId, 0) AS CategoryKey,
                    ISNULL(p.BrandId, 0) AS BrandKey,
                    p.ProductId,
                    LTRIM(RTRIM(csd.SerialNo)) AS Label,
                    pg.Name + N' › ' + ISNULL(NULLIF(LTRIM(RTRIM(b.Name)), ''), N'(No Brand)') + N' › '
                        + ISNULL(NULLIF(LTRIM(RTRIM(c.Name)), ''), N'(No Category)') + N' › '
                        + COALESCE(NULLIF(LTRIM(RTRIM(p.ModelNo)), ''), p.Name) + N' › '
                        + LTRIM(RTRIM(csd.SerialNo)) AS PathLabel
                FROM CurrentStockDetail csd
                INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
                INNER JOIN Product p ON p.ProductId = cs.ProductId AND p.Active = 'Y'
                INNER JOIN ProductGroup pg ON pg.ProductGroupId = p.GroupId
                LEFT JOIN Category c ON c.CategoryId = p.CategoryId AND c.GroupId = p.GroupId
                LEFT JOIN Brand b ON b.BrandId = p.BrandId
                WHERE LTRIM(RTRIM(csd.SerialNo)) <> ''
                  AND LTRIM(RTRIM(csd.SerialNo)) LIKE @Term
                """;
            var parameters = new DynamicParameters();
            parameters.Add("Limit", perTypeLimit);
            parameters.Add("Term", likeTerm);
            AppendProductScope(ref sql, parameters, companyId, locationId, "p", "cs");
            sql += " ORDER BY csd.SerialNo";

            var rows = await conn.QueryAsync<TreeSearchProductRow>(sql, parameters);
            results.AddRange(rows.Select(r => ToProductSearchResult(r, "serial", "🔢")));
        }

        return results
            .OrderBy(r => MatchTypeRank(r.MatchType))
            .ThenBy(r => r.Label, StringComparer.OrdinalIgnoreCase)
            .Take(effectiveLimit)
            .ToList();
    }

    public async Task<IReadOnlyList<ProductSerialOptionDto>> SearchSerialsAsync(
        long productId,
        long locationId,
        string? term,
        int limit,
        IReadOnlyList<string>? exclude = null)
    {
        var effectiveLimit = limit > 0 ? Math.Min(limit, 500) : 50;
        var sql = BuildSerialBaseQuery();
        sql += " AND (@Term IS NULL OR LTRIM(RTRIM(csd.SerialNo)) LIKE @LikeTerm)";

        var parameters = new DynamicParameters();
        parameters.Add("ProductId", productId);
        parameters.Add("LocationId", locationId);
        parameters.Add("Term", string.IsNullOrWhiteSpace(term) ? null : term.Trim());
        parameters.Add("LikeTerm", string.IsNullOrWhiteSpace(term) ? null : $"%{term.Trim()}%");
        parameters.Add("Limit", effectiveLimit + (exclude?.Count ?? 0));

        sql += " ORDER BY csd.SerialNo";

        using var conn = db.CreateConnection();
        var rows = (await conn.QueryAsync<ProductSerialOptionDto>(sql, parameters)).ToList();
        return FilterExcluded(rows, exclude).Take(effectiveLimit).ToList();
    }

    public async Task<IReadOnlyList<ProductSerialOptionDto>> GetBulkSerialsAsync(
        long productId,
        long locationId,
        int count,
        IReadOnlyList<string>? exclude = null)
    {
        if (count <= 0) return [];

        var effectiveCount = Math.Min(count, 500);
        var sql = BuildSerialBaseQuery();
        var parameters = new DynamicParameters();
        parameters.Add("ProductId", productId);
        parameters.Add("LocationId", locationId);
        parameters.Add("Limit", effectiveCount + (exclude?.Count ?? 0));

        sql += " ORDER BY csd.SerialNo";

        using var conn = db.CreateConnection();
        var rows = (await conn.QueryAsync<ProductSerialOptionDto>(sql, parameters)).ToList();
        return FilterExcluded(rows, exclude).Take(effectiveCount).ToList();
    }

    public async Task<IReadOnlyList<string>> GetSerialPrefixesAsync(long productId, long locationId, string? term)
    {
        var sql = """
            SELECT DISTINCT LTRIM(RTRIM(csd.SerialNo)) AS SerialNo
            FROM CurrentStockDetail csd
            INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
            WHERE cs.ProductId = @ProductId
              AND cs.LocationId = @LocationId
              AND LTRIM(RTRIM(csd.SerialNo)) <> ''
            ORDER BY csd.SerialNo
            """;

        using var conn = db.CreateConnection();
        var serials = await conn.QueryAsync<string>(sql, new { ProductId = productId, LocationId = locationId });

        var prefixes = serials
            .Select(ExtractSerialPrefix)
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(term))
        {
            var t = term.Trim();
            prefixes = prefixes.Where(p => p.StartsWith(t, StringComparison.OrdinalIgnoreCase));
        }

        return prefixes.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).Take(100).ToList();
    }

    public async Task<ResolveSerialSequenceResultDto> ResolveSerialSequenceAsync(
        long productId,
        long locationId,
        string prefix,
        int from,
        int to)
    {
        if (string.IsNullOrWhiteSpace(prefix))
            throw new InvalidOperationException("Common prefix is required.");
        if (from > to)
            throw new InvalidOperationException("From must be less than or equal to To.");
        if (to - from > 499)
            throw new InvalidOperationException("Max 500 serials at once.");

        var wanted = new List<string>();
        for (var i = from; i <= to; i++)
            wanted.Add(prefix.Trim() + i);

        var sql = BuildSerialBaseQuery();
        sql += " AND LTRIM(RTRIM(csd.SerialNo)) IN @SerialNos";

        using var conn = db.CreateConnection();
        var found = (await conn.QueryAsync<ProductSerialOptionDto>(sql, new
        {
            ProductId = productId,
            LocationId = locationId,
            SerialNos = wanted,
            Limit = wanted.Count
        })).ToList();

        var foundSet = found.Select(f => f.SerialNo).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = wanted.Where(s => !foundSet.Contains(s)).ToList();

        return new ResolveSerialSequenceResultDto
        {
            Found = wanted
                .Where(s => foundSet.Contains(s))
                .Select(s => found.First(f => string.Equals(f.SerialNo, s, StringComparison.OrdinalIgnoreCase)))
                .ToList(),
            Missing = missing
        };
    }

    public async Task<MultiScanSerialItemDto?> GetSerialByNoAsync(string serialNo, long? locationId, long? companyId = null)
    {
        if (string.IsNullOrWhiteSpace(serialNo))
            return null;

        var sql = """
            SELECT TOP 1
                p.ProductId,
                p.Name AS ProductName,
                LTRIM(RTRIM(csd.SerialNo)) AS SerialNo,
                ISNULL(psd.DiscountAmount, 0) AS DiscountAmount
            FROM CurrentStockDetail csd
            INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
            INNER JOIN Product p ON p.ProductId = cs.ProductId AND p.Active = 'Y'
            LEFT JOIN ProductSerialDiscount psd
                ON psd.ProductId = cs.ProductId
               AND LTRIM(RTRIM(psd.SerialNo)) = LTRIM(RTRIM(csd.SerialNo))
            WHERE LTRIM(RTRIM(csd.SerialNo)) = @SerialNo
            """;

        var parameters = new DynamicParameters();
        parameters.Add("SerialNo", serialNo.Trim());

        if (locationId is > 0)
        {
            sql += " AND cs.LocationId = @LocationId";
            parameters.Add("LocationId", locationId.Value);
        }

        if (companyId is > 0)
        {
            sql += " AND p.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        using var conn = db.CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<MultiScanSerialItemDto>(sql, parameters);
    }

    public async Task<IReadOnlyList<MultiScanSerialItemDto>> SearchSerialsGlobalAsync(
        string term,
        long? locationId,
        long? companyId = null,
        int limit = 10)
    {
        if (string.IsNullOrWhiteSpace(term) || term.Trim().Length < 2)
            return [];

        var sql = """
            SELECT TOP (@Limit)
                p.ProductId,
                p.Name AS ProductName,
                LTRIM(RTRIM(csd.SerialNo)) AS SerialNo,
                ISNULL(psd.DiscountAmount, 0) AS DiscountAmount
            FROM CurrentStockDetail csd
            INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
            INNER JOIN Product p ON p.ProductId = cs.ProductId AND p.Active = 'Y'
            LEFT JOIN ProductSerialDiscount psd
                ON psd.ProductId = cs.ProductId
               AND LTRIM(RTRIM(psd.SerialNo)) = LTRIM(RTRIM(csd.SerialNo))
            WHERE LTRIM(RTRIM(csd.SerialNo)) LIKE @Term
            """;

        var parameters = new DynamicParameters();
        parameters.Add("Limit", limit > 0 ? limit : 10);
        parameters.Add("Term", $"%{term.Trim()}%");

        if (locationId is > 0)
        {
            sql += " AND cs.LocationId = @LocationId";
            parameters.Add("LocationId", locationId.Value);
        }

        if (companyId is > 0)
        {
            sql += " AND p.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        sql += " ORDER BY csd.SerialNo";

        using var conn = db.CreateConnection();
        var rows = await conn.QueryAsync<MultiScanSerialItemDto>(sql, parameters);
        return rows.ToList();
    }

    private static string BuildSerialBaseQuery() => """
        SELECT TOP (@Limit)
            LTRIM(RTRIM(csd.SerialNo)) AS SerialNo,
            ISNULL(psd.DiscountAmount, 0) AS DiscountAmount
        FROM CurrentStockDetail csd
        INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
        LEFT JOIN ProductSerialDiscount psd
            ON psd.ProductId = cs.ProductId
           AND LTRIM(RTRIM(psd.SerialNo)) = LTRIM(RTRIM(csd.SerialNo))
        WHERE cs.ProductId = @ProductId
          AND cs.LocationId = @LocationId
          AND LTRIM(RTRIM(csd.SerialNo)) <> ''
        """;

    private static List<ProductSerialOptionDto> FilterExcluded(
        IEnumerable<ProductSerialOptionDto> rows,
        IReadOnlyList<string>? exclude)
    {
        if (exclude is null || exclude.Count == 0)
            return rows.ToList();

        var excluded = exclude.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return rows.Where(r => !excluded.Contains(r.SerialNo)).ToList();
    }

    private static string ExtractSerialPrefix(string serial)
    {
        var i = 0;
        while (i < serial.Length && !char.IsDigit(serial[i]))
            i++;
        return i > 0 ? serial[..i] : string.Empty;
    }

    private static int MatchTypeRank(string matchType) => matchType switch
    {
        "group" => 0,
        "brand" => 1,
        "category" => 2,
        "product" => 3,
        "serial" => 4,
        _ => 5
    };

    private static string normalizedFilter(string? filter)
        => (filter ?? "all").Trim().ToLowerInvariant();

    private static void AppendProductScope(
        ref string sql,
        DynamicParameters parameters,
        long? companyId,
        long? locationId,
        string productAlias = "p",
        string? stockAlias = null)
    {
        if (companyId is > 0)
        {
            sql += $" AND {productAlias}.CompanyId = @CompanyId";
            parameters.Add("CompanyId", companyId.Value);
        }

        if (locationId is > 0)
        {
            if (stockAlias is not null)
            {
                sql += $" AND {stockAlias}.LocationId = @LocationId";
            }
            else
            {
                sql += $"""
                     AND EXISTS (
                        SELECT 1
                        FROM CurrentStock csScope
                        WHERE csScope.ProductId = {productAlias}.ProductId AND csScope.LocationId = @LocationId
                     )
                    """;
            }
            parameters.Add("LocationId", locationId.Value);
        }
    }

    private static ProductTreeSearchResultDto ToSearchResult(TreeSearchRow row, string matchType, string icon)
    {
        var groupId = row.GroupId;
        var categoryKey = row.CategoryKey;
        var brandKey = row.BrandKey;
        var id = matchType switch
        {
            "group" => $"g-{groupId}",
            "brand" => $"b-{groupId}-{brandKey}",
            "category" => $"c-{groupId}-{brandKey}-{categoryKey}",
            _ => $"{matchType}-{groupId}"
        };

        return new ProductTreeSearchResultDto
        {
            Id = id,
            Label = row.Label,
            MatchType = matchType,
            Path = row.PathLabel,
            Icon = icon,
            ExpandIds = BuildExpandIds(matchType, groupId, categoryKey, brandKey)
        };
    }

    private static ProductTreeSearchResultDto ToProductSearchResult(
        TreeSearchProductRow row,
        string matchType,
        string icon)
    {
        var label = row.Label;
        return new ProductTreeSearchResultDto
        {
            Id = matchType == "serial" ? $"s-{row.ProductId}-{label}" : $"p-{row.ProductId}",
            Label = label,
            MatchType = matchType,
            Path = row.PathLabel,
            Icon = icon,
            ProductId = row.ProductId,
            ExpandIds = BuildExpandIds(matchType, row.GroupId, row.CategoryKey, row.BrandKey)
        };
    }

    private static List<string> BuildExpandIds(
        string matchType,
        long groupId,
        long categoryKey,
        long brandKey)
    {
        var ids = new List<string> { "root", $"g-{groupId}" };
        if (matchType is "brand" or "category" or "product" or "serial")
            ids.Add($"b-{groupId}-{brandKey}");
        if (matchType is "category" or "product" or "serial")
            ids.Add($"c-{groupId}-{brandKey}-{categoryKey}");
        return ids;
    }

    private sealed class TreeSearchRow
    {
        public long GroupId { get; set; }
        public long CategoryKey { get; set; }
        public long BrandKey { get; set; }
        public string Label { get; set; } = string.Empty;
        public string PathLabel { get; set; } = string.Empty;
    }

    private sealed class TreeSearchProductRow
    {
        public long GroupId { get; set; }
        public long CategoryKey { get; set; }
        public long BrandKey { get; set; }
        public long ProductId { get; set; }
        public string Label { get; set; } = string.Empty;
        public string PathLabel { get; set; } = string.Empty;
    }

    private sealed class ProductTreeRow
    {
        public long GroupId { get; set; }
        public string GroupName { get; set; } = string.Empty;
        public long BrandKey { get; set; }
        public string BrandName { get; set; } = string.Empty;
        public long CategoryKey { get; set; }
        public string CategoryName { get; set; } = string.Empty;
        public long ProductId { get; set; }
        public string ProductLabel { get; set; } = string.Empty;
    }
}
