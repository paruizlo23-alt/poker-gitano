const ERR = {
    NOT_YOUR_TURN: 'Todavía no es tu turno.', ALREADY_PREDICTED: 'Ya hiciste tu predicción; no se puede cambiar.', SUM_FORBIDDEN: 'Ese número no está permitido: la suma de predicciones igualaría las rondas.',
    INVALID_PREDICTION: 'Predicción no válida.', CARD_NOT_IN_HAND: 'Esa carta no está en tu mano.', POSITION_REQUIRED: 'Selecciona una carta de tu mano.', INVALID_POSITION: 'Esa carta no existe.',
    ROOM_FULL: 'La sala está llena (máximo 7 jugadores).', ALREADY_STARTED: 'La partida ya ha empezado. Puedes entrar como espectador.', NO_SUCH_ROOM: 'Esa sala no existe o ha caducado.',
    BAD_TOKEN: 'No se pudo recuperar tu asiento. Únete de nuevo.', INVALID_NAME: 'Escribe un nombre de 1 a 20 caracteres.', NOT_HOST: 'Solo el anfitrión puede hacer eso.',
    NEED_TWO_PLAYERS: 'Hacen falta al menos 2 jugadores.', RATE_LIMIT: 'Vas demasiado rápido. Espera un momento.', SPECTATORS_FULL: 'La sala no admite más espectadores.',
    NOT_A_PLAYER: 'Los espectadores no pueden jugar.', TIMEOUT: 'El servidor tarda en responder. Reintenta.', NOT_PREDICTING: 'Ahora no se puede predecir.', NOT_PLAYING: 'Ahora no se puede jugar una carta.',
};
export const errText = (code) => ERR[code] ?? 'No se pudo completar la acción. Inténtalo de nuevo.';
export const HELP_URL = '/como-jugar';
