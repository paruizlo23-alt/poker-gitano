import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
import { createGameServer } from '../src/server.js';
import { MemoryStore } from '../src/store.js';

const FAST = { actionMs: 60_000, botDelayMs: 20, gameResultMs: 20, disconnectGraceMs: 50 };
async function boot(opts: Record<string, unknown> = {}) {
  const manager = new RoomManager({ timing: FAST, store: new MemoryStore() });
  const app = createGameServer(manager, { heartbeatMs: 60_000, ...opts });
  const port = await app.listen(0);
  return { manager, app, port, http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}
class Client {
  msgs: any[] = []; closed = false; closeCode = 0; private ws: any; private waiters: { f: (m: any) => boolean; res: (m: any) => void }[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e: any) => { const m = JSON.parse(e.data); this.msgs.push(m); this.waiters = this.waiters.filter((w) => { if (w.f(m)) { w.res(m); return false; } return true; }); };
    this.ws.onclose = (e: any) => { this.closed = true; this.closeCode = e.code; };
    this.ws.onerror = () => { this.closed = true; };
  }
  ready() { return new Promise<void>((res) => { if (this.ws.readyState === 1) res(); else { this.ws.onopen = () => res(); this.ws.addEventListener('error', () => res()); } }); }
  send(o: unknown) { this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
  wait(f: (m: any) => boolean, ms = 3000): Promise<any> {
    const old = this.msgs.find(f); if (old) return Promise.resolve(old);
    return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout esperando mensaje')), ms); this.waiters.push({ f, res: (m) => { clearTimeout(t); res(m); } }); });
  }
  async waitClosed(ms = 3000) { const t0 = Date.now(); while (!this.closed && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10)); return this.closed; }
  close() { try { this.ws.close(); } catch { /* ya cerrado */ } }
}
const post = async (url: string) => { const r = await fetch(url, { method: 'POST' }); return { status: r.status, body: await r.json() }; };

test('HTTP: health, crear sala, consultar sala sin datos privados, 404', async () => {
  const s = await boot();
  assert.deepEqual(await (await fetch(`${s.http}/api/health`)).json(), { ok: true });
  const c = await post(`${s.http}/api/rooms`);
  assert.equal(c.status, 201); assert.ok(/^[A-Z0-9]{6}$/.test(c.body.code));
  const info = await (await fetch(`${s.http}/api/rooms/${c.body.code}`)).json();
  assert.deepEqual(info, { exists: true, phase: 'lobby', players: 0, canJoin: true });
  assert.equal((await fetch(`${s.http}/api/rooms/ZZZZZZ`)).status, 404);
  assert.equal((await fetch(`${s.http}/nada`)).status, 404);
  await s.app.close();
});
test('HTTP: límite de creación de salas por IP', async () => {
  const s = await boot();
  let last = 0; for (let i = 0; i < 12; i++) last = (await post(`${s.http}/api/rooms`)).status;
  assert.equal(last, 429);
  await s.app.close();
});

test('WS: partida real — vista filtrada, bots, reingreso por token', async () => {
  const s = await boot();
  const { body } = await post(`${s.http}/api/rooms`); const code = body.code;
  const a = new Client(s.ws); await a.ready();
  a.send({ t: 'join', room: code, name: 'Ana', avatar: 'sol' });
  const welcome = await a.wait((m) => m.t === 'welcome');
  assert.equal(welcome.seatId, 'p1'); assert.ok(welcome.token.length > 30);
  a.send({ t: 'cmd', id: 'x1', type: 'addBot' }); a.send({ t: 'cmd', id: 'x2', type: 'addBot' });
  await a.wait((m) => m.t === 'ack' && m.id === 'x2');
  a.send({ t: 'cmd', id: 'x3', type: 'start' });
  const st = await a.wait((m) => m.t === 'state' && m.view.phase === 'predicting');
  assert.equal(st.view.game.hands['p1'].cards.length, 5);
  assert.equal(st.view.game.hands['p2'].cards, null);
  const room = s.manager.get(code)!;
  const raw = JSON.stringify(a.msgs);
  for (const bot of ['p2', 'p3']) for (const card of room.match.state.game!.hands[bot]!) assert.ok(!raw.includes(`"${card.id}"`) || room.match.state.game!.hands['p1']!.some((c) => c.id === card.id), 'carta ajena filtrada');
  // reingreso con token desde otra conexión; con token falso, no
  const bad = new Client(s.ws); await bad.ready(); bad.send({ t: 'rejoin', room: code, token: 'x'.repeat(43) });
  assert.equal((await bad.wait((m) => m.t === 'error')).code, 'BAD_TOKEN');
  const byName = new Client(s.ws); await byName.ready(); byName.send({ t: 'rejoin', room: code, name: 'Ana' });
  assert.equal((await byName.wait((m) => m.t === 'error')).code, 'BAD_TOKEN');
  a.close();
  const a2 = new Client(s.ws); await a2.ready(); a2.send({ t: 'rejoin', room: code, token: welcome.token });
  assert.equal((await a2.wait((m) => m.t === 'welcome')).seatId, 'p1');
  const back = await a2.wait((m) => m.t === 'state');
  assert.equal(back.view.viewerId, 'p1');
  a2.close(); await s.app.close();
});

test('WS: espectador anónimo no ve manos ni puede mandar comandos', async () => {
  const s = await boot();
  const { body } = await post(`${s.http}/api/rooms`); const code = body.code;
  const a = new Client(s.ws); await a.ready(); a.send({ t: 'join', room: code, name: 'Ana', avatar: 'sol' }); await a.wait((m) => m.t === 'welcome');
  a.send({ t: 'cmd', id: 'b1', type: 'addBot' }); a.send({ t: 'cmd', id: 'b2', type: 'start' });
  const sp = new Client(s.ws); await sp.ready(); sp.send({ t: 'spectate', room: code });
  const v = await sp.wait((m) => m.t === 'state' && m.view.phase !== 'lobby');
  assert.equal(v.view.role, 'spectator');
  assert.ok(Object.values<any>(v.view.game.hands).every((h) => h.cards === null));
  sp.send({ t: 'cmd', id: 's1', type: 'start' });
  assert.equal((await sp.wait((m) => m.t === 'error' && m.id === 's1')).code, 'NOT_A_PLAYER');
  a.close(); sp.close(); await s.app.close();
});

test('WS: comandos sin autenticar, mensajes malformados y suplantación por campo seatId', async () => {
  const s = await boot();
  const { body } = await post(`${s.http}/api/rooms`); const code = body.code;
  const x = new Client(s.ws); await x.ready(); x.send({ t: 'cmd', id: '1', type: 'start' });
  assert.equal((await x.wait((m) => m.t === 'error')).code, 'NO_SUCH_ROOM'); // 1er mensaje debe ser join/rejoin/spectate
  assert.ok(await x.waitClosed());
  const a = new Client(s.ws); await a.ready(); a.send({ t: 'join', room: code, name: 'Ana', avatar: 'sol' }); await a.wait((m) => m.t === 'welcome');
  const b = new Client(s.ws); await b.ready(); b.send({ t: 'join', room: code, name: 'Beto', avatar: 'sol' }); await b.wait((m) => m.t === 'welcome');
  b.send({ t: 'cmd', id: 'f1', type: 'start', seatId: 'p1', playerId: 'p1' }); // intenta actuar como el anfitrión
  assert.equal((await b.wait((m) => m.t === 'error' && m.id === 'f1')).code, 'NOT_HOST');
  a.send('{no json'); assert.equal((await a.wait((m) => m.t === 'error' && m.code === 'BAD_JSON')).code, 'BAD_JSON');
  a.send({ t: 'otra' }); await a.wait((m) => m.t === 'error' && m.code === 'BAD_MESSAGE');
  a.close(); b.close(); await s.app.close();
});

test('WS: mensaje gigante cierra la conexión; ráfaga dispara el límite de frecuencia', async () => {
  const s = await boot({ msgBurst: 10, msgPerSec: 1 });
  const { body } = await post(`${s.http}/api/rooms`); const code = body.code;
  const big = new Client(s.ws); await big.ready(); big.send('x'.repeat(40_000));
  assert.ok(await big.waitClosed());
  const a = new Client(s.ws); await a.ready(); a.send({ t: 'join', room: code, name: 'Ana', avatar: 'sol' }); await a.wait((m) => m.t === 'welcome');
  for (let i = 0; i < 40; i++) a.send({ t: 'cmd', id: `r${i}`, type: 'sync' });
  await a.wait((m) => m.t === 'error' && m.code === 'RATE_LIMIT');
  a.close(); await s.app.close();
});

test('WS: sala llena y partida empezada rechazan el join; origen no permitido se rechaza', async () => {
  const s = await boot();
  const { body } = await post(`${s.http}/api/rooms`); const code = body.code;
  const cs: Client[] = [];
  for (let i = 0; i < 7; i++) { const c = new Client(s.ws); await c.ready(); c.send({ t: 'join', room: code, name: `J${i}`, avatar: 'sol' }); await c.wait((m) => m.t === 'welcome'); cs.push(c); }
  const extra = new Client(s.ws); await extra.ready(); extra.send({ t: 'join', room: code, name: 'Otro', avatar: 'sol' });
  assert.equal((await extra.wait((m) => m.t === 'error')).code, 'ROOM_FULL');
  cs.forEach((c) => c.close()); await s.app.close();
  const s2 = await boot({ allowedOrigin: 'https://juego.example' });
  const nope = new Client(s2.ws); await nope.ready();                     // Node no envía Origin → 403
  assert.ok(await nope.waitClosed());
  await s2.app.close();
});

test('estáticos: sirve la app con CSP; bloquea recorrido de rutas; no expone fuentes del servidor', async () => {
  const s = await boot({ staticDir: new URL('../../client/public', import.meta.url).pathname });
  const idx = await fetch(`${s.http}/`);
  assert.equal(idx.status, 200);
  assert.ok((idx.headers.get('content-security-policy') ?? '').includes("script-src 'self'"));
  assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(idx.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(`${s.http}/como-jugar`)).status, 200);
  assert.equal((await fetch(`${s.http}/assets/cards/oros-1.png`)).headers.get('content-type'), 'image/png');
  for (const bad of ['/../server/package.json', '/%2e%2e/server/package.json', '/assets/../../server/src/main.ts', '/..%2fserver%2fpackage.json', '/%00']) {
    const r = await fetch(`${s.http}${bad}`);
    assert.ok(r.status === 400 || r.status === 403 || r.status === 404, `${bad} → ${r.status}`);
    assert.ok(!(await r.text()).includes('"@poker-gitano/server"'), `${bad} filtra contenido`);
  }
  await s.app.close();
});

test('proxy: el límite por IP usa la ÚLTIMA entrada de X-Forwarded-For (la primera la controla el cliente)', async () => {
  const s = await boot({ trustProxy: true });
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await fetch(`${s.http}/api/rooms`, { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.9` } })).status; // primera cambia, última fija
  assert.equal(last, 429);
  const other = await fetch(`${s.http}/api/rooms`, { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.77' } });
  assert.equal(other.status, 201);
  await s.app.close();
});
