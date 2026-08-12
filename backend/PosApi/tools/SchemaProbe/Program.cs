using System.Text.Json;
using Microsoft.Data.SqlClient;

var appsettingsPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "appsettings.json"));
if (!File.Exists(appsettingsPath))
    appsettingsPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "appsettings.json"));

using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(appsettingsPath));
var connStr = doc.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString()
    ?? throw new InvalidOperationException("Connection string not found.");

await using var conn = new SqlConnection(connStr);
await conn.OpenAsync();

var tables = new[]
{
    "SalesOrder", "SalesOrderDetail", "SalesDetail", "SalesOrderDetail_Tax", "Tax",
    "Collection", "Collection_Invoice", "BankExpense", "ChequeDetail", "SalesOrder_POS",
    "InvoiceNo", "CollectionNo", "SalesOrderNo"
};

foreach (var table in tables)
{
    Console.WriteLine($"\n=== {table} ===");
    await using var cmd = conn.CreateCommand();
    cmd.CommandText = """
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @Table
        ORDER BY ORDINAL_POSITION
        """;
    cmd.Parameters.AddWithValue("@Table", table);
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
        Console.WriteLine($"{r.GetString(0),-35} {r.GetString(1),-12} {r.GetString(2)}");
}

Console.WriteLine("\n=== Tax sample ===");
await using (var cmd = conn.CreateCommand())
{
    cmd.CommandText = "SELECT TOP 10 TaxId, TaxName FROM Tax ORDER BY TaxId";
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
        Console.WriteLine($"{r.GetValue(0)} | {r.GetValue(1)}");
}

Console.WriteLine("\n=== Recent Collection_Invoice ===");
await using (var cmd = conn.CreateCommand())
{
    cmd.CommandText = """
        SELECT TOP 3 ci.InvoiceNoM, ci.CollectedAmount, ci.SalesOrderId, c.CollectionModeId, pm.Name
        FROM Collection_Invoice ci
        INNER JOIN Collection c ON c.CollectionId = ci.CollectionId
        LEFT JOIN PaymentMode pm ON pm.PaymentModeId = c.CollectionModeId
        ORDER BY ci.DateOfEntry DESC
        """;
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
    {
        for (var i = 0; i < r.FieldCount; i++) Console.Write($"{r.GetValue(i)} | ");
        Console.WriteLine();
    }
}

Console.WriteLine("\n=== Recent SalesDetail ===");
await using (var cmd = conn.CreateCommand())
{
    cmd.CommandText = "SELECT TOP 3 SerialNo, SalesOrderDetailId FROM SalesDetail ORDER BY DateOfEntry DESC";
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
        Console.WriteLine($"{r.GetValue(0)} | {r.GetValue(1)}");
}

Console.WriteLine("\n=== Card Collection ChequeDetail ===");
await using (var cmd = conn.CreateCommand())
{
    cmd.CommandText = """
        SELECT TOP 3 pm.Name, cd.ChequeNo, cd.BankId, cd.ChequeAmount, cd.CardType, cd.CreditCardChargeP, cd.POSMachineBankId
        FROM Collection c
        INNER JOIN PaymentMode pm ON pm.PaymentModeId = c.CollectionModeId
        INNER JOIN ChequeDetail cd ON cd.CollectionId = c.CollectionId
        WHERE pm.Name LIKE '%Card%' OR cd.CardType IS NOT NULL
        ORDER BY cd.Dateofentry DESC
        """;
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
    {
        for (var i = 0; i < r.FieldCount; i++) Console.Write($"{r.GetValue(i)} | ");
        Console.WriteLine();
    }
}

await using (var cmd = conn.CreateCommand())
{
    cmd.CommandText = """
        SELECT TOP 6 t.TaxName, dt.TaxAmount, dt.SalesOrderDetailId
        FROM SalesOrderDetail_Tax dt
        INNER JOIN Tax t ON t.TaxId = dt.TaxId
        ORDER BY dt.DateOfEntry DESC
        """;
    await using var r = await cmd.ExecuteReaderAsync();
    while (await r.ReadAsync())
        Console.WriteLine($"{r.GetValue(0)} | {r.GetValue(1)} | {r.GetValue(2)}");
}
