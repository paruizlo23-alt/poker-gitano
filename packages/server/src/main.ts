import { loadConfig } from './config.js';
import { RoomManager } from './rooms.js';
import { createGameServer } from './server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore, MemoryStore, RoomStore } from './store.js';

const cfg = loadConfig();
if (process.env.ADSENSE_CLIENT && !cfg.site.adsClient) console.warn('AVISO: ADSENSE_CLIENT ignorado. Requiere OWNER_NIF válido (art. 10 LSSI-CE) y un ID de editor correcto. La publicidad permanece desactivada.');
/** El almacenamiento nunca debe impedir arrancar: si la carpeta no es escribible se prueba /tmp y, en último caso, solo memoria. */
function makeStore(dir: string): RoomStore {
  for (const d of [dir, join(tmpdir(), 'poker-gitano')]) {
    try { return new FileStore(d); } catch (e) { console.warn(`AVISO: no se puede escribir en ${d}: ${(e as Error).message}`); }
  }
  console.warn('AVISO: sin disco disponible; las salas solo viven en memoria (se pierden al reiniciar).');
  return new MemoryStore();
}
const store = makeStore(cfg.dataDir);
const manager = new RoomManager({ store, timing: { actionMs: cfg.actionMs, botDelayMs: cfg.botDelayMs, gameResultMs: cfg.gameResultMs } }, { maxRooms: cfg.maxRooms, idleMs: 6 * 3600_000, finishedMs: 30 * 60_000 });
console.log(`Salas restauradas: ${manager.loadAll()}`);
const staticDir = process.env.STATIC_DIR ?? new URL('../../client/public', import.meta.url).pathname;
const app = createGameServer(manager, { staticDir, site: cfg.site, allowedOrigin: cfg.allowedOrigin, trustProxy: cfg.trustProxy });
app.listen(cfg.port).then((p) => console.log(`Poker Gitano escuchando en :${p}`));

// Render/Docker envían SIGTERM al desplegar o reiniciar: cierra conexiones y termina (las salas ya se guardan en cada cambio).
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { void app.close().finally(() => process.exit(0)); });
