// Moving heads e lasers: show minimalista, de arte e tecnologia. Tudo em prata; a cor vem da camada de cor do app.
// Simetria de verdade: cada cena calcula uma metade e o olhar é dobrado no eixo (abs de x). Não existe jeito de sair torto.
// Até o fim do painel: um feixe que sobe inclinado some no ponto de fuga dele, antes da ponta do teto. A ponta fica a 8,7° do horizonte (0,7532 m para 4,89 m).
// Por isso aqui os feixes correm quase paralelos ao teto, num plano acima dele, e atravessam o painel inteiro.
const SEM_LENTE = /* wgsl */`fn lenteEstrela(w: vec3f, segunda: f32) -> vec4f { return vec4f(w, 1.); }`;
const HT = 0.7532, ZF = 4.39;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const suave = (a, alvo, dt, sobe, desce) => a + (alvo - a) * (1 - Math.exp(-dt * (alvo > a ? sobe : desce)));
// Só o ar é que varia. Dobrado no eixo, para a névoa também ser simétrica.
const WGSL_FEIXE = /* wgsl */`
${SEM_LENTE}
fn nevoa(p: vec3f) -> f32 {
  let n = p * vec3f(.8, .8, .3) + vec3f(0., C.reg[3].z * .16, C.reg[3].z * .07);
  return 1. + elem(3) * (gn(n) * .9 + gn(n * 2.7) * .35);
}
// O olhar (a partir da origem) contra um feixe que sai de P na direção u.
fn feixe(v: vec3f, i: i32) -> f32 {
  let A = C.arr[2 * i]; let B = C.arr[2 * i + 1];
  let I = A.w;
  if (I < .004) { return 0.; }
  let P = A.xyz; let u = B.xyz;
  let b = dot(v, u); let d = dot(v, -P); let e = dot(u, -P);
  let den = max(1. - b * b, .0035);
  var t = (b * e - d) / den;
  var s = (e - b * d) / den;
  if (t < 0.) { t = 0.; s = e; }
  if (s < 0.) { s = 0.; t = max(-d, 0.); }
  let pv = v * t;
  let h = length(pv - (P + u * s));
  let r = .013 + B.w * s;
  let fino = exp(-h * h / (r * r));
  // o miolo, duro, e em volta um véu largo no ar: é o que dá corpo a um feixe de verdade
  let veu = exp(-h * h / (r * r * 14.)) * .1;
  if (fino + veu < .002) { return 0.; }
  return (fino + veu) / (r * 6. + .1) / max(sqrt(den), .1) * I * max(nevoa(pv), .1);
}
`;
const elementos = (nomes, tabela) => ({ elementos: nomes, ...tabela });

// ---------- NAVE: duas fileiras de moving heads, uma de cada lado, cruzando sobre o eixo. Viram costelas de ponta a ponta do painel. ----------
// Bumbo: todas batem juntas. Chimbal: um pulso corre do booth até o fundo. Palma: as pares. Baixo: abre o feixe e sobe a névoa.
const N_NAVE = 13;
const nave = (() => {
  const Y = 1.25, X = 2.7;
  // cada costela nasce onde cai no painel: 9 no teto, de ponta a ponta, e 4 na parede
  const NOTETO = [-4.75, -3.6, -2.45, -1.3, -0.15, 1, 2.15, 3.3, 4.3].map(z => z * Y / HT);
  const POS = [52, 26, 16, 10].concat(NOTETO.slice().reverse());
  const nivel = new Float32Array(N_NAVE);
  let desenho = 0, antes = 0, mistura = 1;
  const DESENHOS = [
    (k, b) => 0,                                            // escada: retas de lado a lado
    (k, b) => 0.3,                                          // setas para o booth
    (k, b) => -0.3,                                         // setas para o fundo
    (k, b) => (k % 2 ? 0.34 : -0.34),                       // losangos: uma para cada lado
    (k, b) => 0.34 * Math.sin(b * Math.PI / 8 + k * 0.62),  // onda lenta, que anda pelo teto
  ];
  return {
    res: [1, 0.36], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.7, semMeteoros: true, luzNaCena: true,
    partitura: elementos(['quantos', 'forca', 'corre', 'nevoa', 'abre'], {
      silencio: [0.1, 0.16, 0, 0.45, 0.2],
      calmo: [0.34, 0.4, 0.2, 0.5, 0.3],
      groove: [0.5, 0.7, 0.7, 0.55, 0.25],
      pico: [1, 1, 1, 0.6, 0.3],
      break: [0.25, 0.55, 0.1, 0.95, 0.9],
      build: [0.7, 0.8, 1, 0.8, 0.15],
      drop: [1, 1.3, 1, 0.7, 0.75],
      pressa: 0.9,
    }),
    iniciar(R) {
      const novo = () => { antes = desenho; desenho = (desenho + 1 + Math.floor(R.seed * 3.99)) % DESENHOS.length; mistura = 0; };
      R.ao.frase.push(novo); R.ao.drop.push(novo); R.ao.faixa.push(novo);
    },
    ritmo: (R, el) => 0.3 + el[3] * 0.4 + R.baixo * 0.5,
    quadro(R, el, f, dt) {
      mistura = Math.min(1, mistura + dt / (60 / R.bpm * 4));
      const k = easeInOut(mistura), b = R.fase;
      // de quantas em quantas costelas acendem: sempre um desenho regular
      const passo = el[0] > 0.8 ? 1 : el[0] > 0.42 ? 2 : el[0] > 0.2 ? 4 : 6;
      const vel = R.secao === 'build' ? (R.tensao > 0.6 ? 2 : 1) : 0.5;
      const frente = ((b * vel) % 1) * (N_NAVE + 3) - 1.5;
      for (let i = 0; i < N_NAVE; i++) {
        const dz = DESENHOS[antes](i, b) + (DESENHOS[desenho](i, b) - DESENHOS[antes](i, b)) * k;
        const dy = 0.035 * Math.sin(b * Math.PI / 4 + i * 0.5) * R.baixo;
        const n = Math.hypot(1, dy, dz);
        const lit = i % passo === 0 ? 1 : 0;
        const dif = i - frente;
        const pulso = Math.exp(-dif * dif / 1.3) * el[2] * (0.25 + R.hat * 1.3);
        const alvo = el[1] * (lit * (0.14 + 0.8 * R.golpe + (i % 2 ? 0 : 0.45 * R.clap)) + pulso);
        nivel[i] = suave(nivel[i], alvo, dt, 70, 11);
        f.set([X, Y + dy * 0, POS[i], nivel[i], -1 / n, dy / n, dz / n, 0.0035 + 0.006 * el[4] + 0.004 * R.baixo], i * 8);
      }
    },
    wgsl: WGSL_FEIXE + /* wgsl */`
fn ceuEm(v0: vec3f) -> vec2f {
  let v = vec3f(abs(v0.x), v0.y, v0.z);
  var l = 0.;
  for (var i = 0; i < ${N_NAVE}; i++) { l += feixe(v, i); }
  return vec2f(l * .6, 1.);
}
`,
  };
})();

// ---------- EIXO: feixes quase paralelos, do booth até o fundo do painel. Abrem, fecham e se cruzam em bloco, como um instrumento só. ----------
// Na parede, as mesmas retas viram um sol atrás do logo. Bumbo: acende. Palma: o eixo central. Chimbal: anda do centro para fora.
const N_EIXO = 9;
const eixo = (() => {
  const Y = 1.1;
  const X = Array.from({ length: N_EIXO }, (_, i) => i * 0.17);
  const nivel = new Float32Array(N_EIXO), atual = new Float32Array(N_EIXO);
  let desenho = 0, antes = 0, mistura = 1;
  const DESENHOS = [
    (x, b) => 0,                                     // paralelas
    (x, b) => x / 17,                                // fecham: cruzam o eixo no meio do teto
    (x, b) => x / 8.6,                               // fecham perto do booth e abrem no fundo
    (x, b) => -x / 19,                               // abrem em leque
    (x, b) => (x / 17) * (0.5 + 0.5 * Math.sin(b * Math.PI / 8)),   // respiram, em 16 tempos
  ];
  return {
    res: [1, 0.4], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.7, semMeteoros: true, luzNaCena: true,
    partitura: elementos(['quantos', 'forca', 'corre', 'nevoa', 'abre'], {
      silencio: [0.12, 0.2, 0, 0.4, 0.2],
      calmo: [0.34, 0.42, 0.15, 0.45, 0.25],
      groove: [0.56, 0.72, 0.6, 0.5, 0.2],
      pico: [1, 1, 1, 0.55, 0.25],
      break: [0.12, 0.7, 0, 0.95, 0.7],
      build: [0.78, 0.82, 1, 0.75, 0.1],
      drop: [1, 1.3, 1, 0.65, 0.6],
      pressa: 0.9,
    }),
    iniciar(R) {
      const novo = () => { antes = desenho; desenho = (desenho + 1 + Math.floor(R.seed * 3.99)) % DESENHOS.length; mistura = 0; };
      R.ao.frase.push(novo); R.ao.drop.push(novo); R.ao.faixa.push(novo);
    },
    ritmo: (R, el) => 0.3 + el[3] * 0.4 + R.baixo * 0.5,
    quadro(R, el, f, dt) {
      mistura = Math.min(1, mistura + dt / (60 / R.bpm * 4));
      const k = easeInOut(mistura), b = R.fase;
      const n = Math.max(1, Math.round(el[0] * N_EIXO));
      const anda = (b * 2) % N_EIXO;
      // no build, todas fecham no eixo, na medida da tensão
      const fecha = R.secao === 'build' ? R.tensao : 0;
      for (let i = 0; i < N_EIXO; i++) {
        const x = X[i];
        const pa = DESENHOS[antes](x, b), pb = DESENHOS[desenho](x, b);
        const alvoP = (pa + (pb - pa) * k) * (1 - fecha) + (x / 22) * fecha;
        atual[i] += (alvoP - atual[i]) * (1 - Math.exp(-dt * 9));
        const nr = Math.hypot(atual[i], 1);
        const dif = i - anda;
        const lit = i < n ? 1 : 0;
        const centro = i === 0 ? 0.9 * R.clap : 0;
        const alvo = el[1] * (lit * (0.14 + 0.72 * R.golpe) + centro + lit * el[2] * Math.exp(-dif * dif * 1.4) * (0.3 + R.hat));
        nivel[i] = suave(nivel[i], alvo, dt, 70, 10);
        f.set([x, Y, 16, nivel[i], -atual[i] / nr, 0, -1 / nr, 0.00012 + 0.0005 * el[4] + 0.00028 * R.baixo], i * 8);
      }
    },
    wgsl: WGSL_FEIXE + /* wgsl */`
fn ceuEm(v0: vec3f) -> vec2f {
  // dobrado também na altura dos olhos: na parede, o que passa por cima volta por baixo, e o sol fica inteiro em volta do logo
  let v = vec3f(abs(v0.x), abs(v0.y), v0.z);
  var l = 0.;
  l += feixe(v, 0);
  let m = vec3f(-v.x, v.y, v.z);
  for (var i = 1; i < ${N_EIXO}; i++) { l += feixe(v, i) + feixe(m, i); }
  return vec2f(l * .6, 1.);
}
`,
  };
})();

// ---------- LOSANGO: moving heads nas duas pontas do painel, booth e fundo. Os feixes se cruzam numa treliça que aperta e abre. ----------
// Bumbo: o lado do booth. Palma: o lado do fundo. Chimbal: um feixe anda pela treliça.
const N_LOS = 12;
const losango = (() => {
  const Y = 1.2;
  // onde cada feixe cruza o eixo: em cima de um mesmo passo, do booth até o fundo
  const POS = [];
  const CRUZA = [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5];
  for (const c of CRUZA) POS.push({ c, z: 16, sz: -1 });
  for (const c of CRUZA) POS.push({ c: -c, z: -16, sz: 1 });
  const nivel = new Float32Array(N_LOS);
  let abre = 0.1;
  return {
    res: [1, 0.36], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.7, semMeteoros: true, luzNaCena: true,
    partitura: elementos(['quantos', 'forca', 'corre', 'nevoa', 'trama'], {
      silencio: [0.34, 0.18, 0, 0.45, 0.3],
      calmo: [0.34, 0.42, 0.15, 0.5, 0.3],
      groove: [0.67, 0.7, 0.6, 0.5, 0.5],
      pico: [1, 1, 1, 0.55, 0.7],
      break: [0.34, 0.6, 0, 0.95, 0.15],
      build: [0.67, 0.82, 1, 0.75, 1],
      drop: [1, 1.3, 1, 0.65, 0.25],
      pressa: 1,
    }),
    ritmo: (R, el) => 0.3 + el[3] * 0.4 + R.baixo * 0.5,
    quadro(R, el, f, dt) {
      const b = R.fase;
      // a trama respira em 8 tempos: quanto mais fechada, mais losangos cabem
      const alvoA = 0.06 + el[4] * 0.1 + 0.018 * Math.sin(b * Math.PI / 4);
      abre += (alvoA - abre) * (1 - Math.exp(-dt * 3.5));
      const n = Math.max(1, Math.round(el[0] * N_LOS / 2));
      const anda = Math.floor(b) % N_LOS;
      for (let i = 0; i < N_LOS; i++) {
        const P = POS[i], j = i % (N_LOS / 2);
        const nr = Math.hypot(abre, 1);
        // sempre indo para o eixo; do outro lado quem aparece é o feixe espelhado
        const lit = (j + (P.sz > 0 ? 3 : 0)) % Math.max(1, Math.round(N_LOS / 2 / n)) === 0 ? 1 : 0;
        const x = abre * Math.abs(P.z - P.c);
        const bate = P.sz < 0 ? R.golpe : R.clap * 0.9 + R.golpe * 0.25;
        const alvo = el[1] * (lit * (0.13 + 0.8 * bate) + (i === anda ? el[2] * (0.25 + R.hat) : 0));
        nivel[i] = suave(nivel[i], alvo, dt, 70, 10);
        f.set([x, Y, P.z, nivel[i], -abre / nr, 0, P.sz / nr, 0.00022 + 0.0004 * R.baixo], i * 8);
      }
    },
    wgsl: WGSL_FEIXE + /* wgsl */`
fn ceuEm(v0: vec3f) -> vec2f {
  let v = vec3f(abs(v0.x), abs(v0.y), v0.z);
  var l = 0.;
  let m = vec3f(-v.x, v.y, v.z);
  for (var i = 0; i < ${N_LOS}; i++) { l += feixe(v, i) + feixe(m, i); }
  return vec2f(l * .72, 1.);
}
`,
  };
})();

// ---------- CORDAS: cordas de laser esticadas do booth até o fim do painel. Cada uma é uma faixa do som, e treme quando a faixa toca. ----------
// O bumbo corre pelas cordas do booth até o fundo. Na parede, as cordas convergem atrás do logo.
const N_CORDAS = 9;
const cordas = {
  res: [1, 0.5], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.5, semMeteoros: true, luzNaCena: true,
  partitura: elementos(['quantas', 'forca', 'treme', 'nevoa', 'corre'], {
    silencio: [0.12, 0.3, 0, 0.3, 0.2],
    calmo: [0.34, 0.5, 0.25, 0.3, 0.4],
    groove: [0.56, 0.68, 0.6, 0.35, 0.8],
    pico: [1, 0.86, 1, 0.4, 1],
    break: [0.12, 0.8, 0.35, 0.8, 0.1],
    build: [0.78, 0.8, 1, 0.5, 1],
    drop: [1, 1.1, 1, 0.5, 1],
    pressa: 0.8,
  }),
  nivel: new Float32Array(N_CORDAS),
  quadro(R, el, f, dt) {
    const n = Math.max(1, Math.round(el[0] * N_CORDAS));
    for (let i = 0; i < N_CORDAS; i++) {
      const lit = i < n ? 1 : 0;
      const band = i < 3 ? R.baixo : i < 6 ? R.medio : R.agudo;
      const centro = i === 0 ? R.clap * 0.9 : 0;
      this.nivel[i] = suave(this.nivel[i], el[1] * lit * (0.22 + 0.55 * band + centro), dt, 60, 8);
      // [i]: força, amplitude, número de ventres, velocidade do tremor
      f.set([this.nivel[i], el[2] * lit * band * band * 0.05, 3 + i * 2, 0], i * 4);
    }
    f.set([el[4], R.tensao, 0, 0], N_CORDAS * 4);
  },
  wgsl: /* wgsl */`
${SEM_LENTE}
const PLANO = 1.;
const GAP = .155;
fn ceuEm(v0: vec3f) -> vec2f {
  let v = vec3f(abs(v0.x), abs(v0.y), v0.z);
  let y = max(v.y, .002);
  let xs = v.x * PLANO / y;
  let zs = v.z * PLANO / y;
  // quanto um pixel anda na conta da corda: a linha nunca é mais fina que ele, ou sumiria no corte do sinal
  let fw = clamp(fwidth(xs), .0002, 4.);
  let zp = v.z * HT / y;
  let ao = clamp((ZF - zp) / 9.2807, 0., 1.);
  let t = C.reg[3].z;
  let corre = C.arr[${N_CORDAS}].x;
  let onda = ondaEm(ao) * corre;
  var l = 0.;
  let some = 1. - smoothstep(GAP * .22, GAP * .7, fw);
  if (some > .001) {
    for (var i = 0; i < ${N_CORDAS}; i++) {
      let A = C.arr[i];
      if (A.x < .004) { continue; }
      let xi = f32(i) * GAP;
      // a corda presa nas duas pontas, com tantos ventres quanto a faixa pede
      let desloc = A.y * sin(ao * 3.14159 * A.z) * sin(t * (9. + f32(i) * 2.3) + f32(i));
      let d = abs(xs - xi - desloc);
      let w = max(fw * .85, .0022);
      let miolo = 1. - smoothstep(w * .45, w * 1.35, d);
      let halo = exp(-d / .018) * .16 + exp(-d / .09) * .035 * (1. + elem(3));
      l += (miolo * 2.6 + halo * 1.5) * A.x * (.62 + 1.6 * onda);
    }
  }
  return vec2f(l * some, 1.);
}
`,
};

// ---------- LÂMINA: leques de laser, um atrás do logo e outro no fundo do painel. Dois sistemas de riscos que se cruzam em moiré. ----------
// Bumbo: acende. Chimbal: mais riscos. Palma: o leque do fundo. Baixo: a varredura empurra. No build os leques fecham.
const lamina = {
  res: [1, 0.5], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.5, semMeteoros: true, luzNaCena: true,
  partitura: elementos(['abre', 'forca', 'fundo', 'nevoa', 'denso'], {
    silencio: [0.12, 0.26, 0, 0.3, 0.1],
    calmo: [0.22, 0.42, 0, 0.35, 0.25],
    groove: [0.42, 0.6, 0.3, 0.35, 0.45],
    pico: [0.7, 0.8, 0.8, 0.4, 0.7],
    break: [0.08, 0.7, 0, 0.9, 0.05],
    build: [0.12, 0.75, 0.5, 0.5, 1],
    drop: [1, 1, 1, 0.45, 0.5],
    pressa: 0.9,
  }),
  varre: 0,
  luz: 0,
  luz2: 0,
  quadro(R, el, f, dt) {
    this.varre += dt * (0.012 + 0.045 * R.baixo) * (R.secao === 'break' ? 0.3 : 1);
    this.luz = suave(this.luz, el[1] * (0.26 + 0.72 * R.golpe + 0.25 * R.hat), dt, 70, 9);
    this.luz2 = suave(this.luz2, el[1] * el[2] * (0.2 + 0.85 * R.clap + 0.3 * R.golpe), dt, 70, 8);
    // abertura do leque em radianos, e distância entre riscos: inteira, para o eixo ficar sempre com um risco
    const denso = 1 + Math.round(el[4] * 3);
    f.set([0.05 + el[0] * 0.5, 0.075 / denso, this.varre, this.luz, this.luz2, el[3], 0, 0], 0);
  },
  wgsl: /* wgsl */`
${SEM_LENTE}
const PLANO = 1.;
const S_BOOTH = ${(ZF / HT + 0.2).toFixed(4)};
const S_FUNDO = ${(-4.95 / HT).toFixed(4)};
fn risco(a: f32, passo: f32, fw: f32) -> f32 {
  let d = abs(fract(a / passo + .5) - .5) * passo;
  let w = max(fw * .9, .0006);
  // quando os riscos ficam mais juntos que os pixels, vira só um brilho: é melhor que o moiré do sinal
  let gasta = 1. - smoothstep(passo * .22, passo * .55, fw);
  return (1. - smoothstep(w * .5, w * 1.4, d)) * gasta + (1. - gasta) * .28;
}
fn ceuEm(v0: vec3f) -> vec2f {
  let v = vec3f(abs(v0.x), max(abs(v0.y), .002), v0.z);
  let A = C.arr[0]; let B = C.arr[1];
  let abre = A.x; let passo = A.y;
  let xs = v.x * PLANO / v.y;
  let zs = v.z * PLANO / v.y;
  let a1 = atan2(xs, max(S_BOOTH - zs, .001));
  let a2 = atan2(xs, max(zs - S_FUNDO, .001));
  let f1 = clamp(fwidth(a1), .00005, 1.);
  let f2 = clamp(fwidth(a2), .00005, 1.);
  // a parede: um leque em volta do logo, com o mesmo passo
  let naParede = step(0., v0.z) * step(v.y * ZF / max(v.z, .001), HT);
  let a3 = atan2(v.x, max(abs(v.y * ZF / max(v.z, .001) - .1132), .001));
  let f3 = clamp(fwidth(a3), .00005, 1.);
  var l = 0.;
  // o eixo fica sempre aceso; a varredura abre a partir dele, para os dois lados ao mesmo tempo
  let dentro1 = 1. - smoothstep(abre * .92, abre, a1);
  let qual1 = step(zs, S_BOOTH) * (1. - naParede);
  l += A.w * qual1 * dentro1 * smoothstep(.1, 1.6, S_BOOTH - zs) * (risco(a1 + A.z * 0., passo, f1) * 1.25 + .012);
  let dentro2 = 1. - smoothstep(abre * .92, abre, a2);
  l += B.x * step(S_FUNDO, zs) * (1. - naParede) * dentro2 * smoothstep(.1, 1.6, zs - S_FUNDO) * (risco(a2 + A.z, passo * 1.08, f2) * 1.1 + .01);
  l += A.w * naParede * (risco(a3, passo * 2., f3) * 1.15 + .02) * (1. - smoothstep(.85, 1.2, a3)) * exp(-a3 * .6);
  return vec2f(l * 1.7, 1.);
}
`,
};

// ---------- PORTAL: pórticos de laser, em fila, atravessando o painel da parede até o fundo. ----------
// Cada bumbo manda um pórtico embora. O chimbal risca a fila, o baixo abre o corredor, e o drop acende todos de uma vez.
const portal = {
  res: [1, 0.5], espelho: false, estrelas: [0, 0], deriva: 0, acumula: 0.5, semMeteoros: true, luzNaCena: true,
  partitura: elementos(['trilhos', 'forca', 'fila', 'nevoa'], {
    silencio: [0, 0.3, 0.3, 0.4],
    calmo: [0, 0.42, 0.45, 0.4],
    groove: [0.3, 0.6, 0.75, 0.4],
    pico: [0.8, 0.82, 1, 0.45],
    break: [0.3, 0.6, 0.15, 0.9],
    build: [0.15, 0.8, 1, 0.5],
    drop: [1, 1.1, 1, 0.5],
    pressa: 0.8,
  }),
  anda: 0,
  luz: 0,
  quadro(R, el, f, dt) {
    // anda em degraus de bumbo, com ease: chega e fica parado até o próximo
    const fr = R.fase - Math.floor(R.fase);
    const v = (R.secao === 'build' && R.tensao > 0.6) ? 2 : 1;
    this.anda = Math.floor(R.fase) * v + easeInOut(Math.min(1, (fr * v % 1) * 1.8));
    this.luz = suave(this.luz, el[1] * (0.3 + 0.7 * R.golpe + 0.2 * R.hat), dt, 70, 9);
    f.set([this.anda, this.luz, el[0], el[2], R.clap, R.drop, R.baixo, R.tensao], 0);
  },
  wgsl: /* wgsl */`
${SEM_LENTE}
const Y_TOPO = 1.25; const X_LADO = 1.18; const VAO = 3.;
fn ceuEm(v0: vec3f) -> vec2f {
  let v = vec3f(abs(v0.x), abs(v0.y), v0.z);
  let A = C.arr[0]; let B = C.arr[1];
  // o corredor: bate no teto dele ou na lateral, o que vier antes
  let tT = Y_TOPO / max(v.y, .0005);
  let tL = (X_LADO + B.z * .1) / max(v.x, .0005);
  let t_ = min(tT, tL);
  let w = v * t_;
  let z = w.z;
  let fz = clamp(fwidth(z), .0004, 8.);
  // pórticos: linhas transversais, andando do booth para o fundo
  let pos = (z + A.x * VAO) / VAO;
  let d = abs(fract(pos + .5) - .5) * VAO;
  // o sinal só leva 1 de cada 2,63 linhas: a linha atravessada precisa ter pelo menos isso
  let lar = max(fz * 1.5, .012);
  let gasta = 1. - smoothstep(VAO * .08, VAO * .3, fz);
  let qual = floor(pos + .5);
  // a fila: de quantos em quantos ficam acesos
  let cada = select(select(1., 2., A.w < .8), 4., A.w < .4);
  let vale = 1. - step(.5, abs(qual / cada - round(qual / cada)) * cada);
  var l = (1. - smoothstep(lar * .5, lar * 1.4, d)) * 2.6 * vale * gasta;
  l += exp(-d / .1) * .22 * vale * gasta;
  // os trilhos: a linha das quinas, do booth até o fundo
  let tri = A.z;
  if (tri > .01) {
    let canto = abs(tT - tL) / max(t_, .001);
    let fc = clamp(fwidth(canto), .0002, 1.);
    l += tri * (1. - smoothstep(max(fc, .001) * .7, max(fc, .001) * 1.6, canto)) * 1.3;
  }
  // o drop acende o corredor inteiro por um instante
  l += B.y * .18;
  return vec2f(l * A.y * 1.5, 1.);
}
`,
};

export const CENAS_LUZ = { nave, eixo, losango, cordas, lamina, portal };
