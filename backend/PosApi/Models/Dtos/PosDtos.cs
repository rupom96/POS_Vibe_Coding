namespace PosApi.Models.Dtos;

public record NextInvoiceDto(string InvoiceNo, string SalesOrderNo);

public record SaveInvoiceSerialRequest(string SerialNo, decimal Discount);

public record SaveInvoiceLineRequest(
    Guid? SalesOrderDetailId,
    long ProductId,
    decimal Quantity,
    decimal UnitPrice,
    decimal Discount,
    decimal WarrantyDays,
    decimal VatPercent,
    decimal TaxPercent,
    IReadOnlyList<SaveInvoiceSerialRequest>? Serials);

public record SaveInvoiceMixedCardRequest(
    decimal Amount,
    string CardNo,
    string Bank,
    long? BankId,
    string? ExpiryDate,
    bool PosMachine,
    string? Charge,
    long? PosMachineBankId = null,
    decimal? CashBackAmount = null,
    bool IsEmi = false,
    long? EmiBankId = null,
    long? EmiId = null,
    decimal? EmiDeductionPercentage = null);

public record SaveInvoiceMixedPaymentRequest(
    decimal CashAmount,
    decimal ChequeAmount,
    string? ChequeNo,
    string? ChequeBank,
    long? ChequeBankId,
    string? ChequeDate,
    bool MultiCard,
    IReadOnlyList<SaveInvoiceMixedCardRequest> Cards,
    bool Confirmed);

public record SaveInvoiceCardPaymentRequest(
    string CardNo,
    string Bank,
    long? BankId,
    string? ExpiryDate,
    bool PosMachine,
    string? Charge,
    bool Confirmed);

public record SaveInvoiceRequest(
    Guid? SalesOrderId,
    long? BuyerId,
    string? CustomerName,
    string? Mobile,
    string? Address,
    string? Remarks,
    long LocationId,
    long PaymentModeId,
    long? SubPaymentModeId,
    long? ReferenceId,
    long BiznessEventTypeId,
    long? ProjectId,
    long EmployeeId,
    long EntryBy,
    string? EntryByUserName,
    DateTime InvoiceDate,
    DateTime? PaymentPromiseDate,
    decimal PreviousDues,
    decimal InvoiceDiscount,
    string? InvoiceDiscountType,
    decimal VatAit,
    decimal OthersCharge,
    decimal GivenAmount,
    string? PayModeName,
    SaveInvoiceMixedPaymentRequest? MixedPayment,
    SaveInvoiceCardPaymentRequest? CardPayment,
    IReadOnlyList<SaveInvoiceLineRequest> Lines,
    IReadOnlyList<Guid>? DeletedLineIds);

public record SaveInvoiceResponse(
    Guid SalesOrderId,
    string InvoiceNo,
    string SalesOrderNo,
    decimal GrandTotal,
    decimal ChangeAmount,
    string Message);

public record InvoicePreviewDto(
    string InvoiceNo,
    DateTime InvoiceDate,
    string CustomerName,
    string? Mobile,
    string? Address,
    string PayMode,
    string SalesPerson,
    decimal TotalQty,
    decimal SubTotal,
    decimal InvoiceDiscount,
    decimal VatAit,
    decimal OthersCharge,
    decimal GrandTotal,
    decimal GivenAmount,
    decimal ChangeAmount,
    IReadOnlyList<InvoicePreviewLineDto> Lines);

public record InvoicePreviewLineDto(
    int Sl,
    string ProductName,
    string? ModelNo,
    decimal Quantity,
    decimal UnitPrice,
    decimal Discount,
    decimal VatPercent,
    decimal TaxPercent,
    decimal Total);

public record InvoiceSearchResultDto(
    string InvoiceNo,
    Guid SalesOrderId,
    DateTime? InvoiceDate,
    string? CustomerName);

public class TodayInvoiceListItemDto
{
    public string InvoiceNo { get; set; } = "";
    public Guid SalesOrderId { get; set; }
    public DateTime? InvoiceDate { get; set; }
    public string? CustomerName { get; set; }
    public int ItemCount { get; set; }
    public decimal GrandTotal { get; set; }
    public string Status { get; set; } = "";
}

public record LoadedInvoiceSerialDto(string SerialNo, decimal Discount);

public record LoadedInvoiceLineDto(
    Guid SalesOrderDetailId,
    long ProductId,
    string ProductName,
    string? ModelNo,
    decimal Quantity,
    decimal UnitPrice,
    decimal Discount,
    decimal WarrantyDays,
    decimal VatPercent,
    decimal TaxPercent,
    bool IsSerial,
    string? UnitName,
    decimal StockQty,
    IReadOnlyList<LoadedInvoiceSerialDto> Serials,
    string? ProductType = null,
    bool HasPriceSetup = true);

public record InvoicePrintContextDto(
    CompanyLetterheadDto Company,
    string InvoiceNo,
    string SalesOrderNo,
    string? BillingByName,
    string? VerifiedByName,
    decimal CollectedAmount,
    /// <summary>SalesOrder.TotalAmount for the invoice (Sales Amount on print).</summary>
    decimal SalesAmount,
    /// <summary>TempLedgerDue.PreviousDue after SP_PosSalesLedgerDue (invoice report only).</summary>
    decimal? PreviousDue = null);

public record LoadedInvoiceDto(
    Guid SalesOrderId,
    string InvoiceNo,
    string SalesOrderNo,
    long BuyerId,
    string CustomerName,
    string? Mobile,
    string? Address,
    string? Remarks,
    long? ReferenceId,
    long BiznessEventTypeId,
    long? ProjectId,
    long EmployeeId,
    long PaymentModeId,
    long? SubPaymentModeId,
    DateTime InvoiceDate,
    DateTime? PaymentPromiseDate,
    decimal InvoiceDiscount,
    string? InvoiceDiscountType,
    decimal VatAit,
    decimal OthersCharge,
    decimal GivenAmount,
    decimal GrandTotal,
    SaveInvoiceMixedPaymentRequest? MixedPayment,
    SaveInvoiceCardPaymentRequest? CardPayment,
    IReadOnlyList<LoadedInvoiceLineDto> Lines);
