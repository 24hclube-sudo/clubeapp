// Gera as miniaturas animadas das animações das fitas (public/cenas/anim-*.mp4 + .png),
// rodando cada efeito no próprio motor (balcao.js) com o desenho real da instalação.
// Uso: node gerar-previas-fitas.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { quadroDe, INSTALACOES } = require('./balcao');
const { simular } = require('./audio-barras');

const FFMPEG = path.join(__dirname, '..', 'led-videos', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const FPS = 15;
const PUB = path.join(__dirname, 'public');

// Desenho: bancada = 6 fileiras finas; barras = 8 colunas altas.
function desenho(inst) {
  if (inst.vertical) {
    const larg = 10, vao = 10, esc = 2;
    return { W: inst.colunas * (larg + vao), H: inst.linhas * esc,
      pinta: (img, W, q) => {
        for (let r = 0; r < inst.linhas; r++) for (let b = 0; b < inst.colunas; b++) {
          const c = q[r * inst.colunas + b];
          for (let dy = 0; dy < esc; dy++) for (let dx = 0; dx < larg; dx++) {
            const o = ((r * esc + dy) * W + b * (larg + vao) + vao / 2 + dx) * 3;
            img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
          }
        }
      } };
  }
  const escX = 2, alt = 6, vao = 2;
  return { W: inst.colunas * escX, H: inst.linhas * (alt + vao),
    pinta: (img, W, q) => {
      for (let r = 0; r < inst.linhas; r++) for (let x = 0; x < inst.colunas; x++) {
        const c = q[r * inst.colunas + x];
        for (let dy = 0; dy < alt; dy++) for (let dx = 0; dx < escX; dx++) {
          const o = ((r * (alt + vao) + dy) * W + x * escX + dx) * 3;
          img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
        }
      }
    } };
}

function png(w, h, rgb) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloco = (t, d) => { const tt = Buffer.from(t), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(Buffer.concat([tt, d]))); return Buffer.concat([l, tt, d, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const cru = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(cru, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ih), bloco('IDAT', zlib.deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]);
}

async function gerar(lista, inst) {
  const arq = path.join(PUB, lista);
  const anims = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const { W, H, pinta } = desenho(inst);
  for (const a of anims) {
    if (a.apagar) continue;
    if (process.env.PREVIA_ID && a.id !== process.env.PREVIA_ID) continue; // só a miniatura de uma criação
    // já tem prévia? pula (use FORCAR=1 para refazer todas)
    if (!process.env.FORCAR && a.preview && fs.existsSync(path.join(PUB, a.preview))) continue;
    // calmas: prévia 4× mais rápida (senão o movimento lento nem aparece); pista: 120 BPM
    const ritmo = a.categoria === 'calma' ? { velocidade: 4 } : { bpm: 120 };
    const ciclo = a.batidas ? a.batidas * 0.5 : (a.duracao || 8) / (ritmo.velocidade || 1);
    const dur = a.batidas ? ciclo * Math.ceil(4 / ciclo) : Math.min(ciclo, 12);
    const quadros = Math.round(dur * FPS);
    const saida = path.join(PUB, 'cenas', 'anim-' + a.id + '.mp4');
    // O ffmpeg do Remotion não lê vídeo "cru": os quadros vão como PNGs numa pasta temporária.
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'anim-'));
    const ativo = { tipo: 'cena', cena: a, startAt: 0 };
    let poster = null;
    for (let f = 0; f < quadros; f++) {
      const img = Buffer.alloc(W * H * 3);
      const ritmoQuadro = a.categoria === 'audio' ? { ...ritmo, audio: simular(f / FPS) } : ritmo;
      pinta(img, W, quadroDe(ativo, (f / FPS) * 1000, inst, ritmoQuadro).map(c => c.map(v => Math.max(0, Math.min(255, Math.round(v))))));
      if (f === Math.round(quadros * 0.3)) poster = img;
      fs.writeFileSync(path.join(tmp, 'q' + String(f).padStart(4, '0') + '.png'), png(W, H, img));
    }
    const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'q%04d.png'),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', saida]);
    let erro = ''; ff.stderr.on('data', d => erro += d);
    await new Promise(ok => ff.on('close', ok));
    fs.rmSync(tmp, { recursive: true, force: true });
    if (erro) console.error(a.id, erro.trim());
    fs.writeFileSync(path.join(PUB, 'cenas', 'anim-' + a.id + '.png'), png(W, H, poster));
    a.thumb = 'cenas/anim-' + a.id + '.png';
    a.preview = 'cenas/anim-' + a.id + '.mp4';
    console.log(`${lista}: ${a.nome} (${quadros} quadros, ${W}x${H})`);
  }
  // Uma criação só: a lista já diz onde a miniatura fica, e regravar aqui poderia perder o que foi salvo enquanto ela era feita.
  if (!process.env.PREVIA_ID) fs.writeFileSync(arq, JSON.stringify(anims, null, 2));
}

(async () => {
  if (!process.env.PREVIA_ID) await gerar('animacoes-balcoes.json', INSTALACOES.find(i => i.id === 'terreo'));
  await gerar('animacoes-barras.json', INSTALACOES.find(i => i.id === 'barras'));
})();
