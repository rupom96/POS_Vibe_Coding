using Microsoft.AspNetCore.Mvc;
using PosApi.Logging;

namespace PosApi.Controllers;

public sealed class ClientErrorLogRequest
{
    public string? Page { get; set; }
    public string? Action { get; set; }
    public string? How { get; set; }
    public string? Error { get; set; }
    public double? DurationMs { get; set; }
}

[ApiController]
[Route("api/logs")]
public class LogsController(IAppActivityLogger logger) : ControllerBase
{
    [HttpGet("where")]
    public IActionResult Where()
        => Ok(new
        {
            directory = logger.LogDirectory,
            errorsFile = "errors.log",
            activityFile = "activity.log",
        });

    [HttpPost("client-error")]
    public IActionResult ClientError([FromBody] ClientErrorLogRequest? body)
    {
        var session = ClientSessionInfo.From(Request);
        if (!string.IsNullOrWhiteSpace(body?.Page))
        {
            session = new ClientSessionInfo
            {
                SecurityUserId = session.SecurityUserId,
                SecurityUserName = session.SecurityUserName,
                LocationId = session.LocationId,
                LocationName = session.LocationName,
                CompanyId = session.CompanyId,
                CompanyName = session.CompanyName,
                EmployeeId = session.EmployeeId,
                EmployeeName = session.EmployeeName,
                Page = body.Page,
                Action = body.Action ?? session.Action,
            };
        }

        var duration = body?.DurationMs is > 0
            ? TimeSpan.FromMilliseconds(body.DurationMs.Value)
            : (TimeSpan?)null;
        logger.LogError(
            session,
            body?.Action ?? session.Action ?? "Frontend error",
            body?.How ?? "Browser / frontend",
            string.IsNullOrWhiteSpace(body?.Error) ? "Unknown frontend error." : body!.Error!,
            duration);
        return Ok(new { saved = true });
    }
}
