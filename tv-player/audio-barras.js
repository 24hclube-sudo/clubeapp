// Áudio ao vivo para as barras do 5º, lado do servidor.
// Recebe do ouvido-barras.js os níveis por faixa, aplica o ganho de cada faixa e entrega ao motor das
// fitas (balcao.js). Também serve a monitoração: public/audio-barras.html.
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const reacoes = require('./reacoes');

const CONFIG = path.join(__dirname, 'audio-barras.json');
const PORTA = Number(process.env.AUDIO_PORTA) || 6470;
const FAIXA_DA_BANDA = [0, 0, 1, 1, 2, 2, 3, 3];
const clamp01 = v => Math.max(0, Math.min(1, v));
const HIST = 128;          // quadros de história: 128 × 25 ms ≈ 3 s
const GOLPES_MAX = 16;     // golpes recentes guardados por faixa

// O que o motor lê quando não há som. "ocioso" faz as cenas respirarem baixinho em vez de ficar preto.
const vazio = () => ({
  presente: false, ocioso: true, t: 0, f: [0, 0, 0, 0], b: new Array(8).fill(0),
  picoF: [0, 0, 0, 0], picoB: new Array(8).fill(0), idade: [9, 9, 9, 9], ondas: [], n: [0, 0, 0, 0],
  golpes: [[], [], [], []], histF: () => 0, histB: () => 0,
  lento: 0, bpm: 0, fase: 0, conf: 0, fundo: 0.5,
});

function criarAudio() {
  let ganhos = [1, 1, 1, 1], fundo = 0.5;
  try {
    const salvo = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (Array.isArray(salvo.ganhos) && salvo.ganhos.length === 4) ganhos = salvo.ganhos.map(Number);
    if (Number.isFinite(salvo.fundo)) fundo = salvo.fundo;
  } catch {}
  const salvar = () => fs.writeFile(CONFIG, JSON.stringify({ ganhos, fundo }, null, 2), () => {});

  let ultimo = null, recebidoEm = 0, remetente = null, quietoDesde = 0;
  const contagem = [0, 0, 0, 0], golpeEm = [0, 0, 0, 0], totais = [0, 0, 0, 0];
  const listas = [[], [], [], []];
  let ondas = [];
  const au = vazio();
  au.fundo = fundo;
  let lerEm = 0;

  // História de cada faixa e banda, um valor por quadro do motor.
  const histF = [0, 1, 2, 3].map(() => new Float32Array(HIST));
  const histB = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Float32Array(HIST));
  let iHist = 0;
  const lerHist = (fita, k) => fita[(iHist - 1 - Math.max(0, Math.min(HIST - 1, k | 0)) + HIST * 2) % HIST];
  au.histF = (q, k) => lerHist(histF[q], k);
  au.histB = (b, k) => lerHist(histB[b], k);

  const sock = dgram.createSocket('udp4');
  sock.on('error', e => console.log('áudio das barras:', e.message));
  sock.on('message', (d, r) => {
    try { ultimo = JSON.parse(d); } catch { return; }
    remetente = r;
    const agora = Date.now();
    recebidoEm = agora;
    // Os golpes vêm como contadores: nenhum se perde mesmo se o motor estiver entre dois quadros.
    ultimo.g.forEach((n, i) => {
      if (n !== contagem[i]) {
        contagem[i] = n;
        if (ganhos[i] > 0 && !(ultimo.db < reacoes.som().piso) && reacoes.som().forca > 0) {
          golpeEm[i] = agora; totais[i]++;
          listas[i].push({ i: totais[i], t: agora });
          if (listas[i].length > GOLPES_MAX) listas[i].shift();
          if (i === reacoes.mapaBarras()[0]) { ondas.push(agora); if (ondas.length > 6) ondas.shift(); }
        }
      }
    });
  });
  sock.bind(PORTA, '127.0.0.1', () => console.log('Áudio das barras: ouvindo em 127.0.0.1:' + PORTA));

  // Chamado uma vez por quadro do motor.
  function ler(agora) {
    const dt = Math.min(0.2, (agora - lerEm) / 1000 || 0);
    lerEm = agora;
    au.t = agora / 1000;
    au.presente = !!ultimo && agora - recebidoEm < 1500;
    if (!au.presente) {
      au.ocioso = true;
      au.f.fill(0); au.b.fill(0); au.picoF.fill(0); au.picoB.fill(0); au.lento = 0;
      au.golpes = [[], [], [], []]; au.ondas = [];
      gravarHist();
      return au;
    }
    const u = ultimo;
    let maior = 0;
    // O que a cena chama de bumbo, baixo, médio e agudo vem da faixa escolhida no app (reacoes.html). -1: desligada.
    const mapa = reacoes.mapaBarras();
    // o piso e a força do app, para compensar o que vem da mesa
    const S = reacoes.som(), kSom = u.db < S.piso ? 0 : S.forca / 100;
    for (let i = 0; i < 4; i++) {
      const q = mapa[i];
      au.f[i] = q < 0 ? 0 : clamp01(u.f[q] * ganhos[q] * kSom);
      au.picoF[i] = Math.max(au.f[i], au.picoF[i] - dt * 0.9);
      au.idade[i] = q >= 0 && golpeEm[q] ? (agora - golpeEm[q]) / 1000 : 9;
      if (q >= 0) au.n[i] = totais[q];
      maior = Math.max(maior, au.f[i]);
      au.golpes[i] = q < 0 ? [] : listas[q].filter(g => agora - g.t < 3000).map(g => ({ i: g.i, a: (agora - g.t) / 1000 }));
    }
    for (let i = 0; i < 8; i++) {
      const q = mapa[FAIXA_DA_BANDA[i]];
      au.b[i] = q < 0 ? 0 : clamp01(u.b[q * 2 + (i % 2)] * ganhos[q] * kSom);
      au.picoB[i] = Math.max(au.b[i], au.picoB[i] - dt * 0.9);
    }
    gravarHist();
    ondas = ondas.filter(t => agora - t < 1500);
    au.ondas = ondas.map(t => (agora - t) / 1000);
    const media = (au.f[0] + au.f[1] + au.f[2] + au.f[3]) / 4;
    au.lento += (media - au.lento) * Math.min(1, dt / 1.5);
    au.bpm = u.bpm; au.fase = u.fase; au.conf = u.conf;
    // Silêncio de verdade por 3 s: entra em espera.
    if (maior > 0.03 && u.db > -55) quietoDesde = agora;
    au.ocioso = agora - quietoDesde > 3000;
    return au;
  }
  function gravarHist() {
    for (let i = 0; i < 4; i++) histF[i][iHist] = au.f[i];
    for (let i = 0; i < 8; i++) histB[i][iHist] = au.b[i];
    iHist = (iHist + 1) % HIST;
  }

  function estado() {
    const agora = Date.now();
    const vivo = !!ultimo && agora - recebidoEm < 1500;
    return {
      vivo, ganhos, fundo, faixas: vivo ? au.f : [0, 0, 0, 0], picos: vivo ? au.picoF : [0, 0, 0, 0],
      bandas: vivo ? au.b : new Array(8).fill(0), golpes: au.n, idade: au.idade,
      bpm: vivo ? ultimo.bpm : 0, conf: vivo ? ultimo.conf : 0, db: vivo ? ultimo.db : null,
      clip: vivo ? ultimo.clip : 0, entrada: ultimo ? ultimo.entrada : null, ocioso: au.ocioso,
    };
  }

  // Rotas da monitoração. O fluxo só existe enquanto alguém está olhando a página.
  function atender(req, res, p, sendJson) {
    if (p === '/api/audio-barras' && req.method === 'GET') { sendJson(res, 200, estado()); return true; }
    if (p === '/api/audio-barras/fluxo' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      const timer = setInterval(() => res.write('data: ' + JSON.stringify(estado()) + '\n\n'), 40);
      req.on('close', () => clearInterval(timer));
      return true;
    }
    if (p === '/api/audio-barras' && req.method === 'POST') {
      let corpo = '';
      req.on('data', d => { corpo += d; if (corpo.length > 2000) req.destroy(); });
      req.on('end', () => {
        let m = {};
        try { m = JSON.parse(corpo); } catch { return sendJson(res, 400, { erro: 'JSON inválido' }); }
        if (Array.isArray(m.ganhos) && m.ganhos.length === 4) {
          ganhos = m.ganhos.map(v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 1; });
          salvar();
        }
        if (m.fundo != null && Number.isFinite(Number(m.fundo))) {
          fundo = Math.max(0.1, Math.min(0.85, Number(m.fundo)));
          au.fundo = fundo;
          salvar();
        }
        if ((m.entrada === 'mic' || m.entrada === 'mix') && remetente) {
          sock.send(JSON.stringify({ entrada: m.entrada }), remetente.port, remetente.address);
        }
        sendJson(res, 200, estado());
      });
      return true;
    }
    return false;
  }

  return { ler, estado, atender };
}

// Som de mentira, 124 BPM, só para gerar as miniaturas das cenas (gerar-previas-fitas.js).
function simular(t) {
  const seg = 60 / 124;
  const onda = (v, k) => 0.5 + 0.5 * Math.sin(v * k);
  const niveis = tt => {
    const bat = Math.max(0, tt) * 124 / 60, n = Math.floor(bat), bf = bat - n, meio = (bf + 0.5) % 1;
    const f = [Math.exp(-bf * 6), 0.85 * Math.exp(-meio * 4), 0.25 + 0.5 * onda(tt, 2.1) * onda(tt, 7.3), 0.9 * Math.exp(-meio * 9)];
    return { n, bf, meio, f, b: [f[0], f[0] * 0.7, f[1], f[1] * 0.7, f[2], f[2] * 0.8, f[3] * 0.8, f[3]] };
  };
  const { n, bf, meio, f, b } = niveis(t);
  const au = vazio();
  au.presente = true; au.ocioso = false; au.t = t;
  au.f = f; au.b = b;
  au.picoF = f.map((v, i) => Math.min(1, v + 0.12 * (i + 1) / 4));
  au.picoB = b.map(v => Math.min(1, v + 0.1));
  au.idade = [bf * seg, meio * seg, bf * seg * 0.5, meio * seg];
  au.n = [n, n, n * 2, n];
  const antes = (base, passo, id) => [0, 1, 2, 3, 4, 5].map(k => ({ i: id - k, a: base + k * passo })).filter(g => g.i >= 0);
  au.golpes = [antes(bf * seg, seg, n), antes(meio * seg, seg, n), antes(frac2(bf * 2) * seg / 2, seg / 2, n * 2), antes(meio * seg, seg, n)];
  au.ondas = au.golpes[0].slice(0, 3).map(g => g.a);
  au.histF = (q, k) => niveis(t - k * 0.025).f[q];
  au.histB = (i, k) => niveis(t - k * 0.025).b[i];
  au.lento = 0.45 + 0.35 * onda(t, 0.9);
  au.bpm = 124; au.fase = t * 124 / 60; au.conf = 1;
  return au;
}
function frac2(v) { return v - Math.floor(v); }

module.exports = { criarAudio, simular, vazio };
