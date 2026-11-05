// Publicidad: SOLO en páginas de contenido y SOLO si el servidor tiene configurado ADSENSE_CLIENT. Nunca en las pantallas de juego.
// El consentimiento en la UE/UK/Suiza lo gestiona la plataforma certificada de Google (AdSense → Privacidad y mensajes), no un banner propio.
(() => {
  fetch('/api/config').then((r) => r.json()).then((cfg) => {
    if (!cfg || !cfg.adsClient) return;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsClient);
    document.head.appendChild(s);
    const b = document.getElementById('privacy-btn');
    if (b) { b.hidden = false; b.addEventListener('click', () => { try { if (window.googlefc && window.googlefc.showRevocationMessage) return window.googlefc.showRevocationMessage(); } catch (e) { /* sin CMP cargada */ } location.href = '/cookies'; }); }
  }).catch(() => { /* sin servidor de config: sin anuncios */ });
})();
