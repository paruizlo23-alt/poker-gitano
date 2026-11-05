# Dominio y alojamiento (investigado el 31-oct-2026; los precios cambian, confírmalos al comprar)

## Dominio
AdSense exige que el dominio sea tuyo: un subdominio de una plataforma (`*.onrender.com`, `*.vercel.app`...) no se aprueba. Sin dominio propio puedes jugar y publicar, pero **no monetizar**.
- **.es en OVHcloud:** 5,99 € + IVA el primer año; renovación 6,99 € + IVA/año (según su página de dominios .es).
- **.es en INWX:** promoción de unos 5,35 USD el primer año (promo vista en julio de 2026; la renovación suele ser mayor).
- **.es oficial:** no hace falta ser residente en España; el titular debe acreditar vínculo con España (DNI/pasaporte), tu caso lo cumple.
- Disponibilidad: no puedo comprobarla desde aquí. Comprueba en el registrador `pokergitano.es` (alternativas: `pokergitano.com`, `jugarpokergitano.es`, `poker-gitano.es`).
- Consejo: activa renovación automática y el bloqueo de transferencia; la WHOIS de personas físicas .es está oculta por defecto.

## Alojamiento (gratis o casi)
Este servidor necesita un proceso Node **siempre encendido** con WebSocket y memoria persistente entre partidas.
| Opción | Coste | Tarjeta | Pros / contras |
|---|---|---|---|
| **Render (web service gratuito)** | 0 € | No | Dominio propio y HTTPS incluidos. Se duerme tras 15 min sin tráfico (el primer jugador espera ~1 min), disco efímero: **las salas se pierden al reiniciar**, ancho de banda limitado (5 GB/mes según informes de 2026). Válido para probar y para poco tráfico. |
| **Oracle Cloud Always Free (VM Arm)** | 0 € | Sí (verificación) | Siempre encendido, disco persistente. Requiere administrar un servidor (Caddy para HTTPS). Oracle recortó el plan gratuito en junio de 2026 y puede recuperar instancias poco usadas. |
| **VPS pequeño de pago** | unos pocos €/mes | Sí | Lo más estable; recomendable cuando haya público real. No he verificado precios actuales. |
| Fly.io / Koyeb / Heroku | — | — | Ya no tienen plan gratuito sin tarjeta, o es muy limitado. |

**Recomendación:** empezar con **Render gratis + dominio .es (~7 €/año)**: el único coste es el dominio, y sirve para solicitar AdSense. Pasar a Oracle o VPS si el tráfico lo justifica. El despliegue en Render está documentado en `despliegue-render.md` (`render.yaml` incluido).
