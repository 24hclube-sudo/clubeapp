// Duas cenas em que o próprio teto abre e fecha deslizando nos dois eixos: de lado (x) e no comprimento do painel (z). Sempre simétricas.
// O tempo vem da batida: cada passo do filme cai num tempo da música, e o peso vem da mola, que sai devagar e assenta sem repique.
// Cada eixo corre numa altura própria, então uma placa nunca atravessa a outra.
const sorte = (a, b) => a + Math.random() * (b - a);

// Mola com amortecimento crítico: nem sobra nem repique. É o que faz a chapa parecer pesada.
class Servo {
  constructor(x = 0, w = 4.2) { this.x = x; this.v = 0; this.alvo = x; this.w = w; this.bateu = 0; }
  passo(dt) {
    const h = Math.min(dt, 1 / 30) / 2, w = this.w;
    const veio = Math.abs(this.v);
    for (let i = 0; i < 2; i++) { this.v += (w * w * (this.alvo - this.x) - 2 * w * this.v) * h; this.x += this.v * h; }
    // chegou: a pancada que treme a chapa
    if (veio > 0.06 && Math.abs(this.v) <= 0.06) this.bateu = 1;
    this.bateu *= Math.exp(-dt * 9);
    return this.x;
  }
}

// O filme: lista de passos { tempo, fn }. Fechando, o mesmo filme de trás para a frente.
function filme(PASSOS, PARADO, aplicar, { fechado = 8, aberto = 56 } = {}) {
  const fim = PASSOS.length;
  let i = PARADO === 'aberto' ? fim : 0, conta = 0, estado = PARADO === 'aberto' ? 'aberto' : 'fechado';
  aplicar(i);
  return {
    get estado() { return estado; },
    get passo() { return i; },
    fixar(e) { PARADO = e; estado = e; i = e === 'aberto' ? fim : 0; conta = 0; aplicar(i); },
    batida() {
      if (PARADO) return;
      conta++;
      if (estado === 'fechado' && conta >= fechado) { estado = 'abrindo'; conta = 0; }
      else if (estado === 'aberto' && conta >= aberto) { estado = 'fechando'; conta = 0; }
      else if (estado === 'abrindo' && conta >= PASSOS[i]) {
        i++; conta = 0; aplicar(i);
        if (i >= fim) estado = 'aberto';
      } else if (estado === 'fechando' && conta >= PASSOS[Math.max(i - 1, 0)]) {
        i--; conta = 0; aplicar(i);
        if (i <= 0) estado = 'fechado';
      }
    },
  };
}

function paredeDJ(api, opcoes) {
  api.caixa(api.XC, api.HT - 0.9, api.ZF + 0.2, 2.4, 0.9, 0.2, { mat: 4, ox: 0.4, oy: 1.1, ...opcoes });
}

// ---------- COMPORTAS: quatro comportas, em duas alturas: duas de cimento correm de lado e duas de inox correm no comprimento. ----------
// O buraco é o cruzamento das duas: um retângulo de céu que cresce, um eixo de cada vez.
export function comportas(api) {
  const { caixa, brilho, P, R, HT, ZF, XC, PARADO } = api;
  const ZC = (ZF - 5.02) / 2;
  const LX = 0.74, LZ = 3.4, ESP_X = 0.1, ESP_Z = 0.03;
  // [abertura de lado, abertura no comprimento], passo a passo: alterna os eixos
  const QUADROS = [[0, 0], [0.1, 0], [0.1, 0.42], [0.27, 0.42], [0.27, 1.2], [0.48, 1.2], [0.48, 2.3], [0.76, 2.3], [0.76, 3.8], [2.1, 3.8], [2.1, 9.2]];
  const ab = new Servo(0), bb = new Servo(0);
  const tons = Array.from({ length: 12 }, () => sorte(0.84, 1.06));
  const oxs = Array.from({ length: 12 }, () => sorte(0, 3));
  const oys = Array.from({ length: 12 }, () => sorte(0, 3));
  const rt = filme(QUADROS.slice(1).map((_, k) => (k === 8 || k === 9 ? 8 : 4)), PARADO, i => { ab.alvo = QUADROS[i][0]; bb.alvo = QUADROS[i][1]; }, { aberto: 48 });
  if (PARADO === 'aberto') { ab.x = ab.alvo; bb.x = bb.alvo; }
  let tranco = 0;
  return {
    velocidade: 0, lavar: 0.72, lavarSom: 0.45, estrelasTeto: 3800, estrelasParede: 0,
    ceuLuz: () => 1,
    estado: () => ({ estado: rt.estado, passo: rt.passo, a: +ab.x.toFixed(2), b: +bb.x.toFixed(2) }),
    abrirJa() { rt.fixar('aberto'); ab.x = ab.alvo; bb.x = bb.alvo; },
    batida: () => rt.batida(),
    golpe(f) { tranco = Math.max(tranco, f); },
    quadro(dt) {
      paredeDJ(api, { a: 0, tom: 0.92 });
      const a = ab.passo(dt), b = bb.passo(dt);
      tranco *= Math.exp(-dt * 10);
      const treme = (ab.bateu + bb.bateu) * 0.006 * Math.sin(R.fase * 50) + tranco * 0.0025;
      const fita = 0.3 + 1.2 * Math.max(R.grave, R.bumbo);
      // comportas de lado, de cimento: cada folha empurra a de fora quando encosta nela
      const yX = HT + 0.015 + ESP_X;
      const compr = (ZF + 5.02) / 2 + 0.02;
      const e0 = a, e1 = Math.max(LX, e0 + 0.03), e2 = Math.max(LX * 2, e1 + 0.03);
      [e0, e1, e2].forEach((e, k) => {
        const y = yX + k * 0.012 - P[3 + k] * 0.006;
        for (const lado of [-1, 1]) {
          const q = lado < 0 ? k : k + 3;
          caixa(XC + lado * (e + LX / 2 - treme), y, ZC, LX / 2, ESP_X, compr, { tom: tons[q], ox: oxs[q], oy: oys[q], a: 1 });
        }
      });
      // comportas no comprimento, de inox, mais acima: cruzam com as de cima
      const yZ = HT + 0.42;
      const z0 = b, z1 = Math.max(LZ, z0 + 0.06);
      [z0, z1].forEach((e, k) => {
        const y = yZ + k * 0.05 - P[8 + k] * 0.008;
        for (const lado of [-1, 1]) {
          const q = 6 + (lado < 0 ? k : k + 2);
          caixa(XC, y, ZC + lado * (e + LZ / 2 - treme), 2.6, ESP_Z, LZ / 2, { tom: tons[q] * 0.82, mat: 1, ox: oxs[q], oy: oys[q] });
        }
      });
      // a fita de luz na boca de cada comporta: só aparece depois que ela solta
      if (a > 0.004) {
        const f2 = fita * Math.min(1, a * 14);
        for (const lado of [-1, 1]) {
          const x = XC + lado * (e0 - 0.006);
          caixa(x, HT + 0.014, ZC, 0.007, 0.004, compr, { tom: f2, mat: 3, oy: lado });
          brilho(x, HT + 0.03, ZC, 0.11, compr, f2 * 0.55);
        }
      }
      if (b > 0.004) {
        const f2 = fita * Math.min(1, b * 6);
        const meia = Math.min(2.6, a + 0.04);
        for (const lado of [-1, 1]) {
          const z = ZC + lado * (z0 - 0.012);
          caixa(XC, yZ - ESP_Z - 0.006, z, meia, 0.004, 0.012, { tom: f2, mat: 3, ox: lado });
          brilho(XC, yZ - ESP_Z - 0.02, z, meia, 0.16, f2 * 0.42);
        }
      }
      // estrutura fixa lá em cima, que risca a perspectiva quando o céu aparece
      for (let i = -2; i <= 2; i++) caixa(XC, HT + 1.45, ZC + i * 3.45, 3.4, 0.05, 0.04, { tom: 0.3, mat: 1, ox: i * 0.2 });
    },
  };
}

// ---------- TRAMA: duas grades cruzadas. As faixas de cimento correm de lado e as réguas de inox correm no comprimento, abrindo janelas em xadrez. ----------
// No meio do filme o céu aparece em quadrados, tudo em simetria. Depois as outras soltam e o céu abre inteiro.
export function trama(api) {
  const { caixa, brilho, P, R, HT, ZF, XC, PARADO } = api;
  const FILAS = 8, COLS = 5, ZC = (ZF - 5.02) / 2;
  const H = (ZF + 5.02) / FILAS, LC = 0.5, ESP = 0.085;
  const faixas = [];
  for (let f = 0; f < FILAS; f++) {
    for (const lado of [-1, 1]) {
      faixas.push({ f, lado, z: -5.02 + (f + 0.5) * H, s: new Servo(0, 3.6 + (f % 2) * 0.5), tom: sorte(0.84, 1.06), ox: sorte(0, 3), oy: sorte(0, 3), par: Math.min(f, FILAS - 1 - f) });
    }
  }
  const reguas = [];
  for (let c = 0; c < COLS; c++) {
    for (const lado of [-1, 1]) {
      reguas.push({ c, lado, x: XC + (c - (COLS - 1) / 2) * LC, s: new Servo(0, 3.2), tom: sorte(0.8, 1), ox: sorte(0, 3), oy: sorte(0, 3), par: Math.abs(c - (COLS - 1) / 2) });
    }
  }
  // Os passos: cada um solta um par de faixas ou de réguas, sempre espelhados. Só as alternadas, primeiro: é aí que aparece o xadrez.
  const PASSOS = [
    { faixas: 3 }, { faixas: 1 }, { reguas: 0 }, { reguas: 2 },
    { pausa: true },
    { faixas: 2 }, { faixas: 0 }, { reguas: 1 },
  ];
  const aplicar = i => {
    for (const p of faixas) p.s.alvo = 0;
    for (const p of reguas) p.s.alvo = 0;
    for (let k = 0; k < i; k++) {
      const q = PASSOS[k];
      if (q.faixas !== undefined) for (const p of faixas) if (p.par === q.faixas) p.s.alvo = 2.3;
      if (q.reguas !== undefined) for (const p of reguas) if (p.par === q.reguas) p.s.alvo = 10;
    }
  };
  const rt = filme(PASSOS.map(q => (q.pausa ? 24 : 4)), PARADO, aplicar, { aberto: 48 });
  if (PARADO === 'aberto') { for (const p of [...faixas, ...reguas]) p.s.x = p.s.alvo; }
  let tranco = 0;
  return {
    velocidade: 0, lavar: 0.72, lavarSom: 0.45, estrelasTeto: 3800, estrelasParede: 0,
    ceuLuz: () => 1,
    estado: () => ({ estado: rt.estado, passo: rt.passo, f: +faixas[6].s.x.toFixed(2), r: +reguas[4].s.x.toFixed(2) }),
    abrirJa() { rt.fixar('aberto'); for (const p of [...faixas, ...reguas]) p.s.x = p.s.alvo; },
    batida: () => rt.batida(),
    golpe(f) { tranco = Math.max(tranco, f); },
    quadro(dt) {
      paredeDJ(api, { a: 0, tom: 0.92 });
      tranco *= Math.exp(-dt * 10);
      const fita = 0.3 + 1.2 * Math.max(R.grave, R.bumbo);
      const larg = 1.06;
      for (const p of faixas) {
        const a = p.s.passo(dt);
        const y = HT + 0.012 + ESP - p.s.bateu * 0.012 - (a < 0.01 ? P[(p.f * 3) % 24] * 0.012 : 0);
        caixa(XC + p.lado * (larg / 2 + a), y, p.z, larg / 2 - 0.003, ESP, H / 2 - 0.0045, { tom: p.tom * (1 + tranco * 0.05), ox: p.ox, oy: p.oy, a: 1 });
        if (a > 0.004 && a < 2.2) {
          const f2 = fita * Math.min(1, a * 14);
          const x = XC + p.lado * (a - 0.005);
          caixa(x, HT + 0.012, p.z, 0.006, 0.004, H / 2 - 0.012, { tom: f2, mat: 3, oy: p.f });
          brilho(x, HT + 0.025, p.z, 0.08, H / 2 - 0.012, f2 * 0.5);
        }
      }
      const compr = (ZF + 5.02) / 2 + 0.2;
      for (const p of reguas) {
        const a = p.s.passo(dt);
        const y = HT + 0.44 - p.s.bateu * 0.012;
        caixa(p.x, y, ZC + p.lado * (compr / 2 + a), LC / 2 - 0.004, 0.022, compr / 2, { tom: p.tom * 0.86, mat: 1, ox: p.ox, oy: p.oy });
        if (a > 0.01 && a < 9.5) {
          const f2 = fita * Math.min(1, a * 5) * 0.9;
          const z = ZC + p.lado * (a - 0.012);
          caixa(p.x, y - 0.028, z, LC / 2 - 0.02, 0.004, 0.012, { tom: f2, mat: 3, ox: p.c });
          brilho(p.x, y - 0.04, z, LC / 2 - 0.02, 0.14, f2 * 0.42);
        }
      }
      for (let i = -2; i <= 2; i++) caixa(XC, HT + 1.45, ZC + i * 3.45, 3.4, 0.05, 0.04, { tom: 0.3, mat: 1, ox: i * 0.2 });
    },
  };
}
