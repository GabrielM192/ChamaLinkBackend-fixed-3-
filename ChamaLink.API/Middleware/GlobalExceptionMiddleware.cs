using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.API.Middleware;

// SECURITY FIX (audit 2.3/2.4: "catch (Exception) inatumika kila mahali" /
// "Hakuna global exception middleware"). This is NOT meant to replace the
// try/catch blocks already inside controllers - those still run first and
// still decide their own response for the cases they know about (e.g.
// UnauthorizedAccessException -> 401). This middleware is the SAFETY NET
// underneath all of that: anything that escapes uncaught (a report
// endpoint with no try/catch at all, a database error, a null reference,
// an out-of-memory during a big M-Koba import, etc.) used to reach the
// client as either a raw ASP.NET 500 page (which can leak stack traces
// and internal type/file names in Development) or, worse, get silently
// turned into a misleading "400 Bad Request" by a stray catch(Exception)
// somewhere upstream.
//
// Every response from here is a standard ProblemDetails-shaped JSON body
// plus an X-Correlation-Id header. The correlation ID is what ties a
// user's bug report ("nilipata error saa 10:03") to the specific log line
// with the full exception and stack trace - the client never sees that
// detail, only the ID.
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.TraceIdentifier;

        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex, correlationId);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception ex, string correlationId)
    {
        // If the response has already started streaming (e.g. partway
        // through a large report), we cannot change the status code or
        // body anymore - just log and stop, rather than throwing a
        // second "headers already sent" exception on top of the first.
        if (context.Response.HasStarted)
        {
            _logger.LogError(ex, "Unhandled exception after response had already started. CorrelationId={CorrelationId}", correlationId);
            return;
        }

        var (statusCode, title, publicMessage) = MapException(ex);

        // Full exception detail (type, message, stack trace) always goes
        // to the server-side structured log, tagged with the correlation
        // ID, the path, and the authenticated user if there is one -
        // never to the client.
        _logger.LogError(ex,
            "Unhandled exception. CorrelationId={CorrelationId} Path={Path} Method={Method} User={User} StatusCode={StatusCode}",
            correlationId, context.Request.Path, context.Request.Method,
            context.User?.Identity?.IsAuthenticated == true ? context.User.Identity!.Name : "anonymous",
            statusCode);

        context.Response.ContentType = "application/problem+json";
        context.Response.StatusCode = statusCode;

        var problem = new
        {
            type = $"https://httpstatuses.io/{statusCode}",
            title,
            status = statusCode,
            detail = publicMessage,
            correlationId,
            // Stack traces and raw exception messages are only ever
            // included outside the "detail" field, and only in
            // Development - never in a deployed/production environment.
            debug = _env.IsDevelopment() ? ex.ToString() : null
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
    }

    // Maps known exception types to a status code and a SAFE, generic
    // client-facing message. Anything not recognised falls through to a
    // plain 500 with no detail beyond "server error" - we never forward
    // ex.Message for unrecognised exceptions, since that is exactly how
    // database connection strings, table/column names, and file paths
    // used to leak to clients via the old catch(Exception) pattern.
    private static (int StatusCode, string Title, string Message) MapException(Exception ex) => ex switch
    {
        UnauthorizedAccessException => (
            (int)HttpStatusCode.Unauthorized,
            "Huna ruhusa",
            ex.Message),

        KeyNotFoundException => (
            (int)HttpStatusCode.NotFound,
            "Haikupatikana",
            ex.Message),

        // ArgumentException/InvalidOperationException are how services in
        // this codebase already raise business-rule errors with a
        // Swahili, user-safe message (e.g. "Huna fedha za kutosha
        // kikundi.") - that message is intentionally written to be shown
        // to the caller, so it is safe to forward as-is here too.
        ArgumentException or InvalidOperationException => (
            (int)HttpStatusCode.BadRequest,
            "Ombi halina ukamilifu",
            ex.Message),

        DbUpdateConcurrencyException => (
            (int)HttpStatusCode.Conflict,
            "Mgongano wa data",
            "Rekodi hii imebadilishwa na mtu/mchakato mwingine kabla yako. Tafadhali pakia upya na ujaribu tena."),

        DbUpdateException => (
            (int)HttpStatusCode.Conflict,
            "Hitilafu ya database",
            "Operesheni hii imeshindikana kwa sababu ya mgongano wa data (mfano: taarifa inayofanana tayari ipo)."),

        TaskCanceledException or OperationCanceledException => (
            499, // client closed request - non-standard but widely used
            "Ombi limesitishwa",
            "Ombi lilisitishwa kabla halijakamilika."),

        _ => (
            (int)HttpStatusCode.InternalServerError,
            "Hitilafu ya ndani ya mfumo",
            "Kuna hitilafu isiyotarajiwa upande wa server. Timu ya kiufundi imepokea taarifa hii; tafadhali jaribu tena baadaye.")
    };
}
