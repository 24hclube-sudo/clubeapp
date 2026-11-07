// Letreiros por cima de um visual que não é da família WebGPU (vídeos do H3 e cenas do gerador): logo do CLUBE fixo na parede do DJ e,
// no teto, Pista Quente e Millos Kaiser alternando a cada 16 batidas. Branco com sombra, para ler sobre qualquer imagem. Uso: Letreiros(<pasta dos PNG>, () => ({ bumbo, fase })).
window.Letreiros = function (pasta, som) {
  const img = (nome, x, y, l) => {
    const el = new Image();
    el.src = pasta + nome + '.png';
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${l}px;filter:drop-shadow(0 0 16px rgba(0,0,0,.85));transform-origin:50% 50%;will-change:transform,opacity;z-index:5;pointer-events:none`;
    document.body.appendChild(el);
    return el;
  };
  const logo = img('clube', 66, 5222, 900);
  const nomes = [img('titulo', 66, 2300, 900), img('millos', 66, 2190, 900)];
  function quadro() {
    const { bumbo = 0, fase = performance.now() / 500 } = som() || {};
    logo.style.transform = `scale(${1 + bumbo * 0.06})`;
    const b = fase % 16, vez = Math.floor(fase / 16) % 2;
    nomes.forEach((n, i) => {
      const dentro = i === vez ? Math.min(1, b / 0.5) * Math.min(1, Math.max(0, 13 - b)) : 0;
      n.style.opacity = dentro;
      n.style.transform = `scale(${1 + bumbo * 0.03})`;
    });
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
};
