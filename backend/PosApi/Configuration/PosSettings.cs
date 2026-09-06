namespace PosApi.Configuration;

public class PosSettings
{
    public long DefaultUserId { get; set; } = 1;
    public long DefaultEntryBy { get; set; } = 1;
    public string InvoicePrefix { get; set; } = "INV-DBZ";
}
