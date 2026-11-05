import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { RoomManager } from '../src/rooms.js';
import { createGameServer } from '../src/server.js';

function seeded(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('fuzz WebSocket: basura binaria, cabeceras falsas y cortes a medias no tumban el servidor', async () => {
  const manager = new RoomManager({});
  const app = createGameServer(manager, { heartbeatMs: 60_000, helloTimeoutMs: 500 });
  const port = await app.listen(0); const rnd = seeded(42);
  const handshake = 'GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n';
  const runOne = (i: number) => new Promise<void>((res) => {
    const s = connect(port, '127.0.0.1'); let step = 0;
    const done = () => { try { s.destroy(); } catch { /* ya cerrado */ } res(); };
    s.on('error', done); s.on('close', done); s.setTimeout(1500, done);
    s.on('data', () => { if (step++ > 0) return; // tras el 101, enviamos tramas aleatorias/malformadas
      const kind = i % 5;
      const n = 1 + Math.floor(rnd() * 200); const b = Buffer.alloc(n); for (let k = 0; k < n; k++) b[k] = Math.floor(rnd() * 256);
      if (kind === 0) s.write(b);                                                   // basura pura
      else if (kind === 1) s.write(Buffer.from([0x81, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 1, 2, 3, 4])); // longitud 2^64
      else if (kind === 2) s.write(Buffer.from([0x81, 0x7e, 0x00, 0x05, 0, 0, 0, 0, 1, 2]));                 // trama incompleta
      else if (kind === 3) s.write(Buffer.from([0x01, 0x80, 1, 2, 3, 4, 0x01, 0x80, 1, 2, 3, 4]));          // fragmentación incorrecta
      else s.write(Buffer.from([0x81, 0x05, 1, 2, 3, 4, 5]));                                             // sin máscara
      setTimeout(done, 80);
    });
    s.write(i % 7 === 0 ? 'GET /ws HTTP/1.1\r\nHost: x\r\n\r\n' : handshake);  // cada 7ª: handshake inválido
  });
  for (let i = 0; i < 150; i++) await runOne(i);
  const h = await fetch(`http://127.0.0.1:${port}/api/health`); assert.equal(h.status, 200);
  await app.close();
});

test('fuzz JSON: mensajes bien formados pero absurdos no rompen la sala ni filtran datos', async () => {
  const manager = new RoomManager({ timing: { botDelayMs: 5, gameResultMs: 5, actionMs: 60_000, disconnectGraceMs: 50 } });
  const app = createGameServer(manager, { heartbeatMs: 60_000 }); const port = await app.listen(0);
  const room = manager.create()!;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const got: any[] = [];
  ws.onmessage = (e: any) => got.push(JSON.parse(e.data));
  await new Promise<void>((r) => { ws.onopen = () => r(); });
  ws.send(JSON.stringify({ t: 'join', room: room.code, name: 'Fuzz', avatar: 'sol' }));
  await new Promise((r) => setTimeout(r, 100));
  const evil: unknown[] = [null, 1, 'x', [], {}, { t: 'cmd' }, { t: 'cmd', id: 5, type: 'start' }, { t: 'cmd', id: 'a', type: '__proto__' }, { t: 'cmd', id: 'b', type: 'predict', value: { toString: 1 } },
    { t: 'cmd', id: 'c', type: 'play', cardId: { a: 1 } }, { t: 'cmd', id: 'd', type: 'play', pos: 1e99 }, { t: 'cmd', id: 'e', type: 'setJokers', value: '2' }, { t: 'cmd', id: 'f'.repeat(500), type: 'start' },
    { t: 'join', room: 'ZZZZZZ' }, { t: 'rejoin', token: 'x' }, { t: 'cmd', id: 'g', type: 'predict', value: NaN }, { t: 'cmd', id: 'h', type: 'constructor' }];
  for (const m of evil) ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(room.match.state.phase, 'lobby');                       // nada de lo anterior cambió la partida
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  assert.ok(!JSON.stringify(got).includes('tokenHash'));
  ws.close(); await app.close();
});
