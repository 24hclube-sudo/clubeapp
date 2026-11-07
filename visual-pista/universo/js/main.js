// Universo CLUBE em tempo real (WebGPU): as figuras da marca em voxels de cromo, reagindo ao som, voando pelo mundo
// do vídeo do H3. Sai em 1032x5676 (teto + parede do DJ), com perspectiva certa para quem está na pista.
// URL: ?saida (só o painel) &escala= &msaa= &audio=teste|<parte do nome da entrada> &lente=janela|plana &paleta= &bpm= &brilho=
import { A, NF, ligarAudio, analisarAudio, audioVivo, audioNoComando } from '../../js/audio.js';
import { REACOES } from '../../js/reacoes.js';
import { COMPUTE_VOXELS, RENDER, POS, TONS, PREVIA, MIPS, FILTRO_LED } from './shaders.js';
import { malhaCubo, malhaCristal, malhaPedra } from './malhas.js';

const Q = new URLSearchParams(location.search);
const SAIDA = Q.has('saida');
const ESCALA = parseFloat(Q.get('escala') || (SAIDA ? '1' : '0.5'));
const MSAA = parseInt(Q.get('msaa') || '4', 10);
const LENTE = Q.get('lente') === 'plana' ? 'plana' : 'janela';
const BPM_RELOGIO = parseFloat(Q.get('bpm') || '124');
const BRILHO = parseFloat(Q.get('brilho') || '0.95');
const N_ESTATUAS = parseInt(Q.get('estatuas') || '6', 10);
// mundo=quente: a opção "Brinquedos 3D" da festa, com os personagens da Pista Quente infláveis.
const QUENTE = Q.get('mundo') === 'quente';
const LED = Q.has('led');     // saída para o LED: passa pelo filtro vertical (ver FILTRO_LED)
const N_ROCHAS = QUENTE ? 14 : 36, N_PO = parseInt(Q.get('po') || '45000', 10);

const LARG = 1032, ALT = 5676, DOBRA = 4988, PASSO = 1.92 / 1032;
const HT = 1.3532, ZF = 4.39, XL = -1.015;       // olho da foto 07: teto 1,35 m acima, parede a 4,39 m (perspectiva/geometria.py)
const RW = Math.round(LARG * ESCALA), RH = Math.round(ALT * ESCALA);
const RD = Math.round(DOBRA * ESCALA);

const hud = document.getElementById('hud');
const tela = document.getElementById('tela');

function falhar(msg) { hud.style.display = 'block'; hud.textContent = msg; console.error(msg); throw new Error(msg); }

// ---------- cores ----------
const lin = h => { const c = parseInt(h, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const cor = hex => [lin(hex.slice(1, 3)), lin(hex.slice(3, 5)), lin(hex.slice(5, 7)), 1];
const P = (topo, meioE, meioD, horE, horD, chao, cristal) => ({ topo, meioE, meioD, horE, horD, chao, cristal });
const PALETAS = {
  h3:        P('#060003', '#c9240a', '#8c1160', '#ffae00', '#f58cc8', '#d8b08a', '#e12cd6'),
  vermelho:  P('#120000', '#ff1500', '#ff0000', '#ff8564', '#ff4c2c', '#c78a70', '#ff3c8c'),
  azul:      P('#00060e', '#0070ae', '#0060c0', '#07b9df', '#7fe0f5', '#a8b8bc', '#29e0ff'),
  vinho:     P('#080103', '#57202b', '#7e3443', '#a04d5c', '#d08a96', '#b89a90', '#e04a7c'),
  verde:     P('#000a03', '#00771a', '#00664a', '#00c059', '#7ae0a0', '#a8b090', '#30ff90'),
  petroleo:  P('#020808', '#17474c', '#2a666c', '#3f8288', '#7fb8bc', '#a0aca4', '#4ae0e8'),
  terracota: P('#0c0402', '#b55a3c', '#a84a30', '#e8957a', '#f2bda8', '#d0a888', '#ff7a4a'),
  urban:     P('#040606', '#00272e', '#00272e', '#878a8b', '#c1c5c6', '#7c8080', '#c1c5c6'),
  quente:    P('#0e0000', '#e8140a', '#b3002d', '#ff8564', '#ff4c2c', '#b86a4a', '#ff7a2e'),
};
let paletaAtual = PALETAS[Q.get('paleta')] ? Q.get('paleta') : (QUENTE ? 'quente' : 'h3');

// ---------- WebGPU ----------
if (!navigator.gpu) falhar('Este navegador não tem WebGPU.');
const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adaptador) falhar('Sem placa para o WebGPU.');
const gpu = await adaptador.requestDevice();
const erros = [];
gpu.addEventListener('uncapturederror', e => { erros.push(e.error.message); console.error(e.error.message); hud.style.display = 'block'; });
gpu.lost.then(i => { console.error('GPU perdida: ' + i.message); erros.push('GPU perdida: ' + i.message); });

if (SAIDA) {
  document.body.classList.add('saida');
  tela.width = RW; tela.height = RH;
  tela.style.width = RW + 'px'; tela.style.height = RH + 'px';
} else {
  tela.width = Math.round(innerWidth * devicePixelRatio);
  tela.height = Math.round(innerHeight * devicePixelRatio);
}
const contexto = tela.getContext('webgpu');
const FORMATO = navigator.gpu.getPreferredCanvasFormat();
contexto.configure({ device: gpu, format: FORMATO, alphaMode: 'opaque' });

const buffer = (dados, uso, tamanho) => {
  const b = gpu.createBuffer({ size: tamanho ?? dados.byteLength, usage: uso, mappedAtCreation: !!dados });
  if (dados) { new dados.constructor(b.getMappedRange()).set(dados); b.unmap(); }
  return b;
};
const U = GPUBufferUsage;

// ---------- figuras em voxels ----------
const meta = await (await fetch('dados/figuras.json')).json();
const bruto = new Int16Array(await (await fetch('dados/figuras.bin')).arrayBuffer());
const nFig = bruto.length / 8;
const figF = new Float32Array(nFig * 8);
for (let i = 0; i < bruto.length; i++) figF[i] = bruto[i] / 32767;
const bufFig = buffer(figF, U.STORAGE);
const N_CLUBE = meta.figuras.length;
// a Nuvem da Pista Quente segura um vinil: fica de fora dos bonecos 3D
const BASE = QUENTE ? [...meta.figuras, ...meta.personagens.filter(p => p.nome !== 'nuvem')] : meta.figuras;
// Pista Quente e Millos Kaiser passam voando como estátuas; o logo do CLUBE nunca sai da parede.
const LETREIROS = meta.logos.filter(l => l.nome !== 'clube');
const FIGS = [...BASE, ...LETREIROS];
const N_BASE = BASE.length;
const LOGOS = [meta.logo];
const LOGO_N = Math.max(...LOGOS.map(l => l.n));
const POOL = Math.max(...FIGS.map(f => f.n));
const N_VOX = N_ESTATUAS * POOL + LOGO_N;

const voxInicial = new ArrayBuffer(N_VOX * 64);
{
  const f = new Float32Array(voxInicial), u = new Uint32Array(voxInicial);
  let k = 0;
  for (let g = 0; g <= N_ESTATUAS; g++) {
    const n = g < N_ESTATUAS ? POOL : LOGO_N;
    for (let i = 0; i < n; i++, k++) {
      u[k * 16 + 12] = g;
      u[k * 16 + 13] = i;
      f[k * 16 + 14] = Math.random();
    }
  }
}
const bufVox = buffer(new Uint8Array(voxInicial), U.STORAGE);

// ---------- grupos (estátuas + logo) ----------
let semente = 1234.5;
const acaso = (a = 0, b = 1) => { semente = (semente * 9301 + 49297) % 233280; return a + (b - a) * (semente / 233280); };
const grupoBytes = new ArrayBuffer((N_ESTATUAS + 1) * 80);
const gF = new Float32Array(grupoBytes), gU = new Uint32Array(grupoBytes);
const bufGrupos = buffer(null, U.STORAGE | U.COPY_DST, grupoBytes.byteLength);

const ESP_ESTATUAS = 58;
const camera = { z: 0, x: 0, vel: 7, inclina: LENTE === 'janela' ? -0.075 : 0 };
const estatuas = [];
let ordem = [];
const proximaFigura = () => { if (!ordem.length) ordem = [...FIGS.keys()].slice(0, N_CLUBE).sort(() => acaso() - 0.5); return ordem.pop(); };
const COM_VAO = [...FIGS.keys()].filter(i => FIGS[i].vao >= 0.09);
let ordemPQ = [];
const proximoPersonagem = () => { if (!ordemPQ.length) ordemPQ = [...FIGS.keys()].slice(N_CLUBE, N_BASE).sort(() => acaso() - 0.5); return ordemPQ.pop(); };
function colocarEstatua(e, z) {
  e.fig = proximaFigura();
  const i = estatuas.indexOf(e);
  e.contagem = (e.contagem ?? i) + 1;
  e.y = 0;
  if (e.contagem % 4 === 1) {
    e.fig = N_BASE + (Math.floor(e.contagem / 4) + i) % LETREIROS.length;
    e.figNova = e.fig;
    e.escala = acaso(46, 58);
    e.x = acaso(-4, 4);
    e.y = acaso(12, 20);
    e.z = z;
    e.rot = acaso(-0.04, 0.04);
    e.t0 = 0; e.atraso = 0; e.espalha = 0; e.impulso = 0; e.teleporte = 1; e.sem = acaso();
    e.reforma = -1; e.limpar = 0;
    return;
  }
  if (QUENTE && e.contagem % 2 === 0) {
    // personagem da Pista Quente: boneco inflável, grande, passando por cima do caminho
    e.fig = proximoPersonagem();
    e.figNova = e.fig;
    const F = FIGS[e.fig];
    e.escala = F.flutua ? acaso(24, 38) : acaso(34, 50);
    e.y = F.flutua ? acaso(13, 26) : 0;
    e.x = (i % 2 ? 1 : -1) * (F.flutua ? acaso(0, 9) : acaso(9, 16));
    e.z = z;
    e.rot = -e.x * 0.008 + acaso(-0.12, 0.12);
    e.t0 = 0; e.atraso = 0; e.espalha = 0; e.impulso = 0; e.teleporte = 1; e.sem = acaso();
    e.reforma = -1; e.limpar = 0;
    return;
  }
  // uma em cada três é gigante e a pista passa entre as pernas; as outras ficam dos lados
  const gigante = e.contagem % 3 === 0;
  if (gigante && COM_VAO.length) e.fig = COM_VAO[Math.floor(acaso(0, COM_VAO.length))];
  e.figNova = e.fig;
  e.escala = gigante ? acaso(58, 72) : acaso(30, 50);
  // gigante: o vão entre as pernas fica em cima do caminho; o gesto da figura não cobre a parede do DJ
  e.x = gigante ? -FIGS[e.fig].vao_x * e.escala : (i % 2 ? 1 : -1) * acaso(11, 24);
  e.z = z;
  e.rot = gigante ? acaso(-0.06, 0.06) : -e.x * 0.012 + acaso(-0.22, 0.22);
  e.t0 = 0; e.atraso = 0; e.espalha = 0; e.impulso = 0; e.teleporte = 1; e.sem = acaso();
  e.reforma = -1; e.limpar = 0;
}
for (let i = 0, ini = 0; i < N_ESTATUAS; i++, ini += POOL) {
  const e = { ini, n: POOL };
  estatuas.push(e);
  colocarEstatua(e, 22 + i * ESP_ESTATUAS);
}

const logoCiclo = { a: 0, b: 0, t0: 0, atraso: 0, fim: 0 };
function escreverGrupos(agora) {
  estatuas.forEach((e, i) => {
    const o = i * 20, a = FIGS[e.fig], b = FIGS[e.figNova];
    gF[o] = e.x; gF[o + 1] = e.y + (e.y > 0 ? Math.sin(tempo * 0.7 + e.sem * 9) * 1.2 + R.grave * 0.8 : 0); gF[o + 2] = e.z; gF[o + 3] = e.escala;
    gF[o + 4] = Math.cos(e.rot); gF[o + 5] = Math.sin(e.rot); gU[o + 6] = 0; gU[o + 7] = e.n;
    gU[o + 8] = a.inicio; gU[o + 9] = a.n; gU[o + 10] = b.inicio; gU[o + 11] = b.n;
    gF[o + 12] = e.t0; gF[o + 13] = e.atraso; gF[o + 14] = e.espalha; gF[o + 15] = e.impulso;
    gU[o + 16] = e.teleporte; gF[o + 17] = e.sem; gF[o + 18] = e.escala / (b.linhas ?? meta.linhas) * 1.06; gU[o + 19] = (a.mat ?? 0) | ((b.mat ?? 0) << 4);
  });
  const o = N_ESTATUAS * 20;
  const la = LOGOS[logoCiclo.a], lb = LOGOS[logoCiclo.b];
  gU[o + 6] = 1; gU[o + 7] = LOGO_N;
  gU[o + 8] = la.inicio; gU[o + 9] = la.n; gU[o + 10] = lb.inicio; gU[o + 11] = lb.n;
  gF[o + 12] = logoCiclo.t0; gF[o + 13] = logoCiclo.atraso;
  gF[o + 18] = 0;   // os voxels do logo ficam sem tamanho: quem desenha o logo é pLogo, liso
  gpu.queue.writeBuffer(bufGrupos, 0, grupoBytes);
  for (const e of estatuas) { e.teleporte = 0; e.impulso = 0; }
}

// ---------- pedras e cristais ----------
const VARIANTES = [
  { expoente: 2.4, forma: [1, 0.62, 1] },
  { expoente: 4.5, forma: [1, 0.55, 0.8] },
  { expoente: 2.0, forma: [1, 0.72, 0.9] },
  { expoente: 6.0, forma: [0.8, 0.8, 0.8] },
  { expoente: 3.0, forma: [1.1, 0.42, 1] },
].map((o, i) => {
  const m = malhaPedra(i * 17 + 3, o);
  return { ...m, vb: buffer(m.dados, U.VERTEX), ib: buffer(m.ind, U.INDEX), qtdInd: m.ind.length, primeiro: 0, qtd: 0 };
});
const ESP_ROCHAS = 11;
const rochas = [];
const cristaisDados = [];
for (let i = 0; i < N_ROCHAS; i++) {
  const v = Math.floor(i * VARIANTES.length / N_ROCHAS), V = VARIANTES[v];
  if (!V.qtd) V.primeiro = i;
  V.qtd++;
  const r = { v, sem: acaso(), desl: [acaso(-20, 20), acaso(-20, 20), acaso(-20, 20)], eixo: [acaso(-0.3, 0.3), 1, acaso(-0.3, 0.3)], giro: acaso(0, 6.28), vel: acaso(-0.05, 0.05) };
  rochas.push(r);
  // pedaços de cristal: grudados em volta da pedra, mais nas beiradas (de baixo é o que se vê)
  for (let c = 0, nc = 2 + Math.floor(acaso(0, 3)); c < nc; c++) {
    let iv = 0;
    for (let t = 0; t < 12; t++) { iv = Math.floor(acaso(0, V.n)); if (Math.abs(V.nor[iv * 3 + 1]) < 0.75) break; }
    const px = V.pos[iv * 3], py = V.pos[iv * 3 + 1], pz = V.pos[iv * 3 + 2];
    const nx = V.nor[iv * 3], ny = V.nor[iv * 3 + 1], nz = V.nor[iv * 3 + 2];
    for (let k = 0, q = 8 + Math.floor(acaso(0, 14)); k < q; k++) {
      let dx = nx + acaso(-0.6, 0.6), dy = ny + acaso(-0.6, 0.6), dz = nz + acaso(-0.6, 0.6);
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const comp = acaso(0.18, 0.72);
      cristaisDados.push({
        p: [px + acaso(-0.13, 0.13) - nx * 0.04, py + acaso(-0.13, 0.13) - ny * 0.04, pz + acaso(-0.13, 0.13) - nz * 0.04],
        r: i, d: [dx, dy, dz], comp, raio: comp * acaso(0.11, 0.2), sem: acaso(),
      });
    }
  }
}
const colocarRocha = (r, z) => {
  r.x = acaso(-30, 30);
  r.y = acaso(9, 60);
  r.z = z;
  r.esc = acaso(2.8, 12) * (1 + r.y / 90) * (QUENTE ? 0.7 : 1);
  r.y = Math.max(r.y, 6 + r.esc * 0.7);
};
rochas.sort(() => 0);
rochas.forEach((r, i) => colocarRocha(r, acaso(8, ESP_ROCHAS * N_ROCHAS)));
const rochaF = new Float32Array(N_ROCHAS * 20);
const bufRochas = buffer(null, U.STORAGE | U.COPY_DST, rochaF.byteLength);

const cristaisBytes = new ArrayBuffer(cristaisDados.length * 48);
{
  const f = new Float32Array(cristaisBytes), u = new Uint32Array(cristaisBytes);
  cristaisDados.forEach((c, i) => {
    const o = i * 12;
    f.set(c.p, o); u[o + 3] = c.r; f.set(c.d, o + 4); f[o + 7] = c.comp; f[o + 8] = c.raio; f[o + 9] = c.sem;
  });
}
const bufCristais = buffer(new Uint8Array(cristaisBytes), U.STORAGE);

function escreverRochas(t, dt) {
  for (let i = 0; i < N_ROCHAS; i++) {
    const r = rochas[i];
    r.giro += r.vel * dt;
    const c = Math.cos(r.giro), s = Math.sin(r.giro), e = r.esc;
    const boia = Math.sin(t * 0.5 + r.sem * 20) * 1.1 + R.bumbo * R.bumbo * 1.6 * (r.sem - 0.3);
    const o = i * 20;
    rochaF.set([c * e, 0, -s * e, 0, 0, e, 0, 0, s * e, 0, c * e, 0, r.x, r.y + boia, r.z, 1], o);
    rochaF.set([r.desl[0], r.desl[1], r.desl[2], r.sem], o + 16);
  }
  gpu.queue.writeBuffer(bufRochas, 0, rochaF);
}

// ---------- malhas ----------
const cubo = malhaCubo(), cristal = malhaCristal();
const vbCubo = buffer(cubo, U.VERTEX), vbCristal = buffer(cristal, U.VERTEX);
const nCristalV = cristal.length / 6;

// ---------- vistas: cada parte do LED é uma janela para o mesmo mundo, vista do mesmo olho ----------
const QUASE = 0.1;
function criarVista(n, D, Ux, Uy, C, hw, hh, y0, h, canto, ladoU, ladoV) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cx = dot(C, Ux), cy = dot(C, Uy);
  const rx = [0, 1, 2].map(i => (D * Ux[i] - cx * n[i]) / hw);
  const ry = [0, 1, 2].map(i => (D * Uy[i] - cy * n[i]) / hh);
  return {
    n, y0, h, canto, ladoU, ladoV, kpx: D / hw * RW / 2,
    m: [rx[0], ry[0], 0, n[0], rx[1], ry[1], 0, n[1], rx[2], ry[2], 0, n[2], 0, 0, QUASE, 0],
  };
}
const XC = XL + 0.96;
const VISTAS = LENTE === 'janela' ? [
  // teto: olhando para cima; o alto da imagem (linha 0) é a ponta da entrada
  criarVista([0, 1, 0], HT, [1, 0, 0], [0, 0, -1], [XC, HT, ZF - DOBRA * PASSO / 2], 0.96, DOBRA * PASSO / 2, 0, RD,
    [XL, HT, ZF - DOBRA * PASSO], [1.92, 0, 0], [0, 0, DOBRA * PASSO]),
  // parede do DJ
  criarVista([0, 0, 1], ZF, [1, 0, 0], [0, 1, 0], [XC, HT - 0.64, ZF], 0.96, 0.64, RD, RH - RD,
    [XL, HT, ZF], [1.92, 0, 0], [0, -1.28, 0]),
] : [
  // plana: uma janela alta só, de pé
  (() => {
    const yt = 1.9, yb = -0.05, hh = (yt - yb) / 2, hw = hh * LARG / ALT;
    return criarVista([0, 0, 1], 1, [1, 0, 0], [0, 1, 0], [0, (yt + yb) / 2, 1], hw, hh, 0, RH,
      [-hw, yt, 1], [hw * 2, 0, 0], [0, yb - yt, 0]);
  })(),
];
// o logo fica preso ao olho, no meio da parede do DJ
const logoEye = (() => {
  if (LENTE === 'janela') {
    const d = 12, k = d / ZF;
    return [XC * k, (HT - 0.64) * k, d, 1.92 * 0.72 * k];
  }
  const v = VISTAS[0], d = 12, yt = 1.9, yb = -0.05;
  const yc = yb + (ALT - DOBRA) / ALT * (yt - yb) / 2;
  return [0, yc * d, d, (yt - yb) * LARG / ALT * 0.72 * d];
})();
const UBO_PASSO = 256;
const bufVista = buffer(null, U.UNIFORM | U.COPY_DST, UBO_PASSO * VISTAS.length);
const vistaF = new Float32Array(UBO_PASSO * VISTAS.length / 4);

function mul4(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) o[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
  return o;
}

// ---------- uniforme global ----------
const globalF = new Float32Array(144);
// listas de voxels visíveis, uma por vista: primeiros 16 bytes = argumentos do desenho indireto
const bufListas = [0, 1].map(() => {
  const b = gpu.createBuffer({ size: 16 + N_VOX * 4, usage: U.STORAGE | U.INDIRECT | U.COPY_DST });
  gpu.queue.writeBuffer(b, 0, new Uint32Array([36, 0, 0, 0]));
  return b;
});
const zero = new Uint32Array([0]);
const bufGlobal = buffer(null, U.UNIFORM | U.COPY_DST, globalF.byteLength);

// ---------- pipelines ----------
const moduloRender = gpu.createShaderModule({ code: RENDER });
const moduloCompute = gpu.createShaderModule({ code: COMPUTE_VOXELS });
const relatarShader = async (m, nome) => {
  const i = await m.getCompilationInfo();
  for (const e of i.messages) if (e.type === 'error') { const t = `${nome}:${e.lineNum}:${e.linePos} ${e.message}`; erros.push(t); console.error(t); hud.style.display = 'block'; }
};
relatarShader(moduloRender, 'render'); relatarShader(moduloCompute, 'compute');

const bglCompute = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
] });
const pipeCompute = await gpu.createComputePipelineAsync({
  layout: gpu.createPipelineLayout({ bindGroupLayouts: [bglCompute] }),
  compute: { module: moduloCompute, entryPoint: 'passo' },
});
const bgCompute = gpu.createBindGroup({ layout: bglCompute, entries: [
  { binding: 0, resource: { buffer: bufGlobal } }, { binding: 1, resource: { buffer: bufVox } },
  { binding: 2, resource: { buffer: bufFig } }, { binding: 3, resource: { buffer: bufGrupos } },
  { binding: 4, resource: { buffer: bufListas[0] } }, { binding: 5, resource: { buffer: bufListas[1] } },
] });

const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const bgl0 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
  { binding: 1, visibility: VF, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 112 } },
] });
const bgl1 = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
  { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } },
  { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
  { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
  { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
  { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '3d' } },
  { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
] });
const layoutRender = gpu.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });
const bg0 = gpu.createBindGroup({ layout: bgl0, entries: [
  { binding: 0, resource: { buffer: bufGlobal } },
  { binding: 1, resource: { buffer: bufVista, size: 112 } },
] });
const texRuido = gpu.createTexture({ size: [32, 32, 32], dimension: '3d', format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
{
  const d = new Uint8Array(32 * 32 * 32);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(acaso(0, 256));
  gpu.queue.writeTexture({ texture: texRuido }, d, { bytesPerRow: 32, rowsPerImage: 32 }, [32, 32, 32]);
}
const amRuido = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
const bg1s = bufListas.map(lista => gpu.createBindGroup({ layout: bgl1, entries: [
  { binding: 0, resource: { buffer: bufVox } }, { binding: 1, resource: { buffer: bufGrupos } },
  { binding: 2, resource: { buffer: bufRochas } }, { binding: 3, resource: { buffer: bufCristais } },
  { binding: 4, resource: { buffer: lista } }, { binding: 5, resource: texRuido.createView({ dimension: '3d' }) },
  { binding: 6, resource: amRuido },
] }));

const HDR = 'rgba16float', PROF = 'depth32float';
const vbMalha = [{ arrayStride: 24, attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
] }];
const multisample = { count: MSAA };
const pipe = (vs, fs, extra = {}) => gpu.createRenderPipelineAsync({
  layout: layoutRender,
  vertex: { module: moduloRender, entryPoint: vs, buffers: extra.buffers ?? [] },
  fragment: { module: moduloRender, entryPoint: fs, targets: [{ format: HDR, blend: extra.blend }] },
  primitive: { topology: 'triangle-list', cullMode: extra.cull ?? 'none' },
  depthStencil: { format: PROF, depthWriteEnabled: extra.escreve ?? true, depthCompare: extra.compara ?? 'greater' },
  multisample,
});
const [pCeu, pVoxel, pRocha, pCristal, pPo] = await Promise.all([
  pipe('vsCeu', 'fsCeu', { escreve: false, compara: 'always' }),
  pipe('vsVoxel', 'fsVoxel', { buffers: vbMalha, cull: 'back' }),
  pipe('vsRocha', 'fsRocha', { buffers: vbMalha }),
  pipe('vsCristal', 'fsCristal', { buffers: vbMalha }),
  pipe('vsPo', 'fsPo', { escreve: false, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }),
]);

// ---------- alvos ----------
const USO_ALVO = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
const tamPainel = [RW, RH];
const texMSAA = MSAA > 1 ? gpu.createTexture({ size: tamPainel, format: HDR, sampleCount: MSAA, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
const texHDR = gpu.createTexture({ size: tamPainel, format: HDR, usage: USO_ALVO });
const texProf = gpu.createTexture({ size: tamPainel, format: PROF, sampleCount: MSAA, usage: GPUTextureUsage.RENDER_ATTACHMENT });
const vHDR = texHDR.createView(), vProf = texProf.createView(), vMSAA = texMSAA && texMSAA.createView();

const amostrador = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

// bloom: pirâmide de texturas
const NIVEIS = 6;
const flor = [];
for (let i = 0, w = RW, h = RH; i < NIVEIS; i++) {
  w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
  flor.push({ tex: gpu.createTexture({ size: [w, h], format: HDR, usage: USO_ALVO }), w, h });
}
flor.forEach(f => { f.view = f.tex.createView(); });
const moduloPos = gpu.createShaderModule({ code: POS });
relatarShader(moduloPos, 'pos');
const parBytes = 112;
const parUBO = (texel, limiar, forca) => {
  const b = buffer(null, U.UNIFORM | U.COPY_DST, parBytes);
  gpu.queue.writeBuffer(b, 0, new Float32Array([texel[0], texel[1], limiar, forca, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  return b;
};
const bglPos = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
  { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
  { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
] });
const layoutPos = gpu.createPipelineLayout({ bindGroupLayouts: [bglPos] });
const pDesce = await gpu.createRenderPipelineAsync({ layout: layoutPos, vertex: { module: moduloPos, entryPoint: 'vs' },
  fragment: { module: moduloPos, entryPoint: 'fsDesce', targets: [{ format: HDR }] } });
const pSobe = await gpu.createRenderPipelineAsync({ layout: layoutPos, vertex: { module: moduloPos, entryPoint: 'vs' },
  fragment: { module: moduloPos, entryPoint: 'fsSobe', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] } });
const passosDesce = flor.map((f, i) => {
  const fonte = i === 0 ? vHDR : flor[i - 1].view;
  const w = i === 0 ? RW : flor[i - 1].w, h = i === 0 ? RH : flor[i - 1].h;
  return { alvo: f.view, bg: gpu.createBindGroup({ layout: bglPos, entries: [
    { binding: 0, resource: fonte }, { binding: 1, resource: amostrador },
    { binding: 2, resource: { buffer: parUBO([1 / w, 1 / h], i === 0 ? 1.35 : 0, 1) } },
  ] }) };
});
const passosSobe = [];
for (let i = NIVEIS - 2; i >= 0; i--) {
  passosSobe.push({ alvo: flor[i].view, bg: gpu.createBindGroup({ layout: bglPos, entries: [
    { binding: 0, resource: flor[i + 1].view }, { binding: 1, resource: amostrador },
    { binding: 2, resource: { buffer: parUBO([1 / flor[i + 1].w, 1 / flor[i + 1].h], 0, 0.85) } },
  ] }) });
}

// tons
const moduloTons = gpu.createShaderModule({ code: TONS });
relatarShader(moduloTons, 'tons');
const bufTons = buffer(null, U.UNIFORM | U.COPY_DST, parBytes);
const bglTons = gpu.createBindGroupLayout({ entries: [
  { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
  { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
  { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
] });
const LDR = 'rgba8unorm';
const pTons = await gpu.createRenderPipelineAsync({ layout: gpu.createPipelineLayout({ bindGroupLayouts: [bglTons] }),
  vertex: { module: moduloTons, entryPoint: 'vs' }, fragment: { module: moduloTons, entryPoint: 'fs', targets: [{ format: SAIDA ? FORMATO : LDR }] } });
const bgTons = gpu.createBindGroup({ layout: bglTons, entries: [
  { binding: 0, resource: vHDR }, { binding: 1, resource: amostrador }, { binding: 2, resource: { buffer: bufTons } }, { binding: 3, resource: flor[0].view },
] });

// Logo do CLUBE na parede: desenho liso em cromo, por cima da imagem. Nunca sai; cresce e escorrega em fatias com o som.
const bmpLogo = await createImageBitmap(await (await fetch('../assets/letreiros/clube.png')).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
const texLogoLiso = gpu.createTexture({ size: [bmpLogo.width, bmpLogo.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
gpu.queue.copyExternalImageToTexture({ source: bmpLogo }, { texture: texLogoLiso }, [bmpLogo.width, bmpLogo.height]);
const fLogo = new Float32Array(8);
const bufLogo = gpu.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const moduloLogo = gpu.createShaderModule({ code: /* wgsl */`
struct L { r: vec4f, s: vec4f };
@group(0) @binding(0) var<uniform> U: L;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var am: sampler;
struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = q[i];
  let px = U.r.xy + c * U.r.zw * 1.04;
  var o: S;
  o.pos = vec4f(px.x / 1032. * 2. - 1., 1. - px.y / 5676. * 2., 0., 1.);
  o.uv = (c * 1.04) * .5 + .5;
  return o;
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  let fatia = floor(i.uv.y * 7.);
  let lado = (fatia * 5.) % 3. - 1.;
  let a = textureSampleLevel(tex, am, i.uv + vec2f((lado + U.s.w * .001) * U.s.y * .016, 0.), 0.).a;
  // cromo: céu claro em cima, horizonte escuro no meio, chão quente embaixo
  let y = i.uv.y + .1 * sin(i.uv.x * 5. + U.s.x * .4);
  var lum = mix(vec3f(1., 1., 1.), vec3f(.55, .6, .72), smoothstep(.0, .46, y));
  lum = mix(lum, vec3f(.07, .07, .1), smoothstep(.42, .5, y));
  lum = mix(lum, vec3f(.9, .82, .72), smoothstep(.5, .86, y));
  let varre = exp(-pow((i.uv.x + i.uv.y * .3 - fract(U.s.x * .22) * 1.8 + .3) / .05, 2.));
  let cor = lum * (1. + U.s.y * .3 + U.s.z * .18) + vec3f(varre * .7);
  // sombra em volta da letra: o logo se lê mesmo com estátua clara passando atrás
  var halo = 0.;
  for (var k = 0; k < 8; k++) {
    let t = f32(k) * .7854;
    halo += textureSampleLevel(tex, am, i.uv + vec2f(cos(t) * .018, sin(t) * .07), 0.).a;
  }
  let sombra = clamp(halo / 8. * 1.5, 0., 1.) * .72;
  let fora = max(a, sombra);
  return vec4f(cor * a, fora);
}
` });
relatarShader(moduloLogo, 'logo');
const pLogo = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: moduloLogo, entryPoint: 'vs' },
  fragment: { module: moduloLogo, entryPoint: 'fs', targets: [{ format: SAIDA ? FORMATO : LDR, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] } });
const bgLogo = gpu.createBindGroup({ layout: pLogo.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufLogo } }, { binding: 1, resource: texLogoLiso.createView() }, { binding: 2, resource: amostrador }] });

// filtro vertical da saída para o LED
let filtroLED = null;
if (SAIDA && LED) {
  const tex = gpu.createTexture({ size: tamPainel, format: FORMATO, usage: USO_ALVO });
  const mod = gpu.createShaderModule({ code: FILTRO_LED });
  relatarShader(mod, 'filtro');
  const pipeF = await gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: FORMATO }] } });
  const bufP = gpu.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const mandarP = () => gpu.queue.writeBuffer(bufP, 0, new Float32Array([REACOES.tela.antiBanding, 0, 0, 0]));
  mandarP(); setInterval(mandarP, 1000);
  filtroLED = { alvo: tex.createView(), pipe: pipeF, bg: gpu.createBindGroup({ layout: pipeF.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: amostrador }, { binding: 2, resource: { buffer: bufP } }] }) };
}

// prévia: sala + painel
let previa = null;
if (!SAIDA) {
  const NIV = Math.floor(Math.log2(RH)) - 1;
  const texLDR = gpu.createTexture({ size: tamPainel, format: LDR, mipLevelCount: NIV, usage: USO_ALVO });
  const vistaNivel = n => texLDR.createView({ baseMipLevel: n, mipLevelCount: 1 });
  const moduloMips = gpu.createShaderModule({ code: MIPS });
  const bglM = gpu.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
  ] });
  const pM = await gpu.createRenderPipelineAsync({ layout: gpu.createPipelineLayout({ bindGroupLayouts: [bglM] }),
    vertex: { module: moduloMips, entryPoint: 'vs' }, fragment: { module: moduloMips, entryPoint: 'fs', targets: [{ format: LDR }] } });
  const mips = [];
  for (let n = 1; n < NIV; n++) mips.push({ alvo: vistaNivel(n), bg: gpu.createBindGroup({ layout: bglM, entries: [{ binding: 0, resource: vistaNivel(n - 1) }, { binding: 1, resource: amostrador }] }) });

  const imagem = await createImageBitmap(await (await fetch('../perspectiva/guia-h3.jpg')).blob());
  const texGuia = gpu.createTexture({ size: [imagem.width, imagem.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  gpu.queue.copyExternalImageToTexture({ source: imagem }, { texture: texGuia }, [imagem.width, imagem.height]);
  const moduloPrevia = gpu.createShaderModule({ code: PREVIA });
  relatarShader(moduloPrevia, 'previa');
  const bglP = gpu.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
  ] });
  const pP = await gpu.createRenderPipelineAsync({ layout: gpu.createPipelineLayout({ bindGroupLayouts: [bglP] }),
    vertex: { module: moduloPrevia, entryPoint: 'vs' }, fragment: { module: moduloPrevia, entryPoint: 'fs', targets: [{ format: FORMATO }] } });
  const bufP = buffer(null, U.UNIFORM | U.COPY_DST, parBytes);
  const bg = gpu.createBindGroup({ layout: bglP, entries: [
    { binding: 0, resource: texLDR.createView() }, { binding: 1, resource: amostrador }, { binding: 2, resource: { buffer: bufP } }, { binding: 3, resource: texGuia.createView() },
  ] });
  previa = { vista0: vistaNivel(0), mips, pM, pP, bg, bufP };
  const W = tela.width, H = tela.height;
  const painelW = Math.round(H * LARG / ALT);
  const salaW = Math.min(Math.round(H * 0.75), W - painelW - 16), salaH = Math.round(salaW / 0.75);
  gpu.queue.writeBuffer(bufP, 0, new Float32Array([0, 0, 0, 0, 0, 0, 0, 0,
    W, H, ESCALA, 0,
    W - painelW, 0, painelW, H,
    0, Math.round((H - salaH) / 2), salaW, salaH, 0, 0, 0, 0, 0, 0, 0, 0]));
}

// ---------- som ----------
const R = { bumbo: 0, idade: 10, grave: 0, medio: 0, agudo: 0, nivel: 0, fase: 0, bpm: BPM_RELOGIO, cheio: 1, faixas: new Float32Array(NF), ultimaBatida: -1 };
function bater(forca = 1) {
  R.bumbo = Math.max(R.bumbo, forca);
  R.idade = 0;
  for (const e of estatuas) e.impulso = Math.max(e.impulso, 0.09 * forca);
}
A.aoBumbo = bater;
const pedidoAudio = Q.get('audio') ?? (SAIDA ? '' : 'teste');
ligarAudio(pedidoAudio);

function atualizarSom(dt) {
  analisarAudio(dt);
  if (A.an && A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
  const vivo = audioVivo();
  R.idade += dt;
  if (vivo) {
    R.grave = A.grave; R.medio = A.medio; R.agudo = A.agudo; R.nivel = A.nivel;
    R.faixas.set(A.faixas);
    R.bumbo = Math.max(R.bumbo * Math.exp(-dt * 7), 0);
    if (audioNoComando()) { R.fase = A.fase; R.bpm = A.bpm; }
    else R.fase += dt * R.bpm / 60;
    R.cheio += (Math.min(1, R.nivel * 1.7) - R.cheio) * (1 - Math.exp(-dt * 1.5));
  } else {
    // sem música: batida interna, para o visual nunca ficar parado
    R.bpm = BPM_RELOGIO;
    R.fase += dt * R.bpm / 60;
    const b = Math.floor(R.fase), fr = R.fase - b;
    if (b !== R.ultimoRelogio) { R.ultimoRelogio = b; bater(1); }
    R.bumbo *= Math.exp(-dt * 7);
    const chimbal = Math.exp(-((fr + 0.5) % 1) * 7);
    R.grave += (Math.exp(-fr * 5) * 0.9 - R.grave) * (1 - Math.exp(-dt * 30));
    R.medio += (0.3 + 0.25 * Math.sin(R.fase * 0.7) - R.medio) * (1 - Math.exp(-dt * 8));
    R.agudo += (chimbal * 0.8 - R.agudo) * (1 - Math.exp(-dt * 30));
    R.nivel = (R.grave + R.medio + R.agudo) / 3;
    for (let i = 0; i < NF; i++) {
      const x = i / (NF - 1);
      const ondinha = 0.5 + 0.5 * Math.sin(R.fase * 1.6 + i * 0.55) * Math.sin(R.fase * 0.37 + i * 0.13);
      const alvo = x < 0.25 ? R.grave * (1 - x * 2) : x > 0.7 ? R.agudo * (0.4 + 0.6 * ondinha) : (0.15 + R.medio) * ondinha;
      R.faixas[i] += (alvo - R.faixas[i]) * (1 - Math.exp(-dt * 25));
    }
    R.cheio += (1 - R.cheio) * (1 - Math.exp(-dt * 1.5));
  }
}

// ---------- roteiro: a cada 4 compassos uma estátua explode e volta como outra figura ----------
function aoBater(b) {
  if (Q.get('estouro') !== '0' && b % 16 === 8) {
    const vivas = estatuas.filter(e => { const dz = e.z - camera.z; return dz > 95 && dz < 230 && e.reforma < 0; }).sort((p, q) => p.z - q.z);
    const e = vivas[0];
    if (e) {
      e.espalha = 1;
      e.t0 = 1e9;
      e.impulso = 0.12;
      e.reforma = b + 4;
    }
  }
  if (LOGOS.length > 1 && b % 8 === 0 && !logoCiclo.fim) {
    logoCiclo.b = (logoCiclo.a + 1) % LOGOS.length;
    logoCiclo.t0 = tempo;
    logoCiclo.atraso = 0.55;
    logoCiclo.fim = tempo + 0.7;
  }
  for (const e of estatuas) {
    if (e.reforma === b) {
      e.figNova = e.fig >= N_BASE ? e.fig : QUENTE && e.fig >= N_CLUBE ? proximoPersonagem() : proximaFigura();
      e.t0 = tempo;
      e.atraso = 1.1;
      e.reforma = -1;
      e.limpar = tempo + 1.8;
    }
  }
}

// ---------- quadro ----------
let tempo = 0, ultimo = performance.now(), medidas = [], quadros = 0, ultimoHud = 0;
const corAtual = {};
for (const k of Object.keys(PALETAS.h3)) corAtual[k] = cor(PALETAS[paletaAtual][k]);
const SOL = (() => { const v = [0.34, 0.62, -0.5], l = Math.hypot(...v); return v.map(x => x / l); })();

function atualizarCamera(dt) {
  const alvo = 6 * (1 + R.bumbo * R.bumbo * 1.7 + R.grave * 0.7);
  camera.vel += (alvo - camera.vel) * (1 - Math.exp(-dt * 6));
  camera.z += camera.vel * dt;
  if (logoCiclo.fim && tempo > logoCiclo.fim) { logoCiclo.a = logoCiclo.b; logoCiclo.t0 = 0; logoCiclo.atraso = 0; logoCiclo.fim = 0; }
  for (const e of estatuas) {
    if (e.limpar && tempo > e.limpar) { e.fig = e.figNova; e.t0 = 0; e.atraso = 0; e.espalha = 0; e.limpar = 0; }
    if (e.z < camera.z - 42 && e.reforma < 0 && !e.limpar) {
      const longe = Math.max(...estatuas.map(o => o.z));
      colocarEstatua(e, longe + ESP_ESTATUAS);
    }
  }
  for (const r of rochas) if (r.z < camera.z - 55) colocarRocha(r, camera.z + ESP_ROCHAS * N_ROCHAS - 55 + acaso(-20, 20));
}

function escreverQuadro(dt) {
  const yaw = Math.sin(tempo * 0.11) * 0.025, roll = Math.sin(tempo * 0.17 + 1) * 0.012 + Math.sin(R.fase * Math.PI) * 0.0025 * R.grave;
  const pitch = camera.inclina + R.bumbo * R.bumbo * 0.006;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // frente, cima, direita (x direita, y cima, z frente)
  const fr = [sy * cp, sp, cy * cp];
  let dir = [cy, 0, -sy];
  let up = [fr[1] * dir[2] - fr[2] * dir[1], fr[2] * dir[0] - fr[0] * dir[2], fr[0] * dir[1] - fr[1] * dir[0]];
  // cima = frente × direita tem sinal invertido neste mundo (mão esquerda)
  if (up[1] < 0) up = up.map(x => -x);
  const dr = dir.map((x, i) => x * cr + up[i] * sr), ur = up.map((x, i) => -dir[i] * sr + x * cr);
  const E = [Math.sin(tempo * 0.09) * 1.4, 2.3 + Math.sin(tempo * 0.13) * 0.25, camera.z];
  camera.E = E;

  const g = globalF;
  g.set(E, 0); g[3] = tempo;
  g.set(dr, 4); g[7] = dt;
  g.set(ur, 8); g[11] = R.bumbo;
  g.set(fr, 12); g[15] = R.idade;
  g[16] = R.grave; g[17] = R.medio; g[18] = R.agudo; g[19] = R.nivel;
  g[20] = R.fase; g[21] = BRILHO; g[22] = R.cheio; g[23] = camera.vel;
  g.set(corAtual.topo, 24); g.set(corAtual.meioE, 28); g.set(corAtual.meioD, 32); g.set(corAtual.horE, 36);
  g.set(corAtual.horD, 40); g.set(corAtual.chao, 44); g.set(corAtual.cristal, 48); g.set([...SOL, 0], 52);
  g.set(logoEye, 56);
  g.set(R.faixas, 60);

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const V = [dr[0], ur[0], fr[0], 0, dr[1], ur[1], fr[1], 0, dr[2], ur[2], fr[2], 0, -dot(dr, E), -dot(ur, E), -dot(fr, E), 1];
  VISTAS.forEach((v, i) => {
    const o = i * UBO_PASSO / 4, vp = mul4(v.m, V);
    vistaF.set(vp, o);
    g.set(vp, 108 + i * 16);
    g[141 + i] = v.kpx;
    vistaF.set([...v.canto, v.kpx], o + 16);
    vistaF.set([...v.ladoU, 0], o + 20);
    vistaF.set([...v.ladoV, 0], o + 24);
  });
  g[140] = VISTAS.length;
  g[143] = QUENTE ? 1 : 0;
  gpu.queue.writeBuffer(bufGlobal, 0, g);
  gpu.queue.writeBuffer(bufVista, 0, vistaF);
  for (const b of bufListas) gpu.queue.writeBuffer(b, 4, zero);
  gpu.queue.writeBuffer(bufTons, 0, new Float32Array([0, 0, 0, 0, BRILHO, tempo % 97, R.bumbo, 0]));
}

function desenhar(alvoFinal) {
  const enc = gpu.createCommandEncoder();
  const cp = enc.beginComputePass();
  cp.setPipeline(pipeCompute);
  cp.setBindGroup(0, bgCompute);
  cp.dispatchWorkgroups(Math.ceil(N_VOX / 256));
  cp.end();

  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: MSAA > 1 ? vMSAA : vHDR, resolveTarget: MSAA > 1 ? vHDR : undefined, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: MSAA > 1 ? 'discard' : 'store' }],
    depthStencilAttachment: { view: vProf, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  });
  VISTAS.forEach((v, i) => {
    pass.setBindGroup(1, bg1s[i]);
    pass.setViewport(0, v.y0, RW, v.h, 0, 1);
    pass.setScissorRect(0, v.y0, RW, v.h);
    pass.setBindGroup(0, bg0, [i * UBO_PASSO]);
    pass.setPipeline(pCeu);
    pass.draw(3);
    pass.setPipeline(pRocha);
    for (const m of VARIANTES) {
      pass.setVertexBuffer(0, m.vb);
      pass.setIndexBuffer(m.ib, 'uint32');
      pass.drawIndexed(m.qtdInd, m.qtd, 0, 0, m.primeiro);
    }
    pass.setPipeline(pCristal);
    pass.setVertexBuffer(0, vbCristal);
    pass.draw(nCristalV, cristaisDados.length);
    pass.setPipeline(pVoxel);
    pass.setVertexBuffer(0, vbCubo);
    pass.drawIndirect(bufListas[i], 0);
    pass.setPipeline(pPo);
    pass.draw(6, N_PO);
  });
  pass.end();

  for (const p of passosDesce) {
    const r = enc.beginRenderPass({ colorAttachments: [{ view: p.alvo, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    r.setPipeline(pDesce); r.setBindGroup(0, p.bg); r.draw(3); r.end();
  }
  for (const p of passosSobe) {
    const r = enc.beginRenderPass({ colorAttachments: [{ view: p.alvo, loadOp: 'load', storeOp: 'store' }] });
    r.setPipeline(pSobe); r.setBindGroup(0, p.bg); r.draw(3); r.end();
  }

  const vTela = contexto.getCurrentTexture().createView();
  const rt = enc.beginRenderPass({ colorAttachments: [{ view: filtroLED ? filtroLED.alvo : (SAIDA ? vTela : previa.vista0), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
  rt.setPipeline(pTons); rt.setBindGroup(0, bgTons); rt.draw(3);
  const hwLogo = 450 * (1 + R.bumbo * 0.05 + R.grave * 0.025);
  fLogo.set([516, 5332, hwLogo, hwLogo * bmpLogo.height / bmpLogo.width, tempo, R.bumbo, R.grave, 0]);
  gpu.queue.writeBuffer(bufLogo, 0, fLogo);
  rt.setPipeline(pLogo); rt.setBindGroup(0, bgLogo); rt.draw(6);
  rt.end();
  if (filtroLED) {
    const rf = enc.beginRenderPass({ colorAttachments: [{ view: vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    rf.setPipeline(filtroLED.pipe); rf.setBindGroup(0, filtroLED.bg); rf.draw(3); rf.end();
  }

  if (!SAIDA) {
    for (const m of previa.mips) {
      const r = enc.beginRenderPass({ colorAttachments: [{ view: m.alvo, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      r.setPipeline(previa.pM); r.setBindGroup(0, m.bg); r.draw(3); r.end();
    }
    const r = enc.beginRenderPass({ colorAttachments: [{ view: vTela, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    r.setPipeline(previa.pP); r.setBindGroup(0, previa.bg); r.draw(3); r.end();
  }
  gpu.queue.submit([enc.finish()]);
}

function quadro(agora) {
  const inicio = performance.now();
  const dt = Math.min((agora - ultimo) / 1000, 1 / 20);
  ultimo = agora;
  tempo += dt;
  atualizarSom(dt);
  const b = Math.floor(R.fase);
  if (b !== R.ultimaBatida) { R.ultimaBatida = b; aoBater(b); }
  atualizarCamera(dt);
  escreverGrupos(tempo);
  escreverRochas(tempo, dt);
  escreverQuadro(dt);
  desenhar();
  quadros++;
  medidas.push(performance.now() - inicio);
  if (agora - ultimoHud > 500) {
    const fps = quadros / ((agora - ultimoHud) / 1000), media = medidas.reduce((a, c) => a + c, 0) / medidas.length;
    window.__estado = { visual: QUENTE ? 'brinquedos' : 'universo', placa: adaptador.info.vendor + '/' + adaptador.info.architecture, fps: +fps.toFixed(1), cpuMs: +media.toFixed(2), voxels: N_VOX, resolucao: `${RW}x${RH}`, msaa: MSAA, lente: LENTE, audio: A.an ? A.entrada : A.estado, contexto: A.ctx && A.ctx.state, bpm: +R.bpm.toFixed(1), vivo: audioVivo(), erros: erros.slice(0, 5) };
    if (!SAIDA) {
      hud.textContent = `${fps.toFixed(0)} q/s · ${RW}×${RH} · ${(N_VOX / 1000).toFixed(0)} mil voxels · ${LENTE}\n` +
        `${A.an ? A.entrada : A.estado} · ${audioVivo() ? 'ouvindo o bumbo' : 'batida interna'} · ${R.bpm.toFixed(0)} BPM\n` +
        (erros.length ? erros.slice(0, 3).join('\n') : '');
    }
    quadros = 0; ultimoHud = agora; medidas = [];
  }
  requestAnimationFrame(quadro);
}
window.__painel = { A, R, atual: { cena: 'universo', paleta: paletaAtual } };
requestAnimationFrame(t => { ultimo = t; ultimoHud = t; quadro(t); });
