import { AVATARS, avatarSrc } from './cards.js';
import { clear, h } from './dom.js';
import { profile, saveSettings, settings } from './settings.js';
import { errText } from './texts.js';
export function avatarPicker(current, onPick) {
    const box = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Elige tu avatar' });
    const paint = (sel) => { clear(box); for (const [id, label] of AVATARS)
        box.append(h('button', { class: `av-opt${id === sel ? ' on' : ''}`, role: 'radio', 'aria-checked': String(id === sel), 'aria-label': label, type: 'button', onclick: () => { onPick(id); paint(id); } }, h('img', { src: avatarSrc(id), alt: '', width: '128', height: '128' }))); };
    paint(current);
    return box;
}
export function home(go) {
    return h('main', { class: 'screen home' }, h('div', { class: 'hero glass' }, h('div', { class: 'logo', 'aria-hidden': 'true' }, h('img', { src: '/assets/cards/joker.svg', alt: '' }), h('img', { src: '/assets/cards/oros-1.png', alt: '' }), h('img', { src: '/assets/cards/reverso.svg', alt: '' })), h('h1', { text: 'POKER GITANO' }), h('p', { class: 'tag', text: 'Predice, aguanta y sobrevive. Baraja española, 2 a 7 jugadores, gratis y sin registro.' }), h('div', { class: 'stack' }, h('button', { class: 'btn primary big', text: 'Crear partida', onclick: go.create }), h('button', { class: 'btn big', text: 'Unirse a partida', onclick: go.join })), h('nav', { class: 'links', 'aria-label': 'Ayuda' }, h('a', { href: '/como-jugar', text: 'Cómo jugar' }), h('a', { href: '/como-jugar#reglas', text: 'Reglas' }), h('a', { href: '/faq', text: 'Preguntas frecuentes' }), h('button', { class: 'linklike', text: 'Ajustes', onclick: () => document.dispatchEvent(new CustomEvent('pg:settings')) }))));
}
/** Formulario de nombre + avatar (+ código si se une). */
export function joinForm(opts) {
    let avatar = profile.avatar;
    const name = h('input', { id: 'f-name', maxlength: '20', autocomplete: 'nickname', value: profile.name, placeholder: 'Tu nombre' });
    const code = h('input', { id: 'f-code', maxlength: '6', autocapitalize: 'characters', autocomplete: 'off', value: opts.code ?? '', placeholder: 'ABC123', class: 'code-in' });
    const err = h('p', { class: 'form-err', role: 'alert' });
    const submit = () => {
        const n = name.value.trim();
        const c = code.value.trim().toUpperCase();
        if (!n || n.length > 20) {
            err.textContent = errText('INVALID_NAME');
            name.focus();
            return;
        }
        if (opts.needCode && !/^[A-Z0-9]{6}$/.test(c)) {
            err.textContent = 'El código tiene 6 letras o números.';
            code.focus();
            return;
        }
        profile.name = n;
        profile.avatar = avatar;
        opts.onSubmit({ name: n, avatar, code: c });
    };
    return h('main', { class: 'screen' }, h('form', { class: 'panel glass', onsubmit: (e) => { e.preventDefault(); submit(); } }, h('h2', { text: opts.title }), opts.needCode ? h('label', { for: 'f-code', text: 'Código de la sala' }) : null, opts.needCode ? code : null, h('label', { for: 'f-name', text: 'Nombre' }), name, h('p', { class: 'label', text: 'Avatar' }), avatarPicker(avatar, (id) => { avatar = id; }), err, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', text: 'Atrás', onclick: opts.onBack }), h('button', { class: 'btn primary', type: 'submit', text: opts.submit })), opts.onSpectate ? h('button', { class: 'linklike', type: 'button', text: 'Entrar como espectador', onclick: () => { const c = code.value.trim().toUpperCase() || opts.code || ''; if (/^[A-Z0-9]{6}$/.test(c))
            opts.onSpectate(c);
        else
            err.textContent = 'Escribe el código de la sala.'; } }) : null));
}
export function lobby(s, conn, leave, toast) {
    const v = s.view;
    const me = v.viewerId;
    const host = v.hostId === me;
    const link = `${location.origin}/#/sala/${conn.room}`;
    const act = async (type, extra = {}) => { const r = await conn.cmd(type, extra); if (!r.ok)
        toast(errText(r.code)); };
    return h('main', { class: 'screen' }, h('div', { class: 'panel glass lobby' }, h('h2', { text: 'Sala de espera' }), h('div', { class: 'code-box' }, h('span', { class: 'label', text: 'Código' }), h('strong', { class: 'code', text: conn.room }), h('button', { class: 'btn', text: 'Copiar enlace', onclick: async () => { try {
            await navigator.clipboard.writeText(link);
            toast('Enlace copiado');
        }
        catch {
            toast(link);
        } } })), h('ul', { class: 'players' }, ...v.players.map((p) => h('li', { class: 'player glass' }, h('img', { class: 'avatar', src: avatarSrc(p.avatar), alt: '' }), h('span', { text: p.name }), p.id === v.hostId ? h('span', { class: 'chip gold', text: 'Anfitrión' }) : null, s.seats[p.id]?.bot ? h('span', { class: 'chip', text: 'BOT' }) : null, p.id === me ? h('span', { class: 'chip', text: 'Tú' }) : null))), h('p', { class: 'hint', text: `${v.players.length}/7 jugadores · mínimo 2` }), host ? h('div', { class: 'opts' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Jokers' }, h('span', { class: 'label', text: 'Jokers' }), ...[1, 2].map((n) => h('button', { class: `opt${v.jokers === n ? ' on' : ''}`, 'aria-pressed': String(v.jokers === n), text: String(n), onclick: () => act('setJokers', { value: n }) }))), h('button', { class: 'btn', disabled: v.players.length >= 7, text: 'Añadir bot', onclick: () => act('addBot') })) : null, h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Salir', onclick: leave }), host ? h('button', { class: 'btn primary big', disabled: v.players.length < 2, text: 'Empezar partida', onclick: () => act('start') }) : h('p', { class: 'hint', text: 'Esperando a que el anfitrión inicie la partida…' }))));
}
export function settingsModal(onClose) {
    const seg = (label, key, opts) => h('div', { class: 'seg', role: 'group', 'aria-label': label }, h('span', { class: 'label', text: label }), ...opts.map(([val, text]) => h('button', { class: `opt${settings[key] === val ? ' on' : ''}`, 'aria-pressed': String(settings[key] === val), text, onclick: () => { settings[key] = val; saveSettings(); onClose(); document.dispatchEvent(new CustomEvent('pg:settings')); } })));
    return h('div', { class: 'overlay', onclick: (e) => { if (e.target === e.currentTarget)
            onClose(); } }, h('div', { class: 'modal glass', role: 'dialog', 'aria-label': 'Ajustes' }, h('h2', { text: 'Ajustes' }), seg('Tema', 'theme', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']]), h('label', { class: 'check' }, h('input', { type: 'checkbox', ...(settings.sound ? { checked: true } : {}), onchange: (e) => { settings.sound = e.target.checked; saveSettings(); } }), h('span', { text: 'Sonido' })), h('label', { class: 'label', for: 'vol', text: 'Volumen' }), h('input', { id: 'vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), oninput: (e) => { settings.volume = Number(e.target.value); saveSettings(); } }), seg('Animaciones', 'motion', [['auto', 'Automático'], ['reduce', 'Reducidas'], ['full', 'Completas']]), h('button', { class: 'btn primary', text: 'Cerrar', onclick: onClose })));
}
