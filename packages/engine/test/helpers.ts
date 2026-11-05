import { Card, createDeck, Match, MatchState } from '../src/index.js';

/** Barajado inyectable: deja al final del array (se reparte con pop) las cartas pedidas, en orden de reparto. */
export function stacked(ids: string[]): (c: Card[]) => Card[] {
  return (cards) => {
    const rest = cards.filter((c) => !ids.includes(c.id));
    const top = ids.slice().reverse().map((id) => cards.find((c) => c.id === id)!);
    return [...rest, ...top];
  };
}
export function room(n: number, shuffle?: (c: Card[]) => Card[], jokers: 1 | 2 = 1): Match {
  const m = new Match({ shuffle, jokers });
  for (let i = 1; i <= n; i++) m.addPlayer(`p${i}`, `P${i}`, 'a');
  return m;
}
export { createDeck };
export type { MatchState };
