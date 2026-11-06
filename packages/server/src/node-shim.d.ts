// Tipos mínimos para typecheck sin @types/node (instalar @types/node y borrar este archivo en el repo real).
declare const Buffer: any; declare const process: any; declare const console: any; declare const WebSocket: any;
declare function setTimeout(fn: () => void, ms: number): any; declare function clearTimeout(h: any): void;
declare function setInterval(fn: () => void, ms: number): any; declare function clearInterval(h: any): void;
declare function queueMicrotask(fn: () => void): void;
declare module 'node:crypto' { export const randomInt: any, randomBytes: any, createHash: any, timingSafeEqual: any }
declare module 'node:http' { export const createServer: any; export type IncomingMessage = any; export type Server = any }
declare module 'node:fs' { export const promises: any, mkdirSync: any, readdirSync: any, readFileSync: any }
declare module 'node:net' { export const connect: any }
declare module 'node:os' { export const tmpdir: any }
declare module 'node:path' { export const join: any, normalize: any, extname: any, resolve: any }
declare module 'node:test' { export function test(name: string, fn: () => void | Promise<void>): void }
declare module 'node:assert/strict' {
  const assert: { equal(a: unknown, b: unknown, m?: string): void; deepEqual(a: unknown, b: unknown, m?: string): void; ok(v: unknown, m?: string): void; notEqual(a: unknown, b: unknown, m?: string): void };
  export default assert;
}
