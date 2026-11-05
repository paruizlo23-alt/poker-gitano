import { loadConfig } from './config.js';
import { RoomManager } from './rooms.js';
import { createGameServer } from './server.js';
import { FileStore } from './store.js';

const cfg = loadConfig();
if (process.env.ADSENSE_CLIENT && !cfg.site.adsClient) console.warn('AVISO: ADSENSE_CLIENT ignorado. Requiere OWNER_NIF válido (art. 10 LSSI-CE) y un ID de editor correcto. La publicidad permanece desactivada.');
const store = new FileStore(cfg.dataDir);
const manager = new RoomManager({ store, timing: { actionMs: cfg.actionMs, botDelayMs: cfg.botDelayMs, gameResultMs: cfg.gameResultMs } }, { maxRooms: cfg.maxRooms, idleMs: 6 * 3600_000, finishedMs: 30 * 60_000 });
console.log(`Salas restauradas: ${manager.loadAll()}`);
const staticDir = process.env.STATIC_DIR ?? new URL('../../client/public', import.meta.url).pathname;
const app = createGameServer(manager, { staticDir, site: cfg.site, allowedOrigin: cfg.allowedOrigin, trustProxy: cfg.trustProxy });
app.listen(cfg.port).then((p) => console.log(`Poker Gitano escuchando en :${p}`));

// Render/Docker envían SIGTERM al desplegar o reiniciar: cierra conexiones y termina (las salas ya se guardan en cada cambio).
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { void app.close().finally(() => process.exit(0)); });
