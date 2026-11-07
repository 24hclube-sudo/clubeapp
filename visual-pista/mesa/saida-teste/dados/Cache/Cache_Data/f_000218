// Entrada de som analisada a cada quadro. Feita para aguentar sinal estourado, como a entrada do PC do CLUBE (05/11/2026: 34% das
// amostras no teto): tudo é medido em dB em relação ao próprio sobe-e-desce recente de cada faixa, não em relação ao volume.
// - grave, medio, agudo e as 48 faixas vão de 0 a 1 e usam toda a escala mesmo com a música comprimida.
// - bumbo: subida brusca nas faixas baixas e nos agudos, com limiar que se ajusta sozinho.
// - batida: o BPM vem da autocorrelação dos últimos 10 s, não dos intervalos entre bumbos soltos; a fase é puxada pelos bumbos.
//   Com o BPM firme, se um bumbo não for detectado, a batida prevista dispara no lugar dele (e um pouco adiantada, para compensar o
//   caminho até o LED).
// Sem som (abaixo de -55 dBFS por 2 s) audioVivo() fica falso e a página pode seguir no relógio interno.
//
// O painel do app do Claude bloqueia o microfone. Por isso existe o pedido 'saida': a página recebe a análise feita pela saída do LED
// (mesa/saida, que tem acesso à entrada), por um fluxo em 127.0.0.1:5212/som. Quem abre a página com ?publicar manda a análise para lá.
import { REACOES } from './reacoes.js';

export const NF = 48;
const PUBLICAR = new URLSearchParams(location.search).has('publicar');
const URL_SAIDA = 'http://127.0.0.1:5212';

const TAXA = 60;             // quadros de análise por segundo (a análise é feita em passos fixos de tempo)
const HIST = TAXA * 10;      // 10 s de envelope para achar o BPM
const ADIANTA = 0.045;       // segundos: compensa o atraso até o LED quando a batida vem da previsão

export const A = {
  ctx: null, an: null, stream: null, freq: null, tempo: null, estado: 'desligado', entrada: '', ganho: 1,
  grave: 0, medio: 0, agudo: 0, nivel: 0, bumbo: 0, rmsDb: -120, picoDb: -120, musica: false, faixaG: 0, faixaM: 0,
  faixas: new Float32Array(NF), espectro: new Uint8Array(NF), dbFaixas: new Float32Array(NF).fill(-140),
  ultimoOnset: -1e9, ultimoSom: -1e9, bumbos: 0, previstos: 0,
  bpm: 0, fase: 0, confianca: 0,
  aoBumbo: null, // (força 0–1) => void
};

function faixaNorm() { return { teto: -200, piso: 0, primeiro: true }; }
const B = {
  grave: faixaNorm(), medio: faixaNorm(), agudo: faixaNorm(), faixas: Array.from({ length: NF }, faixaNorm),
  antes: new Float32Array(6), fluxos: new Float32Array(TAXA * 2), iFluxo: 0, ultimoPasso: 0, sobra: 0,
  env: new Float32Array(HIST), iEnv: 0, nEnv: 0, proximoBpm: 0, batidaPrevista: -1, bateuNestaBatida: -1, loudness: 0,
};

// pedido: '' = entrada padrão, 'teste' = batida sintética, 'arquivo:<url>' = música de um arquivo (para conferir), outro texto = parte do nome da entrada
export async function ligarAudio(pedido = '') {
  if (A.ctx) desligarAudio();
  pedido = pedido || '';
  const baixo = pedido.toLowerCase();
  if (baixo === 'saida') return ouvirSaida();
  try {
    let stream = null, arquivo = null;
    if (pedido.startsWith('arquivo:')) arquivo = pedido.slice(8);
    else if (baixo !== 'teste') {
      const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
      if (baixo) {
        const d = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind === 'audioinput' && d.label.toLowerCase().includes(baixo));
        if (d) { stream.getTracks().forEach(t => t.stop()); stream = await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: d.deviceId } } }); }
      }
    }
    A.ctx = new AudioContext({ latencyHint: 'interactive' });
    A.an = A.ctx.createAnalyser(); A.an.fftSize = 2048; A.an.smoothingTimeConstant = 0;
    A.an.minDecibels = -120; A.an.maxDecibels = 20;
    const mudo = A.ctx.createGain(); mudo.gain.value = 0; A.an.connect(mudo).connect(A.ctx.destination);
    if (stream) { A.stream = stream; A.ctx.createMediaStreamSource(stream).connect(A.an); A.entrada = stream.getAudioTracks()[0].label || 'entrada de áudio'; }
    else if (arquivo) {
      const buf = await A.ctx.decodeAudioData(await (await fetch(arquivo)).arrayBuffer());
      const src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(A.an); src.start();
      A.entrada = 'arquivo ' + decodeURIComponent(arquivo.split('/').pop());
    } else { somDeTeste(A.ctx, A.an, 124); A.entrada = 'som de teste (124 BPM)'; }
    A.freq = new Float32Array(A.an.frequencyBinCount);
    A.tempo = new Float32Array(A.an.fftSize);
    A.estado = 'ouvindo';
    if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  } catch (e) {
    A.ctx = null; A.an = null; A.estado = 'sem entrada de áudio (' + (e.name || e.message) + ')';
  }
}

function ouvirSaida() {
  A.estado = 'esperando a saída do LED';
  A.entrada = '';
  const es = new EventSource(URL_SAIDA + '/som');
  A.remoto = { es, p: null, t: 0, b: null };
  es.onmessage = ev => {
    try {
      const p = JSON.parse(ev.data);
      A.remoto.p = p; A.remoto.t = performance.now();
      A.estado = 'ouvindo'; A.entrada = p.e ? 'som do LED: ' + p.e : 'som do LED';
    } catch {}
  };
  es.onerror = () => { A.estado = 'saída do LED fechada'; };
}

function analisarRemoto(dt) {
  const r = A.remoto, p = r.p, agora = performance.now();
  if (!p || agora - r.t > 1500) { A.grave = suave(A.grave, 0, dt, 9, 9); A.medio = suave(A.medio, 0, dt, 7, 7); A.agudo = suave(A.agudo, 0, dt, 12, 12); A.nivel = 0; A.bpm = 0; A.confianca = 0; return; }
  A.grave = suave(A.grave, p.g, dt, 60, 9); A.medio = suave(A.medio, p.m, dt, 50, 7); A.agudo = suave(A.agudo, p.a, dt, 70, 12);
  A.nivel = (A.grave + A.medio + A.agudo) / 3;
  A.rmsDb = p.r; A.picoDb = p.k; A.bpm = p.bpm; A.confianca = p.c;
  if (p.bpm) A.fase = p.f + (agora - r.t) / 1000 * p.bpm / 60;
  if (p.s) A.ultimoSom = agora;
  A.musica = !!p.v;
  for (let b = 0; b < NF; b++) { A.faixas[b] = suave(A.faixas[b], (p.q[b] || 0) / 255, dt, 45, 8); A.espectro[b] = Math.round(A.faixas[b] * 255); }
  if (r.b !== null && p.b !== r.b) disparar(agora, p.h ?? 1);
  r.b = p.b;
}

function publicar(agora) {
  if (!PUBLICAR || agora - (B.ultimaPub || 0) < 30) return;
  B.ultimaPub = agora;
  const corpo = JSON.stringify({ g: +A.grave.toFixed(3), m: +A.medio.toFixed(3), a: +A.agudo.toFixed(3), r: +A.rmsDb.toFixed(1), k: +A.picoDb.toFixed(1),
    bpm: +A.bpm.toFixed(2), f: +A.fase.toFixed(4), c: +A.confianca.toFixed(2), b: A.bumbos, h: +(B.ultimaForca ?? 1).toFixed(2), v: A.musica, s: sinalChegando(), e: A.entrada, q: Array.from(A.espectro), d: Array.from(A.dbFaixas, v => Math.round(v)), z: A.estrelas, w: A.somReal, y: A.piso });
  fetch('/som', { method: 'POST', body: corpo }).catch(() => {});
}

export function desligarAudio() {
  if (A.remoto) { A.remoto.es.close(); A.remoto = null; }
  if (A.stream) A.stream.getTracks().forEach(t => t.stop());
  if (A.ctx) A.ctx.close().catch(() => {});
  Object.assign(A, { ctx: null, an: null, stream: null, estado: 'desligado', entrada: '', bpm: 0, confianca: 0 });
}

// Batida sintética (bumbo, chimbal e baixo) para testar sem ninguém tocar música.
function somDeTeste(ctx, destino, bpm) {
  const sr = ctx.sampleRate, batida = 60 / bpm, n = Math.round(sr * batida * 8);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (let b = 0; b < 8; b++) {
    const i0 = Math.round(b * batida * sr);
    for (let i = 0; i < sr * 0.35 && i0 + i < n; i++) {           // bumbo: seno que desce de 120 a 45 Hz
      const t = i / sr; d[i0 + i] += Math.sin(2 * Math.PI * (45 * t + 75 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 9) * 0.9;
    }
    const i1 = Math.round((b + 0.5) * batida * sr);
    for (let i = 0; i < sr * 0.05 && i1 + i < n; i++) d[i1 + i] += (Math.random() * 2 - 1) * Math.exp(-i / sr * 80) * 0.25; // chimbal
    for (let i = 0; i < sr * batida * 0.4 && i1 + i < n; i++) { const t = i / sr; d[i1 + i] += ((55 * t) % 1 - 0.5) * 0.2 * Math.exp(-t * 6); } // baixo
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(destino); src.start();
}

const suave = (atual, alvo, dt, sobe, desce) => atual + (alvo - atual) * (1 - Math.exp(-dt * (alvo > atual ? sobe : desce)));

// dB → 0..1 usando o sobe-e-desce recente da própria faixa. O teto sobe na hora e desce devagar; o piso, ao contrário.
function normalizar(n, db, dt, faixaMin = 6) {
  if (n.primeiro) { n.teto = db; n.piso = db - faixaMin; n.primeiro = false; }
  n.teto = Math.max(db, n.teto - dt * 1.2);
  n.piso = Math.min(db, n.piso + dt * 1.2);
  const faixa = Math.max(n.teto - n.piso, faixaMin);
  return Math.max(0, Math.min(1, (db - (n.teto - faixa)) / faixa));
}

// Os sons desligados no app somem só para quem consome. A análise segue com os valores de verdade, e o monitor continua vendo tudo.
const CRU = { ativo: false, g: 0, m: 0, a: 0, f: new Float32Array(NF) };
export function analisarAudio(dt) {
  if (CRU.ativo) { A.grave = CRU.g; A.medio = CRU.m; A.agudo = CRU.a; A.faixas.set(CRU.f); CRU.ativo = false; }
  analisar(dt);
  const O = REACOES.outros, S = REACOES.som;
  const k = S.forca / 100, abaixo = A.rmsDb < S.piso;
  if (A.semMudos || (O.grave && O.medio && O.agudo && k === 1 && !abaixo)) return;
  CRU.g = A.grave; CRU.m = A.medio; CRU.a = A.agudo; CRU.f.set(A.faixas); CRU.ativo = true;
  const ajusta = (v, ligado) => (ligado && !abaixo ? Math.min(1, v * k) : 0);
  A.grave = ajusta(A.grave, O.grave);
  A.medio = ajusta(A.medio, O.medio);
  A.agudo = ajusta(A.agudo, O.agudo);
  A.nivel = (A.grave + A.medio + A.agudo) / 3;
  for (let b = 0; b < NF; b++) {
    A.faixas[b] = ajusta(A.faixas[b], b < 14 ? O.grave : b < 33 ? O.medio : O.agudo);
    A.espectro[b] = Math.round(A.faixas[b] * 255);
  }
}
function analisar(dt) {
  A.bumbo *= Math.exp(-dt * 7);
  if (A.remoto) return analisarRemoto(dt);
  if (A.bpm) A.fase += dt * A.bpm / 60;
  if (!A.an) { A.grave = A.medio = A.agudo = A.nivel = 0; return; }
  if (!A.freq) return;
  A.an.getFloatFrequencyData(A.freq);
  A.an.getFloatTimeDomainData(A.tempo);
  let soma = 0, pico = 0;
  for (let i = 0; i < A.tempo.length; i++) { const x = A.tempo[i]; soma += x * x; const y = Math.abs(x); if (y > pico) pico = y; }
  A.rmsDb = 10 * Math.log10(soma / A.tempo.length + 1e-12);
  A.picoDb = 20 * Math.log10(pico + 1e-6);
  const agora = performance.now();
  if (A.rmsDb > -55) A.ultimoSom = agora;

  const hz = A.ctx.sampleRate / A.an.fftSize, ultimo = A.freq.length - 1;
  const db = (f0, f1) => {
    let s = 0, n = 0;
    for (let i = Math.max(1, Math.floor(f0 / hz)); i <= Math.min(ultimo, Math.ceil(f1 / hz)); i++) { const v = A.freq[i]; if (v > -Infinity) s += Math.pow(10, v / 10); n++; }
    return n ? 10 * Math.log10(s / n + 1e-14) : -140;
  };
  const silencio = A.rmsDb < -70;
  const dbGrave = db(35, 180), dbMedio = db(200, 2000), dbAgudo = db(2500, 12000);
  const vG = silencio ? 0 : normalizar(B.grave, dbGrave, dt, 8), vM = silencio ? 0 : normalizar(B.medio, dbMedio, dt, 5), vA = silencio ? 0 : normalizar(B.agudo, dbAgudo, dt, 5);
  // música tem batida ou sobe e desce; ruído de cabo, não: nesse caso a página não finge que está reagindo
  A.faixaG = B.grave.teto - B.grave.piso; A.faixaM = B.medio.teto - B.medio.piso;
  // (interferência elétrica pode até ter pulso regular: o que separa é o sobe e desce dos médios)
  if (A.faixaM >= 7.5) B.ultimaMusica = agora;
  A.musica = agora - (B.ultimaMusica ?? -1e9) < 4000;
  A.grave = suave(A.grave, vG * vG, dt, 60, 9);
  A.medio = suave(A.medio, vM * vM, dt, 50, 7);
  A.agudo = suave(A.agudo, vA * vA, dt, 70, 12);
  A.nivel = (A.grave + A.medio + A.agudo) / 3;

  // espectro em 48 faixas (30 Hz a 16 kHz, escala logarítmica), cada uma em relação a si mesma
  for (let b = 0; b < NF; b++) {
    const f0 = 30 * Math.pow(16000 / 30, b / NF), f1 = 30 * Math.pow(16000 / 30, (b + 1) / NF);
    A.dbFaixas[b] = db(f0, f1);
    const v = silencio ? 0 : normalizar(B.faixas[b], A.dbFaixas[b], dt, 7);
    A.faixas[b] = suave(A.faixas[b], v * v, dt, 45, 8);
    A.espectro[b] = Math.round(A.faixas[b] * 255);
  }

  // passos fixos de tempo: o envelope da batida não pode depender do ritmo dos quadros
  B.sobra += dt;
  const passo = 1 / TAXA;
  let fluxoTudo = 0, fluxoBaixo = 0;
  const atual = [db(35, 90), db(90, 180), db(2500, 6000), db(6000, 12000)];
  for (let k = 0; k < atual.length; k++) {
    const d = atual[k] - B.antes[k];
    if (d > 0) { fluxoTudo += d * (k < 2 ? 1 : 0.55); if (k < 2) fluxoBaixo += d; }
    B.antes[k] = atual[k];
  }
  B.loudness = Math.max(B.loudness, fluxoTudo);
  B.baixo = Math.max(B.baixo || 0, fluxoBaixo);
  publicar(agora);
  if (B.sobra < passo) return;
  while (B.sobra >= passo) { B.sobra -= passo; empurrarEnvelope(B.loudness, B.baixo); B.loudness = 0; B.baixo = 0; }

  // bumbo: subida acima do normal dos últimos 2 s
  const n = B.fluxos.length;
  let media = 0, quad = 0;
  for (let i = 0; i < n; i++) { media += B.fluxos[i]; quad += B.fluxos[i] * B.fluxos[i]; }
  media /= n;
  const desvio = Math.sqrt(Math.max(0, quad / n - media * media));
  const ultimoFluxo = B.fluxos[(B.iFluxo + n - 1) % n];
  const limiar = media + 1.4 * desvio;
  const passou = agora - A.ultimoOnset;
  // Com o BPM firme, só vale bumbo perto da batida; chimbal e contratempo não contam.
  const naBatida = !A.bpm || A.confianca < 0.4 || Math.abs(A.fase - Math.round(A.fase)) < 0.2;
  if (!silencio && ultimoFluxo > limiar && ultimoFluxo > 3 && passou > 240 && naBatida) {
    const forca = Math.min(1, 0.45 + 0.55 * (ultimoFluxo - limiar) / Math.max(desvio * 2, 1));
    onset(agora, forca);
  }
  // a cada 0,5 s recalcula o BPM
  B.proximoBpm -= dt;
  if (B.proximoBpm <= 0) { B.proximoBpm = 0.5; estimarBpm(); }

  // batida prevista: BPM firme, sem bumbo perto da batida, a batida dispara assim mesmo
  if (A.bpm && A.confianca >= 0.25) {
    const adiantado = A.fase + ADIANTA * A.bpm / 60;
    const b = Math.floor(adiantado);
    if (b !== B.batidaPrevista) {
      B.batidaPrevista = b;
      if (agora - A.ultimoOnset > 60000 / A.bpm * 0.3) { A.previstos++; disparar(agora, 0.75 * Math.min(1, A.confianca + 0.3)); }
    }
  }
}

// fluxos = só as faixas baixas, para o bumbo; env = tudo, para achar o BPM
function empurrarEnvelope(tudo, baixo) {
  B.fluxos[B.iFluxo] = baixo; B.iFluxo = (B.iFluxo + 1) % B.fluxos.length;
  B.env[B.iEnv] = tudo; B.iEnv = (B.iEnv + 1) % HIST; B.nEnv = Math.min(HIST, B.nEnv + 1);
}

function disparar(agora, forca) {
  // batida prevista e bumbo detectado caem quase juntos: vale um disparo só
  if (agora - (B.ultimoDisparo || -1e9) < 150) return;
  B.ultimoDisparo = agora;
  B.ultimaForca = forca;
  A.bumbos++;
  if (!A.semMudos && (!REACOES.outros.bumbo || A.rmsDb < REACOES.som.piso)) return;
  A.bumbo = Math.max(A.bumbo, forca);
  if (A.aoBumbo) A.aoBumbo(forca);
}

function onset(agora, forca) {
  A.ultimoOnset = agora;
  // puxa a fase para o bumbo, se ele estiver perto de uma batida
  if (A.bpm) {
    const erro = A.fase - Math.round(A.fase);
    if (Math.abs(erro) < 0.22) A.fase -= erro * 0.25;
    // a batida prevista desta vez já foi: não dispara outra em cima
    if (Math.abs(erro) < 0.3) B.batidaPrevista = Math.round(A.fase);
  }
  disparar(agora, forca);
}

// BPM por autocorrelação do envelope, com pente: o pulso verdadeiro também aparece no dobro do período.
function estimarBpm() {
  if (B.nEnv < TAXA * 4) return;
  const n = B.nEnv, e = new Float32Array(n), ini = (B.iEnv - n + HIST) % HIST;
  let m = 0;
  for (let i = 0; i < n; i++) { e[i] = B.env[(ini + i) % HIST]; m += e[i]; }
  m /= n;
  let zero = 0;
  for (let i = 0; i < n; i++) { e[i] -= m; zero += e[i] * e[i]; }
  if (zero < 1e-6) return;
  const lagMin = Math.floor(TAXA * 60 / 170), lagMax = Math.ceil(TAXA * 60 / 85);
  const ac = lag => { let s = 0; for (let i = lag; i < n; i++) s += e[i] * e[i - lag]; return s / zero; };
  let melhor = 0, melhorLag = 0;
  const pontos = new Float32Array(lagMax + 2);
  for (let lag = lagMin; lag <= lagMax + 1; lag++) pontos[lag] = ac(lag);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    // peso para o andar de música de pista (por volta de 124 BPM) e pente no dobro do período
    const bpm = TAXA * 60 / lag;
    const preferencia = Math.exp(-Math.pow(Math.log2(bpm / 122), 2) * 0.9);
    const dobro = lag * 2 < n / 2 ? ac(lag * 2) : 0;
    const v = (pontos[lag] + 0.5 * dobro) * preferencia;
    if (v > melhor) { melhor = v; melhorLag = lag; }
  }
  if (!melhorLag) return;
  // refina com parábola entre os vizinhos
  const a = pontos[melhorLag - 1] || 0, b = pontos[melhorLag], c = pontos[melhorLag + 1] || 0;
  const div = a - 2 * b + c;
  const lagFino = melhorLag + (Math.abs(div) > 1e-6 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / div)) : 0);
  const novo = TAXA * 60 / lagFino;
  A.confianca += (Math.min(1, Math.max(0, b * 2.2)) - A.confianca) * 0.3;
  if (!A.bpm || Math.abs(novo - A.bpm) > 4) {
    B.candidato = Math.abs(novo - (B.candidato || 0)) < 2 ? B.candidato : novo;
    B.insiste = Math.abs(novo - B.candidato) < 2 ? (B.insiste || 0) + 1 : 1;
    if (!A.bpm || B.insiste >= 3) { A.bpm = novo; B.insiste = 0; acharFase(lagFino, e); }
  } else {
    A.bpm += (novo - A.bpm) * 0.25;
  }
}

// Fase: em qual ponto do período o envelope tem mais força.
function acharFase(lag, e) {
  const n = e.length, passos = Math.max(4, Math.round(lag));
  let melhor = -1e9, melhorDes = 0;
  for (let d = 0; d < passos; d++) {
    let s = 0;
    for (let k = n - 1 - d; k >= 0; k -= lag) s += e[Math.round(k)] || 0;
    if (s > melhor) { melhor = s; melhorDes = d; }
  }
  // a batida mais recente aconteceu há melhorDes passos
  A.fase = Math.floor(A.fase) + melhorDes / lag;
}

// "vivo": tem som entrando; "no comando": dá para seguir a batida do som
// "sinal": chega alguma coisa na entrada; "vivo": o que chega parece música; "no comando": dá para seguir a batida
export const sinalChegando = () => (!!A.an || !!A.remoto) && performance.now() - A.ultimoSom < 2000;
export const audioVivo = () => sinalChegando() && A.musica;
export const audioNoComando = () => audioVivo() && A.bpm > 0 && A.confianca >= 0.25;
