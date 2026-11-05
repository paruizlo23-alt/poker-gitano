import { settings } from './settings.js';
/** Efectos sintetizados con WebAudio (sin archivos de audio → sin derechos ni descargas). Solo suenan tras un gesto del usuario. */
let ctx = null;
let unlocked = false;
export function unlockAudio() {
    unlocked = true;
    const C = window.AudioContext ?? window.webkitAudioContext;
    if (!ctx && C)
        ctx = new C();
    if (ctx?.state === 'suspended')
        void ctx.resume();
}
const ready = () => (unlocked && settings.sound && settings.volume > 0 ? ctx : null);
function tone(freq, dur, type, vol, at = 0, to) {
    const c = ready();
    if (!c)
        return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to)
        o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const v = vol * settings.volume;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
}
function noise(dur, vol, at = 0, freq = 2500) {
    const c = ready();
    if (!c)
        return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++)
        d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol * settings.volume;
    s.connect(f).connect(g).connect(c.destination);
    s.start(c.currentTime + at);
}
export const sfx = {
    shuffle: () => { for (let i = 0; i < 9; i++)
        noise(0.09, 0.35, i * 0.13, 1800 + (i % 3) * 700); },
    deal: () => noise(0.06, 0.4, 0, 3200),
    select: () => tone(660, 0.07, 'triangle', 0.25),
    throwCard: () => { noise(0.18, 0.5, 0, 1400); tone(180, 0.12, 'sine', 0.3, 0.12, 90); },
    roundWin: () => { tone(523, 0.12, 'triangle', 0.3); tone(784, 0.18, 'triangle', 0.3, 0.1); },
    loseLife: () => { tone(220, 0.35, 'sawtooth', 0.22, 0, 110); tone(110, 0.4, 'sine', 0.3, 0.05); },
    repesca: () => { [330, 392, 494].forEach((f, i) => tone(f, 0.16, 'square', 0.14, i * 0.12)); },
    penalty: () => { for (let i = 0; i < 4; i++)
        tone(90, 0.16, 'sine', 0.5, i * 0.22, 60); },
    turn: () => tone(880, 0.09, 'sine', 0.2),
    victory: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.32, i * 0.16)); },
};
