// Sequência das TVs: várias cenas de cenas-tv.json tocando uma depois da outra, em loop,
// em todas as TVs da zona. Vira uma playlist do player: cada item tem a duração do arquivo,
// e todos os players calculam o mesmo item pelo relógio comum (startAt), então as TVs trocam juntas.
// Pedido do usuário em 07/11/2026 ("selecionar múltiplos conteúdos que ficam tocando um na sequência do outro").
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FFPROBE = 'C:\\apps\\led-videos\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffprobe.exe';
const SEG_IMAGEM = 15;      // imagem parada na sequência
const SEG_PADRAO = 30;      // vídeo cuja duração não deu para ler
const MAX_ITENS = 40;

function criarSequenciaTv({ mediaDir }) {
  const cache = new Map(); // arquivo -> { mtime, seg }

  function duracaoDoArquivo(arq) {
    let st; try { st = fs.statSync(path.join(mediaDir, arq)); } catch { return null; }
    const c = cache.get(arq);
    if (c && c.mtime === st.mtimeMs) return c.seg;
    let seg = null;
    try {
      const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(mediaDir, arq)],
        { windowsHide: true, timeout: 8000 }).toString().trim();
      const n = parseFloat(out); if (n > 0.5) seg = Math.round(n * 1000) / 1000;
    } catch {}
    cache.set(arq, { mtime: st.mtimeMs, seg });
    return seg;
  }

  const ehImagem = arq => /\.(jpe?g|png|webp)$/i.test(arq);

  // Arquivo da cena para a TV de posição i (porTela alterna uma arte por TV).
  function arquivoDa(cena, i) { return cena.porTela ? cena.porTela[i % cena.porTela.length] : cena.imagem || cena.video; }

  // Duração igual em todas as TVs (senão uma TV troca antes da outra): "duracao" da cena,
  // ou a do 1º arquivo dela.
  function duracaoDa(cena) {
    if (cena.duracao) return cena.duracao;
    const arq = arquivoDa(cena, 0);
    if (!arq) return null;
    if (ehImagem(arq)) return SEG_IMAGEM;
    return duracaoDoArquivo(arq) || SEG_PADRAO;
  }

  // cenas: lista de cenas-tv.json; ids: ordem escolhida no app. Devolve as cenas válidas.
  function escolher(cenas, ids) {
    return (Array.isArray(ids) ? ids : []).slice(0, MAX_ITENS)
      .map(id => cenas.find(c => c.id === id)).filter(c => c && !c.apagar && arquivoDa(c, 0));
  }

  // Conteúdo da TV de posição i. srcDeMidia dá o "/media/v<data>/<arquivo>" (o mesmo do precache).
  function conteudo(lista, i, startAt, srcDeMidia) {
    const items = [];
    for (const cena of lista) {
      const arq = arquivoDa(cena, i);
      const src = srcDeMidia(arq);
      if (!src) continue;
      const duration = duracaoDa(cena);
      items.push(ehImagem(arq) ? { kind: 'image', src, name: arq, duration } : { kind: 'video', src, name: arq, muted: true, duration });
    }
    if (!items.length) return null;
    return { kind: items.length > 1 ? 'playlist' : 'single', loop: true, sync: true, startAt, items };
  }

  return { escolher, conteudo, duracaoDa };
}

module.exports = { criarSequenciaTv };
