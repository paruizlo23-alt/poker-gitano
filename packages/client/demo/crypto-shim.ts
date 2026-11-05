// SOLO PARA LA DEMO EN NAVEGADOR: sustituye node:crypto. El hash de asiento NO es seguro aquí (no hay adversario en una demo local).
export function randomInt(max: number): number {
  const a = new Uint32Array(1); const limit = Math.floor(0x100000000 / max) * max;
  do { crypto.getRandomValues(a); } while (a[0]! >= limit);
  return a[0]! % max;
}
export function randomBytes(n: number) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return { toString: (_enc?: string) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}
export function createHash(_alg: string) {
  let s = '';
  const o = { update(x: string) { s += x; return o; }, digest(_enc?: string) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const out: string[] = [];
    for (let k = 0; k < 8; k++) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i) + k; h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } out.push((h1 >>> 0).toString(16).padStart(8, '0')); h1 ^= h2; }
    return out.join('').slice(0, 64);
  } };
  return o;
}
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!; return d === 0; }
