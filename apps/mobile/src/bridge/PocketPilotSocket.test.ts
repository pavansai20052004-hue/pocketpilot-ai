import type { AgentEvent, DebugSession, SessionWebSocketMessage } from '@pocketpilot/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { PocketPilotSocket } from './PocketPilotSocket';

class FakeSocket {
  readonly readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  open(): void { this.onopen?.(); }
  message(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) }); }
  serverClose(code = 1006): void { this.onclose?.({ code }); }
}

const session: DebugSession = { id: 'session-1', title: 'Issue', state: 'ANALYZING', revision: 2, retry_count: 0, created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:01Z', last_event_sequence: 2 };
const event = (sequence: number): AgentEvent => ({ id: `e-${sequence}`, session_id: session.id, sequence, name: 'error_parsed', state: 'ANALYZING', summary: 'Parsed', occurred_at: '2026-09-03T00:00:01Z' });

describe('PocketPilotSocket', () => {
  it('authenticates, receives events, tracks sequence, and ignores duplicates', () => {
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const messages: SessionWebSocketMessage[] = [];
    const socket = new PocketPilotSocket({
      baseUrl: 'http://192.168.1.23:8000', token: 'device-token',
      callbacks: { onMessage: (message) => messages.push(message), onStatus: vi.fn() },
      socketFactory: (url) => { urls.push(url); const fake = new FakeSocket(); sockets.push(fake); return fake; },
    });

    socket.connect(session.id, 1);
    sockets[0]?.open();
    sockets[0]?.message({ type: 'event', event: event(2) });
    sockets[0]?.message({ type: 'event', event: event(2) });

    expect(urls[0]).not.toContain('device-token');
    expect(urls[0]).toContain('after_sequence=1');
    expect(JSON.parse(sockets[0]?.sent[0] ?? '{}')).toEqual({ type: 'authenticate', token: 'device-token' });
    expect(messages).toHaveLength(1);
    expect(socket.getLastSequence()).toBe(2);
  });

  it('reconciles snapshots and removes already-seen events', () => {
    const fake = new FakeSocket();
    const messages: SessionWebSocketMessage[] = [];
    const socket = new PocketPilotSocket({ baseUrl: 'http://laptop:8000', token: 'token', callbacks: { onMessage: (message) => messages.push(message), onStatus: vi.fn() }, socketFactory: () => fake });
    socket.connect(session.id, 1);
    fake.message({ type: 'snapshot', session, events: [event(1), event(2)], patch: null });

    expect(messages[0]?.type).toBe('snapshot');
    expect(messages[0]?.type === 'snapshot' ? messages[0].events.map((item) => item.sequence) : []).toEqual([2]);
    expect(socket.getLastSequence()).toBe(2);
  });

  it('disconnects cleanly and reconnects with bounded backoff after restart', () => {
    const sockets: FakeSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const socket = new PocketPilotSocket({
      baseUrl: 'http://laptop:8000', token: 'token', callbacks: { onMessage: vi.fn(), onStatus: vi.fn() },
      socketFactory: () => { const fake = new FakeSocket(); sockets.push(fake); return fake; },
      schedule: (callback, delay) => { scheduled.push({ callback, delay }); return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel: vi.fn(),
    });
    socket.connect(session.id);
    sockets[0]?.serverClose();
    expect(scheduled[0]?.delay).toBe(1000);
    scheduled[0]?.callback();
    expect(sockets).toHaveLength(2);
    socket.disconnect();
    expect(sockets[1]?.closed).toBe(true);
  });

  it('stops reconnecting when the token is invalid', () => {
    const fake = new FakeSocket();
    const status = vi.fn();
    const schedule = vi.fn();
    const socket = new PocketPilotSocket({ baseUrl: 'http://laptop:8000', token: 'bad', callbacks: { onMessage: vi.fn(), onStatus: status }, socketFactory: () => fake, schedule });
    socket.connect(session.id);
    fake.serverClose(4401);
    expect(status).toHaveBeenLastCalledWith('UNAUTHORIZED');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('starts the new session at its own cursor and ignores the old socket', () => {
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const messages: SessionWebSocketMessage[] = [];
    const socket = new PocketPilotSocket({
      baseUrl: 'http://laptop:8000', token: 'token',
      callbacks: { onMessage: (message) => messages.push(message), onStatus: vi.fn() },
      socketFactory: (url) => { urls.push(url); const fake = new FakeSocket(); sockets.push(fake); return fake; },
    });
    socket.connect('old-session', 18);
    socket.connect(session.id, 2);
    expect(urls[1]).toContain('after_sequence=2');
    sockets[0]?.message({ type: 'event', event: { ...event(30), session_id: 'old-session' } });
    sockets[1]?.message({ type: 'event', event: event(4) });
    expect(messages).toHaveLength(1);
    expect(socket.getLastSequence()).toBe(4);
    socket.connect(session.id, 2);
    expect(urls[2]).toContain('after_sequence=4');
    socket.connect('third-session');
    expect(urls[3]).toContain('after_sequence=0');
  });
});
