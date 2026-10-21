// Aplica a cor escolhida antes de a página aparecer (evita piscar no tema padrão).
(function () {
  try {
    var t = localStorage.getItem('pandora-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sem armazenamento: usa o tema padrão */ }
})();
