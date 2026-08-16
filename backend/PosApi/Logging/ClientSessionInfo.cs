namespace PosApi.Logging;

public sealed class ClientSessionInfo
{
    public long? SecurityUserId { get; init; }
    public string? SecurityUserName { get; init; }
    public long? LocationId { get; init; }
    public string? LocationName { get; init; }
    public long? CompanyId { get; init; }
    public string? CompanyName { get; init; }
    public long? EmployeeId { get; init; }
    public string? EmployeeName { get; init; }
    public string? Page { get; init; }
    public string? Action { get; init; }

    public static ClientSessionInfo From(HttpRequest request)
    {
        return new ClientSessionInfo
        {
            SecurityUserId = ParseLong(request.Headers["X-Session-SecurityUserId"]),
            SecurityUserName = Header(request, "X-Session-SecurityUserName"),
            LocationId = ParseLong(request.Headers["X-Session-LocationId"]),
            LocationName = Header(request, "X-Session-LocationName"),
            CompanyId = ParseLong(request.Headers["X-Session-CompanyId"]),
            CompanyName = Header(request, "X-Session-CompanyName"),
            EmployeeId = ParseLong(request.Headers["X-Session-EmployeeId"]),
            EmployeeName = Header(request, "X-Session-EmployeeName"),
            Page = Header(request, "X-Client-Page"),
            Action = Header(request, "X-Client-Action"),
        };
    }

    private static string? Header(HttpRequest request, string name)
    {
        var value = request.Headers[name].ToString();
        return string.IsNullOrWhiteSpace(value) ? null : Uri.UnescapeDataString(value.Trim());
    }

    private static long? ParseLong(Microsoft.Extensions.Primitives.StringValues value)
    {
        var text = value.ToString();
        return long.TryParse(text, out var n) ? n : null;
    }
}
