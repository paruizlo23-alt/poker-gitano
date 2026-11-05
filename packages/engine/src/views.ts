import { Card } from './cards.js';
import { GameResult, Match, Phase, PlayerStatus, Prediction, Stats } from './match.js';

/** Mano tal como la ve un cliente: `cards` solo existe si está autorizado; si no, solo la cantidad (reversos). */
export interface HandView { count: number; cards: Card[] | null }
export interface MatchView {
  version: number; phase: Phase; jokers: 1 | 2; hostId: string | null; viewerId: string | null;
  role: 'player' | 'spectator';
  players: { id: string; name: string; avatar: string; order: number; lives: number; status: PlayerStatus; stats: Stats }[];
  game: null | {
    number: number; cards: number; round: number; dealerId: string; turnId: string | null;
    hands: Record<string, HandView>;
    predictions: Record<string, Prediction | 'oculta'>;
    wins: Record<string, number>;
    played: { playerId: string; card: Card }[];
    allowedPredictions: Prediction[]; forbiddenPrediction: number | null;
    history: { round: number; plays: { playerId: string; card: Card }[]; winnerId: string }[]; // cartas ya jugadas: públicas
  };
  penalty: null | {
    attempt: number; ids: string[]; turnId: string | null;
    hands: Record<string, HandView>; predictions: Record<string, 'GANO' | 'PIERDO' | 'oculta'>;
    played: { playerId: string; card: Card }[];
  };
  lastResult: GameResult | null; winnerId: string | null;
}

const hidden = (n: number): HandView => ({ count: n, cards: null });
const shown = (cs: Card[]): HandView => ({ count: cs.length, cards: cs.map((c) => ({ ...c })) });

/** Vista filtrada EN SERVIDOR. Es lo único que debe serializarse hacia cada cliente. viewerId null = espectador anónimo. */
export function viewFor(match: Match, viewerId: string | null): MatchView {
  const s = match.state;
  const me = viewerId ? s.players.find((p) => p.id === viewerId) : undefined;
  const inPenalty = !!(s.penalty && viewerId && s.penalty.ids.includes(viewerId) && s.phase !== 'finished');
  const inGame = !!(s.game && viewerId && s.game.circle.includes(viewerId));
  const spectator = !me || (me.status === 'eliminado' && !inPenalty && !(inGame && s.phase !== 'gameResult' && s.phase !== 'finished'));
  const fullAccess = spectator && !!me; // solo eliminados autenticados; un espectador anónimo NO ve manos
  const anon = !me;
  const view: MatchView = {
    version: s.version, phase: s.phase, jokers: s.jokers, hostId: s.hostId, viewerId, role: spectator ? 'spectator' : 'player',
    players: s.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, order: p.order, lives: p.lives, status: p.status, stats: { ...p.stats } })),
    game: null, penalty: null, lastResult: s.lastResult, winnerId: s.winnerId,
  };
  const g = s.game;
  if (g && s.phase !== 'penaltyPredicting' && s.phase !== 'penaltyPlaying') {
    const hands: Record<string, HandView> = {};
    for (const id of g.circle) {
      const cards = g.hands[id]!;
      if (fullAccess || s.phase === 'finished') hands[id] = shown(cards);
      else if (anon) hands[id] = hidden(cards.length);
      else if (id === viewerId) hands[id] = g.cards === 1 || me!.status === 'repesca' ? hidden(cards.length) : shown(cards);
      else hands[id] = g.cards === 1 ? shown(cards) : hidden(cards.length);
    }
    const allIn = Object.keys(g.predictions).length === g.circle.length;
    const predictions: Record<string, Prediction | 'oculta'> = {};
    for (const [id, v] of Object.entries(g.predictions)) {
      // En el juego de 1 carta las predicciones son secretas hasta que todos confirmen (los espectadores ven todo).
      predictions[id] = g.cards === 1 && !allIn && id !== viewerId && !fullAccess ? 'oculta' : v;
    }
    view.game = {
      number: g.number, cards: g.cards, round: g.round, dealerId: g.dealerId, turnId: match.currentTurn(), hands, predictions,
      wins: { ...g.wins }, played: g.played.map((p) => ({ playerId: p.playerId, card: { ...p.card } })),
      allowedPredictions: viewerId && !spectator && s.phase === 'predicting' && (g.cards === 1 ? !(viewerId in g.predictions) : match.currentTurn() === viewerId) ? match.allowedPredictions(viewerId) : [],
      history: g.history.map((h) => ({ round: h.round, winnerId: h.winnerId, plays: h.plays.map((x) => ({ playerId: x.playerId, card: { ...x.card } })) })),
      forbiddenPrediction: viewerId && !spectator ? match.forbiddenPrediction(viewerId) : null,
    };
  }
  const p = s.penalty;
  if (p && (s.phase === 'penaltyPredicting' || s.phase === 'penaltyPlaying')) {
    const hands: Record<string, HandView> = {};
    const playedIds = new Set(p.played.map((x) => x.playerId));
    for (const id of p.ids) hands[id] = fullAccess ? shown([p.hands[id]!]) : hidden(playedIds.has(id) ? 0 : 1); // finalistas no ven NINGUNA carta
    const allIn = Object.keys(p.predictions).length === p.ids.length;
    const predictions: Record<string, 'GANO' | 'PIERDO' | 'oculta'> = {};
    for (const [id, v] of Object.entries(p.predictions)) predictions[id] = !allIn && id !== viewerId && !fullAccess ? 'oculta' : v;
    view.penalty = { attempt: p.attempt, ids: p.ids.slice(), turnId: match.currentTurn(), hands, predictions, played: p.played.map((x) => ({ playerId: x.playerId, card: { ...x.card } })) };
  }
  return view;
}
