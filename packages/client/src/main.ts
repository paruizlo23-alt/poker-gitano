import { clear, h } from './dom.js';
import { Connection, Mode, ServerState } from './net.js';
import { applySettings, profile, tokenKey } from './settings.js';
import { home, joinForm, lobby, settingsModal } from './screens.js';
import { Table } from './table.js';
import { unlockAudio } from './sound.js';
import { errText } from './texts.js';

applySettings();
const app = document.getElementById('app')!;
const banner = h('div', { class: 'conn-banner', role: 'status' });
const toastEl = h('div', { class: 'toast', role: 'status' });
document.body.append(banner, toastEl);
let toastT: number | undefined;
const live = document.getElementById('live');
const announce = (m: string) => { if (live) live.textContent = m; };
const toast = (m: string) => { announce(m); toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.classList.remove('show'), 3800); };
for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, unlockAudio, { once: true });

let lastCount = 0; let conn: Connection | null = null; let table: Table | null = null; let lastPhaseLobby = true;
const setScreen = (el: Node) => { clear(app); app.append(el); };
const goHash = (hash: string) => { if (location.hash !== hash) location.hash = hash; else void route(); };
const home$ = () => { teardown(); goHash('#/'); };

function teardown(forget = false) { conn?.leave(forget); conn = null; table?.destroy(); table = null; banner.classList.remove('show'); }

function enterRoom(code: string, mode: Mode) {
  teardown(); lastPhaseLobby = true;
  const c = new Connection(code, mode); conn = c;
  c.onFatal = (err) => { teardown(true); toast(errText(err)); showJoin(code); };
  c.onStatus = () => { banner.textContent = c.status === 'reconnecting' ? 'Reconectando…' : ''; banner.classList.toggle('show', c.status === 'reconnecting'); };
  c.onState = (s: ServerState) => {
    if (s.view.phase === 'lobby') { const n = s.view.players.length; if (n !== lastCount) { announce(`Sala de espera: ${n} ${n === 1 ? 'jugador' : 'jugadores'}.`); lastCount = n; } table?.destroy(); table = null; lastPhaseLobby = true; setScreen(lobby(s, c, () => { teardown(true); home$(); }, toast)); return; }
    if (!table) { table = new Table(c, () => { teardown(true); home$(); }); setScreen(table.el); lastPhaseLobby = false; }
    table.setState(s);
  };
  c.onEvent = (e) => { if (e.e === 'error') toast(errText(e.code)); table?.onEvent(e); };
  setScreen(h('main', { class: 'screen' }, h('p', { class: 'loading', text: 'Conectando…' })));
  c.connect();
}

function showJoin(code?: string) {
  setScreen(joinForm({ code, needCode: !code, title: code ? `Unirse a la sala ${code}` : 'Unirse a una partida', submit: 'Entrar',
    onSubmit: async ({ name, avatar, code: typed }) => {
      const room = code ?? typed;
      const info = await fetch(`/api/rooms/${room}`).then((r) => r.json()).catch(() => ({ exists: false }));
      if (!info.exists) return toast(errText('NO_SUCH_ROOM'));
      if (!info.canJoin) return toast(errText(info.phase === 'lobby' ? 'ROOM_FULL' : 'ALREADY_STARTED'));
      goHash(`#/sala/${room}`); enterRoom(room, { kind: 'join', name, avatar });
    },
    onSpectate: (c) => { goHash(`#/sala/${c}`); enterRoom(c, { kind: 'spectate' }); }, onBack: () => goHash('#/') }));
}
function showCreate() {
  setScreen(joinForm({ needCode: false, title: 'Crear partida', submit: 'Crear sala',
    onSubmit: async ({ name, avatar }) => {
      const r = await fetch('/api/rooms', { method: 'POST' }).catch(() => null);
      if (!r || !r.ok) return toast(r?.status === 429 ? errText('RATE_LIMIT') : 'No se pudo crear la sala. Inténtalo de nuevo.');
      const { code } = await r.json();
      goHash(`#/sala/${code}`); enterRoom(code, { kind: 'join', name, avatar });
    }, onBack: () => goHash('#/') }));
}
async function route() {
  const m = /^#\/sala\/([A-Za-z0-9]{6})$/.exec(location.hash);
  if (m) {
    const code = m[1]!.toUpperCase();
    if (conn?.room === code) return;
    if (localStorage.getItem(tokenKey(code))) return enterRoom(code, { kind: 'rejoin' });
    return showJoin(code);
  }
  teardown();
  if (location.hash === '#/crear') return showCreate();
  if (location.hash === '#/unirse') return showJoin();
  setScreen(home({ create: () => goHash('#/crear'), join: () => goHash('#/unirse') }));
}
addEventListener('hashchange', () => void route());
document.addEventListener('pg:settings', () => {
  document.getElementById('settings-host')?.remove();
  const host = h('div', { id: 'settings-host' }, settingsModal(() => host.remove())); document.body.append(host);
});
void route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opcional */ });
void profile;
