using Microsoft.AspNetCore.SignalR;

namespace PosApi.Hubs;

public class ScanRelayHub : Hub
{
    private const string SessionKey = "scanSessionId";
    private const string RemoteKey = "scanRemote";

    public async Task JoinSession(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return;

        var id = sessionId.Trim();
        Context.Items[SessionKey] = id;
        await Groups.AddToGroupAsync(Context.ConnectionId, id);
    }

    public async Task JoinRemote(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return;

        var id = sessionId.Trim();
        Context.Items[SessionKey] = id;
        Context.Items[RemoteKey] = true;
        await Groups.AddToGroupAsync(Context.ConnectionId, id);
        await Clients.OthersInGroup(id).SendAsync("RemoteJoined");
    }

    public async Task SendScan(string sessionId, string text)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(text))
            return;

        await Clients.OthersInGroup(sessionId.Trim()).SendAsync("ScanReceived", text.Trim());
    }

    public async Task SendPreviewFrame(string sessionId, string frameData)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(frameData))
            return;

        await Clients.OthersInGroup(sessionId.Trim()).SendAsync("PreviewFrame", frameData);
    }

    public async Task SetRemoteArmState(string sessionId, bool armed)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
            return;

        await Clients.OthersInGroup(sessionId.Trim()).SendAsync("RemoteArmState", armed);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue(RemoteKey, out var isRemote)
            && isRemote is true
            && Context.Items.TryGetValue(SessionKey, out var sessionObj)
            && sessionObj is string sessionId
            && !string.IsNullOrWhiteSpace(sessionId))
        {
            await Clients.OthersInGroup(sessionId.Trim()).SendAsync("RemoteLeft");
        }

        await base.OnDisconnectedAsync(exception);
    }
}
