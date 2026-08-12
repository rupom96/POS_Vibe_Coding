using System.Data;

namespace PosApi.Services;

internal static class PartyCodeGenerator
{
    public static Task<string> GenerateBuyerCodeAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long employeeId = 1,
        long securityUserId = 1,
        DateTime? documentDate = null)
        => BiznessEventDocumentNumberService.GenerateAsync(
            conn,
            tx,
            BiznessEventDocumentKind.BuyerCustomer,
            new BiznessEventDocumentNumberService.GenerateContext(
                CompanyId: companyId,
                LocationId: locationId,
                PaymentModeId: null,
                BiznessEventTypeId: null,
                EmployeeId: employeeId,
                SecurityUserId: securityUserId,
                BuyerId: null,
                DocumentDate: documentDate ?? DateTime.Now));

    /// <summary>
    /// Ready for supplier create flows; not used by current POS UI.
    /// </summary>
    public static Task<string> GenerateSupplierCodeAsync(
        IDbConnection conn,
        IDbTransaction tx,
        long companyId,
        long locationId,
        long employeeId = 1,
        long securityUserId = 1,
        DateTime? documentDate = null)
        => BiznessEventDocumentNumberService.GenerateAsync(
            conn,
            tx,
            BiznessEventDocumentKind.Supplier,
            new BiznessEventDocumentNumberService.GenerateContext(
                CompanyId: companyId,
                LocationId: locationId,
                PaymentModeId: null,
                BiznessEventTypeId: null,
                EmployeeId: employeeId,
                SecurityUserId: securityUserId,
                BuyerId: null,
                DocumentDate: documentDate ?? DateTime.Now));
}
