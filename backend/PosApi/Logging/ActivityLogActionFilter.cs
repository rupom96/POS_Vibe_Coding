using System.Diagnostics;
using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using PosApi.Models.Dtos;

namespace PosApi.Logging;

/// <summary>
/// After each API action: log errors, and log successful create/update/delete.
/// Does not change action results except leaving them as the controller produced them.
/// </summary>
public sealed class ActivityLogActionFilter(IAppActivityLogger logger) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var path = context.HttpContext.Request.Path.Value ?? "";
        if (path.StartsWith("/api/logs", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        var sw = Stopwatch.StartNew();
        var executed = await next();
        sw.Stop();

        var session = ClientSessionInfo.From(context.HttpContext.Request);
        var method = context.HttpContext.Request.Method;
        var how = $"{method} {path}{context.HttpContext.Request.QueryString}";
        var action = string.IsNullOrWhiteSpace(session.Action)
            ? DescribeAction(method, path)
            : session.Action!;
        var status = context.HttpContext.Response.StatusCode;
        if (executed.Result is ObjectResult obj && obj.StatusCode is int objCode)
            status = objCode;
        else if (executed.Result is StatusCodeResult statusResult)
            status = statusResult.StatusCode;

        if (status == 404 && HttpMethods.IsGet(method))
            return;

        if (status >= 400)
        {
            var message = ReadMessage(executed.Result) ?? $"Request failed (code {status}).";
            logger.LogError(session, action, how, message, sw.Elapsed);
            return;
        }

        if (!IsMutation(method))
            return;

        if (status is >= 200 and < 300)
        {
            var what = DescribeSuccess(method, path, executed.Result);
            logger.LogSuccess(session, action, how, what, sw.Elapsed);
        }
    }

    private static bool IsMutation(string method)
        => method is "POST" or "PUT" or "PATCH" or "DELETE";

    private static string DescribeAction(string method, string path)
    {
        if (path.Contains("/pos/save", StringComparison.OrdinalIgnoreCase))
            return "Save Invoice";
        if (path.Contains("/customers", StringComparison.OrdinalIgnoreCase) && method == "POST")
            return "Create Customer";
        return $"{method} {path}";
    }

    private static string DescribeSuccess(string method, string path, IActionResult? result)
    {
        var value = result is ObjectResult obj ? obj.Value : null;

        if (value is SaveInvoiceResponse save)
        {
            var verb = string.IsNullOrWhiteSpace(save.Message) ? "Saved" : save.Message.Trim().TrimEnd('.');
            return $"{verb}. Invoice {save.InvoiceNo} (Sales order {save.SalesOrderNo}).";
        }

        if (value is CustomerDto customer)
            return $"Created customer {customer.Name} (BuyerId {customer.BuyerId}).";

        var kind = method switch
        {
            "POST" => "Created or saved data",
            "PUT" or "PATCH" => "Updated data",
            "DELETE" => "Deleted data",
            _ => "Completed",
        };
        return $"{kind} from {path}.";
    }

    private static string? ReadMessage(IActionResult? result)
    {
        if (result is not ObjectResult { Value: not null } obj)
            return null;
        var value = obj.Value;
        var type = value.GetType();
        var prop = type.GetProperty("message", BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        if (prop?.GetValue(value) is string text && !string.IsNullOrWhiteSpace(text))
            return text;
        return value.ToString();
    }
}
