// Auditoría automática de adaptación y accesibilidad básica: node e2e/responsive.mjs  (requiere playwright y el servidor arrancable)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 18120;
const srv = spawn('tsx', ['src/main.ts'], { cwd: new URL('../../server', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), DATA_DIR: '/tmp/pg-resp', BOT_DELAY_MS: '300', RESULT_MS: '8000' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);
const VIEWS = [['móvil 360x640', 360, 640], ['tablet 768x1024', 768, 1024], ['escritorio 1440x900', 1440, 900]];
const problems = []; let checks = 0;
const audit = (page) => page.evaluate(() => {
  const out = []; const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`desbordamiento horizontal (${document.documentElement.scrollWidth}>${innerWidth})`);
  for (const el of document.querySelectorAll('button, a[href], input, [role=button]')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.tagName !== 'INPUT' && !name(el)) out.push(`control sin nombre accesible: <${el.tagName.toLowerCase()} class="${el.className}">`);
    if (el.tagName === 'INPUT' && !(el.labels?.length || el.getAttribute('aria-label'))) out.push(`input sin etiqueta: #${el.id}`);
    const inline = el.tagName === 'A' && el.closest('p, li, summary') && !el.closest('nav, .links, .site-footer'); // enlaces de texto en línea: exentos (WCAG 2.2, 2.5.8)
    if (r.height < 32 && !inline && !el.closest('.mini-hand')) out.push(`objetivo táctil bajo (${Math.round(r.height)}px): ${name(el).slice(0, 20)}`);
  }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push(`imagen sin alt: ${img.getAttribute('src')}`);
  if (!document.querySelector('[aria-live]')) out.push('sin región aria-live para estados');
  if (!document.documentElement.lang) out.push('sin atributo lang');
  return out;
});
const browser = await chromium.launch();
for (const [vname, w, h] of VIEWS) for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const tag = `${vname} · ${scheme}`;
  const check = async (screen) => { checks++; for (const p of await audit(page)) problems.push(`[${tag}] ${screen}: ${p}`); };
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('.hero'); await check('inicio');
  await page.click('text=Crear partida'); await page.waitForSelector('#f-name'); await check('formulario');
  await page.fill('#f-name', 'Ana'); await page.click('button[type=submit]'); await page.waitForSelector('.lobby');
  for (let i = 0; i < 6; i++) await page.click('text=Añadir bot'); await check('sala (7 jugadores)');
  await page.click('text=Empezar partida'); await page.waitForSelector('.hcard', { timeout: 15000 }); await sleep(500); await check('mesa 7 jugadores');
  await page.screenshot({ path: `./e2e/out-${w}-${scheme}.png` });
  await page.goto(`http://127.0.0.1:${PORT}/como-jugar`); await check('Cómo jugar');
  if (errs.length) problems.push(`[${tag}] errores de consola: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close(); srv.kill();
console.log(`${checks} comprobaciones de pantalla.`);
console.log(problems.length ? 'PROBLEMAS:\n- ' + [...new Set(problems)].join('\n- ') : 'Sin problemas detectados.');
process.exit(problems.length ? 1 : 0);
