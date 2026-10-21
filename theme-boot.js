// Aplica as escolhas visuais (cor e movimento do fundo) antes de a página aparecer, sem piscar.
(function () {
  var root = document.documentElement, t = null, m = null;
  try { t = localStorage.getItem('pandora-theme'); m = localStorage.getItem('pandora-motion'); } catch (e) { /* sem armazenamento: usa o padrão */ }
  if (t) root.setAttribute('data-theme', t);
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignora */ }
  // Sem escolha salva, segue a preferência do sistema (quem pede menos movimento começa com ele desligado).
  root.setAttribute('data-motion', (m ? m === 'off' : reduce) ? 'off' : 'on');
})();
