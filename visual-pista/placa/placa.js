// Placa de metal em relevo: dourada (?metal=ouro), prateada (?metal=prata) ou o latão minimalista (?metal=latao). O relevo é assado em dados/ (assar.py); aqui ele vira
// reflexo. A luz é um estúdio escuro com softboxes, e o metal só mostra o que reflete, por isso a chapa quase não muda de cor:
// o que anda é o brilho. O bumbo sai do logo na parede do DJ e corre pelo teto como uma onda na chapa, acendendo os relevos por onde passa.
import { iniciarGPU, criarSom, escreverGlobal, medir, Q, R, RW, RH, GLOBAL_BYTES, WGSL_BASE } from '../pista-quente/nucleo.js';

const METAL = ['prata', 'latao'].includes(Q.get('metal')) ? Q.get('metal') : 'ouro';
const LATAO = METAL === 'latao';
const TROCA = parseInt(Q.get('troca') || '64', 10);   // batidas em cada composição
const DURA_TROCA = 8;                                 // batidas da passagem de uma para a outra

// cor do metal por luminância: sombra funda e saturada, meio cheio, alta quase branca
const PALETAS = {
  ouro: ['#1c1004', '#442a0a', '#8a5f17', '#c9962d', '#f0c95e', '#ffe9a6', '#fffbeb'],
  latao: ['#150e05', '#3b2a0e', '#745821', '#a28136', '#c9a957', '#e6d08c', '#faf0cd'],
  prata: ['#0a0b0c', '#2d2f31', '#696b6e', '#a6a8aa', '#d4d5d7', '#f2f3f4', '#ffffff'],
};
// O tom do teto agora se acerta no app, para todos os visuais (Tom do teto). Aqui fica desligado; ?teto=1 volta a esquentar só a placa.
const FORCA_TETO = parseFloat(Q.get('teto') ?? '0');
const AJUSTE_TETO = [1.045, 0.97, 0.97].map(v => (1 + (v - 1) * FORCA_TETO).toFixed(4)).join(', ');
const hexVec = h => `vec3f(${[1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).join(', ')})`;
const RAMPA = PALETAS[METAL].map(hexVec).join(', ');

const t0 = performance.now();
const { gpu, contexto, formato, modulo, adaptador } = await iniciarGPU();
const U = GPUBufferUsage, T = GPUTextureUsage;

// ---------- relevo assado ----------
const base = new URL('dados/', import.meta.url);
const meta = await (await fetch(new URL('dados.json', base))).json();
const NOMES = LATAO ? meta.minimas : meta.composicoes, N = NOMES.length, PW = meta.largura, PH = meta.altura;
const texAlt = gpu.createTexture({ size: [PW, PH, N], format: 'r16float', usage: T.TEXTURE_BINDING | T.COPY_DST });
const texMat = gpu.createTexture({ size: [PW >> 1, PH >> 1, N], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
const texDir = gpu.createTexture({ size: [PW >> 2, PH >> 2, N], format: 'rg8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
const baixar = async n => new Uint8Array(await (await fetch(new URL(n, base))).arrayBuffer());
await Promise.all(NOMES.map(async (nome, i) => {
  const [h, m, d] = await Promise.all([baixar(`${nome}-h.bin`), baixar(`${nome}-m.bin`), baixar(`${nome}-d.bin`)]);
  gpu.queue.writeTexture({ texture: texAlt, origin: [0, 0, i] }, h, { bytesPerRow: PW * 2, rowsPerImage: PH }, [PW, PH, 1]);
  gpu.queue.writeTexture({ texture: texMat, origin: [0, 0, i] }, m, { bytesPerRow: (PW >> 1) * 4, rowsPerImage: PH >> 1 }, [PW >> 1, PH >> 1, 1]);
  gpu.queue.writeTexture({ texture: texDir, origin: [0, 0, i] }, d, { bytesPerRow: (PW >> 2) * 2, rowsPerImage: PH >> 2 }, [PW >> 2, PH >> 2, 1]);
}));

const TAXA = 120, LINHAS_H = 512, COLS_H = 64;
const WGSL = WGSL_BASE + /* wgsl */`
struct Placa { a: f32, b: f32, frente: f32, faixa1: f32, chave: f32, faixa2: f32, passo: f32, relevo: f32 };
@group(0) @binding(1) var<uniform> P: Placa;
@group(0) @binding(2) var alt: texture_2d_array<f32>;
@group(0) @binding(3) var mat: texture_2d_array<f32>;
@group(0) @binding(4) var dirs: texture_2d_array<f32>;
@group(0) @binding(5) var historia: texture_2d<f32>;
@group(0) @binding(6) var am: sampler;
@group(0) @binding(7) var amH: sampler;

const CENTRO = vec2f(516., 5332.);
const VELOCIDADE = 1700.;   // px do painel por segundo: ~3 s da parede até a entrada
const RAMPA = array<vec3f, 7>(${RAMPA});
const AJUSTE_TETO = vec3f(${AJUSTE_TETO});
const CORROSAO = ${LATAO ? '1.' : '0.'};
const RISCO = ${LATAO ? '.13' : '.34'};
const SOM = ${LATAO ? '.7' : '1.'};
const FAISCA = ${LATAO ? '0.' : '4.'};
const FIO_DOBRA = ${LATAO ? '.3' : '1.'};
const ESPALHA = ${LATAO ? '.024' : '.004'};

fn rampa(t: f32) -> vec3f {
  let f = clamp(t, 0., 1.) * 6.;
  let i = u32(min(f, 5.));
  let x = f - f32(i);
  return mix(RAMPA[i], RAMPA[i + 1u], x * x * (3. - 2. * x));
}
fn hist(banda: f32, idade: f32) -> vec4f {
  let linha = (G.cabeca - idade * ${TAXA.toFixed(1)}) / ${LINHAS_H.toFixed(1)};
  return textureSampleLevel(historia, amH, vec2f(banda, fract(linha)), 0.);
}
fn altura(uv: vec2f, m: f32) -> f32 {
  let a = textureSampleLevel(alt, am, uv, i32(P.a), 0.).r;
  if (m <= 0.) { return a; }
  return mix(a, textureSampleLevel(alt, am, uv, i32(P.b), 0.).r, m);
}
// Luz gaussiana vista por uma superfície escovada: o tamanho da luz soma com o espalhamento do risco (rb atravessa, rt ao longo).
fn luz(a: vec2f, c: vec2f, s: vec2f, peso: f32, t: vec2f, b: vec2f, rb2: f32, rt2: f32) -> f32 {
  let d = a - c;
  let xx = s.x * s.x + rb2 * b.x * b.x + rt2 * t.x * t.x;
  let yy = s.y * s.y + rb2 * b.y * b.y + rt2 * t.y * t.y;
  let xy = rb2 * b.x * b.y + rt2 * t.x * t.y;
  let det = max(xx * yy - xy * xy, 1e-7);
  let q = (yy * d.x * d.x - 2. * xy * d.x * d.y + xx * d.y * d.y) / det;
  return peso * s.x * s.y / sqrt(det) * exp(-.5 * q);
}

@fragment fn fs(i: S) -> @location(0) vec4f {
  let p = i.uv * PAINEL;
  let d = p - CENTRO;
  let r = length(d);
  let rad = d / max(r, 1.);

  // passagem entre composições: a nova sobe a partir da parede do DJ
  let m = select(0., 1. - smoothstep(P.frente - 340., P.frente + 340., r), P.frente > 0.);

  // inclinação do relevo
  let e = vec2f(P.passo) / PAINEL;
  let hx = altura(i.uv + vec2f(e.x, 0.), m) - altura(i.uv - vec2f(e.x, 0.), m);
  let hy = altura(i.uv + vec2f(0., e.y), m) - altura(i.uv - vec2f(0., e.y), m);
  var g = vec2f(hx, hy) / (2. * P.passo);

  // material
  var mm = textureSampleLevel(mat, am, i.uv, i32(P.a), 0.);
  var dd = textureSampleLevel(dirs, am, i.uv, i32(P.a), 0.).rg;
  if (m > 0.) {
    mm = mix(mm, textureSampleLevel(mat, am, i.uv, i32(P.b), 0.), m);
    dd = mix(dd, textureSampleLevel(dirs, am, i.uv, i32(P.b), 0.).rg, m);
  }
  let corroido = mm.a * CORROSAO;
  let pol = mm.r * (1. - corroido * .8);
  let sombra = mm.b;
  let d2 = dd * 2. - 1.;
  let nd = max(length(d2), 1e-3);
  let c2 = d2.x / nd;
  let tang = normalize(vec2f(sqrt(max((1. + c2) * .5, 0.)), sqrt(max((1. - c2) * .5, 0.)) * select(-1., 1., d2.y >= 0.)) + vec2f(1e-4));
  let trav = vec2f(-tang.y, tang.x);

  // o som andando na chapa
  let banda = abs(p.x - 516.) / 516. * .97 + .015;
  let idade = r / VELOCIDADE;
  let h0 = hist(banda, idade - .012);
  let h1 = hist(banda, idade + .012);
  let hm = (h0 + h1) * .5;
  let ondaBumbo = h0.g - h1.g;     // frente da onda do bumbo
  let ondaFaixa = h0.r - h1.r;     // o desenho do som
  g += rad * (ondaBumbo * .16 + ondaFaixa * .1) * SOM;
  // o relevo salta quando a onda passa, e respira com os graves
  let pulo = 1. + hm.g * hm.g * .8 + min(G.grave, 1.2) * .16;
  g *= P.relevo * pulo;
  // risco da escova: só no fosco
  let ris = (mm.g - .5) * (1. - pol) * (1. - pol);
  g += trav * ris * RISCO;
  // onda na frente da passagem
  if (P.frente > 0.) { g += rad * sin(clamp((r - P.frente) / 340., -1., 1.) * PI) * .1; }

  // reflexão num espelho: câmera bem longe, centrada na placa. A parede segue a mesma conta do teto, para os dois terem o mesmo tom no LED.
  let n = normalize(vec3f(-g, 1.));
  let v = normalize(vec3f(516. - p.x, 2838. - p.y, 6400.));
  let refl = 2. * dot(n, v) * n - v;
  let a = refl.xy / (1. + max(refl.z, -.9));

  // espalhamento: o fosco abre muito atravessando o risco
  let fosco = 1. - pol;
  let rb2 = .0006 + fosco * fosco * .07;
  let rt2 = .0006 + fosco * fosco * ESPALHA;

  // estúdio
  let ch = P.chave;
  let cc = vec2f(cos(ch), sin(ch));
  var I = .1 + pol * .14;
  // luz principal do relevo: canto de cima, girando devagar. É ela que faz o desenho do alto-relevo.
  I += luz(a, cc * .62, vec2f(.2, .2), 1. + pol * 1.5 + G.bumbo * (.2 + pol * .8), tang, trav, rb2, rt2);
  // contraluz baixo, bem mais fraco, para o lado escuro não morrer
  I += luz(a, -cc * .7, vec2f(.3, .3), .5, tang, trav, rb2, rt2);
  // faixas de luz que atravessam a chapa inteira
  I += luz(a, vec2f(0., P.faixa1), vec2f(.9, .05), .85 + pol * .4 + min(G.medio, 1.) * .25, tang, trav, rb2, rt2);
  I += luz(a, vec2f(0., P.faixa2), vec2f(.9, .016), .7 + pol * .3, tang, trav, rb2, rt2);
  // grande céu suave: é o degradê que a chapa mostra quando nenhuma faixa passa
  I += luz(a, vec2f(-.1, -.1), vec2f(.42, .34), .3, tang, trav, rb2, rt2);
  // no espelho, dobras de reflexo: é o que separa o metal polido do resto
  let dobra = sin(a.y * 6. + 1.5 * sin(a.x * 4. + G.tempo * .17) + G.tempo * .13);
  I += pol * smoothstep(-.2, .85, dobra) * .62;
  I -= pol * (1. - smoothstep(-.8, .15, dobra)) * .16;

  // anel do bumbo: a própria luz correndo pelo teto, mais forte no polido
  let anel = pow(hm.g, 2.5);
  I += anel * (.13 + pol * .65) * SOM;
  I *= (.55 + .45 * sombra * sombra) * (1. - corroido * .3);
  // agudos: faíscas nas arestas polidas
  let gl = length(g);
  let celula = floor(p / 11.);
  let fc = fract(p / 11.) - .5;
  let cinti = step(.994, hash21(celula + floor(G.tempo * 9.))) * exp(-dot(fc, fc) * 26.);
  I += cinti * smoothstep(.12, .5, gl) * pol * G.agudo * G.agudo * FAISCA;

  // dobra da chapa: aresta viva entre o teto e a parede
  let aresta = exp(-pow((p.y - 4988.) / 3.2, 2.));
  I += aresta * (.8 + G.bumbo) * FIO_DOBRA;

  let t = 1. - exp(-max(I, 0.) * ${{ prata: '.86', ouro: '.95', latao: '1.12' }[METAL]});
  var cor = rampa(t);
  // óxido: o latão perde o amarelo e puxa para um verde-acinzentado bem apagado
  cor = mix(cor, vec3f(dot(cor, vec3f(.3, .6, .1))) * vec3f(.9, .86, .66), corroido * .34);
  cor *= mix(vec3f(1.), AJUSTE_TETO, 1. - smoothstep(4986., 4990., p.y));
  let ruido = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + G.tempo * 7.13));
  return vec4f(cor * G.brilho + (ruido - .5) / 255., 1.);
}
`;

const bufG = gpu.createBuffer({ size: GLOBAL_BYTES, usage: U.UNIFORM | U.COPY_DST });
const fG = new Float32Array(GLOBAL_BYTES / 4);
const bufP = gpu.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
const fP = new Float32Array(8);
const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
const amH = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'repeat' });
const texH = gpu.createTexture({ size: [COLS_H, LINHAS_H], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });

const mod = modulo(WGSL, 'placa');
const pipe = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mod, entryPoint: 'vsTela' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: formato }] } });
const bg = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: bufG } }, { binding: 1, resource: { buffer: bufP } },
  { binding: 2, resource: texAlt.createView({ dimension: '2d-array' }) }, { binding: 3, resource: texMat.createView({ dimension: '2d-array' }) },
  { binding: 4, resource: texDir.createView({ dimension: '2d-array' }) }, { binding: 5, resource: texH.createView() },
  { binding: 6, resource: am }, { binding: 7, resource: amH },
] });

// ---------- roteiro ----------
const pedida = NOMES.indexOf(Q.get('comp') || '');
const fixa = pedida >= 0;
// a prata começa em outra composição, para as duas não abrirem iguais
// O convite (Millos Kaiser e Pista Quente) volta a cada duas composições.
const CONVITE = NOMES.findIndex(n => n.endsWith('festa'));
const ORDEM = NOMES.map((_, i) => i).filter(i => i !== CONVITE).flatMap(i => (CONVITE >= 0 ? [i, CONVITE] : [i]));
let vezOrdem = METAL === 'prata' ? 1 : 0;
let compA = fixa ? pedida : ORDEM[vezOrdem % ORDEM.length], compB = compA;
let trocaDesde = -1, tempo = 0, ultimo = performance.now(), ultimaBatida = -1, batidaLocal = 0, batidasCorridas = 0;
const atualizarSom = criarSom({});
const contar = medir(adaptador, `placa-${METAL}`);

const linha = new Uint8Array(COLS_H * 4);
let cabeca = 0, ultimaLinha = -1, pulso = 0;
function escreverHistoria() {
  const alvo = Math.floor(cabeca);
  if (ultimaLinha < 0) ultimaLinha = alvo - 1;
  for (let k = 0; k < COLS_H; k++) {
    // média larga entre faixas vizinhas: a chapa ondula, não mostra degrau de equalizador
    const c = k / (COLS_H - 1) * (R.faixas.length - 1);
    let soma = 0, peso = 0;
    for (let j = Math.max(0, Math.floor(c - 6)); j <= Math.min(R.faixas.length - 1, Math.ceil(c + 6)); j++) {
      const w = Math.exp(-((j - c) ** 2) / 18);
      soma += R.faixas[j] * w; peso += w;
    }
    linha[k * 4] = Math.min(255, soma / peso * 255);
    linha[k * 4 + 1] = Math.min(255, pulso * 255);
    linha[k * 4 + 2] = Math.min(255, R.agudo * 255);
    linha[k * 4 + 3] = 255;
  }
  for (let n = Math.min(alvo - ultimaLinha, 12); n > 0; n--) {
    const y = (((alvo - n + 1) % LINHAS_H) + LINHAS_H) % LINHAS_H;
    gpu.queue.writeTexture({ texture: texH, origin: [0, y] }, linha, { bytesPerRow: COLS_H * 4 }, [COLS_H, 1]);
  }
  ultimaLinha = alvo;
}

function quadro(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  // relógio próprio da luz: anda no tempo da música, mas nunca pula quando a análise corrige a batida
  batidaLocal += dt * R.bpm / 60;
  const b = Math.floor(R.fase);
  if (b !== ultimaBatida) {
    ultimaBatida = b;
    batidasCorridas++;
    if (!fixa && N > 1 && trocaDesde < 0 && batidasCorridas >= TROCA) {
      compB = ORDEM[++vezOrdem % ORDEM.length];
      trocaDesde = batidaLocal;
      batidasCorridas = 0;
    }
  }
  let frente = 0;
  if (trocaDesde >= 0) {
    const x = (batidaLocal - trocaDesde) / DURA_TROCA;
    if (x >= 1) { compA = compB; trocaDesde = -1; } else frente = 1 + x * 6400;
  }
  // a onda do bumbo sobe em ~70 ms e cai devagar: vira um lençol de luz, não um risco
  pulso += (R.bumbo - pulso) * (1 - Math.exp(-dt * (R.bumbo > pulso ? 14 : 4)));
  cabeca += dt * TAXA;
  escreverHistoria();

  const ciclo = n => batidaLocal / n * Math.PI * 2;
  // luz principal vinda do canto de cima e à esquerda, balançando para o relevo trocar de lado aos poucos
  fP[0] = compA; fP[1] = compB; fP[2] = frente;
  fP[3] = Math.sin(ciclo(32)) * 0.34;                         // faixa larga vai e volta na chapa
  fP[4] = -2.36 + Math.sin(ciclo(64)) * 0.75 + R.medio * 0.1; // ângulo da luz principal
  fP[5] = ((batidaLocal / 16) % 1) * 1.1 - 0.55;              // fio de luz, sempre da parede para a entrada
  fP[6] = Math.max(1, 1 / Math.max(RW / PW, 0.001)) * 1.0;    // passo da derivada em px do painel
  fP[7] = parseFloat(Q.get('relevo') || '1');
  gpu.queue.writeBuffer(bufP, 0, fP);
  escreverGlobal(gpu, bufG, fG, tempo, dt, 0, 0, cabeca % LINHAS_H);

  const enc = gpu.createCommandEncoder();
  const r = enc.beginRenderPass({ colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  r.setPipeline(pipe); r.setBindGroup(0, bg); r.draw(3); r.end();
  gpu.queue.submit([enc.finish()]);
  contar();
  requestAnimationFrame(quadro);
}
window.__painel = { R, get estado() { return { comp: NOMES[compA], proxima: NOMES[compB], batidas: batidasCorridas, fase: +R.fase.toFixed(2), luz: +batidaLocal.toFixed(2), trocaDesde: +trocaDesde.toFixed(2), tempo: +tempo.toFixed(2), fixa, abriuEmMs: Math.round(abriu) }; } };
const abriu = performance.now() - t0;
requestAnimationFrame(t => { ultimo = t; quadro(t); });
