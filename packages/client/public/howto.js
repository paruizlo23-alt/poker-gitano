(() => {
  const a = document.getElementById('d-a'), b = document.getElementById('d-b'), out = document.getElementById('d-out'), n = 4;
  if (!a || !b || !out) return;
  const upd = () => { const f = n - (Number(a.value) + Number(b.value)); out.textContent = f >= 0 && f <= n ? `Si predice el tercero, NO puede elegir ${f}.` : 'Aquí el último jugador no tiene número prohibido.'; };
  a.addEventListener('input', upd); b.addEventListener('input', upd); upd();
})();
