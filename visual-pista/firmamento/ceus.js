// Os céus do Firmamento. Cada um é uma função ceuEm(v), com v a direção do olhar: devolve (luz, quanto das estrelas continua a passar).
// Tudo em tons de prata, sem cor, como o céu preto do CLUBE. Unidades: y para cima, z para a parede do DJ, x para a direita.
const norm = a => { const n = Math.hypot(...a); return a.map(x => x / n); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vec = a => `vec3f(${a.map(x => x.toFixed(6)).join(', ')})`;

export const WGSL_RUIDO = /* wgsl */`
fn h3(p: vec3f) -> vec3f {
  let q = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)), dot(p, vec3f(269.5, 183.3, 246.1)), dot(p, vec3f(113.5, 271.9, 124.6)));
  return -1. + 2. * fract(sin(q) * 43758.5453123);
}
// ruído de gradiente: sem o aspecto de caixinhas do ruído de valor
fn gn(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i;
  let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(mix(dot(h3(i), f), dot(h3(i + vec3f(1, 0, 0)), f - vec3f(1, 0, 0)), u.x),
                 mix(dot(h3(i + vec3f(0, 1, 0)), f - vec3f(0, 1, 0)), dot(h3(i + vec3f(1, 1, 0)), f - vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(dot(h3(i + vec3f(0, 0, 1)), f - vec3f(0, 0, 1)), dot(h3(i + vec3f(1, 0, 1)), f - vec3f(1, 0, 1)), u.x),
                 mix(dot(h3(i + vec3f(0, 1, 1)), f - vec3f(0, 1, 1)), dot(h3(i + vec3f(1, 1, 1)), f - vec3f(1, 1, 1)), u.x), u.y), u.z);
}
fn fbm(p0: vec3f, oct: i32) -> f32 {
  var s = 0.; var a = .5; var p = p0;
  for (var i = 0; i < oct; i++) {
    s += a * gn(p);
    p = vec3f(p.x * .8 + p.z * .6, p.y, p.z * .8 - p.x * .6).yzx * 2.03 + vec3f(1.7, 9.2, 3.3);
    a *= .5;
  }
  return s;
}
`;
const SEM_LENTE = /* wgsl */`fn lenteEstrela(w: vec3f, segunda: f32) -> vec4f { return vec4f(w, 1.); }`;

// ---------- VIA LÁCTEA: a galáxia inteira, de pé. O núcleo nasce atrás do logo e a faixa passa sobre a cabeça, com nuvens de poeira na frente. ----------
const K_G = norm([0.1, 0.1, 1]);
const N_G = (() => { const s = [1, -0.2, 0]; const d = dot(s, K_G); return norm([s[0] - d * K_G[0], s[1] - d * K_G[1], s[2] - d * K_G[2]]); })();
const lactea = {
  res: [1, 0.5], espelho: true, estrelas: [6500, 1500], deriva: 0.05,
  pesoEstrela: dir => { const b = dot(norm(dir), N_G); return 0.14 + 0.86 * Math.exp(-(b * b) / (0.3 * 0.3)); },
  wgsl: /* wgsl */`
${SEM_LENTE}
const N_G = ${vec(N_G)}; const K_G = ${vec(K_G)};
fn ceuEm(v: vec3f) -> vec2f {
  let b = dot(v, N_G);
  let a = acos(clamp(dot(v, K_G), -1., 1.));
  // o espaço é achatado no plano da galáxia: as nuvens ficam compridas ao longo da faixa
  let f = C.ceu.z * .004;
  let p = (v + N_G * b * 2.6) * 2.7 + K_G * f;
  let dobra = vec3f(fbm(p + vec3f(1.7, 9.2, 3.1), 3), fbm(p + vec3f(8.3, 2.8, 7.7), 3), fbm(p + vec3f(4.1, 5.3, 1.9), 3));
  let nuvem = fbm(p * 1.3 + dobra * 1.5, 6);
  let miudo = fbm(p * 4.6 + dobra * 2.2 + vec3f(3.), 4);
  // faixa e bojo: mais grossos perto do núcleo
  let junto = exp(-a * a / .62);
  let sigma = .13 + .17 * junto;
  let faixa = exp(-pow(abs(b) / sigma, 1.25));
  let bojo = exp(-a * a / .035 - b * b / .012) * 1.9 + exp(-a * a / .3 - b * b / .04) * .85;
  // poeira: filamentos escuros que correm no meio da faixa
  let fil = 1. - abs(fbm(p * 1.9 + dobra * 1.9 + vec3f(11.), 6)) * 3.2;
  let meio = exp(-pow((b + .02 * sin(a * 7.)) / .085, 2.));
  let poeira = clamp(smoothstep(.25, .95, fil) * (.2 + 1.2 * meio) + max(nuvem + .08, 0.) * 1.1 * meio, 0., 3.);
  let brilho = (faixa * (.13 + 1.15 * max(nuvem + .22, 0.) + .34 * max(miudo + .1, 0.)) + bojo) * exp(-poeira * 1.25);
  // pó de estrelas sem resolução: textura fina dentro da luz, nunca no preto
  let po = 1. + .38 * smoothstep(.2, .7, v.y) * (gn(v * 230.) + gn(v * 511.) * .7);
  let som = .5 + .85 * C.ceu.x + .3 * C.ceu.y * junto;
  return vec2f(brilho * po * som * .7, 1. - min(poeira * faixa * .4, .85));
}
`,
};

// ---------- RASTROS: foto de longa exposição ao vivo. Milhares de arcos giram em volta do polo, que fica no teto, perto da parede. O grave abre a exposição. ----------
const POLO = norm([0.1, 0.33, 1]);
const E1 = norm(cruz(POLO, [0, 1, 0])), E2 = cruz(POLO, E1);
const rastros = {
  res: [1, 1], espelho: true, estrelas: [500, 80], deriva: 0, semMeteoros: false,
  wgsl: /* wgsl */`
${SEM_LENTE}
const POLO = ${vec(POLO)}; const E1 = ${vec(E1)}; const E2 = ${vec(E2)};
fn arcos(rho: f32, ax: f32, ay: f32, phi: f32, delta: f32, semente: f32, tamanho: f32, giro: f32, forca: f32) -> f32 {
  let t = rho / delta;
  let n = floor(t);
  let d = (t - n - .5) * delta;
  // a espessura em px não muda em lugar nenhum do painel, e vale o corte de linhas do sinal
  let aa = ax + ay * CORTE_C;
  let hw = aa * .95;
  let linha = 1. - smoothstep(hw * .55, hw * 1.5, abs(d));
  // onde os anéis ficam mais finos que 3 px, some aos poucos em vez de virar moiré
  let cheio = clamp(delta / (aa * 3.2), 0., 1.);
  let h1 = hash21(vec2f(n, semente));
  let h2 = hash21(vec2f(n + 7.3, semente * 1.7 + 3.));
  let h3b = hash21(vec2f(n + 19.1, semente * 2.3 + 5.));
  let vel = 1.;
  // cada anel tem 3 estrelas; todos os arcos cobrem o mesmo ângulo, como numa foto de verdade
  let x = fract(phi * 3. + h1 * 5. + giro * vel);
  let len = tamanho * (.86 + .28 * h2);
  // ponta dura, onde a estrela está agora, e cauda que apaga
  let cauda = (1. - smoothstep(0., len, x)) * smoothstep(0., .006, x);
  let cabeca = exp(-x / .007) * 1.4;
  let mag = .18 + 1.1 * h3b * h3b * h3b + .25 * h2;
  return linha * (cauda * cauda * .85 + cabeca) * mag * cheio * forca;
}
fn ceuEm(v: vec3f) -> vec2f {
  let cr = clamp(dot(v, POLO), -1., 1.);
  let c = dot(v, E1); let s = dot(v, E2);
  let rho = atan2(sqrt(c * c + s * s), cr);
  let ax = abs(dpdx(rho)); let ay = abs(dpdy(rho));
  let phi = atan2(s, c) / 6.2831853 + .5;
  let giro = C.ceu.z * .0135;
  // o grave abre a exposição: os arcos crescem e voltam, como se a câmera respirasse
  let tam = .1 + .62 * C.ceu.x;
  var l = 0.;
  l += arcos(rho, ax, ay, phi, .0192, 1., tam, giro, .75);
  l += arcos(rho + .0041, ax, ay, phi, .0121, 2., tam * .9, giro, .46);
  l += arcos(rho + .0023, ax, ay, phi, .0071, 3., tam * .82, giro, .26);
  // um brilho largo em volta do polo, para o olho achar o centro do giro
  let polo = exp(-rho * rho / .012) * .16 * (.5 + C.ceu.x);
  return vec2f(l * (.8 + .95 * C.ceu.x) + polo, 1.);
}
`,
};

// ---------- AURORA: cortinas de luz prateada que caem do alto. Sobre a cabeça, os raios convergem para o zênite. ----------
const aurora = {
  res: [0.6, 0.4], espelho: true, estrelas: [4200, 1000], acumula: 0.42, deriva: 0.05,
  wgsl: /* wgsl */`
${SEM_LENTE}
// Ruído 2D com a origem bem longe do zero: o hash perto de (0, 0) não é aleatório e fazia uma emenda sobre a cabeça.
fn rn(p: vec2f) -> f32 { return ruido2(p + vec2f(173.7, 419.3)); }
fn cortinas(p: vec2f, f: f32, fino: f32) -> f32 {
  // o desenho da faixa no alto, dobrado duas vezes: é o que dá as pregas
  let w1 = vec2f(rn(p * .13 + vec2f(f * .035, 3.)), rn(p * .13 + vec2f(9., -f * .03))) - .5;
  let q = p + w1 * 15.;
  let w2 = vec2f(rn(q * .5 + vec2f(-f * .07, 1.)), rn(q * .5 + vec2f(5., f * .06))) - .5;
  let q2 = q + w2 * 3.4;
  // raios verticais, finos, que correm ao longo da faixa
  let lx = q2.x * 2.6;
  let raio = pow(rn(vec2f(lx, f * .22)), 2.5) * 1.1 + pow(rn(vec2f(lx * 3.3, f * .4 + 4.)), 4.) * 2.6 * fino + pow(rn(vec2f(lx * 8.5, f * .7 + 9.)), 5.) * 2.6 * fino * fino + .1 * (1. - fino);
  let lz = q2.y * 2.6;
  let raioL = pow(rn(vec2f(lz, f * .22 + 7.)), 2.5) * 1.1 + pow(rn(vec2f(lz * 3.3, f * .4 + 2.)), 4.) * 2.6 * fino + pow(rn(vec2f(lz * 8.5, f * .7 + 5.)), 5.) * 2.6 * fino * fino + .1 * (1. - fino);
  var s = 0.;
  let d1 = q2.y - 8.; let d2 = q2.y - 19.; let d3 = q2.y + 9.; let d4 = q2.x - 1.5 + q2.y * .1;
  s += exp(-d1 * d1 / .5) * raio;
  s += exp(-d2 * d2 / 1.4) * raio * .9;
  s += exp(-d3 * d3 / .8) * raio * .8;
  s += exp(-d4 * d4 / .34) * raioL * 1.1;
  return s;
}
fn ceuEm(v: vec3f) -> vec2f {
  let y = max(v.y, .012);
  let xz = v.xz / y;
  let f = C.ceu.z;
  let fino = exp(-length(xz) / 13.);
  const N = 30;
  var soma = 0.;
  let salto = fract(52.9829189 * fract(dot(PX, vec2f(.06711056, .00583715))) + C.ceu.w * .618);
  var i = 0;
  loop {
    if (i >= N) { break; }
    let t = (f32(i) + salto) / f32(N);
    let h = 1. + t * t * 3.4;
    // a base da cortina é nítida e brilhante, e ela some devagar para cima
    let perfil = (1. - exp(-t * 30.)) * (exp(-t * 8.) * 2.2 + exp(-t * 2.6) * .22);
    soma += cortinas(xz * h, f, fino) * perfil * (.14 + t * .3);
    i++;
  }
  let dist = length(xz);
  let longe = exp(-dist / 30.) * .9 + .1;
  let l = soma * (.42 + .95 * C.ceu.x) * longe * 1.55;
  return vec2f(l, 1. - min(l * .7, .9));
}
`,
};

// ---------- ECLIPSE: a lua cobre o sol exatamente atrás do logo. A coroa sobe pela parede e continua pelo teto em raios enormes. ----------
const SOL = norm([0, 0.1132, 4.19]);
const S1 = norm(cruz(SOL, [0, 1, 0])), S2 = cruz(SOL, S1);
const eclipse = {
  res: [1, 0.5], espelho: false, estrelas: [3600, 900], deriva: 0.04, luzNaCena: true,
  wgsl: /* wgsl */`
${SEM_LENTE}
const SOL = ${vec(SOL)}; const S1 = ${vec(S1)}; const S2 = ${vec(S2)};
const RL = .113;    // raio da lua, em radianos
fn ceuEm(v: vec3f) -> vec2f {
  let f = C.ceu.z;
  // a lua passeia muito pouco em volta do sol: de vez em quando deixa escapar a conta de luz na borda
  let ang = C.ceu2.w * .05;
  let des = vec2f(cos(ang), sin(ang)) * .0032;
  let lua = normalize(SOL + S1 * des.x + S2 * des.y);
  let cs = dot(v, SOL);
  let a = acos(clamp(cs, -1., 1.));
  let aL = acos(clamp(dot(v, lua), -1., 1.));
  let x = dot(v, S1); let y = dot(v, S2);
  let dir = vec2f(x, y) / max(length(vec2f(x, y)), 1e-4);
  let r = max(a / RL, 1.);
  let lr = log(r);
  // coroa: lobos grandes, plumas e fios. Tudo corre para fora com a música
  let fora = lr * .9 - f * .012;
  let lobos = gn(vec3f(dir * 1.35, f * .006));
  let serpe = gn(vec3f(dir * 4.1, fora * .55 + 3.));
  let plumas = gn(vec3f(dir * 11.5, fora * .9 + 7.));
  let fios = gn(vec3f(dir * 34., fora * 1.6));
  let fino = gn(vec3f(dir * 82., fora * 2.1 + 5.));
  // fora do equador, os lobos somem e sobram as plumas curtas: é o desenho de uma coroa de verdade
  let forma = clamp(.62 + 1.25 * lobos + .75 * serpe + .55 * plumas * (1. + 1. / r) + .34 * fios + .16 * fino, .02, 3.);
  let queda = 2.25 - .55 * C.ceu.x;
  let intens = pow(1. / r, queda) * (forma + .45 / (r * r));
  let som = .36 + 1.1 * C.ceu.x + C.ceu2.z * .7;
  var l = intens * som * 1.05;
  // anel de cromosfera, fino e duro, com as protuberâncias
  let aa = max(abs(dpdx(aL)) + abs(dpdy(aL)) * CORTE_C, .00002);
  let dL = aL - RL;
  let prot = max(gn(vec3f(dir * 22., f * .02)), 0.) * .0042;
  l += (1. - smoothstep(0., .0014 + prot + aa * 1.5, dL)) * smoothstep(-aa * 1.2, 0., dL) * 2.6 * (.55 + .7 * C.ceu.x);
  // conta de diamante: o ponto do sol que a lua não cobriu, onde a borda da lua está mais longe do sol
  let lado = normalize(vec2f(-des.x, -des.y));
  let onde = dot(dir, lado);
  let gota = exp(-(1. - onde) * 240.) * exp(-abs(dL) * 280.) * (.5 + 3. * C.ceu.y);
  let raio = exp(-(1. - onde) * 26.) * exp(-max(dL, 0.) * 26.) * C.ceu.y * .55;
  l += gota * 2.4 + raio;
  // a lua: quase preta, com o reflexo da Terra só no limite do que se vê
  let dentro = smoothstep(aa, -aa, dL);
  let terra = (.0085 + gn(vec3f(v.xy * 28., 2.)) * .0035) * (.6 + .4 * C.ceu.x);
  l = mix(l, terra, dentro);
  let tampa = 1. - dentro;
  return vec2f(l, tampa * (1. - min(l * .9, .92)));
}
`,
};

// ---------- ANÉIS: um planeta nasce atrás do logo, e os anéis passam sobre a cabeça, de horizonte a horizonte, em milhares de riscos. ----------
function perfilAneis() {
  const L = 8192, d = new Uint8Array(L * 4);
  let semente = 91;
  const sorte = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  // ruído em várias escalas, sempre o mesmo em toda abertura
  const ondas = [];
  for (const [n, a] of [[6, .3], [14, .26], [32, .22], [75, .2], [170, .18], [390, .16], [900, .14], [2100, .1]]) {
    for (let k = 0; k < 7; k++) ondas.push({ f: n * (.7 + sorte() * .6) * Math.PI * 2 / L, p: sorte() * 7, a: a / 2.6 });
  }
  const passa = (x, a, b, e) => Math.min(Math.max((x - a) / e, 0), 1) * Math.min(Math.max((b - x) / e, 0), 1);
  for (let i = 0; i < L; i++) {
    const x = i / L;
    let n = 0;
    for (const o of ondas) n += Math.sin(i * o.f + o.p) * o.a;
    // anel C fraco, anel B cheio, divisão larga, anel A, divisões finas, anel F de um risco só
    const C = passa(x, .04, .24, .012) * .24;
    const B = passa(x, .24, .6, .004) * (.9 + .25 * Math.sin(x * 33));
    const A = passa(x, .655, .9, .004) * .66;
    const fino = Math.exp(-Math.pow((x - .958) / .0016, 2)) * .9;
    const fenda = 1 - Math.exp(-Math.pow((x - .84) / .0032, 2)) * .96;
    const fenda2 = 1 - Math.exp(-Math.pow((x - .44) / .0018, 2)) * .8;
    const op = Math.min(1, (C + B + A) * fenda * fenda2 * Math.max(0, 1 + n * .9) + fino);
    const br = Math.min(1, op * (.62 + .42 * n + .25 * (B > .1 ? 1 : 0)));
    d[i * 4] = Math.max(0, br) * 255;
    d[i * 4 + 1] = op * 255;
    d[i * 4 + 2] = 0;
    d[i * 4 + 3] = 255;
  }
  return d;
}
const PLANETA = norm([0.02, -0.304, 1]);
const aneis = {
  res: [1, 0.5], espelho: false, estrelas: [5200, 1000], deriva: 0.05, luzNaCena: true, perfil: perfilAneis,
  wgsl: /* wgsl */`
${SEM_LENTE}
const PLANETA = ${vec(PLANETA)};
const AP = .408;    // raio do planeta, em radianos
const NRM = ${vec(norm([0.09, 1, -0.19]))};   // o plano dos anéis passa um pouco acima da cabeça, inclinado para um lado
fn ceuEm(v: vec3f) -> vec2f {
  let f = C.ceu.z;
  // anéis: cruzo o raio com o plano, e a distância ao centro diz em que risco ele caiu
  let dn = dot(v, NRM);
  let t = .75 / max(dn, .002);
  let p = v * t;
  let cx = -60.; let cz = 2.;
  let rr = length(vec2f(p.x - cx, p.z - cz));
  let u = (rr - 58.55) / 2.7;
  let dentro = step(.0002, dn) * step(0., u) * step(u, 1.);
  let pf = textureSample(perfil, amT, vec2f(u, .5));
  // grãos e raios escuros que giram com o anel
  let az = atan2(p.z - cz, p.x - cx);
  let raios = .86 + .34 * gn(vec3f(az * 120. - f * .01, u * 5., 1.));
  // a luz vem do planeta e fica forte quando se olha para ele, atrás dos anéis
  let cont = max(dot(v, PLANETA), 0.);
  let fundo = .55 + 1.7 * pow(cont, 5.) + 2.2 * pow(cont, 40.);
  // o bumbo anda ao longo dos anéis, da parede para a entrada
  let ao = clamp(.5 + v.z * .5, 0., 1.);
  let onda = (ondaEm(1. - ao) + ondaEm(.97 - ao) + ondaEm(1.03 - ao) + ondaEm(.94 - ao) + ondaEm(1.06 - ao)) * .2;
  let som = .56 + .95 * C.ceu.x + .6 * onda;
  let visto = 1. - exp(-t * .09);   // ao longe o anel some no preto, antes de chegar ao horizonte
  let lum = pf.r * raios * fundo * som * dentro * (1. - visto * .85);
  let op = pf.g * dentro * .8 * (1. - visto * .85);
  // o planeta: disco preto com o sol prestes a sair por trás. Só a beira da atmosfera acende
  let cp = dot(v, PLANETA);
  let a = acos(clamp(cp, -1., 1.));
  let aa = max(abs(dpdx(a)) + abs(dpdy(a)) * CORTE_C, .00002);
  let d = a - AP;
  let tampa = smoothstep(-aa, aa, d);
  let nasc = exp(-pow(atan2(v.x - PLANETA.x, v.y - PLANETA.y) / .7, 2.));
  let forca = .55 + .85 * C.ceu.x + C.ceu2.z * .9;
  let fora = max(d, 0.);
  let atm = (exp(-fora / .0022) * 1.5 + exp(-fora / .012) * .4 + exp(-fora / .05) * .1) * (.25 + 1.1 * nasc) * forca;
  // dentro do disco, o crepúsculo escorre um pouco antes de virar noite
  let cre = exp(max(-d, 0.) / -.0055) * (.1 + .75 * nasc) * forca * (1. - tampa);
  // a face do planeta tem umas faixas largas, quase invisíveis, para não ficar um buraco
  let lado = a / AP;
  let faixas = (.006 + .004 * gn(vec3f(v.x * 3., v.y * 42., 3.))) * (1. - smoothstep(.75, 1., lado) * .2);
  let noite = (faixas + cre) * (1. - tampa);
  let l = (lum + atm * tampa * (1. - op * .7)) * tampa + noite;
  return vec2f(l, tampa * (1. - op) * (1. - min(atm * .7, .9)));
}
`,
};

// ---------- HORIZONTE DE EVENTOS: um buraco negro traçado raio a raio, com a luz dobrada pela gravidade. O disco corre ao longo do painel. ----------
const BD = norm([0, 0.82, 0.57]);
const NDISCO = norm([1, 0.02 - 0.3 * BD[1], -0.3 * BD[2]]);
const DIST = 12.5;
const EE = 2 / DIST;   // raio de Einstein ao quadrado, com raio de Schwarzschild = 1
const horizonte = {
  res: [1, 0.5], espelho: false, estrelas: [5200, 1000], acumula: 0.55, deriva: 0.07, lente: true,
  wgsl: /* wgsl */`
const BD = ${vec(BD)};
const ND = ${vec(NDISCO)};
const DIST = ${DIST.toFixed(1)};
const EE = ${EE.toFixed(5)};
// As estrelas nítidas passam por uma lente fina: cada uma vira duas imagens, a principal e a do outro lado, bem fraca. Bate com o raio traçado do lado de fora do disco.
fn lenteEstrela(w: vec3f, segunda: f32) -> vec4f {
  let s = normalize(w);
  let cb = clamp(dot(s, BD), -1., 1.);
  let beta = acos(cb);
  let lado = (s - BD * cb) / max(sin(beta), 1e-4);
  let raiz = sqrt(beta * beta + 4. * EE);
  var th = (beta + raiz) * .5;
  var g = 1.;
  if (segunda > .5) {
    th = (raiz - beta) * .5;
    let e = th * th / EE;
    g = clamp(1. / max(1. / (e * e) - 1., .0001) * .25, 0., .8);
    th = -th;
  }
  return vec4f((BD * cos(th) + lado * sin(th)) * length(w), g);
}
fn ruidoDisco(q: vec2f, r: f32, ang: f32) -> f32 {
  let d = vec2f(cos(ang), sin(ang));
  let grosso = fbm(vec3f(d * 1.9, r * 1.15), 3);
  let estria = fbm(vec3f(d * 2.6 + vec2f(grosso), r * 5.2), 4);
  let fio = gn(vec3f(d * 5., r * 21.));
  return grosso * .75 + estria * .95 + fio * .3;
}
fn disco(p: vec3f, r: f32, dir: vec3f) -> vec2f {
  let E1 = normalize(cross(ND, vec3f(0., 1., .2)));
  let E2 = cross(ND, E1);
  let x = dot(p, E1); let z = dot(p, E2);
  let az = atan2(z, x);
  // cada raio gira na própria velocidade (Kepler). A rotação é trocada aos poucos para a textura não enrolar sem fim
  let w = 1.6 / pow(r, 1.5);
  let T = 9.;
  let f = C.ceu.z * .55;
  let t1 = fract(f / T); let t2 = fract(f / T + .5);
  let k1 = ruidoDisco(vec2f(x, z), r, az - w * t1 * T);
  let k2 = ruidoDisco(vec2f(x, z), r, az - w * t2 * T + 2.1);
  let mistura = abs(t1 * 2. - 1.);
  let textura = mix(k1, k2, mistura);
  // perfil do disco fino: acende na borda de dentro e cai para fora
  let ri = 3.; let ro = 11.;
  let perfilT = pow(ri / r, 2.4) * sqrt(max(1. - sqrt(ri / r), 0.)) * 4.8;
  let borda = smoothstep(ri, ri + .35, r) * (1. - smoothstep(ro * .62, ro, r));
  // Doppler: o lado que vem na direção do olho brilha muito mais
  let vel = normalize(cross(ND, p)) * sqrt(.5 / max(r - 1., .5));
  let g = sqrt(max(1. - 1.5 / r, .02)) / max(1. - dot(vel, -dir), .15);
  let quente = pow(g, 2.3);
  let hotspot = exp(-pow((r - 4.6) / .7, 2.)) * exp((cos(az - C.ceu2.w * 1.4) - 1.) * 18.) * C.ceu.y * 2.2;
  let luz = (perfilT * (.32 + 2.1 * max(textura + .16, 0.)) + hotspot) * borda * quente;
  let op = borda * clamp(.5 + 1.1 * max(textura + .2, 0.), 0., 1.) * .9;
  return vec2f(luz, op);
}
fn fundoLente(d: vec3f) -> f32 {
  // poeira larga ao fundo, só para a lente ter o que dobrar
  let n = fbm(d * 2.6 + vec3f(3.), 4);
  let f = fbm(d * 7. + vec3f(n * 2.), 3);
  return max(n + .12, 0.) * .05 + max(f + .2, 0.) * max(n + .2, 0.) * .05;
}
fn ceuEm(v: vec3f) -> vec2f {
  let O = -BD * DIST;
  let b = length(cross(O, v));
  let som = .55 + .85 * C.ceu.x;
  // raio que passa longe não precisa de conta nenhuma
  if (b > 30. || dot(v, BD) < 0.) {
    let cb = clamp(dot(v, BD), -1., 1.);
    return vec2f(fundoLente(v) * som * 2.4, 1.);
  }
  var p = O;
  var d = v;
  let h2 = dot(cross(p, d), cross(p, d));
  var lum = 0.;
  var T = 1.;
  var preso = false;
  var ant = dot(p, ND);
  var i = 0;
  loop {
    if (i >= 110) { break; }
    let r2 = dot(p, p);
    let r = sqrt(r2);
    if (r < 1.03) { preso = true; break; }
    if (r > DIST * 1.45 && dot(p, d) > 0.) { break; }
    let dt = clamp((r - 1.) * .17, .035, 1.5);
    d += -1.5 * h2 * p / (r2 * r2 * r) * dt;
    let q = p + d * dt;
    let dq = dot(q, ND);
    if (ant * dq < 0.) {
      let k = ant / (ant - dq);
      let hit = mix(p, q, k);
      let rh = length(hit);
      if (rh > 2.9 && rh < 11.) {
        let e = disco(hit, rh, normalize(d));
        lum += T * e.x;
        T *= 1. - e.y;
      }
    }
    ant = dq;
    p = q;
    i++;
  }
  if (preso) { return vec2f(lum * som * 1.5, 0.); }
  let fim = normalize(d);
  // anel de fótons: o raio que quase ficou preso sai com muita luz junto
  let quase = exp(-pow((sqrt(h2) - 2.6) / .045, 2.)) * .35 * T;
  return vec2f((lum + quase) * som * 1.5 + T * fundoLente(fim) * som * 2.4, T);
}
`,
};

export const CEUS = { lactea, rastros, aurora, eclipse, aneis, horizonte };
