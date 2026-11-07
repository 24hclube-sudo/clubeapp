// O maestro traduz a análise de som em intenção musical, para as cenas não reagirem a cada oscilação da entrada:
// - pulso próprio: BPM firme, por intervalos entre bumbos reais, e fase corrigida aos poucos. O BPM da análise oscila quando a entrada está estourada.
// - golpe: só bumbo de verdade, perto da grade quando o pulso está firme. A batida prevista só marca o tempo, não mexe em massa grande.
// - tudo que move massa passa por mola: tem peso, atraso e acomodação, e não copia o tremor do sinal.
// - energia e seção: calma quando o bumbo some ou a música baixa; virada quando o bumbo volta forte.
// - onda: guarda o bumbo dos últimos 2 s, para ele andar pelo espaço em vez de bater em tudo ao mesmo tempo.
import { A, R, Q, audioVivo, criarSom } from '../pista-quente/nucleo.js';
import { REACOES } from '../js/reacoes.js';

// Abaixo disto é o ruído da entrada: o cabo do DJ fica em -35 dBFS sem ninguém tocando, e a análise normaliza esse ruído até parecer música.
const pisoFixo = Q.get('piso');
const pisoDe = () => (pisoFixo !== null ? parseFloat(pisoFixo) : REACOES.som.piso);

export class Mola {
  constructor(x = 0) { this.x = x; this.v = 0; }
  // w: rapidez em rad/s; z: 1 sem repique, menos de 1 com repique
  passo(alvo, dt, w = 12, z = 0.8) {
    const h = Math.min(dt, 1 / 30) / 2;
    for (let i = 0; i < 2; i++) {
      this.v += (w * w * (alvo - this.x) - 2 * z * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  empurrar(v) { this.v += v; }
}

const dobrar = bpm => { while (bpm < 96) bpm *= 2; while (bpm >= 160) bpm /= 2; return bpm; };

export function criarMaestro() {
  A.semMudos = true;   // aqui cada elemento escolhe a própria fonte: os interruptores dos demais visuais não valem
  const HZ = 120, BUF = HZ * 2;
  const hist = new Float32Array(BUF);
  let iHist = 0, sobra = 0;
  const onsets = [];
  const pesos = new Float32Array(4);
  const M = {
    fase: 0, bpm: 124, firme: 0, batida: 0, tempo1: 0,
    kick: 0, grave: 0, medio: 0, agudo: 0, energia: 0.5, calma: false, semBumbo: 0, somReal: false,
    aoGolpe: null, aoBatida: null, aoVirada: null,
    golpes: 0, reais: 0, foraDaGrade: 0, viradas: 0,
    // bumbo atrasado em s: é o que anda pelo espaço
    atraso(s) {
      const p = iHist - 1 - Math.max(0, s) * HZ;
      const i0 = Math.floor(p), f = p - i0;
      if (s * HZ >= BUF - 2) return 0;
      return hist[((i0 % BUF) + BUF) % BUF] * (1 - f) + hist[(((i0 + 1) % BUF) + BUF) % BUF] * f;
    },
    get primeiroTempo() { return M.batida % 4 === M.tempo1; },
    get duracao() { return 60 / M.bpm; },
  };
  const molaG = new Mola(), molaM = new Mola(), molaA = new Mola();
  let tetoG = 0.6, pisoG = 0.3;
  let alvoKick = 0, ateVirada = 0, nivelLento = 0.4, teto = 0.6, piso = 0.2, ultimoBatida = 0;

  function reestimar(agora) {
    while (onsets.length && agora - onsets[0] > 14) onsets.shift();
    if (onsets.length < 8) return;
    const bins = new Float32Array(66);
    for (let i = 1; i < onsets.length; i++) {
      for (let j = 1; j <= 4 && i - j >= 0; j++) {
        const d = onsets[i] - onsets[i - j];
        if (d < 0.25 || d > 2.6) continue;
        for (const n of [1, 2, 3, 4]) {
          const b = 60 / (d / n);
          if (b < 96 || b >= 162) continue;
          const k = Math.floor(b - 96);
          bins[k] += 1 / j / n;
          if (k + 1 < 66) bins[k + 1] += 0.4 / j / n;
        }
      }
    }
    let melhor = 0, kb = -1;
    for (let k = 0; k < 66; k++) {
      // prefere o andar de pista quando duas leituras empatam
      const v = bins[k] * Math.exp(-Math.pow(Math.log2((96 + k) / 124), 2) * 1.2);
      if (v > melhor) { melhor = v; kb = k; }
    }
    if (kb < 0) return;
    const novo = 96.5 + kb;
    if (Math.abs(novo - M.bpm) < 6) M.bpm += (novo - M.bpm) * 0.12;
    else { M.insiste = Math.abs(novo - (M.cand || 0)) < 3 ? (M.insiste || 0) + 1 : 1; M.cand = novo; if (M.insiste >= 5) { M.bpm = novo; M.insiste = 0; } }
  }

  const golpe = forca => {
    // Sem música, quem chama aqui é o relógio interno da análise: não é bumbo e não mexe em nada.
    if (!M.somReal) return;
    // A análise dispara também a batida prevista. Sem bumbo real recente, conta só como tempo.
    const agora = M.relogio;
    const vivo = audioVivo();
    const erro = M.fase - Math.round(M.fase);
    M.reais++;
    if (vivo) {
      onsets.push(agora);
      reestimar(agora);
      if (Math.abs(erro) < 0.2) {
        M.fase -= erro * 0.16;
        M.bpm -= erro * 0.5;
        M.firme += (1 - M.firme) * 0.12;
        pesos[(((Math.round(M.fase) % 4) + 4) % 4)] += forca;
      } else {
        M.firme *= 0.9;
        M.foraDaGrade++;
        // fora da grade com pulso firme é contratempo ou caixa: não bate como bumbo
        if (M.firme > 0.55) return;
        // pulso sem firmeza: o bumbo manda
        if (M.firme < 0.25) M.fase = Math.round(M.fase + erro);
      }
    }
    M.bpm = dobrar(Math.max(60, Math.min(200, M.bpm)));
    const voltou = M.semBumbo >= 6 && ateVirada <= 0 && forca > 0.45;
    M.semBumbo = 0;
    alvoKick = Math.max(alvoKick, 0.45 + forca * 0.55);
    M.golpes++;
    if (M.aoGolpe) M.aoGolpe(forca);
    if (voltou) { ateVirada = 16; M.viradas++; if (M.aoVirada) M.aoVirada(forca); }
  };

  const nivelDe = f => {
    switch (f) {
      case 'bumbo': return M.kick;
      case 'grave': return M.grave;
      case 'medio': return M.medio;
      case 'agudo': return M.agudo;
      case 'volume': return (M.grave + M.medio + M.agudo) / 3;
      default: return 0;
    }
  };
  // quanto o elemento recebe agora, de 0 a 1
  // a força geral do app, para compensar o que vem da mesa
  M.fonte = item => Math.min(1, nivelDe(REACOES.led[item]) * REACOES.som.forca / 100);
  M.modo = item => REACOES.led[item];
  // o elemento deve disparar neste quadro? Bumbo é o golpe de verdade; as outras fontes disparam quando sobem. "Fixo" dispara a cada tantos segundos, com ou sem som.
  const disparos = {};
  M.disparou = (item, dt, fixoCada = 2) => {
    const f = REACOES.led[item];
    const e = disparos[item] || (disparos[item] = { golpes: M.golpes, alto: false, espera: 0, t: 0 });
    e.espera -= dt;
    if (f === 'fixo') { e.t += dt; if (e.t < fixoCada) return false; e.t = 0; return true; }
    if (f === 'bumbo') { const novo = M.golpes !== e.golpes; e.golpes = M.golpes; return novo; }
    e.golpes = M.golpes;
    if (f === 'desligado') return false;
    const v = Math.min(1, nivelDe(f) * REACOES.som.forca / 100);
    if (!e.alto && v > 0.6 && e.espera <= 0) { e.alto = true; e.espera = 0.18; return true; }
    if (e.alto && v < 0.4) e.alto = false;
    return false;
  };

  const som = criarSom({ aoBumbo: f => golpe(f) });
  M.relogio = 0;

  let acima = 0;
  M.quadro = dt => {
    M.relogio += dt;
    // abre com 0,25 s de música acima do piso, para um estalo no cabo não contar; fecha 1,4 s depois de ela parar
    acima = audioVivo() && A.rmsDb > pisoDe() ? Math.min(0.6, acima + dt) : Math.max(0, acima - dt * 0.25);
    M.somReal = acima > 0.25;
    som(dt);
    // sem música, a análise inventa uma batida para os visuais antigos: aqui ela não entra em nada
    if (!M.somReal) { R.grave = R.medio = R.agudo = R.nivel = R.bumbo = 0; R.faixas.fill(0); }
    M.fase += dt * M.bpm / 60;
    const bat = Math.floor(M.fase);
    if (bat !== M.batida) {
      M.batida = bat;
      if (bat !== ultimoBatida) {
        ultimoBatida = bat;
        M.semBumbo++;
        ateVirada = Math.max(0, ateVirada - 1);
        pesos.forEach((_, i) => { pesos[i] *= 0.985; });
        let mi = 0;
        for (let i = 1; i < 4; i++) if (pesos[i] > pesos[mi] * 1.05) mi = i;
        M.tempo1 = mi;
        if (M.aoBatida) M.aoBatida();
      }
    }
    // ataque curto de 2 quadros do sinal a 30 Hz: pulso de um quadro só pisca e some no LED
    const dur = 60 / M.bpm;
    alvoKick *= Math.exp(-dt * 4.2 / dur);
    M.kick += (alvoKick - M.kick) * (1 - Math.exp(-dt * (alvoKick > M.kick ? 40 : 18)));
    // a análise já normaliza, mas com música cheia o grave fica sempre alto: aqui ele vai de 0 a 1 entre o vale e o pico dos últimos segundos
    if (M.somReal) {
      tetoG = Math.max(R.grave, tetoG - dt * 0.06);
      pisoG = Math.min(R.grave, pisoG + dt * 0.06);
    }
    const gN = M.somReal ? Math.max(0, Math.min(1, (R.grave - pisoG) / Math.max(tetoG - pisoG, 0.18))) : 0;
    M.grave = molaG.passo(gN, dt, 30, 1);
    M.medio = molaM.passo(M.somReal ? R.medio : 0, dt, 20, 1);
    M.agudo = molaA.passo(M.somReal ? R.agudo : 0, dt, 34, 1);
    A.estrelas = +M.fonte('estrelas').toFixed(3); A.somReal = M.somReal; A.piso = pisoDe();
    sobra += dt;
    while (sobra >= 1 / HZ) { sobra -= 1 / HZ; hist[iHist % BUF] = M.kick; iHist++; }
    // energia: nível lento da música em relação ao que ela já fez nos últimos minutos
    const inst = M.somReal ? R.grave * 0.55 + R.medio * 0.2 + R.agudo * 0.25 + (M.semBumbo < 2 ? 0.3 : 0) : 0;
    nivelLento += (inst - nivelLento) * (1 - Math.exp(-dt / 2.4));
    teto = Math.max(nivelLento, teto - dt * 0.004);
    piso = Math.min(nivelLento, piso + dt * 0.004);
    const alvoE = Math.max(0, Math.min(1, (nivelLento - piso) / Math.max(teto - piso, 0.2)));
    M.energia += (alvoE - M.energia) * (1 - Math.exp(-dt / 1.2));
    M.calma = M.semBumbo >= 5 || M.energia < 0.28;
    M.firme = Math.max(0, M.firme - dt * 0.01);
  };
  M.estado = () => ({ somReal: M.somReal, grave: +M.grave.toFixed(3), kick: +M.kick.toFixed(3), rms: +A.rmsDb.toFixed(1), bpm: +M.bpm.toFixed(1), firme: +M.firme.toFixed(2), energia: +M.energia.toFixed(2), calma: M.calma, golpes: M.golpes, reais: M.reais, fora: M.foraDaGrade, viradas: M.viradas, semBumbo: M.semBumbo, bpmAnalise: +(A.bpm || 0).toFixed(1), conf: +(A.confianca || 0).toFixed(2) });
  return M;
}
