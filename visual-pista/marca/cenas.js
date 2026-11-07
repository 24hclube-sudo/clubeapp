// As cenas da Marca. Cada uma diz onde ficam as peças neste quadro, em metros, com o olho na origem:
// x para a direita, y para cima, z para a parede do DJ. O teto do LED fica em y = HT e a parede em z = ZF.
//
// Metal pesa: o que é grande se move devagar, no próprio tempo, e o som chega por mola. O que dança é o reflexo (marca.js).
// Materiais: 1 inox escovado, 7 inox espelhado, 8 inox canelado (os blocos da marca).
export const MODOS = ['grade', 'colossos', 'travessia', 'instancia', 'monolito', 'colossos-todos', 'travessia-todos', 'instancia-todos', 'roda', 'queda', 'gigante', 'desfile'];
const sorte = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const suave = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const QX90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
// Letra no teto: o alto da letra aponta para a entrada, que fica no alto do painel. Quem olha para a parede lê a letra em pé e sem espelho.
const QX90_LETRA = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
// Sem O Curador (h): ele segura um disco de vinil, elemento que o usuário pediu para não voltar.
const ELENCO = ['a', 'g', 'e', 'd', 'c', 'f', 'b', 'i', 'j'];

export function criarCena(modo, api) {
  return {
    grade, colossos, travessia, instancia, monolito,
    'colossos-todos': colossosTodos,
    roda, queda, gigante, desfile,
    'travessia-todos': a => travessia(a, { vel: 0.9, cada: 11, comeca: 2 }),
    'instancia-todos': a => instancia(a, { laje: 3, sobe: 10, figura: 14, desce: 8 }),
  }[modo](api);
}

function parede(api, tom = 0.36) {
  api.caixa(api.XC, api.HT - 0.9, api.ZF + 0.2, 2.6, 0.9, 0.2, tom, 1, undefined, 2.1, 1.1);
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

// ---------- GRADE: o sorteio de blocos do Grid Motion Studio em chapas de inox. As linhas respiram, o som aperta os blocos para baixo e, de tempos em tempos, a composição se refaz. ----------
function grade(api) {
  const { caixa, M, R, HT, ZF, XC } = api;
  const NX = 8, NZ = 40, X0 = XC - 1.06, LX = 2.12, Z0 = -5.02, LZ = ZF + 5.04, FOLGA = 0.007;
  const fx = Array.from({ length: NX }, () => [sorte(6.28), sorte(0.05, 0.13)]);
  const fz = Array.from({ length: NZ }, () => [sorte(6.28), sorte(0.04, 0.11)]);
  const xs = new Float32Array(NX + 1), zs = new Float32Array(NZ + 1);
  const linhas = (t, arr, f, base, tam) => {
    let s = 0;
    for (let i = 0; i < f.length; i++) { s += 1 + 0.5 * Math.sin(t * f[i][1] + f[i][0]); arr[i + 1] = s; }
    for (let i = 0; i <= f.length; i++) arr[i] = base + (arr[i] / s) * tam;
    arr[0] = base;
  };
  // Mesmo corte recursivo de generateBlocks: pega um dos 4 maiores e corta num ponto qualquer da grade.
  const sortear = () => {
    let rects = [{ x: 0, z: 0, w: NX, h: NZ }];
    for (let i = 0; i < 25; i++) {
      const cand = rects.map((r, idx) => ({ r, idx, area: r.w * r.h })).filter(o => o.r.w > 1 || o.r.h > 1).sort((a, b) => b.area - a.area);
      if (!cand.length) break;
      const { r, idx } = cand[Math.floor(Math.random() * Math.min(cand.length, 4))];
      let vert = Math.random() < (r.w / (r.h * 0.2) >= 1 ? 0.58 : 0.42);
      if (r.w === 1) vert = false;
      if (r.h === 1) vert = true;
      if (vert) { const c = 1 + Math.floor(Math.random() * (r.w - 1)); rects.splice(idx, 1, { ...r, w: c }, { ...r, x: r.x + c, w: r.w - c }); }
      else { const c = 1 + Math.floor(Math.random() * (r.h - 1)); rects.splice(idx, 1, { ...r, h: c }, { ...r, z: r.z + c, h: r.h - c }); }
    }
    return rects.map(r => {
      const h = Math.random();
      const zm = (r.z + r.h / 2) / NZ;
      return { ...r, vazio: h < 0.22, mat: h < 0.62 ? 7 : h < 0.88 ? 8 : 1, rec: sorte(0.03, 0.28), esp: sorte(0.03, 0.09), ox: sorte(3), oy: sorte(3), tom: sorte(0.82, 1), mola: new Mola1(), banda: Math.floor((1 - zm) * 40), reage: Math.random() < 0.55, atraso: sorte(0, 1), passo: [0.032, 0.05, 0.075][Math.floor(Math.random() * 3)] };
    }).filter(r => !r.vazio);
  };
  let atual = sortear(), antiga = null, fase = 1, fv = 1, t = sorte(0, 100), ultimaBat = 0, faltam = 40;
  const desenhar = (b, a, sai) => {
    const x0 = xs[b.x], x1 = xs[b.x + b.w], z0 = zs[b.z], z1 = zs[b.z + b.h];
    const k = suave((a * 1.6 - b.atraso * 0.6));
    const s = Math.pow(1 - k, 3);
    if (k <= 0) return;
    const onda = M.atraso(Math.abs(ZF - (z0 + z1) / 2) / 6.5) * 0.05;
    const alvo = b.reage ? Math.max(0, (R.faixas[b.banda] || 0) - 0.3) * 0.2 : 0;
    const d = b.mola.passo(alvo, 1 / 60, 7, 0.8);
    const y = HT + b.rec + b.esp - d - onda + s * 11;
    caixa((x0 + x1) / 2, y, (z0 + z1) / 2, (x1 - x0) / 2 - FOLGA, b.esp, (z1 - z0) / 2 - FOLGA, b.tom * Math.exp(-s * 2.2), b.mat, undefined, b.ox, b.oy, 0, b.passo);
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ blocos: atual.length, faltam }),
    quadro(dt) {
      t += dt;
      linhas(t, xs, fx, X0, LX);
      linhas(t, zs, fz, Z0, LZ);
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        if (--faltam <= 0 && fase >= 1) { faltam = 64; antiga = atual; atual = sortear(); fase = 0; fv = 0; }
      }
      // sobe uma composição e desce a outra, peça por peça: 9 s para cada lado
      fase = Math.min(1, fase + dt / 9);
      fv = Math.min(1, fv + dt / 16);
      if (antiga) {
        for (const b of antiga) desenhar(b, 1 - fase, true);
        if (fase >= 1) antiga = null;
      }
      const chega = antiga ? suave((fv - 0.3) / 0.7) : 1;
      for (const b of atual) desenhar(b, chega, false);
    },
  };
}

// ---------- COLOSSOS: duas figuras de 30 m de inox, uma à frente e outra atrás de quem olha. O corpo nasce atrás da parede do DJ e a cabeça chega quase em cima da pista. ----------
function colossos(api) {
  const { malha, qEixo, qMul, M, HT, ZF, XC } = api;
  const H = 34, DIST = 15, CHAO = -1.6;
  let i = 0, t = 0, batidas = 0, ultimaBat = 0, giro = sorte(6), troca = 1;
  const par = n => [figuraDe(api, ELENCO[n % ELENCO.length]), figuraDe(api, ELENCO[(n + 4) % ELENCO.length])];
  let vivos = par(0), proximos = null;
  const desenhar = (f, z, yaw, afunda) => {
    const q = qEixo(0, 1, 0, yaw);
    malha(f, XC, CHAO - afunda * (H + 4), z, H, q, { fio: 0.1, onda: 1, tom: 1 });
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ figura: vivos[0].nome, troca: +troca.toFixed(2) }),
    quadro(dt) {
      t += dt;
      giro += dt * 0.045;
      if (M.batida !== ultimaBat) { ultimaBat = M.batida; batidas++; if (batidas >= 120 && !proximos) { batidas = 0; i++; proximos = par(i); troca = 0; } }
      if (proximos) {
        troca = Math.min(1, troca + dt / 22);
        const s = suave(troca * 2), e = suave(troca * 2 - 1);
        desenhar(vivos[0], DIST, giro, s); desenhar(vivos[1], -DIST, giro + 2.4, s);
        desenhar(proximos[0], DIST, giro, 1 - e); desenhar(proximos[1], -DIST, giro + 2.4, 1 - e);
        if (troca >= 1) { vivos = proximos; proximos = null; }
      } else {
        desenhar(vivos[0], DIST, giro, 0); desenhar(vivos[1], -DIST, giro + 2.4, 0);
      }
    },
  };
}

// ---------- COLOSSOS, TODOS: os mesmos dois lugares, mas a cada 20 s um personagem novo sobe em um deles, até passar o elenco inteiro. ----------
function colossosTodos(api) {
  const { malha, qEixo, XC } = api;
  const H = 34, DIST = 15, CHAO = -1.6, CADA = 20, DUR = 9;
  const figura = n => figuraDe(api, ELENCO[n % ELENCO.length]);
  const lugares = [{ z: DIST, giro: 0, f: figura(0), novo: null, a: 0 }, { z: -DIST, giro: 2.4, f: figura(1), novo: null, a: 0 }];
  let prox = 2, vez = 0, t = CADA - 6, giro = sorte(6);
  const desenhar = (f, l, afunda) => malha(f, XC, CHAO - afunda * (H + 4), l.z, H, qEixo(0, 1, 0, giro + l.giro), { fio: 0.1, onda: 1, tom: 1 });
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ frente: lugares[0].f.nome, atras: lugares[1].f.nome, proximo: ELENCO[prox % ELENCO.length] }),
    quadro(dt) {
      t += dt;
      giro += dt * 0.045;
      if (t >= CADA) { t = 0; const l = lugares[vez]; l.novo = figura(prox++); l.a = 0; vez = 1 - vez; }
      for (const l of lugares) {
        if (!l.novo) { desenhar(l.f, l, 0); continue; }
        l.a = Math.min(1, l.a + dt / DUR);
        // o novo começa a subir antes de o antigo sumir, para o céu não ficar vazio na troca
        desenhar(l.f, l, suave(l.a / 0.6));
        desenhar(l.novo, l, 1 - suave((l.a - 0.25) / 0.75));
        if (l.a >= 1) { l.f = l.novo; l.novo = null; }
      }
    },
  };
}

// ---------- ELENCO REAL: as figuras da marca, com o desenho delas sobre o modelo 3D (det = 2 + índice da figura, ver marca.js) ----------
const artista = nome => 2 + 'abcdefghij'.indexOf(nome);
const girarQ = (q, v) => {
  const [x, y, z, w] = q;
  const c = [y * v[2] - z * v[1] + w * v[0], z * v[0] - x * v[2] + w * v[1], x * v[1] - y * v[0] + w * v[2]];
  return [v[0] + 2 * (y * c[2] - z * c[1]), v[1] + 2 * (z * c[0] - x * c[2]), v[2] + 2 * (x * c[1] - y * c[0])];
};
const ROSTO = { rug: 0.1, fio: 0.1, onda: 1, tom: 1 };

// RODA: o elenco inteiro de gigantes em círculo em volta da pista, entrando um de cada vez. A roda gira bem devagar.
function roda(api) {
  const { malha, qEixo, XC } = api;
  const H = 22, RAIO = 13, CHAO = -1.6, N = ELENCO.length, ENTRA = 5;
  let t = 0, giro = sorte(6);
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ entraram: Math.min(N, Math.floor(t / ENTRA) + 1) }),
    quadro(dt) {
      t += dt;
      giro += dt * 0.035;
      ELENCO.forEach((nome, i) => {
        const sobe = suave((t - i * ENTRA) / 6);
        if (sobe <= 0) return;
        const a = giro + i * Math.PI * 2 / N;
        const f = figuraDe(api, nome);
        malha(f, XC + Math.cos(a) * RAIO, CHAO - (1 - sobe) * (H + 4) + Math.sin(t * 0.35 + i) * 0.25, Math.sin(a) * RAIO, H, qEixo(0, 1, 0, Math.atan2(-Math.cos(a), -Math.sin(a))), { ...ROSTO, det: artista(nome) });
      });
    },
  };
}
// QUEDA: um personagem de cada vez cai do céu em direção à pista, girando no ar, e passa rente ao teto. Alguns caem atrás da parede.
function queda(api) {
  const { malha, qEixo, qMul, HT, ZF, XC } = api;
  const lista = [];
  let n = 0, espera = 0;
  const nova = () => {
    const parede = Math.random() < 0.3;
    const nome = ELENCO[n++ % ELENCO.length];
    lista.push({ f: figuraDe(api, nome), nome, H: sorte(3.4, 5.6), x: XC + sorte(-2.2, 2.2), y: parede ? 16 : 52, z: parede ? ZF + sorte(1.5, 6) : sorte(-6, 7), v: parede ? 1.5 : 2.6, a: sorte(6.28), b: sorte(6.28), wa: sorte(-0.5, 0.5), wb: sorte(-0.4, 0.4), fim: parede ? -14 : api.HT - 3 });
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ caindo: lista.map(q => q.nome).join('') }),
    quadro(dt) {
      espera -= dt;
      if (espera <= 0) { nova(); espera = 5.5; }
      for (let i = lista.length - 1; i >= 0; i--) {
        const q = lista[i];
        q.y -= dt * q.v; q.a += dt * q.wa; q.b += dt * q.wb;
        if (q.y < q.fim) { lista.splice(i, 1); continue; }
        const r = qMul(qEixo(0, 1, 0, q.a), qEixo(1, 0, 0, q.b));
        // gira em volta do meio do corpo, e não do pé
        const m = girarQ(r, [0, q.H / 2, 0]);
        malha(q.f, q.x - m[0], q.y - m[1], q.z - m[2], q.H, r, { ...ROSTO, det: artista(q.nome) });
      }
      return HT;
    },
  };
}
// GIGANTE: um personagem de 30 m em pé logo atrás da parede do DJ, dá uma volta lenta sobre a pista. A cada 40 s, outro sobe no lugar.
function gigante(api) {
  const { malha, qEixo, ZF, XC } = api;
  const H = 30, CHAO = -1.6, CADA = 40, DUR = 11;
  let i = 0, t = 0, giro = 0;
  const desenhar = (idx, afunda) => {
    const nome = ELENCO[idx % ELENCO.length];
    malha(figuraDe(api, nome), XC, CHAO - afunda * (H + 4), ZF + 3, H, qEixo(0, 1, 0, giro), { ...ROSTO, det: artista(nome) });
  };
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ figura: ELENCO[i % ELENCO.length] }),
    quadro(dt) {
      t += dt;
      giro += dt * Math.PI * 2 / 60;
      if (t >= CADA) {
        const a = (t - CADA) / DUR;
        desenhar(i, suave(a / 0.6));
        desenhar(i + 1, 1 - suave((a - 0.25) / 0.75));
        if (a >= 1) { t = 0; i++; }
      } else desenhar(i, 0);
    },
  };
}
// DESFILE: o elenco passa em fila, um atrás do outro, de um lado para o outro atrás da parede e por cima da pista.
function desfile(api) {
  const { malha, qEixo, ZF } = api;
  const H = 15, VEL = 1.05, ESPACO = 7.6, CHAO = -1.6, LIMITE = 36;
  let t = 0;
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ andou: +(t * VEL).toFixed(1) }),
    quadro(dt) {
      t += dt;
      const andou = t * VEL;
      const prim = Math.floor((andou - LIMITE) / ESPACO), ulti = Math.floor((andou + LIMITE) / ESPACO);
      for (let n = prim; n <= ulti; n++) {
        const x = andou - n * ESPACO;
        const nome = ELENCO[((n % ELENCO.length) + ELENCO.length) % ELENCO.length];
        const passo = Math.abs(Math.sin(andou * 0.9 + n)) * 0.28;
        malha(figuraDe(api, nome), x, CHAO + passo, ZF + 6.5, H, qEixo(0, 1, 0, Math.sin(n * 1.7) * 0.5), { ...ROSTO, det: artista(nome) });
      }
    },
  };
}

// ---------- TRAVESSIA: figuras deitadas, de cabeça para a parede do DJ, atravessam o céu acima de uma grade de inox e giram devagar no próprio eixo. ----------
function travessia(api, op = {}) {
  const { caixa, malha, qEixo, qMul, M, HT, ZF, XC } = api;
  const ALT = 2.45, VEL = op.vel || 0.62, CADA = op.cada || 21, DE = -14, ATE = ZF + 11;
  const viajantes = [];
  let n = 0, espera = 0;
  const costelas = [];
  let z = -5.2;
  while (z < ZF + 0.2) { costelas.push({ z, ox: sorte(3), meia: [0.012, 0.022, 0.04][Math.floor(sorte(3))], tom: sorte(0.7, 1) }); z += [0.47, 0.7, 0.94, 1.41][Math.floor(sorte(4))]; }
  // Cabe na largura do painel e fica alta: perto do teto ela vira só uma barriga. Balança em vez de girar inteira, senão o braço desce para dentro da sala.
  const nova = z0 => { const f = figuraDe(api, ELENCO[n++ % ELENCO.length]); viajantes.push({ f, H: Math.min(9.5, 6.2 / f.largura), z: z0, fase: sorte(6.28), x: sorte(-0.08, 0.08) }); };
  nova(-3);
  espera = op.comeca || 14;
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ viajantes: viajantes.map(v => v.f.nome + ' ' + v.z.toFixed(1)).join(', ') }),
    quadro(dt) {
      espera -= dt;
      if (espera <= 0) { nova(DE); espera = CADA; }
      for (const c of costelas) caixa(XC, HT + 0.05, c.z, 1.2, 0.03, c.meia, 0.9 * c.tom, 7, undefined, c.ox, 1.3);
      for (const lado of [-1, 1]) caixa(XC + lado * 0.93, HT + 0.05, -0.3, 0.03, 0.03, 5.2, 1, 8, undefined, lado, 0.4, 0, 0.016);
      for (let i = viajantes.length - 1; i >= 0; i--) {
        const v = viajantes[i];
        v.z += dt * VEL;
        v.fase += dt * 0.16;
        if (v.z > ATE) { viajantes.splice(i, 1); continue; }
        const q = qMul(qEixo(0, 0, 1, Math.sin(v.fase) * 0.42), QX90);
        malha(v.f, XC + v.x, ALT, v.z - v.H / 2, v.H, q, { fio: 0.14, onda: 1 });
      }
    },
  };
}

// ---------- INSTÂNCIA: o estado da marca em que a figura vira blocos. O teto é uma laje de blocos; eles se soltam e montam um personagem no céu, e depois voltam. ----------
function instancia(api, op = {}) {
  const { caixa, qEixo, qMul, M, HT, ZF, XC, META, VOX, INICIO, PARADO } = api;
  const H = 8.6, LIN = META.linhas, MOD = H / LIN, ALT = 2.3, TAM_F = MOD * 0.41;
  // a laje tem módulo próprio: cabe na largura do painel e fecha o céu
  const LAJE = 0.078, TAM_L = LAJE * 0.46, COLS = 27, Z0 = -5.04, ZFIM = ZF + 0.02;
  const T_LAJE = op.laje || 9, T_SOBE = op.sobe || 18, T_FIGURA = op.figura || 46, T_DESCE = op.desce || 14;
  const bruto = new Int8Array(VOX);
  const cache = new Map();
  const carregar = nome => {
    if (cache.has(nome)) return cache.get(nome);
    const e = META.voxels.find(v => v.nome === nome);
    const lista = [];
    for (let i = 0; i < e.n; i++) {
      const o = (e.inicio + i) * 6;
      lista.push([bruto[o], bruto[o + 1], bruto[o + 2], bruto[o + 3] / 127, bruto[o + 4] / 127, bruto[o + 5] / 127]);
    }
    // ordem pela altura do corpo: a cabeça fica na ponta do teto mais perto da parede, e o desenho do corpo já lembra a laje
    lista.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const filas = Math.floor((ZFIM - Z0) / LAJE);
    const dados = new Float32Array(lista.length * 11);
    lista.forEach((v, i) => {
      const fila = Math.floor(i / COLS) % filas, cam = Math.floor(i / (COLS * filas));
      const col = i % COLS;
      const lx = XC + (col - (COLS - 1) / 2) * LAJE, lz = Z0 + (fila + 0.5) * LAJE, ly = HT + TAM_L + 0.012 + cam * LAJE * 1.05;
      const px = (v[0] + 0.5) * MOD, py = (v[1] + 0.5) * MOD - H / 2, pz = (v[2] + 0.5) * MOD;
      dados.set([px, py, pz, lx, ly, lz, v[3], v[4], v[5], Math.random(), cam ? 1 : 0], i * 11);
    });
    const r = { dados, n: lista.length };
    cache.set(nome, r);
    return r;
  };
  let elenco = 0, atual = carregar(ELENCO[0]), estado = PARADO === 'figura' ? 'parado' : 'laje', t = INICIO, junta = PARADO === 'figura' ? 1 : 0, rola = sorte(6.28);
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ fase: estado, junta: +junta.toFixed(2), blocos: atual.n, figura: ELENCO[elenco % ELENCO.length] }),
    quadro(dt) {
      t += dt;
      if (estado === 'laje' && t > T_LAJE) { estado = 'sobe'; t = 0; }
      else if (estado === 'sobe') { junta = t / T_SOBE; if (junta >= 1) { junta = 1; estado = 'figura'; t = 0; } }
      else if (estado === 'figura' && t > T_FIGURA) { estado = 'desce'; t = 0; }
      else if (estado === 'desce') {
        junta = 1 - t / T_DESCE;
        if (junta <= 0) { junta = 0; estado = 'laje'; t = 0; atual = carregar(ELENCO[++elenco % ELENCO.length]); }
      }
      rola += dt * 0.15;
      const q = qMul(qEixo(0, 0, 1, Math.sin(rola) * 0.4), QX90);
      // rotação do corpo em matriz, para não multiplicar quatérnio bloco a bloco
      const [x, y, z, w] = q;
      const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
      const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
      const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
      const d = atual.dados;
      const QLAJE = [0, 0, 0, 1];
      const fatorV = M.grave * 0.03;
      for (let i = 0; i < atual.n; i++) {
        const o = i * 11;
        const sorteio = d[o + 9];
        const k = suave(junta * 1.5 - sorteio * 0.5);
        // o bloco que sobra da laje só aparece quando a figura está no alto
        if (k <= 0 && d[o + 10] > 0.5) continue;
        const h = (d[o + 1] + H / 2) / H;
        const espalha = (M.atraso(h * 0.8) * 0.12 + fatorV) * k;
        const px = d[o] + d[o + 6] * espalha, py = d[o + 1] + d[o + 7] * espalha, pz = d[o + 2] + d[o + 8] * espalha;
        const fx = XC + m00 * px + m01 * py + m02 * pz, fy = ALT + m10 * px + m11 * py + m12 * pz, fz = 0 + m20 * px + m21 * py + m22 * pz;
        const onda = M.atraso(Math.abs(ZF - d[o + 5]) / 6.5) * 0.035 * (1 - k);
        const arco = Math.sin(k * Math.PI) * 0.35;
        const tam = TAM_L + (TAM_F - TAM_L) * k;
        caixa(d[o + 3] + (fx - d[o + 3]) * k, d[o + 4] + (fy - d[o + 4]) * k + arco - onda, d[o + 5] + (fz - d[o + 5]) * k, tam, tam, tam, 1 + 0.4 * k, 7, k > 0.5 ? q : QLAJE, sorteio * 3, sorteio * 2);
      }
    },
  };
}

// ---------- MONOLITO: as letras do logo, em malha real, como cinco blocos fundos de inox no teto. Uma de cada vez dá uma volta lenta no próprio eixo. ----------
function monolito(api) {
  const { malha, caixa, qEixo, qMul, M, HT, ZF, XC, META } = api;
  const K = 7.0, FUNDO = 1.0, GAP = 1.86, Z_E = ZF - 1.04;
  // De cima para baixo no painel: C, L, U, B, E. O E fica junto da parede, e a palavra se lê andando com o olhar da cabeça para a parede.
  const letras = META.letras.map((l, i) => ({ l, z: Z_E - (META.letras.length - 1 - i) * GAP, gira: 0, proximo: false, m: new Mola1() }));
  let t = 0, prox = 0, ultimaBat = 0, batidas = 0;
  return {
    estrelasTeto: 3400, estrelasParede: 1200,
    estado: () => ({ giram: letras.filter(l => l.gira > 0).length }),
    quadro(dt) {
      t += dt;
      if (M.batida !== ultimaBat) {
        ultimaBat = M.batida;
        if (++batidas >= 24) { batidas = 0; letras[prox].gira = 1e-4; prox = (prox + 1) % letras.length; }
      }
      for (const a of letras) {
        if (a.gira > 0) { a.gira += dt / 15; if (a.gira >= 1) a.gira = 0; }
        const ang = suave(a.gira) * Math.PI * 2;
        const q = qMul(qEixo(1, 0, 0, ang), QX90_LETRA);
        const onda = M.atraso(Math.abs(ZF - a.z) / 6.5) * 0.09;
        const prof = a.l.meia[2] * K * FUNDO;
        malha(a.l, XC + a.l.x * 0, HT + prof + 0.1 + Math.sin(ang / 2) * 0.9 - onda, a.z, 1, q, { sx: K, sy: K, sz: K * FUNDO, onda: 0, rug: 0.08, fio: 0.12, det: 1, tom: 1.7 });
      }
    },
  };
}
