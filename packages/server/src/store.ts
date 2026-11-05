import { promises as fs, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RoomStore {
  save(code: string, json: string): Promise<void>;
  remove(code: string): Promise<void>;
  loadAll(): string[];
}
export class MemoryStore implements RoomStore {
  data = new Map<string, string>();
  async save(code: string, json: string) { this.data.set(code, json); }
  async remove(code: string) { this.data.delete(code); }
  loadAll() { return [...this.data.values()]; }
}
/** Persistencia en disco (escritura atómica). Sustituible por PostgreSQL implementando RoomStore. */
export class FileStore implements RoomStore {
  private chain = new Map<string, Promise<void>>();
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }); }
  private path(code: string) { return join(this.dir, `${code}.json`); }
  save(code: string, json: string): Promise<void> {
    const prev = this.chain.get(code) ?? Promise.resolve();
    const next = prev.then(async () => { const tmp = `${this.path(code)}.tmp`; await fs.writeFile(tmp, json); await fs.rename(tmp, this.path(code)); }).catch(() => {});
    this.chain.set(code, next);
    return next;
  }
  async remove(code: string) { await (this.chain.get(code) ?? Promise.resolve()); await fs.rm(this.path(code), { force: true }); this.chain.delete(code); }
  loadAll(): string[] {
    const out: string[] = [];
    for (const f of readdirSync(this.dir) as string[]) if (/^[A-Z0-9]{6}\.json$/.test(f)) { try { out.push(readFileSync(join(this.dir, f), 'utf8')); } catch { /* corrupto: se ignora */ } }
    return out;
  }
}
