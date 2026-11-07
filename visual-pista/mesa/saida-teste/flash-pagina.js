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
    comando(acao, nomes, strobo, hz, cor, forca) {
      const agora = Date.now();
      for (const n of nomes) {
        if (n === 'fumaca') { if (window.__fumaca) window.__fumaca.comando(acao); continue; }
        const s = alvos[n];
        if (!s) continue;
        if (acao === 'liga') {
          if (hz > 0) s.periodo = 1000 / hz;
          s.forca = forca > 0 ? forca / 100 : (forca === 0 ? 0 : 1);
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
    const fA = alvos.atras.forca ?? 1, fP = alvos.painel.forca ?? 1;
    window.__luzShow.atras = Math.max(a, 0) * fA;
    window.__luzShow.painel = Math.max(p, 0) * fP;
    // strobo do painel: a imagem normal e o negativo dela, um de cada vez
    // a intensidade escurece a cor do negativo: fraca, o céu quase não acende e o logo segue claro
    const base = (alvos.painel.cor || '#ffffff').replace('#fff', '#ffffff').slice(1).padEnd(6, 'f');
    const cor = `rgb(${[0, 2, 4].map(i => Math.round(parseInt(base.slice(i, i + 2), 16) * fP)).join(',')})`;
    if (cor !== corT) { tudo.style.background = cor; corT = cor; }
    const op = Math.max(p, 0);
    if (op !== antesT) { tudo.style.opacity = op; antesT = op; }
    const opP = window.__temContraluz ? 0 : Math.max(a, 0) * fA;
    if (opP !== antesP) { parede.style.opacity = opP; antesP = opP; }
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
  // personagens da marca: uma camada por cima de qualquer visual. Só carrega a malha quando o botão do app estiver ligado.
  import('/personagens/camada.js').catch(e => console.error('personagens: ' + e.message));
  // Os elementos que o diretor automático pede agora. Valem por cima do que está no app, sem gravar nada: desligou, volta o que está lá.
  window.__autoLed = v => { window.__autoLedValores = v; if (v && window.__REACOES) Object.assign(window.__REACOES.led, v); };
  // camada de cor por cima de tudo. Endereço inteiro: as cenas do gerador moram em outra origem. Ver regencia\cor.js
  import('http://127.0.0.1:' + (window.__portaSaida || 5212) + '/regencia/cor.js').catch(e => console.error('cor: ' + e.message));
  // fumaça virtual: nasce embaixo do booth e sobe. Ver fumaca\camada.js
  import('/fumaca/camada.js').catch(e => console.error('fumaca: ' + e.message));
})();
