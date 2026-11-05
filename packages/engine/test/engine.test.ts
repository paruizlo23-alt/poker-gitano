import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardValue, createDeck, shuffle, Match, RuleError, viewFor, SCHEDULE, Card } from '../src/index.js';
import { room, stacked } from './helpers.js';

const throwsCode = (fn: () => unknown, code: string) => {
  try { fn(); } catch (e) { assert.equal((e as RuleError).code, code); return; }
  assert.ok(false, `esperaba ${code}`);
};
const c = (id: string): Card => createDeck(2).find((x) => x.id === id)!;

test('baraja: 40 cartas + joker, sin 8 ni 9, ids únicos', () => {
  const d = createDeck(1);
  assert.equal(d.length, 41);
  assert.ok(d.every((x) => x.number !== 8 && x.number !== 9));
  assert.equal(new Set(d.map((x) => x.id)).size, 41);
  assert.equal(createDeck(2).length, 42);
});
test('jerarquía: joker > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4 > 3 > 2, palos no desempatan', () => {
  const order = ['joker-1', 'oros-1', 'copas-12', 'bastos-11', 'espadas-10', 'oros-7', 'oros-6', 'oros-5', 'oros-4', 'oros-3', 'oros-2'];
  const v = order.map((id) => cardValue(c(id)));
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1]! > v[i]!);
  assert.equal(cardValue(c('oros-1')), cardValue(c('bastos-1')));
});
test('shuffle: Fisher-Yates conserva elementos y no muta el original', () => {
  const d = createDeck(1); const s = shuffle(d);
  assert.deepEqual(s.map((x) => x.id).sort(), d.map((x) => x.id).sort());
  assert.equal(d[0]!.id, 'oros-1');
});
test('calendario 5-4-3-2-1-2-3-4-5', () => assert.deepEqual([...SCHEDULE], [5, 4, 3, 2, 1, 2, 3, 4, 5]));

test('sala: mínimo 2, máximo 7, solo el anfitrión inicia', () => {
  const m = room(1);
  throwsCode(() => m.start('p1'), 'NEED_TWO_PLAYERS');
  const big = room(7); throwsCode(() => big.addPlayer('x', 'X', 'a'), 'ROOM_FULL');
  const m2 = room(3); throwsCode(() => m2.start('p2'), 'NOT_HOST');
});

test('reparto: 5 cartas, empieza tras el barajador (p1) y el barajador predice último', () => {
  const m = room(3); m.start('p1');
  const g = m.state.game!;
  assert.equal(g.cards, 5); assert.equal(g.dealerId, 'p1');
  assert.deepEqual(g.predictionOrder, ['p2', 'p3', 'p1']);
  assert.ok(Object.values(g.hands).every((h) => h.length === 5));
  const all = Object.values(g.hands).flat().map((x) => x.id);
  assert.equal(new Set(all).size, 15);
});

test('restricción de suma: el último predictor no puede igualar las rondas', () => {
  const m = room(3); m.start('p1');
  m.predict('p2', 2); m.predict('p3', 1);
  assert.equal(m.forbiddenPrediction('p1'), 2);
  throwsCode(() => m.predict('p1', 2), 'SUM_FORBIDDEN');
  assert.ok(!m.allowedPredictions('p1').includes(2));
  m.predict('p1', 3);
  assert.equal(m.state.phase, 'playing');
});
test('restricción: sin valor prohibido si queda fuera de 0..n', () => {
  const m = room(3); m.start('p1');
  m.predict('p2', 4); m.predict('p3', 4);
  assert.equal(m.forbiddenPrediction('p1'), null);
  m.predict('p1', 0);
});
test('predicción: turno, rango y reintento', () => {
  const m = room(3); m.start('p1');
  throwsCode(() => m.predict('p3', 1), 'NOT_YOUR_TURN');
  throwsCode(() => m.predict('p2', 6), 'INVALID_PREDICTION');
  throwsCode(() => m.predict('p2', -1), 'INVALID_PREDICTION');
  m.predict('p2', 1);
  throwsCode(() => m.predict('p2', 2), 'ALREADY_PREDICTED');
});

// p1 reparte; orden de reparto p2,p3,p1. Juego de 2 cartas (tras avanzar) se prueba con mano apilada.
function twoCardGame(): Match {
  // Fuerza el juego nº1 con 5 cartas pero usando rondas reales: p2 recibe las mejores.
  const m = room(2, stacked(['oros-1', 'oros-2', 'copas-1', 'copas-2', 'espadas-1', 'espadas-2', 'bastos-1', 'bastos-2', 'oros-3', 'oros-4']));
  m.start('p1'); return m;
}
test('rondas: gana la carta más alta; empate gana la jugada antes; ganador abre la siguiente', () => {
  const m = twoCardGame(); const g = m.state.game!;
  // reparto alterno p2,p1,p2,p1...: p2 = oros-1,copas-1,espadas-1,bastos-1,oros-3 ; p1 = oros-2,copas-2,...
  assert.deepEqual(g.hands['p2']!.map((x) => x.id), ['oros-1', 'copas-1', 'espadas-1', 'bastos-1', 'oros-3']);
  m.predict('p2', 4); m.predict('p1', 0);
  m.play('p2', 'oros-1'); m.play('p1', 'oros-2'); // gana p2
  assert.equal(m.state.game!.wins['p2'], 1);
  assert.equal(m.currentTurn(), 'p2');
  m.play('p2', 'copas-1'); m.play('p1', 'copas-2');
  m.play('p2', 'espadas-1'); m.play('p1', 'espadas-2');
  m.play('p2', 'bastos-1'); m.play('p1', 'bastos-2');
  m.play('p2', 'oros-3'); m.play('p1', 'oros-4'); // oros-3 vs oros-4: gana oros-4 (valor 3 > 2)
  const r = m.state.lastResult!;
  assert.equal(r.rows.find((x) => x.playerId === 'p2')!.wins, 4);
  assert.ok(r.rows.find((x) => x.playerId === 'p2')!.hit);
});
test('empate de valor entre palos: gana el que jugó antes', () => {
  const m = room(2, stacked(['oros-1', 'bastos-1', 'copas-2', 'copas-3', 'copas-4', 'copas-5', 'copas-6', 'copas-7', 'copas-10', 'copas-11']));
  m.start('p1'); m.predict('p2', 1); m.predict('p1', 0);
  m.play('p2', 'oros-1'); m.play('p1', 'bastos-1');
  assert.equal(m.state.game!.wins['p2'], 1);
});
test('jugar: carta ajena o fuera de turno falla', () => {
  const m = twoCardGame(); m.predict('p2', 0); m.predict('p1', 1);
  throwsCode(() => m.play('p1', 'oros-2'), 'NOT_YOUR_TURN');
  throwsCode(() => m.play('p2', 'oros-2'), 'CARD_NOT_IN_HAND');
});

test('vistas: mano propia visible, rivales solo cantidad (juego normal)', () => {
  const m = room(3); m.start('p1');
  const v = viewFor(m, 'p2');
  assert.ok(v.game!.hands['p2']!.cards);
  assert.equal(v.game!.hands['p1']!.cards, null);
  assert.equal(v.game!.hands['p1']!.count, 5);
});
test('vistas: la serialización del cliente NO contiene cartas ajenas', () => {
  const m = room(3); m.start('p1');
  const json = JSON.stringify(viewFor(m, 'p2'));
  for (const card of m.state.game!.hands['p1']!) assert.ok(!json.includes(`"${card.id}"`), `filtra ${card.id}`);
  for (const card of m.state.game!.hands['p3']!) assert.ok(!json.includes(`"${card.id}"`), `filtra ${card.id}`);
});
test('vistas: espectador anónimo NO ve ninguna mano (ni en 1 carta)', () => {
  const m = room(3); m.start('p1');
  const v = viewFor(m, null);
  assert.equal(v.role, 'spectator');
  assert.ok(Object.values(v.game!.hands).every((h) => h.cards === null));
});
test('snapshot: serializar y restaurar conserva el estado', () => {
  const m = room(3); m.start('p1'); m.predict('p2', 1);
  const r = Match.fromSnapshot(m.snapshot());
  assert.deepEqual(r.state, m.state);
  r.predict('p3', 1);
});
