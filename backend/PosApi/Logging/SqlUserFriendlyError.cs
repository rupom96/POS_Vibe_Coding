using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using PosApi.Data;

namespace PosApi.Logging;

/// <summary>
/// Turns technical SQL / system errors into plain-language messages for non-technical users.
/// Does not change how data is saved — only how failures are explained.
/// </summary>
public sealed class SqlUserFriendlyError(IDbConnectionFactory db)
{
    private static readonly Regex TruncationTableColumn = new(
        @"truncated in table '(?<table>[^']+)', column '(?<column>[^']+)'",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex TruncationValue = new(
        @"Truncated value:\s*'(?<value>.*)'\.?\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.Singleline);

    public string ToUserMessage(Exception ex)
    {
        var sql = FindSqlException(ex);
        if (sql is not null)
            return FromSqlException(sql);

        var text = ex.Message ?? "";
        if (text.Contains("truncated", StringComparison.OrdinalIgnoreCase))
            return FromTruncationMessage(text, sqlException: null);

        if (string.IsNullOrWhiteSpace(text))
            return "Something went wrong. Please try again. If it continues, contact support.";

        // Business-rule messages (InvalidOperationException etc.) are already written for users.
        if (ex is InvalidOperationException or ArgumentException)
            return text.Trim();

        return "Something went wrong while saving or loading data. Please try again. "
            + "If it continues, contact support and share the errors.log file.";
    }

    private static SqlException? FindSqlException(Exception ex)
    {
        for (var cur = ex; cur is not null; cur = cur.InnerException)
        {
            if (cur is SqlException sql)
                return sql;
        }
        return null;
    }

    private string FromSqlException(SqlException sql)
    {
        return sql.Number switch
        {
            8152 or 2628 => FromTruncationMessage(sql.Message, sql),
            515 => "A required field is empty. Please fill in all required boxes and try again.",
            547 => "This record is linked to other data, so it cannot be saved or removed in this way. Please check related information and try again.",
            2601 or 2627 => "This value already exists. Please use a different one and try again.",
            1205 => "The system was busy with another save at the same time. Please try again.",
            -2 or -1 => "The database took too long to respond. Please try again in a moment.",
            53 or 2 or 4060 or 18456 => "Could not connect to the database. Please check the network or contact support.",
            208 => "A required database table was not found. Please contact support.",
            207 => "A required database column was not found. Please contact support.",
            _ => FromTruncationMessage(sql.Message, sql),
        };
    }

    private string FromTruncationMessage(string message, SqlException? sqlException)
    {
        if (string.IsNullOrWhiteSpace(message)
            || !message.Contains("truncated", StringComparison.OrdinalIgnoreCase))
        {
            if (sqlException is not null && sqlException.Number is not 8152 and not 2628)
            {
                return "The database could not complete this action. Please try again. "
                    + "If it continues, contact support and share the errors.log file.";
            }
        }

        var tableMatch = TruncationTableColumn.Match(message);
        var valueMatch = TruncationValue.Match(message);
        var table = tableMatch.Success ? LastName(tableMatch.Groups["table"].Value) : null;
        var column = tableMatch.Success ? tableMatch.Groups["column"].Value : null;
        var attempted = valueMatch.Success ? valueMatch.Groups["value"].Value : null;
        var attemptedLen = attempted?.Length;

        int? maxLen = null;
        if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column))
            maxLen = TryGetMaxLength(table, column);

        if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column) && maxLen is > 0 && attemptedLen is > 0)
        {
            return $"In {table} table, maximum character length in {column} column is {maxLen}, "
                + $"but you are trying to insert {attemptedLen}.";
        }

        if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column) && maxLen is > 0)
        {
            return $"In {table} table, maximum character length in {column} column is {maxLen}, "
                + "but the value you entered is longer than that. Please shorten it and try again.";
        }

        if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column) && attemptedLen is > 0)
        {
            return $"In {table} table, the {column} column is too short for the value you entered "
                + $"({attemptedLen} characters). Please shorten it and try again.";
        }

        if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column))
        {
            return $"In {table} table, the text for {column} is longer than the database allows. "
                + "Please shorten it and try again.";
        }

        return "The text you entered is longer than the database allows for one of the fields. "
            + "Please shorten it and try again.";
    }

    private static string LastName(string dotted)
    {
        var parts = dotted.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0 ? dotted : parts[^1].Trim('[', ']');
    }

    private int? TryGetMaxLength(string table, string column)
    {
        try
        {
            using var conn = db.CreateConnection();
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @Table AND COLUMN_NAME = @Column
                """;
            cmd.CommandTimeout = 5;
            AddParam(cmd, "@Table", table);
            AddParam(cmd, "@Column", column);
            var raw = cmd.ExecuteScalar();
            if (raw is null or DBNull) return null;
            var n = Convert.ToInt32(raw);
            return n > 0 ? n : null;
        }
        catch
        {
            return null;
        }
    }

    private static void AddParam(IDbCommand cmd, string name, string value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
    }
}
