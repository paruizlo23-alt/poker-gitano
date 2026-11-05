# Poker Gitano (código abierto, MIT)

Estado: **fases 1-10 completadas** (motor, servidor autoritativo, cliente web con animaciones, sonido y PWA). Páginas legales, SEO, AdSense preparado (desactivado: requiere NIF), pruebas de integración y auditoría, y despliegue gratuito en Render documentado.

## Motor (`packages/engine`)
Puro y determinista, sin red ni DOM. El servidor lo usará como única fuente de verdad.
- `cards.ts` baraja 40 + joker(s), jerarquía, Fisher-Yates criptográfico.
- `match.ts` sala, reparto, predicciones (restricción de suma), rondas, vidas, repesca, penaltis N jugadores, estadísticas.
- `views.ts` `viewFor(match, jugador|null)`: filtra en servidor lo que cada cliente puede ver.

```
cd packages/engine && npm test && npm run typecheck   # requiere tsx y typescript
```
Sin `@types/node` instalado se usa `src/node-shim.d.ts` (borrarlo al instalarlo).

## Decisiones abiertas
Ver `ambiguedades.md` de la skill `poker-gitano`. Imágenes (reverso y joker): derechos por verificar.

## Servidor (`packages/server`)
Sin dependencias externas (HTTP + WebSocket RFC 6455 propios sobre Node 22). Persistencia en JSON (`RoomStore`, sustituible por PostgreSQL).
Un solo proceso: no escala horizontalmente sin cambiar el almacén y añadir afinidad de sala. TLS lo termina el proxy inverso.
```
cp .env.example .env   # y exporta las variables
cd packages/server && npm start        # o: npx tsx src/main.ts
npm test && npm run typecheck
```
Protocolo en `docs/protocolo.md`. Retención: salas terminadas se borran a los 30 min; inactivas sin conectados, a las 6 h.

## Cliente (`packages/client`)
SPA en TypeScript sin dependencias (compilada con `tsc`), servida por el propio servidor con CSP estricta (`script-src 'self'`).
```
npm run build -w @poker-gitano/client     # genera public/js
cd packages/server && npm start           # sirve la app en http://localhost:8080
node packages/client/e2e/play.mjs [full]  # e2e con Playwright (partida completa contra bots)
```
Recursos (`public/assets`): 40 caras recortadas de la baraja libre aportada (verificar y conservar su licencia), reverso y joker **originales**, 10 avatares originales. Sonido sintetizado con WebAudio (sin archivos).
Páginas indexables: `/como-jugar`, `/faq`. Pendiente fase 7: páginas legales, cookies/consentimiento, sitemap, JSON-LD, AdSense.

## Publicación (fase 7)
Páginas generadas con `python3 scripts/gen-pages.py`; el servidor rellena titular y dominio desde variables de entorno (`.env.example`), así los datos personales no viven en el código.
Ver `docs/dominio-y-hosting.md` y `docs/checklist-publicacion.md`. La publicidad está **desactivada** hasta definir `ADSENSE_CLIENT`.

## Demo sin servidor
`npm run demo` genera `demo.html`: un único archivo (≈0,8 MB) con el motor, los bots, la sala y la interfaz reales, que funciona abriéndolo con doble clic. Es la forma más rápida de ver y probar el juego.

## Despliegue y pruebas
- Render gratuito: `render.yaml` + `docs/despliegue-render.md`. Alternativa Docker: `Dockerfile` (no probado sin red).
- `npm test` (motor + servidor), `npm run typecheck`, `npm run e2e` (partida completa en navegador real), `node packages/client/e2e/responsive.mjs` (adaptación y accesibilidad en 3 tamaños × 2 temas).
- Nota: el typecheck usa tipos mínimos de Node (`node-shim.d.ts`); no añadas `@types/node` sin borrarlos.
