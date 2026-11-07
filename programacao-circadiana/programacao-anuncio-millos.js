// Cria o anúncio do soft opening: capa + serviço, entrando a cada 10 min e saindo sozinho quando a
// festa acaba. Fica pausado enquanto os slides sobem. Usa os trechos já no formato das TVs, feitos por
// arte-soft-opening\montar-tv.ps1 (o post 4:5 do feed perderia as laterais).
//   node programacao-anuncio-millos.js [http://127.0.0.1:8080]
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

const BASE = process.argv[2] || 'http://127.0.0.1:8080';
const PECAS = path.join(__dirname, 'arte-soft-opening', 'saida');
const NOME = 'Soft opening · Millos Kaiser';

const subir = (arquivo, q) => new Promise((ok, erro) => {
  const url = BASE + '/api/anuncio?' + new URLSearchParams({ arquivo: path.basename(arquivo), ...q });
  const r = http.request(url, { method: 'POST' }, x => {
    let s = ''; x.on('data', d => { s += d; });
    x.on('end', () => (x.statusCode === 200 ? ok(JSON.parse(s)) : erro(new Error(s))));
  });
  r.on('error', erro);
  fs.createReadStream(arquivo).pipe(r);
});

(async () => {
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws');
  await new Promise((ok, erro) => { ws.on('open', ok); ws.on('error', erro); });
  let dados = null;
  ws.on('message', d => { const m = JSON.parse(d); if (m.type === 'programacao') dados = m; });
  ws.send(JSON.stringify({ type: 'hello-panel' }));
  await new Promise(r => setTimeout(r, 500));
  if (!dados) throw new Error('este servidor ainda não tem a programação');
  if (dados.anuncios.some(a => a.nome === NOME)) { console.log('O anúncio já existe; nada a fazer.'); process.exit(0); }

  const mudar = (id, campos) => ws.send(JSON.stringify({ type: 'prog', acao: 'anuncio', id, campos }));
  const capa = await subir(path.join(PECAS, 'anuncio-capa.mp4'), { nome: NOME });
  mudar(capa.id, { ativo: false });
  await subir(path.join(PECAS, 'anuncio-servico.mp4'), { id: capa.id });
  mudar(capa.id, {
    cadaMin: 10, ate: '2026-11-08T06:00',
    textoLed: 'SOFT OPENING · MILLOS KAISER · SÁBADO 07.11 · 22H ÀS 6H',
  });
  mudar(capa.id, { ativo: true });
  await new Promise(r => setTimeout(r, 500));
  const a = dados.anuncios.find(x => x.id === capa.id);
  console.log(`Criado: ${a.nome} · ${a.itens.length} slides · a cada ${a.cadaMin} min · até ${a.ate} · ${a.status.texto}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
