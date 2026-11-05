# Publicar gratis en Render (paso a paso)

Coste: 0 €. Sin tarjeta. Sin dominio propio (usarás `https://NOMBRE.onrender.com`). Sin publicidad, sin NIF y sin domicilio publicado (proyecto personal sin ingresos).

1. **Sube el proyecto a GitHub.** (Atajo: `bash scripts/subir-a-github.sh TU-USUARIO TU-CORREO-NOREPLY` hace todo lo siguiente y pide confirmación antes de subir.) Descomprime el zip, crea en github.com un repositorio vacío llamado `poker-gitano` (sin README) y, dentro de la carpeta del proyecto:
   ```
   git init -b main
   git config user.name "Pablo Ruiz Lozano"
   git config user.email "TU-ID+TU-USUARIO@users.noreply.github.com"   # correo privado de GitHub (Settings → Emails → Keep my email private)
   git add .
   git commit -m "Poker Gitano"
   git remote add origin https://github.com/TU-USUARIO/poker-gitano.git
   git push -u origin main
   ```
   Usa el correo `noreply` para que tu correo real no quede en el historial público. `.env` ya está en `.gitignore`: nunca lo subas. GitHub ejecutará las pruebas automáticamente en cada subida (`.github/workflows/ci.yml`).
2. En **render.com** crea una cuenta con GitHub → **New → Blueprint** → elige el repositorio. Render lee `render.yaml`.
3. Rellena las variables que pide:
   - `OWNER_NAME` = Pablo Ruiz Lozano · `OWNER_EMAIL` = tu correo de contacto (se mostrará en el aviso legal y la privacidad).
   - `SITE_URL` = la URL que te asigne Render, p. ej. `https://poker-gitano.onrender.com` (sin barra final). Si aún no la sabes, despliega con un valor provisional y corrígelo después en *Environment* (y relanza).
   - No hace falta `OWNER_NIF` ni `OWNER_ADDRESS`: sin ellos esas líneas no aparecen.
4. Espera al primer despliegue y abre `https://TU-URL/api/health` → debe responder `{"ok":true}`. Luego abre la raíz, crea una partida, añade bots y juega.
5. Comprueba las páginas legales (`/aviso-legal`, `/privacidad`): deben mostrar tu nombre y correo, y decir que es un proyecto personal sin publicidad.

## Limitaciones del plan gratuito (importante)
- **Se duerme** tras ~15 min sin tráfico: el primer visitante espera cerca de un minuto. Las partidas en curso mantienen la conexión abierta.
- **Disco efímero:** si el servicio se reinicia o se redespliega, **se pierden las salas** (los jugadores deberán crear otra).
- Un temporizador externo que visite `/api/health` cada pocos minutos evita el sueño, pero revisa las condiciones de Render antes de usarlo.
- Ancho de banda y horas mensuales limitados.

## Cuando tengas dominio
Añádelo en Render (*Settings → Custom Domains*), crea los registros DNS que indique, cambia `SITE_URL` al nuevo dominio y relanza. Un dominio `.es` cuesta unos 7 €/año (ver `dominio-y-hosting.md`).

## Si algún día quieres publicidad
Necesitarás dominio propio, aprobación de AdSense y facilitar tu NIF (`OWNER_NIF`): sin él, el servidor **ignora** `ADSENSE_CLIENT` a propósito. Ver `checklist-publicacion.md`.
