import type { SessionWebSocketMessage } from '@pocketpilot/shared-types';

import { PocketPilotSocket, type SocketStatus } from './PocketPilotSocket';

export interface DeviceBridgeHandlers {
  readonly onMessage: (message: SessionWebSocketMessage) => void;
  readonly onStatus: (status: SocketStatus) => void;
}

export interface DeviceBridge {
  connect(sessionId: string, afterSequence?: number): void;
  reconnect(): void;
  disconnect(): void;
  lastSequence(): number;
}

export class LocalWebSocketBridge implements DeviceBridge {
  private readonly socket: PocketPilotSocket;

  constructor(baseUrl: string, token: string, handlers: DeviceBridgeHandlers) {
    this.socket = new PocketPilotSocket({ baseUrl, token, callbacks: handlers });
  }

  connect(sessionId: string, afterSequence = 0): void { this.socket.connect(sessionId, afterSequence); }
  reconnect(): void { this.socket.reconnect(); }
  disconnect(): void { this.socket.disconnect(); }
  lastSequence(): number { return this.socket.getLastSequence(); }
}

export class MockDeviceBridge implements DeviceBridge {
  private sequence = 0;
  constructor(private readonly handlers: DeviceBridgeHandlers) {}
  connect(_sessionId: string, afterSequence = 0): void { this.sequence = afterSequence; this.handlers.onStatus('CONNECTED'); }
  reconnect(): void { this.handlers.onStatus('CONNECTED'); }
  disconnect(): void { this.handlers.onStatus('DISCONNECTED'); }
  lastSequence(): number { return this.sequence; }
}

export class OfficeKitBridge implements DeviceBridge {
  connect(): void { throw new Error('OfficeKitBridge is not implemented.'); }
  reconnect(): void { throw new Error('OfficeKitBridge is not implemented.'); }
  disconnect(): void { /* Not connected. */ }
  lastSequence(): number { return 0; }
}
