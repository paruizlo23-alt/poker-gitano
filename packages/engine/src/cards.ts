import { randomInt } from 'node:crypto';

export type Suit = 'oros' | 'copas' | 'espadas' | 'bastos';
export interface Card { id: string; suit: Suit | 'joker'; number: number } // joker: number 0
export const SUITS: readonly Suit[] = ['oros', 'copas', 'espadas', 'bastos'];
export const NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]; // sin 8 ni 9

// Valor de comparación (separado del número impreso). Joker > 1 > 12 > 11 > 10 > 7 > ... > 2. Los palos no desempatan.
const VALUE: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 10: 7, 11: 8, 12: 9, 1: 10 };
export const JOKER_VALUE = 11;
export const cardValue = (c: Card): number => (c.suit === 'joker' ? JOKER_VALUE : VALUE[c.number]!);

export type Rng = (maxExclusive: number) => number;
export const secureRng: Rng = (n) => randomInt(n);

export function createDeck(jokers: 1 | 2 = 1): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const number of NUMBERS) deck.push({ id: `${suit}-${number}`, suit, number });
  for (let j = 1; j <= jokers; j++) deck.push({ id: `joker-${j}`, suit: 'joker', number: 0 });
  return deck;
}

/** Fisher-Yates sobre una copia, con aleatoriedad criptográfica por defecto. */
export function shuffle<T>(items: readonly T[], rng: Rng = secureRng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
