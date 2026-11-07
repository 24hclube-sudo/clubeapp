// As cenas da Regência. Cada instrumento tem um elemento só dele, e a seção da música diz quais elementos aparecem.
// partitura: valor de cada elemento em cada seção (0 a 1). quadro: o que anda a cada quadro, preso à grade. wgsl: ceuEm(v), por direção do olhar.
// Tudo em tons de prata: a cor entra pela camada de cor do app, por cima de tudo.
import { CENAS_LUZ } from './cenas-luz.js';
const SEM_LENTE = /* wgsl */`fn lenteEstrela(w: vec3f, segunda: f32) -> vec4f { return vec4f(w, 1.); }`;

class Mola {
  constructor(x = 0) { this.x = x; this.v = 0; this.alvo = x; }
  passo(dt, w = 14, z = 0.55) {
    const h = Math.min(dt, 1 / 30) / 3;
    for (let i = 0; i < 3; i++) { this.v += (w * w * (this.alvo - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- ASTROLÁBIO: um instrumento antigo do tamanho do céu. Cada anel de inox é de um instrumento da música. ----------
// Bumbo: anel maior avança um dente a cada batida, com mola. Palma: um anel vira. Baixo: um anel balança. Chimbal: a fita de luz corre. Voz: o anel fino abre.
// No drop, todos se alinham em volta do logo e viram um túnel até a parede.
const N_ANEIS = 9;
const astrolabio = (() => {
  const CENTRO = [0, 3.2, 2.6];
  // raio, meia largura, espessura, instrumento
  const BASE = [
    { r: 3.4, w: 0.3, th: 0.16, papel: 'kick' },
    { r: 4.6, w: 0.2, th: 0.1, papel: 'hat' },
    { r: 5.7, w: 0.42, th: 0.22, papel: 'baixo' },
    { r: 7.2, w: 0.24, th: 0.12, papel: 'clap' },
    { r: 8.6, w: 0.56, th: 0.28, papel: 'kick2' },
    { r: 10.4, w: 0.16, th: 0.1, papel: 'voz' },
    { r: 12.2, w: 0.42, th: 0.2, papel: 'lento' },
    { r: 15.0, w: 0.72, th: 0.3, papel: 'lento2' },
    { r: 19.0, w: 0.6, th: 0.26, papel: 'lento3' },
  ];
  const A = BASE.map((b, i) => ({ ...b, tilt: new Mola(0.5 + i * 0.73), yaw: new Mola(i * 1.31), gira: new Mola(i * 0.5), luz: 0, flip: 1 }));
  let tunel = new Mola(0), ultFrase = -1;
  return {
    res: [1, 0.38], espelho: false, estrelas: [5200, 1200], deriva: 0.03, acumula: 0.72, pula: 1,
    partitura: {
      elementos: ['aneis', 'tunel', 'fita', 'nevoa', 'giro'],
      silencio: [0.12, 0, 0, 0.1, 0.1],
      calmo: [0.45, 0, 0.25, 0.35, 0.2],
      groove: [0.8, 0, 0.7, 0.4, 0.6],
      pico: [1, 0, 1, 0.55, 1],
      break: [0.3, 0, 0.12, 0.8, 0.15],
      build: [0.6, 0.15, 0.85, 0.9, 1],
      drop: [1, 1, 1, 0.75, 0.7],
      pressa: 1.4,
    },
    iniciar(R) {
      R.ao.batida.push(() => {
        // o dente: um passo por batida, só com bumbo tocando
        if (R.presenca > 0.5) { A[0].tilt.alvo += Math.PI / 8; A[4].gira.alvo += Math.PI / 16; }
      });
      R.ao.compasso.push(() => { A[6].yaw.alvo += 0.12; A[7].tilt.alvo -= 0.1; });
      R.ao.frase.push(() => {
        // a cada 8 compassos a máquina muda de posição
        const s = R.seed * 100;
        A.forEach((a, i) => { a.yaw.alvo += (hash(s + i) - 0.5) * 2.4; a.tilt.alvo += (hash(s + i * 3.1) - 0.5) * 1.8; });
      });
      R.ao.drop.push(() => { A.forEach((a, i) => { a.gira.alvo += 1.5 + i * 0.2; }); });
      R.ao.faixa.push(() => { A.forEach((a, i) => { a.yaw.alvo += (hash(R.seed * 77 + i) - 0.5) * 4; }); });
    },
    ritmo: (R, el) => 0.2 + el[4] * 1.2 + R.tensao * 2.5,
    quadro(R, el, f, dt) {
      if (R.clap > 0.8 && !this._cl) { A[3].tilt.alvo += Math.PI / 2 * A[3].flip; this._cl = true; } else if (R.clap < 0.3) this._cl = false;
      A[1].gira.alvo += dt * (0.1 + 0.8 * el[4] + R.hat * 2 + R.tensao * 4);
      A[2].tilt.alvo = A[2].base ?? (A[2].base = A[2].tilt.alvo);
      A[5].gira.alvo += dt * 0.08;
      tunel.alvo = el[1];
      const k = tunel.passo(dt, 7, 0.8);
      const m = Math.max(0, Math.min(1, k));
      for (let i = 0; i < N_ANEIS; i++) {
        const a = A[i];
        const w = a.papel === 'clap' ? 22 : a.papel.startsWith('lento') ? 3 : a.papel === 'kick' || a.papel === 'kick2' ? 30 : 7;
        a.tilt.passo(dt, w, a.papel === 'kick' ? 0.42 : 0.7);
        a.yaw.passo(dt, 2.4, 1);
        a.gira.passo(dt, a.papel === 'kick2' ? 26 : 8, 0.5);
        const extra = a.papel === 'baixo' ? R.baixo * 0.28 : a.papel === 'voz' ? R.voz * 0.55 : 0;
        const al = a.tilt.x + extra, be = a.yaw.x;
        // armila: mesmo centro, cada um num plano
        const nA = [Math.sin(be) * Math.cos(al), Math.sin(al), Math.cos(be) * Math.cos(al)];
        // túnel: anéis um atrás do outro, com o logo no meio
        const zT = -3 + i * 3.1, rT = 1.15 + 0.08 * i;
        const nT = [0, 0.024, 1];
        const c = CENTRO.map((v, j) => v * (1 - m) + (j === 0 ? 0 : j === 1 ? 0.024 * zT + 0.11 : zT) * m);
        const n = nA.map((v, j) => v * (1 - m) + nT[j] * m);
        const nl = Math.hypot(...n) || 1;
        const r = a.r * (1 - m) + rT * m;
        const on = i / N_ANEIS < el[0] ? 1 : Math.max(0, 1 - (i / N_ANEIS - el[0]) * 6);
        let luz = 0.1 * el[2];
        if (a.papel === 'kick' || a.papel === 'kick2') luz = R.golpe * el[2] * 1.5;
        else if (a.papel === 'clap') luz = R.clap * el[2] * 1.5;
        else if (a.papel === 'hat') luz = R.hat * el[2] * 1.2;
        else if (a.papel === 'baixo') luz = R.baixo * R.baixo * el[2];
        else if (a.papel === 'voz') luz = R.voz * 1.2;
        else luz = R.drop * 1.3 + R.energia * 0.2 * el[2];
        f.set([c[0], c[1], c[2], r, n[0] / nl, n[1] / nl, n[2] / nl, a.w * (0.6 + 0.4 * (1 - m)) * on, a.gira.x, luz, (i + 0.5) / N_ANEIS, a.th], i * 3 * 4);
      }
    },
    wgsl: /* wgsl */`
${SEM_LENTE}
const N_ANEIS = ${N_ANEIS};
struct Hit { t: f32, i: i32, h: f32, ang: f32, n: vec3f, face: f32 };
fn cruzar(o: vec3f, d: vec3f, i: i32, m: ptr<function, Hit>) {
  let A = C.arr[3 * i]; let B = C.arr[3 * i + 1]; let D = C.arr[3 * i + 2];
  let w = B.w;
  if (w < .002) { return; }
  let n = B.xyz; let oc = o - A.xyz; let th = D.w;
  let dn = dot(d, n); let on = dot(oc, n);
  let a = d - n * dn; let b = oc - n * on;
  let qa = dot(a, a) + 1e-9; let qb = dot(a, b); let bb = dot(b, b);
  for (var c = 0; c < 2; c++) {
    let R = A.w + th * f32(c);
    let disc = qb * qb - qa * (bb - R * R);
    if (disc < 0.) { continue; }
    let sq = sqrt(disc);
    for (var s = -1.; s < 2.; s += 2.) {
      let t = (-qb + s * sq) / qa;
      if (t < .01 || t >= (*m).t) { continue; }
      let h = on + t * dn;
      if (abs(h) > w) { continue; }
      var nn = (b + a * t) / R;
      let ang = atan2(dot(nn, normalize(cross(n, vec3f(.1, 1., .03)))), dot(nn, cross(n, normalize(cross(n, vec3f(.1, 1., .03))))));
      if (dot(nn, d) > 0.) { nn = -nn; }
      *m = Hit(t, i, h / w, ang + D.x, nn, f32(c));
    }
  }
  if (abs(dn) > 1e-4) {
    for (var s = -1.; s < 2.; s += 2.) {
      let t = (s * w - on) / dn;
      if (t < .01 || t >= (*m).t) { continue; }
      let p = oc + d * t;
      let pr = p - n * dot(p, n);
      let rr = length(pr);
      if (rr < A.w || rr > A.w + th) { continue; }
      var nn = n * s;
      if (dot(nn, d) > 0.) { nn = -nn; }
      *m = Hit(t, i, s, 0., nn, 2.);
    }
  }
}
fn envA(r: vec3f) -> f32 {
  let k = C.reg[1].x;
  // preto de verdade, com poucas luzes. Fundo cinza no metal já foi rejeitado.
  var l = .004;
  let s1 = abs(sin(r.x * 4.1 + r.z * .7 + .4));
  l += smoothstep(.93, .985, s1) * (.8 + 1.2 * k) * smoothstep(-.1, .4, r.y);
  let c = max(dot(r, vec3f(0., .1, .995)), 0.);
  l += pow(c, 30.) * (2.2 + 6. * k) + pow(c, 5.) * .12;
  return l;
}
// Metal torneado: o fio corre em volta do anel, e o brilho abre em leque, como num disco de aço. Ele corre pelo anel quando o anel vira.
fn torneado(t: vec3f, d: vec3f, L: vec3f, p: f32) -> f32 {
  let H = normalize(L - d);
  let th = dot(t, H);
  return pow(max(1. - th * th, 0.), p);
}
fn sombrear(m: Hit, o: vec3f, d: vec3f, salto: i32) -> f32 {
  let D = C.arr[3 * m.i + 2];
  let n = m.n;
  var lum = 0.;
  // escovado: o reflexo abre no sentido da largura do anel
  let eixo = C.arr[3 * m.i + 1].xyz;
  let fio = sin(m.h * 23. + f32(m.i) * 2.1);
  let r = reflect(d, normalize(n + eixo * fio * .008));
  var fundo = envA(r);
  if (salto > 0) {
    var m2 = Hit(1e9, -1, 0., 0., vec3f(0.), 0.);
    let o2 = o + d * m.t + n * .01;
    for (var j = 0; j < N_ANEIS; j++) { if (j != m.i) { cruzar(o2, r, j, &m2); } }
    if (m2.i >= 0) { fundo = sombrear2(m2, r); }
  }
  // dentes e marcas gravadas, como um instrumento
  let u = m.ang / 6.2831853;
  let aa = max(PA * m.t * 3., .0012);
  let dentes = 48. + f32(m.i % 3) * 24.;
  let marca = smoothstep(.5 - aa * dentes, .5, abs(fract(u * dentes) - .5)) * smoothstep(.72, .9, abs(m.h));
  let marca2 = smoothstep(.5 - aa * 8., .5, abs(fract(u * 8.) - .5)) * smoothstep(.45, .6, abs(m.h));
  // canais usinados na largura do anel
  let canal = .72 + .28 * smoothstep(.3, .7, abs(fract(m.h * 6.) - .5) * 2.);
  let tg = normalize(cross(eixo, n));
  let k = C.reg[1].x;
  let leque = torneado(tg, d, vec3f(0., .1, .995), 260.) * (.75 + 2.4 * k) + torneado(tg, d, normalize(vec3f(.6, .75, .2)), 420.) * .42 + torneado(tg, d, normalize(vec3f(-.7, .55, -.4)), 420.) * .34;
  // chanfro: a beira do anel pega a luz
  let beira = smoothstep(.94, .995, abs(m.h)) * (1. - step(1.5, m.face));
  lum = (fundo * .7 + leque * canal) * (1. - .8 * max(marca, marca2)) + beira * (.28 + .9 * k);
  // fita de luz no meio do anel: é a voz daquele instrumento
  if (m.face < .5) {
    let bandaF = 1. - smoothstep(.13, .17, abs(m.h));
    let nSeg = 128.;
    let sF = u * nSeg;
    // a fita é uma fileira de pontos de luz, mais forte no meio de cada um
    let seg = pow(max(1. - abs(fract(sF) - .5) * 2.15, 0.), 1.4);
    let idx = fract(floor(sF) / nSeg + C.reg[3].z * .02 * f32(1 + m.i % 3));
    let esp = espectro(abs(idx * 2. - 1.));
    let ativa = D.y * (.3 + 2.2 * esp * esp);
    lum = mix(lum, lum * .15, bandaF) + bandaF * seg * ativa * 6.;
  }
  return lum;
}
fn sombrear2(m: Hit, d: vec3f) -> f32 {
  let D = C.arr[3 * m.i + 2];
  let r = reflect(d, m.n);
  let banda = 1. - smoothstep(.16, .24, abs(m.h));
  return envA(r) * .35 + banda * D.y * 1.4 * step(m.face, .5);
}
fn ceuEm(v: vec3f) -> vec2f {
  var m = Hit(1e9, -1, 0., 0., vec3f(0.), 0.);
  for (var i = 0; i < N_ANEIS; i++) { cruzar(vec3f(0.), v, i, &m); }
  let nevoa = elem(3);
  // névoa: cada fita acesa ilumina o ar em volta
  var ar = 0.;
  for (var i = 0; i < N_ANEIS; i++) {
    let A = C.arr[3 * i]; let B = C.arr[3 * i + 1]; let D = C.arr[3 * i + 2];
    if (B.w < .002 || D.y < .02) { continue; }
    let dn = dot(v, B.xyz);
    if (abs(dn) < .001) { continue; }
    let t = dot(A.xyz, B.xyz) / dn;
    if (t < 0. || t > m.t) { continue; }
    let q = v * t - A.xyz;
    let e = abs(length(q) - A.w);
    ar += D.y * exp(-e * 1.3 / (1. + t * .03)) * min(abs(dn) * 3., 1.);
  }
  let brilhoAr = ar * nevoa * .05 * (.8 + .5 * gn(v * 6. + vec3f(0., C.reg[3].z * .05, 0.)));
  // o céu preto ganha um véu fino, só para dar profundidade
  let veu = (.012 + C.reg[2].w * .012) * nevoa * max(v.z, 0.);
  if (m.i < 0) { return vec2f(brilhoAr + veu, 1.); }
  let some = exp(-m.t * .022);
  let lum = sombrear(m, vec3f(0.), v, 1) * some;
  return vec2f(lum + brilhoAr, 0.);
}
`,
  };
})();

// ---------- FEIXES: moving lights de verdade numa névoa, do booth para cima da pista. ----------
// As luzes são presas à grade: a cada 8 compassos muda o desenho, no build fecham no centro e o portão acelera, no drop abrem tudo de uma vez.
const N_FEIXES = 24;
const feixes = (() => {
  const POS = [];
  for (let i = 0; i < 12; i++) POS.push({ p: [-1.05 + i * (2.1 / 11), i % 2 ? 0.74 : -0.38, 4.62], fundo: false, xn: -1 + i * (2 / 11) });
  for (let i = 0; i < 12; i++) POS.push({ p: [-2.6 + i * (5.2 / 11), 2.1 + (i % 2) * 0.5, -7], fundo: true, xn: -1 + i * (2 / 11) });
  let padrao = 0, padraoAntes = 0, misturaP = 1;
  const nivel = new Float32Array(N_FEIXES);
  const atual = POS.map(() => [0, 0, -1]);
  const DESENHOS = [
    // leque abrindo
    (x, b) => [x * 0.72 + 0.1 * Math.sin(b * Math.PI / 4 + x * 2), 0.34 + 0.09 * Math.sin(b * Math.PI / 8)],
    // cruzado
    (x, b) => [-x * 0.64 + 0.2 * Math.sin(b * Math.PI / 2), 0.3 + 0.1 * Math.cos(b * Math.PI / 2 + x)],
    // onda
    (x, b) => [x * 0.42, 0.34 + 0.24 * Math.sin(b * Math.PI / 2 + x * 3.2)],
    // círculo
    (x, b) => [0.42 * Math.sin(b * Math.PI / 4 + x * 3.1), 0.36 + 0.22 * Math.cos(b * Math.PI / 4 + x * 3.1)],
    // varrida em degraus: pula a cada 2 tempos
    (x, b) => { const q = Math.floor(b / 2), fr = easeInOut(Math.min(1, ((b / 2) % 1) * 2.6)), a = Math.sin(q * 1.7), n = Math.sin((q + 1) * 1.7); return [(a + (n - a) * fr) * 0.55 + x * 0.14, 0.3]; },
  ];
  return {
    res: [1, 0.3], espelho: false, estrelas: [3200, 700], deriva: 0.02, acumula: 0.8, semMeteoros: true,
    partitura: {
      elementos: ['quantos', 'forca', 'abre', 'nevoa', 'gobo', 'laser'],
      silencio: [0.1, 0.25, 0.5, 0.5, 0, 0],
      calmo: [0.2, 0.55, 0.42, 0.55, 0.4, 0],
      groove: [0.55, 0.8, 0.3, 0.6, 0.15, 0.2],
      pico: [1, 1, 0.28, 0.62, 0, 0.8],
      break: [0.12, 0.8, 0.5, 0.95, 1, 0],
      build: [0.8, 0.9, 0.1, 0.9, 0.2, 0.3],
      drop: [1, 1.25, 0.65, 0.7, 0, 1],
      pressa: 0.9,
    },
    iniciar(R) {
      const novoDesenho = () => { padraoAntes = padrao; padrao = Math.floor(R.seed * DESENHOS.length * 7) % DESENHOS.length; if (padrao === padraoAntes) padrao = (padrao + 1) % DESENHOS.length; misturaP = 0; };
      R.ao.frase.push(novoDesenho);
      R.ao.drop.push(novoDesenho);
      R.ao.faixa.push(novoDesenho);
    },
    ritmo: (R, el) => 0.35 + el[3] * 0.4 + R.baixo * 0.6,
    quadro(R, el, f, dt) {
      misturaP = Math.min(1, misturaP + dt / (60 / R.bpm * 2));
      const k = easeInOut(misturaP);
      const b = R.fase;
      const q = Math.floor(b);
      // portão: no build vai de 1 para 2 para 4 aberturas por batida. Nunca mais que isso: acima de 8 por segundo vira strobo sem ninguém pedir.
      const tx = R.secao === 'build' ? (R.tensao > 0.7 ? 4 : R.tensao > 0.35 ? 2 : 1) : 0;
      const gate = tx ? 0.35 + 0.65 * Math.exp(-((b * tx) % 1) * 4) : 1;
      const N = Math.max(1, Math.round(el[0] * N_FEIXES));
      for (let i = 0; i < N_FEIXES; i++) {
        const P = POS[i];
        const ordem = (i * 7) % N_FEIXES;
        const on = ordem < N ? 1 : 0;
        const [pa, ta] = DESENHOS[padraoAntes](P.xn, b), [pb, tb] = DESENHOS[padrao](P.xn, b);
        // fecha para o centro no build, na mesma medida da tensão
        const fecha = 1 - 0.75 * R.tensao;
        const pan = (pa + (pb - pa) * k) * (0.35 + 0.65 * el[2] / 0.3 > 1 ? 1 : 0.35 + 0.65 * el[2] / 0.3) * fecha;
        const tilt = ta + (tb - ta) * k;
        let d = P.fundo ? [pan * 0.9 - P.p[0] * 0.03, -0.05 + tilt * 0.2, 1] : [pan, tilt, -1];
        const n = Math.hypot(d[0], d[1], d[2]);
        d = d.map(v => v / n);
        const a = atual[i];
        const cor = 1 - Math.exp(-dt * 16);
        for (let j = 0; j < 3; j++) a[j] += (d[j] - a[j]) * cor;
        // cada instrumento acende um grupo: bumbo os de frente, palma os de trás, chimbal corre entre eles
        let alvo = on * el[1];
        if (!P.fundo) alvo *= 0.32 + 0.9 * R.golpe;
        else alvo *= 0.22 + 0.5 * R.clap + 0.4 * (R.baixo * R.baixo);
        if (i % 4 === q % 4) alvo *= 1 + 0.6 * R.hat;
        alvo *= gate;
        nivel[i] += (alvo - nivel[i]) * (1 - Math.exp(-dt * (alvo > nivel[i] ? 60 : 16)));
        const ab = 0.012 + 0.05 * el[2];
        f.set([P.p[0], P.p[1], P.p[2], nivel[i], a[0], a[1], a[2], ab], i * 2 * 4);
      }
      // [48] extras: giro do gobo, força do gobo, laser, chimbal
      f.set([R.tempo * 0.6, el[4], el[5] * (0.15 + 0.85 * R.hat + 0.5 * R.drop), R.tempo], 48 * 4);
    },
    wgsl: /* wgsl */`
${SEM_LENTE}
const N_FEIXES = ${N_FEIXES};
fn umFeixe(v: vec3f, i: i32) -> f32 {
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
  let pv = v * t; let pb = P + u * s;
  let dif = pv - pb;
  let h = length(dif);
  let r = .018 + B.w * s;
  let perfil_ = exp(-h * h / (r * r));
  if (perfil_ < .002) { return 0.; }
  var l = perfil_ / (r * 6. + .14) / max(sqrt(den), .1);
  l *= exp(-s * .05);
  // gobo: o desenho cortado na lâmpada, girando dentro do feixe
  let go = C.arr[48].y;
  if (go > .01) {
    let e1 = normalize(cross(u, vec3f(.13, 1., .07))); let e2 = cross(u, e1);
    let ang = atan2(dot(dif, e2), dot(dif, e1)) + C.arr[48].x * (1. + f32(i % 3) * .3) * (f32(i % 2) * 2. - 1.);
    let raio = h / r;
    let corte = smoothstep(-.25, .45, sin(ang * 5.) * (.55 + .45 * sin(raio * 9. - C.arr[48].x))) ;
    l *= mix(1., corte * 1.6, go);
  }
  // a névoa não é lisa: anda devagar e o baixo empurra
  let pn = pv * vec3f(.9, .9, .45) + vec3f(0., C.reg[3].z * .22, C.reg[3].z * .1);
  let nev = 1. + elem(3) * (gn(pn) * 1.15 + gn(pn * 2.7) * .5);
  return l * I * max(nev, .08);
}
fn lamparina(v: vec3f, i: i32) -> f32 {
  let A = C.arr[2 * i]; let B = C.arr[2 * i + 1];
  if (A.w < .004 || A.z < 0.) { return 0.; }
  let dp = normalize(A.xyz);
  let c = max(dot(v, dp), 0.);
  let frente = pow(max(-dot(dp, B.xyz), 0.) * .5 + .5, 3.);
  return (pow(c, 22000.) * 3. + pow(c, 3200.) * .5) * A.w * frente;
}
fn ceuEm(v: vec3f) -> vec2f {
  var l = 0.; var fonte = 0.;
  for (var i = 0; i < N_FEIXES; i++) { l += umFeixe(v, i); fonte += lamparina(v, i); }
  // lasers: leque de riscos finos saindo de trás do logo, puxados pelo chimbal
  let las = C.arr[48].z;
  if (las > .01 && v.z > 0.) {
    let x = v.x / max(v.y + .22, .05);
    let cortes = abs(fract(x * 3.4 + sin(C.arr[48].w * .4) * .5) - .5);
    let esp = max(PA * 3.4 / max(v.y + .22, .05) * 1.4, .004);
    l += las * (1. - smoothstep(esp * .4, esp * 1.3, cortes)) * smoothstep(-.1, .1, v.y + .1) * .55 * exp(-max(v.y, 0.) * .4);
  }
  let ar = (.006 + .02 * C.reg[1].x * elem(1)) * elem(3);
  let tampa = 1. - clamp(l * .4, 0., .85);
  return vec2f(l * .62 + fonte + ar, tampa);
}
`,
  };
})();

// ---------- Ajudas comuns: ponto do painel para onde o olhar vai ----------
const WGSL_PAINEL = /* wgsl */`
const PASSO_M = ${(1.92 / 1032).toFixed(8)};
const DOBRA_M = ${(4988 * 1.92 / 1032).toFixed(5)};
// uv no painel inteiro (0 a 1, com a parede embaixo) para a direção v. z = 0 no teto e 1 na parede
fn noPainel(v: vec3f) -> vec3f {
  if (v.y > 1e-4) {
    let p = v * (HT / v.y);
    if (p.z <= ZF) { return vec3f(p.x / 1.92 + .5, (p.z - (ZF - DOBRA_M)) / PASSO_M / 5676., 0.); }
  }
  let p = v * (ZF / max(v.z, 1e-4));
  return vec3f(p.x / 1.92 + .5, (4988. + (HT - p.y) / PASSO_M) / 5676., 1.);
}
`;

// ---------- MERCÚRIO: o painel vira um lago de mercúrio de cabeça para baixo. ----------
// As ondas são simuladas de verdade (equação de onda na GPU) e dobram na quina, do teto para a parede. O bumbo nasce no booth, cada chimbal é uma gota.
// No break o lago fica um espelho e reflete o logo. No build ele treme num desenho de cimática que aperta com a tensão. No drop, a onda grande sai do booth.
const mercurio = (() => {
  const SW = 258, SH = 1419;
  let fila = [], tensaoAtual = 0, vibraAtual = 0;
  const imp = (x, y, raio, forca) => { if (fila.length < 12) fila.push([x, y, raio, forca]); };
  return {
    res: [1, 0.38], espelho: false, estrelas: [900, 120], deriva: 0.015, semMeteoros: true,
    partitura: {
      elementos: ['tubos', 'ondas', 'vibra', 'logo', 'gotas'],
      silencio: [0.25, 0.1, 0, 0.7, 0],
      calmo: [0.55, 0.35, 0, 0.8, 0.35],
      groove: [0.8, 0.75, 0, 0.5, 0.6],
      pico: [1, 1, 0.05, 0.4, 1],
      break: [0.4, 0.15, 0.04, 1, 0.5],
      build: [0.8, 0.3, 1, 0.7, 0.3],
      drop: [1, 1, 0, 0.8, 1],
      pressa: 0.8,
    },
    iniciar(R) {
      this.R = R;
      R.ao.batida.push(() => {
        if (R.presenca > 0.5) {
          const on = R.noCompasso === 0 ? 1.25 : 1;
          imp(129, 1333, 15 + R.baixo * 8, 0.3 * on);
        }
      });
      R.ao.drop.push(() => { imp(129, 1333, 46, 1.7); imp(129, 1247, 30, 0.8); });
      R.ao.virada.push(() => { imp(129, 700, 26, 0.5); });
    },
    ritmo: R => 0.3 + R.energia,
    async criar({ gpu, modulo }) {
      const U = GPUBufferUsage, T = GPUTextureUsage;
      const nova = () => gpu.createTexture({ size: [SW, SH], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC | T.COPY_DST });
      const texs = [nova(), nova(), nova()];
      const fP = new Float32Array(8 + 12 * 4);
      // Dois blocos de valores: o primeiro passo do quadro leva os golpes, os outros não.
      const bufP = gpu.createBuffer({ size: fP.byteLength, usage: U.UNIFORM | U.COPY_DST });
      const bufQ = gpu.createBuffer({ size: fP.byteLength, usage: U.UNIFORM | U.COPY_DST });
      const m = modulo(/* wgsl */`
struct P { c2: f32, amort: f32, t: f32, vibra: f32, kx: f32, ky: f32, n: f32, w: f32, imp: array<vec4f, 12> };
@group(0) @binding(0) var<uniform> P_: P;
@group(0) @binding(1) var ent: texture_2d<f32>;
@group(0) @binding(2) var sai: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8) fn passo(@builtin(global_invocation_id) id: vec3u) {
  let D = vec2i(${SW}, ${SH});
  let q = vec2i(id.xy);
  if (q.x >= D.x || q.y >= D.y) { return; }
  let get = fn_h;
  _ = get;
}
`.replace(/  let get = fn_h;\n  _ = get;\n/, '  let a = textureLoad(ent, q, 0);\n  let hL = textureLoad(ent, clamp(q - vec2i(1, 0), vec2i(0), D - vec2i(1)), 0).r;\n  let hR = textureLoad(ent, clamp(q + vec2i(1, 0), vec2i(0), D - vec2i(1)), 0).r;\n  let hU = textureLoad(ent, clamp(q - vec2i(0, 1), vec2i(0), D - vec2i(1)), 0).r;\n  let hD = textureLoad(ent, clamp(q + vec2i(0, 1), vec2i(0), D - vec2i(1)), 0).r;\n  var v = a.g + P_.c2 * (hL + hR + hU + hD - 4. * a.r);\n  // o fundo do painel absorve, para não voltar uma onda da ponta\n  let bordaY = smoothstep(90., 0., f32(q.y));\n  v *= P_.amort * (1. - .06 * bordaY);\n  let p = vec2f(q);\n  for (var i = 0; i < i32(P_.n); i++) {\n    let I = P_.imp[i];\n    let d = p - I.xy;\n    v += I.w * exp(-dot(d, d) / (I.z * I.z));\n  }\n  // cimática: o lago treme num desenho de pé\n  if (P_.vibra > .0005) {\n    let f = cos(p.x * P_.kx) * cos(p.y * P_.ky) + .6 * cos((p.x + p.y) * P_.kx * .72) * cos((p.x - p.y) * P_.kx * .72);\n    v += P_.vibra * sin(P_.t * P_.w) * f;\n  }\n  let h = (a.r + v) * .99985;\n  textureStore(sai, q, vec4f(h, v, 0., 1.));\n'), 'mercurio-sim');
      const pipe = await gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: m, entryPoint: 'passo' } });
      const grupo = (buf, i) => gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: texs[i].createView() }, { binding: 2, resource: texs[1 - i].createView() }] });
      const bg = [0, 1].map(i => grupo(bufP, i)), bgQ = [0, 1].map(i => grupo(bufQ, i));
      const SUB = 10;
      let qual = 0, t = 0;
      const self = this;
      return {
        textura: texs[2],
        passo(enc, R, el, dt) {
          // chimbal: gota num lugar qualquer do teto
          if (R.hat > 0.75 && !self._h && el[4] > 0.02) { imp(30 + Math.random() * 198, 80 + Math.random() * 1140, 3 + Math.random() * 2.5, (0.06 + Math.random() * 0.08) * el[4]); self._h = true; } else if (R.hat < 0.3) self._h = false;
          if (R.clap > 0.8 && !self._c) { imp(129, 900 + Math.random() * 280, 22, 0.2 * el[1]); self._c = true; } else if (R.clap < 0.3) self._c = false;
          const ganho = 0.25 + 0.75 * el[1];
          const N = Math.min(fila.length, 12);
          t += dt;
          const tensao = R.tensao;
          // a cada subida da tensão o desenho aperta. A frequência é a de ressonância da grade: é assim que nasce a figura de cimática
          const k = 0.05 + 0.13 * tensao;
          vibraAtual += ((el[2] * (0.0007 + 0.0016 * tensao)) - vibraAtual) * 0.2;
          fP.fill(0);
          fP.set([0.22, 0.9986, t, vibraAtual, k, k * 0.92, 0, 383 * k]);
          gpu.queue.writeBuffer(bufQ, 0, fP);
          fP[6] = N;
          for (let i = 0; i < N; i++) fP.set([fila[i][0], fila[i][1], fila[i][2], fila[i][3] * ganho], 8 + i * 4);
          gpu.queue.writeBuffer(bufP, 0, fP);
          fila = [];
          const c = enc.beginComputePass();
          c.setPipeline(pipe);
          for (let s = 0; s < SUB; s++) {
            c.setBindGroup(0, s === 0 ? bg[qual] : bgQ[qual]);
            c.dispatchWorkgroups(Math.ceil(SW / 8), Math.ceil(SH / 8));
            qual = 1 - qual;
          }
          c.end();
          enc.copyTextureToTexture({ texture: texs[qual] }, { texture: texs[2] }, [SW, SH]);
        },
      };
    },
    wgsl: /* wgsl */`
${SEM_LENTE}
${WGSL_PAINEL}
const TX = ${(1 / SW).toFixed(7)}; const TY = ${(1 / SH).toFixed(7)};
fn altura(uv: vec2f) -> f32 { return textureSampleLevel(sim, amL, uv, 0.).r; }
// Luzes da sala refletidas no lago. Preto entre elas: o que dá a cara de mercúrio é o contraste.
fn salaM(p: vec3f, r: vec3f) -> f32 {
  var l = 0.;
  if (r.y < -.02) {
    let t = (-1.6 - p.y) / r.y;
    let q = p + r * t;
    // tubos no chão, correndo para a parede. Um pulso anda por eles a cada bumbo
    let x = q.x * .9;
    let dx = abs(fract(x) - .5);
    let larg = .005 + t * .0012;
    let tubo = 1. - smoothstep(larg, larg * 2.2, dx);
    let ao = clamp((ZF - q.z) / 14., 0., 1.);
    let onda = ondaEm(ao);
    let fade = exp(-t * .045);
    l += tubo * fade * elem(0) * (.9 + 4. * onda);
    // barra grande embaixo do booth
    let b = exp(-pow((q.z - ZF + .4) / .6, 2.)) * smoothstep(1.8, .9, abs(q.x));
    l += b * (.9 + 3. * C.reg[1].x) * elem(0);
  } else {
    // olhar voltado para cima: quase nada
    l += pow(max(r.y, 0.), 3.) * .02;
  }
  // o logo se reflete na própria curva do lago
  if (r.z > .02) {
    let t = (C.logo.z - p.z) / r.z;
    if (t > 0.) {
      let w = p + r * t;
      let q = vec2f((w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
      if (q.x > 0. && q.x < 1. && q.y > 0. && q.y < 1.) {
        let dl = longe(q);
        let dentro = 1. - smoothstep(-2., 3., dl);
        l += dentro * elem(3) * (1.5 + 2. * C.reg[1].x);
      }
    }
  }
  return l;
}
fn ceuEm(v: vec3f) -> vec2f {
  let pn = noPainel(v);
  let uv = pn.xy;
  // normal: a média de duas larguras, para o reflexo correr liso
  let e = vec2f(TX, TY) * 1.5;
  let dx = (altura(uv + vec2f(e.x, 0.)) - altura(uv - vec2f(e.x, 0.))) + .5 * (altura(uv + vec2f(e.x * 2., 0.)) - altura(uv - vec2f(e.x * 2., 0.)));
  let dy = (altura(uv + vec2f(0., e.y)) - altura(uv - vec2f(0., e.y))) + .5 * (altura(uv + vec2f(0., e.y * 2.)) - altura(uv - vec2f(0., e.y * 2.)));
  let forca = .5;
  var n: vec3f; var p: vec3f;
  if (pn.z < .5) {
    n = normalize(vec3f(-dx * forca, -1., -dy * forca));
    p = v * (HT / max(v.y, 1e-4));
  } else {
    n = normalize(vec3f(-dx * forca, dy * forca, -1.));
    p = v * (ZF / max(v.z, 1e-4));
  }
  let r = reflect(v, n);
  let fres = .72 + .28 * pow(1. - max(dot(-v, n), 0.), 5.);
  var l = salaM(p, r) * fres;
  // crista da onda pega a luz do booth
  let incl = length(vec2f(dx, dy));
  l += smoothstep(.03, .4, incl) * (.04 + .5 * C.reg[1].x) * .3;
  return vec2f(l, 1. - clamp(l * 2., 0., 1.));
}
`,
  };
})();

// ---------- MICÉLIO: um organismo de prata cresce pelo painel. ----------
// É um physarum de verdade: quase um milhão de agentes farejam o rastro uns dos outros e formam filamentos. O logo é comida: a rede cresce em volta das letras.
// O som muda o comportamento do organismo, não o brilho: a seção escolhe como ele fareja, e no drop todos fogem do logo de uma vez.
const micelio = (() => {
  const GW = 516, GH = 2838, NA = 300000;
  // ângulo do sensor, giro, distância do sensor, velocidade, decaimento
  const COMO = {
    silencio: [0.6, 0.7, 6, 0.6, 0.88],
    calmo: [0.55, 0.75, 7, 0.9, 0.89],
    groove: [0.75, 0.85, 6, 1.2, 0.88],
    pico: [0.9, 1, 5, 1.6, 0.86],
    break: [0.45, 0.6, 10, 0.7, 0.91],
    build: [1.05, 1.2, 4, 1.5, 0.86],
    drop: [0.6, 0.7, 12, 3.4, 0.85],
  };
  const atual = [0.55, 0.75, 7, 0.9, 0.89];
  let empurra = 0;
  return {
    res: [1, 0.38], espelho: false, estrelas: [1100, 200], deriva: 0.015, semMeteoros: false,
    partitura: {
      elementos: ['organismo', 'veias', 'comida', 'fundo'],
      silencio: [0.3, 0.1, 0.6, 0],
      calmo: [0.75, 0.25, 0.7, 0.1],
      groove: [0.95, 0.5, 0.5, 0.1],
      pico: [1.15, 0.9, 0.4, 0.15],
      break: [0.8, 0.1, 1, 0.4],
      build: [1, 0.6, 0.2, 0.3],
      drop: [1.3, 1, 0.8, 0.2],
      pressa: 1.6,
    },
    iniciar(R) { R.ao.drop.push(() => { empurra = 1; }); },
    ritmo: R => 0.4 + R.energia,
    async criar({ gpu, modulo, texLogo }) {
      const U = GPUBufferUsage, T = GPUTextureUsage;
      const dados = new Float32Array(NA * 4);
      for (let i = 0; i < NA; i++) {
                dados.set([Math.random() * GW, Math.random() * GH, Math.random() * 6.283, Math.random()], i * 4);
      }
      const agentes = gpu.createBuffer({ size: dados.byteLength, usage: U.STORAGE | U.COPY_DST });
      gpu.queue.writeBuffer(agentes, 0, dados);
      const dep = gpu.createBuffer({ size: GW * GH * 4, usage: U.STORAGE });
      const nova = () => gpu.createTexture({ size: [GW, GH], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC | T.COPY_DST });
      const tr = [nova(), nova(), nova()];
      const fP = new Float32Array(12);
      const bufP = gpu.createBuffer({ size: fP.byteLength, usage: U.UNIFORM | U.COPY_DST });
      const amostra = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      const COMUM = /* wgsl */`
struct P { sa: f32, ra: f32, sd: f32, vel: f32, dec: f32, t: f32, empurra: f32, comida: f32, golpe: f32, onda: f32, a: f32, b: f32 };
@group(0) @binding(0) var<uniform> P_: P;
const D = vec2i(${GW}, ${GH});
`;
      const mA = modulo(COMUM + /* wgsl */`
struct Ag { x: f32, y: f32, a: f32, r: f32 };
@group(0) @binding(1) var<storage, read_write> ag: array<Ag>;
@group(0) @binding(2) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(3) var tr: texture_2d<f32>;
fn cheira(p: vec2f) -> f32 {
  let q = vec2i(floor(p));
  if (q.x < 0 || q.y < 0 || q.x >= D.x || q.y >= D.y) { return -1.; }
  return textureLoad(tr, q, 0).r;
}
fn rnd(s: f32) -> f32 { return fract(sin(s * 127.1 + P_.t * 311.7) * 43758.5453); }
@compute @workgroup_size(256) fn andar(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&ag)) { return; }
  var g = ag[i];
  let p = vec2f(g.x, g.y);
  let dirA = g.a;
  let f = vec2f(cos(dirA), sin(dirA));
  let fe = vec2f(cos(dirA + P_.sa), sin(dirA + P_.sa));
  let fd = vec2f(cos(dirA - P_.sa), sin(dirA - P_.sa));
  let c0 = cheira(p + f * P_.sd); let c1 = cheira(p + fe * P_.sd); let c2 = cheira(p + fd * P_.sd);
  let sorte = rnd(g.r + f32(i) * .001);
  var a = dirA;
  if (c0 > c1 && c0 > c2) { }
  else if (c0 < c1 && c0 < c2) { a += (sorte - .5) * 2. * P_.ra; }
  else if (c1 > c2) { a += P_.ra; }
  else if (c2 > c1) { a -= P_.ra; }
  // drop: todo mundo foge do logo
  if (P_.empurra > .01) {
    let foge = p - vec2f(f32(D.x) * .5, 2666.);
    let af = atan2(foge.y, foge.x);
    let dif = atan2(sin(af - a), cos(af - a));
    a += dif * P_.empurra * .4;
  }
  // a onda do bumbo sobe pelo painel e acelera quem ela encontra
  let d = abs(p.y - P_.onda);
  let vel = P_.vel * (1. + 1.8 * exp(-d * d / 16000.) * P_.golpe) * (.75 + .5 * g.r);
  var n = p + vec2f(cos(a), sin(a)) * vel;
  if (n.x < 1. || n.x > f32(D.x) - 2. || n.y < 1. || n.y > f32(D.y) - 2.) {
    a = sorte * 6.283;
    n = clamp(n, vec2f(2.), vec2f(D) - vec2f(3.));
  }
  ag[i] = Ag(n.x, n.y, a, g.r);
  let k = u32(n.x) + u32(n.y) * u32(D.x);
  atomicAdd(&dep[k], 1u);
}
`, 'micelio-agentes');
      const mD = modulo(COMUM + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(2) var ent: texture_2d<f32>;
@group(0) @binding(3) var sai: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var logo: texture_2d_array<f32>;
@group(0) @binding(5) var am: sampler;
@compute @workgroup_size(8, 8) fn espalhar(@builtin(global_invocation_id) id: vec3u) {
  let q = vec2i(id.xy);
  if (q.x >= D.x || q.y >= D.y) { return; }
  var s = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let w = (2. - f32(abs(x))) * (2. - f32(abs(y)));
    s += textureLoad(ent, clamp(q + vec2i(x, y), vec2i(0), D - vec2i(1)), 0).r * w;
  } }
  s = s / 16. * .6 + textureLoad(ent, q, 0).r * .4;
  let k = u32(q.x) + u32(q.y) * u32(D.x);
  let n = atomicExchange(&dep[k], 0u);
  var v = (s + f32(n) * .9) * P_.dec;
  // o logo é comida. Fica na parede: 887 x 312 px do painel, centro em (516, 5332), um terço disso nesta grade
  let u = vec2f((f32(q.x) - 258.) / 443.5 + .5, (f32(q.y) - 2666.) / 156. + .5);
  if (u.x > 0. && u.x < 1. && u.y > 0. && u.y < 1.) {
    let d = textureSampleLevel(logo, am, u, 0i, 0.).g * 512. - 256.;
    if (d < 6. && d > -14.) { v += P_.comida * .25; }
  }
  textureStore(sai, q, vec4f(min(v, 40.), f32(n), 0., 1.));
}
`, 'micelio-rastro');
      const pA = await gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: mA, entryPoint: 'andar' } });
      const pD = await gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: mD, entryPoint: 'espalhar' } });
      const viewLogo = texLogo.createView({ dimension: '2d-array' });
      const bgA = [0, 1].map(i => gpu.createBindGroup({ layout: pA.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufP } }, { binding: 1, resource: { buffer: agentes } }, { binding: 2, resource: { buffer: dep } }, { binding: 3, resource: tr[i].createView() }] }));
      const bgD = [0, 1].map(i => gpu.createBindGroup({ layout: pD.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufP } }, { binding: 1, resource: { buffer: dep } }, { binding: 2, resource: tr[i].createView() }, { binding: 3, resource: tr[1 - i].createView() }, { binding: 4, resource: viewLogo }, { binding: 5, resource: amostra }] }));
      let q = 0, t = 0, onda = 2838;
      const self = this;
      return {
        textura: tr[2],
        passo(enc, R, el, dt) {
          t += dt;
          const alvo = COMO[R.secao] || COMO.calmo;
          const taxa = 1 - Math.exp(-dt / (R.secao === 'drop' ? 0.1 : 1.5));
          for (let i = 0; i < 5; i++) atual[i] += (alvo[i] - atual[i]) * taxa;
          empurra *= Math.exp(-dt * 1.4);
          // a onda do bumbo anda da parede para o fundo: 6 m em 1 tempo
          onda -= dt * 4500;
          if (R.golpe > 0.8 && onda < 300) onda = 2838;
          fP.set([atual[0], atual[1], atual[2], atual[3] * el[0], atual[4], t, empurra, el[2], R.golpe, onda, 0, 0]);
          gpu.queue.writeBuffer(bufP, 0, fP);
          const c = enc.beginComputePass();
          c.setPipeline(pA); c.setBindGroup(0, bgA[q]); c.dispatchWorkgroups(Math.ceil(NA / 256));
          c.setPipeline(pD); c.setBindGroup(0, bgD[q]); c.dispatchWorkgroups(Math.ceil(GW / 8), Math.ceil(GH / 8));
          c.end();
          q = 1 - q;
          enc.copyTextureToTexture({ texture: tr[q] }, { texture: tr[2] }, [GW, GH]);
        },
      };
    },
    wgsl: /* wgsl */`
${SEM_LENTE}
${WGSL_PAINEL}
fn ceuEm(v: vec3f) -> vec2f {
  let pn = noPainel(v);
  let s = textureSampleLevel(sim, amL, pn.xy, 0.);
  // o rastro vem de 0 a uns 30: curva longa, com os filamentos finos ainda à vista e o miolo em prata forte
  let x = s.r;
  let fil = 1. - exp(-max(x - .2, 0.) * .32);
  // as veias: um pulso do som corre pela rede a partir da parede
  let ao = clamp((1. - pn.y) * 1.8, 0., 1.);
  let onda = ondaEm(ao);
  let veia = smoothstep(.12, .75, fil);
  var l = fil * fil * elem(0) * .85 * (.7 + .3 * C.reg[3].x) + veia * onda * elem(1) * 1.4;
  l += pow(fil, 5.) * (.5 + 1.4 * C.reg[1].y);
  return vec2f(l, 1. - clamp(fil * 2.2, 0., 1.));
}
`,
  };
})();

// ---------- ENXAME: milhões de pontos de prata no ar acima da pista. Nos picos, viram personagem. ----------
// Partículas 3D de verdade, projetadas no olho de quem está de pé. No break flutuam como nebulosa, no build giram num vórtice que fecha, no drop explodem e formam um personagem da marca, ou o logo, por 4 compassos.
const enxame = (() => {
  const NP = 2400000, GW = 516, GH = 2838, NT = 240000;
  const FORMAS = ['fig-a', 'fig-b', 'fig-c', 'fig-d', 'fig-e', 'fig-f', 'fig-g', 'fig-i', 'fig-j'];
  let forma = 0, iForma = 0, querForma = 0, rajada = 0, centro = 0;
  return {
    res: [1, 0.38], espelho: false, estrelas: [800, 150], deriva: 0.015,
    partitura: {
      elementos: ['po', 'vortice', 'forma', 'vento', 'brilho'],
      silencio: [0.25, 0, 0, 0.1, 0.5],
      calmo: [0.6, 0, 0, 0.3, 0.7],
      groove: [0.85, 0.08, 0, 0.7, 0.85],
      pico: [1, 0.05, 0.2, 1, 1],
      break: [0.55, 0, 0, 0.18, 0.9],
      build: [0.9, 1, 0, 0.5, 1],
      drop: [1, 0, 1, 0.4, 1.3],
      pressa: 0.8,
    },
    iniciar(R) {
      R.ao.drop.push(() => { rajada = 1; iForma = (iForma + 1) % FORMAS.length; });
      R.ao.frase.push(() => { if (R.secao === 'pico' && R.frase % 16 === 8) iForma = (iForma + 1) % FORMAS.length; });
    },
    ritmo: R => 0.4 + R.energia,
    async criar({ gpu, modulo }) {
      const U = GPUBufferUsage, T = GPUTextureUsage;
      // alvos: pontos sorteados dentro da silhueta real. O corpo fica no teto, com a cabeça para o fundo, grande como o painel
      async function alvos(nome) {
        const blob = await (await fetch(new URL('dados/' + nome + '.png', import.meta.url))).blob();
        const b = await createImageBitmap(blob);
        const c = new OffscreenCanvas(b.width, b.height), g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(b, 0, 0);
        const d = g.getImageData(0, 0, b.width, b.height).data;
        const lista = [];
        for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (d[(y * b.width + x) * 4] > 34) lista.push(x, y, d[(y * b.width + x) * 4] / 255);
        const f = new Float32Array(NT * 4), n = lista.length / 3;
        const larg = 1.7, alt = larg * b.height / b.width * 1.5;
        for (let i = 0; i < NT; i++) {
          const j = Math.floor(Math.random() * n) * 3;
          const X = (lista[j] + Math.random()) / b.width - 0.5, Y = (lista[j + 1] + Math.random()) / b.height - 0.5;
          // num plano acima do teto: a imagem no painel cai de 1 para 1
          const pY = 1.5 + Math.random() * 0.04, k = pY / 0.7532;
          f.set([X * larg * k, pY, (1.9 + Y * alt) * k, lista[j + 2]], i * 4);
        }
        const buf = gpu.createBuffer({ size: f.byteLength, usage: U.STORAGE | U.COPY_DST });
        gpu.queue.writeBuffer(buf, 0, f);
        return buf;
      }
      const bufT = await Promise.all(FORMAS.map(alvos));
      const dados = new Float32Array(NP * 8);
      for (let i = 0; i < NP; i++) {
        const y = 0.9 + Math.pow(Math.random(), 1.6) * 12, z = -12 + Math.random() * 40, x = (Math.random() - 0.5) * (3 + y * 3);
        dados.set([x, y, z, Math.random(), 0, 0, 0, Math.random()], i * 8);
      }
      const part = gpu.createBuffer({ size: dados.byteLength, usage: U.STORAGE | U.COPY_DST });
      gpu.queue.writeBuffer(part, 0, dados);
      const dep = gpu.createBuffer({ size: GW * GH * 4, usage: U.STORAGE });
      const saida = gpu.createTexture({ size: [GW, GH], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
      const fP = new Float32Array(16);
      const bufP = gpu.createBuffer({ size: fP.byteLength, usage: U.UNIFORM | U.COPY_DST });
      const COMUM = /* wgsl */`
struct P { dt: f32, t: f32, vortice: f32, forma: f32, vento: f32, golpe: f32, rajada: f32, brilho: f32, po: f32, agudo: f32, baixo: f32, medio: f32, c0: f32, c1: f32, c2: f32, c3: f32 };
@group(0) @binding(0) var<uniform> P_: P;
const D = vec2u(${GW}, ${GH});
`;
      const mM = modulo(COMUM + /* wgsl */`
struct Pt { p: vec3f, r: f32, v: vec3f, s: f32 };
@group(0) @binding(1) var<storage, read_write> pt: array<Pt>;
@group(0) @binding(2) var<storage, read> alvo: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dep: array<atomic<u32>>;
// ruído de ondas: barato, e a soma dá um vento que enrola
fn vento(p: vec3f, t: f32) -> vec3f {
  let q = p * .22;
  return vec3f(
    sin(q.y * 1.7 + t * .31 + sin(q.z * 1.3)) + sin(q.z * 2.3 - t * .23) * .5,
    sin(q.z * 1.9 + t * .27 + sin(q.x * 1.1)) * .5,
    sin(q.x * 2.1 - t * .19 + sin(q.y * 1.5)) + sin(q.y * 2.7 + t * .17) * .5);
}
// As folhas: onde f = 0. Cada ponto é puxado para a folha mais perto, e o vento anda ao longo dela. É o que dá desenho ao que seria só ruído.
fn folha(p: vec3f, t: f32) -> f32 {
  let q = p * vec3f(.42, .5, .17);
  return sin(q.x + sin(q.z * 1.3 + t * .11) * 1.7) + sin(q.y * 1.3 + sin(q.x * .9 - t * .09) * 1.4 + q.z * .6) + .6 * sin(q.z * 1.7 + q.y * .7 + t * .07);
}
@compute @workgroup_size(256) fn mover(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&pt)) { return; }
  var a = pt[i];
  let dt = P_.dt;
  var acel = vento(a.p + vec3f(a.s * 3.), P_.t) * (.2 + 1.5 * P_.vento);
  let e = .15;
  let f0 = folha(a.p, P_.t);
  let gr = vec3f(folha(a.p + vec3f(e, 0., 0.), P_.t) - f0, folha(a.p + vec3f(0., e, 0.), P_.t) - f0, folha(a.p + vec3f(0., 0., e), P_.t) - f0) / e;
  let leve = 1. - P_.forma * .9;
  acel -= gr / (dot(gr, gr) + .05) * f0 * 9. * leve;
  // vórtice do build: gira em volta do eixo da pista e fecha
  if (P_.vortice > .005) {
    let c = vec2f(a.p.x, a.p.y - 3.);
    let r = length(c) + .2;
    let tg = vec2f(-c.y, c.x) / r;
    acel += vec3f(tg.x, tg.y, 0.) * P_.vortice * 7. - vec3f(c.x, c.y, 0.) / r * P_.vortice * 3.5;
  }
  // bumbo: um empurrão que sai da parede
  let aoLogo = a.p - vec3f(0., .1, 4.2);
  let dl = length(aoLogo) + .4;
  acel += aoLogo / dl * (P_.golpe * 3.5 + P_.rajada * 70.) / (1. + dl * .12);
  var v = a.v + acel * dt;
  v *= exp(-dt * 2.2);
  var p = a.p;
  let m = u32(a.s * ${NT}.) % ${NT}u;
  let sorteado = a.r < .17;
  if (P_.forma > .01 && sorteado) {
    // forma: a mola puxa cada ponto para o lugar dele na silhueta
    let al = alvo[m].xyz;
    let d = al - p;
    v += d * dt * 16. * P_.forma;
    v *= exp(-dt * 7. * P_.forma);
  }
  p += v * dt;
  // volta pelo outro lado, para o céu nunca ficar vazio
  let L = 40.;
  if (p.z > 28.) { p.z -= L; } if (p.z < -12.) { p.z += L; }
  if (p.y < .82) { p.y = 12. * fract(a.s * 7.3 + P_.t * .1) + 1.; v.y = 0.; }
  if (p.y > 15.) { p.y = 1. + a.r * 3.; }
  let lx = 4. + p.y * 2.;
  if (abs(p.x) > lx) { p.x = -sign(p.x) * lx * .96; }
  a.p = p; a.v = v;
  pt[i] = a;
  // projeção no olho: teto, ou então a parede
  if (a.r > P_.po) { return; }
  var luzArte = 1.;
  if (P_.forma > .01 && sorteado) { luzArte = mix(1., alvo[m].w * alvo[m].w * 2.2 + .12, P_.forma); }
  var px = -1.; var py = -1.;
  if (p.y > .02) {
    let k = .7532 / p.y; let X = p.x * k; let Z = p.z * k;
    if (Z <= 4.39) { px = (X / 1.92 + .5) * ${GW}.; py = (Z - ${(4.39 - 4988 * 1.92 / 1032).toFixed(5)}) / ${(9.2806 + 1.28 + 0.0).toFixed(5)} * ${GH * (10.5604 / 10.5604)}.; }
  }
  if (px < 0. && p.z > .02) {
    let k = 4.39 / p.z; let X = p.x * k; let Y = p.y * k;
    if (Y <= .7532 && Y >= -.5268) { px = (X / 1.92 + .5) * ${GW}.; py = (4988. + (.7532 - Y) / ${(1.92 / 1032).toFixed(8)}) / 2.; }
  }
  if (px < 0. || px >= f32(D.x) || py < 0. || py >= f32(D.y)) { return; }
  // mais perto, mais forte: e cada um tem o próprio tamanho de brilho
  var centelha = 0.;
  if (a.s > .9985) { centelha = 1400.; }
  var fundoDim = 1.;
  if (!sorteado) { fundoDim = 1. - .82 * P_.forma; }
  let forca = u32((26. * clamp(9. / (length(p) + 1.), .25, 2.2) * luzArte + centelha) * fundoDim);
  atomicAdd(&dep[u32(px) + u32(py) * D.x], forca);
}
`, 'enxame-mover');
      const mR = modulo(COMUM + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(2) var sai: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8) fn revelar(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= D.x || id.y >= D.y) { return; }
  let k = id.x + id.y * D.x;
  let n = atomicExchange(&dep[k], 0u);
  textureStore(sai, vec2i(id.xy), vec4f(f32(n) / 1000., 0., 0., 1.));
}
`, 'enxame-revelar');
      const pM = await gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: mM, entryPoint: 'mover' } });
      const pR = await gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: mR, entryPoint: 'revelar' } });
      const bgM = bufT.map(b => gpu.createBindGroup({ layout: pM.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufP } }, { binding: 1, resource: { buffer: part } }, { binding: 2, resource: { buffer: b } }, { binding: 3, resource: { buffer: dep } }] }));
      const bgR = gpu.createBindGroup({ layout: pR.getBindGroupLayout(0), entries: [{ binding: 1, resource: { buffer: dep } }, { binding: 2, resource: saida.createView() }] });
      let t = 0, seg = 0;
      return {
        textura: saida,
        passo(enc, R, el, dt) {
          t += dt;
          rajada *= Math.exp(-dt * 7);
          // a forma aguenta 4 compassos e solta
          const dur = 60 / R.bpm * 16;
          querForma = R.drop > 0.04 || R.secao === 'drop' ? 1 : el[2];
          fP.set([Math.min(dt, 1 / 30), t, el[1], querForma, el[3], R.golpe * el[0], rajada, el[4], el[0], R.agudo, R.baixo, R.medio, 0, 0, 0, 0]);
          gpu.queue.writeBuffer(bufP, 0, fP);
          const c = enc.beginComputePass();
          c.setPipeline(pM); c.setBindGroup(0, bgM[iForma]); c.dispatchWorkgroups(Math.ceil(NP / 256));
          c.setPipeline(pR); c.setBindGroup(0, bgR); c.dispatchWorkgroups(Math.ceil(GW / 8), Math.ceil(GH / 8));
          c.end();
        },
      };
    },
    wgsl: /* wgsl */`
${SEM_LENTE}
${WGSL_PAINEL}
fn ceuEm(v: vec3f) -> vec2f {
  let pn = noPainel(v);
  // o ponto solto apaga aqui: só a dobra do véu, onde muitos se juntam, chega a acender
  let e = vec2f(1. / ${GW}., 1. / ${GH}.);
  let s = textureSampleLevel(sim, amL, pn.xy, 0.).r * .4 + (textureSampleLevel(sim, amL, pn.xy + vec2f(e.x, 0.), 0.).r + textureSampleLevel(sim, amL, pn.xy - vec2f(e.x, 0.), 0.).r + textureSampleLevel(sim, amL, pn.xy + vec2f(0., e.y), 0.).r + textureSampleLevel(sim, amL, pn.xy - vec2f(0., e.y), 0.).r) * .15;
  let d = max(s - .03, 0.);
  let l = (1. - exp(-d * 5.)) * elem(4) * (.7 + .5 * C.reg[1].x);
  return vec2f(l * .85 + l * l * .9, 1.);
}
`,
  };
})();

export const CENAS = { astrolabio, feixes, mercurio, micelio, enxame, ...CENAS_LUZ };
