import type { VoiceIntent } from './contracts';
import type { VoiceResponseData } from './responseFormatter';

export function confirmationTarget(data: VoiceResponseData): string | null {
  if (!data.session || !data.patch || data.patch.session_id !== data.session.id) return null;
  // Bind the displayed proposal, status and session revision, not just the action name.
  return JSON.stringify([data.session, data.patch]);
}

export class VoiceConfirmation {
  private pending: { intent: VoiceIntent; target: string; expires: number } | null = null;

  begin(intent: VoiceIntent, target: string | null, now = Date.now()): boolean {
    this.clear();
    if (!target || !['APPROVE_PATCH', 'ROLLBACK'].includes(intent)) return false;
    this.pending = { intent, target, expires: now + 30_000 };
    return true;
  }

  consume(target: string | null, now = Date.now()): VoiceIntent | null {
    const pending = this.pending;
    this.clear();
    if (!pending || pending.target !== target || now >= pending.expires) return null;
    return pending.intent;
  }

  isPending(target: string | null, now = Date.now()): boolean {
    return this.pending !== null && this.pending.target === target && now < this.pending.expires;
  }

  secondsRemaining(now = Date.now()): number {
    return this.pending === null ? 0 : Math.max(0, Math.ceil((this.pending.expires - now) / 1000));
  }

  clear(): void { this.pending = null; }
}
