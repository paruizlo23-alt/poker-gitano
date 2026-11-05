import { avatarSrc, BACK, cardName, cardSrc } from './cards.js';
import { clear, h, sleep } from './dom.js';
import { motionReduced } from './settings.js';
import { sfx } from './sound.js';
import { errText } from './texts.js';
const HOLD_MS = 1900;
const pname = (v, id) => v.players.find((p) => p.id === id)?.name ?? '?';
const predText = (p) => (p === undefined ? '–' : p === 'oculta' ? '✔ lista' : String(p));
export class Table {
    conn;
    onLeave;
    el = h('div', { class: 'table' });
    body = h('div', { class: 'tbody' });
    fx = h('div', { class: 'fx', 'aria-hidden': 'true' });
    live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    toastEl = h('div', { class: 'toast', role: 'status' });
    st = null;
    selKey = null;
    selPred = null;
    busy = false;
    hold = null;
    histLen = 0;
    gameNo = 0;
    dealing = false;
    dealMsg = '';
    revealedFor = 0;
    resultClosed = 0;
    seen = new Set();
    timerEl = null;
    tick;
    toastTimer;
    lastLive = '';
    constructor(conn, onLeave) {
        this.conn = conn;
        this.onLeave = onLeave;
        this.el.append(this.body, this.fx, this.live, this.toastEl);
        this.tick = window.setInterval(() => this.updateTimer(), 250);
    }
    destroy() { clearInterval(this.tick); }
    me() { return this.st?.view.role === 'player' ? this.st.view.viewerId : null; }
    // ---------- entrada de datos ----------
    setState(s) {
        const prev = this.st;
        this.st = s;
        const v = s.view;
        const g = v.game;
        if (g) {
            if (g.number !== this.gameNo) {
                const fresh = g.round === 1 && g.played.length === 0 && Object.keys(g.predictions).length === 0 && v.phase === 'predicting';
                this.gameNo = g.number;
                this.histLen = 0;
                this.selKey = null;
                this.selPred = null;
                this.hold = null;
                if (fresh && !motionReduced())
                    void this.animateDeal(v);
            }
            if (g.history.length > this.histLen) {
                if (prev && this.histLen > 0 || (prev && g.history.length > 0)) {
                    const r = g.history[g.history.length - 1];
                    this.hold = { plays: r.plays, winnerId: r.winnerId, until: Date.now() + (motionReduced() ? 700 : HOLD_MS) };
                    window.setTimeout(() => { if (this.hold && Date.now() >= this.hold.until - 20) {
                        this.hold = null;
                        this.render();
                    } }, (motionReduced() ? 700 : HOLD_MS) + 30);
                }
                this.histLen = g.history.length;
            }
        }
        if (this.me() && prev?.view.game?.turnId !== v.game?.turnId && v.game?.turnId === this.me())
            sfx.turn();
        this.render();
    }
    onEvent(ev) {
        const v = this.st?.view;
        if (!v)
            return;
        switch (ev.e) {
            case 'played':
                sfx.throwCard();
                break;
            case 'roundWon':
                sfx.roundWin();
                break;
            case 'gameResult': {
                const rows = ev.result.rows;
                if (rows.some((r) => r.livesAfter < r.livesBefore))
                    sfx.loseLife();
                if (rows.some((r) => r.statusAfter === 'repesca'))
                    window.setTimeout(() => sfx.repesca(), 500);
                break;
            }
            case 'penalty':
                sfx.penalty();
                this.toast(`PENALTIS · intento ${ev.attempt}`);
                break;
            case 'finished':
                sfx.victory();
                break;
            case 'botTakeover':
                this.toast(`${pname(v, ev.playerId)} es sustituido por un bot (${ev.reason === 'timeout' ? 'inactividad' : 'desconexión'}).`);
                break;
            case 'humanBack':
                this.toast(`${pname(v, ev.playerId)} vuelve a la partida.`);
                break;
            case 'timeout':
                if (ev.playerId === this.me())
                    this.toast('Se acabó el tiempo: el servidor jugó por ti.');
                break;
            case 'error':
                this.toast(errText(ev.code));
                break;
        }
    }
    toast(msg) {
        this.toastEl.textContent = msg;
        this.toastEl.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 3800);
    }
    // ---------- acciones ----------
    async send(type, extra) {
        if (this.busy)
            return;
        this.busy = true;
        this.render(); // bloquea la interacción mientras valida el servidor
        const r = await this.conn.cmd(type, extra);
        this.busy = false;
        if (!r.ok)
            this.toast(errText(r.code)); // restaura: la selección se conserva
        else {
            this.selKey = null;
            this.selPred = null;
        }
        this.render();
    }
    // ---------- render ----------
    render() {
        const s = this.st;
        if (!s)
            return;
        const v = s.view;
        clear(this.body);
        this.timerEl = null;
        this.body.append(this.hud(v), this.rivals(s), this.center(s), this.bottom(s));
        if (v.phase === 'gameResult' && v.lastResult && this.resultClosed !== v.lastResult.gameNumber)
            this.body.append(this.resultOverlay(s));
        if (v.phase === 'finished')
            this.body.append(this.finalScreen(v));
        const t = this.statusText(s);
        if (t !== this.lastLive) {
            this.live.textContent = t;
            this.lastLive = t;
        }
        this.updateTimer();
    }
    hud(v) {
        const g = v.game;
        const pen = v.penalty;
        const info = pen ? [`PENALTIS · intento ${pen.attempt}`] : g ? [`Juego ${g.number}`, `Ronda ${g.round}/${g.cards}`, `${g.cards} ${g.cards === 1 ? 'carta' : 'cartas'}`, `Baraja: ${pname(v, g.dealerId)}`] : [];
        const turnId = pen ? pen.turnId : g?.turnId;
        return h('header', { class: 'hud glass' }, h('div', { class: 'hud-info' }, ...info.map((t) => h('span', { class: 'pill', text: t })), turnId ? h('span', { class: 'pill hot', text: `Turno: ${pname(v, turnId)}` }) : null), h('div', { class: 'hud-actions' }, h('a', { class: 'icon-btn', href: '/como-jugar', target: '_blank', rel: 'noopener', 'aria-label': 'Cómo jugar', text: '?' }), h('button', { class: 'icon-btn', 'aria-label': 'Ajustes', text: '⚙', onclick: () => document.dispatchEvent(new CustomEvent('pg:settings')) }), h('button', { class: 'icon-btn', 'aria-label': 'Salir de la partida', text: '⏻', onclick: () => { if (confirm('¿Salir de la partida? Un bot ocupará tu asiento.'))
                this.onLeave(); } })));
    }
    hearts(p) {
        return h('span', { class: 'hearts', 'aria-label': `${p.lives} vidas` }, ...[0, 1, 2].map((i) => h('span', { class: i < p.lives ? 'heart full' : 'heart', text: '♥' })));
    }
    seat(p, s, mine) {
        const v = s.view;
        const g = v.game;
        const pen = v.penalty;
        const turnId = pen ? pen.turnId : g?.turnId;
        const info = s.seats[p.id];
        const hand = (pen ? pen.hands[p.id] : g?.hands[p.id]);
        const pred = pen ? pen.predictions[p.id] : g?.predictions[p.id];
        const chips = [];
        if (p.status === 'repesca')
            chips.push(h('span', { class: 'chip warn', text: 'ÚLTIMA OPORTUNIDAD' }));
        if (p.status === 'ultimaVida')
            chips.push(h('span', { class: 'chip gold', text: 'Última vida' }));
        if (p.status === 'eliminado')
            chips.push(h('span', { class: 'chip', text: 'Espectador' }));
        if (info?.bot)
            chips.push(h('span', { class: 'chip', text: 'BOT' }));
        if (info && !info.connected && !info.bot)
            chips.push(h('span', { class: 'chip', text: 'sin conexión' }));
        const hasPred = pred !== undefined;
        return h('div', { class: `seat glass${turnId === p.id ? ' turn' : ''}${p.status === 'eliminado' ? ' out' : ''}${mine ? ' mine' : ''}`, 'data-seat': p.id }, h('img', { class: 'avatar', src: avatarSrc(p.avatar), alt: '' }), h('div', { class: 'seat-main' }, h('div', { class: 'seat-name', text: p.name }), this.hearts(p), h('div', { class: 'seat-stats' }, hasPred ? h('span', { class: 'chip pred', text: `Pred. ${predText(pred)}` }) : null, g && !pen && hasPred ? h('span', { class: 'chip wins', text: `Gana ${g.wins[p.id] ?? 0}` }) : null), h('div', { class: 'chips' }, ...chips)), hand && !mine ? h('div', { class: 'mini-hand' }, ...(hand.cards ? hand.cards.map((c) => h('img', { class: 'mini', src: cardSrc(c), alt: cardName(c) })) : Array.from({ length: Math.min(hand.count, 5) }, () => h('img', { class: 'mini back', src: BACK, alt: '' })))) : null);
    }
    avatarOf(p) { return this.st?.view.players.find((x) => x.id === p.id)?.avatar ?? 'capibara'; }
    rivals(s) {
        const me = this.me();
        const list = s.view.players.filter((p) => p.id !== me);
        return h('section', { class: `rivals n${list.length}`, 'aria-label': 'Jugadores' }, ...list.map((p) => this.seat(p, s, false)));
    }
    statusText(s) {
        const v = s.view;
        const g = v.game;
        const pen = v.penalty;
        const me = this.me();
        if (v.phase === 'finished')
            return `¡Tenemos ganador! ${pname(v, v.winnerId ?? '')}`;
        if (this.dealing)
            return this.dealMsg;
        if (this.hold)
            return `${pname(v, this.hold.winnerId)} gana la ronda.`;
        if (v.role === 'spectator')
            return 'Eres espectador: ves las manos de todos los jugadores.';
        const mine = me ? v.players.find((p) => p.id === me) : undefined;
        if (me && s.seats[me]?.bot)
            return 'Un bot juega por ti por inactividad. Actúa para recuperar el control.';
        if (pen) {
            if (v.phase === 'penaltyPredicting')
                return pen.ids.includes(me ?? '') && !pen.predictions[me] ? 'PENALTIS: nadie ve su carta. ¿Tu carta GANARÁ o PERDERÁ?' : 'PENALTIS: esperando las predicciones…';
            return pen.turnId === me ? 'PENALTIS: lanza tu carta a ciegas.' : `PENALTIS: lanza ${pname(v, pen.turnId ?? '')}…`;
        }
        if (!g)
            return '';
        if (v.phase === 'gameResult')
            return 'Fin del juego. Resultados en pantalla.';
        if (v.phase === 'predicting') {
            if (g.allowedPredictions.length) {
                const f = g.forbiddenPrediction;
                if (g.cards === 1)
                    return 'Mira las cartas rivales (no ves la tuya). ¿Ganarás o perderás?';
                return `Tu turno: predice cuántas rondas ganarás (0–${g.cards}).${f !== null ? ` No puedes elegir ${f}: la suma igualaría las rondas.` : ''}`;
            }
            if (g.cards === 1 && me && g.predictions[me] !== undefined)
                return 'Predicción hecha. Esperando al resto…';
            return g.turnId ? `${pname(v, g.turnId)} está prediciendo…` : 'Esperando…';
        }
        if (g.turnId === me) {
            if (mine?.status === 'repesca')
                return 'ÚLTIMA OPORTUNIDAD: juegas a ciegas. Elige una carta y pulsa SELECCIONAR.';
            return this.selKey ? 'Carta seleccionada. Pulsa SELECCIONAR para lanzarla.' : 'Tu turno: toca una carta para verla y pulsa SELECCIONAR.';
        }
        return g.turnId ? `Turno de ${pname(v, g.turnId)}…` : '';
    }
    center(s) {
        const v = s.view;
        const pen = v.penalty;
        const g = v.game;
        const plays = this.hold ? this.hold.plays : pen ? pen.played : g?.played ?? [];
        const key = (p) => (pen ? `p${pen.attempt}:` : `${g?.number}:${this.hold ? (g.history.length) : g?.round}:`) + p.playerId;
        const wrap = h('div', { class: 'plays' }, ...plays.map((p) => {
            const win = !!this.hold && this.hold.winnerId === p.playerId;
            const el = h('figure', { class: `play${win ? ' winner' : ''}`, 'data-play': p.playerId }, h('img', { src: cardSrc(p.card), alt: cardName(p.card) }), h('figcaption', {}, h('img', { class: 'cap-av', src: avatarSrc(this.avatarOf({ id: p.playerId })), alt: '' }), h('span', { text: pname(v, p.playerId) })), win ? h('span', { class: 'win-tag', text: '¡Gana!' }) : null);
            const k = key(p);
            if (!this.seen.has(k)) {
                this.seen.add(k);
                requestAnimationFrame(() => this.flyIn(el, p.playerId));
            }
            return el;
        }));
        return h('section', { class: 'center', 'aria-label': 'Mesa' }, h('p', { class: 'status', text: this.statusText(s) }), wrap);
    }
    flyIn(el, fromId) {
        if (motionReduced())
            return;
        const src = this.body.querySelector(`[data-seat="${fromId}"]`) ?? this.body.querySelector('.hand-zone');
        if (!src || !el.isConnected)
            return;
        const a = src.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        const rot = Math.round((Math.random() - 0.5) * 50);
        el.animate([{ transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(.55)`, opacity: 0.3, filter: 'drop-shadow(0 18px 14px rgba(0,0,0,.45))' },
            { transform: 'translate(0,0) rotate(0deg) scale(1.1)', opacity: 1, offset: 0.78, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,.4))' },
            { transform: 'none', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.3))' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    // ---------- zona inferior ----------
    bottom(s) {
        const v = s.view;
        const g = v.game;
        const pen = v.penalty;
        const me = this.me();
        const root = h('section', { class: 'bottom', 'aria-label': 'Tu zona' });
        if (v.role === 'spectator' || !me) {
            root.append(h('div', { class: 'spec-note glass', text: v.phase === 'finished' ? 'Partida terminada.' : 'Modo espectador' }));
            return root;
        }
        const mine = v.players.find((p) => p.id === me);
        root.append(this.seat(mine, s, true));
        const lock = this.busy || this.dealing || !!this.hold;
        if (pen && pen.ids.includes(me)) {
            if (v.phase === 'penaltyPredicting' && pen.predictions[me] === undefined)
                root.append(this.choicePanel(['GANO', 'PIERDO'], lock, 'Confirmar predicción', (x) => this.send('predict', { value: x })));
            else if (v.phase === 'penaltyPlaying' && pen.turnId === me)
                root.append(h('div', { class: 'hand-zone' }, h('button', { class: 'btn primary big', disabled: lock, text: 'LANZAR MI CARTA', onclick: () => this.send('play', { pos: 0 }) })));
            else
                root.append(h('p', { class: 'wait', text: 'Esperando…' }));
            return root;
        }
        if (!g)
            return root;
        if (g.allowedPredictions.length && !this.dealing) {
            const opts = g.cards === 1 ? ['GANO', 'PIERDO'] : Array.from({ length: g.cards + 1 }, (_, i) => i);
            root.append(this.choicePanel(opts, lock, 'Confirmar predicción', (x) => this.send('predict', { value: x }), g.forbiddenPrediction));
        }
        const hand = g.hands[me];
        if (hand && hand.count > 0 && !this.dealing && (v.phase === 'predicting' || v.phase === 'playing' || v.phase === 'gameResult'))
            root.append(this.handEl(s, hand, lock));
        this.timerEl = h('div', { class: 'timer', 'aria-hidden': 'true' });
        root.append(this.timerEl);
        return root;
    }
    choicePanel(opts, lock, label, go, forbidden = null) {
        return h('div', { class: 'choice glass' }, h('div', { class: 'choice-opts', role: 'group', 'aria-label': 'Tu predicción' }, ...opts.map((o) => {
            const bad = o === forbidden;
            return h('button', { class: `opt${this.selPred === o ? ' on' : ''}`, disabled: lock || bad, title: bad ? 'No permitido: la suma igualaría las rondas' : null, 'aria-pressed': String(this.selPred === o),
                text: typeof o === 'number' ? String(o) : o, onclick: () => { this.selPred = o; sfx.select(); this.render(); } });
        })), h('button', { class: 'btn primary', disabled: lock || this.selPred === null, text: label, onclick: () => this.selPred !== null && go(this.selPred) }));
    }
    handEl(s, hand, lock) {
        const v = s.view;
        const g = v.game;
        const me = this.me();
        const myTurn = v.phase === 'playing' && g.turnId === me;
        const keys = Array.from({ length: hand.count }, (_, i) => (hand.cards ? hand.cards[i].id : `pos:${i}`));
        if (this.selKey && !keys.includes(this.selKey))
            this.selKey = null;
        const reveal = this.revealedFor !== g.number && !motionReduced();
        this.revealedFor = g.number;
        const cards = keys.map((k, i) => {
            const c = hand.cards?.[i];
            const on = this.selKey === k;
            const b = h('button', { class: `hcard${on ? ' sel' : ''}`, 'aria-pressed': String(on), 'aria-label': c ? cardName(c) : `Carta oculta ${i + 1}`,
                onclick: () => { this.selKey = on ? null : k; sfx.select(); this.render(); },
                onkeydown: (e) => { const sib = e.key === 'ArrowRight' ? 'nextElementSibling' : e.key === 'ArrowLeft' ? 'previousElementSibling' : null; if (sib)
                    e.currentTarget[sib]?.focus(); } }, h('img', { src: c ? cardSrc(c) : BACK, alt: '', draggable: 'false' }));
            b.style.setProperty('--i', String(i));
            return b;
        });
        const confirm = h('button', { class: 'btn primary big', disabled: !myTurn || lock || !this.selKey, text: 'SELECCIONAR',
            onclick: () => { const k = this.selKey; if (!k)
                return; void this.send('play', hand.cards ? { cardId: k } : { pos: Number(k.slice(4)) }); } });
        return h('div', { class: 'hand-zone' }, h('div', { class: `hand${reveal ? ' reveal' : ''}` }, ...cards), confirm);
    }
    updateTimer() {
        const s = this.st;
        const me = this.me();
        if (!this.timerEl || !s || !me)
            return;
        const d = s.deadlines[me];
        if (!d) {
            this.timerEl.textContent = '';
            return;
        }
        const left = Math.max(0, Math.ceil((d - (Date.now() + s.skew)) / 1000));
        this.timerEl.textContent = `⏱ ${left}s`;
        this.timerEl.classList.toggle('low', left <= 10);
    }
    // ---------- animaciones de barajado y reparto ----------
    async animateDeal(v) {
        const g = v.game;
        const run = g.number;
        this.dealing = true;
        this.dealMsg = `${pname(v, g.dealerId)} está barajando…`;
        this.render();
        const stack = h('div', { class: 'shuffle' }, ...Array.from({ length: 10 }, (_, i) => h('img', { class: `sh ${i % 2 ? 'r' : 'l'}`, src: BACK, alt: '' })));
        this.fx.append(stack);
        sfx.shuffle();
        await sleep(1500);
        stack.remove();
        if (this.gameNo !== run) {
            this.dealing = false;
            this.render();
            return;
        }
        const ids = Object.keys(g.hands);
        const di = ids.indexOf(g.dealerId);
        const order = [...ids.slice(di + 1), ...ids.slice(0, di + 1)];
        this.dealMsg = 'Repartiendo…';
        this.render();
        const box = this.el.getBoundingClientRect();
        const cx = box.width / 2;
        const cy = box.height * 0.42;
        for (let c = 0; c < g.cards && this.gameNo === run; c++)
            for (const id of order) {
                const target = this.body.querySelector(`[data-seat="${id}"]`) ?? this.body.querySelector('.bottom');
                if (!target)
                    continue;
                const t = target.getBoundingClientRect();
                const f = h('img', { class: 'fly', src: BACK, alt: '' });
                this.fx.append(f);
                f.style.left = `${cx - 20}px`;
                f.style.top = `${cy - 30}px`;
                const dx = t.left + t.width / 2 - box.left - cx;
                const dy = t.top + t.height / 2 - box.top - cy;
                f.animate([{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${Math.round(dx / 8)}deg) scale(.7)`, opacity: 0.9 }], { duration: 360, easing: 'ease-out' }).onfinish = () => f.remove();
                sfx.deal();
                await sleep(70);
            }
        await sleep(400);
        this.dealing = false;
        this.render();
    }
    // ---------- resultados ----------
    resultOverlay(s) {
        const v = s.view;
        const r = v.lastResult;
        const rows = r.rows.map((row) => {
            const lost = row.livesAfter < row.livesBefore;
            const pred = row.prediction;
            const why = typeof pred === 'number' ? `Predijo ${pred} · ganó ${row.wins}` : `Predijo ${pred} · ${row.wins === 1 ? 'ganó' : 'perdió'}`;
            let note = row.hit ? 'Acierta ✔' : lost ? 'Falla: pierde 1 vida' : 'Falla';
            if (row.statusAfter === 'repesca')
                note = 'Falla: ÚLTIMA OPORTUNIDAD en el próximo juego';
            if (row.statusBefore === 'repesca' && row.hit)
                note = '¡Repesca superada! Recupera 1 vida';
            if (row.statusAfter === 'eliminado')
                note = 'Falla: ELIMINADO';
            return h('li', { class: `res-row${row.hit ? ' hit' : ' miss'}`, 'data-seat': row.playerId }, h('img', { class: 'cap-av', src: avatarSrc(this.avatarOf({ id: row.playerId })), alt: '' }), h('div', { class: 'res-main' }, h('strong', { text: pname(v, row.playerId) }), h('span', { text: why }), h('em', { text: note })), h('span', { class: 'hearts' }, ...[0, 1, 2].map((i) => h('span', { class: `heart ${i < row.livesAfter ? 'full' : ''}${lost && i === row.livesAfter ? ' breaking' : ''}`, text: '♥' }))));
        });
        const pen = r.outcome === 'penalty';
        return h('div', { class: 'overlay' }, h('div', { class: 'modal glass', role: 'dialog', 'aria-label': 'Resultado del juego' }, h('h2', { text: `Fin del juego ${r.gameNumber}` }), h('ul', { class: 'res-list' }, ...rows), pen ? h('p', { class: 'banner-pen', text: '¡Todos caen a la vez! → PENALTIS' }) : null, h('button', { class: 'btn', text: 'Cerrar', onclick: () => { this.resultClosed = r.gameNumber; this.render(); } })));
    }
    finalScreen(v) {
        const win = v.players.find((p) => p.id === v.winnerId);
        const sorted = v.players.slice().sort((a, b) => (a.stats.finalPosition ?? 99) - (b.stats.finalPosition ?? 99));
        const confetti = motionReduced() ? [] : Array.from({ length: 36 }, (_, i) => { const c = h('i', { class: 'confetti' }); c.style.setProperty('--x', `${(i * 97) % 100}%`); c.style.setProperty('--d', `${2.5 + (i % 5) * 0.5}s`); c.style.setProperty('--h', String((i * 47) % 360)); c.style.setProperty('--w', `${(i % 7) * 0.25}s`); return c; });
        return h('div', { class: 'overlay final' }, ...confetti, h('div', { class: 'modal glass' }, h('h1', { class: 'victory', text: '¡TENEMOS GANADOR!' }), win ? h('div', { class: 'winner-card' }, h('img', { class: 'avatar xl', src: avatarSrc(this.avatarOf(win)), alt: '' }), h('h2', { text: win.name })) : null, h('div', { class: 'table-wrap' }, h('table', { class: 'stats' }, h('thead', {}, h('tr', {}, ...['#', 'Jugador', 'Juegos', 'Rondas', 'Aciertos', 'Fallos', 'Vidas perdidas', 'Repescas', 'Jokers'].map((t) => h('th', { text: t })))), h('tbody', {}, ...sorted.map((p) => h('tr', { class: p.id === v.winnerId ? 'first' : '' }, ...[p.stats.finalPosition ?? '-', p.name, p.stats.gamesPlayed, p.stats.roundsWon, p.stats.predictionsHit, p.stats.predictionsMissed, p.stats.livesLost, p.stats.repescasPassed, p.stats.jokersPlayed].map((x) => h('td', { text: String(x) }))))))), h('button', { class: 'btn primary big', text: 'Volver al inicio', onclick: () => this.onLeave() })));
    }
}
