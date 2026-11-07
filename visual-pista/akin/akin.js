// Akin: a arte da Pista Quente que o Akin mandou (assets/akin) em tempo real no LED da pista. Cartaz chapado: degradê vermelho para amarelo,
// letra branca pesada, azul elétrico e a cabeça do Millos em retícula.
// 2D: cartaz | recortes | fila.   3D, vistos a 1,60 m: letras | cabeca | tunel.
// ?modo=   ?letreiro=pista|millos fixa a palavra   ?olho=1.60   ?msaa=4
import { iniciarGPU, medir, criarFiltroLED, Q, R, RW, RH, GLOBAL_BYTES, escreverGlobal, WGSL_BASE, DOBRA, ESCALA } from '../pista-quente/nucleo.js';
import { criarMaestro } from '../espaco/maestro.js';

const MODOS = ['cartaz', 'recortes', 'fila', 'letras', 'cabeca', 'tunel'];
const MODO = MODOS.includes(Q.get('modo')) ? Q.get('modo') : 'cartaz';
const NUM = MODOS.indexOf(MODO);
const MSAA = Q.get('msaa') === '1' ? 1 : 4;
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;
const aqui = a => new URL(a, import.meta.url);

const PE_DIREITO = 2.3532;
const OLHO = parseFloat(Q.get('olho') || '1.60');
const HT = PE_DIREITO - OLHO, ZF = 4.39, XC = 0, PASSO = 1.92 / 1032;
const RD = Math.round(DOBRA * ESCALA);
function criarVista(n, D, Ux, Uy, C, hw, hh) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cx = dot(C, Ux), cy = dot(C, Uy);
  const rx = [0, 1, 2].map(i => (D * Ux[i] - cx * n[i]) / hw);
  const ry = [0, 1, 2].map(i => (D * Uy[i] - cy * n[i]) / hh);
  return [rx[0], ry[0], 0, n[0], rx[1], ry[1], 0, n[1], rx[2], ry[2], 0, n[2], 0, 0, 0.1, 0];
}
const VISTAS = [
  { m: criarVista([0, 1, 0], HT, [1, 0, 0], [0, 0, -1], [XC, HT, ZF - DOBRA * PASSO / 2], 0.96, DOBRA * PASSO / 2), y0: 0, h: RD },
  { m: criarVista([0, 0, 1], ZF, [1, 0, 0], [0, 1, 0], [XC, HT - 0.64, ZF], 0.96, 0.64), y0: RD, h: RH - RD },
];

const MEDIDAS = await (await fetch(aqui('dados/medidas.json'))).json();
const opBitmap = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
const texPal = gpu.createTexture({ size: [4096, 1024, 6], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
await Promise.all([0, 1, 2, 3, 4, 5].map(async i => {
  const b = await createImageBitmap(await (await fetch(aqui(`dados/palavra-${i}.png`))).blob(), opBitmap);
  gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texPal, origin: [0, 0, i] }, [4096, 1024]);
}));
const bmCab = await createImageBitmap(await (await fetch(aqui('dados/cabeca.png'))).blob(), opBitmap);
const texCab = gpu.createTexture({ size: [bmCab.width, bmCab.height], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
gpu.queue.copyExternalImageToTexture({ source: bmCab }, { texture: texCab }, [bmCab.width, bmCab.height]);

// As cores da arte: o degradê do LED, o vermelho chapado e o azul do cartaz das TVs. O formato de saída é linear em relação ao valor gravado.
const rgb = (r, g, b) => `vec3f(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;
const larguraPal = MEDIDAS.palavras.map(p => p.w), alturaPal = MEDIDAS.palavras.map(p => p.h);

const WGSL = WGSL_BASE + /* wgsl */`
struct Cena {
  modo: f32, cor: f32, letra: f32, massa: f32,
  a: f32, b: f32, troca: f32, voo: f32,
  fase: f32, kick: f32, grave: f32, agudo: f32,
};
struct Vista { m: mat4x4f, px: vec4f };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var pal: texture_2d_array<f32>;
@group(0) @binding(3) var cab: texture_2d<f32>;
@group(0) @binding(4) var am: sampler;
@group(1) @binding(0) var<uniform> V: Vista;
const VERMELHO = ${rgb(238, 3, 3)};
const AZUL = ${rgb(18, 56, 224)};
const BRANCO = vec3f(1.);
const CORTE = 2.63;
const CAB_AR = ${(MEDIDAS.cabeca.h / MEDIDAS.cabeca.w).toFixed(5)};
fn largPal(camada: i32) -> f32 {
  var L = array<f32, 6>(${larguraPal.join('., ')}.);
  return L[camada];
}

fn degrade(t0: f32) -> vec3f {
  let t = clamp(t0, 0., 1.);
  // as paradas do LED_DA_PISTA_degrade: vermelho, laranja e amarelo
  let a = ${rgb(237, 28, 36)}; let b = ${rgb(241, 98, 37)}; let c = ${rgb(248, 206, 38)};
  return select(mix(b, c, (t - .5) * 2.), mix(a, b, t * 2.), t < .5);
}
// d em px do quadro de 4096x1024; e é a metade da borda, no mesmo quadro
fn tintaDe(q: vec2f, camada: i32, e: f32, engorda: f32) -> f32 {
  if (q.x < 0. || q.x > 4096. || q.y < 0. || q.y > 1024.) { return 0.; }
  let d = textureSampleLevel(pal, am, q / vec2f(4096., 1024.), camada, 0.).r * 64. - 32.;
  return 1. - smoothstep(-e, e, d - engorda);
}
// palavra deitada no teto: lê de baixo para cima, com o alto da letra para a esquerda. c: centro, comp: comprimento em px do painel
fn deitada(p: vec2f, c: vec2f, comp: f32, camada: i32, engorda: f32) -> f32 {
  let s = largPal(camada) / comp;
  return tintaDe(vec2f(2048. + (c.y - p.y) * s, 512. + (p.x - c.x) * s), camada, s * .8, engorda * s);
}
fn empe(p: vec2f, c: vec2f, larg: f32, camada: i32, engorda: f32) -> f32 {
  let s = largPal(camada) / larg;
  return tintaDe(vec2f(2048. + (p.x - c.x) * s, 512. + (p.y - c.y) * s), camada, s * .8, engorda * s);
}
// a cabeça: devolve azul, branco e silhueta
fn cabeca(p: vec2f, c: vec2f, larg: f32) -> vec3f {
  let uv = (p - c) / vec2f(larg, larg * CAB_AR) + .5;
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) { return vec3f(0.); }
  let t = textureSampleLevel(cab, am, uv, 0.);
  return smoothstep(vec3f(.35), vec3f(.65), t.rgb);
}
fn carta(p: vec2f, indice: i32, deslocado: f32, cor: vec3f) -> vec4f {
  // 0 e 2: as palavras no comprimento do teto; 1: a cabeça do Millos
  let centro = vec2f(516., 2494. + deslocado);
  if (indice == 1) {
    let l = 930. * (1. + C.letra * .05);
    let h = cabeca(p, centro, l);
    let c = mix(mix(cor, AZUL, h.x), BRANCO, h.y * h.z);
    return vec4f(c, max(h.z, max(h.x, h.y)));
  }
  let camada = select(0, 1, indice == 2);
  return vec4f(BRANCO, deitada(p, centro, 4700., camada, C.letra * 7.));
}
struct T2 { @builtin(position) pos: vec4f };
@vertex fn vs2D(@builtin(vertex_index) i: u32) -> T2 {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: T2; o.pos = vec4f(q[i], 0., 1.); return o;
}
// o fundo dos visuais 3D também sai daqui: é um cartaz, não um céu
@fragment fn fs2D(i: T2) -> @location(0) vec4f {
  let p = i.pos.xy / G.escala;
  let dobra = p.y >= DOBRA;
  var c = vec3f(0.);
  if (C.modo < .5) {
    // CARTAZ: o degradê sobe e desce com o som, e as peças do Akin passam uma de cada vez
    c = degrade(p.y / 5676. + (C.cor - .35) * .34);
    if (dobra) {
      let t = empe(p, vec2f(516., DOBRA + 200.), 900., 4, 0.);
      let r = empe(p, vec2f(516., DOBRA + 495.), 760., 5, C.letra * 3.);
      c = mix(c, AZUL, max(t, r));
    } else {
      let vai = smoothstep(0., 1., C.troca);
      let a = carta(p, i32(C.a), vai * 4988., c);
      c = mix(c, a.rgb, a.a);
      if (C.troca > 0.) {
        let b = carta(p, i32(C.b), (vai - 1.) * 4988., c);
        c = mix(c, b.rgb, b.a);
      }
    }
  } else if (C.modo < 1.5) {
    // RECORTES: vermelho chapado, e a palavra cortada em fatias. Cada fatia anda com a sua faixa do som
    c = mix(VERMELHO, ${rgb(255, 60, 0)}, C.cor);
    let n = select(26., 7., dobra);
    let y0 = select(0., DOBRA, dobra);
    let tam = select(DOBRA, 688., dobra);
    let fat = floor((p.y - y0) / tam * n);
    let lado = select(-1., 1., fract(fat * .5) > .25);
    let forte = espectroEm(fract(fat * .61803));
    let dx = lado * max(forte - .22, 0.) * 300. * C.massa;
    let q = vec2f(p.x + dx, p.y);
    var t = 0.;
    if (dobra) { t = empe(q, vec2f(516., DOBRA + 344.), 860., i32(C.a) + 2, C.letra * 3.); }
    else { t = deitada(q, vec2f(516., 2494.), 4700., i32(C.a), C.letra * 7.); }
    c = mix(c, BRANCO, t);
  } else if (C.modo < 2.5) {
    // FILA: três colunas de palavras em marcha, em sentidos contrários. O som engorda a letra
    c = degrade(p.y / 5676. + (C.cor - .35) * .3);
    if (dobra) {
      c = mix(c, BRANCO, empe(p, vec2f(516., DOBRA + 344.), 860., i32(C.a) + 2, C.letra * 3.));
    } else {
      let coluna = clamp(floor(p.x / 344.), 0., 2.);
      let cx = 172. + coluna * 344.;
      let camada = i32(fract(coluna * .5 + C.a * .5) * 2.);
      let comp = 2500.;
      let sent = select(1., -1., coluna == 1.);
      let periodo = comp * 1.05;
      let y = fract((p.y + sent * C.voo * (1. + coluna * .18)) / periodo) * periodo;
      let t = deitada(vec2f(p.x, y), vec2f(cx, periodo * .5), comp, camada, C.letra * 8.);
      c = mix(c, select(BRANCO, AZUL, coluna == 1.), t);
    }
  } else if (C.modo < 5.5 && C.modo > 4.5) {
    c = AZUL * (.92 + C.cor * .2);
  } else {
    c = degrade(p.y / 5676. + (C.cor - .35) * .3);
  }
  let dither = (fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  return vec4f(c * G.brilho + dither, 1.);
}

// ---------- 3D: caixas coloridas ----------
struct CI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @builtin(vertex_index) i: u32 };
struct CO { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) cor: vec3f, @location(1) @interpolate(flat) luz: f32, @location(2) w: vec3f };
@vertex fn vsCaixa(v: CI) -> CO {
  var NS = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
  var US = array<vec3f, 6>(vec3f(0, 1, 0), vec3f(0, 1, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0));
  var VS = array<vec3f, 6>(vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 1, 0), vec3f(0, 1, 0));
  var SS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var LUZ = array<f32, 6>(.62, .78, .5, 1., .72, .9);
  let f = v.i / 6u; let s = SS[v.i % 6u];
  let lp = (NS[f] + US[f] * s.x + VS[f] * s.y) * v.b.xyz;
  let w = v.a.xyz + lp;
  var o: CO;
  o.pos = V.m * vec4f(w, 1.);
  o.cor = v.c.rgb; o.luz = LUZ[f] * v.c.a; o.w = w;
  return o;
}
@fragment fn fsCaixa(v: CO) -> @location(0) vec4f {
  let dither = (fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  return vec4f(v.cor * v.luz * G.brilho + dither, 1.);
}

// ---------- 3D: palavras em camadas do campo de distância, de trás para a frente ----------
struct PalI { @location(0) c: vec4f, @location(1) u: vec4f, @location(2) v: vec4f, @location(3) cor: vec4f, @builtin(vertex_index) i: u32 };
struct PO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) cor: vec3f, @location(2) @interpolate(flat) e: vec2f };
@vertex fn vsPal(p: PalI) -> PO {
  var QQ = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));
  let q = QQ[p.i];
  let w = p.c.xyz + p.u.xyz * (q.x - .5) * 2. + p.v.xyz * (q.y - .5) * 2.;
  var o: PO;
  o.pos = V.m * vec4f(w, 1.);
  o.uv = q; o.cor = p.cor.rgb; o.e = vec2f(p.c.w, p.u.w);
  return o;
}
@fragment fn fsPal(i: PO) -> @location(0) vec4f {
  let t = textureSampleLevel(pal, am, i.uv, i32(i.e.x), 0.).r;
  let dUv = t * 64. - 32.;
  let lx = abs(dpdx(dUv)); let ly = abs(dpdy(dUv));
  let larg = max(lx + ly * CORTE, .001);
  let cob = 1. - smoothstep(-larg * .55, larg * .55, dUv - i.e.y);
  if (cob < .004) { discard; }
  return vec4f(i.cor * G.brilho, cob);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const fC = new Float32Array(12);
const bufC = gpu.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const vis = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const lay0 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: vis, buffer: {} }, { binding: 1, visibility: vis, buffer: {} },
  { binding: 2, visibility: vis, texture: { viewDimension: '2d-array' } }, { binding: 3, visibility: vis, texture: {} },
  { binding: 4, visibility: vis, sampler: {} },
] });
const lay1 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, buffer: {} }] });
const layout = gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1] });
const bg0 = gpu.createBindGroup({ layout: lay0, entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufC } },
  { binding: 2, resource: texPal.createView({ dimension: '2d-array' }) }, { binding: 3, resource: texCab.createView() },
  { binding: 4, resource: am },
] });
const bgV = VISTAS.map(v => {
  const b = gpu.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
  gpu.queue.writeBuffer(b, 0, new Float32Array([...v.m, 2 / RW, 2 / v.h, v.y0 ? 1 : 0, 0]));
  return gpu.createBindGroup({ layout: lay1, entries: [{ binding: 0, resource: { buffer: b } }] });
});

const m = modulo(WGSL, 'akin');
const ms = { count: MSAA };
const sobre = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const attrs = (n, stride) => ({ arrayStride: stride, stepMode: 'instance', attributes: Array.from({ length: n }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) });
const [p2D, pCaixa, pPal] = await Promise.all([
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' }, vertex: { module: m, entryPoint: 'vs2D' }, fragment: { module: m, entryPoint: 'fs2D', targets: [{ format: formato }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' }, vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrs(3, 48)] }, fragment: { module: m, entryPoint: 'fsCaixa', targets: [{ format: formato }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' }, vertex: { module: m, entryPoint: 'vsPal', buffers: [attrs(4, 64)] }, fragment: { module: m, entryPoint: 'fsPal', targets: [{ format: formato, blend: sobre }] } }),
]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const texProf = gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
const texCor = MSAA > 1 ? gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: formato, usage: T.RENDER_ATTACHMENT }) : null;

// ---------- instâncias ----------
const MAX_C = 14000, MAX_P = 260;
const dadosC = new Float32Array(MAX_C * 12), dadosP = new Float32Array(MAX_P * 16);
const bufCx = gpu.createBuffer({ size: dadosC.byteLength, usage: U.VERTEX | U.COPY_DST });
const bufPal = gpu.createBuffer({ size: dadosP.byteLength, usage: U.VERTEX | U.COPY_DST });
let nC = 0, nP = 0, nPTeto = 0;
function caixa(x, y, z, hx, hy, hz, cor, luz = 1) {
  if (nC >= MAX_C) return;
  const i = nC * 12, d = dadosC;
  d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = 0; d[i + 4] = hx; d[i + 5] = hy; d[i + 6] = hz; d[i + 7] = 0;
  d[i + 8] = cor[0]; d[i + 9] = cor[1]; d[i + 10] = cor[2]; d[i + 11] = luz;
  nC++;
}
function camadaPalavra(c, u, v, camada, cor, engorda = 0) {
  if (nP >= MAX_P) return;
  dadosP.set([c[0], c[1], c[2], camada, u[0], u[1], u[2], engorda, v[0], v[1], v[2], 0, cor[0], cor[1], cor[2], 1], nP * 16);
  nP++;
}
const LIN = c => c.map(v => v / 255);
const COR = { branco: [1, 1, 1], azul: LIN([18, 56, 224]), azulFundo: LIN([10, 30, 130]), vermelho: LIN([238, 3, 3]), laranja: LIN([241, 98, 37]), amarelo: LIN([248, 206, 38]) };
const quente = t => {
  const x = Math.max(0, Math.min(1, t));
  const [a, b, k] = x < 0.5 ? [COR.vermelho, COR.laranja, x * 2] : [COR.laranja, COR.amarelo, x * 2 - 1];
  return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * k);
};
// Palavra extrudada: as camadas de trás são o lado, em azul que escurece; a da frente é branca. No teto a frente é a de baixo, na parede a mais perto de quem olha.
function palavraTeto(z, largX, camada, prof, y0, frente, lado, engorda) {
  const s = largX / alturaPal[camada];   // largX: altura da letra, no sentido da largura do painel. s: metros por px do quadro
  const u = [0, 0, -2048 * s], v = [512 * s, 0, 0];
  const F = Math.max(6, Math.round(prof * 60));
  for (let k = F; k >= 0; k--) {
    const y = y0 + (k / F) * prof;
    const esc = k ? [lado[0] * (1 - 0.5 * k / F), lado[1] * (1 - 0.5 * k / F), lado[2] * (1 - 0.5 * k / F)] : frente;
    camadaPalavra([XC, y, z], u, v, camada, esc, engorda);
  }
}
function palavraParede(camada, larg, prof, zBase, frente, lado, engorda) {
  const s = larg / larguraPal[camada];
  const u = [2048 * s, 0, 0], v = [0, -512 * s, 0];
  const cy = HT - 0.64;
  const F = Math.max(6, Math.round(prof * 80));
  for (let k = F; k >= 0; k--) {
    const z = zBase + (k / F) * prof;
    const c = k ? [lado[0] * (1 - 0.45 * k / F), lado[1] * (1 - 0.45 * k / F), lado[2] * (1 - 0.45 * k / F)] : frente;
    camadaPalavra([XC, cy, z], u, v, camada, c, engorda);
  }
}

// ---------- som e tempo ----------
const M = criarMaestro();
const fixo = ['pista', 'millos'].indexOf(Q.get('letreiro'));
let tempo = 0, ultimo = performance.now(), voo = 0, vel = 0;
let palavraAt = fixo >= 0 ? fixo : 0, batidasPal = 0, ultimaBat = 0;
// Cartaz: PISTA, cabeça, MILLOS. A cada 16 tempos, a peça seguinte empurra a anterior para a parede.
let cartaA = parseInt(Q.get('carta') || '0', 10) % 3, cartaB = (cartaA + 1) % 3, troca = 0;
const empurrao = { x: 0, v: 0, passo(dt) { const h = dt / 2; for (let i = 0; i < 2; i++) { this.v += (-90 * this.x - 15 * this.v) * h; this.x += this.v * h; } return this.x; } };

// a grade da cabeça em blocos, lida da própria arte
let blocos = null;
if (MODO === 'cabeca') {
  const NX = 54, NY = Math.round(NX * MEDIDAS.cabeca.h / MEDIDAS.cabeca.w);
  const can = new OffscreenCanvas(NX, NY), x = can.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(bmCab, 0, 0, NX, NY);
  const px = x.getImageData(0, 0, NX, NY).data;
  blocos = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const o = (j * NX + i) * 4;
    if (px[o + 2] < 120) continue;
    blocos.push({ i, j, nx: i / NX - 0.5, ny: j / NY - 0.5, branco: px[o + 1] > px[o], sorte: Math.random() });
  }
  blocos.nx = NX; blocos.ny = NY;
}

function cenaLetras(dt) {
  // a palavra atravessa o teto da entrada até a parede, devagar. Só troca fora de vista.
  const LARGX = 0.84, PASSE = 22;
  const andou = voo * 0.32 / PASSE;
  if (fixo < 0) palavraAt = Math.floor(andou) % 2;
  const comp = larguraPal[palavraAt] * LARGX / alturaPal[palavraAt];
  const z = -5.2 - comp / 2 + (andou % 1) * PASSE;
  const prof = 0.26 + 0.42 * M.fonte('akinMassa');
  palavraTeto(z, LARGX, palavraAt, prof, HT + 0.05, COR.branco, COR.azul, M.fonte('akinLetra') * 6);
  nPTeto = nP;
  palavraParede(palavraAt + 2, 1.62, 0.34 + 0.2 * M.fonte('akinMassa'), ZF - 0.45 - empurrao.x * 0.3, COR.branco, COR.azul, M.fonte('akinLetra') * 4);
  return dt;
}
function cenaCabeca(dt) {
  // uma fila de cabeças de blocos passa devagar pelo teto, em direção à parede. O som empurra os blocos para baixo, como um equalizador.
  const NX = blocos.nx, largura = 3.6, passo = largura / NX, altura = passo * blocos.ny;
  const yBase = 1.5, meio = passo * 0.46, ESPACO = altura * 1.12;
  const massa = M.fonte('akinMassa');
  voo += dt * 0.5;
  const nDe = Math.floor((voo - 10) / ESPACO), nAte = Math.floor((voo + 8.6) / ESPACO);
  for (let n = nDe; n <= nAte; n++) {
    const zc = n * ESPACO - voo;
    if (zc + altura / 2 < -10 || zc - altura / 2 > 8.6) continue;
    for (const b of blocos) {
      const sobe = (R.faixas[Math.floor(b.sorte * 40)] || 0) * 0.5 * massa + M.atraso(Math.hypot(b.nx, b.ny * 1.4) * 1.5) * 0.35;
      const prof = meio * (1 + sobe * 9);
      caixa(XC + b.nx * largura, yBase - sobe * 0.25 + prof, zc + b.ny * altura, meio, prof, meio, b.branco ? COR.branco : COR.azul);
    }
  }
  palavraParede(palavraAt + 2, 1.62, 0.3, ZF - 0.42 - empurrao.x * 0.3, COR.branco, COR.azul, M.fonte('akinLetra') * 4);
}
function cenaTunel(dt) {
  const ESPACO = 3.3, PX = 2.2, PY = 2.25, PB = 1.5, E = 0.26, PERTO = -18, LONGE = 62;
  vel += (ESPACO * M.bpm / 60 / 4 - vel) * (1 - Math.exp(-dt * 0.4));
  voo += dt * vel;
  const prim = Math.floor((voo + PERTO) / ESPACO), ulti = Math.floor((voo + LONGE) / ESPACO);
  const pulso = 1 + M.fonte('akinMassa') * 0.18;
  for (let n = prim; n <= ulti; n++) {
    const z = n * ESPACO - voo;
    const t = Math.max(0, Math.min(1, (z + 18) / 62));
    const cor = quente(((n % 7) + 7) % 7 / 6 * 0.6 + t * 0.4);
    const luz = pulso * (1 - t * 0.2);
    caixa(XC, PY + 0.22, z, PX + E, 0.22, 0.24, cor, luz);
    caixa(XC, -PB - 0.22, z, PX + E, 0.22, 0.24, cor, luz);
    caixa(XC - PX, (PY - PB) / 2, z, E, (PY + PB) / 2, 0.24, cor, luz);
    caixa(XC + PX, (PY - PB) / 2, z, E, (PY + PB) / 2, 0.24, cor, luz);
  }
  palavraParede(palavraAt + 2, 1.62, 0.3, ZF - 0.42 - empurrao.x * 0.3, COR.branco, COR.azulFundo, M.fonte('akinLetra') * 4);
}

const contar = medir(adaptador, 'akin-' + MODO);
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  M.quadro(dt);
  if (M.batida !== ultimaBat) {
    ultimaBat = M.batida;
    batidasPal++;
    if (fixo < 0 && batidasPal % 32 === 0 && MODO !== 'letras') palavraAt = 1 - palavraAt;
    if (batidasPal % 16 === 0 && troca === 0) { cartaB = (cartaA + 1) % 3; troca = 1e-4; }
  }
  if (troca > 0) { troca = Math.min(1, troca + dt / 1.4); if (troca >= 1) { troca = 0; cartaA = cartaB; } }
  if (M.disparou('akinLetra', dt)) empurrao.v += 1;
  empurrao.passo(dt);
  // a marcha da Fila anda com o BPM, e o Letras anda devagar. Sem música, os dois seguem no ritmo calmo do relógio.
  if (MODO === 'fila') voo += dt * (60 + 150 * M.fonte('akinMassa'));
  else if (MODO === 'letras') voo += dt * 3;

  nC = 0; nP = 0; nPTeto = 0;
  if (MODO === 'letras') cenaLetras(dt);
  else if (MODO === 'cabeca') { cenaCabeca(dt); nPTeto = 0; }
  else if (MODO === 'tunel') { cenaTunel(dt); nPTeto = 0; }
  if (nC) gpu.queue.writeBuffer(bufCx, 0, dadosC, 0, nC * 12);
  if (nP) gpu.queue.writeBuffer(bufPal, 0, dadosP, 0, nP * 16);

  const modoCor = M.modo('akinCor');
  fC.set([NUM, modoCor === 'desligado' ? 0.35 : M.fonte('akinCor'), M.fonte('akinLetra'), M.modo('akinMassa') === 'desligado' ? 0 : 1,
    cartaA, cartaB, troca, MODO === 'fila' ? voo : 0,
    M.fase, M.kick, M.grave, M.agudo]);
  if (MODO === 'recortes' || MODO === 'fila') { fC[4] = palavraAt; }
  gpu.queue.writeBuffer(bufC, 0, fC);
  escreverGlobal(gpu, bufG, fG, tempo, dt, 0);

  const enc = gpu.createCommandEncoder();
  const vTela = contexto.getCurrentTexture().createView();
  const destino = filtro ? filtro.alvo : vTela;
  const r = enc.beginRenderPass({
    colorAttachments: [MSAA > 1
      ? { view: texCor.createView(), resolveTarget: destino, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }
      : { view: destino, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: texProf.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  });
  r.setBindGroup(0, bg0);
  r.setBindGroup(1, bgV[0]);
  r.setPipeline(p2D); r.draw(3);
  VISTAS.forEach((v, i) => {
    if (NUM < 3) return;
    r.setViewport(0, v.y0, RW, v.h, 0, 1);
    r.setScissorRect(0, v.y0, RW, v.h);
    r.setBindGroup(1, bgV[i]);
    if (nC) { r.setPipeline(pCaixa); r.setVertexBuffer(0, bufCx); r.draw(36, nC); }
    if (nP) {
      r.setPipeline(pPal); r.setVertexBuffer(0, bufPal);
      if (i === 0 && nPTeto) r.draw(6, nPTeto);
      if (i === 1) r.draw(6, nP - nPTeto, 0, nPTeto);
    }
  });
  r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, M, get estado() { return { modo: MODO, palavra: palavraAt, carta: cartaA, troca: +troca.toFixed(2), caixas: nC, camadas: nP, ...M.estado(), tempo: +tempo.toFixed(1) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
