namespace PosApi.Models.Dtos;

public class ProductSearchResultDto
{
    public long ProductId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ModelNo { get; set; }
    public string? Barcode { get; set; }
    public string? GroupName { get; set; }
    public bool IsSerial { get; set; }
    public string? ProductType { get; set; }
}

public class ProductDetailDto
{
    public long ProductId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ModelNo { get; set; }
    public string? Barcode { get; set; }
    public string? UnitName { get; set; }
    public decimal StockQty { get; set; }
    public decimal LastPrice { get; set; }
    public bool IsSerial { get; set; }
    public decimal WarrantyDays { get; set; }
    public decimal? CostMin { get; set; }
    public decimal? CostMax { get; set; }
    public decimal? CostAvg { get; set; }
    /** True when at least one CurrentStock row exists for this product (qty may be zero). */
    public bool HasCurrentStock { get; set; }
    public string? ProductType { get; set; }
    public bool HasPriceSetup { get; set; }
}

public class PriceHistoryItemDto
{
    public string Label { get; set; } = string.Empty;
    public decimal Value { get; set; }
}

/// <summary>PosSales list price plus allowed override window from PriceType percents.</summary>
public class PosSalesPriceDto
{
    public double? Price { get; set; }
    public double? MinPrice { get; set; }
    public double? MaxPrice { get; set; }
}

public class ProductTreeNodeDto
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public bool IsModel { get; set; }
    public bool Bold { get; set; }
    public bool Open { get; set; }
    public List<ProductTreeNodeDto> Children { get; set; } = [];
}

public class ProductTreeSearchResultDto
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string MatchType { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public long? ProductId { get; set; }
    public List<string> ExpandIds { get; set; } = [];
}

public class MultiScanResultDto
{
    public string Type { get; set; } = string.Empty;
    public CustomerSearchResultDto? Customer { get; set; }
    public ProductDetailDto? Product { get; set; }
    public string? InvoiceNo { get; set; }
    public MultiScanSerialItemDto? Serial { get; set; }
    public SalesPersonDto? SalesPerson { get; set; }
}

public class MultiScanSerialItemDto
{
    public long ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string SerialNo { get; set; } = string.Empty;
    public decimal DiscountAmount { get; set; }
}

public class MultiScanSearchItemDto
{
    public string Type { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? SubLabel { get; set; }
    public CustomerSearchResultDto? Customer { get; set; }
    public long? ProductId { get; set; }
    public string? InvoiceNo { get; set; }
    public MultiScanSerialItemDto? Serial { get; set; }
    public SalesPersonDto? SalesPerson { get; set; }
}

public class ProductSerialOptionDto
{
    public string SerialNo { get; set; } = string.Empty;
    public decimal DiscountAmount { get; set; }
}

public class ResolveSerialSequenceResultDto
{
    public List<ProductSerialOptionDto> Found { get; set; } = [];
    public List<string> Missing { get; set; } = [];
}
