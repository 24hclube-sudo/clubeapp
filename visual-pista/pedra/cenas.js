// Onde fica cada peça em cada quadro, em metros, com o olho na origem: y para cima, z para a parede do DJ.
// O teto do LED é o plano y = 0,7532; a parede é o plano z = 4,39. Tudo do lado de cá desses planos fica invisível: o LED é um vão.
// Tudo é simétrico em x: cada rocha fora do eixo tem a gêmea espelhada do outro lado.
export const MODOS = ['logo', 'campo', 'estelas', 'corte', 'lajes', 'degraus'];
export const MAX_OBJ = 64;
export const TILE = 80, TX = 4, TY = 3, NPLANOS = 18;
// sem O Curador (h): ele segura um vinil, que o usuário pediu para não voltar
export const FIGURAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i', 'j'];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const qEixo = (ax, ay, az, a) => { const l = Math.hypot(ax, ay, az) || 1, s = Math.sin(a / 2) / l; return [ax * s, ay * s, az * s, Math.cos(a / 2)]; };
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qRot = (q, v) => {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1] + w * v[0], cy = z * v[0] - x * v[2] + w * v[1], cz = x * v[1] - y * v[0] + w * v[2];
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)];
};
const qInv = q => [-q[0], -q[1], -q[2], q[3]];
const espelharQ = q => [q[0], -q[1], -q[2], q[3]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ponto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function anguloFace(q0, n) {
  if (!n || ponto(n, n) < 0.5) return 0;
  const up = Math.abs(n[1]) > 0.7 ? [0, 0, 1] : [0, 1, 0];
  const d = ponto(up, n);
  const v = norm([up[0] - n[0] * d, up[1] - n[1] * d, up[2] - n[2] * d]);
  const u = cruz(n, v);
  const nw = qRot(q0, n), uw = qRot(q0, u), vw = qRot(q0, v);
  // de baixo, o alto do número aponta para quem olha (-z); de frente, para cima
  const quer = nw[1] < -0.5 ? [0, 0, -1] : [0, 1, 0];
  const dq = ponto(quer, nw);
  const alvo = norm([quer[0] - nw[0] * dq, quer[1] - nw[1] * dq, quer[2] - nw[2] * dq]);
  return Math.atan2(-ponto(alvo, uw), ponto(alvo, vw));
}
const qAleatorio = r => { const u = r(), v = r(), w = r(); return [Math.sqrt(1 - u) * Math.sin(2 * Math.PI * v), Math.sqrt(1 - u) * Math.cos(2 * Math.PI * v), Math.sqrt(u) * Math.sin(2 * Math.PI * w), Math.sqrt(u) * Math.cos(2 * Math.PI * w)]; };
const suave = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const easeIO = t => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = t => { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); };

// As 12 rochas do volume: monólito, laje, bloco, lasca, seixo e cunha, duas de cada, com 18 faces largas cada.
const FORMAS = [[0.5, 0.9, 0.45], [0.9, 0.4, 0.72], [0.8, 0.7, 0.64], [0.44, 0.88, 0.36], [0.84, 0.76, 0.8], [0.92, 0.56, 0.5]];
export function planosDasRochas(semente) {
  const r = rng(semente);
  const planos = new Float32Array(TX * TY * NPLANOS * 4);
  const buf = new ArrayBuffer(TX * TY * 32);
  const fF = new Float32Array(buf), fU = new Uint32Array(buf);
  const formas = [];
  for (let k = 0; k < TX * TY; k++) {
    const f = FORMAS[k % 6].map(v => v * (0.9 + 0.1 * r()));
    formas.push(f);
    const giro = qAleatorio(r);
    for (let i = 0; i < NPLANOS; i++) {
      const y = 1 - (i + 0.5) / NPLANOS * 2, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + r() * 0.8;
      const n = norm(qRot(giro, norm([Math.cos(a) * rr + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, Math.sin(a) * rr + (r() - 0.5) * 0.3])));
      planos.set([n[0], n[1], n[2], 0.84 + 0.14 * r()], (k * NPLANOS + i) * 4);
    }
    fF.set([f[0], f[1], f[2], 0], k * 8);
    fU.set([Math.floor(r() * 4e9) >>> 0, k % 3 === 1 ? 1 : 0, 0, 0], k * 8 + 4);
  }
  ULTIMAS_FORMAS = formas;
  return { planos, rochas: new Uint8Array(buf) };
}
let ULTIMAS_FORMAS = FORMAS.concat(FORMAS);
// até onde a rocha vai numa direção do espaço dela, aproximado pela forma
const alcance = (k, n) => { const f = ULTIMAS_FORMAS[k]; return 0.9 * Math.hypot(f[0] * n[0], f[1] * n[1], f[2] * n[2]); };

// ---------- empacotar as peças para a placa: 8 vec4 por peça ----------
function criarPacote() {
  const f = new Float32Array(MAX_OBJ * 32);
  let n = 0;
  return {
    objetos: f,
    get n() { return n; },
    limpar() { n = 0; },
    por(o) {
      if (n >= MAX_OBJ) return;
      const b = n * 32;
      f.set([o.x, o.y, o.z, o.raio], b);
      f.set(o.q || [0, 0, 0, 1], b + 4);
      f.set([o.s ?? 1, o.tipo ?? 0, o.idx ?? 0, o.espelho ?? 1], b + 8);
      f.set(o.cA || [0, 0, 0, 0], b + 12);
      f.set(o.cB || [0, 0, 0, 0], b + 16);
      f.set([o.cel ?? 0.03, o.forca ?? 1, o.sem ?? 0, o.alfa ?? 1], b + 20);
      f.set([o.rug ?? 1, o.mat ?? 0, o.hd ?? 0, o.idxB ?? 0], b + 24);
      f.set(o.ex2 || [0, 0, 0, 0], b + 28);
      n++;
    },
  };
}

// ---------- o letreiro da parede: CLUBE, Pista Quente e Millos Kaiser revezam a cada 32 tempos ----------
function criarLetreiro(HT, ZF, mat) {
  const ZL = ZF + 0.08, HD = 0.11, MEIA = 0.8256 * (ZL / 4.19), CY = HT - 0.64;
  const ORDEM = [0, 1, 0, 2];
  return {
    logoTela: null,
    quadro(S, P) {
      const b = S.fase / 32, blk = Math.floor(b), dentro = b - blk;
      const a = ORDEM[((blk % 4) + 4) % 4], bb = ORDEM[(((blk + 1) % 4) + 4) % 4];
      const m = easeIO((dentro - 30 / 32) / (2 / 32));
      // na troca, os números embaralham e acendem: esconde o meio do caminho entre uma palavra e outra
      const troca = Math.sin(Math.PI * Math.min(1, Math.max(0, (dentro - 29.5 / 32) / (3 / 32))));
      P.por({ x: 0, y: CY, z: ZL + HD, raio: 1.12, tipo: 1, idx: a, idxB: bb, ex2: [MEIA, m, 0, 0], hd: HD, rug: 1, mat,
        cel: 0.038, forca: 1.05 + 2.2 * troca + 0.5 * S.kick * S.somVivo, sem: 3.3 + blk * 0.71 });
      this.logoTela = { cx: 0, cy: CY, z: ZL, meia: MEIA, a, b: bb, m, prof: 2 * HD };
    },
  };
}

// ---------- rochas soltas no céu, em pares espelhados ----------
const casaPara = y => Math.min(0.11, Math.max(0.05, 0.03 * y / 0.7532));
function criarRochas(r, { pares, unicos = [], y, z, x, s, segundo = 0.4 }) {
  const lista = [];
  const cabe = (px, py, pz, ps) => lista.every(o => Math.hypot(o.x - px, o.y - py, o.z - pz) > (o.s + ps) * 1.15 && Math.hypot(o.x + px, o.y - py, o.z - pz) > (o.s + ps) * 1.15);
  const nova = (px, py, pz, ps, par) => {
    const tile = Math.floor(r() * TX * TY);
    const q0 = qAleatorio(r);
    // o corte olha para o olho, com um desvio: é a face polida que a gente vê de baixo
    const P = [px, py, pz];
    const nw = norm([-px + (r() - 0.5) * 0.9, -py * (0.9 + 0.3 * r()), -pz * 0.6 + (r() - 0.5) * 1.2]);
    const nl = norm(qRot(qInv(q0), nw));
    const cA = [...nl, alcance(tile, nl) * (0.3 + 0.28 * r())];
    let cB = [0, 0, 0, 0];
    if (r() < segundo) {
      const eixo = norm([r() - 0.5, r() - 0.5, r() - 0.5]);
      const n2 = norm(qRot(qEixo(...eixo, (75 + 30 * r()) * Math.PI / 180), nl));
      cB = [...n2, alcance(tile, n2) * (0.42 + 0.25 * r())];
    }
    lista.push({ x: px, y: py, z: pz, s: ps, tile, q0, cA, cB, par, P, ang: [anguloFace(q0, cA), anguloFace(q0, cB), 0, 0],
      eixo: norm([r() - 0.5, r() - 0.5, r() - 0.5]), amp: 0.18 + 0.2 * r(), w: 0.05 + 0.07 * r(), fase: r() * 6.28,
      cel: casaPara(py) * (0.92 + 0.16 * r()), forca: 0.75 + 0.5 * r(), sem: r() * 100 });
  };
  for (const u of unicos) nova(0, u[0], u[1], u[2], false);
  let tent = 0;
  while (lista.filter(o => o.par).length < pares && tent++ < 4000) {
    const ps = s[0] + (s[1] - s[0]) * Math.pow(r(), 1.4);
    const px = x[0] + (x[1] - x[0]) * r(), py = y[0] + (y[1] - y[0]) * r(), pz = z[0] + (z[1] - z[0]) * r();
    if (py - ps < 1.05 || Math.abs(px) < ps * 1.1 || !cabe(px, py, pz, ps)) continue;
    nova(px, py, pz, ps, true);
  }
  return lista;
}
function porRocha(P, o, t, extra = {}) {
  const q = qMul(o.q0, qEixo(...o.eixo, o.amp * Math.sin(o.w * t + o.fase)));
  const y = o.y + 0.03 * Math.sin(0.37 * t + o.fase * 1.7);
  const base = { y, z: o.z, raio: o.s * 1.02, s: o.s, tipo: 0, idx: o.tile, cA: o.cA, cB: o.cB, cel: o.cel, forca: o.forca * (extra.forca ?? 1), sem: o.sem, rug: 1, mat: 0, ex2: o.ang };
  P.por({ ...base, x: o.x, q });
  if (o.par) P.por({ ...base, x: -o.x, q: espelharQ(q), espelho: -1 });
}

// ---------- as cenas ----------
export function criarCena(modo, { SEMENTE, HT, ZF }) {
  const r = rng(SEMENTE ^ 0x5bd1e995);
  const P = criarPacote();
  const pedra = modo === 'lajes' || modo === 'degraus';
  const letreiro = criarLetreiro(HT, ZF, pedra ? 1 : 0);
  // o tom da pedra clara: travertino que puxa para o marrom, como o teto da casa
  const PEDRA = [0.32, 0.24, 0.168, 0];
  let estado = {};
  const fim = (extra = {}) => ({ objetos: P.objetos, n: P.n, logoTela: letreiro.logoTela, ...extra });

  if (modo === 'logo') {
    const rochas = criarRochas(r, { pares: 4, unicos: [[1.95, 3.5, 0.74], [2.4, 7.9, 0.9]], y: [1.3, 2.4], z: [-2.2, 9.2], x: [0.7, 1.55], s: [0.38, 0.66] });
    return {
      quadro(dt, S) {
        P.limpar();
        letreiro.quadro(S, P);
        for (const o of rochas) porRocha(P, o, S.tempo);
        return fim({ brilho: 0.075 });
      },
      estado: () => estado,
    };
  }

  if (modo === 'campo') {
    const rochas = criarRochas(r, { pares: 9, unicos: [[2.6, -1.6, 0.42], [1.7, 9.6, 0.34]], y: [1.25, 3.0], z: [-5, 12], x: [0.45, 2.0], s: [0.2, 0.46], segundo: 0.5 });
    // a rocha que abre como livro, com a dobradiça em cima: as duas faces de dentro são de números
    const tile = [2, 4, 8, 10][Math.floor(r() * 4)];
    const sB = 0.82, PB = [0, 2.55, 4.3];
    const q0 = qEixo(1, 0, 0, (r() - 0.5) * 0.8);
    return {
      quadro(dt, S) {
        P.limpar();
        letreiro.quadro(S, P);
        for (const o of rochas) porRocha(P, o, S.tempo);
        const b = (S.fase + 8) / 32, dentro = (b - Math.floor(b)) * 32;
        const abre = dentro < 4 ? easeOut(dentro / 4) : dentro < 18 ? 1 : dentro < 24 ? 1 - easeIO((dentro - 18) / 6) : 0;
        const th = -abre * 0.42 - 0.012 * S.kick * S.somVivo;
        const qz = qEixo(0, 0, 1, th);
        const H = [0, PB[1] + sB * 0.62, PB[2]];
        const rel = qRot(qz, [PB[0] - H[0], PB[1] - H[1], PB[2] - H[2]]);
        const pA = [H[0] + rel[0], H[1] + rel[1], H[2] + rel[2]];
        const qA = qMul(qz, q0);
        const cfg = { y: pA[1], z: pA[2], raio: sB * 1.02, s: sB, tipo: 0, idx: tile, cA: [1, 0, 0, 0], ex2: [anguloFace(q0, [1, 0, 0]), 0, 0, 0], cel: 0.095, forca: 1 + 1.6 * abre, sem: 77.7, rug: 1, mat: 0 };
        P.por({ ...cfg, x: pA[0], q: qA });
        P.por({ ...cfg, x: -pA[0], q: espelharQ(qA), espelho: -1 });
        estado = { abre: +abre.toFixed(2) };
        return fim({ brilho: 0.08 });
      },
      estado: () => estado,
    };
  }

  if (modo === 'estelas') {
    const rochas = criarRochas(r, { pares: 4, y: [1.4, 3.0], z: [-4, 11], x: [1.1, 2.3], s: [0.16, 0.34] });
    const H = 3.0, HD = 0.12, ZC = 3.2, YC = 2.35;
    return {
      quadro(dt, S) {
        P.limpar();
        letreiro.quadro(S, P);
        for (const o of rochas) porRocha(P, o, S.tempo);
        // um personagem a cada 32 tempos: entra pelas costas de quem olha, fica, e sobe para o céu
        const b = S.fase / 32, blk = Math.floor(b), dentro = (b - blk) * 32;
        const fig = ((blk % FIGURAS.length) + FIGURAS.length) % FIGURAS.length;
        let z = ZC, y = YC, giro = 0;
        if (dentro < 6) { const e = easeOut(dentro / 6); z = -11 + (ZC + 11) * e; giro = (1 - e) * 0.35; }
        else if (dentro > 26) { const e = easeIO((dentro - 26) / 6); y = YC + 5 * e; z = ZC + 5 * e; giro = -e * 0.25; }
        const balanco = 0.03 * Math.sin(S.tempo * 0.3);
        const q = qMul(qEixo(1, 0, 0, giro + balanco), qEixo(0, 0, 1, 0.025 * Math.sin(S.tempo * 0.21)));
        P.por({ x: 0, y, z, raio: Math.hypot(H / 2, H / 2, HD) * 1.02, q, tipo: 2, idx: fig, hd: HD, rug: 1, mat: 0,
          ex2: [H, 1, 0, 0], cel: 0.075, forca: 1.15 + 0.4 * S.kick * S.somVivo, sem: 11 + blk * 3.7 });
        estado = { figura: FIGURAS[fig] };
        return fim({ brilho: 0.075 });
      },
      estado: () => estado,
    };
  }

  if (modo === 'corte') {
    const rochas = criarRochas(r, { pares: 4, y: [2.6, 3.8], z: [-6, -1], x: [1.0, 2.2], s: [0.16, 0.34] });
    // a rocha grande, deitada ao longo do teto, cortada em 7 fatias como um pão; as fatias abrem em leque
    const tile = [0, 6][Math.floor(r() * 2)];
    const sR = 2.35, PR = [0, 2.35, 2.4];
    const q0 = qMul(qEixo(1, 0, 0, Math.PI / 2), qEixo(0, 1, 0, (r() - 0.5) * 0.3));
    const NF = 7, Y0 = -0.82, Y1 = 0.82;
    const cortes = Array.from({ length: NF + 1 }, (_, i) => Y0 + (Y1 - Y0) * i / NF + (i > 0 && i < NF ? (r() - 0.5) * 0.04 : 0));
    return {
      quadro(dt, S) {
        P.limpar();
        letreiro.quadro(S, P);
        for (const o of rochas) porRocha(P, o, S.tempo);
        const b = S.fase / 32, dentro = (b - Math.floor(b)) * 32;
        const abre = dentro < 4 ? easeOut(dentro / 4) : dentro < 14 ? 1 : dentro < 20 ? 1 - easeIO((dentro - 14) / 6) : 0;
        const sopro = 0.012 * S.kick * S.somVivo;
        for (let i = 0; i < NF; i++) {
          const k = i - (NF - 1) / 2;
          const gap = k * (0.03 + 0.34 * abre + sopro);
          const leque = qEixo(1, 0, 0, -k * 0.055 * abre);
          const q = qMul(leque, q0);
          // o centro da fatia, no espaço da rocha, ao longo do eixo y dela (que aponta para a parede)
          const yc = (cortes[i] + cortes[i + 1]) / 2;
          const c0 = qRot(q0, [0, yc * sR, 0]);
          const c1 = qRot(q, [0, yc * sR, 0]);
          const cA = i > 0 ? [0, -1, 0, -cortes[i]] : [0, 0, 0, 0];
          const cB = i < NF - 1 ? [0, 1, 0, cortes[i + 1]] : [0, 0, 0, 0];
          P.por({ x: PR[0] + c0[0] - c1[0], y: PR[1] + c0[1] - c1[1], z: PR[2] + gap + c0[2] - c1[2], raio: sR * 1.0, q, s: sR, tipo: 0, idx: tile, cA, cB, ex2: [anguloFace(q0, cA), anguloFace(q0, cB), 0, 0],
            cel: 0.088, forca: 0.95 + 1.2 * abre, sem: 40 + i * 9.1, rug: 1, mat: 0 });
        }
        estado = { abre: +abre.toFixed(2) };
        return fim({ brilho: 0.08 });
      },
      estado: () => estado,
    };
  }

  if (modo === 'lajes') {
    // placas de travertino com o pé recuado, como a pedra da referência; juntas fora das emendas dos módulos de 16 cm
    const CX = 0.74, CZ = 0.93, Z0 = -5.12, NZ = 11;
    const placas = [];
    for (let iz = 0; iz < NZ; iz++) for (let ix = -1; ix <= 1; ix++) {
      placas.push({ ix, iz, x: ix * CX, z: Z0 + (iz + 0.5) * CZ, alto: 0.35 + 1.9 * Math.pow(r(), 1.3), tx: (r() - 0.5) * 0.2, tz: (r() - 0.5) * 0.2, atraso: r(), sem: r() * 50 });
    }
    const HB = [CX / 2 - 0.012, 0.075, CZ / 2 - 0.012];
    const PE = 0.042, RECUO = 0.065;
    let ciclo = 0;
    return {
      quadro(dt, S) {
        P.limpar();
        letreiro.quadro(S, P);
        // fechado 32 tempos, abrindo 16, aberto 64, fechando 16
        const b = ((S.fase % 128) + 128) % 128;
        ciclo = b < 32 ? 0 : b < 48 ? (b - 32) / 16 : b < 112 ? 1 : 1 - (b - 112) / 16;
        const abrindo = b < 80;
        for (const p of placas) {
          // a onda sai do meio e da parede, simétrica
          const ordem = (Math.abs(p.ix) * 0.3 + (NZ - 1 - p.iz) / NZ) / 1.3;
          const local = abrindo ? (ciclo * 1.6 - ordem * 0.6) : (ciclo * 1.6 - (1 - ordem) * 0.6);
          const e = easeIO(local);
          // o bumbo corre da parede para a entrada, como um peso que passa
          const onda = S.kick * S.somVivo * 0.025 * Math.exp(-Math.pow((p.z - S.scanZ) / 1.2, 2));
          const respira = e * 0.03 * Math.sin(S.tempo * 0.5 + p.atraso * 6) * (0.4 + S.grave * S.somVivo);
          const y = HT + 0.016 + PE + HB[1] + e * p.alto + respira - onda;
          const q = qMul(qEixo(1, 0, 0, e * p.tx), qEixo(0, 0, 1, e * p.tz * Math.sign(p.ix || 1)));
          const qq = p.ix < 0 ? espelharQ(qMul(qEixo(1, 0, 0, e * p.tx), qEixo(0, 0, 1, e * p.tz))) : q;
          P.por({ x: p.x, y, z: p.z, raio: Math.hypot(HB[0], HB[1] + PE, HB[2]) * 1.08, q: p.ix === 0 ? qEixo(1, 0, 0, e * p.tx) : qq, tipo: 3, mat: 1, rug: 1,
            hd: PE, idxB: RECUO, ex2: [HB[0], HB[1], HB[2], 0], espelho: p.ix < 0 ? -1 : 1, sem: p.ix < 0 ? placas.find(o => o.iz === p.iz && o.ix === 1).sem : p.sem });
        }
        estado = { ciclo: +ciclo.toFixed(2) };
        return fim({ brilho: 0.05, pedraCor: PEDRA, booth: 1.05 });
      },
      estado: () => estado,
    };
  }

  // degraus: caixotões em pirâmide invertida de pedra, os anéis sobem e descem como um telescópio
  const CAIXOES = [-2.9, 0.15, 3.15];
  const NA = 4, LARG = 0.17, ESP = 0.09;
  return {
    quadro(dt, S) {
      P.limpar();
      letreiro.quadro(S, P);
      const respira = 0.5 + 0.5 * Math.sin(S.fase * Math.PI * 2 / 32);
      CAIXOES.forEach((zc, ci) => {
        for (let a = 0; a < NA; a++) {
          const hx = 1.04 - a * LARG, hz = 1.42 - a * LARG;
          const fase = S.fase - a * 0.5 - ci * 2;
          const passo = 0.07 + 0.2 * respira + 0.03 * Math.sin(fase * Math.PI / 4);
          const golpe = (a === NA - 1 ? 0.05 : 0.015) * S.kick * S.somVivo * Math.exp(-Math.pow((zc - S.scanZ) / 2, 2));
          const y = HT + 0.016 + ESP + a * passo + golpe;
          P.por({ x: 0, y, z: zc, raio: Math.hypot(hx, ESP, hz) * 1.04, tipo: 3, mat: 1, rug: 1, ex2: [hx, ESP, hz, LARG], sem: 7 + ci * 13 + a * 3.3 });
        }
      });
      estado = { respira: +respira.toFixed(2) };
      return fim({ brilho: 0.05, pedraCor: PEDRA, booth: 1.05 });
    },
    estado: () => estado,
  };
}
