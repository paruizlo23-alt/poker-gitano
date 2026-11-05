// Prueba e2e con navegador real: node e2e/play.mjs [full]. Requiere playwright instalado y `npm run build`.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const FULL = process.argv[2] === 'full';
const srv = spawn('tsx', ['src/main.ts'], { cwd: new URL('../../server', import.meta.url).pathname, env: { ...process.env, PORT: '18091', DATA_DIR: './e2e/out-pg-e2e2', BOT_DELAY_MS: FULL ? '150' : '900', RESULT_MS: FULL ? '900' : '5000' } });
srv.stderr.on('data', d => process.stdout.write('[srv!] ' + d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(3000);
const browser = await chromium.launch();
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: FULL ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:18091/'); await page.click('text=Crear partida'); await page.fill('#f-name', 'Ana'); await page.click('button[type=submit]');
await page.waitForSelector('.lobby'); await page.click('text=Añadir bot'); await page.click('text=Añadir bot'); await page.waitForSelector('.player >> nth=2');
await page.click('text=Empezar partida'); await page.waitForSelector('.table');
if (!FULL) { await sleep(700); await page.screenshot({ path: './e2e/out-e1-shuffle.png' }); await sleep(1300); await page.screenshot({ path: './e2e/out-e2-deal.png' }); }
let leak = 0, games = new Set(), shots = 0, acted = 0; const t0 = Date.now();
while (Date.now() - t0 < (FULL ? 240000 : 40000)) {
  if (await page.locator('.final').count()) break;
  const g = await page.locator('.hud .pill').first().textContent().catch(() => ''); games.add(g);
  // fuga: los rivales jamás muestran caras en juegos de varias cartas
  const cards = (await page.locator('.hud .pill').nth(2).textContent().catch(() => '')) || '';
  if (!cards.startsWith('1 ')) leak += await page.locator('.seat:not(.mine) .mini:not(.back)').count();
  const opt = page.locator('.choice .opt:not([disabled])').first();
  if (await opt.count()) { await opt.click(); await page.locator('.choice .btn.primary').click(); acted++; await sleep(150); continue; }
  const hc = page.locator('.hcard'); const btn = page.locator('.hand-zone .btn.primary');
  if (await hc.count() && await btn.count() && await btn.isEnabled().catch(() => false) === false && await page.locator('.status').textContent().then(t => /Tu turno|ÚLTIMA|toca una carta/.test(t ?? '')).catch(() => false)) {
    await hc.first().click(); if (!FULL && shots === 0) { await sleep(400); await page.screenshot({ path: './e2e/out-e3-select.png' }); shots++; }
    if (await btn.isEnabled()) { await btn.click(); acted++; }
  } else if (await page.locator('.hand-zone .btn.primary', { hasText: 'LANZAR' }).count()) { await page.locator('.hand-zone .btn.primary').click(); acted++; }
  if (!FULL && await page.locator('.overlay .res-list').count() && shots === 1) { await page.screenshot({ path: './e2e/out-e4-result.png' }); shots++; }
  await sleep(120);
}
const finished = await page.locator('.final').count();
if (finished) { await sleep(800); await page.screenshot({ path: './e2e/out-e5-final.png' }); }
console.log(JSON.stringify({ finished, games: games.size, acted, leakedFacesInDom: leak, errs }));
await browser.close(); srv.kill(); process.exit(0);
