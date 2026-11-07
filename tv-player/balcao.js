// Fitas de LED (WS2814 RGBW) controladas direto por Art-Net, sem MadMapper:
// bancada do 1º andar, bancada do 5º andar e barras verticais do 5º andar.
//
// Posição das fitas: projeto do MadMapper (PROJETO CLUBE.mad). IPs e universos: tabela de
// roteamento das preferências do MadMapper ("artNetRoutingTables"), que renumera os universos
// do projeto por controladora — o registro técnico (PDF) está desatualizado nisso:
//   projeto 40..55 → 192.168.0.80 univ. 0..15   (térreo, metade esquerda)
//   projeto 60..75 → 192.168.0.78 univ. 0..15   (térreo, metade direita)
//   projeto 20..35 → 192.168.0.50 univ. 0..15   (bancada 5º andar)
//   projeto  0..15 → 192.168.0.54 univ. 0..15   (barras verticais)
// Pixel N de uma fita ocupa os canais 1+4(N-1)..4N. Bancadas: W,R,G,B (componentsMap do MadMapper:
// "WW","R","G","B"). Barras: G,R,B,W ("Channel 1..4" = tipos 1, 0, 2, 8). O W é branco QUENTE.
//
// Os movimentos usam o relógio das cenas do andar (startAt + duração do vídeo do painel),
// então as fitas fecham o loop junto com o painel de LED e as TVs.
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { criarAudio, vazio: audioVazio } = require('./audio-barras');

const FPS = 40;
const CONFIG_FILE = path.join(__dirname, 'balcao.json');

// Cada instalação é uma grade (colunas × linhas) de pixels; cada segmento diz para qual
// controladora/universo vai e quais células da grade ele percorre, na ordem dos pixels.
// "linha" do efeito: para bancadas é a fileira (0–5); para as barras é a altura (0 = embaixo).
function bancada(id, andar, nome, colunas, metades) {
  const segmentos = [];
  for (let r = 0; r < 6; r++) {
    for (const m of metades) {
      const celulas = [];
      for (let n = 0; n < m.pixels; n++) celulas.push([m.x0 + (m.inverter ? m.pixels - 1 - n : n), r]);
      segmentos.push({ ip: m.ip, universo: 2 * r, celulas });
    }
  }
  return { id, andar, nome, grupo: 'balcao', colunas, linhas: 6, segmentos, ordem: 'WRGB' };
}

const INSTALACOES = [
  // LED TERREO -1..-6 (esquerda) e -7..-12 (direita), rotação 0 → pixel 1 à esquerda.
  bancada('terreo', '1', 'Bancada do bar', 196, [
    { ip: '192.168.0.80', x0: 0, pixels: 98, inverter: false },
    { ip: '192.168.0.78', x0: 98, pixels: 98, inverter: false },
  ]),
  // led -1..-6, rotação 180° → pixel 1 à direita.
  bancada('sexto', '5', 'Bancada do bar', 86, [
    { ip: '192.168.0.50', x0: 0, pixels: 86, inverter: true },
  ]),
  // BARRA VERTICAL -1..-8, da esquerda para a direita; rotação −90° → pixel 1 embaixo.
  (() => {
    const segmentos = [];
    for (let b = 0; b < 8; b++) {
      const celulas = [];
      for (let n = 0; n < 86; n++) celulas.push([b, 85 - n]); // grade: linha 0 = topo
      segmentos.push({ ip: '192.168.0.54', universo: 2 * b, celulas });
    }
    return { id: 'barras', andar: '5', nome: 'Barras verticais', grupo: 'barras', colunas: 8, linhas: 86, vertical: true, segmentos, ordem: 'GRBW' };
  })(),
];

// ---------- cores ----------
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const PALETA = {
  vermelho: hex('#ff2a00'), verde: hex('#00b000'), azul: hex('#00a0e6'),
  branco: [255, 255, 255], preto: [0, 0, 0], laranja: hex('#ff6d00'), navy: hex('#0d1b2a'),
};
// Degradê da marca (mesmo do fundo "Com fundo"): começa e termina no azul → emenda.
const MARCA = ['#006faf', '#00a0e6', '#00bae3', '#00c44a', '#00b000', '#007000', '#ff0000', '#ff3308', '#ff7452', '#006faf'].map(hex);
const CINZAS = ['#303030', '#9d9d9d', '#e1e2e3', '#6f6f6f', '#303030'].map(hex);

const frac = v => v - Math.floor(v);
// Número "aleatório" fixo por índice (0–1): mesma sequência sempre → loops sem emenda.
const hash01 = i => frac(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
// Matiz (0–1) → RGB saturado.
function hsv(h) {
  const k = n => { const v = frac(h + n / 3) * 6; return Math.max(0, Math.min(1, Math.abs(v - 3) - 1)); };
  return [255 * k(0), 255 * k(2), 255 * k(1)];
}
const onda01 = v => 0.5 - 0.5 * Math.cos(2 * Math.PI * v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const escala = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const soma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function degrade(stops, t) {
  const p = frac(t) * (stops.length - 1), i = Math.floor(p);
  return mix(stops[i], stops[Math.min(i + 1, stops.length - 1)], p - i);
}
// "metal": prata com brilho correndo (número inteiro de voltas por ciclo → emenda).
function cor(nome, x, fase) {
  if (nome === 'metal') { const k = 0.7 + 0.3 * Math.sin(2 * Math.PI * (x * 3 - fase * 2)); return escala([225, 225, 232], k); }
  if (nome && nome[0] === '#') return hex(nome);
  return PALETA[nome] || PALETA.branco;
}

// ---------- formas ----------
// u = posição em "unidades de item"; como u = x·k + fase·n, a figura anda para a esquerda
// (igual ao painel) e no fim do ciclo andou exatamente n itens → loop sem emenda.
const cometa = l => (l < 0.2 ? 0 : l < 0.26 ? (l - 0.2) / 0.06 : Math.exp(-(l - 0.26) * 5));
const faixa = l => { const d = Math.abs(l - 0.5) / 0.22; return d >= 1 ? 0 : Math.pow(Math.cos(d * Math.PI / 2), 2); };
const DIAGONAL = 0.07; // cada linha um pouco atrasada → movimento sequencial em diagonal

// Som do quadro atual, para as cenas de áudio. O motor atualiza a cada quadro.
let AU = audioVazio();
// Um efeito devolve a cor [r,g,b] (0–255) do pixel (x: 0–1, linha) na fase (0–1) do ciclo.
const EFEITOS = {
  preto: () => [0, 0, 0],
  cometas: (p, x, r, fase) => { // p.cores: um cometa por cor, 2 visíveis na bancada
    const n = p.cores.length, u = x * 2 + fase * n + r * DIAGONAL;
    return escala(cor(p.cores[((Math.floor(u) % n) + n) % n], x, fase), cometa(frac(u)));
  },
  faixas: (p, x, r, fase) => { // p.n faixas por ciclo, p.k visíveis, sobre p.fundo
    const u = x * p.k + fase * p.n + r * DIAGONAL;
    const base = p.fundo ? cor(p.fundo, x, fase) : [0, 0, 0];
    return mix(base, cor(p.cor || 'metal', x, fase), faixa(frac(u)) * (p.intensidade ?? 1));
  },
  degrade: (p, x, r, fase) => { // degradê da marca andando 1 largura por ciclo (+ faixas prata)
    const base = escala(degrade(p.cinza ? CINZAS : MARCA, x + fase + r * 0.02), p.cinza ? 0.8 : 1);
    if (!p.n) return base;
    const u = x * p.k + fase * p.n + r * DIAGONAL;
    return mix(base, cor('metal', x, fase), faixa(frac(u)) * 0.8);
  },
  mensagens: (p, x, r, fase) => { // p.n mensagens: cor sai do centro, segura e apaga (igual ao painel)
    const t = frac(fase * p.n);
    const abre = Math.min(1, t / 0.12), fecha = t > 0.93 ? 1 - (t - 0.93) / 0.07 : 1;
    const dentro = Math.abs(x - 0.5) * 2 <= abre * 0.7 ? 1 : 0; // abre até 70% da largura
    return mix(escala(PALETA.navy, 1), cor(p.cor || 'laranja', x, fase), dentro * fecha);
  },
  // Cor fixa escolhida no celular. "Filamento" e afins são tons quentes de lâmpada incandescente.
  solido: p => hex(p.cor),

  // ---- animações dos balcões (x: 0–1 ao longo da bancada, r: fileira) ----
  // Todas andam um número inteiro de voltas por ciclo (p.n) → loop sem emenda.
  arcoiris: (p, x, r, fase) => hsv(x * (p.k || 1) + fase * (p.n || 1) + r * 0.03),
  onda: (p, x, r, fase) => escala(cor(p.cor || 'azul', x, fase), 0.08 + 0.92 * Math.pow(onda01(x * (p.k || 2) - fase * (p.n || 3) + r * 0.08), 2)),
  brilhos: (p, x, r, fase, h, i) => {
    const base = escala(cor(p.cor || 'branco', x, fase), 0.06);
    const k = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (fase * (p.n || 4) + hash01(i)))), 14);
    return mix(base, cor(p.cor || 'branco', x, fase), k);
  },
  scanner: (p, x, r, fase) => { // ponto que vai e volta, com rastro
    const t = frac(fase * (p.n || 2)), pos = t < 0.5 ? t * 2 : 2 - t * 2;
    const d = Math.abs(x - pos);
    return escala(cor(p.cor || 'vermelho', x, fase), Math.exp(-d * 28) + 0.04);
  },
  pulsoCentro: (p, x, r, fase) => { // anéis saindo do centro para as pontas
    const d = Math.abs(x - 0.5) * 2;
    return mix([0, 0, 0], cor(p.cor || 'metal', x, fase), faixa(frac(d * (p.k || 2) - fase * (p.n || 4))));
  },

  // ---- animações das barras (x: posição da barra, h: altura 0 embaixo → 1 em cima) ----
  subir: (p, x, r, fase, h) => { // cada barra enche de baixo para cima, em sequência
    const b = Math.floor(x * 8), t = frac(fase * (p.n || 2) - b / 8);
    if (h > t) return [0, 0, 0];
    return escala(cor(p.cor || 'azul', x, fase), h > t - 0.06 ? 1 : 0.35);
  },
  chuva: (p, x, r, fase, h) => { // gotas caindo em cada barra
    const b = Math.floor(x * 8);
    const cabeca = 1 - frac(fase * (p.n || 3) + hash01(b + 1));
    const d = h - cabeca; // rastro acima da gota
    if (d < 0 || d > 0.35) return escala(cor(p.cor || 'azul', x, fase), 0.03);
    return escala(cor(p.cor || 'azul', x, fase), 1 - d / 0.35);
  },
  equalizador: (p, x, r, fase, h) => { // barras subindo e descendo como um VU
    const b = Math.floor(x * 8);
    const nivel = 0.15 + 0.85 * (0.55 * onda01(fase * 3 + hash01(b) ) + 0.45 * onda01(fase * 5 + hash01(b + 9)));
    if (h > nivel) return [0, 0, 0];
    return h < 0.55 ? mix(hex('#00c44a'), hex('#ffd000'), h / 0.55) : mix(hex('#ffd000'), hex('#ff2a00'), (h - 0.55) / 0.45);
  },
  passagem: (p, x, r, fase) => { // a luz passa de barra em barra
    const b = Math.floor(x * 8), ativa = Math.floor(frac(fase * (p.n || 2)) * 8);
    const dist = Math.min(Math.abs(b - ativa), 8 - Math.abs(b - ativa));
    return escala(cor(p.cor || 'metal', x, fase), dist === 0 ? 1 : dist === 1 ? 0.18 : 0.02);
  },
  arcoirisVertical: (p, x, r, fase, h) => hsv(h * (p.k || 1) + fase * (p.n || 1) + x * 0.25),
  cometaSobe: (p, x, r, fase, h) => { // cometas subindo, cada barra defasada
    const b = Math.floor(x * 8);
    const u = h * (p.k || 1.5) - fase * (p.n || 3) - b * 0.125;
    return escala(cor(p.cor || 'metal', x, fase), cometa(1 - frac(u)));
  },

  // ---- CALMAS (loops longos; fase = 0→1 em 40 s a 2 min) ----
  mare: (p, x, r, fase) => { // degradê de tons andando bem devagar, com uma respiração suave
    const cores = (p.cores || ['#1a0c00', '#ff7a1a', '#ffc465', '#ff3308', '#1a0c00']).map(hex);
    return escala(degrade(cores, x * 0.5 + fase + r * 0.02), 0.55 + 0.45 * onda01(x + fase * 2));
  },
  aurora: (p, x, r, fase) => { // véus de verde-azulado a roxo ondulando
    const matiz = 0.42 + 0.33 * onda01(x * 0.7 + fase + r * 0.05);
    const luz = 0.25 + 0.75 * onda01(x * 2 - fase * 3 + 0.25 * Math.sin(2 * Math.PI * (fase + x)));
    return escala(hsv(matiz), luz);
  },
  brasa: (p, x, r, fase, h, i) => { // brasa quente tremulando devagar
    const k = 0.3 + 0.7 * onda01(fase * 7 + hash01(i)) * (0.6 + 0.4 * onda01(fase * 3 + hash01(i + 5)));
    return escala(hex(p.cor || '#ff7a1a'), k);
  },
  constelacao: (p, x, r, fase, h, i) => { // poucos pontos acendendo e apagando devagar
    if (hash01(i * 1.7) < (p.densidade ? 1 - p.densidade : 0.86)) return escala(hex(p.fundo || '#0a0604'), 1);
    const k = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (fase * (p.n || 5) + hash01(i * 3)))), 4);
    return mix(hex(p.fundo || '#0a0604'), hex(p.cor || '#ffd6a1'), k);
  },
  marcaLenta: (p, x, r, fase) => { // cores da marca se misturando, uma onda leve atravessando
    const seq = ['#006faf', '#00c44a', '#ff3308', '#ffc465', '#006faf'].map(hex);
    return escala(degrade(seq, fase + x * 0.15), 0.6 + 0.4 * onda01(x * 1.5 - fase * 4));
  },
  mareVertical: (p, x, r, fase, h) => {
    const cores = (p.cores || ['#1a0c00', '#ff7a1a', '#ffc465', '#ff3308', '#1a0c00']).map(hex);
    return escala(degrade(cores, h * 0.5 + fase + x * 0.1), 0.55 + 0.45 * onda01(h + fase * 2));
  },
  vela: (p, x, r, fase, h) => { // chama quente em cada barra, mais forte embaixo, tremulando
    const b = Math.floor(x * 8);
    const tremor = 0.7 + 0.3 * onda01(fase * 9 + hash01(b)) * onda01(fase * 4 + hash01(b + 3));
    return escala(mix(hex('#ff7a1a'), hex('#ffc465'), h), Math.pow(1 - h, 0.7) * tremor);
  },
  respiraAlternado: (p, x, r, fase) => { // barras pares e ímpares respirando alternadas
    const b = Math.floor(x * 8);
    return escala(cor(p.cor || '#ffc465', x, fase), 0.12 + 0.88 * onda01(fase * (p.n || 4) + (b % 2) * 0.5));
  },

  // ---- PISTA (na batida: p.B = batidas por ciclo; bat = batida atual, bf = 0→1 dentro dela) ----
  flashBeat: (p, x, r, fase) => {
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    const cores = p.cores || ['branco'];
    return escala(cor(cores[bat % cores.length], x, fase), Math.exp(-bf * 6));
  },
  chaseBeat: (p, x, r, fase) => { // a bancada em segmentos: um segmento por batida
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B), seg = p.seg || 4;
    const ativo = p.vaivem ? (Math.floor(bat / (seg - 1)) % 2 ? seg - 1 - bat % (seg - 1) : bat % (seg - 1)) : bat % seg;
    if (Math.floor(x * seg) !== ativo) return [0, 0, 0];
    return escala(cor(p.cor || 'metal', x, fase), 0.25 + 0.75 * Math.exp(-bf * 3));
  },
  metadeBeat: (p, x, r, fase) => {
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    if ((x < 0.5) !== (bat % 2 === 0)) return [0, 0, 0];
    const cores = p.cores || ['vermelho', 'azul'];
    return escala(cor(cores[bat % cores.length], x, fase), 0.2 + 0.8 * Math.exp(-bf * 4));
  },
  arcoirisBeat: (p, x, r, fase) => {
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    return escala(hsv(frac(bat * 0.618) + x * 0.15), 0.35 + 0.65 * Math.exp(-bf * 4));
  },
  scannerBeat: (p, x, r, fase) => { // vai numa batida, volta na outra
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    const pos = bat % 2 ? 1 - bf : bf;
    return escala(cor(p.cor || 'vermelho', x, fase), Math.exp(-Math.abs(x - pos) * 22) + 0.03);
  },
  bateEstaca: (p, x, r, fase, h) => { // barras inteiras batendo juntas
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    const cores = p.cores || ['branco', 'vermelho'];
    return escala(cor(cores[bat % cores.length], x, fase), Math.exp(-bf * 5) * (0.5 + 0.5 * (1 - h * bf)));
  },
  barraPorBatida: (p, x, r, fase) => {
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B), b = Math.floor(x * 8);
    const atras = (bat - b + 8 * 100) % 8; // 0 = barra da batida atual, 1 = a anterior...
    if (atras > 2) return [0, 0, 0];
    return escala(cor(p.cor || 'metal', x, fase), (atras === 0 ? 1 : atras === 1 ? 0.3 : 0.08) * (0.5 + 0.5 * Math.exp(-bf * 3)));
  },
  subidaBeat: (p, x, r, fase, h) => { // todas sobem juntas a cada batida
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B);
    if (h > Math.min(1, bf * 1.4)) return [0, 0, 0];
    return hsv(frac(bat * 0.618));
  },
  equalizadorBeat: (p, x, r, fase, h) => { // níveis sorteados a cada batida, caindo até a próxima
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B), b = Math.floor(x * 8);
    const nivel = (0.25 + 0.75 * hash01(bat * 8 + b + 1)) * (1 - 0.6 * bf);
    if (h > nivel) return [0, 0, 0];
    return h < 0.55 ? mix(hex('#00c44a'), hex('#ffd000'), h / 0.55) : mix(hex('#ffd000'), hex('#ff2a00'), (h - 0.55) / 0.45);
  },
  alternadoBeat: (p, x, r, fase) => {
    const bat = Math.floor(fase * p.B), bf = frac(fase * p.B), b = Math.floor(x * 8);
    if (b % 2 !== bat % 2) return [0, 0, 0];
    return escala(cor(p.cor || 'metal', x, fase), 0.2 + 0.8 * Math.exp(-bf * 4));
  },

  // Cor escolhida "respirando" (aba Cores com Respirar ligado).
  respirarCor: (p, x, r, fase) => escala(hex(p.cor), 0.35 + 0.65 * onda01(fase)),
  // Cor "respirando" devagar entre ~55% e 100% (1 respiração por ciclo → loop sem emenda).
  respirar: (p, x, r, fase) => escala(hex(p.cor), 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(2 * Math.PI * fase))),
  logoCor: (p, x, r, fase) => { // modo "logo + cor": fundo escolhido + faixa na cor do logo
    const u = x * 3 + fase + r * DIAGONAL;
    return mix(hex(p.fundo), cor(p.logo === 'metal' ? 'metal' : p.logo, x, fase), faixa(frac(u)) * 0.9);
  },
};

// Duração de um ciclo (s) com o ritmo da zona:
//   animações de pista (c.batidas) → batidas × 60 / BPM (entram na batida da música);
//   as demais → duração / velocidade.
// Vídeo nas fitas: os quadros já reduzidos para a grade da bancada ficam em fitas-video/<nome>.rgb
// (RGB 8 bits, um quadro atrás do outro) + <nome>.json { largura, altura, quadros, fps }.
// Cada pixel pega a célula correspondente do quadro do momento (fase = posição no loop).
const VIDEOS_DIR = path.join(__dirname, 'fitas-video');
const videos = new Map();
function videoFita(nome) {
  if (!videos.has(nome)) {
    let v = null;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(VIDEOS_DIR, nome + '.json'), 'utf8'));
      v = { ...meta, dados: fs.readFileSync(path.join(VIDEOS_DIR, nome + '.rgb')) };
    } catch {}
    videos.set(nome, v);
  }
  return videos.get(nome);
}
EFEITOS.video = (p, x, r, fase, h) => {
  const v = videoFita(p.video);
  if (!v) return [0, 0, 0];
  const q = Math.min(v.quadros - 1, Math.floor(fase * v.quadros));
  const col = Math.min(v.largura - 1, Math.floor(x * v.largura));
  const lin = Math.min(v.altura - 1, Math.round(h * (v.altura - 1))); // fileira de cima = topo do vídeo
  const o = ((q * v.altura + lin) * v.largura + col) * 3;
  return [v.dados[o], v.dados[o + 1], v.dados[o + 2]];
};

// Animações de áudio: ficam em efeitos-audio.js e são relidas quando o arquivo muda, sem reiniciar o servidor.
// Se o arquivo novo tiver erro, as anteriores continuam valendo.
const ARQS_EFEITOS = ['efeitos-audio.js', 'efeitos-criador.js'].map(a => path.join(__dirname, a));
const efeitosEm = new Map();
function carregarEfeitosAudio() {
  for (const arq of ARQS_EFEITOS) {
    try {
      const m = fs.statSync(arq).mtimeMs;
      if (m === efeitosEm.get(arq)) continue;
      efeitosEm.set(arq, m);
      delete require.cache[require.resolve(arq)];
      const novos = require(arq)({ au: () => AU, cor, hex, mix, escala, degrade, frac, hash01, onda01, MARCA, efeitos: EFEITOS });
      Object.assign(EFEITOS, novos);
      console.log('Áudio das barras: ' + Object.keys(novos).length + ' animações carregadas de ' + path.basename(arq));
    } catch (e) {
      console.log('Áudio das barras: mantive as animações anteriores de ' + path.basename(arq) + ' (' + e.message + ')');
    }
  }
}
carregarEfeitosAudio();
setInterval(carregarEfeitosAudio, 3000).unref();

function duracaoDoCiclo(c, ritmo) {
  if (c.batidas) return c.batidas * 60 / (ritmo.bpm || 120);
  return (c.duracao || 15) / (ritmo.velocidade || 1);
}

// Efeito do momento para o que está ativo na zona (cena + startAt, cor ou modo logo).
// ritmo = { velocidade, bpm } da zona.
function efeitoDe(ativo, agora, ritmo = {}) {
  if (!ativo) return { fn: EFEITOS.preto };
  if (ativo.tipo === 'ambiente') return { fn: ativo.pintar }; // programação circadiana (programacao.js)
  const vel = ritmo.velocidade || 1;
  const t = (agora - ativo.startAt) / 1000;
  if (ativo.tipo === 'cor') return ativo.respirar
    ? { fn: EFEITOS.respirarCor, p: ativo, fase: frac(t * vel / 6) }
    : { fn: EFEITOS.solido, p: ativo };
  if (t < 0) return { fn: EFEITOS.preto };
  if (ativo.tipo === 'logo') {
    // período de um logo no painel (mesma velocidade do player: 200 px/s)
    const periodo = ativo.marca === 'noalto' ? (80 * 1835 / 1001 + 420) / 200 : (60 * 2200 / 539 + 500) / 200;
    return { fn: EFEITOS.logoCor, p: ativo, fase: frac(t * vel / periodo) };
  }
  const c = ativo.cena;
  if (!c || c.apagar || !c.balcao) return { fn: EFEITOS.preto };
  const dur = duracaoDoCiclo(c, ritmo);
  let tc = t % dur;
  // "Sequência": as partes em ordem, cada uma com o próprio ciclo.
  if (c.balcao.partes) {
    for (const parte of c.balcao.partes) {
      const d = parte.duracao / vel;
      if (tc < d) return { fn: EFEITOS[parte.efeito] || EFEITOS.preto, p: parte, fase: tc / d };
      tc -= d;
    }
    return { fn: EFEITOS.preto };
  }
  // p.B = batidas por ciclo (usado pelas animações de pista)
  return { fn: EFEITOS[c.balcao.efeito] || EFEITOS.preto, p: { ...c.balcao, B: c.batidas || 4 }, fase: tc / dur };
}

// Coordenadas do efeito para uma célula da grade: x (0–1, esquerda→direita) e "linha".
// Nas barras, a "linha" é a altura (0 embaixo … ~6 no topo): o atraso por linha dos efeitos
// vira um movimento que sobe/desce pelas barras.
// Também devolve h (altura 0–1: nas barras 0 = embaixo; nas bancadas, a fileira) e i (índice do pixel).
function coordenadas(inst, col, lin) {
  const i = lin * inst.colunas + col;
  if (inst.vertical) { const h = 1 - (lin + 0.5) / inst.linhas; return [(col + 0.5) / inst.colunas, h * 6, h, i]; }
  return [(col + 0.5) / inst.colunas, lin, lin / Math.max(1, inst.linhas - 1), i];
}

// Quadro RGB (0–255) de uma instalação para o que está ativo, num instante (testes/prévias).
function quadroDe(ativo, agora, inst = INSTALACOES[0], ritmo = {}) {
  if (ritmo.audio) AU = ritmo.audio; // miniaturas: som simulado
  const { fn, p, fase = 0 } = efeitoDe(ativo, agora, ritmo);
  const out = [];
  for (let r = 0; r < inst.linhas; r++) for (let x = 0; x < inst.colunas; x++) {
    const [cx, cr, ch, ci] = coordenadas(inst, x, r);
    out.push(fn(p || {}, cx, cr, fase, ch, ci));
  }
  return out;
}

// Filtro de cor da zona ({ opacidade, r, g, b } em 0–100; ausente = 100) → multiplicadores R, G, B.
function fatoresDoFiltro(fl) {
  if (!fl) return [1, 1, 1];
  const v = x => { const n = x == null ? 100 : +x; return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 100)) / 100; };
  const op = v(fl.opacidade);
  return [op * v(fl.r), op * v(fl.g), op * v(fl.b)];
}

const CORES_TESTE = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [255, 128, 0]];

function criarBalcao({ estado, brilho, flash, corFlash }) {
  // balcao.json: saída ligada/desligada por instalação.
  let config = {};
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  if (!config.saidas) config.saidas = { terreo: !!config.saida }; // formato antigo: só o térreo
  // Trava de potência por instalação (fração do máximo). A fonte da bancada do térreo não
  // aguenta 100%: ali nada passa de 60% — nem cena, nem cor fixa, nem dimmer em 100%.
  config.limites = { terreo: 0.6, sexto: 1, barras: 1, ...(config.limites || {}) };
  // Andares controlados por outro programa (ex.: { "5": "MadMapper" }): o motor não manda NADA
  // para as controladoras desses andares — nem quadro preto —, para não brigar com ele.
  config.externos = { ...(config.externos || {}) };
  const externo = i => !!config.externos[i.andar];
  delete config.saida; delete config.controladoras;
  const salvarConfig = () => fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), () => {});
  salvarConfig();

  // Envia a partir de 192.168.0.10:6454, como o MadMapper (algumas controladoras filtram a
  // porta de origem). Se a porta estiver ocupada (MadMapper aberto), usa uma porta qualquer.
  let sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.once('error', e => {
    console.error('Art-Net: porta 6454 indisponível (' + e.message + '), enviando de porta aleatória');
    try { sock.close(); } catch {}
    sock = dgram.createSocket('udp4');
    sock.on('error', e2 => console.error('Art-Net:', e2.message));
  });
  sock.bind(6454, '192.168.0.10', () => console.log('Art-Net: enviando de 192.168.0.10:6454'));

  const inst = INSTALACOES.map(i => ({
    ...i,
    ips: [...new Set(i.segmentos.map(s => s.ip))],
    quadro: new Float32Array(i.linhas * i.colunas * 3),
    teste: null, // { inicio } quando o teste de direção está rodando
  }));

  // Controladoras respondendo? (ping do Windows)
  const online = {};
  function verificar() {
    for (const ip of new Set(inst.flatMap(i => i.ips))) {
      execFile('ping', ['-n', '1', '-w', '600', ip], { windowsHide: true }, (err, out) => { online[ip] = /TTL=/i.test(out || ''); });
    }
  }
  verificar(); setInterval(verificar, 10000);

  function desenhar(i, agora) {
    const q = i.quadro;
    if (i.teste) {
      // Teste de direção: em cada fita um pixel anda do pixel 1 até o último (12 s por volta),
      // cada fileira/barra numa cor; o pixel 1 de cada fita pisca em cinza.
      const t = (agora - i.teste.inicio) / 1000;
      if (t > 60) i.teste = null;
      q.fill(0);
      const pisca = Math.floor(t * 2) % 2 === 0;
      i.segmentos.forEach((s, k) => {
        const cor = CORES_TESTE[(i.vertical ? k : s.celulas[0][1]) % CORES_TESTE.length];
        const pos = Math.floor(frac(t / 12) * s.celulas.length);
        s.celulas.forEach(([x, r], n) => {
          const c = n === pos ? cor : n === 0 && pisca ? [80, 80, 80] : null;
          if (c) { const o = (r * i.colunas + x) * 3; q[o] = c[0]; q[o + 1] = c[1]; q[o + 2] = c[2]; }
        });
      });
      return;
    }
    const z = estado(i.id);
    const { fn, p, fase = 0 } = efeitoDe(z.ativo, agora, { velocidade: z.velocidade || 1, bpm: z.bpm || 120 });
    const k = brilho(i.andar, i.grupo);
    // "Cor da saída" da zona (como o Group Settings do MadMapper): opacidade × R/G/B, 0–100 cada,
    // por cima de qualquer cena/cor/logo. O teste de direção não passa por aqui.
    const [kr, kg, kb] = fatoresDoFiltro(z.filtro).map(f => f * k);
    for (let r = 0; r < i.linhas; r++) for (let x = 0; x < i.colunas; x++) {
      const [cx, cr, ch, ci] = coordenadas(i, x, r);
      const c = fn(p || {}, cx, cr, fase, ch, ci);
      const o = (r * i.colunas + x) * 3;
      q[o] = c[0] * kr; q[o + 1] = c[1] * kg; q[o + 2] = c[2] * kb;
    }
    // Botão de flash do app (luz-show.js): por cima de qualquer cena, sem passar pelo dimmer. A trava de potência continua valendo no envio.
    const nivelFlash = flash ? flash(i.id, agora) : 0;
    if (nivelFlash < 0) q.fill(0);
    else if (nivelFlash > 0) { const c = corFlash ? corFlash() : [255, 255, 255]; for (let o = 0; o < q.length; o++) q[o] += (c[o % 3] - q[o]) * nivelFlash; }
  }

  // ArtDmx (OpCode 0x5000) para um universo.
  let seq = 1;
  function pacote(universo, dados) {
    const cab = Buffer.alloc(18);
    cab.write('Art-Net\0', 0, 'ascii');
    cab.writeUInt16LE(0x5000, 8);
    cab.writeUInt16BE(14, 10); // versão do protocolo
    cab[12] = seq; cab[13] = 0;
    cab[14] = universo & 0xff; cab[15] = (universo >> 8) & 0x7f;
    cab.writeUInt16BE(dados.length, 16);
    return Buffer.concat([cab, dados]);
  }

  const gama = v => Math.round(255 * Math.pow(Math.max(0, Math.min(255, v)) / 255, 2.0));

  // RGB → RGBW com LED branco QUENTE: a parte da cor que "cabe" no tom do WW
  // (~ R 1 · G 0,7 · B 0,4, uma lâmpada ~2700 K) vai para o W; o resto fica no RGB.
  // Tons de filamento/âmbar saem quase só no W, com luz quente de verdade.
  const WW = [1, 0.7, 0.4];
  function rgbParaRgbw(r, g, b) {
    const w = Math.min(255, r / WW[0], g / WW[1], b / WW[2]);
    return [
      Math.round(r - w * WW[0]), Math.round(g - w * WW[1]), Math.round(b - w * WW[2]), Math.round(w),
    ].map(x => Math.max(0, Math.min(255, x)));
  }

  function enviar(i) {
    const q = i.quadro;
    const limite = Math.max(0, Math.min(1, config.limites[i.id] ?? 1));
    for (const s of i.segmentos) {
      const dados = Buffer.alloc(s.celulas.length * 4);
      s.celulas.forEach(([x, r], n) => {
        const o = (r * i.colunas + x) * 3;
        const v = rgbParaRgbw(gama(q[o]), gama(q[o + 1]), gama(q[o + 2]));
        for (let c = 0; c < 4; c++) dados[n * 4 + c] = Math.floor(v['RGBW'.indexOf(i.ordem[c])] * limite);
      });
      sock.send(pacote(s.universo, dados), 6454, s.ip);
    }
    // ArtSync (OpCode 0x5200) no fim do quadro, como o MadMapper fazia (artNetOutputSynchro).
    const sync = Buffer.alloc(14);
    sync.write('Art-Net\0', 0, 'ascii'); sync.writeUInt16LE(0x5200, 8); sync.writeUInt16BE(14, 10);
    for (const ip of i.ips) sock.send(sync, 6454, ip);
  }

  const audio = criarAudio();

  const ouvintes = new Set(); // funções que recebem as prévias
  const rascunhos = new Map(); // quem está criando → { cena, enviar }
  let n = 0, nRascunho = 0;
  setInterval(() => {
    const agora = Date.now();
    AU = audio.ler(agora);
    seq = seq >= 255 ? 1 : seq + 1;
    for (const i of inst) {
      if (externo(i)) continue;
      desenhar(i, agora);
      if (config.saidas[i.id]) enviar(i);
    }
    // Prévia para o celular (~13 quadros/s): RGB 8 bits em base64, por instalação.
    if (ouvintes.size && n++ % 3 === 0) {
      for (const i of inst) {
        if (externo(i)) desenhar(i, agora); // prévia continua no app, mas nada sai para as fitas
        const px = Buffer.alloc(i.quadro.length);
        for (let k = 0; k < px.length; k++) px[k] = Math.max(0, Math.min(255, Math.round(i.quadro[k])));
        const msg = { type: 'balcao-previa', id: i.id, andar: i.andar, linhas: i.linhas, colunas: i.colunas, px: px.toString('base64') };
        for (const f of ouvintes) f(msg);
      }
    }
    if (rascunhos.size && nRascunho++ % 3 === 0) {
      // Sem a Cor da saída: a prévia mostra a criação como ela é. A tela avisa se a saída estiver alterada.
      // Um erro aqui nunca pode derrubar o servidor nem as luzes.
      try {
        const b = achar('barras'), z = estado('barras');
        for (const r of rascunhos.values()) {
          const { fn, p, fase = 0 } = efeitoDe({ tipo: 'cena', cena: r.cena, startAt: 0 }, agora, { velocidade: 1, bpm: z.bpm || 120 });
          const px = Buffer.alloc(b.linhas * b.colunas * 3);
          for (let l = 0; l < b.linhas; l++) for (let x = 0; x < b.colunas; x++) {
            const [cx, cr, ch, ci] = coordenadas(b, x, l);
            const c = fn(p || {}, cx, cr, fase, ch, ci), o = (l * b.colunas + x) * 3;
            px[o] = Math.max(0, Math.min(255, Math.round(c[0])));
            px[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
            px[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
          }
          r.enviar({ type: 'rascunho-previa', linhas: b.linhas, colunas: b.colunas, px: px.toString('base64') });
        }
      } catch (e) { console.log('prévia do criador:', e.message); }
    }
  }, 1000 / FPS);

  const achar = id => inst.find(i => i.id === id);
  return {
    audio,
    externos: () => ({ ...config.externos }),
    // Passa um andar para outro programa (texto = nome dele) ou de volta para o app (null).
    definirExterno(andar, nome) {
      // Ao entregar, apaga uma vez: a controladora segura o último quadro recebido e, se o outro
      // programa não mandar nada, a última cena do app ficaria presa acesa. Se ele estiver mandando,
      // o preto dura um quadro só.
      if (nome) this.apagarAndar(andar);
      if (nome) config.externos[andar] = String(nome).slice(0, 60); else delete config.externos[andar];
      salvarConfig();
    },
    // Um quadro preto nas fitas do andar (tira luz presa), mesmo com o andar em outro programa.
    apagarAndar(andar) {
      for (const i of inst.filter(i => i.andar === andar)) { i.quadro.fill(0); enviar(i); }
    },
    status: () => inst.map(i => ({
      externo: config.externos[i.andar] || null,
      id: i.id, andar: i.andar, nome: i.nome, vertical: !!i.vertical, grupo: i.grupo,
      limite: config.limites[i.id],
      saida: !!config.saidas[i.id], teste: !!i.teste,
      controladoras: Object.fromEntries(i.ips.map(ip => [ip, !!online[ip]])),
    })),
    ligarSaida(id, v) {
      const i = achar(id); if (!i || externo(i)) return;
      // Ao desligar, manda um quadro preto antes: as controladoras seguram o último quadro recebido.
      if (config.saidas[id] && !v) { i.quadro.fill(0); enviar(i); }
      config.saidas[id] = !!v; salvarConfig();
    },
    testar(id, v) { const i = achar(id); if (i && !externo(i)) i.teste = v ? { inicio: Date.now() } : null; },
    ouvir(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    temEfeito: nome => typeof EFEITOS[nome] === 'function',
    // Liga, troca ou (cena nula) encerra a prévia de quem está criando.
    rascunho(cliente, balcaoDaCena, enviar) {
      if (!balcaoDaCena) { rascunhos.delete(cliente); return; }
      rascunhos.set(cliente, { cena: { id: 'rascunho', duracao: 8, balcao: { ...balcaoDaCena, rascunho: true } }, enviar });
    },
  };
}

module.exports = { criarBalcao, quadroDe, duracaoDoCiclo, fatoresDoFiltro, INSTALACOES, VIDEOS_DIR, esquecerVideo: nome => videos.delete(nome) };
