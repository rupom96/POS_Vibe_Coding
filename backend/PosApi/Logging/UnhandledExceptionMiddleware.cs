using System.Diagnostics;
using System.Text.Json;

namespace PosApi.Logging;

/// <summary>
/// Catches errors that controllers did not handle, writes logs, and returns a plain-language JSON message.
/// </summary>
public sealed class UnhandledExceptionMiddleware(
    RequestDelegate next,
    IAppActivityLogger logger,
    SqlUserFriendlyError friendlyError)
{
    public async Task Invoke(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            sw.Stop();
            if (context.Response.HasStarted)
                throw;

            var session = ClientSessionInfo.From(context.Request);
            var path = context.Request.Path.Value ?? "";
            var how = $"{context.Request.Method} {path}{context.Request.QueryString}";
            var action = string.IsNullOrWhiteSpace(session.Action) ? how : session.Action!;
            var userMessage = friendlyError.ToUserMessage(ex);
            logger.LogError(session, action, how, userMessage, sw.Elapsed, ex.ToString());

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json; charset=utf-8";
            var payload = JsonSerializer.Serialize(new { message = userMessage });
            await context.Response.WriteAsync(payload);
        }
    }
}
