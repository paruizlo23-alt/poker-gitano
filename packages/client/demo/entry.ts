import './patches.js';
import '../src/main.js';
import { manager, setSpeed } from './local-net.js';

const rules = (window as any).__PG_RULES as string;
const host = document.createElement('div'); host.id = 'demo-rules'; document.body.append(host);
function showRules() {
  host.innerHTML = '';
  const ov = document.createElement('div'); ov.className = 'overlay';
  const modal = document.createElement('div'); modal.className = 'modal glass'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Reglas');
  const body = document.createElement('div'); body.className = 'doc'; body.innerHTML = rules;   // contenido propio incrustado en el build
  const close = document.createElement('button'); close.className = 'btn primary'; close.textContent = 'Cerrar'; close.onclick = () => (host.innerHTML = '');
  modal.append(body, close); ov.append(modal); ov.addEventListener('click', (e) => { if (e.target === ov) host.innerHTML = ''; }); host.append(ov);
}
// enlaces absolutos (/como-jugar, /faq...) no existen en un archivo local: se muestra la guía de reglas incrustada
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a[href^="/"]'); if (!a) return;
  e.preventDefault(); showRules();
}, true);

const bar = document.createElement('div'); bar.className = 'demo-pill';
const menu = document.createElement('div'); menu.className = 'demo-menu';
const toggle = document.createElement('button'); toggle.className = 'demo-toggle'; toggle.textContent = 'demo'; toggle.setAttribute('aria-label', 'Opciones de la demo'); toggle.setAttribute('aria-expanded', 'false');
toggle.onclick = () => { const open = bar.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); };
const note = document.createElement('p'); note.textContent = 'Demo local: todo corre en tu navegador, sin servidor.';
const speed = document.createElement('button'); speed.textContent = 'Bots: normal';
let fast = false; speed.onclick = () => { fast = !fast; setSpeed(fast); speed.textContent = fast ? 'Bots: rápidos' : 'Bots: normal'; };
const help = document.createElement('button'); help.textContent = 'Reglas'; help.onclick = () => { bar.classList.remove('open'); showRules(); };
const reset = document.createElement('button'); reset.textContent = 'Reiniciar demo'; reset.onclick = () => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('pg:token:')) localStorage.removeItem(k); } catch { /* noop */ } location.hash = '#/'; location.reload(); };
menu.append(note, speed, help, reset); bar.append(menu, toggle); document.body.append(bar);
void manager;
