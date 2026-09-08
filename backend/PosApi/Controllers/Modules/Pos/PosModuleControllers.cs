using Microsoft.AspNetCore.Mvc;
using PosApi.Exceptions;
using PosApi.Logging;
using PosApi.Models.Dtos;
using PosApi.Services;

namespace PosApi.Controllers.Modules.Pos;

[ApiController]
[Route("api/lookups")]
public class LookupsController(ILookupService lookupService) : ControllerBase
{
    [HttpGet("locations")]
    public async Task<ActionResult<IReadOnlyList<LocationDto>>> GetLocations([FromQuery] long? companyId)
        => Ok(await lookupService.GetLocationsAsync(companyId));

    [HttpGet("payment-modes")]
    public async Task<ActionResult<IReadOnlyList<PaymentModeDto>>> GetPaymentModes(
        [FromQuery] long? companyId,
        [FromQuery] long? locationId)
        => Ok(await lookupService.GetPaymentModesAsync(companyId, locationId));

    [HttpGet("sales-persons")]
    public async Task<ActionResult<IReadOnlyList<SalesPersonDto>>> GetSalesPersons(
        [FromQuery] long? companyId,
        [FromQuery] long? locationId)
        => Ok(await lookupService.GetSalesPersonsAsync(companyId, locationId));

    [HttpGet("references")]
    public async Task<ActionResult<IReadOnlyList<ReferenceOptionDto>>> GetReferences([FromQuery] long? companyId)
        => Ok(await lookupService.GetReferencesAsync(companyId));

    [HttpGet("banks")]
    public async Task<ActionResult<IReadOnlyList<BankOptionDto>>> GetBanks([FromQuery] long? companyId)
        => Ok(await lookupService.GetBanksAsync(companyId));

    [HttpGet("bank-expense")]
    public async Task<ActionResult<BankExpenseChargeDto?>> GetBankExpense(
        [FromQuery] long bankId,
        [FromQuery] long companyId)
    {
        var row = await lookupService.GetBankExpenseChargeAsync(bankId, companyId);
        return Ok(row);
    }

    [HttpGet("card-emi-deductions")]
    public async Task<ActionResult<IReadOnlyList<CardEmiDeductionDto>>> GetCardEmiDeductions([FromQuery] long bankId)
        => Ok(await lookupService.GetCardEmiDeductionsAsync(bankId));

    [HttpGet("pos-features")]
    public async Task<ActionResult<PosFeatureFlagsDto>> GetPosFeatures(
        [FromQuery] long companyId,
        [FromQuery] long securityUserId)
        => Ok(await lookupService.GetPosFeatureFlagsAsync(companyId, securityUserId));

    [HttpGet("bizness-event-types")]
    public async Task<ActionResult<IReadOnlyList<BiznessEventTypeOptionDto>>> GetBiznessEventTypes(
        [FromQuery] long companyId,
        [FromQuery] long locationId)
        => Ok(await lookupService.GetPosBiznessEventTypesAsync(companyId, locationId));

    [HttpGet("projects")]
    public async Task<ActionResult<IReadOnlyList<ProjectOptionDto>>> GetProjects([FromQuery] long companyId)
        => Ok(await lookupService.GetProjectsAsync(companyId));

    [HttpGet("buyer-groups")]
    public async Task<ActionResult<IReadOnlyList<BuyerGroupOptionDto>>> GetBuyerGroups([FromQuery] long companyId)
        => Ok(await lookupService.GetBuyerGroupsAsync(companyId));

    [HttpGet("company")]
    public async Task<ActionResult<CompanyLetterheadDto>> GetCompany([FromQuery] long companyId)
    {
        var company = await lookupService.GetCompanyLetterheadAsync(companyId);
        return company is null ? NotFound() : Ok(company);
    }
}

[ApiController]
[Route("api/customers")]
public class CustomersController(ICustomerService customerService) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<CustomerSearchResultDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] long? employeeId,
        [FromQuery] long? companyId,
        [FromQuery] long? locationId,
        [FromQuery] int limit = 5000)
        => Ok(await customerService.SearchAsync(q, employeeId, companyId, locationId, limit));

    [HttpGet("{buyerId:long}")]
    public async Task<ActionResult<CustomerDto>> Get(long buyerId)
    {
        var customer = await customerService.GetByIdAsync(buyerId);
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpGet("{buyerId:long}/stats")]
    public async Task<ActionResult<CustomerStatsDto>> GetStats(long buyerId)
    {
        var stats = await customerService.GetStatsAsync(buyerId);
        return stats is null ? NotFound() : Ok(stats);
    }

    [HttpGet("{buyerId:long}/ledger-due")]
    public async Task<ActionResult<decimal>> GetLedgerDue(long buyerId, [FromQuery] long? userId = null)
        => Ok(await customerService.GetLedgerDueAsync(buyerId, userId));

    [HttpGet("{buyerId:long}/preferred-payment-mode")]
    public async Task<ActionResult<BuyerPreferredPaymentModeDto>> GetPreferredPaymentMode(long buyerId)
        => Ok(await customerService.GetPreferredPaymentModeAsync(buyerId));

    [HttpPost]
    public async Task<ActionResult<CustomerDto>> Create([FromBody] CreateCustomerRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Customer name is required." });

            if (string.IsNullOrWhiteSpace(request.Phone))
                return BadRequest(new { message = "Customer mobile number is required." });

            var customer = await customerService.CreateAsync(request);
            return CreatedAtAction(nameof(Get), new { buyerId = customer.BuyerId }, customer);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DuplicateBuyerException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}

[ApiController]
[Route("api/products")]
public class ProductsController(IProductService productService, ILookupService lookupService) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<ProductSearchResultDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] long? locationId,
        [FromQuery] long? companyId,
        [FromQuery] int limit = 5000)
        => Ok(await productService.SearchAsync(q, locationId, companyId, limit));

    [HttpGet("{productId:long}")]
    public async Task<ActionResult<ProductDetailDto>> Get(
        long productId,
        [FromQuery] long? locationId,
        [FromQuery] long? companyId)
    {
        var product = await productService.GetByIdAsync(productId, locationId, companyId);
        if (product is null) return NotFound();
        await HideProductCostIfUnauthorized(product);
        return Ok(product);
    }

    [HttpGet("{productId:long}/price-history")]
    public async Task<ActionResult<IReadOnlyList<PriceHistoryItemDto>>> GetPriceHistory(
        long productId,
        [FromQuery] long? buyerId)
        => Ok(await productService.GetPriceHistoryAsync(productId, buyerId));

    [HttpGet("{productId:long}/price")]
    public async Task<IActionResult> GetPosSalesPrice(
        long productId,
        [FromQuery] double quantity,
        [FromQuery] long companyId,
        [FromQuery] long locationId)
    {
        var quote = await productService.GetPosSalesPriceAsync(productId, quantity, companyId, locationId);
        // JsonResult keeps HTTP 200 with a JSON null body (Ok(null) would become 204).
        return new JsonResult(quote);
    }

    [HttpGet("tree")]
    public async Task<ActionResult<IReadOnlyList<ProductTreeNodeDto>>> GetTree()
        => Ok(await productService.GetProductTreeAsync());

    [HttpGet("tree-search")]
    public async Task<ActionResult<IReadOnlyList<ProductTreeSearchResultDto>>> SearchTree(
        [FromQuery] string q,
        [FromQuery] string filter = "all",
        [FromQuery] long? companyId = null,
        [FromQuery] long? locationId = null,
        [FromQuery] int limit = 200)
        => Ok(await productService.SearchTreeAsync(q, filter, companyId, locationId, limit));

    [HttpGet("{productId:long}/serials/search")]
    public async Task<ActionResult<IReadOnlyList<ProductSerialOptionDto>>> SearchSerials(
        long productId,
        [FromQuery] long locationId,
        [FromQuery] string? q,
        [FromQuery] int limit = 50,
        [FromQuery] string[]? exclude = null)
        => Ok(await productService.SearchSerialsAsync(productId, locationId, q, limit, exclude));

    [HttpGet("{productId:long}/serials/bulk")]
    public async Task<ActionResult<IReadOnlyList<ProductSerialOptionDto>>> GetBulkSerials(
        long productId,
        [FromQuery] long locationId,
        [FromQuery] int count,
        [FromQuery] string[]? exclude = null)
        => Ok(await productService.GetBulkSerialsAsync(productId, locationId, count, exclude));

    [HttpGet("{productId:long}/serials/prefixes")]
    public async Task<ActionResult<IReadOnlyList<string>>> GetSerialPrefixes(
        long productId,
        [FromQuery] long locationId,
        [FromQuery] string? q = null)
        => Ok(await productService.GetSerialPrefixesAsync(productId, locationId, q));

    [HttpGet("{productId:long}/serials/resolve-sequence")]
    public async Task<ActionResult<ResolveSerialSequenceResultDto>> ResolveSerialSequence(
        long productId,
        [FromQuery] long locationId,
        [FromQuery] string prefix,
        [FromQuery] int from,
        [FromQuery] int to)
    {
        try
        {
            return Ok(await productService.ResolveSerialSequenceAsync(productId, locationId, prefix, from, to));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private async Task HideProductCostIfUnauthorized(ProductDetailDto product)
    {
        var userId = ClientSessionInfo.From(Request).SecurityUserId ?? 0;
        if (await lookupService.CanViewProductCostAsync(userId))
            return;

        product.CostMin = null;
        product.CostMax = null;
        product.CostAvg = null;
    }
}

[ApiController]
[Route("api/pos")]
public class PosController(IPosService posService, SqlUserFriendlyError friendlyError) : ControllerBase
{
    [HttpGet("next-invoice")]
    public async Task<ActionResult<NextInvoiceDto>> GetNextInvoice(
        [FromQuery] long companyId,
        [FromQuery] long locationId)
        => Ok(await posService.GetNextInvoiceAsync(companyId, locationId));

    [HttpGet("invoices/search")]
    public async Task<ActionResult<IReadOnlyList<InvoiceSearchResultDto>>> SearchInvoices(
        [FromQuery] string? q,
        [FromQuery] long companyId,
        [FromQuery] long locationId,
        [FromQuery] int limit = 50)
        => Ok(await posService.SearchInvoicesAsync(q, companyId, locationId, limit));

    [HttpGet("invoices/today")]
    public async Task<ActionResult<IReadOnlyList<TodayInvoiceListItemDto>>> GetTodayInvoices(
        [FromQuery] long companyId,
        [FromQuery] long locationId,
        [FromQuery] long employeeId,
        [FromQuery] int limit = 100)
        => Ok(await posService.GetTodayInvoicesAsync(companyId, locationId, employeeId, limit));

    [HttpGet("invoices/{invoiceNo}")]
    public async Task<ActionResult<LoadedInvoiceDto>> GetInvoice(
        string invoiceNo,
        [FromQuery] long companyId,
        [FromQuery] long locationId)
    {
        var invoice = await posService.GetInvoiceAsync(invoiceNo, companyId, locationId);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpGet("invoices/{invoiceNo}/print-context")]
    public async Task<ActionResult<InvoicePrintContextDto>> GetInvoicePrintContext(
        string invoiceNo,
        [FromQuery] long companyId,
        [FromQuery] long locationId,
        [FromQuery] bool reportLedgerDue = false)
    {
        var ctx = await posService.GetInvoicePrintContextAsync(
            invoiceNo, companyId, locationId, reportLedgerDue);
        return ctx is null ? NotFound() : Ok(ctx);
    }

    [HttpGet("multi-scan")]
    public async Task<ActionResult<MultiScanResultDto>> MultiScan(
        [FromQuery] string q,
        [FromQuery] long? companyId,
        [FromQuery] long? locationId)
    {
        var result = await posService.MultiScanAsync(q, companyId, locationId);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("multi-scan/search")]
    public async Task<ActionResult<IReadOnlyList<MultiScanSearchItemDto>>> SearchMultiScan(
        [FromQuery] string q,
        [FromQuery] long? companyId,
        [FromQuery] long? locationId,
        [FromQuery] int limit = 25)
        => Ok(await posService.SearchMultiScanAsync(q, companyId, locationId, limit));

    [HttpPost("save")]
    public async Task<ActionResult<SaveInvoiceResponse>> Save([FromBody] SaveInvoiceRequest request)
    {
        try
        {
            var scopedRequest = SaveInvoiceRequestScope.ApplyClientSession(Request, request);
            var response = await posService.SaveInvoiceAsync(scopedRequest);
            return Ok(response);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = friendlyError.ToUserMessage(ex) });
        }
    }
}
