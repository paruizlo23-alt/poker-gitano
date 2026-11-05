// Debe importarse PRIMERO: prepara el entorno de la demo antes de que arranque la interfaz real.
import { manager } from './local-net.js';

const ASSETS: Record<string, string> = (window as any).__PG_ASSETS ?? {};
// 1) Las imágenes /assets/... se sirven desde datos incrustados (la interfaz las crea con setAttribute('src', ...))
const origSet = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name: string, value: string) { return origSet.call(this, name, name === 'src' && ASSETS[value] ? ASSETS[value]! : value); };
// 2) Buffer mínimo para Room (comparación de huellas)
(globalThis as any).Buffer ??= { from: (s: string) => new TextEncoder().encode(s) };
// 3) API HTTP simulada con el RoomManager real
const realFetch = window.fetch.bind(window);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
window.fetch = (async (input: any, init?: RequestInit) => {
  const m = /\/api\/rooms(?:\/([A-Za-z0-9]{6}))?$/.exec(String(input).split('?')[0]!);
  if (!m) return realFetch(input, init);
  if (!m[1] && init?.method === 'POST') { const r = manager.create(); return r ? json(201, { code: r.code }) : json(503, { error: 'SERVER_FULL' }); }
  const r = m[1] ? manager.get(m[1]) : undefined;
  if (!r) return json(404, { exists: false });
  const st = r.match.state; return json(200, { exists: true, phase: st.phase, players: st.players.length, canJoin: st.phase === 'lobby' && st.players.length < 7 });
}) as typeof fetch;
