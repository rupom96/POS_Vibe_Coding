using PosApi.Logging;
using PosApi.Models.Dtos;

namespace PosApi.Services;

internal static class SaveInvoiceRequestScope
{
    /// <summary>
    /// Company/location come from the save body when present; otherwise from POS session headers
    /// (X-Session-CompanyId / X-Session-LocationId) sent by the embedded host UI.
    /// </summary>
    public static SaveInvoiceRequest ApplyClientSession(HttpRequest httpRequest, SaveInvoiceRequest request)
    {
        var session = ClientSessionInfo.From(httpRequest);
        return request with
        {
            CompanyId = request.CompanyId > 0 ? request.CompanyId : session.CompanyId ?? 0,
            LocationId = request.LocationId > 0 ? request.LocationId : session.LocationId ?? 0,
        };
    }
}
