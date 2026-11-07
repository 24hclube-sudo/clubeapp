// Fumaça virtual: nasce embaixo da parede do DJ, debaixo do booth, sobe a parede e segue pelo teto. É uma camada transparente por cima de qualquer visual do LED.
// É um fluido de verdade em 2D (velocidade, pressão e empuxo), na GPU. Por isso ela enrola e abre, em vez de só deslizar.
// Entra por mesa\saida\flash-pagina.js. Parada, não gasta nada: o desenho só roda enquanto há fumaça no ar.
// Pulsa com o som (item fumacaSom em /reacoes.html e no app, padrão bumbo): acende, sai mais fumaça dos jatos e o corpo dá um empurrão para cima.
// O botão manda "liga" enquanto o dedo está em cima. Sem pedido, para em 1,5 s. Um toque solta pelo menos 2,2 s.
import { REACOES } from '../js/reacoes.js';
import { A, audioVivo } from '../js/audio.js';

const SEM_PEDIDO = 1500, MINIMO = 2200, VIDA = 32000;
const PASSO = 1000 / 60, MAX_QUADRO = 3, MAX_RECUPERA = 20;
const VW = 96, VH = 528, DW = 256, DH = 1408, W = 516, H = 2838;
const JACOBI = 20;

// [início, fim] de cada baforada, em ms do relógio. A saída passa as recentes para a janela nova, e a troca de visual não some com a fumaça.
const emissoes = Array.isArray(window.__fumacaPassado) ? window.__fumacaPassado.map(i => [i[0], i[1]]) : [];
let relogio = 0, ativo = false, motor = null, tela = null;

// 0 a 1. O bumbo já vem em golpes; as outras fontes vão do vale ao pico dos últimos segundos, porque com música cheia o grave fica sempre alto
let pulso = 0, topo = 0.5, vale = 0.2, antes = 0;
function medirPulso() {
  const agora = performance.now();
  const dt = Math.min((agora - antes) / 1000, 0.05);
  antes = agora;
  const teste = window.__fumacaTeste;
  if (teste && teste.pulso !== undefined) { pulso = teste.pulso; return; }
  const fonte = REACOES.led.fumacaSom || 'bumbo';
  let alvo = 0;
  if (fonte !== 'desligado' && audioVivo() && A.rmsDb > REACOES.som.piso) {
    if (fonte === 'bumbo') alvo = Math.min(A.bumbo, 1);
    else {
      const v = fonte === 'medio' ? A.medio : fonte === 'agudo' ? A.agudo : fonte === 'volume' ? (A.grave + A.medio + A.agudo) / 3 : A.grave;
      topo = Math.max(v, topo - dt * 0.06);
      vale = Math.min(v, vale + dt * 0.06);
      alvo = Math.max(0, Math.min(1, (v - vale) / Math.max(topo - vale, 0.18)));
    }
  }
  pulso += (alvo - pulso) * (1 - Math.exp(-dt * (alvo > pulso ? 40 : 6)));
}

function comando(acao) {
  const agora = Date.now();
  const u = emissoes[emissoes.length - 1];
  if (acao === 'liga') {
    if (u && agora <= u[1]) u[1] = Math.max(u[1], agora + SEM_PEDIDO);
    else emissoes.push([agora, agora + SEM_PEDIDO]);
    acordar();
  } else if (u && agora <= u[1]) u[1] = Math.max(u[0] + MINIMO, agora);
}
window.__fumaca = { comando, estado: () => ({ ativo, pronta: !!motor, relogio, pulso: +pulso.toFixed(3) }) };

function acordar() {
  if (!motor) return;
  if (!ativo) {
    ativo = true;
    relogio = emissoes.length ? Math.max(emissoes[0][0], Date.now() - VIDA) : Date.now();
    tela.style.visibility = 'visible';
    requestAnimationFrame(quadro);
  }
  // sempre por cima dos personagens, que têm a mesma camada; os flashes continuam na frente de tudo
  document.documentElement.appendChild(tela);
}

function quadro() {
  medirPulso();
  const agora = Date.now();
  const atraso = agora - relogio;
  // Depois de uma pausa longa da página o tempo não acumula, exceto na recuperação da janela nova.
  const n = Math.min(Math.floor(atraso / PASSO), atraso > 400 ? MAX_RECUPERA : MAX_QUADRO);
  const fim = emissoes.length ? emissoes[emissoes.length - 1][1] : 0;
  motor.avancar(n, passoT => {
    const em = relogio;
    relogio += PASSO;
    return emissoes.some(i => em >= i[0] && em < i[1]) ? 1 : 0;
  });
  motor.desenhar();
  while (emissoes.length && relogio - emissoes[0][1] > VIDA) emissoes.shift();
  if (!emissoes.length && relogio - fim > VIDA) { ativo = false; tela.style.visibility = 'hidden'; return; }
  requestAnimationFrame(quadro);
}

const WGSL_FLUIDO = /* wgsl */`
struct Un { dt: f32, t: f32, emite: f32, r0: f32 };
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var c: texture_2d<f32>;
@group(0) @binding(3) var am: sampler;
@group(0) @binding(4) var sai: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> u: Un;
const TV = vec2f(${VW}., ${VH}.);
// a dobra: acima desta altura da imagem já é o teto
const DOBRA = ${(4988 / 5676).toFixed(6)};

fn acaso(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn ruido(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3. - 2. * f);
  return mix(mix(acaso(i), acaso(i + vec2f(1., 0.)), s.x), mix(acaso(i + vec2f(0., 1.)), acaso(i + vec2f(1., 1.)), s.x), s.y);
}
// os bicos embaixo do booth: seis jatos que oscilam e respiram, nunca uma linha reta
fn fonte(uv: vec2f) -> f32 {
  var f = 0.;
  for (var i = 0; i < 6; i++) {
    let k = f32(i);
    let cx = (k + .5) / 6. + .045 * sin(u.t * (.6 + .11 * k) + k * 2.4);
    let amp = .6 + .4 * sin(u.t * (1.1 + .23 * k) + k * 3.7);
    let dx = (uv.x - cx) / .062;
    f += amp * exp(-dx * dx);
  }
  let alt = (1. - uv.y) / .0125;
  return f * exp(-alt * alt) * u.emite;
}
fn cel(t: texture_2d<f32>, p: vec2i) -> vec4f { return textureLoad(t, clamp(p, vec2i(0), vec2i(TV) - vec2i(1)), 0); }

@compute @workgroup_size(8, 8) fn giro(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return; }
  let w = (cel(a, p + vec2i(1, 0)).y - cel(a, p - vec2i(1, 0)).y - cel(a, p + vec2i(0, 1)).x + cel(a, p - vec2i(0, 1)).x) * .5;
  textureStore(sai, p, vec4f(w, 0., 0., 1.));
}
// b: giro. c: densidade da fumaça
@compute @workgroup_size(8, 8) fn forca(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return; }
  let uv = (vec2f(id.xy) + .5) / TV;
  let v0 = cel(a, p).xy;
  var v = textureSampleLevel(a, am, uv - v0 * u.dt / TV, 0.).xy;
  v *= exp(-u.dt * .5);
  let d = textureSampleLevel(c, am, uv, 0.).r;
  let naParede = smoothstep(DOBRA - .02, DOBRA + .02, uv.y);
  // empuxo: no teto a fumaça já não sobe, só segue andando
  v.y -= (d * mix(30., 52., naParede) + min(d * 8., 1.) * mix(9., 14., naParede)) * u.dt;
  // jato de saída
  v.y -= fonte(uv) * u.dt * 210.;
  // no golpe, o corpo inteiro da fumaça dá um empurrão
  v.y -= min(d * 6., 1.) * u.r0 * u.dt * 34.;
  // mantém os redemoinhos, que a conta tende a alisar
  let cL = abs(cel(b, p - vec2i(1, 0)).x); let cR = abs(cel(b, p + vec2i(1, 0)).x);
  let cT = abs(cel(b, p - vec2i(0, 1)).x); let cB = abs(cel(b, p + vec2i(0, 1)).x);
  var g = vec2f(cR - cL, cB - cT) * .5;
  g = g / (length(g) + .001);
  let w = cel(b, p).x;
  v += vec2f(g.y * w, -g.x * w) * u.dt * 7.;
  // turbulência onde há fumaça, em duas escalas
  let q = vec2f(id.xy);
  let tq = vec2f(u.t * .31, -u.t * .47);
  let n1 = vec2f(ruido(q / 11. + tq + vec2f(0., .5)) - ruido(q / 11. + tq - vec2f(0., .5)), ruido(q / 11. + tq - vec2f(.5, 0.)) - ruido(q / 11. + tq + vec2f(.5, 0.)));
  let n2 = vec2f(ruido(q / 4.5 - tq + vec2f(0., .5)) - ruido(q / 4.5 - tq - vec2f(0., .5)), ruido(q / 4.5 - tq - vec2f(.5, 0.)) - ruido(q / 4.5 - tq + vec2f(.5, 0.)));
  v += (n1 * 300. + n2 * 150.) * u.dt * min(d * 3., 1.) * (1. + .6 * u.r0);
  textureStore(sai, p, vec4f(v, 0., 1.));
}
// as laterais e o chão são parede, e o ar só sai pela ponta do teto. Com o chão aberto, o jato empurra a coluna inteira de ar de uma vez e a fumaça chega ao fim em 2 s
fn velNormal(p: vec2i) -> vec2f {
  var v = cel(a, p).xy;
  if (p.x < 0 || p.x >= i32(TV.x)) { v.x = -v.x; }
  if (p.y >= i32(TV.y)) { v.y = -v.y; }
  return v;
}
@compute @workgroup_size(8, 8) fn diverg(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return; }
  let dv = (velNormal(p + vec2i(1, 0)).x - velNormal(p - vec2i(1, 0)).x + velNormal(p + vec2i(0, 1)).y - velNormal(p - vec2i(0, 1)).y) * .5;
  textureStore(sai, p, vec4f(dv, 0., 0., 1.));
}
fn pres(p: vec2i, centro: f32) -> f32 {
  if (p.y < 0) { return 0.; }
  if (p.x < 0 || p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return centro; }
  return textureLoad(a, p, 0).x;
}
// a: pressão. b: divergência
@compute @workgroup_size(8, 8) fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return; }
  let ce = textureLoad(a, p, 0).x;
  let n = (pres(p + vec2i(1, 0), ce) + pres(p - vec2i(1, 0), ce) + pres(p + vec2i(0, 1), ce) + pres(p - vec2i(0, 1), ce) - textureLoad(b, p, 0).x) * .25;
  textureStore(sai, p, vec4f(n, 0., 0., 1.));
}
// a: velocidade. b: pressão
fn presB(p: vec2i, centro: f32) -> f32 {
  if (p.y < 0) { return 0.; }
  if (p.x < 0 || p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return centro; }
  return textureLoad(b, p, 0).x;
}
@compute @workgroup_size(8, 8) fn gradiente(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (p.x >= i32(TV.x) || p.y >= i32(TV.y)) { return; }
  let ce = textureLoad(b, p, 0).x;
  var v = textureLoad(a, p, 0).xy - vec2f(presB(p + vec2i(1, 0), ce) - presB(p - vec2i(1, 0), ce), presB(p + vec2i(0, 1), ce) - presB(p - vec2i(0, 1), ce)) * .5;
  if (p.x == 0 || p.x == i32(TV.x) - 1) { v.x = 0.; }
  if (p.y == i32(TV.y) - 1) { v.y = min(v.y, 0.); }
  textureStore(sai, p, vec4f(v, 0., 1.));
}
// a: velocidade. c: densidade. Em resolução maior que a do movimento: é daí que vem o desenho fino
@compute @workgroup_size(8, 8) fn leva(@builtin(global_invocation_id) id: vec3u) {
  let dims = vec2f(textureDimensions(sai));
  if (f32(id.x) >= dims.x || f32(id.y) >= dims.y) { return; }
  let uv = (vec2f(id.xy) + .5) / dims;
  let v = textureSampleLevel(a, am, uv, 0.).xy;
  var d = textureSampleLevel(c, am, uv - v * u.dt / TV, 0.).r;
  // some mais rápido quanto mais rala
  d *= exp(-u.dt * (.075 + .11 / (d * 5. + 1.)));
  d = min(d + fonte(uv) * u.dt * 2.4, 2.2);
  textureStore(sai, vec2i(id.xy), vec4f(d, 0., 0., 1.));
}
`;

const WGSL_TELA = /* wgsl */`
struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S; o.pos = vec4f(q[i], 0., 1.); o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5); return o;
}
@group(0) @binding(0) var dens: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
@group(0) @binding(2) var<uniform> T: vec4f;
fn acaso(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn ruido(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3. - 2. * f);
  return mix(mix(acaso(i), acaso(i + vec2f(1., 0.)), s.x), mix(acaso(i + vec2f(0., 1.)), acaso(i + vec2f(1., 1.)), s.x), s.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var s = 0.; var k = .5;
  for (var i = 0; i < 4; i++) { s += ruido(p) * k; p = p * 2.03 + vec2f(13.1, 7.7); k *= .5; }
  return s / .9375;
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  // pixels do painel, para o desenho ter o mesmo tamanho em qualquer direção
  let px = i.uv * vec2f(1032., 5676.);
  let t = T.x;
  // desenho fino que anda junto, deforma a borda e quebra a massa em fiapos
  let fl = vec2f(0., t * 34.);
  let w = vec2f(fbm((px + fl) / 150.), fbm((px + fl) / 150. + vec2f(5.2, 1.3))) - .5;
  let uv = i.uv + w * vec2f(46. / 1032., 46. / 5676.);
  let d0 = textureSampleLevel(dens, am, uv, 0.).r;
  if (d0 < .002) { return vec4f(0.); }
  let fino = fbm((px + fl * 1.5 + w * 90.) / 58.);
  let fios = smoothstep(.34, .72, fino);
  let d = d0 * (.4 + 1.25 * fios);
  // a luz vem de baixo, do booth: cada ponto recebe o que a fumaça abaixo dele deixa passar
  var sombra = 0.;
  for (var k = 1; k <= 7; k++) {
    sombra += textureSampleLevel(dens, am, uv + vec2f(0., f32(k) * f32(k) * 7. / 5676.), 0.).r;
  }
  let passa = exp(-sombra * .34);
  // e enfraquece conforme se afasta da parede
  let longe = exp(-(1. - i.uv.y) / .5);
  let lum = (.16 + (.3 + .9 * longe) * passa) * (.7 + .6 * fios) * (.8 + .85 * T.y);
  let al = 1. - exp(-d * 2.1);
  // grão fino e ponto a ponto: sem isso o degradê marca faixas no LED
  let g = acaso(i.pos.xy + vec2f(fract(t * 17.) * 91., fract(t * 23.) * 57.)) - .5;
  let cor = .94 * (1. - exp(-lum * 1.3)) * al + g * (.012 * al + 1.5 / 255.);
  // só tampa em parte o que está atrás: a fumaça acesa soma luz, e o visual continua aparecendo
  return vec4f(max(cor, 0.) * .985, max(cor, 0.), max(cor, 0.) * 1.02, al * (.55 + .15 * T.y));
}
`;

async function criarMotor() {
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const gpu = await adaptador.requestDevice();
  gpu.addEventListener('uncapturederror', e => console.error('fumaca: ' + e.error.message));
  const U = GPUTextureUsage;
  const tx = (w, h) => gpu.createTexture({ size: [w, h], format: 'rgba16float', usage: U.TEXTURE_BINDING | U.STORAGE_BINDING });
  const V = [tx(VW, VH), tx(VW, VH)], P = [tx(VW, VH), tx(VW, VH)], D = [tx(DW, DH), tx(DW, DH)];
  const G = tx(VW, VH), Di = tx(VW, VH), nada = tx(1, 1);
  const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const bufU = gpu.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgl = gpu.createBindGroupLayout({ entries: [
    ...[0, 1, 2].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } })),
    { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: {} },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: {} },
  ] });
  const m = gpu.createShaderModule({ code: WGSL_FLUIDO });
  const layout = gpu.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const pipe = ep => gpu.createComputePipelineAsync({ layout, compute: { module: m, entryPoint: ep } });
  const [pGiro, pForca, pDiv, pJac, pGrad, pLeva] = await Promise.all(['giro', 'forca', 'diverg', 'jacobi', 'gradiente', 'leva'].map(pipe));
  const grupo = (a, b, c, o) => gpu.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: a.createView() }, { binding: 1, resource: b.createView() }, { binding: 2, resource: c.createView() },
    { binding: 3, resource: am }, { binding: 4, resource: o.createView() }, { binding: 5, resource: { buffer: bufU } },
  ] });
  // a densidade se reveza entre duas texturas; o resto sempre volta ao mesmo lugar
  const gGiro = grupo(V[0], nada, nada, G);
  const gForca = [grupo(V[0], G, D[0], V[1]), grupo(V[0], G, D[1], V[1])];
  const gDiv = grupo(V[1], nada, nada, Di);
  const gJac = [grupo(P[0], Di, nada, P[1]), grupo(P[1], Di, nada, P[0])];
  const gGrad = grupo(V[1], P[0], nada, V[0]);
  const gLeva = [grupo(V[0], nada, D[0], D[1]), grupo(V[0], nada, D[1], D[0])];
  let qualD = 0, t = 0;
  const grupos = n => Math.ceil(n / 8);
  const un = new Float32Array(4);

  tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  tela.style.cssText = 'position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:100%!important;margin:0!important;display:block!important;pointer-events:none;z-index:2147483646;visibility:hidden;';
  document.documentElement.appendChild(tela);
  const contexto = tela.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device: gpu, format: formato, alphaMode: 'premultiplied' });
  const mt = gpu.createShaderModule({ code: WGSL_TELA });
  const pTela = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mt, entryPoint: 'vs' }, fragment: { module: mt, entryPoint: 'fs', targets: [{ format: formato }] } });
  const bufT = gpu.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const gTela = D.map(d => gpu.createBindGroup({ layout: pTela.getBindGroupLayout(0), entries: [{ binding: 0, resource: d.createView() }, { binding: 1, resource: am }, { binding: 2, resource: { buffer: bufT } }] }));

  return {
    avancar(n, emiteDoPasso) {
      for (let i = 0; i < n; i++) {
        un[0] = PASSO / 1000; un[1] = t; un[2] = emiteDoPasso() * (1 + 0.6 * pulso); un[3] = pulso;
        t += PASSO / 1000;
        gpu.queue.writeBuffer(bufU, 0, un);
        const enc = gpu.createCommandEncoder();
        const c = enc.beginComputePass();
        const roda = (p, g, w, h) => { c.setPipeline(p); c.setBindGroup(0, g); c.dispatchWorkgroups(grupos(w), grupos(h)); };
        roda(pGiro, gGiro, VW, VH);
        roda(pForca, gForca[qualD], VW, VH);
        roda(pDiv, gDiv, VW, VH);
        for (let k = 0; k < JACOBI; k++) roda(pJac, gJac[k % 2], VW, VH);
        roda(pGrad, gGrad, VW, VH);
        roda(pLeva, gLeva[qualD], DW, DH);
        c.end();
        gpu.queue.submit([enc.finish()]);
        qualD = 1 - qualD;
      }
    },
    desenhar() {
      gpu.queue.writeBuffer(bufT, 0, new Float32Array([t % 1000, pulso, 0, 0]));
      const enc = gpu.createCommandEncoder();
      const r = enc.beginRenderPass({ colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      r.setPipeline(pTela); r.setBindGroup(0, gTela[qualD]); r.draw(3); r.end();
      gpu.queue.submit([enc.finish()]);
    },
  };
}

// Prepara logo depois de a página abrir, para o primeiro toque não atrasar. O visual tem prioridade: espera ele subir.
setTimeout(() => {
  criarMotor().then(mo => { motor = mo; if (emissoes.length) acordar(); }, e => console.error('fumaca: ' + e.message));
}, 1200);
