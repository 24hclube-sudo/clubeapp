// As quatro cenas do Céu 3D. Cada uma só diz onde ficam as caixas neste quadro, em metros, com o olho na origem:
// x para a direita, y para cima, z para a parede do DJ. O teto do LED fica em y = HT e a parede em z = ZF.
import { comportas, trama } from './cenas-desliza.js';
export const MODOS = ['concreto', 'teto', 'caixotoes', 'porticos', 'comportas', 'trama'];
const sorte = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

export function criarCena(modo, api) {
  return { concreto: concreto, teto: tetoInox, caixotoes: caixotoes, porticos: porticos, comportas, trama }[modo](api);
}

// fechado, abrindo, aberto, fechando: o mesmo roteiro nas duas cenas que abrem
function roteiro(parado, cena, { fechado = 8, aberto = 64 } = {}) {
  let estado = parado === 'aberto' ? 'aberto' : 'fechado', conta = 0;
  return {
    get estado() { return estado; },
    fixar(e) { parado = e; estado = e; conta = 0; },
    batida() {
      if (parado) return;
      conta++;
      if (estado === 'fechado' && conta >= fechado) { estado = 'abrindo'; conta = 0; }
      else if (estado === 'aberto' && conta >= aberto) { estado = 'fechando'; conta = 0; }
    },
    conferir() {
      if (parado) return;
      if (estado === 'abrindo' && cena.cheio()) { estado = 'aberto'; conta = 0; }
      if (estado === 'fechando' && cena.vazio()) { estado = 'fechado'; conta = 0; }
    },
  };
}

function paredeDJ(api, opcoes) {
  api.caixa(api.XC, api.HT - 0.9, api.ZF + 0.2, 2.4, 0.9, 0.2, { mat: 4, ox: 0.4, oy: 1.1, ...opcoes });
}

// ---------- CONCRETO: laje de cimento queimado, com furos de tirante. Cada bumbo solta uma placa, que sobe para o céu. ----------
function concreto(api) {
  const { caixa, quat, P, NB, R, HT, ZF, XC, PARADO } = api;
  const COLS = 3, LARGP = 0.82, FILAS = 7, COMP = (ZF + 5.02) / FILAS, ESP = 0.21;
  const placas = [];
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLS; c++) {
      const cx = XC + (c - (COLS - 1) / 2) * LARGP, cz = -5.02 + (f + 0.5) * COMP;
      placas.push({
        f, c, cx, cz, ox: sorte(3), oy: sorte(3), tom: sorte(0.82, 1.08),
        a: 0, alvo: 0, b: Math.floor(sorte(NB)),
        rx: sorte(-1.5, 1.5), rz: sorte(-1.2, 1.2), sx: (cx - XC) * sorte(1.2, 2.6), sz: cz * sorte(0.45, 0.9),
        ordem: Math.hypot((cx - XC) * 1.7, cz + 0.4) + sorte(-0.8, 0.8), j: 0, bate: false,
      });
    }
  }
  // a fila junto da parede e a da entrada ficam: emolduram o buraco e seguram a perspectiva
  const soltas = placas.filter(p => p.f > 0 && p.f < FILAS - 1).sort((a, b) => a.ordem - b.ordem);
  let prox = 0, vez = false;
  if (PARADO === 'aberto') { for (const p of soltas) { p.a = p.alvo = 1; } prox = soltas.length; }
  const cena = {
    cheio: () => prox >= soltas.length && soltas.every(p => p.a > 0.98),
    vazio: () => prox <= 0 && soltas.every(p => p.a < 0.01),
  };
  const rt = roteiro(PARADO, cena);
  return {
    velocidade: 0, lavar: 0.72, lavarSom: 0.45, estrelasTeto: 3800, estrelasParede: 0,
    ceuLuz: () => 1,
    estado: () => ({ estado: rt.estado, aberto: +(prox / soltas.length).toFixed(2) }),
    // o teto de concreto do app (teto\camada.js) já cobriu tudo: por baixo, fica aberto e sem ciclo
    abrirJa() { rt.fixar('aberto'); for (const p of soltas) { p.a = p.alvo = 1; } prox = soltas.length; },
    batida: () => rt.batida(),
    golpe(f) {
      if (rt.estado === 'abrindo') {
        vez = !vez;
        if (vez && prox < soltas.length) soltas[prox++].alvo = 1;
      } else if (rt.estado === 'fechando') {
        for (let k = 0; k < 2 && prox > 0; k++) { const p = soltas[--prox]; p.alvo = 0; p.bate = true; }
      }
      for (const p of placas) p.j = Math.max(p.j, f * 0.4);
    },
    quadro(dt) {
      rt.conferir();
      paredeDJ(api, { a: 0, tom: 0.92 });
      for (const p of placas) {
        p.a = p.alvo > p.a ? Math.min(p.alvo, p.a + dt * 0.13) : Math.max(p.alvo, p.a - dt * 2.5);
        if (p.bate && p.a < 0.005) { p.bate = false; p.j = 1.6; }
        p.j *= Math.exp(-dt * 8);
        if (p.a > 0.995) continue;
        const a = p.a, s = a * a;
        // antes de subir, a placa desce um palmo: é o que mostra que ela é pesada e está solta
        const desce = Math.sin(Math.min(a / 0.08, 1) * Math.PI) * 0.17 * (p.alvo > 0.5 ? 1 : 0);
        const respira = a < 0.02 ? P[p.b] * 0.045 + p.j * 0.016 : 0;
        const y = HT + ESP + s * 26 - desce - respira;
        const x = p.cx + p.sx * s * 3.2, z = p.cz + p.sz * s * 3.2;
        const tom = p.tom * Math.exp(-s * 4.4) * (a < 0.02 ? 1 + P[p.b] * 0.22 : 1);
        caixa(x, y, z, LARGP / 2 - 0.0045, ESP, COMP / 2 - 0.0045, { tom, q: quat(p.rx * s * 1.5, p.rz * s * 1.5), ox: p.ox, oy: p.oy, a: 1 });
      }
    },
  };
}

// ---------- TETO DE INOX: chapas escovadas abrem ao meio, em camadas, do vão da parede para a entrada ----------
function tetoInox(api) {
  const { caixa, brilho, P, NB, R, HT, ZF, XC, PARADO } = api;
  const VAOS = 8, H = (ZF + 5.02) / VAOS, LP = 0.34, FIM = 0.7, CAMADA = 0.052;
  const baias = Array.from({ length: VAOS }, (_, i) => ({
    i, z: -5.02 + (i + 0.5) * H, b: Math.floor((VAOS - 1 - i) / VAOS * NB * 0.8),
    ox: sorte(3), oy: sorte(3), tons: Array.from({ length: 6 }, () => sorte(0.74, 1.05)),
  }));
  let abre = PARADO === 'aberto' ? 1 : 0, alvo = abre, tranco = 0;
  const cena = { cheio: () => alvo >= 1 && abre > 0.985, vazio: () => alvo <= 0 && abre < 0.015 };
  const rt = roteiro(PARADO, cena);
  const ATRASO = 0.42;
  return {
    velocidade: 0, lavar: 0, lavarSom: 0, estrelasTeto: 3800, estrelasParede: 0,
    ceuLuz: () => 1,
    estado: () => ({ estado: rt.estado, aberto: +abre.toFixed(2) }),
    abrirJa() { rt.fixar('aberto'); abre = alvo = 1; },
    batida: () => rt.batida(),
    golpe(f) {
      if (rt.estado === 'abrindo') alvo = Math.min(1, alvo + (0.7 + f * 0.4) / 30);
      else if (rt.estado === 'fechando') alvo = Math.max(0, alvo - 1 / 14);
      tranco = Math.max(tranco, f);
    },
    quadro(dt) {
      rt.conferir();
      paredeDJ(api, { mat: 1, tom: 0.34, ox: 2.1 });
      abre += (alvo - abre) * (1 - Math.exp(-dt * 6));
      tranco *= Math.exp(-dt * 10);
      const fita = 0.3 + 1.15 * Math.max(R.grave, R.bumbo);
      for (const b of baias) {
        const atraso = (VAOS - 1 - b.i) / (VAOS - 1) * ATRASO;
        const f = Math.max(0, Math.min(1, abre * (1 + ATRASO) - atraso));
        const s = f * f * (3 - 2 * f);
        const treme = tranco * 0.0035 * Math.sin(R.fase * 40 + b.i);
        const queda = P[b.b] * 0.012;
        // a chapa de dentro empurra as de fora quando encosta nelas
        const b0 = FIM * s;
        const b1 = Math.max(LP, b0 + 0.028);
        const b2 = Math.max(LP * 2, b1 + 0.028);
        [b0, b1, b2].forEach((borda, k) => {
          const y = HT + 0.022 + k * CAMADA - queda;
          const opc = i => ({ tom: b.tons[i], mat: 1, ox: b.ox + i * 0.7 + borda * (i < 3 ? -1 : 1), oy: b.oy + k * 0.4 });
          caixa(XC - borda - LP / 2 + treme, y, b.z, LP / 2, 0.02, H / 2 - 0.006, opc(k));
          caixa(XC + borda + LP / 2 - treme, y, b.z, LP / 2, 0.02, H / 2 - 0.006, opc(k + 3));
        });
        if (s > 0.004) {
          const f2 = fita * Math.min(1, s * 12);
          for (const lado of [-1, 1]) {
            const x = XC + lado * (b0 + 0.008 - treme * lado);
            caixa(x, HT + 0.03 - queda, b.z, 0.009, 0.005, H / 2 - 0.02, { tom: f2, mat: 3, oy: b.i });
            brilho(x, HT + 0.05, b.z, 0.13, H / 2 - 0.02, f2 * 0.62);
          }
        }
      }
      // estrutura fixa: travessas em dois níveis, que riscam a perspectiva até a parede quando o céu aparece
      for (let i = 0; i <= VAOS; i++) {
        const z = -5.02 + i * H;
        caixa(XC, HT + 0.31, z, 3.4, 0.09, 0.03, { tom: 0.8, mat: 1, ox: i * 0.33 });
      }
      for (const x of [-1, 1]) caixa(XC + x * 0.88, HT + 0.52, -0.3, 0.035, 0.09, 12, { tom: 0.86, mat: 1, ox: x });
      for (let i = -3; i <= 9; i++) caixa(XC, HT + 1.5, -5.02 + i * H * 2, 5, 0.1, 0.05, { tom: 0.55, mat: 1, ox: i * 0.2 });
    },
  };
}

// ---------- CAIXOTÕES: laje nervurada profunda. O som anda em poços, da parede para a entrada, e o bumbo traz as tampas para fora do teto. ----------
function caixotoes(api) {
  const { caixa, brilho, P, NB, R, HT, ZF, XC } = api;
  const GX = 0.915, GZ = 1.13, NERV = 0.075, FUNDO = 1.5;
  const celulas = [];
  for (let iz = -9; iz <= 8; iz++) {
    for (let ix = -3; ix <= 3; ix++) {
      celulas.push({
        ix, iz, x: XC + ix * GX, z: 0.23 + iz * GZ, pop: 0, abre: 0, alvo: 0,
        b: Math.min(NB - 1, Math.floor(Math.abs(ix) * 1.4 + Math.max(0, (ZF - (0.23 + iz * GZ))) * 1.65)),
        ox: sorte(3), oy: sorte(3), tom: sorte(0.84, 1.08), sorte: Math.random(),
      });
    }
  }
  const ondas = [];
  let frase = -1;
  const padrao = n => {
    // por frase musical, um desenho de óculos abertos para o céu
    const t = n % 4;
    for (const c of celulas) {
      c.alvo = t === 1 ? (c.ix === 0 && c.iz > -7 ? 1 : 0)
        : t === 2 ? ((c.ix + c.iz) % 2 === 0 && Math.abs(c.ix) <= 1 ? 1 : 0)
          : t === 3 ? (c.sorte < 0.2 ? 1 : 0) : 0;
    }
  };
  return {
    velocidade: 0, lavar: 0.42, lavarSom: 0.42, estrelasTeto: 2600, estrelasParede: 0,
    ceuLuz: () => 1,
    estado: () => ({ frase, ondas: ondas.length }),
    batida() {
      const n = Math.floor(R.fase / 32);
      if (n !== frase) { frase = n; padrao(n); }
    },
    golpe(f) { if (ondas.length < 6) ondas.push({ z: ZF + 0.8, f }); },
    quadro(dt) {
      paredeDJ(api, { a: 0, tom: 0.92 });
      for (let i = ondas.length - 1; i >= 0; i--) { ondas[i].z -= dt * 12.5; if (ondas[i].z < -11) ondas.splice(i, 1); }
      for (const c of celulas) {
        for (const o of ondas) {
          const d = Math.abs(o.z - c.z);
          if (d < 0.5) c.pop = Math.max(c.pop, o.f * (1 - d / 0.5) * (1 - Math.min(0.55, Math.abs(c.ix) * 0.14)));
        }
        c.pop *= Math.exp(-dt * 6.2);
        c.abre += (c.alvo - c.abre) * (1 - Math.exp(-dt * (c.alvo > c.abre ? 0.9 : 3.5)));
        const som = P[c.b];
        const yBase = HT + FUNDO * (0.72 - 0.42 * som);
        const yTampa = yBase - c.pop * (yBase - HT + 0.36) + c.abre * c.abre * 22;
        const luzFita = (0.1 + som * 0.85 + c.pop * 1.15) * Math.exp(-c.abre * 3.5);
        const meioX = GX / 2, meioZ = GZ / 2;
        const py = HT + FUNDO / 2;
        // os quatro lados do poço: cada um sabe a que altura está a tampa, então a luz cai certa
        const op = { mat: 5, tom: c.tom, ox: c.ox, oy: c.oy, a: yTampa, b: luzFita };
        caixa(c.x - meioX + NERV / 2, py, c.z, NERV / 2, FUNDO / 2, meioZ - 0.002, op);
        caixa(c.x + meioX - NERV / 2, py, c.z, NERV / 2, FUNDO / 2, meioZ - 0.002, op);
        caixa(c.x, py, c.z - meioZ + NERV / 2, meioX - NERV + 0.0005, FUNDO / 2, NERV / 2, op);
        caixa(c.x, py, c.z + meioZ - NERV / 2, meioX - NERV + 0.0005, FUNDO / 2, NERV / 2, op);
        if (c.abre < 0.98) {
          const folga = c.pop > 0.03 ? 0.016 : 0.004;
          caixa(c.x, yTampa + 0.075, c.z, meioX - NERV - folga, 0.075, meioZ - NERV - folga, { mat: 6, tom: c.tom * Math.exp(-c.abre * 2.5), ox: c.ox, oy: c.oy + 1, b: luzFita });
          if (c.pop > 0.1 && yTampa < HT) brilho(c.x, HT + 0.001, c.z, meioX * 1.45, meioZ * 1.45, c.pop * 0.13);
        }
      }
    },
  };
}

// ---------- PÓRTICOS: voo por uma nave de pórticos de inox, com a fita de cada um numa faixa do som ----------
function porticos(api) {
  const { caixa, brilho, P, NB, R, HT, ZF, XC } = api;
  const ESPACO = 3.3, PX = 2.35, PY = 3.2, PERTO = -20, LONGE = 62;
  let golpeV = 0;
  const onda = [];
  return {
    velocidade: 2.05, lavar: 0, lavarSom: 0, estrelasTeto: 2400, estrelasParede: 900,
    ceuLuz: () => 1,
    estado: () => ({ golpe: +golpeV.toFixed(2) }),
    batida() {},
    golpe(f) { golpeV = Math.max(golpeV, f); onda.push({ z: LONGE, f }); if (onda.length > 5) onda.shift(); },
    quadro(dt, voo) {
      golpeV *= Math.exp(-dt * 6);
      for (let i = onda.length - 1; i >= 0; i--) { onda[i].z -= dt * 60; if (onda[i].z < PERTO) onda.splice(i, 1); }
      const prim = Math.floor((voo + PERTO) / ESPACO), ulti = Math.floor((voo + LONGE) / ESPACO);
      for (let n = prim; n <= ulti; n++) {
        const z = n * ESPACO - voo;
        const banda = ((n % NB) + NB) % NB;
        const longe = Math.exp(-Math.max(z, 0) / 26);
        let passa = 0;
        for (const o of onda) { const d = Math.abs(o.z - z); if (d < 5) passa = Math.max(passa, o.f * (1 - d / 5)); }
        const tom = (0.7 + 1.15 * longe) * (0.9 + 0.8 * passa);
        const ox = ((n * 0.73) % 3 + 3) % 3;
        const op = { tom, mat: n % 3 === 0 ? 2 : 1, ox, oy: ox * 0.7 };
        caixa(XC, PY + 0.22, z, PX + 0.26, 0.22, 0.24, op);
        caixa(XC - PX, PY - 3, z, 0.26, 3, 0.24, op);
        caixa(XC + PX, PY - 3, z, 0.26, 3, 0.24, op);
        // fita embaixo da viga
        const fita = (0.2 + 1.05 * P[banda] * P[banda] + passa * 1.1) * (0.25 + 0.75 * longe);
        const fino = 0.012 + Math.max(z, 0) * 0.0011;
        caixa(XC, PY - fino, z, PX - 0.26, fino, 0.03, { tom: fita, mat: 3, oy: n });
        brilho(XC, PY - 0.03, z, PX - 0.26, 0.42, fita * 0.66);
        for (const lado of [-1, 1]) caixa(XC + lado * (PX - 0.27), PY - 3, z, fino, 3, 0.03, { tom: fita * 0.8, mat: 3, oy: n });
      }
      // longarinas: linhas retas até o ponto de fuga, que ligam o teto à parede
      for (const x of [-1.76, -0.58, 0.58, 1.76]) {
        caixa(XC + x, PY + 0.62, 20, 0.035, 0.05, 45, { tom: 0.78, mat: 1, ox: x, oy: voo * 0.1 });
      }
    },
  };
}
