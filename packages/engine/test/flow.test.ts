import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, Match, RuleError, viewFor, GameResult } from '../src/index.js';
import { createDeck, room } from './helpers.js';

const HIGH = ['joker-1', 'oros-1', 'copas-1', 'espadas-1', 'bastos-1'];
const LOW = ['oros-2', 'copas-2', 'espadas-2', 'bastos-2', 'oros-3', 'copas-3', 'espadas-3', 'bastos-3', 'oros-4', 'copas-4', 'espadas-4', 'bastos-4'];
const byId = (id: string): Card => createDeck(2).find((c) => c.id === id)!;
const codeOf = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

/** Reparte a mano: el ganador recibe las cartas más altas, así gana TODAS las rondas. */
function rig(m: Match, winner: string) {
  const g = m.state.game!; let l = 0, h = 0;
  for (const id of g.circle) g.hands[id] = Array.from({ length: g.cards }, () => byId(id === winner ? HIGH[h++]! : LOW[l++]!));
}
/** Juega un juego completo: `winner` gana todas las rondas; hit[id] decide si cada jugador acierta o falla. */
function run(m: Match, winner: string, hit: Record<string, boolean>): GameResult {
  rig(m, winner);
  const g = m.state.game!;
  for (const id of g.predictionOrder) {
    const wins = id === winner ? g.cards : 0;
    const want = g.cards === 1 ? (hit[id] ? (wins === 1 ? 'GANO' : 'PIERDO') : (wins === 1 ? 'PIERDO' : 'GANO'))
      : m.allowedPredictions(id).find((v) => (v === wins) === hit[id]);
    assert.ok(want !== undefined, `escenario imposible para ${id}`);
    m.predict(id, want!);
  }
  while (m.state.phase === 'playing') { const t = m.currentTurn()!; m.play(t, m.state.game!.hands[t]![0]!.id); }
  return m.state.lastResult!;
}
const setLast = (m: Match, ids: string[]) => ids.forEach((id) => { const p = m.player(id); p.lives = 1; p.repescaUsed = true; });

test('calendario real: 5,4,3,2,1,2,3,4,5 y vuelve a 5', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  const seen: number[] = [];
  for (let i = 0; i < 10; i++) {
    seen.push(m.state.game!.cards);
    run(m, 'p1', { p1: true, p2: false, p3: true });
    m.nextGame();
  }
  assert.deepEqual(seen, [5, 4, 3, 2, 1, 2, 3, 4, 5, 5]);
});

test('barajador rota p1,p2,p3,p1… y salta eliminados', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  const dealers = [m.state.game!.dealerId];
  run(m, 'p1', { p1: true, p2: false, p3: true }); m.nextGame(); dealers.push(m.state.game!.dealerId);
  setLast(m, ['p3']);
  run(m, 'p1', { p1: true, p2: true, p3: false }); // p3 eliminado
  assert.equal(m.player('p3').status, 'eliminado');
  m.nextGame(); dealers.push(m.state.game!.dealerId);
  assert.deepEqual(dealers, ['p1', 'p2', 'p1']);
});

test('vidas: un fallo resta UNA vida por juego', () => {
  const m = room(2); m.start('p1');
  run(m, 'p1', { p1: true, p2: false });
  assert.equal(m.player('p2').lives, 2); assert.equal(m.player('p1').lives, 3);
});

test('repesca: tercera vida → repesca; acierta → 1 vida; vuelve a fallar → eliminado', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  m.player('p2').lives = 1;
  run(m, 'p1', { p1: true, p2: false, p3: true });
  assert.equal(m.player('p2').status, 'repesca'); assert.equal(m.player('p2').lives, 0);
  m.nextGame();
  run(m, 'p1', { p1: true, p2: true, p3: false });
  assert.equal(m.player('p2').status, 'ultimaVida'); assert.equal(m.player('p2').lives, 1);
  assert.equal(m.player('p2').stats.repescasPassed, 1);
  m.nextGame();
  run(m, 'p1', { p1: true, p2: false, p3: true });
  assert.equal(m.player('p2').status, 'eliminado');
});
test('repesca: fallar en la repesca elimina directamente', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  m.player('p2').lives = 1;
  run(m, 'p1', { p1: true, p2: false, p3: true }); m.nextGame();
  run(m, 'p1', { p1: true, p2: false, p3: false });
  assert.equal(m.player('p2').status, 'eliminado');
});

test('ganador por ser el único no eliminado, aunque esté en repesca', () => {
  const m = room(2); m.start('p1'); setLast(m, ['p1']); m.player('p2').lives = 1;
  const r = run(m, 'p1', { p1: false, p2: false });
  assert.equal(r.outcome, 'winner'); assert.equal(r.winnerId, 'p2');
  assert.equal(m.player('p2').status, 'repesca'); assert.equal(m.state.phase, 'finished');
  assert.equal(m.player('p1').stats.finalPosition, 2); assert.equal(m.player('p2').stats.finalPosition, 1);
});
test('un acierto no elimina: el rival eliminado deja ganador al otro', () => {
  const m = room(2); m.start('p1'); setLast(m, ['p2']);
  const r = run(m, 'p1', { p1: true, p2: false });
  assert.equal(r.winnerId, 'p1');
});

test('PENALTIS con 2: ambos acaban a la vez → penaltis; ambos aciertan → repite; uno acierta → gana', () => {
  const m = room(2); m.start('p1'); setLast(m, ['p1', 'p2']);
  const r = run(m, 'p1', { p1: false, p2: false });
  assert.equal(r.outcome, 'penalty'); assert.deepEqual(r.penaltyIds, ['p1', 'p2']);
  m.nextGame(); assert.equal(m.state.phase, 'penaltyPredicting');
  const rigP = (w: string) => { const p = m.state.penalty!; p.ids.forEach((id) => (p.hands[id] = byId(id === w ? 'joker-1' : 'oros-2'))); };
  rigP('p1'); m.penaltyPredict('p1', 'GANO'); m.penaltyPredict('p2', 'PIERDO');
  m.play('p1', 'joker-1'); m.play('p2', 'oros-2');            // ambos aciertan → repite
  assert.equal(m.state.phase, 'penaltyPredicting'); assert.equal(m.state.penalty!.attempt, 2);
  rigP('p1'); m.penaltyPredict('p1', 'GANO'); m.penaltyPredict('p2', 'GANO');
  m.play('p1', 'joker-1'); m.play('p2', 'oros-2');            // p1 acierta, p2 falla → p1 gana
  assert.equal(m.state.phase, 'finished'); assert.equal(m.state.winnerId, 'p1');
});
test('PENALTIS: ambos fallan → se repite el intento', () => {
  const m = room(2); m.start('p1'); setLast(m, ['p1', 'p2']); run(m, 'p1', { p1: false, p2: false }); m.nextGame();
  const p = m.state.penalty!; p.hands['p1'] = byId('joker-1'); p.hands['p2'] = byId('oros-2');
  m.penaltyPredict('p1', 'PIERDO'); m.penaltyPredict('p2', 'GANO');
  m.play('p1', 'joker-1'); m.play('p2', 'oros-2');
  assert.equal(m.state.phase, 'penaltyPredicting'); assert.equal(m.state.penalty!.attempt, 2);
  assert.equal(m.state.penalty!.ids.length, 2);
});
test('PENALTIS con 3 eliminados a la vez (aclaración del usuario)', () => {
  const m = room(3); m.start('p1'); setLast(m, ['p1', 'p2', 'p3']);
  const r = run(m, 'p1', { p1: false, p2: false, p3: false });
  assert.equal(r.outcome, 'penalty'); assert.deepEqual(r.penaltyIds, ['p1', 'p2', 'p3']);
  m.nextGame();
  const p = m.state.penalty!; p.hands['p1'] = byId('joker-1'); p.hands['p2'] = byId('oros-3'); p.hands['p3'] = byId('oros-2');
  m.penaltyPredict('p1', 'GANO'); m.penaltyPredict('p2', 'GANO'); m.penaltyPredict('p3', 'PIERDO');
  ['p1', 'p2', 'p3'].forEach((id) => m.play(id, p.hands[id]!.id));
  // aciertan p1 y p3; p2 falla → repiten solo p1 y p3
  assert.deepEqual(m.state.penalty!.ids, ['p1', 'p3']); assert.equal(m.state.phase, 'penaltyPredicting');
  const q = m.state.penalty!; q.hands['p1'] = byId('joker-1'); q.hands['p3'] = byId('oros-2');
  m.penaltyPredict('p1', 'GANO'); m.penaltyPredict('p3', 'GANO');
  m.play('p1', 'joker-1'); m.play('p3', 'oros-2');
  assert.equal(m.state.winnerId, 'p1');
  assert.equal(m.player('p1').stats.finalPosition, 1);
  assert.equal(m.player('p2').stats.finalPosition, 2); assert.equal(m.player('p3').stats.finalPosition, 2);
});
test('PENALTIS: nadie acierta con 3 → repiten todos', () => {
  const m = room(3); m.start('p1'); setLast(m, ['p1', 'p2', 'p3']); run(m, 'p1', { p1: false, p2: false, p3: false }); m.nextGame();
  const p = m.state.penalty!; p.hands['p1'] = byId('joker-1'); p.hands['p2'] = byId('oros-3'); p.hands['p3'] = byId('oros-2');
  m.penaltyPredict('p1', 'PIERDO'); m.penaltyPredict('p2', 'GANO'); m.penaltyPredict('p3', 'GANO');
  ['p1', 'p2', 'p3'].forEach((id) => m.play(id, p.hands[id]!.id));
  assert.equal(m.state.penalty!.ids.length, 3);
});

test('1 carta: predicción secreta hasta que todos confirman; ves cartas rivales, no la tuya', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  for (let i = 0; i < 4; i++) { run(m, 'p1', { p1: true, p2: false, p3: true }); m.nextGame(); }
  assert.equal(m.state.game!.cards, 1);
  m.predict('p2', 'GANO');
  const v3 = viewFor(m, 'p3');
  assert.equal(v3.game!.predictions['p2'], 'oculta');
  assert.equal(v3.game!.hands['p3']!.cards, null);
  assert.ok(v3.game!.hands['p1']!.cards && v3.game!.hands['p2']!.cards);
  assert.equal(viewFor(m, 'p2').game!.predictions['p2'], 'GANO');
  const json = JSON.stringify(v3);
  assert.ok(!json.includes(`"${m.state.game!.hands['p3']![0]!.id}"`), 'filtra la carta propia');
  m.predict('p1', 'PIERDO'); m.predict('p3', 'PIERDO');
  assert.equal(viewFor(m, 'p3').game!.predictions['p2'], 'GANO');
});
test('repesca: no ves tu propia mano en juegos de varias cartas', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  m.player('p2').lives = 1; run(m, 'p1', { p1: true, p2: false, p3: true }); m.nextGame();
  const v = viewFor(m, 'p2');
  assert.equal(v.game!.hands['p2']!.cards, null); assert.equal(v.game!.hands['p2']!.count, 4);
  assert.equal(v.game!.hands['p1']!.cards, null);
});
test('eliminado: espectador ve todas las manos', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  setLast(m, ['p3']); run(m, 'p1', { p1: true, p2: false, p3: false }); m.nextGame();
  const v = viewFor(m, 'p3');
  assert.equal(v.role, 'spectator');
  assert.ok(Object.values(v.game!.hands).every((h) => h.cards));
});
test('penaltis: los finalistas no ven ninguna carta; el espectador sí', () => {
  const n = room(2); n.start('p1'); setLast(n, ['p1', 'p2']); run(n, 'p1', { p1: false, p2: false }); n.nextGame();
  const json = JSON.stringify(viewFor(n, 'p1'));
  for (const id of ['p1', 'p2']) assert.ok(!json.includes(`"${n.state.penalty!.hands[id]!.id}"`));
  assert.equal(codeOf(() => n.penaltyPredict('zz', 'GANO')), 'NOT_PARTICIPANT');
  assert.equal(viewFor(n, null).penalty!.hands['p1']!.cards, null);
});
test('1 carta: no hay restricción de suma', () => {
  const m = room(2); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  for (let i = 0; i < 4; i++) { run(m, 'p1', { p1: true, p2: false }); m.nextGame(); }
  m.predict('p1', 'GANO'); m.predict('p2', 'GANO');
  assert.equal(m.state.phase, 'playing');
});
test('anónimo en juego de 1 carta tampoco ve cartas', () => {
  const m = room(3); m.state.players.forEach((p) => (p.lives = 99)); m.start('p1');
  for (let i = 0; i < 4; i++) { run(m, 'p1', { p1: true, p2: false, p3: true }); m.nextGame(); }
  assert.ok(Object.values(viewFor(m, null).game!.hands).every((h) => h.cards === null));
  assert.equal(viewFor(m, 'p1').game!.history.length, 0);
});
