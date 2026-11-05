# Protocolo WebSocket (`/ws`)

Primer mensaje (obligatorio, en 10 s): `{t:'join',room,name,avatar}` | `{t:'rejoin',room,token}` | `{t:'spectate',room}`.
Respuesta: `{t:'welcome',room,seatId,token?}` (el token solo se entrega en `join`; guárdalo, es la única credencial de asiento).

Después, solo `{t:'cmd', id, type, ...}` con `id` único por acción (idempotencia):
`addBot`, `setJokers{value:1|2}`, `start`, `predict{value}`, `play{cardId}` o `play{pos}`, `sync`.
En mano oculta (repesca, 1 carta, penaltis) `play` exige `pos`; un `cardId` se rechaza con `POSITION_REQUIRED`.

Servidor → cliente: `state{view,deadlines,serverTime}` (vista filtrada y versionada), `event{ev}` (público),
`ack{id,dup?}`, `error{code,id?}`. El asiento sale siempre de la conexión, nunca del mensaje.
Eventos: playerJoined, started, dealt, predicted, played, roundWon, gameResult, penalty, timeout, botTakeover, humanBack, finished.

Límites: mensaje ≤ 16 KB, ráfaga 40 + 10/s por conexión, 10 salas/min por IP, 30 conexiones/IP, 20 espectadores/sala, 500 salas.
HTTP: `GET /api/health`, `POST /api/rooms`, `GET /api/rooms/:code`.
Temporizador: 60 s por acción (`deadlines[seatId]`, epoch ms). Caduca → acción automática válida; 2 seguidas → bot hasta que el humano actúe.
Desconexión: latido cada 10 s; tras 5 s de margen el bot ocupa el asiento y se retira al reingresar con el token.
