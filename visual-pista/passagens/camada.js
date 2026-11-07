// Passagens: elementos de luz que atravessam o painel por cima de qualquer visual. Meteoros, faixas, varreduras, cometa, onda e dobra.
// Vão somando luz (alfa zero), então não apagam o que está embaixo. Nos visuais que contam onde está o logo (window.__logoTela), passam atrás das letras.
// Tudo é desenhado em coordenadas do painel (1032x5676). Reta no painel é reta para quem está em pé: a perspectiva vem de graça.
// Entra por mesa\saida\flash-pagina.js. Desligada, não abre a GPU; depois de desligar, para de desenhar assim que o último elemento some.
// O app liga cada um (itens passagens e pas* em /api/reacoes). Com música, o elemento que está pronto espera o próximo golpe (item pasSom).
import { REACOES } from '../js/reacoes.js';
import { A, audioVivo } from '../js/audio.js';

const TESTE = window.__passagensTeste || null;
const PW = 1032, PH = 5676, DOBRA = 4988, MEIO_PAREDE = DOBRA + 344;
const W = 1032, H = 2838;   // o sinal só tem 2160 linhas: mais do que isto não chega ao painel
const MAX = 128, CAMPOS = 12;
const HT = 2.3532 - 1.6, ZF = 4.39;

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// ---------- o que o app pediu ----------
const led = () => (TESTE && TESTE.led) || REACOES.led;
const ligada = () => (TESTE ? TESTE.ligado !== false : REACOES.led.passagens === 'ligado');
const TIPOS = {
  // quantos por segundo em "Médio"
  meteoros: { chave: 'pasMeteoros', padrao: 'ligado', ritmo: 0.55 },
  faixas: { chave: 'pasFaixas', padrao: 'ligado', ritmo: 0.15 },
  varredura: { chave: 'pasVarredura', padrao: 'ligado', ritmo: 0.1 },
  cometa: { chave: 'pasCometa', padrao: 'ligado', ritmo: 0.055 },
  onda: { chave: 'pasOnda', padrao: 'desligado', ritmo: 0.085 },
  dobra: { chave: 'pasDobra', padrao: 'desligado', ritmo: 0.04 },
};
const querTipo = n => (led()[TIPOS[n].chave] || TIPOS[n].padrao) === 'ligado';
const QUANTO = { pouco: 0.5, medio: 1, muito: 2 };
const FORCA = { suave: 0.5, medio: 0.8, forte: 1.15 };

// ---------- os elementos ----------
// kind 0 risco, 1 fita, 2 barra, 3 cometa, 4 anel
let vivos = [], agendados = [];
const acende = (t, dur, entra, sai) => clamp(t / entra) * clamp((dur - t) / sai);

function novoRisco({ x, y, dx, dy, vel, largura, cauda, forca, halo = 1, queima = 0, corte = 0 }) {
  const n = Math.hypot(dx, dy);
  dx /= n; dy /= n;
  // anda até a cauda inteira sair do painel, ou até queimar no meio do caminho
  let dur = 8;
  for (const [p, d, lim] of [[y, dy, dy > 0 ? PH : 0], [x, dx, dx > 0 ? PW : 0]]) {
    if (Math.abs(d) < 1e-3) continue;
    const fim = (lim - p + Math.sign(d) * cauda * Math.abs(d)) / d / vel;
    if (fim > 0) dur = Math.min(dur, fim);
  }
  if (queima) dur *= queima;
  vivos.push({ kind: 0, t: 0, dur, x, y, dx, dy, vel, largura, cauda, forca, halo, corte, semente: Math.random() * 100, entra: 0.06, sai: queima ? 0.3 : 0.1 });
}

const LANCA = {
  meteoros() {
    const quantos = Math.random() < 0.18 ? 3 : Math.random() < 0.35 ? 2 : 1;
    const atravessa = Math.random() < 0.16;
    const volta = Math.random() < 0.28;
    const base = rnd(-0.34, 0.34), x0 = rnd(100, 930), y0 = rnd(600, 3800);
    for (let i = 0; i < quantos; i++) {
      agendados.push({ em: i * rnd(0.05, 0.22), f: () => {
        if (atravessa) {
          // de lado a lado: corta o teto na diagonal
          const lado = Math.random() < 0.5 ? 1 : -1;
          novoRisco({ x: lado > 0 ? -120 : PW + 120, y: y0 + rnd(-260, 260), dx: lado, dy: rnd(0.8, 2.2), vel: rnd(2400, 3600), largura: rnd(8, 14), cauda: rnd(500, 950), forca: rnd(0.8, 1.2) });
        } else {
          novoRisco({ x: x0 + rnd(-220, 220) - (volta ? 0 : base * 800), y: volta ? PH + 80 : rnd(-300, -80), dx: base + rnd(-0.03, 0.03), dy: volta ? -1 : 1, vel: rnd(3600, 7200), largura: rnd(9, 18), cauda: rnd(1100, 2700), forca: rnd(0.85, 1.35), queima: Math.random() < 0.38 ? rnd(0.45, 0.85) : 0 });
        }
      } });
    }
  },
  faixas() {
    const quantas = Math.random() < 0.3 ? 3 : Math.random() < 0.45 ? 2 : 1;
    const sobe = Math.random() < 0.3;
    const vel = rnd(2800, 4600), x0 = rnd(180, 850), k = (Math.PI * 2) / rnd(2400, 4600), ph = rnd(0, 6.28), a = rnd(70, 230);
    for (let i = 0; i < quantas; i++) {
      const cauda = rnd(2600, 4600);
      agendados.push({ em: i * rnd(0.12, 0.26), f: () => vivos.push({ kind: 1, t: 0, dur: (PH + cauda + 200) / vel, y: sobe ? PH + 100 : -100, sinal: sobe ? -1 : 1, vel, x: x0 + (i - (quantas - 1) / 2) * rnd(150, 240), amp: a, k, ph: ph + i * 0.5, largura: rnd(70, 170), cauda, forca: rnd(0.7, 1.05), semente: Math.random() * 100, entra: 0.2, sai: 0.5 }) });
    }
  },
  varredura() {
    const r = Math.random();
    const trem = r < 0.35 ? 1 : r < 0.75 ? 3 : 4;
    const sobe = Math.random() < 0.4;
    const vel = rnd(4200, 5800), passo = rnd(0.13, 0.2);
    for (let i = 0; i < trem; i++) {
      const cauda = rnd(450, 1000);
      agendados.push({ em: i * passo, f: () => vivos.push({ kind: 2, t: 0, dur: (PH + cauda + 200) / vel, y: sobe ? PH + 80 : -80, sinal: sobe ? -1 : 1, vel, largura: rnd(14, 26), cauda, forca: rnd(0.75, 1) * (1 - i * 0.12), semente: Math.random() * 100, entra: 0.04, sai: 0.1 }) });
    }
  },
  cometa() {
    if (vivos.some(e => e.kind === 3)) return false;
    const sobe = Math.random() < 0.25, vel = rnd(620, 950), raio = rnd(36, 58), cauda = rnd(1800, 2900);
    const dx = rnd(-0.16, 0.16), dy = sobe ? -1 : 1, n = Math.hypot(dx, dy);
    const y = sobe ? PH + raio : -raio, x = rnd(200, 830) - (dx * PH) / 2;
    vivos.push({ kind: 3, t: 0, dur: (PH + cauda + 300) / vel, x, y, dx: dx / n, dy: dy / n, vel, largura: raio, cauda, forca: rnd(0.9, 1.15), semente: Math.random() * 100, entra: 0.8, sai: 1.2 });
    return true;
  },
  onda() {
    const quantas = Math.random() < 0.4 ? 2 : 1, vel = rnd(3800, 5000);
    for (let i = 0; i < quantas; i++) {
      agendados.push({ em: i * 0.24, f: () => vivos.push({ kind: 4, t: 0, dur: 6300 / vel, x: PW / 2, y: MEIO_PAREDE, vel, largura: rnd(18, 30), cauda: rnd(350, 700), forca: rnd(0.65, 0.9) * (1 - i * 0.3), semente: Math.random() * 100, entra: 0.03, sai: 0.3 }) });
    }
  },
  dobra() {
    // uma rajada: riscos saem da dobra e vêm para cima de quem está em pé, como salto no espaço
    const dur = rnd(2.4, 3.6), taxa = 30;
    for (let i = 0; i < dur * taxa; i++) {
      const em = i / taxa + Math.random() / taxa, env = Math.sin(Math.PI * clamp(em / dur)) ** 0.7;
      if (Math.random() > env) continue;
      agendados.push({ em, f: () => novoRisco({ x: rnd(0, PW), y: DOBRA + rnd(-300, 120), dx: 0, dy: -1, vel: rnd(5500, 10500), largura: rnd(3.5, 7.5), cauda: rnd(800, 2300), forca: rnd(0.45, 0.95) * env, halo: 0, corte: DOBRA }) });
    }
  },
};

// ---------- o som ----------
let pulso = 0, topo = 0.5, vale = 0.2, armado = true, ultimoGolpe = -9, relogio = 0, golpes = 0, lancados = 0;
function ouvir(dt) {
  const fonte = led().pasSom || 'bumbo';
  let alvo = 0;
  if (fonte !== 'desligado' && audioVivo() && A.rmsDb > REACOES.som.piso) {
    if (fonte === 'bumbo') alvo = Math.min(A.bumbo, 1);
    else {
      const v = fonte === 'medio' ? A.medio : fonte === 'agudo' ? A.agudo : fonte === 'volume' ? (A.grave + A.medio + A.agudo) / 3 : A.grave;
      topo = Math.max(v, topo - dt * 0.06);
      vale = Math.min(v, vale + dt * 0.06);
      alvo = clamp((v - vale) / Math.max(topo - vale, 0.18));
    }
  }
  pulso += (alvo - pulso) * (1 - Math.exp(-dt * (alvo > pulso ? 40 : 6)));
  let golpe = false;
  if (armado && alvo > 0.55 && relogio - ultimoGolpe > 0.18) { golpe = true; armado = false; ultimoGolpe = relogio; golpes++; }
  if (alvo < 0.3) armado = true;
  return { golpe, comSom: fonte !== 'desligado' && relogio - ultimoGolpe < 2.5 };
}

// ---------- o quadro ----------
const fila = {};
for (const n of Object.keys(TIPOS)) fila[n] = n === 'meteoros' || n === 'faixas' ? 0.92 : Math.random() * 0.7;
function lancar(dt) {
  const { golpe, comSom } = ouvir(dt);
  if (TESTE && TESTE.semSorteio) return;
  const q = QUANTO[led().pasQuanto] || 1;
  for (const n of Object.keys(TIPOS)) {
    if (!querTipo(n)) { fila[n] = Math.min(fila[n], 0.5); continue; }
    fila[n] += TIPOS[n].ritmo * q * dt * rnd(0.6, 1.4);
    // com música espera o golpe; se o golpe demorar demais (um break), vai assim mesmo
    if (fila[n] >= 1 && (!comSom || golpe || fila[n] >= 1.5)) {
      if (LANCA[n]() !== false) { fila[n] = -Math.random() * 0.5; lancados++; }
    }
  }
}

const dados = new Float32Array(MAX * CAMPOS);
function preencher(forcaGeral) {
  let n = 0;
  for (const e of vivos) {
    if (n >= MAX) break;
    const env = acende(e.t, e.dur, e.entra, e.sai);
    if (env <= 0) continue;
    const anda = e.vel * e.t;
    let x = e.x ?? 0, y = e.y, p1 = e.halo ?? 0, p2 = 0, p3 = 0;
    if (e.kind === 0 || e.kind === 3) { x += e.dx * anda; y += e.dy * anda; p2 = e.corte ?? 0; }
    else if (e.kind === 1) { y += e.sinal * anda; p1 = e.amp; p2 = e.k; p3 = e.ph; }
    else if (e.kind === 2) { y += e.sinal * anda; }
    else if (e.kind === 4) { p1 = anda; }
    dados.set([e.kind, x, y, e.forca * env * forcaGeral, e.dx ?? 0, e.dy ?? (e.sinal ?? 1), e.cauda, e.largura, e.semente, p1, p2, p3], n * CAMPOS);
    n++;
  }
  return n;
}

// ---------- GPU ----------
const FX = /* wgsl */`
struct Un { t: f32, r0: f32, r1: f32, r2: f32 };
struct Item { a: vec4f, b: vec4f, c: vec4f };   // a: tipo, x, y, força. b: dx, dy, cauda, largura. c: semente, e três por tipo
@group(0) @binding(0) var<uniform> u: Un;
@group(0) @binding(1) var<storage, read> itens: array<Item>;
struct S { @builtin(position) pos: vec4f, @location(0) p: vec2f, @location(1) @interpolate(flat) i: u32 };
const TAM = vec2f(${PW}., ${PH}.);
@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> S {
  var q = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let c = q[v];
  let e = itens[i];
  let k = u32(e.a.x);
  let cab = e.a.yz; let d = e.b.xy; let cauda = e.b.z; let w = e.b.w;
  var p = vec2f(0.);
  if (k == 0u || k == 3u) {
    // caixa em volta do risco ou do cometa
    let g = select(max(w * 16., 60.) * select(0.35, 1., e.c.y > .5), w * 9., k == 3u);
    let n = vec2f(-d.y, d.x);
    p = cab + d * mix(-cauda, g, c.x) + n * mix(-g, g, c.y);
  } else if (k == 1u) {
    let a = cab.y - e.b.y * cauda; let b = cab.y + e.b.y * 260.;
    p = vec2f(c.x * TAM.x, mix(min(a, b), max(a, b), c.y));
  } else if (k == 2u) {
    let a = cab.y - e.b.y * cauda * 4.5; let b = cab.y + e.b.y * w * 8.;
    p = vec2f(c.x * TAM.x, mix(min(a, b), max(a, b), c.y));
  } else { p = c * TAM; }
  var o: S;
  o.pos = vec4f(p.x / TAM.x * 2. - 1., 1. - p.y / TAM.y * 2., 0., 1.);
  o.p = p; o.i = i;
  return o;
}
fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn ruido(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2f(1, 0)), s.x), mix(h2(i + vec2f(0, 1)), h2(i + vec2f(1, 1)), s.x), s.y);
}
fn gas(p: vec2f) -> f32 { return ruido(p) * .55 + ruido(p * 2.1 + 7.) * .3 + ruido(p * 4.3 + 13.) * .15; }
fn sq(x: f32) -> f32 { return x * x; }
fn cai(perto: f32, longe: f32, x: f32) -> f32 { return 1. - smoothstep(perto, longe, x); }

fn risco(q: vec2f, e: Item) -> f32 {
  let d = e.b.xy; let cauda = e.b.z; let w = e.b.w; let halo = e.c.y;
  let s = dot(q, d); let n = dot(q, vec2f(-d.y, d.x));
  let tf = clamp(-s / cauda, 0., 1.);
  // a cauda afina e vai se quebrando em fagulhas perto do fim
  let larg = w * mix(.62, .1, sqrt(tf));
  let queb = mix(1., .25 + 1.5 * ruido(vec2f(s * .018 + e.c.x, e.c.x)), smoothstep(.25, .9, tf));
  var l = 0.;
  if (s <= 0.) {
    l = exp(-sq(n / larg)) * pow(1. - tf, 2.2) * 1.5 * queb;
    l += exp(-sq(n / (larg * 4.))) * pow(1. - tf, 3.) * .16;
  }
  if (halo > .5) {
    let r = length(q);
    // cabeça pequena e alongada no sentido do voo: bola redonda parece pirulito
    l += exp(-sq(s / (w * 1.1)) - sq(n / (w * .55))) * 3.4 + exp(-r / (w * 2.2)) * .4 * cai(w * 4., w * 16., r);
    // risco fino de lente, atravessado: dá a impressão de luz forte
    l += exp(-sq(s / (w * .3))) * exp(-abs(n) / (w * 3.)) * .28;
  }
  return l;
}
fn fita(p: vec2f, e: Item) -> f32 {
  let y = e.a.z; let sinal = e.b.y; let cauda = e.b.z; let w = e.b.w; let amp = e.c.y; let k = e.c.z; let ph = e.c.w;
  let s = (p.y - y) * sinal;
  let cab = cai(0., 240., s);
  let fim = pow(clamp(1. + s / cauda, 0., 1.), 1.5);
  let xc = e.a.y + amp * sin(p.y * k + ph + u.t * .35);
  // a fita gira no ar: larga de frente, um fio quando fica de perfil
  let gira = abs(cos(p.y * k * 1.7 + ph * 2. - u.t * .7));
  let larg = w * (.1 + .9 * gira);
  let dx = p.x - xc;
  let corpo = exp(-sq(dx / larg)) * (.26 + .34 / (.45 + gira));
  let fio = exp(-sq(dx / (larg * .1 + 2.6))) * .85;
  let borda = exp(-sq((abs(dx) - larg * .86) / 5.)) * .22 * gira;
  let fibra = .8 + .2 * sin(dx / larg * 11. + p.y * .004 + e.c.x);
  return (corpo * fibra + fio + borda) * cab * fim;
}
fn barra(p: vec2f, e: Item) -> f32 {
  let s = (p.y - e.a.z) * e.b.y; let w = e.b.w; let cauda = e.b.z;
  var l = exp(-sq(s / w)) * 1.45;
  if (s < 0.) { l += exp(s / cauda) * .13; }
  l += exp(-sq(s / (w * 7.))) * .1;
  let meio = abs(p.x - ${PW / 2}.) / ${PW / 2}.;
  return l * (.66 + .34 * (1. - meio * meio));
}
fn cometa(q: vec2f, e: Item) -> f32 {
  let d = e.b.xy; let cauda = e.b.z; let R = e.b.w; let sem = e.c.x;
  let s = dot(q, d); let n = dot(q, vec2f(-d.y, d.x));
  let r = length(q);
  var l = exp(-sq(r / (R * .42))) * 4.5 + exp(-r / (R * 1.05)) * .55 * cai(R * 3., R * 8., r);
  if (s < R) {
    let tf = clamp(-s / cauda, 0., 1.);
    let larg = R * (.42 + 2.3 * pow(tf, .75));
    let g = gas(vec2f(s * .0042 + u.t * .34 + sem, n * .012 + sem));
    let frente = cai(-R * .4, R, s);
    l += exp(-sq(n / larg)) * pow(1. - tf, 1.7) * (.2 + 1.1 * g * g) * frente;
    l += exp(-sq(n / (R * .1))) * pow(1. - tf, 1.1) * .55 * frente;
  }
  return l;
}
fn anel(p: vec2f, e: Item) -> f32 {
  let c = e.a.yz; let w = e.b.w; let cauda = e.b.z; let raio = e.c.y;
  let v = p - c; let d = length(v); let s = d - raio;
  var l = exp(-sq(s / w)) * 1.15;
  if (s < 0.) { l += exp(s / cauda) * .16; }
  // o desenho em volta do anel, sem emenda
  let dir = v / max(d, 1.);
  let rasgo = .6 + .4 * ruido(dir * 3.2 + vec2f(e.c.x, raio * .0007));
  return l * rasgo * pow(clamp(1. - raio / 6500., 0., 1.), .8);
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  let e = itens[i.i];
  let k = u32(e.a.x);
  var l = 0.;
  // os riscos da dobra nascem na dobra: a cauda não desce pela parede do logo
  if (k == 0u) { l = risco(i.p - e.a.yz, e) * select(1., cai(e.c.z - 200., e.c.z, i.p.y), e.c.z > 0.); }
  else if (k == 1u) { l = fita(i.p, e); }
  else if (k == 2u) { l = barra(i.p, e); }
  else if (k == 3u) { l = cometa(i.p - e.a.yz, e); }
  else { l = anel(i.p, e); }
  // prata: quase branco, um pouco frio no fraco. A cor de verdade vem da camada de cor, por cima.
  let cor = mix(vec3f(.72, .82, 1.), vec3f(1.), smoothstep(.05, .8, l));
  return vec4f(cor * l * e.a.w, 0.);
}
`;

const SAIDA = /* wgsl */`
struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S; o.pos = vec4f(q[i], 0., 1.); o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5); return o;
}
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var sdf: texture_2d_array<f32>;
@group(0) @binding(3) var<uniform> LG: array<vec4f, 3>;   // igual a personagens/camada.js: x, y, z, meia largura (0 = sem logo); profundidade, letreiro, próximo, mistura; centro da parede
fn noLogo(uv: vec2f, z: f32) -> vec2f {
  let k = z / ${ZF};
  let xw = (LG[2].x + (uv.x - .5) * 1.92) * k; let yw = (LG[2].y + (.5 - uv.y) * 1.28) * k;
  return vec2f((xw - LG[0].x) / (2. * LG[0].w * ${(2048 / 1720).toFixed(6)}) + .5, .5 - (yw - LG[0].y) / (2. * LG[0].w * ${(720 / 1720).toFixed(6)}));
}
fn pertoLogo(q: vec2f) -> f32 {
  if (q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) { return 24.; }
  let i = i32(LG[1].y);
  if (LG[1].w > .001) { return mix(textureSampleLevel(sdf, s, q, i, 0.).g, textureSampleLevel(sdf, s, q, i32(LG[1].z), 0.).g, LG[1].w) * 512. - 256.; }
  return textureSampleLevel(sdf, s, q, i, 0.).r * 48. - 24.;
}
fn semLetras(uv: vec2f) -> f32 {
  let py = uv.y * ${PH}.;
  if (LG[0].w <= 0. || py < ${DOBRA}.) { return 1.; }
  let uw = vec2f(uv.x, (py - ${DOBRA}.) / 688.);
  var cobre = 0.;
  for (var k = 0; k < 4; k++) {
    let d = pertoLogo(noLogo(uw, LG[0].z + f32(k) / 3. * LG[1].x));
    cobre = max(cobre, 1. - smoothstep(-3., 3., d));
  }
  return 1. - cobre;
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  let h = textureSampleLevel(a, s, i.uv, 0.).rgb;
  if (max(h.r, max(h.g, h.b)) < .0008) { return vec4f(0.); }
  var c = 1. - exp(-h * 1.15);
  // ruído só onde há luz, para o degradê não virar degrau no 8 bits. Fora dela o zero continua zero: nada de véu.
  let n = fract(sin(dot(i.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453) - .5;
  c += vec3f(n * 2.2 / 255.) * smoothstep(0., .03, max(c.r, c.g));
  return vec4f(max(c, vec3f(0.)) * semLetras(i.uv), 0.);
}
`;

async function criarMotor() {
  const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const gpu = await adaptador.requestDevice();
  gpu.addEventListener('uncapturederror', e => console.error('passagens: ' + e.error.message));
  const U = GPUBufferUsage, T = GPUTextureUsage;

  const tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  tela.style.cssText = 'position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:100%!important;margin:0!important;display:block!important;pointer-events:none;z-index:2147483646;';
  document.documentElement.appendChild(tela);
  const contexto = tela.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device: gpu, format: formato, alphaMode: 'premultiplied' });

  const hdr = gpu.createTexture({ size: [W, H], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  const bufU = gpu.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
  const bufI = gpu.createBuffer({ size: dados.byteLength, usage: U.STORAGE | U.COPY_DST });
  const bufLogo = gpu.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
  const am = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const op = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
  const texLet = gpu.createTexture({ size: [2048, 720, 3], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
  await Promise.all(['clube', 'pista', 'millos'].map(async (n, i) => {
    const b = await createImageBitmap(await (await fetch(new URL('../espaco/dados/letreiro-' + n + '.png', import.meta.url))).blob(), op);
    gpu.queue.copyExternalImageToTexture({ source: b }, { texture: texLet, origin: [0, 0, i] }, [2048, 720]);
  }));

  const mf = gpu.createShaderModule({ code: FX });
  const ms = gpu.createShaderModule({ code: SAIDA });
  const soma = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  const [pFx, pSai] = await Promise.all([
    gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mf, entryPoint: 'vs' }, fragment: { module: mf, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: soma }] } }),
    gpu.createRenderPipelineAsync({ layout: 'auto', vertex: { module: ms, entryPoint: 'vs' }, fragment: { module: ms, entryPoint: 'fs', targets: [{ format: formato }] } }),
  ]);
  const gFx = gpu.createBindGroup({ layout: pFx.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufU } }, { binding: 1, resource: { buffer: bufI } }] });
  const gSai = gpu.createBindGroup({ layout: pSai.getBindGroupLayout(0), entries: [
    { binding: 0, resource: hdr.createView() }, { binding: 1, resource: am },
    { binding: 2, resource: texLet.createView({ dimension: '2d-array' }) }, { binding: 3, resource: { buffer: bufLogo } },
  ] });
  return {
    tela,
    desenhar(n, tempo) {
      gpu.queue.writeBuffer(bufU, 0, new Float32Array([tempo % 1000, 0, 0, 0]));
      if (n) gpu.queue.writeBuffer(bufI, 0, dados, 0, n * CAMPOS);
      const lt = window.__logoTela;
      gpu.queue.writeBuffer(bufLogo, 0, new Float32Array(lt ? [lt.cx, lt.cy, lt.z, lt.meia, lt.prof ?? 0.16, lt.a, lt.b, lt.m, lt.xc ?? 0, lt.yc ?? HT - 0.64, 0, 0] : new Array(12).fill(0)));
      const enc = gpu.createCommandEncoder();
      const r = enc.beginRenderPass({ colorAttachments: [{ view: hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      if (n) { r.setPipeline(pFx); r.setBindGroup(0, gFx); r.draw(6, n); }
      r.end();
      const f = enc.beginRenderPass({ colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      f.setPipeline(pSai); f.setBindGroup(0, gSai); f.draw(3); f.end();
      gpu.queue.submit([enc.finish()]);
    },
  };
}

// ---------- laço: só existe enquanto há o que desenhar ----------
let motor = null, abrindo = false, falhou = false, rodando = false, antes = 0, mestre = 0;
function quadro(agora) {
  const dt = Math.min((agora - antes) / 1000, 0.1);
  antes = agora;
  relogio += dt;
  const quer = ligada();
  // desligar: não nasce mais nada, e o que está no ar apaga em meio segundo
  mestre += ((quer ? 1 : 0) - mestre) * (1 - Math.exp(-dt / (quer ? 0.08 : 0.16)));
  if (quer) lancar(dt);
  for (let i = agendados.length - 1; i >= 0; i--) {
    agendados[i].em -= dt;
    if (agendados[i].em <= 0) { const a = agendados.splice(i, 1)[0]; if (quer) a.f(); }
  }
  for (const e of vivos) e.t += dt;
  vivos = vivos.filter(e => e.t < e.dur);
  const forca = (FORCA[led().pasForca] || FORCA.medio) * mestre * (1 + 0.3 * (pulso - 0.35));
  motor.desenhar(preencher(forca), relogio);
  if (!quer && mestre < 0.01) {
    vivos = []; agendados = [];
    motor.desenhar(0, relogio);
    motor.tela.style.visibility = 'hidden';
    rodando = false;
    return;
  }
  requestAnimationFrame(quadro);
}
function vigiar() {
  if (ligada()) {
    if (!motor && !abrindo && !falhou) {
      abrindo = true;
      criarMotor().then(m => { motor = m; }, e => { falhou = true; console.error('passagens: ' + e.message); }).finally(() => { abrindo = false; });
    }
    if (motor && !rodando) {
      rodando = true;
      motor.tela.style.visibility = 'visible';
      // por cima dos personagens; o flash e a cor continuam na frente
      document.documentElement.appendChild(motor.tela);
      antes = performance.now();
      requestAnimationFrame(quadro);
    }
  }
  setTimeout(vigiar, 300);
}
// o visual tem prioridade: espera ele subir
setTimeout(vigiar, 1400);

window.__passagens = {
  dispara: n => { if (LANCA[n]) LANCA[n](); },
  estado: () => ({ rodando, pronta: !!motor, vivos: vivos.length, agendados: agendados.length, pulso: +pulso.toFixed(2), golpes, lancados, fila: Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, +v.toFixed(2)])) }),
};
