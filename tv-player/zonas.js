// Música por andar: 1º andar, 5º andar e rooftop tocam coisas diferentes ao mesmo tempo.
// O 5º toca neste PC pela janela de som das caixas (caixa-player.js), que já existe, e /som/5 só leva até ela.
// 1º e rooftop têm um aparelho ligado às caixas com /som/<lugar> aberto (public/som.html). O servidor só decide
// o que toca em cada lugar e entrega o áudio; quem toca é o aparelho. A estação de rádio não é alterada:
// um lugar em "radio" apenas toca a transmissão de sempre.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const LUGARES = { '1': '1º andar', rooftop: 'Rooftop' };
const ARQ_ESTADO = path.join(__dirname, 'zonas.json');
const PASTA_LOCAL = path.join(__dirname, 'som-local');
const ARQ_LISTAS = path.join(PASTA_LOCAL, 'listas.json');
const ARQ_INDICE = path.join(__dirname, 'zonas-indice.json');
const ARQ_MOMENTOS = path.join(process.env.MUSICA_RAIZ || path.join(__dirname, '..', 'radio-player'), 'dados', 'momentos.json');
const SEIS_HORAS = 6 * 3600 * 1000;
const ERROS_ATE_PARAR = 5;

const TIPOS_AUDIO = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
const CANAIS = new Set();
let avisarMudanca = () => {};

// ---------- dados ----------

// Listas e índice são relidos só quando o arquivo muda; assim uma lista nova aparece sem reiniciar.
const cacheArquivos = new Map();
function lerJson(arquivo, padrao) {
  try {
    const { mtimeMs } = fs.statSync(arquivo);
    const guardado = cacheArquivos.get(arquivo);
    if (guardado && guardado.mtimeMs === mtimeMs) return guardado.valor;
    const valor = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    cacheArquivos.set(arquivo, { mtimeMs, valor });
    return valor;
  } catch {
    return padrao;
  }
}

const indice = () => lerJson(ARQ_INDICE, { faixas: {} }).faixas;

// Listas próprias (som-local) primeiro, depois as playlists dos momentos do dia.
function todasAsListas() {
  const locais = lerJson(ARQ_LISTAS, { listas: [] }).listas.map(l => ({ ...l, local: true }));
  const { momentos = [], correcoes = {} } = lerJson(ARQ_MOMENTOS, {});
  const doDia = momentos.map(m => ({
    id: m.id, nome: m.nome, descricao: m.descricao, inicio: m.inicio, fim: m.fim, cor: m.cor, cor2: m.cor2, capa: m.capa,
    ordem: 'embaralhada', faixas: m.faixas.map(f => ({ ...f, ...(correcoes[f.id] || {}) })),
  }));
  return [...locais, ...doDia];
}
const listaPorId = id => todasAsListas().find(l => l.id === id) || null;

function faixaPublica(f) {
  return { id: f.id, titulo: f.titulo, artista: f.artista || '', album: f.album || '', duracao: f.duracao || 0, url: `/som-audio/${encodeURIComponent(f.id)}` };
}

function acharFaixa(id) {
  for (const lista of lerJson(ARQ_LISTAS, { listas: [] }).listas) {
    const f = lista.faixas.find(x => x.id === id);
    if (f) return f;
  }
  return indice()[id] || null;
}

function arquivoDaFaixa(f) {
  if (!f || !f.arquivo) return null;
  if (path.isAbsolute(f.arquivo)) return f.arquivo; // biblioteca: caminho vem do índice
  const alvo = path.normalize(path.join(PASTA_LOCAL, f.arquivo));
  return alvo.startsWith(PASTA_LOCAL + path.sep) ? alvo : null;
}

function buscar(termo) {
  const limpar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = limpar(termo).trim();
  if (q.length < 2) return [];
  return Object.values(indice())
    .filter(f => limpar(`${f.titulo} ${f.artista} ${f.album}`).includes(q))
    .slice(0, 60)
    .map(faixaPublica);
}

// O índice sai de um processo separado para não pesar no servidor que também manda as fitas.
function atualizarIndice() {
  execFile(process.execPath, ['--no-warnings', path.join(__dirname, 'zonas-indice.js'), ARQ_INDICE], { windowsHide: true }, (erro, saida) => {
    console.log(erro ? `zonas: índice de músicas não atualizado (${erro.message.split('\n')[0]})` : String(saida).trim());
  });
}

// ---------- estado de cada lugar ----------

function lugarVazio() {
  return { modo: 'radio', lista: null, faixa: null, faixaDesde: null, fila: [], sacola: [], ultimaDaLista: null, erros: 0, erro: null };
}
const estado = { lugares: {} };
function carregar() {
  const salvo = lerJson(ARQ_ESTADO, {});
  for (const id of Object.keys(LUGARES)) estado.lugares[id] = { ...lugarVazio(), ...((salvo.lugares || {})[id] || {}) };
}

let salvando = null;
function salvar() {
  clearTimeout(salvando);
  salvando = setTimeout(() => {
    const provisorio = ARQ_ESTADO + '.tmp';
    fs.writeFile(provisorio, JSON.stringify(estado, null, 1), erro => {
      if (erro) return console.log(`zonas: não salvei (${erro.message})`);
      fs.rename(provisorio, ARQ_ESTADO, e => { if (e) console.log(`zonas: não salvei (${e.message})`); });
    });
  }, 300);
}

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function proximaDaLista(z) {
  const lista = listaPorId(z.lista);
  if (!lista || !lista.faixas.length) return null;
  const ids = lista.faixas.map(f => f.id);
  let id;
  if (lista.ordem === 'sequencia') {
    id = ids[(ids.indexOf(z.ultimaDaLista) + 1) % ids.length];
  } else {
    // Toca todas antes de repetir.
    z.sacola = z.sacola.filter(x => ids.includes(x));
    if (!z.sacola.length) {
      z.sacola = embaralhar(ids);
      if (z.sacola.length > 1 && z.sacola[0] === z.ultimaDaLista) z.sacola.push(z.sacola.shift());
    }
    id = z.sacola.shift();
  }
  z.ultimaDaLista = id;
  return lista.faixas.find(f => f.id === id);
}

function avancar(z) {
  const proxima = z.fila.length ? z.fila.shift() : z.modo === 'lista' ? proximaDaLista(z) : null;
  z.faixa = proxima ? faixaPublica(proxima) : null;
  z.faixaDesde = proxima ? Date.now() : null;
}

function visao() {
  const lugares = {};
  for (const [id, z] of Object.entries(estado.lugares)) {
    const lista = z.lista ? listaPorId(z.lista) : null;
    let aparelhos = 0;
    for (const c of CANAIS) if (c.aparelho === id) aparelhos++;
    lugares[id] = {
      id, nome: LUGARES[id], modo: z.modo, lista: z.lista, listaNome: lista ? lista.nome : null,
      faixa: z.faixa, faixaDesde: z.faixaDesde, fila: z.fila.map(faixaPublica), aparelhos, erro: z.erro,
    };
  }
  return { agora: Date.now(), lugares };
}

function publicar() {
  const dados = `data: ${JSON.stringify(visao())}\n\n`;
  for (const c of CANAIS) c.res.write(dados);
  avisarMudanca();
}

function mudou() {
  salvar();
  publicar();
}

// Vinheta entrando: quem toca a transmissão já recebe a voz por ela; os outros abaixam a música e tocam o arquivo.
function vinheta(arquivo) {
  const dados = `event: vinheta\ndata: ${JSON.stringify({ url: `/vinhetas-audio/${encodeURIComponent(arquivo)}` })}\n\n`;
  for (const c of CANAIS) if (c.aparelho) c.res.write(dados);
}

// ---------- comandos ----------

const COMANDOS = {
  radio(z) {
    z.modo = 'radio'; z.lista = null; z.fila = []; z.erros = 0; z.erro = null; z.sacola = [];
    avancar(z);
    return { ok: true };
  },
  lista(z, corpo) {
    const lista = listaPorId(corpo.id);
    if (!lista) return { ok: false, erro: 'Essa lista não existe' };
    if (!lista.faixas.length) return { ok: false, erro: 'Essa lista está vazia' };
    z.modo = 'lista'; z.lista = lista.id; z.fila = []; z.erros = 0; z.erro = null; z.sacola = []; z.ultimaDaLista = null;
    avancar(z);
    return { ok: true };
  },
  // Música avulsa: entra depois da que está tocando. No modo rádio não há "depois", então entra na hora.
  pedir(z, corpo) {
    const faixa = acharFaixa(corpo.id);
    if (!arquivoDaFaixa(faixa)) return { ok: false, erro: 'Não achei o arquivo dessa música' };
    z.fila.push({ id: faixa.id, titulo: faixa.titulo, artista: faixa.artista, album: faixa.album, duracao: faixa.duracao });
    z.erros = 0; z.erro = null;
    if (!z.faixa) avancar(z);
    return { ok: true };
  },
  // Pedida pelo botão Pular e pelo aparelho no fim da faixa. "de" é a faixa que estava na tela:
  // dois pedidos ao mesmo tempo não pulam duas músicas.
  proxima(z, corpo) {
    if (!z.faixa) return { ok: false, erro: 'Nada para pular neste lugar' };
    if (corpo.de && corpo.de !== z.faixa.id) return { ok: true, ignorado: true };
    if (corpo.erro) {
      z.erros++;
      if (z.erros >= ERROS_ATE_PARAR) {
        z.faixa = null; z.faixaDesde = null; z.fila = [];
        z.erro = 'O aparelho não conseguiu tocar as últimas músicas';
        return { ok: true };
      }
    } else {
      z.erros = 0;
    }
    avancar(z);
    return { ok: true };
  },
};

// ---------- http ----------

function lerCorpo(req) {
  return new Promise((ok, erro) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', d => {
      texto += d;
      if (texto.length > 4096) { erro(new Error('pedido grande demais')); req.destroy(); }
    });
    req.on('end', () => { try { ok(texto ? JSON.parse(texto) : {}); } catch { erro(new Error('pedido inválido')); } });
    req.on('error', erro);
  });
}

function abrirCanal(req, res, url) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  const pedido = url.searchParams.get('aparelho');
  const canal = { res, aparelho: LUGARES[pedido] ? pedido : null };
  CANAIS.add(canal);
  req.on('close', () => { CANAIS.delete(canal); if (canal.aparelho) publicar(); });
  if (canal.aparelho) publicar(); else res.write(`data: ${JSON.stringify(visao())}\n\n`);
}

function enviarAudio(req, res, arquivo) {
  fs.stat(arquivo, (erro, st) => {
    if (erro || !st.isFile()) { res.writeHead(404); return res.end(); }
    const tipo = TIPOS_AUDIO[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
    const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let inicio = 0, fim = st.size - 1, status = 200;
    if (faixa && (faixa[1] || faixa[2])) {
      if (faixa[1]) { inicio = Number(faixa[1]); if (faixa[2]) fim = Math.min(Number(faixa[2]), fim); }
      else inicio = Math.max(0, st.size - Number(faixa[2]));
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
    leitura.pipe(res);
  });
}

function resumoLista(l) {
  return {
    id: l.id, nome: l.nome, descricao: l.descricao, inicio: l.inicio ?? null, fim: l.fim ?? null, cor: l.cor, cor2: l.cor2, capa: l.capa || null,
    local: !!l.local, totalFaixas: l.faixas.length, duracao: l.faixas.reduce((s, f) => s + (f.duracao || 0), 0),
  };
}

// true = este módulo assumiu o pedido.
function atender(req, res, p, url, serveFile, sendJson, PUBLIC_DIR) {
  // Só uma janela faz som neste PC: uma segunda página aqui somaria dois sons nas caixas.
  if (p === '/som/5') { res.writeHead(302, { location: '/musica/caixa.html' + url.search }); res.end(); return true; }
  if (/^\/som\/[a-z0-9]+$/.test(p) && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!LUGARES[p.slice(5)]) { res.writeHead(404); res.end('Lugar não existe'); return true; }
    serveFile(req, res, path.join(PUBLIC_DIR, 'som.html'));
    return true;
  }
  if (p.startsWith('/som-audio/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return true; }
    const arquivo = arquivoDaFaixa(acharFaixa(p.slice('/som-audio/'.length)));
    if (!arquivo) { res.writeHead(404); res.end(); return true; }
    enviarAudio(req, res, arquivo);
    return true;
  }
  if (p !== '/api/zonas' && !p.startsWith('/api/zonas/')) return false;

  if (req.method === 'GET') {
    if (p === '/api/zonas') sendJson(res, 200, visao());
    else if (p === '/api/zonas/eventos') abrirCanal(req, res, url);
    else if (p === '/api/zonas/listas') sendJson(res, 200, { listas: todasAsListas().map(resumoLista) });
    else if (p === '/api/zonas/busca') sendJson(res, 200, { faixas: buscar(url.searchParams.get('q')) });
    else if (p.startsWith('/api/zonas/lista/')) {
      const lista = listaPorId(p.slice('/api/zonas/lista/'.length));
      if (lista) sendJson(res, 200, { ...resumoLista(lista), faixas: lista.faixas.map(faixaPublica) });
      else sendJson(res, 404, { erro: 'Essa lista não existe' });
    } else sendJson(res, 404, { erro: 'Rota não existe' });
    return true;
  }

  const comando = /^\/api\/zonas\/([a-z0-9]+)\/([a-z]+)$/.exec(p);
  if (req.method !== 'POST' || !comando || !LUGARES[comando[1]] || !Object.hasOwn(COMANDOS, comando[2])) {
    sendJson(res, 404, { erro: 'Rota não existe' });
    return true;
  }
  lerCorpo(req).then(corpo => {
    const resposta = COMANDOS[comando[2]](estado.lugares[comando[1]], corpo);
    if (resposta.ok && !resposta.ignorado) mudou();
    sendJson(res, resposta.ok ? 200 : 400, resposta);
  }).catch(erro => sendJson(res, 400, { ok: false, erro: erro.message }));
  return true;
}

function iniciar() {
  carregar();
  atualizarIndice();
  setInterval(atualizarIndice, SEIS_HORAS).unref();
  // Mantém os canais abertos em redes que derrubam conexão parada.
  setInterval(() => { for (const c of CANAIS) c.res.write(': ping\n\n'); }, 25000).unref();
}

module.exports = { atender, iniciar, vinheta, aoMudar: fn => { avisarMudanca = fn; } };
