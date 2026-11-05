import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../..', import.meta.url).pathname;
const list = (dir: string, ext: string): string[] => (readdirSync(dir) as string[]).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);

test('auditoría del cliente: sin innerHTML/eval/document.write ni inyección de HTML', () => {
  for (const f of list(`${ROOT}client/src`, '.ts')) {
    const t = readFileSync(f, 'utf8');
    for (const bad of [/\.innerHTML\s*=/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /javascript:/]) assert.ok(!bad.test(t), `${f} usa ${bad}`);
  }
});
test('auditoría de páginas: sin scripts ni estilos en línea, sin manejadores onclick=', () => {
  for (const f of list(`${ROOT}client/public`, '.html')) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/\sstyle="/.test(t), `${f} tiene style en línea (rompe la CSP)`);
    assert.ok(!/\son[a-z]+="/.test(t), `${f} tiene manejadores en línea`);
    for (const m of t.matchAll(/<script\b([^>]*)>/g)) assert.ok(/\bsrc=/.test(m[1]!) || /application\/ld\+json/.test(m[1]!), `${f} tiene script en línea`);
  }
});
test('cadena de suministro: ningún paquete del proyecto tiene dependencias externas en ejecución', () => {
  for (const p of ['engine', 'server', 'client']) {
    const deps = JSON.parse(readFileSync(`${ROOT}${p}/package.json`, 'utf8')).dependencies ?? {};
    for (const d of Object.keys(deps)) assert.ok(d.startsWith('@poker-gitano/'), `${p} depende de ${d}`);
  }
});
test('secretos: el servidor no escribe tokens ni hashes en logs', () => {
  for (const f of list(`${ROOT}server/src`, '.ts')) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/console\.(log|error|warn)\(([^)]*)\)/g)) assert.ok(!/token|hash/i.test(m[2]!), `${f}: log con token/hash → ${m[0]}`);
  }
});
