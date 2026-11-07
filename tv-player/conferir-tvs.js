// Confere a regra das TVs: tudo que vai para elas fica no formato delas (em pé, 9:16, tela cheia).
//   node conferir-tvs.js                 confere todas as cenas de public/cenas-tv.json
//   node conferir-tvs.js <arquivo> [...] confere arquivos soltos, antes de registrar uma cena
// FORMATO: o arquivo não é 9:16.
// FAIXA: é 9:16, mas tem borda preta em todos os quadros, como um post 4:5 encaixado. Conferir a medida
// não pega esse caso; por isso olha os quadros. Peça de fundo preto de propósito (logo no meio) também
// aparece aqui: nesse caso, marque "foraDaRegra": "<motivo>" na cena e ela não é conferida.
// Sai com código 1 se achar problema. Só lê; não muda nada.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FF = 'C:\\Program Files (x86)\\Nova Star\\ViPlex Express\\Bin\\VideoConverter\\ffmpeg.exe'; // tem cropdetect
const MEDIA = path.join(__dirname, 'media');
const CENAS = path.join(__dirname, 'public', 'cenas-tv.json');
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp'];
const FOLGA = 0.01;       // na proporção
const BORDA_MAX = 0.03;   // até 3% preto em cada dimensão ainda passa

function medir(arquivo) {
  const imagem = EXT_IMAGEM.includes(path.extname(arquivo).toLowerCase());
  // reset=0: guarda a maior área com imagem de todos os quadros; borda só some se algum quadro a usar.
  const entrada = imagem ? ['-loop', '1', '-t', '4', '-i', arquivo] : ['-i', arquivo];
  const r = spawnSync(FF, ['-hide_banner', ...entrada, '-an', '-vf', 'fps=2,cropdetect=limit=24:round=2:reset=0', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true });
  const saida = r.stderr || '';
  const tam = /Video:.*?(\d{3,5})x(\d{3,5})/.exec(saida);
  // A largura sai negativa quando nenhuma coluna passa do limite (logo pequeno sobre preto).
  const cortes = [...saida.matchAll(/ crop=(-?\d+):(-?\d+):/g)];
  if (!tam || !cortes.length) return { erro: 'não consegui ler o arquivo' };
  const c = cortes[cortes.length - 1];
  return { w: +tam[1], h: +tam[2], areaW: Math.max(0, +c[1]), areaH: Math.max(0, +c[2]) };
}

// w/h como aparecem na TV: o "-deitado" é a mesma peça girada, mas ele nunca entra aqui.
function conferir(arquivo) {
  if (!fs.existsSync(arquivo)) return [{ tipo: 'ARQUIVO', msg: 'não existe' }];
  const m = medir(arquivo);
  if (m.erro) return [{ tipo: 'ARQUIVO', msg: m.erro }];
  const problemas = [];
  if (Math.abs(m.w / m.h - 9 / 16) > FOLGA) problemas.push({ tipo: 'FORMATO', msg: `${m.w}x${m.h} não é 9:16` });
  else if (m.areaW / m.w < 1 - BORDA_MAX || m.areaH / m.h < 1 - BORDA_MAX) {
    problemas.push({ tipo: 'FAIXA', msg: `${m.w}x${m.h}, mas a imagem só ocupa ${m.areaW}x${m.areaH}` });
  }
  return problemas;
}

function arquivosDaCena(c) {
  const lista = [c.video, c.imagem, ...(c.porTela || [])].filter(Boolean);
  return [...new Set(lista)].map(f => path.join(MEDIA, f));
}

const soltos = process.argv.slice(2);
const alvos = soltos.length
  ? soltos.map(f => ({ rotulo: path.basename(f), arquivos: [path.resolve(f)] }))
  : JSON.parse(fs.readFileSync(CENAS, 'utf8')).filter(c => arquivosDaCena(c).length && !c.foraDaRegra)
    .map(c => ({ rotulo: `${c.id} (${c.nome})`, arquivos: arquivosDaCena(c) }));

let ruins = 0;
for (const a of alvos) {
  const achados = a.arquivos.flatMap(f => conferir(f).map(p => `${p.tipo}  ${path.basename(f)}: ${p.msg}`));
  if (achados.length) ruins++;
  console.log(`${achados.length ? 'FORA ' : 'ok   '} ${a.rotulo}`);
  achados.forEach(t => console.log(`      ${t}`));
}
console.log(`\n${alvos.length} conferidas, ${ruins} fora da regra.`);
process.exit(ruins ? 1 : 0);
