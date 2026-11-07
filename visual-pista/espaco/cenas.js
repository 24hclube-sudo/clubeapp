// As quatro cenas do Espaço. Cada uma diz onde ficam as caixas neste quadro, em metros, com o olho na origem:
// x para a direita, y para cima, z para a parede do DJ. O teto do LED fica em y = HT e a parede em z = ZF.
//
// A arquitetura não dança: placas, chapas e tampas andam sozinhas, devagar, no próprio tempo, porque são pesadas.
// Quem reage ao som são as estrelas (espaco.js), que acendem com o grave, e o logo da parede.
export const MODOS = ['concreto', 'teto', 'caixotoes', 'porticos'];
const sorte = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const suave = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export function criarCena(modo, api) {
  return { concreto, teto: tetoInox, caixotoes, porticos }[modo](api);
}

// ---------- CONCRETO: as placas se soltam uma a uma e sobem para o céu. Depois de um tempo aberto, voltam devagar. ----------
function concreto(api) {
  const { caixa, quat, HT, ZF, XC, PARADO } = api;
  const COLS = 3, LARGP = 0.82, FILAS = 7, COMP = (ZF + 5.02) / FILAS, ESP = 0.12;
  const placas = [];
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLS; c++) {
      const cx = XC + (c - (COLS - 1) / 2) * LARGP, cz = -5.02 + (f + 0.5) * COMP;
      placas.push({
        f, c, cx, cz, ox: sorte(3), oy: sorte(3), tom: sorte(0.92, 1.04), a: 0, alvo: 0,
        rx: sorte(-1.5, 1.5), rz: sorte(-1.2, 1.2), sx: (cx - XC) * sorte(1.2, 2.6), sz: cz * sorte(0.45, 0.9),
        ordem: Math.hypot((cx - XC) * 1.7, cz - 2.2) + sorte(-0.5, 0.5),
      });
    }
  }
  const soltas = placas.filter(p => p.f > 0 && p.f < FILAS - 1).sort((a, b) => a.ordem - b.ordem);
  let prox = 0, estado = PARADO === 'aberto' ? 'aberto' : 'fechado', t = 0;
  if (PARADO === 'aberto') { for (const p of soltas) p.a = p.alvo = 1; prox = soltas.length; }
  return {
    lavar: 0.72, estrelasTeto: 3400, estrelasParede: 1100,
    estado: () => ({ estado, aberto: +(prox / soltas.length).toFixed(2) }),
    quadro(dt) {
      t += dt;
      if (!PARADO) {
        if (estado === 'fechado' && t > 6) { estado = 'abrindo'; t = 0; }
        else if (estado === 'abrindo') {
          if (t > 1.5 && prox < soltas.length) { soltas[prox++].alvo = 1; t = 0; }
          if (prox >= soltas.length && soltas.every(p => p.a > 0.99)) { estado = 'aberto'; t = 0; }
        } else if (estado === 'aberto' && t > 50) { estado = 'fechando'; t = 0; }
        else if (estado === 'fechando') {
          if (t > 1.1 && prox > 0) { soltas[--prox].alvo = 0; t = 0; }
          if (prox <= 0 && soltas.every(p => p.a < 0.001)) { estado = 'fechado'; t = 0; }
        }
      }
      for (const p of placas) {
        p.a = p.alvo > p.a ? Math.min(p.alvo, p.a + dt * 0.1) : Math.max(p.alvo, p.a - dt * 0.17);
        if (p.a > 0.995) continue;
        const a = p.a, s = a * a * a;
        // antes de subir a placa desce um palmo, bem devagar: é o que mostra o peso
        const desce = Math.sin(Math.min(a / 0.16, 1) * Math.PI) * 0.15;
        const y = HT + ESP + s * 26 - desce;
        caixa(p.cx + p.sx * s * 3, y, p.cz + p.sz * s * 3, LARGP / 2 - 0.0045, ESP, COMP / 2 - 0.0045, { tom: p.tom * Math.exp(-s * 4.2), q: quat(p.rx * s * 1.5, p.rz * s * 1.5), ox: p.ox, oy: p.oy, a: 1 });
      }
    },
  };
}

// ---------- TETO DE INOX: as chapas abrem ao meio, em camadas, num movimento contínuo do vão da parede para a entrada ----------
function tetoInox(api) {
  const { caixa, brilho, HT, ZF, XC, PARADO } = api;
  const VAOS = 8, H = (ZF + 5.02) / VAOS, LP = 0.34, FIM = 0.7, CAMADA = 0.052, ATRASO = 0.42;
  const baias = Array.from({ length: VAOS }, (_, i) => ({ i, z: -5.02 + (i + 0.5) * H, ox: sorte(3), oy: sorte(3), tons: Array.from({ length: 6 }, () => sorte(0.9, 1.04)) }));
  let estado = PARADO === 'aberto' ? 'aberto' : 'fechado', t = 0, abre = estado === 'aberto' ? 1 : 0;
  return {
    lavar: 0, estrelasTeto: 3400, estrelasParede: 1100,
    estado: () => ({ estado, aberto: +abre.toFixed(2) }),
    quadro(dt) {
      t += dt;
      if (!PARADO) {
        if (estado === 'fechado' && t > 7) { estado = 'abrindo'; t = 0; }
        else if (estado === 'abrindo') { abre = suave(t / 24); if (t >= 24) { estado = 'aberto'; t = 0; } }
        else if (estado === 'aberto' && t > 50) { estado = 'fechando'; t = 0; }
        else if (estado === 'fechando') { abre = 1 - suave(t / 18); if (t >= 18) { estado = 'fechado'; t = 0; } }
      }
      for (const b of baias) {
        const f = Math.max(0, Math.min(1, abre * (1 + ATRASO) - (VAOS - 1 - b.i) / (VAOS - 1) * ATRASO));
        const s = f * f * (3 - 2 * f);
        const b0 = FIM * s;
        const b1 = Math.max(LP, b0 + 0.028);
        const b2 = Math.max(LP * 2, b1 + 0.028);
        [b0, b1, b2].forEach((borda, k) => {
          const y = HT + 0.022 + k * CAMADA;
          const opc = i => ({ tom: b.tons[i], mat: 1, ox: b.ox + i * 0.7 + borda * (i < 3 ? -1 : 1), oy: b.oy + k * 0.4 });
          caixa(XC - borda - LP / 2, y, b.z, LP / 2, 0.02, H / 2 - 0.006, opc(k));
          caixa(XC + borda + LP / 2, y, b.z, LP / 2, 0.02, H / 2 - 0.006, opc(k + 3));
        });
        if (s > 0.004) {
          const f2 = 0.55 * Math.min(1, s * 12);
          for (const lado of [-1, 1]) {
            const x = XC + lado * (b0 + 0.008);
            caixa(x, HT + 0.03, b.z, 0.012, 0.006, H / 2 - 0.02, { tom: f2, mat: 3 });
            brilho(x, HT + 0.05, b.z, 0.1, H / 2 - 0.02, f2 * 0.45);
          }
        }
      }
      for (let i = 0; i <= VAOS; i++) caixa(XC, HT + 0.31, -5.02 + i * H, 3.4, 0.09, 0.03, { tom: 0.85, mat: 1, ox: i * 0.33 });
      for (const x of [-1, 1]) caixa(XC + x * 0.88, HT + 0.52, -0.3, 0.035, 0.09, 16, { tom: 0.9, mat: 1, ox: x });
      for (let i = -5; i <= 9; i++) caixa(XC, HT + 1.5, -5.02 + i * H * 2, 5, 0.1, 0.05, { tom: 0.6, mat: 1, ox: i * 0.2 });
    },
  };
}

// ---------- CAIXOTÕES: laje nervurada monumental, com poços do tamanho do painel abertos para o céu. Tampas passam devagar, como uma sombra. ----------
function caixotoes(api) {
  const { caixa, HT, ZF, XC } = api;
  // Raso de propósito: do olho a 1,60 m, um poço fundo só mostra as próprias paredes e esconde o céu.
  const GX = 1.62, GZ = 1.95, NERV = 0.15, FUNDO = 0.32;
  const celulas = [];
  for (let iz = -9; iz <= 8; iz++) {
    for (let ix = -2; ix <= 2; ix++) {
      celulas.push({ ix, iz, x: XC + ix * GX, z: 0.23 + iz * GZ, ox: sorte(3), oy: sorte(3), tom: sorte(0.94, 1.04), fase: sorte(0, 0.6) });
    }
  }
  let t = 26;
  return {
    lavar: 0.62, estrelasTeto: 3400, estrelasParede: 1100,
    estado: () => ({ tempo: +t.toFixed(1) }),
    quadro(dt) {
      t += dt;
      const meioX = GX / 2, meioZ = GZ / 2, py = HT + FUNDO / 2;
      for (const c of celulas) {
        const op = { mat: 5, tom: c.tom, ox: c.ox, oy: c.oy };
        caixa(c.x - meioX + NERV / 2, py, c.z, NERV / 2, FUNDO / 2, meioZ - 0.002, op);
        caixa(c.x + meioX - NERV / 2, py, c.z, NERV / 2, FUNDO / 2, meioZ - 0.002, op);
        caixa(c.x, py, c.z - meioZ + NERV / 2, meioX - NERV + 0.0005, FUNDO / 2, NERV / 2, op);
        caixa(c.x, py, c.z + meioZ - NERV / 2, meioX - NERV + 0.0005, FUNDO / 2, NERV / 2, op);
        // uma faixa de tampas anda da parede para a entrada a cada 70 s; o resto do tempo o céu fica à mostra
        const u = ((t / 90 - c.z / 36 - c.fase * 0.05) % 1 + 1) % 1;
        const fecha = suave(u / 0.05) * (1 - suave((u - 0.1) / 0.05));
        if (fecha > 0.002) {
          const y = HT + FUNDO * 0.7 + (1 - fecha) * (1 - fecha) * 14;
          caixa(c.x, y + 0.08, c.z, meioX - NERV - 0.004, 0.08, meioZ - NERV - 0.004, { mat: 6, tom: c.tom * Math.pow(fecha, 1.5), ox: c.ox, oy: c.oy + 1 });
        }
      }
    },
  };
}

// ---------- PÓRTICOS: voo contínuo por pórticos de inox até o ponto de fuga, na velocidade da música, sem trancos ----------
function porticos(api) {
  const { caixa, brilho, M, HT, ZF, XC } = api;
  const ESPACO = 3.3, PX = 2.2, PY = 2.25, PB = 1.5, PERTO = -18, LONGE = 62;
  let voo = 0, vel = 2.2;
  return {
    lavar: 0, estrelasTeto: 2600, estrelasParede: 1100,
    voo: () => voo,
    estado: () => ({ voo: +voo.toFixed(1), vel: +vel.toFixed(2) }),
    quadro(dt) {
      // um pórtico a cada 4 tempos: devagar, e sem seguir o tremor do BPM
      vel += (ESPACO * M.bpm / 60 / 4 - vel) * (1 - Math.exp(-dt * 0.4));
      voo += dt * vel;
      const prim = Math.floor((voo + PERTO) / ESPACO), ulti = Math.floor((voo + LONGE) / ESPACO);
      for (let n = prim; n <= ulti; n++) {
        const z = n * ESPACO - voo;
        const longe = Math.exp(-Math.max(z, 0) / 26);
        // ao longe tudo some no preto: dá profundidade e deixa o letreiro legível sobre os pórticos
        const nevoa = Math.exp(-Math.max(z - 7, 0) / 11);
        const tom = (0.62 + 0.75 * longe) * nevoa;
        const ox = ((n * 0.73) % 3 + 3) % 3;
        const op = { tom, mat: n % 3 === 0 ? 2 : 1, ox, oy: ox * 0.7 };
        caixa(XC, PY + 0.22, z, PX + 0.26, 0.22, 0.24, op);
        caixa(XC, -PB - 0.22, z, PX + 0.26, 0.22, 0.24, op);
        caixa(XC - PX, (PY - PB) / 2, z, 0.26, (PY + PB) / 2, 0.24, op);
        caixa(XC + PX, (PY - PB) / 2, z, 0.26, (PY + PB) / 2, 0.24, op);
        const fita = 0.42 * (0.3 + 0.7 * longe) * (0.1 + 0.9 * nevoa);
        const fino = 0.014 + Math.max(z, 0) * 0.0012;
        caixa(XC, PY - fino, z, PX - 0.26, fino, 0.03, { tom: fita, mat: 3 });
        brilho(XC, PY - 0.03, z, PX - 0.26, 0.42, fita * 0.5);
        caixa(XC, -PB + fino, z, PX - 0.26, fino, 0.03, { tom: fita, mat: 3 });
        for (const lado of [-1, 1]) caixa(XC + lado * (PX - 0.27), (PY - PB) / 2, z, fino, (PY + PB) / 2, 0.03, { tom: fita * 0.8, mat: 3 });
      }
      for (const x of [-1.6, -0.54, 0.54, 1.6]) {
        caixa(XC + x, PY + 0.62, 20, 0.035, 0.05, 48, { tom: 0.8, mat: 1, ox: x });
        caixa(XC + x, -PB - 0.62, 20, 0.035, 0.05, 48, { tom: 0.55, mat: 1, ox: x });
      }
    },
  };
}
