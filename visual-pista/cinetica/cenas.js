// As cenas da Cinética. Em metros, com o olho na origem: x para a direita, y para cima, z para a parede do DJ. O teto do LED fica em y = HT e a parede em z = ZF.
//
// Cada cena é uma escultura feita de muitas peças iguais: o personagem aparece no conjunto e o som anda de peça em peça, nunca na escultura inteira.
// Peça comprida no sentido do painel, porque o sinal tem resolução de sobra nesse eixo e pouca no outro (ver led-resolucao-sinal na memória).
export const MODOS = ['camadas', 'relevo', 'cabos', 'agulhas', 'brise'];
const sorte = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const suave = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const QX90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const QI = [0, 0, 0, 1];
// O elenco vem de assar_placas.py: sem O Curador (h), que segura um disco de vinil.
const ELENCO = ['a', 'g', 'e', 'd', 'c', 'f', 'b', 'i', 'j'];

export function criarCena(modo, api) {
  return { camadas, relevo, cabos, agulhas, brise }[modo](api);
}

class Mola1 {
  constructor() { this.x = 0; this.v = 0; }
  passo(alvo, dt, w = 9, z = 0.85) {
    const h = Math.min(dt, 1 / 30) / 2;
    for (let i = 0; i < 2; i++) { this.v += (w * w * (alvo - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}
const figuraDe = (api, nome) => api.META.figuras.find(f => f.nome === nome);
// bumbo atrasado, respeitando a chave de reflexo do app
const ondaDe = M => s => (M.modo('reflexo') === 'desligado' ? 0 : M.atraso(s));

// ---------- relevo do corpo, visto de frente ----------
function criarRelevo(api, raio = 0) {
  let bruto = new Uint8Array(api.ALT);
  const K = 192, MEIA = api.META.meiaX;
  // cabo não dobra em quina: o relevo é borrado antes, para ele curvar macio
  if (raio) {
    const saida = new Uint8Array(bruto.length);
    for (const f of api.META.figuras) {
      const { inicio, nx, ny } = f.alturas;
      let a = Float32Array.from(bruto.subarray(inicio, inicio + nx * ny));
      for (let p = 0; p < 2; p++) {
        const b = new Float32Array(nx * ny);
        for (let i = 0; i < nx; i++) {
          let s = 0;
          for (let j = -raio; j < ny + raio; j++) {
            s += j + raio < ny ? a[i * ny + j + raio] : 0;
            s -= j - raio - 1 >= 0 ? a[i * ny + j - raio - 1] : 0;
            if (j >= 0 && j < ny) b[i * ny + j] = s / (2 * raio + 1);
          }
        }
        const c = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) {
          let s = 0;
          for (let i = -raio; i < nx + raio; i++) {
            s += i + raio < nx ? b[(i + raio) * ny + j] : 0;
            s -= i - raio - 1 >= 0 ? b[(i - raio - 1) * ny + j] : 0;
            if (i >= 0 && i < nx) c[i * ny + j] = s / (2 * raio + 1);
          }
        }
        a = c;
      }
      for (let i = 0; i < a.length; i++) saida[inicio + i] = a[i];
    }
    bruto = saida;
  }
  return (f, x, y) => {
    // x é o x do corpo, y é a altura do corpo de 0 a 1
    const e = f.alturas;
    const a = (x + MEIA) * K, b = y * K + 2;
    if (a < 0 || b < 0 || a >= e.nx - 1 || b >= e.ny - 1) return 0;
    const i = a | 0, j = b | 0, fa = a - i, fb = b - j;
    const o = e.inicio + i * e.ny + j;
    const v0 = bruto[o] + (bruto[o + 1] - bruto[o]) * fb;
    const v1 = bruto[o + e.ny] + (bruto[o + e.ny + 1] - bruto[o + e.ny]) * fb;
    return (v0 + (v1 - v0) * fa) / 255;
  };
}

// Um cortejo de personagens que anda devagar rumo à parede. A escultura fica no lugar; quem passa por ela é o personagem.
function criarCortejo(api, relevo, { altura, espaco, vel, de, ate }) {
  const lista = [];
  let n = sorte(ELENCO.length) | 0;
  const nova = z0 => {
    const f = figuraDe(api, ELENCO[n++ % ELENCO.length]);
    lista.push({ f, H: altura(f), z0 });
  };
  for (let z = de; z < ate; z += espaco) nova(z);
  return {
    lista,
    passo(dt) {
      for (const a of lista) a.z0 += vel * dt;
      if (lista[0].z0 > ate) { lista.shift(); nova(lista[lista.length - 1].z0 - espaco); }
    },
    // o corpo que estiver em (x, z), de 0 a 1
    em(x, z) {
      let v = 0;
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i];
        const yb = (z - a.z0) / a.H;
        if (yb <= 0 || yb >= 1) continue;
        const r = relevo(a.f, x / a.H, yb);
        if (r > v) v = r;
      }
      return v;
    },
  };
}

// O corte recursivo da grade da marca (generateBlocks do Grid Motion Studio), em células.
function sortearBlocos(NX, NZ, cortes = 22) {
  const rects = [{ x: 0, z: 0, w: NX, h: NZ }];
  for (let i = 0; i < cortes; i++) {
    const cand = rects.map((r, idx) => ({ r, idx, area: r.w * r.h })).filter(o => o.r.w > 1 || o.r.h > 1).sort((a, b) => b.area - a.area);
    if (!cand.length) break;
    const { r, idx } = cand[Math.floor(Math.random() * Math.min(cand.length, 4))];
    let vert = Math.random() < (r.w / (r.h * 0.2) >= 1 ? 0.58 : 0.42);
    if (r.w === 1) vert = false;
    if (r.h === 1) vert = true;
    if (vert) { const c = 1 + Math.floor(Math.random() * (r.w - 1)); rects.splice(idx, 1, { ...r, w: c }, { ...r, x: r.x + c, w: r.w - c }); }
    else { const c = 1 + Math.floor(Math.random() * (r.h - 1)); rects.splice(idx, 1, { ...r, h: c }, { ...r, z: r.z + c, h: r.h - c }); }
  }
  return rects;
}
function mapaDeBlocos(NX, NZ, valor) {
  const mapa = new Float32Array(NX * NZ);
  for (const r of sortearBlocos(NX, NZ)) {
    const v = valor();
    for (let i = r.x; i < r.x + r.w; i++) for (let j = r.z; j < r.z + r.h; j++) mapa[i * NZ + j] = v;
  }
  return mapa;
}

// ---------- CAMADAS: o corpo cortado em chapas de través, como fatias. As chapas viram como páginas, e o bumbo corre pelo corpo em forma de clarão. ----------
function camadas(api) {
  const { malha, qEixo, qMul, M, R, XC } = api;
  const onda = ondaDe(M);
  const ALT = 2.75, MEIA_ESP = 0.05;
  const alturaDe = f => Math.min(10.5, 6.6 / f.largura);
  const novaFig = n => {
    const f = figuraDe(api, ELENCO[n % ELENCO.length]);
    return { f, H: alturaDe(f), molas: f.y.map(() => new Mola1()) };
  };
  let vez = 0;
  const lugares = [{ z: 6.6, atual: novaFig(vez++), novo: null, a: 0 }, { z: -9.4, atual: novaFig(vez++), novo: null, a: 0 }];
  let t = sorte(50), rola = sorte(6.28), ultimaBat = 0, batidas = 0, troca = 0, volta = -1;
  const desenhar = (fig, lugar, dt, some) => {
    const { f, H } = fig;
    const n = f.y.length;
    const passo = H / n;
    const qRolo = qEixo(0, 0, 1, Math.sin(rola + lugar.z) * 0.16);
    for (let k = 0; k < n; k++) {
      const e = f.y[k];
      if (!e) continue;
      const h = k / n;
      // repouso: as chapas ficam abertas como uma persiana, com o ângulo variando devagar ao longo do corpo
      let ang = 0.42 + 0.2 * Math.sin(k * 0.21 + t * 0.19);
      // o bumbo sai da cabeça, que está do lado da parede, e desce pelo corpo
      ang += onda((1 - h) * 0.75) * 0.55;
      // cada chapa escuta uma faixa do som, com peso
      const banda = Math.floor(h * 39);
      ang += fig.molas[k].passo(Math.max(0, (R.faixas[banda] || 0) - 0.34) * 0.55, dt, 8, 0.8);
      // de tempos em tempos uma volta inteira corre pelo corpo
      if (volta >= 0) ang += suave((volta - (1 - h) * 0.55) / 0.45) * Math.PI;
      const s = some ? Math.pow(some(h), 3) : 0;
      if (s >= 1) continue;
      const q = qMul(qRolo, qMul(qEixo(1, 0, 0, lugar.z > 0 ? ang : -ang), QX90));
      malha(e, XC, ALT + s * 16, lugar.z + (h - 0.5) * H, H, q, { sy: MEIA_ESP, onda: 0, det: 1, rug: 0.05, fio: 0.2, tom: Math.exp(-s * 3) });
    }
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ figuras: lugares.map(l => l.atual.f.nome).join(','), volta: +volta.toFixed(2) }),
    quadro(dt) {
      t += dt;
      rola += dt * 0.1;
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        batidas++;
        if (batidas % 48 === 0 && volta < 0) volta = 0;
        if (batidas % 112 === 0) { const l = lugares[troca++ % 2]; if (!l.novo) { l.novo = novaFig(vez++); l.a = 0; } }
      }
      // sem batida a escultura segue viva, só mais devagar
      if (volta >= 0) { volta += dt / 11; if (volta > 1.05) volta = -1; }
      for (const l of lugares) {
        if (!l.novo) { desenhar(l.atual, l, dt, null); continue; }
        l.a = Math.min(1, l.a + dt / 14);
        const a = l.a;
        desenhar(l.atual, l, dt, h => suave(a * 2.2 - h * 0.7));
        desenhar(l.novo, l, dt, h => 1 - suave((a - 0.32) * 2.2 - (1 - h) * 0.3));
        if (a >= 1) { l.atual = l.novo; l.novo = null; }
      }
    },
  };
}

// ---------- RELEVO: o corpo deitado acima da pista, cortado em curvas de nível de chapa. Cada nível escuta uma faixa e desce com ela. ----------
function relevo(api) {
  const { malha, qEixo, M, R, XC } = api;
  const onda = ondaDe(M);
  const Y0 = 1.28, MEIA_ESP = 0.035, AFASTA = 0.72;
  const alturaDe = f => Math.min(11, 6.4 / f.largura);
  const novaFig = n => {
    const f = figuraDe(api, ELENCO[n % ELENCO.length]);
    return { f, H: alturaDe(f), molas: f.z.map(() => new Mola1()), bandas: f.z.map(() => Math.floor(sorte(4, 36))) };
  };
  let vez = 0;
  const lugares = [{ z: 6.4, atual: novaFig(vez++), novo: null, a: 0 }, { z: -6.4, atual: novaFig(vez++), novo: null, a: 0 }];
  let t = sorte(40), ultimaBat = 0, batidas = 0, troca = 0;
  const desenhar = (fig, l, dt, some) => {
    const { f, H } = fig;
    const n = f.z.length;
    const q = qEixo(0, 1, 0, Math.sin(t * 0.05 + l.z) * 0.09);
    for (let k = 0; k < n; k++) {
      const e = f.z[k];
      const niv = n > 1 ? k / (n - 1) : 0;
      const m = fig.molas[k].passo(Math.max(0, (R.faixas[fig.bandas[k]] || 0) - 0.32) * 0.72, dt, 7, 0.85);
      const bate = onda(niv * 0.45) * 0.42;
      // o nível mais perto do olho é a frente do corpo. A mola abre a pilha: mais som, mais vão entre as chapas.
      let y = Y0 + e.prof * H * (AFASTA + m * 0.7) + 0.32 * niv - bate * (1 - niv * 0.6);
      const s = some ? Math.pow(some(niv), 3) : 0;
      if (s >= 1) continue;
      y += s * 14;
      malha(e, XC, y, l.z, H, q, { sy: MEIA_ESP, onda: 0, det: 1, rug: 0.03, fio: 0.3, tom: (1 - niv * 0.4) * Math.exp(-s * 3) });
    }
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ figuras: lugares.map(l => l.atual.f.nome).join(',') }),
    quadro(dt) {
      t += dt;
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        if (++batidas % 96 === 0) { const l = lugares[troca++ % 2]; if (!l.novo) { l.novo = novaFig(vez++); l.a = 0; } }
      }
      for (const l of lugares) {
        if (!l.novo) { desenhar(l.atual, l, dt, null); continue; }
        l.a = Math.min(1, l.a + dt / 12);
        const a = l.a;
        desenhar(l.atual, l, dt, n => suave(a * 2.2 - (1 - n) * 0.8));
        desenhar(l.novo, l, dt, n => 1 - suave((a - 0.32) * 2.2 - n * 0.5));
        if (a >= 1) { l.atual = l.novo; l.novo = null; }
      }
    },
  };
}

// ---------- CABOS: uma harpa de cabos de aço correndo para a parede. O personagem passa por trás e empurra os cabos, e cada cabo vibra na sua faixa do som. ----------
function cabos(api) {
  const { M, R, ZF, HT, XC, FIOS, dadosFios } = api;
  const onda = ondaDe(M);
  const relevoDe = criarRelevo(api, 3);
  const { nc, np } = FIOS;
  const Y0 = 1.75, EMPURRA = 0.62, MEIA_L = 2.45;
  // pontos: densos no teto e cada vez mais espaçados atrás da parede
  const zs = new Float32Array(np), atr = new Float32Array(np), env = new Float32Array(np);
  const NT = np - 40, ZINI = -14, ZTETO = 11;
  for (let j = 0; j < NT; j++) zs[j] = ZINI + (ZTETO - ZINI) * j / (NT - 1);
  for (let j = NT; j < np; j++) zs[j] = ZTETO * Math.pow(9, (j - NT + 1) / 40);
  for (let j = 0; j < np; j++) env[j] = Math.sin(Math.PI * Math.min(1, Math.max(0, (zs[j] - ZINI) / (ZTETO - ZINI))));
  const xs = new Float32Array(nc), bandas = new Int32Array(nc), fase = new Float32Array(nc), ampl = new Float32Array(nc), tomC = new Float32Array(nc), modoV = new Float32Array(nc);
  for (let c = 0; c < nc; c++) {
    const u = c / (nc - 1);
    xs[c] = XC + (u - 0.5) * 2 * MEIA_L;
    // a harpa é simétrica: grave no meio, agudo nas pontas
    bandas[c] = Math.min(39, Math.floor(Math.abs(u - 0.5) * 2 * 40));
    fase[c] = sorte(6.28);
    tomC[c] = c % 6 === 0 ? 1.25 : 0.82;
    modoV[c] = 1 + Math.floor(sorte(3));
  }
  const cortejo = criarCortejo(api, relevoDe, { altura: f => Math.min(8, 3.9 / f.largura), espaco: 10.5, vel: 0.3, de: -22, ate: 16 });
  let t = sorte(50);
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ cabos: nc, figuras: cortejo.lista.map(a => a.f.nome + ' ' + a.z0.toFixed(1)).join(', ') }),
    quadro(dt) {
      t += dt;
      cortejo.passo(dt);
      for (let j = 0; j < np; j++) atr[j] = onda(Math.abs(ZF * 2.2 - zs[j]) / 11);
      for (let c = 0; c < nc; c++) {
        const f = Math.max(0, (R.faixas[bandas[c]] || 0) - 0.3);
        ampl[c] += (f * f * 0.09 - ampl[c]) * Math.min(1, dt * (f * f * 0.09 > ampl[c] ? 26 : 5));
        const vib = Math.sin(t * (24 + bandas[c] * 0.9) + fase[c]) * ampl[c];
        const x0 = xs[c], m = modoV[c];
        let o = c * np * 4;
        for (let j = 0; j < np; j++) {
          const z = zs[j];
          const e = env[j];
          const corpo = e > 0 ? cortejo.em(x0 - XC, z) : 0;
          const y = Math.max(HT + 0.03, Y0 - EMPURRA * corpo - atr[j] * 0.34 * e);
          dadosFios[o] = x0 + vib * Math.sin(Math.PI * m * e) * e;
          dadosFios[o + 1] = y;
          dadosFios[o + 2] = z;
          dadosFios[o + 3] = tomC[c] * (0.62 + 1.2 * corpo);
          o += 4;
        }
      }
    },
  };
}

// ---------- AGULHAS: o teto é um campo de hastes de aço, como uma tela de alfinetes. O personagem atravessa o campo e as hastes descem com ele. ----------
function agulhas(api) {
  const { caixa, M, R, HT, ZF, XC } = api;
  const onda = ondaDe(M);
  const relevoDe = criarRelevo(api);
  const PASSO = 0.075, MEIA = 0.0315, X_M = 1.9, Z0 = -9.5, Z1 = 8.8, COMPR = 7;
  const NX = Math.round(2 * X_M / PASSO), NZ = Math.round((Z1 - Z0) / PASSO);
  const tips = new Float32Array(NX * NZ);
  const cor = new Float32Array(NX * NZ), desv = new Float32Array(NX * NZ);
  for (let i = 0; i < cor.length; i++) { cor[i] = sorte(0.88, 1.08); desv[i] = sorte(6.28); }
  let blocos = mapaDeBlocos(NX, NZ, () => sorte(0, 1)), blocosNovos = null, mistura = 0;
  const cortejo = criarCortejo(api, relevoDe, { altura: f => Math.min(4.4, 2.5 / f.largura), espaco: 4.9, vel: 0.13, de: -12, ate: 10 });
  let ultimaBat = 0, faltam = 64, primeiro = true;
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ agulhas: NX * NZ, figuras: cortejo.lista.map(a => a.f.nome).join(',') }),
    quadro(dt) {
      cortejo.passo(dt);
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        if (--faltam <= 0 && !blocosNovos) { faltam = 72; blocosNovos = mapaDeBlocos(NX, NZ, () => sorte(0, 1)); mistura = 0; }
      }
      if (blocosNovos) {
        mistura += dt / 6;
        if (mistura >= 1) { blocos = blocosNovos; blocosNovos = null; }
      }
      const k = primeiro ? 1 : 1 - Math.exp(-dt * 3.4);
      primeiro = false;
      for (let i = 0; i < NX; i++) {
        const x = XC - X_M + (i + 0.5) * PASSO;
        const banda = Math.min(39, Math.floor((Math.abs(x - XC) / X_M) * 40));
        const fx = Math.max(0, (R.faixas[banda] || 0) - 0.34) * 0.3;
        for (let j = 0; j < NZ; j++) {
          const o = i * NZ + j;
          const z = Z0 + (j + 0.5) * PASSO;
          const b = blocosNovos ? blocos[o] + (blocosNovos[o] - blocos[o]) * mistura : blocos[o];
          const corpo = cortejo.em(x - XC, z);
          // fora do corpo, as hastes ficam nos degraus da grade da marca, recuadas. No corpo, descem até quase a altura do LED.
          const alvo = corpo > 0.02 ? 0.02 + (1 - corpo) * 0.75 : b < 0.2 ? 9 : 0.72 + b * 0.95;
          tips[o] += (alvo - tips[o]) * k;
          const bate = onda(Math.abs(ZF - z) / 8) * 0.16;
          const y = HT + 0.02 + Math.max(0, tips[o] - bate - fx * (corpo > 0.02 ? 0 : 1));
          if (tips[o] > 6) continue;
          const noCorpo = corpo > 0.02;
          caixa(x, y + COMPR, z, MEIA, COMPR, MEIA, noCorpo ? cor[o] * (0.9 + 0.5 * corpo) : cor[o], noCorpo ? 10 : 1, QI, desv[o], cor[o] * 3);
        }
      }
    },
  };
}

// ---------- BRISE: o teto fechado por lâminas de inox, como uma fachada. Elas abrem no desenho do personagem, e pelo vão aparece o céu. ----------
function brise(api) {
  const { caixa, M, R, HT, ZF, XC } = api;
  const onda = ondaDe(M);
  const relevoDe = criarRelevo(api);
  const NX = 48, PX = 2.0 / NX, ZI = -5.1, ZE = ZF + 0.06, DZ = 0.075, NZ = Math.round((ZE - ZI) / DZ);
  const Y = HT + 0.09, ABRE = 1.54;
  const ang = new Float32Array(NX * NZ), q = [0, 0, 0, 1];
  const ox = new Float32Array(NX), oz = new Float32Array(NX);
  for (let i = 0; i < NX; i++) { ox[i] = sorte(3); oz[i] = sorte(3); }
  let blocos = mapaDeBlocos(NX, NZ, () => sorte(-1, 1)), novos = null, mistura = 0;
  const cortejo = criarCortejo(api, relevoDe, { altura: f => Math.min(5, 2.3 / f.largura), espaco: 4.3, vel: 0.14, de: -9.5, ate: 6 });
  let ultimaBat = 0, faltam = 56, primeiro = true;
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ laminas: NX * NZ, figuras: cortejo.lista.map(a => a.f.nome).join(',') }),
    quadro(dt) {
      cortejo.passo(dt);
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        if (--faltam <= 0 && !novos) { faltam = 64; novos = mapaDeBlocos(NX, NZ, () => sorte(-1, 1)); mistura = 0; }
      }
      if (novos) { mistura += dt / 5; if (mistura >= 1) { blocos = novos; novos = null; } }
      const k = primeiro ? 1 : 1 - Math.exp(-dt * 4);
      primeiro = false;
      for (let i = 0; i < NX; i++) {
        const x = XC - 1 + (i + 0.5) * PX;
        const banda = Math.min(39, Math.floor((i / NX) * 40));
        const fx = Math.max(0, (R.faixas[banda] || 0) - 0.34);
        for (let j = 0; j < NZ; j++) {
          const o = i * NZ + j;
          const z = ZI + (j + 0.5) * DZ;
          const corpo = cortejo.em(x - XC, z);
          const b = novos ? blocos[o] + (novos[o] - blocos[o]) * mistura : blocos[o];
          // lâmina fechada: cada bloco da grade tem um ângulo. O reflexo é o que desenha a grade.
          const fechado = b * 0.05;
          const alvo = corpo > 0.03 ? ABRE * (0.8 + 0.2 * corpo) : fechado;
          ang[o] += (alvo - ang[o]) * k;
          const bate = onda(Math.abs(ZF - z) / 7) * 0.13 + fx * 0.09;
          const a = (ang[o] + bate) * 0.5;
          q[2] = Math.sin(a); q[3] = Math.cos(a);
          // lâmina aberta fica escura: o personagem é o vão, e o céu aparece nele
          caixa(x, Y, z, PX * 0.492, 0.0045, DZ * 0.5, 1 - 0.8 * Math.min(1, Math.abs(ang[o]) / 1.1), 9, q);
        }
      }
    },
  };
}
