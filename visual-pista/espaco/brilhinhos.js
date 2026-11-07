// Brilhinhos do logo: estrelas de quatro pontas que acendem na borda das letras. Quem dispara é o que estiver escolhido no app.
// Usado pelo Espaço e pela Marca, que têm V, G e a mesma vista da parede.
export const WGSL_BRILHINHO = /* wgsl */`
struct BI { @location(0) a: vec4f, @builtin(vertex_index) i: u32 };
struct BO { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) l: f32 };
@vertex fn vsBrilhinho(e: BI) -> BO {
  var QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = QQ[e.i];
  let c = V.m * vec4f(e.a.xyz, 1.);
  // cresce enquanto acende: a ponta corre para fora e volta
  let raio = (26. + 40. * e.a.w) * G.escala;
  var o: BO;
  o.pos = vec4f(c.xy + q * raio * V.px.xy * c.w, c.zw);
  o.q = q; o.l = e.a.w;
  return o;
}
@fragment fn fsBrilhinho(i: BO) -> @location(0) vec4f {
  let x = abs(i.q.x); let y = abs(i.q.y);
  // braço deitado com uns 3 px de altura, para sobreviver ao corte de linhas do sinal
  let deitado = exp(-y * y * 420.) * pow(max(1. - x, 0.), 2.4);
  let empe = exp(-x * x * 900.) * pow(max(1. - y, 0.), 2.4);
  let miolo = exp(-(x * x + y * y) * 90.);
  return vec4f(vec3f((deitado + empe) * .9 + miolo) * i.l * G.brilho, 1.);
}
`;

export async function criarBrilhinhos(gpu, urls) {
  const MAX = 14;
  // a borda de cada letreiro, lida do campo de distância: R = 0,5 é a borda
  const bordas = await Promise.all(urls.map(async u => {
    const b = await createImageBitmap(await (await fetch(u)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(b, 0, 0);
    const d = x.getImageData(0, 0, b.width, b.height).data, pts = [];
    for (let py = 0; py < b.height; py += 5) for (let px = 0; px < b.width; px += 5) {
      if (Math.abs(d[(py * b.width + px) * 4] - 122) < 7) pts.push(px / b.width, py / b.height);
    }
    return pts;
  }));
  const dados = new Float32Array(MAX * 4);
  const buf = gpu.createBuffer({ size: dados.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const vivos = [];
  let n = 0;
  return {
    // L: { cx, cy, z, meia, lw, lh, letra }. meia: metade da largura de referência do logo.
    quadro(dt, M, L) {
      // a camada de personagens lê isto para ficar atrás do logo
      window.__logoTela = { cx: L.cx, cy: L.cy, z: L.z, meia: L.meia, a: L.letra, b: L.letraB ?? L.letra, m: L.mix || 0 };
      if (M.disparou('brilhinhos', dt, 0.45)) {
        const pts = bordas[L.letra] || bordas[0];
        const quantos = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < quantos && vivos.length < MAX && pts.length; k++) {
          const i = Math.floor(Math.random() * pts.length / 2) * 2;
          vivos.push({ u: pts[i], v: pts[i + 1], t: 0, dur: 0.3 + Math.random() * 0.3, forca: 0.65 + Math.random() * 0.35 });
        }
      }
      n = 0;
      for (let i = vivos.length - 1; i >= 0; i--) {
        const b = vivos[i];
        b.t += dt;
        if (b.t >= b.dur) { vivos.splice(i, 1); continue; }
        const s = Math.sin(Math.PI * b.t / b.dur);
        dados[n * 4] = L.cx + (b.u - 0.5) * 2 * L.meia * L.lw;
        dados[n * 4 + 1] = L.cy - (b.v - 0.5) * 2 * L.meia * L.lh;
        dados[n * 4 + 2] = L.z - 0.005;
        dados[n * 4 + 3] = s * s * b.forca;
        n++;
      }
      if (n) gpu.queue.writeBuffer(buf, 0, dados, 0, n * 4);
    },
    desenhar(r, pipeline) {
      if (!n) return;
      r.setPipeline(pipeline); r.setVertexBuffer(0, buf); r.draw(6, n);
    },
    pipeline(m, layout, multisample, formato, soma) {
      return gpu.createRenderPipelineAsync({
        layout, multisample,
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
        vertex: { module: m, entryPoint: 'vsBrilhinho', buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
        fragment: { module: m, entryPoint: 'fsBrilhinho', targets: [{ format: formato, blend: soma }] },
      });
    },
  };
}

// O logo nos dois acabamentos, mais a luz do booth: um spot que vem de baixo, da altura do DJ, e bate nas letras por baixo e pela frente.
// Ele anda devagar de um lado para o outro. O acabamento e a luz são escolhidos no app.
export const WGSL_LOGO = /* wgsl */`
fn poçaDoBooth(uv: vec2f) -> f32 {
  let centro = vec2f(.5 + sin(G.tempo * .21) * .3, 1.12);
  let q = (uv - centro) * vec2f(1., .42);
  return exp(-dot(q, q) * 5.5);
}
// A luz cai com o quadrado da distância até a letra, como luz de verdade, e chega a zero antes da borda do campo de distância: nada de caixa em volta do logo.
fn luzDaDistancia(d: f32) -> f32 {
  let a = 1. / (1. + d * d / 676.);
  let b = 1. / (1. + d * d / 9025.);
  return (a * .62 + b * .38) * (1. - smoothstep(150., 300., d));
}
// O brilho discreto em volta das letras cabe na margem do quadro do logo, que tem 150 px.
fn brilhoPerto(d: f32) -> f32 {
  return (1. / (1. + d * d / 1156.)) * (1. - smoothstep(60., 140., d));
}
fn metalDoLogo(x: f32) -> f32 {
  // o gradiente metal do brand book
  var P = array<f32, 8>(.015, .19, .41, .52, .64, .70, .75, .84);
  var L = array<f32, 8>(.435, 1., .608, .82, .70, .518, .792, .886);
  let t = fract(x);
  if (t < P[0]) { return mix(L[7], L[0], (t + 1. - P[7]) / (P[0] + 1. - P[7])); }
  for (var i = 0; i < 7; i++) {
    if (t < P[i + 1]) { return mix(L[i], L[i + 1], smoothstep(0., 1., (t - P[i]) / (P[i + 1] - P[i]))); }
  }
  return mix(L[7], L[0], (t - P[7]) / (P[0] + 1. - P[7]));
}
// Zinco galvanizado, como a chapa da referência: flores de cristal grandes, cada uma inclinada para um lado.
// A luz que anda acende umas e apaga outras; dentro de cada flor há riscos finos de dendrito; e manchas escuras de oxidação, nubladas.
fn florZinco(p: vec2f) -> vec4f {
  let i = floor(p); let f = fract(p);
  var m1 = 9.; var m2 = 9.; var id = vec2f(0.);
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let g = vec2f(f32(x), f32(y));
    let o = vec2f(hash21(i + g + vec2f(3.7, 1.1)), hash21(i + g + vec2f(9.2, 4.4)));
    let d = length(g + o - f);
    if (d < m1) { m2 = m1; m1 = d; id = i + g; } else if (d < m2) { m2 = d; }
  } }
  return vec4f(hash21(id + vec2f(5., 9.)) - .5, hash21(id + vec2f(31., 2.)) - .5, hash21(id), m2 - m1);
}
fn zincoDoLogo(uv: vec2f, g: vec3f, cha: f32, Ve: vec3f, risco: f32, varre: f32, luz: f32) -> f32 {
  let p = uv * vec2f(2048., 720.) / 46.;
  let wq = vec2f(ruido2(p * .35), ruido2(p * .35 + vec2f(7., 3.))) - .5;
  let fz = florZinco(p + wq * .9);
  let Ng = normalize(vec3f(g.xy * cha + fz.xy * .34, -1.));
  let r = reflect(Ve, Ng);
  let y = r.y * 2.2 + (uv.y - .5) * .4;
  var c = .44 + .36 * smoothstep(-.3, .6, y);
  let faixa = r.x * 2. + r.y * 1.3 + (uv.x - .5) * 1.4 - varre;
  c += exp(-faixa * faixa * 9.) * .5;
  // cada flor tem a sua hora de acender, conforme a luz passa
  let acende = smoothstep(.05, .45, fz.x * sin(varre * 2.2 + fz.z * 6.2832) + fz.y * .45 + .12);
  c *= .74 + .34 * acende;
  let ang = fz.z * 6.2832;
  let pena = .5 + .5 * sin(dot(p, vec2f(cos(ang), sin(ang))) * 24. + ruido2(p * 3.) * 4.);
  c *= .88 + .2 * pena;
  c *= .9 + .1 * smoothstep(0., .07, fz.w);
  let mancha = smoothstep(.45, .78, ruido2(p * .16 + vec2f(2., 5.)) * .6 + ruido2(p * .5) * .4);
  c *= 1. - .34 * mancha;
  return c * (.88 + .24 * risco) * (.8 + luz * .3) + cha * cha * .12;
}
// codigo: unidade = acabamento (0 prata, 1 cromado, 2 canelado, 3 branco, 4 contorno, 5 gradiente metal, 6 zinco); dezena = reação (1 equalizador, 2 onda)
fn frenteLogo(d: f32, g: vec3f, uv: vec2f, w: vec3f, risco: f32, codigo: f32, spot: f32, varre: f32, luz: f32) -> f32 {
  let acab = codigo % 10.;
  let reage = floor(codigo / 10.);
  let cromo = select(0., 1., abs(acab - 1.) < .5);
  var lum = 0.;
  let cha = 1. - smoothstep(0., 18., -d);
  var N = normalize(vec3f(g.xy * cha, -1.));
  let Ve = normalize(w);
  if (cromo > .5) {
    // cromo: céu claro em cima, horizonte escuro, chão médio, e a faixa fina de luz. O reflexo é levantado porque o olho está quase na altura do logo.
    N = normalize(vec3f(g.xy * cha * 1.15, -1.));
    let r = reflect(Ve, N);
    let y = (r.y + .14) * 3. + (uv.y - .5) * .55;
    let topo = .62 * smoothstep(.02, .7, y) + .13;
    let baixo = .34 * (1. - smoothstep(-.5, .02, y)) + .05;
    var c = mix(baixo, topo, smoothstep(-.06, .09, y));
    let f = r.x * 2.3 + r.y * 1.6 + (uv.x - .5) * 1.6 - varre;
    c += exp(-f * f * 34.) * .85;
    lum = c * (.86 + .28 * risco) * (.8 + luz * .3) + cha * cha * .2;
  } else {
    // prata sólida
    let grad = mix(.92, .66, smoothstep(.25, .75, uv.y));
    let luzAlto = pow(max(dot(N, normalize(vec3f(-.25, .75, -.6))), 0.), 6.) * .3;
    let f = uv.x * 2.6 + uv.y * .7 - varre;
    lum = (grad + luzAlto + exp(-f * f * 5.) * .34) * (.74 + luz * .3);
  }
  if (acab > 1.5 && acab < 2.5) { lum *= .68 + .44 * smoothstep(-.4, .4, sin(uv.x * 2048. / 7.)); }
  if (acab > 2.5 && acab < 3.5) { lum = .96 * (.8 + luz * .25); }
  if (acab > 3.5 && acab < 4.5) { lum = (1. - smoothstep(4., 11., -d)) * (.75 + luz * .4); }
  if (acab > 4.5 && acab < 5.5) { lum = metalDoLogo(uv.y * .9 + uv.x * .22) * (.8 + luz * .3); }
  if (acab > 5.5 && acab < 6.5) { lum = zincoDoLogo(uv, g, cha, Ve, risco, varre, luz); }
  if (reage > .5 && reage < 1.5) { lum *= .3 + 1.25 * espectroEm(uv.x); }
  if (reage > 1.5) { let o = .5 + .5 * sin((uv.x * 3. - G.tempo * 1.4) * 6.2832); lum *= 1. - luz + luz * (.35 + 1.1 * o); }
  if (spot > .001) {
    let L = normalize(vec3f((.5 + sin(G.tempo * .21) * .3 - uv.x) * .9, -.75, -.6));
    let r = reflect(Ve, N);
    let difusa = max(dot(N, L), 0.);
    let brilho = pow(max(dot(r, L), 0.), select(26., 60., cromo > .5));
    // no prata a luz clareia a chapa; no cromo ela vira reflexo duro, mais forte e mais estreito
    let ganho = select(.2 + .55 * brilho + .32 * cha, .28 + 1.5 * brilho + .7 * cha, cromo > .5);
    lum += spot * poçaDoBooth(uv) * ganho * (.6 + .6 * difusa);
  }
  return lum;
}
fn ladoLogo(g: vec3f, uv: vec2f, codigo: f32, spot: f32, luz: f32) -> f32 {
  let acab = codigo % 10.;
  let cromo = select(0., 1., abs(acab - 1.) < .5);
  if (acab > 3.5 && acab < 4.5) { return .04; }
  var lum = (.13 + .27 * max(-g.y, 0.) + .1 * abs(g.x)) * (.8 + luz * .3);
  if (cromo > .5) { lum = .1 + .36 * max(-g.y, 0.); }
  // o lado de baixo da letra é o que mais recebe o spot
  return lum + spot * poçaDoBooth(uv) * (.1 + 1.1 * max(-g.y, 0.));
}
`;

// Luz forte atrás do logo: o painel vira luminária. É uma fonte de verdade na cena 3D, atrás da parede: o véu no ar atravessa a dobra
// e chega ao teto, as letras fazem sombra em raios, o metal pega o reflexo e o logo fica em contraluz.
// Precisa de C.contra (x = força), C.logo, longe(), LOGO_W, LOGO_H, ZF, HT e V.px.z = 1 na vista da parede.
export const WGSL_CONTRA = /* wgsl */`
fn fonteAtras() -> vec3f { return vec3f(C.logo.x, C.logo.y, C.logo.z + 1.4); }
// Quanto o ar manda de luz por este raio: a integral fechada de uma fonte pontual ao longo do raio. São cinco fontes, uma barra na largura do painel.
fn veuAtras(v: vec3f) -> f32 {
  var s = 0.;
  for (var i = 0; i < 5; i++) {
    let S = fonteAtras() + vec3f((f32(i) - 2.) * .46, 0., 0.);
    let b = dot(S, v);
    let c = sqrt(max(dot(S, S) - b * b, .0025));
    s += (1.5708 + atan(b / c)) / c;
  }
  return s / 5.;
}
// Do ponto onde o raio cruza o plano do logo até a luz, quanto passa por dentro de letra. Sem ruído no passo: grão não é bem-vindo no LED.
fn raiosDasLetras(v: vec3f) -> f32 {
  if (v.z < .03) { return 1.; }
  let p = v * (C.logo.z / v.z);
  let uv = vec2f((p.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (p.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
  var bate = 0.;
  for (var k = 0; k < 18; k++) {
    let q = mix(uv, vec2f(.5, .5), (f32(k) + .5) / 18. * .92);
    bate += 1. - smoothstep(-12., 12., longe(q));
  }
  return 1. - .82 * min(bate / 6.5, 1.);
}
struct CLO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vsContra(@builtin(vertex_index) i: u32) -> CLO {
  var QQ = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = QQ[i];
  var w = vec3f(q.x * 1.2, HT, ZF - 4.8 + q.y * 4.9);
  if (V.px.z > .5) { w = vec3f(q.x * 1.2, HT - .64 + q.y * .8, ZF); }
  var o: CLO;
  o.pos = V.m * vec4f(w, 1.);
  o.pos = vec4f(o.pos.xy, 1e-5 * o.pos.w, o.pos.w);
  o.w = w;
  return o;
}
@fragment fn fsContra(i: CLO) -> @location(0) vec4f {
  let v = normalize(i.w);
  if (C.contra.y > .5) {
    // halo, aurora e neon ficam só na parede, atrás das letras, e somem antes de qualquer beirada
    if (V.px.z < .5) { return vec4f(0., 0., 0., 1.); }
    let q = vec2f((i.w.x - C.logo.x) / (2. * C.logo.w * LOGO_W) + .5, .5 - (i.w.y - C.logo.y) / (2. * C.logo.w * LOGO_H));
    // fora do quadro do logo, a distância continua a crescer, em vez de repetir a da beirada
    let dentro = clamp(q, vec2f(0.), vec2f(1.));
    let dl = max(longe(dentro), 0.) + length((q - dentro) * vec2f(2048., 720.));
    var a = 0.;
    if (C.contra.y < 1.5) { a = luzDaDistancia(dl); }
    else if (C.contra.y < 2.5) {
      // aurora: uma nuvem de luz oval atrás do logo, que apaga antes de chegar às beiradas da parede
      let dx = (i.w.x - C.logo.x) / .6; let dy = (i.w.y - C.logo.y) / .22;
      let some = (1. - smoothstep(.55, .92, abs(i.w.x - C.logo.x))) * (1. - smoothstep(.3, .58, abs(i.w.y - C.logo.y)));
      a = exp(-dx * dx - dy * dy) * some * .6 + luzDaDistancia(dl) * .5;
    }
    else { a = (1. / (1. + dl * dl / 81.)) * 1.15 * (1. - smoothstep(60., 150., dl)); }
    let ruido = (fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
    return vec4f(vec3f(a * C.contra.x) * G.brilho + max(ruido, 0.), 1.);
  }
  var veu = veuAtras(v) * .16;
  // na parede, a própria chapa de luz atrás das letras: é o que faz o painel virar luminária
  if (V.px.z > .5) {
    let dx = (i.w.x - C.logo.x) / 1.15; let dy = (i.w.y - C.logo.y) / .62;
    veu += 1.15 * exp(-dx * dx - dy * dy);
  }
  let dither = (fract(52.9829189 * fract(dot(i.pos.xy, vec2f(.06711056, .00583715)))) - .5) / 255.;
  if (veu * C.contra.x < .002) { return vec4f(vec3f(max(dither, 0.)), 1.); }
  return vec4f(vec3f(veu * raiosDasLetras(v) * C.contra.x) * G.brilho + max(dither, 0.), 1.);
}
// O que a luz de trás faz numa peça: fio no metal, reflexo largo e um pouco de difusa. Decai com a distância: ilumina o que está perto da parede.
fn luzAtrasEm(w: vec3f, N: vec3f, Ve: vec3f, metal: f32) -> f32 {
  if (C.contra.x < .004 || C.contra.y > .5) { return 0.; }
  let d = fonteAtras() - w;
  let dq = dot(d, d);
  let L = d / sqrt(dq);
  let e = max(dot(reflect(Ve, N), L), 0.);
  return ((pow(e, 34.) * 1.9 + pow(e, 5.) * .3) * metal + max(dot(N, L), 0.) * .22) / (1. + dq * .03) * C.contra.x;
}
// Contraluz: a frente da letra escurece e a borda acende. É o que deixa o logo legível com o fundo estourado.
fn logoEmContraluz(lum: f32, d: f32, k: f32) -> f32 {
  let f = select(0., min(C.contra.x, 1.), C.contra.y < .5);
  if (k > .5) { return lum * (1. - .3 * f) + f * .3; }
  return lum * (1. - .42 * f) + f * .3 * exp(min(d, 0.) / 4.);
}
`;

// Força da luz atrás do logo neste quadro: o que estiver escolhido no app, mais o botão.
const CONTRA_TESTE = new URLSearchParams(location.search).get('contra');
window.__temContraluz = true;
export function forcaContra(M) {
  if (CONTRA_TESTE !== null) return parseFloat(CONTRA_TESTE);
  const modo = M.modo('contraluz');
  const base = modo === 'desligado' ? 0 : modo === 'fixo' ? 0.8 : 0.1 + 0.9 * M.fonte('contraluz');
  const botao = window.__luzShow ? window.__luzShow.atras : 0;
  return Math.max(base, botao * 1.7);
}
const ESTILOS = { halo: 1, aurora: 2, neon: 3 };
export const estiloLuz = M => ESTILOS[M.modo('estiloLuz')] ?? 1;
const ACABAMENTOS = { prata: 0, cromado: 1, canelado: 2, branco: 3, contorno: 4, metal: 5, zinco: 6 };
const JEITOS = { equalizador: 1, onda: 2 };
const TAMANHOS = { pequeno: 0.75, medio: 1, grande: 1.1 };
// O logo no app: acabamento, tamanho e como reage ao som.
export function ajusteLogo(M) {
  const r = M.modo('logoReage'), n = M.fonte('logoFonte');
  return {
    codigo: (ACABAMENTOS[M.modo('logo')] || 0) + 10 * (JEITOS[r] || 0),
    esc: (TAMANHOS[M.modo('logoTam')] || 1) * (r === 'pulsa' ? 1 + 0.07 * n : 1),
    luz: r === 'acende' ? 0.45 + 0.55 * n : r === 'onda' ? n : 0.7,
  };
}
export function pipelineContra(gpu, m, layout, multisample, formato, soma) {
  return gpu.createRenderPipelineAsync({
    layout, multisample,
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
    vertex: { module: m, entryPoint: 'vsContra' },
    fragment: { module: m, entryPoint: 'fsContra', targets: [{ format: formato, blend: soma }] },
  });
}
