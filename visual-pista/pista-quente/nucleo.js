// Base comum dos visuais 2D da festa: WebGPU, som, atlas de arte e camadas animadas. Painel sempre em 1032x5676.
import { A, NF, ligarAudio, analisarAudio, audioVivo, audioNoComando } from '../js/audio.js';
import { FILTRO_LED } from '../universo/js/shaders.js';
import { REACOES } from '../js/reacoes.js';

export const Q = new URLSearchParams(location.search);
export const SAIDA = Q.has('saida');
export const ESCALA = parseFloat(Q.get('escala') || (SAIDA ? '1' : '0.5'));
export const LARG = 1032, ALT = 5676, DOBRA = 4988;
export const RW = Math.round(LARG * ESCALA), RH = Math.round(ALT * ESCALA);
export const BRILHO = parseFloat(Q.get('brilho') || '1');
export const erros = [];

export async function iniciarGPU() {
  const tela = document.getElementById('tela');
  if (!navigator.gpu) throw new Error('Este navegador não tem WebGPU.');
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adaptador) throw new Error('Sem placa para o WebGPU.');
  const gpu = await adaptador.requestDevice();
  gpu.addEventListener('uncapturederror', e => { erros.push(e.error.message); console.error(e.error.message); });
  gpu.lost.then(i => { erros.push('GPU perdida: ' + i.message); console.error('GPU perdida: ' + i.message); });
  tela.width = RW; tela.height = RH;
  if (SAIDA) {
    document.body.classList.add('saida');
    tela.style.width = RW + 'px'; tela.style.height = RH + 'px';
  }
  const contexto = tela.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device: gpu, format: formato, alphaMode: 'opaque' });
  const modulo = (code, nome) => {
    const m = gpu.createShaderModule({ code });
    m.getCompilationInfo().then(i => {
      for (const e of i.messages) if (e.type === 'error') { const t = `${nome}:${e.lineNum}:${e.linePos} ${e.message}`; erros.push(t); console.error(t); }
    });
    return m;
  };
  return { gpu, contexto, formato, tela, modulo, adaptador };
}

// ---------- som: a mesma análise do Universo. Sem música, batida interna, para o visual nunca parar. ----------
export const R = { bumbo: 0, idade: 10, grave: 0, medio: 0, agudo: 0, nivel: 0, fase: 0, bpm: 124, faixas: new Float32Array(NF), ultimoRelogio: -1 };
export { A, NF, audioVivo };

export function criarSom({ aoBumbo, bpm = 124 } = {}) {
  const BPM = parseFloat(Q.get('bpm') || bpm);
  R.bpm = BPM;
  const bater = forca => { R.bumbo = Math.max(R.bumbo, forca); R.idade = 0; if (aoBumbo) aoBumbo(forca); };
  A.aoBumbo = bater;
  ligarAudio(Q.get('audio') ?? (SAIDA ? '' : 'teste'));
  return dt => {
    analisarAudio(dt);
    if (A.an && A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
    R.idade += dt;
    R.bumbo *= Math.exp(-dt * 7);
    if (audioVivo()) {
      R.grave = A.grave; R.medio = A.medio; R.agudo = A.agudo; R.nivel = A.nivel;
      R.faixas.set(A.faixas);
      if (audioNoComando()) { R.fase = A.fase; R.bpm = A.bpm; } else R.fase += dt * R.bpm / 60;
      return;
    }
    R.bpm = BPM;
    R.fase += dt * BPM / 60;
    const b = Math.floor(R.fase), fr = R.fase - b;
    if (b !== R.ultimoRelogio) { R.ultimoRelogio = b; bater(1); }
    const chimbal = Math.exp(-((fr + 0.5) % 1) * 7);
    R.grave += (Math.exp(-fr * 5) * 0.9 - R.grave) * (1 - Math.exp(-dt * 30));
    R.medio += (0.3 + 0.25 * Math.sin(R.fase * 0.7) - R.medio) * (1 - Math.exp(-dt * 8));
    R.agudo += (chimbal * 0.8 - R.agudo) * (1 - Math.exp(-dt * 30));
    R.nivel = (R.grave + R.medio + R.agudo) / 3;
    for (let i = 0; i < NF; i++) {
      const x = i / (NF - 1);
      const ondinha = 0.5 + 0.5 * Math.sin(R.fase * 1.6 + i * 0.55) * Math.sin(R.fase * 0.37 + i * 0.13);
      const alvo = x < 0.25 ? R.grave * (1 - x * 2) : x > 0.7 ? R.agudo * (0.4 + 0.6 * ondinha) : (0.15 + R.medio) * ondinha;
      R.faixas[i] += (alvo - R.faixas[i]) * (1 - Math.exp(-dt * 25));
    }
  };
}

// ---------- atlas: uma camada por elemento (R tinta, G silhueta, B prata) ----------
export async function carregarAtlas(gpu) {
  const base = new URL('atlas/', import.meta.url);
  const meta = await (await fetch(new URL('atlas.json', base))).json();
  const T = meta.tamanho, N = meta.camadas.length;
  const tex = gpu.createTexture({ size: [T, T, N], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  await Promise.all(meta.camadas.map(async (c, i) => {
    const b = await createImageBitmap(await (await fetch(new URL(c.nome + '.png', base))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    gpu.queue.copyExternalImageToTexture({ source: b }, { texture: tex, origin: [0, 0, i] }, [T, T]);
    b.close();
  }));
  const el = {};
  meta.camadas.forEach((c, i) => { el[c.nome] = { ...c, i }; });
  return { view: tex.createView({ dimension: '2d-array' }), el };
}

// Meia largura e meia altura do quadrado da camada para o desenho caber em largMax x altMax (px do painel).
export const tamanhoPara = (e, largMax, altMax) => Math.min(largMax / (2 * e.largura), altMax / (2 * e.altura));
// Mola: sobe de 0 passando um pouco de 1 e assenta.
export const mola = t => t <= 0 ? 0 : 1 - Math.exp(-7 * t) * Math.cos(15 * t);

// Só na saída para o LED (?led): o último passo filtra na vertical, na medida do corte que o sinal sofre até o painel.
export async function criarFiltroLED(gpu, modulo, formato) {
  if (!Q.has('led')) return null;
  const tex = gpu.createTexture({ size: [RW, RH], format: formato, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const m = modulo(FILTRO_LED, 'filtro');
  const pipe = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: formato }] } });
  const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const bufP = gpu.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const mandarP = () => gpu.queue.writeBuffer(bufP, 0, new Float32Array([REACOES.tela.antiBanding, 0, 0, 0]));
  mandarP(); setInterval(mandarP, 1000);
  const bg = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: am }, { binding: 2, resource: { buffer: bufP } }] });
  return {
    alvo: tex.createView(),
    aplicar(enc, vista) {
      const r = enc.beginRenderPass({ colorAttachments: [{ view: vista, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      r.setPipeline(pipe); r.setBindGroup(0, bg); r.draw(3); r.end();
    },
  };
}

export const CAMADAS_MAX = 16;
export class Camadas {
  constructor(gpu) {
    this.gpu = gpu;
    this.f = new Float32Array(CAMADAS_MAX * 8);
    this.n = 0;
    this.buf = gpu.createBuffer({ size: this.f.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  limpar() { this.n = 0; }
  // modo: 0 = normal, 1 = tinta vira cheio branco, 2 = só tinta
  por(e, x, y, sx, sy, { rot = 0, alfa = 1, boil = 0, modo = 0 } = {}) {
    if (this.n >= CAMADAS_MAX) return;
    this.f.set([x, y, sx, sy, rot, e.i + modo * 100, alfa, boil], this.n * 8);
    this.n++;
  }
  enviar() { this.gpu.queue.writeBuffer(this.buf, 0, this.f); }
}

export const GLOBAL_BYTES = 256;
export function escreverGlobal(gpu, buf, f, tempo, dt, n, extra = 0, cabeca = 0) {
  f[0] = RW; f[1] = RH; f[2] = tempo; f[3] = dt;
  f[4] = R.bumbo; f[5] = R.idade; f[6] = R.grave; f[7] = R.medio;
  f[8] = R.agudo; f[9] = R.nivel; f[10] = R.fase; f[11] = BRILHO;
  f[12] = n; f[13] = ESCALA; f[14] = cabeca; f[15] = extra;
  f.set(R.faixas, 16);
  gpu.queue.writeBuffer(buf, 0, f);
}

export const WGSL_BASE = /* wgsl */`
struct Global {
  res: vec2f, tempo: f32, dt: f32,
  bumbo: f32, idade: f32, grave: f32, medio: f32,
  agudo: f32, nivel: f32, fase: f32, brilho: f32,
  n: f32, escala: f32, cabeca: f32, extra: f32,
  espectro: array<vec4f, 12>,
};
@group(0) @binding(0) var<uniform> G: Global;
const PAINEL = vec2f(1032., 5676.);
const DOBRA = 4988.;
const PI = 3.14159265;

struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsTela(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
fn hash21(p: vec2f) -> f32 {
  var q = fract(vec3f(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn ruido2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1, 0)), u.x), mix(hash21(i + vec2f(0, 1)), hash21(i + vec2f(1, 1)), u.x), u.y);
}
fn esp(i: u32) -> f32 { return G.espectro[i / 4u][i % 4u]; }
fn espectroEm(x: f32) -> f32 {
  let f = clamp(x, 0., 1.) * 47.;
  let i = u32(f);
  return mix(esp(i), esp(min(i + 1u, 47u)), fract(f));
}
`;

export const WGSL_CAMADAS = /* wgsl */`
struct Camada { c: vec2f, esc: vec2f, rot: f32, idx: f32, alfa: f32, boil: f32 };
@group(0) @binding(1) var<uniform> camadas: array<Camada, 16>;
@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var am: sampler;

// Junta as camadas neste ponto do painel: x = tinta, y = cheio, z = cor do cheio (1 branco, menos = prata).
@fragment fn fsCamadas(i: S) -> @location(0) vec4f {
  let p = i.uv * PAINEL;
  var s = vec3f(0., 0., 1.);
  let tq = floor(G.tempo * 9.);
  for (var k = 0u; k < u32(G.n); k++) {
    let C = camadas[k];
    if (C.alfa <= .004) { continue; }
    let d = p - C.c;
    let co = cos(C.rot); let si = sin(C.rot);
    var q = vec2f(d.x * co + d.y * si, -d.x * si + d.y * co) / C.esc;
    if (abs(q.x) > 1.08 || abs(q.y) > 1.08) { continue; }
    if (C.boil > 0.) {
      // traço tremendo, como desenho feito à mão quadro a quadro
      let w = q * 4.5 + vec2f(f32(k) * 7.3, tq * 3.7);
      q += (vec2f(ruido2(w), ruido2(w + vec2f(11., 5.))) - .5) * C.boil;
    }
    let uv = q * .5 + .5;
    if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { continue; }
    var modo = 0u;
    var idx = C.idx;
    if (idx >= 200.) { modo = 2u; idx -= 200.; } else if (idx >= 100.) { modo = 1u; idx -= 100.; }
    let a = textureSampleLevel(atlas, am, uv, i32(idx), 0.);
    var tinta = a.r * C.alfa;
    var cheio = a.g * C.alfa;
    var prata = a.b;
    if (modo == 1u) { cheio = max(cheio, tinta); tinta = 0.; prata = 1.; }
    if (modo == 2u) { cheio = 0.; }
    s.x = max(s.x * (1. - cheio), tinta);
    s.z = mix(s.z, prata, cheio);
    s.y = max(s.y, cheio);
  }
  return vec4f(s, 1.);
}
`;

export function medir(adaptador, nome) {
  let quadros = 0, ultimo = performance.now();
  return () => {
    quadros++;
    const agora = performance.now();
    if (agora - ultimo < 500) return;
    window.__estado = { visual: nome, placa: adaptador.info.vendor + '/' + adaptador.info.architecture, fps: +(quadros * 1000 / (agora - ultimo)).toFixed(1),
      resolucao: `${RW}x${RH}`, audio: A.an ? A.entrada : A.estado, contexto: A.ctx && A.ctx.state, bpm: +R.bpm.toFixed(1), vivo: audioVivo(), erros: erros.slice(0, 5) };
    quadros = 0; ultimo = agora;
  };
}
