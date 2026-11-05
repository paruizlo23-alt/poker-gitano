#!/usr/bin/env python3
"""Genera las páginas estáticas de packages/client/public (contenido, legales, robots, sitemap). Uso: python3 scripts/gen-pages.py
Los marcadores __SITE_URL__, __OWNER_*__ y los bloques <!--ADS_ON-->/<!--ADS_OFF--> los sustituye el servidor al servir."""
import json, os, html
OUT = os.path.join(os.path.dirname(__file__), '..', 'packages', 'client', 'public')
UPDATED = '31 de octubre de 2026'
NAV = [('/', 'Jugar'), ('/como-jugar', 'Cómo jugar'), ('/estrategia', 'Estrategia'), ('/baraja-espanola', 'La baraja'), ('/faq', 'Preguntas')]
LEGAL = [('/aviso-legal', 'Aviso legal'), ('/privacidad', 'Privacidad'), ('/cookies', 'Cookies'), ('/condiciones', 'Condiciones de uso')]
E = html.escape

def card(f, alt): return f'<figure><img src="/assets/cards/{f}" alt="{alt}" loading="lazy" width="54" height="83"><figcaption>{alt}</figcaption></figure>'

def page(path, title, desc, body, ld=None, ads=False, scripts=(), index=True):
    nav = ''.join(f'<a href="{h}">{t}</a>' for h, t in NAV)
    foot = ' · '.join(f'<a href="{h}">{t}</a>' for h, t in LEGAL)
    ldj = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in (ld or []))
    sc = ''.join(f'<script src="{s}" defer></script>' for s in list(scripts) + (['/ads.js'] if ads else []))
    url = f'__SITE_URL__{path}'
    html_ = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title><meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}"><meta name="robots" content="{'index,follow' if index else 'noindex,follow'}">
<meta property="og:type" content="website"><meta property="og:locale" content="es_ES"><meta property="og:site_name" content="Poker Gitano">
<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="__SITE_URL__/og-image.png">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#241038">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css">{ldj}</head>
<body><main class="doc"><nav aria-label="Principal">{nav}</nav>
{body}
<footer class="site-footer"><p>© Poker Gitano · {foot} · <button class="linklike" id="privacy-btn" hidden type="button">Gestionar privacidad</button></p></footer></main>{sc}</body></html>'''
    name = 'index.html' if path == '/' else path.strip('/') + '.html'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f: f.write(html_)

# ---------- contenido ----------
rank = [('joker.svg', 'Joker'), ('oros-1.png', '1'), ('oros-12.png', '12'), ('oros-11.png', '11'), ('oros-10.png', '10'), ('oros-7.png', '7'), ('oros-6.png', '6'), ('oros-5.png', '5'), ('oros-4.png', '4'), ('oros-3.png', '3'), ('oros-2.png', '2')]
figs = ''.join(card(f, t) for f, t in rank)
HOWTO = f'''<h1>Cómo jugar a Poker Gitano</h1>
<p>Poker Gitano es un juego de cartas online para <strong>2 a 7 jugadores</strong> con baraja española de 40 cartas (sin 8 ni 9) y un joker. En cada juego se reparten cartas, <strong>predices cuántas rondas ganarás</strong> y juegas. Si fallas, pierdes una vida. Gana el último jugador que siga en pie. No hay apuestas ni dinero: es un juego gratuito de entretenimiento.</p>
<p><a class="btn primary" href="/">Jugar ahora</a></p>
<h2 id="reglas">Reglas</h2>
<details open><summary>1. Jerarquía de cartas</summary><p>De mayor a menor: Joker, 1, 12, 11, 10, 7, 6, 5, 4, 3, 2. Los palos no cuentan: ante un empate de valor gana la carta jugada antes.</p><div class="rank">{figs}</div></details>
<details open><summary>2. Los juegos: 5, 4, 3, 2, 1, 2, 3, 4, 5 cartas</summary><p>Cada juego se reparte con un número de cartas distinto y la secuencia se repite. Cada juego tiene tantas rondas como cartas. El barajador rota entre los jugadores que siguen vivos.</p></details>
<details open><summary>3. Predicciones</summary><p>Empieza el jugador a la izquierda del barajador y el barajador predice el último. Cada uno dice cuántas rondas ganará (de 0 al número de cartas). <strong>El último en predecir no puede elegir el número que haga que la suma de todas las predicciones sea igual al número de rondas</strong>, así alguien siempre falla. La predicción no se puede cambiar.</p>
<div class="demo" id="demo"><span>Juego de 4 cartas. Predicciones anteriores:</span><input id="d-a" type="number" min="0" max="4" value="1" aria-label="Predicción 1"><input id="d-b" type="number" min="0" max="4" value="2" aria-label="Predicción 2"><output id="d-out" aria-live="polite"></output></div></details>
<details open><summary>4. Las rondas</summary><p>Se juega una carta por turno y gana la ronda la carta más alta. El ganador abre la siguiente ronda. La carta que juegas queda visible para todos.</p></details>
<details open><summary>5. Vidas</summary><p>Empiezas con 3 vidas. Pierdes <strong>una vida por juego</strong> (no por ronda) si tus rondas ganadas no coinciden con tu predicción.</p></details>
<details open><summary>6. Repesca: la última oportunidad</summary><p>Al perder la tercera vida tienes una repesca en el siguiente juego: juegas <strong>sin ver tus cartas</strong>. Si aciertas recuperas 1 vida; si fallas quedas eliminado. Si ya usaste la repesca y vuelves a perder tu última vida, quedas eliminado. Los eliminados pasan a ser espectadores y ven todas las manos.</p></details>
<details open><summary>7. El juego de 1 carta</summary><p>Ves las cartas de los demás pero no la tuya. Predices <strong>GANO</strong> o <strong>PIERDO</strong> en secreto y no hay restricción de suma.</p></details>
<details open><summary>8. Penaltis</summary><p>Si todos los jugadores que quedaban caen a la vez, se resuelve con penaltis: cada finalista recibe una carta que nadie ve, elige GANO o PIERDO, y gana quien sea el único que acierta. Si aciertan varios se repite solo entre ellos; si no acierta nadie, entre todos.</p></details>
<details><summary>9. Tiempo y desconexiones</summary><p>Tienes 60 segundos por acción. Si se agota, el servidor juega una acción válida por ti; tras dos seguidas, un bot ocupa tu asiento hasta que vuelvas a actuar. Si te desconectas, un bot te sustituye y puedes volver desde el mismo navegador.</p></details>
<p>¿Quieres mejorar? Lee los <a href="/estrategia">consejos de estrategia</a> o conoce mejor <a href="/baraja-espanola">la baraja española</a>.</p>'''
page('/como-jugar', 'Cómo jugar a Poker Gitano · Reglas con ejemplos', 'Aprende a jugar a Poker Gitano: baraja española, predicciones de rondas, vidas, repesca y penaltis. Reglas claras con ejemplos.', HOWTO, ads=True, scripts=['/howto.js'],
     ld=[{"@context": "https://schema.org", "@type": "WebPage", "name": "Cómo jugar a Poker Gitano", "url": "__SITE_URL__/como-jugar", "inLanguage": "es"}])

FAQS = [
 ('¿Cuántos jugadores pueden jugar?', 'De 2 a 7. El anfitrión puede añadir bots para completar la sala.'),
 ('¿Hay que registrarse?', 'No. Eliges un nombre y un avatar y compartes el código o el enlace de la sala.'),
 ('¿Qué pasa si me desconecto?', 'Un bot ocupa tu asiento y la partida continúa. Al volver desde el mismo navegador recuperas tu asiento.'),
 ('¿Pueden ver mis cartas los demás?', 'No. El servidor solo envía a cada jugador lo que le corresponde ver. Los jugadores eliminados pueden ver todas las manos, como espectadores.'),
 ('¿Se juega con dinero?', 'No. Es un juego gratuito de entretenimiento, sin apuestas ni premios.'),
 ('¿Funciona en el móvil?', 'Sí. Está diseñado para móvil y escritorio y puedes instalarlo como aplicación desde el navegador.'),
 ('¿Qué datos guarda el juego?', 'Tu nombre y avatar de partida, y datos técnicos para mantener tu asiento. Más detalle en la política de privacidad.'),
]
faq_body = '<h1>Preguntas frecuentes</h1>' + ''.join(f'<details open><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in FAQS) + '<p><a href="/como-jugar">Leer las reglas completas</a> · <a href="/privacidad">Privacidad</a></p>'
page('/faq', 'Preguntas frecuentes · Poker Gitano', 'Respuestas rápidas sobre Poker Gitano: cuántos jugadores, si hay que registrarse, bots, reconexión, datos y más.', faq_body, ads=True,
     ld=[{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQS]}])

DECK = '''<h1>La baraja española: palos, figuras y valores</h1>
<p>La baraja española es una de las más extendidas del mundo hispano. Poker Gitano usa la versión de <strong>40 cartas</strong>, a la que se suma un joker.</p>
<h2>Los cuatro palos</h2>
<p>Hay cuatro palos con diez cartas cada uno: <strong>oros</strong>, <strong>copas</strong>, <strong>espadas</strong> y <strong>bastos</strong>. En Poker Gitano los palos no tienen jerarquía entre sí; solo importa el valor de la carta.</p>
<div class="rank">''' + ''.join(card(f, t) for f, t in [('oros-1.png', 'As de oros'), ('copas-1.png', 'As de copas'), ('espadas-1.png', 'As de espadas'), ('bastos-1.png', 'As de bastos')]) + '''</div>
<h2>Números y figuras</h2>
<p>Cada palo va del 1 al 7 y añade tres figuras: la sota (10), el caballo (11) y el rey (12). En la baraja de 40 se suprimen el 8 y el 9, por eso verás un salto del 7 al 10.</p>
<div class="rank">''' + ''.join(card(f, t) for f, t in [('oros-10.png', 'Sota de oros'), ('copas-11.png', 'Caballo de copas'), ('espadas-12.png', 'Rey de espadas'), ('bastos-7.png', '7 de bastos')]) + '''</div>
<h2>El orden en Poker Gitano</h2>
<p>De mayor a menor: Joker, 1, 12, 11, 10, 7, 6, 5, 4, 3 y 2. Es un orden propio del juego, distinto al de otros juegos de baraja española. Las reglas completas están en <a href="/como-jugar">Cómo jugar</a>.</p>
<h2>El joker</h2>
<p>El joker es la carta más alta. La sala puede jugarse con uno o con dos jokers, a elección del anfitrión.</p>
<p><a class="btn primary" href="/">Jugar ahora</a></p>'''
page('/baraja-espanola', 'La baraja española: palos, figuras y orden en Poker Gitano', 'Conoce la baraja española de 40 cartas: los cuatro palos, las figuras, el salto del 7 al 10 y el orden de valores que usa Poker Gitano.', DECK, ads=True)

STRAT = '''<h1>Consejos y estrategia para Poker Gitano</h1>
<p>Ganar no consiste en ganar muchas rondas, sino en <strong>acertar tu predicción</strong>. Estos consejos te ayudan a predecir mejor y a durar más.</p>
<h2>1. Cuenta las cartas altas</h2>
<p>Las cartas que casi seguro ganan una ronda son el Joker, el 1 y el 12. Si tienes dos de ellas en una mano de cinco cartas, predecir 2 suele ser razonable. Fíjate también en las cartas ya jugadas: cada una que sale deja menos cartas fuertes en juego.</p>
<h2>2. Predecir 0 también es una estrategia</h2>
<p>Con manos bajas, predecir 0 y descartar tus cartas más débiles cuando te toque ganar es una opción segura. Cuando ya has cumplido tu predicción, juega la carta más alta que no gane la ronda.</p>
<h2>3. Aprovecha tu posición</h2>
<p>Jugar al final de la ronda te permite ver qué se ha jugado y elegir la carta mínima que gana. Jugar al principio obliga a decidir a ciegas. Tenlo en cuenta al predecir.</p>
<h2>4. El último en predecir</h2>
<p>Si predices el último, hay un número que no puedes elegir. Úsalo: sabes que alguien va a fallar, y a veces eso es una ventaja para elegir el número más cómodo para ti.</p>
<h2>5. El juego de 1 carta</h2>
<p>Ves las cartas de los demás pero no la tuya. Si ves una carta muy alta en otra mano, lo más probable es que pierdas; si todas las cartas rivales son bajas, apuesta por GANO.</p>
<h2>6. Repesca: a ciegas</h2>
<p>Cuando juegas sin ver tus cartas, la probabilidad media de ganar una ronda es una entre el número de jugadores. En una mesa de 4, predecir cerca de un cuarto de las rondas suele ser lo más acertado.</p>
<p>Pon a prueba estos consejos en una partida con bots: <a class="btn primary" href="/">Jugar ahora</a></p>'''
page('/estrategia', 'Estrategia de Poker Gitano: cómo acertar tus predicciones', 'Consejos para ganar en Poker Gitano: contar cartas altas, predecir 0, usar tu posición, el último predictor, el juego de 1 carta y la repesca.', STRAT, ads=True)

# ---------- legales ----------
ID = '''<ul><li><strong>Titular:</strong> __OWNER_NAME__</li><!--NIF-->__NIF_LINE__<!--/NIF-->__ADDR_LINE__<li><strong>Correo electrónico:</strong> __OWNER_EMAIL__</li><li><strong>Sitio web:</strong> __SITE_URL__</li></ul>'''
AVISO = f'''<h1>Aviso legal</h1><p><em>Última actualización: {UPDATED}</em></p>
<h2>1. Datos identificativos</h2><p>En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de que este sitio web es titularidad de:</p>{ID}
<!--ADS_OFF--><p>Este sitio es un proyecto personal gratuito, sin publicidad ni ánimo de lucro.</p><!--/ADS_OFF-->
<h2>2. Objeto</h2><p>Poker Gitano es un videojuego de cartas multijugador gratuito, accesible desde navegador. El titular puede modificar, suspender o retirar el servicio en cualquier momento.</p><!--ADS_OFF--><p>Este sitio es un proyecto personal, gratuito y sin ánimo de lucro: no contiene publicidad ni ofrece servicios de pago.</p><!--/ADS_OFF-->
<h2>3. Condiciones de uso</h2><p>El acceso y uso del sitio atribuye la condición de usuario e implica la aceptación de estas condiciones y de las <a href="/condiciones">condiciones de uso</a>.</p>
<h2>4. Propiedad intelectual y créditos</h2><p>El código del juego se distribuye como software de código abierto con la licencia indicada en su repositorio. Los textos, el reverso, el joker, los avatares y los iconos son creaciones originales para este proyecto. Las ilustraciones de las caras de las cartas proceden de __DECK_CREDIT__.</p>
<h2>5. Responsabilidad</h2><p>El titular no garantiza la disponibilidad continua del servicio ni se hace responsable de interrupciones, pérdida de partidas o fallos técnicos ajenos a su control. El juego se ofrece «tal cual», sin apuestas ni premios.</p>
<h2>6. Enlaces</h2><p>El sitio puede contener enlaces a terceros sobre cuyo contenido el titular no tiene control ni asume responsabilidad.</p>
<h2>7. Legislación y jurisdicción</h2><p>Estas condiciones se rigen por la legislación española. Para cualquier controversia, y si el usuario es consumidor, serán competentes los juzgados y tribunales que correspondan conforme a la normativa de consumidores.</p>
<h2>8. Contacto</h2><p>Para cualquier consulta, incidencia o ejercicio de derechos escribe a __OWNER_EMAIL__.</p>'''
page('/aviso-legal', 'Aviso legal · Poker Gitano', 'Aviso legal de Poker Gitano: datos identificativos del titular conforme al artículo 10 de la LSSI-CE, propiedad intelectual y responsabilidad.', AVISO)

PRIV = f'''<h1>Política de privacidad</h1><p><em>Última actualización: {UPDATED}</em></p>
<h2>1. Responsable del tratamiento</h2>{ID}
<h2>2. Qué datos tratamos</h2>
<ul><li><strong>Nombre (apodo) y avatar</strong> que eliges para jugar. Son voluntarios, se recomienda no usar tu nombre real y los ven los demás jugadores de tu sala.</li>
<li><strong>Datos de partida:</strong> predicciones, cartas jugadas, vidas y estadísticas de la partida.</li>
<li><strong>Identificador de asiento (token):</strong> un código aleatorio que se guarda en tu navegador para que puedas volver a tu partida. En el servidor solo se conserva una huella (hash) del mismo.</li>
<li><strong>Dirección IP y datos técnicos:</strong> el servidor las usa de forma transitoria, en memoria, para limitar abusos (límite de peticiones). El proveedor de alojamiento (__HOSTING__) puede registrar direcciones IP en sus registros de acceso por razones de seguridad y funcionamiento.</li>
<li><strong>Correo electrónico y contenido de tus mensajes,</strong> solo si nos escribes.</li></ul>
<p>No pedimos registro, contraseña, teléfono ni datos de pago. No elaboramos perfiles ni tomamos decisiones automatizadas.</p>
<h2>3. Finalidades y base jurídica</h2>
<ul><li>Prestarte el servicio de juego (art. 6.1.b RGPD, ejecución del servicio solicitado).</li>
<li>Mantener la seguridad y evitar abusos (art. 6.1.f RGPD, interés legítimo).</li>
<li>Atender tus consultas y solicitudes de derechos (art. 6.1.b y 6.1.c RGPD).</li>
<!--ADS_ON--><li>Mostrar publicidad en las páginas de contenido, solo si lo aceptas en el aviso de consentimiento (art. 6.1.a RGPD).</li><!--/ADS_ON--></ul>
<h2>4. Conservación</h2>
<p>Las salas terminadas se eliminan del servidor a los 30 minutos y las inactivas, tras 6 horas sin conexiones. Los datos guardados en tu navegador permanecen hasta que los borres. Las consultas por correo se conservan el tiempo necesario para atenderlas y, después, durante los plazos legales de prescripción.</p>
<h2>5. Destinatarios y transferencias</h2>
<p>Tus datos se comunican al proveedor de alojamiento (encargado del tratamiento) y a otros jugadores de tu sala en lo que concierne a tu apodo, avatar y juego. <!--ADS_ON-->Si aceptas la publicidad, Google actúa como proveedor de publicidad y puede tratar datos fuera del Espacio Económico Europeo con las garantías previstas por la normativa. <!--/ADS_ON-->No vendemos datos.</p>
<h2>6. Tus derechos</h2>
<p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a __OWNER_EMAIL__, indicando el apodo y la sala. Si consideras que tus derechos no han sido atendidos, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>).</p>
<h2>7. Menores</h2>
<p>El servicio no está dirigido a menores de 14 años. Si eres menor de esa edad, necesitas la autorización de tus padres o tutores para usarlo.</p>
<h2>8. Seguridad</h2>
<p>Aplicamos medidas técnicas como conexión cifrada (HTTPS), huella en lugar del token original, validación de todas las acciones en el servidor y límites de uso. Ninguna medida es infalible; si detectas un problema, avísanos.</p>'''
page('/privacidad', 'Política de privacidad · Poker Gitano', 'Qué datos trata Poker Gitano, para qué, cuánto tiempo los conserva y cómo ejercer tus derechos conforme al RGPD.', PRIV)

COOK = f'''<h1>Política de cookies y almacenamiento local</h1><p><em>Última actualización: {UPDATED}</em></p>
<h2>1. Qué usamos</h2>
<p>Este sitio no usa cookies propias. Para funcionar usa el <strong>almacenamiento local de tu navegador</strong> (localStorage y caché del navegador), que está sujeto a la misma normativa (art. 22.2 LSSI-CE).</p>
<div class="table-wrap"><table class="stats"><thead><tr><th>Nombre</th><th>Finalidad</th><th>Tipo</th><th>Duración</th></tr></thead><tbody>
<tr><td>pg:settings</td><td>Recordar tema, sonido, volumen y animaciones</td><td>Preferencias elegidas por ti (exento)</td><td>Hasta que lo borres</td></tr>
<tr><td>pg:name, pg:avatar</td><td>Recordar tu apodo y avatar para la próxima partida</td><td>Preferencias elegidas por ti (exento)</td><td>Hasta que lo borres</td></tr>
<tr><td>pg:token:CÓDIGO</td><td>Mantener tu asiento si recargas o te desconectas</td><td>Técnico, necesario para el servicio (exento)</td><td>Hasta que salgas de la sala o lo borres</td></tr>
<tr><td>Caché del navegador</td><td>Cargar más rápido imágenes y archivos del juego</td><td>Técnico (exento)</td><td>Hasta que se actualice o lo borres</td></tr></tbody></table></div>
<p>Estos elementos son estrictamente necesarios o los has solicitado tú, por lo que no requieren consentimiento previo. No usamos analítica ni seguimiento propios.</p>
<!--ADS_OFF--><h2>2. Publicidad</h2><p>Actualmente este sitio no muestra publicidad ni instala cookies publicitarias de terceros.</p><!--/ADS_OFF-->
<!--ADS_ON--><h2>2. Publicidad (Google AdSense)</h2><p>Las páginas de contenido (Cómo jugar, Estrategia, La baraja y Preguntas) muestran anuncios de Google AdSense. Google y sus socios pueden usar cookies y tecnologías similares para mostrar y medir anuncios. En el Espacio Económico Europeo, el Reino Unido y Suiza solo se cargan con tu consentimiento, que gestiona una plataforma certificada de Google; puedes aceptar, rechazar o cambiar tu decisión en cualquier momento con el enlace «Gestionar privacidad» del pie de página. Si rechazas, no se muestran anuncios personalizados. Las pantallas de juego no contienen publicidad. Más información: <a href="https://policies.google.com/technologies/ads?hl=es" rel="noopener">cómo usa Google los datos de publicidad</a>.</p><!--/ADS_ON-->
<h2>3. Cómo borrar o bloquear</h2>
<p>Puedes borrar el almacenamiento local desde los ajustes de tu navegador (datos del sitio). Si lo haces perderás tus preferencias y, durante una partida, el acceso a tu asiento.</p>'''
page('/cookies', 'Política de cookies y almacenamiento · Poker Gitano', 'Qué almacenamiento local usa Poker Gitano, para qué sirve, cuánto dura y cómo borrarlo. Sin cookies de seguimiento propias.', COOK)

COND = f'''<h1>Condiciones de uso</h1><p><em>Última actualización: {UPDATED}</em></p>
<h2>1. Servicio</h2><p>Poker Gitano es un juego de cartas online gratuito y sin registro. No hay apuestas, premios ni compras. Se ofrece «tal cual», sin garantía de disponibilidad.</p>
<h2>2. Quién puede usarlo</h2><p>Recomendado para mayores de 14 años. Los menores de esa edad necesitan autorización de sus padres o tutores (ver <a href="/privacidad">privacidad</a>).</p>
<h2>3. Comportamiento</h2>
<ul><li>Elige un apodo y un avatar adecuados: no uses nombres ofensivos, discriminatorios ni que suplanten a otras personas.</li>
<li>No hagas trampas: no manipules el cliente, no uses programas que automaticen jugadas, no intentes ver cartas ajenas ni explotar fallos. El servidor valida todas las acciones.</li>
<li>No saturar el servicio ni intentar acceder a salas o datos que no te corresponden.</li>
<li>Respeta a los demás jugadores. Puedes abandonar una sala en cualquier momento.</li></ul>
<h2>4. Suspensión</h2><p>El titular puede expulsar de una sala, bloquear el acceso o cerrar salas que incumplan estas condiciones o afecten al funcionamiento del servicio.</p>
<h2>5. Propiedad intelectual</h2><p>Consulta el <a href="/aviso-legal">aviso legal</a> para créditos y licencias.</p>
<h2>6. Cambios</h2><p>Estas condiciones pueden actualizarse; la fecha de última actualización figura al inicio de la página.</p>
<h2>7. Contacto</h2><p>__OWNER_EMAIL__</p>'''
page('/condiciones', 'Condiciones de uso · Poker Gitano', 'Condiciones de uso de Poker Gitano: servicio gratuito sin apuestas, edad recomendada, comportamiento esperado y suspensión.', COND)

# ---------- robots, sitemap ----------
urls = ['/', '/como-jugar', '/estrategia', '/baraja-espanola', '/faq', '/aviso-legal', '/privacidad', '/cookies', '/condiciones']
open(os.path.join(OUT, 'robots.txt'), 'w').write('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ws\n\nSitemap: __SITE_URL__/sitemap.xml\n')
open(os.path.join(OUT, 'sitemap.xml'), 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>__SITE_URL__{u}</loc><lastmod>2026-10-31</lastmod></url>\n' for u in urls) + '</urlset>\n')
print('páginas generadas:', len(urls) - 1)
