// Entra em toda página que a saída do LED abre (qualquer visual). Desenha o flash do painel por cima e dá às cenas 3D a força da luz de trás.
// O servidor (tv-player\luz-show.js) tem a mesma conta de tempo, para o painel e as fitas piscarem juntos.
(() => {
  if (window.__luzShow) return;
  const PERIODO = 400 / 3, CAUDA = 140, SEM_PEDIDO = 1500, STROBO_MINIMO = 400;
  const alvos = { atras: { liga: false, strobo: false, ate: 0, minimo: 0, soltou: -1e12 }, painel: { liga: false, strobo: false, ate: 0, minimo: 0, soltou: -1e12 } };
  const camada = estilo => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;pointer-events:none;z-index:2147483647;opacity:0;will-change:opacity;' + estilo;
    document.documentElement.appendChild(d);
    return d;
  };
  // inverte o que está embaixo, em vez de cobrir: o céu vira a cor do strobo e o logo fica em negativo, sempre visível
  const tudo = camada('top:0;bottom:0;background:#fff;mix-blend-mode:difference;');
  // Visual sem a luz na cena 3D: um brilho simples na parede do DJ, que são as últimas 688 das 5676 linhas.
  const parede = camada('bottom:0;height:12.13%;background:radial-gradient(ellipse at center,#fff 0%,#fff 35%,rgba(255,255,255,0) 100%);');
  const nivel = (s, agora) => {
    if (s.liga && agora > s.ate) { s.liga = false; s.soltou = agora; }
    if (s.liga) return s.strobo ? (Math.floor(agora / ((s.periodo || PERIODO) / 2)) % 2 === 0 ? 1 : -1) : 1;
    const k = Math.exp(-(agora - s.soltou) / CAUDA);
    return k > 0.004 ? k : 0;
  };
  window.__luzShow = {
    atras: 0, painel: 0,
    comando(acao, nomes, strobo, hz, cor) {
      const agora = Date.now();
      for (const n of nomes) {
        const s = alvos[n];
        if (!s) continue;
        if (acao === 'liga') {
          if (hz > 0) s.periodo = 1000 / hz;
          s.cor = strobo && cor ? '#' + cor : '#fff';
          if (!s.liga || s.strobo !== strobo) s.minimo = strobo ? agora + STROBO_MINIMO : 0;
          s.liga = true; s.strobo = strobo; s.ate = agora + SEM_PEDIDO;
        } else if (s.minimo > agora) s.ate = s.minimo;
        else if (s.liga) { s.liga = false; s.soltou = agora; }
      }
    },
  };
  let antesT = -1, antesP = -1, corT = '';
  function passo() {
    const agora = Date.now();
    const a = nivel(alvos.atras, agora), p = nivel(alvos.painel, agora);
    window.__luzShow.atras = Math.max(a, 0);
    window.__luzShow.painel = Math.max(p, 0);
    // strobo do painel: a imagem normal e o negativo dela, um de cada vez
    const cor = alvos.painel.cor || '#fff';
    if (cor !== corT) { tudo.style.background = cor; corT = cor; }
    const op = Math.max(p, 0);
    if (op !== antesT) { tudo.style.opacity = op; antesT = op; }
    const opP = window.__temContraluz ? 0 : Math.max(a, 0);
    if (opP !== antesP) { parede.style.opacity = opP; antesP = opP; }
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
  // personagens da marca: uma camada por cima de qualquer visual. Só carrega a malha quando o botão do app estiver ligado.
  import('/personagens/camada.js').catch(e => console.error('personagens: ' + e.message));
})();
