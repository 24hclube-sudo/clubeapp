// Servidor do painel: guarda mídias, estado das TVs e fala com os players via WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');
const { criarBalcao, INSTALACOES, VIDEOS_DIR, esquecerVideo } = require('./balcao');
const { criarProgramacao } = require('./programacao');
const radio = require('./radio');
const vinhetas = require('./vinhetas');
const zonas = require('./zonas');
const musica = require('./musica');
const visuaisLed = require('./visuais-led');
const { criarLuzShow, nivelDaFita, corDaFita, forcaDaFita } = require('./luz-show');
const luzShow = criarLuzShow(visuaisLed.paraShow);
const projecoes = require('./projecoes');
const reacoes = require('./reacoes');
const { criarCriacoes } = require('./criacoes-barras');
const { criarEstudio } = require('./painel-estudio');
const { criarSequenciaTv } = require('./sequencia-tv');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const MEDIA_DIR = path.join(ROOT, 'media');
const STATE_FILE = path.join(ROOT, 'state.json');
const CENAS_FILE = path.join(PUBLIC_DIR, 'cenas.json');
const MADMAPPER_FILE = path.join(ROOT, 'madmapper.json');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg'
};

// ---------- estado persistente ----------
// tvs: { [id]: { name, content } }  content = { kind:'single'|'playlist', items:[...], startAt, loop }
// andares: cada andar tem cena ativa, logo+cor e brilho próprios (não sincronizam entre si).
//   { "1": { cena, logoCor, brilho: { master, led, telas, balcao } }, "5": { ... } }
// O brilho efetivo de cada tela é master do andar × grupo dela.
const ANDARES = {
  '1': { nome: '1º andar', grupos: ['led', 'telas', 'balcao'] },
  '5': { nome: '5º andar', grupos: ['painel', 'projetores', 'balcao', 'barras'] },
};
let state = { tvs: {} };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
state.andares = state.andares || {};
// Migração: antes havia um só andar (cena/brilho/logoCor na raiz) = 1º andar.
if (!state.andares['1'] && (state.cena !== undefined || state.brilho)) {
  state.andares['1'] = { cena: state.cena || null, logoCor: state.logoCor || null, brilho: state.brilho || {} };
}
delete state.cena; delete state.brilho; delete state.logoCor;
for (const [a, cfg] of Object.entries(ANDARES)) {
  const atual = state.andares[a] || {};
  const brilho = { master: 100 };
  for (const g of cfg.grupos) brilho[g] = 100;
  state.andares[a] = {
    cena: atual.cena || null, logoCor: atual.logoCor || null,
    // ativo: o que a bancada está seguindo (cena + startAt, ou modo logo). Conteúdo manual
    // do painel do PC não mexe nisso, para a bancada não apagar à toa.
    ativo: atual.ativo || null,
    brilho: { ...brilho, ...(atual.brilho || {}) },
  };
}
// Migração para zonas: cada zona começa com o que o seu andar tinha no ar.
if (!state.zonas) {
  state.zonas = {};
  for (const [id] of Object.entries(state.tvs)) {
    const a = state.andares[(state.tvs[id].andar in ANDARES) ? state.tvs[id].andar : '1'];
    state.zonas['tela:' + id] = { cena: a.cena, logoCor: a.logoCor, cor: null, ativo: null };
  }
  for (const [inst, andar] of [['terreo', '1'], ['sexto', '5'], ['barras', '5']]) {
    const a = state.andares[andar];
    state.zonas['fita:' + inst] = { cena: a.cena, logoCor: a.logoCor, cor: a.balcaoCor || null, ativo: a.ativo || null };
  }
}
for (const a of Object.values(state.andares)) { delete a.cena; delete a.logoCor; delete a.ativo; delete a.balcaoCor; }
// Telas passaram a ser unificadas por tipo ("telas:led:1" etc.): herda o que o painel tinha no ar.
if (state.zonas['tela:led-terreo'] && !state.zonas['telas:led:1']) state.zonas['telas:led:1'] = state.zonas['tela:led-terreo'];
for (const k of Object.keys(state.zonas)) if (k.startsWith('tela:')) delete state.zonas[k];
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {}), 200);
}

// ---------- grupos, brilho e cenas ----------
const GRUPOS = ['led', 'telas', 'balcao', 'painel', 'projetores', 'barras'];

// Grupo vem do ?grupo= do player; telas antigas sem grupo: "led-*" é painel de LED, resto é TV.
function grupoDe(id) {
  const g = state.tvs[id] && state.tvs[id].grupo;
  if (GRUPOS.includes(g)) return g;
  return id.startsWith('led') ? 'led' : 'telas';
}

// Andar vem do ?andar= do player; sem andar = 1º andar.
function andarDe(id) {
  const a = state.tvs[id] && state.tvs[id].andar;
  return ANDARES[a] ? a : '1';
}

// ---------- zonas: cada tela e cada fita é controlada separadamente ----------
// state.zonas["tela:<id>" | "fita:<instalação>"] = { cena, logoCor, cor, ativo }
// Telas: por enquanto unificadas por tipo e andar ("telas:<grupo>:<andar>" = todas as TVs do
// 1º andar juntas, o painel de LED, etc.). Fitas: uma zona por instalação.
const NOME_GRUPO_TELA = { led: 'Painel LED', telas: 'TVs', painel: 'Painel LED', projetores: 'Projetores' };
function listaZonas() {
  const ordemGrupo = { led: 0, painel: 1, telas: 2, projetores: 3 };
  const porZona = {};
  for (const id of Object.keys(state.tvs)) {
    const zid = `telas:${grupoDe(id)}:${andarDe(id)}`;
    (porZona[zid] = porZona[zid] || { id: zid, tipo: 'tela', andar: andarDe(id), grupo: grupoDe(id), telas: [] }).telas.push(id);
  }
  const telas = Object.values(porZona)
    .map(z => ({ ...z, nome: NOME_GRUPO_TELA[z.grupo] || z.grupo, qtd: z.telas.length }))
    .sort((a, b) => (ordemGrupo[a.grupo] ?? 9) - (ordemGrupo[b.grupo] ?? 9));
  const fitas = INSTALACOES.map(i => ({ id: 'fita:' + i.id, tipo: 'fita', andar: i.andar, grupo: i.grupo, nome: i.nome }));
  return [...telas, ...fitas];
}
const telasDaZona = zid => (listaZonas().find(z => z.id === zid) || {}).telas || [];

// Cenas próprias das TVs (verticais; arquivos já girados para o navegador deitado das The Frame).
const CENAS_TV_FILE = path.join(PUBLIC_DIR, 'cenas-tv.json');
function lerCenasTv() { try { return JSON.parse(fs.readFileSync(CENAS_TV_FILE, 'utf8')); } catch { return []; } }

// Cenas generativas do painel do 5º andar (gerador.html desenha ao vivo na GPU deste PC).
function lerCenasGerador() {
  try { return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'cenas-gerador.json'), 'utf8')); } catch { return []; }
}
const ehZonaGerador = zid => zid.startsWith('telas:painel:');

// Animações das fitas: as barras da pista têm lista própria; os balcões compartilham outra.
// Fitas que usam o Estúdio. Comando sem zona, de aparelho com a página antiga aberta, continua indo para as barras.
const fitaDoEstudio = zid => (['fita:barras', 'fita:sexto', 'fita:terreo'].includes(zid) ? zid : 'fita:barras');
function lerAnimacoes(zid) {
  const arq = zid === 'fita:barras' ? 'animacoes-barras.json' : 'animacoes-balcoes.json';
  try { return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, arq), 'utf8')); } catch { return []; }
}

// Efeitos de luz das fitas (lista antiga, mantida como reserva).
function lerCenasFitas() {
  try { return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'cenas-fitas.json'), 'utf8')); } catch { return []; }
}
function zona(zid) {
  state.zonas[zid] = state.zonas[zid] || { cena: null, logoCor: null, cor: null, ativo: null };
  return state.zonas[zid];
}

function telasDoAndar(andar) {
  return Object.keys(state.tvs).filter(id => andarDe(id) === andar);
}

function brilhoEfetivo(andar, grupo) {
  const b = state.andares[andar].brilho;
  return (b.master / 100) * ((b[grupo] ?? 100) / 100);
}

// Arquivo da cena para cada tipo de tela: painel de LED usa "video", TVs usam "tv"
// (arte vertical com a mesma duração), e assim por diante; sem versão própria, usa "video".
function videoDaCena(cena, grupo) {
  const porGrupo = { telas: cena.tv, painel: cena.painel, projetores: cena.projetores };
  return porGrupo[grupo] || cena.video;
}

function lerCenas() {
  try { return JSON.parse(fs.readFileSync(CENAS_FILE, 'utf8')); } catch { return []; }
}

// "/media/v<data do arquivo>/<arquivo>" — mesmo formato usado ao disparar a cena (ver 'cena').
function srcDeMidia(arq) {
  try { return '/media/v' + Math.round(fs.statSync(path.join(MEDIA_DIR, arq)).mtimeMs) + '/' + encodeURIComponent(arq); }
  catch { return null; }
}

// Todos os arquivos de cena que podem ir para esta tela: ela baixa tudo com antecedência
// e as trocas de cena ficam instantâneas (sem streaming nem espera de download).
function arquivosDaTela(id) {
  const g = grupoDe(id);
  if (g === 'painel') return []; // painel do 5º: gerador desenhado ao vivo, sem arquivos
  const arqs = new Set();
  for (const c of (g === 'telas' ? lerCenasTv() : lerCenas())) {
    if (c.apagar) continue;
    if (c.porTela) c.porTela.forEach(a => a && arqs.add(a));
    else { const a = c.imagem || (g === 'telas' ? c.video : videoDaCena(c, g)); if (a) arqs.add(a); }
  }
  if (g === 'telas') prog.arquivosAnuncios().forEach(a => arqs.add(a)); // anúncios já baixados nas TVs
  return [...arqs].map(srcDeMidia).filter(Boolean);
}

function enviarPreBaixar(id) { sendTela(id, { type: 'precache', srcs: arquivosDaTela(id) }); }

// ---------- MadMapper (balcão) via OSC ----------
// madmapper.json: { "host": "127.0.0.1", "porta": 8010, "cenas": { "<id da cena>": "/media/X/assign" } }
function lerMadMapper() {
  try { return JSON.parse(fs.readFileSync(MADMAPPER_FILE, 'utf8')); } catch { return null; }
}

const udp = dgram.createSocket('udp4');
function oscString(s) {
  const b = Buffer.from(s + '\0');
  return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
}
// Mensagem OSC com um float opcional (sem argumento = gatilho "nil").
function enviarOsc(endereco, valor) {
  const mm = lerMadMapper();
  if (!mm || !mm.host || !endereco) return;
  const partes = [oscString(endereco), oscString(valor === undefined ? ',' : ',f')];
  if (valor !== undefined) { const f = Buffer.alloc(4); f.writeFloatBE(valor); partes.push(f); }
  const msg = Buffer.concat(partes);
  udp.send(msg, mm.porta || 8010, mm.host, err => { if (err) console.error('OSC:', err.message); });
}

// ---------- artes enviadas para as TVs ----------
// As The Frame rodam o navegador deitado (1920x1080): a arte (em pé) é ajustada a 1080x1920
// (preenchendo, corta o excesso) e girada 90° para 1920x1080 — na TV em pé ela aparece de pé.
const FFMPEG = path.join(__dirname, '..', 'led-videos', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const { execFile: exec } = require('child_process');
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv'];

function ffmpeg(args) {
  return new Promise((ok, erro) => exec(FFMPEG, ['-y', '-v', 'error', ...args], { windowsHide: true, maxBuffer: 1 << 20 },
    (e, _o, se) => e ? erro(new Error(se || e.message)) : ok()));
}

function salvarCenasTv(cenas) { fs.writeFileSync(CENAS_TV_FILE, JSON.stringify(cenas, null, 2)); }

// Vídeo para as bancadas: reduz o quadro inteiro para a grade da bancada (196×6, média da área)
// e guarda os quadros crus em fitas-video/. Entra nas animações das bancadas (categoria Normais),
// com a prévia animada feita pelo próprio motor (gerar-previas-fitas.js).
function receberVideoFita(req, res, url) {
  const original = String(url.searchParams.get('arquivo') || '');
  const ext = path.extname(original).toLowerCase();
  if (!EXT_VIDEO.includes(ext)) return sendJson(res, 400, { error: 'Envie um vídeo (mp4/mov/webm).' });
  const nome = String(url.searchParams.get('nome') || path.basename(original, ext)).slice(0, 40);
  const id = 'v-' + (nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now());
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const tmp = path.join(VIDEOS_DIR, id + '-original' + ext);
  const out = fs.createWriteStream(tmp);
  req.pipe(out);
  out.on('error', e => sendJson(res, 500, { error: e.message }));
  out.on('finish', async () => {
    const W = 196, H = 6;
    try {
      // (o ffmpeg do Remotion não tem o formato "rawvideo", mas grava os quadros crus via image2pipe)
      const rgb = path.join(VIDEOS_DIR, id + '.rgb');
      await ffmpeg(['-i', tmp, '-an', '-vf', `scale=${W}:${H}:flags=area,format=rgb24`, '-f', 'image2pipe', '-c:v', 'rawvideo', rgb]);
      const info = await new Promise(ok => exec(FFMPEG, ['-hide_banner', '-i', tmp], { windowsHide: true }, (_e, _o, se) => ok(se || '')));
      const fps = parseFloat((/(\d+(?:\.\d+)?) fps/.exec(info) || [])[1]) || 24;
      const quadros = Math.floor(fs.statSync(rgb).size / (W * H * 3));
      if (!quadros) throw new Error('nenhum quadro no vídeo');
      fs.writeFileSync(path.join(VIDEOS_DIR, id + '.json'), JSON.stringify({ largura: W, altura: H, quadros, fps, origem: original }));
      fs.unlinkSync(tmp);
      esquecerVideo(id);
      const arq = path.join(PUBLIC_DIR, 'animacoes-balcoes.json');
      const lista = JSON.parse(fs.readFileSync(arq, 'utf8')).filter(a => a.id !== id);
      const anim = { id, nome, duracao: Math.round(quadros / fps * 1000) / 1000, categoria: 'normal', balcao: { efeito: 'video', video: id } };
      const iApagar = lista.findIndex(a => a.apagar);
      lista.splice(iApagar < 0 ? lista.length : iApagar, 0, anim);
      fs.writeFileSync(arq, JSON.stringify(lista, null, 2));
      // prévia animada + ícone (só das animações que ainda não têm)
      await new Promise(ok => exec(process.execPath, [path.join(__dirname, 'gerar-previas-fitas.js')], { windowsHide: true, cwd: __dirname }, ok));
      console.log(`vídeo para as bancadas: ${nome} (${quadros} quadros a ${fps} fps)`);
      broadcastPanels({ type: 'animacoes-mudaram' });
      sendJson(res, 200, { ok: true, animacao: anim });
    } catch (e) {
      console.error('vídeo fita:', e.message);
      sendJson(res, 500, { error: 'Não consegui converter o vídeo: ' + e.message.slice(0, 200) });
    }
  });
}

function receberArteTv(req, res, url) {
  const original = String(url.searchParams.get('arquivo') || '');
  const ext = path.extname(original).toLowerCase();
  const nome = String(url.searchParams.get('nome') || path.basename(original, ext) || 'Arte').slice(0, 40);
  const imagem = EXT_IMAGEM.includes(ext), video = EXT_VIDEO.includes(ext);
  if (!imagem && !video) return sendJson(res, 400, { error: 'Envie uma imagem (png/jpg/webp) ou um vídeo (mp4/mov/webm).' });
  const id = 'arte-' + Date.now();
  const tmp = path.join(MEDIA_DIR, id + '-original' + ext);
  const out = fs.createWriteStream(tmp);
  req.pipe(out);
  out.on('error', e => sendJson(res, 500, { error: e.message }));
  out.on('finish', async () => {
    // (o ffmpeg do Remotion não tem "pad": a arte preenche a tela e o excesso das bordas é cortado)
    const enquadrar = 'scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920';
    const destino = 'tv-' + id + (imagem ? '.jpg' : '.mp4');
    // Duas versões: em pé (app declarado em pé) e girada "-deitado" (navegador deitado);
    // o player escolhe pela forma da tela.
    const deitado = destino.replace(/\.(jpg|mp4)$/, '-deitado.$1');
    try {
      for (const [vf, arq] of [[enquadrar, destino], [enquadrar + ',transpose=2', deitado]]) {
        if (imagem) await ffmpeg(['-i', tmp, '-vf', vf, '-frames:v', '1', '-q:v', '2', path.join(MEDIA_DIR, arq)]);
        else await ffmpeg(['-i', tmp, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
          '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-an', '-movflags', '+faststart', path.join(MEDIA_DIR, arq)]);
      }
      // ícone em pé (como aparece na TV)
      await ffmpeg(['-i', tmp, '-frames:v', '1', '-vf', 'scale=270:480:force_original_aspect_ratio=increase,crop=270:480',
        path.join(PUBLIC_DIR, 'cenas', id + '.png')]);
      const cenas = lerCenasTv();
      const cena = { id, nome, [imagem ? 'imagem' : 'video']: destino, thumb: 'cenas/' + id + '.png', enviada: true };
      const iApagar = cenas.findIndex(c => c.apagar);
      cenas.splice(iApagar < 0 ? cenas.length : iApagar, 0, cena);
      salvarCenasTv(cenas);
      console.log(`arte enviada para as TVs: ${nome} (${destino})`);
      broadcastPanels({ type: 'cenas-mudaram' }); Object.keys(state.tvs).forEach(enviarPreBaixar);
      sendJson(res, 200, { ok: true, cena });
    } catch (e) {
      console.error('arte:', e.message);
      sendJson(res, 500, { error: 'Não consegui converter a arte: ' + e.message.slice(0, 200) });
    } finally {
      fs.unlink(tmp, () => {});
    }
  });
}

function apagarArteTv(res, id) {
  const cenas = lerCenasTv();
  const cena = cenas.find(c => c.id === id && c.enviada);
  if (!cena) return sendJson(res, 404, { error: 'arte não encontrada' });
  salvarCenasTv(cenas.filter(c => c !== cena));
  const arq = cena.imagem || cena.video;
  for (const f of [path.join(MEDIA_DIR, arq), path.join(MEDIA_DIR, arq.replace(/\.(jpg|mp4)$/, '-deitado.$1')), path.join(PUBLIC_DIR, cena.thumb)]) fs.unlink(f, () => {});
  broadcastPanels({ type: 'cenas-mudaram' }); Object.keys(state.tvs).forEach(enviarPreBaixar);
  sendJson(res, 200, { ok: true });
}

// ---------- helpers HTTP ----------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function safeName(name) {
  return path.basename(String(name || '')).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 120);
}

// Serve arquivo com suporte a Range (necessário para vídeo)
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
    if (file.startsWith(PUBLIC_DIR)) headers['Cache-Control'] = 'no-cache';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (start >= st.size || end >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
}

function listMedia() {
  return fs.readdirSync(MEDIA_DIR)
    .filter(f => MIME[path.extname(f).toLowerCase()])
    .map(f => {
      const ext = path.extname(f).toLowerCase();
      const kind = MIME[ext].startsWith('video/') ? 'video' : 'image';
      return { name: f, kind, src: '/media/' + encodeURIComponent(f), size: fs.statSync(path.join(MEDIA_DIR, f)).size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  if (vinhetas.atender(req, res, p, serveFile, sendJson)) return;
  if (zonas.atender(req, res, p, url, serveFile, sendJson, PUBLIC_DIR)) return; // música por andar
  if (musica.atender(req, res, p)) return;
  if (reacoes.atender(req, res, p, sendJson)) return; // o que reage a quê
  if (criacoes.atender(req, res, p, sendJson)) return; // modelos criados para as barras
  if (projecoes.atender(req, res, p, url, sendJson)) return; // Resolume dos projetores
  if (painelEstudio.atender(req, res, p, url, sendJson)) return; // estúdio do painel do 1º andar
  if (luzShow.atender(req, res, p, url, sendJson)) return; // botões de flash
  if (visuaisLed.atender(req, res, p, url, sendJson)) return;
  if (balcao.audio.atender(req, res, p, sendJson)) return; // monitoração do áudio das barras
  if (prog.atenderHttp(req, res, url, p)) return; // anúncios da programação
  if (p === '/api/media' && req.method === 'GET') return sendJson(res, 200, listMedia());
  if (p === '/api/telas' && req.method === 'GET') return sendJson(res, 200, { andares: estadoMsg().andares, telas: tvList() });

  // Arte enviada pelo controle para as TVs: vira uma cena da lista das TVs.
  if (p === '/api/arte-tv' && req.method === 'POST') return receberArteTv(req, res, url);
  if (p === '/api/video-fita' && req.method === 'POST') return receberVideoFita(req, res, url);
  if (p.startsWith('/api/arte-tv/') && req.method === 'DELETE') return apagarArteTv(res, decodeURIComponent(p.slice('/api/arte-tv/'.length)));

  if (p === '/api/media' && req.method === 'POST') {
    const name = safeName(url.searchParams.get('name'));
    if (!name || !MIME[path.extname(name).toLowerCase()]) return sendJson(res, 400, { error: 'tipo de arquivo não suportado' });
    const out = fs.createWriteStream(path.join(MEDIA_DIR, name));
    req.pipe(out);
    out.on('finish', () => { sendJson(res, 200, { ok: true, name }); broadcastPanels({ type: 'media', media: listMedia() }); });
    out.on('error', e => sendJson(res, 500, { error: e.message }));
    return;
  }

  if (p.startsWith('/api/media/') && req.method === 'DELETE') {
    const name = safeName(p.slice('/api/media/'.length));
    fs.unlink(path.join(MEDIA_DIR, name), err => {
      sendJson(res, err ? 404 : 200, { ok: !err });
      broadcastPanels({ type: 'media', media: listMedia() });
    });
    return;
  }

  if (p.startsWith('/media/')) return serveFile(req, res, path.join(MEDIA_DIR, safeName(p.slice(7))));

  // / e /celular = app novo (celular e PC); /painel = painel antigo
  let file = p === '/' || p === '/celular' ? '/celular.html' : p === '/painel' ? '/panel.html' : p;
  file = path.normalize(path.join(PUBLIC_DIR, file));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  serveFile(req, res, file);
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });
// id -> Set de conexões. Mais de um aparelho pode abrir a mesma tela (ex.: o painel
// de LED de verdade + a pré-visualização do ViPlex); todos recebem o mesmo conteúdo.
// Antes, a conexão nova derrubava a antiga e os dois ficavam se derrubando em loop.
const players = new Map();
const panels = new Set();

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function sendTela(id, msg) { for (const ws of players.get(id) || []) send(ws, msg); }
function broadcastPanels(msg) { for (const ws of panels) send(ws, msg); }

// Rádio CLUBE no app: o que está tocando (a cada 5 s, só com algum controle aberto) e o botão Pular.
let radioAgora = null;
async function atualizarRadio() {
  const r = await radio.tocando();
  if (JSON.stringify(r) === JSON.stringify(radioAgora)) return;
  radioAgora = r;
  broadcastPanels({ type: 'radio', ...r });
}
setInterval(() => { if (panels.size) atualizarRadio(); }, 5000);

function tvList() {
  return Object.entries(state.tvs).map(([id, tv]) => ({
    id, name: tv.name, grupo: grupoDe(id), andar: andarDe(id), content: tv.content || null, online: players.has(id),
    conexoes: players.has(id) ? players.get(id).size : 0,
    aparelhos: players.has(id) ? [...players.get(id)].map(w => ({ ip: w.info.ip, status: w.status || null })) : [],
    info: tv.info || null
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }));
}

function pushTvs() { broadcastPanels({ type: 'tvs', tvs: tvList() }); }

// Vigia das TVs Samsung: se o player de uma TV cair (app fechado ou escondido atrás do
// Modo Arte), reabre o app pela API de controle da TV (porta 8001), sem ninguém no local.
const APP_TV = 'TvPlyr0001.TvPlayer';
setInterval(() => {
  for (const [id, tv] of Object.entries(state.tvs)) {
    const ip = tv.info && tv.info.ip;
    if (!ip || !(tv.info.app === 'tizen')) continue;
    const abrir = motivo => {
      // Se a API recusar (ex.: 401) ou não responder, abre pela conexão de desenvolvedor (sdb).
      // (.bat só roda pelo cmd.exe: chamado direto, o Node 24 lança EINVAL e derrubava o servidor)
      const plano_b = () => {
        try {
          exec('cmd.exe', ['/d', '/c', 'C:\\tizen-studio\\tools\\ide\\bin\\tizen.bat', 'run', '-p', APP_TV, '-s', ip + ':26101'],
            { windowsHide: true }, e => console.log(`vigia: ${tv.name} reaberto via sdb ${e ? '(falhou)' : ''}`));
        } catch (e) { console.log(`vigia: ${tv.name} sdb não abriu (${e.message})`); }
      };
      const req = http.request({ host: ip, port: 8001, path: '/api/v2/applications/' + APP_TV, method: 'POST', timeout: 5000 }, r => {
        r.resume();
        console.log(`vigia: ${tv.name} ${motivo} — reabri o app (${r.statusCode})`);
        if (r.statusCode !== 200) plano_b();
      });
      req.on('error', plano_b); req.on('timeout', () => req.destroy());
      req.end();
    };
    if (!players.has(id)) { abrir('estava sem player'); continue; }
    // Conectado mas escondido (Modo Arte da The Frame, menu, outra entrada): a TV mostra outra
    // coisa enquanto o player segue "online". Traz o app de volta para a frente.
    const req = http.get({ host: ip, port: 8001, path: '/api/v2/applications/' + APP_TV, timeout: 5000 }, r => {
      let s = ''; r.on('data', d => { s += d; });
      r.on('end', () => { try { const a = JSON.parse(s); if (a.running && a.visible === false) abrir('estava com o app escondido'); } catch {} });
    });
    req.on('error', () => {}); req.on('timeout', () => req.destroy());
  }
}, 60000);

// Versão do controle (início do servidor + data do celular.html). Quando muda, as páginas
// abertas se recarregam sozinhas — assim nenhum aparelho fica com página velha travada.
const INICIO = Date.now();
function versaoControle() {
  let m = 0;
  for (const arq of ['celular.html', 'programacao-app.js', 'programacao.css', 'ambiente.js']) {
    try { m = Math.max(m, fs.statSync(path.join(PUBLIC_DIR, arq)).mtimeMs); } catch {}
  }
  return INICIO + ':' + Math.round(m);
}
let ultimaVersao = versaoControle();
setInterval(() => {
  const v = versaoControle();
  if (v !== ultimaVersao) { ultimaVersao = v; broadcastPanels({ type: 'versao', v }); }
}, 3000);

function estadoMsg() {
  const andares = {};
  const ext = balcao.externos();
  for (const [a, cfg] of Object.entries(ANDARES)) andares[a] = { ...cfg, ...state.andares[a], externo: ext[a] || null };
  // Zonas com o que está no ar em cada uma (sem o "ativo" interno, que é só do motor).
  const zonas = listaZonas().map(z => {
    const { ativo, ...resto } = zona(z.id);
    return { ...z, ...resto, prog: prog.daZona(z.id) };
  });
  return { type: 'estado', andares, zonas, balcao: balcao.status() };
}

// Fitas de LED via Art-Net (balcao.js): bancada do 1º andar, bancada do 5º e barras,
// cada uma seguindo a cena da SUA zona.
// ---------- programação circadiana (programacao.js) ----------
// É uma camada: enquanto uma zona a segue, o conteúdo manual dela fica guardado em state, sem mexer.
const zonaDaTela = id => `telas:${grupoDe(id)}:${andarDe(id)}`;
function conteudoEfetivo(id) { return prog.segue(zonaDaTela(id)) ? prog.conteudo(id) : state.tvs[id].content; }
const prog = criarProgramacao({
  zonaDaTela,
  telasDaZona: zid => telasDaZona(zid).sort((a, b) => (state.tvs[a].name || a).localeCompare(state.tvs[b].name || b, 'pt', { numeric: true })),
  enviarTela: (id, msg) => sendTela(id, msg),
  aoMudarConteudo: () => {
    // o player ignora conteúdo igual ao que já está na tela, então reenviar não reinicia nada
    for (const id of Object.keys(state.tvs)) {
      if (prog.ZONAS.some(z => z.id === zonaDaTela(id))) sendTela(id, { type: 'content', content: conteudoEfetivo(id) });
    }
  },
  aoMudarEstado: () => pushEstado(),
  aoMudarArquivos: () => Object.keys(state.tvs).forEach(enviarPreBaixar),
  publicar: msg => broadcastPanels(msg),
  srcDeMidia, ffmpeg, sendJson, MEDIA_DIR, PUBLIC_DIR,
  lerDuracao: arq => new Promise(ok => exec(FFMPEG, ['-hide_banner', '-i', arq], { windowsHide: true }, (_e, _o, se) => {
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(se || '');
    ok(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null);
  })),
});

const balcao = criarBalcao({
  flash: nivelDaFita,
  corFlash: corDaFita,
  forcaFlash: forcaDaFita,
  estado: instalacao => {
    try { const p = prog.estadoFita(instalacao, Date.now()); if (p) return p; } catch (e) { console.log('programação (fitas):', e.message); }
    return zona('fita:' + instalacao);
  },
  brilho: (andar, grupo) => brilhoEfetivo(andar, grupo),
});
// Avisa o celular quando uma controladora cai/volta.
let ultimoStatusBalcao = '';
setInterval(() => {
  const s = JSON.stringify(balcao.status());
  if (s !== ultimoStatusBalcao) { ultimoStatusBalcao = s; pushEstado(); }
}, 2000);
function pushEstado() { broadcastPanels(estadoMsg()); }
// Modelos que o usuário cria para as barras: a lista dos apps abertos se atualiza sozinha.
const criacoes = criarCriacoes({ dir: ROOT, publico: PUBLIC_DIR, temEfeito: nome => balcao.temEfeito(nome), avisar: () => broadcastPanels({ type: 'animacoes-mudaram' }), noAr: zid => { const z = zona(fitaDoEstudio(zid)); return { cena: z.cena || null, balcao: z.ativo && z.ativo.cena ? z.ativo.cena.balcao : null }; } });
// Sincronia: o que não passa pelo "estado" também avisa todos os apps abertos.
visuaisLed.aoMudar(m => broadcastPanels({ type: 'visuais', ...m }));
const sequenciaTv = criarSequenciaTv({ mediaDir: MEDIA_DIR });
const painelEstudio = criarEstudio({ dir: ROOT, publico: PUBLIC_DIR, media: MEDIA_DIR, porta: () => PORT, lerCenas,
  visualNoAr: () => visuaisLed.paraShow.pedir('GET', '/estado', 2000).then(s => (s && s.noAr ? s.visual : null)),
  noPainel: () => zona('telas:led:1').cena || null });
zonas.aoMudar(() => broadcastPanels({ type: 'zonas' }));
musica.aoMudar(m => { if (m.caixa) broadcastPanels({ type: 'zonas' }); });

function enviarBrilho(id) { sendTela(id, { type: 'brilho', valor: brilhoEfetivo(andarDe(id), grupoDe(id)) }); }

function aplicarBrilho(andar) {
  for (const id of telasDoAndar(andar)) enviarBrilho(id);
  // Balcão do 1º andar via MadMapper (quando configurado em madmapper.json).
  const mm = lerMadMapper();
  if (andar === '1') enviarOsc(mm && (mm.enderecoBrilho || '/master/master_level'), brilhoEfetivo('1', 'balcao'));
}

// Andar dos comandos do celular; os antigos (sem andar) valem para o 1º andar.
function andarDoComando(m) { return ANDARES[m.andar] ? m.andar : '1'; }

// Ao mexer manualmente numa tela (painel do PC), o andar dela sai da cena ativa.
function sairDaCena(ids) {
  for (const id of ids) { zona(`telas:${grupoDe(id)}:${andarDe(id)}`).cena = null; prog.assumirManual(`telas:${grupoDe(id)}:${andarDe(id)}`); }
}

function definirConteudo(ids, content) {
  for (const id of ids) {
    state.tvs[id].content = content;
    sendTela(id, { type: 'content', content });
  }
}

function resolveTargets(targets) {
  if (targets === 'all') return Object.keys(state.tvs);
  return (targets || []).filter(id => state.tvs[id]);
}

wss.on('connection', (ws, req) => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    // relógio para sincronizar os players
    if (m.type === 'ping') return send(ws, { type: 'pong', t0: m.t0, ts: Date.now() });

    if (m.type === 'hello-player') {
      const id = String(m.id || '').slice(0, 80);
      if (!id) return;
      ws.role = 'player'; ws.id = id;
      ws.info = { ...(m.info || {}), ip: req.socket.remoteAddress.replace('::ffff:', '') };
      if (!players.has(id)) players.set(id, new Set());
      players.get(id).add(ws);
      console.log(`tela conectada: ${id} de ${ws.info.ip} (${players.get(id).size} conexão/ões)`);
      if (!state.tvs[id]) state.tvs[id] = { name: m.name || ('TV ' + id.slice(-4)), content: null };
      state.tvs[id].info = ws.info;
      if (GRUPOS.includes(ws.info.grupo)) state.tvs[id].grupo = ws.info.grupo;
      if (ANDARES[ws.info.andar]) state.tvs[id].andar = ws.info.andar;
      save();
      send(ws, { type: 'welcome', name: state.tvs[id].name });
      enviarBrilho(id);
      const zv = state.zonas[`telas:${grupoDe(id)}:${andarDe(id)}`];
      if (zv && zv.velocidade) send(ws, { type: 'velocidade', valor: zv.velocidade });
      if (zv && zv.bpm) send(ws, { type: 'bpm', bpm: zv.bpm, batidaAt: zv.batidaAt || 0 });
      if (zv && zv.paleta) send(ws, { type: 'paleta', paleta: zv.paleta });
      if (zv && zv.audio) send(ws, { type: 'audio', ...zv.audio });
      const conteudoInicial = conteudoEfetivo(id);
      if (conteudoInicial) send(ws, { type: 'content', content: conteudoInicial });
      const anuncioNoAr = prog.anuncioPara(id);
      if (anuncioNoAr) send(ws, anuncioNoAr);
      send(ws, { type: 'precache', srcs: arquivosDaTela(id) });
      return pushTvs();
    }

    if (m.type === 'status' && ws.role === 'player') {
      ws.status = m.status;
      // o app mostra ao vivo o que o gerador está ouvindo (BPM detectado etc.)
      if (ws.info.app === 'gerador') pushTvs();
      return;
    }

    if (m.type === 'hello-panel') {
      ws.role = 'panel'; panels.add(ws);
      send(ws, { type: 'versao', v: versaoControle() });
      console.log(`controle conectado de ${req.socket.remoteAddress.replace('::ffff:', '')}`);
      send(ws, { type: 'tvs', tvs: tvList() });
      send(ws, prog.publico());
      send(ws, estadoMsg());
      if (radioAgora) send(ws, { type: 'radio', ...radioAgora }); else atualizarRadio();
      return send(ws, { type: 'media', media: listMedia() });
    }

    if (ws.role !== 'panel') return;

    // Rádio: pular a música no ar (expectId = a música que o celular estava vendo).
    if (m.type === 'radio-pular') {
      const quem = req.socket.remoteAddress.replace('::ffff:', '');
      radio.pular(typeof m.expectId === 'string' ? m.expectId : null)
        .then(r => {
          console.log(`rádio: pular pedido de ${quem} → ${r.ok ? 'pulou' : r.erro}`);
          send(ws, { type: 'radio-pulou', ...r });
          setTimeout(atualizarRadio, 1500);
        })
        .catch(e => {
          console.log(`rádio: pular pedido de ${quem} falhou: ${e.message}`);
          send(ws, { type: 'radio-pulou', ok: false, erro: 'Não consegui falar com a rádio' });
        });
      return;
    }

    // ---- Zonas independentes: cada tela e cada fita tem cena / logo+cor / cor próprias. ----
    // m.zona: "tela:<id>", "fita:<instalação>" ou "todas" (todas as zonas do m.andar).
    // Comandos antigos sem zona valem para todas as zonas do andar.
    const zonasDoComando = () => {
      if (m.targets) return resolveTargets(m.targets).map(id => 'tela:' + id); // teste numa tela só
      const andar = andarDoComando(m);
      if (!m.zona || m.zona === 'todas') return listaZonas().filter(z => z.andar === andar).map(z => z.id);
      return listaZonas().some(z => z.id === m.zona) ? [m.zona] : [];
    };

    // Programação circadiana: comandos da tela Programação do app.
    if (m.type === 'prog') { try { prog.comando(m); } catch (e) { console.log('programação:', e.message); } return; }
    // Escolher cena, cor ou logo numa zona tira só ela da programação (até o horário de retorno).
    if (['cena', 'logo', 'balcao-cor'].includes(m.type)) for (const zid of zonasDoComando()) prog.assumirManual(zid);

    // Cena: cada tela recebe a sua versão (painel = faixa, TV = vertical) e cada fita o seu
    // movimento; zonas disparadas juntas ("todas") compartilham o startAt → loops fecham juntos.
    if (m.type === 'cena') {
      const startAt = Date.now() + 800; // folga para todos receberem antes de começar
      for (const zid of zonasDoComando()) {
        const z = zona(zid);
        if (zid.startsWith('fita:')) {
          // Fitas: efeitos de luz próprios (cenas-fitas.json); aceita também as cenas de vídeo.
          const efeito = lerAnimacoes(zid).find(c => c.id === m.id) || lerCenasFitas().find(c => c.id === m.id) || lerCenas().find(c => c.id === m.id);
          if (!efeito) continue;
          z.ativo = { tipo: 'cena', cena: efeito, startAt };
        } else {
          // TVs têm lista própria (cenas-tv.json); painéis de LED usam as cenas de vídeo.
          const ehTv = zid.startsWith('telas:telas:') || (zid.startsWith('tela:') && grupoDe(zid.slice(5)) === 'telas');
          // Sequência (só TVs): várias cenas tocando uma depois da outra, em loop, juntas em todas as TVs.
          if (ehTv && m.id === 'sequencia') {
            const lista = sequenciaTv.escolher(lerCenasTv(), m.sequencia);
            if (!lista.length) continue;
            const idsSeq = zid.startsWith('tela:') ? [zid.slice(5)] : telasDaZona(zid)
              .sort((a, b) => (state.tvs[a].name || a).localeCompare(state.tvs[b].name || b, 'pt', { numeric: true }));
            idsSeq.forEach((id, i) => { const c = sequenciaTv.conteudo(lista, i, startAt, srcDeMidia); if (c) definirConteudo([id], c); });
            z.cena = 'sequencia'; z.sequencia = lista.map(c => c.id); z.cor = null;
            continue;
          }
          const cena =(ehZonaGerador(zid) ? lerCenasGerador() : ehTv ? lerCenasTv() : lerCenas()).find(c => c.id === m.id);
          if (!cena) continue;
          const ids = zid.startsWith('tela:') ? [zid.slice(5)] : telasDaZona(zid)
            .sort((a, b) => (state.tvs[a].name || a).localeCompare(state.tvs[b].name || b, 'pt', { numeric: true }));
          if (ehZonaGerador(zid)) {
            definirConteudo(ids, cena.apagar ? { kind: 'blank' } : { kind: 'gerador', cena, startAt });
            z.cena = m.id; z.cor = null;
            continue;
          }
          ids.forEach((id, i) => {
            if (cena.apagar) { definirConteudo([id], { kind: 'blank' }); return; } // tela preta de propósito
            // "alternado": TVs vizinhas defasadas meio ciclo (uma mostra CLUBE enquanto a outra mostra NO ALTO).
            const inicio = cena.alternado && i % 2 ? startAt - (cena.duracao || 0) * 500 : startAt;
            // "/media/v<data do arquivo>/<arquivo>": se o arquivo for refeito com o mesmo nome, as TVs
            // baixam de novo. A versão vai no caminho (não em "?v="), porque o player de vídeo da
            // Samsung não abre endereços que não terminam na extensão. O servidor ignora a pasta v….
            // "porTela": uma arte fixa por TV, alternando em ordem (TV Bar 1 = 1ª, TV Bar 2 = 2ª, ...).
            const arq = cena.porTela ? cena.porTela[i % cena.porTela.length]
              : cena.imagem || (ehTv ? cena.video : videoDaCena(cena, grupoDe(id)));
            let v = 0; try { v = Math.round(fs.statSync(path.join(MEDIA_DIR, arq)).mtimeMs); } catch {}
            const src = '/media/v' + v + '/' + encodeURIComponent(arq);
            const item = /\.(jpe?g|png|webp)$/i.test(arq)
              ? { kind: 'image', src, name: arq, duration: 3600 }
              : { kind: 'video', src, name: arq, muted: true };
            definirConteudo([id], { kind: 'single', loop: true, sync: true, startAt: inicio, items: [item] });
          });
        }
        z.cena = m.id; z.cor = null; delete z.sequencia;
      }
      save(); pushTvs(); return pushEstado();
    }

    // Modo "logo + cor": logo passando sobre uma cor de fundo (nas telas é desenhado ao vivo;
    // nas fitas vira fundo na cor + faixa na cor do logo).
    if (m.type === 'logo') {
      const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : null;
      const fundo = hex(m.fundo);
      const logo = ['branco', 'preto', 'metal'].includes(m.logo) ? m.logo : 'branco';
      const marca = ['clube', 'noalto'].includes(m.marca) ? m.marca : 'clube';
      if (!fundo) return;
      const startAt = Date.now();
      for (const zid of zonasDoComando()) {
        const z = zona(zid);
        if (zid.startsWith('tela:')) definirConteudo([zid.slice(5)], { kind: 'logo', fundo, logo, marca, startAt });
        else if (zid.startsWith('telas:')) definirConteudo(telasDaZona(zid), { kind: 'logo', fundo, logo, marca, startAt });
        else z.ativo = { tipo: 'logo', fundo, logo, marca, startAt };
        z.logoCor = { fundo, logo, marca }; z.cena = 'logo-cor'; z.cor = null;
      }
      save(); pushTvs(); return pushEstado();
    }

    // Velocidade (0,25× a 4×) das telas de uma zona: vídeos tocam mais rápido/devagar e os
    // logos do modo "logo + cor" passam mais rápido/devagar. Fica guardada na zona.
    if (m.type === 'velocidade') {
      const valor = Math.max(0.25, Math.min(4, Number(m.valor) || 1));
      for (const zid of zonasDoComando()) {
        const z = zona(zid), antes = z.velocidade || 1;
        z.velocidade = valor;
        if (zid.startsWith('fita:')) {
          // Recalcula o início para a animação continuar do mesmo ponto (sem pulo).
          const a = z.ativo;
          if (a && a.startAt && !(a.cena && a.cena.batidas)) { const agora = Date.now(); a.startAt = agora - (agora - a.startAt) * antes / valor; }
        } else {
          for (const id of zid.startsWith('tela:') ? [zid.slice(5)] : telasDaZona(zid)) sendTela(id, { type: 'velocidade', valor });
        }
      }
      save(); return pushEstado();
    }

    // BPM das animações de pista (fitas). Com "msDesdeToque" (botão Toque no ritmo), a
    // batida 1 do ciclo fica alinhada com o último toque.
    if (m.type === 'bpm') {
      const bpm = Math.max(40, Math.min(220, Math.round(Number(m.bpm) * 10) / 10 || 120));
      for (const zid of zonasDoComando().filter(z => z.startsWith('fita:'))) {
        const z = zona(zid), antes = z.bpm || 120, a = z.ativo, agora = Date.now();
        z.bpm = bpm;
        if (a && a.cena && a.cena.batidas) {
          if (m.msDesdeToque != null) a.startAt = agora - Math.max(0, Math.min(5000, Number(m.msDesdeToque)));
          else a.startAt = agora - (agora - a.startAt) * antes / bpm;
        }
      }
      // Gerador do painel: a batida 1 fica em "batidaAt" (relógio do servidor); ao mudar só o
      // BPM, recalcula para a batida continuar do mesmo ponto.
      for (const zid of zonasDoComando().filter(ehZonaGerador)) {
        const z = zona(zid), antes = z.bpm || 120, agora = Date.now();
        if (m.msDesdeToque != null) z.batidaAt = agora - Math.max(0, Math.min(5000, Number(m.msDesdeToque)));
        else z.batidaAt = agora - (agora - (z.batidaAt || agora)) * antes / bpm;
        z.bpm = bpm;
        for (const id of telasDaZona(zid)) sendTela(id, { type: 'bpm', bpm, batidaAt: z.batidaAt });
      }
      save(); return pushEstado();
    }

    // Paleta da identidade no gerador do painel (null = a de cada cena).
    if (m.type === 'paleta') {
      const paleta = ['vermelho', 'azul', 'verde', 'prata', 'ambar'].includes(m.paleta) ? m.paleta : null;
      for (const zid of zonasDoComando().filter(ehZonaGerador)) {
        zona(zid).paleta = paleta;
        for (const id of telasDaZona(zid)) sendTela(id, { type: 'paleta', paleta });
      }
      save(); return pushEstado();
    }

    // Áudio reativo do gerador: liga a escuta da entrada de som do PC e a sensibilidade (0,2×–4×).
    if (m.type === 'audio') {
      for (const zid of zonasDoComando().filter(ehZonaGerador)) {
        const z = zona(zid);
        z.audio = { ligado: m.ligado != null ? !!m.ligado : !!(z.audio && z.audio.ligado),
          ganho: Math.max(0.2, Math.min(4, Number(m.ganho) || (z.audio && z.audio.ganho) || 1)) };
        for (const id of telasDaZona(zid)) sendTela(id, { type: 'audio', ...z.audio });
      }
      save(); return pushEstado();
    }

    // Criador de animações das barras: prévia só para quem está criando, ou direto nas barras.
    if (m.type === 'rascunho-barras') {
      balcao.rascunho(ws, m.cena ? criacoes.limpar(m.cena) : null, msg => send(ws, msg), fitaDoEstudio(m.zona).slice(5));
      return;
    }
    if (m.type === 'rascunho-nas-barras') {
      const limpo = criacoes.limpar(m.cena);
      if (!limpo) return;
      const zid = fitaDoEstudio(m.zona);
      prog.assumirManual(zid);
      const z = zona(zid);
      z.ativo = { tipo: 'cena', cena: { id: 'criacao', nome: 'Criação em teste', duracao: 8, balcao: limpo }, startAt: Date.now() };
      z.cena = 'Criação em teste'; z.cor = null;
      save(); return pushEstado();
    }

    // Fitas: prévia no celular, liga/desliga a saída Art-Net, teste de direção.
    if (m.type === 'balcao-previa') {
      if (ws.pararPrevia) { ws.pararPrevia(); ws.pararPrevia = null; }
      if (m.ligado) ws.pararPrevia = balcao.ouvir(msg => send(ws, msg));
      return;
    }
    const instalacao = m.id || 'terreo'; // comandos antigos (sem id) = bancada do térreo
    if (m.type === 'balcao-saida') { balcao.ligarSaida(instalacao, m.ligada); console.log(`${instalacao}: saída ${m.ligada ? 'LIGADA' : 'desligada'}`); return pushEstado(); }
    if (m.type === 'balcao-teste') { balcao.testar(instalacao, m.ligado); return pushEstado(); }
    // Cor fixa (ex.: "Filamento") nas fitas da zona escolhida (ou todas as fitas do andar).
    if (m.type === 'balcao-cor') {
      const cor = /^#[0-9a-f]{6}$/i.test(m.cor || '') ? m.cor.toLowerCase() : null;
      if (!cor) return;
      for (const zid of zonasDoComando().filter(z => z.startsWith('fita:'))) {
        const z = zona(zid);
        // respirar: a cor sobe e desce devagar (chave na aba Cores)
        z.ativo = { tipo: 'cor', cor, respirar: !!m.respirar, startAt: Date.now() };
        z.cor = cor; z.respirar = !!m.respirar; z.cena = null;
      }
      save(); return pushEstado();
    }
    // "Cor da saída" das fitas (como o Group Settings do MadMapper): opacidade e R/G/B, 0–100,
    // por cima do que estiver no ar. Manda só o que mudou; "zerar" volta tudo a 100.
    if (m.type === 'filtro') {
      for (const zid of zonasDoComando().filter(z => z.startsWith('fita:'))) {
        const z = zona(zid);
        const fl = m.zerar ? {} : { ...(z.filtro || {}) };
        for (const k of ['opacidade', 'r', 'g', 'b']) {
          const v = Number(m[k]);
          if (m[k] != null && Number.isFinite(v)) fl[k] = Math.round(Math.max(0, Math.min(100, v)));
        }
        z.filtro = { opacidade: 100, r: 100, g: 100, b: 100, ...fl };
      }
      save(); return pushEstado();
    }

    // Quem manda no andar: o app ou outro programa (ex.: 5º no MadMapper). Enquanto for de outro
    // programa, o app segue mostrando e guardando as escolhas, mas não manda nada para as fitas.
    if (m.type === 'balcao-apagar' && ANDARES[m.andar]) { balcao.apagarAndar(m.andar); return; }
    if (m.type === 'andar-externo' && ANDARES[m.andar]) {
      balcao.definirExterno(m.andar, m.nome || null);
      console.log(`${ANDARES[m.andar].nome}: ${m.nome ? 'no ' + m.nome : 'de volta no app'}`);
      return pushEstado();
    }

    if (m.type === 'brilho') {
      const andar = andarDoComando(m);
      const brilho = state.andares[andar].brilho;
      if (!(m.grupo in brilho)) return;
      brilho[m.grupo] = Math.max(0, Math.min(100, Math.round(Number(m.valor) || 0)));
      aplicarBrilho(andar);
      save(); return pushEstado();
    }

    // comandos do painel
    if (m.type === 'play') {
      // m.items: [{kind:'image'|'video'|'url', src, duration?, muted?}]  — 1 item = conteúdo fixo
      const items = (m.items || []).filter(i => i && i.src && ['image', 'video', 'url'].includes(i.kind));
      if (!items.length) return;
      const content = {
        kind: items.length > 1 ? 'playlist' : 'single',
        items, loop: m.loop !== false,
        startAt: Date.now() + 1500 // todos começam juntos
      };
      const alvos = resolveTargets(m.targets);
      definirConteudo(alvos, content);
      // Conteúdo manual (painel do PC) tira o andar da cena ativa.
      sairDaCena(alvos);
      save(); pushTvs(); return pushEstado();
    }

    if (m.type === 'stop') {
      const alvos = resolveTargets(m.targets);
      definirConteudo(alvos, null);
      sairDaCena(alvos);
      save(); pushTvs(); return pushEstado();
    }

    if (m.type === 'identify') {
      for (const id of resolveTargets(m.targets)) sendTela(id, { type: 'identify', name: state.tvs[id].name });
      return;
    }

    if (m.type === 'rename' && state.tvs[m.id]) {
      state.tvs[m.id].name = String(m.name || '').slice(0, 60) || state.tvs[m.id].name;
      sendTela(m.id, { type: 'welcome', name: state.tvs[m.id].name });
      save(); return pushTvs();
    }

    if (m.type === 'forget' && state.tvs[m.id] && !players.has(m.id)) {
      delete state.tvs[m.id]; save(); return pushTvs();
    }

    if (m.type === 'reload') {
      for (const id of resolveTargets(m.targets)) sendTela(id, { type: 'reload' });
    }
  });

  ws.on('close', () => {
    if (ws.pararPrevia) ws.pararPrevia();
    balcao.rascunho(ws, null);
    if (ws.role === 'panel') panels.delete(ws);
    if (ws.role === 'player' && players.has(ws.id)) {
      const set = players.get(ws.id);
      set.delete(ws);
      if (!set.size) players.delete(ws.id);
      pushTvs();
    }
  });
});

// mantém conexões vivas / detecta TVs que caíram
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);
wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

// Vinhetas são um extra: se a pasta da rádio não abrir, as TVs e as luzes continuam funcionando.
try { vinhetas.iniciar(); vinhetas.aoEntrarNoAr(zonas.vinheta); } catch (e) { console.log(`vinhetas: não iniciou (${e.message})`); }
// Música por andar também é um extra: se algo falhar, as TVs e as luzes continuam funcionando.
try { zonas.iniciar(); } catch (e) { console.log(`zonas: não iniciou (${e.message})`); }

server.listen(PORT, '0.0.0.0', () => {
  const nets = Object.values(require('os').networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  console.log('Painel das TVs rodando:');
  for (const n of nets) console.log(`  painel: http://${n.address}:${PORT}/   celular: http://${n.address}:${PORT}/celular   player: http://${n.address}:${PORT}/player.html`);
  const mm = lerMadMapper();
  console.log(mm && mm.host ? `MadMapper (OSC): ${mm.host}:${mm.porta || 8010}` : 'MadMapper: não configurado (crie madmapper.json)');
});
