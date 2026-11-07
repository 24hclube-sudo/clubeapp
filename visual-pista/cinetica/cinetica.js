// Cinética: a mesma pista e o mesmo céu da Marca, em outra linguagem. O personagem não é um corpo liso: é escultura feita de muitas peças de inox que se mexem.
// Chapas cortadas, cabos, agulhas e brises. O metal continua pesado, e o som anda de peça em peça.
// ?modo=camadas | relevo | cabos | agulhas | brise   ?olho=1.60   ?msaa=4
import { iniciarGPU, medir, criarFiltroLED, Q, R, RW, RH, GLOBAL_BYTES, escreverGlobal, WGSL_BASE, DOBRA, ESCALA } from '../pista-quente/nucleo.js';
import { criarMaestro } from '../espaco/maestro.js';
import { criarCena, MODOS } from './cenas.js';
import { WGSL_BRILHINHO, WGSL_LOGO, WGSL_CONTRA, forcaContra, estiloLuz, ajusteLogo, pipelineContra, criarBrilhinhos } from '../espaco/brilhinhos.js';

const MODO = MODOS.includes(Q.get('modo')) ? Q.get('modo') : 'camadas';
const MSAA = Q.get('msaa') === '1' ? 1 : 4;
const { gpu, contexto, formato, modulo, adaptador, tela } = await iniciarGPU();
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

async function textura(url, mips) {
  const blob = await (await fetch(url)).blob();
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
const aqui = a => new URL(a, import.meta.url);
const [texMat, META, BIN, ALT] = await Promise.all([
  textura(aqui('../espaco/dados/materiais.png'), true),
  fetch(aqui('dados/placas.json')).then(r => r.json()),
  fetch(aqui('dados/placas.bin')).then(r => r.arrayBuffer()),
  fetch(aqui('dados/alturas.bin')).then(r => r.arrayBuffer()),
]);
const LETREIROS = ['clube', 'pista', 'millos'];
const urlLetreiro = n => aqui('../espaco/dados/letreiro-' + n + '.png');
const texLogo = gpu.createTexture({ size: [2048, 720, LETREIROS.length], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
await Promise.all(LETREIROS.map(async (n, i) => {
  const b = await createImageBitmap(await (await fetch(urlLetreiro(n))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texLogo, origin: [0, 0, i] }, [2048, 720]);
}));
const bufMalhaV = gpu.createBuffer({ size: META.bytesVertices, usage: U.VERTEX | U.COPY_DST });
const bufMalhaI = gpu.createBuffer({ size: BIN.byteLength - META.bytesVertices, usage: U.INDEX | U.COPY_DST });
gpu.queue.writeBuffer(bufMalhaV, 0, BIN, 0, META.bytesVertices);
gpu.queue.writeBuffer(bufMalhaI, 0, BIN, META.bytesVertices);

const WGSL = WGSL_BASE + /* wgsl */`
struct Cena {
  envFase: f32, deriva: f32, voo: f32, halo: f32,
  varre: f32, lavar: f32, grave: f32, kick: f32,
  logo: vec4f,
  logoProf: f32, fatias: f32, luzLogo: f32, energia: f32,
  onda: array<vec4f, 4>,
  letr: vec4f,   // x: mistura da troca; y e z: letreiro atual e o próximo
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
fn longe(uv: vec2f) -> f32 {
  return mix(textureSampleLevel(sdf, amL, uv, i32(C.letr.y), 0.).g, textureSampleLevel(sdf, amL, uv, i32(C.letr.z), 0.).g, C.letr.x) * 512. - 256.;
}
fn perto(uv: vec2f) -> f32 {
  if (C.letr.x > .001) { return longe(uv); }
  return textureSampleLevel(sdf, amL, uv, i32(C.letr.y), 0.).r * 48. - 24.;
}
${WGSL_BRILHINHO}
${WGSL_LOGO}
${WGSL_CONTRA}
const CORTE = 2.63;    // o sinal leva 1 linha a cada 2,63 do painel: é por isso que borda quase horizontal serrilha

fn girar(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
fn ondaEm(x: f32) -> f32 {
  let f = clamp(x, 0., 1.) * 15.;
  let i = u32(f); let j = min(i + 1u, 15u);
  return mix(C.onda[i / 4u][i % 4u], C.onda[j / 4u][j % 4u], fract(f));
}

// ---------- inox espelhado ----------
// O gradiente metal do brand book, nas oito paradas, é o que o metal reflete no horizonte.
fn gradienteMetal(x: f32) -> f32 {
  var P = array<f32, 8>(.015, .19, .41, .52, .64, .70, .75, .84);
  var L = array<f32, 8>(.435, 1., .608, .82, .70, .518, .792, .886);
  let t = fract(x);
  if (t < P[0]) { return mix(L[7], L[0], (t + 1. - P[7]) / (P[0] + 1. - P[7])); }
  for (var i = 0; i < 7; i++) {
    if (t < P[i + 1]) { return mix(L[i], L[i + 1], smoothstep(0., 1., (t - P[i]) / (P[i + 1] - P[i]))); }
  }
  return mix(L[7], L[0], (t - P[7]) / (P[0] + 1. - P[7]));
}
// A sala que o inox reflete é uma grade de painéis de luz. Cada painel aceso escuta uma faixa do som.
fn paineis(uv: vec2f, seed: f32, w: f32, det: f32) -> f32 {
  let c = floor(uv);
  let f = uv - c;
  let h = hash21(c + vec2f(seed * 17.3, seed * 5.1));
  if (h < mix(.44, .6, det)) { return 0.; }
  let e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) - .05;
  let borda = smoothstep(-w, w, e);
  let banda = espectroEm(fract(h * 7.31));
  // o painel não é branco chapado: é uma chapa do gradiente metal da marca, e é por isso que o reflexo parece prata e não janela
  // num corpo, a curva já faz o degradê: o gradiente dentro do painel viraria listra de zebra
  let prata = mix(1., gradienteMetal(f.y * .8 + f.x * .22 + h * 3.1), det);
  return borda * prata * prata * (.45 + .55 * fract(h * 13.7)) * (.36 + 1.5 * banda * banda);
}
// det 1: chapas, com painéis menores em duas camadas. det 0: corpos, só painéis grandes, para o reflexo escorrer inteiro em vez de virar mosaico.
fn ambiente(r: vec3f, rug: f32, pw: f32, det: f32) -> f32 {
  let a = abs(r);
  var uv: vec2f; var sem = 0.;
  if (a.y >= a.x && a.y >= a.z) { uv = r.xz / a.y; sem = select(1., 2., r.y > 0.); }
  else if (a.x >= a.z) { uv = r.zy / a.x; sem = select(3., 4., r.x > 0.); }
  else { uv = r.xy / a.z; sem = select(5., 6., r.z > 0.); }
  let g = uv * mix(vec2f(1.15, 1.7), vec2f(2.1, 3.3), det) + vec2f(.37, C.envFase * .11);
  let w = max(rug, pw * 4.);
  var l = paineis(g, sem, w, det);
  if (det > .5) { l += .55 * paineis(g * vec2f(2.3, 1.7) + vec2f(4.1, -C.envFase * .07), sem + 7., w * 2., det); }
  else { l *= 1.4; }
  // no alto está o céu preto: quase nada a refletir
  let alto = smoothstep(-.1, .85, r.y);
  l *= mix(1., .22, alto);
  let horizonte = gradienteMetal(r.y * .46 + .36 + r.x * .08 + C.envFase * .006) * exp(-r.y * r.y * 3.4);
  let chao = (.018 + horizonte * mix(.46, .17, det)) * mix(1., .18, alto);
  return (chao + l * 1.35) * (.72 + .52 * C.grave);
}
fn metalEspelho(Ve: vec3f, N: vec3f, rug: f32, pw: f32, det: f32) -> f32 {
  let r = reflect(Ve, N);
  let cosV = clamp(abs(dot(Ve, N)), 0., 1.);
  let fres = .68 + .32 * pow(1. - cosV, 5.);
  return fres * ambiente(r, rug, pw, det);
}

struct VI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) q: vec4f, @location(3) d: vec4f, @builtin(vertex_index) i: u32 };
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) ln: vec3f,
  @location(4) @interpolate(flat) h: vec3f,
  @location(5) @interpolate(flat) tm: vec2f,
  @location(6) @interpolate(flat) d: vec4f,
  @location(7) @interpolate(flat) lt: vec3f,
  @location(8) @interpolate(flat) ex: vec3f,
};
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
  o.ex = girar(v.q, vec3f(1, 0, 0));
  return o;
}
// Inox escovado: brilho anisotrópico de Ward, com o risco no sentido do lado mais comprido da peça.
fn inoxLuz(Ve: vec3f, N: vec3f, Tn: vec3f, w: vec3f, ax: f32, ay: f32, risco: f32) -> f32 {
  let Vv = -Ve;
  let B = normalize(cross(N, Tn));
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
    let hb = dot(H, B) + (risco - .5) * .05;
    let hx = dot(H, Tn) / ax; let hy = hb / ay;
    s += exp(-(hx * hx + hy * hy) / (NH * NH)) * sqrt(NL) / (1. + dq * .012);
  }
  return s;
}
@fragment fn fsCaixa(v: VO) -> @location(0) vec4f {
  let an = abs(v.ln);
  var uv = v.lp.xz; var hf = v.h.xz;
  if (an.z > .5) { uv = v.lp.xy; hf = v.h.xy; } else if (an.x > .5) { uv = v.lp.zy; hf = v.h.zy; }
  let t = textureSample(mat, amT, (uv + v.d.xy) / 3.1);
  let tt = textureSample(mat, amT, vec2f(dot(v.lp, v.lt), dot(v.lp, cross(v.ln, v.lt))) / 3.1 + v.d.xy).g;
  let dither = (fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  let Ve = normalize(v.w);
  let N0 = normalize(v.n);
  let pw = length(fwidth(reflect(Ve, N0)));
  // canelado: as caneluras do bloco da marca, no sentido do comprimento do painel, onde o sinal tem resolução de sobra
  let passo = max(v.d.w, .001);
  let ux = v.lp.x / passo;
  let some = 1. - smoothstep(.22, .55, fwidth(ux));
  if (V.px.z > .5 && v.w.z < ZF - .001) { discard; }
  let tom = v.tm.x; let m = v.tm.y;
  let ee = hf - abs(uv);
  let beira = min(ee.x, ee.y);
  var lum = 0.;
  if (m > 6.5) {
    // inox espelhado (7) e canelado (8)
    var N = N0;
    var rug = .11;
    // chapa grande nunca é plana de verdade: uma ondulação bem larga, sem detalhe fino, dá vida ao reflexo
    // lâmina (9) é espelho limpo e emenda com a vizinha: nem ondulação, nem fio de luz na borda
    let lamina = m > 8.5;
    let larga = textureSampleLevel(mat, amT, (uv + v.d.xy) / 9.3, 6.);
    if (!lamina) { N = normalize(N + (v.lt * (larga.g - .5) + cross(v.ln, v.lt) * (larga.r - .5)) * .22); }
    if (lamina) { rug = .03; }
    if (m > 7.5 && m < 8.5 && an.x < .5) {
      let s = (fract(ux) - .5) * 2.;
      let inclina = s / sqrt(max(1.02 - s * s, .02));
      N = normalize(N + v.ex * inclina * .6 * some);
      rug = .04;
    }
    lum = tom * metalEspelho(Ve, N, rug, pw, 1.);
    if (!lamina) { lum += tom * .32 * (1. - smoothstep(0., .006, beira)) * (.5 + .9 * C.grave); }
    // lâmina fechada nunca some no preto: sempre há um pouco de sala no reflexo
    if (lamina) { lum += tom * .1; }
    // agulha (10): a ponta é espelho e o corpo da haste fica apagado, senão o lado das hastes esconde o desenho das pontas
    if (m > 9.5 && an.y < .5) { lum *= .16; }
  } else if (m > 2.5 && m < 3.5) {
    lum = tom;
  } else if (m > .5 && m < 2.5) {
    // inox escovado (1) e polido (2)
    let Tn = normalize(v.lt);
    let polido = m > 1.5;
    let spec = inoxLuz(Ve, N0, Tn, v.w, select(.2, .1, polido), select(.8, .16, polido), tt);
    let r = reflect(Ve, N0);
    let amb = .05 + .2 * smoothstep(.2, -.8, r.y);
    let f0 = .62; let cosV = abs(dot(Ve, N0));
    let fres = f0 + (1. - f0) * pow(1. - cosV, 5.);
    lum = tom * fres * (amb + spec * .5) * (.93 + .14 * tt);
    lum += tom * .1 * (1. - smoothstep(0., .007, beira));
  } else {
    // preto de sombra (0)
    lum = tom * .02;
  }
  // na parede, tudo fica atrás do logo
  if (V.px.z > .5) { lum *= .34; }
  lum += tom * luzAtrasEm(v.w, N0, Ve, 1.);
  return vec4f(vec3f(lum) * G.brilho + dither, 1.);
}
@fragment fn fsBrilho(v: VO) -> @location(0) vec4f {
  let q = v.lp / max(v.h, vec3f(.0001));
  let g = exp(-q.x * q.x * 4.5) * exp(-q.z * q.z * 4.5);
  return vec4f(vec3f(g * v.tm.x * .5) * G.brilho, 1.);
}

// ---------- malhas da agência: figuras e letras ----------
fn riscoEm(x: f32, k: f32) -> f32 {
  let a = x * k; let i = floor(a); let f = fract(a);
  return mix(hash21(vec2f(i, k)), hash21(vec2f(i + 1., k)), f * f * (3. - 2. * f)) - .5;
}
fn riscoReto(x: f32) -> f32 { return riscoEm(x, 23.) * .6 + riscoEm(x, 71.) * .4; }
struct MI { @location(0) p: vec4f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) q: vec4f, @location(4) s: vec4f, @location(5) o: vec4f };
// Janela: o LED é um vão. O que estiver do lado de cá do plano não aparece, senão um pedaço de corpo passaria na frente da parede.
fn foraDaJanela(w: vec3f) -> bool {
  if (V.px.z > .5) { return w.z < ZF - .001; }
  return w.y < HT;
}
struct MO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) n: vec3f, @location(2) ao: f32, @location(3) al: f32,
  @location(4) @interpolate(flat) o: vec4f,
  @location(5) @interpolate(flat) tom: f32,
  @location(6) @interpolate(flat) cima: vec3f,
};
@vertex fn vsMalha(v: MI) -> MO {
  let lp = v.p.xyz * v.s.w;
  let w = v.a.xyz + girar(v.q, lp * v.s.xyz);
  var o: MO;
  o.pos = V.m * vec4f(w, 1.);
  o.w = w;
  o.n = girar(v.q, v.n.xyz / max(v.s.xyz, vec3f(.0001)));
  o.ao = v.p.w;
  o.al = lp.y;
  o.o = v.o;
  o.tom = v.a.w;
  o.cima = girar(v.q, vec3f(0, 1, 0));
  return o;
}
@fragment fn fsMalha(v: MO, @builtin(front_facing) frente: bool) -> @location(0) vec4f {
  let dither = (fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  let Ve = normalize(v.w);
  var N = normalize(v.n);
  if (dot(N, Ve) > 0.) { N = -N; }
  let pw = length(fwidth(reflect(Ve, N)));
  let larga = textureSampleLevel(mat, amT, v.w.xz / 9.3, 6.);
  if (foraDaJanela(v.w)) { discard; }
  // letra (det 1): face plana, com a mesma ondulação larga das chapas
  N = normalize(N + vec3f(larga.g - .5, 0., larga.r - .5) * .05 * v.o.w);
  // onda: o bumbo sobe pelo corpo como uma ondulação em metal líquido. O corpo não se mexe; só o reflexo.
  let onda = ondaEm(v.al) * v.o.y;
  let cc = normalize(v.cima - N * dot(v.cima, N) + vec3f(.0001));
  N = normalize(N + cc * sin(v.al * 54. - G.tempo * 3.) * onda * .16);
  // chapa: inox escovado de verdade. O risco corre no sentido do painel, onde o sinal tem resolução, e estica o reflexo de lado.
  // Só muda com x: risco reto. Ruído nos dois eixos vira papel-alumínio amassado.
  let risco = riscoReto(v.w.x);
  N = normalize(N + vec3f(risco * .13 * v.o.w, 0., 0.));
  var lum = metalEspelho(Ve, N, v.o.x, pw, v.o.w);
  // o espelho pede contraste: o que é médio escurece e o que brilha estoura
  if (v.o.w > .5) { lum = pow(lum, 1.25) * 1.35; }
  // quina que vira para longe do olho pega um fio de luz, para a silhueta nunca sumir no preto
  let rim = pow(1. - clamp(abs(dot(Ve, N)), 0., 1.), 3.2);
  lum += rim * (v.o.z * (.5 + .7 * C.grave));
  let ao = v.ao * v.ao;
  lum *= v.tom * mix(.1, 1., ao);
  lum += v.tom * luzAtrasEm(v.w, N, Ve, 1.);
  // na parede, o corpo fica atrás do logo: mais escuro, para o CLUBE seguir legível
  if (V.px.z > .5) { lum *= .34; }
  return vec4f(vec3f(lum) * G.brilho + dither, 1.);
}

// ---------- cabos de aço: fitas viradas para o olho, com o brilho de fio de Kajiya e Kay ----------
@group(2) @binding(0) var<storage, read> fios: array<vec4f>;
const FIO_N = 280u;
const FIO_R = .0075;
struct CO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) s: f32, @location(2) t: vec3f, @location(3) @interpolate(flat) tom: f32,
};
fn fioEm(i: u32) -> vec3f {
  var p = fios[i].xyz;
  // a vista da parede divide por z: o que está atrás do olho não pode entrar na conta
  if (V.px.z > .5) { p.z = max(p.z, ZF - .05); }
  return p;
}
@vertex fn vsCabo(@builtin(vertex_index) vi: u32, @builtin(instance_index) c: u32) -> CO {
  let j = vi / 2u;
  let s = f32(vi % 2u) * 2. - 1.;
  let w = fioEm(c * FIO_N + j);
  let wa = fioEm(c * FIO_N + max(j, 1u) - 1u);
  let wb = fioEm(c * FIO_N + min(j + 1u, FIO_N - 1u));
  let cl = V.m * vec4f(w, 1.);
  let ca = V.m * vec4f(wa, 1.);
  let cb = V.m * vec4f(wb, 1.);
  let d = (cb.xy / cb.w - ca.xy / ca.w) / V.px.xy;
  let nor = normalize(vec2f(-d.y, d.x) + vec2f(.00001, 0.));
  // a espessura é de verdade, em metros, mas nunca menos que um fio visível no sinal
  let px = max(FIO_R * abs(V.m[0].x) / cl.w / V.px.x, .75 * G.escala);
  var o: CO;
  o.pos = vec4f(cl.xy + nor * s * px * V.px.xy * cl.w, cl.zw);
  o.w = w; o.s = s;
  o.t = normalize(wb - wa + vec3f(0., 0., .0001));
  o.tom = fios[c * FIO_N + j].w;
  return o;
}
@fragment fn fsCabo(v: CO) -> @location(0) vec4f {
  if (foraDaJanela(v.w)) { discard; }
  let dither = (fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  let Ve = normalize(v.w);
  let lado = normalize(cross(v.t, Ve));
  let k = clamp(v.s, -1., 1.);
  let N = normalize(lado * k - Ve * sqrt(max(1. - k * k, 0.)));
  // o que o fio reflete da sala, em média: a seção dele é fina demais para mostrar painel
  var lum = metalEspelho(Ve, N, .3, .3, 0.) * .5;
  // o brilho corre pelo fio onde ele está de través para uma luz. Cada luz escuta uma faixa do som.
  var s = 0.;
  for (var i = 0; i < 7; i++) {
    let zl = (fract(f32(i) / 7. + C.envFase / 34.) - .5) * 34.;
    let d = vec3f(v.w.x * .5, -1.5, zl) - v.w;
    let L = normalize(d);
    let H = normalize(L - Ve);
    let th = dot(v.t, H);
    let forca = .3 + 1.9 * pow(espectroEm(f32(i) / 7. + .06), 2.);
    s += pow(max(1. - th * th, 0.), 900.) * forca;
  }
  lum += s * .95;
  lum *= v.tom;
  lum += v.tom * luzAtrasEm(v.w, N, Ve, .6);
  if (V.px.z > .5) { lum *= .34; }
  return vec4f(vec3f(lum) * G.brilho + dither, 1.);
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
  let h = e.b.z;
  let g = C.energia;   // o que estiver escolhido para as estrelas no app
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

struct TI { @location(0) a: vec4f, @location(1) b: vec4f, @builtin(vertex_index) i: u32 };
struct TO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: f32 };
@vertex fn vsMeteoro(e: TI) -> TO {
  var QQ = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(1, 1), vec2f(0, -1), vec2f(1, 1), vec2f(0, 1));
  let q = QQ[e.i];
  let c0 = V.m * vec4f(e.a.xyz, 1.);
  let c1 = V.m * vec4f(e.b.xyz, 1.);
  let p0 = c0.xy / c0.w / V.px.xy;
  let p1 = c1.xy / c1.w / V.px.xy;
  let dirv = normalize(p1 - p0 + vec2f(.0001));
  let nor = vec2f(-dirv.y, dirv.x);
  let p = mix(p0, p1, q.x) + nor * q.y * e.b.w * G.escala;
  var o: TO;
  o.pos = vec4f(p * V.px.xy, 1e-5, 1.);
  o.q = q; o.l = e.a.w;
  return o;
}
@fragment fn fsMeteoro(i: TO) -> @location(0) vec4f {
  let cauda = pow(i.q.x, 3.2);
  let lado = 1. - smoothstep(.15, 1., abs(i.q.y));
  return vec4f(vec3f(cauda * lado * i.l) * G.brilho, 1.);
}

// Logo: camadas do campo de distância, com borda calculada para o corte de linhas. É o mesmo do Espaço, que não serrilha.
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
  return vec4f(vec3f(brilhoPerto(max(longe(i.uv), 0.)) * C.halo * .8) * G.brilho, 1.);
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
    lum = frenteLogo(d, g, i.uv, i.w, riscoL, C.letr.w, C.lavar, C.varre, C.luzLogo);
  } else {
    lum = ladoLogo(g, i.uv, C.letr.w, C.lavar, C.luzLogo);
  }
  lum = logoEmContraluz(lum, d, i.k);
  return vec4f(vec3f(lum) * G.brilho + dither, cob);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const fC = new Float32Array(40);
const bufC = gpu.createBuffer({ size: fC.byteLength, usage: U.UNIFORM | U.COPY_DST });
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

const POR = 16, MAX_C = 16000, MAX_B = 200, MAX_F = 240;
const dadosC = new Float32Array(MAX_C * POR), dadosB = new Float32Array(MAX_B * POR), dadosF = new Float32Array(MAX_F * POR);
const bufCx = gpu.createBuffer({ size: dadosC.byteLength, usage: U.VERTEX | U.COPY_DST });
const bufBr = gpu.createBuffer({ size: dadosB.byteLength, usage: U.VERTEX | U.COPY_DST });
const bufFi = gpu.createBuffer({ size: dadosF.byteLength, usage: U.VERTEX | U.COPY_DST });
let nC = 0, nB = 0, nF = 0;
const QI = [0, 0, 0, 1];
const desenhos = [];
// Sem criar array a cada caixa: a Instância desenha milhares por quadro.
function caixa(cx, cy, cz, hx, hy, hz, tom = 1, mt = 7, q = QI, ox = 0, oy = 0, a = 0, b = 0) {
  if (nC >= MAX_C) return;
  const i = nC * POR, d = dadosC;
  d[i] = cx; d[i + 1] = cy; d[i + 2] = cz; d[i + 3] = tom;
  d[i + 4] = hx; d[i + 5] = hy; d[i + 6] = hz; d[i + 7] = mt;
  d[i + 8] = q[0]; d[i + 9] = q[1]; d[i + 10] = q[2]; d[i + 11] = q[3];
  d[i + 12] = ox; d[i + 13] = oy; d[i + 14] = a; d[i + 15] = b;
  nC++;
}
function brilho(cx, cy, cz, hx, hz, tom) {
  if (nB >= MAX_B || tom < 0.004) return;
  dadosB.set([cx, cy, cz, tom, hx, 0.001, hz, 0, 0, 0, 0, 1, 0, 0, 0, 0], nB * POR);
  nB++;
}
function malha(e, x, y, z, s, q, { tom = 1, rug = 0.17, onda = 1, fio = 0.16, det = 0, sx = s, sy = s, sz = s } = {}) {
  if (nF >= MAX_F || tom < 0.003) return;
  dadosF.set([x, y, z, tom, q[0], q[1], q[2], q[3], sx, sy, sz, e.escala, rug, onda, fio, det], nF * POR);
  desenhos.push(e);
  nF++;
}
const qEixo = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const m = modulo(WGSL, 'cinetica');
const attrCaixa = { arrayStride: POR * 4, stepMode: 'instance', attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) };
const ms = { count: MSAA };
const prof = grava => ({ format: 'depth32float', depthWriteEnabled: grava, depthCompare: 'greater' });
const soma = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const sobre = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const attrMalha = [
  { arrayStride: 16, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'snorm16x4' }, { shaderLocation: 1, offset: 8, format: 'snorm16x4' }] },
  { arrayStride: POR * 4, stepMode: 'instance', attributes: [2, 3, 4, 5].map((l, i) => ({ shaderLocation: l, offset: i * 16, format: 'float32x4' })) },
];
const brilhinhos = await criarBrilhinhos(gpu, LETREIROS.map(urlLetreiro));
const pContra = await pipelineContra(gpu, m, layout, ms, formato, soma);
const [pCaixa, pBrilho, pMalha, pEstrela, pLogo, pMeteoro, pHalo, pBrilhinho] = await Promise.all([
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsCaixa', targets: [{ format: formato }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsCaixa', buffers: [attrCaixa] }, fragment: { module: m, entryPoint: 'fsBrilho', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsMalha', buffers: attrMalha }, fragment: { module: m, entryPoint: 'fsMalha', targets: [{ format: formato }] }, primitive: { topology: 'triangle-list', cullMode: 'none' } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsEstrela', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module: m, entryPoint: 'fsEstrela', targets: [{ format: formato, blend: soma }] } }),
  // o logo nunca sai: fica por cima de tudo que estiver na parede
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' }, vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsLogo', targets: [{ format: formato, blend: sobre }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: prof(false), vertex: { module: m, entryPoint: 'vsMeteoro', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [0, 1].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module: m, entryPoint: 'fsMeteoro', targets: [{ format: formato, blend: soma }] } }),
  gpu.createRenderPipelineAsync({ layout, multisample: ms, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' }, vertex: { module: m, entryPoint: 'vsLogo' }, fragment: { module: m, entryPoint: 'fsHalo', targets: [{ format: formato, blend: soma }] } }),
  brilhinhos.pipeline(m, layout, ms, formato, soma),
]);
const FIOS = MODO === 'cabos' ? { nc: 150, np: 280 } : null;
const dadosFios = FIOS ? new Float32Array(FIOS.nc * FIOS.np * 4) : null;
const bufFios = FIOS ? gpu.createBuffer({ size: dadosFios.byteLength, usage: U.STORAGE | U.COPY_DST }) : null;
let pCabo = null, bgFios = null;
if (FIOS) {
  const lay2 = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
  bgFios = gpu.createBindGroup({ layout: lay2, entries: [{ binding: 0, resource: { buffer: bufFios } }] });
  pCabo = await gpu.createRenderPipelineAsync({ layout: gpu.createPipelineLayout({ bindGroupLayouts: [lay0, lay1, lay2] }), multisample: ms, depthStencil: prof(true), vertex: { module: m, entryPoint: 'vsCabo' }, fragment: { module: m, entryPoint: 'fsCabo', targets: [{ format: formato }] }, primitive: { topology: 'triangle-strip' } });
}
const filtro = await criarFiltroLED(gpu, modulo, formato);
const texProf = gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
const texCor = MSAA > 1 ? gpu.createTexture({ size: [RW, RH], sampleCount: MSAA, format: formato, usage: T.RENDER_ATTACHMENT }) : null;

const M = criarMaestro();
const INICIO = parseFloat(Q.get('t') || '0');
const CENA = criarCena(MODO, { caixa, brilho, malha, qEixo, qMul, M, R, HT, ZF, XC, META, ALT, INICIO, FIOS, dadosFios });

const nTeto = CENA.estrelasTeto, nParede = CENA.estrelasParede;
const dadosE = new Float32Array((nTeto + nParede) * 8);
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
let proxMeteoro = 2 + Math.random() * 3;
function meteorosQuadro(dt) {
  proxMeteoro -= dt;
  if (proxMeteoro <= 0 && meteoros.length < MAX_M && M.modo('meteoros') !== 'desligado') {
    proxMeteoro = 4 + Math.random() * 8;
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

const LOGO = { largura: 1.92 * 0.86, cx: XC, cy: HT - 0.64, recuo: 0.2, prof: 0.16, fatias: 28 };
const golpeLogo = { x: 0, v: 0, empurrar(f) { this.v += f; }, passo(dt) { const h = dt / 2; for (let i = 0; i < 2; i++) { this.v += (-90 * this.x - 15 * this.v) * h; this.x += this.v * h; } return this.x; } };
let varre = -3, envFase = 0, deriva = 0;
// CLUBE é a casa: fica a maior parte do tempo. Pista Quente e Millos Kaiser entram às vezes, um de cada vez. O mesmo roteiro do Espaço.
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

const contar = medir(adaptador, 'cinetica-' + MODO);
let tempo = 0, ultimo = performance.now(), pedido = null;
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  M.quadro(dt);
  if (M.disparou('faixa', dt, 9) && varre > 3.4) varre = -1.6;
  varre = Math.min(varre + dt * (2.4 / M.duracao), 20);
  if (M.disparou('empurra', dt)) golpeLogo.empurrar(1);
  // reflexo desligado: os painéis param de ouvir as faixas
  const reflexo = M.fonte('reflexo');
  if (M.modo('reflexo') === 'desligado') R.faixas.fill(0);
  envFase += dt * 0.32;
  deriva += dt * 0.12;

  nC = 0; nB = 0; nF = 0; desenhos.length = 0;
  CENA.quadro(dt);
  const nM = meteorosQuadro(dt);
  gpu.queue.writeBuffer(bufCx, 0, dadosC, 0, nC * POR);
  if (nB) gpu.queue.writeBuffer(bufBr, 0, dadosB, 0, nB * POR);
  if (nF) gpu.queue.writeBuffer(bufFi, 0, dadosF, 0, nF * POR);
  if (FIOS) gpu.queue.writeBuffer(bufFios, 0, dadosFios);

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
  brilhinhos.quadro(dt, M, { cx: LOGO.cx, cy: LOGO.cy, z: zLogo, meia: LOGO.largura / 2 * aj.esc, lw: 2048 / 1720, lh: 720 / 1720, letra: L.a, letraB: L.b, mix: L.m });
  fC.set([envFase, CENA.voo ? CENA.voo() : deriva, CENA.voo ? CENA.voo() : 0, halo,
    varre, spot, reflexo, M.kick,
    LOGO.cx, LOGO.cy, zLogo, LOGO.largura / 2 * aj.esc,
    LOGO.prof, LOGO.fatias, luzLogo, M.fonte('estrelas')]);
  const comOnda = M.modo('reflexo') !== 'desligado';
  for (let i = 0; i < 16; i++) fC[16 + i] = comOnda ? M.atraso(i * 0.055) : 0;
  fC[32] = L.m; fC[33] = L.a; fC[34] = L.b; fC[35] = cromo;
  const contra = forcaContra(M);
  fC[36] = contra;
  fC[37] = estiloLuz(M);
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
    if (nC) { r.setPipeline(pCaixa); r.setVertexBuffer(0, bufCx); r.draw(36, nC); }
    if (nF) {
      r.setPipeline(pMalha);
      r.setVertexBuffer(0, bufMalhaV); r.setVertexBuffer(1, bufFi); r.setIndexBuffer(bufMalhaI, 'uint32');
      desenhos.forEach((e, k) => r.drawIndexed(e.n, 1, e.primeiro, e.baseV, k));
    }
    if (FIOS) { r.setPipeline(pCabo); r.setBindGroup(2, bgFios); r.draw(FIOS.np * 2, FIOS.nc); }
    if (ie) { r.setPipeline(pEstrela); r.setVertexBuffer(0, bufE); r.draw(6, ie); }
    if (nM && i === 0) { r.setPipeline(pMeteoro); r.setVertexBuffer(0, bufM); r.draw(6, nM); }
    if (nB) { r.setPipeline(pBrilho); r.setVertexBuffer(0, bufBr); r.draw(36, nB); }
    if (i === 1 && halo > 0) { r.setPipeline(pHalo); r.draw(6, 1); }
    if (contra > 0.004) { r.setPipeline(pContra); r.draw(6, 1); }
    r.setPipeline(pLogo); r.draw(6, LOGO.fatias);
    if (i === 1) brilhinhos.desenhar(r, pBrilhinho);
  });
  r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  // só para conferência: lê o quadro enquanto ele ainda existe
  if (pedido) { const p = pedido; pedido = null; p(tela.toDataURL('image/jpeg', 0.92)); }
  requestAnimationFrame(quadro);
}
window.__painel = {
  R, M,
  foto: () => new Promise(ok => { pedido = ok; }),
  get estado() { return { modo: MODO, ...CENA.estado(), ...M.estado(), caixas: nC, malhas: nF, tempo: +tempo.toFixed(2) }; },
};
requestAnimationFrame(t => { ultimo = t; quadro(t); });
