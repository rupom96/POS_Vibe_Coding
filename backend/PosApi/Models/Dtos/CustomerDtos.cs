namespace PosApi.Models.Dtos;

public class CustomerDto
{
    public long BuyerId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? Initial { get; set; }
    public string? Remarks { get; set; }
    public decimal LedgerDue { get; set; }
    public long? EmployeeId { get; set; }
    public string? SalesPersonName { get; set; }
}

public class CustomerSearchResultDto
{
    public long BuyerId { get; set; }
    public string BuyerName { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public long? EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
}

public record CreateCustomerRequest(
    string Initial,
    string Name,
    string Phone,
    string? Address,
    string? Remarks,
    long? EmployeeId,
    long? GroupId,
    long? CompanyId,
    long? LocationId,
    long? EntryBy);

public class BuyerPreferredPaymentModeDto
{
    public long? PaymentModeId { get; set; }
    public long? SubPaymentModeId { get; set; }
}

public class CustomerStatsDto
{
    public string CustomerName { get; set; } = string.Empty;
    public int SinceYear { get; set; }
    public int InvoiceCount { get; set; }
    public decimal TotalSales { get; set; }
    public decimal TotalCollected { get; set; }
    public decimal LedgerDue { get; set; }
    public string? LastPurchaseDate { get; set; }
    public decimal AverageOrder { get; set; }
}
