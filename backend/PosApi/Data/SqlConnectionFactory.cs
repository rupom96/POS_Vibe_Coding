using Microsoft.Data.SqlClient;

namespace PosApi.Data;

public interface IDbConnectionFactory
{
    SqlConnection CreateConnection();
}

public class SqlConnectionFactory(IConfiguration configuration) : IDbConnectionFactory
{
    private readonly string _connectionString = configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

    public SqlConnection CreateConnection() => new(_connectionString);
}
