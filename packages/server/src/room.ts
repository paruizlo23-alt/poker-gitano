import { createHash, timingSafeEqual } from 'node:crypto';
import { Match, MatchState, MatchView, MAX_PLAYERS, Prediction, RuleError, viewFor } from '@poker-gitano/engine';
import { botPlay, botPredict, Rng } from './bots.js';
import { RoomStore } from './store.js';
import { cleanName, newToken, validAvatar } from './util.js';

export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void }
export const realClock: Clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };
export interface Timing { actionMs: number; botDelayMs: number; gameResultMs: number; disconnectGraceMs: number }
export const DEFAULT_TIMING: Timing = { actionMs: 60_000, botDelayMs: 1_200, gameResultMs: 7_000, disconnectGraceMs: 5_000 };
export const MAX_SPECTATORS = 20;
const BOT_AVATARS = ['mono', 'gato', 'pinguino', 'rana', 'perro', 'mapache', 'pato', 'zorro', 'panda'];

export interface RoomClient { id: string; seatId: string | null; send(msg: unknown): void; close(): void }
export type Result = { ok: true; dup?: true } | { ok: false; code: string };
export type Command =
  | { id: string; type: 'start' | 'sync' | 'addBot' }
  | { id: string; type: 'setJokers'; value: unknown }
  | { id: string; type: 'predict'; value: unknown }
  | { id: string; type: 'play'; cardId?: unknown; pos?: unknown };

interface Seat {
  id: string; tokenHash: string | null; isBot: boolean; connected: boolean;
  botActive: boolean; botReason: 'disconnect' | 'timeout' | null; consecutiveTimeouts: number; recentCmds: string[];
}
interface TimerEntry { key: string; handle: unknown; deadline: number }
export interface RoomDeps { clock?: Clock; timing?: Partial<Timing>; rng?: Rng; store?: RoomStore; shuffle?: ConstructorParameters<typeof Match>[0] }

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class Room {
  readonly match: Match;
  readonly seats = new Map<string, Seat>();
  readonly clients = new Set<RoomClient>();
  createdAt: number; touchedAt: number;
  private clock: Clock; private timing: Timing; private rng: Rng; private store?: RoomStore;
  private timers = new Map<string, TimerEntry>();
  private queue: Promise<unknown> = Promise.resolve();
  private prev: ReturnType<Room['snap']>;
  private lastDeadlines = '';

  constructor(readonly code: string, deps: RoomDeps = {}, restored?: { match: MatchState; seats: Seat[]; createdAt: number; touchedAt: number }) {
    this.clock = deps.clock ?? realClock;
    this.timing = { ...DEFAULT_TIMING, ...deps.timing };
    this.rng = deps.rng ?? ((n) => Math.floor(Math.random() * n));
    this.store = deps.store;
    this.match = new Match(deps.shuffle ?? {}, restored?.match);
    this.createdAt = restored?.createdAt ?? this.clock.now();
    this.touchedAt = restored?.touchedAt ?? this.createdAt;
    if (restored) for (const s of restored.seats) this.seats.set(s.id, { ...s, connected: false, botActive: s.isBot || s.botActive || this.match.state.phase !== 'lobby', botReason: s.isBot ? null : 'disconnect', recentCmds: [] });
    this.prev = this.snap();
  }

  // ---------- serialización / persistencia ----------
  toJSON() {
    return { code: this.code, createdAt: this.createdAt, touchedAt: this.touchedAt, match: this.match.state,
      seats: [...this.seats.values()].map((s) => ({ id: s.id, tokenHash: s.tokenHash, isBot: s.isBot, botActive: false, botReason: null, consecutiveTimeouts: 0, connected: false, recentCmds: [] })) };
  }
  static fromJSON(json: string, deps: RoomDeps): Room {
    const o = JSON.parse(json);
    const r = new Room(o.code, deps, o);
    r.reschedule();
    return r;
  }
  private persist() { void this.store?.save(this.code, JSON.stringify(this.toJSON())); }

  // ---------- cola serie por sala ----------
  enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn) as Promise<T>;
    this.queue = run.catch(() => {});
    return run;
  }
  /** Tareas de temporizador: un fallo se registra, nunca tumba el proceso. */
  private later(fn: () => unknown): void { void this.enqueue(fn).catch((e) => console.error('[room]', this.code, e)); }
  idle(): Promise<void> { return this.queue.then(() => {}, () => {}); }

  // ---------- entrada / salida ----------
  join(name: unknown, avatar: unknown): Promise<{ ok: true; seatId: string; token: string } | { ok: false; code: string }> {
    return this.enqueue(() => {
      const st = this.match.state;
      if (st.phase !== 'lobby') return { ok: false as const, code: 'ALREADY_STARTED' };
      if (st.players.length >= MAX_PLAYERS) return { ok: false as const, code: 'ROOM_FULL' };
      const n = cleanName(name);
      if (!n) return { ok: false as const, code: 'INVALID_NAME' };
      if (!validAvatar(avatar)) return { ok: false as const, code: 'INVALID_AVATAR' };
      const seatId = `p${st.players.length + 1}`;
      const token = newToken();
      this.match.addPlayer(seatId, n, avatar);
      this.seats.set(seatId, { id: seatId, tokenHash: hash(token), isBot: false, connected: false, botActive: false, botReason: null, consecutiveTimeouts: 0, recentCmds: [] });
      this.emit({ e: 'playerJoined', playerId: seatId });
      this.afterChange();
      return { ok: true as const, seatId, token };
    });
  }
  /** Reingreso por token (nunca por nombre). */
  seatForToken(token: unknown): string | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const h = hash(token);
    let found: string | null = null;
    for (const s of this.seats.values()) if (s.tokenHash && sameHash(s.tokenHash, h)) found = s.id; // sin early-exit
    return found;
  }
  spectatorCount(): number { return [...this.clients].filter((c) => !c.seatId).length; }

  attach(client: RoomClient): void {
    this.clients.add(client);
    this.touchedAt = this.clock.now();
    const seat = client.seatId ? this.seats.get(client.seatId) : undefined;
    if (seat) {
      seat.connected = true;
      this.clearTimer(`grace:${seat.id}`);
      if (seat.botReason === 'disconnect') { seat.botActive = false; seat.botReason = null; this.emit({ e: 'humanBack', playerId: seat.id }); }
    }
    this.reschedule(); this.sendState(client);
  }
  detach(client: RoomClient): void {
    this.clients.delete(client);
    const seat = client.seatId ? this.seats.get(client.seatId) : undefined;
    if (!seat || [...this.clients].some((c) => c.seatId === seat.id)) return;
    seat.connected = false;
    this.ensureTimer(`grace:${seat.id}`, 'g', this.timing.disconnectGraceMs, () => this.later(() => {
      if (seat.connected || this.match.state.phase === 'finished') return;
      if (this.match.state.phase === 'lobby') { this.reassignHost(seat.id); return; }
      seat.botActive = true; seat.botReason = 'disconnect';
      this.emit({ e: 'botTakeover', playerId: seat.id, reason: 'disconnect' });
      this.afterChange();
    }));
  }

  /** Anfitrión ausente en la sala de espera: pasa al primer humano conectado (si no hay ninguno, se queda como está). */
  private reassignHost(absentId: string): void {
    const st = this.match.state;
    if (st.hostId !== absentId) return;
    const next = st.players.find((p) => { const s = this.seats.get(p.id); return s && !s.isBot && s.connected && p.id !== absentId; });
    if (!next) return;
    st.hostId = next.id; st.version++;
    this.emit({ e: 'hostChanged', playerId: next.id });
    this.afterChange();
  }

  // ---------- comandos de humanos ----------
  command(seatId: string | null, cmd: Command): Promise<Result> {
    return this.enqueue(() => {
      this.touchedAt = this.clock.now();
      if (cmd.type === 'sync') { for (const c of this.clients) if (c.seatId === seatId) this.sendState(c); return { ok: true as const }; }
      const seat = seatId ? this.seats.get(seatId) : undefined;
      if (!seat || seat.isBot) return { ok: false as const, code: 'NOT_A_PLAYER' }; // espectadores y bots no mandan comandos
      if (typeof cmd.id !== 'string' || cmd.id.length < 1 || cmd.id.length > 64) return { ok: false as const, code: 'INVALID_COMMAND' };
      if (seat.recentCmds.includes(cmd.id)) return { ok: true as const, dup: true as const }; // idempotencia
      try {
        this.apply(seat.id, cmd);
      } catch (e) {
        if (e instanceof RuleError) return { ok: false as const, code: e.code };
        throw e;
      }
      seat.recentCmds.push(cmd.id); if (seat.recentCmds.length > 50) seat.recentCmds.shift();
      if (cmd.type === 'predict' || cmd.type === 'play') {
        seat.consecutiveTimeouts = 0;
        if (seat.botActive && seat.botReason === 'timeout') { seat.botActive = false; seat.botReason = null; this.emit({ e: 'humanBack', playerId: seat.id }); }
      }
      this.afterChange();
      return { ok: true as const };
    });
  }

  private apply(seatId: string, cmd: Command): void {
    const m = this.match; const st = m.state;
    switch (cmd.type) {
      case 'start': m.start(seatId); return;
      case 'setJokers': if (cmd.value !== 1 && cmd.value !== 2) throw new RuleError('INVALID_VALUE'); m.setJokers(seatId, cmd.value); return;
      case 'addBot': {
        if (seatId !== st.hostId) throw new RuleError('NOT_HOST');
        if (st.phase !== 'lobby') throw new RuleError('ALREADY_STARTED');
        if (st.players.length >= MAX_PLAYERS) throw new RuleError('ROOM_FULL');
        const id = `p${st.players.length + 1}`;
        const nBots = st.players.filter((p) => this.seats.get(p.id)?.isBot).length;
        m.addPlayer(id, `Bot ${nBots + 1}`, BOT_AVATARS[nBots % BOT_AVATARS.length]!);
        this.seats.set(id, { id, tokenHash: null, isBot: true, connected: true, botActive: true, botReason: null, consecutiveTimeouts: 0, recentCmds: [] });
        this.emit({ e: 'playerJoined', playerId: id, bot: true });
        return;
      }
      case 'predict': return this.doPredict(seatId, cmd.value);
      case 'play': return this.doPlay(seatId, cmd.cardId, cmd.pos);
      default: throw new RuleError('UNKNOWN_COMMAND');
    }
  }
  private doPredict(seatId: string, value: unknown): void {
    const m = this.match;
    if (m.state.phase === 'penaltyPredicting') {
      if (value !== 'GANO' && value !== 'PIERDO') throw new RuleError('INVALID_PREDICTION');
      m.penaltyPredict(seatId, value);
      this.emit({ e: 'predicted', playerId: seatId });
      return;
    }
    if (typeof value !== 'number' && value !== 'GANO' && value !== 'PIERDO') throw new RuleError('INVALID_PREDICTION');
    m.predict(seatId, value as Prediction);
    const g = m.state.game!;
    this.emit({ e: 'predicted', playerId: seatId, ...(g.cards > 1 ? { value } : {}) }); // en 1 carta es secreto hasta que todos confirmen
  }
  /** Con mano oculta (repesca, 1 carta, penaltis) SOLO se acepta posición: un cardId fallido sería un oráculo de la mano. */
  private doPlay(seatId: string, cardId: unknown, pos: unknown): void {
    const m = this.match; const st = m.state;
    const hiddenHand = st.phase === 'penaltyPlaying' || (st.game !== null && (st.game.cards === 1 || m.player(seatId).status === 'repesca'));
    const hand = st.phase === 'penaltyPlaying' ? (st.penalty!.hands[seatId] ? [st.penalty!.hands[seatId]!] : []) : st.game?.hands[seatId] ?? [];
    let card;
    if (hiddenHand) {
      if (typeof pos !== 'number' || !Number.isInteger(pos)) throw new RuleError('POSITION_REQUIRED');
      card = hand[pos];
      if (!card) throw new RuleError('INVALID_POSITION');
    } else {
      if (typeof cardId !== 'string' || cardId.length > 32) throw new RuleError('INVALID_CARD');
      card = hand.find((c) => c.id === cardId);
    }
    m.play(seatId, card?.id ?? String(cardId)); // lanza CARD_NOT_IN_HAND / NOT_YOUR_TURN si procede
    this.emit({ e: 'played', playerId: seatId, card }); // una carta jugada es pública
  }

  // ---------- bots / vencimientos ----------
  private chooseAction(seatId: string): Command {
    const view = viewFor(this.match, seatId);
    const st = this.match.state;
    const pendingPlay = st.phase === 'playing' || st.phase === 'penaltyPlaying';
    if (pendingPlay) { const p = botPlay(view, seatId, this.rng); return { id: 'auto', type: 'play', ...('cardId' in p ? { cardId: p.cardId } : { pos: p.pos }) }; }
    return { id: 'auto', type: 'predict', value: botPredict(view, seatId, this.rng) };
  }
  private autoAct(seatId: string): void {
    const c = this.chooseAction(seatId);
    this.apply(seatId, c);
  }
  private pendingSeats(): Map<string, string> {
    const out = new Map<string, string>(); const s = this.match.state; const g = s.game; const p = s.penalty;
    if ((s.phase === 'predicting' || s.phase === 'playing') && g) {
      const seats = s.phase === 'predicting' && g.cards === 1 ? g.circle.filter((id) => !(id in g.predictions)) : [this.match.currentTurn()!];
      for (const id of seats) out.set(id, `${s.phase}:${g.number}:${g.round}:${g.played.length}:${Object.keys(g.predictions).length}:${id}`);
    } else if ((s.phase === 'penaltyPredicting' || s.phase === 'penaltyPlaying') && p) {
      const seats = s.phase === 'penaltyPredicting' ? p.ids.filter((id) => !(id in p.predictions)) : [this.match.currentTurn()!];
      for (const id of seats) out.set(id, `${s.phase}:${p.attempt}:${p.played.length}:${id}`);
    }
    return out;
  }
  private reschedule(): void {
    const pending = this.pendingSeats();
    for (const [name, t] of [...this.timers]) {
      if (name.startsWith('act:') || name.startsWith('bot:')) {
        const seatId = name.slice(4); const seat = this.seats.get(seatId);
        const wantBot = !!seat && (seat.isBot || seat.botActive);
        const key = pending.get(seatId);
        if (!key || key !== t.key || (name.startsWith('bot:') !== wantBot)) this.clearTimer(name);
      }
    }
    for (const [seatId, key] of pending) {
      const seat = this.seats.get(seatId); if (!seat) continue;
      if (seat.isBot || seat.botActive) this.ensureTimer(`bot:${seatId}`, key, this.timing.botDelayMs, () => this.later(() => this.botTurn(seatId, key)));
      else this.ensureTimer(`act:${seatId}`, key, this.timing.actionMs, () => this.later(() => this.expire(seatId, key)));
    }
    if (this.match.state.phase === 'gameResult') this.ensureTimer('next', `r${this.match.state.version}`, this.timing.gameResultMs, () => this.later(() => {
      if (this.match.state.phase !== 'gameResult') return;
      this.match.nextGame(); this.afterChange();
    }));
    else this.clearTimer('next');
  }
  private botTurn(seatId: string, key: string): void {
    const seat = this.seats.get(seatId);
    if (!seat || !(seat.isBot || seat.botActive) || this.pendingSeats().get(seatId) !== key) return; // otro (humano) se adelantó
    this.autoAct(seatId); this.afterChange();
  }
  private expire(seatId: string, key: string): void {
    const seat = this.seats.get(seatId);
    if (!seat || seat.isBot || seat.botActive || this.pendingSeats().get(seatId) !== key) return;
    this.autoAct(seatId); // acción válida automática para este turno
    seat.consecutiveTimeouts++;
    this.emit({ e: 'timeout', playerId: seatId, consecutive: seat.consecutiveTimeouts });
    if (seat.consecutiveTimeouts >= 2) { seat.botActive = true; seat.botReason = 'timeout'; this.emit({ e: 'botTakeover', playerId: seatId, reason: 'timeout' }); }
    this.afterChange();
  }

  // ---------- temporizadores ----------
  private ensureTimer(name: string, key: string, ms: number, fn: () => void): void {
    const cur = this.timers.get(name);
    if (cur && cur.key === key) return;
    if (cur) this.clock.clearTimeout(cur.handle);
    const handle = this.clock.setTimeout(() => { if (this.timers.get(name)?.handle === handle) this.timers.delete(name); fn(); }, ms);
    this.timers.set(name, { key, handle, deadline: this.clock.now() + ms });
  }
  private clearTimer(name: string): void { const t = this.timers.get(name); if (t) { this.clock.clearTimeout(t.handle); this.timers.delete(name); } }
  /** Cancela todo (cierre/limpieza de sala). */
  dispose(): void { for (const n of [...this.timers.keys()]) this.clearTimer(n); }
  deadlines(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [n, t] of this.timers) if (n.startsWith('act:')) out[n.slice(4)] = t.deadline;
    return out;
  }

  // ---------- difusión ----------
  private snap() {
    const s = this.match.state;
    return { phase: s.phase, game: s.game?.number ?? 0, hist: s.game?.history.length ?? 0, result: s.lastResult, pen: s.penalty?.attempt ?? 0, winner: s.winnerId };
  }
  private afterChange(): void {
    const cur = this.snap(); const p = this.prev; const s = this.match.state;
    if (p.phase === 'lobby' && s.phase !== 'lobby') this.emit({ e: 'started' });
    if (cur.game !== p.game && s.game) this.emit({ e: 'dealt', game: cur.game, cards: s.game.cards, dealerId: s.game.dealerId });
    if (s.game && cur.game === p.game && cur.hist > p.hist) this.emit({ e: 'roundWon', winnerId: s.game.history.at(-1)!.winnerId, round: s.game.history.at(-1)!.round });
    if (cur.result && cur.result !== p.result) this.emit({ e: 'gameResult', result: cur.result });
    if (cur.pen !== p.pen && cur.pen > 0 && s.penalty) this.emit({ e: 'penalty', attempt: cur.pen, ids: s.penalty.ids });
    if (cur.winner && cur.winner !== p.winner) this.emit({ e: 'finished', winnerId: cur.winner });
    this.prev = cur;
    this.reschedule(); this.broadcast(); this.persist();
  }
  private emit(ev: Record<string, unknown>): void { for (const c of this.clients) c.send({ t: 'event', ev }); }
  viewFor(seatId: string | null): MatchView { return viewFor(this.match, seatId); }
  private sendState(c: RoomClient): void { c.send({ t: 'state', view: this.viewFor(c.seatId), deadlines: this.deadlines(), serverTime: this.clock.now(), seats: this.seatInfo() }); }
  /** Estado de conexión público: quién es bot / está conectado (sin datos privados). */
  private seatInfo(): Record<string, { bot: boolean; connected: boolean }> {
    const o: Record<string, { bot: boolean; connected: boolean }> = {};
    for (const s of this.seats.values()) o[s.id] = { bot: s.isBot || s.botActive, connected: s.isBot || s.connected };
    return o;
  }
  private broadcast(): void { for (const c of this.clients) this.sendState(c); }
}
