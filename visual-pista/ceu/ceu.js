// Céu 3D: o teto e a parede do LED são janelas para um mesmo espaço, visto do mesmo olho, no meio da pista.
// Só cimento queimado, inox, preto e estrelas brancas. Na parede, sempre o logo do CLUBE em inox, reagindo ao som.
// ?modo=concreto | teto | caixotoes | porticos   ?estado=aberto | fechado   ?msaa=4
import { iniciarGPU, criarSom, medir, criarFiltroLED, Q, R, RW, RH, ESCALA, GLOBAL_BYTES, escreverGlobal, WGSL_BASE, DOBRA } from '../pista-quente/nucleo.js';
import { criarCena, MODOS } from './cenas.js';

const MODO = MODOS.includes(Q.get('modo')) ? Q.get('modo') : 'concreto';
const MSAA = Q.get('msaa') === '1' ? 1 : 4;
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;

// ---------- o olho: o mesmo das medidas da foto 07 (perspectiva/geometria.py) ----------
export const HT = 1.3532, ZF = 4.39, XL = -1.015, PASSO = 1.92 / 1032, XC = XL + 0.96;
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

// ---------- texturas ----------
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
const [texMat, texLogo] = await Promise.all([textura('dados/materiais.png', true), textura('dados/logo-sdf.png', false)]);

// ---------- shaders ----------
const WGSL = WGSL_BASE + /* wgsl */`
struct Cena {
  luzZ: f32, luzF: f32, flash: f32, envFase: f32,
  deriva: f32, voo: f32, halo: f32, varre: f32,
  logo: vec4f,
  logoProf: f32, fatias: f32, lavar: f32, ceuLuz: f32,
};
struct Vista { m: mat4x4f, px: vec4f };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var mat: texture_2d<f32>;
@group(0) @binding(3) var amT: sampler;
@group(0) @binding(4) var sdf: texture_2d<f32>;
@group(0) @binding(5) var amL: sampler;
@group(1) @binding(0) var<uniform> V: Vista;
const HT = ${HT}; const ZF = ${ZF};
const LOGO_W = ${(2048 / 1720).toFixed(6)};   // largura da imagem do logo / largura do logo
const LOGO_H = ${(720 / 1720).toFixed(6)};

// ---------- caixas: tudo no espaço é caixa, desenhada de verdade em 3D ----------
struct VI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) q: vec4f, @location(3) d: vec4f, @builtin(vertex_index) i: u32 };
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) ln: vec3f,
  @location(4) @interpolate(flat) h: vec3f,
  @location(5) @interpolate(flat) tm: vec2f,    // tom, material
  @location(6) @interpolate(flat) d: vec4f,     // deslocamento da textura x, y, extras
};
fn girar(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
@vertex fn vsCaixa(v: VI) -> VO {
  const NS = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
  const US = array<vec3f, 6>(vec3f(0, 1, 0), vec3f(0, 1, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0));
  const VS = array<vec3f, 6>(vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 1, 0), vec3f(0, 1, 0));
  const SS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let f = v.i / 6u; let s = SS[v.i % 6u];
  let ln = NS[f];
  let lp = (ln + US[f] * s.x + VS[f] * s.y) * v.b.xyz;
  let w = v.a.xyz + girar(v.q, lp);
  var o: VO;
  o.pos = V.m * vec4f(w, 1.);
  o.w = w; o.n = girar(v.q, ln); o.lp = lp; o.ln = ln; o.h = v.b.xyz;
  o.tm = vec2f(v.a.w, v.b.w); o.d = v.d;
  return o;
}
fn luzDe(w: vec3f, N: vec3f, p: vec3f, forca: f32, dec: f32) -> vec2f {
  let d = p - w; let dq = dot(d, d); let l = d / sqrt(dq);
  let a = forca / (1. + dq * dec);
  return vec2f(max(dot(N, l), 0.) * a, a);
}
// luz vinda de baixo: a parede do DJ lava o teto de perto, a ponta da entrada responde fraco, e a varredura corre no bumbo
fn luzCimento(w: vec3f, N: vec3f, Ve: vec3f, grao: f32) -> f32 {
  var dif = 0.;
  let a = luzDe(w, N, vec3f(w.x * .6, HT - 1.5, ZF + .4), .98 * C.lavar, .1); dif += a.x;
  let b = luzDe(w, N, vec3f(w.x * .6, HT - 1.7, -5.3), .3 * C.lavar, .14); dif += b.x;
  let lv = vec3f(w.x * .4, HT - .95, C.luzZ);
  let c = luzDe(w, N, lv, C.luzF * 1.05, 1.2); dif += c.x;
  // cimento queimado tem brilho de seda: um reflexo largo, que anda com o olho
  let r = reflect(Ve, N);
  let esp = pow(max(dot(r, normalize(lv - w)), 0.), 22.) * C.luzF + pow(max(dot(r, normalize(vec3f(w.x * .6, HT - 1.5, ZF + .4) - w)), 0.), 14.) * .13 * C.lavar;
  return dif + esp * (.85 + .3 * grao);
}
// inox: reflete um teto de faixas de luz que correm com a batida; o escovado alarga a faixa no sentido do risco
fn ambInox(r: vec3f, w: vec3f, largura: f32) -> f32 {
  let t = (abs(w.y) + 1.6) / max(abs(r.y), .07);
  let h = w + r * t;
  let f = (fract((h.z + C.envFase) / 5.2) - .5) * 5.2;
  let g = (fract((h.z * .37 - C.envFase * .6) / 3.) - .5) * 3.;
  return (exp(-f * f / (largura * largura)) + .34 * exp(-g * g / (largura * largura * .3))) * exp(-h.x * h.x / 26.);
}
@fragment fn fsCaixa(v: VO) -> @location(0) vec4f {
  let an = abs(v.ln);
  var uv = v.lp.xz; var hf = v.h.xz;
  if (an.z > .5) { uv = v.lp.xy; hf = v.h.xy; } else if (an.x > .5) { uv = v.lp.zy; hf = v.h.zy; }
  let t = textureSample(mat, amT, (uv + v.d.xy) / 3.1);
  let ruido = fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13)) - .5;
  let Ve = normalize(v.w);
  let N = v.n;
  let tom = v.tm.x; let m = v.tm.y;
  let ee = hf - abs(uv);
  let beira = min(ee.x, ee.y);
  var lum = 0.;
  if (m > 2.5 && m < 3.5) {
    // luz: fita de led
    lum = tom * (.92 + .16 * t.b);
  } else if (m > .5 && m < 2.5) {
    // inox escovado (1) e polido (2)
    let lg = select(.8, .26, m > 1.5);
    let amb = ambInox(reflect(Ve, N), v.w, lg);
    let risco = .68 + .64 * t.g;
    let fres = pow(1. - abs(dot(Ve, N)), 3.);
    lum = tom * (.018 + .04 * t.g + amb * risco * (.3 + .3 * G.grave) + fres * .06 + C.flash * .05 * risco);
    lum += tom * .22 * (1. - smoothstep(0., .006, beira));
    lum *= 1. + (t.b - .5) * .1;
  } else if (m > 4.5 && m < 5.5) {
    // parede de um poço da laje: acesa pela fita em volta da tampa (d.z = altura da tampa)
    if (v.n.y < -.5) {
      lum = tom * (.03 + (.62 + .75 * t.r) * luzCimento(v.w, N, Ve, t.b) * (.46 + .9 * t.r));
      lum *= .5 + .5 * smoothstep(0., .01, beira);
    } else {
      let fundo = max(v.d.z - v.w.y, 0.);
      lum = (.012 + v.d.w * exp(-fundo / .34) * (.12 + .42 * t.r)) * tom;
    }
  } else if (m > 5.5 && m < 6.5) {
    // tampa do poço: cimento, com a fita de luz na volta
    lum = tom * (.012 + (.1 + .3 * t.r) * v.d.w * .1) + v.d.w * tom * exp(-beira / .016) * .9;
  } else {
    // cimento queimado (0) e parede do DJ (4)
    let albedo = .46 + .8 * t.r;
    var luz = luzCimento(v.w, N, Ve, t.b);
    lum = tom * (.028 + albedo * luz * .56);
    // junta fina entre as lajes
    lum *= .34 + .66 * smoothstep(0., .011, beira);
    let friso = (beira - .015) / .006;
    lum += tom * .1 * luz * exp(-friso * friso);
    // furos de tirante: a marca do concreto limpo, como no Ando
    if (v.d.z > .5 && N.y < -.5) {
      let passo = vec2f(.41, .335);
      let c = (fract(uv / passo + .5) - .5) * passo;
      if (beira > .1) {
        let r = length(c);
        lum *= 1. - .86 * (1. - smoothstep(.0135, .0175, r));
        let aro = (r - .019) / .004;
        lum += .06 * luz * exp(-aro * aro);
      }
    }
    if (m > 3.5) {
      // luz atrás do logo: lê a distância até a letra, com a parede inteira como anteparo
      let q = vec2f((v.w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (v.w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
      let dLonge = (textureSampleLevel(sdf, amL, q, 0.).g - .5) * 512.;
      let af = exp(-max(dLonge, 0.) / 68.) * .75 + exp(-max(dLonge, 0.) / 210.) * .25;
      lum += af * C.halo * (.6 + .9 * t.r) * tom;
    }
  }
  lum *= 1. + (t.b - .5) * .12;
  return vec4f(vec3f(lum) * G.brilho + ruido / 255., 1.);
}
// ---------- brilho em volta das fitas: soma luz, sem gravar profundidade ----------
@fragment fn fsBrilho(v: VO) -> @location(0) vec4f {
  let q = v.lp / max(v.h, vec3f(.0001));
  let g = exp(-q.x * q.x * 4.5) * exp(-q.z * q.z * 4.5);
  return vec4f(vec3f(g * v.tm.x * .5) * G.brilho, 1.);
}

// ---------- estrelas: pontos brancos em alturas diferentes, então andam em velocidades diferentes ----------
struct EI { @location(0) a: vec4f, @location(1) b: vec4f, @builtin(vertex_index) i: u32 };
struct EO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: vec2f };
@vertex fn vsEstrela(e: EI) -> EO {
  const QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var w: vec3f;
  if (e.b.x < .5) {
    let z = -5.5 + 10.6 * fract(e.a.y - C.deriva / (e.a.z * 10.6));
    w = vec3f(e.a.x, HT, z) * e.a.z;
  } else {
    let k = 1.2 + 60. * fract(e.a.y - C.voo / (60. * ZF));
    w = vec3f(e.a.x, e.b.y, ZF) * k;
  }
  let m = e.a.w;
  let r = (1.05 + 3. * m * m * m) * G.escala * (1. + G.bumbo * .3);
  let quad = r * (1.25 + 5.5 * m * m * m * m);
  let q = QQ[e.i];
  var o: EO;
  o.pos = V.m * vec4f(w, 1.);
  o.pos = vec4f(o.pos.xy + q * quad * V.px.xy * o.pos.w, o.pos.zw);
  o.q = q * quad / r;
  let h = e.b.z;
  let esp = espectroEm(h);
  let pisca = .78 + .22 * sin(G.tempo * (1. + fract(h * 37.) * 3.) + h * 50.);
  o.l = vec2f((.3 + .7 * m) * pisca * (.72 + esp * esp * 1.9 + G.bumbo * .1) * C.ceuLuz, m);
  return o;
}
@fragment fn fsEstrela(i: EO) -> @location(0) vec4f {
  let d = length(i.q);
  let nucleo = 1. - smoothstep(.45, 1., d);
  let halo = i.l.y * i.l.y * .34 / (1. + d * d * .9) * (1. - smoothstep(1.2, 6.8, d));
  return vec4f(vec3f((nucleo + halo) * i.l.x) * G.brilho, 1.);
}

// ---------- logo: fatias do campo de distância empilhadas em profundidade, o que dá a espessura real da letra ----------
struct LO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) w: vec3f, @location(2) @interpolate(flat) k: f32 };
@vertex fn vsLogo(@builtin(vertex_index) i: u32, @builtin(instance_index) k: u32) -> LO {
  const QQ = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));
  let q = QQ[i];
  let w = vec3f(C.logo.x + (q.x - .5) * 2. * C.logo.w * LOGO_W, C.logo.y - (q.y - .5) * 2. * C.logo.w * LOGO_H, C.logo.z + f32(k) / (C.fatias - 1.) * C.logoProf);
  var o: LO;
  o.pos = V.m * vec4f(w, 1.);
  o.uv = q; o.w = w; o.k = f32(k);
  return o;
}
@fragment fn fsLogo(i: LO) -> @location(0) vec4f {
  let s = textureSample(sdf, amL, i.uv);
  let riscoL = textureSample(mat, amT, i.uv * vec2f(.9, .3)).g;
  let ruido = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13)) - .5;
  let d = (s.r - .5) * 48.;
  let fw = max(fwidth(d), .001);
  let cob = 1. - smoothstep(-fw * .6, fw * .6, d);
  if (cob < .01 || (i.k > .5 && d < -18.)) { discard; }
  let ex = vec2f(3. / 2048., 0.); let ey = vec2f(0., 3. / 720.);
  let gx = textureSampleLevel(sdf, amL, i.uv + ex, 0.).r - textureSampleLevel(sdf, amL, i.uv - ex, 0.).r;
  let gy = textureSampleLevel(sdf, amL, i.uv + ey, 0.).r - textureSampleLevel(sdf, amL, i.uv - ey, 0.).r;
  let g = normalize(vec3f(gx, -gy, 0.) + vec3f(.00001));
  let Ve = normalize(i.w);
  var lum = 0.;
  if (i.k < .5) {
    // frente polida, com chanfro nos últimos px da borda
    let cha = 1. - smoothstep(0., 13., -d);
    let N = normalize(vec3f(g.xy * cha * 1.15, -1.));
    let r = reflect(Ve, N);
    // céu claro em cima, linha preta do horizonte, chão médio: leitura clássica do cromo
    let y = r.y * 3. + (i.uv.y - .5) * .55;
    let topo = .62 * smoothstep(.02, .7, y) + .13;
    let baixo = .34 * (1. - smoothstep(-.5, .02, y)) + .05;
    var c = mix(baixo, topo, smoothstep(-.03, .05, y));
    // faixa de luz que atravessa a letra a cada bumbo
    let f = r.x * 2.3 + r.y * 1.6 + (i.uv.x - .5) * 1.6 - C.varre;
    c += exp(-f * f * 34.) * .85;
    c += G.grave * .07;
    lum = c * (.86 + .28 * riscoL);
    lum += cha * cha * .2;
  } else {
    // lado da letra: inox mais escuro, aceso de baixo
    let luz = max(dot(g, vec3f(0., -1., 0.)), 0.);
    lum = .1 + .36 * luz + .11 * G.grave;
  }
  return vec4f(vec3f(lum) * G.brilho + ruido / 255., cob);
}
`;

// ---------- recursos ----------
const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const bufC = gpu.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST });
const fC = new Float32Array(16);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
const amL = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const vis = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const lay0 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: vis, buffer: {} }, { binding: 1, visibility: vis, buffer: {} },
  { binding: 2, visibility: vis, texture: {} }, { binding: 3, visibility: vis, sampler: {} },
  { binding: 4, visibility: vis, texture: {} }, { binding: 5, visibility: vis, sampler: {} },
] });
const lay1 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, buffer: {} }] });
const layout = gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1] });
const bg0 = gpu.createBindGroup({ layout: lay0, entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufC } },
  { binding: 2, resource: texMat.createView() }, { binding: 3, resource: am },
  { binding: 4, resource: texLogo.createView() }, { binding: 5, resource: amL },
] });
const bgV = VISTAS.map(v => {
  const b = gpu.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
  gpu.queue.writeBuffer(b, 0, new Float32Array([...v.m, 2 / RW, 2 / v.h, 0, 0]));
  return gpu.createBindGroup({ layout: lay1, entries: [{ binding: 0, resource: { buffer: b } }] });
});

const POR = 16, MAX_C = 3000, MAX_B = 400, MAX_E = 7000;
const dadosC = new Float32Array(MAX_C * POR), dadosB = new Float32Array(MAX_B * POR);
const bufCx = gpu.createBuffer({ size: dadosC.byteLength, usage: U.VERTEX | U.COPY_DST });
const bufBr = gpu.createBuffer({ size: dadosB.byteLength, usage: U.VERTEX | U.COPY_DST });
let nC = 0, nB = 0;
const QI = [0, 0, 0, 1];
// centro, meia medida, material; rot é um quaternion
function caixa(cx, cy, cz, hx, hy, hz, { tom = 1, mat = 0, q = QI, ox = 0, oy = 0, a = 0, b = 0 } = {}) {
  if (nC >= MAX_C) return;
  dadosC.set([cx, cy, cz, tom, hx, hy, hz, mat, q[0], q[1], q[2], q[3], ox, oy, a, b], nC * POR);
  nC++;
}
function brilho(cx, cy, cz, hx, hz, tom) {
  if (nB >= MAX_B || tom < 0.004) return;
  dadosB.set([cx, cy, cz, tom, hx, 0.001, hz, 0, 0, 0, 0, 1, 0, 0, 0, 0], nB * POR);
  nB++;
}
const quat = (rx, rz) => {
  const a = rx / 2, b = rz / 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return [sa * cb, -sa * sb, ca * sb, ca * cb];
};

const m = modulo(WGSL, 'ceu3d');
const attrCaixa = { arrayStride: POR * 4, stepMode: 'instance', attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) };
const ms = { count: MSAA };
const prof = (grava, comp = 'greater') => ({ format: 'depth32float', depthWriteEnabled: grava, depthCompare: comp });
const soma = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const [pCaixa, pBrilho, pEstrela, pLogo] = await Promise.all([
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsCaixa', targets: [{ format: formato }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsBrilho', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsEstrela', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module: m, entryPoint: 'fsEstrela', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: { count: MSAA, alphaToCoverageEnabled: MSAA > 1 }, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsLogo', targets: [{ format: formato }] } }),
]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const texProf = gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
const texCor = MSAA > 1 ? gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: formato, usage: T.RENDER_ATTACHMENT }) : null;

// ---------- som: uma faixa por pistão, com ganho automático ----------
const NB = 24;
const P = new Float32Array(NB), topo = new Float32Array(NB).fill(0.2);
const atualizarSom = criarSom({});
function pistoes(dt) {
  const k = R.faixas.length / NB;
  for (let i = 0; i < NB; i++) {
    let e = 0;
    const a = Math.floor(i * k), b = Math.floor((i + 1) * k);
    for (let j = a; j < b; j++) e += R.faixas[j];
    e /= Math.max(1, b - a);
    topo[i] = Math.max(topo[i] * Math.exp(-dt * 0.25), e, 0.06);
    const alvo = Math.pow(e / topo[i], 1.6);
    P[i] += (alvo - P[i]) * (1 - Math.exp(-dt * (alvo > P[i] ? 48 : 5)));
  }
}

const PARADO = ['aberto', 'fechado'].includes(Q.get('estado')) ? Q.get('estado') : null;
const CENA = criarCena(MODO, { caixa, brilho, quat, P, NB, R, HT, ZF, XC, PARADO });
window.__tetoCena = () => { if (CENA.abrirJa) CENA.abrirJa(); };

// ---------- estrelas: distribuídas por igual sobre o painel, cada uma numa altura ----------
const nTeto = CENA.estrelasTeto, nParede = CENA.estrelasParede;
const dadosE = new Float32Array(Math.min(MAX_E, nTeto + nParede) * 8);
let ie = 0;
for (let i = 0; i < nTeto; i++) {
  const k = 4 + 86 * Math.pow(Math.random(), 1.6);
  dadosE.set([XC + (Math.random() - 0.5) * 2.1, Math.random(), k, Math.pow(Math.random(), 2.4), 0, 0, Math.random(), 0], ie * 8); ie++;
}
for (let i = 0; i < nParede; i++) {
  dadosE.set([XC + (Math.random() - 0.5) * 2.3, Math.random(), 0, Math.pow(Math.random(), 2.4), 1, HT - 1.34 + Math.random() * 1.46, Math.random(), 0], ie * 8); ie++;
}
const bufE = gpu.createBuffer({ size: Math.max(32, dadosE.byteLength), usage: U.VERTEX | U.COPY_DST });
gpu.queue.writeBuffer(bufE, 0, dadosE);

// ---------- logo: nunca sai. No bumbo vem para a frente, e a faixa de luz atravessa. ----------
const LOGO = { largura: 1.92 * 0.86, cx: XC, cy: HT - 0.64, recuo: 0.24, prof: 0.2, fatias: 40 };
let golpeLogo = 0, varre = -3, envFase = 0, deriva = 0, voo = 0, flash = 0;

const contar = medir(adaptador, 'ceu-' + MODO);
let tempo = 0, ultimo = performance.now(), idadeAntes = 99, ultimaBatida = -1;
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  pistoes(dt);
  const bat = Math.floor(R.fase);
  if (bat !== ultimaBatida) { ultimaBatida = bat; CENA.batida(); }
  if (R.idade < idadeAntes) {
    const f = Math.min(1.2, Math.max(0.35, R.bumbo));
    CENA.golpe(f);
    golpeLogo = Math.max(golpeLogo, f);
    varre = -2.6;
    flash = Math.max(flash, f);
  }
  idadeAntes = R.idade;
  golpeLogo *= Math.exp(-dt * 6.5);
  flash *= Math.exp(-dt * 8);
  varre += dt * 8.4;
  envFase += dt * (R.bpm / 60 * 0.64) * (1 + R.bumbo * 1.5);
  deriva += dt * 0.16;
  voo += dt * (R.bpm / 60 * CENA.velocidade) * (1 + R.bumbo * 0.8);

  nC = 0; nB = 0;
  CENA.quadro(dt, voo);
  gpu.queue.writeBuffer(bufCx, 0, dadosC, 0, nC * POR);
  if (nB) gpu.queue.writeBuffer(bufBr, 0, dadosB, 0, nB * POR);

  const zLogo = ZF - LOGO.recuo - golpeLogo * 0.13 - R.grave * 0.04;
  // para os personagens passarem atrás das letras (personagens\camada.js)
  window.__logoTela = { cx: LOGO.cx, cy: LOGO.cy, z: zLogo, meia: LOGO.largura / 2, a: 0, b: 0, m: 0, prof: LOGO.prof, xc: XC, yc: HT - 0.64 };
  fC.set([ZF - R.idade * 15, Math.exp(-R.idade * 2.6) * (0.35 + 0.8 * R.bumbo + 0.3 * R.grave), flash, envFase,
    CENA.velocidade ? voo : deriva, voo, 0.035 + 0.27 * Math.max(R.grave, R.bumbo * 0.85), varre,
    LOGO.cx, LOGO.cy, zLogo, LOGO.largura / 2,
    LOGO.prof, LOGO.fatias, CENA.lavar + R.grave * CENA.lavarSom, CENA.ceuLuz()]);
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
  VISTAS.forEach((v, i) => {
    r.setViewport(0, v.y0, RW, v.h, 0, 1);
    r.setScissorRect(0, v.y0, RW, v.h);
    r.setBindGroup(1, bgV[i]);
    r.setPipeline(pCaixa); r.setVertexBuffer(0, bufCx); r.draw(36, nC);
    r.setPipeline(pLogo); r.draw(6, LOGO.fatias);
    if (ie) { r.setPipeline(pEstrela); r.setVertexBuffer(0, bufE); r.draw(6, ie); }
    if (nB) { r.setPipeline(pBrilho); r.setVertexBuffer(0, bufBr); r.draw(36, nB); }
  });
  r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, get estado() { return { modo: MODO, ...CENA.estado(), caixas: nC, tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
