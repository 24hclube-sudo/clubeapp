// Espaço: o teto e a parede do LED são janelas para um mesmo espaço, vistas por quem está em pé no meio da pista, com os olhos a 1,60 m.
// Cimento queimado e inox sem grão, preto e estrelas brancas. Na parede, sempre o logo do CLUBE em inox, feito para aguentar o corte de linhas do sinal.
// ?modo=concreto | teto | caixotoes | porticos   ?estado=aberto | fechado   ?olho=1.60   ?msaa=4
import { iniciarGPU, medir, criarFiltroLED, Q, R, RW, RH, GLOBAL_BYTES, escreverGlobal, WGSL_BASE, DOBRA, ESCALA } from '../pista-quente/nucleo.js';
import { criarMaestro } from './maestro.js';
import { criarCena, MODOS } from './cenas.js';
import { WGSL_BRILHINHO, WGSL_LOGO, WGSL_CONTRA, forcaContra, estiloLuz, ajusteLogo, pipelineContra, criarBrilhinhos } from './brilhinhos.js';

const MODO = MODOS.includes(Q.get('modo')) ? Q.get('modo') : 'concreto';
const MSAA = Q.get('msaa') === '1' ? 1 : 4;
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;

// O pé-direito vem da foto 07: teto 1,3532 m acima da câmera, que está a cerca de 1 m do chão. A parede fica a 4,39 m, e o olho no meio da largura.
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
const texMat = await textura('dados/materiais.png', true);
const LETREIROS = ['clube', 'pista', 'millos'];
const texLogo = gpu.createTexture({ size: [2048, 720, LETREIROS.length], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
await Promise.all(LETREIROS.map(async (n, i) => {
  const b = await createImageBitmap(await (await fetch(new URL('dados/letreiro-' + n + '.png', import.meta.url))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texLogo, origin: [0, 0, i] }, [2048, 720]);
}));

const WGSL = WGSL_BASE + /* wgsl */`
struct Cena {
  luzZ: f32, luzF: f32, flash: f32, envFase: f32,
  deriva: f32, voo: f32, halo: f32, varre: f32,
  logo: vec4f,
  logoProf: f32, fatias: f32, lavar: f32, grave: f32,
  letMix: f32, luzLogo: f32, letA: f32, letB: f32,
  contra: vec4f,
};
struct Vista { m: mat4x4f, px: vec4f };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var mat: texture_2d<f32>;
@group(0) @binding(3) var amT: sampler;
@group(0) @binding(4) var sdf: texture_2d_array<f32>;
@group(0) @binding(5) var amL: sampler;
@group(1) @binding(0) var<uniform> V: Vista;
const HT = ${HT.toFixed(4)}; const ZF = ${ZF};
const LOGO_W = ${(2048 / 1720).toFixed(6)};
const LOGO_H = ${(720 / 1720).toFixed(6)};
fn perto(uv: vec2f) -> f32 {
  if (C.letMix > .001) { return mix(textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).g, textureSampleLevel(sdf, amL, uv, i32(C.letB), 0.).g, C.letMix) * 512. - 256.; }
  return textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).r * 48. - 24.;
}
fn longe(uv: vec2f) -> f32 {
  return mix(textureSampleLevel(sdf, amL, uv, i32(C.letA), 0.).g, textureSampleLevel(sdf, amL, uv, i32(C.letB), 0.).g, C.letMix) * 512. - 256.;
}
const FINO_CIM = .42; const FINO_INOX = .36;
${WGSL_BRILHINHO}
${WGSL_LOGO}
${WGSL_CONTRA}
const CORTE = 2.63;    // o sinal leva 1 linha a cada 2,63 do painel: é por isso que borda quase horizontal serrilha

struct VI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) q: vec4f, @location(3) d: vec4f, @builtin(vertex_index) i: u32 };
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) ln: vec3f,
  @location(4) @interpolate(flat) h: vec3f,
  @location(5) @interpolate(flat) tm: vec2f,
  @location(6) @interpolate(flat) d: vec4f,
  @location(7) @interpolate(flat) lt: vec3f,
};
fn girar(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
@vertex fn vsCaixa(v: VI) -> VO {
  var NS = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
  var US = array<vec3f, 6>(vec3f(0, 1, 0), vec3f(0, 1, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0));
  var VS = array<vec3f, 6>(vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 1, 0), vec3f(0, 1, 0));
  var SS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let f = v.i / 6u; let s = SS[v.i % 6u];
  let ln = NS[f];
  let lp = (ln + US[f] * s.x + VS[f] * s.y) * v.b.xyz;
  var lt = US[f];
  if (dot(VS[f], v.b.xyz) > dot(US[f], v.b.xyz)) { lt = VS[f]; }
  let w = v.a.xyz + girar(v.q, lp);
  var o: VO;
  o.pos = V.m * vec4f(w, 1.);
  o.w = w; o.n = girar(v.q, ln); o.lp = lp; o.ln = ln; o.h = v.b.xyz;
  o.tm = vec2f(v.a.w, v.b.w); o.d = v.d; o.lt = lt;
  return o;
}
fn luzDe(w: vec3f, N: vec3f, p: vec3f, forca: f32, dec: f32) -> f32 {
  let d = p - w; let dq = dot(d, d);
  return max(dot(N, d / sqrt(dq)), 0.) * forca / (1. + dq * dec);
}
fn luzCimento(w: vec3f, N: vec3f, Ve: vec3f) -> f32 {
  let pa = vec3f(w.x * .6, HT - 1.5, ZF + .4);
  // luz geral do ambiente, mais a parede do DJ lavando o teto de perto
  var dif = (.5 + .3 * max(-N.y, 0.)) * C.lavar;
  dif += luzDe(w, N, pa, 1.15 * C.lavar, .1);
  dif += luzDe(w, N, vec3f(w.x * .6, HT - 1.7, -5.3), .4 * C.lavar, .14);
  // cimento queimado tem brilho de seda: reflexo largo, sem textura
  return dif + pow(max(dot(reflect(Ve, N), normalize(pa - w)), 0.), 14.) * .13 * C.lavar;
}
// Inox: brilho anisotrópico de Ward. O risco fica no eixo T: a luz se abre atravessando o risco e fica estreita ao longo dele.
// As luzes são barras na altura do chão, muito acima e abaixo da peça, que andam devagar. O ambiente é só um degradê: preto em cima, onde está o céu.
fn inoxLuz(Ve: vec3f, N: vec3f, T: vec3f, w: vec3f, ax: f32, ay: f32, risco: f32) -> f32 {
  let Vv = -Ve;
  let B = normalize(cross(N, T));
  var s = 0.;
  for (var i = 0; i < 6; i++) {
    let zl = (fract(f32(i) / 6. + C.envFase / 30.) - .5) * 30.;
    let lp = vec3f(w.x * .7, -1.5, zl);
    let d = lp - w;
    let dq = dot(d, d);
    let L = d / sqrt(dq);
    let NL = dot(N, L);
    if (NL <= 0.) { continue; }
    let H = normalize(L + Vv);
    let NH = max(dot(N, H), .001);
    // o risco inclina o brilho: é assim que ele aparece, só dentro da luz, e nunca como grão no escuro
    let hb = dot(H, B) + (risco - .5) * .05;
    let hx = dot(H, T) / ax; let hy = hb / ay;
    s += exp(-(hx * hx + hy * hy) / (NH * NH)) * sqrt(NL) / (1. + dq * .012);
  }
  return s;
}
fn luzAtras(w: vec3f) -> f32 {
  let q = vec2f((w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
  return brilhoPerto(max(longe(q), 0.));
}
@fragment fn fsCaixa(v: VO) -> @location(0) vec4f {
  let an = abs(v.ln);
  var uv = v.lp.xz; var hf = v.h.xz;
  if (an.z > .5) { uv = v.lp.xy; hf = v.h.xy; } else if (an.x > .5) { uv = v.lp.zy; hf = v.h.zy; }
  let t = textureSample(mat, amT, (uv + v.d.xy) / 3.1);
  let tt = textureSample(mat, amT, vec2f(dot(v.lp, v.lt), dot(v.lp, cross(v.ln, v.lt))) / 3.1 + v.d.xy).g;
  let fio = textureSample(mat, amT, vec2f(dot(v.lp, v.lt) / 43., dot(v.lp, cross(v.ln, v.lt)) / 3.1) + v.d.xy).b;
  let dither = (fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  let Ve = normalize(v.w);
  let N = v.n;
  let tom = v.tm.x; let m = v.tm.y;
  let ee = hf - abs(uv);
  let beira = min(ee.x, ee.y);
  var lum = 0.;
  if (m > 2.5 && m < 3.5) {
    lum = tom;
  } else if (m > .5 && m < 2.5) {
    // inox escovado (1) e polido (2)
    let T = normalize(v.lt);
    let polido = m > 1.5;
    let spec = inoxLuz(Ve, N, T, v.w, select(.2, .1, polido), select(.8, .16, polido), tt);
    let r = reflect(Ve, N);
    let amb = .05 + .2 * smoothstep(.2, -.8, r.y);
    let f0 = .62; let cosV = abs(dot(Ve, N));
    let fres = f0 + (1. - f0) * pow(1. - cosV, 5.);
    lum = tom * fres * (amb + spec * select(.5, .5, polido)) * (.93 + .14 * tt) * (1. + (fio - .5) * select(FINO_INOX, FINO_INOX * .4, polido));
    // quina polida: pega um fio de luz, como a borda de uma chapa cortada
    lum += tom * .1 * (1. - smoothstep(0., .007, beira));
    if (v.d.w > .5) { lum = lum * .6 + luzAtras(v.w) * C.halo * (.75 + .5 * tt); }
  } else if (m > 4.5 && m < 5.5) {
    let fundo = max(v.w.y - HT, 0.);
    lum = tom * (.024 + (.46 + .8 * t.r) * luzCimento(v.w, N, Ve) * .62) * exp(-fundo / .85) * (1. + (t.b - .5) * FINO_CIM);
    lum *= .5 + .5 * smoothstep(0., .01, beira);
  } else if (m > 5.5 && m < 6.5) {
    // tampa do poço: cimento no escuro
    lum = tom * (.02 + (.46 + .8 * t.r) * luzCimento(v.w, N, Ve) * .3) * (1. + (t.b - .5) * FINO_CIM);
  } else {
    // cimento queimado (0) e parede do DJ (4)
    let luz = luzCimento(v.w, N, Ve);
    lum = tom * (.028 + (.46 + .8 * t.r) * luz * .56) * (1. + (t.b - .5) * FINO_CIM);
    lum *= .34 + .66 * smoothstep(0., .011, beira);
    if (v.d.z > .5 && N.y < -.5 && beira > .1) {
      let passo = vec2f(.41, .335);
      let c = (fract(uv / passo + .5) - .5) * passo;
      lum *= 1. - .86 * (1. - smoothstep(.0135, .019, length(c)));
    }
    if (m > 3.5) {
      let q = vec2f((v.w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (v.w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
      let dLonge = longe(q);
      lum = lum * .55 + (exp(-max(dLonge, 0.) / 68.) * .75 + exp(-max(dLonge, 0.) / 210.) * .25) * C.halo * (.6 + .9 * t.r) * tom;
    }
  }
  lum += tom * luzAtrasEm(v.w, N, Ve, select(.1, 1., m > .5 && m < 2.5));
  return vec4f(vec3f(lum) * G.brilho + dither, 1.);
}
@fragment fn fsBrilho(v: VO) -> @location(0) vec4f {
  let q = v.lp / max(v.h, vec3f(.0001));
  let g = exp(-q.x * q.x * 4.5) * exp(-q.z * q.z * 4.5);
  return vec4f(vec3f(g * v.tm.x * .5) * G.brilho, 1.);
}

struct EI { @location(0) a: vec4f, @location(1) b: vec4f, @builtin(vertex_index) i: u32 };
struct EO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: vec2f };
@vertex fn vsEstrela(e: EI) -> EO {
  var QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var w: vec3f;
  if (e.b.x < .5) {
    let z = -5.5 + 10.6 * fract(e.a.y - C.deriva / (e.a.z * 10.6));
    w = vec3f(e.a.x, HT, z) * e.a.z;
  } else {
    let k = 1.2 + 60. * fract(e.a.y - C.voo / (60. * ZF));
    w = vec3f(e.a.x, e.b.y, ZF) * k;
  }
  let m = e.a.w;
  let r = (1.25 + 2.9 * m * m * m) * G.escala;
  let quad = r * (1.25 + 5. * m * m * m * m);
  let q = QQ[e.i];
  var o: EO;
  o.pos = V.m * vec4f(w, 1.);
  o.pos = vec4f(o.pos.xy + q * quad * V.px.xy * o.pos.w, o.pos.zw);
  o.q = q * quad / r;
  // O grave acende o céu. Quase metade das estrelas fica sempre acesa; as outras só aparecem conforme o grave sobe, cada uma num ponto.
  let h = e.b.z;
  let g = C.grave;
  let limiar = fract(h * 91.);
  let revela = select(smoothstep((limiar - .42) * .9, (limiar - .42) * .9 + .22, g), 1., limiar < .42);
  o.l = vec2f((.34 + .66 * m) * revela * (.46 + 1.5 * g * g + .5 * g), m);
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
  // em pixels do painel, para o traço ter a mesma espessura em toda parte
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

// Logo: camadas do campo de distância, de trás para a frente, com borda calculada. A borda vale o corte: em y ela se abre 2,63 vezes mais do que em x.
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
  if (i.k < .5) {
    // frente: prata sólida, a mesma do Colossos
    lum = frenteLogo(d, g, i.uv, i.w, riscoL, C.flash, C.luzF, C.varre, C.luzLogo);
  } else {
    lum = ladoLogo(g, i.uv, C.flash, C.luzF, C.luzLogo);
  }
  lum = logoEmContraluz(lum, d, i.k);
  return vec4f(vec3f(lum) * G.brilho + dither, cob);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const bufC = gpu.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
const fC = new Float32Array(24);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
const amL = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const vis = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const lay0 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: vis, buffer: {} }, { binding: 1, visibility: vis, buffer: {} },
  { binding: 2, visibility: vis, texture: {} }, { binding: 3, visibility: vis, sampler: {} },
  { binding: 4, visibility: vis, texture: { viewDimension: '2d-array' } }, { binding: 5, visibility: vis, sampler: {} },
] });
const lay1 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: vis, buffer: {} }] });
const layout = gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1] });
const bg0 = gpu.createBindGroup({ layout: lay0, entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufC } },
  { binding: 2, resource: texMat.createView() }, { binding: 3, resource: am },
  { binding: 4, resource: texLogo.createView({ dimension: '2d-array' }) }, { binding: 5, resource: amL },
] });
const bgV = VISTAS.map(v => {
  const b = gpu.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST });
  gpu.queue.writeBuffer(b, 0, new Float32Array([...v.m, 2 / RW, 2 / v.h, v.y0 ? 1 : 0, 0]));
  return gpu.createBindGroup({ layout: lay1, entries: [{ binding: 0, resource: { buffer: b } }] });
});

const POR = 16, MAX_C = 3000, MAX_B = 400, MAX_E = 7000;
const dadosC = new Float32Array(MAX_C * POR), dadosB = new Float32Array(MAX_B * POR);
const bufCx = gpu.createBuffer({ size: dadosC.byteLength, usage: U.VERTEX | U.COPY_DST });
const bufBr = gpu.createBuffer({ size: dadosB.byteLength, usage: U.VERTEX | U.COPY_DST });
let nC = 0, nB = 0;
const QI = [0, 0, 0, 1];
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

const m = modulo(WGSL, 'espaco');
const attrCaixa = { arrayStride: POR * 4, stepMode: 'instance', attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) };
const ms = { count: MSAA };
const prof = grava => ({ format: 'depth32float', depthWriteEnabled: grava, depthCompare: 'greater' });
const soma = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const sobre = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const brilhinhos = await criarBrilhinhos(gpu, LETREIROS.map(n => new URL('dados/letreiro-' + n + '.png', import.meta.url)));
const pContra = await pipelineContra(gpu, m, layout, ms, formato, soma);
const [pCaixa, pBrilho, pEstrela, pLogo, pMeteoro, pHalo, pBrilhinho] = await Promise.all([
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsCaixa', targets: [{ format: formato }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsBrilho', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsEstrela', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module: m, entryPoint: 'fsEstrela', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsLogo', targets: [{ format: formato, blend: sobre }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsMeteoro', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module: m, entryPoint: 'fsMeteoro', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsHalo', targets: [{ format: formato, blend: soma }] } }),
  brilhinhos.pipeline(m, layout, ms, formato, soma),
]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const texProf = gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
const texCor = MSAA > 1 ? gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: formato, usage: T.RENDER_ATTACHMENT }) : null;

const PARADO = ['aberto', 'fechado'].includes(Q.get('estado')) ? Q.get('estado') : null;
const M = criarMaestro();
const CENA = criarCena(MODO, { caixa, brilho, quat, M, HT, ZF, XC, PARADO });

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

const MAX_M = 3;
const dadosM = new Float32Array(MAX_M * 8);
const bufM = gpu.createBuffer({ size: dadosM.byteLength, usage: U.VERTEX | U.COPY_DST });
const meteoros = [];
let proxMeteoro = parseFloat(Q.get('meteoro') || (2 + Math.random() * 3));
function meteorosQuadro(dt) {
  proxMeteoro -= dt;
  if (proxMeteoro <= 0 && meteoros.length < MAX_M && M.modo('meteoros') !== 'desligado') {
    proxMeteoro = 3 + Math.random() * 6;
    // nasce no plano do teto e anda quase ao longo do painel, um pouco de lado, no alto do céu
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

// Logo: nunca sai. Tem massa: leva o golpe do bumbo como mola, sem tremer com o resto do som.
const LOGO = { largura: 1.92 * 0.86, cx: XC, cy: HT - 0.64, recuo: 0.2, prof: 0.16, fatias: 28 };
const golpeLogo = { x: 0, v: 0, empurrar(f) { this.v += f; }, passo(dt) { const h = dt / 2; for (let i = 0; i < 2; i++) { this.v += (-90 * this.x - 15 * this.v) * h; this.x += this.v * h; } return this.x; } };
let varre = -3, envFase = 0, deriva = 0;
// CLUBE é a casa: fica a maior parte do tempo. Pista Quente e Millos Kaiser entram às vezes, um de cada vez.
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

const contar = medir(adaptador, 'espaco-' + MODO);
let tempo = 0, ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  M.quadro(dt);
  // a faixa de luz atravessa o logo inteiro antes de poder sair outra
  if (M.disparou('faixa', dt, 9) && varre > 3.4) varre = -1.6;
  varre = Math.min(varre + dt * (2.4 / M.duracao), 20);
  if (M.disparou('empurra', dt)) golpeLogo.empurrar(1);
  // o reflexo anda colado na batida: 1 faixa de luz a cada 8 tempos, sem acelerar nem frear de susto
  envFase += dt * 0.32;
  deriva += dt * 0.12;

  nC = 0; nB = 0;
  CENA.quadro(dt);
  const nM = meteorosQuadro(dt);
  gpu.queue.writeBuffer(bufCx, 0, dadosC, 0, nC * POR);
  if (nB) gpu.queue.writeBuffer(bufBr, 0, dadosB, 0, nB * POR);

  const g = golpeLogo.passo(dt);
  const L = letreiro(dt);
  const zLogo = ZF - LOGO.recuo - Math.max(0, g) * 0.5;
  // sem som a luz some; "Fixo" fica sempre acesa
  const modoLuz = M.modo('luz');
  const halo = modoLuz === 'desligado' ? 0 : modoLuz === 'fixo' ? 0.16 : 0.015 + 0.3 * M.fonte('luz');
  const aj = ajusteLogo(M);
  const luzLogo = aj.luz;
  // luz do booth e acabamento do logo, escolhidos no app
  const modoBooth = M.modo('booth');
  const spot = modoBooth === 'fixo' ? 0.75 : M.fonte('booth');
  const cromo = aj.codigo;
  brilhinhos.quadro(dt, M, { cx: LOGO.cx, cy: LOGO.cy, z: zLogo, meia: LOGO.largura / 2 * aj.esc, lw: 2048 / 1720, lh: 720 / 1720, letra: L.a });
  const contra = forcaContra(M);
  fC.set([0, spot, cromo, envFase,
    CENA.voo ? CENA.voo() : deriva, CENA.voo ? CENA.voo() : 0, halo, varre,
    LOGO.cx, LOGO.cy, zLogo, LOGO.largura / 2 * aj.esc,
    LOGO.prof, LOGO.fatias, CENA.lavar, M.fonte('estrelas'),
    L.m, luzLogo, L.a, L.b,
    contra, estiloLuz(M), 0, 0]);
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
    if (ie) { r.setPipeline(pEstrela); r.setVertexBuffer(0, bufE); r.draw(6, ie); }
    if (nM && i === 0) { r.setPipeline(pMeteoro); r.setVertexBuffer(0, bufM); r.draw(6, nM); }
    if (nB) { r.setPipeline(pBrilho); r.setVertexBuffer(0, bufBr); r.draw(36, nB); }
    if (nParede && i === 1 && halo > 0) { r.setPipeline(pHalo); r.draw(6, 1); }
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
window.__painel = { R, M, get estado() { return { modo: MODO, ...CENA.estado(), ...M.estado(), caixas: nC, tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
