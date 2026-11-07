// Logo em zinco: CLUBE, Pista Quente e Millos Kaiser em metal zincado, com o furta-cor do banho e o cristal do zinco.
// Letra de verdade: cada ponto do painel é um raio de visão do olho a 1,60 m, que bate numa chapa extrudada. O CLUBE fica na parede; os outros passam no teto, até o fim do painel.
// No teto, as letras são compridas no painel de propósito: de pé, embaixo delas, a perspectiva encurta e elas ficam na proporção certa.
// Bumbo: o reflexo corre pelo metal. Grave: o furta-cor anda. Sem música, só um brilho lento. ?letreiro não existe aqui: os três sempre passam.
import { iniciarGPU, medir, criarFiltroLED, escreverGlobal, Q, GLOBAL_BYTES, WGSL_BASE } from '../pista-quente/nucleo.js';
import { criarMaestro } from '../espaco/maestro.js';

const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;
const HT = 0.7532, ZF = 4.39, PASSO = 1.92 / 1032;
const LW = 2048 / 1720, LH = 720 / 1720;
// O teto: chapas num plano um pouco acima do LED, para a espessura aparecer. Cabe em 3 lugares por painel.
const Y_FRENTE = HT + 0.18, PROF_T = 0.11, MEIA_T = 1.02 * Y_FRENTE / HT / LW;
const VAGA = 3.05 * Y_FRENTE / HT, Z_MAX = ZF * Y_FRENTE / HT;
const DESL = (VAGA * Math.ceil(Z_MAX / VAGA) - Z_MAX).toFixed(5);
// A parede: a mesma medida do logo dos visuais em pé.
const MEIA_P = 1.92 * 0.86 / 2, CY_P = HT - 0.64, Z_P = ZF - 0.2, PROF_P = 0.16;

const NOMES = ['clube', 'pista', 'millos'];
const texLogo = gpu.createTexture({ size: [2048, 720, NOMES.length], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
await Promise.all(NOMES.map(async (n, i) => {
  const b = await createImageBitmap(await (await fetch(new URL(`../espaco/dados/letreiro-${n}.png`, import.meta.url))).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texLogo, origin: [0, 0, i] }, [2048, 720]);
}));

const WGSL = WGSL_BASE + /* wgsl */`
struct Cena { anda: f32, kick: f32, grave: f32, varre: f32, film: f32, agudo: f32, luz: f32, somVivo: f32 };
@group(0) @binding(1) var<uniform> C: Cena;
@group(0) @binding(2) var sdf: texture_2d_array<f32>;
@group(0) @binding(3) var am: sampler;
const HT = ${HT}; const ZF = ${ZF}; const PASSO = ${PASSO.toFixed(8)};
const Y_FRENTE = ${Y_FRENTE.toFixed(5)}; const PROF_T = ${PROF_T}; const VAGA = ${VAGA.toFixed(5)}; const Z_MAX = ${Z_MAX.toFixed(5)};
const LARG_T = ${(2 * MEIA_T * LW).toFixed(5)};
const MEIA_P = ${MEIA_P.toFixed(5)}; const CY_P = ${CY_P.toFixed(5)}; const Z_P = ${Z_P.toFixed(5)}; const PROF_P = ${PROF_P};
const LW = ${LW.toFixed(6)}; const LH = ${LH.toFixed(6)};

fn longe(uv: vec2f, c: i32) -> f32 { return textureSampleLevel(sdf, am, uv, c, 0.).g * 512. - 256.; }
fn perto(uv: vec2f, c: i32) -> f32 { return textureSampleLevel(sdf, am, uv, c, 0.).r * 48. - 24.; }

// em que chapa do teto cai este ponto do plano: uv da letra e qual letreiro
fn noTeto(p: vec2f) -> vec3f {
  let z = p.y + C.anda * VAGA + ${DESL};
  let k = floor(z / VAGA);
  let c = ((i32(k) % 3) + 3) % 3;
  return vec3f(p.x / LARG_T + .5, fract(z / VAGA), f32(c));
}
fn naParede(p: vec2f) -> vec2f {
  return vec2f(p.x / (2. * MEIA_P * LW) + .5, .5 - (p.y - CY_P) / (2. * MEIA_P * LH));
}
fn fora(uv: vec2f) -> bool { return uv.x < .002 || uv.x > .998 || uv.y < .002 || uv.y > .998; }

fn gira(p: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(c * p.x - s * p.y, s * p.x + c * p.y); }
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var s = 0.; var k = .5;
  for (var i = 0; i < 5; i++) { s += ruido2(p) * k; p = gira(p, .5) * 2.03 + vec2f(13.1, 7.7); k *= .5; }
  return s / .96875;
}
// O cristal do zinco: células irregulares, cada uma com uma inclinação própria. É o que dá o desenho de chapa galvanizada.
fn cristal(p: vec2f) -> vec3f {
  let i = floor(p); let f = fract(p);
  var melhor = 9.; var id = vec2f(0.);
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let g = vec2f(f32(x), f32(y));
    let o = vec2f(hash21(i + g), hash21(i + g + vec2f(17., 3.)));
    let d = length(g + o - f);
    if (d < melhor) { melhor = d; id = i + g; }
  } }
  return vec3f(hash21(id + vec2f(5., 9.)) - .5, hash21(id + vec2f(31., 2.)) - .5, hash21(id));
}
// O estúdio que o metal reflete: fundo escuro, faixas largas, e a varredura do bumbo.
fn estudio(r: vec3f) -> f32 {
  let h = r.xz / max(abs(r.y), .14);
  let a = h.y * .5 + C.varre;
  let b = abs(h.x) * .55 - C.varre * .35;
  var l = .15 + .1 * sin(a * .9 + 1.) + .05 * sin(b * 1.4);
  l += 1.25 * pow(.5 + .5 * sin(a * 1.6), 5.);
  l += .42 * pow(.5 + .5 * sin(b * 2.1 + 1.2), 6.);
  l += .16 * pow(.5 + .5 * sin(a * 5.1 + b * 2.), 10.);
  l *= C.luz;
  // o golpe: uma faixa quente, que atravessa rápido
  let g = fract(C.kick * .0 + h.y * .12 - C.varre * 1.6) - .5;
  l += C.kick * 1.5 * exp(-g * g * 40.);
  return l;
}
// O banho: uma película fina que muda de cor com a espessura e o ângulo. Claro, levemente amarelo, com rosa, verde e azul onde a película varia.
fn zinco(w: vec3f, plano: vec2f, N0: vec3f, v: vec3f, sombra: f32) -> vec3f {
  let c = cristal(plano * 7.5 + (vec2f(fbm(plano * 3.), fbm(plano * 3. + vec2f(9., 4.))) - .5) * .9);
  var N = normalize(N0 + vec3f(c.x, 0., c.y) * .1 * step(.001, abs(N0.y)) + vec3f(c.x, c.y, 0.) * .1 * step(.001, abs(N0.z)));
  let ndv = clamp(-dot(v, N), 0., 1.);
  let r = reflect(v, N);
  let esp = estudio(r);
  let t = .42 + .85 * fbm(plano * .95 + vec2f(C.film * .1, -C.film * .06)) + .35 * sin(plano.y * 1.1 + plano.x * .7 + C.film * .25) + .025 * (c.z - .5);
  let fase = t * (1.4 + (1. - ndv) * .9) + C.film * .03;
  let irid = cos(6.2832 * (fase * vec3f(1., 1.16, 1.34) + vec3f(0., .1, .27)));
  // só um quarto da força cabe: mais que isso vira arco-íris de brinquedo
  let base = vec3f(.92, .91, .85);
  let cor = base * (1. + irid * vec3f(.13, .1, .16));
  let fres = pow(1. - ndv, 4.);
  // grão fino, que disfarça a grade do LED
  let grao = 1. + (hash21(plano * 411.) - .5) * .05;
  // cada cristal tem o seu brilho: é o desenho que se vê numa chapa zincada
  return cor * (esp * (.82 + .3 * c.z) * grao + .05 + fres * .34) * sombra;
}
fn estrelas(px: vec2f) -> f32 {
  let g = px / 22.;
  let i = floor(g);
  let h = hash21(i + vec2f(3., 91.));
  if (h < .955) { return 0.; }
  let o = vec2f(hash21(i), hash21(i + vec2f(7., 7.))) * .7 + .15;
  let d = length((fract(g) - o) * 22.);
  return exp(-d * d / 2.2) * (h - .955) * 18. * (.14 + .86 * C.somVivo * (.35 + C.grave));
}

@fragment fn fs(i: S) -> @location(0) vec4f {
  let px = i.uv * PAINEL;
  var w = vec3f((i.uv.x - .5) * 1.92, HT, ZF - (DOBRA - px.y) * PASSO);
  if (px.y >= DOBRA) { w = vec3f((i.uv.x - .5) * 1.92, HT - (px.y - DOBRA) * PASSO, ZF); }
  let v = normalize(w);
  var cor = vec3f(0.);
  var halo = 0.;

  // ---------- teto: chapas extrudadas, olhadas de baixo ----------
  let sobe = v.y > .004;
  let yv = max(v.y, .004);
  let pF = v.xz * (Y_FRENTE / yv);
  let tF = noTeto(pF);
  let cT = i32(tF.z);
  let dF = longe(tF.xy, cT);
  let aa = max(fwidth(dF), .4);
  var pegou = false;
  if (sobe && pF.y < Z_MAX && !fora(tF.xy)) {
    halo = exp(-max(dF, 0.) / 60.);
    if (dF < aa * 1.5) {
      // a frente da chapa
      let e = 2.5 / 2048.;
      let ev = 2.5 / 720.;
      let n = perto(tF.xy, cT);
      let gx = perto(tF.xy + vec2f(e, 0.), cT) - perto(tF.xy - vec2f(e, 0.), cT);
      let gz = perto(tF.xy + vec2f(0., ev), cT) - perto(tF.xy - vec2f(0., ev), cT);
      let e2 = 16. / 2048.;
      let ev2 = 16. / 720.;
      let gxL = longe(tF.xy + vec2f(e2, 0.), cT) - longe(tF.xy - vec2f(e2, 0.), cT);
      let gzL = longe(tF.xy + vec2f(0., ev2), cT) - longe(tF.xy - vec2f(0., ev2), cT);
      let bis = (1. - smoothstep(-16., -1., n));
      let cheio = vec2f(gx, gz) * .32 * (1. - bis * 0.) * bis * .9 * 0. + normalize(vec2f(gx, gz) + vec2f(.0001)) * bis * 1.15 + vec2f(gxL, gzL) * .02;
      let N = normalize(vec3f(cheio.x, -1., cheio.y));
      let cob = 1. - smoothstep(-aa, aa, dF);
      cor = zinco(v * (Y_FRENTE / yv), pF, N, v, 1.) * cob;
      pegou = cob > .995;
    }
    // os lados: passos para dentro do plano, do mais perto para o mais fundo
    if (!pegou) {
      var dep = 0.; var achou = false; var gs = vec2f(0.); var pS = pF;
      for (var k = 1; k <= 18 && dF < 110.; k++) {
        let y = Y_FRENTE + f32(k) / 18. * PROF_T;
        let p = v.xz * (y / yv);
        let t = noTeto(p);
        if (fora(t.xy) || p.y > Z_MAX) { continue; }
        if (longe(t.xy, i32(t.z)) < 0.) {
          achou = true; dep = f32(k) / 18.; pS = p;
          let e = 5. / 2048.; let ev = 5. / 720.;
          gs = vec2f(longe(t.xy + vec2f(e, 0.), i32(t.z)) - longe(t.xy - vec2f(e, 0.), i32(t.z)), longe(t.xy + vec2f(0., ev), i32(t.z)) - longe(t.xy - vec2f(0., ev), i32(t.z)));
          break;
        }
      }
      if (achou) {
        let lado = normalize(vec3f(gs.x, 0., gs.y) + vec3f(0., -.05, 0.));
        let cob = smoothstep(-aa, aa, dF);
        cor += zinco(v * ((Y_FRENTE + dep * PROF_T) / yv), pS + vec2f(dep * 3., 0.), lado, v, .5 * exp(-dep * 1.6)) * cob * .9;
        pegou = true;
      }
    }
  }

  // ---------- parede: o CLUBE, sempre ----------
  if (v.z > .1) {
    let tt = Z_P / v.z;
    let pP = v.xy * tt;
    let uvP = naParede(pP);
    if (!fora(uvP)) {
      let dP = longe(uvP, 0);
      let aaP = max(dP * 0. + 1.2, .6);
      halo = max(halo, exp(-max(dP, 0.) / 48.));
      if (dP < aaP * 1.5) {
        let e = 2.5 / 2048.; let ev = 2.5 / 720.;
        let n = perto(uvP, 0);
        let gx = perto(uvP + vec2f(e, 0.), 0) - perto(uvP - vec2f(e, 0.), 0);
        let gy = perto(uvP + vec2f(0., ev), 0) - perto(uvP - vec2f(0., ev), 0);
        let e2 = 18. / 2048.; let ev2 = 18. / 720.;
        let gxL = longe(uvP + vec2f(e2, 0.), 0) - longe(uvP - vec2f(e2, 0.), 0);
        let gyL = longe(uvP + vec2f(0., ev2), 0) - longe(uvP - vec2f(0., ev2), 0);
        let bis = 1. - smoothstep(-14., -1., n);
        let cheio = normalize(vec2f(gx, gy) + vec2f(.0001)) * bis * 1.15 + vec2f(gxL, gyL) * .02;
        let N = normalize(vec3f(cheio.x, -cheio.y, -1.));
        let cob = 1. - smoothstep(-aaP, aaP, dP);
        cor = mix(cor, zinco(v * tt, pP * 1.6, N, v, 1.), cob);
        pegou = pegou || cob > .5;
      } else {
        // espessura do logo da parede: atrás da frente, em passos
        for (var k = 1; k <= 16 && dP < 70.; k++) {
          let z = Z_P + f32(k) / 16. * PROF_P;
          let u = naParede(v.xy * (z / v.z));
          if (!fora(u) && longe(u, 0) < 0.) {
            let dep = f32(k) / 16.;
            let e = 5. / 2048.; let ev = 5. / 720.;
            let g = vec2f(longe(u + vec2f(e, 0.), 0) - longe(u - vec2f(e, 0.), 0), longe(u + vec2f(0., ev), 0) - longe(u - vec2f(0., ev), 0));
            cor = zinco(v * (z / v.z), u * 7., normalize(vec3f(g.x, -g.y, 0.) + vec3f(0., 0., -.05)), v, .5 * exp(-dep * 1.4));
            pegou = true;
            break;
          }
        }
      }
    }
  }

  // ---------- fundo: preto, estrelas e a luz que o banho solta em volta das letras ----------
  if (!pegou) {
    let tinge = vec3f(.82, .86, 1.);
    cor += (estrelas(px) * vec3f(1.) + tinge * halo * halo * (.018 + .32 * C.kick + .06 * C.grave * C.somVivo));
  }
  // meio ponto de ruído: sem isso, o degradê marca faixas no LED
  let d = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5;
  let sai = 1. - exp(-cor * 1.25);
  return vec4f(max(sai * G.brilho + d / 255., vec3f(0.)), 1.);
}
`;

const mod = modulo(WGSL, 'zinco');
const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const bufC = gpu.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
const fC = new Float32Array(8);
const pipe = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mod, entryPoint: 'vsTela' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: formato }] } });
const filtro = await criarFiltroLED(gpu, modulo, formato);
const bg = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } },
  { binding: 1, resource: { buffer: bufC } },
  { binding: 2, resource: texLogo.createView({ dimension: '2d-array' }) },
  { binding: 3, resource: gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }) },
] });

const M = criarMaestro();
const contar = medir(adaptador, 'zinco');
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let tempo = 0, ultimo = performance.now(), varre = 0, film = 0, kick = 0;
const TESTE = Q.has('simsom');
function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  M.quadro(dt);
  let k = M.somReal ? M.kick : 0, gr = M.somReal ? M.grave : 0;
  if (TESTE) { const f = (tempo * 124 / 60) % 1; k = Math.exp(-f * 4.5); gr = 0.45 + 0.4 * Math.exp(-f * 3); }
  kick += (k - kick) * (1 - Math.exp(-dt * (k > kick ? 60 : 9)));
  // o reflexo anda devagar sozinho, e dá um passo em cada bumbo
  varre += dt * (0.035 + kick * 0.75);
  film += dt * (0.1 + gr * 1.1);
  // de 8 em 8 compassos, os letreiros andam uma vaga, com ease, em 2 compassos. Fora disso, um fio de movimento
  const b = TESTE ? tempo * 124 / 60 : M.fase;
  const bloco = Math.floor(b / 32), dentro = (b % 32) / 32;
  const anda = bloco + easeInOut(Math.min(1, Math.max(0, (dentro - 0.75) / 0.25))) + dentro * 0.04;
  fC.set([anda, kick, gr, varre, film, 0, 0.95 + gr * 0.35, (M.somReal || TESTE) ? 1 : 0]);
  gpu.queue.writeBuffer(bufC, 0, fC);
  escreverGlobal(gpu, bufG, fG, tempo, dt, 0);
  window.__logoTela = { cx: 0, cy: CY_P, z: Z_P, meia: MEIA_P, a: 0, b: 0, m: 0, prof: PROF_P };

  const enc = gpu.createCommandEncoder();
  const vTela = contexto.getCurrentTexture().createView();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pipe); r.setBindGroup(0, bg); r.draw(3); r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { get estado() { return { kick: +kick.toFixed(2), varre: +varre.toFixed(2), somReal: M.somReal, tempo: +tempo.toFixed(2) }; } };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
