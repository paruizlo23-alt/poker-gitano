import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/room.js';
import { RoomManager } from '../src/rooms.js';
import { MemoryStore } from '../src/store.js';
import { FakeClient, FAST, FakeClock, cmd, mkRoom } from './helpers.js';

async function lobby(n = 1) {
  const ctx = mkRoom();
  const seats: { seatId: string; token: string }[] = [];
  for (let i = 0; i < n; i++) { const r = await ctx.room.join(`Jugador${i}`, 'av1'); assert.ok(r.ok); if (r.ok) seats.push(r); }
  return { ...ctx, seats };
}

test('join: valida nombre/avatar, sala llena y partida empezada', async () => {
  const { room } = await lobby(0);
  assert.deepEqual(await room.join('', 'a'), { ok: false, code: 'INVALID_NAME' });
  assert.deepEqual(await room.join('<>', 'a'), { ok: false, code: 'INVALID_NAME' });
  assert.deepEqual(await room.join('x'.repeat(21), 'a'), { ok: false, code: 'INVALID_NAME' });
  assert.deepEqual(await room.join('Ok', 'Bad Avatar!'), { ok: false, code: 'INVALID_AVATAR' });
  for (let i = 0; i < 7; i++) assert.ok((await room.join(`J${i}`, 'a')).ok);
  assert.deepEqual(await room.join('Octavo', 'a'), { ok: false, code: 'ROOM_FULL' });
});
test('join tras empezar: ALREADY_STARTED', async () => {
  const { room } = await lobby(2);
  await room.command('p1', cmd({ type: 'start' }));
  assert.deepEqual(await room.join('Tarde', 'a'), { ok: false, code: 'ALREADY_STARTED' });
});

test('tokens: reingreso solo por token; el token no se guarda en claro', async () => {
  const { room, seats } = await lobby(2);
  assert.equal(room.seatForToken(seats[1]!.token), 'p2');
  assert.equal(room.seatForToken('Jugador1'), null);                 // el nombre no sirve
  assert.equal(room.seatForToken(seats[1]!.token + 'x'), null);
  assert.equal(room.seatForToken(undefined), null);
  const dump = JSON.stringify(room.toJSON());
  assert.ok(!dump.includes(seats[0]!.token) && !dump.includes(seats[1]!.token));
});

test('autorización: espectador y no-anfitrión no pueden mandar', async () => {
  const { room } = await lobby(2);
  assert.deepEqual(await room.command(null, cmd({ type: 'start' })), { ok: false, code: 'NOT_A_PLAYER' });
  assert.deepEqual(await room.command('p9', cmd({ type: 'start' })), { ok: false, code: 'NOT_A_PLAYER' });
  assert.deepEqual(await room.command('p2', cmd({ type: 'start' })), { ok: false, code: 'NOT_HOST' });
  assert.deepEqual(await room.command('p2', cmd({ type: 'addBot' })), { ok: false, code: 'NOT_HOST' });
});

test('idempotencia: el mismo id de comando no se aplica dos veces', async () => {
  const { room } = await lobby(2);
  await room.command('p1', cmd({ type: 'start' }));
  const turn = room.match.currentTurn()!;
  const c = cmd({ type: 'predict', value: 1 });
  assert.deepEqual(await room.command(turn, c), { ok: true });
  const v = room.match.state.version;
  assert.deepEqual(await room.command(turn, c), { ok: true, dup: true });
  assert.equal(room.match.state.version, v);
});

test('predicción: inválida, fuera de turno y restricción de suma las decide el servidor', async () => {
  const { room } = await lobby(3);
  await room.command('p1', cmd({ type: 'start' }));
  const [a, b, c] = room.match.state.game!.predictionOrder as [string, string, string];
  assert.deepEqual(await room.command(b, cmd({ type: 'predict', value: 1 })), { ok: false, code: 'NOT_YOUR_TURN' });
  assert.deepEqual(await room.command(a, cmd({ type: 'predict', value: 'x' })), { ok: false, code: 'INVALID_PREDICTION' });
  assert.deepEqual(await room.command(a, cmd({ type: 'predict', value: 2 })), { ok: true });
  assert.deepEqual(await room.command(a, cmd({ type: 'predict', value: 3 })), { ok: false, code: 'ALREADY_PREDICTED' }); // no se cambia
  await room.command(b, cmd({ type: 'predict', value: 2 }));
  assert.deepEqual(await room.command(c, cmd({ type: 'predict', value: 1 })), { ok: false, code: 'SUM_FORBIDDEN' });
});

test('jugar: carta ajena/duplicada/inexistente rechazada', async () => {
  const { room } = await lobby(2);
  await room.command('p1', cmd({ type: 'start' }));
  const g = room.match.state.game!;
  for (const id of g.predictionOrder) await room.command(id, cmd({ type: 'predict', value: id === g.predictionOrder[1] ? 0 : 1 }));
  const t = room.match.currentTurn()!; const other = t === 'p1' ? 'p2' : 'p1';
  const mine = g.hands[t]![0]!.id; const theirs = g.hands[other]![0]!.id;
  assert.deepEqual(await room.command(other, cmd({ type: 'play', cardId: theirs })), { ok: false, code: 'NOT_YOUR_TURN' });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', cardId: theirs })), { ok: false, code: 'CARD_NOT_IN_HAND' });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', cardId: 'zzz' })), { ok: false, code: 'CARD_NOT_IN_HAND' });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', cardId: mine })), { ok: true });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', cardId: mine })), { ok: false, code: 'NOT_YOUR_TURN' });
});

test('mano oculta (1 carta): solo posición; un cardId no sirve de oráculo', async () => {
  const { room } = await lobby(2);
  room.match.state.gameCounter = 4; // el próximo juego es el de 1 carta
  await room.command('p1', cmd({ type: 'start' }));
  assert.equal(room.match.state.game!.cards, 1);
  for (const id of ['p1', 'p2']) await room.command(id, cmd({ type: 'predict', value: 'GANO' }));
  const t = room.match.currentTurn()!;
  const real = room.match.state.game!.hands[t]![0]!.id;
  assert.deepEqual(await room.command(t, cmd({ type: 'play', cardId: real })), { ok: false, code: 'POSITION_REQUIRED' });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', pos: 3 })), { ok: false, code: 'INVALID_POSITION' });
  assert.deepEqual(await room.command(t, cmd({ type: 'play', pos: 0 })), { ok: true });
});

test('vistas enviadas: el cliente no recibe cartas ajenas', async () => {
  const { room } = await lobby(3);
  const a = new FakeClient('p1'); const b = new FakeClient('p2'); const spec = new FakeClient(null);
  [a, b, spec].forEach((c) => room.attach(c));
  await room.command('p1', cmd({ type: 'start' }));
  const g = room.match.state.game!;
  for (const [client, me] of [[a, 'p1'], [b, 'p2'], [spec, null]] as const) {
    const all = JSON.stringify(client.msgs.slice(-5));
    for (const [owner, hand] of Object.entries(g.hands)) if (owner !== me) for (const card of hand) assert.ok(!all.includes(`"${card.id}"`), `${me} recibe ${card.id} de ${owner}`);
  }
});

test('partida completa solo con bots (humano desconectado): termina con ganador', async () => {
  const { room, clock } = await lobby(1);
  await room.command('p1', cmd({ type: 'addBot' })); await room.command('p1', cmd({ type: 'addBot' }));
  const cl = new FakeClient('p1'); room.attach(cl);
  await room.command('p1', cmd({ type: 'start' }));
  room.detach(cl);                                   // se va: tras el margen, el bot ocupa su asiento
  for (let i = 0; i < 40_000 && room.match.state.phase !== 'finished'; i++) await clock.advance(25, room);
  assert.equal(room.match.state.phase, 'finished');
  assert.ok(room.match.state.winnerId);
  assert.ok(room.match.state.players.every((p) => p.stats.finalPosition !== null));
  assert.equal(room.seats.get('p1')!.botReason, 'disconnect');
});

test('2 caducidades consecutivas → bot; vuelve al actuar; contador se reinicia', async () => {
  const clock = new FakeClock();
  const room = new Room('TIMEOU', { clock, timing: { ...FAST, botDelayMs: 5_000 } });
  await room.join('A', 'a'); await room.join('B', 'a');
  const ca = new FakeClient('p1'); const cb = new FakeClient('p2'); room.attach(ca); room.attach(cb);
  await room.command('p1', cmd({ type: 'start' }));
  const turn = room.match.currentTurn()!;
  assert.equal(room.deadlines()[turn], clock.now() + 60_000);            // temporizador visible
  await clock.advance(60_000, room);                                      // 1ª caducidad: acción automática
  assert.equal(room.seats.get(turn)!.consecutiveTimeouts, 1);
  assert.equal(room.seats.get(turn)!.botActive, false);
  assert.ok(Object.keys(room.match.state.game!.predictions).length >= 1);
  // deja caducar hasta que ese mismo asiento acumule 2 seguidas
  for (let i = 0; i < 30 && !room.seats.get(turn)!.botActive; i++) await clock.advance(60_000, room);
  assert.equal(room.seats.get(turn)!.botActive, true);
  assert.equal(room.seats.get(turn)!.botReason, 'timeout');
  // reconectar NO lo devuelve; actuar válidamente SÍ
  room.detach(ca); room.attach(new FakeClient(turn));
  assert.equal(room.seats.get(turn)!.botActive, true);
  for (let i = 0; i < 200 && !(room.match.currentTurn() === turn && room.match.state.phase === 'predicting'); i++) await clock.advance(1_000, room);
  let acted = false;
  if (room.match.currentTurn() === turn && room.match.state.phase === 'predicting') {
    acted = true;
    const allowed = room.match.allowedPredictions(turn)[0];
    assert.deepEqual(await room.command(turn, cmd({ type: 'predict', value: allowed })), { ok: true });
    assert.equal(room.seats.get(turn)!.botActive, false);
    assert.equal(room.seats.get(turn)!.consecutiveTimeouts, 0);
  }
  assert.ok(acted, 'no llegó a tocarle predecir otra vez');
});

test('carrera humano/bot: si el humano actúa antes, el bot no duplica la acción', async () => {
  const clock = new FakeClock();
  const room = new Room('RACEXX', { clock, timing: { ...FAST, botDelayMs: 100 } });
  await room.join('A', 'a'); await room.join('B', 'a');
  const ca = new FakeClient('p1'); room.attach(ca);
  await room.command('p1', cmd({ type: 'start' }));
  const turn = room.match.currentTurn()!;
  room.seats.get(turn)!.botActive = true; room.seats.get(turn)!.botReason = 'timeout';
  room.attach(new FakeClient(turn));                      // fuerza reschedule con bot programado
  const v = room.match.allowedPredictions(turn)[0];
  assert.deepEqual(await room.command(turn, cmd({ type: 'predict', value: v })), { ok: true });
  await clock.advance(300, room);
  assert.equal(room.match.state.game!.predictions[turn], v); // el bot no pisa ni repite la predicción del humano
});

test('persistencia: snapshot restaura estado; reingreso con el token original', async () => {
  const store = new MemoryStore();
  const clock = new FakeClock();
  const room = new Room('PERSIS', { clock, timing: FAST, store });
  const j = await room.join('Ana', 'a'); await room.join('Beto', 'a');
  assert.ok(j.ok);
  await room.command('p1', cmd({ type: 'start' }));
  await room.command(room.match.currentTurn()!, cmd({ type: 'predict', value: 1 }));
  await room.idle();
  const json = store.data.get('PERSIS')!;
  const restored = Room.fromJSON(json, { clock: new FakeClock(), timing: FAST });
  assert.deepEqual(restored.match.state, room.match.state);
  if (j.ok) assert.equal(restored.seatForToken(j.token), 'p1');
  assert.equal(restored.seats.get('p1')!.botActive, true);               // tras reinicio: bot hasta que vuelvan
  restored.attach(new FakeClient('p1'));
  assert.equal(restored.seats.get('p1')!.botActive, false);               // vuelve el humano
  restored.dispose();
});

test('limpieza: terminadas/inactivas se eliminan; con gente conectada no', async () => {
  const store = new MemoryStore();
  const mgr = new RoomManager({ store, timing: FAST }, { maxRooms: 3, idleMs: 1000, finishedMs: 500 });
  const a = mgr.create()!, b = mgr.create()!, c = mgr.create()!;
  assert.equal(mgr.create(), null);                                       // límite de salas
  b.attach(new FakeClient(null));
  const now = a.touchedAt + 5000;
  const removed = mgr.cleanup(now).sort();
  assert.deepEqual(removed, [a.code, c.code].sort());
  assert.ok(mgr.get(b.code));
});
