// Opção 3, "Ondas": o som sai da parede do DJ e anda pelo teto até a entrada, em blocos do tamanho dos módulos do LED.
// Cada bloco mostra o que estava tocando há alguns segundos, naquela faixa de frequência: grave no meio do painel, agudo nas beiradas.
// O bumbo é uma frente vermelha que corre a pista. Por cima, as figuras do CLUBE, o nome do Millos e os desenhos da Pista Quente em vermelho.
import { iniciarGPU, criarSom, carregarAtlas, Camadas, escreverGlobal, tamanhoPara, mola, medir, criarFiltroLED, A, R, RW, RH, GLOBAL_BYTES, WGSL_BASE, WGSL_CAMADAS } from '../nucleo.js';

const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const { view: atlasView, el } = await carregarAtlas(gpu);
const U = GPUBufferUsage, T = GPUTextureUsage;

const TAXA = 120, LINHAS_H = 512, COLS_H = 64;
const WGSL_FINAL = WGSL_BASE + /* wgsl */`
@group(0) @binding(1) var fonte: texture_2d<f32>;
@group(0) @binding(2) var historia: texture_2d<f32>;
@group(0) @binding(3) var am: sampler;
@group(0) @binding(4) var amH: sampler;

const CENTRO = vec2f(516., 5332.);
const VELOCIDADE = 1700.;     // px do painel por segundo: ~3 s da parede até a entrada
const MODULO = vec2f(43., 86.);   // lâmina do LED: 1/4 de módulo de largura
const VERMELHO = vec3f(.93, .11, .14);

fn hist(banda: f32, idade: f32) -> vec4f {
  let linha = (G.cabeca - idade * ${TAXA.toFixed(1)}) / ${LINHAS_H.toFixed(1)};
  return textureSampleLevel(historia, amH, vec2f(banda, fract(linha)), 0.);
}
// degradê do CLUBE, do claro ao vermelho
fn degrade(x: f32) -> vec3f {
  let a = vec3f(1., .522, .392); let b = vec3f(1., .298, .173); let c = vec3f(1., 0., 0.);
  if (x < .55) { return mix(a, b, smoothstep(0., .55, x)); }
  return mix(b, c, smoothstep(.55, .91, x));
}
@fragment fn fsFinal(i: S) -> @location(0) vec4f {
  let p = i.uv * PAINEL;
  let ij = floor(p / MODULO);
  let centro = (ij + .5) * MODULO;
  let dc = centro - CENTRO;
  let r = length(dc * vec2f(.55, 1.));
  let banda = abs(centro.x - 516.) / 516.;
  let idade = r / VELOCIDADE;
  let h = hist(banda * .97 + .015, idade);
  let acaso = hash21(ij);

  // lâmina com vão escuro em volta
  let q = abs(fract(p / MODULO) - .5) * 2.;
  let dentro = smoothstep(.97, .86, q.x) * smoothstep(.985, .93, q.y);

  // fundo: o degradê da marca, bem baixo, que respira com o grave
  let fundoX = clamp(1. - i.uv.y * 1.02 + sin(i.uv.y * 5. + G.tempo * .3) * .06, 0., 1.);
  var cor = degrade(fundoX) * (.035 + G.grave * .1);

  // a lâmina acende com a energia daquele instante: prata escovada, como as figuras
  let e = h.r * h.r;
  let listra = .86 + .14 * sin(p.x * 1.57 + acaso * 6.);
  let prata = mix(vec3f(.55, .56, .61), vec3f(1.), e) * listra;
  cor = mix(cor, prata * (.04 + e * 1.15), dentro * smoothstep(.02, .18, e + .03));

  // agudo: lâminas sorteadas piscam
  let faisca = pow(h.b, 2.) * step(.93, fract(acaso * 37. + floor(G.tempo * 11.) * .137));
  cor += vec3f(.95) * faisca * dentro * .9;

  // bumbo: frente vermelha correndo a pista
  let anel = pow(h.g, 2.5);
  cor = mix(cor, VERMELHO * (.5 + .5 * dentro) * (1. + anel * .25), clamp(anel * 1.2, 0., 1.) * (.35 + .65 * dentro));

  // desenhos por cima
  let f = textureSampleLevel(fonte, am, i.uv, 0.);
  cor = mix(cor, vec3f(f.z) * (.92 + G.bumbo * .25), f.y);
  cor = mix(cor, VERMELHO * (1. + G.bumbo * .2), f.x);

  let n = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13));
  return vec4f(cor * G.brilho + (n - .5) / 255., 1.);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const camadas = new Camadas(gpu);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const amH = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'repeat' });
const texFonte = gpu.createTexture({ size: [RW, RH], format: 'rgba8unorm', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
const vFonte = texFonte.createView();
const texH = gpu.createTexture({ size: [COLS_H, LINHAS_H], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });

const mCam = modulo(WGSL_BASE + WGSL_CAMADAS, 'camadas'), mFin = modulo(WGSL_FINAL, 'final');
const pipe = (m, fs, fmt) => gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vsTela' }, fragment: { module: m, entryPoint: fs, targets: [{ format: fmt }] } });
const [pCam, pFin] = await Promise.all([pipe(mCam, 'fsCamadas', 'rgba8unorm'), pipe(mFin, 'fsFinal', formato)]);
const filtro = await criarFiltroLED(gpu, modulo, formato);
const bgCam = gpu.createBindGroup({ layout: pCam.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: camadas.buf } }, { binding: 2, resource: atlasView }, { binding: 3, resource: am },
] });
const bgFin = gpu.createBindGroup({ layout: pFin.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: vFonte }, { binding: 2, resource: texH.createView() },
  { binding: 3, resource: am }, { binding: 4, resource: amH },
] });

// ---------- quem aparece ----------
const FIGURAS = [el['fig-a'], el['fig-j'], el['fig-d'], el['fig-b'], el['fig-f']];
const CICLO = [el.suado2, el.gelinho, el.titulo, el.fogo, el.bombinha, el.suado1];
const PAREDE = [el.clube];   // o logo do CLUBE nunca sai da parede; Pista Quente e Millos entram no teto
const vaga1 = { y: 1660, i: 0, desde: -1, sai: null, saiu: 0 };
const vaga2 = { y: 560, i: 2, desde: -1, sai: null, saiu: 0 };
const VAGAS = [vaga1, vaga2];
const fig = { i: 0, desde: -1, sai: null, saiu: 0 };
const parede = { i: 0, desde: -1, sai: null, saiu: 0 };
let tempo = 0, ultimo = performance.now(), ultimaBatida = -1, vez = 0;
const atualizarSom = criarSom({});
const contar = medir(adaptador, 'ondas');

// história do som: uma linha por instante
const linha = new Uint8Array(COLS_H * 4);
let cabeca = 0, ultimaLinha = -1;
function escreverHistoria() {
  const alvo = Math.floor(cabeca);
  if (ultimaLinha < 0) ultimaLinha = alvo - 1;
  for (let k = 0; k < COLS_H; k++) {
    const b = Math.min(R.faixas.length - 1, Math.floor(k / COLS_H * R.faixas.length));
    linha[k * 4] = Math.min(255, R.faixas[b] * 255);
    linha[k * 4 + 1] = Math.min(255, R.bumbo * 255);
    linha[k * 4 + 2] = Math.min(255, R.agudo * 255);
    linha[k * 4 + 3] = 255;
  }
  for (let n = Math.min(alvo - ultimaLinha, 12); n > 0; n--) {
    const y = (((alvo - n + 1) % LINHAS_H) + LINHAS_H) % LINHAS_H;
    gpu.queue.writeTexture({ texture: texH, origin: [0, y] }, linha, { bytesPerRow: COLS_H * 4 }, [COLS_H, 1]);
  }
  ultimaLinha = alvo;
}

function aoBater(b) {
  if (b % 8 === 0) {
    const v = VAGAS[vez % 2];
    vez++;
    v.sai = CICLO[v.i]; v.saiu = tempo;
    v.i = (Math.max(vaga1.i, vaga2.i) + 1) % CICLO.length;
    v.desde = tempo + 0.1;
  }
  if (b % 16 === 0) {
    fig.sai = FIGURAS[fig.i]; fig.saiu = tempo;
    fig.i = (fig.i + 1) % FIGURAS.length;
    fig.desde = tempo + 0.1;
  }
  if (PAREDE.length > 1 && b % 16 === 8) {
    parede.sai = PAREDE[parede.i]; parede.saiu = tempo;
    parede.i = (parede.i + 1) % PAREDE.length;
    parede.desde = tempo + 0.1;
  }
}

function montarCamadas() {
  camadas.limpar();
  const b = R.bumbo;
  // figura do CLUBE: pés perto da dobra, como nas artes da pista
  const porFigura = (e, s0, alfa) => {
    const S = tamanhoPara(e, 1000, 1460) * s0 * (1 + b * 0.05);
    camadas.por(e, 516, 4985 - S * 0.985 - 18 + (b * S * 0.05), S, S, { alfa, rot: Math.sin(R.fase * Math.PI * 0.5) * 0.012 });
  };
  if (fig.sai) {
    const t = (tempo - fig.saiu) / 0.1;
    if (t >= 1) fig.sai = null;
    else porFigura(fig.sai, 1 - t * 0.1, 1 - t);
  }
  if (tempo >= fig.desde) porFigura(FIGURAS[fig.i], Math.max(0.001, mola(tempo - fig.desde)), 1);
  // nome e script, nas letras das artes do CLUBE
  const Sm = tamanhoPara(el.millos, 760, 460) * (1 + b * 0.04);
  camadas.por(el.millos, 516, 2820, Sm, Sm, { modo: 1, alfa: 0.96 });
  const Ss = tamanhoPara(el.soft, 960, 300);
  camadas.por(el.soft, 516, 2410, Ss, Ss, { modo: 2 });
  // desenhos da Pista Quente, só o traço, em vermelho
  VAGAS.forEach(v => {
    const por = (e, s0, alfa, boil) => {
      const S = tamanhoPara(e, 880, 880) * s0 * (1 + b * 0.09);
      camadas.por(e, 516, v.y, S, S, { modo: 2, alfa, boil, rot: Math.sin(R.fase * Math.PI + v.y) * 0.05 });
    };
    if (v.sai) {
      const t = (tempo - v.saiu) / 0.1;
      if (t >= 1) v.sai = null;
      else por(v.sai, 1 + t * 0.15, 1 - t, 0.05);
    }
    const idade = tempo - v.desde;
    if (idade >= 0) por(CICLO[v.i], Math.max(0.001, mola(idade)), 1, 0.01 + Math.max(0, 0.06 - idade * 0.25));
  });
  // parede do DJ: letreiro grande e limpo, porque ali o sinal tem poucas linhas
  const naParede = (e, s0, alfa) => {
    const S = tamanhoPara(e, 860, 560) * s0 * (1 + b * 0.06);
    camadas.por(e, 516, 5332, S, S, { alfa, modo: 1 });
  };
  if (parede.sai) {
    const t = (tempo - parede.saiu) / 0.1;
    if (t >= 1) parede.sai = null;
    else naParede(parede.sai, 1 - t * 0.1, 1 - t);
  }
  if (tempo >= parede.desde) naParede(PAREDE[parede.i], Math.max(0.001, mola(tempo - parede.desde)), 1);
  camadas.enviar();
}

function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  const b = Math.floor(R.fase);
  if (b !== ultimaBatida) { ultimaBatida = b; aoBater(b); }
  cabeca += dt * TAXA;
  escreverHistoria();
  montarCamadas();
  escreverGlobal(gpu, bufG, fG, tempo, dt, camadas.n, 0, cabeca % LINHAS_H);

  const enc = gpu.createCommandEncoder();
  const r0 = enc.beginRenderPass({ colorAttachments: [{ view: vFonte, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r0.setPipeline(pCam); r0.setBindGroup(0, bgCam); r0.draw(3); r0.end();
  const vTela = contexto.getCurrentTexture().createView();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: filtro ? filtro.alvo : vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pFin); r.setBindGroup(0, bgFin); r.draw(3); r.end();
  if (filtro) filtro.aplicar(enc, vTela);
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { A, R };
requestAnimationFrame(t => { ultimo = t; quadro(t); });
