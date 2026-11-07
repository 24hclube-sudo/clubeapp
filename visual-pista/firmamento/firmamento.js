// Firmamento: o céu é o personagem. Teto e parede do LED são janelas para o mesmo céu, vistas por quem está em pé na pista, com os olhos a 1,60 m.
// Cada céu (ceus.js) é calculado por raio de visão num alvo de 16 bits, separado: a resolução dele vem do que o céu precisa, não do painel.
// Por cima entram, em resolução cheia, as estrelas nítidas, as cadentes e o logo em prata, os mesmos do Espaço.
// ?modo=lactea | rastros | aurora | eclipse | aneis | horizonte   ?simsom=1 simula música, para foto   ?olho=1.60   ?msaa=4
import { iniciarGPU, medir, criarFiltroLED, Q, R, RW, RH, GLOBAL_BYTES, escreverGlobal, WGSL_BASE, DOBRA, ESCALA } from '../pista-quente/nucleo.js';
import { criarMaestro } from '../espaco/maestro.js';
import { WGSL_BRILHINHO, WGSL_LOGO, WGSL_CONTRA, forcaContra, estiloLuz, ajusteLogo, pipelineContra, criarBrilhinhos } from '../espaco/brilhinhos.js';
import { REACOES } from '../js/reacoes.js';
import { CEUS, WGSL_RUIDO } from './ceus.js';

const MODO = CEUS[Q.get('modo')] ? Q.get('modo') : 'lactea';
const CEU = CEUS[MODO];
const MSAA = Q.get('msaa') === '1' ? 1 : 4;
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;

const PE_DIREITO = 2.3532;
const OLHO = parseFloat(Q.get('olho') || '1.60');
const HT = PE_DIREITO - OLHO, ZF = 4.39, XC = 0, PASSO = 1.92 / 1032;
const RD = Math.round(DOBRA * ESCALA);
const QUASE = 0.1;
function criarVista(n, D, Ux, Uy, C, hw, hh) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cx = dot(C, Ux), cy = dot(C, Uy);
  const rx = [0, 1, 2].map(i => (D * Ux[i] - cx * n[i]) / hw);
  const ry = [0, 1, 2].map(i => (D * Uy[i] - cy * n[i]) / hh);
  return [rx[0], ry[0], 0, n[0], rx[1], ry[1], 0, n[1], rx[2], ry[2], 0, n[2], 0, 0, QUASE, 0];
}
const VISTAS = [
  { m: criarVista([0, 1, 0], HT, [1, 0, 0], [0, 0, -1], [XC, HT, ZF - DOBRA * PASSO / 2], 0.96, DOBRA * PASSO / 2), y0: 0, h: RD },
  { m: criarVista([0, 0, 1], ZF, [1, 0, 0], [0, 1, 0], [XC, HT - 0.64, ZF], 0.96, 0.64), y0: RD, h: RH - RD },
];

// ---------- alvo do céu ----------
const CW = Math.round(RW * CEU.res[0]), CH = Math.round(RH * CEU.res[1]);
const CRD = Math.round(RD * CEU.res[1]);
const texCeu = gpu.createTexture({ size: [CW, CH], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });

async function textura(arq, mips) {
  const blob = await (await fetch(new URL(arq, import.meta.url))).blob();
  const op = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
  const b = await createImageBitmap(blob, op);
  const w = b.width, h = b.height;
  const niveis = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  const tex = gpu.createTexture({ size: [w, h], mipLevelCount: niveis, format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
  for (let m = 0; m < niveis; m++) {
    const mw = Math.max(1, w >> m), mh = Math.max(1, h >> m);
    const f = m ? await createImageBitmap(b, { ...op, resizeWidth: mw, resizeHeight: mh, resizeQuality: 'high' }) : b;
    gpu.queue.copyExternalImageToTexture({ source: f }, { texture: tex, mipLevel: m }, [mw, mh]);
    if (m) f.close();
  }
  return tex;
}
const texMat = await textura('../espaco/dados/materiais.png', true);
const LETREIROS = ['clube', 'pista', 'millos'];
const urlLetreiro = n => new URL('../espaco/dados/letreiro-' + n + '.png', import.meta.url);
const texLogo = gpu.createTexture({ size: [2048, 720, LETREIROS.length], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
await Promise.all(LETREIROS.map(async (n, i) => {
  const b = await createImageBitmap(await (await fetch(urlLetreiro(n))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texLogo, origin: [0, 0, i] }, [2048, 720]);
}));

// Perfil de uma dimensão, com mipmaps de verdade: é o que deixa milhares de riscos finos sem moiré. Hoje só os anéis usam.
function criarPerfil(dados) {
  if (!dados) return gpu.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
  const L = dados.length / 4, niveis = Math.floor(Math.log2(L)) + 1;
  const tex = gpu.createTexture({ size: [L, 1], mipLevelCount: niveis, format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
  let atual = dados, w = L;
  for (let m = 0; m < niveis; m++) {
    gpu.queue.writeTexture({ texture: tex, mipLevel: m }, atual, { bytesPerRow: w * 4 }, [w, 1]);
    if (w > 1) {
      const nw = w >> 1, prox = new Uint8Array(nw * 4);
      for (let p = 0; p < nw; p++) for (let c = 0; c < 4; c++) prox[p * 4 + c] = (atual[p * 8 + c] + atual[p * 8 + 4 + c]) / 2;
      atual = prox; w = nw;
    }
  }
  return tex;
}
const texPerfil = criarPerfil(CEU.perfil ? CEU.perfil() : null);

const WGSL = WGSL_BASE + /* wgsl */`
struct Cena {
  luzZ: f32, luzF: f32, flash: f32, envFase: f32,
  deriva: f32, voo: f32, halo: f32, varre: f32,
  logo: vec4f,
  logoProf: f32, fatias: f32, lavar: f32, grave: f32,
  letMix: f32, luzLogo: f32, letA: f32, letB: f32,
  contra: vec4f,
  ceu: vec4f,      // x nível do som no céu, y bumbo, z fluxo (tempo que corre com a música), w quadro
  ceu2: vec4f,     // xy subpixel, z força da luz de trás pedida no app, w tempo
  ondas: array<vec4f, 4>,   // o bumbo dos últimos instantes: anda pelo céu em vez de bater em tudo junto
};
struct Vista { m: mat4x4f, px: vec4f };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var mat: texture_2d<f32>;
@group(0) @binding(3) var amT: sampler;
@group(0) @binding(4) var sdf: texture_2d_array<f32>;
@group(0) @binding(5) var amL: sampler;
@group(0) @binding(6) var perfil: texture_2d<f32>;
@group(1) @binding(0) var<uniform> V: Vista;
const HT = ${HT.toFixed(4)}; const ZF = ${ZF};
const LOGO_W = ${(2048 / 1720).toFixed(6)};
const LOGO_H = ${(720 / 1720).toFixed(6)};
const ZC = ${(ZF - DOBRA * PASSO / 2).toFixed(4)}; const ZH = ${(DOBRA * PASSO / 2).toFixed(4)};
const CORTE = 2.63;    // o sinal leva 1 linha a cada 2,63 do painel
const CORTE_C = ${(2.63 * CEU.res[1] / CEU.res[0]).toFixed(4)};   // o mesmo corte, medido em px do alvo do céu
const AA_ESC = ${(1 / ESCALA).toFixed(4)};
const ESPELHO = ${CEU.espelho ? '1.' : '0.'};
fn perto(uv: vec2f) -> f32 {
  if (C.letMix > .001) { return mix(textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).g, textureSampleLevel(sdf, amL, uv, i32(C.letB), 0.).g, C.letMix) * 512. - 256.; }
  return textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).r * 48. - 24.;
}
fn longe(uv: vec2f) -> f32 {
  return mix(textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).g, textureSampleLevel(sdf, amL, uv, i32(C.letB), 0.).g, C.letMix) * 512. - 256.;
}
${WGSL_BRILHINHO}
${WGSL_LOGO}
${WGSL_CONTRA}
${WGSL_RUIDO}
var<private> PX: vec2f;   // o pixel do alvo do céu: o salto dos raios é por pixel, senão vira desenho
fn ondaEm(x: f32) -> f32 {
  let f = clamp(x, 0., 1.) * 15.;
  let i = u32(f); let j = min(i + 1u, 15u);
  return mix(C.ondas[i / 4u][i % 4u], C.ondas[j / 4u][j % 4u], fract(f));
}
${CEU.wgsl}

// ---------- o céu, por raio de visão ----------
struct CO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsCeu(@builtin(vertex_index) i: u32) -> CO {
  var QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = QQ[i];
  var w = vec3f(q.x * 1.02, HT, ZC + q.y * ZH * 1.02);
  if (V.px.z > .5) { w = vec3f(q.x * 1.02, HT - .64 + q.y * .68, ZF); }
  var o: CO;
  o.pos = V.m * vec4f(w, 1.);
  o.w = w;
  return o;
}
@fragment fn fsCeu(i: CO) -> @location(0) vec4f {
  PX = i.pos.xy;
  let w = i.w + dpdx(i.w) * C.ceu2.x + dpdy(i.w) * C.ceu2.y;
  let v = normalize(w);
  // abaixo da linha do horizonte, um espelho d'água preto: reflete o céu, com a ondulação quase parada
  let e = max(abs(dpdx(v.y)) + abs(dpdy(v.y)) * CORTE_C, .00002);
  let abaixo = ESPELHO * (1. - smoothstep(-e, e, v.y));
  let chao = v.xz * (1.6 / max(-v.y, .012));
  let ampl = .0045 * (1. - smoothstep(10., 60., length(chao))) * abaixo;
  let onda = vec2f(gn(vec3f(chao * vec2f(.9, .28), C.ceu.z * .22)), gn(vec3f(chao * vec2f(.5, .16) + 7., C.ceu.z * .18)));
  let vr = normalize(vec3f(v.x + onda.x * ampl * 2.2, mix(v.y, abs(v.y), ESPELHO) + onda.y * ampl * 1.5 + .0008 * abaixo, v.z));
  let s = ceuEm(vr);
  let refl = .22 + .5 * exp(v.y * 26.);
  return vec4f(s.x * mix(1., refl, abaixo), 0., 0., s.y * (1. - abaixo));
}
// O céu entra por cima das estrelas: o alfa dele diz quanto delas continua a passar. Disco, planeta e anel tapam mesmo.
@group(2) @binding(0) var ceuTex: texture_2d<f32>;
fn tom(x: f32) -> f32 { return 1. - exp(-max(x, 0.)); }
@fragment fn fsJunta(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let s = textureSampleLevel(ceuTex, amL, p.xy / G.res, 0.);
  let d = fract(52.9829189 * fract(dot(p.xy, vec2f(.06711056, .00583715)))) + fract(52.9829189 * fract(dot(p.xy + vec2f(47., 17.), vec2f(.06711056, .00583715)))) - 1.;
  let l = tom(s.r) * G.brilho;
  return vec4f(vec3f(max(l + d * .9 / 255. * smoothstep(0., 3. / 255., l), 0.)), clamp(s.a, 0., 1.));
}
struct TI { @builtin(vertex_index) i: u32 };
struct TO { @builtin(position) pos: vec4f };
@vertex fn vsJunta(e: TI) -> TO {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: TO; o.pos = vec4f(q[e.i], 1e-5, 1.); return o;
}

// ---------- estrelas nítidas: a mesma conta do Espaço, com a lente de cada céu ----------
struct EI { @location(0) a: vec4f, @location(1) b: vec4f, @builtin(vertex_index) i: u32 };
struct EO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: vec2f };
@vertex fn vsEstrela(e: EI) -> EO {
  var QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var w: vec3f;
  if (e.b.x < .5) {
    // termina na parede: além dela, a estrela do teto cairia na parede toda amontoada no alto
    let z = -5.5 + 9.89 * fract(e.a.y - C.deriva / (e.a.z * 9.89));
    w = vec3f(e.a.x, HT, z) * e.a.z;
  } else {
    let k = 1.2 + 60. * fract(e.a.y - C.voo / (60. * ZF));
    w = vec3f(e.a.x, e.b.y, ZF) * k;
  }
  var ganho = 1.;
  if (e.b.w > 1.5) { w = vec3f(w.x, -w.y, w.z); ganho = .34; }
  else { let l = lenteEstrela(w, e.b.w); w = l.xyz; ganho = l.w; }
  let m = e.a.w;
  let r = (1.25 + 2.9 * m * m * m) * G.escala;
  let quad = r * (1.25 + 5. * m * m * m * m);
  let q = QQ[e.i];
  var o: EO;
  o.pos = V.m * vec4f(w, 1.);
  o.pos = vec4f(o.pos.xy + q * quad * V.px.xy * o.pos.w, o.pos.zw);
  o.q = q * quad / r;
  let h = e.b.z;
  let g = C.grave;
  let limiar = fract(h * 91.);
  let revela = select(smoothstep((limiar - .42) * .9, (limiar - .42) * .9 + .22, g), 1., limiar < .42);
  o.l = vec2f(ganho * (.34 + .66 * m) * revela * (.46 + 1.5 * g * g + .5 * g), m);
  return o;
}
@fragment fn fsEstrela(i: EO) -> @location(0) vec4f {
  let d = length(i.q);
  let nucleo = 1. - smoothstep(.45, 1., d);
  let halo = i.l.y * i.l.y * .3 / (1. + d * d * .9) * (1. - smoothstep(1.2, 6.2, d));
  return vec4f(vec3f((nucleo + halo) * i.l.x) * G.brilho, 1.);
}

struct MI { @location(0) a: vec4f, @location(1) b: vec4f, @builtin(vertex_index) i: u32 };
struct MO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: f32 };
@vertex fn vsMeteoro(e: MI) -> MO {
  var QQ = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(1, 1), vec2f(0, -1), vec2f(1, 1), vec2f(0, 1));
  let q = QQ[e.i];
  let c0 = V.m * vec4f(e.a.xyz, 1.);
  let c1 = V.m * vec4f(e.b.xyz, 1.);
  let p0 = c0.xy / c0.w / V.px.xy;
  let p1 = c1.xy / c1.w / V.px.xy;
  let dirv = normalize(p1 - p0 + vec2f(.0001));
  let nor = vec2f(-dirv.y, dirv.x);
  let p = mix(p0, p1, q.x) + nor * q.y * e.b.w * G.escala;
  var o: MO;
  o.pos = vec4f(p * V.px.xy, 1e-5, 1.);
  o.q = q; o.l = e.a.w;
  return o;
}
@fragment fn fsMeteoro(i: MO) -> @location(0) vec4f {
  let cauda = pow(i.q.x, 3.2);
  let lado = 1. - smoothstep(.15, 1., abs(i.q.y));
  return vec4f(vec3f(cauda * lado * i.l) * G.brilho, 1.);
}

// ---------- logo: as mesmas camadas do Espaço ----------
fn luzAtras(w: vec3f) -> f32 {
  let q = vec2f((w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
  return brilhoPerto(max(longe(q), 0.));
}
struct LO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
@vertex fn vsLogo(@builtin(vertex_index) i: u32, @builtin(instance_index) ins: u32) -> LO {
  var QQ = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));
  let q = QQ[i];
  let k = C.fatias - 1. - f32(ins);
  let w = vec3f(C.logo.x + (q.x - .5) * 2. * C.logo.w * LOGO_W, C.logo.y - (q.y - .5) * 2. * C.logo.w * LOGO_H, C.logo.z + k / (C.fatias - 1.) * C.logoProf);
  var o: LO;
  o.pos = V.m * vec4f(w, 1.);
  o.uv = q; o.w = w; o.k = k;
  return o;
}
@fragment fn fsHalo(i: LO) -> @location(0) vec4f {
  return vec4f(vec3f(luzAtras(i.w) * C.halo * .8) * G.brilho, 1.);
}
@fragment fn fsLogo(i: LO) -> @location(0) vec4f {
  let riscoL = textureSample(mat, amT, i.uv * vec2f(.9, .3)).g;
  let d = perto(i.uv);
  let lx = abs(dpdx(d)); let ly = abs(dpdy(d));
  let largura = max(lx + ly * CORTE, .001);
  let cob = 1. - smoothstep(-largura * .55, largura * .55, d);
  if (cob < .004) { discard; }
  let dither = (fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  let ex = vec2f(4. / 2048., 0.); let ey = vec2f(0., 4. / 720.);
  let gx = perto(i.uv + ex) - perto(i.uv - ex);
  let gy = perto(i.uv + ey) - perto(i.uv - ey);
  let g = normalize(vec3f(gx, -gy, 0.) + vec3f(.00001));
  var lum = 0.;
  if (i.k < .5) { lum = frenteLogo(d, g, i.uv, i.w, riscoL, C.flash, C.luzF, C.varre, C.luzLogo); }
  else { lum = ladoLogo(g, i.uv, C.flash, C.luzF, C.luzLogo); }
  lum = logoEmContraluz(lum, d, i.k);
  return vec4f(vec3f(lum) * G.brilho + dither, cob);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const fC = new Float32Array(48);
const bufC = gpu.createBuffer({ size: fC.byteLength, usage: U.UNIFORM | U.COPY_DST });
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
const amL = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const vis = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const lay0 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: vis, buffer: {} }, { binding: 1, visibility: vis, buffer: {} },
  { binding: 2, visibility: vis, texture: {} }, { binding: 3, visibility: vis, sampler: {} },
  { binding: 4, visibility: vis, texture: { viewDimension: '2d-array' } }, { binding: 5, visibility: vis, sampler: {} },
  { binding: 6, visibility: vis, texture: {} },
] });
const lay1 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, buffer: {} }] });
const lay2 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, texture: {} }] });
const layout = gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1] });
const layoutJunta = gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1, lay2] });
const bg0 = gpu.createBindGroup({ layout: lay0, entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufC } },
  { binding: 2, resource: texMat.createView() }, { binding: 3, resource: am },
  { binding: 4, resource: texLogo.createView({ dimension: '2d-array' }) }, { binding: 5, resource: amL },
  { binding: 6, resource: texPerfil.createView() },
] });
const bg2 = gpu.createBindGroup({ layout: lay2, entries: [{ binding: 0, resource: texCeu.createView() }] });
const bgV = VISTAS.map(v => {
  const b = gpu.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
  gpu.queue.writeBuffer(b, 0, new Float32Array([...v.m, 2 / RW, 2 / v.h, v.y0 ? 1 : 0, 0]));
  return gpu.createBindGroup({ layout: lay1, entries: [{ binding: 0, resource: { buffer: b } }] });
});

const m = modulo(WGSL, 'firmamento-' + MODO);
const ms = { count: MSAA };
const prof = grava => ({ format: 'depth32float', depthWriteEnabled: grava, depthCompare: 'greater' });
const soma = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const sobre = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const atenuar = { color: { srcFactor: 'one', dstFactor: 'src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
const ACUMULA = CEU.acumula || 0;
const misturaCeu = ACUMULA ? { color: { srcFactor: 'constant', dstFactor: 'one-minus-constant' }, alpha: { srcFactor: 'constant', dstFactor: 'one-minus-constant' } } : undefined;
const brilhinhos = await criarBrilhinhos(gpu, LETREIROS.map(urlLetreiro));
const attr2 = { arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) };
const [pContra, pCeu, pJunta, pEstrela, pLogo, pMeteoro, pHalo, pBrilhinho] = await Promise.all([
  pipelineContra(gpu, m, layout, ms, formato, soma),
  gpu.createRenderPipelineAsync({ layout, vertex: { module: m, entryPoint: 'vsCeu' }, fragment: { module: m, entryPoint: 'fsCeu', targets: [{ format: 'rgba16float', blend: misturaCeu }] } }),
  gpu.createRenderPipelineAsync({ layout: layoutJunta, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsJunta' }, fragment: { module: m, entryPoint: 'fsJunta', targets: [{ format: formato, blend: atenuar }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsEstrela', buffers: [attr2] }, fragment: { module: m, entryPoint: 'fsEstrela', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsLogo', targets: [{ format: formato, blend: sobre }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsMeteoro', buffers: [attr2] }, fragment: { module: m, entryPoint: 'fsMeteoro', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsHalo', targets: [{ format: formato, blend: soma }] } }),
  brilhinhos.pipeline(m, layout, ms, formato, soma),
]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const texProf = gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
const texCor = MSAA > 1 ? gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: formato, usage: T.RENDER_ATTACHMENT }) : null;

const M = criarMaestro();

// ---------- estrelas: distribuídas por igual na área do painel, ou a beirada do céu ficaria vazia ----------
const nTeto = CEU.estrelas[0], nParede = CEU.estrelas[1];
const lista = [];
const peso = CEU.pesoEstrela || (() => 1);
function escolher(gera) {
  for (let t = 0; t < 60; t++) { const e = gera(); if (Math.random() < peso(e.dir)) return e; }
  return gera();
}
for (let i = 0; i < nTeto; i++) {
  const e = escolher(() => { const x = XC + (Math.random() - 0.5) * 2.1, f = Math.random(), z = -5.5 + 9.89 * f; return { x, f, dir: [x, HT, z] }; });
  lista.push([e.x, e.f, 4 + 86 * Math.pow(Math.random(), 1.6), Math.pow(Math.random(), 2.4), 0, 0, Math.random(), 0]);
}
const inicioParede = lista.length;
for (let i = 0; i < nParede; i++) {
  const e = escolher(() => { const x = XC + (Math.random() - 0.5) * 2.3, y = (CEU.espelho ? 0 : HT - 1.34) + Math.random() * (CEU.espelho ? HT + 0.02 : 1.46); return { x, y, dir: [x, y, ZF] }; });
  lista.push([e.x, Math.random(), 0, Math.pow(Math.random(), 2.4), 1, e.y, Math.random(), 0]);
}
const nPrim = lista.length;
if (CEU.lente) for (let i = 0; i < nPrim; i++) { const c = lista[i].slice(); c[7] = 1; lista.push(c); }
const nDiretas = lista.length;
if (CEU.espelho) for (let i = inicioParede; i < nPrim; i++) { const c = lista[i].slice(); c[7] = 2; lista.push(c); }
const nRefl = lista.length - nDiretas;
const dadosE = new Float32Array(Math.max(lista.length, 1) * 8);
lista.forEach((e, i) => dadosE.set(e, i * 8));
const bufE = gpu.createBuffer({ size: dadosE.byteLength, usage: U.VERTEX | U.COPY_DST });
gpu.queue.writeBuffer(bufE, 0, dadosE);

const MAX_M = 3;
const dadosM = new Float32Array(MAX_M * 8);
const bufM = gpu.createBuffer({ size: dadosM.byteLength, usage: U.VERTEX | U.COPY_DST });
const meteoros = [];
let proxMeteoro = parseFloat(Q.get('meteoro') || (2 + Math.random() * 3));
function meteorosQuadro(dt) {
  proxMeteoro -= dt;
  if (!CEU.semMeteoros && proxMeteoro <= 0 && meteoros.length < MAX_M && M.modo('meteoros') !== 'desligado') {
    proxMeteoro = 3 + Math.random() * 6;
    const lado = Math.random() < 0.5 ? -1 : 1, rumo = Math.random() < 0.5 ? -1 : 1;
    meteoros.push({ x: XC - lado * (0.25 + Math.random() * 0.6), z: rumo > 0 ? -4.6 + Math.random() * 5 : ZF - 0.3 - Math.random() * 5, vx: lado * (0.25 + Math.random() * 0.5), vz: rumo * (2.6 + Math.random() * 1.8), vida: 0, dur: 0.75 + Math.random() * 0.55, k: 14 + Math.random() * 30, tom: 0.5 + Math.random() * 0.5 });
  }
  let n = 0;
  for (let i = meteoros.length - 1; i >= 0; i--) {
    const a = meteoros[i];
    a.vida += dt;
    if (a.vida >= a.dur) { meteoros.splice(i, 1); continue; }
    const f = a.vida / a.dur;
    const liga = Math.min(1, f * 6) * Math.min(1, (1 - f) * 3.5);
    const x1 = a.x + a.vx * a.vida, z1 = a.z + a.vz * a.vida;
    const cauda = Math.min(a.vida, 0.3);
    const x0 = x1 - a.vx * cauda, z0 = z1 - a.vz * cauda;
    dadosM.set([x0 * a.k, HT * a.k, z0 * a.k, a.tom * liga, x1 * a.k, HT * a.k, z1 * a.k, 1.5 + a.tom * 1.1], n * 8);
    n++;
  }
  if (n) gpu.queue.writeBuffer(bufM, 0, dadosM, 0, n * 8);
  return n;
}

// Logo: nunca sai. Tem massa: leva o golpe do bumbo como mola.
const LOGO = { largura: 1.92 * 0.86, cx: XC, cy: HT - 0.64, recuo: 0.2, prof: 0.16, fatias: 28 };
const golpeLogo = { x: 0, v: 0, empurrar(f) { this.v += f; }, passo(dt) { const h = dt / 2; for (let i = 0; i < 2; i++) { this.v += (-90 * this.x - 15 * this.v) * h; this.x += this.v * h; } return this.x; } };
let varre = -3, envFase = 0, deriva = 0;
const fixo = LETREIROS.indexOf(Q.get('letreiro'));
const ROTEIRO = fixo >= 0 ? [[fixo, 1e9]] : [[0, 38], [1, 10], [0, 38], [2, 10]];
const TROCA = 1.1;
let iRot = 0, tRot = 0;
function letreiro(dt) {
  tRot += dt;
  if (tRot >= ROTEIRO[iRot][1] + TROCA) { tRot -= ROTEIRO[iRot][1] + TROCA; iRot = (iRot + 1) % ROTEIRO.length; }
  const a = ROTEIRO[iRot][0], b = ROTEIRO[(iRot + 1) % ROTEIRO.length][0];
  const x = Math.max(0, Math.min(1, (tRot - ROTEIRO[iRot][1]) / TROCA));
  return { a, b, m: x * x * (3 - 2 * x) };
}

// ---------- o som no céu ----------
// ?simsom=1: só para foto e teste. Música falsa a 124 BPM, sem passar pela entrada.
const SIMSOM = Q.get('simsom');
const NIVEL_FIXO = Q.get('nivel');
let nivel = 0, fluxo = parseFloat(Q.get('fluxo') || '0'), simT = 0;
function somDoCeu(dt) {
  let alvo = REACOES.led.ceu ? M.fonte('ceu') : M.fonte('estrelas');
  let bumbo = M.kick, grave = M.fonte('estrelas');
  if (SIMSOM) {
    simT += dt * 124 / 60;
    const f = simT % 1;
    bumbo = Math.exp(-f * 4.5);
    alvo = grave = Math.min(1, 0.25 + 0.75 * Math.exp(-f * 2.6));
  }
  if (NIVEL_FIXO !== null) alvo = grave = parseFloat(NIVEL_FIXO);
  nivel += (alvo - nivel) * (1 - Math.exp(-dt * (alvo > nivel ? 22 : 5.5)));
  // o céu anda devagar sozinho e corre com a música, sem tranco
  fluxo += dt * (0.14 + 1.05 * nivel);
  return { bumbo, grave };
}
const historico = new Float32Array(16);
let tOnda = 0;

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

const contar = medir(adaptador, 'firmamento-' + MODO);
let tempo = 0, ultimo = performance.now(), nQuadro = 0;
const PULA = CEU.pula || 1;
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  nQuadro++;
  M.quadro(dt);
  if (M.disparou('faixa', dt, 9) && varre > 3.4) varre = -1.6;
  varre = Math.min(varre + dt * (2.4 / M.duracao), 20);
  if (M.disparou('empurra', dt)) golpeLogo.empurrar(1);
  envFase += dt * 0.32;
  deriva += dt * (CEU.deriva ?? 0.12);
  const nM = meteorosQuadro(dt);
  const som = somDoCeu(dt);
  // o bumbo guardado, a cada 40 ms: quem está no índice 0 acabou de bater
  tOnda += dt;
  if (tOnda >= 0.04) { tOnda %= 0.04; historico.copyWithin(1, 0, 15); }
  historico[0] = som.bumbo;

  const g = golpeLogo.passo(dt);
  const L = letreiro(dt);
  const zLogo = ZF - LOGO.recuo - Math.max(0, g) * 0.5;
  const modoLuz = M.modo('luz');
  const halo = modoLuz === 'desligado' ? 0 : modoLuz === 'fixo' ? 0.16 : 0.015 + 0.3 * M.fonte('luz');
  const aj = ajusteLogo(M);
  const modoBooth = M.modo('booth');
  const spot = modoBooth === 'fixo' ? 0.75 : M.fonte('booth');
  brilhinhos.quadro(dt, M, { cx: LOGO.cx, cy: LOGO.cy, z: zLogo, meia: LOGO.largura / 2 * aj.esc, lw: 2048 / 1720, lh: 720 / 1720, letra: L.a, letraB: L.b, mix: L.m });
  const contraPedida = forcaContra(M);
  const contra = CEU.luzNaCena ? 0 : contraPedida;
  const sub = ACUMULA ? [halton(nQuadro % 16 + 1, 2) - 0.5, halton(nQuadro % 16 + 1, 3) - 0.5] : [0, 0];
  fC.set([0, spot, aj.codigo, envFase,
    deriva, 0, halo, varre,
    LOGO.cx, LOGO.cy, zLogo, LOGO.largura / 2 * aj.esc,
    LOGO.prof, LOGO.fatias, 0, som.grave,
    L.m, aj.luz, L.a, L.b,
    contra, estiloLuz(M), 0, 0,
    nivel, som.bumbo, fluxo, nQuadro,
    sub[0], sub[1], contraPedida, tempo]);
  fC.set(historico, 32);
  gpu.queue.writeBuffer(bufC, 0, fC);
  escreverGlobal(gpu, bufG, fG, tempo, dt, 0);

  const enc = gpu.createCommandEncoder();
  if (nQuadro % PULA === 0 || nQuadro <= 2) {
    const r = enc.beginRenderPass({ colorAttachments: [{ view: texCeu.createView(), loadOp: ACUMULA && nQuadro > 1 ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    r.setPipeline(pCeu);
    r.setBindGroup(0, bg0);
    if (ACUMULA) { const a = nQuadro <= 2 ? 1 : ACUMULA; r.setBlendConstant([a, a, a, a]); }
    VISTAS.forEach((v, i) => {
      const y0 = i ? CRD : 0, h = i ? CH - CRD : CRD;
      r.setViewport(0, y0, CW, h, 0, 1);
      r.setScissorRect(0, y0, CW, h);
      r.setBindGroup(1, bgV[i]);
      r.draw(6);
    });
    r.end();
  }
  const vTela = contexto.getCurrentTexture().createView();
  const destino = filtro ? filtro.alvo : vTela;
  const r = enc.beginRenderPass({
    colorAttachments: [MSAA > 1
      ? { view: texCor.createView(), resolveTarget: destino, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }
      : { view: destino, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: texProf.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  });
  r.setBindGroup(0, bg0);
  r.setBindGroup(2, bg2);
  VISTAS.forEach((v, i) => {
    r.setViewport(0, v.y0, RW, v.h, 0, 1);
    r.setScissorRect(0, v.y0, RW, v.h);
    r.setBindGroup(1, bgV[i]);
    if (nDiretas) { r.setPipeline(pEstrela); r.setVertexBuffer(0, bufE); r.draw(6, nDiretas); }
    r.setPipeline(pJunta); r.draw(3);
    if (nRefl && i === 1) { r.setPipeline(pEstrela); r.setVertexBuffer(0, bufE); r.draw(6, nRefl, 0, nDiretas); }
    if (nM && i === 0) { r.setPipeline(pMeteoro); r.setVertexBuffer(0, bufM); r.draw(6, nM); }
    if (i === 1 && halo > 0) { r.setPipeline(pHalo); r.draw(6, 1); }
    if (contra > 0.004) { r.setPipeline(pContra); r.draw(6, 1); }
    r.setPipeline(pLogo); r.draw(6, LOGO.fatias);
    if (i === 1) brilhinhos.desenhar(r, pBrilhinho);
  });
  r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, M, get estado() { return { modo: MODO, nivel: +nivel.toFixed(3), fluxo: +fluxo.toFixed(1), ceu: [CW, CH], estrelas: lista.length, ...M.estado(), tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
