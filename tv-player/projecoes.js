// Projeções do 5º andar: o app conversa com o Resolume Arena do PC dos projetores (desktop-36lp19s) pela API dele.
// No Arena: Preferences → Webserver ligado, porta 8080. O endereço fica em projecoes.json ({ "url": "http://192.168.1.10:8080" }).
// O app só dispara colunas e clipes que já estão na composição. Nunca limpa nem altera clipe: a montagem continua no Resolume.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ARQ = path.join(__dirname, 'projecoes.json');
const PADRAO = 'http://192.168.1.10:8080';
let base = PADRAO;
try { base = JSON.parse(fs.readFileSync(ARQ, 'utf8')).url || PADRAO; } catch {}
base = base.replace(/\/+$/, '');

function pedir(metodo, rota, { binario = false, tempo = 2500 } = {}) {
  return new Promise((ok, erro) => {
    const r = http.request(`${base}/api/v1${rota}`, { method: metodo, timeout: tempo }, res => {
      const partes = [];
      let total = 0;
      res.on('data', d => {
        total += d.length;
        if (total > 30e6) { r.destroy(new Error('resposta grande demais')); return; }
        partes.push(d);
      });
      res.on('end', () => {
        const corpo = Buffer.concat(partes);
        if (res.statusCode >= 300) return erro(new Error(`Resolume respondeu ${res.statusCode}`));
        if (binario) return ok({ corpo, tipo: res.headers['content-type'] || 'image/png' });
        if (!corpo.length) return ok(null);
        try { ok(JSON.parse(corpo.toString('utf8'))); } catch { erro(new Error('resposta inválida do Resolume')); }
      });
    });
    r.on('timeout', () => r.destroy(new Error('Resolume não respondeu')));
    r.on('error', erro);
    r.end();
  });
}

const valor = p => (p && p.value !== undefined ? p.value : '');
// "Connected" e "Connected & previewing" estão na saída; "Previewing" só no monitor de quem opera.
const noAr = p => /^connected/i.test(String(valor(p)));
const vazio = c => /empty/i.test(String(valor(c.connected))) || (!c.video && !c.audio && !valor(c.name));

function resumir(comp) {
  const camadas = (comp.layers || []).map((l, li) => ({
    i: li + 1,
    nome: valor(l.name) || `Camada ${li + 1}`,
    clipes: (l.clips || []).map((c, ci) => ({ i: ci + 1, id: c.id, nome: valor(c.name) || `Clipe ${ci + 1}`, noAr: noAr(c.connected), v: c.thumbnail && c.thumbnail.last_update, vazio: vazio(c) }))
      .filter(c => !c.vazio).map(({ vazio: _, ...c }) => c),
  }));
  // uma coluna sem nenhum clipe não dispara nada: não aparece
  const colunas = (comp.columns || []).map((c, ci) => ({ i: ci + 1, nome: valor(c.name) || `Coluna ${ci + 1}`, noAr: noAr(c.connected) }))
    .filter(c => (comp.layers || []).some(l => l.clips && l.clips[c.i - 1] && !vazio(l.clips[c.i - 1])));
  return { conectado: true, nome: valor(comp.name), colunas, camadas: camadas.filter(l => l.clipes.length) };
}

// Vários celulares abertos não viram vários pedidos ao Resolume.
let cache = null, cacheEm = 0, emCurso = null;
function composicao(fresco) {
  if (!fresco && cache && Date.now() - cacheEm < (cache.conectado ? 1000 : 3000)) return Promise.resolve(cache);
  if (emCurso) return emCurso;
  emCurso = pedir('GET', '/composition')
    .then(resumir, e => ({ conectado: false, erro: e.message, endereco: base }))
    .then(r => { cache = r; cacheEm = Date.now(); emCurso = null; return r; });
  return emCurso;
}

const inteiro = (u, nome) => { const v = u.searchParams.get(nome); return /^[1-9]\d{0,3}$/.test(v || '') ? v : null; };

function atender(req, res, p, url, sendJson) {
  if (!p.startsWith('/api/projecoes')) return false;
  if (p === '/api/projecoes' && req.method === 'GET') {
    composicao().then(r => sendJson(res, 200, r));
    return true;
  }
  if (p === '/api/projecoes/foto' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!/^\d{1,20}$/.test(id || '')) { sendJson(res, 400, { error: 'id inválido' }); return true; }
    pedir('GET', `/composition/clips/by-id/${id}/thumbnail`, { binario: true }).then(
      f => { res.writeHead(200, { 'Content-Type': f.tipo, 'Cache-Control': 'max-age=60' }); res.end(f.corpo); },
      () => { res.writeHead(404); res.end(); },
    );
    return true;
  }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'método não aceito' }); return true; }
  let rota = null;
  if (p === '/api/projecoes/coluna') { const i = inteiro(url, 'i'); if (i) rota = `/composition/columns/${i}/connect`; }
  else if (p === '/api/projecoes/clipe') { const l = inteiro(url, 'l'), c = inteiro(url, 'c'); if (l && c) rota = `/composition/layers/${l}/clips/${c}/connect`; }
  else if (p === '/api/projecoes/apagar') rota = '/composition/disconnect-all';
  if (!rota) { sendJson(res, 400, { error: 'pedido inválido' }); return true; }
  pedir('POST', rota).then(
    () => new Promise(r => setTimeout(r, 120)).then(() => composicao(true)).then(c => sendJson(res, 200, c)),
    e => sendJson(res, 502, { error: e.message }),
  );
  return true;
}

module.exports = { atender };
