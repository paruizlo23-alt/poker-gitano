import { Room, RoomDeps, RoomClient } from './room.js';
import { RoomStore } from './store.js';
import { newRoomCode } from './util.js';

export interface ManagerConfig { maxRooms: number; idleMs: number; finishedMs: number }
export const DEFAULT_MANAGER: ManagerConfig = { maxRooms: 500, idleMs: 6 * 3600_000, finishedMs: 30 * 60_000 };

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  constructor(private deps: RoomDeps & { store?: RoomStore } = {}, private cfg: ManagerConfig = DEFAULT_MANAGER) {}

  loadAll(): number {
    let n = 0;
    for (const json of this.deps.store?.loadAll() ?? []) {
      try { const r = Room.fromJSON(json, this.deps); this.rooms.set(r.code, r); n++; } catch { /* snapshot inválido: se descarta */ }
    }
    return n;
  }
  create(): Room | null {
    if (this.rooms.size >= this.cfg.maxRooms) return null;
    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const room = new Room(code, this.deps);
    this.rooms.set(code, room);
    return room;
  }
  get(code: unknown): Room | undefined { return typeof code === 'string' ? this.rooms.get(code.toUpperCase()) : undefined; }
  /** Elimina salas caducadas: terminadas hace tiempo, o inactivas y sin nadie conectado. */
  cleanup(now: number): string[] {
    const removed: string[] = [];
    for (const [code, r] of this.rooms) {
      const idle = now - r.touchedAt;
      const connected = [...r.clients].length > 0;
      const finished = r.match.state.phase === 'finished';
      if ((finished && idle > this.cfg.finishedMs) || (!connected && idle > this.cfg.idleMs)) {
        r.dispose(); for (const c of r.clients) c.close();
        this.rooms.delete(code); void this.deps.store?.remove(code); removed.push(code);
      }
    }
    return removed;
  }
}
export type { RoomClient };
