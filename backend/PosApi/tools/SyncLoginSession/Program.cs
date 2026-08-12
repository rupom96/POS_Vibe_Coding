using System.Text.Json;
using Microsoft.Data.SqlClient;

const long securityUserId = 1;
const string preferredCompanyName = "Databiz Software Ltd";
const string preferredLocationName = "Head Office";

var appsettingsPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "appsettings.json"));
if (!File.Exists(appsettingsPath))
    appsettingsPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json"));
if (!File.Exists(appsettingsPath))
    appsettingsPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "appsettings.json"));
if (!File.Exists(appsettingsPath))
    appsettingsPath = @"E:\Vibe Coding\BR Vibings\backend\PosApi\appsettings.json";
if (!File.Exists(appsettingsPath))
    throw new FileNotFoundException("appsettings.json not found.", appsettingsPath);

using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(appsettingsPath));
var connStr = doc.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString()
    ?? throw new InvalidOperationException("Connection string not found.");

await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();
Console.WriteLine($"Connected: {conn.Database}");

var userTable = await FindTableAsync(conn, "Security_User", "SecurityUser", "SecurityUsers", "Users");
var companyTable = await FindTableAsync(conn, "Company");
var locationTable = await FindTableAsync(conn, "Location");
var employeeTable = await FindTableAsync(conn, "Employee");

if (userTable is null)
    throw new InvalidOperationException("Security user table not found in database.");
if (companyTable is null)
    throw new InvalidOperationException("Company table not found in database.");
if (locationTable is null)
    throw new InvalidOperationException("Location table not found in database.");

var userIdCol = await PickColumnAsync(conn, userTable, "SecurityUserId", "UserId", "Id");
var userNameCol = await PickColumnAsync(conn, userTable, "UserName", "SecurityUserName", "Name", "LoginName");
var userEmployeeCol = await PickColumnAsync(conn, userTable, "EmployeeId");
var companyIdCol = await PickColumnAsync(conn, companyTable, "CompanyId", "Id");
var companyNameCol = await PickColumnAsync(conn, companyTable, "CompanyName", "Name");
var locationIdCol = await PickColumnAsync(conn, locationTable, "LocationId", "Id");
var locationNameCol = await PickColumnAsync(conn, locationTable, "LocationName", "Name");
var locationCompanyCol = await PickColumnAsync(conn, locationTable, "CompanyId");
var employeeNameCol = employeeTable is null
    ? null
    : await PickColumnAsync(conn, employeeTable, "EmployeeName", "Name");

if (userIdCol is null || userNameCol is null || userEmployeeCol is null)
    throw new InvalidOperationException($"Required columns not found on {userTable}.");
if (companyIdCol is null || companyNameCol is null)
    throw new InvalidOperationException($"Required columns not found on {companyTable}.");
if (locationIdCol is null || locationNameCol is null)
    throw new InvalidOperationException($"Required columns not found on {locationTable}.");

var company = await ResolveByNameAsync(conn, companyTable, companyIdCol, companyNameCol, preferredCompanyName)
    ?? throw new InvalidOperationException($"Company matching '{preferredCompanyName}' not found.");

var locationFilter = locationCompanyCol is null
    ? ""
    : $" AND [{locationCompanyCol}] = @CompanyId";
await using (var locCmd = conn.CreateCommand())
{
    locCmd.CommandText = $"""
        SELECT TOP 1 [{locationIdCol}] AS Id, [{locationNameCol}] AS Name
        FROM [{locationTable}]
        WHERE REPLACE([{locationNameCol}], ' ', '') LIKE REPLACE(@Preferred, ' ', '')
           OR [{locationNameCol}] LIKE @PreferredLike
        {locationFilter}
        ORDER BY
            CASE WHEN REPLACE([{locationNameCol}], ' ', '') LIKE REPLACE(@Preferred, ' ', '') THEN 0 ELSE 1 END,
            [{locationIdCol}]
        """;
    locCmd.Parameters.AddWithValue("@Preferred", preferredLocationName);
    locCmd.Parameters.AddWithValue("@PreferredLike", $"%{preferredLocationName}%");
    locCmd.Parameters.AddWithValue("@CompanyId", company.Id);

    await using var locReader = await locCmd.ExecuteReaderAsync();
    if (!await locReader.ReadAsync())
        throw new InvalidOperationException(
            $"Location matching '{preferredLocationName}' not found for company '{company.Name}' (Id={company.Id}).");

    var locationId = Convert.ToInt64(locReader["Id"]);
    var locationName = Convert.ToString(locReader["Name"]) ?? preferredLocationName;
    await locReader.CloseAsync();

    await using var cmd = conn.CreateCommand();
    cmd.CommandText = $"""
        SELECT
            su.[{userEmployeeCol}] AS EmployeeId,
            su.[{userNameCol}] AS SecurityUserName,
            {(employeeTable is not null && employeeNameCol is not null ? $"e.[{employeeNameCol}]" : "CAST(NULL AS NVARCHAR(200))")} AS EmployeeName
        FROM [{userTable}] su
        {(employeeTable is not null ? $"LEFT JOIN [{employeeTable}] e ON e.EmployeeId = su.[{userEmployeeCol}]" : "")}
        WHERE su.[{userIdCol}] = @SecurityUserId
        """;
    cmd.Parameters.AddWithValue("@SecurityUserId", securityUserId);

    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync())
        throw new InvalidOperationException($"Security user {securityUserId} not found.");

    var employeeId = Convert.ToInt64(reader["EmployeeId"]);
    var session = new
    {
        companyId = company.Id,
        companyName = company.Name,
        locationId,
        locationName,
        securityUserId,
        securityUserName = Convert.ToString(reader["SecurityUserName"]) ?? string.Empty,
        employeeId,
        employeeName = reader.IsDBNull(reader.GetOrdinal("EmployeeName"))
            ? string.Empty
            : reader.GetString(reader.GetOrdinal("EmployeeName")),
    };

    var outputPath = @"E:\Vibe Coding\BR Vibings\frontend\web\public\StaticLoginSession.json";
    var outputDir = Path.GetDirectoryName(outputPath);
    if (outputDir is null || !Directory.Exists(outputDir))
    {
        outputPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", "frontend", "web", "public", "StaticLoginSession.json"));
    }

    var json = JsonSerializer.Serialize(session, new JsonSerializerOptions { WriteIndented = true });
    await File.WriteAllTextAsync(outputPath, $"{json}{Environment.NewLine}");

    Console.WriteLine($"Wrote {outputPath}");
    Console.WriteLine(json);
    Console.WriteLine($"Resolved companyId={company.Id}, locationId={locationId}");
}

static async Task<(long Id, string Name)?> ResolveByNameAsync(
    SqlConnection conn,
    string table,
    string idCol,
    string nameCol,
    string preferredName)
{
    await using var cmd = conn.CreateCommand();
    cmd.CommandText = $"""
        SELECT TOP 1 [{idCol}] AS Id, [{nameCol}] AS Name
        FROM [{table}]
        WHERE REPLACE([{nameCol}], ' ', '') LIKE REPLACE(@Preferred, ' ', '')
           OR [{nameCol}] LIKE @PreferredLike
        ORDER BY
            CASE WHEN REPLACE([{nameCol}], ' ', '') LIKE REPLACE(@Preferred, ' ', '') THEN 0 ELSE 1 END,
            [{idCol}]
        """;
    cmd.Parameters.AddWithValue("@Preferred", preferredName);
    cmd.Parameters.AddWithValue("@PreferredLike", $"%{preferredName}%");

    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync())
        return null;

    return (Convert.ToInt64(reader["Id"]), Convert.ToString(reader["Name"]) ?? preferredName);
}

static async Task<string?> FindTableAsync(SqlConnection conn, params string[] candidates)
{
    foreach (var table in candidates)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT 1
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = @Table
            """;
        cmd.Parameters.AddWithValue("@Table", table);
        var exists = await cmd.ExecuteScalarAsync();
        if (exists is not null) return table;
    }

    return null;
}

static async Task<string?> PickColumnAsync(SqlConnection conn, string table, params string[] candidates)
{
    foreach (var column in candidates)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT 1
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @Table AND COLUMN_NAME = @Column
            """;
        cmd.Parameters.AddWithValue("@Table", table);
        cmd.Parameters.AddWithValue("@Column", column);
        var exists = await cmd.ExecuteScalarAsync();
        if (exists is not null) return column;
    }

    return null;
}
