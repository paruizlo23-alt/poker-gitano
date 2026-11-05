// Declaraciones mínimas para typecheck sin @types/node (en el repo real: instalar @types/node y borrar este archivo).
declare module 'node:crypto' { export function randomInt(max: number): number }
declare module 'node:test' { export function test(name: string, fn: () => void | Promise<void>): void }
declare module 'node:assert/strict' {
  const assert: {
    equal(a: unknown, b: unknown, m?: string): void; deepEqual(a: unknown, b: unknown, m?: string): void;
    ok(v: unknown, m?: string): void; throws(fn: () => unknown, e?: unknown): void; notEqual(a: unknown, b: unknown, m?: string): void; fail(m?: string): never;
  };
  export default assert;
}
