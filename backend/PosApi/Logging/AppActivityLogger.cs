using System.Text;

namespace PosApi.Logging;

public interface IAppActivityLogger
{
    string LogDirectory { get; }
    void LogError(ClientSessionInfo session, string action, string how, string error, TimeSpan? duration, string? technical = null);
    void LogSuccess(ClientSessionInfo session, string action, string how, string what, TimeSpan? duration);
}

/// <summary>
/// Writes two plain-text logs into the frontend folder (local public/logs or published FN/logs).
/// errors.log = failures only. activity.log = successes and failures.
/// </summary>
public sealed class AppActivityLogger : IAppActivityLogger
{
    private readonly object _gate = new();
    private readonly ILogger<AppActivityLogger> _logger;

    public string LogDirectory { get; }
    private string ErrorFile => Path.Combine(LogDirectory, "errors.log");
    private string ActivityFile => Path.Combine(LogDirectory, "activity.log");

    public AppActivityLogger(IWebHostEnvironment env, IConfiguration config, ILogger<AppActivityLogger> logger)
    {
        _logger = logger;
        LogDirectory = ResolveDirectory(env, config);
        try
        {
            Directory.CreateDirectory(LogDirectory);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not create activity log directory {Dir}", LogDirectory);
        }
    }

    public void LogError(
        ClientSessionInfo session,
        string action,
        string how,
        string error,
        TimeSpan? duration,
        string? technical = null)
    {
        var block = FormatBlock("ERROR", session, action, how, what: error, duration, technical);
        Write(ErrorFile, block);
        Write(ActivityFile, block);
    }

    public void LogSuccess(
        ClientSessionInfo session,
        string action,
        string how,
        string what,
        TimeSpan? duration)
    {
        var block = FormatBlock("SUCCESS", session, action, how, what, duration, technical: null);
        Write(ActivityFile, block);
    }

    private static string FormatBlock(
        string kind,
        ClientSessionInfo session,
        string action,
        string how,
        string what,
        TimeSpan? duration,
        string? technical)
    {
        var sb = new StringBuilder();
        sb.AppendLine("============================================================");
        sb.AppendLine(kind == "ERROR" ? "ERROR" : "SUCCESS");
        sb.AppendLine($"When: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        if (duration is not null)
            sb.AppendLine($"Duration: {FormatDuration(duration.Value)}");
        sb.AppendLine($"Who: {FormatWho(session)}");
        sb.AppendLine($"Company: {FormatNamed(session.CompanyName, session.CompanyId)}");
        sb.AppendLine($"Location: {FormatNamed(session.LocationName, session.LocationId)}");
        sb.AppendLine($"Page: {Blank(session.Page)}");
        sb.AppendLine($"Action: {Blank(string.IsNullOrWhiteSpace(action) ? session.Action : action)}");
        sb.AppendLine($"How: {Blank(how)}");
        sb.AppendLine(kind == "ERROR" ? $"What went wrong: {Blank(what)}" : $"What: {Blank(what)}");
        if (!string.IsNullOrWhiteSpace(technical) && !string.Equals(technical, what, StringComparison.Ordinal))
            sb.AppendLine($"Technical detail: {technical.Trim()}");
        sb.AppendLine("============================================================");
        sb.AppendLine();
        return sb.ToString();
    }

    private static string FormatWho(ClientSessionInfo s)
    {
        var user = string.IsNullOrWhiteSpace(s.SecurityUserName)
            ? $"UserId {s.SecurityUserId?.ToString() ?? "?"}"
            : $"{s.SecurityUserName} (UserId {s.SecurityUserId?.ToString() ?? "?"})";
        var emp = string.IsNullOrWhiteSpace(s.EmployeeName)
            ? $"EmployeeId {s.EmployeeId?.ToString() ?? "?"}"
            : $"{s.EmployeeName} (EmployeeId {s.EmployeeId?.ToString() ?? "?"})";
        return $"{user}; {emp}";
    }

    private static string FormatNamed(string? name, long? id)
    {
        if (string.IsNullOrWhiteSpace(name) && id is null) return "—";
        if (string.IsNullOrWhiteSpace(name)) return $"Id {id}";
        return id is null ? name : $"{name} (Id {id})";
    }

    private static string FormatDuration(TimeSpan duration)
    {
        if (duration.TotalSeconds < 1)
            return $"{Math.Max(1, (int)duration.TotalMilliseconds)} ms";
        return $"{duration.TotalSeconds:0.00} seconds";
    }

    private static string Blank(string? value)
        => string.IsNullOrWhiteSpace(value) ? "—" : value.Trim();

    private void Write(string path, string text)
    {
        lock (_gate)
        {
            try
            {
                Directory.CreateDirectory(LogDirectory);
                File.AppendAllText(path, text, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not write activity log {Path}", path);
            }
        }
    }

    internal static string ResolveDirectory(IWebHostEnvironment env, IConfiguration config)
    {
        var configured = config["ActivityLog:Directory"];
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured);

        var content = env.ContentRootPath;
        var candidates = new[]
        {
            // Published: PUBLISHES/BN → PUBLISHES/FN/logs
            Path.GetFullPath(Path.Combine(content, "..", "FN", "logs")),
            // Local: backend/PosApi → frontend/web/public/logs
            Path.GetFullPath(Path.Combine(content, "..", "..", "frontend", "web", "public", "logs")),
            // Local: bin/Debug/netX → frontend/web/public/logs
            Path.GetFullPath(Path.Combine(content, "..", "..", "..", "..", "frontend", "web", "public", "logs")),
            Path.GetFullPath(Path.Combine(content, "logs")),
        };

        foreach (var dir in candidates)
        {
            try
            {
                var parent = Directory.GetParent(dir);
                if (parent?.Exists == true)
                    return dir;
            }
            catch
            {
                // try next
            }
        }

        return Path.GetFullPath(Path.Combine(content, "logs"));
    }
}
