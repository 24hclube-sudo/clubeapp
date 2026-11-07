// Estúdio de animações das TVs: serve a ferramenta de motion da marca (pasta estudio/)
// e recebe os quadros renderizados em 4K para montar os vídeos com o ffmpeg.
//   node estudio-servidor.js   →   http://localhost:8090/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 8090;
const ESTUDIO = path.join(__dirname, 'estudio');
const QUADROS = path.join(__dirname, 'estudio-quadros');
const MEDIA = path.join(__dirname, 'media');
const CENAS = path.join(__dirname, 'public', 'cenas');
const FFMPEG = path.join(__dirname, '..', 'led-videos', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function ffmpeg(args) {
  return new Promise((ok, erro) => execFile(FFMPEG, ['-y', '-v', 'error', ...args], { windowsHide: true, maxBuffer: 1 << 20 },
    (e, _o, se) => e ? erro(new Error(se || e.message)) : ok()));
}

// (o gerador do painel, servido pela porta 8080, também manda quadros para cá)
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

// Prévia animada + ícone de uma cena do gerador (quadros já no tamanho final).
async function previa(job, fps, nome) {
  const pasta = path.join(QUADROS, job);
  const entrada = ['-framerate', String(fps), '-i', path.join(pasta, 'f%05d.jpg')];
  await ffmpeg([...entrada, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-an',
    '-movflags', '+faststart', path.join(CENAS, nome + '.mp4')]);
  await ffmpeg(['-i', path.join(pasta, 'f00000.jpg'), '-frames:v', '1', path.join(CENAS, nome + '.png')]);
}

// Monta os vídeos a partir dos quadros: 4K em pé (o que as TVs tocam — testado na The Frame),
// reserva 1080, versão deitada (navegador da TV deitado) e o ícone + prévia animada do app.
async function finalizar(job, fps) {
  const pasta = path.join(QUADROS, job);
  const total = fs.readdirSync(pasta).filter(f => f.endsWith('.jpg')).length;
  const entrada = ['-framerate', String(fps), '-i', path.join(pasta, 'f%05d.jpg')];
  const h264 = (nivel, crf) => ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-level', nivel, '-g', String(fps), '-an', '-movflags', '+faststart'];
  const base = 'tv-anim-' + job;
  await ffmpeg([...entrada, ...h264('5.1', 18), path.join(MEDIA, base + '.mp4')]);
  await ffmpeg([...entrada, '-vf', 'scale=1080:1920:flags=lanczos', ...h264('4.1', 18), path.join(MEDIA, base + '-1080.mp4')]);
  await ffmpeg([...entrada, '-vf', 'scale=1080:1920:flags=lanczos,transpose=2', ...h264('4.1', 18), path.join(MEDIA, base + '-deitado.mp4')]);
  const meio = path.join(pasta, 'f' + String(Math.floor(total / 3)).padStart(5, '0') + '.jpg');
  await ffmpeg(['-i', meio, '-frames:v', '1', '-vf', 'scale=270:480:flags=lanczos', path.join(CENAS, 'tvp-anim-' + job + '.png')]);
  await ffmpeg([...entrada, '-vf', 'scale=270:480:flags=lanczos', ...h264('3.1', 26), path.join(CENAS, 'tvp-anim-' + job + '.mp4')]);
  return { total, video: base + '.mp4', reserva: base + '-1080.mp4' };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const job = String(url.searchParams.get('job') || '').replace(/[^a-z0-9-]/gi, '');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/previa') {
    const nome = String(url.searchParams.get('nome') || '').replace(/[^a-z0-9-]/gi, '');
    if (!job || !nome) return json(res, 400, { error: 'job/nome' });
    previa(job, parseInt(url.searchParams.get('fps'), 10) || 20, nome)
      .then(() => json(res, 200, { ok: true }))
      .catch(e => json(res, 500, { error: e.message.slice(0, 400) }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/inicio') {
    if (!job) return json(res, 400, { error: 'job' });
    fs.rmSync(path.join(QUADROS, job), { recursive: true, force: true });
    fs.mkdirSync(path.join(QUADROS, job), { recursive: true });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/quadro') {
    const n = parseInt(url.searchParams.get('n'), 10);
    if (!job || !(n >= 0)) return json(res, 400, { error: 'job/n' });
    const out = fs.createWriteStream(path.join(QUADROS, job, 'f' + String(n).padStart(5, '0') + '.jpg'));
    req.pipe(out);
    out.on('finish', () => json(res, 200, { ok: true }));
    out.on('error', e => json(res, 500, { error: e.message }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/finalizar') {
    const fps = parseInt(url.searchParams.get('fps'), 10) || 30;
    const t0 = Date.now();
    finalizar(job, fps)
      .then(r => { console.log(`${job}: ${r.total} quadros → ${r.video} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); json(res, 200, { ok: true, ...r }); })
      .catch(e => { console.error(job, e.message); json(res, 500, { error: e.message.slice(0, 400) }); });
    return;
  }

  // arquivos estáticos do estúdio
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const arq = path.join(ESTUDIO, rel);
  if (!arq.startsWith(ESTUDIO)) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (e, dados) => {
    if (e) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  });
}).listen(PORT, () => console.log('estúdio das TVs em http://localhost:' + PORT + '/'));
