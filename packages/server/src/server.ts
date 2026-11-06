import { createServer } from 'node:http';
import { promises as fsp } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { RoomManager } from './rooms.js';
import { Command, Room, RoomClient, RoomDeps } from './room.js';
import type { SiteConfig } from './config.js';
import { TokenBucket } from './util.js';
import { WsConnection } from './ws.js';

export interface ServerOptions { site?: SiteConfig; staticDir?: string; allowedOrigin?: string; trustProxy?: boolean; deps?: RoomDeps; heartbeatMs?: number; helloTimeoutMs?: number; msgBurst?: number; msgPerSec?: number }

const MAX_CONN_PER_IP = 30;

export function createGameServer(manager: RoomManager, opts: ServerOptions = {}) {
  /** La publicidad solo se activa si hay ID de AdSense Y el titular se ha identificado con NIF (art. 10 LSSI-CE: actividad económica). */
  const ads = (): string | undefined => (opts.site?.adsClient && opts.site.ownerNif ? opts.site.adsClient : undefined);
  const https = (opts.site?.siteUrl ?? '').startsWith('https://');
  const ipHits = new Map<string, number[]>();
  const ipConns = new Map<string, number>();
  const conns = new Set<WsConnection>();
  const ipOf = (req: any): string => (opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop()!.trim() : '') || req.socket.remoteAddress || '?';
  const limited = (ip: string, max: number, windowMs = 60_000): boolean => {
    const now = Date.now(); const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
    hits.push(now); ipHits.set(ip, hits); return hits.length > max;
  };
  const json = (res: any, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
      ...(opts.allowedOrigin ? { 'access-control-allow-origin': opts.allowedOrigin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } : {}) });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req: any, res: any) => {
    const url = String(req.url ?? '').split('?')[0]!;
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && url === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && url === '/api/config') return json(res, 200, { adsClient: ads() ?? null }); // solo datos públicos
    if (req.method === 'GET' && url === '/ads.txt') {
      if (!ads()) return json(res, 404, { error: 'NOT_FOUND' });
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      return res.end(`google.com, ${ads()!.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
    }
    if (req.method === 'POST' && url === '/api/rooms') {
      if (limited(ipOf(req), 10)) return json(res, 429, { error: 'RATE_LIMIT' });
      const room = manager.create();
      return room ? json(res, 201, { code: room.code }) : json(res, 503, { error: 'SERVER_FULL' });
    }
    const m = /^\/api\/rooms\/([A-Za-z0-9]{6})$/.exec(url);
    if (req.method === 'GET' && m) {
      if (limited(ipOf(req) + ':get', 60)) return json(res, 429, { error: 'RATE_LIMIT' });
      const room = manager.get(m[1]);
      if (!room) return json(res, 404, { exists: false });
      const st = room.match.state;
      return json(res, 200, { exists: true, phase: st.phase, players: st.players.length, canJoin: st.phase === 'lobby' && st.players.length < 7 }); // sin datos privados
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && opts.staticDir) { void serveStatic(req, res, url); return; }
    json(res, 404, { error: 'NOT_FOUND' });
  });

  const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon' };
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ADS_PAGES = new Set(['/como-jugar.html', '/faq.html', '/baraja-espanola.html', '/estrategia.html']);
  /** Sustituye marcadores de titular/dominio (escapados) y activa/desactiva bloques según haya publicidad. Solo para texto. */
  function fill(text: string, ext: string): string {
    const s = opts.site; if (!s) return text;
    const e = ext === '.txt' ? (x: string) => x : esc;
    const map: Record<string, string> = { __SITE_URL__: s.siteUrl, __OWNER_NAME__: s.ownerName || '[titular pendiente de configurar]', __OWNER_ADDRESS__: s.ownerAddress || '[domicilio pendiente de configurar]',
      __OWNER_EMAIL__: s.ownerEmail || '[email pendiente de configurar]', __HOSTING__: s.hosting, __DECK_CREDIT__: s.deckCredit };
    const nifLine = s.ownerNif ? `<li><strong>NIF:</strong> ${esc(s.ownerNif)}</li>` : s.adsClient ? '<li><strong>NIF:</strong> [NIF pendiente de indicar: obligatorio con publicidad]</li>' : '';
    map.__NIF_LINE__ = nifLine; // ya escapado
    map.__ADDR_LINE__ = s.ownerAddress ? `<li><strong>Domicilio:</strong> ${esc(s.ownerAddress)}</li>` : ''; // opcional mientras sea un proyecto personal sin ingresos
    let out = text.replace(/<!--ADS_ON-->([\s\S]*?)<!--\/ADS_ON-->/g, ads() ? '$1' : '').replace(/<!--ADS_OFF-->([\s\S]*?)<!--\/ADS_OFF-->/g, ads() ? '' : '$1').replace(/<!--NIF-->([\s\S]*?)<!--\/NIF-->/g, s.ownerNif ? '$1' : '');
    for (const [k, v] of Object.entries(map)) out = out.split(k).join(k === '__NIF_LINE__' || k === '__ADDR_LINE__' ? v : e(v));
    return out;
  }
  async function serveStatic(req: any, res: any, rawUrl: string) {
    let p: string;
    try { p = decodeURIComponent(rawUrl); } catch { return json(res, 400, { error: 'BAD_REQUEST' }); }
    if (p.includes('\0') || p.split('/').includes('..')) return json(res, 400, { error: 'BAD_REQUEST' });
    if (p.endsWith('/')) p += 'index.html';
    else if (!extname(p)) p += '.html';
    const root = resolve(opts.staticDir!); const file = resolve(join(root, p));
    if (!file.startsWith(root + '/') && file !== root) return json(res, 403, { error: 'FORBIDDEN' });
    try {
      let data = await fsp.readFile(file);
      const ext = extname(file); const html = ext === '.html';
      if (ext === '.html' || ext === '.xml' || ext === '.txt' || ext === '.webmanifest') data = Buffer.from(fill(data.toString('utf8'), ext), 'utf8');
      // Páginas de contenido con anuncios activos: sin CSP propia (la lista de dominios de Google cambia; ver docs). El resto, CSP estricta.
      const noCsp = html && !!ads() && ADS_PAGES.has(p);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'cross-origin-opener-policy': 'same-origin', ...(https ? { 'strict-transport-security': 'max-age=31536000' } : {}),
        'cache-control': ext === '.png' || ext === '.svg' && p.startsWith('/assets/') ? 'public, max-age=604800' : 'no-cache', ...(html ? { ...(noCsp ? {} : { 'content-security-policy': CSP }), 'x-frame-options': 'DENY' } : {}) });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(res, 404, { error: 'NOT_FOUND' }); }
  }

  server.on('upgrade', (req: any, socket: any) => {
    const ip = ipOf(req);
    if (String(req.url ?? '').split('?')[0] !== '/ws') { socket.destroy(); return; }
    if ((ipConns.get(ip) ?? 0) >= MAX_CONN_PER_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
    const ws = WsConnection.accept(req, socket, opts.allowedOrigin);   // sin ALLOWED_ORIGIN: se exige mismo origen si el navegador envía Origin
    if (!ws) return;
    ipConns.set(ip, (ipConns.get(ip) ?? 0) + 1);
    conns.add(ws);
    handleConnection(ws, ip);
  });

  function handleConnection(ws: WsConnection, ip: string) {
    let room: Room | null = null;
    let client: RoomClient | null = null;
    const bucket = new TokenBucket(opts.msgBurst ?? 40, opts.msgPerSec ?? 10);
    let strikes = 0;
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const hello = setTimeout(() => { if (!client) ws.close(1008); }, opts.helloTimeoutMs ?? 10_000);
    ws.onClose = () => {
      clearTimeout(hello); conns.delete(ws);
      ipConns.set(ip, Math.max(0, (ipConns.get(ip) ?? 1) - 1));
      if (room && client) room.detach(client);
    };
    ws.onMessage = (text) => {
      if (!bucket.take()) { send({ t: 'error', code: 'RATE_LIMIT' }); if (++strikes > 50) ws.close(1008); return; }
      let msg: any;
      try { msg = JSON.parse(text); } catch { return send({ t: 'error', code: 'BAD_JSON' }); }
      if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') return send({ t: 'error', code: 'BAD_MESSAGE' });
      if (!client) return void handshake(msg);
      if (msg.t !== 'cmd') return send({ t: 'error', code: 'BAD_MESSAGE' });
      const cmd = msg as Command;
      // el asiento sale de la conexión autenticada, JAMÁS del mensaje
      void room!.command(client.seatId, cmd).then((r) => send(r.ok ? { t: 'ack', id: cmd.id, ...(r.dup ? { dup: true } : {}) } : { t: 'error', id: cmd.id, code: r.code }));
    };
    async function handshake(msg: any) {
      const r = manager.get(msg.room);
      if (!r) { send({ t: 'error', code: 'NO_SUCH_ROOM' }); return ws.close(1008); }
      let seatId: string | null = null; let token: string | undefined;
      if (msg.t === 'join') {
        const res = await r.join(msg.name, msg.avatar);
        if (!res.ok) { send({ t: 'error', code: res.code }); return ws.close(1008); }
        seatId = res.seatId; token = res.token;
      } else if (msg.t === 'rejoin') {
        seatId = r.seatForToken(msg.token);
        if (!seatId) { send({ t: 'error', code: 'BAD_TOKEN' }); return ws.close(1008); }
      } else if (msg.t === 'spectate') {
        if (r.spectatorCount() >= 20) { send({ t: 'error', code: 'SPECTATORS_FULL' }); return ws.close(1008); }
      } else { send({ t: 'error', code: 'BAD_MESSAGE' }); return ws.close(1008); }
      if (ws.closed) return;
      room = r;
      client = { id: Math.random().toString(36).slice(2), seatId, send, close: () => ws.close(1000) };
      send({ t: 'welcome', room: r.code, seatId, ...(token ? { token } : {}) });
      r.attach(client);
    }
  }

  // latido: un ping cada intervalo; sin respuesta en el siguiente → conexión muerta
  const beat = setInterval(() => { for (const c of conns) { if (!c.isAlive) { c.close(1001); continue; } c.isAlive = false; c.ping(); } }, opts.heartbeatMs ?? 10_000);
  const sweep = setInterval(() => manager.cleanup(Date.now()), 60_000);
  beat.unref?.(); sweep.unref?.();
  return {
    server,
    // 0.0.0.0 explícito: los proxies de las plataformas (Render, Docker) conectan por IPv4
    listen: (port: number, host = '0.0.0.0') => new Promise<number>((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise<void>((resolve) => { clearInterval(beat); clearInterval(sweep); for (const c of conns) c.close(1001); for (const r of manager.rooms.values()) r.dispose(); server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}
