using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using PosApi.Configuration;

namespace PosApi.Controllers.Modules.Pos;

/// <summary>
/// Proxies BR2 Crystal PDF so the Vibe SPA can auto-print same-origin
/// (cross-origin ReportViewer PDF cannot be printed from Vibe JS).
/// </summary>
[ApiController]
[Route("api/pos/reports")]
public class PosReportsController(
    IHttpClientFactory httpClientFactory,
    IOptions<PosSettings> posSettings) : ControllerBase
{
    [HttpGet("invoice-pos-pdf")]
    public async Task<IActionResult> GetInvoicePosPdf(
        [FromQuery] string invoiceNo,
        [FromQuery] string? userName,
        CancellationToken cancellationToken)
    {
        var trimmedInvoice = invoiceNo?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(trimmedInvoice))
            return BadRequest(new { message = "invoiceNo is required." });

        var baseUrl = posSettings.Value.Br2ReportBaseUrl?.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
            return BadRequest(new { message = "PosSettings:Br2ReportBaseUrl is not configured." });

        var strs = "{SalesOrder.InvoiceNo}='" + trimmedInvoice.Replace("'", "''") + "'";
        var parameter = (userName ?? string.Empty).Trim();
        var items = string.Join(',', "InvoiceReportWithSalesOrderPOS", strs, parameter);
        var reportUrl = $"{baseUrl}/ReportViewer.aspx?items={Uri.EscapeDataString(items)}";

        var client = httpClientFactory.CreateClient("Br2Reports");
        using var request = new HttpRequestMessage(HttpMethod.Get, reportUrl);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/pdf"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));

        using var response = await client.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode(
                (int)response.StatusCode,
                new { message = $"BR2 report failed ({(int)response.StatusCode})." });
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (bytes.Length < 5 || bytes[0] != (byte)'%' || bytes[1] != (byte)'P' || bytes[2] != (byte)'D' || bytes[3] != (byte)'F')
        {
            return BadRequest(new
            {
                message = "BR2 did not return a PDF. Ensure InvoiceReportWithSalesOrderPOS exports PDF on load.",
            });
        }

        return File(bytes, "application/pdf", $"InvoicePOS-{trimmedInvoice}.pdf");
    }
}
