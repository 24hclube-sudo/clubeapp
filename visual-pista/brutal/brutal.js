// Brutal: fundo preto e massas de concreto bruto que apanham da música. Sem relevo e sem luz: só a massa chapada, com a textura
// presa nela, para o movimento aparecer e para a grade física do LED não marcar. Tudo entra seco: sobe em poucos quadros e volta
// devagar, como peso. As cenas trocam em corte seco, sem fusão.
import { iniciarGPU, criarSom, carregarAtlas, escreverGlobal, tamanhoPara, medir, criarFiltroLED, Q, R, GLOBAL_BYTES, WGSL_BASE, LARG, ALT, DOBRA } from '../pista-quente/nucleo.js';

const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const { view: atlasView, el } = await carregarAtlas(gpu);
const U = GPUBufferUsage, T = GPUTextureUsage;
const TROCA = parseInt(Q.get('troca') || '32', 10);   // batidas em cada cena
const CY = (DOBRA + ALT) / 2;                         // centro da parede do DJ

const bmp = await createImageBitmap(await (await fetch(new URL('dados/concreto.png', import.meta.url))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
const texTile = gpu.createTexture({ size: [bmp.width, bmp.height], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
gpu.queue.copyExternalImageToTexture({ source: bmp }, { texture: texTile }, [bmp.width, bmp.height]);

const WGSL = WGSL_BASE + /* wgsl */`
@group(0) @binding(1) var atlas: texture_2d_array<f32>;
@group(0) @binding(2) var tile: texture_2d<f32>;
@group(0) @binding(3) var am: sampler;
@group(0) @binding(4) var amT: sampler;

struct VI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @location(3) d: vec4f, @builtin(vertex_index) i: u32 };
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, @location(1) meia: vec2f, @location(2) off: vec2f, @location(3) uv: vec2f,
  @location(4) @interpolate(flat) tom: f32, @location(5) @interpolate(flat) eros: f32, @location(6) @interpolate(flat) cam: f32,
};
@vertex fn vs(v: VI) -> VO {
  var q = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = q[v.i];
  let l = c * v.a.zw;
  let co = cos(v.b.x); let si = sin(v.b.x);
  // G.cabeca e G.extra: o tranco de tudo no bumbo
  let px = v.a.xy + vec2f(l.x * co - l.y * si, l.x * si + l.y * co) + vec2f(G.cabeca, G.extra);
  var o: VO;
  o.pos = vec4f(px.x / PAINEL.x * 2. - 1., 1. - px.y / PAINEL.y * 2., 0., 1.);
  o.local = l; o.meia = v.a.zw; o.off = v.c.xy;
  o.uv = mix(v.d.xy, v.d.zw, c * .5 + .5);
  o.tom = v.b.y; o.eros = v.b.z; o.cam = v.b.w;
  return o;
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let tuv = (v.local + v.off) / 2048.;
  let n = textureSampleLevel(tile, amT, tuv, 0.);
  // borda esfarelada: nada de linha limpa
  if (v.eros > 0.) {
    let dd = v.meia - abs(v.local);
    if (min(dd.x, dd.y) < v.eros * n.g) { discard; }
  }
  if (v.cam >= 0.) {
    let s = textureSampleLevel(atlas, am, v.uv, i32(v.cam), 0.).g;
    if (s < .5 + (n.g - .5) * .3) { discard; }
  }
  var lum = v.tom * (.1 + 1.3 * n.r * n.r + .35 * n.r);
  // letra precisa de leitura: o concreto dela nunca fica muito escuro
  if (v.cam >= 0.) { lum = max(lum, v.tom * .62); }
  // agudos: o concreto crepita, com pontos pretos que trocam de lugar
  let crepita = textureSampleLevel(tile, amT, tuv + fract(floor(G.tempo * 14.) * vec2f(.37, .71)), 0.).b;
  if (crepita > 1. - G.agudo * .2) { lum *= .1; }
  lum *= 1. + G.bumbo * .22;
  let ruido = fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13));
  return vec4f(lum * G.brilho * vec3f(1., .985, .95) + (ruido - .5) / 255., 1.);
}
`;

// ---------- lajes: cada quadro o JS escreve a lista inteira ----------
const MAX = 4200, POR = 16;
const dados = new Float32Array(MAX * POR);
let n = 0;
const bufI = gpu.createBuffer({ size: dados.byteLength, usage: U.VERTEX | U.COPY_DST });
function laje(cx, cy, hw, hh, { rot = 0, tom = 0.8, eros = 14, ox = 0, oy = 0, cam = -1, u0 = 0, v0 = 0, u1 = 1, v1 = 1 } = {}) {
  if (n >= MAX || hw <= 0 || hh <= 0) return;
  dados.set([cx, cy, hw, hh, rot, tom, eros, cam, ox, oy, 0, 0, u0, v0, u1, v1], n * POR);
  n++;
}

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const amT = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
const mod = modulo(WGSL, 'brutal');
const pipe = await gpu.createRenderPipelineAsync({
  layout: 'auto',
  vertex: { module: mod, entryPoint: 'vs', buffers: [{ arrayStride: POR * 4, stepMode: 'instance', attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
  fragment: { module: mod, entryPoint: 'fs', targets: [{ format: formato }] },
});
const filtro = await criarFiltroLED(gpu, modulo, formato);
const bg = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: atlasView }, { binding: 2, resource: texTile.createView() },
  { binding: 3, resource: am }, { binding: 4, resource: amT },
] });

// ---------- som: cada banda vira um pistão. O ganho se acerta sozinho, para mexer igual com a entrada alta ou baixa. ----------
const NB = 24;
const P = new Float32Array(NB), teto = new Float32Array(NB).fill(0.2);
const atualizarSom = criarSom({});
function pistoes(dt) {
  const m = R.faixas.length / NB;
  for (let i = 0; i < NB; i++) {
    let e = 0;
    for (let j = Math.floor(i * m); j < Math.floor((i + 1) * m); j++) e += R.faixas[j];
    e /= Math.max(1, Math.floor((i + 1) * m) - Math.floor(i * m));
    teto[i] = Math.max(teto[i] * Math.exp(-dt * 0.25), e, 0.06);
    const alvo = Math.pow(e / teto[i], 1.6);
    P[i] += (alvo - P[i]) * (1 - Math.exp(-dt * (alvo > P[i] ? 48 : 5)));
  }
}
const sorte = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

// ---------- estilhaços ----------
const NP = 2400;
const pt = { x: new Float32Array(NP), y: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), t: new Float32Array(NP), r: new Float32Array(NP), v: new Float32Array(NP), s: new Float32Array(NP), vida: new Float32Array(NP) };
let proxP = 0;
function estilhacar(x, y, qtos, { abre = 500, dx = 0, dy = 0, area = 30 } = {}) {
  for (let k = 0; k < qtos; k++) {
    const i = proxP; proxP = (proxP + 1) % NP;
    const a = sorte(Math.PI * 2), vel = abre * Math.pow(Math.random(), 0.6);
    pt.x[i] = x + sorte(-area, area); pt.y[i] = y + sorte(-area, area);
    pt.vx[i] = Math.cos(a) * vel + dx; pt.vy[i] = Math.sin(a) * vel + dy;
    pt.s[i] = 3 + 26 * Math.pow(Math.random(), 3.2);
    pt.r[i] = sorte(3); pt.v[i] = sorte(-7, 7);
    pt.vida[i] = sorte(0.5, 1.8); pt.t[i] = sorte(0.35, 0.95);
  }
}
function desenharEstilhacos(dt) {
  const d = Math.exp(-dt * 2.2);
  for (let i = 0; i < NP; i++) {
    if (pt.vida[i] <= 0) continue;
    pt.vida[i] -= dt;
    pt.vx[i] *= d; pt.vy[i] = pt.vy[i] * d + 340 * dt;   // o peso puxa para a parede do DJ
    pt.x[i] += pt.vx[i] * dt; pt.y[i] += pt.vy[i] * dt; pt.r[i] += pt.v[i] * dt;
    const s = pt.s[i] * Math.min(1, pt.vida[i] * 4);
    laje(pt.x[i], pt.y[i], s, s * 0.72, { rot: pt.r[i], tom: pt.t[i], eros: 0, ox: i * 37, oy: i * 91 });
  }
}

// ---------- cenas ----------
// Suprema: lajes soltas e tortas, como uma composição suprematista. A cada bumbo, uma salta de lugar; as outras levam o tranco.
const suprema = (() => {
  const MODELOS = [[390, 620, 0.5], [46, 2300, 0.9], [230, 250, 0.82], [28, 1700, 0.62], [150, 860, 0.34], [70, 70, 1], [0, 0, 0]];
  let lajes = [], vez = 0;
  const sortear = s => {
    const fina = s.hw < 80 && s.hh > 800;
    s.x = sorte(70, LARG - 70); s.y = sorte(150, ALT - 150);
    s.rot = fina ? sorte(-0.2, 0.2) : sorte(-0.62, 0.62);
    s.vr = sorte(-0.05, 0.05);
  };
  return {
    iniciar() {
      lajes = MODELOS.slice(0, 6).map(([hw, hh, tom], i) => { const s = { hw, hh, tom, j: 0, b: [1, 6, 3, 12, 8, 18][i], ox: sorte(2048), oy: sorte(2048) }; sortear(s); return s; });
      // uma barra preta corta o que estiver embaixo
      lajes.push({ hw: 34, hh: 1500, tom: 0, j: 0, b: 2, ox: 0, oy: 0, x: 500, y: 2600, rot: 0.3, vr: 0.02, preta: true });
    },
    golpe(f) {
      const s = lajes[vez++ % 6];
      sortear(s);
      s.j = 1;
      for (const o of lajes) o.j = Math.max(o.j, 0.55);
      estilhacar(s.x, s.y, 60 + f * 130, { abre: 700, area: Math.min(s.hw, 160) });
    },
    quadro(dt) {
      for (const s of lajes) {
        s.j *= Math.exp(-dt * 8);
        s.rot += s.vr * dt;
        const k = (0.58 + 0.75 * P[s.b]) * (1 + 0.16 * s.j);
        laje(s.x, s.y + s.j * 90, s.hw * k, s.hh * k, { rot: s.rot, tom: s.tom, eros: s.preta ? 0 : 20, ox: s.ox, oy: s.oy });
      }
    },
  };
})();

// Torres: colunas de larguras desiguais, umas saindo da parede, outras da entrada, batendo no meio do teto.
const torres = (() => {
  const COL = [
    { x: 138, w: 112, b: 1, baixo: true, tom: 0.9 }, { x: 292, w: 26, b: 13, baixo: false, tom: 0.62 },
    { x: 470, w: 132, b: 3, baixo: true, tom: 0.5 }, { x: 650, w: 30, b: 17, baixo: false, tom: 0.95 },
    { x: 800, w: 90, b: 7, baixo: false, tom: 0.72 }, { x: 958, w: 40, b: 10, baixo: true, tom: 0.84 },
  ];
  COL.forEach(c => { c.ox = sorte(2048); c.oy = sorte(2048); c.s = 0; });
  return {
    iniciar() {},
    golpe(f) {
      for (const c of COL) {
        c.s = Math.max(c.s, sorte(0.35, 1) * f);
        const ponta = c.baixo ? ALT - c.L : c.L;
        if (c.L) estilhacar(c.x, ponta, 14 + f * 34, { abre: 620, area: c.w * 0.7, dy: c.baixo ? -260 : 260 });
      }
    },
    quadro(dt) {
      for (const c of COL) {
        c.s *= Math.exp(-dt * 6.5);
        c.L = Math.min(ALT, 180 + ALT * 0.72 * P[c.b] + 1300 * c.s);
        const cy = c.baixo ? ALT - c.L / 2 : c.L / 2;
        // a textura fica presa na ponta fixa da coluna: a massa desliza, o concreto não escorrega
        const oy = c.oy + (c.baixo ? cy - ALT : cy);
        laje(c.x, cy, c.w, c.L / 2, { tom: c.tom, eros: 26, ox: c.ox, oy });
      }
    },
  };
})();

// Prensa: paredes de concreto saindo das duas beiradas e fechando sobre o corredor preto do meio.
const prensa = (() => {
  const SEG = [];
  let y = 0;
  const ALTURAS = [150, 610, 230, 90, 860, 300, 520, 130, 690, 260, 420, 1000, 416];
  ALTURAS.forEach((h, i) => { SEG.push({ y, h, bE: (i * 5 + 1) % NB, bD: (i * 7 + 2) % NB, tE: sorte(0.42, 0.95), tD: sorte(0.42, 0.95), ox: sorte(2048), oy: sorte(2048), s: 0 }); y += h; });
  let vez = 0;
  return {
    iniciar() {},
    golpe(f) {
      vez++;
      SEG.forEach((s, i) => {
        if ((i + vez) % 2 === 0) {
          s.s = f;
          estilhacar(sorte() < 0.5 ? 150 : LARG - 150, s.y + s.h / 2, 6 + f * 18, { abre: 560, area: s.h * 0.4 });
        }
      });
    },
    quadro(dt) {
      for (const s of SEG) {
        s.s *= Math.exp(-dt * 7);
        const wE = 10 + 300 * P[s.bE] + 150 * s.s, wD = 10 + 300 * P[s.bD] + 150 * s.s;
        const h = s.h / 2 - 5;
        laje(wE / 2, s.y + s.h / 2, wE / 2, h, { tom: s.tE, eros: 18, ox: s.ox + wE / 2, oy: s.oy });
        laje(LARG - wD / 2, s.y + s.h / 2, wD / 2, h, { tom: s.tD, eros: 18, ox: s.oy - wD / 2, oy: s.ox });
      }
    },
  };
})();

// Fenda: preto quase total e um rasgo de concreto do fundo do DJ até a entrada. O som sai da parede e abre o rasgo pelo caminho.
const fenda = (() => {
  const H = 21, N = Math.ceil(ALT / H), TAXA = 120, HIST = 1024;
  const hist = new Float32Array(HIST);
  const dente = Float32Array.from({ length: N }, () => sorte(0.45, 1.5));
  let cabeca = 0, ultima = 0, tempo = 0;
  return {
    iniciar() {},
    golpe(f) {
      for (let k = 0; k < 7; k++) estilhacar(516, sorte(ALT), 8 + f * 22, { abre: 760, area: 40 });
    },
    quadro(dt) {
      tempo += dt;
      cabeca += dt * TAXA;
      const e = Math.max((P[0] + P[1] + P[2] + P[3]) / 4, R.bumbo);
      for (let c = Math.floor(ultima) + 1; c <= Math.floor(cabeca); c++) hist[c % HIST] = e;
      ultima = cabeca;
      for (let i = 0; i < N; i++) {
        const y = (i + 0.5) * H;
        const idade = Math.abs(y - CY) / 1700 * TAXA;
        const v = hist[Math.max(0, Math.floor(cabeca - idade)) % HIST];
        const w = (3 + 165 * Math.pow(v, 2)) * dente[i];
        const x = 516 + 74 * Math.sin(y * 0.0016 + tempo * 0.07) + 30 * Math.sin(y * 0.0071 - tempo * 0.11);
        laje(x, y, w, H / 2 + 1, { tom: 0.95, eros: 0, ox: 300 + x * 0.2, oy: y });
      }
    },
  };
})();

// Desenho cortado em fatias, com cada fatia empurrada para o lado pela sua banda. Serve às figuras e aos letreiros.
function fatiasDe(e, cy, largMax, altMax, qtas, forca, tom, ox, s, sinal) {
  const S = tamanhoPara(e, largMax, altMax), altura = e.altura * 2 * S, h = altura / qtas;
  for (let i = 0; i < qtas; i++) {
    const vm = 0.5 - e.altura / 2, v0 = vm + i / qtas * e.altura, v1 = v0 + e.altura / qtas;
    const lado = ((i * 7) % 3 - 1) || sinal;
    const dx = lado * (P[i % NB] * forca + s * forca * 0.7);
    const y = cy - altura / 2 + (i + 0.5) * h;
    laje(516 + dx, y, S, h / 2 + 0.5, { tom, eros: 0, ox, oy: y, cam: e.i, v0, v1 });
  }
}

// Estátua: as figuras do CLUBE cortadas em fatias, com cada fatia empurrada para o lado pela sua banda.
const estatua = (() => {
  const NOMES = ['fig-h', 'fig-a', 'fig-j', 'fig-f', 'fig-d', 'fig-b'];
  let vez = 0, s = 0, sinal = 1;
  const fatias = (e, cy, largMax, altMax, qtas, forca, tom, ox) => fatiasDe(e, cy, largMax, altMax, qtas, forca, tom, ox, s, sinal);
  return {
    iniciar() { vez = Math.floor(sorte(NOMES.length)); },
    golpe(f) {
      s = Math.max(s, f);
      sinal = -sinal;
      estilhacar(516, sorte(800, 4800), 40 + f * 80, { abre: 800, area: 200 });
      estilhacar(516, 4950, 22 + f * 30, { abre: 620, area: 300 });
    },
    quadro(dt) {
      s *= Math.exp(-dt * 7);
      // as fatias só escorregam: a figura precisa continuar legível
      fatias(el[NOMES[vez % 6]], 3900, 960, 1620, 34, 62, 0.92, 200);
      fatias(el[NOMES[(vez + 2) % 6]], 1500, 880, 1240, 26, 50, 0.6, 900);
    },
  };
})();

// Logo do CLUBE na parede: nunca sai. Pista Quente e Millos Kaiser entram no teto, alternando, também em concreto.
let golpeLetra = 0, sinalLetra = 1;
const NOMES = [el.titulo, el.millos];
function letreiros(dt) {
  golpeLetra *= Math.exp(-dt * 7);
  // o contorno preto separa a letra do concreto que estiver atrás
  const contorno = (e, cy, largMax, altMax) => { const S = tamanhoPara(e, largMax, altMax) * 1.025; laje(516, cy, S, S, { tom: 0, eros: 0, cam: e.i }); };
  contorno(el.clube, CY, 900, 320);
  // para os personagens passarem atrás das letras (personagens\camada.js): logo plano, na própria parede
  window.__logoTela = { cx: 0, cy: 0, z: 4.39, meia: el.clube.largura * tamanhoPara(el.clube, 900, 320) * 1.92 / 1032, a: 0, b: 0, m: 0, prof: 0, xc: 0, yc: 0 };
  fatiasDe(el.clube, CY, 900, 320, 7, 16, 0.98, 1400, golpeLetra, sinalLetra);
  const b = R.fase % 16;
  if (b >= 13) return;
  const nome = NOMES[Math.floor(R.fase / 16) % 2];
  contorno(nome, 2560, 920, 860);
  fatiasDe(nome, 2560, 920, 860, 14, 15, 0.95, 620, golpeLetra, sinalLetra);
}

const CENAS = { suprema, torres, estatua, prensa, fenda };
const ORDEM = Object.keys(CENAS);
const fixa = ORDEM.includes(Q.get('cena')) ? Q.get('cena') : null;
let nomeCena = fixa || ORDEM[0];
CENAS[nomeCena].iniciar();

const contar = medir(adaptador, 'brutal');
let tempo = 0, ultimo = performance.now(), ultimaBatida = -1, batidas = 0, idadeAntes = 99;
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  pistoes(dt);

  // corte seco, sempre em cima da batida
  const b = Math.floor(R.fase);
  if (b !== ultimaBatida) {
    ultimaBatida = b;
    if (!fixa && ++batidas >= TROCA) {
      batidas = 0;
      nomeCena = ORDEM[(ORDEM.indexOf(nomeCena) + 1) % ORDEM.length];
      CENAS[nomeCena].iniciar();
    }
  }
  // o bumbo: vale para a análise da música e para a batida interna
  if (R.idade < idadeAntes) {
    const f = Math.min(1.2, Math.max(0.35, R.bumbo));
    CENAS[nomeCena].golpe(f);
    golpeLetra = Math.max(golpeLetra, f);
    sinalLetra = -sinalLetra;
  }
  idadeAntes = R.idade;

  n = 0;
  CENAS[nomeCena].quadro(dt);
  desenharEstilhacos(dt);
  letreiros(dt);
  gpu.queue.writeBuffer(bufI, 0, dados, 0, n * POR);

  // tranco de tudo no bumbo
  const tx = R.bumbo * R.bumbo * 14 * Math.sin(tempo * 91), ty = R.bumbo * R.bumbo * 34;
  escreverGlobal(gpu, bufG, fG, tempo, dt, n, ty, tx);

  const enc = gpu.createCommandEncoder();
  const vTela = contexto.getCurrentTexture().createView();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pipe); r.setBindGroup(0, bg); r.setVertexBuffer(0, bufI); r.draw(6, n); r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, get estado() { return { cena: nomeCena, lajes: n, batidas, tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
