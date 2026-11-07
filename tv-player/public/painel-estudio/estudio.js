// Estúdio do painel do 1º andar: a tela. O desenho está em motor.js; os capítulos, em capitulos.js; a geração, em ../../painel-estudio.js.
(() => {
  'use strict';
  const M = PainelMotor, CAP = PainelCapitulos, { W, H } = M, F = CAP.fabricas, CENTRO = W / 2;
  const $ = id => document.getElementById(id);
  const limita = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vibrar = () => { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate && navigator.vibrate(8); } catch {} };
  const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const copia = o => JSON.parse(JSON.stringify(o));
  const hashDe = comp => { let h = 2166136261; const s = JSON.stringify(comp); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const px2m = px => (px * 8.32 / W).toFixed(px * 8.32 / W < 1 ? 2 : 1).replace('.', ',') + ' m';

  Object.assign(window.ICONES, {
    narrativa: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
    assets: 'M12 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 21v-3a7 7 0 0 1 14 0v3',
    movimento: 'M3 12h13M12 7l5 5-5 5M21 5v14',
    tocar: 'M7 4l13 8-13 8z', pausar: 'M8 5v14M16 5v14',
    parado: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    passar: 'M3 12h17M15 7l5 5-5 5M3 7h4M3 17h4',
    passo: 'M3 19h5v-6h5V7h8M18 4l3 3-3 3',
    vaievem: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    esquerda: 'M20 12H4M10 6l-6 6 6 6', direita: 'M4 12h16M14 6l6 6-6 6',
    montar: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM19 19h1v1h-1z',
    corte: 'M7 4v16M17 4v16M7 12h10',
    nada: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
    gerar: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    copia: 'M9 9h11v11H9zM5 15H4V4h11v1',
    salvar: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    texto: 'M5 6V4h14v2M12 4v16M9 20h6',
    aviso: 'M12 4l9 16H3zM12 10v5M12 18h.01',
    grade2: 'M4 5h16v14H4zM4 12h16M10 5v14',
    sinal: 'M5 5h14v9H5zM12 14v7M9 21h6',
    ceu: 'M8 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM17 10l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z',
    video: 'M4 6h12v12H4zM16 10l5-3v10l-5-3',
    logo: 'M18 7a8 8 0 1 0 0 10',
    frag: 'M5 5h4v4H5zM13 4h3v3h-3zM10 11h4v4h-4zM17 13h3v3h-3zM5 16h3v3H5z',
  });
  const icone = n => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${window.ICONES[n] || ''}"/></svg>`;
  const el = (tag, props, ...filhos) => { const e = document.createElement(tag); if (props) for (const k in props) { if (k === 'html') e.innerHTML = props[k]; else if (k === 'on') { for (const ev in props.on) e.addEventListener(ev, props.on[ev]); } else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); } for (const f of filhos) if (f != null) e.append(f); return e; };
  let toastT;
  function toast(txt) { const t = $('toast'); t.textContent = txt; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
  const api = (rota, corpo, metodo) => fetch('/api/painel-estudio' + rota, corpo || metodo ? { method: metodo || 'POST', body: corpo ? JSON.stringify(corpo) : undefined } : undefined).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Falhou'); return j; });

  // ---------- estado ----------
  const S = {
    comp: null, pecaId: null, nome: 'Peça', capitulo: null, sel: null,
    t: 0, tocando: true, arrastando: false,
    aba: 'narrativa', lado: 'narrativa', familia: 'personagem', look: 'Detalhe alto', destino: 'nova',
    lenteX: 1800, zoom: 1, vista: 'lente',
    pecas: [], visuais: [], ledAgora: null, noPainel: null, seguir: false, job: null, jobId: null,
    caixas: [],
  };
  let catalogo = [];
  const motor = M.criar({
    base: 'painel-estudio/',
    urlProxy: id => { toastProxy(); return fetch('/api/painel-estudio/proxy?id=' + encodeURIComponent(id)).then(r => r.json()).then(j => { if (!j.url) throw new Error(j.error || 'sem vídeo'); return j.url; }); },
  });
  let avisouProxy = false;
  function toastProxy() { if (!avisouProxy) { avisouProxy = true; toast('Preparando o vídeo da marca, alguns segundos'); setTimeout(() => { avisouProxy = false; }, 8000); } }

  // ---------- catálogo de efeitos ----------
  const EF = {
    estrelas: { nome: 'Estrelas', ctl: [['densidade', 'Quantidade', 5, 200, 5], ['cadentes', 'Cadentes no loop', 0, 14, 1], ['semente', 'Outro céu', 1, 30, 1]], padrao: { densidade: 60, cadentes: 2, semente: 1 } },
    via: { nome: 'Via Láctea', ctl: [['brilho', 'Brilho', 0.1, 1, 0.05, 'pct'], ['voltas', 'Anda no loop', 0, 4, 1], ['semente', 'Outra galáxia', 1, 20, 1]], padrao: { brilho: 0.8, voltas: 0, semente: 2 } },
    rastros: { nome: 'Rastros', ctl: [['qtd', 'Riscos', 10, 160, 2], ['voltas', 'Velocidade', 1, 6, 1], ['dir', 'Direção', -1, 1, 2, 'dir'], ['semente', 'Outros riscos', 1, 30, 1]], padrao: { qtd: 60, voltas: 1, dir: -1, semente: 4 } },
    aurora: { nome: 'Aurora', ctl: [['brilho', 'Brilho', 0.2, 1, 0.05, 'pct']], padrao: { brilho: 0.85 } },
    eclipse: { nome: 'Eclipse', ctl: [['x', 'Lugar', 0, W, 10, 'm'], ['raio', 'Tamanho', 10, 43, 1], ['alcance', 'Alcance da coroa', 200, 2400, 50, 'm'], ['ciclos', 'Pulsos no loop', 1, 14, 1]], padrao: { x: CENTRO, raio: 41, alcance: 1500, ciclos: 3 } },
    porticos: { nome: 'Pórticos', ctl: [['x', 'Ponto de fuga', 0, W, 10, 'm'], ['qtd', 'Pórticos', 6, 40, 1], ['voltas', 'Velocidade', 1, 10, 1], ['brilho', 'Brilho', 0.2, 1, 0.05, 'pct']], padrao: { x: CENTRO, qtd: 16, voltas: 3, brilho: 0.95 } },
    brise: { nome: 'Brise', ctl: [['passo', 'Largura da lâmina', 12, 80, 1], ['ciclos', 'Ondas no loop', 1, 10, 1], ['onda', 'Comprimento da onda', 400, 4472, 50, 'm'], ['brilho', 'Fio de inox', 0, 1, 0.05, 'pct']], padrao: { passo: 34, ciclos: 3, onda: 1490, brilho: 0.8 } },
    harpa: { nome: 'Harpa de cabos', ctl: [['qtd', 'Cabos', 3, 16, 1], ['amp', 'Vibração', 2, 30, 1], ['voltas', 'Ondas no loop', 1, 8, 1]], padrao: { qtd: 9, amp: 14, voltas: 2 } },
    agulhas: { nome: 'Agulhas', ctl: [['passo', 'Espaço', 5, 24, 1], ['ondas', 'Ondas', 1, 8, 1], ['voltas', 'Velocidade', 1, 6, 1]], padrao: { passo: 9, ondas: 4, voltas: 1 } },
    tubos: { nome: 'Tubos de luz', ctl: [['qtd', 'Tubos', 6, 60, 1], ['semente', 'Outra ordem', 1, 30, 1]], padrao: { qtd: 24, semente: 8 } },
    concreto: { nome: 'Concreto', ctl: [['abertura', 'Abertura das juntas', 0, 120, 2], ['ciclos', 'Abre no loop', 1, 8, 1], ['brilho', 'Brilho', 0.3, 1, 0.02, 'pct'], ['semente', 'Outras placas', 1, 20, 1]], padrao: { abertura: 58, ciclos: 2, brilho: 0.92, semente: 3 }, opaco: true },
    inox: { nome: 'Inox escovado', ctl: [['brilho', 'Brilho', 0.1, 1, 0.02, 'pct'], ['voltas', 'Reflexo no loop', 0, 8, 1], ['esticar', 'Largura do reflexo', 300, 3000, 50, 'm']], padrao: { brilho: 0.55, voltas: 2, esticar: 1100 }, opaco: true },
    canelado: { nome: 'Chapa canelada', ctl: [['brilho', 'Brilho', 0.1, 1, 0.02, 'pct'], ['passo', 'Canelura', 6, 40, 1], ['voltas', 'Reflexo no loop', 0, 8, 1], ['esticar', 'Largura do reflexo', 300, 3000, 50, 'm']], padrao: { brilho: 0.5, passo: 14, voltas: 2, esticar: 900 }, opaco: true },
    grade: { nome: 'Grade fina', ctl: [['passo', 'Espaço', 30, 400, 2], ['ciclos', 'Ondas no loop', 1, 8, 1]], padrao: { passo: 172, ciclos: 3 } },
    gradiente: { nome: 'Gradiente', cor: 'grad', ctl: [['voltas', 'Anda no loop', 0, 8, 1], ['esticar', 'Largura', 300, 4472, 50, 'm']], padrao: { cor: 'metal', voltas: 1, esticar: 2236 }, opaco: true },
    cor: { nome: 'Cor chapada', cor: 'solida', ctl: [], padrao: { cor: 'night' }, opaco: true },
    feixes: { nome: 'Feixes', ctl: [['qtd', 'Luzes', 4, 40, 1], ['ciclos', 'Varridas no loop', 1, 8, 1], ['abertura', 'Abertura', 0.3, 1.45, 0.01], ['brilho', 'Brilho', 0.2, 1, 0.05, 'pct']], padrao: { qtd: 15, ciclos: 2, abertura: 1.38, brilho: 0.85 } },
    aneis: { nome: 'Anéis', ctl: [['x', 'Centro', 0, W, 10, 'm'], ['qtd', 'Anéis', 3, 14, 1], ['ciclos', 'Balanço no loop', 1, 8, 1], ['voltas', 'Dentes correndo', 0, 24, 1]], padrao: { x: CENTRO, qtd: 12, ciclos: 3, voltas: 8 } },
    mercurio: { nome: 'Mercúrio', ctl: [['qtd', 'Pontos de onda', 2, 14, 1], ['ciclos', 'Ondas no loop', 1, 30, 1], ['onda', 'Largura da onda', 80, 800, 10, 'm'], ['brilho', 'Brilho', 0.2, 1, 0.05, 'pct'], ['semente', 'Outro desenho', 1, 30, 1]], padrao: { qtd: 7, ciclos: 9, onda: 260, brilho: 1, semente: 5 }, opaco: true },
    micelio: { nome: 'Micélio', ctl: [['ciclos', 'Crescimentos no loop', 1, 6, 1], ['x', 'Para onde cresce', 0, W, 10, 'm'], ['semente', 'Outro organismo', 1, 30, 1]], padrao: { ciclos: 2, x: CENTRO, semente: 3 } },
    reflexo: { nome: 'Risco de luz', ctl: [['voltas', 'Passagens no loop', 1, 8, 1], ['largura', 'Largura', 200, 2400, 50, 'm'], ['brilho', 'Força', 0.05, 0.8, 0.01, 'pct']], padrao: { voltas: 2, largura: 700, brilho: 0.3 }, sobre: true },
    clareira: { nome: 'Respiro do logo', ctl: [['x', 'Lugar', 0, W, 10, 'm'], ['largura', 'Largura', 60, 1400, 10, 'm'], ['borda', 'Borda macia', 0, 400, 5, 'm']], padrao: { x: CENTRO, largura: 420, borda: 180 }, sobre: true },
    preto: { nome: 'Preto', ctl: [], padrao: {}, opaco: true },
  };
  const FAMILIAS = [
    ['personagem', 'assets', 'Personagens'], ['fragmento', 'frag', 'Fragmentos'], ['instancia', 'video', 'Instância'], ['logo', 'logo', 'Logo'],
    ['texto', 'texto', 'Tipografia'], ['blocos', 'grade2', 'Blocos'], ['ceu', 'ceu', 'Céu e matéria'], ['sinal', 'sinal', 'Sinalização'],
  ];
  const FRASES = [['fricção', 'mythshire'], ['colisão', 'mythshire'], ['calor', 'mythshire'], ['o que permanece', 'mythshire'], ['o calor do encontro', 'mythshire'], ['Onde o atrito não destrói, ativa.', 'archivo'], ['Cada encontro ativa um novo estado.', 'archivo'], ['Personagens do calor coletivo', 'archivo'], ['Metal, concreto, corpo, som', 'archivo'], ['Rooftop | Lounge | Bar', 'archivo']];
  const TRATOS = {
    neutros: [['original', 'Original'], ['metal', 'Metal'], ['white', 'Branco'], ['black', 'Preto'], ['softGrey', 'Soft Grey'], ['midGrey', 'Mid Grey'], ['deepGrey', 'Deep Grey']],
    grad: [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue']],
    fortes: [['heat', 'Heat'], ['pulse', 'Pulse'], ['impact', 'Impact'], ['field', 'Field'], ['flow', 'Flow'], ['signal', 'Signal'], ['night', 'Night'], ['frequency', 'Frequency'], ['glow', 'Glow']],
  };
  const css = (n) => {
    if (n === 'original') return 'repeating-linear-gradient(90deg,#3a3b3d 0 2px,#c9cacc 2px 4px)';
    if (n === 'relevo') return 'linear-gradient(135deg,#d2d3d3,#6f6f6f 48%,#333 52%,#858585)';
    if (M.GRAD[n]) return 'linear-gradient(90deg,' + M.GRAD[n].map(([p, c]) => c + ' ' + (p * 100) + '%').join(',') + ')';
    return M.COR[n] || '#000';
  };

  // ---------- peça ----------
  const historia = { lista: [], i: -1 };
  function camadaSel() { return S.comp && S.comp.camadas.find(c => c.id === S.sel) || null; }
  const pecaSalva = () => S.pecas.find(p => p.id === S.pecaId) || null;
  function novaPeca() {
    const comp = { duracao: 30, led: [], camadas: [F.E('estrelas', { densidade: 40, semente: 1 }), F.A(['logo-clube'], { nome: 'Logo', tamanho: 64, x: CENTRO, trat: 'metal', reflexo: 2 })] };
    abrir({ id: null, nome: 'Peça nova', comp, capitulo: null });
  }
  function abrir(p) {
    guardarAtual();
    S.pecaId = p.id; S.nome = p.nome; S.capitulo = p.capitulo || null; S.comp = copia(p.comp); S.t = 0;
    S.sel = (S.comp.camadas.slice().reverse().find(c => c.tipo !== 'efeito') || {}).id || null;
    historia.lista = [JSON.stringify(S.comp)]; historia.i = 0;
    motor.preparar(S.comp, { soMini: false }).catch(() => {});
    focar();
    atualizarTudo();
    salvarRascunho();
  }
  function abrirCapitulo(id) {
    const salvo = S.pecas.find(p => p.id === 'cap-' + id);
    if (salvo) return abrir({ id: salvo.id, nome: salvo.nome, comp: salvo.comp, capitulo: id });
    const comp = CAP.comp(id);
    if (comp) abrir({ id: 'cap-' + id, nome: comp.nome, comp: { duracao: comp.duracao, led: comp.led, camadas: comp.camadas }, capitulo: id });
  }
  function focar() { S.focar = true; S.focarAte = performance.now() + 1500; }
  function salvarRascunho() { guardar('painel-estudio-rascunho', JSON.stringify({ id: S.pecaId, nome: S.nome, capitulo: S.capitulo, comp: S.comp })); }
  function guardarAtual() { // antes de trocar de peça, o que foi mexido vai para o servidor
    if (!S.comp || historia.i <= 0) return;
    api('/pecas', { id: S.pecaId, nome: S.nome, capitulo: S.capitulo, comp: S.comp }).then(lerEstado).catch(() => {});
  }
  let tMudou = null;
  function mudou(semHistoria) { // chamado ao soltar um controle
    salvarRascunho();
    if (!semHistoria) {
      const txt = JSON.stringify(S.comp);
      if (historia.lista[historia.i] !== txt) {
        historia.lista.length = historia.i + 1; historia.lista.push(txt);
        if (historia.lista.length > 80) historia.lista.shift();
        historia.i = historia.lista.length - 1;
      }
    }
    motor.preparar(S.comp, { soMini: false }).catch(() => {});
    atualizarTopo(); atualizarCTA();
    clearTimeout(tMudou); tMudou = setTimeout(() => { desenharCamadas(); }, 40);
  }
  function refazerUI() { renderizar(); atualizarTopo(); atualizarCTA(); }
  function atualizarTudo() { renderizar(true); atualizarTopo(); atualizarCTA(); desenharMarcas(); }
  function passoHistoria(d) {
    const i = historia.i + d;
    if (i < 0 || i >= historia.lista.length) return;
    historia.i = i; S.comp = JSON.parse(historia.lista[i]);
    if (!camadaSel()) S.sel = null;
    salvarRascunho(); refazerUI(); vibrar();
  }
  function atualizarTopo() {
    $('t-nome').textContent = S.nome;
    const n = S.comp.camadas.length;
    $('t-sub').textContent = S.comp.duracao + ' s em loop · ' + n + (n === 1 ? ' camada' : ' camadas') + (S.capitulo ? ' · capítulo do LED' : '');
    $('desfazer').disabled = historia.i <= 0; $('refazer').disabled = historia.i >= historia.lista.length - 1;
  }

  // ---------- criar camadas ----------
  function colocar(c, opcoes) {
    const cs = S.comp.camadas;
    const o = opcoes || {};
    if (o.base) {
      if (o.opaco) cs.unshift(c);
      else { let i = 0; while (i < cs.length && cs[i].tipo === 'efeito' && !EF[cs[i].efeito].sobre) i++; cs.splice(i, 0, c); }
    } else cs.push(c);
    S.sel = c.id;
    focar();
    mudou(); renderizar();
    vibrar();
  }
  function novaArte(id) {
    const a = M.ARTES[id];
    const c = F.A([id], {});
    if (a.fam === 'personagem') Object.assign(c, { nome: a.nome, tamanho: 96, y: 1, caminho: 'passar', vel: 60, espaco: 700, reflexo: 2 });
    else if (a.fam === 'fragmento') Object.assign(c, { nome: 'Fragmento', tamanho: 280, y: 0.5, caminho: 'passar', vel: 30, espaco: 1400, opacidade: 0.55 });
    else if (a.fam === 'logo') Object.assign(c, { nome: a.nome, tamanho: id === 'logomark' ? 78 : 64, x: CENTRO, trat: 'metal', reflexo: 2, giro: id === 'logomark' ? 2 : 0 });
    else Object.assign(c, { nome: a.nome, tamanho: 76, x: CENTRO });
    colocar(c);
    toast(a.nome + ' na faixa');
  }
  function tocarArte(id) {
    const c = camadaSel(), a = M.ARTES[id];
    if (S.destino === 'nesta' && c && c.tipo === 'arte' && M.ARTES[c.artes[0]] && M.ARTES[c.artes[0]].fam === a.fam) {
      const i = c.artes.indexOf(id);
      if (i >= 0) { if (c.artes.length > 1) c.artes.splice(i, 1); else return toast('A camada precisa de pelo menos uma arte'); } else c.artes.push(id);
      if (c.artes.length > 1 && c.caminho === 'parado' && !(c.troca && c.troca !== 'nenhuma')) { c.copias = Math.max(c.copias || 1, c.artes.length); }
      mudou(); renderizar(); vibrar();
    } else novaArte(id);
  }
  function novoVideo(v) {
    const fig = v.grupo === 'instancia';
    const c = F.V([v.id], { nome: fig ? (M.NOME_FIG[v.figura] + ', ' + v.look.toLowerCase()) : v.look, tamanho: fig ? 132 : 170, x: CENTRO, caminho: 'parado', espaco: 900 });
    colocar(c); motor.preparar(S.comp).catch(() => {});
    toast('Vídeo na faixa, carregando');
  }
  function novoTexto(texto, fonte) {
    const c = F.TX(texto || 'clube', { nome: 'Texto', fonte: fonte || 'archivo', peso: 300, tamanho: fonte === 'mythshire' ? 62 : 42, x: CENTRO, trat: fonte === 'mythshire' ? 'metal' : 'white', caminho: 'parado', espaco: 1400 });
    colocar(c);
  }
  function novoEfeito(nome) {
    const d = EF[nome], c = F.E(nome, Object.assign({ nome: d.nome }, d.padrao));
    colocar(c, { base: !d.sobre, opaco: d.opaco });
    toast(d.nome + ' na faixa');
  }
  function novosBlocos(modo) {
    const c = F.B({ nome: modo === 'varredura' ? 'Varredura' : modo === 'continua' ? 'Alternância contínua' : 'Alternância dividida', modo, colunas: 26, pinturas: modo === 'varredura' ? ['metal', 'black', 'deepGrey', 'black'] : ['black', 'metal', 'deepGrey'], quadros: modo === 'varredura' ? 10 : 30, canelado: modo === 'varredura', reflexo: 2, vao: 2, semente: 1 + Math.floor(Math.random() * 20) });
    colocar(c, { base: true, opaco: true });
  }

  // ---------- controles reutilizáveis ----------
  function regua(o) {
    const min = o.min, max = o.max, passo = o.passo || 1;
    const curva = o.curva || 1;
    const paraPos = v => Math.pow(limita((v - min) / (max - min)), 1 / curva);
    const dePos = p => { const v = min + Math.pow(limita(p), curva) * (max - min); return Math.round(v / passo) * passo; };
    const r = el('div', { className: 'regua', html: '<div class="cheio"></div><span class="nom"></span><span class="val"></span>' });
    r.setAttribute('role', 'slider'); r.tabIndex = 0; r.setAttribute('aria-label', o.nome);
    r.querySelector('.nom').textContent = o.nome;
    let valor = o.valor;
    const pintar = () => { r.querySelector('.cheio').style.width = paraPos(valor) * 100 + '%'; r.querySelector('.val').textContent = o.fmt ? o.fmt(valor) : (Math.round(valor * 100) / 100).toString().replace('.', ','); r.setAttribute('aria-valuenow', valor); };
    pintar();
    const defineX = ev => { const q = r.getBoundingClientRect(); const v = dePos((ev.clientX - q.left) / q.width); if (v !== valor) { valor = v; pintar(); o.aoMudar(v); } };
    let ini = null, vai = false;
    r.addEventListener('pointerdown', ev => { ini = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; vai = false; });
    r.addEventListener('pointermove', ev => {
      if (!ini) return;
      if (!vai) {
        const dx = Math.abs(ev.clientX - ini.x), dy = Math.abs(ev.clientY - ini.y);
        if (dy > 10 && dy > dx) { ini = null; return; }
        if (dx < 6) return;
        vai = true; try { r.setPointerCapture(ev.pointerId); } catch {}
      }
      defineX(ev);
    });
    const fim = ev => { if (!ini) return; if (ev.type === 'pointerup') { defineX(ev); vibrar(); } ini = null; vai = false; if (o.aoSoltar) o.aoSoltar(valor); };
    r.addEventListener('pointerup', fim); r.addEventListener('pointercancel', () => { ini = null; vai = false; });
    r.addEventListener('keydown', ev => {
      const d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -1 : 0;
      if (!d) return; ev.preventDefault();
      valor = limita(valor + d * passo, min, max); pintar(); o.aoMudar(valor); if (o.aoSoltar) o.aoSoltar(valor);
    });
    r.definir = v => { valor = v; pintar(); };
    return r;
  }
  function rCam(c, k, nome, min, max, passo, opc) { // régua ligada a um campo da camada
    return regua(Object.assign({ nome, min, max, passo, valor: c[k] == null ? (opc && opc.padrao != null ? opc.padrao : min) : c[k], aoMudar: v => { c[k] = v; if (opc && opc.depois) opc.depois(v); }, aoSoltar: () => mudou() }, opc || {}));
  }
  function ladrilhos(lista, atual, aoEscolher) {
    const b = el('div', { className: 'ladrilhos' });
    for (const [v, ic, nome] of lista) {
      const x = el('button', { className: 'lad', html: icone(ic) + esc(nome) });
      x.setAttribute('aria-pressed', v === atual ? 'true' : 'false');
      x.onclick = () => { aoEscolher(v); mudou(); renderizar(); vibrar(); };
      b.append(x);
    }
    return b;
  }
  const titulo = (txt, ic, fim) => el('div', { className: 'tit', html: (ic ? icone(ic) : '') + '<span>' + esc(txt) + '</span>' + (fim ? '<span class="fim">' + esc(fim) + '</span>' : '') });
  const nota = html => el('p', { className: 'nota', html });

  // ---------- painel: narrativa ----------
  const minis = new Map();
  const obs = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { obs.unobserve(e.target); e.target.__desenhar && e.target.__desenhar(); } }, { root: null, rootMargin: '200px' }) : null;
  function fotoLed(id) { const v = S.visuais.find(x => x.id === id); if (v && v.foto) return v.foto; return 'visuais/' + id + '.jpg'; }
  function miniFaixa(chave, fazerComp, linhas = 2) {
    if (minis.has(chave)) return minis.get(chave);
    const c = el('canvas', { className: 'fx' });
    const LW = 640, es = (LW * 1) / (W / linhas), rh = H * es, g = c.getContext('2d');
    c.width = LW; c.height = Math.ceil((rh + 2) * linhas - 2);
    c.__desenhar = async () => {
      const comp = fazerComp();
      if (!comp) return;
      try { await motor.preparar(comp, { soMini: true }); } catch {}
      const f = 0.32 * comp.duracao;
      for (let l = 0; l < linhas; l++) {
        const x0 = (l * W) / linhas, vw = W / linhas;
        g.setTransform(es, 0, 0, es, -x0 * es, l * (rh + 2));
        g.save(); g.beginPath(); g.rect(x0, 0, vw, H); g.clip();
        motor.desenhar(g, comp, f, { x0, vw, es, soMini: true });
        g.restore();
      }
    };
    if (obs) obs.observe(c); else c.__desenhar();
    minis.set(chave, c);
    return c;
  }
  function cartaoCap(cap) {
    const pid = 'cap-' + cap.id, salvo = S.pecas.find(p => p.id === pid);
    const led = S.ledAgora && (cap.led || []).includes(S.ledAgora);
    const noAr = salvo && salvo.gerado && salvo.gerado.cena === S.noPainel;
    const b = el('button', { className: 'cap' + (S.pecaId === pid ? ' on' : '') });
    b.dataset.cap = cap.id;
    const ls = el('div', { className: 'leds' });
    for (const id of (cap.led || []).slice(0, 2)) { const i = el('img', { alt: '', loading: 'lazy', src: fotoLed(id) }); i.onerror = () => i.remove(); ls.append(i); }
    const dir = el('div', { style: 'min-width:0' });
    dir.append(miniFaixa(cap.id + ':' + (salvo ? salvo.hash : ''), () => (salvo ? salvo.comp : CAP.comp(cap.id))));
    dir.append(el('h4', { html: esc(cap.nome) + (noAr ? '<span class="bol vivo">NO PAINEL</span>' : salvo && salvo.gerado ? '<span class="bol">VÍDEO PRONTO</span>' : '') + (led ? '<span class="bol agora">LED AGORA</span>' : '') }));
    dir.append(el('p', { textContent: cap.frase }));
    b.append(ls, dir);
    b.onclick = () => { abrirCapitulo(cap.id); vibrar(); };
    return b;
  }
  function renderNarrativa() {
    const p = $('p-narrativa'), rolagem = p.scrollTop; p.innerHTML = '';
    requestAnimationFrame(() => { p.scrollTop = rolagem; });
    if (PC()) p.append(ladoAbas());
    const prontos = CAP.LISTA.filter(c => { const s = S.pecas.find(x => x.id === 'cap-' + c.id); return s && s.gerado; }).length;
    const ch = el('button', { className: 'chave-card', html: `<div><b>Painel segue o LED</b><small>Quando o LED da pista trocar de visual, o painel troca para o capítulo dele. ${prontos} de ${CAP.LISTA.length} capítulos prontos em vídeo.</small></div><span class="interruptor${S.seguir ? ' on' : ''}"></span>` });
    ch.onclick = () => {
      if (!S.seguir && !prontos) return toast('Gere pelo menos um capítulo primeiro');
      api('/seguir', { ligado: !S.seguir }).then(r => { S.seguir = r.seguir; renderNarrativa(); toast(r.seguir ? 'O painel agora acompanha o LED' : 'O painel fica no que está'); }).catch(e => toast(e.message));
    };
    p.append(ch);
    const grupos = [];
    for (const c of CAP.LISTA) { let g = grupos.find(x => x.nome === c.grupo); if (!g) grupos.push(g = { nome: c.grupo, itens: [] }); g.itens.push(c); }
    for (const g of grupos) {
      p.append(titulo(g.nome, null));
      for (const c of g.itens) p.append(cartaoCap(c));
    }
    p.append(titulo('Sequência', null));
    const seq = CAP.SEQUENCIA, seqS = S.pecas.find(x => x.id === 'cap-noite');
    const bq = el('button', { className: 'cap' + (S.pecaId === 'cap-noite' ? ' on' : ''), style: 'grid-template-columns:minmax(0,1fr)' });
    const dq = el('div', { style: 'min-width:0' }); dq.append(miniFaixa('noite', () => (seqS ? seqS.comp : CAP.comp('noite')))); dq.append(el('h4', { html: esc(seq.nome) + (seqS && seqS.gerado ? '<span class="bol">VÍDEO PRONTO</span>' : '') })); dq.append(el('p', { textContent: seq.frase })); bq.append(dq);
    bq.onclick = () => { abrirCapitulo('noite'); vibrar(); };
    p.append(bq);
    p.append(titulo('Minhas peças', null));
    const minhas = S.pecas.filter(x => !x.capitulo);
    for (const m of minhas) {
      const b = el('button', { className: 'cap' + (S.pecaId === m.id ? ' on' : ''), style: 'grid-template-columns:minmax(0,1fr)' });
      const d = el('div', { style: 'min-width:0' });
      d.append(miniFaixa('m:' + m.id + ':' + m.hash, () => m.comp));
      d.append(el('h4', { html: esc(m.nome) + (m.gerado && m.gerado.cena === S.noPainel ? '<span class="bol vivo">NO PAINEL</span>' : m.gerado ? '<span class="bol">VÍDEO PRONTO</span>' : '') }));
      b.append(d); b.onclick = () => { abrir(m); vibrar(); };
      p.append(b);
    }
    const nova = el('button', { className: 'botao', html: icone('mais') + 'Peça nova' }); nova.onclick = () => { novaPeca(); if (!PC()) irAba('assets'); };
    p.append(nova);
  }

  // ---------- painel: assets ----------
  function ladoAbas() {
    const d = el('div', { className: 'lado-abas' });
    for (const [v, n] of [['narrativa', 'Narrativa'], ['assets', 'Brand book']]) {
      const b = el('button', { textContent: n }); b.setAttribute('aria-pressed', S.lado === v ? 'true' : 'false');
      b.onclick = () => { S.lado = v; aplicarLado(); renderizar(); };
      d.append(b);
    }
    return d;
  }
  function tileArte(id) {
    const a = M.ARTES[id], c = camadaSel();
    const b = el('button', { className: 'tile', html: (a.mini ? `<img alt="" loading="lazy" src="painel-estudio/${a.mini}"${a.fam === 'logo' ? ' style="filter:invert(1)"' : ''}>` : `<svg viewBox="0 0 ${a.vb[0]} ${a.vb[1]}" style="height:58px;width:100%" aria-hidden="true"><path fill="#d2d3d3" d="${a.caminho}"/></svg>`) + esc(a.nome) });
    if (S.destino === 'nesta' && c && c.tipo === 'arte' && c.artes.includes(id)) b.setAttribute('aria-pressed', 'true');
    b.onclick = () => tocarArte(id);
    return b;
  }
  function renderAssets() {
    const p = $('p-assets'); p.innerHTML = '';
    if (PC()) p.append(ladoAbas());
    const ch = el('div', { className: 'chips' });
    for (const [v, ic, n] of FAMILIAS) {
      const b = el('button', { className: 'chip', html: icone(ic) + esc(n) }); b.setAttribute('aria-pressed', S.familia === v ? 'true' : 'false');
      b.onclick = () => { S.familia = v; renderAssets(); };
      ch.append(b);
    }
    p.append(ch);
    const fam = S.familia, c = camadaSel();
    const compat = c && c.tipo === 'arte' && M.ARTES[c.artes[0]] && M.ARTES[c.artes[0]].fam === fam;
    if (['personagem', 'fragmento', 'logo', 'sinal'].includes(fam)) {
      if (compat) {
        const d = el('div', { className: 'destino' });
        for (const [v, n] of [['nova', 'Nova camada'], ['nesta', 'Em “' + (c.nome || 'camada') + '”']]) { const b = el('button', { textContent: n }); b.setAttribute('aria-pressed', S.destino === v ? 'true' : 'false'); b.onclick = () => { S.destino = v; renderAssets(); }; d.append(b); }
        p.append(d);
      } else S.destino = 'nova';
    }
    if (fam === 'personagem') {
      p.append(nota('<b>Personagens do calor coletivo.</b> Estado sólido, com recorte intencional permitido. Toque para pôr na faixa.'));
      const g = el('div', { className: 'grade' });
      for (const l of M.LETRAS) g.append(tileArte('sol-' + l));
      p.append(g);
      const b = el('button', { className: 'botao', style: 'margin-top:10px', html: icone('assets') + 'Elenco inteiro em fila' });
      b.onclick = () => colocar(F.A(M.ELENCO.map(l => 'sol-' + l), { nome: 'Elenco', tamanho: 95, y: 1, espaco: 497, caminho: 'passar', vel: 75, balanco: 1.4, ciclosB: Math.round(S.comp.duracao * 0.8), reflexo: 2 }));
      p.append(b);
      p.append(nota('<br>O Curador segura um vinil. Ele está aqui porque é da marca, mas fica fora do elenco inteiro e dos capítulos.'));
    } else if (fam === 'fragmento') {
      p.append(nota('<b>Estado de dissolução.</b> O brand book pede o fragmento como textura de apoio: em fundos e camadas de trás, nunca como protagonista.'));
      const g = el('div', { className: 'grade' }); for (const l of M.LETRAS) g.append(tileArte('frag-' + l)); p.append(g);
    } else if (fam === 'instancia') {
      const vs = catalogo.filter(v => v.grupo === 'instancia');
      const looks = [...new Set(vs.map(v => v.look))];
      if (!looks.includes(S.look)) S.look = looks[0];
      p.append(nota('<b>Estado Instância.</b> Os vídeos originais da marca, figuras em 3D girando 360°. Um toque põe na faixa; a versão leve fica pronta em alguns segundos.'));
      const lc = el('div', { className: 'chips' });
      for (const l of looks) { const b = el('button', { className: 'chip', textContent: l }); b.setAttribute('aria-pressed', S.look === l ? 'true' : 'false'); b.onclick = () => { S.look = l; renderAssets(); }; lc.append(b); }
      p.append(lc);
      const g = el('div', { className: 'grade' });
      for (const v of vs.filter(x => x.look === S.look)) { const b = el('button', { className: 'tile foto', html: `<img alt="" loading="lazy" src="painel-estudio/${v.mini}">${esc(M.NOME_FIG[v.figura] || v.figura)}${v.variante ? ' (variante)' : ''}` }); b.onclick = () => novoVideo(v); g.append(b); }
      p.append(g);
    } else if (fam === 'logo') {
      p.append(nota('<b>Preto e prata primeiro</b>, cor só de forma estratégica. O logo não entorta nem ganha contorno; aqui ele só escala por inteiro.'));
      const g = el('div', { className: 'grade', style: 'margin-bottom:12px' }); for (const id of ['logo-clube', 'logo-clubebar', 'logo-bar', 'logomark']) g.append(tileArte(id)); p.append(g);
      for (const [marca, nome] of [['clube', 'CLUBE em movimento'], ['clube bar', 'CLUBE Bar em movimento'], ['logomark', 'Logomark em movimento']]) {
        p.append(titulo(nome, 'video'));
        const gv = el('div', { className: 'grade' });
        for (const v of catalogo.filter(x => x.grupo === 'motion-logo' && x.marca === marca)) { const b = el('button', { className: 'tile foto', html: `<img alt="" loading="lazy" src="painel-estudio/${v.mini}">${esc(v.look)}` }); b.onclick = () => novoVideo(v); gv.append(b); }
        p.append(gv);
      }
    } else if (fam === 'texto') {
      p.append(nota('<b>Archivo</b> organiza, <b>Mythshire</b> destaca em caixa baixa e tamanho grande. No painel, o menor texto legível tem 10 px de altura.'));
      const campo = el('input', { className: 'campo', placeholder: 'Escreva aqui', maxLength: 80 });
      p.append(campo);
      const ln = el('div', { className: 'linha', style: 'margin-bottom:12px' });
      const a = el('button', { className: 'botao', innerHTML: 'Archivo' }); a.onclick = () => novoTexto(campo.value.trim() || 'clube', 'archivo');
      const m = el('button', { className: 'botao', style: 'font-family:"CLUBE Mythshire",serif;font-size:19px', innerHTML: 'Mythshire' }); m.onclick = () => novoTexto(campo.value.trim() || 'clube', 'mythshire');
      ln.append(a, m); p.append(ln);
      p.append(titulo('Palavras do brand book'));
      const fr = el('div', { className: 'frases' });
      for (const [t, f] of FRASES) { const b = el('button', { className: 'chip', textContent: t }); if (f === 'mythshire') b.style.fontFamily = '"CLUBE Mythshire",serif'; b.onclick = () => novoTexto(t, f); fr.append(b); }
      p.append(fr);
    } else if (fam === 'blocos') {
      p.append(nota('<b>Grid da marca.</b> Blocos retos e alinhados, sem sobrepor. Dois comportamentos do brand book: varredura e alternância.'));
      p.append(ladrilhosSimples([['varredura', 'passar', 'Varredura'], ['continua', 'corte', 'Alternância contínua'], ['dividida', 'grade2', 'Alternância dividida']], novosBlocos));
    } else if (fam === 'ceu') {
      p.append(nota('A mesma matéria do LED da pista: céu preto, estrelas, inox e cimento queimado.'));
      const g = el('div', { className: 'grade' });
      for (const nome of ['estrelas', 'via', 'rastros', 'aurora', 'eclipse', 'feixes', 'aneis', 'mercurio', 'micelio', 'porticos', 'brise', 'harpa', 'agulhas', 'tubos', 'concreto', 'inox', 'canelado', 'grade', 'gradiente', 'cor', 'reflexo', 'clareira']) {
        const b = el('button', { className: 'tile' });
        const cv = el('canvas'); cv.width = 240; cv.height = 116; b.append(cv, EF[nome].nome);
        cv.__desenhar = () => { const cg = cv.getContext('2d'), es = 116 / H; cg.setTransform(es, 0, 0, es, -2120 * es, 0); motor.desenhar(cg, { duracao: 30, camadas: [{ id: 'x', tipo: 'efeito', efeito: nome, opacidade: 1, ...EF[nome].padrao, x: 2180 }] }, 9, { x0: 2120, vw: 240 / es, es, soMini: true }); };
        if (obs) obs.observe(cv); else cv.__desenhar();
        b.onclick = () => novoEfeito(nome);
        g.append(b);
      }
      p.append(g);
    } else if (fam === 'sinal') {
      p.append(nota('As placas da sinalização do hotel. Servem para orientar: elevador, rooftop, saída.'));
      const g = el('div', { className: 'grade' }); for (const id of ['sinal-rooftop', 'sinal-elevador', 'sinal-saida', 'sinal-banheiro']) g.append(tileArte(id)); p.append(g);
    }
  }
  function ladrilhosSimples(lista, fn) {
    const b = el('div', { className: 'ladrilhos', style: 'grid-template-columns:repeat(3,minmax(0,1fr))' });
    for (const [v, ic, nome] of lista) { const x = el('button', { className: 'lad', html: icone(ic) + esc(nome) }); x.onclick = () => fn(v); b.append(x); }
    return b;
  }

  // ---------- painel: movimento ----------
  function semSelecao(p, txt) { p.append(el('div', { className: 'vazio', html: icone('assets') + '<span>' + txt + '</span>' })); }
  function renderMovimento() {
    const p = $('p-movimento'); p.innerHTML = '';
    const c = camadaSel();
    if (!c) semSelecao(p, 'Escolha uma camada na lente ou na lista, ou ponha um asset do brand book na faixa.');
    else {
      p.append(el('div', { className: 'tit', html: '<span>' + esc(nomeCamada(c)) + '</span>' }));
      if (c.tipo === 'efeito') renderEfeito(p, c);
      else if (c.tipo === 'blocos') renderBlocos(p, c);
      else { p.append(nota('Arraste na lente para mudar o lugar e a altura.')); renderMovimentoArte(p, c); }
    }
    if (PC()) { const d = el('div', { id: 'cor-dentro' }); p.append(d); renderCor(d); }
  }
  function renderEfeito(p, c) {
    const d = EF[c.efeito];
    for (const [k, nome, min, max, passo, tipo] of d.ctl) {
      if (tipo === 'dir') { p.append(ladrilhos([[-1, 'esquerda', 'Para a esquerda'], [1, 'direita', 'Para a direita']], c[k], v => { c[k] = v; })); continue; }
      p.append(rCam(c, k, nome, min, max, passo, { fmt: tipo === 'pct' ? v => Math.round(v * 100) + '%' : tipo === 'm' ? v => px2m(v) : undefined, padrao: d.padrao[k] }));
    }
    if (!d.ctl.length) p.append(nota('Esta camada só tem cor. Ela fica na aba Cor.'));
    p.append(rCam(c, 'opacidade', 'Opacidade', 0, 1, 0.01, { fmt: v => Math.round(v * 100) + '%', padrao: 1 }));
  }
  function renderBlocos(p, c) {
    p.append(ladrilhos([['varredura', 'passar', 'Varredura'], ['continua', 'corte', 'Alternância contínua'], ['dividida', 'grade2', 'Alternância dividida']], c.modo, v => { c.modo = v; }));
    if (c.modo === 'varredura') {
      p.append(ladrilhos([[-1, 'esquerda', 'Para a esquerda'], [1, 'direita', 'Para a direita']], c.dir, v => { c.dir = v; }));
      p.append(rCam(c, 'paradas', 'Paradas no loop', 1, 32, 1));
      p.append(rCam(c, 'voltas', 'Voltas no loop', 1, 6, 1));
    } else {
      p.append(titulo('Troca a cada'));
      p.append(ladrilhos([[5, 'corte', '5 quadros'], [10, 'corte', '10 quadros'], [30, 'corte', '1 s'], [90, 'corte', '3 s']], c.quadros, v => { c.quadros = v; }));
    }
    p.append(rCam(c, 'colunas', 'Colunas do grid', 4, 96, 2));
    p.append(rCam(c, 'linhas', 'Linhas', 1, 4, 1));
    p.append(rCam(c, 'vao', 'Vão entre blocos', 0, 12, 1, { fmt: v => v + ' px' }));
    p.append(rCam(c, 'semente', 'Outra composição', 1, 40, 1));
    const can = el('button', { className: 'chave-card', html: `<div><b>Metal canelado</b><small>A canelura vertical nos blocos de metal.</small></div><span class="interruptor${c.canelado ? ' on' : ''}"></span>` });
    can.onclick = () => { c.canelado = !c.canelado; mudou(); renderizar(); }; p.append(can);
  }
  function renderMovimentoArte(p, c) {
    const fam = c.tipo === 'arte' && M.ARTES[c.artes[0]] ? M.ARTES[c.artes[0]].fam : c.tipo;
    const logo = fam === 'logo' || fam === 'texto';
    if (c.tipo === 'arte' && c.artes.length > 0 && ['personagem', 'fragmento', 'logo', 'sinal'].includes(fam)) {
      const lista = el('div', { className: 'chips', style: 'margin-bottom:8px' });
      for (const id of c.artes) { const a = M.ARTES[id]; const b = el('button', { className: 'chip', textContent: a.nome }); b.onclick = () => { S.familia = fam; S.destino = 'nesta'; irAba('assets'); }; lista.append(b); }
      const mais = el('button', { className: 'chip', html: icone('mais') + (c.artes.length > 1 ? 'Mudar elenco' : 'Trocar ou somar arte') }); mais.onclick = () => { S.familia = fam; S.destino = 'nesta'; irAba('assets'); }; lista.append(mais);
      p.append(lista);
    }
    if (c.tipo === 'texto') {
      const campo = el('input', { className: 'campo', value: c.texto, maxLength: 80 });
      campo.oninput = () => { c.texto = campo.value || ' '; };
      campo.onchange = () => mudou();
      p.append(campo);
      p.append(ladrilhos([['archivo', 'texto', 'Archivo'], ['mythshire', 'texto', 'Mythshire']], c.fonte, v => { c.fonte = v; }));
      if (c.fonte === 'archivo') {
        p.append(ladrilhos([[200, 'texto', 'Extralight'], [300, 'texto', 'Light'], [400, 'texto', 'Regular'], [500, 'texto', 'Medium']], c.peso, v => { c.peso = v; }));
        p.append(rCam(c, 'tracking', 'Espaço entre letras', 0, 0.4, 0.01, { fmt: v => Math.round(v * 100) + '%', padrao: 0 }));
      }
    }
    p.append(titulo('Caminho'));
    p.append(ladrilhos([['parado', 'parado', 'Parado'], ['passar', 'passar', 'Passar'], ['passo', 'passo', 'Slider'], ['vaievem', 'vaievem', 'Vai e vem']], c.caminho, v => { c.caminho = v; if ((v === 'parado' || v === 'vaievem') && !c.x) c.x = CENTRO; if (v === 'passo' && !c.ciclos) c.ciclos = 6; }));
    const D = S.comp.duracao;
    const larg = () => tamanhoCamada(c);
    if (c.caminho === 'passar' || c.caminho === 'passo') {
      p.append(ladrilhos([[-1, 'esquerda', 'Para a esquerda'], [1, 'direita', 'Para a direita']], c.dir, v => { c.dir = v; }));
    }
    if (c.caminho === 'passar') {
      const n = (c.artes || [1]).length;
      const velReal = () => { const L = Math.max(4, c.espaco) * n; return Math.max(1, Math.round(c.vel * D / L)) * L / D; };
      const dica = el('p', { className: 'dica', hidden: true });
      const atualizaDica = () => {
        const L = Math.max(4, c.espaco) * n, min = L / D;
        if (c.vel < min * 0.75) {
          const novo = Math.min(600, Math.ceil(L / Math.max(c.vel, 5)));
          dica.hidden = false; dica.innerHTML = `Nesta duração o mais devagar é ${Math.round(min)} px/s, para o loop fechar sem emenda. `;
          const b = el('button', { textContent: 'Usar ' + novo + ' s de loop' }); b.onclick = () => { S.comp.duracao = novo; mudou(); renderizar(); }; dica.append(b);
        } else dica.hidden = true;
      };
      const r = regua({ nome: 'Velocidade', min: 5, max: 400, passo: 1, curva: 2, valor: c.vel, fmt: () => Math.round(velReal()) + ' px/s', aoMudar: v => { c.vel = v; atualizaDica(); }, aoSoltar: () => mudou() });
      p.append(r, dica); atualizaDica();
    }
    if (c.caminho === 'passo') p.append(rCam(c, 'ciclos', 'Paradas no loop', 1, 40, 1, { padrao: 6 }));
    if (c.caminho === 'vaievem') {
      p.append(rCam(c, 'amp', 'Alcance', 10, 2000, 10, { fmt: v => px2m(v), padrao: 300, curva: 2 }));
      p.append(rCam(c, 'ciclos', 'Idas e voltas no loop', 1, 20, 1, { padrao: 2 }));
    }
    p.append(titulo('Lugar e tamanho'));
    const maxT = logo ? 150 : c.tipo === 'video' ? 500 : 900;
    p.append(rCam(c, 'tamanho', logo ? 'Altura' : 'Tamanho', logo ? 15 : 30, maxT, 1, { curva: 1.8, fmt: v => (v > 105 && !logo ? 'Recorte, ' : '') + Math.round(v * H / 100) + ' px' }));
    if (c.tamanho > 100 || !logo) p.append(rCam(c, 'y', c.tamanho > 100 ? 'Que parte aparece' : 'Altura na faixa', 0, 1, 0.01, { fmt: v => (v < 0.34 ? 'Cima' : v > 0.66 ? 'Baixo' : 'Meio'), padrao: 0.5 }));
    p.append(rCam(c, 'x', c.caminho === 'passar' || c.caminho === 'passo' ? 'Ponto de partida' : 'Lugar na faixa', 0, W, 2, { fmt: v => px2m(v) }));
    if (c.caminho === 'parado' || c.caminho === 'vaievem') p.append(rCam(c, 'copias', 'Cópias', 1, 16, 1, { padrao: 1 }));
    p.append(rCam(c, 'espaco', 'Espaço entre eles', Math.round(larg() * 0.8) || 30, 4472, 2, { curva: 2, fmt: v => px2m(v), depois: () => {} }));

    if (c.tipo !== 'video' || (c.artes || []).length > 1) {
      p.append(titulo('Troca de arte'));
      p.append(ladrilhos([['nenhuma', 'nada', 'Nenhuma'], ['virar', 'virar', 'Vira'], ['montar', 'montar', 'Monta em blocos'], ['corte', 'corte', 'Corte seco']], c.troca || 'nenhuma', v => { c.troca = v; if (v !== 'nenhuma' && !c.trocas) c.trocas = Math.max((c.artes || [1]).length, 4); }));
      if (c.troca && c.troca !== 'nenhuma') {
        p.append(rCam(c, 'trocas', 'Trocas no loop', 1, 60, 1, { padrao: 4 }));
        p.append(rCam(c, 'atraso', 'Onda entre as cópias', 0, 0.5, 0.01, { fmt: v => Math.round(v * 100) + '%', padrao: 0 }));
        if (c.troca === 'montar') p.append(rCam(c, 'celulas', 'Tamanho dos blocos', 6, 28, 1, { fmt: v => (v < 11 ? 'Grandes' : v > 19 ? 'Finos' : 'Médios'), padrao: 13 }));
      }
    }
    p.append(titulo('Vida no corpo'));
    p.append(rCam(c, 'giro', 'Giro 360° no loop', 0, 12, 1, { padrao: 0, fmt: v => (v ? v + (v === 1 ? ' volta' : ' voltas') : 'Sem giro') }));
    p.append(rCam(c, 'varreY', 'Sobe e desce no recorte', 0, 1, 0.01, { padrao: 0, fmt: v => Math.round(v * 100) + '%' }));
    if (c.varreY) p.append(rCam(c, 'ciclosY', 'Vezes no loop', 1, 12, 1, { padrao: 1 }));
    p.append(rCam(c, 'balanco', 'Balanço ao andar', 0, 8, 0.2, { padrao: 0, fmt: v => (v ? v.toFixed(1).replace('.', ',') + ' px' : 'Sem') }));
    if (c.balanco) p.append(rCam(c, 'ciclosB', 'Passos no loop', 1, 240, 1, { padrao: 48, curva: 1.6 }));
    p.append(rCam(c, 'respira', 'Respiração', 0, 0.4, 0.01, { padrao: 0, fmt: v => Math.round(v * 100) + '%' }));
    if (c.respira) p.append(rCam(c, 'ciclosR', 'Vezes no loop', 1, 60, 1, { padrao: 8 }));
    if (c.caminho === 'passar' || c.caminho === 'passo') {
      p.append(rCam(c, 'rastro', 'Rastro', 0, 8, 1, { padrao: 0 }));
      if (c.rastro) p.append(rCam(c, 'rastroGap', 'Espaço do rastro', 4, 120, 2, { padrao: 22, fmt: v => v + ' px' }));
    }
    const esp = el('button', { className: 'chave-card', html: `<div><b>Espelhar alternado</b><small>Uma cópia sim, outra não, olhando para o outro lado.</small></div><span class="interruptor${c.espelhar ? ' on' : ''}"></span>` });
    esp.onclick = () => { c.espelhar = !c.espelhar; mudou(); renderizar(); };
    p.append(esp);
  }
  function tamanhoCamada(c) {
    const lista = motor.fontesDaCamada(c); let m = 0;
    for (const f of lista) if (f.pronta) m = Math.max(m, (f.w / f.h) * (c.tamanho / 100) * H);
    return m;
  }
  function nomeCamada(c) {
    if (c.nome) return c.nome;
    if (c.tipo === 'efeito') return EF[c.efeito] ? EF[c.efeito].nome : c.efeito;
    if (c.tipo === 'blocos') return 'Blocos';
    if (c.tipo === 'texto') return c.texto;
    if (c.tipo === 'video') return 'Vídeo';
    return M.ARTES[c.artes[0]] ? M.ARTES[c.artes[0]].nome : 'Camada';
  }

  // ---------- painel: cor ----------
  function renderCor(p) {
    p.innerHTML = '';
    const c = camadaSel();
    if (!c) return semSelecao(p, 'Escolha uma camada. Só aparecem cores da paleta da marca.');
    if (PC()) p.append(titulo('Cor', 'paleta'));
    const grupo = (nome, lista, atual, fn) => {
      p.append(titulo(nome));
      const g = el('div', { className: 'tratos' });
      for (const [v, n] of lista) { const b = el('button', { className: 'trato', html: `<i style="background:${css(v)}"></i>${esc(n)}` }); b.setAttribute('aria-pressed', atual === v ? 'true' : 'false'); b.onclick = () => { fn(v); mudou(); renderizar(); vibrar(); }; g.append(b); }
      p.append(g);
    };
    if (c.tipo === 'blocos') {
      p.append(nota('Toque para ligar ou desligar uma cor nos blocos. Metal, preto e neutros são a base; o brand book pede gradiente ou cor para dar energia.'));
      p.append(titulo('Cores dos blocos', null, c.pinturas.length + ' escolhidas'));
      const g = el('div', { className: 'tratos' });
      for (const [v, n] of [['metal', 'Metal'], ['black', 'Preto'], ['white', 'Branco'], ['deepGrey', 'Deep Grey'], ['baseGrey', 'Base Grey'], ['softGrey', 'Soft Grey'], ...TRATOS.grad, ...TRATOS.fortes]) {
        const b = el('button', { className: 'trato', html: `<i style="background:${css(v)}"></i>${esc(n)}` }); b.setAttribute('aria-pressed', c.pinturas.includes(v) ? 'true' : 'false');
        b.onclick = () => { const i = c.pinturas.indexOf(v); if (i >= 0) { if (c.pinturas.length > 1) c.pinturas.splice(i, 1); } else c.pinturas.push(v); mudou(); renderizar(); vibrar(); };
        g.append(b);
      }
      p.append(g);
      p.append(rCam(c, 'reflexo', 'Reflexo no loop', 0, 8, 1, { padrao: 0 }));
      p.append(rCam(c, 'opacidade', 'Opacidade', 0, 1, 0.01, { fmt: v => Math.round(v * 100) + '%', padrao: 1 }));
      return;
    }
    if (c.tipo === 'efeito') {
      const d = EF[c.efeito];
      if (d.cor === 'grad') grupo('Gradiente', [['metal', 'Metal'], ...TRATOS.grad], c.cor, v => { c.cor = v; });
      else if (d.cor === 'solida') grupo('Cor', [['black', 'Black'], ['white', 'White'], ['deepGrey', 'Deep Grey'], ['baseGrey', 'Base Grey'], ['midGrey', 'Mid Grey'], ['lightGrey', 'Light Grey'], ['softGrey', 'Soft Grey'], ...TRATOS.fortes], c.cor, v => { c.cor = v; });
      else p.append(nota('Esta matéria é prata e preta, como o céu do LED. O ajuste de brilho fica em Movimento.'));
      return;
    }
    if (c.tipo === 'video') {
      p.append(nota('O vídeo da marca já vem com a cor dele. Escolha outro no brand book para mudar: Azul, Verde, Multicor ou os detalhes em prata.'));
    } else {
      const fam = c.tipo === 'arte' && M.ARTES[c.artes[0]] ? M.ARTES[c.artes[0]].fam : 'texto';
      const neutros = fam === 'logo' || fam === 'texto' ? TRATOS.neutros.filter(x => x[0] !== 'original') : TRATOS.neutros;
      if (fam === 'sinal') p.append(nota('A placa vem com a cor do projeto de sinalização.'));
      else {
        if (fam === 'logo') p.append(nota('Prioridade da marca: preto e prata. Branco, cor e gradiente pedem um fundo que garanta leitura.'));
        grupo('Base', fam === 'logo' ? [...neutros, ['relevo', 'Gravado']] : neutros, c.trat, v => { c.trat = v; });
        grupo('Gradientes', TRATOS.grad, c.trat, v => { c.trat = v; });
        grupo('Cor chapada', TRATOS.fortes, c.trat, v => { c.trat = v; });
      }
      p.append(rCam(c, 'reflexo', 'Reflexo correndo no metal', 0, 12, 1, { padrao: 0, fmt: v => (v ? v + (v === 1 ? ' passagem' : ' passagens') : 'Parado') }));
    }
    p.append(rCam(c, 'opacidade', 'Opacidade', 0, 1, 0.01, { fmt: v => Math.round(v * 100) + '%', padrao: 1 }));
    p.append(titulo('Mistura com o fundo'));
    p.append(ladrilhos([['source-over', 'camadas', 'Normal'], ['lighter', 'sol', 'Somar luz'], ['screen', 'sol', 'Tela'], ['multiply', 'calma', 'Multiplicar']], c.mistura || (c.tipo === 'video' ? 'lighter' : 'source-over'), v => { c.mistura = v; }));
  }

  // ---------- painel: camadas ----------
  function renderCamadas() {
    const p = $('p-camadas'); p.innerHTML = '';
    const D = S.comp.duracao;
    p.append(titulo('Duração do loop', null, D + ' s'));
    const ch = el('div', { className: 'chips' });
    for (const s of [15, 20, 30, 45, 60, 90, 120, 180, 300]) { const b = el('button', { className: 'chip', textContent: s >= 60 ? (s / 60) + ' min' : s + ' s' }); b.setAttribute('aria-pressed', D === s ? 'true' : 'false'); b.onclick = () => { S.comp.duracao = s; mudou(); renderizar(); }; ch.append(b); }
    p.append(ch);
    p.append(titulo('Camadas', null, 'a de cima cobre as outras'));
    const lista = S.comp.camadas.slice().reverse();
    for (const c of lista) p.append(linhaCamada(c));
    const add = el('button', { className: 'botao', style: 'margin-top:4px', html: icone('mais') + 'Pôr asset do brand book' });
    add.onclick = () => { if (PC()) { S.lado = 'assets'; aplicarLado(); renderizar(); } else irAba('assets'); };
    p.append(add);
    const av = checarMarca();
    p.append(titulo('Conferência do brand book'));
    if (!av.length) p.append(el('p', { className: 'nota marca-ok', textContent: 'Nada fora das regras da marca.' }));
    for (const a of av) p.append(el('div', { className: 'aviso-marca', html: icone('aviso') + '<span>' + esc(a) + '</span>' }));
    p.append(titulo('Peça'));
    const ln = el('div', { className: 'linha', style: 'margin-bottom:8px' });
    const sal = el('button', { className: 'botao', html: icone('salvar') + 'Salvar' });
    sal.onclick = () => api('/pecas', { id: S.pecaId, nome: S.nome, capitulo: S.capitulo, comp: S.comp }).then(r => { S.pecaId = r.id; return lerEstado(); }).then(() => toast('Salva')).catch(e => toast(e.message));
    const dup = el('button', { className: 'botao', html: icone('copia') + 'Duplicar' });
    dup.onclick = () => { abrir({ id: null, nome: S.nome + ' (cópia)', comp: S.comp, capitulo: null }); toast('Agora você está na cópia'); };
    ln.append(sal, dup); p.append(ln);
    if (S.capitulo && S.pecaId) {
      const rest = el('button', { className: 'botao', style: 'margin-bottom:8px;width:100%', html: icone('desfazer') + 'Voltar ao capítulo original' });
      rest.onclick = () => { const o = CAP.comp(S.capitulo); if (o) { S.comp = { duracao: o.duracao, led: o.led, camadas: o.camadas }; S.sel = null; mudou(); renderizar(); toast('Capítulo original de volta'); } };
      p.append(rest);
    }
    const sv = pecaSalva();
    if (sv) {
      const ap = el('button', { className: 'botao perigo', style: 'width:100%', html: icone('lixo') + (sv.capitulo ? 'Apagar o vídeo deste capítulo' : 'Apagar esta peça') });
      let conf = 0;
      ap.onclick = () => {
        if (Date.now() - conf > 2500) { conf = Date.now(); ap.lastChild.textContent = 'Toque de novo para apagar'; return; }
        api('/pecas/' + sv.id, null, 'DELETE').then(lerEstado).then(() => { toast('Apagada'); if (!sv.capitulo) novaPeca(); else abrirCapitulo(sv.capitulo); renderizar(); }).catch(e => toast(e.message));
      };
      p.append(ap);
    }
  }
  function linhaCamada(c) {
    const r = el('div', { className: 'cam' + (c.id === S.sel ? ' on' : '') + (c.oculta ? ' oculta' : '') });
    const mini = el('div', { className: 'cam-mini' });
    if (c.tipo === 'arte' && M.ARTES[c.artes[0]] && M.ARTES[c.artes[0]].mini) mini.innerHTML = `<img alt="" src="painel-estudio/${M.ARTES[c.artes[0]].mini}"${M.ARTES[c.artes[0]].fam === 'logo' ? ' style="filter:invert(1)"' : ''}>`;
    else if (c.tipo === 'video') { const v = catalogo.find(x => x.id === c.artes[0]); mini.innerHTML = v ? `<img alt="" src="painel-estudio/${v.mini}">` : icone('video'); }
    else mini.innerHTML = icone(c.tipo === 'texto' ? 'texto' : c.tipo === 'blocos' ? 'grade2' : c.tipo === 'arte' ? 'logo' : 'ceu');
    const nome = el('button', { className: 'cam-nome', html: `<b>${esc(nomeCamada(c))}</b><small>${esc(resumoCamada(c))}</small>` });
    const escolher = () => { S.sel = c.id; focar(); renderizar(); vibrar(); };
    nome.onclick = () => { escolher(); if (!PC()) irAba('movimento'); };
    mini.onclick = escolher;
    const bt = el('div', { className: 'cam-botoes' });
    const acao = (ic, rot, fn) => { const b = el('button', { html: icone(ic) }); b.setAttribute('aria-label', rot); b.onclick = fn; bt.append(b); };
    acao('cima', 'Subir', () => mover(c, 1));
    acao('baixo', 'Descer', () => mover(c, -1));
    acao(c.oculta ? 'olhoFora' : 'olho', 'Mostrar ou esconder', () => { c.oculta = !c.oculta; mudou(); renderizar(); });
    acao('copia', 'Duplicar', () => { const d = copia(c); d.id = F.id() + Date.now().toString(36); const i = S.comp.camadas.indexOf(c); S.comp.camadas.splice(i + 1, 0, d); S.sel = d.id; mudou(); renderizar(); });
    acao('lixo', 'Apagar', () => { S.comp.camadas = S.comp.camadas.filter(x => x !== c); if (S.sel === c.id) S.sel = null; mudou(); renderizar(); toast('Camada apagada, Desfazer traz de volta'); });
    r.append(mini, nome, bt);
    r.append(barraJanela(c));
    return r;
  }
  function resumoCamada(c) {
    if (c.tipo === 'efeito') return 'Matéria';
    if (c.tipo === 'blocos') return c.modo === 'varredura' ? 'Varredura' : 'Alternância';
    const cam = { parado: 'Parado', passar: 'Passando', passo: 'Slider', vaievem: 'Vai e vem' }[c.caminho] || '';
    const q = (c.artes || []).length;
    return cam + (q > 1 ? ' · ' + q + ' artes' : '') + (c.tamanho > 105 ? ' · recorte' : '');
  }
  function mover(c, d) {
    const cs = S.comp.camadas, i = cs.indexOf(c), j = i + d;
    if (j < 0 || j >= cs.length) return;
    cs[i] = cs[j]; cs[j] = c; mudou(); renderizar(); vibrar();
  }
  // A barra de tempo de cada camada: quando ela aparece dentro do loop.
  function barraJanela(c) {
    const b = el('div', { className: 'janela', html: '<i></i><u></u><u></u>' });
    const jn = () => c.janela || { ini: 0, fim: 1, fade: 0.02 };
    const pinta = () => { const j = jn(), [fx, a, z] = [b.children[0], b.children[1], b.children[2]]; fx.style.left = j.ini * 100 + '%'; fx.style.width = (j.fim - j.ini) * 100 + '%'; a.style.left = 'calc(' + j.ini * 100 + '% - 8px)'; z.style.left = 'calc(' + j.fim * 100 + '% - 8px)'; };
    pinta();
    b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Quando esta camada aparece no loop');
    let mod = null;
    const ax = ev => { const q = b.getBoundingClientRect(); return limita((ev.clientX - q.left) / q.width); };
    b.addEventListener('pointerdown', ev => {
      const x = ax(ev), j = jn(), q = b.getBoundingClientRect(), mar = 18 / q.width;
      if (Math.abs(x - j.ini) < mar && j.ini > 0.001 || (Math.abs(x - j.ini) < mar && Math.abs(x - j.fim) >= mar)) mod = { tipo: 'ini' };
      else if (Math.abs(x - j.fim) < mar) mod = { tipo: 'fim' };
      else if (x > j.ini && x < j.fim) mod = { tipo: 'tudo', x0: x, a: j.ini, b: j.fim };
      else return;
      ev.stopPropagation(); try { b.setPointerCapture(ev.pointerId); } catch {}
      if (!c.janela) c.janela = { ini: 0, fim: 1, fade: Math.min(0.05, 1 / S.comp.duracao) };
    });
    b.addEventListener('pointermove', ev => {
      if (!mod) return;
      const x = ax(ev), j = c.janela;
      if (mod.tipo === 'ini') j.ini = Math.min(x, j.fim - 0.03);
      else if (mod.tipo === 'fim') j.fim = Math.max(x, j.ini + 0.03);
      else { const l = mod.b - mod.a, n = limita(mod.a + (x - mod.x0), 0, 1 - l); j.ini = n; j.fim = n + l; }
      pinta();
    });
    const fim = () => { if (!mod) return; mod = null; if (c.janela && c.janela.ini <= 0.005 && c.janela.fim >= 0.995) delete c.janela; mudou(); };
    b.addEventListener('pointerup', fim); b.addEventListener('pointercancel', fim);
    return b;
  }

  function checarMarca() {
    const av = [], cs = S.comp.camadas.filter(c => !c.oculta);
    const figs = cs.filter(c => c.tipo === 'arte' && M.ARTES[c.artes[0]] && M.ARTES[c.artes[0]].fam === 'personagem').length;
    const temLogo = cs.some(c => c.tipo === 'arte' && M.ARTES[c.artes[0]] && M.ARTES[c.artes[0]].fam === 'logo');
    for (const c of cs) {
      const altura = (c.tamanho / 100) * H;
      if (c.tipo === 'texto') {
        if (c.fonte === 'mythshire') {
          if (/[A-ZÀ-Ú]{2}/.test(c.texto)) av.push('Mythshire em caixa alta perde a leitura. Use caixa baixa em "' + c.texto + '".');
          if (altura < 34) av.push('Mythshire não deve ir em tamanho pequeno: "' + c.texto + '" está com ' + Math.round(altura) + ' px.');
        } else if (c.peso === 600) av.push('Archivo SemiBold desequilibra títulos.');
        if (altura < 10) av.push('Texto com ' + Math.round(altura) + ' px: o menor legível no painel tem 10 px.');
      }
      if (c.tipo === 'arte') {
        const a = M.ARTES[c.artes[0]];
        if (!a) continue;
        if (a.fam === 'logo' && altura < 30) av.push('O logo está com ' + Math.round(altura) + ' px de altura. Na parede, abaixo de 30 px ele some.');
        if (a.fam === 'logo' && altura > 86) av.push('O logo está maior que a faixa e perde as pontas. O brand book não prevê recorte de logo.');
        if (a.fam === 'fragmento' && !figs && !temLogo) av.push('Só fragmento na peça: o brand book pede fragmento como apoio, nunca como protagonista.');
        if (a.fam === 'personagem' && altura < 60) av.push('Personagem pequeno demais descaracteriza a figura. Nesse tamanho, o brand book indica Fragmento.');
        if (c.artes.includes('sol-h') || c.artes.includes('frag-h')) av.push('O Curador segura um vinil, elemento que já foi tirado do LED.');
        if (a.fam === 'logo' && !['metal', 'black', 'relevo'].includes(c.trat) && !(c.trat === 'white')) av.push('Logo em cor é uso estratégico: confira se o fundo garante leitura.');
      }
      if (c.tipo === 'blocos' && c.pinturas.every(x => ['deepGrey', 'baseGrey', 'midGrey', 'lightGrey', 'softGrey'].includes(x))) av.push('Não construa composições só com tons neutros: inclua preto, metal ou gradiente.');
      if (c.tipo === 'blocos' && c.quadros === 5 && c.modo !== 'varredura') av.push('Alternância a cada 5 quadros pisca 6 vezes por segundo. Com pessoas no bar, prefira 10 quadros ou mais.');
    }
    return [...new Set(av)];
  }

  // ---------- gerar e pôr no ar ----------
  function estadoCTA() {
    if (S.job && S.job.peca === S.pecaId && ['na-fila', 'desenhando', 'codificando'].includes(S.job.fase)) return 'gerando';
    const p = pecaSalva(), h = hashDe(S.comp);
    if (p && p.gerado && p.gerado.hash === h) return S.noPainel === p.gerado.cena ? 'noar' : 'ar';
    return 'gerar';
  }
  function atualizarCTA() {
    const est = estadoCTA(), b = $('cta');
    b.className = 'cta' + (est === 'gerando' ? ' gerando' : est === 'ar' ? ' ar' : est === 'noar' ? ' noar' : '');
    const pr = $('cta-prog');
    if (est === 'gerando') {
      const j = S.job, p = j.total ? j.quadro / j.total : 0;
      pr.style.width = (j.fase === 'codificando' ? 100 : p * 100) + '%';
      $('cta-txt').textContent = j.fase === 'na-fila' ? 'Na fila' : j.fase === 'codificando' ? 'Fechando o vídeo' : 'Gerando ' + Math.round(p * 100) + '%';
      $('cta-ico').innerHTML = '';
    } else {
      pr.style.width = '0';
      $('cta-txt').textContent = est === 'gerar' ? 'Gerar vídeo' : est === 'ar' ? 'Pôr no painel' : 'No painel';
      $('cta-ico').innerHTML = icone(est === 'gerar' ? 'gerar' : est === 'ar' ? 'aoVivo' : 'ok');
    }
    b.disabled = est === 'gerando' || est === 'noar';
  }
  async function aoCTA() {
    const est = estadoCTA();
    vibrar();
    try {
      if (est === 'gerar') {
        const r = await api('/gerar', { id: S.pecaId, nome: S.nome, capitulo: S.capitulo, comp: S.comp });
        S.pecaId = r.peca.id; S.job = r.job; S.jobId = r.job.id;
        const i = S.pecas.findIndex(p => p.id === r.peca.id); if (i >= 0) S.pecas[i] = r.peca; else S.pecas.push(r.peca);
        atualizarCTA();
        vigiarJob();
        const min = Math.max(1, Math.ceil(S.comp.duracao * 30 / 14 / 60));
        toast('Gerando, leva cerca de ' + min + ' min. Pode continuar mexendo.');
      } else if (est === 'ar') {
        const p = pecaSalva();
        await api('/por-no-ar', { id: p.id });
        S.noPainel = p.gerado.cena; atualizarCTA(); renderizar();
        toast('No painel em poucos segundos');
      }
    } catch (e) { toast(e.message); }
  }
  let vigia = null;
  function vigiarJob() {
    clearInterval(vigia);
    vigia = setInterval(async () => {
      try {
        const j = await api('/job/' + S.jobId);
        S.job = j; atualizarCTA();
        if (j.fase === 'pronto') { clearInterval(vigia); S.job = null; await lerEstado(); toast('“' + j.nome + '” pronta. Agora é só pôr no painel.'); renderizar(); }
        else if (j.fase === 'erro') { clearInterval(vigia); S.job = null; atualizarCTA(); toast('Não gerou: ' + (j.erro || 'erro')); }
      } catch { clearInterval(vigia); }
    }, 700);
  }
  async function lerEstado() {
    try {
      const e = await api('');
      const antes = JSON.stringify([S.seguir, S.noPainel, S.pecas.map(p => [p.id, p.hash, p.gerado && p.gerado.hash])]);
      S.pecas = e.pecas; S.seguir = e.seguir; S.noPainel = e.noPainel;
      if (e.job && !S.job) { S.job = e.job; S.jobId = e.job.id; vigiarJob(); }
      atualizarCTA();
      if (antes !== JSON.stringify([S.seguir, S.noPainel, S.pecas.map(p => [p.id, p.hash, p.gerado && p.gerado.hash])])) { if (S.aba === 'narrativa' || PC()) renderNarrativa(); }
    } catch {}
  }
  async function lerLed() {
    try {
      const r = await fetch('/api/visuais').then(x => x.json());
      if (r.visuais) S.visuais = r.visuais;
      const v = r.saida && r.saida.visual;
      if (v !== S.ledAgora) {
        S.ledAgora = v || null;
        const inf = S.visuais.find(x => x.id === v);
        $('led-nome').textContent = inf ? inf.nome : (v || 'LED apagado');
        const f = $('led-foto'); if (v) { f.src = fotoLed(v); f.hidden = false; } else f.hidden = true;
        if (S.aba === 'narrativa' || PC()) renderNarrativa();
      }
    } catch { $('led-nome').textContent = 'Sem resposta'; }
  }

  // ---------- palco ----------
  const cFaixa = $('faixa'), gFaixa = cFaixa.getContext('2d'), cLente = $('lente'), gLente = cLente.getContext('2d');
  const cParede = $('parede'), gParede = cParede.getContext('2d');
  const buf = document.createElement('canvas'), gBuf = buf.getContext('2d');
  let linhas = 3, escFaixa = 0.1, altLinha = 10, dpr = 1, larguraLente = 400;
  const VAO = 3;
  function medir() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = $('bloco-faixa').clientWidth || 360;
    linhas = w < 640 ? 3 : 2;
    const px = Math.round(w * dpr);
    escFaixa = px / (W / linhas);
    altLinha = H * escFaixa;
    cFaixa.width = px; cFaixa.height = Math.round(altLinha * linhas + VAO * dpr * (linhas - 1));
    const lq = $('lente-caixa').getBoundingClientRect();
    larguraLente = Math.max(120, Math.round((lq.width / lq.height) * H * S.zoom));
    cLente.width = larguraLente; cLente.height = H;
    cParede.width = Math.round(lq.width * dpr); cParede.height = Math.round(lq.height * dpr);
    buf.width = 2236; buf.height = 43;
    gLente.imageSmoothingEnabled = false;
    desenharMarcas();
  }
  function desenharFaixa() {
    const g = gFaixa, vw = W / linhas, noTrecho = [];
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#16181c'; g.fillRect(0, 0, cFaixa.width, cFaixa.height);
    for (let l = 0; l < linhas; l++) {
      const x0 = l * vw, top = l * (altLinha + VAO * dpr);
      g.setTransform(escFaixa, 0, 0, escFaixa, -x0 * escFaixa, top);
      g.save(); g.beginPath(); g.rect(x0, 0, vw, H); g.clip();
      const cx = motor.desenhar(g, S.comp, S.t, { x0, vw, es: escFaixa });
      g.restore();
      if (S.focar) for (const c of cx) if (c.id === S.sel) noTrecho.push(c);
    }
    if (S.focar && noTrecho.length) {
      S.focar = false;
      const perto = noTrecho.reduce((m, c) => (Math.abs(c.x + c.w / 2 - S.lenteX) < Math.abs(m.x + m.w / 2 - S.lenteX) ? c : m));
      S.lenteX = limita(perto.x + perto.w / 2, larguraLente / 2, W - larguraLente / 2);
    } else if (S.focar && S.focarAte < performance.now()) S.focar = false;
    // onde a lente está olhando
    const lx0 = S.lenteX - larguraLente / 2, lx1 = lx0 + larguraLente;
    g.lineWidth = Math.max(1, dpr);
    for (let l = 0; l < linhas; l++) {
      const x0 = l * vw, a = Math.max(lx0, x0), b = Math.min(lx1, x0 + vw), top = l * (altLinha + VAO * dpr);
      if (b <= a) continue;
      g.setTransform(1, 0, 0, 1, 0, 0); g.strokeStyle = 'rgba(255,255,255,.9)';
      g.strokeRect((a - x0) * escFaixa + 0.5, top + 0.5, (b - a) * escFaixa - 1, altLinha - 1);
    }
    // metros, discretos, no começo de cada linha
    g.setTransform(1, 0, 0, 1, 0, 0); g.font = Math.round(9 * dpr) + 'px system-ui'; g.textBaseline = 'top';
    for (let l = 1; l < linhas; l++) {
      const txt = ((l * vw * 8.32) / W).toFixed(1).replace('.', ',') + ' m', top = l * (altLinha + VAO * dpr);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, top, g.measureText(txt).width + 8 * dpr, 12 * dpr);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(txt, 4 * dpr, top + 1.5 * dpr);
    }
  }
  function desenharLente() {
    const x0 = limita(S.lenteX - larguraLente / 2, 0, Math.max(0, W - larguraLente));
    S.lenteX = x0 + larguraLente / 2;
    const g = gLente;
    g.setTransform(1, 0, 0, 1, -x0, 0);
    S.caixas = motor.desenhar(g, S.comp, S.t, { x0, vw: larguraLente, es: 1 });
    g.globalAlpha = 1;
    const sel = S.caixas.filter(c => c.id === S.sel);
    if (sel.length) {
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.setLineDash([3, 2]);
      for (const c of sel) if (c.x + c.w > x0 && c.x < x0 + larguraLente) g.strokeRect(Math.round(c.x) + 0.5, Math.max(0.5, Math.round(c.y) + 0.5), Math.round(c.w) - 1, Math.min(H - 1, Math.round(c.h) - 1));
      g.setLineDash([]);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    $('selo').textContent = (S.zoom === 1 ? 'Tamanho real' : '1:' + S.zoom) + ' · ' + px2m(S.lenteX);
  }
  // Prévia na parede do bar, sobre a foto. É uma conta aproximada de perspectiva: serve para sentir, não para medir.
  const foto = new Image(); foto.src = 'painel-estudio/parede.jpg';
  function desenharParede() {
    const g = gParede, cw = cParede.width, ch = cParede.height;
    if (!foto.complete || !foto.naturalWidth) return;
    // recorte da foto em volta da faixa, inteiro em qualquer formato de tela
    const fx = 0, fw = 760, fy = 530, fh = 250, k = Math.min(cw / fw, ch / fh), ox = (cw - fw * k) / 2, oy = (ch - fh * k) / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    g.drawImage(foto, fx, fy, fw, fh, ox, oy, fw * k, fh * k);
    // tampa o letreiro da foto e redesenha a faixa em colunas
    const X1 = 688, topo = s => 629 + (561 - 629) * s, base = s => 738 + (582 - 738) * s, h0 = 109, h1 = 21;
    const es = buf.width / W;
    gBuf.setTransform(es, 0, 0, es, 0, 0);
    motor.desenhar(gBuf, S.comp, S.t, { x0: 0, vw: W, es, soMini: false });
    const passo = 2, U0 = 0, U1 = 0.6;
    g.imageSmoothingEnabled = true;
    for (let x = 0; x < X1; x += passo) {
      const s = x / X1, s2 = (x + passo) / X1;
      const u = v => (v / h1) / ((1 - v) / h0 + v / h1);
      const a = U0 + (U1 - U0) * u(s), b = U0 + (U1 - U0) * u(s2);
      const y0 = topo(s), y1 = base(s);
      g.drawImage(buf, a * buf.width, 0, Math.max(0.5, (b - a) * buf.width), buf.height, ox + (x - fx) * k, oy + (y0 - fy) * k, passo * k + 1, (y1 - y0) * k);
    }
  }
  let ultimo = performance.now(), contador = 0, ultVideo = 0;
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
    if (document.hidden || !S.comp) return;
    const D = S.comp.duracao;
    if (S.tocando && !S.arrastando) S.t = (S.t + dt) % D;
    contador++;
    if (agora - ultVideo > 300) { ultVideo = agora; motor.acertarVideos(S.comp, S.t, S.tocando && !S.arrastando); }
    if (S.vista === 'lente') desenharLente(); else if (contador % 2 === 0) desenharParede();
    if (contador % 2 === 1) desenharFaixa();
    if (contador % 4 === 0) {
      const p = (S.t / D) * 100, sc = $('scrub');
      sc.children[1].style.width = p + '%'; sc.children[2].style.left = p + '%';
      const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      $('tempo').textContent = fmt(S.t) + ' / ' + fmt(D);
    }
  }
  function desenharCamadas() { desenharMarcas(); }
  function desenharMarcas() { // marcas de capítulo na barra de tempo, quando a peça é uma sequência
    const sc = $('scrub');
    sc.querySelectorAll('.marca-cap').forEach(x => x.remove());
    if (!S.comp) return;
    const js = [...new Set(S.comp.camadas.filter(c => c.janela && c.capitulo).map(c => c.janela.ini))];
    for (const v of js) if (v > 0) { const m = el('span', { className: 'marca-cap' }); m.style.left = v * 100 + '%'; sc.append(m); }
  }

  function ligarPalco() {
    // lente: arrastar a camada escolhida, ou passear pela faixa
    const cx = $('lente');
    const paraFaixa = ev => { const q = cx.getBoundingClientRect(), x0 = S.lenteX - larguraLente / 2; return { x: x0 + ((ev.clientX - q.left) / q.width) * larguraLente, y: ((ev.clientY - q.top) / q.height) * H }; };
    let arr = null;
    cx.addEventListener('pointerdown', ev => {
      try { cx.setPointerCapture(ev.pointerId); } catch {}
      const p = paraFaixa(ev);
      let alvo = null;
      for (let i = S.caixas.length - 1; i >= 0; i--) { const c = S.caixas[i]; if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) { alvo = c; break; } }
      if (alvo) {
        const c = S.comp.camadas.find(z => z.id === alvo.id);
        const mudouSel = S.sel !== c.id;
        S.sel = c.id;
        arr = { tipo: 'camada', c, x0: c.x || 0, y0: c.y == null ? 0.5 : c.y, ini: p, h: alvo.h, moveu: false };
        S.arrastando = true;
        if (mudouSel) { renderizar(); vibrar(); }
      } else arr = { tipo: 'passear', xIni: ev.clientX, l0: S.lenteX };
    });
    cx.addEventListener('pointermove', ev => {
      if (!arr) return;
      if (arr.tipo === 'passear') {
        const q = cx.getBoundingClientRect();
        S.lenteX = limita(arr.l0 - ((ev.clientX - arr.xIni) / q.width) * larguraLente, larguraLente / 2, W - larguraLente / 2);
        return;
      }
      const p = { x: S.lenteX - larguraLente / 2 + ((ev.clientX - cx.getBoundingClientRect().left) / cx.getBoundingClientRect().width) * larguraLente, y: ((ev.clientY - cx.getBoundingClientRect().top) / cx.getBoundingClientRect().height) * H };
      const dx = p.x - arr.ini.x, dy = p.y - arr.ini.y;
      if (!arr.moveu && Math.abs(dx) + Math.abs(dy) < 2) return;
      arr.moveu = true;
      let nx = arr.x0 + dx;
      if (Math.abs(nx - CENTRO) < 10) nx = CENTRO; // gruda no meio da faixa
      arr.c.x = Math.round(nx);
      if (arr.h !== H) arr.c.y = limita(arr.y0 + dy / (H - arr.h));
    });
    const soltar = () => { if (arr && arr.tipo === 'camada') { S.arrastando = false; if (arr.moveu) { mudou(); renderizar(); } } arr = null; };
    cx.addEventListener('pointerup', soltar); cx.addEventListener('pointercancel', soltar);

    // faixa inteira: tocar leva a lente para lá
    const bf = $('bloco-faixa');
    const irPara = ev => {
      const q = cFaixa.getBoundingClientRect(), l = limita(Math.floor(((ev.clientY - q.top) / q.height) * linhas), 0, linhas - 1);
      S.lenteX = limita((l + (ev.clientX - q.left) / q.width) * (W / linhas), larguraLente / 2, W - larguraLente / 2);
    };
    let naFaixa = false;
    bf.addEventListener('pointerdown', ev => { naFaixa = true; try { bf.setPointerCapture(ev.pointerId); } catch {} irPara(ev); });
    bf.addEventListener('pointermove', ev => { if (naFaixa) irPara(ev); });
    bf.addEventListener('pointerup', () => { naFaixa = false; });
    bf.addEventListener('pointercancel', () => { naFaixa = false; });

    // tempo
    const sc = $('scrub');
    const irTempo = ev => { const q = sc.getBoundingClientRect(); S.t = limita((ev.clientX - q.left) / q.width) * S.comp.duracao * 0.9999; };
    let noTempo = false;
    sc.addEventListener('pointerdown', ev => { noTempo = true; S.arrastando = true; try { sc.setPointerCapture(ev.pointerId); } catch {} irTempo(ev); });
    sc.addEventListener('pointermove', ev => { if (noTempo) irTempo(ev); });
    const fimT = () => { noTempo = false; S.arrastando = false; };
    sc.addEventListener('pointerup', fimT); sc.addEventListener('pointercancel', fimT);

    $('tocar').onclick = () => { S.tocando = !S.tocando; $('tocar').innerHTML = icone(S.tocando ? 'pausar' : 'tocar'); vibrar(); };
    $('tocar').innerHTML = icone('pausar');
    const vista = v => {
      S.vista = v;
      $('vista-lente').setAttribute('aria-pressed', v === 'lente'); $('vista-parede').setAttribute('aria-pressed', v === 'parede');
      $('vista-lente').classList.toggle('on', v === 'lente'); $('vista-parede').classList.toggle('on', v === 'parede');
      $('lente').hidden = v !== 'lente'; $('parede').hidden = v !== 'parede';
      $('zoom').hidden = v !== 'lente';
      if (v === 'parede') $('selo').textContent = 'Foto do bar, prévia aproximada';
      $('selo').parentElement.hidden = false;
    };
    const zoom = el('button', { className: 'peq vidro', id: 'zoom', textContent: '1:1' });
    zoom.setAttribute('aria-label', 'Mudar a escala da lente');
    zoom.onclick = () => { S.zoom = S.zoom === 1 ? 2 : S.zoom === 2 ? 4 : 1; zoom.textContent = '1:' + S.zoom; medir(); vibrar(); };
    document.querySelector('.sobre').prepend(zoom);
    $('vista-lente').onclick = () => vista('lente'); $('vista-parede').onclick = () => vista('parede');
    vista('lente');

    $('cta').onclick = aoCTA;
    $('led-chip').onclick = () => {
      irLado('narrativa');
      const cap = CAP.LISTA.find(c => (c.led || []).includes(S.ledAgora));
      if (cap) { abrirCapitulo(cap.id); requestAnimationFrame(() => { const e = document.querySelector('[data-cap="' + cap.id + '"]'); if (e) e.scrollIntoView({ block: 'center' }); }); }
      else toast('Este visual do LED ainda não tem capítulo próprio');
    };
    $('voltar').href = '/celular#/andar/1'; $('voltar').innerHTML = icone('voltar');
    $('ajustes').href = '/celular#/z/' + encodeURIComponent('telas:led:1'); $('ajustes').innerHTML = icone('ajustes');
    $('desfazer').innerHTML = icone('desfazer'); $('refazer').innerHTML = icone('refazer');
    $('desfazer').onclick = () => passoHistoria(-1); $('refazer').onclick = () => passoHistoria(1);
    $('renomear').onclick = () => {
      const d = $('dlg-nome'), c = $('dlg-campo'); c.value = S.nome;
      d.onclose = () => { if (d.returnValue === 's' && c.value.trim()) { S.nome = c.value.trim(); mudou(true); } };
      d.showModal(); c.select();
    };
    window.addEventListener('resize', medir);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { ultimo = performance.now(); lerEstado(); } });
    window.addEventListener('keydown', ev => {
      if (/input|textarea/i.test(ev.target.tagName)) return;
      if (ev.key === ' ') { ev.preventDefault(); $('tocar').click(); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); passoHistoria(ev.shiftKey ? 1 : -1); }
    });
  }

  // ---------- abas ----------
  const PC = () => window.matchMedia('(min-width:1080px)').matches;
  function aplicarLado() {
    $('p-narrativa').classList.toggle('col', S.lado === 'narrativa');
    $('p-assets').classList.toggle('col', S.lado === 'assets');
  }
  function irLado(l) { S.lado = l; aplicarLado(); if (PC()) renderizar(); else irAba(l); }
  const ABAS = [['narrativa', 'narrativa', 'Narrativa'], ['assets', 'assets', 'Brand book'], ['movimento', 'movimento', 'Movimento'], ['cor', 'paleta', 'Cor'], ['camadas', 'camadas', 'Camadas']];
  function irAba(a) {
    S.aba = a;
    if (a === 'narrativa' || a === 'assets') S.lado = a;
    aplicarLado();
    document.querySelectorAll('section.aba').forEach(s => s.classList.toggle('on', s.dataset.aba === a));
    document.querySelectorAll('#abas button').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === a ? 'true' : 'false'));
    guardar('painel-estudio-aba', a);
    renderizar();
    vibrar();
  }
  function renderizar(tudo) {
    if (!S.comp) return;
    if (PC() || tudo) {
      if (S.lado === 'narrativa' || tudo) renderNarrativa();
      if (S.lado === 'assets' || tudo) renderAssets();
      renderCamadas(); renderMovimento();
      if (!PC()) renderCor($('p-cor'));
    } else {
      if (S.aba === 'narrativa') renderNarrativa();
      else if (S.aba === 'assets') renderAssets();
      else if (S.aba === 'movimento') renderMovimento();
      else if (S.aba === 'cor') renderCor($('p-cor'));
      else renderCamadas();
    }
    atualizarTopo();
  }

  // ---------- início ----------
  async function iniciar() {
    const nav = $('abas');
    for (const [v, ic, n] of ABAS) { const b = el('button', { html: icone(ic) + esc(n) }); b.dataset.aba = v; b.setAttribute('role', 'tab'); b.onclick = () => irAba(v); nav.append(b); }
    try { catalogo = await fetch('painel-estudio/catalogo-videos.json').then(r => r.json()); motor.definirCatalogo(catalogo); } catch {}
    ligarPalco();
    medir();
    await lerEstado();
    await Promise.race([lerLed(), new Promise(ok => setTimeout(ok, 900))]); // o LED não segura a abertura da tela
    const q = new URLSearchParams(location.search);
    let rasc = null; try { rasc = JSON.parse(ler('painel-estudio-rascunho')); } catch {}
    if (q.get('cap')) abrirCapitulo(q.get('cap'));
    else if (rasc && rasc.comp && rasc.comp.camadas) { S.pecaId = rasc.id; S.nome = rasc.nome; S.capitulo = rasc.capitulo; S.comp = rasc.comp; historia.lista = [JSON.stringify(S.comp)]; historia.i = 0; motor.preparar(S.comp).catch(() => {}); S.sel = (S.comp.camadas.slice().reverse().find(c => c.tipo !== 'efeito') || {}).id || null; }
    else {
      const capLed = CAP.LISTA.find(c => (c.led || []).includes(S.ledAgora));
      abrirCapitulo(capLed ? capLed.id : 'colossos');
    }
    const fontes = new FontFace('CLUBE Mythshire', 'url("painel-estudio/fontes/MythshireRegular.woff2")');
    fontes.load().then(x => document.fonts.add(x)).catch(() => {});
    irAba(q.get('aba') || ler('painel-estudio-aba') || 'narrativa');
    atualizarTudo();
    medir();
    requestAnimationFrame(quadro);
    setInterval(lerEstado, 4000);
    setInterval(lerLed, 5000);
    window.__estudio = { S, motor, abrirCapitulo, medir, checarMarca, irAba };
  }
  iniciar();
})();
