import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { A, NF, ligarAudio, analisarAudio, audioVivo, audioNoComando } from './audio.js';
import { vertConteudo, fragConteudo, vertLaminas, fragLaminas } from './shaders.js';

// Painel LED da pista (5º andar): 1032 x 5676 px, 1,92 x 10,56 m, em L. As 4988 linhas de cima
// correm pelo teto (linha 0 = ponta longe do DJ) e as 688 de baixo descem atrás do DJ.
const PW = 1032, PH = 5676, TETO = 4988, CW = 43, CH = 86;
const M = 1.92 / PW; // metros por pixel

const Q = new URLSearchParams(location.search);
const SAIDA = Q.has('saida');                                   // só o painel, na resolução dele
const ESCALA = Number(Q.get('escala')) || (SAIDA ? 1 : 0.5);
const RW = Math.round(PW * ESCALA), RH = Math.round(PH * ESCALA);
const BRILHO = Number(Q.get('brilho') || 1);
const COMPASSOS = Number(Q.get('compassos')) || 8;              // compassos entre uma virada e outra
const ATRASO = (Number(Q.get('atraso')) || 60) / 1000;          // placa + controladora até o LED

// Degradês do brand book (três pontos fixos 0 / 55 / 91 %). Os três primeiros são os oficiais;
// os outros vêm das paletas alternativas de instagram/assets/clube.css.
const PALETAS = {
  vermelho:  ['#ff8564', '#ff4c2c', '#ff0000'],
  azul:      ['#07b9df', '#00a0e2', '#0070ae'],
  vinho:     ['#a04d5c', '#7e3443', '#57202b'],
  verde:     ['#00c059', '#00b02a', '#00771a'],
  petroleo:  ['#3f8288', '#2a666c', '#17474c'],
  terracota: ['#e8957a', '#d2704e', '#b55a3c'],
  grafite:   ['#6f6f6f', '#2b2b2b', '#000000'],
};
const NOMES_PALETAS = Object.keys(PALETAS);
const LETRAS = 'abcdefghij'.split('');
const CENAS = ['figuras', 'gradiente', 'equalizador'];

// ---------- renderizador ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // cores da marca já vêm em sRGB
document.body.appendChild(renderer.domElement);
if (SAIDA) { document.body.classList.add('saida'); renderer.setSize(RW, RH); }
else renderer.setSize(innerWidth, innerHeight);

const camPainel = new THREE.OrthographicCamera(0, PW, 0, -PH, -100, 100);
const rtOpcoes = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
const rtA = new THREE.WebGLRenderTarget(RW, RH, rtOpcoes);
const rtB = new THREE.WebGLRenderTarget(RW, RH, rtOpcoes);
const rtPainel = SAIDA ? null : new THREE.WebGLRenderTarget(RW, RH, rtOpcoes);

const espectroDados = new Uint8Array(NF);
const texEspectro = new THREE.DataTexture(espectroDados, NF, 1, THREE.RedFormat, THREE.UnsignedByteType);
texEspectro.minFilter = texEspectro.magFilter = THREE.LinearFilter;
texEspectro.needsUpdate = true;

const vazia = new THREE.DataTexture(new Uint8Array(4), 1, 1); vazia.needsUpdate = true;
const carregador = new THREE.TextureLoader();
const cache = new Map();
const textura = url => {
  if (!cache.has(url)) cache.set(url, new Promise((ok, erro) => carregador.load(url, ok, undefined, erro)));
  return cache.get(url);
};
const texLogo = await textura('assets/clube.png');
const texNomes = await Promise.all(['titulo', 'millos'].map(n => textura(`assets/letreiros/${n}.png`)));

const ondas = Array.from({ length: 8 }, () => new THREE.Vector4(-1e3, 0, 0, 0));

// ---------- conteúdo (um por quadro: o atual e o próximo, para a virada) ----------
function criarConteudo() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertConteudo, fragmentShader: fragConteudo, depthTest: false, depthWrite: false,
    uniforms: {
      uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() },
      uF1: { value: vazia }, uF2: { value: vazia }, uE1: { value: vazia }, uE2: { value: vazia },
      uLogo: { value: texLogo }, uNome: { value: texNomes[0] }, uEspectro: { value: texEspectro },
      uRectF: { value: new THREE.Vector4() }, uRectE: { value: new THREE.Vector4() },
      uRectD: { value: new THREE.Vector4() }, uRectL: { value: new THREE.Vector4() }, uRectN: { value: new THREE.Vector4() },
      uTempo: { value: 0 }, uFluxo: { value: 0 }, uGrave: { value: 0 }, uMedio: { value: 0 }, uAgudo: { value: 0 },
      uBumbo: { value: 0 }, uBatida: { value: 0 }, uCompasso: { value: 0 }, uBrilho: { value: BRILHO },
      uCena: { value: 0 }, uVelOnda: { value: 8000 }, uOndas: { value: ondas },
    },
  });
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
  plano.position.set(PW / 2, -PH / 2, 0);
  const cena = new THREE.Scene(); cena.add(plano);
  return { cena, mat };
}
const conteudoA = criarConteudo(), conteudoB = criarConteudo();

// Cada "quadro" = paleta + cena + figura principal (perto do DJ) + figura do eco/fundo do DJ.
const ordemFig = [0, 7, 3, 9, 1, 5, 2, 8, 4, 6]; // a h d j b f c i e g
let nQuadro = 0;
function novoQuadro(base = {}) {
  const i = nQuadro++;
  const q = {
    paleta: NOMES_PALETAS[i % NOMES_PALETAS.length],
    cena: CENAS.indexOf(Q.get('cena')) >= 0 ? Q.get('cena') : 'figuras',
    fig: LETRAS[ordemFig[i % 10]], eco: LETRAS[ordemFig[(i + 4) % 10]], ...base,
  };
  q.pronto = Promise.all([`${q.fig}-1`, `${q.fig}-2`, `${q.eco}-1`, `${q.eco}-2`].map(n => textura(`assets/figuras/${n}.png`)))
    .then(t => { q.tex = t; return q; });
  return q;
}
let baseLogo = null;
function aplicarQuadro({ mat }, q) {
  const u = mat.uniforms, [c0, c1, c2] = PALETAS[q.paleta];
  u.uC0.value.set(c0); u.uC1.value.set(c1); u.uC2.value.set(c2);
  [u.uF1.value, u.uF2.value, u.uE1.value, u.uE2.value] = q.tex;
  u.uCena.value = CENAS.indexOf(q.cena);
  const asp = t => t.image.width / t.image.height;
  // principal: ocupa a largura (cortando pouco nas laterais), pés a 160 px da dobra
  const aF = asp(q.tex[0]), hF = Math.min(2100, 1.1 * PW / aF), wF = hF * aF;
  u.uRectF.value.set((PW - wF) / 2, TETO - 160 - hF, wF, hF);
  // eco: blocos de outra figura na ponta longe do DJ
  const aE = asp(q.tex[3]), hE = Math.min(2400, 1.4 * PW / aE), wE = hE * aE;
  u.uRectE.value.set((PW - wE) / 2, 250, wE, hE);
  // fundo do DJ: figura pequena em cima do CLUBE
  const hD = Math.min(340, 860 / asp(q.tex[2])), wD = hD * asp(q.tex[2]);
  u.uRectD.value.set((PW - wD) / 2, TETO + 55, wD, hD);
  const wL = 780, hL = wL * texLogo.image.height / texLogo.image.width;
  u.uRectL.value.set((PW - wL) / 2, PH - 62 - hL, wL, hL);
  baseLogo = [wL, hL];
  u.uRectN.value.set(66, 1000, 900, 900);
}

let atual = await novoQuadro({ paleta: Q.get('paleta') in PALETAS ? Q.get('paleta') : 'vermelho' }).pronto;
aplicarQuadro(conteudoA, atual);
let proximo = novoQuadro();

// ---------- lâminas ----------
const NCOL = PW / CW, NLIN = Math.round(PH / CH);
const geoLam = new THREE.InstancedBufferGeometry();
const planoLam = new THREE.PlaneGeometry(1, 1);
geoLam.index = planoLam.index;
geoLam.setAttribute('position', planoLam.getAttribute('position'));
const celulas = new Float32Array(NCOL * NLIN * 4);
for (let l = 0, i = 0; l < NLIN; l++) for (let c = 0; c < NCOL; c++, i += 4) celulas.set([c * CW + CW / 2, l * CH + CH / 2, c, l], i);
geoLam.setAttribute('aCelula', new THREE.InstancedBufferAttribute(celulas, 4));
geoLam.instanceCount = NCOL * NLIN;
const matLam = new THREE.ShaderMaterial({
  vertexShader: vertLaminas, fragmentShader: fragLaminas, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  uniforms: {
    uA: { value: rtA.texture }, uB: { value: rtB.texture }, uEspectro: { value: texEspectro }, uOndas: { value: ondas },
    uTempo: { value: 0 }, uVirada: { value: -1 }, uVelOnda: { value: 8000 }, uEspAmt: { value: 0.5 },
    uGrave: { value: 0 }, uReflexo: { value: 0.4 },
  },
});
const laminas = new THREE.Mesh(geoLam, matLam);
laminas.frustumCulled = false;
const cenaLaminas = new THREE.Scene(); cenaLaminas.add(laminas);

// ---------- prévia: tira do painel + a pista em 3D ----------
let tira, camTira, sala, camSala, controles, luzTeto, luzFundo;
if (!SAIDA) {
  camTira = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  tira = new THREE.Scene();
  tira.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: rtPainel.texture })));
  montarSala();
}

function montarSala() {
  RectAreaLightUniformsLib.init();
  sala = new THREE.Scene();
  const L = PW * M, T = TETO * M, D = (PH - TETO) * M, ALT = 2.6, LARG = 4.4, FUNDO = 13;
  const painel = new THREE.MeshBasicMaterial({ map: rtPainel.texture });
  // teto: borda de cima do plano = ponta longe do DJ (v = 1); dobra em z = 0
  const geoTeto = new THREE.PlaneGeometry(L, T), uvT = geoTeto.getAttribute('uv');
  for (let i = 0; i < uvT.count; i++) uvT.setY(i, (PH - TETO) / PH + uvT.getY(i) * TETO / PH);
  const teto = new THREE.Mesh(geoTeto, painel);
  teto.rotation.x = Math.PI / 2; teto.position.set(0, ALT, T / 2);
  const geoFundo = new THREE.PlaneGeometry(L, D), uvF = geoFundo.getAttribute('uv');
  for (let i = 0; i < uvF.count; i++) uvF.setY(i, uvF.getY(i) * (PH - TETO) / PH);
  const fundo = new THREE.Mesh(geoFundo, painel);
  fundo.position.set(0, ALT - D / 2, 0.005);
  sala.add(teto, fundo);

  const concreto = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.92 });
  const piso = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.3, metalness: 0.15 });
  const plano = (w, h, mat, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(...pos); m.rotation.set(...rot); sala.add(m); };
  plano(LARG, FUNDO, piso, [0, 0, FUNDO / 2], [-Math.PI / 2, 0, 0]);
  plano(LARG, FUNDO, concreto, [0, ALT + 0.002, FUNDO / 2], [Math.PI / 2, 0, 0]);
  plano(FUNDO, ALT, concreto, [-LARG / 2, ALT / 2, FUNDO / 2], [0, Math.PI / 2, 0]);
  plano(FUNDO, ALT, concreto, [LARG / 2, ALT / 2, FUNDO / 2], [0, -Math.PI / 2, 0]);
  plano(LARG, ALT, concreto, [0, ALT / 2, 0], [0, 0, 0]);
  // cabine do DJ: pedra sobre base preta
  const pedra = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.85, 1.15), new THREE.MeshStandardMaterial({ color: 0x8a7c72, roughness: 1 }));
  pedra.position.set(0, 0.45 + 0.425, 1.1);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.45, 1.0), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }));
  base.position.set(0, 0.225, 1.1);
  sala.add(pedra, base);
  for (const x of [-1.55, 1.55]) {
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 }));
    caixa.position.set(x, 2.1, 0.25); sala.add(caixa);
  }
  // luz que o próprio painel joga na sala
  luzTeto = new THREE.RectAreaLight(0xffffff, 5, L, T);
  luzTeto.position.set(0, ALT - 0.01, T / 2); luzTeto.rotation.x = -Math.PI / 2;
  luzFundo = new THREE.RectAreaLight(0xffffff, 5, L, D);
  luzFundo.position.set(0, ALT - D / 2, 0.02); luzFundo.rotation.y = Math.PI;
  sala.add(luzTeto, luzFundo, new THREE.AmbientLight(0xffffff, 0.04));

  camSala = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  camSala.position.set(0, 1.55, 8.2);
  controles = new OrbitControls(camSala, renderer.domElement);
  controles.target.set(0, 2.05, 1.2);
  controles.enableDamping = true;
  controles.update();
}

// ---------- relógio, bumbos e viradas ----------
const R = { bpm: Number(Q.get('bpm')) || 124, fase: 0, interna: 0, batida: null, contagem: 0, fluxo: 0 };
const V = { ativa: false, t0: 0, dur: 1 };
const t0 = performance.now() / 1000;
let relogio = 0, iOnda = 0;

function onda(forca) {
  ondas[iOnda].set(relogio, Math.min(1, forca), 0, 0);
  iOnda = (iOnda + 1) % ondas.length;
}
A.aoBumbo = forca => onda(0.45 + forca * 0.6);

// mudar = campos do próximo quadro a trocar antes de virar (cena, paleta, figuras)
async function virar(mudar) {
  if (V.ativa) return;
  if (mudar) { const { paleta, cena, fig, eco } = proximo; proximo = novoQuadro({ paleta, cena, fig, eco, ...mudar }); nQuadro--; }
  const q = proximo;
  await q.pronto;
  if (V.ativa || q !== proximo) return;
  aplicarQuadro(conteudoB, q);
  Object.assign(V, { ativa: true, t0: relogio, dur: Math.min(2.4, Math.max(0.9, 2 * 60 / R.bpm)) });
  R.contagem = 0;
}
function fimDaVirada() {
  atual = proximo;
  aplicarQuadro(conteudoA, atual);
  proximo = novoQuadro({ cena: atual.cena });
  V.ativa = false;
}

function aoBater(b) {
  if (!audioVivo()) onda(0.75);                        // sem som: bumbo de mentira em cada batida
  if (++R.contagem >= COMPASSOS * 4 && b % 4 === 0) virar();
}

// envelopes de mentira quando não há som entrando (relógio interno)
function envelopesSinteticos(f) {
  const b = f - Math.floor(f), c = f * 2 - Math.floor(f * 2);
  const env = { grave: 0.3 + 0.45 * Math.exp(-b * 4), medio: 0.35 + 0.1 * Math.sin(f * 0.7), agudo: 0.2 + 0.3 * Math.exp(-c * 8), bumbo: Math.exp(-b * 7) };
  for (let i = 0; i < NF; i++) {
    const x = i / NF;
    espectroDados[i] = 255 * Math.min(1, (x < 0.3 ? env.grave : x < 0.7 ? env.medio : env.agudo) * (0.55 + 0.45 * Math.sin(i * 1.7 + f * 2.3) ** 2));
  }
  return env;
}

// ---------- quadro a quadro ----------
let ultimo = performance.now() / 1000, quadros = 0, fps = 0, relogioFps = ultimo;
const atualizarUniforms = (u, env) => {
  u.uTempo.value = relogio; u.uFluxo.value = R.fluxo;
  u.uGrave.value = env.grave; u.uMedio.value = env.medio; u.uAgudo.value = env.agudo; u.uBumbo.value = env.bumbo;
  u.uBatida.value = Math.floor(R.fase); u.uCompasso.value = (R.fase / 4) % 1;
  u.uVelOnda.value = TETO / (1.5 * 60 / R.bpm);
  // o logo cresce com o som e os nomes alternam a cada 16 batidas
  if (baseLogo) {
    const k = 1 + env.bumbo * 0.07 + env.grave * 0.03, [w, h] = baseLogo;
    u.uRectL.value.set((PW - w * k) / 2, PH - 62 - h / 2 - h * k / 2, w * k, h * k);
  }
  u.uNome.value = texNomes[Math.floor(R.fase / 16) % 2];
};

function quadro() {
  const agora = performance.now() / 1000, dt = Math.min(0.1, agora - ultimo);
  ultimo = agora; relogio = agora - t0;

  analisarAudio(dt);
  const vivo = audioVivo();
  if (audioNoComando()) { R.bpm = A.bpm; R.fase = A.fase + ATRASO * A.bpm / 60; R.interna = R.fase; }
  else { if (vivo && A.bpm) R.bpm = A.bpm; R.interna += dt * R.bpm / 60; R.fase = R.interna; }
  const b = Math.floor(R.fase);
  if (R.batida === null) R.batida = b;
  else if (b !== R.batida) { R.batida = b; aoBater(b); }

  let env;
  if (vivo) { env = A; espectroDados.set(A.espectro); }
  else env = envelopesSinteticos(R.fase);
  texEspectro.needsUpdate = true;
  R.fluxo += dt * (40 + 160 * env.grave);

  if (V.ativa) {
    const k = (relogio - V.t0) / V.dur;
    if (k >= 1) { fimDaVirada(); matLam.uniforms.uVirada.value = -1; }
    else matLam.uniforms.uVirada.value = k * (TETO + 520 + 380 + 14 * 12);
  }

  atualizarUniforms(conteudoA.mat.uniforms, env);
  atualizarUniforms(conteudoB.mat.uniforms, env);
  const ul = matLam.uniforms;
  ul.uTempo.value = relogio; ul.uGrave.value = env.grave; ul.uVelOnda.value = conteudoA.mat.uniforms.uVelOnda.value;
  ul.uReflexo.value = 0.25 + 0.6 * env.agudo;

  renderer.setRenderTarget(rtA); renderer.render(conteudoA.cena, camPainel);
  if (V.ativa) { renderer.setRenderTarget(rtB); renderer.render(conteudoB.cena, camPainel); }
  if (SAIDA) { renderer.setRenderTarget(null); renderer.render(cenaLaminas, camPainel); }
  else desenharPrevia(env);

  quadros++;
  if (agora - relogioFps >= 1) { fps = quadros / (agora - relogioFps); quadros = 0; relogioFps = agora; }
  requestAnimationFrame(quadro);
}

const MARGEM = 16;
function desenharPrevia(env) {
  renderer.setRenderTarget(rtPainel); renderer.render(cenaLaminas, camPainel);
  renderer.setRenderTarget(null);
  const W = innerWidth, H = innerHeight, hT = H - 2 * MARGEM, wT = Math.round(hT * PW / PH);
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
  renderer.setClearColor(0x0b0b0b); renderer.clear();
  renderer.setViewport(MARGEM, MARGEM, wT, hT); renderer.setScissor(MARGEM, MARGEM, wT, hT);
  renderer.render(tira, camTira);
  // luz da sala acompanha a cor média do painel
  const [c0, c1] = PALETAS[atual.paleta].map(c => new THREE.Color(c));
  const forca = BRILHO * (0.55 + 0.4 * env.grave + 0.5 * env.bumbo);
  luzTeto.color.copy(c0).lerp(c1, 0.6).multiplyScalar(0.55); luzTeto.intensity = 4 * forca;
  luzFundo.color.copy(c0).lerp(c1, 0.4); luzFundo.intensity = 3 * forca;
  const x0 = MARGEM * 2 + wT + 90;
  renderer.setViewport(x0, 0, W - x0, H); renderer.setScissor(x0, 0, W - x0, H);
  camSala.aspect = (W - x0) / H; camSala.updateProjectionMatrix();
  controles.update();
  renderer.setClearColor(0x000000); renderer.clear();
  renderer.render(sala, camSala);
  renderer.setScissorTest(false);
  posicionarRotulos(wT, hT);
}

// ---------- controles da prévia ----------
const $ = s => document.querySelector(s);
function posicionarRotulos(wT, hT) {
  for (const d of document.querySelectorAll('#rotulos div')) d.style.left = (MARGEM + wT + 10) + 'px';
  $('#r-dobra').style.top = (MARGEM + hT * TETO / PH - 7) + 'px';
  $('#r-teto').style.top = (MARGEM + hT * TETO / PH / 2) + 'px';
  $('#r-dj').style.top = (MARGEM + hT * (TETO + PH) / 2 / PH - 7) + 'px';
  $('#r-entrada').style.top = MARGEM + 'px';
}
function trocar(lista, valor, passo = 1) { return lista[(lista.indexOf(valor) + passo + lista.length) % lista.length]; }
const acoes = {
  mic: () => ligarAudio(Q.get('audio') && Q.get('audio') !== 'teste' ? Q.get('audio') : ''),
  teste: () => ligarAudio('teste'),
  virar: () => virar(),
  cena: () => virar({ cena: trocar(CENAS, atual.cena), paleta: atual.paleta, fig: atual.fig, eco: atual.eco }),
  paleta: () => virar({ paleta: trocar(NOMES_PALETAS, atual.paleta), cena: atual.cena, fig: atual.fig, eco: atual.eco }),
};
if (!SAIDA) {
  // o navegador só deixa o áudio rodar depois de um clique ou tecla
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); });
  document.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) acoes[a.dataset.a](); });
  document.addEventListener('keydown', e => {
    const k = { ' ': 'virar', c: 'cena', p: 'paleta', a: 'mic', t: 'teste' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); acoes[k](); }
  });
  addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
  setInterval(() => {
    const vivo = audioVivo();
    $('#info').innerHTML = [
      ['Áudio', A.an ? `${A.entrada}${vivo ? '' : ' · sem bumbo'}` : A.estado],
      ['Batida', `${R.bpm.toFixed(1)} BPM · ${audioNoComando() ? 'seguindo o som' : 'relógio interno'}${A.bpm ? ` · confiança ${(A.confianca * 100).toFixed(0)}%` : ''}`],
      ['Quadro', `${atual.cena} · ${atual.paleta} · figura ${atual.fig.toUpperCase()} / ${atual.eco.toUpperCase()}`],
      ['Próxima virada', V.ativa ? 'virando…' : `em ${Math.max(0, COMPASSOS * 4 - R.contagem)} batidas`],
      ['Render', `${RW}×${RH} · ${fps.toFixed(0)} fps`],
    ].map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('');
  }, 250);
}
// na saída o som liga sozinho (?audio=teste ou ?audio=<parte do nome da entrada>)
if (SAIDA && Q.has('audio')) ligarAudio(Q.get('audio'));
else if (!SAIDA && Q.get('audio') === 'teste') ligarAudio('teste');

window.__painel = { A, R, V, get atual() { return atual; } };
requestAnimationFrame(quadro);
