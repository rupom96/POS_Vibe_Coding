using System.Data;
using System.Globalization;
using System.Net;
using System.Text;
using Dapper;
using Microsoft.Data.SqlClient;
using PosApi.Data;

namespace PosApi.Services;

/// <summary>
/// Port of BR2 Notification_Config.SandInvoiceNotification / _SendSMSP for POS invoice SMS.
/// </summary>
public interface IInvoiceNotificationService
{
    /// <summary>
    /// Same gate as PosSalesController: Company.SmsApi set and Buyer.GetSMS = 'Y'.
    /// Then runs SandInvoiceNotification for "SalesInvoice" and "SalesInvoiceSMS".
    /// </summary>
    Task TrySendNewInvoiceSmsAsync(long companyId, long buyerId, string invoiceNo);

    Task<string> SandInvoiceNotificationAsync(string description, long companyId, string valueParm, long id = 0);
}

public class InvoiceNotificationService(IDbConnectionFactory db, IHttpClientFactory httpClientFactory, ILogger<InvoiceNotificationService> logger)
    : IInvoiceNotificationService
{
    public async Task TrySendNewInvoiceSmsAsync(long companyId, long buyerId, string invoiceNo)
    {
        if (companyId <= 0 || buyerId <= 0 || string.IsNullOrWhiteSpace(invoiceNo))
            return;

        try
        {
            using var conn = db.CreateConnection();
            var gate = await conn.QueryFirstOrDefaultAsync<(string? GetSMS, string? SmsApi)>(
                """
                SELECT TOP 1 b.GetSMS, c.SmsApi
                FROM Buyer b
                INNER JOIN Company c ON c.CompanyId = b.CompanyId
                WHERE b.BuyerId = @BuyerId AND c.CompanyId = @CompanyId
                """,
                new { BuyerId = buyerId, CompanyId = companyId });

            // BR2: if (smsCheckForBuyer.SMSApi != null && smsCheckForBuyer.GetSMS == "Y")
            if (string.IsNullOrWhiteSpace(gate.SmsApi)
                || !string.Equals(gate.GetSMS, "Y", StringComparison.OrdinalIgnoreCase))
                return;

            await SandInvoiceNotificationAsync("SalesInvoice", companyId, invoiceNo, buyerId);
            await SandInvoiceNotificationAsync("SalesInvoiceSMS", companyId, invoiceNo, buyerId);
        }
        catch (Exception ex)
        {
            // Never fail the POS save because SMS failed (BR2 also keeps save success when SMS errors are soft).
            logger.LogWarning(ex, "POS invoice SMS failed for InvoiceNo {InvoiceNo}, BuyerId {BuyerId}", invoiceNo, buyerId);
        }
    }

    public async Task<string> SandInvoiceNotificationAsync(string description, long companyId, string valueParm, long id = 0)
    {
        using var conn = db.CreateConnection();
        await conn.OpenAsync();

        var config = await conn.QueryFirstOrDefaultAsync<NotificationConfigurationRow>(
            """
            SELECT TOP 1
                NotificationConfigurationId,
                Description,
                Mode,
                TablesWithJoiningDetail,
                FixedParameter,
                SpecificParameter,
                NotificationToParameter,
                NotificationToGroup,
                SMSTemplate,
                MailTemplate,
                PopUpTemplate,
                CompanyId,
                EmailSubject
            FROM NotificationConfiguration
            WHERE Description = @Description
            """,
            new { Description = description });

        if (config is null)
            return string.Empty;

        var receivers = await GetReceiversAsync(conn, config, id);
        var template = await GenerateVoucherDescriptionAsync(conn, config, valueParm);
        if (string.IsNullOrWhiteSpace(template))
            return string.Empty;

        var sendInfo = string.Empty;
        var mode = (config.Mode ?? string.Empty).Trim().ToLowerInvariant();
        var smsSent = false;

        foreach (var phoneNo in receivers.Where(p => !string.IsNullOrWhiteSpace(p)))
        {
            if (mode == "sms")
            {
                // BR2 sends only the first SMS receiver.
                if (smsSent)
                    continue;

                sendInfo = await SendSmsPAsync(conn, phoneNo, template, companyId);
                await SaveDataToLogAsync(conn, phoneNo, null, template, companyId, config.NotificationConfigurationId);
                smsSent = true;
            }
            else if (mode == "email" && !string.IsNullOrWhiteSpace(config.SMSTemplate))
            {
                // Email path exists in BR2; POS gate currently only needs SMS. Skip sending mail here.
                logger.LogInformation(
                    "Skipping email notification {Description} for {Receiver} (SMS-only port).",
                    description,
                    phoneNo);
            }
        }

        return sendInfo;
    }

    private async Task<string?> GenerateVoucherDescriptionAsync(
        SqlConnection conn,
        NotificationConfigurationRow config,
        string? valueParm)
    {
        var sql = config.TablesWithJoiningDetail ?? string.Empty;
        if (sql.Contains("where", StringComparison.OrdinalIgnoreCase))
        {
            // BR2: SQL += FixedParameter + "'" + value_parm + "'"
            sql += " " + (string.IsNullOrEmpty(config.FixedParameter) ? " " : config.FixedParameter)
                + "'" + (valueParm ?? string.Empty).Replace("'", "''") + "'";
        }

        var pivot = (await GetDataSqlAsync(conn, sql)).FirstOrDefault();
        if (pivot is null)
            return null;

        var mode = (config.Mode ?? string.Empty).Trim().ToLowerInvariant();
        if ((mode == "sms" && string.IsNullOrEmpty(config.SMSTemplate))
            || (mode == "email" && string.IsNullOrEmpty(config.MailTemplate)))
        {
            var fromSp = pivot.SpGenarateSMS ?? string.Empty;
            return string.IsNullOrEmpty(fromSp) ? null : fromSp;
        }

        var description = mode == "sms"
            ? (config.SMSTemplate ?? string.Empty)
            : mode == "email"
                ? (config.MailTemplate ?? string.Empty)
                : string.Empty;

        var temp = description.Split('#');
        string? replaceString = null;
        var strTemp = new string[3000];
        strTemp[0] = string.Empty;
        var j = 0;

        for (var i = 0; i < temp.Length; i++)
        {
            var words = temp[i];
            if (words == string.Empty)
                strTemp[j] += " ";

            var hasNumbers = words.Any(char.IsDigit);
            if (words != string.Empty && !hasNumbers)
                replaceString += temp[i] + " ";

            if (words != string.Empty && hasNumbers)
            {
                if (!int.TryParse(words, NumberStyles.Integer, CultureInfo.InvariantCulture, out var tagId))
                    continue;

                var tag = await conn.QueryFirstOrDefaultAsync<(int BiznessEventNoTagId, string? TagShortName)>(
                    """
                    SELECT TOP 1 BiznessEventNoTagId, TagShortName
                    FROM BiznessEventNoTag
                    WHERE BiznessEventNoTagId = @Id
                    """,
                    new { Id = tagId });

                if (tag.TagShortName is null)
                    continue;

                var shortName = tag.TagShortName.Trim();
                replaceString += shortName switch
                {
                    "COMPANY" => (pivot.COMPANY ?? string.Empty) + " ",
                    "LOCATION" => (pivot.LOCATION ?? string.Empty) + " ",
                    "INITIAL" => (pivot.INITIAL ?? string.Empty) + " ",
                    "USER" => (pivot.USER ?? string.Empty) + " ",
                    "S_PERSON" => (pivot.S_PERSON ?? string.Empty) + " ",
                    "Buyer" => (pivot.Buyer ?? string.Empty) + " ",
                    "Supplier" => (pivot.Supplier ?? string.Empty) + " ",
                    "Collection" => (pivot.Collection ?? string.Empty) + " ",
                    "Against" => (pivot.Against ?? string.Empty) + " ",
                    "Amount" => (pivot.Amount ?? string.Empty) + " ",
                    "Cheque" => (pivot.Cheque ?? string.Empty) + " ",
                    "Payment" => (pivot.Payment ?? string.Empty) + " ",
                    "Sales" => (pivot.Sales ?? string.Empty) + " ",
                    "Mode" => (pivot.Mode ?? string.Empty) + " ",
                    "Employee" => (pivot.Employee ?? string.Empty) + " ",
                    "Purchase" => (pivot.Purchase ?? string.Empty) + " ",
                    "PReturn" => (pivot.PReturn ?? string.Empty) + " ",
                    "SReturn" => (pivot.SReturn ?? string.Empty) + " ",
                    "LedgerAdjustment" => (pivot.LedgerAdjustment ?? string.Empty) + " ",
                    "PartyLedgerAdjustment" => (pivot.PartyLedgerAdjustment ?? string.Empty) + " ",
                    "CreditNoteRequisition" => (pivot.CreditNoteRequisition ?? string.Empty) + " ",
                    "TT" => (pivot.TT ?? string.Empty) + " ",
                    "ReplcementIn" => (pivot.ReplcementIn ?? string.Empty) + " ",
                    "CarrierNo" => (pivot.CarrierNo ?? string.Empty) + " ",
                    "ProductName" => (pivot.ProductName ?? string.Empty) + " ",
                    "InvoiceDate" => FormatInvoiceDate(pivot.InvoiceDate) + " ",
                    "ChallanNo" => (pivot.ChallanNo ?? string.Empty) + " ",
                    _ => string.Empty,
                };
            }
        }

        return replaceString;
    }

    private static string FormatInvoiceDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return string.Empty;
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
            || DateTime.TryParse(raw, out dt)
            ? dt.ToString("dd-MMM-yyyy", CultureInfo.InvariantCulture)
            : raw;
    }

    private async Task<List<string>> GetReceiversAsync(
        SqlConnection conn,
        NotificationConfigurationRow config,
        long id)
    {
        var receivers = (await conn.QueryAsync<NotificationReceiverRow>(
            """
            SELECT NotificationReceiverId, NotificationId, ReceiverIndividual
            FROM NotificationReceiver
            WHERE NotificationId = @NotificationId
            """,
            new { NotificationId = config.NotificationConfigurationId })).ToList();

        if (receivers.Count == 0)
            return [];

        var receiverIds = string.Join(",", receivers
            .Select(r => r.ReceiverIndividual)
            .Where(s => !string.IsNullOrWhiteSpace(s)));

        if (string.IsNullOrWhiteSpace(receiverIds))
            return [];

        var group = (config.NotificationToGroup ?? string.Empty).Trim().ToLowerInvariant();
        var mode = (config.Mode ?? string.Empty).Trim().ToLowerInvariant();
        string? sql = null;

        if (group == "employee" && mode == "email")
        {
            sql = $"SELECT Name, email, EmployeeId, GetSMS FROM Employee WHERE EmployeeId in ({receiverIds})";
        }
        else if (group == "employee" && mode == "sms")
        {
            sql = $"""
                SELECT emp.Name, su.Phone, emp.EmployeeId, CAST(NULL AS nvarchar(1)) AS GetSMS
                FROM Employee emp
                JOIN SecurityUser su ON su.EmployeeId = emp.EmployeeId
                WHERE emp.EmployeeId in ({receiverIds})
                """;
        }
        else if (group is "buyer" or "supplier")
        {
            // BR2: WHERE {Group}Id = (id) — buyer/supplier SMS/email use the passed party id.
            var returnParam = mode == "sms"
                ? "Name, phone, " + config.NotificationToGroup + "Id, GetSMS"
                : "Name, email, " + config.NotificationToGroup + "Id, GetSMS";
            sql = $"SELECT {returnParam} FROM {config.NotificationToGroup} WHERE {config.NotificationToGroup}Id = ({id})";
        }

        if (string.IsNullOrWhiteSpace(sql))
            return [];

        var rows = await conn.QueryAsync(sql);
        var items = new List<string>();

        foreach (IDictionary<string, object> row in rows)
        {
            // BR2: Skip(1).Take(3) → contact, id, GetSMS; add contact when GetSMS == "Y"
            var values = row.Values.Skip(1).Take(3)
                .SelectMany(v => (v?.ToString() ?? string.Empty).Split(',').Select(s => s.Trim()))
                .ToList();

            if (values.Count >= 3
                && !string.IsNullOrWhiteSpace(values[0])
                && string.Equals(values[2], "Y", StringComparison.OrdinalIgnoreCase))
            {
                items.Add(values[0]);
            }
        }

        return items;
    }

    private async Task<List<BiznessEventNoTagPivotRow>> GetDataSqlAsync(SqlConnection conn, string sql)
    {
        if (string.IsNullOrWhiteSpace(sql))
            return [];

        try
        {
            var rows = (await conn.QueryAsync(sql)).ToList();
            var list = new List<BiznessEventNoTagPivotRow>();
            foreach (IDictionary<string, object> row in rows)
            {
                list.Add(MapPivot(row));
            }
            return list;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Notification template SQL failed.");
            return [];
        }
    }

    private static BiznessEventNoTagPivotRow MapPivot(IDictionary<string, object> row)
    {
        string? Gi(string key)
        {
            foreach (var kv in row)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                    return kv.Value is null or DBNull ? null : Convert.ToString(kv.Value, CultureInfo.InvariantCulture);
            }
            return null;
        }

        return new BiznessEventNoTagPivotRow
        {
            COMPANY = Gi("COMPANY"),
            LOCATION = Gi("LOCATION"),
            INITIAL = Gi("INITIAL"),
            USER = Gi("USER"),
            S_PERSON = Gi("S_PERSON"),
            Buyer = Gi("Buyer"),
            Supplier = Gi("Supplier"),
            Collection = Gi("Collection"),
            Against = Gi("Against"),
            Amount = Gi("Amount"),
            Cheque = Gi("Cheque"),
            Payment = Gi("Payment"),
            Sales = Gi("Sales"),
            Mode = Gi("Mode"),
            Employee = Gi("Employee"),
            Purchase = Gi("Purchase"),
            PReturn = Gi("PReturn"),
            SReturn = Gi("SReturn"),
            LedgerAdjustment = Gi("LedgerAdjustment"),
            PartyLedgerAdjustment = Gi("PartyLedgerAdjustment"),
            CreditNoteRequisition = Gi("CreditNoteRequisition"),
            TT = Gi("TT"),
            ReplcementIn = Gi("ReplcementIn"),
            CarrierNo = Gi("CarrierNo"),
            ProductName = Gi("ProductName"),
            InvoiceDate = Gi("InvoiceDate"),
            ChallanNo = Gi("ChallanNo"),
            SpGenarateSMS = Gi("SpGenarateSMS"),
        };
    }

    /// <summary>Port of Notification_Config._SendSMSP.</summary>
    private async Task<string> SendSmsPAsync(SqlConnection conn, string number, string message, long companyId)
    {
        var company = await conn.QueryFirstOrDefaultAsync<(string? Name, string? SenderId, string? SmsApi)>(
            """
            SELECT TOP 1 Name, SenderId, SmsApi
            FROM Company
            WHERE CompanyId = @CompanyId
            """,
            new { CompanyId = companyId });

        var apiKey = company.SmsApi ?? string.Empty;
        var senderId = company.SenderId ?? string.Empty;
        if (string.IsNullOrWhiteSpace(apiKey))
            return "SmsApi not configured";

        // BR2 concatenates raw; escape so spaces/special chars do not break the request.
        var encodedNumber = Uri.EscapeDataString(number);
        var encodedMessage = Uri.EscapeDataString(message);
        var encodedSender = Uri.EscapeDataString(senderId);

        string url;
        if (apiKey.StartsWith("https://sms.mram.com.bd", StringComparison.OrdinalIgnoreCase))
        {
            url = apiKey + "&contacts=" + encodedNumber + "&senderid=" + encodedSender + "&msg=" + encodedMessage;
        }
        else if (string.Equals(company.Name, "City Computer And IT", StringComparison.OrdinalIgnoreCase))
        {
            url = apiKey + "&contacts=" + encodedNumber + "&senderid=" + encodedSender + "&msg=" + encodedMessage;
        }
        else if (apiKey.StartsWith("http://bulksmsbd.net", StringComparison.OrdinalIgnoreCase)
                 || apiKey.StartsWith("https://bulksmsbd.net", StringComparison.OrdinalIgnoreCase))
        {
            url = apiKey + "&senderid=" + encodedSender + "&number=" + encodedNumber + "&message=" + encodedMessage;
        }
        else
        {
            url = apiKey + "&senderid=" + encodedSender + "&number=" + encodedNumber + "&message=" + encodedMessage;
        }

        try
        {
            var client = httpClientFactory.CreateClient(nameof(InvoiceNotificationService));
            using var response = await client.GetAsync(url);
            var body = await response.Content.ReadAsStringAsync();
            return body;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SMS HTTP call failed for company {CompanyId}", companyId);
            return ex.ToString();
        }
    }

    private static async Task SaveDataToLogAsync(
        SqlConnection conn,
        string? phone,
        string? email,
        string msg,
        long? companyId,
        long notificationConfigurationId)
    {
        await conn.ExecuteAsync(
            """
            INSERT INTO NotificationLog (SentToPhoneNo, SentToEmailId, FullMsg, CompanyId, SentOn, NotificationConfigurationId)
            VALUES (@Phone, @Email, @Msg, @CompanyId, GETDATE(), @NotificationConfigurationId)
            """,
            new
            {
                Phone = phone,
                Email = email,
                Msg = msg,
                CompanyId = companyId,
                NotificationConfigurationId = notificationConfigurationId,
            });
    }

    private sealed class NotificationConfigurationRow
    {
        public long NotificationConfigurationId { get; set; }
        public string? Description { get; set; }
        public string? Mode { get; set; }
        public string? TablesWithJoiningDetail { get; set; }
        public string? FixedParameter { get; set; }
        public string? SpecificParameter { get; set; }
        public string? NotificationToParameter { get; set; }
        public string? NotificationToGroup { get; set; }
        public string? SMSTemplate { get; set; }
        public string? MailTemplate { get; set; }
        public string? PopUpTemplate { get; set; }
        public long? CompanyId { get; set; }
        public string? EmailSubject { get; set; }
    }

    private sealed class NotificationReceiverRow
    {
        public long NotificationReceiverId { get; set; }
        public long NotificationId { get; set; }
        public string? ReceiverIndividual { get; set; }
    }

    private sealed class BiznessEventNoTagPivotRow
    {
        public string? COMPANY { get; set; }
        public string? LOCATION { get; set; }
        public string? INITIAL { get; set; }
        public string? USER { get; set; }
        public string? S_PERSON { get; set; }
        public string? Buyer { get; set; }
        public string? Supplier { get; set; }
        public string? Collection { get; set; }
        public string? Against { get; set; }
        public string? Amount { get; set; }
        public string? Cheque { get; set; }
        public string? Payment { get; set; }
        public string? Sales { get; set; }
        public string? Mode { get; set; }
        public string? Employee { get; set; }
        public string? Purchase { get; set; }
        public string? PReturn { get; set; }
        public string? SReturn { get; set; }
        public string? LedgerAdjustment { get; set; }
        public string? PartyLedgerAdjustment { get; set; }
        public string? CreditNoteRequisition { get; set; }
        public string? TT { get; set; }
        public string? ReplcementIn { get; set; }
        public string? CarrierNo { get; set; }
        public string? ProductName { get; set; }
        public string? InvoiceDate { get; set; }
        public string? ChallanNo { get; set; }
        public string? SpGenarateSMS { get; set; }
    }
}
