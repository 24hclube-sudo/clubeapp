// Shaders WGSL do universo. Mundo: x direita, y cima, z frente (para o DJ), em metros.

const GLOBAL = /* wgsl */`
struct Global {
  camPos: vec3f, tempo: f32,
  camX: vec3f, dt: f32,
  camY: vec3f, bumbo: f32,
  camZ: vec3f, idade: f32,
  grave: f32, medio: f32, agudo: f32, nivel: f32,
  fase: f32, brilho: f32, cheio: f32, voo: f32,
  corTopo: vec4f, corMeioE: vec4f, corMeioD: vec4f, corHorE: vec4f, corHorD: vec4f, corChao: vec4f, corCristal: vec4f, solDir: vec4f,
  logo: vec4f,
  espectro: array<vec4f, 12>,
  vp0: mat4x4f, vp1: mat4x4f,
  nVistas: f32, k0: f32, k1: f32, quente: f32,
};
@group(0) @binding(0) var<uniform> G: Global;

const PI = 3.14159265;

fn hash11(p: f32) -> f32 { var x = fract(p * .1031); x *= x + 33.33; x *= x + x; return fract(x); }
fn hash31(p: f32) -> vec3f {
  var v = fract(vec3f(p) * vec3f(.1031, .1030, .0973));
  v += dot(v, v.yzx + 33.33);
  return fract((v.xxy + v.yzz) * v.zyx);
}
fn hash3(p: vec3f) -> f32 {
  var q = fract(p * .1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn ruido3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3. - 2. * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3f(1, 0, 0)), u.x), mix(hash3(i + vec3f(0, 1, 0)), hash3(i + vec3f(1, 1, 0)), u.x), u.y),
    mix(mix(hash3(i + vec3f(0, 0, 1)), hash3(i + vec3f(1, 0, 1)), u.x), mix(hash3(i + vec3f(0, 1, 1)), hash3(i + vec3f(1, 1, 1)), u.x), u.y), u.z);
}
fn fbm3(p0: vec3f) -> f32 {
  var p = p0; var a = .5; var s = 0.;
  for (var i = 0; i < 3; i++) { s += a * ruido3(p); p = p * 2.03 + 7.1; a *= .5; }
  return s / .875;
}
fn esp(i: u32) -> f32 { return G.espectro[i / 4u][i % 4u]; }
fn espectroEm(x: f32) -> f32 {
  let f = clamp(x, 0., 1.) * 47.;
  let i = u32(f);
  return mix(esp(i), esp(min(i + 1u, 47u)), fract(f));
}
`;

const VOXEL_STRUCTS = /* wgsl */`
struct Voxel { p: vec3f, tam: f32, v: vec3f, gira: f32, n: vec3f, tinta: f32, g: u32, i: u32, sem: f32, brilho: f32 };
struct Grupo {
  pos: vec3f, escala: f32,
  cosY: f32, sinY: f32, tipo: u32, n: u32,
  aIni: u32, aN: u32, bIni: u32, bN: u32,
  t0: f32, atraso: f32, espalha: f32, impulso: f32,
  teleporte: u32, sem: f32, tamBase: f32, mats: u32,
};
`;

// ---------- física dos voxels: cada voxel procura seu lugar na figura e o som empurra ----------
export const COMPUTE_VOXELS = GLOBAL + VOXEL_STRUCTS + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> vox: array<Voxel>;
@group(0) @binding(2) var<storage, read> fig: array<vec4f>;
@group(0) @binding(3) var<storage, read> grupos: array<Grupo>;

// Uma lista de voxels visíveis por vista (teto, parede): só o que aparece vai para o desenho.
struct Lista { qtdV: u32, inst: atomic<u32>, priV: u32, priI: u32, itens: array<u32> };
@group(0) @binding(4) var<storage, read_write> lista0: Lista;
@group(0) @binding(5) var<storage, read_write> lista1: Lista;

fn passaVista(vp: mat4x4f, p: vec3f, r: f32, kpx: f32, sem: f32) -> bool {
  let c = vp * vec4f(p, 1.);
  if (c.w < .02) { return false; }
  let m = r * 9.;
  if (abs(c.x) > c.w + m || abs(c.y) > c.w + m) { return false; }
  // longe, o voxel fica menor que um pixel: desenha só parte deles, um pouco maiores (ver vsVoxel)
  let px = r * kpx / c.w;
  return px >= 1.5 || sem <= px / 1.5;
}
fn listar(k: u32, p: vec3f, r: f32, sem: f32) {
  if (r <= .0001) { return; }
  if (passaVista(G.vp0, p, r, G.k0, sem)) { let j = atomicAdd(&lista0.inst, 1u); lista0.itens[j] = k; }
  if (G.nVistas > 1.5 && passaVista(G.vp1, p, r, G.k1, sem)) { let j = atomicAdd(&lista1.inst, 1u); lista1.itens[j] = k; }
}

fn fluxo(p: vec3f, t: f32) -> vec3f {
  return vec3f(
    sin(p.y * 1.3 + t) + cos(p.z * 1.7 - t * .7),
    sin(p.z * 1.1 - t * .6) + cos(p.x * 1.9 + t * .4),
    sin(p.x * 1.5 + t * .8) + cos(p.y * 1.2 - t * .5));
}

@compute @workgroup_size(256)
fn passo(@builtin(global_invocation_id) id: vec3u) {
  let k = id.x;
  if (k >= arrayLength(&vox)) { return; }
  var V = vox[k];
  let Gp = grupos[V.g];
  let dt = G.dt;
  let frac = f32(V.i) / f32(Gp.n);
  let atraso = (0.8 * frac + 0.2 * V.sem) * Gp.atraso;
  let formado = G.tempo >= Gp.t0 + atraso;
  var ini = Gp.aIni;
  var qtd = Gp.aN;
  if (formado) { ini = Gp.bIni; qtd = Gp.bN; }
  let idx = ini + min(u32(frac * f32(qtd)), qtd - 1u);
  let P = fig[idx * 2u];
  let N = fig[idx * 2u + 1u];

  if (Gp.tipo == 1u) {
    // Logo: barras. A largura do logo é o espectro; o bumbo empurra o logo inteiro para a frente.
    let u = N.w;
    let b = espectroEm(0.02 + u * 0.66);
    let prof = 0.10 + b * b * 1.5 + G.bumbo * 0.3;
    let W = G.logo.w * (1. + G.bumbo * 0.07);
    V.p = G.logo.xyz + vec3f(P.x * W, P.y * W, -prof * .5);
    V.tam = Gp.tamBase * (1. + G.bumbo * 0.07);
    V.gira = prof / V.tam;
    V.n = N.xyz;
    V.tinta = .99;
    V.brilho = G.bumbo * G.bumbo * 0.9 + b * b * 0.35;
    vox[k] = V;
    listar(k, G.camPos + G.camX * V.p.x + G.camY * V.p.y + G.camZ * V.p.z, V.tam, 0.);
    return;
  }

  let h = P.y;
  let gg = N.w;
  let bloco = P.w >= 0.;
  let tinta = abs(P.w);
  let faixa = espectroEm(h * 0.92 + 0.02);
  // bumbo: onda que sobe do pé à cabeça
  let onda = exp(-pow((h - G.idade * 1.9) / 0.09, 2.)) * exp(-G.idade * 1.6);
  let pop = faixa * faixa * 0.05 + onda * 0.075 + (V.sem - .5) * G.agudo * 0.0015;
  var q = P.xyz + N.xyz * pop;
  // dança: o corpo balança na batida e as pontas (mão, cabelo, pé) balançam mais
  let e = 0.35 + 0.65 * G.grave;
  let f = G.fase * PI + Gp.sem * 6.28;
  q.x += sin(f) * h * h * 0.045 * e + sin(f + gg * 5.) * gg * gg * 0.06 * e;
  q.y += cos(f * 2. + gg * 4.) * gg * gg * 0.032 * e;
  q.y *= 1. - G.bumbo * 0.03;
  q.z += sin(f * .5 + gg * 3.) * gg * gg * 0.05 * e;

  let c = Gp.cosY; let s = Gp.sinY;
  let T = vec3f(q.x * c + q.z * s, q.y, -q.x * s + q.z * c) * Gp.escala * (1. + G.bumbo * .055) + Gp.pos;
  let nw = vec3f(N.x * c + N.z * s, N.y, -N.x * s + N.z * c);

  if (Gp.teleporte == 1u) {
    V.p = T;
    V.v = vec3f(0.);
    V.gira = 0.;
  } else {
    var acel: vec3f;
    if (formado) {
      acel = (T - V.p) * 70. - V.v * 13.;
    } else {
      // solto: a casca se desfaz em nuvem, mas fica em volta do corpo; não invade a pista inteira
      let rel = (V.p - Gp.pos) / Gp.escala;
      let alvo = T + nw * Gp.escala * (.05 + .13 * V.sem) + (fluxo(rel * 6., G.tempo * .9 + V.sem * 3.) * .045 + (hash31(V.sem * 31.) - .5) * .14) * Gp.escala;
      acel = (alvo - V.p) * 7. - V.v * 3.2 + nw * G.bumbo * Gp.escala * .5;
    }
    V.v += acel * dt;
    if (formado) {
      // empurrão igual para todos: a superfície treme inteira, sem virar areia
      V.v += nw * Gp.impulso * Gp.escala * .6;
      V.gira *= exp(-dt * 10.);
    } else {
      V.v += nw * Gp.impulso * Gp.escala * (.3 + V.sem);
      V.gira = min(V.gira + (length(V.v) / Gp.escala + .15) * dt * 4., 6.28);
    }
    V.p += V.v * dt;
  }
  var revela = 1.;
  if (!bloco) { revela = smoothstep(0.02, 0.35, G.cheio); }
  var folga = .62;
  if (formado) { folga = 1.; }
  V.tam = Gp.tamBase * revela * folga * (1. + G.grave * .22);
  V.n = nw;
  // parte inteira = material (0 prata, 1 vermelho, 2 branco, 3 gelo, 4 fogo); fração = tinta da figura
  var mat = Gp.mats & 15u;
  if (formado) { mat = Gp.mats >> 4u; }
  V.tinta = f32(mat) + tinta * .99;
  V.brilho = onda * 1.7 + faixa * faixa * .16 + G.bumbo * .22;
  if (!formado) { V.brilho += .05 + G.agudo * .14; }
  vox[k] = V;
  // o lado de trás da casca não aparece
  let ate = G.camPos - V.p;
  if (!formado || dot(V.n, ate) > -.3 * length(ate)) { listar(k, V.p, V.tam, V.sem); }
}
`;

// ---------- desenho ----------
export const RENDER = GLOBAL + VOXEL_STRUCTS + /* wgsl */`
struct Vista { vp: mat4x4f, o: vec4f, u: vec4f, v: vec4f };
@group(0) @binding(1) var<uniform> VI: Vista;

struct Rocha { m: mat4x4f, d: vec4f };
struct Cristal { pos: vec3f, rocha: u32, dir: vec3f, comp: f32, raio: f32, sem: f32, a: f32, b: f32 };
@group(1) @binding(0) var<storage, read> vox: array<Voxel>;
@group(1) @binding(1) var<storage, read> grupos: array<Grupo>;
@group(1) @binding(2) var<storage, read> rochas: array<Rocha>;
@group(1) @binding(3) var<storage, read> cristais: array<Cristal>;
struct ListaR { qtdV: u32, inst: u32, priV: u32, priI: u32, itens: array<u32> };
@group(1) @binding(4) var<storage, read> lista: ListaR;
@group(1) @binding(5) var ruidoT: texture_3d<f32>;
@group(1) @binding(6) var amR: sampler;

fn ceu(d: vec3f) -> vec3f {
  let e = clamp(d.y, 0., 1.);
  let lado = smoothstep(-.75, .75, d.x);
  let hor = mix(G.corHorE.rgb, G.corHorD.rgb, lado);
  let meio = mix(G.corMeioE.rgb, G.corMeioD.rgb, lado);
  var c = mix(hor, meio, smoothstep(.0, .30, e));
  c = mix(c, G.corTopo.rgb, smoothstep(.16, .72, e));
  // o bumbo acende o horizonte
  c += hor * G.bumbo * exp(-e * 7.) * .42;
  c += meio * G.grave * .2 * exp(-e * 2.5);
  return c;
}

// Ambiente refletido pelo cromo: céu, linha escura do horizonte, areia.
fn ambiente(d: vec3f) -> vec3f {
  if (d.y >= 0.) {
    var c = ceu(d) * 1.25;
    // faixas de luz (softbox) que andam com a batida: é o que faz metal parecer metal
    let a = atan2(d.x, d.z) * 3. + G.fase * PI * .25;
    let faixa = smoothstep(.72, .92, sin(a)) * smoothstep(.05, .35, d.y);
    c += vec3f(1., .94, .9) * faixa * (.55 + G.medio * 1.1);
    return c;
  }
  let t = smoothstep(0., .5, -d.y);
  return mix(ceu(vec3f(d.x, .001, d.z)) * .16, G.corChao.rgb * .95, t);
}

fn neblina(c: vec3f, dist: f32, d: vec3f) -> vec3f {
  let f = 1. - exp(-pow(dist / 215., 2.));
  return mix(c, ceu(vec3f(d.x, max(d.y, .015), d.z)), f);
}

// ---------- céu e areia (tela inteira da vista) ----------
struct SaidaCeu { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsCeu(@builtin(vertex_index) i: u32) -> SaidaCeu {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: SaidaCeu;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
fn estrelas(d: vec3f) -> f32 {
  let p = d * 150.;
  let c = floor(p);
  let h = hash31(dot(c, vec3f(1., 57., 113.)));
  if (h.x < .985) { return 0.; }
  let q = fract(p) - .5 - (h - .5) * .5;
  return smoothstep(.2, .02, length(q)) * (.25 + .75 * h.y) * (.5 + 1.8 * G.agudo * h.z);
}
fn alturaAreia(q: vec2f) -> f32 {
  return fbm3(vec3f(q.x * .018, 0., q.y * .018)) * 4. + ruido3(vec3f(q.x * .3, 1., q.y * .3)) * .12;
}
fn areia(d: vec3f) -> vec3f {
  let t = -G.camPos.y / d.y;
  let P = G.camPos + d * t;
  let q = P.xz;
  let ep = .6;
  let h0 = alturaAreia(q);
  let n = normalize(vec3f(h0 - alturaAreia(q + vec2f(ep, 0.)), ep, h0 - alturaAreia(q + vec2f(0., ep))));
  let luz = clamp(dot(n, G.solDir.xyz), 0., 1.);
  var c = G.corChao.rgb * (.48 + .72 * luz);
  c *= .94 + .1 * ruido3(vec3f(q.x * 2.4, 3., q.y * 2.4));
  // sombra das estátuas
  var somb = 1.;
  let qtd = arrayLength(&grupos);
  for (var i = 0u; i < qtd; i++) {
    let g = grupos[i];
    if (g.tipo != 0u) { continue; }
    let dq = (q - g.pos.xz) / (g.escala * vec2f(.34, .2));
    somb *= 1. - .62 * exp(-dot(dq, dq));
  }
  c *= somb;
  return neblina(c, t, d);
}
@fragment fn fsCeu(i: SaidaCeu) -> @location(0) vec4f {
  let e = VI.o.xyz + VI.u.xyz * i.uv.x + VI.v.xyz * i.uv.y;
  let d = normalize(G.camX * e.x + G.camY * e.y + G.camZ * e.z);
  var c: vec3f;
  if (d.y > 0.) {
    c = ceu(d) + vec3f(1., .95, .9) * estrelas(d) * smoothstep(.12, .5, d.y);
  } else {
    c = areia(d);
  }
  return vec4f(c, 1.);
}

// ---------- voxels ----------
struct SaidaVox {
  @builtin(position) pos: vec4f,
  @location(0) mundo: vec3f,
  @location(1) nf: vec3f,
  @location(2) ns: vec3f,
  @location(3) @interpolate(flat) d: vec4f,
};
fn girar(v: vec3f, eixo: vec3f, a: f32) -> vec3f {
  return v * cos(a) + cross(eixo, v) * sin(a) + eixo * dot(eixo, v) * (1. - cos(a));
}
@vertex fn vsVoxel(@location(0) c: vec3f, @location(1) nc: vec3f, @builtin(instance_index) qual: u32) -> SaidaVox {
  let V = vox[lista.itens[qual]];
  let Gp = grupos[V.g];
  var o: SaidaVox;
  var loc = c * .5 * V.tam;
  var nf = nc;
  var ns = V.n;
  var mundo: vec3f;
  if (Gp.tipo == 0u) {
    if (V.gira > .001) {
      let eixo = normalize(hash31(V.sem * 77.3) - .5);
      loc = girar(loc, eixo, V.gira);
      nf = girar(nf, eixo, V.gira);
      ns = girar(ns, eixo, V.gira);
    }
    // voxel solto perto do olho encolhe, senão vira um cubo do tamanho do teto
    loc *= smoothstep(1.5, 9., distance(V.p, G.camPos));
    // voxel menor que 1,5 px: fica maior, porque só parte deles é desenhada (ver passaVista)
    let wv = max((VI.vp * vec4f(V.p, 1.)).w, .02);
    loc *= max(1., 1.5 / max(V.tam * VI.o.w / wv, .01));
    loc = vec3f(loc.x * Gp.cosY + loc.z * Gp.sinY, loc.y, -loc.x * Gp.sinY + loc.z * Gp.cosY);
    nf = vec3f(nf.x * Gp.cosY + nf.z * Gp.sinY, nf.y, -nf.x * Gp.sinY + nf.z * Gp.cosY);
    mundo = V.p + loc;
  } else {
    // logo: preso à câmera, cada voxel é uma barra na profundidade
    loc.z *= V.gira;
    let olho = V.p + loc;
    mundo = G.camPos + G.camX * olho.x + G.camY * olho.y + G.camZ * olho.z;
    nf = G.camX * nf.x + G.camY * nf.y + G.camZ * nf.z;
    ns = G.camX * ns.x + G.camY * ns.y + G.camZ * ns.z;
  }
  o.pos = VI.vp * vec4f(mundo, 1.);
  // o logo fica na frente de tudo, mas as barras dele continuam na ordem certa entre si
  if (Gp.tipo == 1u) { o.pos.z = (.9 + .09 * o.pos.z / o.pos.w) * o.pos.w; }
  o.mundo = mundo;
  o.nf = nf;
  o.ns = ns;
  o.d = vec4f(V.tinta, V.sem, V.brilho, f32(Gp.tipo));
  return o;
}
@fragment fn fsVoxel(i: SaidaVox) -> @location(0) vec4f {
  let paraCam = G.camPos - i.mundo;
  let dist = length(paraCam);
  let Vd = paraCam / dist;
  let sem = i.d.y;
  let j = hash31(sem * 91.7) - .5;
  // cada voxel é um espelhinho meio torto; os médios balançam os espelhos
  let ehLogo = i.d.w > .5;
  let mistura = select(.8, .9, ehLogo);
  let n = normalize(mix(i.nf, i.ns, mistura) + j * (.035 + G.medio * .07) * (1. - i.d.w * .8));
  let r = reflect(-Vd, n);
  let f = pow(1. - clamp(dot(n, Vd), 0., 1.), 5.);
  let mat = floor(i.d.x);
  let tinta = fract(i.d.x) / .99;
  var c: vec3f;
  if (ehLogo) {
    // logo: espelho de verdade
    c = ambiente(r) * mix(vec3f(.72, .74, .8), vec3f(1.), f) * (.3 + .95 * tinta);
    // no mundo quente o reflexo seria vermelho sobre vermelho: o letreiro fica prateado e claro
    if (G.quente > .5) { c = mix(vec3f(dot(c, vec3f(.3, .55, .15))), c, .22) * 1.5 + vec3f(.14); }
  } else if (mat > .5) {
    // boneco de vinil: corpo colorido e brilhante, traço preto brilhante
    var corpo = vec3f(.84, .012, .018);
    if (mat > 3.5) { corpo = vec3f(.98, .3, .02); } else if (mat > 2.5) { corpo = vec3f(.66, .82, .95); } else if (mat > 1.5) { corpo = vec3f(.9, .89, .87); }
    let cheio = smoothstep(.35, .65, tinta);
    let alb = mix(vec3f(.012), corpo, cheio);
    let luzB = clamp(dot(n, G.solDir.xyz), 0., 1.);
    let ambB = mix(G.corChao.rgb * .75, ceu(vec3f(n.x, .3, n.z)) * .55 + vec3f(.17), n.y * .5 + .5);
    c = alb * (ambB * 1.05 + vec3f(1., .95, .88) * luzB * 1.1);
    c += ambiente(r) * mix(.05, 1., f) * mix(.95, .8, cheio);
  } else {
    // estátua: prata escovada. O reflexo vem borrado e quase sem cor; a forma vem da luz e da tinta da figura.
    var refl = ambiente(normalize(mix(r, n, .45)));
    let lum = dot(refl, vec3f(.3, .55, .15));
    refl = mix(vec3f(lum), refl, .4);
    let luz = clamp(dot(n, G.solDir.xyz) * .5 + .5, 0., 1.);
    let baixo = clamp(-n.y * .5 + .5, 0., 1.);
    let difusa = vec3f(.78, .8, .88) * (.1 + .72 * luz) + G.corChao.rgb * baixo * .22;
    c = (difusa * .62 + refl * .62) * (.16 + 1.06 * tinta * tinta) * (.86 + .28 * hash11(sem * 53.1));
    c = mix(c, c * vec3f(.92, .95, 1.08), .6);
    c += ambiente(r) * f * .4;
  }
  let s = pow(clamp(dot(r, G.solDir.xyz), 0., 1.), 70.);
  c += vec3f(1., .95, .9) * s * 1.2 * tinta;
  c += vec3f(1., .92, .96) * i.d.z * (.3 + .65 * f);
  if (i.d.w < .5) { c = neblina(c, dist, -Vd); }
  return vec4f(c, 1.);
}

// ---------- pedras ----------
struct SaidaRocha { @builtin(position) pos: vec4f, @location(0) mundo: vec3f, @location(1) n: vec3f, @location(2) po: vec3f };
@vertex fn vsRocha(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) k: u32) -> SaidaRocha {
  let R = rochas[k];
  var o: SaidaRocha;
  let w = R.m * vec4f(p, 1.);
  o.pos = VI.vp * w;
  o.mundo = w.xyz;
  o.n = normalize((R.m * vec4f(n, 0.)).xyz);
  o.po = p + R.d.xyz;
  return o;
}
// Ruído de pedra vindo de uma textura 3D: muito mais barato que calcular a cada pixel.
fn rT(p: vec3f) -> f32 { return textureSampleLevel(ruidoT, amR, p / 32., 0.).r; }
fn rugas(p: vec3f) -> f32 { return 1. - abs(2. * rT(p) - 1.); }
fn pedraAltura(p: vec3f) -> f32 {
  return .24 * rT(p * 3.1) + .36 * rugas(p * 8.) + .26 * rugas(p * 19. + 3.) + .14 * rugas(p * 47. + 9.);
}
@fragment fn fsRocha(i: SaidaRocha) -> @location(0) vec4f {
  let paraCam = G.camPos - i.mundo;
  let dist = length(paraCam);
  let Vd = paraCam / dist;
  let e = .018;
  let p = i.po;
  let h = pedraAltura(p);
  let grad = vec3f(pedraAltura(p + vec3f(e, 0., 0.)) - h, pedraAltura(p + vec3f(0., e, 0.)) - h, pedraAltura(p + vec3f(0., 0., e)) - h) / e;
  let n = normalize(i.n - grad * .045);
  let alb = mix(vec3f(.56, .46, .36), vec3f(.74, .65, .53), smoothstep(.25, .75, h));
  let luz = clamp(dot(n, G.solDir.xyz), 0., 1.);
  let cimaBaixo = n.y * .5 + .5;
  let amb = mix(G.corChao.rgb * 1.15, ceu(vec3f(n.x, .25, n.z)) * .8 + vec3f(.1), cimaBaixo);
  var c = alb * (amb + vec3f(1., .92, .8) * luz * .95);
  c *= .86 + .22 * smoothstep(.3, .62, h);
  c += G.corHorD.rgb * pow(1. - clamp(dot(n, Vd), 0., 1.), 3.) * .22;
  if (G.quente > .5) {
    // mundo quente: basalto escuro com rachaduras em brasa, que acendem com o grave
    let racha = pow(rugas(p * 6.3 + 5.), 9.);
    let brasa = vec3f(1., .2, .02) * racha * (.3 + G.grave * .9 + G.bumbo * 1.1);
    c = alb * .13 * (amb + vec3f(1., .9, .8) * luz) + brasa + G.corHorD.rgb * pow(1. - clamp(dot(n, Vd), 0., 1.), 3.) * .3;
  }
  return vec4f(neblina(c, dist, -Vd), 1.);
}

// ---------- cristais ----------
struct SaidaCristal {
  @builtin(position) pos: vec4f,
  @location(0) mundo: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) d: vec2f,
  @location(3) al: f32,
};
@vertex fn vsCristal(@location(0) c: vec3f, @location(1) nc: vec3f, @builtin(instance_index) k: u32) -> SaidaCristal {
  let C = cristais[k];
  let R = rochas[C.rocha];
  var ref1 = vec3f(0., 1., 0.);
  if (abs(C.dir.y) > .9) { ref1 = vec3f(1., 0., 0.); }
  let t = normalize(cross(C.dir, ref1));
  let b = cross(C.dir, t);
  // os agudos fazem os cristais crescerem um pouco
  let pulso = esp(u32(C.sem * 20.) + 26u);
  let comp = C.comp * (1. + pulso * .55 + G.bumbo * .12);
  let local = C.pos + t * c.x * C.raio + C.dir * c.y * comp + b * c.z * C.raio;
  let w = R.m * vec4f(local, 1.);
  var o: SaidaCristal;
  o.pos = VI.vp * w;
  o.mundo = w.xyz;
  o.n = normalize((R.m * vec4f(t * nc.x + C.dir * nc.y + b * nc.z, 0.)).xyz);
  o.d = vec2f(C.sem, pulso);
  o.al = c.y;
  return o;
}
@fragment fn fsCristal(i: SaidaCristal) -> @location(0) vec4f {
  let paraCam = G.camPos - i.mundo;
  let dist = length(paraCam);
  let Vd = paraCam / dist;
  let n = normalize(i.n);
  let f = pow(1. - clamp(dot(n, Vd), 0., 1.), 3.);
  let base = mix(G.corCristal.rgb, G.corCristal.rgb * vec3f(.55, .4, 1.25), i.d.x);
  var c = base * (.32 + i.al * .7 + i.d.y * 3.2 + G.bumbo * .5);
  c += ambiente(reflect(-Vd, n)) * (.08 + f * .75);
  return vec4f(neblina(c, dist, -Vd), 1.);
}

// ---------- pó prateado ----------
struct SaidaPo {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,
  @location(1) cor: vec3f,
};
@vertex fn vsPo(@builtin(vertex_index) vi: u32, @builtin(instance_index) k: u32) -> SaidaPo {
  var cantos = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = cantos[vi];
  let h = hash31(f32(k) * .917 + 3.1);
  let h2 = hash31(f32(k) * 1.37 + 9.7);
  let caixa = vec3f(70., 70., 120.);
  let deriva = vec3f(sin(G.tempo * .2 + h2.x * 6.) * 2., G.tempo * (.2 + h2.y * .3), 0.);
  var rel = (fract((h * caixa + deriva - G.camPos) / caixa) - .5) * caixa;
  rel.y += 28.;
  rel *= 1. + G.bumbo * .16;
  let dist = length(rel);
  let n = rel / max(dist, .01);
  let dir = normalize(cross(n, vec3f(.31, .87, .39)));
  let cima = cross(n, dir);
  let tam = (.018 + h2.z * .045) * max(1., dist * .03);
  let mundo = G.camPos + rel + (dir * q.x + cima * q.y) * tam;
  var o: SaidaPo;
  o.pos = VI.vp * vec4f(mundo, 1.);
  o.q = q;
  let pisca = .5 + .5 * sin(G.tempo * (2. + h2.x * 5.) + h.x * 40.);
  let longe = (1. - smoothstep(30., 58., dist)) * smoothstep(3.5, 10., dist);
  // no mundo quente o pó vira brasa
  let corPo = mix(vec3f(.82, .85, .95), vec3f(1., .42, .12), G.quente);
  o.cor = corPo * (.1 + pisca * .22 + G.agudo * pisca * .9) * longe * (1. + G.quente * .5);
  return o;
}
@fragment fn fsPo(i: SaidaPo) -> @location(0) vec4f {
  let a = max(0., 1. - dot(i.q, i.q));
  return vec4f(i.cor * a * a, 0.);
}
`;

// ---------- pós-processamento ----------
export const POS = /* wgsl */`
struct Parametros { texel: vec2f, limiar: f32, forca: f32, brilho: f32, tempo: f32, bumbo: f32, modo: f32, tela: vec4f, painel: vec4f, sala: vec4f };
@group(0) @binding(0) var fonte: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
@group(0) @binding(2) var<uniform> P: Parametros;

struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
fn t(uv: vec2f) -> vec3f { return textureSampleLevel(fonte, am, uv, 0.).rgb; }

// Desce meia resolução com 13 amostras (Jimenez). Na primeira descida corta o que não passa do limiar.
@fragment fn fsDesce(i: S) -> @location(0) vec4f {
  let e = P.texel;
  let uv = i.uv;
  let a = t(uv + vec2f(-2, -2) * e); let b = t(uv + vec2f(0, -2) * e); let c = t(uv + vec2f(2, -2) * e);
  let d = t(uv + vec2f(-2, 0) * e); let m = t(uv); let f = t(uv + vec2f(2, 0) * e);
  let g = t(uv + vec2f(-2, 2) * e); let h = t(uv + vec2f(0, 2) * e); let j = t(uv + vec2f(2, 2) * e);
  let k = t(uv + vec2f(-1, -1) * e); let l = t(uv + vec2f(1, -1) * e);
  let n = t(uv + vec2f(-1, 1) * e); let o = t(uv + vec2f(1, 1) * e);
  var s = m * .125 + (a + c + g + j) * .03125 + (b + d + f + h) * .0625 + (k + l + n + o) * .125;
  if (P.limiar > 0.) {
    let pico = max(s.r, max(s.g, s.b));
    s *= smoothstep(P.limiar * .6, P.limiar * 1.4, pico);
    s = min(s, vec3f(12.));
  }
  return vec4f(s, 1.);
}
// Sobe com filtro em tenda, somando na camada de cima.
@fragment fn fsSobe(i: S) -> @location(0) vec4f {
  let e = P.texel;
  let uv = i.uv;
  var s = t(uv) * 4.;
  s += (t(uv + vec2f(-e.x, 0.)) + t(uv + vec2f(e.x, 0.)) + t(uv + vec2f(0., -e.y)) + t(uv + vec2f(0., e.y))) * 2.;
  s += t(uv + e) + t(uv - e) + t(uv + vec2f(e.x, -e.y)) + t(uv + vec2f(-e.x, e.y));
  return vec4f(s / 16. * P.forca, 1.);
}
`;

export const TONS = /* wgsl */`
struct Parametros { texel: vec2f, limiar: f32, forca: f32, brilho: f32, tempo: f32, bumbo: f32, modo: f32, tela: vec4f, painel: vec4f, sala: vec4f };
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
@group(0) @binding(2) var<uniform> P: Parametros;
@group(0) @binding(3) var flor: texture_2d<f32>;

struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
// Khronos PBR Neutral: não mexe nas cores abaixo de ~0,8; só dobra os brilhos. As cores da marca ficam fiéis.
fn neutro(c0: vec3f) -> vec3f {
  var c = c0;
  let x = min(c.r, min(c.g, c.b));
  var off = .04;
  if (x < .08) { off = x - 6.25 * x * x; }
  c -= off;
  let pico = max(c.r, max(c.g, c.b));
  let ini = .76;
  if (pico < ini) { return c; }
  let d = 1. - ini;
  let novo = 1. - d * d / (pico + d - ini);
  c *= novo / pico;
  let g = 1. - 1. / (.15 * (pico - novo) + 1.);
  return mix(c, vec3f(novo), g);
}
fn srgb(c: vec3f) -> vec3f {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3f(0.)), vec3f(1. / 2.4)) - .055, step(vec3f(.0031308), c));
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  var c = textureSampleLevel(hdr, am, i.uv, 0.).rgb;
  c += textureSampleLevel(flor, am, i.uv, 0.).rgb * .32;
  c = neutro(c * P.brilho * (1. + P.bumbo * .22));
  c = srgb(clamp(c, vec3f(0.), vec3f(1.)));
  // ruído de 1/255 para o degradê não virar degrau no LED
  let n = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)) + P.tempo * 7.13));
  c += (n - .5) / 255.;
  return vec4f(c, 1.);
}
`;

// Tela de prévia: à esquerda a sala (foto da pista com o LED ligado), à direita o painel chapado.
export const PREVIA = /* wgsl */`
struct Parametros { texel: vec2f, limiar: f32, forca: f32, brilho: f32, tempo: f32, bumbo: f32, modo: f32, tela: vec4f, painel: vec4f, sala: vec4f };
@group(0) @binding(0) var ldr: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
@group(0) @binding(2) var<uniform> P: Parametros;
@group(0) @binding(3) var guia: texture_2d<f32>;

struct S { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  return o;
}
// Geometria medida na foto 07 (ver perspectiva/geometria.py)
const LARG = 1032.; const ALT = 5676.; const DOBRA = 4988.; const PASSO = 0.00186047;
const CY = 711.2; const ZF = 4.39; const V0 = 491.3; const K = 162.5; const FO = 713.4; const HC = 1.3532;
const ESC = 1.42433;
@fragment fn fs(i: S) -> @location(0) vec4f {
  let px = i.pos.xy;
  var fundo = vec3f(.03);
  // sala: onde cada pixel da foto cai no painel (conta feita em todos, porque as derivadas não aceitam desvio)
  let sq = (px - P.sala.xy) / P.sala.zw;
  let u = sq.x * 1440. / ESC + 34.;
  let v = sq.y * 1920. / ESC;
  let teto = v < V0;
  let z = FO * HC / max(CY - v, .5);
  let lin = select(DOBRA + (v - V0) / (PASSO * K), DOBRA - (ZF - z) / PASSO, teto);
  let ue = select(373., .7569 * v - .47, teto);
  let ud = select(685., -.9896 * v + 1184.54, teto);
  let col = (u - ue) / (ud - ue) * LARG;
  // minificação: distância em px de painel por px de tela
  let duv = max(length(dpdx(vec2f(col, lin))), length(dpdy(vec2f(col, lin))));
  let nivelSala = log2(max(duv * P.tela.z, 1.));
  if (all(sq >= vec2f(0.)) && all(sq <= vec2f(1.))) {
    fundo = textureSampleLevel(guia, am, sq, 0.).rgb;
    let base = V0 + (ALT - DOBRA) * PASSO * K;
    if (v < CY && col > 0. && col < LARG && lin > 0. && v <= base && !(lin >= DOBRA && v >= 679.)) {
      fundo = textureSampleLevel(ldr, am, vec2f(col / LARG, lin / ALT), nivelSala).rgb;
    }
  }
  // painel
  let pq = (px - P.painel.xy) / P.painel.zw;
  if (all(pq >= vec2f(0.)) && all(pq <= vec2f(1.))) {
    let nivel = log2(max(ALT * P.tela.z / P.painel.w, 1.));
    fundo = textureSampleLevel(ldr, am, pq, nivel).rgb;
  }
  return vec4f(fundo, 1.);
}
`;

export const MIPS = /* wgsl */`
@group(0) @binding(0) var f: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
@fragment fn fs(i: S) -> @location(0) vec4f { return textureSampleLevel(f, am, i.uv, 0.); }
`;

// Só na saída para o LED. A processadora recebe 2160 linhas para as 5676 do painel, e o MadMapper tira uma linha a cada 2,63 sem filtrar:
// sem este passo, borda quase horizontal vira escada, que é o que mais aparece na tela de frente. É um Lanczos só na vertical, na medida
// exata desse corte, que também reforça um pouco as bordas.
export const FILTRO_LED = /* wgsl */`
@group(0) @binding(0) var f: texture_2d<f32>;
@group(0) @binding(1) var am: sampler;
@group(0) @binding(2) var<uniform> P: vec4f;
struct S { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> S {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: S;
  o.pos = vec4f(q[i], 0., 1.);
  o.uv = vec2f(q[i].x * .5 + .5, .5 - q[i].y * .5);
  return o;
}
@fragment fn fs(i: S) -> @location(0) vec4f {
  let d = vec2f(0., 1. / f32(textureDimensions(f).y));
  var c = textureSampleLevel(f, am, i.uv, 0.).rgb * .3765;
  c += (textureSampleLevel(f, am, i.uv - d, 0.).rgb + textureSampleLevel(f, am, i.uv + d, 0.).rgb) * .276;
  c += (textureSampleLevel(f, am, i.uv - d * 2., 0.).rgb + textureSampleLevel(f, am, i.uv + d * 2., 0.).rgb) * .084;
  c -= (textureSampleLevel(f, am, i.uv - d * 3., 0.).rgb + textureSampleLevel(f, am, i.uv + d * 3., 0.).rgb) * .0245;
  c -= (textureSampleLevel(f, am, i.uv - d * 4., 0.).rgb + textureSampleLevel(f, am, i.uv + d * 4., 0.).rgb) * .0226;
  // anti-banding: ruído triangular em px fixos, em degraus de 8 bits. Na parte quase preta some, para o preto não chuviscar.
  let n1 = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715))));
  let n2 = fract(52.9829189 * fract(dot(i.pos.xy + vec2f(47., 17.), vec2f(.06711056, .00583715))));
  let onde = smoothstep(0., 5. / 255., max(c.r, max(c.g, c.b)));
  c += (n1 + n2 - 1.) * P.x / 255. * onde;
  return vec4f(clamp(c, vec3f(0.), vec3f(1.)), 1.);
}
`;