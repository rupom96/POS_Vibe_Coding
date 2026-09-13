namespace PosApi.Configuration;

public class PosSettings
{
    public long DefaultUserId { get; set; } = 1;
    public long DefaultEntryBy { get; set; } = 1;
    public string InvoicePrefix { get; set; } = "INV-DBZ";

    /// <summary>
    /// BR2 Crystal ReportViewer base (e.g. http://localhost:8080/BRReports).
    /// Used to proxy Invoice POS PDF for same-origin auto-print from Vibe.
    /// </summary>
    public string? Br2ReportBaseUrl { get; set; }
}
