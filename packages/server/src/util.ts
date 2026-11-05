import { randomBytes, randomInt } from 'node:crypto';

export class TokenBucket {
  private tokens: number; private last: number;
  constructor(private capacity: number, private perSecond: number, private now: () => number = Date.now) { this.tokens = capacity; this.last = now(); }
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1; return true;
  }
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
export const newRoomCode = (): string => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
export const newToken = (): string => randomBytes(32).toString('base64url');
export const cleanName = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  const v = s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().replace(/\s+/g, ' ');
  return v.length >= 1 && v.length <= 20 ? v : null;
};
export const validAvatar = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_-]{1,24}$/.test(s);
