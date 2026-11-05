import { tokenKey } from './settings.js';
const FATAL = new Set(['BAD_TOKEN', 'NO_SUCH_ROOM', 'ROOM_FULL', 'ALREADY_STARTED', 'INVALID_NAME', 'INVALID_AVATAR', 'SPECTATORS_FULL']);
export class Connection {
    room;
    mode;
    status = 'connecting';
    seatId = null;
    onState = () => { };
    onEvent = () => { };
    onStatus = () => { };
    onFatal = () => { };
    ws = null;
    tries = 0;
    stopped = false;
    retry;
    pending = new Map();
    constructor(room, mode) {
        this.room = room;
        this.mode = mode;
    }
    connect() {
        this.stopped = false;
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
        this.ws = ws;
        ws.onopen = () => {
            const token = localStorage.getItem(tokenKey(this.room));
            if (this.mode.kind === 'join' && !token)
                ws.send(JSON.stringify({ t: 'join', room: this.room, name: this.mode.name, avatar: this.mode.avatar }));
            else if (this.mode.kind === 'spectate')
                ws.send(JSON.stringify({ t: 'spectate', room: this.room }));
            else
                ws.send(JSON.stringify({ t: 'rejoin', room: this.room, token }));
        };
        ws.onmessage = (e) => {
            let m;
            try {
                m = JSON.parse(String(e.data));
            }
            catch {
                return;
            }
            if (m.t === 'welcome') {
                this.seatId = m.seatId;
                this.tries = 0;
                this.status = 'open';
                if (m.token) {
                    try {
                        localStorage.setItem(tokenKey(this.room), m.token);
                    }
                    catch { /* sin almacenamiento: no habrá reingreso */ }
                    this.mode = { kind: 'rejoin' };
                }
                for (const p of this.pending.values())
                    ws.send(JSON.stringify(p.msg)); // reenvío tras reconexión (el servidor deduplica por id)
                this.onStatus();
            }
            else if (m.t === 'state')
                this.onState({ ...m, skew: m.serverTime - Date.now() });
            else if (m.t === 'event')
                this.onEvent(m.ev);
            else if (m.t === 'ack' || (m.t === 'error' && m.id)) {
                const p = this.pending.get(m.id);
                if (!p)
                    return;
                clearTimeout(p.timer);
                this.pending.delete(m.id);
                p.res(m.t === 'ack' ? { ok: true } : { ok: false, code: m.code });
            }
            else if (m.t === 'error') {
                if (FATAL.has(m.code)) {
                    this.stopped = true;
                    this.status = 'closed';
                    this.onFatal(m.code);
                    this.onStatus();
                }
                else
                    this.onEvent({ e: 'error', code: m.code });
            }
        };
        ws.onclose = () => {
            if (this.stopped)
                return;
            this.status = 'reconnecting';
            this.onStatus();
            const delay = Math.min(8000, 500 * 2 ** this.tries++);
            this.retry = window.setTimeout(() => this.connect(), delay);
        };
    }
    cmd(type, extra = {}) {
        const id = crypto.randomUUID().slice(0, 18);
        const msg = { t: 'cmd', id, type, ...extra };
        return new Promise((res) => {
            const timer = window.setTimeout(() => { this.pending.delete(id); res({ ok: false, code: 'TIMEOUT' }); this.ws?.send(JSON.stringify({ t: 'cmd', id: crypto.randomUUID().slice(0, 18), type: 'sync' })); }, 8000);
            this.pending.set(id, { msg, res, timer });
            if (this.ws?.readyState === WebSocket.OPEN)
                this.ws.send(JSON.stringify(msg));
        });
    }
    leave(forget = false) {
        this.stopped = true;
        clearTimeout(this.retry);
        this.ws?.close();
        this.status = 'closed';
        if (forget)
            try {
                localStorage.removeItem(tokenKey(this.room));
            }
            catch { /* noop */ }
    }
}
