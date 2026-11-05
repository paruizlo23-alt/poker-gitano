import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { RoomManager } from '../src/rooms.js';
import { createGameServer } from '../src/server.js';
import type { SiteConfig } from '../src/config.js';

const PUBLIC = new URL('../../client/public', import.meta.url).pathname;
const SITE: SiteConfig = { siteUrl: 'https://ejemplo.test', ownerName: 'Pablo Ruiz Lozano', ownerAddress: 'Puente Genil (Córdoba), España', ownerEmail: 'titular@ejemplo.test', ownerNif: '12345678Z', hosting: 'Proveedor X', deckCredit: 'una baraja libre' };
async function boot(site: SiteConfig) {
  const app = createGameServer(new RoomManager({}), { staticDir: PUBLIC, site });
  const port = await app.listen(0); return { app, http: `http://127.0.0.1:${port}` };
}
const PAGES = ['/', '/como-jugar', '/estrategia', '/baraja-espanola', '/faq', '/aviso-legal', '/privacidad', '/cookies', '/condiciones'];
const get = async (u: string, p: string) => { const r = await fetch(u + p); return { r, t: await r.text() }; };

test('páginas: existen, sin marcadores sin resolver, con título, h1, canonical y pie legal', async () => {
  const s = await boot(SITE);
  for (const p of PAGES) {
    const { r, t } = await get(s.http, p);
    assert.equal(r.status, 200, p);
    assert.ok(!/__[A-Z_]+__/.test(t), `${p} deja marcadores sin sustituir`);
    assert.ok(/<title>[^<]{10,}<\/title>/.test(t), `${p} sin title`);
    assert.ok(t.includes(`<link rel="canonical" href="https://ejemplo.test${p === '/' ? '/' : p}">`), `${p} sin canonical correcto`);
    for (const l of ['/aviso-legal', '/privacidad', '/cookies', '/condiciones']) assert.ok(t.includes(`href="${l}"`), `${p} sin enlace a ${l}`);
    if (p !== '/') assert.ok(t.includes('<h1>'), `${p} sin h1`);
  }
  await s.app.close();
});
test('enlaces internos y recursos de todas las páginas responden 200 (sin enlaces rotos)', async () => {
  const s = await boot(SITE); const seen = new Set<string>(); const bad: string[] = [];
  for (const p of PAGES) {
    const { t } = await get(s.http, p);
    for (const m of t.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)) {
      const u = m[1]!; if (seen.has(u) || u.startsWith('/api')) continue; seen.add(u);
      const r = await fetch(s.http + u); if (r.status !== 200) bad.push(`${u} → ${r.status} (en ${p})`);
    }
  }
  assert.deepEqual(bad, []); assert.ok(seen.size > 20);
  await s.app.close();
});
test('titular: datos reales escapados; sin NIF se avisa visiblemente', async () => {
  const evil = await boot({ ...SITE, ownerName: 'A<script>x</script>&"B' });
  const { t } = await get(evil.http, '/aviso-legal');
  assert.ok(!t.includes('<script>x</script>')); assert.ok(t.includes('A&lt;script&gt;x&lt;/script&gt;&amp;&quot;B'));
  await evil.app.close();
  const ok = await boot(SITE); const a = (await get(ok.http, '/aviso-legal')).t;
  for (const v of ['Pablo Ruiz Lozano', 'Puente Genil', 'titular@ejemplo.test', '12345678Z']) assert.ok(a.includes(v), v);
  await ok.app.close();
  // sin NIF: no se muestra línea de NIF y se declara proyecto personal sin publicidad
  const noNif = await boot({ ...SITE, ownerNif: '' }); const n = (await get(noNif.http, '/aviso-legal')).t;
  assert.ok(!n.includes('NIF')); assert.ok(n.includes('sin publicidad')); assert.ok(!/\[[^\]]*pendiente/.test(n));
  await noNif.app.close();
});
test('sin publicidad: sin ads.txt, config nula, CSP estricta y textos sin AdSense', async () => {
  const s = await boot(SITE);
  assert.equal((await fetch(`${s.http}/ads.txt`)).status, 404);
  assert.deepEqual(await (await fetch(`${s.http}/api/config`)).json(), { adsClient: null });
  assert.ok((await fetch(`${s.http}/como-jugar`)).headers.get('content-security-policy')?.includes("script-src 'self'"));
  const c = (await get(s.http, '/cookies')).t; assert.ok(c.includes('no muestra publicidad')); assert.ok(!c.includes('Google AdSense'));
  assert.ok(!(await get(s.http, '/privacidad')).t.includes('Google actúa como proveedor'));
  await s.app.close();
});
test('con publicidad: ads.txt correcto, CSP solo relajada en páginas de contenido, textos legales actualizados', async () => {
  const s = await boot({ ...SITE, adsClient: 'ca-pub-1234567890123456' });
  assert.equal(await (await fetch(`${s.http}/ads.txt`)).text(), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  assert.deepEqual(await (await fetch(`${s.http}/api/config`)).json(), { adsClient: 'ca-pub-1234567890123456' });
  assert.equal((await fetch(`${s.http}/como-jugar`)).headers.get('content-security-policy'), null);
  for (const p of ['/', '/aviso-legal', '/privacidad', '/cookies', '/condiciones']) assert.ok((await fetch(s.http + p)).headers.get('content-security-policy'), `${p} debe conservar CSP`);
  assert.ok((await get(s.http, '/cookies')).t.includes('Google AdSense')); assert.ok(!(await get(s.http, '/cookies')).t.includes('no muestra publicidad'));
  assert.ok((await get(s.http, '/privacidad')).t.includes('consentimiento'));
  await s.app.close();
});
test('SEO: robots y sitemap con dominio absoluto; JSON-LD en portada y FAQ coherente', async () => {
  const s = await boot(SITE);
  const robots = (await get(s.http, '/robots.txt')).t; assert.ok(robots.includes('Sitemap: https://ejemplo.test/sitemap.xml')); assert.ok(robots.includes('Disallow: /api/'));
  const sm = (await get(s.http, '/sitemap.xml')).t; for (const p of PAGES) assert.ok(sm.includes(`<loc>https://ejemplo.test${p === '/' ? '/' : p}</loc>`), p);
  assert.ok((await get(s.http, '/')).t.includes('"@type":"WebApplication"'));
  const faq = (await get(s.http, '/faq')).t; const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(faq)![1]!.replace(/&quot;/g, '"'));
  assert.equal(ld['@type'], 'FAQPage');
  for (const q of ld.mainEntity) assert.ok(faq.includes(q.acceptedAnswer.text.replace(/&/g, '&amp;')), `respuesta de FAQ no visible: ${q.name}`);
  await s.app.close();
});
test('legal: el código fuente de /public no contiene datos personales fijos ni NIF', () => {
  const files = (readdirSync(PUBLIC) as string[]).filter((f) => f.endsWith('.html'));
  for (const f of files) { const t = readFileSync(`${PUBLIC}/${f}`, 'utf8'); assert.ok(!/ruizlozano|gmail\.com|Puente Genil/i.test(t), `${f} lleva datos personales fijos`); }
});

test('sin NIF la publicidad NO se activa aunque haya ID de AdSense (art. 10 LSSI-CE)', async () => {
  const s = await boot({ ...SITE, ownerNif: '', adsClient: 'ca-pub-1234567890123456' });
  assert.equal((await fetch(`${s.http}/ads.txt`)).status, 404);
  assert.deepEqual(await (await fetch(`${s.http}/api/config`)).json(), { adsClient: null });
  assert.ok((await fetch(`${s.http}/como-jugar`)).headers.get('content-security-policy'));
  assert.ok((await get(s.http, '/cookies')).t.includes('no muestra publicidad'));
  await s.app.close();
});
test('config: ADSENSE sin OWNER_NIF se ignora; el origen WS sale de SITE_URL', async () => {
  const { loadConfig } = await import('../src/config.js');
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'ca-pub-1234567890123456' }).site.adsClient, undefined);
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'pub-1234567890123456', OWNER_NIF: 'X' }).site.adsClient, 'ca-pub-1234567890123456');
  assert.equal(loadConfig({ SITE_URL: 'https://pokergitano.es/' }).allowedOrigin, 'https://pokergitano.es');
  assert.equal(loadConfig({ SITE_URL: 'https://pokergitano.es/' }).site.siteUrl, 'https://pokergitano.es');
});
test('cabeceras: HSTS solo con https; sin permisos innecesarios', async () => {
  const h = await boot({ ...SITE }); const r = await fetch(`${h.http}/`);
  assert.ok(r.headers.get('strict-transport-security')); assert.ok(r.headers.get('permissions-policy')?.includes('camera=()')); assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
  await h.app.close();
  const l = await boot({ ...SITE, siteUrl: 'http://localhost:1' }); assert.equal((await fetch(`${l.http}/`)).headers.get('strict-transport-security'), null);
  await l.app.close();
});

import { loadConfig } from '../src/config.js';
test('config: sin OWNER_NIF la publicidad NO se activa aunque haya ADSENSE_CLIENT', () => {
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'ca-pub-1234567890123456' }).site.adsClient, undefined);
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'ca-pub-1234567890123456', OWNER_NIF: '  ' }).site.adsClient, undefined);
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'pub-1234567890123456', OWNER_NIF: '12345678Z' }).site.adsClient, 'ca-pub-1234567890123456');
  assert.equal(loadConfig({ ADSENSE_CLIENT: 'basura', OWNER_NIF: '12345678Z' }).site.adsClient, undefined);
});

test('domicilio opcional: sin él la línea desaparece (sin avisos de pendiente); con él se muestra escapado', async () => {
  const none = await boot({ ...SITE, ownerAddress: '', ownerNif: '' });
  for (const p of ['/aviso-legal', '/privacidad']) { const x = (await get(none.http, p)).t; assert.ok(!x.includes('Domicilio')); assert.ok(!/pendiente/i.test(x), `${p} muestra un aviso de pendiente`); assert.ok(x.includes('Pablo Ruiz Lozano') && x.includes('titular@ejemplo.test')); }
  await none.app.close();
  const some = await boot({ ...SITE, ownerAddress: 'Calle <b>1</b>' }); const y = (await get(some.http, '/aviso-legal')).t;
  assert.ok(y.includes('Domicilio:') && y.includes('Calle &lt;b&gt;1&lt;/b&gt;')); await some.app.close();
});
