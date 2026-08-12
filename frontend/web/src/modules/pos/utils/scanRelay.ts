import * as signalR from '@microsoft/signalr';
import { getScanRelayHubUrl } from '../../../config/runtimeConfig';

export type PosRelayHandlers = {
  onScan: (text: string) => void;
  onPreviewFrame?: (dataUrl: string) => void;
  onRemoteJoined?: () => void;
  onRemoteLeft?: () => void;
};

export type RemoteRelay = {
  connection: signalR.HubConnection;
  sendScan: (text: string) => Promise<void>;
  sendPreviewFrame: (dataUrl: string) => Promise<void>;
  onArmState: (handler: (armed: boolean) => void) => void;
};

function buildConnection() {
  return new signalR.HubConnectionBuilder()
    .withUrl(getScanRelayHubUrl())
    .withAutomaticReconnect()
    .build();
}

export async function connectPosRelay(sessionId: string, handlers: PosRelayHandlers) {
  const connection = buildConnection();

  connection.on('ScanReceived', (text: string) => {
    if (text?.trim()) handlers.onScan(text.trim());
  });

  if (handlers.onPreviewFrame) {
    connection.on('PreviewFrame', (frame: string) => {
      if (frame?.startsWith('data:image/')) handlers.onPreviewFrame?.(frame);
    });
  }

  if (handlers.onRemoteJoined) {
    connection.on('RemoteJoined', () => handlers.onRemoteJoined?.());
  }

  if (handlers.onRemoteLeft) {
    connection.on('RemoteLeft', () => handlers.onRemoteLeft?.());
  }

  await connection.start();
  await connection.invoke('JoinSession', sessionId);
  return connection;
}

export async function connectRemoteRelay(sessionId: string): Promise<RemoteRelay> {
  const connection = buildConnection();
  await connection.start();
  await connection.invoke('JoinRemote', sessionId);

  return {
    connection,
    sendScan: (text: string) => connection.invoke('SendScan', sessionId, text),
    sendPreviewFrame: (dataUrl: string) => connection.invoke('SendPreviewFrame', sessionId, dataUrl),
    onArmState: (handler) => {
      connection.on('RemoteArmState', (armed: boolean) => handler(!!armed));
    },
  };
}

export async function setRemoteArmState(
  connection: signalR.HubConnection,
  sessionId: string,
  armed: boolean,
) {
  await connection.invoke('SetRemoteArmState', sessionId, armed);
}

/** @deprecated Use connectPosRelay */
export async function connectScanRelay(sessionId: string, onScan: (text: string) => void) {
  return connectPosRelay(sessionId, { onScan });
}

/** @deprecated Use connectRemoteRelay */
export async function sendRemoteScan(sessionId: string, text: string) {
  const relay = await connectRemoteRelay(sessionId);
  try {
    await relay.sendScan(text);
  } finally {
    await relay.connection.stop();
  }
}
