import { Card, cardValue, createDeck, MatchView, Prediction } from '@poker-gitano/engine';

export type Rng = (maxExclusive: number) => number;
export type BotPlay = { cardId: string } | { pos: number };

/** Cartas que el bot aún no puede descartar con información AUTORIZADA (vista propia + jugadas públicas). */
function unseenPool(view: MatchView, me: string): Card[] {
  const g = view.game!;
  const known = new Set<string>();
  for (const [id, h] of Object.entries(g.hands)) if (h.cards && (id === me || g.cards === 1)) h.cards.forEach((c) => known.add(c.id));
  g.played.forEach((p) => known.add(p.card.id));
  g.history.forEach((r) => r.plays.forEach((p) => known.add(p.card.id)));
  return createDeck(view.jokers).filter((c) => !known.has(c.id));
}
const nearest = (allowed: Prediction[], target: number): Prediction => {
  const nums = allowed.filter((v): v is number => typeof v === 'number');
  return nums.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), nums[0]!);
};

export function botPredict(view: MatchView, me: string, rng: Rng): Prediction {
  if (view.penalty) {
    // Sin información: con 3+ finalistas fallar la propia victoria es lo más probable.
    return view.penalty.ids.length > 2 ? 'PIERDO' : rng(2) === 0 ? 'GANO' : 'PIERDO';
  }
  const g = view.game!;
  const opponents = Object.keys(g.hands).length - 1;
  const pool = unseenPool(view, me);
  if (g.cards === 1) {
    const others = Object.entries(g.hands).filter(([id]) => id !== me).flatMap(([, h]) => h.cards ?? []);
    const best = others.length ? Math.max(...others.map(cardValue)) : -1;
    const wins = pool.reduce((a, c) => a + (cardValue(c) > best ? 1 : cardValue(c) === best ? 0.5 : 0), 0);
    return wins / Math.max(1, pool.length) >= 0.5 ? 'GANO' : 'PIERDO';
  }
  const mine = g.hands[me]?.cards;
  let expected: number;
  if (mine) {
    expected = mine.reduce((sum, c) => {
      const v = cardValue(c);
      const lower = pool.reduce((a, x) => a + (cardValue(x) < v ? 1 : cardValue(x) === v ? 0.5 : 0), 0);
      return sum + Math.pow(lower / Math.max(1, pool.length), opponents);
    }, 0);
  } else expected = g.cards / (opponents + 1); // repesca: mano desconocida
  return nearest(g.allowedPredictions, Math.min(g.cards, Math.max(0, Math.round(expected))));
}

export function botPlay(view: MatchView, me: string, rng: Rng): BotPlay {
  if (view.penalty) return { pos: 0 };
  const g = view.game!;
  const hand = g.hands[me]!;
  if (!hand.cards) return { pos: rng(Math.max(1, hand.count)) }; // mano oculta (repesca / 1 carta): se juega por posición
  const target = g.predictions[me];
  const wins = g.history.filter((h) => h.winnerId === me).length;
  const need = (typeof target === 'number' ? target : 0) - wins;
  const sorted = hand.cards.slice().sort((a, b) => cardValue(a) - cardValue(b));
  const best = g.played.length ? Math.max(...g.played.map((p) => cardValue(p.card))) : -1;
  const isLast = g.played.length === Object.keys(g.hands).length - 1;
  if (need > 0) {
    const winning = sorted.filter((c) => cardValue(c) > best);
    if (winning.length) return { cardId: (isLast ? winning[0]! : sorted[sorted.length - 1]!).id }; // última: la mínima que gana
    return { cardId: sorted[0]!.id };
  }
  const losing = sorted.filter((c) => cardValue(c) <= best);
  return { cardId: (losing.length ? losing[losing.length - 1]! : sorted[0]!).id };
}
