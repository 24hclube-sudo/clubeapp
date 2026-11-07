// Teto de concreto: um botão do app (item teto) fecha e abre o céu do LED com placas de cimento queimado, em qualquer visual.
// As placas vêm nos dois eixos, em xadrez: umas pelas laterais (X) e outras pelas pontas do teto (Y do painel, Z no mundo).
// Fecham de fora para dentro, como um diafragma: cada placa corre por cima das que já assentaram e desce no vão. Abrir é o mesmo filme ao contrário.
// É uma camada transparente só no teto, as 4988 primeiras das 5676 linhas, vista do olho da foto 07 (ceu\ceu.js). Aberto, não desenha e não gasta GPU.
import { REACOES } from '../js/reacoes.js';
import { A, audioVivo } from '../js/audio.js';

const TESTE = window.__tetoTeste || null;
const Q = new URLSearchParams(location.search);
const ESC = Math.min(0.75, parseFloat(Q.get('escala') || (Q.has('saida') ? '1' : '0.5')));
const LARG = 1032, DOBRA = 4988;
const W = Math.round(LARG * ESC), H = Math.round(DOBRA * ESC);
const MSAA = 4;

// ---------- o espaço: mesmas medidas do Céu 3D ----------
const HT = 1.3532, ZF = 4.39, PASSO = 1.92 / LARG, XC = -1.015 + 0.96, Z_PERTO = -5.02;
const COLS = 3, FILAS = 7, LP = 0.82, CP = (ZF - Z_PERTO) / FILAS, ESP = 0.11;
// Altura em que a placa corre. Cada eixo tem o seu nível, então uma placa de X nunca bate numa de Y.
const FOLGA_X = 0.26, FOLGA_Y = 0.5;
const CENTRO = (FILAS - 1) / 2;
const sorte = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const inOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// ---------- o filme: t em segundos, de 0 (aberto) a FIM (fechado) ----------
const placas = [];
for (let f = 0; f < FILAS; f++) {
  for (let c = 0; c < COLS; c++) {
    const lc = c - (COLS - 1) / 2, lf = f - CENTRO;
    const noX = (c + f) % 2 === 0;
    const cx = XC + lc * LP, cz = Z_PERTO + (f + 0.5) * CP;
    // a placa do meio escolhe o lado em que entra, alternando por fila
    const lado = lc !== 0 ? Math.sign(lc) : (f % 4 === 1 ? -1 : 1);
    // pontos de partida fora da janela, mesmo com a perspectiva da altura em que correm
    const x0 = noX ? XC + lado * 2.0 : cx;
    const z0 = noX ? cz : (lf < 0 || (lf === 0 && c === 0) ? Z_PERTO - 3 : ZF + 3);
    const dist = Math.hypot(x0 - cx, z0 - cz);
    // de fora para dentro: as pontas do teto, depois as bordas, por último o miolo
    const perto = Math.max(Math.abs(lc) * 0.6, Math.abs(lf) / CENTRO);
    placas.push({ c, cx, cz, x0, z0, folga: noX ? FOLGA_X : FOLGA_Y, ox: sorte(0, 3), oy: sorte(0, 3), tom: sorte(0.86, 1.06), perto, lc, corre: 0.75 + dist * 0.13, desce: 0.38, t0: 0, j: 0, chegou: false });
  }
}
[...placas].sort((a, b) => b.perto - a.perto || Math.abs(b.lc) - Math.abs(a.lc)).forEach((p, i) => { p.t0 = i * 0.2; });
const FIM = Math.max(...placas.map(p => p.t0 + p.corre + p.desce)) + 0.02;

let t = 0, motor = null, abrindo = false, falhou = false, rodando = false, viuFechar = false, escondeuCena = false;
let idade = 10, bumboAntes = 0, antesGolpe = 0, ultimo = 0, tempo = 0;
const querFechado = () => (TESTE && TESTE.estado ? TESTE.estado === 'fechado' : REACOES.led.teto === 'fechado');

const NASCEU = performance.now();
let tela = null;
function criarTela() {
  tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  // abaixo dos personagens, da fumaça e do flash: esses continuam na frente do concreto
  tela.style.cssText = `position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:${(DOBRA / 5676 * 100).toFixed(4)}%!important;margin:0!important;display:block!important;pointer-events:none;z-index:2147483640;visibility:hidden;`;
  document.documentElement.appendChild(tela);
}

function vigiar() {
  const quer = querFechado();
  if (quer && !viuFechar) {
    viuFechar = true;
    // a página abriu com o teto fechado (troca de visual): já nasce fechado, sem repetir o filme.
    // Enquanto a GPU abre, o teto fica cinza em vez de mostrar o céu por um instante.
    if (performance.now() - NASCEU < 3500) {
      t = FIM;
      for (const p of placas) p.chegou = true;
      if (!tela) criarTela();
      tela.style.background = '#141414';
      tela.style.visibility = 'visible';
    }
  }
  if ((quer || t > 0) && !motor && !abrindo && !falhou) {
    abrindo = true;
    criarMotor().then(m => { motor = m; }, e => { falhou = true; console.error('teto: ' + e.message); if (tela) tela.style.visibility = 'hidden'; }).finally(() => { abrindo = false; });
  }
  if (motor && !rodando && (quer || t > 0)) {
    rodando = true;
    tela.style.visibility = 'visible';
    ultimo = performance.now();
    requestAnimationFrame(quadro);
  }
  setTimeout(vigiar, 100);
}

// ---------- som: o bumbo corre do booth para a entrada, como no Concreto ----------
function ouvir(dt, agora) {
  const vivo = audioVivo() && A.rmsDb > REACOES.som.piso;
  const bumbo = vivo ? Math.min(A.bumbo, 1.2) : 0, grave = vivo ? Math.min(A.grave, 1) : 0;
  if (bumbo > 0.45 && bumboAntes <= 0.45 && agora - antesGolpe > 180) { idade = 0; antesGolpe = agora; }
  bumboAntes = bumbo;
  idade += dt;
  return { bumbo, grave };
}

// ---------- quadro ----------
const POR = 12;
const dados = new Float32Array(placas.length * POR);
function quadro(agora) {
  if (!rodando) return;
  const dt = (TESTE && TESTE.dt) || Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  const quer = querFechado();
  const antes = t;
  t = TESTE && TESTE.t !== undefined ? TESTE.t : clamp(t + (quer ? dt : -dt), 0, FIM);
  // tudo fechado: as placas do próprio visual (Concreto, Teto) já podem ficar abertas por baixo. Ao abrir, aparece o céu.
  if (t >= FIM && !escondeuCena && window.__tetoCena) { escondeuCena = true; window.__tetoCena(); }
  const { bumbo, grave } = ouvir(dt, agora);
  const luzZ = ZF - idade * 15, luzF = Math.exp(-idade * 2.6) * (0.35 + 0.8 * bumbo + 0.3 * grave);

  let n = 0;
  for (const p of placas) {
    const tp = t - p.t0;
    if (tp <= 0) { p.chegou = false; continue; }
    const a = inOutCubic(clamp(tp / p.corre));
    const d = clamp((tp - p.corre) / p.desce);
    const assentou = d >= 1;
    if (assentou && !p.chegou && t > antes) p.j = 1;
    p.chegou = assentou;
    p.j *= Math.exp(-dt * 7);
    const x = p.x0 + (p.cx - p.x0) * a, z = p.z0 + (p.cz - p.z0) * a;
    // desce acelerando: é o peso. Depois de assentada, o bumbo passa empurrando a placa um dedo para fora.
    const onda = assentou ? Math.exp(-(((p.cz - luzZ) / 0.9) ** 2)) * luzF * 0.03 : 0;
    const altura = p.folga * (1 - d * d) - onda - p.j * 0.012;
    const tom = p.tom * Math.exp(-Math.max(altura, 0) * 1.6) * (1 + p.j * 0.35);
    dados.set([x, HT + ESP + altura, z, tom, LP / 2 - 0.0045, ESP, CP / 2 - 0.0045, 0, p.ox, p.oy, 0, 0], n * POR);
    n++;
  }
  motor.desenhar(n, luzZ, luzF, 0.72 + grave * 0.45, tempo);
  if (tela.style.background) tela.style.background = '';
  if (t <= 0 && !quer) {
    rodando = false; viuFechar = false; escondeuCena = false;
    tela.style.visibility = 'hidden';
    return;
  }
  requestAnimationFrame(quadro);
}

async function criarMotor() {
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const gpu = await adaptador.requestDevice();
  gpu.addEventListener('uncapturederror', e => console.error('teto: ' + e.error.message));
  const U = GPUBufferUsage, TX = GPUTextureUsage;

  const op = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
  const b = await createImageBitmap(await (await fetch(new URL('../ceu/dados/materiais.png', import.meta.url))).blob(), op);
  const niveis = Math.floor(Math.log2(Math.max(b.width, b.height))) + 1;
  const texMat = gpu.createTexture({ size: [b.width, b.height], mipLevelCount: niveis, format: 'rgba8unorm', usage: TX.TEXTURE_BINDING | TX.COPY_DST | TX.RENDER_ATTACHMENT });
  for (let m = 0; m < niveis; m++) {
    const mw = Math.max(1, b.width >> m), mh = Math.max(1, b.height >> m);
    const f = m ? await createImageBitmap(b, { ...op, resizeWidth: mw, resizeHeight: mh, resizeQuality: 'high' }) : b;
    gpu.queue.copyExternalImageToTexture({ source: f }, { texture: texMat, mipLevel: m }, [mw, mh]);
    if (m) f.close();
  }

  if (!tela) criarTela();
  const contexto = tela.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device: gpu, format: formato, alphaMode: 'premultiplied' });

  const m = gpu.createShaderModule({ code: /* wgsl */`
struct Un { vp: mat4x4f, luzZ: f32, luzF: f32, lavar: f32, tempo: f32 };
@group(0) @binding(0) var<uniform> G: Un;
@group(0) @binding(1) var mat: texture_2d<f32>;
@group(0) @binding(2) var am: sampler;
const HT = ${HT}; const ZF = ${ZF};
struct VI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) d: vec4f, @builtin(vertex_index) i: u32 };
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f,
  @location(3) @interpolate(flat) h: vec3f,
  @location(4) @interpolate(flat) tom: f32,
  @location(5) @interpolate(flat) d: vec2f,
};
@vertex fn vs(v: VI) -> VO {
  const NS = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
  const US = array<vec3f, 6>(vec3f(0, 1, 0), vec3f(0, 1, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0), vec3f(1, 0, 0));
  const VS = array<vec3f, 6>(vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 0, 1), vec3f(0, 1, 0), vec3f(0, 1, 0));
  const SS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let f = v.i / 6u; let s = SS[v.i % 6u];
  let ln = NS[f];
  let lp = (ln + US[f] * s.x + VS[f] * s.y) * v.b.xyz;
  var o: VO;
  o.w = v.a.xyz + lp;
  o.pos = G.vp * vec4f(o.w, 1.);
  o.n = ln; o.lp = lp; o.h = v.b.xyz; o.tom = v.a.w; o.d = v.d.xy;
  return o;
}
fn luzDe(w: vec3f, N: vec3f, p: vec3f, forca: f32, dec: f32) -> f32 {
  let d = p - w; let dq = dot(d, d);
  return max(dot(N, d / sqrt(dq)), 0.) * forca / (1. + dq * dec);
}
// a mesma luz do Concreto: a parede do DJ lava o teto de perto, a entrada responde fraco, a varredura corre no bumbo
fn luzCimento(w: vec3f, N: vec3f, Ve: vec3f, grao: f32) -> f32 {
  let parede = vec3f(w.x * .6, HT - 1.5, ZF + .4);
  let lv = vec3f(w.x * .4, HT - .95, G.luzZ);
  let dif = luzDe(w, N, parede, .98 * G.lavar, .1) + luzDe(w, N, vec3f(w.x * .6, HT - 1.7, -5.3), .3 * G.lavar, .14) + luzDe(w, N, lv, G.luzF * 1.05, 1.2);
  let r = reflect(Ve, N);
  let esp = pow(max(dot(r, normalize(lv - w)), 0.), 22.) * G.luzF + pow(max(dot(r, normalize(parede - w)), 0.), 14.) * .13 * G.lavar;
  return dif + esp * (.85 + .3 * grao);
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let an = abs(v.n);
  var uv = v.lp.xz; var hf = v.h.xz;
  if (an.z > .5) { uv = v.lp.xy; hf = v.h.xy; } else if (an.x > .5) { uv = v.lp.zy; hf = v.h.zy; }
  let t = textureSample(mat, am, (uv + v.d) / 3.1);
  let ruido = fract(52.9829189 * fract(dot(v.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13)) - .5;
  let Ve = normalize(v.w);
  let ee = hf - abs(uv);
  let beira = min(ee.x, ee.y);
  let luz = luzCimento(v.w, v.n, Ve, t.b);
  var lum = v.tom * (.028 + (.46 + .8 * t.r) * luz * .56);
  lum *= .34 + .66 * smoothstep(0., .011, beira);
  let friso = (beira - .015) / .006;
  lum += v.tom * .1 * luz * exp(-friso * friso);
  // furos de tirante, a marca do concreto limpo
  if (v.n.y < -.5 && beira > .1) {
    let passo = vec2f(.41, .335);
    let c = (fract(uv / passo + .5) - .5) * passo;
    let r = length(c);
    lum *= 1. - .86 * (1. - smoothstep(.0135, .0175, r));
    let aro = (r - .019) / .004;
    lum += .06 * luz * exp(-aro * aro);
  }
  lum *= 1. + (t.b - .5) * .12;
  return vec4f(vec3f(lum) + ruido / 255., 1.);
}` });
  const pipe = await gpu.createRenderPipelineAsync({
    layout: 'auto',
    multisample: { count: MSAA },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    vertex: { module: m, entryPoint: 'vs', buffers: [{ arrayStride: POR * 4, stepMode: 'instance', attributes: [0, 1, 2].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: formato }] },
  });
  const bufI = gpu.createBuffer({ size: dados.byteLength, usage: U.VERTEX | U.COPY_DST });
  // a mesma janela do teto em ceu\ceu.js: normal para cima, x para a direita, o alto da imagem é a entrada
  const hw = 0.96, hh = DOBRA * PASSO / 2, cz = ZF - hh;
  const fU = new Float32Array(20);
  fU.set([HT / hw, 0, 0, 0, -XC / hw, cz / hh, 0, 1, 0, -HT / hh, 0, 0, 0, 0, 0.1, 0]);
  const bufU = gpu.createBuffer({ size: fU.byteLength, usage: U.UNIFORM | U.COPY_DST });
  const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
  const grupo = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufU } }, { binding: 1, resource: texMat.createView() }, { binding: 2, resource: am }] });
  const texCor = gpu.createTexture({ size: [W, H], sampleCount: MSAA, format: formato, usage: TX.RENDER_ATTACHMENT });
  const texProf = gpu.createTexture({ size: [W, H], sampleCount: MSAA, format: 'depth32float', usage: TX.RENDER_ATTACHMENT });
  return {
    desenhar(n, luzZ, luzF, lavar, tempoAgora) {
      fU[16] = luzZ; fU[17] = luzF; fU[18] = lavar; fU[19] = tempoAgora % 1000;
      gpu.queue.writeBuffer(bufU, 0, fU);
      if (n) gpu.queue.writeBuffer(bufI, 0, dados, 0, n * POR);
      const enc = gpu.createCommandEncoder();
      const r = enc.beginRenderPass({
        colorAttachments: [{ view: texCor.createView(), resolveTarget: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 0] }],
        depthStencilAttachment: { view: texProf.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      if (n) { r.setPipeline(pipe); r.setBindGroup(0, grupo); r.setVertexBuffer(0, bufI); r.draw(36, n); }
      r.end();
      gpu.queue.submit([enc.finish()]);
    },
  };
}

window.__teto = { estado: () => ({ t: +t.toFixed(2), fim: +FIM.toFixed(2), rodando, pronto: !!motor, falhou, quer: querFechado() }) };
vigiar();
