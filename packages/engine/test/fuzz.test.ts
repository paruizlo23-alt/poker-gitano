import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, Match, shuffle, viewFor, RuleError } from '../src/index.js';

function rngOf(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ID = /"id":"((?:oros|copas|espadas|bastos)-\d+|joker-\d)"/g;

/** Cartas que ESTE espectador puede ver legítimamente en su vista. */
function allowed(m: Match, viewer: string | null): Set<string> {
  const s = m.state; const ok = new Set<string>(); const g = s.game; const pen = s.penalty;
  const me = s.players.find((p) => p.id === viewer);
  const full = !!me && me.status === 'eliminado' && !(pen && viewer && pen.ids.includes(viewer));
  const addAll = () => { for (const h of Object.values(g?.hands ?? {})) h.forEach((c) => ok.add(c.id)); if (pen) Object.values(pen.hands).forEach((c) => ok.add(c.id)); };
  if (s.phase === 'finished' || full) addAll();
  g?.played.forEach((p) => ok.add(p.card.id)); g?.history.forEach((r) => r.plays.forEach((p) => ok.add(p.card.id))); pen?.played.forEach((p) => ok.add(p.card.id));
  if (g && me && s.phase !== 'penaltyPredicting' && s.phase !== 'penaltyPlaying') {
    const mine = g.hands[me.id] ?? [];
    if (g.cards > 1 && me.status !== 'repesca') mine.forEach((c) => ok.add(c.id));
    if (g.cards === 1 && g.circle.includes(me.id)) for (const [id, h] of Object.entries(g.hands)) if (id !== me.id) h.forEach((c) => ok.add(c.id));
  }
  return ok;
}

test('simulación: 300 partidas aleatorias (2-7 jugadores, 1-2 jokers) cumplen todos los invariantes', () => {
  let games = 0, penalties = 0, repescas = 0, steps = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = rngOf(seed); const n = 2 + Math.floor(rnd() * 6);
    const m = new Match({ jokers: rnd() < 0.5 ? 1 : 2, shuffle: (c: Card[]) => shuffle(c, (k) => Math.floor(rnd() * k)) });
    for (let i = 1; i <= n; i++) m.addPlayer(`p${i}`, `P${i}`, 'a');
    m.start('p1');
    let guard = 0;
    while (m.state.phase !== 'finished') {
      assert.ok(++guard < 6000, `partida ${seed} no termina`); steps++;
      const s = m.state; const g = s.game;
      // ---- invariantes de estado
      for (const p of s.players) {
        assert.ok(p.lives >= 0 && p.lives <= 3, 'vidas fuera de rango');
        if (p.status === 'eliminado') assert.equal(p.lives, 0);
        if (p.status === 'normal') assert.ok(p.lives >= 1);
        if (p.status === 'repesca') assert.equal(p.lives, 0);
        if (p.status === 'ultimaVida') assert.equal(p.lives, 1);
      }
      if (g) {
        const ids = [...Object.values(g.hands).flat(), ...(s.phase === 'playing' ? g.played : []), ...g.history.flatMap((r) => r.plays)] // tras la última ronda, `played` repite la última entrada del historial.map((x: any) => (x.card ?? x).id);
        assert.equal(new Set(ids).size, ids.length, 'carta duplicada');
        if (s.phase === 'playing') assert.ok(Object.keys(g.predictions).length === g.circle.length);
        if (g.cards > 1 && Object.keys(g.predictions).length === g.circle.length) assert.notEqual(Object.values(g.predictions).reduce<number>((a, v) => a + (v as number), 0), g.cards, 'suma prohibida');
      }
      // ---- las vistas nunca filtran
      for (const v of [null, ...s.players.map((p) => p.id)]) {
        const json = JSON.stringify(viewFor(m, v)); const ok = allowed(m, v);
        for (const mt of json.matchAll(ID)) assert.ok(ok.has(mt[1]!), `seed ${seed}: la vista de ${v} filtra ${mt[1]} (fase ${s.phase})`);
      }
      // ---- acción aleatoria legal
      switch (s.phase) {
        case 'predicting': {
          const who = g!.cards === 1 ? g!.circle.filter((id) => !(id in g!.predictions)) : [m.currentTurn()!];
          const id = who[Math.floor(rnd() * who.length)]!; const opts = m.allowedPredictions(id);
          m.predict(id, opts[Math.floor(rnd() * opts.length)]!); break;
        }
        case 'playing': { const id = m.currentTurn()!; const h = g!.hands[id]!; m.play(id, h[Math.floor(rnd() * h.length)]!.id); break; }
        case 'gameResult': { const o = s.lastResult!.outcome; if (o === 'penalty') penalties++; s.lastResult!.rows.forEach((r) => { if (r.statusAfter === 'repesca') repescas++; }); games++; m.nextGame(); break; }
        case 'penaltyPredicting': { const p = s.penalty!; const id = p.ids.filter((x) => !(x in p.predictions))[0]!; m.penaltyPredict(id, rnd() < 0.5 ? 'GANO' : 'PIERDO'); break; }
        case 'penaltyPlaying': { const id = m.currentTurn()!; m.play(id, s.penalty!.hands[id]!.id); break; }
        default: assert.fail(`fase inesperada ${s.phase}`);
      }
    }
    // ---- fin de partida
    const alive = m.state.players.filter((p) => p.status !== 'eliminado');
    assert.ok(m.state.winnerId); assert.ok(alive.length <= 1 || m.state.penalty !== null || alive.some((p) => p.id === m.state.winnerId));
    assert.equal(m.state.players.filter((p) => p.stats.finalPosition === 1).length, 1);
    for (const p of m.state.players) assert.ok(p.stats.finalPosition !== null);
    assert.throws(() => m.play('p1', 'oros-1'), RuleError);          // nada se puede jugar tras terminar
  }
  assert.ok(games > 300 && penalties > 0 && repescas > 0, `cobertura pobre: juegos ${games}, penaltis ${penalties}, repescas ${repescas}`);
  console.log(`   ↳ ${games} juegos, ${steps} pasos, ${penalties} penaltis, ${repescas} repescas`);
});
