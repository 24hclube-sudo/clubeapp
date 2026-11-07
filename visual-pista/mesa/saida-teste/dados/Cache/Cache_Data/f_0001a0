// Análise da faixa ao vivo: entende a música, não só o volume. Sai daqui a grade (batida, compasso, frase), a seção (calmo, groove, pico, break, build, drop),
// a energia, a tensão, os instrumentos (bumbo, palma, chimbal, baixo, voz), o tom (Camelot) e a troca de faixa.
// Sem dependência de navegador: o mesmo código roda na janela escondida da saída (ouvido.html) e no Node, para conferir com música de verdade (testar-analise.mjs).
// Feita para aguentar a entrada do CLUBE, que chega estourada: tudo é medido em relação ao sobe e desce recente de cada faixa de frequência.

const PI2 = Math.PI * 2;
export const SECOES = ['silencio', 'calmo', 'groove', 'pico', 'break', 'build', 'drop'];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

class FFT {
  constructor(n) {
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(PI2 * i / n); this.sin[i] = -Math.sin(PI2 * i / n); }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let x = i, r = 0;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.janela = new Float64Array(n);
    for (let i = 0; i < n; i++) this.janela[i] = 0.5 - 0.5 * Math.cos(PI2 * i / (n - 1));
    this.pot = new Float64Array(n / 2 + 1);
  }
  // entrada: anel circular, com o início em ini. Saída: this.pot[k] = potência do bin k.
  calcular(anel, ini) {
    const { n, re, im, rev, cos, sin, janela, pot } = this;
    const m = anel.length;
    for (let i = 0; i < n; i++) { const r = rev[i]; re[r] = anel[(ini + i) % m] * janela[i]; im[r] = 0; }
    for (let t = 2; t <= n; t <<= 1) {
      const meio = t >> 1, passo = n / t;
      for (let i = 0; i < n; i += t) {
        for (let j = 0, k = 0; j < meio; j++, k += passo) {
          const a = i + j, b = a + meio;
          const xr = re[b] * cos[k] - im[b] * sin[k], xi = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    const e = 2 / (n * 0.5);
    for (let i = 0; i <= n / 2; i++) pot[i] = (re[i] * re[i] + im[i] * im[i]) * e * e * 0.25;
  }
}

// Perfis de Krumhansl-Schmuckler
const PERFIL_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const CAMELOT_MENOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];   // tônica (0 = dó) → número da roda, modo menor (A)
const CAMELOT_MAIOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];   // modo maior (B)
const NOTAS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const camelot = (tonica, maior) => (maior ? CAMELOT_MAIOR : CAMELOT_MENOR)[tonica] + (maior ? 'B' : 'A');

// Cada faixa de frequência é medida em relação ao seu próprio sobe e desce recente
class Faixa {
  constructor(minimo, deriva = 0.7) { this.teto = -200; this.piso = 0; this.novo = true; this.minimo = minimo; this.deriva = deriva; this.v = 0; }
  passo(db, dt) {
    if (this.novo) { this.teto = db; this.piso = db - this.minimo; this.novo = false; }
    this.teto = Math.max(db, this.teto - dt * this.deriva);
    this.piso = Math.min(db, this.piso + dt * this.deriva);
    const r = Math.max(this.teto - this.piso, this.minimo);
    this.v = clamp01((db - (this.teto - r)) / r);
    return this.v;
  }
}

export class AnaliseFaixa {
  constructor(sr = 48000, { aoEvento = null } = {}) {
    this.sr = sr;
    this.aoEvento = aoEvento;
    this.N = 2048; this.hop = 512; this.hopHz = sr / this.hop; this.dtHop = this.hop / sr;
    this.fft = new FFT(this.N);
    this.NC = 16384; this.hopC = 4096;
    this.fftC = new FFT(this.NC);
    this.anel = new Float32Array(this.NC);
    this.iAnel = 0; this.contaHop = 0; this.contaC = 0; this.amostras = 0;
    this.t = 0;

    const hz = sr / this.N;
    const faixas = [[30, 100], [100, 250], [250, 800], [800, 2500], [2500, 7000], [7000, 15000]];
    this.bins = faixas.map(([a, b]) => [Math.max(1, Math.round(a / hz)), Math.min(this.N / 2, Math.round(b / hz))]);
    this.NB = faixas.length;
    this.db = new Float64Array(this.NB);
    this.dbAntes = [new Float64Array(this.NB).fill(-120), new Float64Array(this.NB).fill(-120)];
    this.flux = new Float64Array(this.NB);
    this.fxMedia = new Float64Array(this.NB).fill(0.5);
    this.fxVar = new Float64Array(this.NB).fill(1);
    this.nivel = Array.from({ length: this.NB }, (_, i) => new Faixa(i < 2 ? 8 : 6));
    this.espera = new Float64Array(this.NB);

    // anéis do envelope, para o andamento: 14 s
    this.nEnv = Math.round(this.hopHz * 14);
    this.env = new Float32Array(this.nEnv);
    this.envK = new Float32Array(this.nEnv);
    this.iEnv = 0; this.cheioEnv = 0;
    this.proxBpm = 0;

    // grade
    this.bpm = 0; this.conf = 0; this.fase = 0; this.batida = -1; this.firme = 0;
    this.cand = 0; this.insiste = 0; this.erroFaseConta = 0;
    this.pesoTempo = new Float64Array(4); this.desloc = 0;   // qual resto de batida/4 é o tempo 1
    this.compasso = 0; this.ancora = 0; this.noCompasso = 0;

    // instrumentos em golpes: sobem na hora e caem sozinhos
    this.kick = 0; this.clap = 0; this.hat = 0;
    this.kickForca = 0; this.golpesKick = 0; this.golpesClap = 0; this.golpesHat = 0;
    this.baixo = 0; this.medio = 0; this.agudo = 0; this.voz = 0; this.brilho = 0.5; this.chato = 0.5;

    // acúmulo de cada batida
    this.acu = this.novoAcu();
    this.hist = [];   // uma entrada por batida, as últimas 256
    this.barras = []; // uma entrada por compasso, as últimas 96
    this.acuBarra = this.novoAcuBarra();
    this.chroma = new Float64Array(12); this.chromaBatida = new Float64Array(12); this.chromaAnteriorBatida = new Float64Array(12); this.nChromaBatida = 0;
    this.chromaLenta = new Float64Array(12);
    this.mudaHarmonia = 0;
    this.tonica = -1; this.maior = false; this.tomCand = null; this.tomInsiste = 0; this.confTom = 0; this.proxTom = 0;
    const hzC = sr / this.NC;
    this.chromaMapa = [];
    for (let k = Math.round(65 / hzC); k <= Math.min(this.NC / 2, Math.round(2100 / hzC)); k++) {
      const midi = 69 + 12 * Math.log2(k * hzC / 440), q = Math.round(midi);
      const peso = Math.exp(-Math.pow((midi - q) / 0.3, 2));
      if (peso > 0.05) this.chromaMapa.push([k, ((q % 12) + 12) % 12, peso]);
    }

    // estrutura
    this.marcaKick = new Int32Array(8).fill(-999); this.subs = []; this.refSub = -60; this.presenca = 0; this.semKick = 0; this.comKick = 0;
    this.loud = new Faixa(6, 0.05); this.hatN = new Faixa(6, 0.08); this.brilhoN = new Faixa(0.12, 0.002); this.densN = new Faixa(2, 0.01);
    this.energia = 0.4; this.tensao = 0; this.secao = 'silencio'; this.idadeSecao = 0; this.semBreak = 0; this.tempoBreak = 0;
    this.novidade = 0; this.faixa = 1; this.tFaixa = 0; this.bpmFaixa = 0; this.tomFaixa = null; this.silencioT = 0; this.rmsDb = -120; this.picoDb = -120;
    this.musica = false; this.ultimaMusica = -1e9; this.mudancaAte = -1e9; this.tBpmNovo = 0;
    this.ultimoDrop = -999; this.refDrop = 0; this.fDrop = 0; this.topoRms = -30;
    this.emissoes = []; this.scoreTroca = 0; this.LIMIAR_TROCA = 0.8;
  }

  novoAcu() { return { n: 0, db: new Float64Array(this.NB), subMax: -120, kickMax: 0, hat: 0, clap: 0, kicks: 0, brilho: 0, chato: 0, rms: 0 }; }
  novoAcuBarra() { return { n: 0, v: new Float64Array(this.NB + 12), kick: 0, chroma: new Float64Array(12) }; }
  emitir(tipo, dados = {}) { const e = { tipo, t: +this.t.toFixed(3), ...dados }; this.emissoes.push(e); if (this.aoEvento) this.aoEvento(e); }

  // entrada mono, de qualquer tamanho
  empurrar(x) {
    const m = this.anel.length;
    for (let i = 0; i < x.length; i++) {
      let v = x[i];
      if (!Number.isFinite(v)) v = 0;
      this.anel[this.iAnel] = v;
      this.iAnel = (this.iAnel + 1) % m;
      this.amostras++;
      if (++this.contaHop >= this.hop) { this.contaHop = 0; if (this.amostras >= this.N) this.passo(); }
      if (++this.contaC >= this.hopC) { this.contaC = 0; if (this.amostras >= this.NC) this.passoChroma(); }
    }
  }

  passo() {
    const dt = this.dtHop;
    this.t += dt;
    const { fft, N, NB, anel, db, flux, bins } = this;
    const m = anel.length;
    fft.calcular(anel, (this.iAnel - N + m) % m);
    const p = fft.pot;

    // nível no tempo
    let soma = 0, pico = 0;
    const ini = (this.iAnel - this.hop + m) % m;
    for (let i = 0; i < this.hop; i++) { const v = anel[(ini + i) % m]; soma += v * v; const a = Math.abs(v); if (a > pico) pico = a; }
    const rms = 10 * Math.log10(soma / this.hop + 1e-12);
    this.rmsDb += (rms - this.rmsDb) * (1 - Math.exp(-dt / 0.25));
    this.picoDb = Math.max(20 * Math.log10(pico + 1e-6), this.picoDb - dt * 12);

    // faixas, brilho e planura
    let somaF = 0, somaP = 0, logSoma = 0, nFl = 0, somaFl = 0;
    const hz = this.sr / N;
    for (let k = 0; k < NB; k++) {
      let s = 0;
      const [a, b] = bins[k];
      for (let i = a; i <= b; i++) s += p[i];
      db[k] = 10 * Math.log10(s / (b - a + 1) + 1e-14);
    }
    for (let i = bins[1][0]; i <= bins[5][1]; i += 2) { const v = p[i] + 1e-14; somaP += v; somaF += v * i * hz; }
    const [fa, fb] = [Math.round(300 / hz), Math.round(3000 / hz)];
    for (let i = fa; i <= fb; i++) { const v = p[i] + 1e-14; logSoma += Math.log(v); somaFl += v; nFl++; }
    const planura = Math.exp(logSoma / nFl) / (somaFl / nFl);
    const centroide = Math.log2(Math.max(somaF / somaP, 50)) / 14;

    // subidas por faixa. A diferença é em relação a 2 passos atrás: em 11 ms o bumbo ainda não apareceu inteiro
    const [a1, a2] = this.dbAntes;
    for (let k = 0; k < NB; k++) {
      flux[k] = Math.max(0, db[k] - a2[k]);
      a2[k] = a1[k]; a1[k] = db[k];
      const f = flux[k], al = 1 - Math.exp(-dt / 3);
      this.fxMedia[k] += (f - this.fxMedia[k]) * al;
      this.fxVar[k] += ((f - this.fxMedia[k]) * (f - this.fxMedia[k]) - this.fxVar[k]) * al;
      this.espera[k] -= dt;
    }

    const env = flux[0] + 0.6 * flux[1] + 0.3 * flux[2] + 0.5 * flux[3] + 0.5 * flux[4] + 0.5 * flux[5];
    const envK = flux[0] + 0.5 * flux[1] + 0.12 * (flux[3] + flux[4]);
    this.env[this.iEnv] = env; this.envK[this.iEnv] = envK;
    this.iEnv = (this.iEnv + 1) % this.nEnv; this.cheioEnv = Math.min(this.nEnv, this.cheioEnv + 1);

    // música tem batida ou sobe e desce; ruído de cabo, não
    const silencio = this.rmsDb < -42;
    let ritmo = 0;
    for (let k = 0; k < NB; k++) ritmo += Math.sqrt(this.fxVar[k]);
    if (!silencio && ritmo > 3.5) this.ultimaMusica = this.t;
    this.musica = this.t - this.ultimaMusica < 3;

    // níveis
    const lv = this.nivel, v = [];
    for (let k = 0; k < NB; k++) v[k] = silencio ? 0 : lv[k].passo(db[k], dt);
    const sv = (a, b, s, d) => a + (b - a) * (1 - Math.exp(-dt * (b > a ? s : d)));
    this.baixo = sv(this.baixo, Math.max(v[0], v[1]), 40, 7);
    this.medio = sv(this.medio, (v[2] + v[3]) / 2, 30, 6);
    this.agudo = sv(this.agudo, (v[4] + v[5]) / 2, 60, 12);
    this.brilho = sv(this.brilho, centroide, 4, 2);
    this.chato = sv(this.chato, planura, 6, 3);
    const tonal = clamp01((0.42 - this.chato) / 0.3);
    this.voz = sv(this.voz, silencio ? 0 : tonal * (0.3 + 0.7 * v[3]), 6, 2.5);

    // golpes por instrumento
    this.kick *= Math.exp(-dt * 7.5); this.clap *= Math.exp(-dt * 11); this.hat *= Math.exp(-dt * 22);
    if (!silencio) {
      const limiar = k => this.fxMedia[k] + 1.9 * Math.sqrt(this.fxVar[k]);
      const fk = flux[0] + 0.45 * flux[1];
      if (flux[0] > Math.max(limiar(0), 2.5) && this.espera[0] <= 0) {
        this.espera[0] = 0.2; this.golpesKick++;
        const forca = clamp01((flux[0] - limiar(0)) / (2.5 * Math.sqrt(this.fxVar[0]) + 1) + 0.55);
        this.kick = Math.max(this.kick, forca); this.kickForca = forca;
        this.corrigirFase();
        if (this.bpm && Math.abs(this.distBatida()) < 0.24) { const r = Math.round(this.fase); this.marcaKick[r & 7] = r; }
        if ((this.secao === 'break' || this.secao === 'build') && this.tempoBreak >= 8 && forca >= 0.5 && this.subs.length > 16 && db[0] > this.refSub - 5) { this.semKick = 0; this.comKick = 1; this.chegarDrop(); }
      }
      const fClap = (flux[3] + flux[4]) / 2, lClap = (limiar(3) + limiar(4)) / 2;
      if (fClap > Math.max(lClap, 3) && this.espera[3] <= 0 && flux[0] < fClap * 1.2) { this.espera[3] = 0.09; this.golpesClap++; this.clap = 1; this.acu.clap++; }
      if (flux[5] > Math.max(limiar(5), 2.5) && this.espera[5] <= 0) { this.espera[5] = 0.05; this.golpesHat++; this.hat = 1; this.acu.hat++; }
      const a = this.acu;
      a.n++;
      for (let k = 0; k < NB; k++) a.db[k] += db[k];
      if (fk > a.kickMax && Math.abs(this.distBatida()) < 0.2) a.kickMax = fk;
      if (db[0] > a.subMax && Math.abs(this.distBatida()) < 0.3) a.subMax = db[0];
      a.brilho += centroide; a.chato += planura; a.rms += this.rmsDb;
    }
    this.proxBpm -= dt;
    if (this.proxBpm <= 0) { this.proxBpm = 0.5; this.estimarAndamento(); }

    // relógio: continua no break, sem bumbo nenhum, e é por isso que o drop cai na grade
    const ref = this.bpm || 0;
    if (ref) {
      this.fase += dt * ref / 60;
      const b = Math.floor(this.fase);
      if (b !== this.batida) { const pulou = b - this.batida; this.batida = b; if (pulou > 0) this.fimDeBatida(); }
    } else if (!silencio) {
      // sem grade ainda: conta o tempo mesmo assim
      this.fase = 0;
    }
    if (silencio) {
      this.silencioT += dt;
      if (this.silencioT > 1.4 && this.secao !== 'silencio') this.mudarSecao('silencio');
      if (this.silencioT > 5) { this.bpm = 0; this.conf = 0; this.batida = -1; this.fase = 0; this.firme = 0; this.cheioEnv = 0; }
    } else {
      if (this.silencioT > 1.4 && this.t - this.tFaixa > 20) this.novaFaixa('silencio');
      this.silencioT = 0;
    }
    this.tFaixa = this.tFaixa || this.t;
  }

  refSubAgora() { const o = this.subs.slice().sort((x, y) => x - y); return o[Math.floor(o.length * 0.75)]; }
  distBatida() { return this.fase - Math.round(this.fase); }

  corrigirFase() {
    if (!this.bpm) return;
    const e = this.distBatida();
    if (Math.abs(e) < 0.2) { this.fase -= e * 0.1; this.firme += (1 - this.firme) * 0.08; }
    else this.firme *= 0.985;
  }

  estimarAndamento() {
    const n = this.cheioEnv;
    if (n < this.hopHz * 5) return;
    const e = new Float32Array(n), ek = new Float32Array(n), ini = (this.iEnv - n + this.nEnv) % this.nEnv;
    let media = 0, mk = 0;
    for (let i = 0; i < n; i++) { const j = (ini + i) % this.nEnv; e[i] = this.env[j]; ek[i] = this.envK[j]; media += e[i]; mk += ek[i]; }
    media /= n; mk /= n;
    let zero = 0;
    for (let i = 0; i < n; i++) { e[i] -= media; ek[i] -= mk; zero += e[i] * e[i]; }
    if (zero < 1e-3) return;
    const hH = this.hopHz, lagMin = Math.floor(hH * 60 / 170), lagMax = Math.ceil(hH * 60 / 85), lagTopo = Math.min(n - 2, lagMax * 4 + 2);
    const ac = new Float32Array(lagTopo + 2);
    for (let lag = lagMin; lag <= lagTopo; lag++) { let s = 0; for (let i = lag; i < n; i++) s += e[i] * e[i - lag]; ac[lag] = s / zero * n / (n - lag); }
    const inter = l => { const i = Math.floor(l), f = l - i; return i + 1 <= lagTopo ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
    // pente em volta das batidas múltiplas, e preferência pelo andar de pista
    let melhor = -1e9, melhorBpm = 0;
    for (let bpm = 86; bpm <= 170; bpm += 0.5) {
      const T = hH * 60 / bpm;
      let s = 0, c = 0;
      for (let k = 1; k <= 8; k++) { const L = k * T; if (L > lagTopo) break; s += inter(L) * (k % 4 === 0 ? 1.2 : k % 2 === 0 ? 1.05 : 1); c++; }
      s /= c || 1;
      const pref = Math.exp(-Math.pow(Math.log2(bpm / 124) / 0.62, 2) / 2);
      const v = s * pref;
      if (v > melhor) { melhor = v; melhorBpm = bpm; }
    }
    if (!melhorBpm) return;
    // refino fino em volta do melhor
    let fino = melhorBpm, topo = -1e9;
    for (let bpm = melhorBpm - 1.2; bpm <= melhorBpm + 1.2; bpm += 0.05) {
      const T = hH * 60 / bpm; let s = 0;
      for (let k = 1; k <= 16; k++) { const L = k * T; if (L > lagTopo) break; s += inter(L); }
      if (s > topo) { topo = s; fino = bpm; }
    }
    const novo = fino;
    const qual = clamp01(inter(hH * 60 / novo) * 1.6);
    this.conf += (qual - this.conf) * 0.25;
    // dobro e metade com pouca evidência não trocam nada
    if (!this.bpm) { this.bpm = novo; this.fase = 0; this.batida = -1; this.acharFase(ek, hH * 60 / novo); this.bpmFaixa = novo; return; }
    const dif = Math.abs(novo - this.bpm);
    if (dif < 2.2) {
      this.bpm += (novo - this.bpm) * 0.15;
      this.insiste = 0;
    } else {
      this.insiste = Math.abs(novo - this.cand) < 1.2 ? this.insiste + 1 : 1;
      this.cand = novo;
      if (this.insiste >= 8) {
        this.bpm = novo; this.insiste = 0;
        this.acharFase(ek, hH * 60 / novo);
        if (this.bpmFaixa && Math.abs(novo - this.bpmFaixa) > 2) { this.novaFaixa('andamento'); this.bpmFaixa = novo; }
      }
    }
    // conferida da fase: pelo pente do bumbo. Erro que insiste é fase errada de verdade (faixa nova, ou o começo)
    const fCand = this.estimarFase(ek, hH * 60 / this.bpm);
    if (fCand !== null) {
      const err = ((fCand - this.fase + 0.5) % 1 + 1) % 1 - 0.5;
      if (Math.abs(err) > 0.09) { this.erroFaseConta++; if (this.erroFaseConta >= 4) { this.fase += err; this.erroFaseConta = 0; } }
      else { this.erroFaseConta = 0; this.fase += err * 0.03; }
    }
  }
  // Fase pelo pente: qual deslocamento junta mais força em cima das batidas. Devolve a fase, em voltas, do instante atual.
  estimarFase(e, T) {
    const n = e.length, passos = Math.max(4, Math.round(T));
    let melhor = -1e9, des = 0;
    for (let d = 0; d < passos; d++) {
      let s = 0, peso = 1;
      for (let k = n - 1 - d; k >= 0 && peso > 0.2; k -= T) { s += (e[Math.round(k)] || 0) * peso; peso *= 0.96; }
      if (s > melhor) { melhor = s; des = d; }
    }
    return ((des / T) % 1 + 1) % 1;
  }
  acharFase(e, T) {
    const f = this.estimarFase(e, T);
    if (f !== null) { this.fase = Math.floor(this.fase) + f; this.batida = Math.floor(this.fase); }
  }

  // ---------- harmonia ----------
  passoChroma() {
    const { fftC, NC, anel } = this;
    const m = anel.length;
    fftC.calcular(anel, (this.iAnel - NC + m) % m);
    const c = this.chroma;
    c.fill(0);
    const p = fftC.pot;
    for (const [k, nota, peso] of this.chromaMapa) c[nota] += Math.sqrt(p[k]) * peso;
    let maior = 0, menor = 1e9;
    for (let i = 0; i < 12; i++) { if (c[i] > maior) maior = c[i]; if (c[i] < menor) menor = c[i]; }
    if (maior < 1e-7) return;
    const dtC = this.hopC / this.sr, dec = Math.exp(-dtC / 40);
    for (let i = 0; i < 12; i++) {
      const v = (c[i] - menor * 0.6) / (maior - menor * 0.6);
      this.chromaBatida[i] += v;
      this.chromaLenta[i] = this.chromaLenta[i] * dec + v * (1 - dec);
    }
    this.nChromaBatida++;
    this.proxTom -= dtC;
    if (this.proxTom <= 0) { this.proxTom = 2; this.estimarTom(); }
  }
  estimarTom() {
    const c = this.chromaLenta;
    let m = 0, soma = 0;
    for (let i = 0; i < 12; i++) m += c[i];
    if (m < 1e-6) return;
    m /= 12;
    const corr = (perfil, t) => {
      let num = 0, d1 = 0, d2 = 0, mp = 0;
      for (let i = 0; i < 12; i++) mp += perfil[i];
      mp /= 12;
      for (let i = 0; i < 12; i++) { const a = c[(i + t) % 12] - m, b = perfil[i] - mp; num += a * b; d1 += a * a; d2 += b * b; }
      return num / Math.sqrt(d1 * d2 + 1e-12);
    };
    let melhor = -2, mt = 0, mm = false, seg = -2;
    for (let t = 0; t < 12; t++) for (const maior of [false, true]) {
      const v = corr(maior ? PERFIL_MAIOR : PERFIL_MENOR, t);
      if (v > melhor) { seg = melhor; melhor = v; mt = t; mm = maior; } else if (v > seg) seg = v;
    }
    soma = melhor;
    this.confTom += (clamp01((melhor - seg) * 4 + soma * 0.2) - this.confTom) * 0.3;
    const chave = mt * 2 + (mm ? 1 : 0);
    if (this.tonica < 0) { this.tonica = mt; this.maior = mm; return; }
    if (mt === this.tonica && mm === this.maior) { this.tomInsiste = 0; return; }
    this.tomInsiste = this.tomCand === chave ? this.tomInsiste + 1 : 1;
    this.tomCand = chave;
    if (this.tomInsiste >= 4) { this.tonica = mt; this.maior = mm; this.tomInsiste = 0; this.emitir('tom', { tom: this.tom }); }
  }
  get tom() { return this.tonica < 0 ? '' : camelot(this.tonica, this.maior); }
  get nota() { return this.tonica < 0 ? '' : NOTAS[this.tonica] + (this.maior ? '' : 'm'); }

  // ---------- estrutura: a cada batida ----------
  fimDeBatida() {
    const a = this.acu;
    this.acu = this.novoAcu();
    if (!a.n) return;
    const NB = this.NB, dbMed = new Float64Array(NB);
    for (let k = 0; k < NB; k++) dbMed[k] = a.db[k] / a.n;
    const dur = 60 / (this.bpm || 124);

    // mudança de harmonia nesta batida: é o que mais marca o tempo 1
    let mudou = 0;
    if (this.nChromaBatida) {
      let s = 0;
      for (let i = 0; i < 12; i++) { const v = this.chromaBatida[i] / this.nChromaBatida; s += Math.abs(v - this.chromaAnteriorBatida[i]); this.chromaAnteriorBatida[i] = v; }
      mudou = s / 12;
    }
    this.chromaBatida.fill(0); this.nChromaBatida = 0;

    // Bumbo presente nesta batida: houve golpe perto da grade (o detector se ajusta sozinho) e no nível de sempre.
    // A subida em dB sozinha engana: quando o baixo entra entre os bumbos, ela cai de 68 para 18 dB com o bumbo ainda lá.
    // E, num break, um ruído baixinho também sobe muitos dB. O nível de referência cai devagar, para sobreviver a um break longo.
    const f = a.kickMax;
    this.subs.push(a.subMax);
    if (this.subs.length > 128) this.subs.shift();
    this.refSub = Math.max(this.refSubAgora(), this.refSub - dur * 0.06);
    const anterior = this.batida - 1;
    const viu = this.marcaKick[anterior & 7] === anterior || this.marcaKick[(anterior + 1) & 7] === anterior + 1;
    const pres = viu ? sstep(-11, -5, a.subMax - this.refSub) : 0;
    this.presenca += (pres - this.presenca) * 0.5;
    if (pres > 0.5) { this.semKick = 0; this.comKick++; } else { this.semKick++; if (this.semKick >= 2) this.comKick = 0; }
    // Até 7 tempos sem bumbo é só virada de bateria, dentro da mesma parte da música.
    if (this.semKick === 3) this.emitir('virada', { compasso: this.compasso });

    const rmsB = a.rms / a.n;
    const hatRel = dbMed[5] - rmsB, brilho = a.brilho / a.n, dens = a.hat + a.clap;
    const loudN = this.loud.passo(rmsB + 0.35 * dbMed[0] * 0, dur);
    const hatN = this.hatN.passo(hatRel, dur);
    const brN = this.brilhoN.passo(brilho, dur);
    const densN = this.densN.passo(dens, dur);
    const b = { rms: rmsB, loud: loudN, hat: hatN, brilho: brN, dens: densN, pres, f, mudou, clap: a.clap, db: dbMed };
    this.hist.push(b);
    if (this.hist.length > 256) this.hist.shift();

    // tempo 1: harmonia + bumbo + palma nos tempos 2 e 4
    const pos = ((this.batida - 1) % 4 + 4) % 4;
    const P = this.pesoTempo;
    for (let i = 0; i < 4; i++) P[i] *= 0.99;
    P[pos] += mudou * 2 + (pres > 0.5 ? 0.04 : 0);
    if (a.clap) { P[(pos + 3) % 4] += 0.06; P[(pos + 1) % 4] += 0.06; }
    let mi = this.desloc;
    for (let i = 0; i < 4; i++) if (P[i] > P[mi] * 1.15) mi = i;
    this.desloc = mi;
    const novoNoCompasso = ((pos - this.desloc) % 4 + 4) % 4;
    const virouCompasso = novoNoCompasso === 0 || (novoNoCompasso < this.noCompasso && this.noCompasso !== 3);
    this.noCompasso = novoNoCompasso;
    this.acumularBarra(b);
    if (virouCompasso) this.fimDeCompasso();
    this.julgarSecao(dur);
  }

  acumularBarra(b) {
    const a = this.acuBarra;
    a.n++;
    for (let k = 0; k < this.NB; k++) a.v[k] += b.db[k] - b.rms;
    a.kick += b.pres;
    for (let i = 0; i < 12; i++) a.chroma[i] += this.chromaAnteriorBatida[i];
  }
  fimDeCompasso() {
    this.compasso++;
    const a = this.acuBarra;
    this.acuBarra = this.novoAcuBarra();
    if (a.n) {
      const v = new Float64Array(this.NB + 12);
      for (let k = 0; k < this.NB; k++) v[k] = a.v[k] / a.n / 12;
      for (let i = 0; i < 12; i++) v[this.NB + i] = a.chroma[i] / a.n * 0.6;
      this.barras.push(v);
      if (this.barras.length > 96) this.barras.shift();
      v.kick = a.kick / a.n;
      this.calcularNovidade();
      this.conferirTroca();
    }
    this.emitir('compasso', { compasso: this.compasso, frase: this.posFrase });
    const pf = (this.compasso - this.ancora) % 8;
    if (pf === 0) this.emitir('frase', { compasso: this.compasso, de16: (this.compasso - this.ancora) % 16 === 0 });
  }
  get posFrase() { return (((this.compasso - this.ancora) % 16) + 16) % 16; }

  // Novidade: o som dos últimos 4 compassos contra os 4 anteriores. Salto grande = mudou a parte da música.
  calcularNovidade() {
    const B = this.barras, n = B.length;
    if (n < 8) return;
    const med = (i0, i1) => {
      const m = new Float64Array(B[0].length);
      for (let i = i0; i < i1; i++) for (let k = 0; k < m.length; k++) m[k] += B[i][k];
      for (let k = 0; k < m.length; k++) m[k] /= (i1 - i0);
      return m;
    };
    const a = med(n - 4, n), b = med(n - 8, n - 4);
    let d = 0;
    for (let k = 0; k < a.length; k++) { const x = a[k] - b[k]; d += x * x; }
    d = Math.sqrt(d);
    this.novRef = (this.novRef ?? d) + (d - (this.novRef ?? d)) * 0.06;
    this.novidade = clamp01((d - this.novRef) / Math.max(this.novRef, 0.04) * 0.6);
    if (this.novidade > 0.6 && this.compasso - (this.ultimaNov || -99) >= 8) {
      this.ultimaNov = this.compasso;
      this.emitir('novidade', { forca: +this.novidade.toFixed(2) });
    }
  }

  // Numa mixagem o andamento fica igual. O que entrega a faixa nova é o timbre e a harmonia ficarem diferentes de um jeito que não volta.
  conferirTroca() {
    const B = this.barras.filter(b => b.kick > 0.5), n = B.length;
    if (n < 48) { this.scoreTroca = 0; return; }
    const med = (i0, i1) => {
      const m = new Float64Array(B[0].length);
      for (let i = i0; i < i1; i++) for (let k = 0; k < m.length; k++) m[k] += B[i][k];
      for (let k = 0; k < m.length; k++) m[k] /= (i1 - i0);
      return m;
    };
    const a = med(n - 16, n), b = med(n - 48, n - 16);
    let d = 0;
    for (let k = 0; k < a.length; k++) { const x = a[k] - b[k]; d += x * x; }
    this.scoreTroca = Math.sqrt(d);
    if (this.scoreTroca > this.LIMIAR_TROCA && this.t - this.tFaixa > 100) { this.novaFaixa('som'); this.barras.length = 0; }
  }

  julgarSecao(dur) {
    const H = this.hist, n = H.length;
    if (!n) return;
    const ultimo = H[n - 1];
    this.idadeSecao++;
    // tensão: inclinação dos últimos 16 tempos, mais chimbal, mais brilho e mais densidade
    let incl = 0;
    if (n >= 8) {
      const janela = Math.min(16, n);
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < janela; i++) {
        const h = H[n - janela + i], y = 0.38 * h.brilho + 0.3 * h.hat + 0.2 * h.dens + 0.12 * h.loud;
        sx += i; sy += y; sxx += i * i; sxy += i * y;
      }
      incl = (janela * sxy - sx * sy) / (janela * sxx - sx * sx + 1e-9) * 16;
    }
    const alvoT = sstep(0.1, 0.6, incl);
    this.tensao += (alvoT - this.tensao) * (alvoT > this.tensao ? 0.22 : 0.08);

    // energia: alto + bumbo + chimbal + densidade, puxada com calma
    const alvoE = clamp01(0.38 * ultimo.loud + 0.32 * this.presenca + 0.17 * ultimo.hat + 0.13 * ultimo.dens);
    this.energia += (alvoE - this.energia) * (1 - Math.exp(-dur / 2.5));

    const S = this.secao;
    const trava = this.idadeSecao;
    if (!this.musica) { if (S !== 'silencio' && this.silencioT > 1.4) this.mudarSecao('silencio'); return; }

    // Drop falso: um bumbo solto no meio do break. Volta para o break, sem novo evento.
    if (S === 'drop' && this.semKick >= 6 && trava <= 10) { this.tempoBreak = this.semKick + trava; this.secao = 'break'; this.idadeSecao = 0; this.emitir('secao', { secao: 'break', de: 'drop', falso: true, compasso: this.compasso, energia: +this.energia.toFixed(2) }); return; }
    if (this.semKick >= 8 || ((S === 'break' || S === 'build') && this.comKick < 2)) {
      const quer = this.tensao > 0.42 ? 'build' : 'break';
      if (S !== 'break' && S !== 'build') this.tempoBreak = this.semKick;
      this.tempoBreak++;
      if (quer !== S && (trava >= 4 || (S !== 'break' && S !== 'build'))) this.mudarSecao(quer);
      return;
    }
    if (S === 'break' || S === 'build') { this.chegarDrop(); return; }
    if (S === 'silencio') {
      if (this.comKick >= 2 || this.semKick > 16) this.mudarSecao(this.energia > 0.68 ? 'pico' : this.energia < 0.38 ? 'calmo' : 'groove');
      return;
    }
    if (S === 'drop' && trava < 16) return;
    if (this.tensao > 0.7 && trava >= 4 && S !== 'build') return this.mudarSecao('build');
    const E = this.energia;
    let quer = S;
    if (S === 'pico') { if (E < 0.62) quer = E < 0.34 ? 'calmo' : 'groove'; }
    else if (S === 'calmo') { if (E > 0.44) quer = E > 0.72 ? 'pico' : 'groove'; }
    else { quer = E > 0.7 ? 'pico' : E < 0.36 ? 'calmo' : 'groove'; }
    if (quer !== S && trava >= 16) this.mudarSecao(quer);
  }
  // Volta do bumbo depois de um break de verdade: é o drop. A força vem de quanto tempo ficou sem ele.
  chegarDrop() {
    // Break curto não é drop. E um bumbo que falha logo depois do drop não vira outro drop.
    if (this.tempoBreak < 12 || this.batida - this.ultimoDrop < 32) { this.tempoBreak = 0; this.mudarSecao(this.energia > 0.68 ? 'pico' : this.energia < 0.38 ? 'calmo' : 'groove'); return; }
    this.ultimoDrop = this.batida;
    this.fDrop = clamp01(0.4 + this.tempoBreak / 64);
    this.ancora = this.noCompasso >= 2 ? this.compasso + 1 : this.compasso;
    this.mudarSecao('drop', { forca: +this.fDrop.toFixed(2), semBumbo: this.tempoBreak });
    this.tempoBreak = 0;
  }
  mudarSecao(nova, dados = {}) {
    const antes = this.secao;
    this.secao = nova; this.idadeSecao = 0;
    this.emitir('secao', { secao: nova, de: antes, compasso: this.compasso, energia: +this.energia.toFixed(2), ...dados });
    if (nova === 'drop') this.emitir('drop', { forca: dados.forca });
  }
  novaFaixa(motivo) {
    if (this.t - this.tFaixa < 20) return;
    this.faixa++; this.tFaixa = this.t;
    // o ponto da frase e o tom recomeçam; o andamento fica até dizer o contrário
    this.ancora = this.compasso; this.chromaLenta.fill(0); this.tomInsiste = 0;
    this.emitir('faixa', { faixa: this.faixa, motivo });
  }

  // O que vai para os visuais. "tempo" = fase da batida, contínua
  foto() {
    return {
      t: +this.t.toFixed(3), bpm: +this.bpm.toFixed(2), conf: +this.conf.toFixed(2), fase: +this.fase.toFixed(4), noCompasso: this.noCompasso, compasso: this.compasso, frase: this.posFrase,
      secao: this.secao, idade: this.idadeSecao, energia: +this.energia.toFixed(3), tensao: +this.tensao.toFixed(3), presenca: +this.presenca.toFixed(3),
      kick: +this.kick.toFixed(3), clap: +this.clap.toFixed(3), hat: +this.hat.toFixed(3), baixo: +this.baixo.toFixed(3), medio: +this.medio.toFixed(3), agudo: +this.agudo.toFixed(3), voz: +this.voz.toFixed(3),
      brilho: +this.brilho.toFixed(3), novidade: +this.novidade.toFixed(3), tom: this.tom, nota: this.nota, confTom: +this.confTom.toFixed(2), faixa: this.faixa, musica: this.musica, rms: +this.rmsDb.toFixed(1),
      golpes: this.golpesKick, palmas: this.golpesClap, chimbais: this.golpesHat,
    };
  }
}
