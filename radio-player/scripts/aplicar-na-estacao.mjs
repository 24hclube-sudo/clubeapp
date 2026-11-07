// Coloca os momentos na estação usando só os recursos nativos dela:
// playlists do Navidrome, programas (shows) e a grade semanal.
//
//   node scripts/aplicar-na-estacao.mjs            confere e mostra o plano, sem mudar nada
//   node scripts/aplicar-na-estacao.mjs --aplicar  grava na estação (muda o que vai ao ar)
//   node scripts/aplicar-na-estacao.mjs --desfazer volta a rádio para a programação automática
//
// --aplicar e --desfazer mudam o que toca em público: só rodar com o ok do dono.
// A rádio não é reiniciada: a troca entra no fim da música que estiver tocando.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESTACAO = process.env.ESTACAO || 'http://127.0.0.1:7900';
const ARQ_ESTACAO = path.join(RAIZ, 'dados', 'estacao.json');
const PREFIXO_PROGRAMA = 's_clube_';

const { momentos } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados', 'momentos.json'), 'utf8'));
const modo = process.argv.includes('--aplicar') ? 'aplicar' : process.argv.includes('--desfazer') ? 'desfazer' : 'conferir';

async function pedir(metodo, caminho, corpo) {
  const resposta = await fetch(ESTACAO + caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await resposta.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { bruto: texto }; }
  if (!resposta.ok) throw new Error(`${metodo} ${caminho} respondeu ${resposta.status}: ${json.error || texto.slice(0, 200)}`);
  return json;
}

const idPrograma = m => `${PREFIXO_PROGRAMA}${m.id.replace(/-/g, '_')}`;

function montarGrade(gradeAtual) {
  const grade = {};
  for (let dia = 0; dia < 7; dia++) {
    grade[dia] = Array.from({ length: 24 }, (_, hora) => {
      const m = momentos.find(x => (x.inicio < x.fim
        ? hora >= x.inicio && hora < x.fim
        : hora >= x.inicio || hora < x.fim));
      return m ? idPrograma(m) : (gradeAtual?.[dia]?.[hora] ?? null);
    });
  }
  return grade;
}

function programaDe(m, playlistId, personaId) {
  return {
    id: idPrograma(m),
    name: m.nome,
    topic: m.descricao,
    personaId,
    guestPersonaIds: [],
    banter: false,          // sem fala do DJ: continua silencioso como hoje
    programme: false,
    pauseTalk: false,
    segmentSkill: '',
    preparationSkill: '',
    moods: [],
    themeId: '',
    genres: [],
    eras: [],
    energies: [],
    vocals: '',
    filtersStrict: false,
    maxTrackSeconds: null,
    minTrackLengthSeconds: null,
    playlistIds: [playlistId],
    playlistStrict: true,   // só toca o que está na lista deste momento
    playlistExhaust: true,  // toca a lista inteira antes de repetir
    playlistInOrder: false, // ordem variada a cada dia
    excludedPlaylistIds: [],
    tags: ['momento-do-dia'],
  };
}

async function conferir() {
  const { values } = await pedir('GET', '/api/settings');
  const { playlists } = await pedir('GET', '/api/playlists');
  const personaId = values.activePersonaId;
  console.log(`Fuso da estação: ${values.timezone}. Apresentador: ${personaId}.`);
  console.log(`Programas hoje: ${values.shows?.length || 0}. Playlists hoje: ${playlists.length}. Tomada ativa: ${values.scheduleOverride ? 'sim' : 'não'}.`);
  const grade = montarGrade(values.schedule);
  console.log('\nGrade de cada dia (0h a 23h):');
  console.log('  ' + grade[1].map((p, h) => `${String(h).padStart(2, '0')}=${String(p).replace(PREFIXO_PROGRAMA, '')}`).join(' '));
  console.log('\nListas:');
  for (const m of momentos) {
    const seg = m.faixas.reduce((a, f) => a + f.duracao, 0);
    const existente = playlists.find(p => p.name === m.nome);
    console.log(`  ${m.nome}: ${m.faixas.length} músicas, ${(seg / 3600).toFixed(1)}h${existente ? ` (já existe: ${existente.id}, será regravada)` : ''}`);
  }
  return { values, playlists, personaId, grade };
}

async function aplicar() {
  const { values, playlists, personaId, grade } = await conferir();
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const copia = path.join(RAIZ, 'dados', `antes-de-aplicar-${carimbo}.json`);
  fs.writeFileSync(copia, JSON.stringify({ shows: values.shows, schedule: values.schedule, scheduleOverride: values.scheduleOverride }, null, 1));
  console.log(`\nCópia da grade anterior: ${copia}`);

  const programas = {};
  for (const m of momentos) {
    const existente = playlists.find(p => p.name === m.nome);
    const salvo = await pedir('POST', '/api/playlists', {
      name: m.nome,
      songIds: m.faixas.map(f => f.id),
      playlistId: existente?.id,
      keepInSync: false,
    });
    const playlistId = salvo.playlist?.id || existente?.id;
    if (!playlistId) throw new Error(`a estação não devolveu o id da playlist ${m.nome}`);
    const { entries } = await pedir('GET', `/api/playlists/${encodeURIComponent(playlistId)}`);
    if (entries.length !== m.faixas.length) {
      throw new Error(`${m.nome}: enviei ${m.faixas.length} músicas e a estação guardou ${entries.length}. Parei antes de mexer na grade.`);
    }
    programas[m.id] = { playlistId, showId: idPrograma(m) };
    console.log(`Playlist ${m.nome}: ${entries.length} músicas (${playlistId})`);
  }

  for (const m of momentos) {
    const programa = programaDe(m, programas[m.id].playlistId, personaId);
    const teste = await pedir('POST', '/api/shows/candidates', { show: programa });
    console.log(`Programa ${m.nome}: ${teste.playlist?.effective ?? 0} músicas elegíveis de ${teste.playlist?.total ?? 0}`);
    if (!teste.playlist || teste.playlist.effective < 10) {
      throw new Error(`${m.nome}: poucas músicas elegíveis (${JSON.stringify(teste)}). Parei antes de mexer na grade.`);
    }
    await pedir('POST', '/api/shows', { show: programa });
  }

  fs.writeFileSync(ARQ_ESTACAO, JSON.stringify({ aplicadoEm: new Date().toISOString(), programas }, null, 1));

  // Último passo de propósito: até aqui nada do que está no ar mudou.
  const salvo = await pedir('PUT', '/api/schedule', { schedule: grade });
  console.log(`\nGrade salva. Descartados: ${salvo.dropped}. A troca entra no fim da música atual.`);
}

async function desfazer() {
  const { values, playlists } = await conferir();
  const meus = new Set(momentos.map(idPrograma));
  const grade = {};
  for (let dia = 0; dia < 7; dia++) {
    grade[dia] = Array.from({ length: 24 }, (_, hora) => {
      const atual = values.schedule?.[dia]?.[hora] ?? null;
      return meus.has(atual) ? null : atual;
    });
  }
  await pedir('PUT', '/api/schedule', { schedule: grade });
  console.log('\nGrade limpa: a rádio volta para a programação automática.');
  for (const show of values.shows || []) {
    if (meus.has(show.id)) {
      await pedir('DELETE', `/api/shows/${encodeURIComponent(show.id)}`);
      console.log(`Programa removido: ${show.name}`);
    }
  }
  for (const m of momentos) {
    const lista = playlists.find(p => p.name === m.nome);
    if (lista) {
      await pedir('DELETE', `/api/playlists/${encodeURIComponent(lista.id)}`);
      console.log(`Playlist removida: ${lista.name}`);
    }
  }
  fs.rmSync(ARQ_ESTACAO, { force: true });
}

if (modo === 'aplicar') await aplicar();
else if (modo === 'desfazer') await desfazer();
else {
  await conferir();
  console.log('\nNada foi alterado. Para gravar: node scripts/aplicar-na-estacao.mjs --aplicar');
}
