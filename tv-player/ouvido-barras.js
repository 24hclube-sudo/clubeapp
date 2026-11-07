// Ouvido das barras do 5º: escuta a entrada de som do PC, separa em faixas e manda para o servidor.
//
// Roda à parte, na sessão do usuário: o servidor sobe na sessão 0, onde não dá para contar com a
// entrada de áudio. Se este processo cair, as luzes seguem normais e as cenas de áudio ficam em espera.
//
// ffmpeg (dshow) → PCM 44,1 kHz mono → banco de filtros → UDP 127.0.0.1:6470, 100 vezes por segundo.
// Filtros em vez de FFT: respondem em poucos ms, sem esperar uma janela encher.
//
// Uso: node ouvido-barras.js              entrada escolhida em ouvido-barras.json
//      node ouvido-barras.js --arquivo x  toca um arquivo em tempo real (para testar sem a pista)
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// O ffmpeg do Remotion não tem dshow; o do ViPlex tem.
const FFMPEG = 'C:\\Program Files (x86)\\Nova Star\\ViPlex Express\\Bin\\VideoConverter\\ffmpeg.exe';
const ENTRADAS = {
  mic: 'Microfone (Realtek High Definition Audio)',
  mix: 'Mixagem estéreo (Realtek High Definition Audio)',
};
const CONFIG = path.join(__dirname, 'ouvido-barras.json');
const PORTA = Number(process.env.AUDIO_PORTA) || 6470;
const SR = 44100, BLOCO = 441, DT = BLOCO / SR; // um bloco = 10 ms

const iArquivo = process.argv.indexOf('--arquivo');
const arquivo = iArquivo > 0 ? process.argv[iArquivo + 1] : null;

let config = { entrada: 'mic' };
try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^\uFEFF/, '')) }; } catch {}

// ---------- filtros ----------
function passaFaixa(lo, hi) {
  const f0 = Math.sqrt(lo * hi), Q = f0 / (hi - lo);
  const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
  return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, z1: 0, z2: 0, soma: 0 };
}
// As 4 faixas de trabalho. "solta" é o tempo de queda do nível, em segundos; "minimo", o menor intervalo entre golpes.
const FAIXAS = [
  { nome: 'bumbo', lo: 35, hi: 110, solta: 0.13, minimo: 0.22 },
  { nome: 'baixo', lo: 110, hi: 400, solta: 0.16, minimo: 0.15 },
  { nome: 'medio', lo: 400, hi: 3000, solta: 0.14, minimo: 0.12 },
  { nome: 'agudo', lo: 3000, hi: 14000, solta: 0.08, minimo: 0.07 },
].map(f => ({ ...f, filtro: passaFaixa(f.lo, f.hi) }));
// As 8 bandas do espectro, uma para cada barra.
const BANDAS = [];
for (let i = 0; i < 8; i++) {
  const lo = 35 * Math.pow(400, i / 8), hi = 35 * Math.pow(400, (i + 1) / 8);
  BANDAS.push({ lo, hi, solta: 0.12, filtro: passaFaixa(lo, hi) });
}
const TODAS = [...FAIXAS, ...BANDAS];
for (const c of TODAS) Object.assign(c, { pico: 1e-4, piso: 1e-4, nivel: 0 });
for (const f of FAIXAS) Object.assign(f, { hist: new Float32Array(150), iHist: 0, antes: new Float32Array(3), iAntes: 0, ultimo: 0, golpes: 0 });

// Abaixo disto (uns -60 dBFS) é silêncio: o ganho automático não pode transformar chiado em batida.
const PORTAO = 0.001;

// ---------- batida ----------
// Mesma votação do gerador.html: os intervalos entre bumbos votam num BPM entre 85 e 170.
const B = { onsets: [], acertos: [], bpm: 0, fase: 0, conf: 0, candidato: 0, insiste: 0 };
function estimarBpm() {
  const t = B.onsets;
  if (t.length < 6) return;
  const votos = new Float32Array(171);
  for (let i = 1; i < t.length; i++) for (let j = i - 1; j >= 0; j--) {
    const s = t[i] - t[j];
    if (s > 2.1) break;
    if (s < 0.3) continue;
    let b = 60 / s;
    while (b < 85) b *= 2;
    while (b > 170) b /= 2;
    const peso = 1 / (i - j) * (0.5 + 0.5 * i / t.length);
    for (let k = Math.max(85, Math.floor(b) - 3); k <= Math.min(170, Math.ceil(b) + 3); k++) votos[k] += peso * Math.exp(-((k - b) ** 2) / 2);
  }
  let pico = 85;
  for (let k = 85; k <= 170; k++) if (votos[k] > votos[pico]) pico = k;
  if (!votos[pico]) return;
  let soma = 0, peso = 0;
  for (let k = Math.max(85, pico - 2); k <= Math.min(170, pico + 2); k++) { soma += k * votos[k]; peso += votos[k]; }
  const melhor = soma / peso;
  if (!B.bpm) { B.bpm = melhor; B.fase = 0; return; }
  // mudança pequena: acompanha aos poucos; grande (troca de música): só depois de 4 bumbos seguidos
  if (Math.abs(melhor - B.bpm) < 3) B.bpm += (melhor - B.bpm) * 0.2;
  else if (Math.abs(melhor - B.candidato) < 2 && ++B.insiste >= 4) { B.bpm = melhor; B.insiste = 0; }
  else if (Math.abs(melhor - B.candidato) >= 2) { B.candidato = melhor; B.insiste = 1; }
}
function bumbo(agora) {
  B.onsets.push(agora); if (B.onsets.length > 24) B.onsets.shift();
  estimarBpm();
  if (!B.bpm) return;
  const erro = B.fase - Math.round(B.fase);
  B.acertos.push(Math.abs(erro) < 0.15); if (B.acertos.length > 16) B.acertos.shift();
  B.conf = B.acertos.filter(Boolean).length / B.acertos.length;
  if (Math.abs(erro) < 0.3) B.fase -= erro * 0.35;           // puxa a batida para o bumbo
  else if (B.conf < 0.3) B.fase = Math.round(B.fase);        // perdeu o passo: recomeça no bumbo
}

// ---------- análise ----------
let relogio = 0, nBloco = 0, somaQuad = 0, saturadas = 0, amostras = 0, db = -120, clip = 0;
const sock = dgram.createSocket('udp4');

function fimDoBloco() {
  relogio += DT;
  if (B.bpm) B.fase += DT * B.bpm / 60;
  for (const c of TODAS) {
    const e = Math.sqrt(c.filtro.soma / BLOCO);
    c.filtro.soma = 0;
    c.e = e;
    // Ganho automático: nível entre o piso e o pico recentes de cada faixa. O piso tira o "chão" da
    // música, sem isso uma pista comprimida deixa tudo sempre aceso e nada parece reagir.
    c.pico = Math.max(c.pico * Math.pow(0.5, DT / 8), e, PORTAO);
    c.piso = e < c.piso ? c.piso + (e - c.piso) * 0.25 : c.piso * Math.pow(2, DT / 4);
    c.piso = Math.min(c.piso, c.pico * 0.6);
    const v = c.pico <= PORTAO ? 0 : Math.max(0, Math.min(1, (e - c.piso * 1.1) / (c.pico - c.piso * 1.1)));
    c.nivel = v > c.nivel ? v : c.nivel * Math.exp(-DT / c.solta);
    c.v = v;
  }
  // Golpes: subida brusca da energia acima do normal do último segundo e meio.
  for (const f of FAIXAS) {
    const lg = Math.log10(f.e + 1e-6);
    const fluxo = Math.max(0, lg - f.antes[f.iAntes]); // comparado com 30 ms atrás: pega ataque, não oscilação
    f.antes[f.iAntes] = lg; f.iAntes = (f.iAntes + 1) % f.antes.length;
    f.hist[f.iHist] = fluxo; f.iHist = (f.iHist + 1) % f.hist.length;
    let m = 0; for (const x of f.hist) m += x; m /= f.hist.length;
    let s = 0; for (const x of f.hist) s += (x - m) ** 2; s = Math.sqrt(s / f.hist.length);
    if (fluxo > m + 1.8 * s && fluxo > 0.05 && f.v > 0.25 && relogio - f.ultimo > f.minimo) {
      f.ultimo = relogio; f.golpes++;
      if (f === FAIXAS[0]) bumbo(relogio);
    }
  }
  // Medição da entrada a cada meio segundo.
  if (++nBloco % 50 === 0) {
    db = amostras ? 10 * Math.log10(Math.max(1e-12, somaQuad / amostras)) : -120;
    clip = amostras ? saturadas / amostras : 0;
    somaQuad = saturadas = amostras = 0;
  }
  const r = x => Math.round(x * 1000) / 1000;
  const msg = Buffer.from(JSON.stringify({
    t: Date.now(), f: FAIXAS.map(c => r(c.nivel)), b: BANDAS.map(c => r(c.nivel)), g: FAIXAS.map(c => c.golpes),
    bpm: r(B.bpm), fase: r(B.fase), conf: r(B.conf), db: Math.round(db * 10) / 10, clip: r(clip),
    entrada: arquivo ? 'arquivo' : config.entrada,
  }));
  sock.send(msg, PORTA, '127.0.0.1');
}

let noBloco = 0;
function amostra(s) {
  const x = s / 32768;
  somaQuad += x * x; amostras++;
  if (s >= 32700 || s <= -32700) saturadas++;
  for (let i = 0; i < TODAS.length; i++) {
    const c = TODAS[i].filtro;
    const y = c.b0 * x + c.z1;
    c.z1 = -c.a1 * y + c.z2;
    c.z2 = c.b2 * x - c.a2 * y;
    c.soma += y * y;
  }
  if (++noBloco === BLOCO) { noBloco = 0; fimDoBloco(); }
}

// ---------- captura ----------
let ff = null, sobra = null, trocando = false;
function iniciar() {
  const entrada = arquivo
    ? ['-re', '-stream_loop', '-1', '-i', arquivo]
    : ['-f', 'dshow', '-audio_buffer_size', '20', '-i', 'audio=' + (ENTRADAS[config.entrada] || ENTRADAS.mic)];
  ff = spawn(FFMPEG, ['-hide_banner', '-v', 'error', '-fflags', 'nobuffer', ...entrada,
    '-ac', '1', '-ar', String(SR), '-flush_packets', '1', '-f', 's16le', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  sobra = null;
  console.log(new Date().toLocaleString('pt-BR'), 'ouvindo', arquivo || ENTRADAS[config.entrada]);
  ff.stdout.on('data', d => {
    if (sobra) { d = Buffer.concat([sobra, d]); sobra = null; }
    const n = d.length >> 1;
    for (let i = 0; i < n; i++) amostra(d.readInt16LE(i * 2));
    if (d.length & 1) sobra = d.subarray(d.length - 1);
  });
  ff.stderr.on('data', d => console.log('ffmpeg:', String(d).trim().slice(0, 300)));
  ff.on('close', () => { ff = null; const espera = trocando ? 100 : 3000; trocando = false; setTimeout(iniciar, espera); });
}

// O servidor pede a troca de entrada (mic ↔ mix) respondendo no mesmo socket.
sock.on('message', d => {
  try {
    const m = JSON.parse(d);
    if (m.entrada && ENTRADAS[m.entrada] && m.entrada !== config.entrada) {
      config.entrada = m.entrada;
      fs.writeFile(CONFIG, JSON.stringify(config, null, 2), () => {});
      if (ff && !arquivo) { trocando = true; ff.kill(); }
    }
  } catch {}
});
sock.on('error', e => {
  console.log('udp:', e.message);
  if (e.code === 'EADDRINUSE') process.exit(0); // já tem um ouvido rodando: dois embaralhariam os golpes
});
sock.bind(PORTA + 1, '127.0.0.1', iniciar);
