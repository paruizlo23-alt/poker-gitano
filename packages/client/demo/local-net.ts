// Sustituye a src/net.ts en la demo: en vez de WebSocket, habla con una Room REAL (motor + bots + temporizadores) que vive en la propia página.
import { Room, RoomClient } from '../../server/src/room.js';
import { RoomManager } from '../../server/src/rooms.js';
import type { CmdResult, Mode, ServerState } from '../src/net.js';
import { tokenKey } from '../src/settings.js';

export type { ServerState, Mode, CmdResult };
export const TIMING = {
  normal: { actionMs: 60_000, botDelayMs: 1000, gameResultMs: 6000, disconnectGraceMs: 5000 },
  fast: { actionMs: 60_000, botDelayMs: 150, gameResultMs: 1500, disconnectGraceMs: 5000 },
};
export const manager = new RoomManager({ timing: TIMING.normal }, { maxRooms: 50, idleMs: 3_600_000, finishedMs: 3_600_000 });
export function setSpeed(fast: boolean): void {
  const t = fast ? TIMING.fast : TIMING.normal;
  (manager as any).deps.timing = t;                                  // salas nuevas
  for (const r of manager.rooms.values()) Object.assign((r as any).timing, t); // salas existentes
}

export class Connection {
  status: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  seatId: string | null = null;
  onState: (s: ServerState) => void = () => {};
  onEvent: (e: Record<string, any>) => void = () => {};
  onStatus: () => void = () => {};
  onFatal: (code: string) => void = () => {};
  private client: RoomClient | null = null; private r: Room | null = null; private stopped = false;
  constructor(readonly room: string, private mode: Mode) {}

  connect(): void { setTimeout(() => void this.start(), 0); }
  private fatal(code: string) { this.stopped = true; this.status = 'closed'; this.onFatal(code); this.onStatus(); }
  private async start(): Promise<void> {
    const r = manager.get(this.room); if (!r) return this.fatal('NO_SUCH_ROOM');
    const token = localStorage.getItem(tokenKey(this.room));
    let seatId: string | null = null;
    if (this.mode.kind === 'join' && !token) {
      const res = await r.join(this.mode.name, this.mode.avatar); if (!res.ok) return this.fatal(res.code);
      seatId = res.seatId; try { localStorage.setItem(tokenKey(this.room), res.token); } catch { /* sin almacenamiento */ }
      this.mode = { kind: 'rejoin' };
    } else if (this.mode.kind === 'spectate') seatId = null;
    else { seatId = r.seatForToken(token); if (!seatId) return this.fatal('BAD_TOKEN'); }
    if (this.stopped) return;
    this.seatId = seatId; this.r = r;
    this.client = { id: Math.random().toString(36).slice(2), seatId, close: () => {}, send: (m: any) => {
      if (this.stopped) return;
      if (m.t === 'state') this.onState({ ...m, skew: 0 }); else if (m.t === 'event') this.onEvent(m.ev);
    } };
    this.status = 'open'; this.onStatus(); r.attach(this.client);
  }
  async cmd(type: string, extra: Record<string, unknown> = {}): Promise<CmdResult> {
    if (!this.r) return { ok: false, code: 'TIMEOUT' };
    const res = await this.r.command(this.seatId, { id: Math.random().toString(36).slice(2) + Date.now(), type, ...extra } as any);
    return res.ok ? { ok: true } : { ok: false, code: res.code };
  }
  leave(forget = false): void {
    this.stopped = true; this.status = 'closed';
    if (this.client && this.r) this.r.detach(this.client);
    if (forget) try { localStorage.removeItem(tokenKey(this.room)); } catch { /* noop */ }
  }
}
