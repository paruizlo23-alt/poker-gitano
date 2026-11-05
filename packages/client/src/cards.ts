import type { Card } from '@poker-gitano/engine';
const SUIT_ES: Record<string, string> = { oros: 'oros', copas: 'copas', espadas: 'espadas', bastos: 'bastos' };
export const cardSrc = (c: Card): string => (c.suit === 'joker' ? '/assets/cards/joker.svg' : `/assets/cards/${c.id}.png`);
export const BACK = '/assets/cards/reverso.svg';
export const cardName = (c: Card): string => (c.suit === 'joker' ? 'Joker' : `${c.number} de ${SUIT_ES[c.suit]}`);
export const AVATARS = [
  ['capibara', 'Capibara con gafas'], ['gato', 'Gato con traje'], ['mono', 'Mono con corona'], ['pinguino', 'Pingüino elegante'], ['rana', 'Rana con sombrero'],
  ['perro', 'Perro con gafas de sol'], ['mapache', 'Mapache'], ['pato', 'Pato con corbata'], ['zorro', 'Zorro'], ['panda', 'Panda'],
] as const;
export const avatarSrc = (id: string): string => `/assets/avatars/${AVATARS.some(([a]) => a === id) ? id : 'capibara'}.svg`;
