// Tela "Programação" do app (celular.html): cores e efeitos ao longo do dia, anúncios e aparelhos.
window.Programacao = (function () {
  'use strict';
  const A = window.Ambiente;
  let C = null;                 // funções do celular.html (enviar, toast, criarSlider...)
  let dados = null, comp = null, offset = 0;
  let abaP = 'horarios', aberta = null, simMin = null, simDesde = 0;
  let montada = false, conf = false, pendente = false;
  const $ = id => document.getElementById(id);
  const ROTA = '#/programacao';
  const relogio = () => Date.now() + offset;

  const CINZAS = [
    ['Névoa', ['#e3e4e5', '#cccccd', '#b7b9bc']], ['Aço', ['#b7b9bc', '#9d9d9e', '#858585']],
    ['Metal', ['#d2d3d3', '#9c9d9d', '#6f6f6f']], ['Grafite', ['#6f6f6f', '#2b2b2b', '#000000']],
  ];
  const CORES = [
    ['Azul', ['#07b9df', '#00a0e2', '#0070ae']], ['Azul noite', ['#07b9df', '#0070ae', '#003a5c']],
    ['Verde', ['#00c059', '#00b02a', '#00771a']], ['Verde noite', ['#00c059', '#00771a', '#003d2a']],
    ['Vermelho', ['#ff8564', '#ff4c2c', '#ff0000']], ['Âmbar', ['#ffd6a1', '#ffaf32', '#ff7a1a']],
    ['Brasa', ['#ff7a1a', '#b53a00', '#3a0e00']],
  ];
  const BRANCOS = [
    ['Quente', ['#ffd5a1', '#ffc98a', '#ffead0']], ['Morno', ['#ffead0', '#ffffff', '#ffead0']],
    ['Branco', ['#ffffff', '#ffead0', '#ffffff']], ['Frio', ['#ffffff', '#e8f0ff', '#ffffff']],
  ];
  const ABAS_P = { horarios: 'Horários', anuncios: 'Anúncios', aparelhos: 'Aparelhos' };

  const grad = cores => `linear-gradient(90deg, ${cores.join(', ')})`;
  const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const coresDaFaixa = (f, qual) => {
    const s = f[qual];
    return (s && s.igual ? f.telas.cores : s && s.cores) || f.telas.cores;
  };

  // ---------- estado vindo do servidor ----------
  function estado(m) {
    dados = m; offset = m.agora - Date.now();
    comp = A.compilar({ tz: m.tz, faixas: m.faixas });
    lut = {}; linhaFeita = false;
    pintarCartao();
    if (!ativa()) return;
    if (!montada) montarTela();
    atualizarTopo();
    // Editor aberto: só atualiza os títulos, para não atrapalhar quem está mexendo.
    if (aberta && abaP === 'horarios' && document.querySelector(`.prog-faixa[data-id="${aberta}"]`)) atualizarCabecalhos();
    else if (ocupado()) pendente = true;
    else renderCorpo();
  }
  // Não refaz a lista com alguém digitando nela.
  function ocupado() {
    const a = document.activeElement;
    return !!(a && $('prog-corpo') && $('prog-corpo').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && a.type !== 'color');
  }
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (pendente && ativa() && !ocupado()) { pendente = false; renderCorpo(); } }, 50);
  });

  // ---------- cartão no início ----------
  function montarCartao() {
    $('prog-cartao').innerHTML = `<div class="cartao prog-cartao" id="pc-cartao">
      <canvas class="prog-tira" id="pc-tira" width="96" height="1"></canvas>
      <div class="corpo"><div class="icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg></div>
        <div style="min-width:0"><div class="nome">Programação</div><div class="sub" id="pc-sub">Carregando…</div></div>
        <button class="chave" id="pc-chave" aria-label="Ligar a programação"></button></div></div>`;
    $('pc-cartao').onclick = () => { C.vibrar(); location.hash = ROTA; };
    $('pc-chave').onclick = e => { e.stopPropagation(); alternar($('pc-chave')); };
  }
  function pintarCartao() {
    if (!dados || !$('pc-sub')) return;
    const mo = A.momento(comp, relogio());
    $('pc-chave').classList.toggle('on', dados.ligada);
    $('pc-sub').textContent = dados.ligada
      ? `${mo.faixa.nome} · ${mo.proxima.nome} às ${A.textoHora(mo.proxima.ini)}`
      : 'Desligada · telas e fitas no que está no ar';
  }
  // Ligar pede dois toques: muda na hora tudo o que está no ar no clube.
  function alternar(chave) {
    C.vibrar();
    if (!dados) return;
    if (!dados.ligada && !conf) {
      conf = true; chave.classList.add('confirmar'); C.toast('Toque de novo para ligar: troca as telas e as fitas');
      setTimeout(() => { conf = false; chave.classList.remove('confirmar'); }, 3000);
      return;
    }
    conf = false; chave.classList.remove('confirmar');
    if (C.enviar({ type: 'prog', acao: 'ligar', valor: !dados.ligada })) C.toast(dados.ligada ? 'Programação desligada: voltou o que estava no ar' : 'Programação ligada');
  }

  // ---------- navegação ----------
  function ativa() { return location.hash === ROTA; }
  // Chamada pelo rota() do celular.html. true = esta tela assumiu.
  function rota() {
    const em = ativa();
    document.body.classList.toggle('em-prog', em);
    $('programacao').hidden = !em;
    if (!em) { montada = false; $('programacao').innerHTML = ''; return false; }
    $('inicio').hidden = !C.PC.matches;
    $('detalhe').hidden = true;
    $('bt-voltar').hidden = C.PC.matches;
    $('titulo').className = C.PC.matches ? 'marca' : 'titulo-det';
    $('titulo').textContent = C.PC.matches ? 'CLUBE' : 'Programação';
    if (dados && !montada) { montarTela(); atualizarTopo(); renderCorpo(); }
    window.scrollTo(0, 0);
    return true;
  }

  // ---------- topo: sala, hora e linha do dia ----------
  function montarTela() {
    montada = true;
    $('programacao').innerHTML = `
      <div class="prog-sala">
        <div class="led"><canvas id="ps-led" width="128" height="1"></canvas></div>
        <div class="tvs">${[0, 1, 2, 3, 4].map(i => `<div class="tv"><canvas id="ps-tv${i}" width="18" height="32"></canvas></div>`).join('')}</div>
        <div class="fita"><canvas id="ps-fita" width="128" height="6"></canvas></div>
        <div class="rotulos"><span>Painel LED, TVs e bancada</span><span id="ps-hora"></span></div>
      </div>
      <div class="prog-agora"><div class="t"><b id="pa-nome"></b><small id="pa-sub"></small></div><button class="chave" id="pa-chave" aria-label="Ligar a programação"></button></div>
      <div class="prog-linha" id="pl-linha"><canvas id="pl-canvas" width="288" height="52"></canvas><div class="prog-cursor" id="pl-cursor"></div>
        <div class="prog-horas"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div></div>
      <div class="prog-acoes" id="pl-acoes" hidden></div>
      <nav class="abas" id="prog-abas" style="margin-top:14px"></nav>
      <div id="prog-corpo"></div>`;
    $('pa-chave').onclick = () => alternar($('pa-chave'));
    const lin = $('pl-linha');
    const mover = x => {
      const r = $('pl-canvas').getBoundingClientRect();
      simMin = Math.max(0, Math.min(1439.9, (x - r.left) / r.width * 1440));
      simDesde = relogio(); lut = {};
      atualizarTopo();
    };
    let arr = false;
    lin.addEventListener('pointerdown', e => { arr = true; lin.setPointerCapture(e.pointerId); mover(e.clientX); });
    lin.addEventListener('pointermove', e => { if (arr) mover(e.clientX); });
    const soltar = () => { arr = false; };
    lin.addEventListener('pointerup', soltar); lin.addEventListener('pointercancel', soltar);
    linhaFeita = false;
  }
  function momentoVisivel() {
    const ms = relogio();
    return A.momento(comp, ms, simMin != null ? { minuto: simMin, desde: simDesde } : (dados.teste ? { minuto: dados.teste.minuto, desde: ms } : null));
  }
  function atualizarTopo() {
    if (!montada || !dados) return;
    const mo = momentoVisivel(), nome = mo.faixa.nome;
    const tit = simMin != null ? `${A.textoHora(simMin)} · ${nome}` : nome;
    $('pa-nome').innerHTML = esc(tit) + (dados.teste ? '<span class="prog-etiqueta">testando</span>' : '');
    $('pa-sub').textContent = simMin != null ? 'Simulando esta hora só aqui no app'
      : dados.ligada ? `Até ${A.textoHora(mo.proxima.ini)}, depois ${mo.proxima.nome}${mo.transicao ? ' · mudando de cor' : ''}`
      : 'Desligada. A prévia mostra como ficaria agora';
    $('pa-chave').classList.toggle('on', dados.ligada);
    desenharLinha(mo.minuto);
    const ac = $('pl-acoes');
    ac.hidden = simMin == null && !dados.teste;
    if (!ac.hidden) {
      ac.innerHTML = dados.teste
        ? '<span class="dica">As telas e fitas estão mostrando esta hora.</span><button class="pill" id="pl-parar">Parar teste</button>'
        : '<span class="dica">Arraste para ver outras horas.</span><button class="pill" id="pl-ver">Ver nas telas (2 min)</button><button class="pill" id="pl-agora">Agora</button>';
      if ($('pl-parar')) $('pl-parar').onclick = () => { C.vibrar(); C.enviar({ type: 'prog', acao: 'testar-parar' }); };
      if ($('pl-agora')) $('pl-agora').onclick = () => { C.vibrar(); simMin = null; lut = {}; atualizarTopo(); };
      if ($('pl-ver')) $('pl-ver').onclick = () => {
        C.vibrar();
        if (!dados.ligada) return C.toast('Ligue a programação para ver nas telas');
        if (C.enviar({ type: 'prog', acao: 'testar', minuto: simMin, seg: 120 })) { C.toast('Mostrando nas telas por 2 min'); simMin = null; }
      };
    }
    const abasEl = $('prog-abas');
    if (abasEl && !abasEl.children.length) {
      abasEl.innerHTML = Object.keys(ABAS_P).map(k => `<button data-a="${k}">${ABAS_P[k]}</button>`).join('');
      Array.from(abasEl.children).forEach(b => b.onclick = () => { abaP = b.dataset.a; aberta = null; C.vibrar(); renderCorpo(); });
    }
  }
  let linhaFeita = false;
  function desenharLinha(minuto) {
    const cv = $('pl-canvas');
    if (!cv) return;
    if (!linhaFeita) {
      linhaFeita = true;
      const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, ms = relogio();
      for (let x = 0; x < W; x++) {
        const mo = A.momento(comp, ms, { minuto: (x + 0.5) / W * 1440, desde: ms });
        const cs = A.coresDe(A.superficie(mo, 'telas')), cf = A.coresDe(A.superficie(mo, 'fitas'));
        const g = ctx.createLinearGradient(0, 0, 0, 36);
        g.addColorStop(0, cs[0]); g.addColorStop(0.5, cs[1]); g.addColorStop(1, cs[2]);
        ctx.fillStyle = g; ctx.fillRect(x, 0, 1, 36);
        ctx.fillStyle = cf[0]; ctx.fillRect(x, 38, 1, 14);
      }
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      comp.faixas.forEach(f => ctx.fillRect(f.ini / 1440 * W, 0, 1, H));
    }
    const c = $('pl-cursor');
    c.style.left = (minuto / 1440 * 100) + '%';
    c.classList.toggle('sim', simMin != null);
    $('ps-hora').textContent = A.textoHora(minuto);
  }

  // Desenho da salinha: a mesma conta das telas e das fitas de verdade.
  let lut = {};
  function pintarCanvas(cv, s, chave, ms, mapa) {
    if (!cv) return;
    const L = lut[chave] && ms - lut[chave].t < 2000 ? lut[chave].l : (lut[chave] = { l: A.criarLut(s), t: ms }).l;
    const pinta = A.pintor(s, L, ms / 1000), W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
      const m = mapa((x + 0.5) / W, (y + 0.5) / H);
      pinta(m[0], m[1], img.data, i); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  function quadro() {
    if (document.hidden || !dados || !comp) return;
    const ms = relogio();
    if (ativa() && montada) {
      const mo = momentoVisivel();
      const st = A.superficie(mo, 'telas'), sf = A.superficie(mo, 'fitas');
      pintarCanvas($('ps-led'), st, 'telas', ms, (fx) => [fx, 0.5]);
      for (let i = 0; i < 5; i++) pintarCanvas($('ps-tv' + i), st, 'telas', ms, (fx, fy) => [(i + fx) / 5, fy]);
      pintarCanvas($('ps-fita'), sf, 'fitas', ms, (fx, fy) => [fx, fy]);
      if (simMin == null) { const c = $('pl-cursor'); if (c) c.style.left = (mo.minuto / 1440 * 100) + '%'; $('ps-hora').textContent = A.textoHora(mo.minuto); }
    }
    const tira = $('pc-tira');
    if (tira && tira.offsetParent) {
      const st = A.superficie(A.momento(comp, ms), 'telas');
      pintarCanvas(tira, st, 'tira', ms, (fx) => [fx, 0.5]);
    }
  }
  setInterval(quadro, 90);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- corpo: abas ----------
  function renderCorpo() {
    const corpo = $('prog-corpo');
    if (!corpo || !dados) return;
    const abasEl = $('prog-abas');
    if (abasEl) Array.from(abasEl.children).forEach(b => b.classList.toggle('on', b.dataset.a === abaP));
    corpo.innerHTML = '';
    if (abaP === 'horarios') renderHorarios(corpo);
    if (abaP === 'anuncios') renderAnuncios(corpo);
    if (abaP === 'aparelhos') renderAparelhos(corpo);
  }

  // ---------- horários ----------
  function renderHorarios(corpo) {
    const agoraId = A.momento(comp, relogio()).faixa.id;
    dados.faixas.forEach(f => {
      const box = document.createElement('div');
      box.className = 'prog-faixa' + (f.id === agoraId ? ' agora' : '') + (f.id === aberta ? ' aberta' : '');
      box.dataset.id = f.id;
      box.innerHTML = `<button class="cab"><span class="hora">${esc(f.inicio)}</span>
        <span style="min-width:0"><div class="nm">${esc(f.nome)}</div><div class="prog-amostras"><i style="background:${grad(coresDaFaixa(f, 'telas'))}"></i><i style="background:${grad(coresDaFaixa(f, 'fitas'))}"></i></div></span>
        <svg class="prog-seta" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>`;
      box.querySelector('.cab').onclick = () => { aberta = aberta === f.id ? null : f.id; C.vibrar(); renderCorpo(); };
      corpo.appendChild(box);
      if (f.id === aberta) box.appendChild(editorFaixa(f, box));
    });
    const novo = document.createElement('button');
    novo.className = 'botao sec'; novo.textContent = 'Nova faixa';
    novo.onclick = () => {
      const mo = A.momento(comp, relogio());
      const id = 'faixa-' + Date.now().toString(36);
      const base = dados.faixas.find(f => f.id === mo.faixa.id) || dados.faixas[0];
      aberta = id;
      C.enviar({ type: 'prog', acao: 'faixa', faixa: { ...JSON.parse(JSON.stringify(base)), id, nome: 'Nova faixa', inicio: A.textoHora(Math.floor(mo.minuto)) } });
    };
    corpo.appendChild(novo);
    let confPadrao = false;
    const pad = document.createElement('button');
    pad.className = 'botao sec'; pad.textContent = 'Voltar aos horários originais';
    pad.onclick = () => {
      if (!confPadrao) { confPadrao = true; pad.textContent = 'Confirmar? Perde o que você mudou'; setTimeout(() => { confPadrao = false; pad.textContent = 'Voltar aos horários originais'; }, 3000); return; }
      aberta = null; C.vibrar(); C.enviar({ type: 'prog', acao: 'faixas-padrao' }); C.toast('Horários originais de volta');
    };
    corpo.appendChild(pad);
    const nota = document.createElement('p');
    nota.className = 'legenda';
    nota.textContent = 'Linha grossa: telas. Linha fina: balcões. De dia prata e branco, com mais luz perto do meio-dia; depois do pôr do sol entram as cores, ficando quentes e fracas de madrugada. O brilho do app continua valendo como teto.';
    corpo.appendChild(nota);
  }
  function atualizarCabecalhos() {
    document.querySelectorAll('.prog-faixa').forEach(box => {
      const f = dados.faixas.find(x => x.id === box.dataset.id);
      if (!f) return;
      box.querySelector('.hora').textContent = f.inicio;
      box.querySelector('.nm').textContent = f.nome;
      const am = box.querySelectorAll('.prog-amostras i');
      am[0].style.background = grad(coresDaFaixa(f, 'telas'));
      am[1].style.background = grad(coresDaFaixa(f, 'fitas'));
    });
  }

  // Editor de uma faixa: salva sozinho a cada mudança (com um pequeno atraso).
  function editorFaixa(f0, box) {
    const f = JSON.parse(JSON.stringify(f0));
    let t = null;
    const salvar = () => { clearTimeout(t); t = setTimeout(() => C.enviar({ type: 'prog', acao: 'faixa', faixa: f }), 220); };
    const ed = document.createElement('div');
    ed.className = 'prog-editor';
    ed.innerHTML = `<div class="prog-dupla">
        <label class="prog-campo"><span>Nome</span><input id="ed-nome" maxlength="30" value="${esc(f.nome)}"></label>
        <label class="prog-campo"><span>Começa às</span><input id="ed-ini" type="time" value="${esc(f.inicio)}"></label>
      </div><div id="ed-trans"></div><h4>Telas</h4><div id="ed-telas"></div><h4>Balcões</h4><div id="ed-fitas"></div>
      <div class="prog-linhas2"><button class="pill" id="ed-testar">Ver nas telas (2 min)</button><button class="pill" id="ed-apagar">Apagar faixa</button></div>`;
    ed.querySelector('#ed-nome').oninput = e => { f.nome = e.target.value; salvar(); };
    ed.querySelector('#ed-ini').onchange = e => { if (e.target.value) { f.inicio = e.target.value; salvar(); } };
    ed.querySelector('#ed-trans').appendChild(C.criarSlider({
      rotulo: 'Transição', valor: Math.round((f.transicao || 0) / 2.4), grande: false,
      texto: v => { const m = Math.round(v * 2.4); return m ? `${m} min` : 'na hora'; },
      onChange: v => { f.transicao = Math.round(v * 2.4); salvar(); },
    }));
    montarSuperficie(ed.querySelector('#ed-telas'), f, 'telas', salvar);
    montarSuperficie(ed.querySelector('#ed-fitas'), f, 'fitas', salvar);
    ed.querySelector('#ed-testar').onclick = () => {
      C.vibrar();
      if (!dados.ligada) return C.toast('Ligue a programação para ver nas telas');
      C.enviar({ type: 'prog', acao: 'testar', minuto: (A.minutos(f.inicio) + (f.transicao || 0) + 1) % 1440, seg: 120 });
      C.toast('Mostrando nas telas por 2 min');
    };
    let c2 = false;
    const ap = ed.querySelector('#ed-apagar');
    ap.onclick = () => {
      if (!c2) { c2 = true; ap.textContent = 'Confirmar?'; ap.classList.add('on'); setTimeout(() => { c2 = false; ap.textContent = 'Apagar faixa'; ap.classList.remove('on'); }, 3000); return; }
      aberta = null; C.enviar({ type: 'prog', acao: 'faixa-apagar', id: f.id });
    };
    return ed;
  }
  function montarSuperficie(alvo, f, qual, salvar) {
    const fitas = qual === 'fitas';
    let s = f[qual];
    const desenhar = () => {
      alvo.innerHTML = '';
      alvo.style.display = 'grid'; alvo.style.gap = '10px';
      if (fitas) {
        const lin = document.createElement('div');
        lin.className = 'linha-aj'; lin.style.padding = '2px 0 0'; lin.style.borderTop = '0';
        lin.innerHTML = `<div class="t"><b>Iguais às telas</b><small>Mesmas cores e efeito das telas</small></div><button class="chave ${s.igual ? 'on' : ''}" aria-label="Iguais às telas"></button>`;
        lin.querySelector('button').onclick = () => {
          C.vibrar();
          if (s.igual) { const b = f.telas; s = f.fitas = { cores: [...b.cores], efeito: b.efeito, vel: b.vel, brilho: s.brilho }; }
          else { s = f.fitas = { igual: true, brilho: s.brilho }; }
          salvar(); desenhar();
        };
        alvo.appendChild(lin);
      }
      if (!s.igual) {
        const preset = document.createElement('div');
        preset.className = 'prog-chips';
        (fitas ? [...BRANCOS, ...CORES] : [...CINZAS, ...CORES]).forEach(([nome, cores]) => {
          const b = document.createElement('button');
          b.className = 'prog-chip cor'; b.textContent = nome; b.style.background = grad(cores);
          b.onclick = () => { C.vibrar(); s.cores = [...cores]; salvar(); desenhar(); };
          preset.appendChild(b);
        });
        alvo.appendChild(preset);
        const cores = document.createElement('div');
        cores.className = 'prog-cores';
        s.cores.forEach((c, i) => {
          const l = document.createElement('label');
          l.className = 'prog-cor'; l.style.background = c;
          l.innerHTML = `<input type="color" value="${c}" aria-label="Cor ${i + 1}">`;
          l.querySelector('input').oninput = e => { s.cores[i] = e.target.value.toLowerCase(); l.style.background = e.target.value; g.style.background = grad(s.cores); salvar(); };
          cores.appendChild(l);
        });
        alvo.appendChild(cores);
        const g = document.createElement('div');
        g.className = 'prog-grad'; g.style.background = grad(s.cores);
        alvo.appendChild(g);
        const ef = document.createElement('div');
        ef.className = 'prog-chips';
        dados.efeitos.forEach(e => {
          const b = document.createElement('button');
          b.className = 'prog-chip' + (s.efeito === e.id ? ' on' : ''); b.textContent = e.nome;
          b.onclick = () => { C.vibrar(); s.efeito = e.id; salvar(); desenhar(); };
          ef.appendChild(b);
        });
        alvo.appendChild(ef);
        alvo.appendChild(C.criarSlider({
          rotulo: 'Movimento', valor: Math.round(Math.sqrt((s.vel || 0) / 60) * 100),
          texto: v => { const vel = Math.pow(v / 100, 2) * 60; return vel < 0.05 ? 'parado' : `1 volta em ${Math.max(1, Math.round(60 / vel))} min`; },
          onChange: v => { s.vel = Math.round(Math.pow(v / 100, 2) * 600) / 10; salvar(); },
        }));
      }
      alvo.appendChild(C.criarSlider({ rotulo: 'Brilho', valor: s.brilho == null ? 100 : s.brilho, onChange: v => { s.brilho = v; salvar(); } }));
    };
    desenhar();
  }

  // ---------- anúncios ----------
  function textoStatus(a) {
    if (!a.status) return '';
    if (a.status.tipo === 'espera') {
      const falta = (a.ultimo || 0) + (a.cadaMin || 10) * 60000 - relogio();
      return falta <= 0 ? 'Entra já' : `Entra em ${Math.ceil(falta / 60000)} min`;
    }
    return a.status.texto;
  }
  const ZONAS_AN = [['telas:telas:1', 'TVs'], ['telas:led:1', 'Painel LED']];
  function renderAnuncios(corpo) {
    dados.anuncios.forEach(a => corpo.appendChild(cartaoAnuncio(a)));
    if (!dados.anuncios.length) {
      const v = document.createElement('div');
      v.className = 'vazio'; v.textContent = 'Nenhum anúncio ainda.';
      corpo.appendChild(v);
    }
    const novo = document.createElement('div');
    novo.className = 'bloco';
    novo.innerHTML = `<h3>Novo anúncio</h3><div class="soltar"><strong id="na-nome-arq">Escolher imagem ou vídeo</strong>Post ou arte · png, jpg, mp4. Fica inteiro na TV, sem cortar.<input type="file" id="na-arquivo" accept="image/*,video/*"></div>
      <input class="campo" id="na-nome" placeholder="Nome do anúncio" maxlength="60"><div class="progresso" id="na-prog"><i></i></div><button class="botao" id="na-enviar" disabled>Enviar</button>`;
    corpo.appendChild(novo);
    const arq = novo.querySelector('#na-arquivo'), bt = novo.querySelector('#na-enviar');
    arq.onchange = () => {
      const f = arq.files[0];
      novo.querySelector('#na-nome-arq').textContent = f ? f.name : 'Escolher imagem ou vídeo';
      if (f && !novo.querySelector('#na-nome').value) novo.querySelector('#na-nome').value = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
      bt.disabled = !f;
    };
    bt.onclick = () => {
      const f = arq.files[0]; if (!f) return;
      bt.disabled = true;
      enviarArquivo(f, { nome: novo.querySelector('#na-nome').value.trim() || f.name }, novo.querySelector('#na-prog'), bt, 'Enviar');
    };
  }
  function enviarArquivo(f, campos, prog, bt, rotulo) {
    const q = new URLSearchParams({ arquivo: f.name, ...campos });
    const x = new XMLHttpRequest();
    x.open('POST', C.SERVIDOR + 'api/anuncio?' + q.toString());
    const barra = prog && prog.querySelector('i');
    if (prog) { prog.style.display = 'block'; barra.style.width = '0'; }
    x.upload.onprogress = e => { if (barra && e.lengthComputable) barra.style.width = Math.round(e.loaded / e.total * 90) + '%'; if (bt) bt.textContent = 'Enviando…'; };
    x.upload.onload = () => { if (bt) bt.textContent = 'Preparando para as TVs…'; };
    x.onload = () => {
      let r = {}; try { r = JSON.parse(x.responseText); } catch (e) {}
      if (prog) prog.style.display = 'none';
      if (bt) bt.textContent = rotulo;
      if (x.status === 200) C.toast('Pronto: as TVs já estão baixando');
      else { C.toast(r.error || 'Não deu certo o envio'); if (bt) bt.disabled = false; }
    };
    x.onerror = () => { C.toast('Falha de conexão no envio'); if (bt) { bt.disabled = false; bt.textContent = rotulo; } if (prog) prog.style.display = 'none'; };
    x.send(f);
  }
  const mudarAn = (id, campos) => C.enviar({ type: 'prog', acao: 'anuncio', id, campos });
  function cartaoAnuncio(a) {
    const box = document.createElement('div');
    box.className = 'prog-anuncio';
    const total = (a.itens || []).reduce((s, i) => s + (i.dur || 0), 0);
    const st = textoStatus(a);
    box.innerHTML = `<div class="topo"><div class="t"><b>${esc(a.nome)}</b><small class="${a.status && a.status.tipo === 'noar' ? 'noar' : ''}">${esc(st)} · ${Math.round(total)} s no ar</small></div>
        <button class="chave ${a.ativo ? 'on' : ''}" aria-label="Anúncio ligado"></button></div>
      <div class="prog-slides">${(a.itens || []).map(i => `<div class="prog-slide"><img src="${esc(i.thumb)}" alt=""><span>${i.kind === 'video' ? 'vídeo ' : ''}${Math.round(i.dur)} s</span><button data-n="${i.n}" aria-label="Tirar slide">×</button></div>`).join('')}
        <label class="prog-slide mais">+ slide<input type="file" accept="image/*,video/*"></label></div>
      <div><div class="prog-campo"><span>Entra a cada</span></div><div class="prog-chips" id="cada">${[5, 10, 15, 20, 30, 60].map(m => `<button class="prog-chip ${a.cadaMin === m ? 'on' : ''}" data-m="${m}">${m} min</button>`).join('')}<input type="number" min="1" max="720" value="${a.cadaMin}" aria-label="Minutos" style="width:72px;font:inherit;padding:7px 10px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></div></div>
      <div><div class="prog-campo"><span>Cada imagem fica</span></div><div class="prog-chips" id="dur">${[5, 8, 10, 15, 20].map(s => `<button class="prog-chip ${a.durImagem === s ? 'on' : ''}" data-s="${s}">${s} s</button>`).join('')}</div></div>
      <div class="prog-dupla datas"><label class="prog-campo"><span>Começa em</span><input type="datetime-local" data-c="de" value="${esc(a.de || '')}"></label>
        <label class="prog-campo"><span>Termina em</span><input type="datetime-local" data-c="ate" value="${esc(a.ate || '')}"></label></div>
      <div class="prog-dupla"><label class="prog-campo"><span>Só a partir de (hora)</span><input type="time" data-c="horaDe" value="${esc(a.horaDe || '')}"></label>
        <label class="prog-campo"><span>Até (hora)</span><input type="time" data-c="horaAte" value="${esc(a.horaAte || '')}"></label></div>
      <label class="prog-campo"><span>Texto passando no painel LED</span><input data-c="textoLed" maxlength="140" value="${esc(a.textoLed || '')}" placeholder="Vazio: o painel não muda"></label>
      <div><div class="prog-campo"><span>Onde passa</span></div><div class="prog-chips" id="onde">${ZONAS_AN.map(([z, n]) => `<button class="prog-chip ${(a.zonas || []).includes(z) ? 'on' : ''}" data-z="${z}">${n}</button>`).join('')}</div></div>
      <div class="prog-linhas2"><button class="pill" id="agora">${a.status && a.status.tipo === 'noar' ? 'Parar agora' : 'Passar agora'}</button><button class="pill" id="apagar">Excluir</button></div>`;
    box.querySelector('.chave').onclick = () => { C.vibrar(); mudarAn(a.id, { ativo: !a.ativo }); };
    box.querySelectorAll('.prog-slide button').forEach(b => {
      b.onclick = () => {
        if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = '?'; setTimeout(() => { delete b.dataset.ok; b.textContent = '×'; }, 3000); return; }
        fetch(C.SERVIDOR + 'api/anuncio/' + encodeURIComponent(a.id) + '/' + b.dataset.n, { method: 'DELETE' });
      };
    });
    box.querySelector('.prog-slide.mais input').onchange = e => { const f = e.target.files[0]; if (f) { C.toast('Enviando…'); enviarArquivo(f, { id: a.id }); } };
    box.querySelectorAll('#cada button').forEach(b => b.onclick = () => { C.vibrar(); mudarAn(a.id, { cadaMin: +b.dataset.m }); });
    box.querySelector('#cada input').onchange = e => { if (+e.target.value > 0) mudarAn(a.id, { cadaMin: +e.target.value }); };
    box.querySelectorAll('#dur button').forEach(b => b.onclick = () => { C.vibrar(); mudarAn(a.id, { durImagem: +b.dataset.s }); });
    box.querySelectorAll('input[data-c]').forEach(i => i.onchange = () => mudarAn(a.id, { [i.dataset.c]: i.value }));
    box.querySelectorAll('#onde button').forEach(b => b.onclick = () => {
      C.vibrar();
      const z = new Set(a.zonas || []);
      if (z.has(b.dataset.z)) z.delete(b.dataset.z); else z.add(b.dataset.z);
      mudarAn(a.id, { zonas: [...z] });
    });
    box.querySelector('#agora').onclick = () => {
      C.vibrar();
      if (a.status && a.status.tipo === 'noar') return C.enviar({ type: 'prog', acao: 'anuncio-parar' });
      if (!dados.ligada) return C.toast('Ligue a programação para passar anúncios');
      if (C.enviar({ type: 'prog', acao: 'anuncio-agora', id: a.id })) C.toast('Entrando nas telas');
    };
    let c2 = false;
    const ap = box.querySelector('#apagar');
    ap.onclick = () => {
      if (!c2) { c2 = true; ap.textContent = 'Confirmar?'; ap.classList.add('on'); setTimeout(() => { c2 = false; ap.textContent = 'Excluir'; ap.classList.remove('on'); }, 3000); return; }
      fetch(C.SERVIDOR + 'api/anuncio/' + encodeURIComponent(a.id), { method: 'DELETE' }).then(() => C.toast('Anúncio excluído'));
    };
    return box;
  }
  setInterval(() => { if (ativa() && abaP === 'anuncios' && montada && !ocupado()) renderCorpo(); }, 30000);

  // ---------- aparelhos ----------
  function renderAparelhos(corpo) {
    dados.zonas.forEach(z => {
      const box = document.createElement('div');
      box.className = 'prog-zona';
      const andar = z.andar === '5' ? '5º andar' : 'Térreo';
      const sub = !z.marcada ? `${andar} · fora da programação`
        : z.manualAte ? `<span class="manual">Manual até ${hora(z.manualAte)}</span>`
        : `${andar} · ${dados.ligada ? 'seguindo' : 'segue quando ligar'}`;
      box.innerHTML = `<div class="t"><b>${esc(z.nome)}</b><small class="${z.manualAte ? 'manual' : ''}">${z.manualAte ? 'Manual até ' + hora(z.manualAte) : esc(sub)}</small></div>
        ${z.manualAte ? '<button class="pill" data-v="1">Voltar</button>' : ''}<button class="chave ${z.marcada ? 'on' : ''}" data-c="1" aria-label="Entra na programação"></button>`;
      box.querySelector('[data-c]').onclick = () => { C.vibrar(); C.enviar({ type: 'prog', acao: 'zona', id: z.id, valor: !z.marcada }); };
      const v = box.querySelector('[data-v]');
      if (v) v.onclick = () => { C.vibrar(); C.enviar({ type: 'prog', acao: 'voltar', id: z.id }); };
      corpo.appendChild(box);
    });
    const b = document.createElement('div');
    b.className = 'bloco';
    b.innerHTML = `<label class="prog-campo"><span>Quem está em manual volta sozinho às</span><input type="time" id="ret" value="${esc(dados.retorno)}"></label>`;
    b.querySelector('#ret').onchange = e => { if (e.target.value) C.enviar({ type: 'prog', acao: 'retorno', valor: e.target.value }); };
    corpo.appendChild(b);
    const nota = document.createElement('p');
    nota.className = 'legenda';
    nota.textContent = 'Escolher uma cena, cor ou logo em um aparelho tira só ele da programação até esse horário. Assim, durante uma festa, nada troca sozinho. O painel da pista do 5º continua no MadMapper.';
    corpo.appendChild(nota);
  }

  // ---------- aviso dentro do detalhe de um aparelho ----------
  function bannerZona(z) {
    const b = $('det-prog');
    if (!b) return;
    if (!z.prog) { b.hidden = true; return; }
    b.hidden = false;
    const ret = dados ? dados.retorno : '06:00';
    if (z.prog.ativa) {
      b.innerHTML = `<div class="t"><b>Na programação · ${esc(z.prog.faixa)}</b><small>Escolher algo aqui assume este aparelho até ${esc(ret)}</small></div><a class="pill" href="${ROTA}">Ver</a>`;
    } else {
      b.innerHTML = `<div class="t"><b>Manual até ${hora(z.prog.manualAte)}</b><small>Depois volta sozinho para a programação</small></div><button class="pill" id="det-prog-voltar">Voltar agora</button>`;
      $('det-prog-voltar').onclick = () => { C.vibrar(); C.enviar({ type: 'prog', acao: 'voltar', id: z.id }); };
    }
  }

  function iniciar(api) { C = api; montarCartao(); }

  return { iniciar, estado, rota, ativa, bannerZona };
})();
