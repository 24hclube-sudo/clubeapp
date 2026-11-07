// Coloca só a playlist Madrugada Festa no ar por um período, sem reiniciar a rádio.
// Usa a "tomada" da estação: a grade não muda e, no horário marcado, a programação normal volta sozinha.
//
//   node scripts/festa-agora.mjs           confere, sem mudar nada
//   node scripts/festa-agora.mjs --ate 06:00  entra agora e termina na próxima vez que der esse horário
//   node scripts/festa-agora.mjs --parar   volta agora para a programação normal
//
// Muda o que toca em público: só rodar com o ok do dono.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESTACAO = process.env.ESTACAO || 'http://127.0.0.1:7900';
const ID_MOMENTO = 'madrugada-festa';
const ID_PROGRAMA = 's_clube_madrugada_festa'; // o mesmo de aplicar-na-estacao.mjs

async function pedir(metodo, caminho, corpo) {
  const r = await fetch(ESTACAO + caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const texto = await r.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { bruto: texto.slice(0, 200) }; }
  if (!r.ok) throw new Error(`${metodo} ${caminho} respondeu ${r.status}: ${json.error || json.bruto || ''}`);
  return json;
}

async function mostrarNoAr() {
  const e = await pedir('GET', '/api/state');
  const n = await pedir('GET', '/api/now-playing');
  console.log(`Programa: ${n.activeShow?.name || 'programação automática'} | No ar: ${e.current?.title} | A seguir: ${(e.upcoming || []).map(f => f.title).join(' / ') || '-'} | Ouvintes: ${n.listeners?.current ?? 0}`);
}

function minutosAte(texto) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(texto || '');
  if (!m) throw new Error('Use --ate HH:MM, por exemplo --ate 06:00');
  const fim = new Date();
  fim.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (fim <= new Date()) fim.setDate(fim.getDate() + 1);
  return { minutos: Math.ceil((fim - Date.now()) / 60000), fim };
}

async function entrar(texto) {
  const { minutos, fim } = minutosAte(texto);
  const { momentos } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados', 'momentos.json'), 'utf8'));
  const m = momentos.find(x => x.id === ID_MOMENTO);
  const { values } = await pedir('GET', '/api/settings');
  const { playlists } = await pedir('GET', '/api/playlists');
  const existente = playlists.find(p => p.name === m.nome);
  const salva = await pedir('POST', '/api/playlists', { name: m.nome, songIds: m.faixas.map(f => f.id), playlistId: existente?.id, keepInSync: false });
  const playlistId = salva.playlist?.id || existente?.id;
  if (!playlistId) throw new Error('A estação não devolveu o id da playlist. Nada mudou no ar.');
  const { entries } = await pedir('GET', `/api/playlists/${encodeURIComponent(playlistId)}`);
  if (entries.length !== m.faixas.length) throw new Error(`Enviei ${m.faixas.length} músicas e a estação guardou ${entries.length}. Nada mudou no ar.`);
  console.log(`Playlist ${m.nome}: ${entries.length} músicas`);

  const programa = {
    id: ID_PROGRAMA, name: m.nome, topic: m.descricao, personaId: values.activePersonaId,
    guestPersonaIds: [], banter: false, programme: false, pauseTalk: false, segmentSkill: '', preparationSkill: '',
    moods: [], themeId: '', genres: [], eras: [], energies: [], vocals: '', filtersStrict: false,
    maxTrackSeconds: null, minTrackLengthSeconds: null,
    playlistIds: [playlistId], playlistStrict: true, playlistExhaust: true, playlistInOrder: false, excludedPlaylistIds: [], tags: ['momento-do-dia'],
  };
  const teste = await pedir('POST', '/api/shows/candidates', { show: programa });
  console.log(`Músicas elegíveis: ${teste.playlist?.effective ?? 0} de ${teste.playlist?.total ?? 0}`);
  if ((teste.playlist?.effective ?? 0) < 10) throw new Error('Poucas músicas elegíveis. Nada mudou no ar.');
  await pedir('POST', '/api/shows', { show: programa });

  // Último passo de propósito: até aqui nada do que está no ar mudou.
  const { override } = await pedir('POST', '/api/schedule/override', { showId: ID_PROGRAMA, minutes: minutos, until: 'fixed' });
  console.log(`No ar até ${new Date(override.expiresAt).toLocaleString('pt-BR')} (pedido: ${fim.toLocaleString('pt-BR')}).`);
  await mostrarNoAr();
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--ate') await entrar(args[1]);
  else if (args[0] === '--parar') {
    await pedir('DELETE', '/api/schedule/override');
    console.log('Tomada encerrada: volta a programação normal no fim da música.');
    await mostrarNoAr();
  } else {
    await mostrarNoAr();
    console.log('Nada foi alterado.');
  }
} catch (erro) {
  console.error(erro.message);
  process.exit(1);
}
