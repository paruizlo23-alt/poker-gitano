type Kid = Node | string | null | undefined | false;
/** Constructor de DOM seguro: todo texto entra por textContent (nunca innerHTML) y no se usan atributos style (CSP). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}
export const clear = (el: Element): void => { while (el.firstChild) el.removeChild(el.firstChild); };
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
