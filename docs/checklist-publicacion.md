# Checklist de publicación y monetización

## Antes de publicar
- [ ] Comprar el dominio y configurar `SITE_URL` (https, sin barra final).
- [x] Decisión del titular: **no facilitar NIF/DNI → no se activa publicidad.** El servidor ignora `ADSENSE_CLIENT` sin `OWNER_NIF` y el aviso legal dice que es un proyecto personal sin publicidad ni ánimo de lucro.
- [x] Decisión del titular: **sin domicilio ni NIF mientras sea un proyecto personal sin ingresos** (solo nombre y correo de contacto). Si algún día hay publicidad, patrocinios o ingresos, habrá que añadirlos (variables `OWNER_ADDRESS` y `OWNER_NIF`) y revisar los textos legales.
- [ ] Confirmar autor y **licencia de la baraja libre** y rellenar `DECK_CREDIT` y `ASSETS.md`.
- [ ] Indicar `HOSTING_PROVIDER`.
- [ ] Elegir y añadir la licencia del código (`LICENSE`).
- [ ] Revisar los textos legales con un profesional: son un modelo razonable, no asesoramiento jurídico.
- [ ] Enviar `sitemap.xml` a Google Search Console.

## Activar AdSense (solo con dominio propio y contenido publicado)
1. Dar de alta el sitio en AdSense y esperar aprobación (rechazan sitios sin contenido suficiente o en subdominios ajenos).
2. En AdSense → **Privacidad y mensajes**, crear y publicar el mensaje europeo (CMP gratuito certificado por Google). Para anuncios personalizados en UE/UK/Suiza es obligatorio un CMP certificado; no hay banner propio.
3. Configurar `ADSENSE_CLIENT=ca-pub-…`: se sirve `/ads.txt`, se cargan anuncios solo en Cómo jugar, Estrategia, La baraja y FAQ, y los textos de cookies/privacidad cambian solos.
4. En AdSense, excluir las pantallas de juego (no cargan el script) y revisar que no haya anuncios cerca de botones.
5. Comprobar en el navegador (consola) que no hay bloqueos de CSP; las páginas con anuncios no llevan CSP propia.
6. Consultar con la Agencia Tributaria / gestor las obligaciones fiscales de los ingresos de AdSense.

## Auditoría automática incluida
`npm test -w @poker-gitano/server` comprueba páginas, enlaces rotos, sitemap, JSON-LD, CSP, `ads.txt` y que no haya datos personales en el código.
