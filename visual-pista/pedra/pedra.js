// Pedra: rochas pretas com micronúmeros que brilham como código, o logo e os personagens recortados em pedra, e tetos de placas de pedra.
// Cada ponto do painel é um raio de visão do olho a 1,60 m. As rochas nascem a cada abertura: a forma vai para um volume 3D na placa de vídeo,
// e o corte polido é um plano exato, por isso a face fica lisa e a borda é de pedra quebrada. Os números ficam numa camada logo abaixo do vidro da face.
// ?modo=logo | campo | estelas | corte | lajes | degraus   ?linhas=0.5 (fração das linhas calculadas; o sinal só leva 1 em 2,63)   ?simsom=1   ?semente=n
import { iniciarGPU, medir, criarFiltroLED, escreverGlobal, Q, RW, RH, GLOBAL_BYTES, WGSL_BASE } from '../pista-quente/nucleo.js';
import { criarMaestro } from '../espaco/maestro.js';
import { criarCena, MODOS, MAX_OBJ, TILE, TX, TY, NPLANOS, planosDasRochas, FIGURAS } from './cenas.js';

const MODO = MODOS.includes(Q.get('modo')) ? Q.get('modo') : 'logo';
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;
const LIN = Math.min(1, Math.max(0.25, parseFloat(Q.get('linhas') || '0.5')));
const RHI = Math.round(RH * LIN);
const HT = 0.7532, ZF = 4.39, PASSO = 1.92 / 1032;
const SEMENTE = Q.has('semente') ? parseInt(Q.get('semente'), 10) : Math.floor(Math.random() * 1e9);

// ---------- o volume das rochas: 12 rochas de 80³, geradas aqui ----------
const WGSL_COMUM = /* wgsl */`
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(a: u32) -> f32 { return f32(pcg(a) >> 8u) / 16777216.; }
fn hl(i: vec3i, s: u32) -> f32 { return rnd(pcg(bitcast<u32>(i.x) + pcg(bitcast<u32>(i.y) + pcg(bitcast<u32>(i.z) + s)))); }
fn vn(p: vec3f, s: u32) -> f32 {
  let i = vec3i(floor(p)); let f = fract(p);
  let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  let a = mix(mix(hl(i, s), hl(i + vec3i(1, 0, 0), s), u.x), mix(hl(i + vec3i(0, 1, 0), s), hl(i + vec3i(1, 1, 0), s), u.x), u.y);
  let b = mix(mix(hl(i + vec3i(0, 0, 1), s), hl(i + vec3i(1, 0, 1), s), u.x), mix(hl(i + vec3i(0, 1, 1), s), hl(i + vec3i(1, 1, 1), s), u.x), u.y);
  return mix(a, b, u.z);
}
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.) / k; return max(a, b) + h * h * k * .25; }
`;
const WGSL_ASSAR = WGSL_COMUM + /* wgsl */`
struct Rocha { forma: vec4f, sem: vec4u };
@group(0) @binding(0) var dst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(1) var<storage, read> PL: array<vec4f>;     // ${NPLANOS} planos por rocha: normal e distância
@group(0) @binding(2) var<storage, read> RO: array<Rocha>;
@group(0) @binding(3) var<uniform> QUAL: vec4u;                 // x = qual rocha
const TILE = ${TILE}u; const TX = ${TX}u; const NP = ${NPLANOS}u;
fn poliedro(q: vec3f, k: u32) -> f32 {
  var d = -1e9;
  for (var i = 0u; i < NP; i++) { let pl = PL[k * NP + i]; d = smax(d, dot(q, pl.xyz) - pl.w, .045); }
  return d;
}
// A rocha: um poliedro de faces largas, com lascas em concha arrancadas da superfície (como carvão e obsidiana quebrados),
// aspereza fina por cima e, em algumas, uma fenda que atravessa.
fn rocha(p: vec3f, k: u32) -> vec4f {
  let R = RO[k];
  let sc = R.forma.xyz; let ms = min(sc.x, min(sc.y, sc.z));
  let sem = R.sem.x;
  var d = poliedro(p / sc, k) * ms;
  var marca = 0.;
  for (var nivel = 0u; nivel < 2u; nivel++) {
    let esc = select(6.2, 2.9, nivel == 0u);
    let rr = select(.1, .23, nivel == 0u);
    let ig = vec3i(floor(p * esc));
    let s2 = sem + 500u + nivel * 77u;
    for (var z = -1; z <= 1; z++) { for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
      let c = ig + vec3i(x, y, z);
      if (hl(c, s2 + 9u) < .42) { continue; }
      let cc = (vec3f(c) + .5 + (vec3f(hl(c, s2), hl(c, s2 + 1u), hl(c, s2 + 2u)) - .5) * .8) / esc;
      let dc = poliedro(cc / sc, k) * ms;
      if (abs(dc) > rr * .75) { continue; }
      let fora = normalize(cc + vec3f(.0001));
      let r = rr * (.7 + .55 * hl(c, s2 + 3u));
      let centro = cc - fora * dc + fora * r * (.66 + .22 * hl(c, s2 + 4u));
      let ds = r - length(p - centro);
      if (ds > d) { marca = hl(c, s2 + 5u); }
      d = smax(d, ds, .01);
    } } }
  }
  d += (vn(p * 21., sem + 7u) - .5) * .009 + (vn(p * 47., sem + 8u) - .5) * .004;
  var fenda = 0.;
  if (R.sem.y == 1u) {
    let nc = normalize(vec3f(rnd(sem + 30u), rnd(sem + 31u), rnd(sem + 32u)) - .5);
    let cp = dot(p, nc) - (rnd(sem + 33u) - .5) * .45 + (vn(p * 3.1, sem + 34u) - .5) * .1 + (vn(p * 8.7, sem + 35u) - .5) * .025;
    fenda = 1. - smoothstep(0., .06, abs(cp));
    d = max(d, .0075 - abs(cp));
  }
  return vec4f(d, marca, fenda, 1.);
}
@compute @workgroup_size(4, 4, 4) fn assar(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= TILE || id.y >= TILE || id.z >= TILE) { return; }
  let k = QUAL.x;
  let p = (vec3f(id) + .5) / f32(TILE) * 2. - 1.;
  let o = vec3u((k % TX) * TILE, (k / TX) * TILE, 0u);
  textureStore(dst, id + o, rocha(p, k));
}
// ruído 3D que repete a cada unidade, em quatro escalas: 4, 8, 16 e 32 células
@group(0) @binding(4) var dstR: texture_storage_3d<rgba16float, write>;
fn hp(i: vec3i, P: i32, s: u32) -> f32 { return hl(((i % P) + P) % P, s); }
fn vnp(p: vec3f, P: i32, s: u32) -> f32 {
  let i = vec3i(floor(p)); let f = fract(p);
  let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  let a = mix(mix(hp(i, P, s), hp(i + vec3i(1, 0, 0), P, s), u.x), mix(hp(i + vec3i(0, 1, 0), P, s), hp(i + vec3i(1, 1, 0), P, s), u.x), u.y);
  let b = mix(mix(hp(i + vec3i(0, 0, 1), P, s), hp(i + vec3i(1, 0, 1), P, s), u.x), mix(hp(i + vec3i(0, 1, 1), P, s), hp(i + vec3i(1, 1, 1), P, s), u.x), u.y);
  return mix(a, b, u.z);
}
@compute @workgroup_size(4, 4, 4) fn ruido(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 64u || id.y >= 64u || id.z >= 64u) { return; }
  let p = vec3f(id) / 64.;
  textureStore(dstR, id, vec4f(vnp(p * 4., 4, 11u), vnp(p * 8., 8, 23u), vnp(p * 16., 16, 37u), vnp(p * 32., 32, 51u)));
}
`;

const vol = gpu.createTexture({ size: [TILE * TX, TILE * TY, TILE], dimension: '3d', format: 'rgba16float', usage: T.TEXTURE_BINDING | T.STORAGE_BINDING });
const ruid = gpu.createTexture({ size: [64, 64, 64], dimension: '3d', format: 'rgba16float', usage: T.TEXTURE_BINDING | T.STORAGE_BINDING });
{
  const { planos, rochas } = planosDasRochas(SEMENTE);
  const bufPL = gpu.createBuffer({ size: planos.byteLength, usage: U.STORAGE | U.COPY_DST });
  const bufRO = gpu.createBuffer({ size: rochas.byteLength, usage: U.STORAGE | U.COPY_DST });
  gpu.queue.writeBuffer(bufPL, 0, planos);
  gpu.queue.writeBuffer(bufRO, 0, rochas);
  const m = modulo(WGSL_ASSAR, 'assar');
  const [pA, pR] = await Promise.all([
    gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: m, entryPoint: 'assar' } }),
    gpu.createComputePipelineAsync({ layout: 'auto', compute: { module: m, entryPoint: 'ruido' } }),
  ]);
  const quais = [];
  for (let k = 0; k < TX * TY; k++) {
    const b = gpu.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
    gpu.queue.writeBuffer(b, 0, new Uint32Array([k, 0, 0, 0]));
    quais.push(gpu.createBindGroup({ layout: pA.getBindGroupLayout(0), entries: [
      { binding: 0, resource: vol.createView() }, { binding: 1, resource: { buffer: bufPL } },
      { binding: 2, resource: { buffer: bufRO } }, { binding: 3, resource: { buffer: b } },
    ] }));
  }
  // uma rocha por envio: o trabalho todo de uma vez passaria do tempo que o Windows dá à placa
  for (const bg of quais) {
    const enc = gpu.createCommandEncoder();
    const c = enc.beginComputePass(); c.setPipeline(pA); c.setBindGroup(0, bg); c.dispatchWorkgroups(TILE / 4, TILE / 4, TILE / 4); c.end();
    gpu.queue.submit([enc.finish()]);
  }
  const enc = gpu.createCommandEncoder();
  const c = enc.beginComputePass(); c.setPipeline(pR);
  c.setBindGroup(0, gpu.createBindGroup({ layout: pR.getBindGroupLayout(0), entries: [{ binding: 4, resource: ruid.createView() }] }));
  c.dispatchWorkgroups(16, 16, 16); c.end();
  gpu.queue.submit([enc.finish()]);
  await gpu.queue.onSubmittedWorkDone();
}

// ---------- letreiros e personagens: campos de distância 2D ----------
const op = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
const aqui = a => new URL(a, import.meta.url);
async function camadas(urls, w, h) {
  const tex = gpu.createTexture({ size: [w, h, urls.length], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
  await Promise.all(urls.map(async (u, i) => {
    const b = await createImageBitmap(await (await fetch(u)).blob(), op);
    gpu.queue.copyExternalImageToTexture({ source: b }, { texture: tex, origin: [0, 0, i] }, [w, h]);
    b.close();
  }));
  return tex;
}
const [texLetr, texFig] = await Promise.all([
  camadas(['clube', 'pista', 'millos'].map(n => aqui(`../espaco/dados/letreiro-${n}.png`)), 2048, 720),
  camadas(FIGURAS.map(l => aqui(`dados/figura-sdf-${l}.png`)), 1024, 1024),
]);

// A fonte dos números: 3x5 pixels, como um mostrador
const DESENHOS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const FONTE = DESENHOS.map(s => { let m = 0; for (let i = 0; i < 15; i++) if (s[i] === '1') m |= 1 << i; return m >>> 0; });

const WGSL = WGSL_BASE + WGSL_COMUM + /* wgsl */`
struct Cena {
  t: f32, fase: f32, kick: f32, grave: f32,
  agudo: f32, somVivo: f32, nObj: f32, modo: f32,
  scanZ: f32, scanF: f32, digT: f32, digV: f32,
  booth: f32, varre: f32, varreZ: f32, estrelas: f32,
  ondas: f32, pedra: f32, luzVarre: f32, expo: f32,
  pedraCor: vec4f,
};
// Uma peça. tipo 0 rocha do volume, 1 letreiro, 2 personagem deitado, 3 bloco de pedra.
// esc: x escala (m por unidade), y tipo, z rocha/letreiro/personagem, w espelho (+1, -1). cA e cB: cortes polidos (normal local, distância).
// dig: x tamanho da casa do número (m), y força, z semente, w quanto aparece. ex: x aspereza, y material (0 rocha preta, 1 pedra clara), z meia espessura ou altura do pé, w letreiro B ou recuo do pé.
// ex2: letreiro (meia largura, mistura), personagem (altura, desenho), bloco (meias medidas, vão do anel).
struct Obj { pos: vec4f, rot: vec4f, esc: vec4f, cA: vec4f, cB: vec4f, dig: vec4f, ex: vec4f, ex2: vec4f };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var<storage, read> OBJ: array<Obj>;
@group(0) @binding(3) var vol: texture_3d<f32>;
@group(0) @binding(4) var ruid: texture_3d<f32>;
@group(0) @binding(5) var letr: texture_2d_array<f32>;
@group(0) @binding(6) var figs: texture_2d_array<f32>;
@group(0) @binding(7) var amC: sampler;
@group(0) @binding(8) var amR: sampler;
const HT = ${HT}; const ZF = ${ZF}; const PASSO = ${PASSO.toFixed(8)};
const LW = ${(2048 / 1720).toFixed(6)}; const LH = ${(720 / 1720).toFixed(6)};
const TILE = ${TILE}.; const TX = ${TX}.; const TY = ${TY}.;
const FONTE = array<u32, 10>(${FONTE.map(m => m + 'u').join(', ')});

fn girar(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
fn desgirar(q: vec4f, v: vec3f) -> vec3f { return girar(vec4f(-q.xyz, q.w), v); }
fn paraLocal(o: Obj, p: vec3f) -> vec3f { var l = desgirar(o.rot, p - o.pos.xyz) / o.esc.x; l.x *= o.esc.w; return l; }
fn dirLocal(o: Obj, d: vec3f) -> vec3f { var l = desgirar(o.rot, d); l.x *= o.esc.w; return l; }
fn dirMundo(o: Obj, d: vec3f) -> vec3f { var l = d; l.x *= o.esc.w; return girar(o.rot, l); }
fn r3(p: vec3f) -> vec4f { return textureSampleLevel(ruid, amR, p, 0.); }

// ---------- formas ----------
fn rochaVol(p: vec3f, tile: f32) -> vec4f {
  let q = clamp(p, vec3f(-.975), vec3f(.975));
  let tx = tile - TX * floor(tile / TX);
  let ty = floor(tile / TX);
  let uvw = vec3f((tx + q.x * .5 + .5) / TX, (ty + q.y * .5 + .5) / TY, q.z * .5 + .5);
  var s = textureSampleLevel(vol, amC, uvw, 0.);
  s.x += length(p - q);
  return s;
}
fn letreiroD(uv: vec2f, a: i32, b: i32, m: f32) -> f32 {
  let la = textureSampleLevel(letr, amC, uv, a, 0.);
  let ga = la.g * 512. - 256.;
  var d = select(ga, la.r * 48. - 24., abs(ga) < 20.);
  if (m > .001) {
    let lb = textureSampleLevel(letr, amC, uv, b, 0.);
    let gb = lb.g * 512. - 256.;
    d = mix(d, select(gb, lb.r * 48. - 24., abs(gb) < 20.), m);
  }
  return d;
}
// letreiro em pé: x à direita, y para cima, frente em z = -meia espessura, virada para o olho
fn contornoLetreiro(p: vec3f, o: Obj) -> f32 {
  let larg = 2. * o.ex2.x * LW; let alt = 2. * o.ex2.x * LH;
  let uv = vec2f(p.x / larg + .5, .5 - p.y / alt);
  let den = clamp(uv, vec2f(.001), vec2f(.999));
  var d = letreiroD(den, i32(o.esc.z), i32(o.ex.w), o.ex2.y) * (larg / 2048.) + length((uv - den) * vec2f(larg, alt));
  if (o.ex.x > 0.) { d += ((r3(p * .8).z - .5) * .016 + (r3(p * 2.3 + .4).w - .5) * .007) * o.ex.x; }
  return d;
}
// personagem deitado no teto: plano xz, cabeça para +z (para a parede), frente em y = -meia espessura, virada para baixo
fn figuraD(uv: vec2f, i: i32) -> f32 {
  let s = textureSampleLevel(figs, amC, uv, i, 0.);
  let lg = s.g * 512. - 256.;
  return select(lg, s.r * 48. - 24., abs(lg) < 20.);
}
fn contornoFigura(p: vec3f, o: Obj) -> f32 {
  let H = o.ex2.x;
  let uv = vec2f(p.x / H + .5, .5 + p.z / H);
  let den = clamp(uv, vec2f(.001), vec2f(.999));
  var d = figuraD(den, i32(o.esc.z)) * (H / 1024.) + length((uv - den) * H);
  if (o.ex.x > 0.) { d += ((r3(p * .7).z - .5) * .024 + (r3(p * 1.9 + .3).w - .5) * .01) * o.ex.x; }
  return d;
}
fn sdCaixa(p: vec3f, h: vec3f) -> f32 { let q = abs(p) - h; return length(max(q, vec3f(0.))) + min(max(q.x, max(q.y, q.z)), 0.); }
// face lascada (split face): só nas laterais; as faces de cima e de baixo ficam lisas, como pedra serrada e apicoada
fn lascado(p: vec3f, h: vec3f, rug: f32, off: vec3f) -> f32 {
  let q = abs(p) - h;
  let w = smoothstep(-.007, .005, max(q.x, q.z) - q.y);
  let pn = p + off;
  let n = (r3(pn * .5).y - .5) * .03 + (r3(pn * 1.35 + .2).z - .5) * .017 + (r3(pn * 3.4 + .5).w - .5) * .008;
  let estrato = sin(pn.y * 90. + r3(pn * .37).x * 7.) * .0025;
  return (n + estrato) * w * rug;
}
fn sdBloco(p: vec3f, o: Obj) -> f32 {
  let h = o.ex2.xyz;
  let off = vec3f(o.dig.z * 1.37, 0., o.dig.z * .71);
  var d = sdCaixa(p, h) + lascado(p, h, o.ex.x, off);
  if (o.ex.z > 0.) {
    let hp = vec3f(h.x - o.ex.w, o.ex.z * .5, h.z - o.ex.w);
    let pp = p - vec3f(0., -h.y - hp.y + .002, 0.);
    d = min(d, sdCaixa(pp, hp) + lascado(pp, hp, o.ex.x, off + vec3f(3.1, 0., 1.7)));
  }
  if (o.ex2.w > 0.) {
    let hv = vec3f(h.x - o.ex2.w, h.y + .5, h.z - o.ex2.w);
    d = max(d, -(sdCaixa(p, hv) - lascado(p.zyx, hv.zyx, o.ex.x, off + vec3f(5.3, 0., 2.9)) * .8));
  }
  return d;
}
fn corte(p: vec3f, c: vec4f) -> f32 {
  if (dot(c.xyz, c.xyz) < .5) { return -1e3; }
  return dot(p, c.xyz) - c.w;
}
// a peça sem os cortes polidos
fn sdCorpo(o: Obj, p: vec3f) -> f32 {
  let tipo = o.esc.y;
  if (tipo < .5) { return rochaVol(p, o.esc.z).x; }
  if (tipo < 1.5) { return max(contornoLetreiro(p, o), abs(p.z) - o.ex.z); }
  if (tipo < 2.5) { return max(contornoFigura(p, o), abs(p.y) - o.ex.z); }
  return sdBloco(p, o);
}
fn sdObj(o: Obj, p: vec3f) -> f32 { return max(max(sdCorpo(o, p), corte(p, o.cA)), corte(p, o.cB)); }

// ---------- o raio dentro de uma peça ----------
fn marchar(k: i32, rd: vec3f, t0: f32, t1: f32) -> f32 {
  let o = OBJ[k];
  let s = o.esc.x;
  let lo = paraLocal(o, vec3f(0.));
  let ld = dirLocal(o, rd);
  let tipo = o.esc.y;
  var t = t0;
  // extrusão: a frente é um plano; se o raio entra dentro do contorno, é ali
  if (tipo > .5 && tipo < 2.5) {
    let dd = select(ld.z, ld.y, tipo > 1.5);
    let p0 = select(lo.z, lo.y, tipo > 1.5);
    if (dd > .02) {
      let tp = (-o.ex.z - p0) / dd * s;
      if (tp >= t0 && tp <= t1) {
        let p = lo + ld * (tp / s);
        let dc = select(contornoLetreiro(p, o), contornoFigura(p, o), tipo > 1.5);
        if (dc < 0. && corte(p, o.cA) < 0. && corte(p, o.cB) < 0.) { return tp; }
        t = max(t0, tp - .002);
      }
    }
  }
  for (var i = 0; i < 110; i++) {
    let p = lo + ld * (t / s);
    let d = sdObj(o, p) * s;
    if (d < max(t * .0006, .0003)) { return t; }
    t += d * .82;
    if (t > t1) { break; }
  }
  return -1.;
}
fn normalObj(o: Obj, p: vec3f, e: f32) -> vec3f {
  let k = vec2f(1., -1.);
  return normalize(k.xyy * sdObj(o, p + k.xyy * e) + k.yyx * sdObj(o, p + k.yyx * e) + k.yxy * sdObj(o, p + k.yxy * e) + k.xxx * sdObj(o, p + k.xxx * e));
}
fn aoObj(o: Obj, p: vec3f, n: vec3f, esc: f32) -> f32 {
  var a = 0.; var w = 1.;
  for (var i = 1; i <= 4; i++) {
    let h = esc * f32(i * i);
    a += (h - sdObj(o, p + n * h)) * w / esc;
    w *= .55;
  }
  return clamp(1. - a * .09, .15, 1.);
}

// ---------- luz ----------
// O que a face polida reflete: céu preto, chão escuro, o brilho quente do booth lá na frente e embaixo, uma luz fria rasante da entrada.
fn ambiente(r: vec3f) -> vec3f {
  let b = max(dot(r, normalize(vec3f(0., -.42, .9))), 0.);
  var c = vec3f(1., .8, .58) * (pow(b, 5.) * .32 + pow(b, 60.) * 3.2) * C.booth;
  c += vec3f(.018, .017, .019) * smoothstep(.15, -.55, r.y);
  let s1 = max(dot(r, normalize(vec3f(.75, -.55, .25))), 0.);
  let s2 = max(dot(r, normalize(vec3f(-.75, -.55, .25))), 0.);
  let s3 = max(dot(r, normalize(vec3f(0., -.62, -.78))), 0.);
  c += (pow(s1, 16.) + pow(s2, 16.)) * vec3f(.55, .62, .8) * .3 + pow(s3, 12.) * vec3f(.95, .88, .8) * .18;
  let e = max(dot(r, normalize(vec3f(0., .08, -1.))), 0.);
  c += vec3f(.5, .62, .9) * pow(e, 12.) * .42;
  // a barra de luz da varredura do bumbo, refletida
  let h = r.xz / max(abs(r.y), .12);
  let f = fract(h.y * .16 - C.varre) - .5;
  c += vec3f(.95, .95, 1.) * exp(-f * f * 160.) * C.luzVarre * .9 * smoothstep(.05, -.3, r.y);
  return c;
}
fn ggx(N: vec3f, V: vec3f, L: vec3f, a: f32, f0: vec3f) -> vec3f {
  let H = normalize(V + L);
  let nl = max(dot(N, L), 0.); let nv = max(dot(N, V), .001); let nh = max(dot(N, H), 0.); let vh = max(dot(V, H), 0.);
  let a2 = a * a;
  let dd = nh * nh * (a2 - 1.) + 1.;
  let D = a2 / (PI * dd * dd);
  let k = a * .5;
  let Gs = 1. / ((nl * (1. - k) + k) * (nv * (1. - k) + k));
  let F = f0 + (1. - f0) * pow(1. - vh, 5.);
  return D * Gs * F * .25 * nl;
}
fn umaLuz(N: vec3f, V: vec3f, L: vec3f, a: f32, f0: vec3f, alb: vec3f, cor: vec3f) -> vec3f {
  return (alb / PI * max(dot(N, L), 0.) + ggx(N, V, L, a, f0)) * cor;
}
fn luzes(pw: vec3f, N: vec3f, V: vec3f, a: f32, f0: vec3f, alb: vec3f) -> vec3f {
  var c = alb * (.025 + .06 * max(-N.y, 0.));
  let lb = vec3f(0., -1.05, ZF + .3) - pw;
  let db = dot(lb, lb);
  c += umaLuz(N, V, lb * inverseSqrt(db), a, f0, alb, vec3f(1., .82, .62) * 10. * C.booth / (1. + db * .55));
  c += umaLuz(N, V, normalize(vec3f(.12, 1., .3)), a, f0, alb, vec3f(.55, .66, 1.) * 1.5);
  c += umaLuz(N, V, normalize(vec3f(0., -1., -.45)), a, f0, alb, vec3f(.6, .66, .8) * .5);
  let ls = vec3f(0., HT - .45, C.varreZ) - pw;
  let ds = dot(ls, ls);
  c += umaLuz(N, V, ls * inverseSqrt(ds), a, f0, alb, vec3f(1.) * C.luzVarre * 5. / (1. + ds * 1.4));
  return c;
}

// ---------- os números ----------
fn bitG(m: u32, x: i32, y: i32) -> bool {
  if (x < 0 || x > 2 || y < 0 || y > 4) { return false; }
  return ((m >> u32(y * 3 + x)) & 1u) == 1u;
}
// cobertura do número na casa, já filtrada pelo tamanho do ponto do painel: número menor que o ponto vira a média, sem cintilar
fn caixa1(u: f32, w: f32, b0: f32, b1: f32) -> f32 { return max(0., min(u + w * .5, b1) - max(u - w * .5, b0)) / w; }
fn glifo(dig: u32, fc: vec2f, fw: f32) -> f32 {
  var fonte = FONTE;
  let m = fonte[min(dig, 9u)];
  let u = vec2f(fc.x * 5. - 1., (1. - fc.y) * 7. - 1.);
  let w = max(fw, .05);
  var cob = 0.;
  if (w < 1.6) {
    let ip = vec2i(floor(u));
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let c = ip + vec2i(dx, dy);
        if (bitG(m, c.x, c.y)) {
          let cf = vec2f(c);
          cob += caixa1(u.x, w, cf.x + .07, cf.x + .93) * caixa1(u.y, w, cf.y + .07, cf.y + .93);
        }
      }
    }
  }
  let cheio = f32(countOneBits(m)) / 15. * .74;
  let bloco = caixa1(u.x, w, 0., 3.) * caixa1(u.y, w, 0., 5.) * cheio;
  let r = mix(min(cob, 1.), bloco, smoothstep(.8, 1.6, w));
  return mix(r, cheio * 15. / 35., smoothstep(3., 6., w));
}
// o furta-cor do vídeo: violeta, azul, ciano e verde, em manchas grandes
fn corDig(t0: f32) -> vec3f {
  let t = fract(t0);
  let a = vec3f(.56, .32, 1.); let b = vec3f(.2, .46, 1.); let c = vec3f(.1, .86, .9); let d = vec3f(.34, 1., .44);
  if (t < .3) { return mix(a, b, t / .3); }
  if (t < .55) { return mix(b, c, (t - .3) / .25); }
  if (t < .78) { return mix(c, d, (t - .55) / .23); }
  return mix(d, a, (t - .78) / .22);
}
fn numeros(f: vec2f, sem: f32, cel: f32, pegada: f32, pw: vec3f, ang: f32, forca: f32) -> vec3f {
  let tam = vec2f(cel * .72, cel);
  let g = f / tam;
  let ic = floor(g);
  let fc = g - ic;
  let h1 = hash21(ic + vec2f(sem * 17.3, sem * 3.1));
  let h2 = hash21(ic.yx * 1.31 + vec2f(sem * 5.7 + 2.3, 9.1));
  let h3 = hash21(ic * .73 + vec2f(41.7, sem * 11.9));
  if (h3 < .055) { return vec3f(0.); }
  // a maioria troca devagar; uns contadores correm; algumas colunas escorrem de cima para baixo
  var ritmo = mix(.1, .5, h2);
  if (h1 > .82) { ritmo = 1.8 + 3.5 * h2; }
  var k = floor(C.digT * ritmo * C.digV + h1 * 23.);
  if (h1 < .12) { k = floor(C.digT * 1.4 * C.digV + ic.y * .3 + hash21(vec2f(ic.x, sem)) * 9.); }
  // a onda do bumbo troca tudo por onde passa
  k += (C.ondas + select(0., 1., pw.z > C.scanZ)) * 5.;
  let dig = u32(hash21(ic + vec2f(k * 1.618, k * .377 + sem)) * 9.999);
  let cob = glifo(dig, fc, pegada / tam.y * 7.);
  var bri = .45 + .55 * h2;
  let quente = h3 > .97;
  if (quente) { bri = 2.6; }
  let dz = (pw.z - C.scanZ) / .5;
  let onda = exp(-dz * dz) * C.scanF;
  bri *= 1. + 2.4 * onda;
  let campo = r3(vec3f(f.x * .42, f.y * .42, sem * .131)).x;
  var cor = corDig(campo * 1.6 + (h3 - .5) * .34 + ang * .35 + C.t * .002);
  if (h1 > .985) { cor = select(vec3f(1., .66, .3), vec3f(1., .36, .82), h2 > .5); }
  cor = mix(cor, vec3f(1.), select(0., .45, quente) + onda * .35);
  return cor * cob * bri * forca;
}
fn baseFace(fN: vec3f, ang: f32) -> mat2x3f {
  let up = select(vec3f(0., 1., 0.), vec3f(0., 0., 1.), abs(fN.y) > .7);
  let v0 = normalize(up - fN * dot(up, fN));
  let u0 = cross(fN, v0);
  let c = cos(ang); let s = sin(ang);
  return mat2x3f(u0 * c + v0 * s, v0 * c - u0 * s);
}
// a face polida: vidro preto com a camada de números 2 mm abaixo
fn facePolida(f0: vec2f, fl: vec3f, ld: vec3f, B: mat2x3f, N: vec3f, rd: vec3f, pw: vec3f, o: Obj, pegada: f32, desenho: f32) -> vec3f {
  let nv = max(abs(dot(ld, fl)), .25);
  let f = f0 + vec2f(dot(ld, B[0]), dot(ld, B[1])) / nv * .0022;
  let ang = 1. - abs(dot(rd, N));
  var c = numeros(f, o.dig.z, o.dig.x, pegada, pw, ang, o.dig.y * o.dig.w * desenho);
  // um véu leve, como luz espalhada debaixo do vidro
  c += corDig(o.dig.z * .37) * .006 * o.dig.w;
  let F = .04 + .96 * pow(1. - abs(dot(rd, N)), 5.);
  c += ambiente(reflect(rd, N)) * F;
  return c;
}
fn rochaPreta(pw: vec3f, N: vec3f, V: vec3f, ao: f32, varia: f32, fenda: f32) -> vec3f {
  let alb = vec3f(.02, .02, .023) * (.75 + .5 * varia);
  let a = .17 + .14 * varia;
  var c = luzes(pw, N, V, a, vec3f(.05), alb);
  let F = .05 + .95 * pow(1. - max(dot(V, N), 0.), 5.);
  c += ambiente(reflect(-V, N)) * F * .5;
  return c * ao * (1. - .75 * fenda);
}

// ---------- pedra clara: travertino amarronzado ----------
fn luzesPedra(pw: vec3f, N: vec3f, V: vec3f, a: f32, alb: vec3f) -> vec3f {
  var c = alb * (.07 + .12 * max(-N.y, 0.)) * vec3f(1., .93, .84);
  c += umaLuz(N, V, normalize(vec3f(0., -.45, -1.)), a, vec3f(.035), alb, vec3f(.78, .8, .9) * .55);
  let lb = vec3f(0., -1.1, ZF + .2) - pw;
  let db = dot(lb, lb);
  c += umaLuz(N, V, lb * inverseSqrt(db), a, vec3f(.035), alb, vec3f(1., .84, .66) * 7.5 * C.booth / (1. + db * .32));
  let lf = vec3f(0., -1.4, -3.5) - pw;
  let df = dot(lf, lf);
  c += umaLuz(N, V, lf * inverseSqrt(df), a, vec3f(.035), alb, vec3f(.7, .78, 1.) * 1.6 / (1. + df * .3));
  let ls = vec3f(0., HT - .55, C.varreZ) - pw;
  let ds = dot(ls, ls);
  c += umaLuz(N, V, ls * inverseSqrt(ds), a, vec3f(.035), alb, vec3f(1., .95, .88) * C.luzVarre * 3.2 / (1. + ds * 1.1));
  return c;
}
fn travertino(p: vec3f, pw: vec3f, N: vec3f, V: vec3f, lisa: f32, ao: f32) -> vec3f {
  let n1 = r3(p * .45).x; let n2 = r3(p * 1.25 + .1).y; let n3 = r3(p * 3.3 + .2).z; let n4 = r3(p * 7.9 + .3).w;
  // veios do travertino: camadas tortas, umas mais claras e outras mais escuras; nuvem de tom; poros pequenos
  let veio = sin(dot(p, vec3f(.22, 1., .62)) * 48. + n1 * 9. + n2 * 4.);
  let veioFino = sin(dot(p, vec3f(.25, 1., .6)) * 150. + n2 * 6. + n3 * 2.);
  let poro = smoothstep(.71, .79, r3(p * 5.2 + .7).w * .6 + n4 * .4);
  let nuvem = r3(p * .22 + .4).x;
  var alb = C.pedraCor.rgb * (.84 + .17 * nuvem) * (1. + .08 * veio + .035 * veioFino) * (.94 + .1 * n2) * (1. - .55 * poro);
  alb *= mix(vec3f(.95, .97, 1.03), vec3f(1.05, 1., .92), nuvem);
  alb *= mix(vec3f(.84, .79, .74), vec3f(1.), lisa);
  return luzesPedra(pw, N, V, mix(.85, .48, lisa), alb) * ao;
}

// ---------- fundo ----------
fn estrelas(px: vec2f) -> f32 {
  let g = px / vec2f(20., 26.);
  let i = floor(g);
  let h = hash21(i + vec2f(3., 91.));
  if (h < .962) { return 0.; }
  let o = vec2f(hash21(i), hash21(i + vec2f(7., 7.))) * .7 + .15;
  let d = (fract(g) - o) * vec2f(20., 26. * .55);
  return exp(-dot(d, d) / 2.4) * (h - .962) * 22.;
}

// ---------- a peça atingida ----------
fn sombrear(k: i32, rd: vec3f, t: f32, tMin: f32) -> vec3f {
  let o = OBJ[k];
  let pw = rd * t;
  let s = o.esc.x;
  let p = paraLocal(o, pw);
  let ld = dirLocal(o, rd);
  let tipo = o.esc.y;
  let V = -rd;
  let e = select(.0018, .004, tipo < .5);
  let nl = normalObj(o, p, e);
  var N = normalize(dirMundo(o, nl));
  let dA = corte(p, o.cA);
  let dB = corte(p, o.cB);
  let dC = sdCorpo(o, p);
  var face = 0;
  var fl = vec3f(0.);
  if (dA > dC - .0015 && dA >= dB) { face = 1; fl = o.cA.xyz; }
  else if (dB > dC - .0015) { face = 2; fl = o.cB.xyz; }
  else if (tipo > .5 && tipo < 1.5) {
    if (abs(p.z) - o.ex.z > contornoLetreiro(p, o) - .0015) { face = 3; fl = vec3f(0., 0., sign(p.z)); }
  } else if (tipo > 1.5 && tipo < 2.5) {
    if (abs(p.y) - o.ex.z > contornoFigura(p, o) - .0015) { face = 3; fl = vec3f(0., sign(p.y), 0.); }
  }
  let mat = o.ex.y;
  if (face > 0) { N = normalize(dirMundo(o, fl)); }
  let pegada = t * PASSO * 2.2 / tMin / max(abs(dot(rd, N)), .2);
  if (mat > .5) {
    // pedra clara: face serrada lisa e laterais lascadas
    var lisa = select(0., 1., face > 0);
    if (tipo > 2.5) { lisa = smoothstep(.55, .9, abs(nl.y)); }
    let ao = aoObj(o, p, nl, .02 / s);
    return travertino(p * s + vec3f(o.dig.z * 1.37, 0., o.dig.z * .71), pw, N, V, lisa, ao);
  }
  if (face > 0) {
    var f = vec2f(0.);
    var B = mat2x3f(vec3f(1., 0., 0.), vec3f(0., 1., 0.));
    var desenho = 1.;
    if (face == 3 && tipo < 1.5) { f = p.xy * s; }
    else if (face == 3) {
      f = vec2f(p.x, -p.z) * s; B = mat2x3f(vec3f(1., 0., 0.), vec3f(0., 0., -1.));
      let H = o.ex2.x;
      let uv = vec2f(p.x / H + .5, .5 + p.z / H);
      let am = textureSampleLevel(figs, amC, uv, i32(o.esc.z), 0.);
      // o desenho do personagem aparece nos números: o claro do desenho acende, o escuro apaga; a borda fica mais viva
      let dBorda = am.r * 48. - 24.;
      desenho = mix(.25, 1.25, smoothstep(.15, .85, am.b)) * o.ex2.y + (1. - o.ex2.y) + .9 * exp(-max(-dBorda, 0.) / 6.) * o.ex2.y;
    } else {
      B = baseFace(fl, select(o.ex2.y, o.ex2.x, face == 1));
      f = vec2f(dot(p, B[0]), dot(p, B[1])) * s;
    }
    if (o.esc.w < 0.) { f.x = -f.x; }
    return facePolida(f, fl, ld, B, N, rd, pw, o, pegada, desenho);
  }
  // rocha bruta: um pouco de relevo fino na normal, preso à peça
  var Nb = nl;
  if (tipo < .5) {
    let q = p * 1.7;
    let n0 = r3(q).w;
    let g = vec3f(r3(q + vec3f(.004, 0., 0.)).w - n0, r3(q + vec3f(0., .004, 0.)).w - n0, r3(q + vec3f(0., 0., .004)).w - n0) / .004;
    Nb = normalize(nl - (g - nl * dot(g, nl)) * .006);
  }
  let Nw = normalize(dirMundo(o, Nb));
  let vv = select(rochaVol(p, o.esc.z), vec4f(0., .5, 0., 1.), tipo > .5);
  let ao = aoObj(o, p, nl, select(.012, .02, tipo < .5));
  return rochaPreta(pw, Nw, V, ao, vv.y, vv.z);
}

@fragment fn fs(i: S) -> @location(0) vec4f {
  let px = i.uv * PAINEL;
  var w = vec3f((i.uv.x - .5) * 1.92, HT, ZF - (DOBRA - px.y) * PASSO);
  if (px.y >= DOBRA) { w = vec3f((i.uv.x - .5) * 1.92, HT - (px.y - DOBRA) * PASSO, ZF); }
  let rd = normalize(w);
  let tMin = length(w);
  // quais peças o raio cruza, em ordem de distância (até 8)
  var tE: array<f32, 8>; var tS: array<f32, 8>; var qual: array<i32, 8>;
  var n = 0;
  let nObj = i32(C.nObj);
  for (var k = 0; k < nObj; k++) {
    let ps = OBJ[k].pos;
    let b = dot(ps.xyz, rd);
    let h = b * b - dot(ps.xyz, ps.xyz) + ps.w * ps.w;
    if (h < 0.) { continue; }
    let sh = sqrt(h);
    let t1 = b + sh;
    if (t1 < tMin) { continue; }
    let t0 = max(b - sh, tMin);
    if (n < 8) { n++; } else if (t0 >= tE[7]) { continue; }
    var j = n - 1;
    while (j > 0 && tE[j - 1] > t0) { tE[j] = tE[j - 1]; tS[j] = tS[j - 1]; qual[j] = qual[j - 1]; j--; }
    tE[j] = t0; tS[j] = t1; qual[j] = k;
  }
  var melhor = 1e9; var bi = -1;
  for (var c = 0; c < n; c++) {
    if (tE[c] > melhor) { break; }
    let t = marchar(qual[c], rd, tE[c], min(tS[c], melhor));
    if (t > 0. && t < melhor) { melhor = t; bi = qual[c]; }
  }
  var cor = vec3f(0.);
  if (bi < 0) { cor = vec3f(estrelas(px)) * C.estrelas; }
  else { cor = sombrear(bi, rd, melhor, tMin); }
  return vec4f(cor * C.expo, 1.);
}
`;

// ---------- brilho em cascata (bloom) e a saída ----------
const WGSL_BRILHO = /* wgsl */`
struct SB { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> SB {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: SB;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
@group(0) @binding(0) var fonteT: texture_2d<f32>;
@group(0) @binding(1) var amP: sampler;
@group(0) @binding(2) var<uniform> P: vec4f;      // x, y: tamanho do texel da fonte; z: 1 no primeiro passo
fn amostra(uv: vec2f) -> vec3f { return textureSampleLevel(fonteT, amP, uv, 0.).rgb; }
fn karis(c: vec3f) -> f32 { return 1. / (1. + dot(c, vec3f(.2126, .7152, .0722))); }
@fragment fn desce(i: SB) -> @location(0) vec4f {
  let t = P.xy;
  let a = amostra(i.uv + t * vec2f(-2., -2.)); let b = amostra(i.uv + t * vec2f(0., -2.)); let c = amostra(i.uv + t * vec2f(2., -2.));
  let d = amostra(i.uv + t * vec2f(-2., 0.)); let e = amostra(i.uv); let f = amostra(i.uv + t * vec2f(2., 0.));
  let g = amostra(i.uv + t * vec2f(-2., 2.)); let h = amostra(i.uv + t * vec2f(0., 2.)); let k = amostra(i.uv + t * vec2f(2., 2.));
  let j = amostra(i.uv + t * vec2f(-1., -1.)); let l = amostra(i.uv + t * vec2f(1., -1.));
  let m = amostra(i.uv + t * vec2f(-1., 1.)); let n = amostra(i.uv + t * vec2f(1., 1.));
  if (P.z > .5) {
    // primeiro passo: média de Karis, para um número quente sozinho não piscar no brilho
    let g0 = (a + b + d + e) * .25; let g1 = (b + c + e + f) * .25; let g2 = (d + e + g + h) * .25; let g3 = (e + f + h + k) * .25; let g4 = (j + l + m + n) * .25;
    let w0 = karis(g0) * .125; let w1 = karis(g1) * .125; let w2 = karis(g2) * .125; let w3 = karis(g3) * .125; let w4 = karis(g4) * .5;
    return vec4f((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), 1.);
  }
  return vec4f(e * .125 + (a + c + g + k) * .03125 + (b + d + f + h) * .0625 + (j + l + m + n) * .125, 1.);
}
@fragment fn sobe(i: SB) -> @location(0) vec4f {
  let t = P.xy;
  var c = amostra(i.uv) * 4.;
  c += (amostra(i.uv + vec2f(t.x, 0.)) + amostra(i.uv - vec2f(t.x, 0.)) + amostra(i.uv + vec2f(0., t.y)) + amostra(i.uv - vec2f(0., t.y))) * 2.;
  c += amostra(i.uv + t) + amostra(i.uv - t) + amostra(i.uv + vec2f(t.x, -t.y)) + amostra(i.uv + vec2f(-t.x, t.y));
  return vec4f(c / 16., 1.);
}
`;
const WGSL_FINAL = WGSL_BASE + /* wgsl */`
@group(0) @binding(1) var cenaT: texture_2d<f32>;
@group(0) @binding(2) var amP: sampler;
@group(0) @binding(3) var<uniform> P: vec4f;      // w: força do brilho
@group(0) @binding(4) var brilhoT: texture_2d<f32>;
fn aces(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
fn srgb(c: vec3f) -> vec3f { return select(1.055 * pow(c, vec3f(1. / 2.4)) - .055, c * 12.92, c <= vec3f(.0031308)); }
@fragment fn juntar(i: S) -> @location(0) vec4f {
  let base = textureSampleLevel(cenaT, amP, i.uv, 0.).rgb;
  let bl = textureSampleLevel(brilhoT, amP, i.uv, 0.).rgb;
  let c = base + bl * P.w;
  let d = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5;
  return vec4f(max(srgb(aces(c)) * G.brilho + d / 255., vec3f(0.)), 1.);
}
`;

const modCena = modulo(WGSL, 'pedra');
const modBrilho = modulo(WGSL_BRILHO, 'brilho');
const modFinal = modulo(WGSL_FINAL, 'final');
const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const CENA_F = 24;
const bufC = gpu.createBuffer({ size: CENA_F * 4, usage: U.UNIFORM | U.COPY_DST });
const fC = new Float32Array(CENA_F);
const bufO = gpu.createBuffer({ size: MAX_OBJ * 128, usage: U.STORAGE | U.COPY_DST });
const amC = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' });
const amR = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });

const HDR = 'rgba16float';
const texCena = gpu.createTexture({ size: [RW, RHI], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
const NIV = 5;
const niveis = [];
for (let n = 1; n <= NIV; n++) {
  const w = Math.max(1, RW >> n), h = Math.max(1, RHI >> n);
  niveis.push({ w, h, tex: gpu.createTexture({ size: [w, h], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING }) });
}
const [pCena, pDesce, pSobe, pFinal] = await Promise.all([
  gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modCena, entryPoint: 'vsTela' }, fragment: { module: modCena, entryPoint: 'fs', targets: [{ format: HDR }] } }),
  gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modBrilho, entryPoint: 'vs' }, fragment: { module: modBrilho, entryPoint: 'desce', targets: [{ format: HDR }] } }),
  gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modBrilho, entryPoint: 'vs' }, fragment: { module: modBrilho, entryPoint: 'sobe', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] } }),
  gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: modFinal, entryPoint: 'vsTela' }, fragment: { module: modFinal, entryPoint: 'juntar', targets: [{ format: formato }] } }),
]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const bgCena = gpu.createBindGroup({ layout: pCena.getBindGroupLayout(0), entries: [
  { binding: 1, resource: { buffer: bufC } }, { binding: 2, resource: { buffer: bufO } },
  { binding: 3, resource: vol.createView() }, { binding: 4, resource: ruid.createView() },
  { binding: 5, resource: texLetr.createView({ dimension: '2d-array' }) }, { binding: 6, resource: texFig.createView({ dimension: '2d-array' }) },
  { binding: 7, resource: amC }, { binding: 8, resource: amR },
] });
const unif = vals => { const b = gpu.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }); gpu.queue.writeBuffer(b, 0, new Float32Array(vals)); return b; };
const passosDesce = niveis.map((nv, i) => {
  const src = i === 0 ? texCena : niveis[i - 1].tex;
  const sw = i === 0 ? RW : niveis[i - 1].w, sh = i === 0 ? RHI : niveis[i - 1].h;
  return { alvo: nv.tex.createView(), bg: gpu.createBindGroup({ layout: pDesce.getBindGroupLayout(0), entries: [
    { binding: 0, resource: src.createView() }, { binding: 1, resource: amC }, { binding: 2, resource: { buffer: unif([1 / sw, 1 / sh, i === 0 ? 1 : 0, 0]) } },
  ] }) };
});
const passosSobe = [];
for (let i = NIV - 1; i >= 1; i--) {
  const src = niveis[i], dst = niveis[i - 1];
  passosSobe.push({ alvo: dst.tex.createView(), bg: gpu.createBindGroup({ layout: pSobe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: src.tex.createView() }, { binding: 1, resource: amC }, { binding: 2, resource: { buffer: unif([1 / src.w, 1 / src.h, 0, 0]) } },
  ] }) });
}
const bufFinal = gpu.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
const bgFinal = gpu.createBindGroup({ layout: pFinal.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: texCena.createView() }, { binding: 2, resource: amC }, { binding: 3, resource: { buffer: bufFinal } },
  { binding: 4, resource: niveis[0].tex.createView() },
] });

// ---------- o quadro ----------
const M = criarMaestro();
const CENA = criarCena(MODO, { SEMENTE, HT, ZF });
const contar = medir(adaptador, 'pedra-' + MODO);
const TESTE = Q.has('simsom');
const S = { tempo: 0, kick: 0, grave: 0, agudo: 0, scanZ: -99, scanF: 0, ondas: 0, digT: 0, varre: 0, varreZ: -99, luzVarre: 0, bat: -1, somVivo: 0 };
let ultimo = performance.now();
function golpe(forca = 1) {
  if (S.scanZ > -9) S.ondas++;
  S.scanZ = 15; S.scanF = forca; S.varreZ = ZF + 1; S.luzVarre = forca;
}
M.aoGolpe = () => golpe(1);
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  S.tempo += dt;
  M.quadro(dt);
  let k = M.somReal ? M.kick : 0, gr = M.somReal ? M.grave : 0, ag = M.somReal ? M.agudo : 0;
  let fase = M.fase;
  if (TESTE) {
    fase = S.tempo * 124 / 60;
    const f = fase % 1;
    k = Math.exp(-f * 4.5); gr = 0.45 + 0.4 * Math.exp(-f * 3); ag = 0.3 + 0.3 * Math.exp(-((f + 0.5) % 1) * 6);
    const b = Math.floor(fase);
    if (b !== S.bat) { S.bat = b; golpe(1); }
  }
  const vivo = M.somReal || TESTE;
  S.somVivo += ((vivo ? 1 : 0) - S.somVivo) * (1 - Math.exp(-dt * 2));
  S.kick += (k - S.kick) * (1 - Math.exp(-dt * (k > S.kick ? 60 : 9)));
  S.grave += (gr - S.grave) * (1 - Math.exp(-dt * 12));
  S.agudo += (ag - S.agudo) * (1 - Math.exp(-dt * 20));
  // a onda e a varredura do bumbo andam da parede para a entrada
  S.scanZ -= dt * 17; S.scanF *= Math.exp(-dt * 1.6);
  S.varreZ -= dt * 9; S.luzVarre *= Math.exp(-dt * 2.4);
  S.varre += dt * (0.03 + S.kick * 0.5);
  // números: devagar sem música, e mais vivos com ela
  S.digT += dt * (0.18 + S.somVivo * (0.5 + 0.8 * S.grave + 0.4 * S.agudo));
  const cena = CENA.quadro(dt, { ...S, fase, M, vivo });
  const estrelaFonte = M.fonte ? M.fonte('estrelas') : 0;
  fC.set([
    S.tempo, fase, S.kick, S.grave,
    S.agudo, S.somVivo, cena.n, 0,
    S.scanZ, S.scanF * (0.35 + 0.65 * S.somVivo), S.digT, 1,
    (cena.booth ?? 1) * (0.8 + 0.25 * S.grave * S.somVivo + 0.35 * S.kick * S.somVivo), S.varre, S.varreZ, 0.32 + 0.68 * (vivo ? 0.3 + 0.7 * estrelaFonte * (0.5 + S.grave) : 0),
    S.ondas, 0, S.luzVarre * S.somVivo * (cena.varre ?? 1), cena.expo ?? 1,
    ...(cena.pedraCor || [0.3, 0.24, 0.18, 0]),
  ]);
  gpu.queue.writeBuffer(bufC, 0, fC);
  gpu.queue.writeBuffer(bufO, 0, cena.objetos, 0, Math.max(1, cena.n) * 32);
  gpu.queue.writeBuffer(bufFinal, 0, new Float32Array([0, 0, 0, cena.brilho ?? 0.07]));
  escreverGlobal(gpu, bufG, fG, S.tempo, dt, 0);
  if (cena.logoTela) window.__logoTela = cena.logoTela;

  const enc = gpu.createCommandEncoder();
  let r = enc.beginRenderPass({ colorAttachments: [{ view: texCena.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pCena); r.setBindGroup(0, bgCena); r.draw(3); r.end();
  for (const p of passosDesce) {
    r = enc.beginRenderPass({ colorAttachments: [{ view: p.alvo, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    r.setPipeline(pDesce); r.setBindGroup(0, p.bg); r.draw(3); r.end();
  }
  for (const p of passosSobe) {
    r = enc.beginRenderPass({ colorAttachments: [{ view: p.alvo, loadOp: 'load', storeOp: 'store' }] });
    r.setPipeline(pSobe); r.setBindGroup(0, p.bg); r.draw(3); r.end();
  }
  const vTela = contexto.getCurrentTexture().createView();
  r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pFinal); r.setBindGroup(0, bgFinal); r.draw(3); r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { get estado() { return { modo: MODO, semente: SEMENTE, linhas: LIN, kick: +S.kick.toFixed(2), somReal: M.somReal, objetos: CENA.ultimoN ?? 0, tempo: +S.tempo.toFixed(2), ...(CENA.estado ? CENA.estado() : {}) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
