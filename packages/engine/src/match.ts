import { Card, cardValue, createDeck, shuffle } from './cards.js';

export type Prediction = number | 'GANO' | 'PIERDO';
export type PlayerStatus = 'normal' | 'repesca' | 'ultimaVida' | 'eliminado';
export type Phase = 'lobby' | 'predicting' | 'playing' | 'gameResult' | 'penaltyPredicting' | 'penaltyPlaying' | 'finished';

export const SCHEDULE = [5, 4, 3, 2, 1, 2, 3, 4, 5] as const;
export const MAX_PLAYERS = 7;
export const START_LIVES = 3;

export class RuleError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

export interface Stats {
  gamesPlayed: number; roundsWon: number; predictionsHit: number; predictionsMissed: number;
  livesLost: number; repescasPassed: number; jokersPlayed: number; finalPosition: number | null;
}
export interface Player {
  id: string; name: string; avatar: string; order: number; lives: number;
  status: PlayerStatus; repescaUsed: boolean; stats: Stats;
}
interface Play { playerId: string; card: Card }
interface RoundRecord { round: number; plays: Play[]; winnerId: string }
export interface GameResultRow {
  playerId: string; prediction: Prediction; wins: number; hit: boolean;
  livesBefore: number; livesAfter: number; statusBefore: PlayerStatus; statusAfter: PlayerStatus;
}
export interface GameResult {
  gameNumber: number; rows: GameResultRow[];
  outcome: 'continue' | 'winner' | 'penalty'; winnerId?: string; penaltyIds?: string[];
}
interface GameState {
  number: number; cards: number; dealerId: string; circle: string[]; predictionOrder: string[];
  hands: Record<string, Card[]>; predictions: Record<string, Prediction>;
  round: number; turnOrder: string[]; played: Play[]; wins: Record<string, number>; history: RoundRecord[];
}
interface PenaltyState {
  attempt: number; ids: string[]; hands: Record<string, Card>; predictions: Record<string, 'GANO' | 'PIERDO'>;
  played: Play[]; history: { attempt: number; winnerId: string; hitters: string[] }[];
}
export interface MatchState {
  version: number; phase: Phase; jokers: 1 | 2; players: Player[]; hostId: string | null;
  gameCounter: number; lastDealerId: string | null; game: GameState | null; lastResult: GameResult | null;
  penalty: PenaltyState | null; penaltyCount: number; winnerId: string | null; eliminationGroups: string[][];
}
export interface MatchOptions { jokers?: 1 | 2; shuffle?: (cards: Card[]) => Card[] }

const emptyStats = (): Stats => ({
  gamesPlayed: 0, roundsWon: 0, predictionsHit: 0, predictionsMissed: 0,
  livesLost: 0, repescasPassed: 0, jokersPlayed: 0, finalPosition: null,
});

/** Motor puro y determinista (salvo el barajado inyectable). Toda decisión de reglas vive aquí. */
export class Match {
  state: MatchState;
  private shuffleFn: (cards: Card[]) => Card[];

  constructor(opts: MatchOptions = {}, restored?: MatchState) {
    this.shuffleFn = opts.shuffle ?? ((c) => shuffle(c));
    this.state = restored ?? {
      version: 0, phase: 'lobby', jokers: opts.jokers ?? 1, players: [], hostId: null,
      gameCounter: 0, lastDealerId: null, game: null, lastResult: null, penalty: null,
      penaltyCount: 0, winnerId: null, eliminationGroups: [],
    };
  }
  snapshot(): string { return JSON.stringify(this.state); }
  static fromSnapshot(json: string, opts: MatchOptions = {}): Match { return new Match(opts, JSON.parse(json) as MatchState); }

  // ---------- consultas ----------
  player(id: string): Player {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new RuleError('UNKNOWN_PLAYER');
    return p;
  }
  private alive(): Player[] { return this.state.players.filter((p) => p.status !== 'eliminado'); }
  private bump(): void { this.state.version++; }

  /** Jugador al que le toca actuar (predicción secuencial, jugar carta o penalti), o null si es simultáneo/no aplica. */
  currentTurn(): string | null {
    const s = this.state;
    if (s.phase === 'predicting' && s.game && s.game.cards > 1) return s.game.predictionOrder[Object.keys(s.game.predictions).length] ?? null;
    if (s.phase === 'playing' && s.game) return s.game.turnOrder[s.game.played.length] ?? null;
    if (s.phase === 'penaltyPlaying' && s.penalty) return s.penalty.ids[s.penalty.played.length] ?? null;
    return null;
  }

  /** Valor que el servidor prohíbe a este jugador (solo el último predictor, juegos de 2-5 cartas). */
  forbiddenPrediction(playerId: string): number | null {
    const g = this.state.game;
    if (this.state.phase !== 'predicting' || !g || g.cards === 1) return null;
    if (g.predictionOrder[g.predictionOrder.length - 1] !== playerId) return null;
    if (Object.keys(g.predictions).length !== g.predictionOrder.length - 1) return null;
    const sum = Object.values(g.predictions).reduce<number>((a, v) => a + (v as number), 0);
    const f = g.cards - sum;
    return f >= 0 && f <= g.cards ? f : null;
  }
  allowedPredictions(playerId: string): Prediction[] {
    const g = this.state.game;
    if (!g) return [];
    if (g.cards === 1) return ['GANO', 'PIERDO'];
    const f = this.forbiddenPrediction(playerId);
    return Array.from({ length: g.cards + 1 }, (_, i) => i).filter((i) => i !== f);
  }

  // ---------- sala ----------
  addPlayer(id: string, name: string, avatar: string): Player {
    const s = this.state;
    if (s.phase !== 'lobby') throw new RuleError('ALREADY_STARTED');
    if (s.players.length >= MAX_PLAYERS) throw new RuleError('ROOM_FULL');
    if (s.players.some((p) => p.id === id)) throw new RuleError('DUPLICATE_ID');
    const p: Player = { id, name, avatar, order: s.players.length, lives: START_LIVES, status: 'normal', repescaUsed: false, stats: emptyStats() };
    s.players.push(p);
    s.hostId ??= id;
    this.bump();
    return p;
  }
  setJokers(by: string, jokers: 1 | 2): void {
    if (this.state.phase !== 'lobby') throw new RuleError('JOKERS_LOCKED');
    if (by !== this.state.hostId) throw new RuleError('NOT_HOST');
    this.state.jokers = jokers;
    this.bump();
  }
  start(by: string): void {
    const s = this.state;
    if (s.phase !== 'lobby') throw new RuleError('ALREADY_STARTED');
    if (by !== s.hostId) throw new RuleError('NOT_HOST');
    if (s.players.length < 2) throw new RuleError('NEED_TWO_PLAYERS');
    this.beginGame();
  }

  // ---------- juego ----------
  private rotateFrom<T>(list: T[], startIdx: number): T[] { return [...list.slice(startIdx), ...list.slice(0, startIdx)]; }

  private beginGame(): void {
    const s = this.state;
    const seats = s.players; // orden de entrada inmutable
    const lastIdx = s.lastDealerId ? seats.findIndex((p) => p.id === s.lastDealerId) : -1;
    let di = (lastIdx + 1) % seats.length;
    while (seats[di]!.status === 'eliminado') di = (di + 1) % seats.length;
    const dealer = seats[di]!;
    const circle = seats.filter((p) => p.status !== 'eliminado').map((p) => p.id);
    const dIdxInCircle = circle.indexOf(dealer.id);
    const predictionOrder = this.rotateFrom(circle, (dIdxInCircle + 1) % circle.length); // empieza tras el barajador y termina con él
    s.gameCounter++;
    const cards = SCHEDULE[(s.gameCounter - 1) % SCHEDULE.length]!;
    const deck = this.shuffleFn(createDeck(s.jokers));
    const hands: Record<string, Card[]> = {};
    circle.forEach((id) => (hands[id] = []));
    for (let c = 0; c < cards; c++) for (const id of predictionOrder) hands[id]!.push(deck.pop()!); // reparto carta a carta
    const wins: Record<string, number> = {};
    circle.forEach((id) => (wins[id] = 0));
    s.lastDealerId = dealer.id;
    s.game = { number: s.gameCounter, cards, dealerId: dealer.id, circle, predictionOrder, hands, predictions: {}, round: 1, turnOrder: predictionOrder.slice(), played: [], wins, history: [] };
    s.phase = 'predicting';
    s.lastResult = null;
    this.bump();
  }

  predict(playerId: string, value: Prediction): void {
    const s = this.state;
    const g = s.game;
    if (s.phase !== 'predicting' || !g) throw new RuleError('NOT_PREDICTING');
    if (!g.circle.includes(playerId)) throw new RuleError('NOT_PARTICIPANT');
    if (playerId in g.predictions) throw new RuleError('ALREADY_PREDICTED'); // irreversible
    if (g.cards === 1) {
      if (value !== 'GANO' && value !== 'PIERDO') throw new RuleError('INVALID_PREDICTION');
    } else {
      if (this.currentTurn() !== playerId) throw new RuleError('NOT_YOUR_TURN');
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > g.cards) throw new RuleError('INVALID_PREDICTION');
      if (value === this.forbiddenPrediction(playerId)) throw new RuleError('SUM_FORBIDDEN');
    }
    g.predictions[playerId] = value;
    if (Object.keys(g.predictions).length === g.circle.length) s.phase = 'playing';
    this.bump();
  }

  play(playerId: string, cardId: string): void {
    const s = this.state;
    if (s.phase === 'penaltyPlaying') return this.penaltyPlay(playerId, cardId);
    const g = s.game;
    if (s.phase !== 'playing' || !g) throw new RuleError('NOT_PLAYING');
    if (this.currentTurn() !== playerId) throw new RuleError('NOT_YOUR_TURN');
    const hand = g.hands[playerId]!;
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new RuleError('CARD_NOT_IN_HAND');
    const [card] = hand.splice(idx, 1);
    g.played.push({ playerId, card: card! });
    if (card!.suit === 'joker') this.player(playerId).stats.jokersPlayed++;
    if (g.played.length === g.circle.length) this.resolveRound();
    this.bump();
  }

  private roundWinner(plays: Play[]): string {
    let best = plays[0]!;
    for (const p of plays) if (cardValue(p.card) > cardValue(best.card)) best = p; // empate: gana la jugada antes
    return best.playerId;
  }

  private resolveRound(): void {
    const g = this.state.game!;
    const winnerId = this.roundWinner(g.played);
    g.wins[winnerId]!++;
    this.player(winnerId).stats.roundsWon++;
    g.history.push({ round: g.round, plays: g.played.slice(), winnerId });
    if (g.round === g.cards) return this.resolveGame();
    g.round++;
    g.played = [];
    g.turnOrder = this.rotateFrom(g.circle, g.circle.indexOf(winnerId));
  }

  private resolveGame(): void {
    const s = this.state;
    const g = s.game!;
    const rows: GameResultRow[] = [];
    const eliminatedNow: string[] = [];
    // 1) evaluar a todos antes de aplicar eliminaciones
    for (const id of g.circle) {
      const p = this.player(id);
      const pred = g.predictions[id]!;
      const wins = g.wins[id]!;
      const hit = g.cards === 1 ? (pred === 'GANO') === (wins === 1) : pred === wins;
      const row: GameResultRow = { playerId: id, prediction: pred, wins, hit, livesBefore: p.lives, livesAfter: p.lives, statusBefore: p.status, statusAfter: p.status };
      p.stats.gamesPlayed++;
      if (hit) {
        p.stats.predictionsHit++;
        if (p.status === 'repesca') { p.lives = 1; p.status = 'ultimaVida'; p.repescaUsed = true; p.stats.repescasPassed++; }
      } else {
        p.stats.predictionsMissed++;
        if (p.status === 'repesca') { p.status = 'eliminado'; eliminatedNow.push(id); }
        else {
          p.lives--; p.stats.livesLost++;
          if (p.lives === 0) {
            if (p.repescaUsed) { p.status = 'eliminado'; eliminatedNow.push(id); }
            else p.status = 'repesca'; // tercera vida: repesca en el SIGUIENTE juego
          }
        }
      }
      row.livesAfter = p.lives; row.statusAfter = p.status;
      rows.push(row);
    }
    // 2) resultado de la partida
    const survivors = this.alive();
    if (eliminatedNow.length) s.eliminationGroups.push(eliminatedNow);
    let result: GameResult = { gameNumber: g.number, rows, outcome: 'continue' };
    if (survivors.length === 1) {
      result = { ...result, outcome: 'winner', winnerId: survivors[0]!.id };
      this.finish(survivors[0]!.id);
    } else if (survivors.length === 0) {
      // Aclaración del usuario: eliminación simultánea de todos (2 o más) => penaltis entre ellos.
      result = { ...result, outcome: 'penalty', penaltyIds: this.rotateFrom(eliminatedNow, 0) };
      s.phase = 'gameResult';
    } else s.phase = 'gameResult';
    s.lastResult = result;
  }

  /** Tras mostrar el resultado del juego: siguiente juego, o penaltis si procede. */
  nextGame(): void {
    const s = this.state;
    if (s.phase !== 'gameResult' || !s.lastResult) throw new RuleError('NOT_BETWEEN_GAMES');
    if (s.lastResult.outcome === 'penalty') return this.beginPenalty(s.lastResult.penaltyIds!, 0);
    this.beginGame();
  }

  // ---------- penaltis ----------
  private beginPenalty(ids: string[], previousAttempts: number): void {
    const s = this.state;
    const deck = this.shuffleFn(createDeck(s.jokers)); // barajar de nuevo en cada intento
    const hands: Record<string, Card> = {};
    for (const id of ids) hands[id] = deck.pop()!;
    s.penaltyCount = previousAttempts + 1;
    s.penalty = { attempt: s.penaltyCount, ids, hands, predictions: {}, played: [], history: s.penalty?.history ?? [] };
    s.phase = 'penaltyPredicting';
    this.bump();
  }

  penaltyPredict(playerId: string, value: 'GANO' | 'PIERDO'): void {
    const p = this.state.penalty;
    if (this.state.phase !== 'penaltyPredicting' || !p) throw new RuleError('NOT_PENALTY_PREDICTING');
    if (!p.ids.includes(playerId)) throw new RuleError('NOT_PARTICIPANT');
    if (playerId in p.predictions) throw new RuleError('ALREADY_PREDICTED');
    if (value !== 'GANO' && value !== 'PIERDO') throw new RuleError('INVALID_PREDICTION');
    p.predictions[playerId] = value;
    if (Object.keys(p.predictions).length === p.ids.length) this.state.phase = 'penaltyPlaying';
    this.bump();
  }

  private penaltyPlay(playerId: string, cardId: string): void {
    const s = this.state;
    const p = s.penalty!;
    if (this.currentTurn() !== playerId) throw new RuleError('NOT_YOUR_TURN');
    if (p.hands[playerId]!.id !== cardId) throw new RuleError('CARD_NOT_IN_HAND');
    p.played.push({ playerId, card: p.hands[playerId]! });
    if (p.hands[playerId]!.suit === 'joker') this.player(playerId).stats.jokersPlayed++;
    if (p.played.length === p.ids.length) {
      const winnerId = this.roundWinner(p.played);
      const hitters = p.ids.filter((id) => (p.predictions[id] === 'GANO') === (id === winnerId));
      p.history.push({ attempt: p.attempt, winnerId, hitters });
      if (hitters.length === 1) this.finish(hitters[0]!);
      else this.beginPenalty(hitters.length >= 2 ? hitters : p.ids, p.attempt); // sin vidas extra
    }
    this.bump();
  }

  // ---------- final ----------
  private finish(winnerId: string): void {
    const s = this.state;
    s.winnerId = winnerId;
    s.phase = 'finished';
    // clasificación: ganador 1º; resto por grupo de eliminación, los últimos eliminados quedan mejor
    this.player(winnerId).stats.finalPosition = 1;
    let pos = 2;
    const groups = s.eliminationGroups.slice().reverse();
    for (const grp of groups) {
      const rest = grp.filter((id) => id !== winnerId);
      for (const id of rest) this.player(id).stats.finalPosition = pos;
      if (rest.length) pos += rest.length;
    }
    for (const p of s.players) if (p.stats.finalPosition === null) p.stats.finalPosition = pos;
    this.bump();
  }
}
