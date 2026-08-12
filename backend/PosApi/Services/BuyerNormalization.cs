namespace PosApi.Services;

public static class BuyerNormalization
{
    public static string NormalizeName(string? name)
        => (name ?? string.Empty).Trim().ToLowerInvariant();

    public static string NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return string.Empty;

        var chars = phone.Where(char.IsDigit).ToArray();
        return new string(chars);
    }
}
