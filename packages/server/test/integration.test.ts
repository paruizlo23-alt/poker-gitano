import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, viewFor, MatchView } from '@poker-gitano/engine';
import { botPlay, botPredict } from '../src/bots.js';
import { Room } from '../src/room.js';
import { RoomManager } from '../src/rooms.js';
import { createGameServer } from '../src/server.js';
import { FakeClient, FakeClock, FAST, cmd, mkRoom } from './helpers.js';

const rng = (n: number) => Math.floor(Math.random() * n);

/** Regla de visibilidad: qué manos AJENAS puede ver legítimamente este cliente en esta vista. */
function checkNoLeak(view: MatchView, me: string | null, tokens: string[], raw: string, who: string) {
  const g = view.game;
  const myStatus = view.players.find((p) => p.id === me)?.status;
  const privileged = view.phase === 'finished' || (me !== null && myStatus === 'eliminado' && view.role === 'spectator');
  if (g && view.phase !== 'penaltyPredicting' && view.phase !== 'penaltyPlaying') for (const [id, h] of Object.entries(g.hands)) {
    if (!h.cards || privileged) continue;
    if (id === me) { assert.ok(g.cards > 1 && myStatus !== 'repesca', `${who} ve su PROPIA mano oculta`); continue; }
    assert.ok(g.cards === 1 && me !== null, `${who} ve la mano de ${id} sin permiso`);
  }
  if (view.penalty && !privileged) for (const h of Object.values(view.penalty.hands)) assert.equal(h.cards, null, `${who} ve cartas en penaltis`);
  for (const t of tokens) assert.ok(!raw.includes(t), `${who} recibió un token ajeno`);
  assert.ok(!/tokenHash/.test(raw), `${who} recibió un hash`);
}

test('7 clientes WebSocket reales juegan una partida completa sin ver nada no autorizado', async () => {
  const manager = new RoomManager({ timing: { ...FAST, botDelayMs: 5, gameResultMs: 10 } });
  // Clientes a velocidad de máquina (~1000× humana): se sube el límite por conexión; el límite real se prueba en net.test.ts
  const app = createGameServer(manager, { heartbeatMs: 60_000, msgBurst: 5000, msgPerSec: 5000 });
  const port = await app.listen(0); const room = manager.create()!;
  type C = { ws: any; seat: string; token: string; views: number; msgs: string[]; done: boolean; sent: string };
  const clients: C[] = []; const tokens: string[] = []; const errors: string[] = [];
  let resolveAll!: () => void; let rejectAll!: (e: unknown) => void;
  const finished = new Promise<void>((res, rej) => { resolveAll = res; rejectAll = rej; });
  const timer = setTimeout(() => rejectAll(new Error('la partida no terminó a tiempo; errores: ' + JSON.stringify([...new Set(errors)].slice(0, 8)) + ' fase ' + room.match.state.phase)), 90_000);
  const onMsg = (c: C) => (e: any) => {
    const m = JSON.parse(e.data); c.msgs.push(e.data);
    if (m.t === 'welcome') { c.seat = m.seatId; c.token = m.token; tokens.push(m.token); return; }
    if (m.t === 'error') { errors.push(`${c.seat}:${m.code}`); return; }
    if (m.t !== 'state') return;
    const v: MatchView = m.view; c.views++;
    try {
      checkNoLeak(v, c.seat, tokens.filter((t) => t !== c.token), e.data, c.seat);
      if (v.phase === 'finished') { if (!c.done) { c.done = true; if (clients.every((x) => x.done)) { clearTimeout(timer); resolveAll(); } } return; }
      const g = v.game; const me = c.seat;
      // Como la interfaz real: una acción por decisión (el cliente queda "ocupado" hasta que cambia la situación)
      const act = (key: string, msg: Record<string, unknown>) => { if (c.sent === key) return; c.sent = key; c.ws.send(JSON.stringify({ t: 'cmd', id: `${me}-${key}`, ...msg })); };
      if (v.penalty) {
        const pk = `pen${v.penalty.attempt}`;
        if (v.phase === 'penaltyPredicting' && v.penalty.ids.includes(me) && v.penalty.predictions[me] === undefined) act(`${pk}:pred`, { type: 'predict', value: botPredict(v, me, rng) });
        else if (v.phase === 'penaltyPlaying' && v.penalty.turnId === me) act(`${pk}:play:${v.penalty.played.length}`, { type: 'play', pos: 0 });
      } else if (g && g.allowedPredictions.length) act(`g${g.number}:pred:${g.cards === 1 ? 's' : Object.keys(g.predictions).length}`, { type: 'predict', value: botPredict(v, me, rng) });
      else if (g && v.phase === 'playing' && g.turnId === me) act(`g${g.number}:r${g.round}:p${g.played.length}`, { type: 'play', ...botPlay(v, me, rng) });
    } catch (err) { rejectAll(err); }
  };
  for (let i = 0; i < 7; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const c: C = { ws, seat: '', token: '', views: 0, msgs: [], done: false, sent: '' };
    ws.onmessage = onMsg(c); clients.push(c);
    await new Promise<void>((res) => { ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', room: room.code, name: `J${i}`, avatar: 'sol' })); res(); }; });
  }
  while (tokens.length < 7) await new Promise((r) => setTimeout(r, 20));
  clients[0]!.ws.send(JSON.stringify({ t: 'cmd', id: 'start', type: 'start' }));
  await finished;
  assert.equal(room.match.state.phase, 'finished'); assert.ok(room.match.state.winnerId);
  assert.ok(clients.every((c) => c.views > 10));
  assert.deepEqual([...new Set(errors)], [], 'errores recibidos por los clientes');
  for (const c of clients) c.ws.close(); await app.close();
});

test('anfitrión ausente en la sala de espera: el mando pasa a otro humano conectado', async () => {
  const { room, clock } = mkRoom();
  for (const n of ['A', 'B', 'C']) await room.join(n, 'a');
  const [a, b] = [new FakeClient('p1'), new FakeClient('p2')]; room.attach(a); room.attach(b); room.attach(new FakeClient('p3'));
  room.detach(a); await clock.advance(200, room);
  assert.equal(room.match.state.hostId, 'p2');
  assert.deepEqual(await room.command('p1', cmd({ type: 'start' })), { ok: false, code: 'NOT_HOST' });
  assert.deepEqual(await room.command('p2', cmd({ type: 'start' })), { ok: true });
});
test('anfitrión ausente sin nadie más conectado: nada se rompe y puede volver', async () => {
  const { room, clock } = mkRoom(); await room.join('A', 'a'); await room.join('B', 'a');
  const a = new FakeClient('p1'); room.attach(a); room.detach(a); await clock.advance(500, room);
  assert.equal(room.match.state.hostId, 'p1');
  room.attach(new FakeClient('p1')); assert.deepEqual(await room.command('p1', cmd({ type: 'start' })), { ok: true });
});

test('dos conexiones al mismo asiento: ambas reciben estado; el bot solo entra cuando se van las dos', async () => {
  const { room, clock } = mkRoom(); await room.join('A', 'a'); await room.join('B', 'a');
  const t1 = new FakeClient('p1'), t2 = new FakeClient('p1'); room.attach(t1); room.attach(t2); room.attach(new FakeClient('p2'));
  await room.command('p1', cmd({ type: 'start' }));
  assert.ok(t1.lastState() && t2.lastState());
  room.detach(t1); await clock.advance(500, room);
  assert.equal(room.seats.get('p1')!.botActive, false);
  room.detach(t2); await clock.advance(500, room);
  assert.equal(room.seats.get('p1')!.botActive, true);
  room.attach(new FakeClient('p1')); assert.equal(room.seats.get('p1')!.botActive, false);
});

test('espectador malicioso: ningún comando le funciona y no recibe cartas en toda una partida', async () => {
  const { room, clock } = mkRoom(); await room.join('A', 'a'); await room.command('p1', cmd({ type: 'addBot' })); await room.command('p1', cmd({ type: 'addBot' }));
  const spec = new FakeClient(null); room.attach(spec); const h1 = new FakeClient('p1'); room.attach(h1);
  await room.command('p1', cmd({ type: 'start' })); room.detach(h1);
  for (const c of [{ type: 'start' }, { type: 'addBot' }, { type: 'setJokers', value: 2 }, { type: 'predict', value: 1 }, { type: 'play', cardId: 'oros-1' }, { type: 'play', pos: 0 }])
    assert.deepEqual(await room.command(null, cmd(c)), { ok: false, code: 'NOT_A_PLAYER' }, JSON.stringify(c));
  assert.deepEqual(await room.command('p9', cmd({ type: 'start' })), { ok: false, code: 'NOT_A_PLAYER' });
  for (let i = 0; i < 4000 && room.match.state.phase !== 'finished'; i++) await clock.advance(25, room);
  assert.equal(room.match.state.phase, 'finished');
  const states = spec.msgs.filter((x) => x.t === 'state' && x.view.phase !== 'finished'); assert.ok(states.length > 20);
  for (const m of states) for (const hand of Object.values<any>(m.view.game?.hands ?? {})) assert.equal(hand.cards, null);   // al terminar, las manos son públicas por diseño
});

test('reinicio del servidor a mitad de partida: se restaura y los bots la terminan', async () => {
  const { room, clock } = mkRoom(); await room.join('A', 'a'); await room.command('p1', cmd({ type: 'addBot' })); await room.command('p1', cmd({ type: 'addBot' }));
  const c = new FakeClient('p1'); room.attach(c); await room.command('p1', cmd({ type: 'start' })); room.detach(c);
  for (let i = 0; i < 400; i++) await clock.advance(25, room);
  assert.notEqual(room.match.state.phase, 'lobby');
  const snap = JSON.stringify(room.toJSON()); room.dispose();
  const clock2 = new FakeClock(); const restored = Room.fromJSON(snap, { clock: clock2, timing: FAST });
  assert.deepEqual(restored.match.state.players.map((p) => p.id), ['p1', 'p2', 'p3']);
  for (let i = 0; i < 40_000 && restored.match.state.phase !== 'finished'; i++) await clock2.advance(25, restored);
  assert.equal(restored.match.state.phase, 'finished');
});

test('duplicados y acciones simultáneas: solo una se aplica', async () => {
  const { room } = mkRoom(); await room.join('A', 'a'); await room.join('B', 'a');
  await room.command('p1', cmd({ type: 'start' }));
  const t = room.match.currentTurn()!; const v = room.match.allowedPredictions(t)[0];
  const same = cmd({ type: 'predict', value: v });
  const r = await Promise.all([room.command(t, same), room.command(t, same), room.command(t, cmd({ type: 'predict', value: v }))]);
  assert.equal(r.filter((x) => x.ok && !('dup' in x)).length, 1);
  assert.ok(r.some((x) => x.ok && 'dup' in x));
  assert.ok(r.every((x) => x.ok || x.code === 'ALREADY_PREDICTED'));
  assert.equal(Object.keys(room.match.state.game!.predictions).length, 1);
});

test('bots: como último predictor jamás eligen el número prohibido (200 partidas completas solo con bots)', () => {
  let lastPredictors = 0;
  for (let g = 0; g < 200; g++) {
    const m = new Match({}); const n = 2 + (g % 6);
    for (let i = 1; i <= n; i++) m.addPlayer(`p${i}`, `P${i}`, 'a');
    m.start('p1');
    for (let steps = 0; steps < 3000 && m.state.phase !== 'finished'; steps++) {
      const st = m.state;
      if (st.phase === 'gameResult') { m.nextGame(); continue; }
      if (st.phase === 'predicting') {
        for (const id of st.game!.predictionOrder) { if (id in st.game!.predictions) continue;
          const view = viewFor(m, id); const p = botPredict(view, id, rng);
          if (m.forbiddenPrediction(id) !== null) lastPredictors++;
          m.predict(id, p); }                       // lanza SUM_FORBIDDEN si el bot elige mal
      } else if (st.phase === 'playing') { const t = m.currentTurn()!; const p = botPlay(viewFor(m, t), t, rng); m.play(t, 'cardId' in p ? p.cardId : st.game!.hands[t]![p.pos]!.id); }
      else if (st.phase === 'penaltyPredicting') { for (const id of st.penalty!.ids) if (!(id in st.penalty!.predictions)) m.penaltyPredict(id, botPredict(viewFor(m, id), id, rng) as 'GANO' | 'PIERDO'); }
      else if (st.phase === 'penaltyPlaying') { const t = m.currentTurn()!; m.play(t, st.penalty!.hands[t]!.id); }
    }
    assert.equal(m.state.phase, 'finished', `partida ${g} sin terminar`);
  }
  assert.ok(lastPredictors > 100, 'la prueba debe ejercitar la restricción de suma muchas veces');
});
