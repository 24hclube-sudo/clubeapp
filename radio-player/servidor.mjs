// Rádio CLUBE — interface de streaming.
//
// Servidor sem dependências. Serve a pasta publico/ e uma API só de leitura.
//
// Regra de segurança: a porta 7900 da estação recebe o login de admin injetado
// pelo Caddy. Então NADA que vem do navegador é repassado para lá de forma
// livre. Cada rota abaixo monta o seu pedido, sempre GET, e nenhuma muda a rádio.
//
// Por padrão só atende nesta máquina (127.0.0.1). Para abrir na rede local,
// defina HOST=0.0.0.0 e libere a porta no firewall. Isso é decisão do dono.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, 'publico');
const ARQ_MOMENTOS = path.join(RAIZ, 'dados', 'momentos.json');
const ARQ_ESTACAO = path.join(RAIZ, 'dados', 'estacao.json');

const ESTACAO = process.env.ESTACAO || 'http://127.0.0.1:7900';
const PORTA = Number(process.env.PORTA || 7920);
const HOST = process.env.HOST || '127.0.0.1';

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

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

// Relidos a cada pedido: são arquivos pequenos e assim a aprovação de uma nova
// lista aparece sem reiniciar o servidor.
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

// A grade só conta como "no ar" se cada momento estiver de fato na grade da
// estação. Sem isso a interface fala em "proposta" e não finge que está valendo.
function modoAtual(estacao, grade, momentos) {
  if (!estacao?.programas || !grade?.schedule) return 'proposta';
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
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    inicio: m.inicio,
    fim: m.fim,
    cor: m.cor,
    cor2: m.cor2,
    capa: m.capa,
    totalFaixas: faixas.length,
    duracao: faixas.reduce((soma, f) => soma + (f.duracao || 0), 0),
    noAr: ao,
  };
}

async function faixasDoMomento(m, estacao, modo, correcoes) {
  const local = m.faixas.map(f => aplicarCorrecao(f, correcoes));
  const idLista = modo === 'no-ar' ? estacao?.programas?.[m.id]?.playlistId : null;
  if (!idLista) return local;
  try {
    const { entries } = await daEstacao(`/api/playlists/${encodeURIComponent(idLista)}`, 60_000);
    return entries.map(e => aplicarCorrecao({
      id: e.id,
      titulo: e.title,
      artista: e.artist || '',
      album: e.album || '',
      ano: e.year || null,
      duracao: e.durationSec || 0,
    }, correcoes));
  } catch {
    return local; // estação fora do ar: mostra a última lista conhecida
  }
}

async function apiAgora() {
  const { momentos, correcoes } = dadosMomentos();
  const estacao = dadosEstacao();
  const [agora, estado, grade] = await Promise.all([
    daEstacao('/api/now-playing', 2500),
    daEstacao('/api/state', 2500),
    daEstacao('/api/schedule', 15_000).catch(() => null),
  ]);
  const modo = modoAtual(estacao, grade, momentos);
  const { hora, minuto } = horaDeSaoPaulo();
  const pelaHora = momentoNaHora(momentos, hora);
  const proximo = pelaHora ? momentos[(momentos.indexOf(pelaHora) + 1) % momentos.length] : null;
  const atual = faixaDoEstado(estado.current, correcoes);
  const np = agora.nowPlaying;
  if (atual) {
    atual.duracao = np?.duration || null;
    if (!atual.inicio && np?.timestamp) atual.inicio = np.timestamp * 1000;
  }
  return {
    modo,
    online: !!agora.streamOnline,
    atrasoAudio: agora.stream?.bufferSeconds ?? 0,
    ouvintes: agora.listeners?.current ?? 0,
    faixa: atual,
    proximas: (estado.upcoming || []).slice(0, 3).map(f => faixaDoEstado(f, correcoes)),
    tocaram: (estado.history || []).slice(0, 8).map(f => faixaDoEstado(f, correcoes)),
    programaNaEstacao: agora.session?.show?.name || agora.activeShow?.name || null,
    relogio: { hora, minuto },
    momentoAtual: pelaHora?.id || null,
    momentoSeguinte: proximo?.id || null,
  };
}

async function apiMomentos() {
  const { momentos, correcoes } = dadosMomentos();
  const estacao = dadosEstacao();
  const grade = await daEstacao('/api/schedule', 15_000).catch(() => null);
  const modo = modoAtual(estacao, grade, momentos);
  const { hora } = horaDeSaoPaulo();
  const atual = momentoNaHora(momentos, hora);
  const lista = [];
  for (const m of momentos) {
    const faixas = await faixasDoMomento(m, estacao, modo, correcoes);
    lista.push(resumoMomento(m, m.id === atual?.id, faixas));
  }
  return { modo, momentos: lista };
}

async function apiMomento(id) {
  const { momentos, correcoes } = dadosMomentos();
  const m = momentos.find(x => x.id === id);
  if (!m) return null;
  const estacao = dadosEstacao();
  const grade = await daEstacao('/api/schedule', 15_000).catch(() => null);
  const modo = modoAtual(estacao, grade, momentos);
  const { hora } = horaDeSaoPaulo();
  const faixas = await faixasDoMomento(m, estacao, modo, correcoes);
  return {
    modo,
    ...resumoMomento(m, momentoNaHora(momentos, hora)?.id === m.id, faixas),
    faixas,
  };
}

// ---------- respostas http ----------

function enviarJson(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': TIPOS['.json'], 'cache-control': 'no-store' });
  res.end(texto);
}

// Faixa sem capa: o Navidrome devolve sempre a mesma imagem genérica, com o nome
// dele. Reconhecida pelo conteúdo, ela dá lugar à capa do CLUBE.
const CAPA_GENERICA = 'f6ca6db40f46720c6648280586b473026d60a653';
const CAPA_PADRAO = path.join(PUBLICO, 'icones', 'capa-padrao.svg');

function enviarCapaPadrao(res) {
  fs.readFile(CAPA_PADRAO, (erro, corpo) => {
    if (erro) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TIPOS['.svg'], 'cache-control': 'public, max-age=3600' });
    res.end(corpo);
  });
}

async function enviarCapa(res, id) {
  // Faixas sem álbum: o Navidrome junta todas num álbum só e repete a mesma capa.
  if ((dadosMomentos().semCapa || []).includes(id)) return enviarCapaPadrao(res);
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
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('rádio indisponível');
  });
  req.on('close', () => pedido.destroy());
}

function enviarArquivo(res, caminhoUrl) {
  const pedido = caminhoUrl === '/' ? '/index.html' : caminhoUrl;
  const alvo = path.normalize(path.join(PUBLICO, pedido));
  if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(alvo, (erro, corpo) => {
    if (erro) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('não encontrado');
      return;
    }
    const ext = path.extname(alvo).toLowerCase();
    const duradouro = /^\.(ttf|jpg|webp|png)$/.test(ext);
    res.writeHead(200, {
      'content-type': TIPOS[ext] || 'application/octet-stream',
      'cache-control': duradouro ? 'public, max-age=604800' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(corpo);
  });
}

const servidor = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  try {
    if (caminho === '/api/agora') return enviarJson(res, 200, await apiAgora());
    if (caminho === '/api/momentos') return enviarJson(res, 200, await apiMomentos());
    const momento = caminho.match(/^\/api\/momentos\/([a-z-]+)$/);
    if (momento) {
      const dados = await apiMomento(momento[1]);
      return dados ? enviarJson(res, 200, dados) : enviarJson(res, 404, { erro: 'momento não encontrado' });
    }
    const capa = caminho.match(/^\/api\/capa\/([A-Za-z0-9_-]{4,64})$/);
    if (capa) return enviarCapa(res, capa[1]);
    if (caminho === '/stream.mp3') return repassarStream(req, res);
    if (caminho.startsWith('/api/')) return enviarJson(res, 404, { erro: 'rota não existe' });
    return enviarArquivo(res, caminho);
  } catch (erro) {
    return enviarJson(res, 502, { erro: 'não consegui falar com a estação', detalhe: String(erro.message || erro) });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.log(`Rádio CLUBE (interface) em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORTA}`);
});
