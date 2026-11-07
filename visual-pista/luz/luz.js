// Luz: o painel não mostra imagem, ele é a luminária da pista. Tubos e lâmpadas sobre o preto, que acendem brancos com o som e
// esfriam como tungstênio: branco, âmbar, vermelho, apagado. A energia de todas as lâmpadas soma num número só e a cor sai dele,
// por isso o núcleo é branco e o halo é vermelho, como numa lâmpada de verdade. Um grão de vidro jateado disfarça os módulos do LED.
// Não há flash do painel inteiro: o pico é de cada lâmpada.
import { iniciarGPU, criarSom, carregarAtlas, escreverGlobal, tamanhoPara, medir, criarFiltroLED, Q, R, GLOBAL_BYTES, WGSL_BASE, LARG, ALT, DOBRA } from '../pista-quente/nucleo.js';

const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const { view: atlasView, el } = await carregarAtlas(gpu);
const U = GPUBufferUsage, T = GPUTextureUsage;
const TROCA = parseInt(Q.get('troca') || '32', 10);
const MAX_L = 23, CY = (DOBRA + ALT) / 2, LINHAS = 512, TAXA = 120;

const WGSL = WGSL_BASE + /* wgsl */`
struct Lampada { r: vec4f, q: vec4f };   // r: centro e meia medida; q: calor, núcleo, halo
@group(0) @binding(1) var<uniform> L: array<Lampada, 24>;   // a última guarda os pesos da cena
@group(0) @binding(2) var historia: texture_2d<f32>;
@group(0) @binding(3) var amH: sampler;
@group(0) @binding(4) var<uniform> LT: array<vec4f, 4>;   // letreiros: (x, y, tamanho, camada) e (energia, ...)
@group(0) @binding(5) var atlas: texture_2d_array<f32>;
@group(0) @binding(6) var am: sampler;
// Letreiro como lâmpada: a letra soma energia e os toques em volta fazem o halo, que a rampa de tungstênio pinta de vermelho.
fn letra(p: vec2f, c: vec4f, e: f32) -> f32 {
  if (e < .003) { return 0.; }
  let q = (p - c.xy) / c.z;
  if (abs(q.x) > 1.12 || abs(q.y) > 1.12) { return 0.; }
  let uv = q * .5 + .5;
  let camada = i32(c.w);
  let s = textureSampleLevel(atlas, am, uv, camada, 0.).g;
  var h = 0.;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * .7854;
    let d = vec2f(cos(a), sin(a)) / (2. * c.z);
    h += textureSampleLevel(atlas, am, uv + d * 20., camada, 0.).g + textureSampleLevel(atlas, am, uv + d * 58., camada, 0.).g * .6;
  }
  return e * (2.6 * s + .075 * h);
}
const CENTRO = vec2f(516., ${CY.toFixed(1)});
const CALOR = array<vec3f, 8>(vec3f(0., 0., 0.), vec3f(.12, .004, 0.), vec3f(.4, .03, 0.), vec3f(.8, .15, .01), vec3f(1., .42, .07), vec3f(1., .7, .32), vec3f(1., .9, .72), vec3f(1., .98, .94));
fn cor(t: f32) -> vec3f {
  let f = clamp(t, 0., 1.) * 7.;
  let i = u32(min(f, 6.));
  return mix(CALOR[i], CALOR[i + 1u], f - f32(i));
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  let p = i.uv * PAINEL;
  var E = 0.;
  for (var k = 0u; k < u32(G.n); k++) {
    let l = L[k];
    if (l.q.x < .003) { continue; }
    let dv = max(abs(p - l.r.xy) - l.r.zw, vec2f(0.));
    let d2 = dot(dv, dv);
    let nu = l.q.y * l.q.y; let ha = l.q.z * l.q.z;
    E += l.q.x * (1.9 * nu / (d2 + nu) + .3 * ha / (d2 + ha));
  }
  // onda que anda da parede para a entrada
  let pesos = L[23].r;
  if (pesos.x > 0.) {
    let r = length(p - CENTRO);
    let linha = (G.cabeca - r / 1700. * ${TAXA.toFixed(1)}) / ${LINHAS.toFixed(1)};
    let h = textureSampleLevel(historia, amH, vec2f(.5, fract(linha)), 0.).r;
    E += pesos.x * h * h * 1.2;
  }
  // a parede do DJ como fonte: a luz sobe pelo teto e vai morrendo
  if (pesos.y > 0.) {
    let dy = max(${DOBRA.toFixed(1)} - p.y, 0.);
    E += pesos.y * .62 * 176400. / (dy * dy + 176400.);
  }
  E += letra(p, LT[0], LT[1].x) + letra(p, LT[2], LT[3].x);
  // vidro jateado: a luz nunca fica lisa, e a grade dos módulos não aparece
  let g = ruido2(p * .41) * .55 + ruido2(p * .13 + 7.) * .45;
  E *= .8 + .4 * g;
  let t = 1. - exp(-E * 1.15);
  let ruido = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13));
  // o grão vale também depois de saturar: sem isso, a luz forte vira um retângulo liso e os módulos aparecem
  return vec4f(cor(t) * (.9 + .2 * g) * G.brilho + (ruido - .5) / 255., 1.);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const fL = new Float32Array(24 * 8);
const bufL = gpu.createBuffer({ size: fL.byteLength, usage: U.UNIFORM | U.COPY_DST });
const texH = gpu.createTexture({ size: [4, LINHAS], format: 'r8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
const amH = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeV: 'repeat' });
const mod = modulo(WGSL, 'luz');
const pipe = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mod, entryPoint: 'vsTela' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: formato }] } });
const filtro = await criarFiltroLED(gpu, modulo, formato);
const fLT = new Float32Array(16);
const bufLT = gpu.createBuffer({ size: fLT.byteLength, usage: U.UNIFORM | U.COPY_DST });
const bg = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufL } }, { binding: 2, resource: texH.createView() }, { binding: 3, resource: amH },
  { binding: 4, resource: { buffer: bufLT } }, { binding: 5, resource: atlasView }, { binding: 6, resource: gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
] });

// Logo do CLUBE aceso na parede: nunca apaga. Pista Quente e Millos Kaiser acendem no teto, alternando, e esfriam como as lâmpadas.
const NOMES = [el.titulo, el.millos];
let luzNome = 0;
function letreiros(dt) {
  const fase = R.fase % 16, nome = NOMES[Math.floor(R.fase / 16) % 2];
  const alvo = fase < 12 ? 0.42 + 0.9 * pulso : 0;
  luzNome += (alvo - luzNome) * (1 - Math.exp(-dt * (alvo > luzNome ? 24 : 1.6)));
  const Sc = tamanhoPara(el.clube, 900, 320) * (1 + pulso * 0.03), Sn = tamanhoPara(nome, 920, 860);
  // para os personagens passarem atrás das letras (personagens\camada.js): logo plano, na própria parede
  window.__logoTela = { cx: 0, cy: 0, z: 4.39, meia: el.clube.largura * Sc * 1.92 / 1032, a: 0, b: 0, m: 0, prof: 0, xc: 0, yc: 0 };
  fLT.set([516, CY, Sc, el.clube.i, 0.4 + 1.05 * Math.max(pulso, P[0] * 0.7), 0, 0, 0, 516, 2560, Sn, nome.i, luzNome, 0, 0, 0]);
  gpu.queue.writeBuffer(bufLT, 0, fLT);
}

// ---------- som: pistões com ganho automático ----------
const NB = 24;
const P = new Float32Array(NB), teto = new Float32Array(NB).fill(0.2);
const atualizarSom = criarSom({});
function pistoes(dt) {
  const m = R.faixas.length / NB;
  for (let i = 0; i < NB; i++) {
    let e = 0;
    const a = Math.floor(i * m), b = Math.floor((i + 1) * m);
    for (let j = a; j < b; j++) e += R.faixas[j];
    e /= Math.max(1, b - a);
    teto[i] = Math.max(teto[i] * Math.exp(-dt * 0.25), e, 0.06);
    const alvo = Math.pow(e / teto[i], 1.8);
    P[i] += (alvo - P[i]) * (1 - Math.exp(-dt * (alvo > P[i] ? 55 : 9)));
  }
}

// ---------- lâmpadas: sobem na hora e esfriam devagar ----------
let n = 0;
function lampada(l, dt, alvo, esfria = 3.2) {
  l.h += (alvo - l.h) * (1 - Math.exp(-dt * (alvo > l.h ? 70 : esfria)));
  if (n < MAX_L) {
    fL.set([l.x, l.y, l.hx, l.hy, l.h, l.nu, l.ha, 0], n * 8);
    n++;
  }
}
const faz = (x, y, hx, hy, nu, ha, b = 0) => ({ x, y, hx, hy, nu, ha, b, h: 0, s: 0 });

// Tubos: lâmpadas atravessadas no teto, em intervalos desiguais. Grave perto do DJ, agudo na entrada.
const tubos = (() => {
  const YS = [5332, 4930, 4610, 4380, 3960, 3700, 3180, 2860, 2500, 1900, 1620, 1050, 690, 240];
  const L = YS.map((y, i) => faz(516, y, i === 0 ? 400 : 470, i === 0 ? 7 : 5, i % 3 === 0 ? 13 : 8, 170, Math.round(i * 1.6)));
  return {
    pesos: [0, 0],
    golpe(f) { L.slice(0, 5).forEach(l => { l.s = f; }); },
    quadro(dt) { for (const l of L) { l.s *= Math.exp(-dt * 10); lampada(l, dt, Math.max(P[l.b], l.s)); } },
  };
})();

// Flavin: poucos tubos compridos, ao longo do teto até a parede, que puxam a perspectiva para o DJ.
const flavin = (() => {
  const L = [faz(92, 2900, 4, 2760, 10, 150, 1), faz(316, 3700, 4, 1960, 7, 120, 9), faz(516, 2000, 5, 1800, 12, 170, 4), faz(716, 4300, 4, 1360, 7, 120, 14), faz(940, 2600, 4, 2460, 10, 150, 2)];
  let vez = 0;
  return {
    pesos: [0, 0],
    golpe(f) { L[vez++ % 5].s = f; L[(vez * 3) % 5].s = f * 0.7; },
    quadro(dt) { for (const l of L) { l.s *= Math.exp(-dt * 7); lampada(l, dt, Math.max(P[l.b] * 0.8, l.s)); } },
  };
})();

// Onda: quase nada aceso; cada bumbo sai da parede como uma frente de luz e atravessa o teto.
const onda = (() => {
  const L = [faz(516, CY, 300, 4, 9, 120, 1)];
  return {
    pesos: [1, 0],
    golpe(f) { L[0].s = f; },
    quadro(dt) { L[0].s *= Math.exp(-dt * 8); lampada(L[0], dt, Math.max(P[0] * 0.6, L[0].s)); },
  };
})();

// Janela: a parede do DJ é uma janela acesa e a luz dela sobe pelo teto. Riscos finos na entrada seguem os agudos.
const janela = (() => {
  const JAN = faz(516, CY + 6, 440, 290, 16, 300, 0);
  const R_ = [1000, 760, 480, 230].map((y, i) => faz(516, y, 260 - i * 30, 2, 5, 60, 16 + i * 2));
  const peso = { v: 0 };
  return {
    pesos: [0, 0],
    golpe(f) { JAN.s = f; },
    quadro(dt) {
      JAN.s *= Math.exp(-dt * 8);
      peso.v += (Math.max(P[0], P[1], JAN.s) - peso.v) * (1 - Math.exp(-dt * (JAN.s > peso.v ? 60 : 3)));
      janela.pesos = [0, peso.v];
      lampada(JAN, dt, Math.max(P[0], JAN.s) * 0.42);
      for (const l of R_) lampada(l, dt, P[l.b], 7);
    },
  };
})();

// Corrida: uma lâmpada de cada vez, em colcheia, da parede para a entrada, deixando rastro vermelho.
const corrida = (() => {
  const N = 20;
  const L = Array.from({ length: N }, (_, i) => faz(516, 5120 - i * 258, 470, 4, 9, 140));
  let cabeca = 0, ultimo = -1;
  return {
    pesos: [0, 0],
    golpe() { cabeca = 0; },
    quadro(dt) {
      const passo = Math.floor(R.fase * 2);
      if (passo !== ultimo) { ultimo = passo; L[cabeca % N].s = 1; cabeca++; }
      for (const l of L) { lampada(l, dt, l.s, 1.1); l.s = 0; }
    },
  };
})();

const CENAS = { tubos, flavin, onda, janela, corrida };
const ORDEM = Object.keys(CENAS);
const fixa = ORDEM.includes(Q.get('cena')) ? Q.get('cena') : null;
let nomeCena = fixa || ORDEM[0];

const hist = new Uint8Array(4);
let cabeca = 0, ultimaLinha = -1, pulso = 0;
function escreverHistoria() {
  const alvo = Math.floor(cabeca);
  if (ultimaLinha < 0) ultimaLinha = alvo - 1;
  hist.fill(Math.min(255, pulso * 255));
  for (let k = Math.min(alvo - ultimaLinha, 12); k > 0; k--) {
    gpu.queue.writeTexture({ texture: texH, origin: [0, (alvo - k + 1) % LINHAS] }, hist, { bytesPerRow: 4 }, [4, 1]);
  }
  ultimaLinha = alvo;
}

const contar = medir(adaptador, 'luz');
let tempo = 0, ultimo = performance.now(), ultimaBatida = -1, batidas = 0, idadeAntes = 99;
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  pistoes(dt);
  const b = Math.floor(R.fase);
  if (b !== ultimaBatida) {
    ultimaBatida = b;
    if (!fixa && ++batidas >= TROCA) { batidas = 0; nomeCena = ORDEM[(ORDEM.indexOf(nomeCena) + 1) % ORDEM.length]; }
  }
  const cena = CENAS[nomeCena];
  if (R.idade < idadeAntes) cena.golpe(Math.min(1.2, Math.max(0.4, R.bumbo)));
  idadeAntes = R.idade;

  pulso += (R.bumbo - pulso) * (1 - Math.exp(-dt * (R.bumbo > pulso ? 30 : 4)));
  cabeca += dt * TAXA;
  escreverHistoria();
  letreiros(dt);
  n = 0;
  cena.quadro(dt);
  fL.set([cena.pesos[0], cena.pesos[1], 0, 0, 0, 0, 0, 0], 23 * 8);
  gpu.queue.writeBuffer(bufL, 0, fL);
  escreverGlobal(gpu, bufG, fG, tempo, dt, n, 0, cabeca % LINHAS);

  const enc = gpu.createCommandEncoder();
  const vTela = contexto.getCurrentTexture().createView();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pipe); r.setBindGroup(0, bg); r.draw(3); r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, get estado() { return { cena: nomeCena, lampadas: n, batidas, tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
