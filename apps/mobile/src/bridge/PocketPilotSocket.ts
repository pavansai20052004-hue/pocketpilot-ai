import type { AgentEvent, SessionWebSocketMessage } from '@pocketpilot/shared-types';

export type SocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'UNAUTHORIZED';

interface SocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

type SocketFactory = (url: string) => SocketLike;

export interface SocketCallbacks {
  readonly onMessage: (message: SessionWebSocketMessage) => void;
  readonly onStatus: (status: SocketStatus) => void;
  readonly onEvent?: (event: AgentEvent) => void;
}

export interface PocketPilotSocketOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly callbacks: SocketCallbacks;
  readonly socketFactory?: SocketFactory;
  readonly schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly cancel?: (handle: ReturnType<typeof setTimeout>) => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

export class PocketPilotSocket {
  private socket: SocketLike | null = null;
  private reconnectHandle: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private sessionId: string | null = null;
  private lastSequence = 0;
  private active = false;
  private readonly factory: SocketFactory;
  private readonly schedule: NonNullable<PocketPilotSocketOptions['schedule']>;
  private readonly cancel: NonNullable<PocketPilotSocketOptions['cancel']>;

  constructor(private readonly options: PocketPilotSocketOptions) {
    this.factory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.schedule = options.schedule ?? setTimeout;
    this.cancel = options.cancel ?? clearTimeout;
  }

  connect(sessionId: string, afterSequence?: number): void {
    this.clearReconnect();
    const oldSocket = this.socket;
    this.socket = null;
    oldSocket?.close();
    this.lastSequence = sessionId === this.sessionId
      ? Math.max(this.lastSequence, afterSequence ?? 0)
      : afterSequence ?? 0;
    this.sessionId = sessionId;
    this.reconnectAttempt = 0;
    this.active = true;
    this.open();
  }

  reconnect(): void {
    if (!this.active || this.sessionId === null) return;
    this.clearReconnect();
    this.socket?.close();
    this.open();
  }

  disconnect(): void {
    this.active = false;
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
    this.options.callbacks.onStatus('DISCONNECTED');
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  private open(): void {
    if (!this.active || this.sessionId === null) return;
    this.options.callbacks.onStatus('CONNECTING');
    const socket = this.factory(this.url(this.sessionId));
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'authenticate', token: this.options.token }));
      this.reconnectAttempt = 0;
      this.options.callbacks.onStatus('CONNECTED');
    };
    socket.onmessage = (event) => { if (this.socket === socket) this.receive(event.data); };
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (event.code === 4401 || event.code === 4403) {
        this.active = false;
        this.options.callbacks.onStatus('UNAUTHORIZED');
        return;
      }
      this.options.callbacks.onStatus('DISCONNECTED');
      this.queueReconnect();
    };
  }

  private receive(raw: string): void {
    let message: SessionWebSocketMessage;
    try {
      message = JSON.parse(raw) as SessionWebSocketMessage;
    } catch {
      return;
    }
    if (message.type === 'event') {
      if (message.event.sequence <= this.lastSequence) return;
      this.lastSequence = message.event.sequence;
      this.options.callbacks.onEvent?.(message.event);
    } else {
      const fresh = message.events.filter((event) => event.sequence > this.lastSequence);
      if (fresh.length > 0) this.lastSequence = fresh[fresh.length - 1]?.sequence ?? this.lastSequence;
      const sessionSequence = message.session.last_event_sequence;
      this.lastSequence = Math.max(this.lastSequence, sessionSequence);
      message = { ...message, events: fresh };
    }
    this.options.callbacks.onMessage(message);
  }

  private queueReconnect(): void {
    if (!this.active || this.reconnectHandle !== null) return;
    const index = Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[index] ?? 15000;
    this.reconnectAttempt += 1;
    this.reconnectHandle = this.schedule(() => {
      this.reconnectHandle = null;
      this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectHandle !== null) this.cancel(this.reconnectHandle);
    this.reconnectHandle = null;
  }

  private url(sessionId: string): string {
    const baseUrl = /^https?:\/\//i.test(this.options.baseUrl) ? this.options.baseUrl : `http://${this.options.baseUrl}`;
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `/api/v1/sessions/${encodeURIComponent(sessionId)}/events/ws`;
    url.searchParams.set('after_sequence', this.lastSequence.toString());
    return url.toString();
  }
}
