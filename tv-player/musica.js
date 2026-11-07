// Aba Música do app: a interface da Rádio CLUBE servida em /musica/ pelo próprio servidor do app,
// na mesma porta e subindo junto com ele. Telas e listas ficam em C:\apps\radio-player (publico e dados).
//
// A porta 7900 da estação recebe o login de admin injetado pelo Caddy, então nada que vem do navegador
// é repassado para lá de forma livre: cada rota monta o seu pedido. Só POST api/tocar muda a rádio,
// e só com uma música das listas da própria interface.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const caixas = require('./caixas.js');
const caixaPlayer = require('./caixa-player.js');

const RAIZ = process.env.MUSICA_RAIZ || path.join(__dirname, '..', 'radio-player');
const PUBLICO = path.join(RAIZ, 'publico');
const ARQ_MOMENTOS = path.join(RAIZ, 'dados', 'momentos.json');
const ARQ_ESTACAO = path.join(RAIZ, 'dados', 'estacao.json');
const CAPA_PADRAO = path.join(PUBLICO, 'icones', 'capa-padrao.svg');
const CSS_EMBUTIDO = path.join(__dirname, 'public', 'musica-embutido.css');
const ESTACAO = process.env.MUSICA_ESTACAO || process.env.RADIO_URL || 'http://127.0.0.1:7900';
const PREFIXO = '/musica/';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- dados locais ----------

// Este servidor também manda as fitas, então nada aqui lê disco de forma bloqueante.
// A cópia em memória só vale enquanto o arquivo não muda: aprovar as listas aparece sem reiniciar.
const arquivos = new Map();
async function lerJson(arquivo, padrao) {
  try {
    const { mtimeMs } = await fs.promises.stat(arquivo);
    const guardado = arquivos.get(arquivo);
    if (guardado && guardado.mtimeMs === mtimeMs) return guardado.valor;
    const valor = JSON.parse(await fs.promises.readFile(arquivo, 'utf8'));
    arquivos.set(arquivo, { mtimeMs, valor });
    return valor;
  } catch {
    return padrao;
  }
}
const dadosMomentos = () => lerJson(ARQ_MOMENTOS, { momentos: [], correcoes: {} });
const dadosEstacao = () => lerJson(ARQ_ESTACAO, null);

// ---------- conversa com a estação (somente GET) ----------

const memoria = new Map();
async function daEstacao(caminho, validadeMs) {
  const guardado = memoria.get(caminho);
  if (guardado && Date.now() - guardado.em < validadeMs) return guardado.valor;
  const resposta = await fetch(ESTACAO + caminho, { signal: AbortSignal.timeout(6000) });
  if (!resposta.ok) throw new Error(`estação respondeu ${resposta.status} em ${caminho}`);
  const valor = await resposta.json();
  memoria.set(caminho, { em: Date.now(), valor });
  return valor;
}

// ---------- montagem das respostas ----------

function aplicarCorrecao(faixa, correcoes) {
  const c = faixa.id ? correcoes[faixa.id] : null;
  const saida = c ? { ...faixa, ...c } : { ...faixa };
  if (/^\[unknown/i.test(saida.album || '')) saida.album = '';
  return saida;
}

function faixaDoEstado(item, correcoes) {
  if (!item) return null;
  return aplicarCorrecao({
    id: item.subsonic_id || null,
    titulo: item.title || 'Sem título',
    artista: item.artist || '',
    album: item.album || '',
    inicio: item.startedAt ? Date.parse(item.startedAt) : null,
  }, correcoes);
}

function momentoNaHora(momentos, hora) {
  return momentos.find(m => (m.inicio < m.fim
    ? hora >= m.inicio && hora < m.fim
    : hora >= m.inicio || hora < m.fim)) || null;
}

function horaDeSaoPaulo() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const pega = t => Number(partes.find(p => p.type === t).value);
  return { hora: pega('hour'), minuto: pega('minute') };
}

// A grade só conta como "no ar" se cada momento estiver de fato na grade da estação.
function modoAtual(estacao, grade, momentos) {
  if (!estacao || !estacao.programas || !grade || !grade.schedule) return 'proposta';
  const ids = Object.values(grade.schedule).flat().filter(Boolean);
  const todos = momentos.every(m => {
    const prog = estacao.programas[m.id];
    return prog && ids.includes(prog.showId);
  });
  return todos ? 'no-ar' : 'proposta';
}

function resumoMomento(m, ao, listaViva) {
  const faixas = listaViva || m.faixas;
  return {
    id: m.id, nome: m.nome, descricao: m.descricao, inicio: m.inicio, fim: m.fim,
    cor: m.cor, cor2: m.cor2, capa: m.capa,
    totalFaixas: faixas.length,
    duracao: faixas.reduce((soma, f) => soma + (f.duracao || 0), 0),
    noAr: ao,
  };
}

async function faixasDoMomento(m, estacao, modo, correcoes) {
  const local = m.faixas.map(f => aplicarCorrecao(f, correcoes));
  const programa = estacao && estacao.programas && estacao.programas[m.id];
  const idLista = modo === 'no-ar' && programa ? programa.playlistId : null;
  if (!idLista) return local;
  try {
    const { entries } = await daEstacao(`/api/playlists/${encodeURIComponent(idLista)}`, 60000);
    return entries.map(e => aplicarCorrecao({
      id: e.id, titulo: e.title, artista: e.artist || '', album: e.album || '',
      ano: e.year || null, duracao: e.durationSec || 0,
    }, correcoes));
  } catch {
    return local; // estação fora do ar: mostra a última lista conhecida
  }
}

async function apiAgora() {
  const { momentos, correcoes } = await dadosMomentos();
  const estacao = await dadosEstacao();
  const [agora, estado, grade] = await Promise.all([
    daEstacao('/api/now-playing', 2500),
    daEstacao('/api/state', 2500),
    daEstacao('/api/schedule', 15000).catch(() => null),
  ]);
  const modo = modoAtual(estacao, grade, momentos);
  const { hora, minuto } = horaDeSaoPaulo();
  const pelaHora = momentoNaHora(momentos, hora);
  const proximo = pelaHora ? momentos[(momentos.indexOf(pelaHora) + 1) % momentos.length] : null;
  const atual = faixaDoEstado(estado.current, correcoes);
  const np = agora.nowPlaying;
  if (atual) {
    atual.duracao = (np && np.duration) || null;
    if (!atual.inicio && np && np.timestamp) atual.inicio = np.timestamp * 1000;
  }
  const programa = (agora.session && agora.session.show) || agora.activeShow;
  return {
    modo,
    online: !!agora.streamOnline,
    atrasoAudio: (agora.stream && agora.stream.bufferSeconds) || 0,
    ouvintes: (agora.listeners && agora.listeners.current) || 0,
    faixa: atual,
    proximas: (estado.upcoming || []).slice(0, 3).map(f => faixaDoEstado(f, correcoes)),
    tocaram: (estado.history || []).slice(0, 8).map(f => faixaDoEstado(f, correcoes)),
    programaNaEstacao: (programa && programa.name) || null,
    relogio: { hora, minuto },
    momentoAtual: pelaHora ? pelaHora.id : null,
    momentoSeguinte: proximo ? proximo.id : null,
  };
}

async function apiMomentos() {
  const { momentos, correcoes } = await dadosMomentos();
  const estacao = await dadosEstacao();
  const grade = await daEstacao('/api/schedule', 15000).catch(() => null);
  const modo = modoAtual(estacao, grade, momentos);
  const atual = momentoNaHora(momentos, horaDeSaoPaulo().hora);
  const lista = [];
  for (const m of momentos) {
    const faixas = await faixasDoMomento(m, estacao, modo, correcoes);
    lista.push(resumoMomento(m, !!atual && m.id === atual.id, faixas));
  }
  return { modo, momentos: lista };
}

async function apiMomento(id) {
  const { momentos, correcoes } = await dadosMomentos();
  const m = momentos.find(x => x.id === id);
  if (!m) return null;
  const estacao = await dadosEstacao();
  const grade = await daEstacao('/api/schedule', 15000).catch(() => null);
  const modo = modoAtual(estacao, grade, momentos);
  const atual = momentoNaHora(momentos, horaDeSaoPaulo().hora);
  const faixas = await faixasDoMomento(m, estacao, modo, correcoes);
  return { modo, ...resumoMomento(m, !!atual && atual.id === m.id, faixas), faixas };
}

// ---------- tocar uma música na hora ----------

const espera = ms => new Promise(ok => setTimeout(ok, ms));
const ESPERA_ENTRAR_MS = 30000;

async function naEstacao(metodo, caminho, corpo, tempoMs = 10000) {
  const resposta = await fetch(ESTACAO + caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(tempoMs),
  });
  let json = null;
  try { json = await resposta.json(); } catch { /* resposta sem corpo */ }
  return { status: resposta.status, json };
}

async function acharFaixa(id) {
  const { momentos, correcoes } = await dadosMomentos();
  const estacao = await dadosEstacao();
  const grade = await daEstacao('/api/schedule', 15000).catch(() => null);
  const modo = modoAtual(estacao, grade, momentos);
  for (const m of momentos) {
    const faixa = (await faixasDoMomento(m, estacao, modo, correcoes)).find(f => f.id === id);
    if (faixa) return faixa;
  }
  return null;
}

const paraEstacao = f => ({ id: f.id, title: f.titulo, artist: f.artista, album: f.album, duration: f.duracao || undefined });

// Pular pode levar até uns 20 s: a estação espera a próxima música ficar pronta no mixer.
async function pularDaEstacao(idNoAr) {
  const { status, json } = await naEstacao('POST', '/api/dj/skip', idNoAr ? { expectId: idNoAr } : {}, 40000);
  return { ok: status === 200, motivo: (json && json.reason) || null };
}

// Tira da fila o que entraria antes, põe a música escolhida e corta a que está no ar.
// A música que o mixer já preparou não sai da fila: entra por instantes e é cortada também.
async function tocarAgora(id) {
  const faixa = await acharFaixa(id);
  if (!faixa) return { status: 404, corpo: { erro: 'Essa música não está nas listas.' } };
  return colocarNoAr(faixa);
}

async function colocarNoAr(faixa) {
  const { id } = faixa;
  const { json: antes } = await naEstacao('GET', '/api/state');
  if (!antes) return { status: 502, corpo: { erro: 'Não consegui falar com a rádio.' } };
  const idNoAr = (antes.current && antes.current.subsonic_id) || null;
  if (idNoAr === id) return { status: 200, corpo: { ok: true, entrou: true, titulo: faixa.titulo } };

  const pedidos = [];
  for (const item of antes.upcoming || []) {
    if (!item.subsonic_id) continue;
    const { status } = await naEstacao('DELETE', `/api/dj/queue/${encodeURIComponent(item.subsonic_id)}`);
    // Pedido de ouvinte volta para a fila depois da música escolhida.
    if (status === 200 && item.requestedBy && item.requestedBy !== 'studio') pedidos.push(item);
  }

  const posta = await naEstacao('POST', '/api/dj/queue-track', paraEstacao(faixa));
  for (const item of pedidos) {
    await naEstacao('POST', '/api/dj/queue-track', { id: item.subsonic_id, title: item.title, artist: item.artist, album: item.album });
  }
  if (posta.status !== 200) {
    const erro = posta.status === 409 ? 'Essa música está bloqueada na rádio.' : 'A rádio não aceitou a música.';
    return { status: 502, corpo: { erro } };
  }

  const pulo = await pularDaEstacao(idNoAr);
  if (!pulo.ok && pulo.motivo !== 'track-changed') {
    // Vinheta ou locutor no ar: a escolhida já está na fila e entra logo depois.
    return { status: 200, corpo: { ok: true, entrou: false, titulo: faixa.titulo } };
  }

  const fim = Date.now() + ESPERA_ENTRAR_MS;
  let cortada = idNoAr;
  while (Date.now() < fim) {
    await espera(1000);
    const { json } = await naEstacao('GET', '/api/state');
    const atual = json && json.current && json.current.subsonic_id;
    if (atual === id) return { status: 200, corpo: { ok: true, entrou: true, titulo: faixa.titulo } };
    if (atual && atual !== cortada) {
      cortada = atual;
      await pularDaEstacao(atual);
    }
  }
  return { status: 200, corpo: { ok: true, entrou: false, titulo: faixa.titulo } };
}

// Botão de próxima: corta a que está no ar e entra a da fila.
async function passarAgora() {
  const { json } = await naEstacao('GET', '/api/state');
  if (!json) return { status: 502, corpo: { erro: 'Não consegui falar com a rádio.' } };
  const pulo = await pularDaEstacao((json.current && json.current.subsonic_id) || null);
  if (pulo.ok || pulo.motivo === 'track-changed') return { status: 200, corpo: { ok: true } };
  return { status: 409, corpo: { erro: 'Tem uma vinheta ou fala no ar. Tente de novo em alguns segundos.' } };
}

// Botão de anterior: a última que tocou volta para o ar.
async function voltarAgora() {
  const { json } = await naEstacao('GET', '/api/state');
  if (!json) return { status: 502, corpo: { erro: 'Não consegui falar com a rádio.' } };
  const noAr = json.current && json.current.subsonic_id;
  const ultima = (json.history || []).find(item => item.subsonic_id && item.subsonic_id !== noAr);
  if (!ultima) return { status: 409, corpo: { erro: 'Ainda não há música anterior.' } };
  return colocarNoAr({ id: ultima.subsonic_id, titulo: ultima.title, artista: ultima.artist, album: ultima.album, duracao: ultima.duration });
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

// Sincronia: cada aparelho com a aba Música aberta escuta aqui e acompanha, na hora, o volume das caixas,
// o modo Rádio/Player e a música no ar.
const canaisSinc = new Set();
let ouvinteSinc = () => {};
function avisarSinc(dados) {
  const linha = `data: ${JSON.stringify(dados)}\n\n`;
  for (const res of canaisSinc) if (res.writableLength < 64000) res.write(linha);
  ouvinteSinc(dados);
}
function abrirSinc(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(': sincronia\n\n');
  canaisSinc.add(res);
  const vivo = setInterval(() => res.write(': vivo\n\n'), 20000);
  req.on('close', () => { clearInterval(vivo); canaisSinc.delete(res); });
}

// Um clique por vez: dois ao mesmo tempo cortariam a música um do outro.
let entrando = false;

async function receberTocar(req, res) {
  // Só JSON: um site qualquer aberto num aparelho da rede não consegue mandar este pedido sem preflight.
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return enviarJson(res, 415, { erro: 'envie JSON' });
  if (entrando) return enviarJson(res, 409, { erro: 'Espere: outra música está entrando.' });
  entrando = true;
  try {
    const { id } = JSON.parse(await lerCorpo(req));
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) return enviarJson(res, 400, { erro: 'música inválida' });
    const { status, corpo } = await tocarAgora(id);
    if (status === 200) avisarSinc({ agora: true });
    return enviarJson(res, status, corpo);
  } catch {
    if (!res.headersSent) return enviarJson(res, 502, { erro: 'Não consegui falar com a rádio.' });
    return res.end();
  } finally {
    entrando = false;
  }
}

// Barra de volume: muda o som que sai deste PC, de qualquer aparelho que abra o app.
async function receberVolume(req, res) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return enviarJson(res, 415, { erro: 'envie JSON' });
  try {
    const { volume } = JSON.parse(await lerCorpo(req));
    if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1)) return enviarJson(res, 400, { erro: 'volume inválido' });
    avisarSinc({ volume });
    return enviarJson(res, 200, await caixas.definirVolume(volume));
  } catch {
    if (!res.headersSent) return enviarJson(res, 502, { erro: 'Não consegui mudar o volume das caixas.' });
    return res.end();
  }
}

// Só JSON, como em api/tocar, e um por vez: dois ao mesmo tempo cortariam a música um do outro.
async function receberComando(req, res, acao) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return enviarJson(res, 415, { erro: 'envie JSON' });
  if (entrando) return enviarJson(res, 409, { erro: 'Espere: outra música está entrando.' });
  entrando = true;
  try {
    req.resume();
    const { status, corpo } = await acao();
    if (status === 200) avisarSinc({ agora: true });
    return enviarJson(res, status, corpo);
  } catch {
    if (!res.headersSent) return enviarJson(res, 502, { erro: 'Não consegui falar com a rádio.' });
    return res.end();
  } finally {
    entrando = false;
  }
}

caixaPlayer.aoMudar(caixa => avisarSinc({ caixa }));

// O player das caixas usa as mesmas listas da interface e respeita o bloqueio da estação.
caixaPlayer.iniciar({
  acharFaixa,
  listaDoMomento: async id => {
    const dados = await apiMomento(id);
    return dados ? dados.faixas : null;
  },
  momentoDaHora: async () => {
    const { momentos } = await dadosMomentos();
    const m = momentoNaHora(momentos, horaDeSaoPaulo().hora);
    return m ? m.id : null;
  },
  bloqueadas: async () => {
    const { entries } = await daEstacao('/api/library/blocklist', 30000);
    return new Set((entries || []).filter(b => b.type === 'track').map(b => b.id));
  },
});

// ---------- respostas http ----------

function enviarJson(res, status, corpo) {
  res.writeHead(status, { 'content-type': TIPOS['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

// Faixa sem capa: o Navidrome devolve sempre a mesma imagem genérica, com o nome dele.
// Reconhecida pelo conteúdo, ela dá lugar à capa do CLUBE.
const CAPA_GENERICA = 'f6ca6db40f46720c6648280586b473026d60a653';

async function enviarCapaPadrao(res) {
  try {
    const corpo = await fs.promises.readFile(CAPA_PADRAO);
    res.writeHead(200, { 'content-type': TIPOS['.svg'], 'cache-control': 'public, max-age=3600' });
    res.end(corpo);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

async function enviarCapa(res, id) {
  // Faixas sem álbum: o Navidrome junta todas num álbum só e repete a mesma capa.
  const { semCapa } = await dadosMomentos();
  if ((semCapa || []).includes(id)) return enviarCapaPadrao(res);
  try {
    const resposta = await fetch(`${ESTACAO}/api/cover/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return enviarCapaPadrao(res);
    const corpo = Buffer.from(await resposta.arrayBuffer());
    if (createHash('sha1').update(corpo).digest('hex') === CAPA_GENERICA) return enviarCapaPadrao(res);
    res.writeHead(200, {
      'content-type': resposta.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=86400',
    });
    return res.end(corpo);
  } catch {
    return enviarCapaPadrao(res);
  }
}

function repassarStream(req, res) {
  const pedido = http.get(`${ESTACAO}/stream.mp3`, { headers: { 'user-agent': 'radio-clube-player' } }, resposta => {
    res.writeHead(resposta.statusCode || 502, {
      'content-type': resposta.headers['content-type'] || 'audio/mpeg',
      'cache-control': 'no-cache, no-store',
    });
    resposta.pipe(res);
  });
  pedido.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': TIPOS['.txt'] });
    res.end('rádio indisponível');
  });
  req.on('close', () => pedido.destroy());
}

// A página entra no app sem mexer na interface original: só ganha uma folha de estilo a mais.
async function enviarPagina(res) {
  try {
    const html = await fs.promises.readFile(path.join(PUBLICO, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': TIPOS['.html'], 'cache-control': 'no-cache' });
    res.end(html.replace('</head>', '<link rel="stylesheet" href="embutido.css">\n</head>'));
  } catch {
    res.writeHead(404, { 'content-type': TIPOS['.html'] });
    res.end('<!doctype html><meta charset="utf-8"><body style="background:#0b0c0e;color:#8d939c;font:15px system-ui;padding:24px">Interface da rádio não encontrada neste computador.');
  }
}

async function enviarArquivo(res, relativo) {
  const alvo = path.normalize(path.join(PUBLICO, relativo));
  if (!alvo.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const corpo = await fs.promises.readFile(alvo);
    const ext = path.extname(alvo).toLowerCase();
    res.writeHead(200, {
      'content-type': TIPOS[ext] || 'application/octet-stream',
      'cache-control': /^\.(ttf|jpg|webp|png)$/.test(ext) ? 'public, max-age=604800' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(corpo);
  } catch {
    res.writeHead(404, { 'content-type': TIPOS['.txt'] });
    res.end('não encontrado');
  }
}

async function responder(req, res, rel) {
  try {
    if (rel === '' || rel === 'index.html') return await enviarPagina(res);
    if (rel === 'embutido.css') {
      const corpo = await fs.promises.readFile(CSS_EMBUTIDO);
      res.writeHead(200, { 'content-type': TIPOS['.css'], 'cache-control': 'no-cache' });
      return res.end(corpo);
    }
    if (rel === 'api/agora') return enviarJson(res, 200, await apiAgora());
    if (rel === 'api/volume') return enviarJson(res, 200, await caixas.lerVolume());
    if (rel === 'api/momentos') return enviarJson(res, 200, await apiMomentos());
    const momento = /^api\/momentos\/([a-z-]+)$/.exec(rel);
    if (momento) {
      const dados = await apiMomento(momento[1]);
      return dados ? enviarJson(res, 200, dados) : enviarJson(res, 404, { erro: 'momento não encontrado' });
    }
    const capa = /^api\/capa\/([A-Za-z0-9_-]{4,64})$/.exec(rel);
    if (capa) return await enviarCapa(res, capa[1]);
    if (rel === 'stream.mp3') return repassarStream(req, res);
    if (rel.startsWith('api/')) return enviarJson(res, 404, { erro: 'rota não existe' });
    return await enviarArquivo(res, rel);
  } catch {
    if (res.headersSent) return res.end();
    return enviarJson(res, 502, { erro: 'não consegui falar com a estação' });
  }
}

// true = este módulo assumiu o pedido.
function atender(req, res, p) {
  if (p === '/musica') {
    res.writeHead(302, { location: PREFIXO });
    res.end();
    return true;
  }
  if (!p.startsWith(PREFIXO)) return false;
  if (p === `${PREFIXO}api/sinc` && req.method === 'GET') { abrirSinc(req, res); return true; }
  if (p === `${PREFIXO}api/caixa` || p.startsWith(`${PREFIXO}api/caixa/`)) {
    caixaPlayer.atender(req, res, p.slice(PREFIXO.length));
    return true;
  }
  if (p === `${PREFIXO}api/proxima` && req.method === 'POST') {
    receberComando(req, res, passarAgora);
    return true;
  }
  if (p === `${PREFIXO}api/anterior` && req.method === 'POST') {
    receberComando(req, res, voltarAgora);
    return true;
  }
  if (p === `${PREFIXO}api/volume` && req.method === 'POST') {
    receberVolume(req, res);
    return true;
  }
  if (p === `${PREFIXO}api/tocar` && req.method === 'POST') {
    receberTocar(req, res);
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return true;
  }
  responder(req, res, p.slice(PREFIXO.length));
  return true;
}

module.exports = { atender, aoMudar: fn => { ouvinteSinc = fn; } };
