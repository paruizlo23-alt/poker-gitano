import { Clock, Room, RoomClient, RoomDeps } from '../src/room.js';

export class FakeClock implements Clock {
  t = 1_000_000; private n = 0; timers: { id: number; at: number; fn: () => void }[] = [];
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const h = { id: ++this.n, at: this.t + ms, fn }; this.timers.push(h); return h; }
  clearTimeout(h: unknown) { this.timers = this.timers.filter((x) => x !== h); }
  async advance(ms: number, room: Room) {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next); this.t = next.at; next.fn(); await room.idle();
    }
    this.t = end;
  }
}
export class FakeClient implements RoomClient {
  id = Math.random().toString(36).slice(2); msgs: any[] = [];
  constructor(public seatId: string | null) {}
  send(m: unknown) { this.msgs.push(m); }
  close() {}
  lastState() { return [...this.msgs].reverse().find((m) => m.t === 'state'); }
}
export const FAST = { actionMs: 60_000, botDelayMs: 10, gameResultMs: 10, disconnectGraceMs: 50 };
export function mkRoom(deps: RoomDeps = {}) {
  const clock = new FakeClock();
  const room = new Room('ABCDEF', { clock, timing: FAST, ...deps });
  return { room, clock };
}
let c = 0;
export const cmd = <T extends object>(o: T) => ({ id: `c${++c}`, ...o }) as any;
