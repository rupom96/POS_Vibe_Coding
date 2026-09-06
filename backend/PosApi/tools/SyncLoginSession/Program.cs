using System.Text.Json;
using Microsoft.Data.SqlClient;

const long securityUserId = 20240;

static string FindRepoRoot()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir is not null)
    {
        if (File.Exists(Path.Combine(dir.FullName, "backend", "PosApi", "appsettings.json")))
            return dir.FullName;
        dir = dir.Parent;
    }

    throw new DirectoryNotFoundException("Could not locate repo root (backend/PosApi/appsettings.json).");
}

var repoRoot = FindRepoRoot();
var appsettingsPath = Path.Combine(repoRoot, "backend", "PosApi", "appsettings.json");

using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(appsettingsPath));
var connStr = doc.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString()
    ?? throw new InvalidOperationException("Connection string not found.");

await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();
Console.WriteLine($"Connected: {conn.Database}");

await using var cmd = conn.CreateCommand();
cmd.CommandText = """
    SELECT TOP 1
        su.SecurityUserId,
        su.UserName AS SecurityUserName,
        su.EmployeeId,
        su.CompanyId,
        c.Name AS CompanyName,
        ISNULL(e.Name, su.Name) AS EmployeeName,
        loc.LocationId,
        loc.Name AS LocationName
    FROM SecurityUser su
    INNER JOIN Company c ON c.CompanyId = su.CompanyId
    LEFT JOIN Employee e ON e.EmployeeId = su.EmployeeId
    OUTER APPLY (
        SELECT TOP 1 l.LocationId, l.Name
        FROM Location l
        WHERE l.CompanyId = su.CompanyId
        ORDER BY l.LocationId
    ) loc
    WHERE su.SecurityUserId = @SecurityUserId
    """;
cmd.Parameters.AddWithValue("@SecurityUserId", securityUserId);

await using var reader = await cmd.ExecuteReaderAsync();
if (!await reader.ReadAsync())
    throw new InvalidOperationException($"Security user {securityUserId} not found.");

var locationId = reader["LocationId"] is DBNull ? 0L : Convert.ToInt64(reader["LocationId"]);
if (locationId <= 0)
    throw new InvalidOperationException($"No location found for security user {securityUserId} company.");

var session = new
{
    companyId = Convert.ToInt64(reader["CompanyId"]),
    companyName = Convert.ToString(reader["CompanyName"]) ?? string.Empty,
    locationId,
    locationName = Convert.ToString(reader["LocationName"]) ?? string.Empty,
    securityUserId,
    securityUserName = Convert.ToString(reader["SecurityUserName"]) ?? string.Empty,
    employeeId = reader["EmployeeId"] is DBNull ? 0L : Convert.ToInt64(reader["EmployeeId"]),
    employeeName = Convert.ToString(reader["EmployeeName"]) ?? string.Empty,
};

var json = JsonSerializer.Serialize(session, new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine;

var outputPaths = new[]
{
    Path.Combine(repoRoot, "frontend", "web", "public", "StaticLoginSession.json"),
    Path.Combine(repoRoot, "backend", "PosApi", "wwwroot", "StaticLoginSession.json"),
};

foreach (var outputPath in outputPaths)
{
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
    await File.WriteAllTextAsync(outputPath, json);
    Console.WriteLine($"Wrote {outputPath}");
}

Console.WriteLine(json.Trim());
