// Rádio CLUBE (SUB/WAVE em http://localhost:7900): o que está tocando e o botão "Pular" do app.
// Pular é só de administrador na rádio (Basic Auth). Usuário e senha ficam em C:\radio-clube\SENHAS.txt
// (gerado pelo instalador da rádio): lidos na hora de cada pedido, nunca vão para log nem para o celular.
const http = require('http');
const fs = require('fs');

const RADIO = process.env.RADIO_URL || 'http://127.0.0.1:7900';
const SENHAS = process.env.RADIO_SENHAS || 'C:\\radio-clube\\SENHAS.txt';

// Motivos que a rádio dá para recusar um pulo "com alvo" (expectId) — nada é pulado nesses casos.
const RECUSAS = {
  'track-changed': 'Essa música já tinha acabado',
  'jingle-on-air': 'Está entrando uma vinheta; tente de novo em instantes',
  'bed-on-air': 'O locutor está falando; tente de novo em instantes',
  'break-on-air': 'O locutor está falando; tente de novo em instantes',
};

function autorizacao() {
  const txt = fs.readFileSync(SENHAS, 'utf8');
  const usuario = (/^\s*usu[áa]rio\s*:\s*(.+?)\s*$/im.exec(txt) || [])[1];
  const senha = (/^\s*senha\s*:\s*(.+?)\s*$/im.exec(txt) || [])[1];
  if (!usuario || !senha) throw new Error('não achei usuário e senha da rádio no SENHAS.txt');
  return 'Basic ' + Buffer.from(`${usuario}:${senha}`).toString('base64');
}

function pedir(metodo, caminho, corpo, auth, tempo = 8000) {
  return new Promise((ok, erro) => {
    const dados = corpo ? Buffer.from(JSON.stringify(corpo)) : null;
    const headers = {};
    if (dados) { headers['content-type'] = 'application/json'; headers['content-length'] = dados.length; }
    if (auth) headers.authorization = auth;
    const req = http.request(new URL(caminho, RADIO), { method: metodo, headers, timeout: tempo }, r => {
      let s = '';
      r.setEncoding('utf8');
      r.on('data', d => { s += d; });
      r.on('end', () => { let json = null; try { json = JSON.parse(s); } catch {} ok({ status: r.statusCode, json }); });
    });
    req.on('timeout', () => req.destroy(new Error('a rádio não respondeu')));
    req.on('error', erro);
    if (dados) req.write(dados);
    req.end();
  });
}

// { online, id, titulo, artista } — id é o subsonic_id da música no ar (o alvo do pulo).
async function tocando() {
  try {
    const r = await pedir('GET', '/api/now-playing');
    const np = r.json && r.json.nowPlaying;
    if (r.status !== 200 || !np) return { online: false };
    return { online: !!r.json.streamOnline, id: np.subsonic_id || null, titulo: np.title || '', artista: np.artist || '' };
  } catch {
    return { online: false };
  }
}

// Pula a música no ar. Com expectId, a rádio só pula se ainda for aquela (dois toques ao mesmo
// tempo não pulam duas). A rádio pode levar até ~20 s para confirmar.
async function pular(expectId) {
  const r = await pedir('POST', '/api/dj/skip', expectId ? { expectId } : {}, autorizacao(), 40000);
  if (r.status === 200) return { ok: true };
  if (r.status === 409) return { ok: false, erro: RECUSAS[r.json && r.json.reason] || 'A rádio não pulou agora' };
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'A rádio recusou a senha do SENHAS.txt' };
  return { ok: false, erro: (r.json && r.json.error) || `a rádio respondeu ${r.status}` };
}

module.exports = { tocando, pular };
