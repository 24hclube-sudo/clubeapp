// Opção 1, "Derrete": os personagens da Pista Quente e as figuras do CLUBE sobre o degradê vermelho da marca, com tudo
// escorrendo do teto para a parede do DJ. O grave faz escorrer mais depressa e enche a poça da parede; o bumbo solta
// gotas e manda uma onda de meio-tom da parede para a entrada; o espectro é a superfície da poça.
import { iniciarGPU, criarSom, carregarAtlas, Camadas, escreverGlobal, tamanhoPara, mola, medir, criarFiltroLED, A, R, RW, RH, GLOBAL_BYTES, WGSL_BASE, WGSL_CAMADAS } from '../nucleo.js';

const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const { view: atlasView, el } = await carregarAtlas(gpu);
const U = GPUBufferUsage, T = GPUTextureUsage;

const WGSL_FINAL = WGSL_BASE + /* wgsl */`
@group(0) @binding(1) var fonte: texture_2d<f32>;
@group(0) @binding(2) var derretido: texture_2d<f32>;
@group(0) @binding(3) var am: sampler;

fn degrade(x: f32) -> vec3f {
  // os três pontos do brand book do CLUBE (0, 55 e 91 %)
  let a = vec3f(1., .522, .392); let b = vec3f(1., .298, .173); let c = vec3f(1., 0., 0.);
  if (x < .55) { return mix(a, b, smoothstep(0., .55, x)); }
  return mix(b, c, smoothstep(.55, .91, x));
}
@fragment fn fsFinal(i: S) -> @location(0) vec4f {
  let p = i.uv * PAINEL;
  // degradê correndo devagar pela pista
  let ond = sin(i.uv.y * 7. + G.tempo * .35) * .05 + sin(i.uv.x * 5. - G.tempo * .22 + i.uv.y * 3.) * .04;
  var cor = degrade(clamp(1. - i.uv.y * 1.05 + ond, 0., 1.)) * (.58 + G.grave * .42 + G.bumbo * .1);

  // meio-tom de gibi: onda que nasce na parede do DJ a cada bumbo e corre para a entrada
  let r45 = vec2f(p.x + p.y, p.y - p.x) * .7071 / 25.;
  let id = floor(r45);
  let cel = fract(r45) - .5;
  let dist = length(p - vec2f(516., DOBRA));
  let onda = exp(-pow((dist - G.idade * 2700.) / 300., 2.)) * exp(-G.idade * .9);
  let campo = ruido2(id * .035 + vec2f(G.tempo * .15, -G.tempo * .1)) * .42 - .16 + G.grave * .32 + onda * 1.;
  let raio = clamp(campo, 0., .72);
  let ponto = smoothstep(raio, raio - .07, length(cel)) * step(.01, raio);
  cor = mix(cor, cor * vec3f(.5, .22, .22), ponto * .92);

  // o que escorreu, em tinta preta
  let m = textureSampleLevel(derretido, am, i.uv, 0.).r;
  let tinta = smoothstep(.40, .52, m);
  // brilho de líquido na borda esquerda de cada escorrido
  let m2 = textureSampleLevel(derretido, am, i.uv + vec2f(5. / PAINEL.x, -3. / PAINEL.y), 0.).r;
  let reflexo = smoothstep(.40, .52, m2) - tinta;
  cor = mix(cor, vec3f(.02, .012, .012), tinta);
  cor = mix(cor, vec3f(1., .93, .9), clamp(reflexo, 0., 1.) * .55);

  // poça da parede: o nível sobe com o grave e a superfície é o espectro
  if (p.y > DOBRA) {
    let nivel = PAINEL.y - 50. - G.grave * 300. - pow(espectroEm(p.x / PAINEL.x), 2.) * 240. - sin(p.x * .012 + G.tempo * 2.2) * 12.;
    let dentro = smoothstep(-1.5, 1.5, p.y - nivel);
    cor = mix(cor, vec3f(.02, .012, .012), dentro);
    let beira = exp(-pow((p.y - nivel - 9.) / 4., 2.));
    cor = mix(cor, vec3f(1., .95, .92), beira * .9);
  }

  // personagens: cheio branco ou prata, traço preto por cima
  let f = textureSampleLevel(fonte, am, i.uv, 0.);
  cor = mix(cor, vec3f(f.z), f.y);
  cor = mix(cor, vec3f(.02, .012, .012), f.x);

  // ruído de 1/255 para o degradê não virar degrau no LED
  let n = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13));
  return vec4f(cor * G.brilho + (n - .5) / 255., 1.);
}
`;

const WGSL_DERRETE = WGSL_BASE + /* wgsl */`
@group(0) @binding(1) var fonte: texture_2d<f32>;
@group(0) @binding(2) var anterior: texture_2d<f32>;
@group(0) @binding(3) var am: sampler;
@fragment fn fsDerrete(i: S) -> @location(0) vec4f {
  let x = i.uv.x * PAINEL.x;
  // cada coluna tem a sua pressa; poucas colunas correm muito, é o que forma pingos longos
  let t = G.tempo * .05;
  let c1 = ruido2(vec2f(x / 19., t));
  let c2 = ruido2(vec2f(x / 83. + 9., t * .6));
  let pressa = .0015 + pow(c1, 6.) * .075 + pow(c2, 5.) * .02;
  let vel = pressa * (.22 + G.grave * 2.2 + G.bumbo * 2.2);
  let ant = i.uv - vec2f(sin(i.uv.y * 44. + G.tempo * .6) * .00035, vel * G.dt);
  let velho = textureSampleLevel(anterior, am, ant, 0.).r * pow(.9945, G.dt * 60.);
  let f = textureSampleLevel(fonte, am, i.uv, 0.);
  // nasce do traço preto; nas figuras, das partes escuras do metal
  let novo = max(f.x, f.y * smoothstep(.45, .12, f.z) * .9);
  return vec4f(max(novo, velho), 0., 0., 1.);
}
`;

const WGSL_GOTA = WGSL_BASE + /* wgsl */`
struct Gota { pos: vec2f, tam: f32, alfa: f32 };
@group(0) @binding(1) var<storage, read> gotas: array<Gota>;
struct SG { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) a: f32 };
@vertex fn vsGota(@builtin(vertex_index) vi: u32, @builtin(instance_index) k: u32) -> SG {
  var cantos = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = cantos[vi];
  let g = gotas[k];
  let px = g.pos + q * vec2f(g.tam, g.tam * 1.7);
  var o: SG;
  o.pos = vec4f(px.x / PAINEL.x * 2. - 1., 1. - px.y / PAINEL.y * 2., 0., 1.);
  o.q = q;
  o.a = g.alfa;
  return o;
}
@fragment fn fsGota(i: SG) -> @location(0) vec4f {
  // gota: ponta em cima (q.y = -1), barriga embaixo
  let y = i.q.y;
  var larg = .86 * pow(clamp((y + 1.) / 1.45, 0., 1.), 1.5);
  if (y > .45) { larg = sqrt(max(.86 * .86 - pow((y - .45) * 1.56, 2.), 0.)); }
  let d = abs(i.q.x) / max(larg, .001);
  let dentro = 1. - smoothstep(.97, 1.03, d);
  if (dentro <= 0.) { discard; }
  let miolo = 1. - smoothstep(.6, .72, d);
  var c = mix(vec3f(.02, .012, .012), vec3f(1.), miolo);
  // brilho do gibi
  let b = length((i.q - vec2f(-.22, .28)) * vec2f(1., .8));
  c = mix(c, vec3f(.95, .1, .1), (1. - smoothstep(.22, .28, b)) * .0);
  return vec4f(c * dentro * i.a, dentro * i.a);
}
`;

// ---------- buffers e alvos ----------
const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const camadas = new Camadas(gpu);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const USO = T.RENDER_ATTACHMENT | T.TEXTURE_BINDING;
const texFonte = gpu.createTexture({ size: [RW, RH], format: 'rgba8unorm', usage: USO });
const DW = Math.round(RW / 2), DH = Math.round(RH / 2);
const texD = [0, 1].map(() => gpu.createTexture({ size: [DW, DH], format: 'rgba16float', usage: USO }));
const vFonte = texFonte.createView(), vD = texD.map(t => t.createView());

const mCam = modulo(WGSL_BASE + WGSL_CAMADAS, 'camadas'), mDer = modulo(WGSL_DERRETE, 'derrete'), mFin = modulo(WGSL_FINAL, 'final'), mGota = modulo(WGSL_GOTA, 'gota');
const pipe = (m, fs, fmt, vs = 'vsTela', blend) => gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: vs }, fragment: { module: m, entryPoint: fs, targets: [{ format: fmt, blend }] } });
const filtro = await criarFiltroLED(gpu, modulo, formato);
const [pCam, pDer, pFin, pGota] = await Promise.all([
  pipe(mCam, 'fsCamadas', 'rgba8unorm'), pipe(mDer, 'fsDerrete', 'rgba16float'), pipe(mFin, 'fsFinal', formato),
  pipe(mGota, 'fsGota', formato, 'vsGota', { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }),
]);
const bgCam = gpu.createBindGroup({ layout: pCam.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: camadas.buf } }, { binding: 2, resource: atlasView }, { binding: 3, resource: am },
] });
const bgDer = [0, 1].map(k => gpu.createBindGroup({ layout: pDer.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: vFonte }, { binding: 2, resource: vD[k] }, { binding: 3, resource: am },
] }));
const bgFin = [0, 1].map(k => gpu.createBindGroup({ layout: pFin.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: vFonte }, { binding: 2, resource: vD[k] }, { binding: 3, resource: am },
] }));
const N_GOTAS = 240;
const gotasF = new Float32Array(N_GOTAS * 4);
const bufGotas = gpu.createBuffer({ size: gotasF.byteLength, usage: U.STORAGE | U.COPY_DST });
const bgGota = gpu.createBindGroup({ layout: pGota.getBindGroupLayout(0), entries: [{ binding: 1, resource: { buffer: bufGotas } }] });

// ---------- quem aparece ----------
const SEQ = ['bombinha', 'fig-h', 'gelinho', 'titulo', 'fogo', 'fig-a', 'suado2', 'millos', 'nuvem', 'fig-j', 'suado1', 'millos', 'fig-d', 'gelinho', 'titulo', 'bombinha', 'fig-b', 'suado2', 'fig-f'].map(n => el[n]);
const VAGAS = [520, 1490, 2460, 3430, 4400].map((y, i) => ({ y, i, atual: SEQ[(i * 3) % SEQ.length], desde: -1, sai: null, saiu: 0 }));
let proximo = 5, vez = 0;
const PAREDE = [el.clube];   // o logo do CLUBE nunca sai da parede; Pista Quente e Millos entram no teto
const parede = { i: 0, desde: -1, sai: null, saiu: 0 };

const gotas = [];
function soltarGotas(forca) {
  const n = Math.round(2 + 4 * forca);
  for (let k = 0; k < n && gotas.length < N_GOTAS; k++) {
    const v = VAGAS[Math.floor(Math.random() * VAGAS.length)];
    gotas.push({ x: 90 + Math.random() * 852, y: v.y - 380 + Math.random() * 700, vy: 60 + Math.random() * 200, tam: 11 + Math.random() * 20, alfa: 1 });
  }
}

let tempo = 0, ultimo = performance.now(), ultimaBatida = -1, qual = 0;
const atualizarSom = criarSom({ aoBumbo: soltarGotas });
const contar = medir(adaptador, 'derrete');

function aoBater(b) {
  // a cada 8 batidas um personagem é trocado; a cada 16, o da parede
  if (b % 8 === 0) {
    const v = VAGAS[vez % VAGAS.length];
    vez++;
    v.sai = v.atual; v.saiu = tempo;
    v.atual = SEQ[proximo % SEQ.length]; proximo++;
    v.desde = tempo + 0.14;
  }
  if (PAREDE.length > 1 && b % 16 === 8) {
    parede.sai = PAREDE[parede.i]; parede.saiu = tempo;
    parede.i = (parede.i + 1) % PAREDE.length;
    parede.desde = tempo + 0.14;
  }
}

function montarCamadas() {
  camadas.limpar();
  const b = R.bumbo;
  VAGAS.forEach(v => {
    const dancar = (e, s0, alfa) => {
      const S = tamanhoPara(e, 960, 900) * s0;
      const fase = R.fase * Math.PI + v.i * 1.3;
      const sx = S * (1 + b * 0.17), sy = S * (1 - b * 0.15);
      const figura = e.tipo === 'figura';
      camadas.por(e,
        516 + Math.sin(fase * 0.5) * (figura ? 18 : 34),
        v.y - Math.abs(Math.sin(fase)) * 70 * R.grave + S * e.altura * b * 0.15,
        sx, sy,
        { rot: Math.sin(fase) * (figura ? 0.05 : 0.11) * (0.5 + R.grave), alfa, boil: figura ? 0 : 0.012, modo: e.tipo === 'texto' ? 1 : 0 });
    };
    if (v.sai) {
      const t = (tempo - v.saiu) / 0.14;
      if (t >= 1) v.sai = null;
      else dancar(v.sai, 1 - t * 0.12, 1 - t);
    }
    dancar(v.atual, Math.max(0.001, mola(tempo - v.desde)), tempo >= v.desde ? 1 : 0);
  });
  // parede do DJ: logo do CLUBE, em branco
  const naParede = (e, s0, alfa) => {
    const S = tamanhoPara(e, 860, 500) * s0 * (1 + b * 0.09);
    camadas.por(e, 516, 5300 - R.grave * 50, S, S, { alfa, modo: 1 });
  };
  if (parede.sai) {
    const t = (tempo - parede.saiu) / 0.14;
    if (t >= 1) parede.sai = null;
    else naParede(parede.sai, 1 - t * 0.12, 1 - t);
  }
  naParede(PAREDE[parede.i], Math.max(0.001, mola(tempo - parede.desde)), tempo >= parede.desde ? 1 : 0);
  camadas.enviar();
}

function atualizarGotas(dt) {
  for (let k = gotas.length - 1; k >= 0; k--) {
    const g = gotas[k];
    g.vy += 900 * dt;
    g.y += g.vy * dt;
    if (g.y > 5620 - R.grave * 190) gotas.splice(k, 1);
  }
  gotasF.fill(0);
  gotas.forEach((g, k) => gotasF.set([g.x, g.y, g.tam, g.alfa], k * 4));
  gpu.queue.writeBuffer(bufGotas, 0, gotasF);
}

function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  const b = Math.floor(R.fase);
  if (b !== ultimaBatida) { ultimaBatida = b; aoBater(b); }
  montarCamadas();
  atualizarGotas(dt);
  escreverGlobal(gpu, bufG, fG, tempo, dt, camadas.n);

  const enc = gpu.createCommandEncoder();
  const passar = (view, pipeline, bg) => {
    const r = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    r.setPipeline(pipeline); r.setBindGroup(0, bg); r.draw(3); r.end();
  };
  passar(vFonte, pCam, bgCam);
  passar(vD[1 - qual], pDer, bgDer[qual]);
  qual = 1 - qual;
  const vTela = contexto.getCurrentTexture().createView();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pFin); r.setBindGroup(0, bgFin[qual]); r.draw(3);
  r.setPipeline(pGota); r.setBindGroup(0, bgGota); r.draw(6, gotas.length);
  r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { A, R };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
