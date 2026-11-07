// O que toca nas caixas deste PC: a transmissão da rádio ou o player, que toca os arquivos direto.
// Quem faz o som é a página caixa.html, aberta neste PC. O app manda os comandos para cá e ela recebe
// na hora por um canal aberto. A rádio segue no ar para os outros lugares em qualquer um dos modos.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARQ_ESTADO = path.join(__dirname, 'caixa-player.json');
const ARQ_INDICE = path.join(__dirname, 'caixa-indice.json');
const SCRIPT_INDICE = path.join(__dirname, 'caixa-indice.js');
const SEIS_HORAS = 6 * 3600 * 1000;
const ERROS_ATE_PARAR = 5;
const TIPOS_AUDIO = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };

let fontes = null;
let indice = {};
let canais = new Set();
let errosSeguidos = 0;
let avisarMudanca = () => {};
let e = { modo: 'radio', pausado: false, fila: [], indice: 0, posicao: 0, posicaoEm: 0, versao: 1 };

try {
  e = { ...e, ...JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8')) };
  e.posicaoEm = Date.now();
} catch { /* primeira vez */ }

// ---------- arquivos das músicas ----------

function lerIndice() {
  try { indice = JSON.parse(fs.readFileSync(ARQ_INDICE, 'utf8')).faixas || {}; } catch { /* ainda não existe */ }
}

function atualizarIndice() {
  const filho = spawn(process.execPath, [SCRIPT_INDICE, ARQ_INDICE], { stdio: 'ignore', windowsHide: true });
  filho.on('exit', lerIndice);
  filho.on('error', () => {});
}

// ---------- estado ----------

let timerSalvar = null;
function salvar() {
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(() => {
    const dados = { modo: e.modo, pausado: e.pausado, fila: e.fila, indice: e.indice, posicao: posicaoAgora(), versao: e.versao };
    fs.writeFile(`${ARQ_ESTADO}.tmp`, JSON.stringify(dados), erro => {
      if (!erro) fs.rename(`${ARQ_ESTADO}.tmp`, ARQ_ESTADO, () => {});
    });
  }, 500);
}

function posicaoAgora() {
  if (e.modo !== 'player' || e.pausado) return e.posicao;
  return e.posicao + (Date.now() - e.posicaoEm) / 1000;
}

function marcarPosicao(segundos) {
  e.posicao = segundos;
  e.posicaoEm = Date.now();
}

const faixaAtual = () => e.fila[e.indice] || null;

function visao() {
  const n = e.fila.length;
  const emOrdem = passo => (n ? e.fila[(e.indice + passo + n * 8) % n] : null);
  const faixa = faixaAtual();
  return {
    modo: e.modo,
    pausado: e.pausado,
    versao: e.versao,
    faixa,
    posicao: Math.max(0, faixa && faixa.duracao ? Math.min(posicaoAgora(), faixa.duracao) : posicaoAgora()),
    proximas: n > 1 ? [1, 2, 3].slice(0, n - 1).map(emOrdem) : [],
    caixaAberta: canais.size > 0,
  };
}

function publicar() {
  salvar();
  const linha = `data: ${JSON.stringify(visao())}\n\n`;
  for (const res of canais) res.write(linha);
  avisarMudanca(visao());
}

// ---------- comandos ----------

async function tocaveis(faixas) {
  const fora = await fontes.bloqueadas().catch(() => new Set());
  return faixas.filter(f => indice[f.id] && !fora.has(f.id))
    .map(f => ({ id: f.id, titulo: f.titulo, artista: f.artista || '', album: f.album || '', duracao: f.duracao || indice[f.id].duracao || 0 }));
}

function irPara(novoIndice) {
  e.indice = novoIndice;
  e.pausado = false;
  e.versao += 1;
  marcarPosicao(0);
}

function passar(passo) {
  const n = e.fila.length;
  if (n) irPara((e.indice + passo + n) % n);
}

async function montarFilaDaHora() {
  const id = await fontes.momentoDaHora();
  const faixas = id ? await fontes.listaDoMomento(id) : null;
  e.fila = await tocaveis(faixas || []);
  e.indice = 0;
  marcarPosicao(0);
}

const COMANDOS = {
  async modo({ modo }) {
    if (modo !== 'radio' && modo !== 'player') throw new Error('modo inválido');
    if (modo === 'player' && !faixaAtual()) await montarFilaDaHora();
    if (modo === 'player' && !faixaAtual()) return { status: 409, erro: 'Não achei as músicas deste PC. Tente de novo em instantes.' };
    e.modo = modo;
    e.pausado = false;
    e.versao += 1;
    e.posicaoEm = Date.now();
    return {};
  },
  pausar() {
    marcarPosicao(posicaoAgora());
    e.pausado = true;
    return {};
  },
  continuar() {
    e.pausado = false;
    e.posicaoEm = Date.now();
    return {};
  },
  proxima() {
    if (!e.fila.length) return { status: 409, erro: 'Não há música na fila.' };
    passar(1);
    return {};
  },
  anterior() {
    if (!e.fila.length) return { status: 409, erro: 'Não há música na fila.' };
    passar(-1);
    return {};
  },
  async tocar({ id, momento }) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error('música inválida');
    if (!indice[id]) lerIndice();
    if (!indice[id]) return { status: 404, erro: 'O arquivo dessa música não está neste PC.' };

    const lista = typeof momento === 'string' && /^[a-z-]+$/.test(momento) ? await fontes.listaDoMomento(momento) : null;
    if (lista) {
      const fila = await tocaveis(lista);
      const posicao = fila.findIndex(f => f.id === id);
      if (posicao < 0) return { status: 409, erro: 'Essa música está bloqueada na rádio.' };
      e.fila = fila;
      irPara(posicao);
      return {};
    }
    // Da busca: entra logo depois da atual e a fila continua de onde estava.
    const [faixa] = await tocaveis([(await fontes.acharFaixa(id)) || indice[id]]);
    if (!faixa) return { status: 409, erro: 'Essa música está bloqueada na rádio.' };
    if (!e.fila.length) await montarFilaDaHora();
    const resto = e.fila.filter(f => f.id !== id);
    const atual = faixaAtual();
    const depoisDe = atual && atual.id !== id ? resto.findIndex(f => f.id === atual.id) + 1 : 0;
    e.fila = [...resto.slice(0, depoisDe), faixa, ...resto.slice(depoisDe)];
    irPara(depoisDe);
    return {};
  },
};

function receberRelato({ versao, evento, posicao }) {
  if (versao !== e.versao || e.modo !== 'player') return;
  if (evento === 'posicao' && typeof posicao === 'number' && !e.pausado) { marcarPosicao(posicao); salvar(); return; }
  if (evento === 'tocando') { errosSeguidos = 0; return; }
  if (evento === 'fim') { errosSeguidos = 0; passar(1); publicar(); return; }
  if (evento === 'erro') {
    errosSeguidos += 1;
    if (errosSeguidos >= ERROS_ATE_PARAR) { errosSeguidos = 0; marcarPosicao(0); e.pausado = true; } else passar(1);
    publicar();
  }
}

// ---------- http ----------

function enviarJson(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req, limite = 2048) {
  return new Promise((ok, erro) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', d => {
      texto += d;
      if (texto.length > limite) { erro(new Error('corpo grande demais')); req.destroy(); }
    });
    req.on('end', () => ok(texto));
    req.on('error', erro);
  });
}

// Só uma página toca por vez: uma segunda aberta derrubaria o som na anterior, e não duplicaria.
function abrirCanal(req, res) {
  for (const antigo of canais) { antigo.write('event: substituida\ndata: {}\n\n'); antigo.end(); }
  canais = new Set([res]);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify(visao())}\n\n`);
  const vivo = setInterval(() => res.write(': vivo\n\n'), 20000);
  avisarMudanca(visao());
  req.on('close', () => { clearInterval(vivo); canais.delete(res); avisarMudanca(visao()); });
}

function enviarAudio(req, res, arquivo) {
  fs.stat(arquivo, (erro, st) => {
    if (erro || !st.isFile()) { res.writeHead(404); return res.end(); }
    const tipo = TIPOS_AUDIO[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
    const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let inicio = 0;
    let fim = st.size - 1;
    let status = 200;
    if (faixa && (faixa[1] || faixa[2])) {
      if (faixa[1]) { inicio = Number(faixa[1]); if (faixa[2]) fim = Math.min(Number(faixa[2]), fim); } else inicio = Math.max(0, st.size - Number(faixa[2]));
      if (inicio > fim) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      status = 206;
    }
    const cabecalhos = { 'content-type': tipo, 'accept-ranges': 'bytes', 'content-length': fim - inicio + 1, 'cache-control': 'no-cache' };
    if (status === 206) cabecalhos['content-range'] = `bytes ${inicio}-${fim}/${st.size}`;
    res.writeHead(status, cabecalhos);
    if (req.method === 'HEAD') return res.end();
    const leitura = fs.createReadStream(arquivo, { start: inicio, end: fim });
    leitura.on('error', () => res.destroy());
    req.on('close', () => leitura.destroy());
    return leitura.pipe(res);
  });
}

async function receberComando(req, res) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return enviarJson(res, 415, { erro: 'envie JSON' });
  try {
    const corpo = JSON.parse(await lerCorpo(req));
    const comando = Object.prototype.hasOwnProperty.call(COMANDOS, corpo.acao) ? COMANDOS[corpo.acao] : null;
    if (!comando) return enviarJson(res, 400, { erro: 'comando desconhecido' });
    const { status, erro } = await comando(corpo);
    if (erro) return enviarJson(res, status, { erro, ...visao() });
    publicar();
    return enviarJson(res, 200, visao());
  } catch {
    if (!res.headersSent) return enviarJson(res, 400, { erro: 'Pedido inválido.' });
    return res.end();
  }
}

async function receberRelatoHttp(req, res) {
  try {
    receberRelato(JSON.parse(await lerCorpo(req)));
    return enviarJson(res, 200, {});
  } catch {
    return enviarJson(res, 400, {});
  }
}

// rel: caminho depois de /musica/
function atender(req, res, rel) {
  if (rel === 'api/caixa/eventos') { abrirCanal(req, res); return; }
  if (rel === 'api/caixa/relato' && req.method === 'POST') { receberRelatoHttp(req, res); return; }
  const audio = /^api\/caixa\/audio\/([A-Za-z0-9_-]{4,64})$/.exec(rel);
  if (audio) {
    const item = indice[audio[1]];
    if (!item) { res.writeHead(404); res.end(); return; }
    enviarAudio(req, res, item.arquivo);
    return;
  }
  if (rel === 'api/caixa' && req.method === 'POST') { receberComando(req, res); return; }
  if (rel === 'api/caixa') { enviarJson(res, 200, visao()); return; }
  enviarJson(res, 404, { erro: 'rota não existe' });
}

function iniciar(dependencias) {
  fontes = dependencias;
  lerIndice();
  atualizarIndice();
  setInterval(atualizarIndice, SEIS_HORAS).unref();
}

module.exports = { atender, iniciar, aoMudar: fn => { avisarMudanca = fn; } };
