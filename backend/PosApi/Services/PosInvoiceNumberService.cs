using System.Data;

namespace PosApi.Services;

/// <summary>
/// Thin wrapper around <see cref="BiznessEventDocumentNumberService"/> for InvoiceNo.
/// </summary>
internal static class PosInvoiceNumberService
{
    public sealed record GenerateContext(
        long CompanyId,
        long LocationId,
        long PaymentModeId,
        long BiznessEventTypeId,
        long EmployeeId,
        long SecurityUserId,
        long? BuyerId,
        DateTime InvoiceDate);

    public static Task<string> GenerateAsync(
        IDbConnection conn,
        IDbTransaction tx,
        GenerateContext ctx)
        => BiznessEventDocumentNumberService.GenerateAsync(
            conn,
            tx,
            BiznessEventDocumentKind.Invoice,
            new BiznessEventDocumentNumberService.GenerateContext(
                CompanyId: ctx.CompanyId,
                LocationId: ctx.LocationId,
                PaymentModeId: ctx.PaymentModeId,
                BiznessEventTypeId: ctx.BiznessEventTypeId,
                EmployeeId: ctx.EmployeeId,
                SecurityUserId: ctx.SecurityUserId,
                BuyerId: ctx.BuyerId,
                DocumentDate: ctx.InvoiceDate));
}
