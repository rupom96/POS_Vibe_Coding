namespace PosApi.Models.Dtos;

public class LocationDto
{
    public long LocationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
}

public class PaymentModeDto
{
    public long PaymentModeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public long? ParentId { get; set; }
    public string? ParentName { get; set; }
}

public class SalesPersonDto
{
    public long EmployeeId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class ReferenceOptionDto
{
    public long AllCompanyId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class BankOptionDto
{
    public long BankId { get; set; }
    public string BankName { get; set; } = string.Empty;
}

public class PosFeatureFlagsDto
{
    public bool LoginUserWiseSalesPersonSet { get; set; }
    public bool SalesOrderEnableSalesPerson { get; set; }
    public bool MixedModeCrossCheck { get; set; }
    public bool BackDateEntrySales { get; set; }
    public bool SalesWithoutPriceSetup { get; set; }
    public bool CashBackOffer { get; set; }
    public bool PosMachineChargeFromBankSetup { get; set; }
    public bool PosSalesEdit { get; set; }
    public bool PosMultiplePriceSales { get; set; }
    public bool CanViewProductCost { get; set; }
}

public class BankExpenseChargeDto
{
    public decimal CreditCardChargeP { get; set; }
    public decimal PosMachineChargeP { get; set; }
    public decimal CashBackAmount { get; set; }
}

public class CardEmiDeductionDto
{
    public long CardEmiDeductionId { get; set; }
    public int NoOfInstallment { get; set; }
    public decimal DeductionRate { get; set; }
}

public class BiznessEventTypeOptionDto
{
    public long BiznessEventTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class ProjectOptionDto
{
    public long ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class CompanyLetterheadDto
{
    public long CompanyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Fax { get; set; }
    public string? Email { get; set; }
    public string? Url { get; set; }
}
