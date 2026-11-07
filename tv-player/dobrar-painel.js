// Coloca um vídeo da faixa inteira (4472x86) no painel de LED do térreo: dobra no formato que o
// T50 recebe (2752x172 — linha de cima começa em x=1032, a de baixo tem o resto) e entra nas
// cenas do painel com ícone e prévia.
//   node dobrar-painel.js <vídeo 4472x86> <id> "<nome>" [lento]
//   lento: quantas vezes mais devagar (ex.: 2 = metade da velocidade). Os quadros novos são a
//   mistura dos vizinhos, então o movimento fica suave em vez de "engasgado"; o loop continua fechado.
// (o ffmpeg do Remotion não tem overlay/pad/setpts, então a dobra e a lentidão são feitas aqui)
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn, execFileSync } = require('child_process');

const FFMPEG = path.join(__dirname, '..', 'led-videos', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const [entrada, id, nome, lentoArg] = process.argv.slice(2);
const LENTO = Math.max(1, Number(lentoArg) || 1);
if (!entrada || !id) { console.error('uso: node dobrar-painel.js <vídeo> <id> "<nome>"'); process.exit(1); }

const SW = 4472, SH = 86;            // faixa inteira
const OW = 2752, OH = 172;           // entrada do T50
const SEGMENTOS = [                  // mesmos do Remotion (led-videos)
  { origemX: 0, largura: 1720, destinoX: 1032, destinoY: 0 },
  { origemX: 1720, largura: 2752, destinoX: 0, destinoY: 86 },
];

function png(w, h, rgb) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloco = (t, d) => { const tt = Buffer.from(t), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(Buffer.concat([tt, d]))); return Buffer.concat([l, tt, d, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const cru = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(cru, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ih), bloco('IDAT', zlib.deflateSync(cru, { level: 3 })), bloco('IEND', Buffer.alloc(0))]);
}

function ffmpeg(args) {
  return new Promise((ok, erro) => {
    const p = spawn(FFMPEG, ['-y', '-v', 'error', ...args]);
    let e = ''; p.stderr.on('data', d => { e += d; });
    p.on('close', c => (c ? erro(new Error(e)) : ok()));
  });
}

(async () => {
  let info = '';
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', entrada], { stdio: 'pipe' }); } catch (e) { info = String(e.stderr || ''); }
  const tam = /, (\d+)x(\d+)[, ]/.exec(info);
  if (!tam || +tam[1] !== SW || +tam[2] !== SH) throw new Error(`o vídeo precisa ser ${SW}x${SH} (é ${tam ? tam[1] + 'x' + tam[2] : '?'})`);
  const fps = parseFloat((/(\d+(?:\.\d+)?) fps/.exec(info) || [])[1]) || 30;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-'));
  const TQ = SW * SH * 3;
  let n = 0, resto = Buffer.alloc(0);
  const dobrar = q => {
    const out = Buffer.alloc(OW * OH * 3);
    for (const s of SEGMENTOS) for (let y = 0; y < SH; y++)
      q.copy(out, ((s.destinoY + y) * OW + s.destinoX) * 3, (y * SW + s.origemX) * 3, (y * SW + s.origemX + s.largura) * 3);
    fs.writeFileSync(path.join(tmp, 'q' + String(n).padStart(5, '0') + '.png'), png(OW, OH, out));
    n++;
  };
  // quadros crus da faixa (o ffmpeg do Remotion grava rawvideo via image2pipe)
  const originais = [];
  await new Promise((ok, erro) => {
    const p = spawn(FFMPEG, ['-v', 'error', '-i', entrada, '-an', '-vf', 'format=rgb24', '-f', 'image2pipe', '-c:v', 'rawvideo', 'pipe:1']);
    p.stdout.on('data', d => {
      resto = resto.length ? Buffer.concat([resto, d]) : d;
      while (resto.length >= TQ) {
        const q = Buffer.from(resto.subarray(0, TQ)); resto = resto.subarray(TQ);
        if (LENTO > 1) originais.push(q); else dobrar(q);
      }
    });
    let e = ''; p.stderr.on('data', d => { e += d; });
    p.on('close', c => (c ? erro(new Error(e)) : ok()));
  });
  // Mais devagar: o quadro k fica na posição k/LENTO do original, misturando os dois vizinhos
  // (o último mistura com o primeiro, para o loop continuar sem emenda).
  if (LENTO > 1) {
    const total = Math.round(originais.length * LENTO), mix = Buffer.alloc(TQ);
    for (let k = 0; k < total; k++) {
      const pos = k / LENTO, a = Math.floor(pos) % originais.length, b = (a + 1) % originais.length, w = pos - Math.floor(pos);
      if (w < 1e-6) { dobrar(originais[a]); continue; }
      const qa = originais[a], qb = originais[b];
      for (let j = 0; j < TQ; j++) mix[j] = qa[j] + (qb[j] - qa[j]) * w + 0.5;
      dobrar(mix);
    }
  }

  const video = 'painel-' + id + '.mp4';
  const entradaQ = ['-framerate', String(fps), '-i', path.join(tmp, 'q%05d.png')];
  await ffmpeg([...entradaQ, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-level', '4.1', '-an', '-movflags', '+faststart', path.join(__dirname, 'media', video)]);
  // ícone e prévia: recorte de 344x86 do meio da faixa (como as outras cenas do painel). No quadro
  // dobrado, o meio da faixa (x 2064) fica na linha de baixo, em x 344.
  const recorte = 'crop=344:86:344:86';
  await ffmpeg([...entradaQ, '-an', '-vf', recorte, '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path.join(__dirname, 'public', 'cenas', 'painel-' + id + '.mp4')]);
  await ffmpeg(['-i', path.join(tmp, 'q' + String(Math.floor(n * 0.3)).padStart(5, '0') + '.png'), '-frames:v', '1', '-vf', recorte,
    path.join(__dirname, 'public', 'cenas', 'painel-' + id + '.png')]);
  fs.rmSync(tmp, { recursive: true, force: true });

  const arq = path.join(__dirname, 'public', 'cenas.json');
  const cenas = JSON.parse(fs.readFileSync(arq, 'utf8')).filter(c => c.id !== id);
  const cena = { id, nome: nome || id, video, thumb: 'cenas/painel-' + id + '.png', preview: 'cenas/painel-' + id + '.mp4', duracao: Math.round(n / fps * 1000) / 1000 };
  const i = cenas.findIndex(c => c.apagar);
  cenas.splice(i < 0 ? cenas.length : i, 0, cena);
  fs.writeFileSync(arq, JSON.stringify(cenas, null, 2));
  console.log(`${nome}: ${n} quadros a ${fps} fps (${(n / fps).toFixed(1)} s${LENTO > 1 ? ', ' + LENTO + '× mais lento' : ''}) → media/${video}`);
})().catch(e => { console.error(e.message); process.exit(1); });
