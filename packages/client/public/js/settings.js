const KEY = 'pg:settings';
const DEFAULTS = { theme: 'auto', sound: true, volume: 0.6, motion: 'auto' };
export const settings = { ...DEFAULTS };
try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
}
catch { /* ajustes corruptos: valores por defecto */ }
export function saveSettings() {
    try {
        localStorage.setItem(KEY, JSON.stringify(settings));
    }
    catch { /* almacenamiento no disponible */ }
    applySettings();
}
export function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme; // auto = sigue prefers-color-scheme vía CSS
    root.dataset.motion = motionReduced() ? 'reduce' : 'full';
}
export function motionReduced() {
    return settings.motion === 'reduce' || (settings.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export const profile = {
    get name() { return localStorage.getItem('pg:name') ?? ''; }, set name(v) { try {
        localStorage.setItem('pg:name', v);
    }
    catch { /* noop */ } },
    get avatar() { return localStorage.getItem('pg:avatar') ?? 'capibara'; }, set avatar(v) { try {
        localStorage.setItem('pg:avatar', v);
    }
    catch { /* noop */ } },
};
export const tokenKey = (room) => `pg:token:${room}`;
