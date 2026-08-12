using System.Data;
using Dapper;
using PosApi.Models.Dtos;

namespace PosApi.Services;

internal static class PosStockService
{
    private static bool IsServiceProductType(string? productType)
        => string.Equals(productType?.Trim(), "S", StringComparison.OrdinalIgnoreCase);

    private static async Task<HashSet<long>> LoadServiceProductIdsAsync(
        IDbConnection conn,
        IDbTransaction tx,
        IEnumerable<long> productIds)
    {
        var ids = productIds.Where(id => id > 0).Distinct().ToList();
        if (ids.Count == 0)
            return [];

        var rows = await conn.QueryAsync<long>(
            """
            SELECT ProductId
            FROM Product
            WHERE ProductId IN @ProductIds
              AND UPPER(LTRIM(RTRIM(ISNULL(ProductType, '')))) = 'S'
            """,
            new { ProductIds = ids },
            tx);
        return rows.ToHashSet();
    }

    public static async Task<IReadOnlyDictionary<Guid, OriginalLineSnapshot>> LoadOriginalLinesAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid salesOrderId)
    {
        var rows = await conn.QueryAsync<OriginalDetailRow>(
            """
            SELECT
                sod.SalesOrderDetailId,
                sod.ProductId,
                sod.Quantity,
                sod.Cost,
                p.UnitTypeId,
                p.ProductType,
                sd.SerialNo
            FROM SalesOrderDetail sod
            INNER JOIN Product p ON p.ProductId = sod.ProductId
            LEFT JOIN SalesDetail sd ON sd.SalesOrderDetailId = sod.SalesOrderDetailId
            WHERE sod.SalesOrderId = @SalesOrderId
            """,
            new { SalesOrderId = salesOrderId },
            tx);

        return rows
            .GroupBy(r => r.SalesOrderDetailId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var first = g.First();
                    var serials = g
                        .Select(r => r.SerialNo)
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .Select(s => s!.Trim())
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    return new OriginalLineSnapshot(
                        first.SalesOrderDetailId,
                        first.ProductId,
                        first.Quantity,
                        first.Cost,
                        first.UnitTypeId,
                        serials,
                        IsServiceProductType(first.ProductType));
                });
    }

    public static bool LineStockChanged(OriginalLineSnapshot original, SaveInvoiceLineRequest line)
    {
        if (original.ProductId != line.ProductId)
            return true;

        var newSerials = line.Serials?
            .Where(s => !string.IsNullOrWhiteSpace(s.SerialNo))
            .Select(s => s.SerialNo.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];

        if (original.Serials.Count > 0 || newSerials.Count > 0)
        {
            var oldSerials = original.Serials.ToHashSet(StringComparer.OrdinalIgnoreCase);
            return !oldSerials.SetEquals(newSerials);
        }

        return Math.Abs(original.Quantity - (double)line.Quantity) > 0.0001;
    }

    /// <summary>
    /// On invoice edit: qty decrease / deleted lines → stock-in as a NEW CurrentStock row
    /// (never update existing lots). Qty increase / new lines → FIFO deduct only the delta.
    /// PurchaseId and SalesOrderNo both store SalesOrderNo (not InvoiceNo).
    /// </summary>
    public static async Task ApplyEditStockAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long entryBy,
        string salesOrderNo,
        IReadOnlyDictionary<Guid, OriginalLineSnapshot> originals,
        IReadOnlyList<Guid> deletedLineIds,
        IReadOnlyList<SaveInvoiceLineRequest> lines)
    {
        var serviceProductIds = await LoadServiceProductIdsAsync(
            conn,
            tx,
            originals.Values.Select(o => o.ProductId).Concat(lines.Select(l => l.ProductId)));

        var handledOriginals = new HashSet<Guid>();

        foreach (var deletedId in deletedLineIds)
        {
            if (!originals.TryGetValue(deletedId, out var original) || !handledOriginals.Add(deletedId))
                continue;

            if (original.IsService || serviceProductIds.Contains(original.ProductId))
                continue;

            await StockInLineAsync(conn, tx, companyId, locationId, entryBy, salesOrderNo, original);
        }

        foreach (var line in lines)
        {
            var lineIsService = serviceProductIds.Contains(line.ProductId);

            if (line.SalesOrderDetailId is Guid detailId && originals.TryGetValue(detailId, out var original))
            {
                if (!handledOriginals.Add(detailId))
                    continue;

                if (original.ProductId != line.ProductId)
                {
                    if (!original.IsService && !serviceProductIds.Contains(original.ProductId))
                        await StockInLineAsync(conn, tx, companyId, locationId, entryBy, salesOrderNo, original);
                    if (!lineIsService)
                        await DeductLineAsync(conn, tx, companyId, locationId, line);
                    continue;
                }

                if (original.IsService || lineIsService)
                    continue;

                var newSerials = line.Serials?
                    .Where(s => !string.IsNullOrWhiteSpace(s.SerialNo))
                    .Select(s => s.SerialNo.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? [];

                if (original.Serials.Count > 0 || newSerials.Count > 0)
                {
                    var oldSet = original.Serials.ToHashSet(StringComparer.OrdinalIgnoreCase);
                    var newSet = newSerials.ToHashSet(StringComparer.OrdinalIgnoreCase);
                    var removed = original.Serials.Where(s => !newSet.Contains(s)).ToList();
                    var added = newSerials.Where(s => !oldSet.Contains(s)).ToList();

                    if (removed.Count > 0)
                    {
                        await StockInSerialsAsync(
                            conn, tx, companyId, locationId, entryBy, salesOrderNo,
                            original.ProductId, original.UnitTypeId, original.Cost, removed);
                    }

                    if (added.Count > 0)
                        await DeductSerialStockAsync(conn, tx, companyId, locationId, line.ProductId, added);

                    continue;
                }

                var delta = (double)line.Quantity - original.Quantity;
                if (delta < -0.0001)
                {
                    // Sold qty reduced → stock-in the returned qty as a new CurrentStock row.
                    await InsertStockInRowAsync(
                        conn, tx, companyId, locationId, entryBy, salesOrderNo,
                        original.ProductId, -delta, original.UnitTypeId, original.Cost);
                }
                else if (delta > 0.0001)
                {
                    await DeductFifoStockAsync(conn, tx, companyId, locationId, line.ProductId, delta);
                }

                continue;
            }

            // Brand-new line on edit.
            if (!lineIsService)
                await DeductLineAsync(conn, tx, companyId, locationId, line);
        }
    }

    public static async Task DeductForInvoiceAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        IReadOnlyList<SaveInvoiceLineRequest> lines)
    {
        var serviceProductIds = await LoadServiceProductIdsAsync(conn, tx, lines.Select(l => l.ProductId));
        foreach (var line in lines)
        {
            if (serviceProductIds.Contains(line.ProductId))
                continue;
            await DeductLineAsync(conn, tx, companyId, locationId, line);
        }
    }

    public static async Task<decimal> ComputeLineUnitCostAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        SaveInvoiceLineRequest line)
    {
        var isService = await conn.ExecuteScalarAsync<int>(
            """
            SELECT CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(ProductType, '')))) = 'S' THEN 1
                ELSE 0
            END
            FROM Product
            WHERE ProductId = @ProductId
            """,
            new { line.ProductId },
            tx) == 1;
        if (isService)
            return 0m;

        var serials = line.Serials?
            .Where(s => !string.IsNullOrWhiteSpace(s.SerialNo))
            .Select(s => s.SerialNo.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (serials is { Count: > 0 })
            return await ComputeSerialAvgCostAsync(conn, tx, companyId, locationId, line.ProductId, serials);

        return await ComputeFifoUnitCostAsync(conn, tx, companyId, locationId, line.ProductId, line.Quantity);
    }

    private static async Task DeductLineAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        SaveInvoiceLineRequest line)
    {
        var serials = line.Serials?
            .Where(s => !string.IsNullOrWhiteSpace(s.SerialNo))
            .Select(s => s.SerialNo.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (serials is { Count: > 0 })
            await DeductSerialStockAsync(conn, tx, companyId, locationId, line.ProductId, serials);
        else
            await DeductFifoStockAsync(conn, tx, companyId, locationId, line.ProductId, (double)line.Quantity);
    }

    /// <summary>
    /// Unit cost for a non-serial line using FIFO over CurrentStock (ORDER BY DateOfEntry ASC).
    /// Example: take 5 from lots [3@5, 3@10, 4@15] → (3*5 + 2*10) / 5.
    /// </summary>
    public static async Task<decimal> ComputeFifoUnitCostAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long productId,
        decimal quantity)
    {
        if (quantity <= 0)
            return 0m;

        var rows = (await conn.QueryAsync<StockCostRow>(
            """
            SELECT CurrentStocktId, Unit, Cost
            FROM CurrentStock
            WHERE ProductId = @ProductId
              AND LocationId = @LocationId
              AND CompanyId = @CompanyId
              AND Unit > 0
            ORDER BY DateOfEntry ASC
            """,
            new { ProductId = productId, LocationId = locationId, CompanyId = companyId },
            tx)).ToList();

        var remaining = (double)quantity;
        double totalCost = 0;
        double taken = 0;

        foreach (var row in rows)
        {
            if (remaining <= 0)
                break;

            var take = Math.Min(row.Unit, remaining);
            totalCost += take * row.Cost;
            taken += take;
            remaining -= take;
        }

        if (taken <= 0)
            return 0m;

        return (decimal)(totalCost / taken);
    }

    /// <summary>
    /// Unit cost for a serial line = average Cost of the parent CurrentStock lots
    /// linked via CurrentStockDetail for the selected serials.
    /// </summary>
    public static async Task<decimal> ComputeSerialAvgCostAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long productId,
        IReadOnlyList<string> serialNos)
    {
        if (serialNos.Count == 0)
            return 0m;

        var costs = (await conn.QueryAsync<double>(
            """
            SELECT cs.Cost
            FROM CurrentStockDetail csd
            INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
            WHERE cs.ProductId = @ProductId
              AND cs.LocationId = @LocationId
              AND cs.CompanyId = @CompanyId
              AND LTRIM(RTRIM(csd.SerialNo)) IN @SerialNos
            """,
            new { ProductId = productId, LocationId = locationId, CompanyId = companyId, SerialNos = serialNos },
            tx)).ToList();

        if (costs.Count == 0)
            return 0m;

        return (decimal)costs.Average();
    }

    private static Task StockInLineAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long entryBy,
        string salesOrderNo,
        OriginalLineSnapshot line)
    {
        if (line.Serials.Count > 0)
        {
            return StockInSerialsAsync(
                conn, tx, companyId, locationId, entryBy, salesOrderNo,
                line.ProductId, line.UnitTypeId, line.Cost, line.Serials);
        }

        if (line.Quantity <= 0)
            return Task.CompletedTask;

        return InsertStockInRowAsync(
            conn, tx, companyId, locationId, entryBy, salesOrderNo,
            line.ProductId, line.Quantity, line.UnitTypeId, line.Cost);
    }

    private static async Task StockInSerialsAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long entryBy,
        string salesOrderNo,
        long productId,
        long unitTypeId,
        double cost,
        IReadOnlyList<string> serials)
    {
        if (serials.Count == 0)
            return;

        var stockId = await InsertStockInRowAsync(
            conn, tx, companyId, locationId, entryBy, salesOrderNo,
            productId, serials.Count, unitTypeId, cost);

        foreach (var serialNo in serials)
        {
            await conn.ExecuteAsync(
                """
                INSERT INTO CurrentStockDetail (
                    CurrentStockDetailtId, CurrentStockId, SerialNo, RefNo
                ) VALUES (
                    @CurrentStockDetailtId, @CurrentStockId, @SerialNo, @RefNo
                )
                """,
                new
                {
                    CurrentStockDetailtId = Guid.NewGuid(),
                    CurrentStockId = stockId,
                    SerialNo = serialNo,
                    RefNo = salesOrderNo
                },
                tx);
        }
    }

    /// <summary>
    /// Always inserts a new CurrentStock row (never updates an existing lot).
    /// PurchaseId and SalesOrderNo both get SalesOrderNo.
    /// </summary>
    private static async Task<Guid> InsertStockInRowAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long entryBy,
        string salesOrderNo,
        long productId,
        double unit,
        long unitTypeId,
        double cost)
    {
        var stockId = Guid.NewGuid();
        await conn.ExecuteAsync(
            """
            INSERT INTO CurrentStock (
                CurrentStocktId, ProductId, Unit, UnitTypeId, Cost, LocationId, CompanyId,
                CurrencyRate, ProjectId, StockInType, PurchaseId, DateOfEntry, EntryBy, StockTypeId, SalesOrderNo
            ) VALUES (
                @CurrentStocktId, @ProductId, @Unit, @UnitTypeId, @Cost, @LocationId, @CompanyId,
                1, 1, 'SO', @PurchaseId, GETDATE(), @EntryBy, 1, @SalesOrderNo
            )
            """,
            new
            {
                CurrentStocktId = stockId,
                ProductId = productId,
                Unit = unit,
                UnitTypeId = unitTypeId,
                Cost = cost,
                LocationId = locationId,
                CompanyId = companyId,
                PurchaseId = salesOrderNo,
                EntryBy = entryBy,
                SalesOrderNo = salesOrderNo
            },
            tx);
        return stockId;
    }

    private static async Task DeductFifoStockAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long productId,
        double quantity)
    {
        if (quantity <= 0)
            return;

        var rows = (await conn.QueryAsync<StockRow>(
            """
            SELECT CurrentStocktId, Unit
            FROM CurrentStock
            WHERE ProductId = @ProductId
              AND LocationId = @LocationId
              AND CompanyId = @CompanyId
              AND Unit > 0
            ORDER BY DateOfEntry ASC
            """,
            new { ProductId = productId, LocationId = locationId, CompanyId = companyId },
            tx)).ToList();

        var available = rows.Sum(r => r.Unit);
        if (available + 0.0001 < quantity)
            throw new InvalidOperationException($"Insufficient stock for product {productId}. Available: {available}, required: {quantity}.");

        var remaining = quantity;
        foreach (var row in rows)
        {
            if (remaining <= 0)
                break;

            var take = Math.Min(row.Unit, remaining);
            var newUnit = row.Unit - take;

            await conn.ExecuteAsync(
                """
                UPDATE CurrentStock
                SET Unit = @Unit
                WHERE CurrentStocktId = @CurrentStocktId
                """,
                new { Unit = newUnit, CurrentStocktId = row.CurrentStocktId },
                tx);

            remaining -= take;
        }
    }

    private static async Task DeductSerialStockAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long productId,
        IReadOnlyList<string> serialNos)
    {
        if (serialNos.Count == 0)
            return;

        var detailRows = (await conn.QueryAsync<SerialStockRow>(
            """
            SELECT
                csd.CurrentStockDetailtId,
                csd.CurrentStockId,
                LTRIM(RTRIM(csd.SerialNo)) AS SerialNo
            FROM CurrentStockDetail csd
            INNER JOIN CurrentStock cs ON cs.CurrentStocktId = csd.CurrentStockId
            WHERE cs.ProductId = @ProductId
              AND cs.LocationId = @LocationId
              AND cs.CompanyId = @CompanyId
              AND LTRIM(RTRIM(csd.SerialNo)) IN @SerialNos
            """,
            new { ProductId = productId, LocationId = locationId, CompanyId = companyId, SerialNos = serialNos },
            tx)).ToList();

        var found = detailRows
            .Select(r => r.SerialNo)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var missing = serialNos.Where(s => !found.Contains(s)).ToList();
        if (missing.Count > 0)
            throw new InvalidOperationException($"Serial(s) not in stock for product {productId}: {string.Join(", ", missing)}");

        foreach (var detailId in detailRows.Select(r => r.CurrentStockDetailtId))
        {
            await conn.ExecuteAsync(
                "DELETE FROM CurrentStockDetail WHERE CurrentStockDetailtId = @CurrentStockDetailtId",
                new { CurrentStockDetailtId = detailId },
                tx);
        }

        foreach (var group in detailRows.GroupBy(r => r.CurrentStockId))
        {
            var soldQty = group.Count();
            await conn.ExecuteAsync(
                """
                UPDATE CurrentStock
                SET Unit = Unit - @SoldQty
                WHERE CurrentStocktId = @CurrentStocktId
                  AND ProductId = @ProductId
                """,
                new { SoldQty = (double)soldQty, CurrentStocktId = group.Key, ProductId = productId },
                tx);
        }
    }

    internal sealed record OriginalLineSnapshot(
        Guid SalesOrderDetailId,
        long ProductId,
        double Quantity,
        double Cost,
        long UnitTypeId,
        IReadOnlyList<string> Serials,
        bool IsService = false);

    private sealed class OriginalDetailRow
    {
        public Guid SalesOrderDetailId { get; init; }
        public long ProductId { get; init; }
        public double Quantity { get; init; }
        public double Cost { get; init; }
        public long UnitTypeId { get; init; }
        public string? ProductType { get; init; }
        public string? SerialNo { get; init; }
    }

    private sealed class StockRow
    {
        public Guid CurrentStocktId { get; init; }
        public double Unit { get; init; }
    }

    private sealed class StockCostRow
    {
        public Guid CurrentStocktId { get; init; }
        public double Unit { get; init; }
        public double Cost { get; init; }
    }

    private sealed class SerialStockRow
    {
        public Guid CurrentStockDetailtId { get; init; }
        public Guid CurrentStockId { get; init; }
        public string SerialNo { get; init; } = string.Empty;
    }
}
