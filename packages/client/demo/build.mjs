// Genera demo.html: UNA sola página que incluye motor, bots, sala, interfaz y todas las imágenes. Funciona abriéndola con doble clic, sin servidor.
// Uso: node packages/client/demo/build.mjs   (requiere esbuild: npm install, o el que trae tsx)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const pub = join(root, 'packages/client/public');
const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = await import('esbuild'); }
catch { esbuild = require('/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild'); }

const plugin = {
  name: 'demo', setup(b) {
    b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: join(here, 'crypto-shim.ts') }));
    b.onResolve({ filter: /^@poker-gitano\/engine$/ }, () => ({ path: join(root, 'packages/engine/src/index.ts') }));
    b.onResolve({ filter: /^\.\/net\.js$/ }, (a) => (a.importer.includes('/client/src/') ? { path: join(here, 'local-net.ts') } : undefined));
  },
};
const out = await esbuild.build({ entryPoints: [join(here, 'entry.ts')], bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, plugins: [plugin], logLevel: 'warning', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// imágenes → data URIs
const mime = { png: 'image/png', svg: 'image/svg+xml' };
const assets = {};
for (const dir of ['cards', 'avatars']) for (const f of readdirSync(join(pub, 'assets', dir))) {
  const ext = f.split('.').pop();
  assets[`/assets/${dir}/${f}`] = `data:${mime[ext]};base64,${readFileSync(join(pub, 'assets', dir, f)).toString('base64')}`;
}
// reglas incrustadas (de la página real "Cómo jugar")
let rules = readFileSync(join(pub, 'como-jugar.html'), 'utf8');
rules = rules.slice(rules.indexOf('<h1>'), rules.indexOf('<footer'));
rules = rules.replace(/<div class="demo"[\s\S]*?<\/div>/, '').replace(/<a class="btn primary" href="\/">Jugar ahora<\/a>/g, '').replace(/ href="\/[^"]*"/g, ' href="#"').replace(/src="(\/assets\/[^"]+)"/g, (_, p) => `src="${assets[p] ?? p}"`).replace(/ loading="lazy"/g, '');
const css = readFileSync(join(pub, 'styles.css'), 'utf8') + `
.demo-pill{position:fixed;left:8px;bottom:8px;z-index:90;display:flex;flex-direction:column;align-items:flex-start;gap:6px;font:600 12px system-ui,sans-serif}
.demo-toggle{width:auto;height:26px;padding:0 10px;border:0;border-radius:99px;background:rgba(20,12,34,.7);color:#fff;font:inherit;cursor:pointer;opacity:.7}.demo-toggle:hover,.demo-pill.open .demo-toggle{opacity:1}
.demo-menu{display:none;flex-direction:column;gap:6px;background:rgba(20,12,34,.92);color:#fff;border-radius:14px;padding:10px;width:210px}.demo-pill.open .demo-menu{display:flex}
.demo-menu p{margin:0 0 2px;font-weight:500;opacity:.85}.demo-menu button{font:inherit;color:#fff;background:rgba(255,255,255,.18);border:0;border-radius:10px;padding:8px;cursor:pointer;text-align:left}.demo-menu button:hover{background:rgba(255,255,255,.3)}
#demo-rules .overlay{position:fixed}#demo-rules .doc{padding:0}`;
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Poker Gitano · Demo local</title><meta name="theme-color" content="#241038">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(readFileSync(join(pub, 'favicon.svg'))).toString('base64')}">
<style>${css}</style></head>
<body><div id="app"></div>
<script>window.__PG_ASSETS=${JSON.stringify(assets)};window.__PG_RULES=${JSON.stringify(rules).replace(/<\//g, '<\\/')};</script>
<script>${js}</script></body></html>`;
const target = join(root, 'demo.html');
writeFileSync(target, html);
console.log(`demo.html generado: ${(html.length / 1024).toFixed(0)} KB (JS ${(js.length / 1024).toFixed(0)} KB, ${Object.keys(assets).length} imágenes)`);
