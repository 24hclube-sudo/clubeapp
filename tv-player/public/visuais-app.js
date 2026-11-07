// Tela "LED da pista" do app (celular.html): visuais, brilho e tom do painel do 5º andar. A conversa com a saída passa por visuais-led.js.
window.Visuais = (function () {
  'use strict';
  const ROTA = '#/visuais';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let C = null;
  let visuais = [], saida = null, carregou = false, montada = false, noQuinto = false;
  let enviando = null, confirmar = null, abrindoAte = 0, relogio = null;
  let tomAtual = 0, brilhoAtual = 70, ultimoAjuste = 0;
  let sliderTom = null, sliderBrilho = null, sliderCartao = null;
  let limiteHz = 7.5;
  // Cor do strobo: fica guardada neste aparelho
  const CORES_STROBO = [['ffffff', 'Branco'], ['ff0000', 'Vermelho'], ['ff7a00', 'Laranja'], ['ffd400', 'Amarelo'], ['00e05a', 'Verde'], ['00d0ff', 'Ciano'], ['1238e0', 'Azul'], ['ff00a0', 'Rosa']];
  let corStrobo = 'ffffff';
  try { corStrobo = localStorage.getItem('clube-strobo-cor') || 'ffffff'; } catch {}
  function pintarCores() {
    const caixa = $('vt-strobo-cor');
    if (!caixa) return;
    caixa.querySelectorAll('button').forEach(b => { b.style.outline = b.dataset.cor === corStrobo ? '3px solid #fff' : 'none'; });
    const livre = caixa.querySelector('input');
    if (livre) livre.value = '#' + corStrobo;
  }
  function escolherCorStrobo(c) {
    corStrobo = c;
    try { localStorage.setItem('clube-strobo-cor', c); } catch {}
    pintarCores();
  }
  let fluxoSom = null, somAgora = null, somEm = 0, quadroSom = 0;

  const ativa = () => location.hash === ROTA;
  const noAr = () => !!(saida && saida.noAr);
  const dados = id => visuais.find(v => v.id === id) || {};
  const nomeDe = id => dados(id).nome || id;
  const fotoDe = id => dados(id).foto || `visuais/${id}.jpg`;
  const abrindo = () => Date.now() < abrindoAte;

  // ---------- conversa com o servidor ----------
  async function buscar() {
    try {
      const r = await fetch(C.SERVIDOR + 'api/visuais', { cache: 'no-store' });
      const d = await r.json();
      visuais = d.visuais; saida = d.saida; carregou = true;
      if (d.limiteHz) limiteHz = d.limiteHz;
      if (saida) abrindoAte = 0;
      if (Date.now() - ultimoAjuste > 1500) { tomAtual = d.tom || 0; brilhoAtual = d.brilho == null ? brilhoAtual : d.brilho; }
    } catch (e) { saida = null; }
    pintar();
    agendar();
  }
  function agendar() {
    clearTimeout(relogio);
    if (document.hidden || !(ativa() || noQuinto)) return;
    relogio = setTimeout(buscar, saida && saida.carregando || abrindo() ? 1000 : 3000);
  }
  async function pedir(rota) {
    try {
      const r = await fetch(C.SERVIDOR + rota, { method: 'POST' });
      const d = await r.json();
      if (d.error) C.toast(d.error);
      saida = d.saida;
    } catch (e) { C.toast('Sem resposta do servidor'); }
    enviando = null;
    pintar();
    agendar();
  }

  // ---------- ações ----------
  // Com o visual no ar, um toque troca: é para isso que serve a tela. Se o LED estiver mostrando outra coisa, pede o 2º toque,
  // porque o visual vai substituir o que está no MadMapper.
  function precisaConfirmar(chave, avisar) {
    if (confirmar === chave) { confirmar = null; return false; }
    confirmar = chave;
    C.toast(avisar);
    pintar();
    setTimeout(() => { if (confirmar === chave) { confirmar = null; pintar(); } }, 3000);
    return true;
  }
  function escolher(id) {
    C.vibrar();
    if (!saida) return abrirSaida();
    if (enviando || (noAr() && saida.visual === id && !saida.carregando)) return;
    if (!noAr() && precisaConfirmar(id, 'Toque de novo para pôr no LED')) return;
    enviando = id;
    pintar();
    pedir('api/visuais/led?visual=' + encodeURIComponent(id));
  }
  function alternar() {
    C.vibrar();
    if (!saida) return abrirSaida();
    if (enviando) return;
    if (noAr()) { enviando = 'tirar'; pintar(); return pedir('api/visuais/tirar'); }
    if (precisaConfirmar('ligar', 'Toque de novo para pôr no LED')) return;
    enviando = saida.visual;
    pintar();
    pedir('api/visuais/led?visual=' + encodeURIComponent(saida.visual));
  }
  function abrirSaida() {
    if (abrindo()) return;
    abrindoAte = Date.now() + 25000;
    pintar();
    pedir('api/visuais/abrir');
  }

  // ---------- brilho e tom ----------
  function ajustar(campo, valor) {
    ultimoAjuste = Date.now();
    fetch(C.SERVIDOR + `api/visuais/ajuste?${campo}=${valor}`, { method: 'POST' }).catch(() => C.toast('Sem resposta do servidor'));
  }
  function mudarBrilho(v) {
    brilhoAtual = v;
    if (sliderBrilho) sliderBrilho.definir(v);
    if (sliderCartao) sliderCartao.definir(v);
    ajustar('brilho', v);
  }
  // O slider do tom vai de 0 a 100 com o neutro no meio; o servidor recebe de -100 (frio) a 100 (quente).
  const tomDoSlider = v => { const t = (v - 50) * 2; return Math.abs(t) <= 4 ? 0 : t; };
  const textoTom = v => { const t = tomDoSlider(v); return t === 0 ? 'Neutro' : (t > 0 ? 'Mais quente ' : 'Mais frio ') + Math.abs(t); };
  function mudarTom(valor) {
    tomAtual = valor;
    ajustar('tom', valor);
  }

  // ---------- textos ----------
  function textoEstado() {
    if (!carregou) return 'Carregando…';
    if (!saida) return abrindo() ? 'Abrindo a saída…' : 'Saída fechada';
    if (enviando === 'tirar') return 'Tirando do LED…';
    if (enviando) return 'Trocando para ' + nomeDe(enviando) + '…';
    if (saida.carregando) return 'Trocando para ' + nomeDe(saida.carregando) + '…';
    return noAr() ? nomeDe(saida.visual) + ' · no ar' : 'LED apagado';
  }
  function textoSom() {
    const s = saida && saida.som;
    if (!saida) return 'Abra a saída para escolher o visual.';
    if (saida.aviso) return 'LED: ' + saida.aviso;
    if (!noAr()) return 'Toque na chave para ligar.';
    if (!s) return 'Som ainda não chegou.';
    return s.musica ? `Música na entrada${s.bpm ? ' · ' + Math.round(s.bpm) + ' BPM' : ''}` : (String(saida.visual).startsWith('e-') ? 'Sem música na entrada: estrelas paradas' : 'Sem música na entrada: segue uma batida interna');
  }

  // ---------- cartão no 5º andar ----------
  function montarCartao() {
    $('visuais-cartao').innerHTML = `<div class="cartao vis-cartao" id="vc-cartao">
      <div class="corpo"><div class="icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h18M3 5.5l3.5 13h11l3.5-13"/><path d="M9.5 10l5 2.75-5 2.75z"/></svg></div>
        <div style="min-width:0"><div class="nome">LED da pista</div><div class="sub" id="vc-sub">Carregando…</div></div>
        <button class="chave" id="vc-chave" aria-label="Pôr ou tirar do LED"></button></div>
      <div class="previa vis-previa"><img id="vc-img" alt="" hidden></div>
      <div class="brilho" id="vc-brilho"></div></div>`;
    $('vc-cartao').onclick = () => {
      C.vibrar();
      if (C.PC.matches) { history.replaceState(null, '', ROTA); window.dispatchEvent(new HashChangeEvent('hashchange')); } else location.hash = ROTA;
    };
    $('vc-chave').onclick = e => { e.stopPropagation(); alternar(); };
    sliderCartao = C.criarSlider({ valor: brilhoAtual, rotulo: 'Brilho', onChange: mudarBrilho });
    $('vc-brilho').appendChild(sliderCartao);
  }

  // ---------- flash ----------
  // Enquanto o dedo está no botão, o pedido se repete: se o aparelho cair, o servidor solta sozinho. Os pedidos vão em fila, para o soltar nunca passar na frente do ligar.
  function montarFlash(b) {
    let repete = null, fila = Promise.resolve();
    // Em todos os botões: segurar acende; arrastar para a direita faz piscar, cada vez mais rápido; voltar para a esquerda desacelera.
    // "Strobo em tudo" já começa piscando, na última frequência usada neste aparelho.
    const eStrobo = !!b.dataset.strobo;
    let hz = 0, xIni = 0, hzIni = 0, curso = 200;
    if (eStrobo) { hz = 5; try { hz = Number(localStorage.getItem('clube-strobo-hz')) || 5; } catch {} }
    const nome = b.textContent;
    // pan-y: o dedo na vertical ainda rola a tela, e na horizontal fica com o botão
    b.style.touchAction = 'pan-y';
    const mostraHz = () => {
      const h = Math.min(hz, limiteHz);
      if (!h) { b.textContent = nome; b.style.backgroundImage = ''; return; }
      const v = String(h).replace('.', ',');
      b.textContent = eStrobo ? `${nome} · ${v} por segundo` : `${nome} · ${v}/s`;
      const p = Math.round((h - 1) / 6.5 * 100);
      b.style.backgroundImage = `linear-gradient(90deg, rgba(255,255,255,.28) ${p}%, transparent ${p}%)`;
    };
    mostraHz();
    const q = () => {
      const h = Math.min(hz, limiteHz);
      return `alvos=${b.dataset.alvos}&strobo=${h ? 1 : 0}${h ? '&hz=' + h + '&cor=' + corStrobo : ''}`;
    };
    const manda = acao => { const pedido = q(); fila = fila.then(() => fetch(C.SERVIDOR + `api/show?acao=${acao}&${pedido}`, { method: 'POST' })).catch(() => {}); };
    b.addEventListener('pointermove', e => {
      if (!repete) return;
      const dx = e.clientX - xIni;
      let novoHz;
      if (eStrobo) novoHz = Math.max(1, hzIni + dx / curso * (limiteHz - 1));
      else novoHz = dx < 10 ? 0 : 1 + (dx - 10) / Math.max(curso - 10, 1) * (limiteHz - 1);
      novoHz = Math.min(limiteHz, Math.round(novoHz * 2) / 2);
      if (novoHz === hz) return;
      hz = novoHz;
      if (eStrobo) { try { localStorage.setItem('clube-strobo-hz', String(hz)); } catch {} }
      mostraHz();
      manda('liga');
    });
    const solta = () => {
      if (!repete) return;
      clearInterval(repete); repete = null;
      b.classList.remove('on');
      manda('solta');
      if (!eStrobo) { hz = 0; mostraHz(); }
    };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (repete) return;
      try { b.setPointerCapture(e.pointerId); } catch {}
      xIni = e.clientX; hzIni = Math.min(hz, limiteHz);
      // o curso vai até a beirada da tela: o máximo tem de caber também nos botões da direita
      curso = Math.max(70, Math.min(260, innerWidth - xIni - 14));
      C.vibrar();
      b.classList.add('on');
      manda('liga');
      repete = setInterval(() => manda('liga'), 400);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, solta));
    b.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', solta);
  }

  // ---------- luzes, estilos e personagens ----------
  // Tudo mora em /api/reacoes, como em reacoes.html. Por isso vale em todos os aparelhos: quem estiver aberto confere de 2 em 2 s.
  const PADRAO_LIGA = { personagens: 'ligado', contraluz: 'fixo', luz: 'fixo', booth: 'bumbo', faixa: 'bumbo', brilhinhos: 'agudo', meteoros: 'ligado' };
  let reacoesLed = null, buscaControles = null, mudandoAte = 0;
  const lembrado = chave => { try { return localStorage.getItem('reacao-liga-' + chave); } catch { return null; } };
  const lembrar = (chave, valor) => { try { localStorage.setItem('reacao-liga-' + chave, valor); } catch {} };
  function pintarControles() {
    const raiz = $('visuais');
    if (!raiz || !reacoesLed) return;
    raiz.querySelectorAll('.vis-controles .chave').forEach(b => b.classList.toggle('on', (reacoesLed[b.dataset.chave] || 'desligado') !== 'desligado'));
    raiz.querySelectorAll('.vis-chips').forEach(g => {
      g.querySelectorAll('button').forEach(b => b.classList.toggle('on', reacoesLed[g.dataset.chave] === b.dataset.valor));
    });
  }
  async function buscarControles() {
    const raiz = $('vt-luzes');
    if (!raiz || !raiz.offsetParent || document.hidden || Date.now() < mudandoAte) return;
    try {
      const j = await (await fetch(C.SERVIDOR + 'api/reacoes', { cache: 'no-store' })).json();
      if (Date.now() < mudandoAte) return;
      reacoesLed = j.led;
      pintarControles();
    } catch {}
  }
  async function mudarControle(chave, valor) {
    C.vibrar();
    const antes = reacoesLed ? reacoesLed[chave] : undefined;
    if (reacoesLed) reacoesLed[chave] = valor;
    pintarControles();
    mudandoAte = Date.now() + 1500;
    try {
      const r = await fetch(C.SERVIDOR + 'api/reacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo: 'led', chave, valor }) });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      // o servidor não aceitou: a tela volta a mostrar o que está valendo
      if (reacoesLed) reacoesLed[chave] = antes;
      mudandoAte = 0;
      pintarControles();
    }
  }
  function montarControles() {
    const raiz = $('visuais');
    raiz.querySelectorAll('.vis-controles .chave').forEach(b => {
      b.onclick = () => {
        const chave = b.dataset.chave;
        const atual = reacoesLed ? reacoesLed[chave] : 'desligado';
        if (atual !== 'desligado') { lembrar(chave, atual); mudarControle(chave, 'desligado'); }
        else mudarControle(chave, lembrado(chave) || PADRAO_LIGA[chave]);
      };
    });
    raiz.querySelectorAll('.vis-chips').forEach(g => {
      g.querySelectorAll('button').forEach(b => { b.onclick = () => mudarControle(g.dataset.chave, b.dataset.valor); });
    });
    buscarControles();
    if (!buscaControles) buscaControles = setInterval(buscarControles, 2000);
  }

  // ---------- tela ----------
  function montarTela() {
    montada = true;
    $('visuais').innerHTML = `<div class="bloco vis-topo">
        <div class="t"><b id="vt-estado"></b><small id="vt-som"></small></div>
        <button class="bt-andar" id="vt-abrir" hidden>Abrir a saída</button>
        <button class="chave" id="vt-chave" aria-label="Pôr ou tirar do LED"></button>
      </div>
      <div class="bloco vis-ajustes">
        <div id="vt-brilho"></div>
        <div id="vt-tom"></div>
        <div class="vis-tom-pe">
          <small id="vt-tom-nota"></small>
          <button class="bt-andar" id="vt-tom-neutro">Neutro</button>
        </div>
      </div>
      <div class="bloco vis-flash" id="vt-flash">
        <div class="t"><b>Flash</b><small>Toque pisca. Segure para ficar aceso. Segure e arraste para a direita: pisca cada vez mais rápido.</small></div>
        <div class="vis-flash-grade">
          <button data-alvos="atras">Atrás do logo</button>
          <button data-alvos="painel">Painel</button>
          <button data-alvos="balcao">Balcão</button>
          <button data-alvos="barras">Barras</button>
          <button class="strobo" data-alvos="atras,painel,balcao,barras" data-strobo="1">Strobo em tudo</button>
        </div>
        <div id="vt-strobo-cor" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px"><small style="width:100%">Cor do strobo</small>${CORES_STROBO.map(([c, n]) => `<button type="button" data-cor="${c}" aria-label="${n}" title="${n}" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:#${c};padding:0"></button>`).join('')}<input type="color" aria-label="Outra cor" style="width:44px;height:36px;padding:0;border:0;background:none"></div>
      </div>
<div class="bloco vis-controles" id="vt-personagens">
        <div class="vis-linha"><div class="t"><b>Personagens da marca</b><small>Na parede, com o logo atrás. Viram devagar e vão trocando</small></div><button type="button" class="chave" data-chave="personagens" aria-label="Ligar ou desligar: Personagens da marca"></button></div>
        <small class="vis-rotulo">Troca a cada</small>
        <div class="vis-chips" data-chave="personagemTempo"><button type="button" data-valor="6">6 s</button><button type="button" data-valor="12">12 s</button><button type="button" data-valor="24">24 s</button><button type="button" data-valor="48">48 s</button></div>
        <small class="vis-rotulo">O brilho reage a</small>
        <div class="vis-chips" data-chave="personagemSom"><button type="button" data-valor="grave">Grave</button><button type="button" data-valor="medio">Médio</button><button type="button" data-valor="agudo">Agudo</button><button type="button" data-valor="volume">Volume</button><button type="button" data-valor="desligado">Nada</button></div>
      </div>
      <div class="bloco vis-controles" id="vt-luzes">
        <div class="t"><b>Luzes e estilos</b><small>Nos visuais em 3D com o logo: Firmamento, Espaço de pé, Marca em inox e Escultura cinética</small></div>
        <div class="vis-linha"><div class="t"><b>Luz atrás do logo</b><small>A luz forte que vem de trás</small></div><button type="button" class="chave" data-chave="contraluz" aria-label="Ligar ou desligar: Luz atrás do logo"></button></div>
        <small class="vis-rotulo">Estilo da luz atrás</small>
        <div class="vis-chips" data-chave="estiloLuz"><button type="button" data-valor="halo">Halo</button><button type="button" data-valor="aurora">Aurora</button><button type="button" data-valor="neon">Neon</button></div>
        <div class="vis-linha"><div class="t"><b>Brilho nas letras</b><small>Um brilho discreto em volta do logo</small></div><button type="button" class="chave" data-chave="luz" aria-label="Ligar ou desligar: Brilho nas letras"></button></div>
        <div class="vis-linha"><div class="t"><b>Luz do booth</b><small>Spot que vem de baixo e reflete nas letras</small></div><button type="button" class="chave" data-chave="booth" aria-label="Ligar ou desligar: Luz do booth"></button></div>
        <div class="vis-linha"><div class="t"><b>Faixa de luz</b><small>Passa pelas letras</small></div><button type="button" class="chave" data-chave="faixa" aria-label="Ligar ou desligar: Faixa de luz"></button></div>
        <div class="vis-linha"><div class="t"><b>Brilhinhos</b><small>Estrelinhas na borda das letras</small></div><button type="button" class="chave" data-chave="brilhinhos" aria-label="Ligar ou desligar: Brilhinhos"></button></div>
        <div class="vis-linha"><div class="t"><b>Estrelas cadentes</b><small>Riscos finos no céu</small></div><button type="button" class="chave" data-chave="meteoros" aria-label="Ligar ou desligar: Estrelas cadentes"></button></div>
        <small class="vis-rotulo">Acabamento do logo</small>
        <div class="vis-chips" data-chave="logo"><button type="button" data-valor="prata">Prata</button><button type="button" data-valor="cromado">Cromado</button><button type="button" data-valor="canelado">Canelado</button><button type="button" data-valor="metal">Metal</button><button type="button" data-valor="branco">Branco</button><button type="button" data-valor="contorno">Contorno</button></div>
        <small class="vis-rotulo">O logo reage ao som</small>
        <div class="vis-chips" data-chave="logoReage"><button type="button" data-valor="nada">Nada</button><button type="button" data-valor="acende">Acende</button><button type="button" data-valor="pulsa">Pulsa</button><button type="button" data-valor="equalizador">Equalizador</button><button type="button" data-valor="onda">Onda</button></div>
      </div>
      <a class="bloco vis-topo" id="vt-monitor" href="${C.SERVIDOR}monitor-som.html" style="display:block;color:inherit;text-decoration:none">
        <div class="t" style="display:block"><b style="display:block">Monitor de som</b><small id="vt-mon-txt" style="display:block">Conectando…</small></div>
        <canvas id="vt-mon-cv" aria-hidden="true" style="display:block;width:100%;height:64px;margin-top:10px"></canvas>
      </a>
      <a class="bloco vis-topo" id="vt-reacoes" href="${C.SERVIDOR}reacoes.html" style="display:block;color:inherit;text-decoration:none">
        <div class="t" style="display:block"><b style="display:block">O que reage a quê</b><small style="display:block">Logo, som da mesa, limite do LED e banding. Estrelas, barras e tudo que reage ao som</small></div>
      </a>
      <div id="vis-lista"></div>`;
    montarControles();
    $('vt-flash').querySelectorAll('.vis-flash-grade button').forEach(montarFlash);
    $('vt-strobo-cor').querySelectorAll('button').forEach(b => { b.onclick = () => { C.vibrar(); escolherCorStrobo(b.dataset.cor); }; });
    $('vt-strobo-cor').querySelector('input').oninput = e => escolherCorStrobo(e.target.value.slice(1));
    pintarCores();
    $('vt-abrir').onclick = () => { C.vibrar(); abrirSaida(); };
    $('vt-chave').onclick = alternar;
    sliderBrilho = C.criarSlider({ valor: brilhoAtual, rotulo: 'Brilho', onChange: mudarBrilho });
    $('vt-brilho').appendChild(sliderBrilho);
    sliderTom = C.criarSlider({ valor: 50 + tomAtual / 2, rotulo: 'Tom do teto', texto: textoTom, onChange: v => mudarTom(tomDoSlider(v)) });
    $('vt-tom').appendChild(sliderTom);
    $('vt-tom-neutro').onclick = () => { C.vibrar(); mudarTom(0); sliderTom.definir(50); pintar(); };
  }
  function pintarLista() {
    const l = $('vis-lista');
    if (!l.children.length && visuais.length) {
      const grupos = [];
      visuais.forEach(v => { let g = grupos.find(x => x.nome === v.grupo); if (!g) grupos.push(g = { nome: v.grupo, itens: [] }); g.itens.push(v); });
      l.innerHTML = grupos.map(g => `<div class="secao">${esc(g.nome)}</div><div class="vis-grade">${g.itens.map(v => `<button class="vis-item" data-id="${esc(v.id)}">
        <span class="vis-img"><img src="${esc(fotoDe(v.id))}" alt="" loading="lazy"><em></em></span>
        <b>${esc(v.nome)}</b><small>${esc(v.desc)}</small></button>`).join('')}</div>`).join('');
      l.querySelectorAll('.vis-item').forEach(b => { b.onclick = () => escolher(b.dataset.id); });
    }
    l.querySelectorAll('.vis-item').forEach(b => {
      const id = b.dataset.id;
      const trocando = enviando === id || (saida && saida.carregando === id);
      const noLed = noAr() && saida.visual === id && !saida.carregando && !enviando;
      b.classList.toggle('on', !!noLed);
      b.classList.toggle('troca', !!trocando);
      b.classList.toggle('confirmar', confirmar === id);
      b.disabled = !saida && abrindo();
      b.querySelector('em').textContent = trocando ? 'Trocando…' : noLed ? 'No LED' : confirmar === id ? 'Toque de novo' : '';
    });
  }
  function pintar() {
    const ar = noAr() && enviando !== 'tirar';
    if ($('vc-sub')) {
      $('vc-sub').textContent = textoEstado();
      $('vc-chave').classList.toggle('on', ar);
      $('vc-chave').classList.toggle('confirmar', confirmar === 'ligar');
      $('vc-cartao').classList.toggle('desligado', !ar);
      $('vc-cartao').classList.toggle('sel', ativa() && C.PC.matches);
      const id = saida && (saida.carregando || saida.visual);
      const img = $('vc-img');
      if (id && img.dataset.id !== id && visuais.length) { img.dataset.id = id; img.src = fotoDe(id); }
      img.hidden = !id;
      if (sliderCartao) sliderCartao.definir(brilhoAtual);
    }
    if (!montada) return;
    $('vt-estado').textContent = textoEstado();
    $('vt-som').textContent = textoSom();
    $('vt-chave').classList.toggle('on', ar);
    $('vt-chave').classList.toggle('confirmar', confirmar === 'ligar');
    $('vt-chave').hidden = !saida;
    $('vt-abrir').hidden = !!saida;
    $('vt-abrir').disabled = abrindo();
    $('vt-abrir').textContent = abrindo() ? 'Abrindo…' : 'Abrir a saída';
    sliderBrilho.definir(brilhoAtual);
    sliderTom.definir(50 + tomAtual / 2);
    $('vt-tom-nota').textContent = 'O tom vale só no teto, olhando da pista para o DJ. Azulado: puxe para quente.';
    $('vt-tom-neutro').disabled = tomAtual === 0;
    pintarLista();
  }

  // ---------- monitor de som ----------
  // Só escuta com esta tela aberta e o app visível.
  function ligarMonitor() {
    if (fluxoSom || !$('vt-mon-cv') || document.hidden) return;
    fluxoSom = new EventSource(C.SERVIDOR + 'api/visuais/som');
    fluxoSom.onmessage = m => { try { somAgora = JSON.parse(m.data); somEm = Date.now(); } catch {} };
    const passo = () => { pintarMonitor(); quadroSom = requestAnimationFrame(passo); };
    quadroSom = requestAnimationFrame(passo);
  }
  function desligarMonitor() {
    if (fluxoSom) fluxoSom.close();
    fluxoSom = null;
    cancelAnimationFrame(quadroSom);
  }
  function pintarMonitor() {
    const cv = $('vt-mon-cv');
    if (!cv) return;
    const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), W = Math.round(r.width * k), H = Math.round(r.height * k);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d'), p = Date.now() - somEm < 2500 ? somAgora : null, n = 48, gap = Math.max(1, k), l = (W - gap * (n - 1)) / n;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#d9dadd';
    for (let b = 0; b < n; b++) {
      const v = !p ? 0 : p.d ? Math.max(0, Math.min(1, (p.d[b] + 100) / 100)) : (p.q[b] || 0) / 255;
      const a = Math.max(k, v * H);
      c.fillRect(b * (l + gap), H - a, l, a);
    }
    const t = $('vt-mon-txt');
    t.textContent = !p ? 'Sem dados da saída do LED'
      : p.w === undefined ? (p.v ? 'Música na entrada' : 'Sem música na entrada')
      : p.w ? 'Música na entrada' : p.r > -55 ? 'Só ruído: o que segue o som fica parado' : 'Silêncio: o que segue o som fica parado';
  }

  // ---------- navegação ----------
  // Chamada pelo rota() do celular.html. true = esta tela assumiu.
  function rota() {
    const em = ativa();
    document.body.classList.toggle('em-visuais', em);
    $('visuais').hidden = !em;
    if (!em) { desligarMonitor(); montada = false; sliderBrilho = sliderTom = null; $('visuais').innerHTML = ''; pintar(); return false; }
    $('inicio').hidden = !C.PC.matches;
    $('detalhe').hidden = true;
    $('bt-voltar').hidden = C.PC.matches;
    $('titulo').className = C.PC.matches ? 'marca' : 'titulo-det';
    $('titulo').textContent = C.PC.matches ? 'CLUBE' : 'LED da pista';
    if (!montada) montarTela();
    pintar();
    buscar();
    ligarMonitor();
    window.scrollTo(0, 0);
    return true;
  }
  // O celular.html avisa quando o 5º andar entra ou sai da tela. Fora dele, o app não fica perguntando pela saída.
  function mostrarNoAndar(sim) {
    $('visuais-cartao').hidden = !sim;
    const mudou = sim !== noQuinto;
    noQuinto = sim;
    if (mudou && sim) buscar(); else if (mudou) agendar();
  }
  // Outro aparelho mexeu no LED: brilho e tom vêm na mensagem; visual trocado, o app pergunta o que está no ar.
  function remoto(m) {
    if (m.tom != null || m.brilho != null) {
      if (Date.now() - ultimoAjuste < 1000) return; // eco do que este aparelho acabou de mandar
      if (m.tom != null) tomAtual = m.tom;
      if (m.brilho != null) brilhoAtual = m.brilho;
      pintar();
    } else if (ativa() || noQuinto) buscar();
  }
  function iniciar(funcoes) {
    C = funcoes;
    montarCartao();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (ativa() || noQuinto)) buscar();
      if (document.hidden) desligarMonitor(); else if (ativa()) ligarMonitor();
    });
  }
  return { iniciar, rota, ativa, mostrarNoAndar, remoto };
})();
