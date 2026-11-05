export interface Settings { theme: 'auto' | 'light' | 'dark'; sound: boolean; volume: number; motion: 'auto' | 'reduce' | 'full' }
const KEY = 'pg:settings';
const DEFAULTS: Settings = { theme: 'auto', sound: true, volume: 0.6, motion: 'auto' };
export const settings: Settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* ajustes corruptos: valores por defecto */ }

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* almacenamiento no disponible */ }
  applySettings();
}
export function applySettings(): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;       // auto = sigue prefers-color-scheme vía CSS
  root.dataset.motion = motionReduced() ? 'reduce' : 'full';
}
export function motionReduced(): boolean {
  return settings.motion === 'reduce' || (settings.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export const profile = {
  get name(): string { return localStorage.getItem('pg:name') ?? ''; }, set name(v: string) { try { localStorage.setItem('pg:name', v); } catch { /* noop */ } },
  get avatar(): string { return localStorage.getItem('pg:avatar') ?? 'capibara'; }, set avatar(v: string) { try { localStorage.setItem('pg:avatar', v); } catch { /* noop */ } },
};
export const tokenKey = (room: string): string => `pg:token:${room}`;
