using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Dapper;
using Microsoft.IdentityModel.Tokens;
using PosApi.Data;
using PosApi.Security;

namespace PosApi.Endpoints;

// Issues JWTs based on SecurityUserName (from the frontend's appSession.json).
// BR2 bridge: /api/auth/br2-session validates AppAuth_Token and returns session + JWT.
public static class AuthEndpoints
{
    public record TokenRequest(string SecurityUserName, string Password, long CompanyId);

    private record UserCredRow(long SecurityUserId, string? Password);

    private record Br2SessionRow(
        long CompanyId,
        long LocationId,
        long UserId,
        string CompanyName,
        string LocationName,
        string SecurityUserName,
        long? EmployeeId,
        string EmployeeName);

    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapGet("/api/auth/br2-session", async (string? t, IConfiguration cfg, IDbConnectionFactory db) =>
        {
            if (string.IsNullOrWhiteSpace(t))
                return Results.Json(new { error = "Token (t) is required" }, statusCode: 400);

            using var conn = db.CreateConnection();
            var row = await conn.QueryFirstOrDefaultAsync<Br2SessionRow>("""
                SELECT
                    t.CompanyId,
                    t.LocationId,
                    t.UserId,
                    c.Name AS CompanyName,
                    l.Name AS LocationName,
                    su.UserName AS SecurityUserName,
                    su.EmployeeId,
                    ISNULL(e.Name, su.Name) AS EmployeeName
                FROM dbo.AppAuth_Token t
                INNER JOIN dbo.SecurityUser su ON su.SecurityUserId = t.UserId
                INNER JOIN dbo.Company c ON c.CompanyId = t.CompanyId
                INNER JOIN dbo.Location l ON l.LocationId = t.LocationId AND l.CompanyId = t.CompanyId
                LEFT JOIN dbo.Employee e ON e.EmployeeId = su.EmployeeId
                WHERE t.Token = @token
                  AND CONVERT(date, t.DateOfEntry) = CONVERT(date, GETDATE())
                """,
                new { token = t });

            if (row is null || row.CompanyId <= 0 || row.LocationId <= 0 || row.UserId <= 0)
                return Results.Json(new { error = "Invalid or expired BR2 session token" }, statusCode: 401);

            var jwt = IssueJwt(row.SecurityUserName, row.UserId, cfg);

            return Results.Ok(new
            {
                companyId = row.CompanyId,
                locationId = row.LocationId,
                securityUserId = row.UserId,
                employeeId = row.EmployeeId ?? 0,
                companyName = row.CompanyName,
                locationName = row.LocationName,
                securityUserName = row.SecurityUserName,
                employeeName = row.EmployeeName,
                access_token = jwt.token,
                token_type = "Bearer",
                expires_in = jwt.expiresIn,
            });
        }).WithTags("auth").WithSummary("Resolve BR2 AppAuth_Token into a POS session");

        app.MapPost("/api/auth/token", async (TokenRequest req, IConfiguration cfg, IDbConnectionFactory db) =>
        {
            if (string.IsNullOrWhiteSpace(req.SecurityUserName) || string.IsNullOrWhiteSpace(req.Password))
                return Results.Json(new { error = "securityUserName and password are required" }, statusCode: 401);
            if (req.CompanyId <= 0)
                return Results.Json(new { error = "companyId is required" }, statusCode: 401);

            using var conn = db.CreateConnection();
            // Fetch the encrypted password, then compare the DECRYPTED value to the raw input
            // (matches BR2's LogInManager: Decrypt(stored) == rawInput).
            var cred = await conn.QueryFirstOrDefaultAsync<UserCredRow>(
                "SELECT TOP 1 SecurityUserId, Password FROM dbo.SecurityUser WHERE Name = @name AND CompanyId = @companyId",
                new { name = req.SecurityUserName, companyId = req.CompanyId });
            if (cred is null)
                return Results.Json(new { error = "Unauthorized â€” user not found" }, statusCode: 401);

            var storedPassword = DbzEncryption.Decrypt(cred.Password)?.Trim();
            if (string.IsNullOrEmpty(storedPassword) || !storedPassword.Equals(req.Password.Trim()))
                return Results.Json(new { error = "Unauthorized â€” securityUserName / password not valid" }, statusCode: 401);

            var jwt = IssueJwt(req.SecurityUserName, cred.SecurityUserId, cfg);
            return Results.Ok(new
            {
                access_token = jwt.token,
                token_type = "Bearer",
                expires_in = jwt.expiresIn,
            });
        }).WithTags("auth").WithSummary("Get a JWT â€” validated by SecurityUserName");
    }

    private static (string token, int expiresIn) IssueJwt(string userName, long userId, IConfiguration cfg)
    {
        var jwtSection = cfg.GetSection("Jwt");
        var hours = int.TryParse(jwtSection["ExpiryHours"], out var h) ? h : 24;
        var keyBytes = Encoding.UTF8.GetBytes(
            jwtSection["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured."));
        var key = new SymmetricSecurityKey(keyBytes);
        var token = new JwtSecurityToken(
            issuer: jwtSection["Issuer"],
            audience: jwtSection["Audience"],
            claims:
            [
                new Claim(ClaimTypes.Name, userName),
                new Claim("securityUserId", userId.ToString()),
            ],
            expires: DateTime.UtcNow.AddHours(hours),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), hours * 3600);
    }
}
