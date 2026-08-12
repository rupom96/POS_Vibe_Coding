using System.Data;
using Dapper;

namespace PosApi.Services;

/// <summary>
/// On POS invoice edit: resolve vouchers from SalesOrder.VoucherId / Collection.VoucherId
/// (plus ReferenceNo/Description fallback), unpost + cancel them, delete PostedTransaction only,
/// clear SalesOrder/Collection.VoucherId, and remove TMP_VoucherGeneration rows.
/// Voucher / VoucherDetail rows are left intact.
/// </summary>
internal static class PosVoucherEditService
{
    public static async Task ResetForSalesOrderEditAsync(
        IDbConnection conn,
        IDbTransaction tx,
        Guid salesOrderId,
        IEnumerable<string> eventNos,
        long securityUserId)
    {
        var voucherIds = new HashSet<Guid>();

        var soVoucherId = await conn.ExecuteScalarAsync<Guid?>(
            """
            SELECT VoucherId
            FROM SalesOrder
            WHERE SalesOrderId = @SalesOrderId
            """,
            new { SalesOrderId = salesOrderId },
            tx);
        if (soVoucherId is Guid soVid && soVid != Guid.Empty)
            voucherIds.Add(soVid);

        var collectionVoucherIds = await conn.QueryAsync<Guid>(
            """
            SELECT c.VoucherId
            FROM Collection_Invoice ci
            INNER JOIN Collection c ON c.CollectionId = ci.CollectionId
            WHERE ci.SalesOrderId = @SalesOrderId
              AND c.VoucherId IS NOT NULL
              AND c.VoucherId <> '00000000-0000-0000-0000-000000000000'
            """,
            new { SalesOrderId = salesOrderId },
            tx);
        foreach (var id in collectionVoucherIds)
            voucherIds.Add(id);

        var nos = eventNos
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var eventNo in nos)
        {
            var ids = await conn.QueryAsync<Guid>(
                """
                SELECT VoucherId
                FROM Voucher
                WHERE ReferenceNo LIKE @Pattern
                   OR CAST(Description AS nvarchar(max)) LIKE @Pattern
                """,
                new { Pattern = "%" + eventNo + "%" },
                tx);
            foreach (var id in ids)
                voucherIds.Add(id);
        }

        if (voucherIds.Count > 0)
        {
            var idList = voucherIds.ToList();

            await conn.ExecuteAsync(
                """
                UPDATE Voucher
                SET Posted = NULL,
                    PostedBy = NULL,
                    PostingDate = NULL,
                    Cancelled = 1,
                    CancelledBy = @SecurityUserId,
                    CancelledDate = @CancelledDate
                WHERE VoucherId IN @VoucherIds
                """,
                new
                {
                    VoucherIds = idList,
                    SecurityUserId = securityUserId,
                    CancelledDate = DateTime.Now
                },
                tx);

            await conn.ExecuteAsync(
                """
                DELETE FROM PostedTransaction
                WHERE VoucherId IN @VoucherIds
                """,
                new { VoucherIds = idList },
                tx);
        }

        // Same as SalesOrder: clear VoucherId on linked Collection rows.
        await conn.ExecuteAsync(
            """
            UPDATE SalesOrder
            SET VoucherId = NULL
            WHERE SalesOrderId = @SalesOrderId
            """,
            new { SalesOrderId = salesOrderId },
            tx);

        await conn.ExecuteAsync(
            """
            UPDATE c
            SET c.VoucherId = NULL
            FROM Collection c
            INNER JOIN Collection_Invoice ci ON ci.CollectionId = c.CollectionId
            WHERE ci.SalesOrderId = @SalesOrderId
            """,
            new { SalesOrderId = salesOrderId },
            tx);

        if (nos.Count > 0)
            await TmpVoucherGenerationService.DeleteByEventNosAsync(conn, tx, nos);
    }
}
