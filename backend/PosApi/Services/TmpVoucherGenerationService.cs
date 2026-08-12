using System.Data;
using Dapper;

namespace PosApi.Services;

internal static class TmpVoucherGenerationService
{
    public static Task InsertAsync(
        IDbConnection conn,
        IDbTransaction tx,
        string biznessEventName,
        string eventNo,
        DateTime eventDate,
        long eventModeId,
        decimal eventTotalAmount,
        long? biznessEventTypeId,
        long userId,
        long locationId,
        long companyId,
        long? projectId)
        => conn.ExecuteAsync(
            """
            INSERT INTO TMP_VoucherGeneration (
                BiznessEventName, EventNo, EventDate, EventModeId, EventTotalAmount,
                BiznessEventTypeId, UserId, LocationId, CompanyId, ProjectId
            ) VALUES (
                @BiznessEventName, @EventNo, @EventDate, @EventModeId, @EventTotalAmount,
                @BiznessEventTypeId, @UserId, @LocationId, @CompanyId, @ProjectId
            )
            """,
            new
            {
                BiznessEventName = biznessEventName,
                EventNo = eventNo,
                EventDate = eventDate,
                EventModeId = eventModeId,
                EventTotalAmount = (double)eventTotalAmount,
                BiznessEventTypeId = biznessEventTypeId is > 0 ? biznessEventTypeId : null,
                UserId = userId,
                LocationId = locationId,
                CompanyId = companyId,
                ProjectId = projectId is > 0 ? projectId : null
            },
            tx);

    /// <summary>
    /// Removes pending voucher-queue rows whose EventNo matches an InvoiceNo or CollectionNo.
    /// </summary>
    public static async Task DeleteByEventNosAsync(
        IDbConnection conn,
        IDbTransaction tx,
        IEnumerable<string> eventNos)
    {
        var nos = eventNos
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (nos.Count == 0)
            return;

        await conn.ExecuteAsync(
            """
            DELETE FROM TMP_VoucherGeneration
            WHERE EventNo IN @EventNos
            """,
            new { EventNos = nos },
            tx);
    }
}
