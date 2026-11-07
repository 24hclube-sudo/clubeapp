// Monta caixa-indice.json: id, título e arquivo de cada música da biblioteca da rádio.
// Roda em processo separado para não atrapalhar as fitas. Trabalha numa cópia temporária do banco do
// Navidrome e só consulta a tabela de músicas: as outras tabelas (usuários e senhas) nunca são lidas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const BANCO = process.env.ZONAS_BANCO || 'C:\\radio-clube\\estacao\\navidrome-data\\navidrome.db';
const MUSICAS = process.env.ZONAS_MUSICA || 'C:\\radio-clube\\downloads';
const SAIDA = process.argv[2] || path.join(__dirname, 'caixa-indice.json');

function caminhoLocal(guardado) {
  const relativo = String(guardado).replace(/\\/g, '/').replace(/^\/?music\//, '').replace(/^\/+/, '');
  const alvo = path.normalize(path.join(MUSICAS, relativo));
  return alvo.startsWith(MUSICAS + path.sep) ? alvo : null;
}

const temporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'caixa-indice-'));
try {
  for (const sufixo of ['', '-wal', '-shm']) {
    if (fs.existsSync(BANCO + sufixo)) fs.copyFileSync(BANCO + sufixo, path.join(temporaria, 'banco.db' + sufixo));
  }
  const banco = new DatabaseSync(path.join(temporaria, 'banco.db'));
  const colunas = banco.prepare('PRAGMA table_info(media_file)').all().map(c => c.name);
  const filtro = colunas.includes('missing') ? 'WHERE missing = 0' : '';
  const linhas = banco.prepare(`SELECT id, path, title, artist, album, duration FROM media_file ${filtro}`).all();
  banco.close();

  const faixas = {};
  for (const l of linhas) {
    const arquivo = caminhoLocal(l.path);
    if (!arquivo || !fs.existsSync(arquivo)) continue;
    faixas[l.id] = { id: l.id, titulo: l.title || path.parse(arquivo).name, artista: l.artist || '', album: l.album || '', duracao: Math.round(l.duration || 0), arquivo };
  }
  const provisorio = SAIDA + '.tmp';
  fs.writeFileSync(provisorio, JSON.stringify({ geradoEm: Date.now(), faixas }));
  fs.renameSync(provisorio, SAIDA);
  console.log(`caixa: ${Object.keys(faixas).length} de ${linhas.length} músicas no índice`);
} finally {
  fs.rmSync(temporaria, { recursive: true, force: true });
}
