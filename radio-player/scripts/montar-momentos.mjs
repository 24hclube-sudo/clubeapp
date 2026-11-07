// Monta dados/momentos.json a partir da curadoria abaixo e do banco do Navidrome.
//
// Como rodar: node scripts/montar-momentos.mjs
// Só lê a estação (sqlite em modo somente leitura) e grava arquivos nesta pasta.
// Não cria nada na rádio: quem faz isso é scripts/aplicar-na-estacao.mjs.
//
// Cada faixa é escolhida por "artista | título". Se a biblioteca mudar e uma
// escolha não bater, o script para e avisa em vez de pular em silêncio.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MOMENTOS = [
  {
    id: 'manha', nome: 'Manhã', inicio: 6, fim: 11, cor: '#00bae3', cor2: '#006faf', capa: 'capas/manha.jpg',
    descricao: 'Abrindo a casa sem pressa: violão, voz e sol entrando. MPB, afro-sambas, jazz e soul de manhã cedo.',
    faixas: `
      Baden Powell & Vinicius de Moraes | Canto de Xangô
      Caetano Veloso | Depois que o Ilê passar
      Caetano Veloso | You Don't Know Me
      Carole King | It's Too late
      Chet Baker | Old Devil Moon
      Devendra Banhart | Fancy Man
      Dolly Parton | Jolene
      Domenique Dumont | La Vie va
      Elizeth Cardoso | Manhã de carnaval
      Elton John | Tiny Dancer
      Evinha | Esperar Pra ver
      Fatoumata Diawara | Wililé (feat. Toumani Diabaté)
      Fleetwood Mac | Never Going Back Again (2004 Remaster)
      France Gall | Laisse Tomber Les Filles
      Françoise Hardy | Le temps de l'amour - Stereo Mix
      Gerry Rafferty | Right Down The Line
      Jun Miyake | Lillies Of The Valley
      Kate Bush | Babooshka #1 (Piano & Vocal Overdubs)
      Kevin Morby | Miles, Miles, Miles
      Maalem Mahmoud Gania | Sidi Sma Ya Boulandi
      Milton Nascimento | Tudo que você podia ser
      Moondog | Bird's Lament - Original Mix
      Nina Simone | I Wish I Knew How It Would Feel to Be Free
      Os Mutantes | Banho de lua (Tintarella di luna)
      Os Tincoãs | Deixa a Gira Girar
      Paco de Lucía, Al Di Meola & John McLaughlin | Manhã de Carnaval
      Peter Gabriel | Solsbury Hill
      Pharoah Sanders | Love Is Everywhere
      Polo & Pan | Plage isolée (soleil levant)
      Quincy Jones | Manha de carnaval (Morning of the Carnival)
      Ronnie Von | Cavaleiro De Aruanda
      Sade | By Your Side (Remastered Version)
      Sestetto Dino Piana E Oscar Valdambrini | Omaca
      TAKEN BY TREES | Make 1,2
      Talking Heads | This Must Be the Place (Naive Melody) [2005 Remaster]
      The Bongo Hop | Agua Fria
      The Orb feat. Lee Scratch Perry | Golden Clouds
      The Rolling Stones | Heaven (Remastered)
      Toquinho E Vinicius | O Canto de Oxum
      Varios Artistas | Napule Canta E More
      Oasis  | Wonderwall (Remastered)
      Dominic Fike | Babydoll
      Malcolm Todd | Earrings
      Fleetwood Mac | Dreams
      Ned Doheny | Get It Up for Love
      Cymande | Dove
      Neşe Karaböcek | Çayelinden Öteye/Yali Yali
      Letta Mbulu  | Vumani Makhosi
      Sanullim | Don’t Go
      Al Green | Here I Am (Come and Take Me)
      Brazil XXI | Amor en Milano
      Christy Essien Igbokwe | Take Life Easy
      Dom Salvador & Abolição | Hei! Você
      Ebo Taylor & Uhuru-Yenzu | What Is Life
      Francis Bebey | Bissau
      Jorge Ben Jor, Caetano Veloso | Ive Brussell (feat. Caetano Veloso)
      Joe Bataan | Gypsy Woman
      Kate Bush | Cloudbusting
      Steve Monite | Only You
      Talking Heads | (Nothing But) Flowers [2005 Remaster]
      The Stranglers | Golden Brown
      Traffik Island | Ulla Dulla
    `,
  },
  {
    id: 'almoco', nome: 'Almoço', inicio: 11, fim: 15, cor: '#00c44a', cor2: '#007000', capa: 'capas/almoco.jpg',
    descricao: 'Mesa cheia e conversa solta: groove leve, afro, soul e Brasil, sempre abaixo da voz de quem está à mesa.',
    faixas: `
      Al Green | Here I Am (Come and Take Me)
      Amason | Duvan
      Bombay Bicycle Club | Lights Out, Words Gone
      Brazil XXI | Amor en Milano
      Christy Essien Igbokwe | Take Life Easy
      Demis Roussos | I Dig You
      Dom Salvador & Abolição | Hei! Você
      Ebo Taylor & Uhuru-Yenzu | What Is Life
      Francis Bebey | Bissau
      Hubbabubbaklubb | Mopedbart
      Issa Bagayogo | Kalan Nege
      Joe Bataan | Gypsy Woman
      John Wizards | iYongwe
      Jorge Ben Jor, Caetano Veloso | Ive Brussell (feat. Caetano Veloso)
      Kate Bush | Cloudbusting
      King Sunny Adé | Ja Funmi
      L'Impératrice ♕ | Agitations tropicales
      Part Time | Soñando De Ti
      Polo & Pan | Rivolta
      Queen | Cool Cat (Remastered 2011)
      Sade | By Your Side (Cottonbelly's Fola Mix Edit)
      Sister Nancy | Ain't No Stopping Nancy
      Sister Sledge | Pretty Baby
      Steely Dan | Do It Again
      Stereolab | Lo Boob Oscillator
      Steve Monite | Only You
      Supertramp | Goodbye Stranger (Remastered 2026)
      T.P. Orchestre Poly-Rythmo De Cotonou | Noude Ma Gnin Tche de Me
      Talking Heads | Don't Worry About the Government (2005 Remaster)
      Talking Heads | Love → Building on Fire (2005 Remaster)
      Talking Heads | (Nothing But) Flowers [2005 Remaster]
      Tears for Fears | Everybody Wants to Rule the World
      The Calling | Wherever You Will Go
      The Doobie Brothers | Long Train Runnin’
      The Stranglers | Golden Brown
      Traffik Island | Ulla Dulla
      Val Bennet | The Russians Are Coming
      Duran Duran | Ordinary World
      Elizio De Buzios | Tamanqueiro (Selvagem Edit)
      Massive Attack | Be Thankful for What You’ve Got
      The Bongo Hop | Agua Fria
      Polo & Pan | Plage isolée (soleil levant)
      Cymande | Dove
      Ned Doheny | Get It Up for Love
      Fleetwood Mac | Dreams
      Malcolm Todd | Earrings
      Dominic Fike | Babydoll
      Letta Mbulu  | Vumani Makhosi
      Neşe Karaböcek | Çayelinden Öteye/Yali Yali
      Sanullim | Don’t Go
      Carole King | It's Too late
      Caetano Veloso | You Don't Know Me
      Gerry Rafferty | Right Down The Line
      Os Mutantes | Banho de lua (Tintarella di luna)
      Talking Heads | This Must Be the Place (Naive Melody) [2005 Remaster]
      Seal | Crazy
      Oro | Sasà
    `,
  },
  {
    id: 'tarde', nome: 'Tarde', inicio: 15, fim: 19, cor: '#ff7452', cor2: '#ff3308', capa: 'capas/tarde.jpg',
    descricao: 'O dia pega embalo: disco, funk e new wave para a casa ir enchendo até o começo da noite.',
    faixas: `
      Amadou & Mariam | Bofou Safou (Lully remix)
      Baccara | Yes Sir, I Can Boogie
      Boney M. | Daddy Cool
      Chemise | She Can't Love You (12'' Version)
      Diana Ross | I'm Coming Out
      Dire Straits | Walk Of Life
      Earth, Wind & Fire | September
      Electric Light Orchestra | Last Train To London
      Jefferson Airplane | White Rabbit (mono single version)
      Kate Bush | Running Up That Hill
      Kate Bush | Wuthering Heights
      Luscious Jackson | Naked Eye
      Marcel King | Reach For Love (New York Remix) (Unmixed)
      Mim Suleiman | Oya Oya Oya (prod. Maurice Fulton)
      MLiR | People
      Mystic Jungle | Words Of Love
      Neil Diamond | Sweet Caroline
      New Order | Age of Consent - 2015 Remaster
      Oby Onyioha | Enjoy Your Life
      Oro | Sasà
      Pino D'Angiò | Okay Okay
      Plustwo | Melody
      Punkin Machine | I Need You Tonight
      Rahaan | Disco Fantasy
      Seal | Crazy
      Senay | Dalkavuk (Baris K Edit) (Bonus Track)
      Shakira | La Tortura (Invitado Alejandro Sanz)
      Sister Sledge | Thinking Of You (Dimitri From Paris Remix)
      Supertramp | The Logical Song (Remastered 2026)
      Talking Heads | Take Me to the River (2005 Remaster)
      Talking Heads | Who Is It? (2005 Remaster)
      Talking Heads | Sugar on My Tongue (2003 Remaster)
      Tavares | Heaven Must Be Missing An Angel (Pt. 1)
      Tears for Fears | Head Over Heels (Dave Bascombe 7″ N.mix)
      Tears for Fears | Sowing the Seeds of Love
      the apostles | don't huzzle for love
      The Cure | Just Like Heaven
      The Human League | Don't You Want Me
      The Mauskoviç Dance Band | Repeating Night
      The Rolling Stones | Dance, Part 1
      The Wiseguys | Too Easy
      Thelma Houston | Don't Leave Me This Way (Single Version)
      Toto | Hold the Line (Album Version)
      Voilaaa | Niarela
      War | Low Rider
      Wings | Goodnight Tonight
      [Unknown Artist] | Donna Summer - Hot Stuff (Original 12'')
      Bronski Beat | Smalltown Boy
      Yazoo | Situation (US 12'' Remix by Francois Kevorkian)
      Sister Sledge | Pretty Baby
      Steely Dan | Do It Again
      Gay Marvine | Lost in Music
      Ministry Of Funk | Lovely Day (Original Mix) (South American Grooves) 123
    `,
  },
  {
    id: 'janta', nome: 'Janta', inicio: 19, fim: 23, cor: '#ff3308', cor2: '#7a0f00', capa: 'capas/janta.jpg',
    descricao: 'Luz baixa e prato na mesa: Sade, soul, trip hop e house lento, esquentando sem atropelar a conversa.',
    faixas: `
      Acid Pauli | Nana (Vinyl Version)
      Ahmed Spins & Stevo Atambire | Anchor Point
      Aquarius Heaven | Universe
      Autarkic | Rotation! Rotation! (Red Axes Remix)
      Bicep | Opal (Four Tet Remix)
      Blond:ish | Wizard of Love
      Bruxas | Más Profundo
      Chez Damier & Stacy Pullen | Forever Monna
      Chris Isaak | Wicked Game
      Daft Punk | Make Love
      Disclosure | Help Me Lose My Mind (feat. London Grammar)
      Drake feat. Black Coffee & Jorja Smith | Get It Together
      Drake feat. Rihanna | Too Good
      Duke Dumont | Ocean Drive (extended mix)
      Fatima Yamaha | Love Invaders
      Fatima Yamaha | Sooty Shearwater, King of Migration
      Fort Romeau | Saku
      Groove Armada | My Friend
      HNNY | Yogalates
      Inxs | Never Tear Us Apart
      Jacques Greene | Quicksand
      Jaguar Jaguar & Chambord | Born In Blue (Original Mix)
      Jagwar Ma | Come Save Me (The Pachanga Boys' Jagwar Pawar Version)
      Joakim | Forever Young (Discodeine Remix)
      Joakim | Nothing Gold (Todd Terje Remix)
      John Maus | Walls of Silence
      Jurgen Paape | So Weit Wie Noch Nie
      Lauer | Hershel
      Massive Attack | Be Thankful for What You’ve Got
      Massive Attack | Paradise Circus
      Nicola Cruz | Tzantza
      Nicolas Jaar | Variations
      Nicolas Jaar feat. Lorraine | No One Is Looking at U
      P-Sol | This Must Be Home (Original Mix)
      Pet Shop Boys | Being Boring
      Pional | A New Dawn
      Polo & Pan | Rivolta (Get a Room! remix)
      Red Axes | Sabor Feat. Arbao (Original Mix)
      Röyksopp | The Drug
      RÜFÜS DU SOL | Innerbloom
      Sade | Hang on to Your Love (Remastered Version)
      Sade | By Your Side (Remastered Version)
      Shakarchi & Stranéus | Hessingen
      The Avener & Phoebe Killdeer | Fade Out Lines (The Avener Rework)
      Tina Turner | Let's Stay Together (Single Version)
      Total Giovanni | Human Animal
      V.O. | Mashisa (Dub)
      Young Marco | The Best I Could Do (With What I Had)
    `,
  },
  {
    id: 'madrugada-festa', nome: 'Madrugada Festa', inicio: 23, fim: 6, cor: '#00a0e6', cor2: '#ff3308', capa: 'capas/madrugada-festa.jpg',
    descricao: 'A pista manda: house, disco e clássicos de clube até o sol nascer, do bar ao rooftop.',
    faixas: `
      [Unknown Artist] | 07 - Magic Box - If You (Radio Mix)
      [Unknown Artist] | 26. Benoit & Sergio - Walk And Talk
      [Unknown Artist] | 01. Can't Get Over (Radio Edit)
      [Unknown Artist] | Donna Summer - Hot Stuff (Original 12'')
      &ME, Black Coffee & Keinemusik | The Rapture Pt.III
      Afro Medusa | Pasilda (Knee Deep club mix) (Mixed)
      Alex Gaudino feat. Crystal Waters | Destination Calabria (feat. Crystal Waters) [Radio Edit]
      Alice Deejay | Megamix
      Armand van Helden feat. Duane Harden | You Don’t Know Me
      Benassi Bros. Feat. Sandy Chambers | Get Better (Sfaction Version)
      Björk | Big Time Sensuality (The Fluke Minimix)
      Bronski Beat | Smalltown Boy
      C Boys | Born Slippy (Sorrentino Mix)
      Calvin Harris & Disciples | How Deep Is Your Love
      Calvin Harris feat. Rihanna | We Found Love
      Capablanca & T. Keeler | No Hay Ritmo
      CeCe Peniston | Finally
      Disko Junkie | I Like To Party (Original Mix)
      FCL | It's You (Mousse T.'s Teef Vocal Mix)
      Gabriel Ananda & Maceo Plex | Solitary Daze
      Gay Marvine | Lost in Music
      Giancarlo D'Auria | Follia
      Gigi D'Agostino | Casa Dag
      Groove Armada | Superstylin’
      Hardrive | Deep Inside (Original 12 Inch)
      Ian Carey | Keep On Rising feat. Michelle Shellers (Rocco vs. Bass-T Bootleg Radio Mix)
      In Flagranti | Different from the Rest
      James Mac & Vall ft. Rosalie. | The Boy Is Mine
      Jamiroquai | Space Cowboy (David Morales Mix)
      Junior Jack | My Feeling (Kick 'n Deep Mix)
      Kings Of Tomorrow + Julie McKnight | Finally (Original Extended Mix)
      Krankbrother  |  When You're Watching Me (Original mix)
      Layo and bushwacka! | Love Story (vs Finally) (Tim Deluxe Radio Mix)
      LCD Soundsystem | Dance Yrself Clean
      Madonna | Vogue (Edit)
      Marie Davidson | Work It (Soulwax Remix)
      Martin Ikin, Noizu | Burnin' (Original Mix)
      Midland | Final Credits (Radio Edit)
      Ministry Of Funk | Lovely Day (Original Mix) (South American Grooves) 123
      Ministry of Sound | X Press 2 Feat. David Byrne - Lazy
      Moby | I Love to Move in Here
      Moloko | Sing It Back (Boris Musical Mix Edit)
      Moony | Dove (I'll Be Loving You) (T&F vs. Moltosugo Radio Mix)
      New Scene | PSG 22
      Nick Monaco | The Stalker (Original Mix)
      Nightcrawlers | Push The Feeling On 2003
      NO ZU | Raw Vis Vision
      Noir & Haze | Around (Solomun vox)
      Oxia | Domino
      Pachanga Boys | Time
      Patrick Cowley | Get a Little
      Peggy Gou | Starry Night (Original Mix)
      Peso Pluma, Anitta | BELLAKEO
      Phats & Small | Turn Around
      Phillipi & Rodrigo | Karma
      Phillipi & Rodrigo | Gueto De Gent
      Professor Kliq | I'll Go Rhythm
      Reinier Zonneveld | Plastic People
      Roger Sanchez | Another Chance (Radio Edit)
      Rui Da Silva | Touch Me (Original 12'' Mix)
      Ry & Frank Wiedemann | Howling (Âme Remix)
      Sandy B, Lion's Drums | Student Night (Lion's Drums Edit)
      Shakedown | At Night (Purple Disco Machine Extended Remix)
      Shakira , Burna Boy | Dai Dai
      Soulsearcher | Can't Get Enough! (Vocal Club Mix)
      Sounds Of Blackness | The Pressure (Frankie Knuckles Classic Mix)
      Spiller • Sophie Ellis-Bextor | Groovejet (If This Ain't Love) [feat. Sophie Ellis-Bextor] (Extended Vocal Mix)
      Stardust, Benjamin Diamond, Alan Braxe | Music Sounds Better With You (feat. Thomas Bangalter) (Radio Edit)
      Temper City | Self Aware
      The 2 Bears | The Birds & The Bees (Filthy Dukes remix)
      The Shapeshifters | Lola's Theme Recut (Radio Edit)
      Tia Carys • Jerome Williams | Reflect In Mirrors
      Tim Deluxe & Sam Obernik | It Just Won’t Do (radio edit)
      Tim Lucent | Hakyo No Kiki (ft. Kristos x Mona Matsuoka)
      Todd Terje | Inspector Norse
      Ultra Naté | Free (Mood II Swing radio mix)
      Whigfield | Saturday Night (Radio Edit)
      Whirlpool Productions | From Disco To Disco (Remastered)
      Whitney Houston | I Wanna Dance With Somebody (Who Loves Me) (12" remix)
      William Orbit | Barber's Adagio For Strings (Ferry Corsten Remix)
      Yaeji | raingurl
      Yazoo | Situation (US 12'' Remix by Francois Kevorkian)
    `,
  },
];

// Só muda o que aparece na tela; os arquivos e as etiquetas da biblioteca ficam como estão.
const LIMPEZA = [
  [/^\[Unknown Artist\] \| \d+[.\s-]*\s*(.+?) - (.+)$/, m => ({ artista: m[1], titulo: m[2] })],
  [/^\[Unknown Artist\] \| Donna Summer - (.+)$/, m => ({ artista: 'Donna Summer', titulo: m[1] })],
  [/^\[Unknown Artist\] \| 01\. (Can't Get Over.*)$/, m => ({ artista: 'Kasino', titulo: m[1] })],
  [/^Bj.{1,2}rk \| (.+)$/, m => ({ artista: 'Björk', titulo: m[1] })],
  [/^Ministry of Sound \| X Press 2 Feat\. David Byrne - (.+)$/, m => ({ artista: 'X-Press 2 feat. David Byrne', titulo: m[1] })],
  [/^Varios Artistas \| (Napule Canta E More)$/, m => ({ artista: 'Donatella Viggiano', titulo: m[1] })],
  [/^Ministry Of Funk \| Lovely Day \(Original Mix\).*$/, () => ({ artista: 'Ministry Of Funk', titulo: 'Lovely Day (Original Mix)' })],
  [/^Inxs \| (.+)$/, m => ({ artista: 'INXS', titulo: m[1] })],
  [/^Tears For Fears \| ヘッド.*$/, () => ({ artista: 'Tears for Fears', titulo: 'Head Over Heels (ao vivo)' })],
  [/^TAKEN BY TREES \| (.+)$/, m => ({ artista: 'Taken by Trees', titulo: m[1] })],
  [/^Toquinho E Vinicius \| (.+)$/, m => ({ artista: 'Toquinho & Vinicius', titulo: m[1] })],
  [/^Shakira , Burna Boy \| (.+)$/, m => ({ artista: 'Shakira, Burna Boy', titulo: m[1] })],
];

function limpar(artista, titulo) {
  const chave = `${artista} | ${titulo}`;
  for (const [padrao, fazer] of LIMPEZA) {
    const m = chave.match(padrao);
    if (m) return fazer(m);
  }
  return { artista: artista.trim(), titulo: titulo.trim() };
}

function lerBiblioteca() {
  const sql = 'select id, path, title, artist, album, duration, year, genre, missing from media_file where missing = 0';
  const saida = execFileSync('docker', ['exec', 'cl-navidrome', 'sqlite3', '-readonly', '-json', '/data/navidrome.db', sql], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(saida);
}

const normal = s => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const chaveDe = (artista, titulo) => normal(`${artista} | ${titulo}`);

const biblioteca = lerBiblioteca();
const porChave = new Map();
for (const f of biblioteca) {
  const k = chaveDe(f.artist || '', f.title || '');
  // Em cópias repetidas fica a primeira; a estação também trata como uma só.
  if (!porChave.has(k)) porChave.set(k, f);
}
// Björk vem com letra quebrada no banco, então procura por aproximação.
const aproximar = artista => [...porChave.entries()].find(([k]) => k.startsWith(artista));

const erros = [];
const usados = new Map();
const correcoes = {};
const momentos = MOMENTOS.map(m => {
  const linhas = m.faixas.split('\n').map(l => l.trim()).filter(Boolean);
  const vistos = new Set();
  const faixas = [];
  for (const linha of linhas) {
    if (vistos.has(linha)) { erros.push(`${m.nome}: repetida na lista: ${linha}`); continue; }
    vistos.add(linha);
    const [artista, ...resto] = linha.split(' | ');
    const titulo = resto.join(' | ');
    let f = porChave.get(chaveDe(artista, titulo));
    if (!f && artista.startsWith('Björk')) f = aproximar('bj')?.[1];
    if (!f) { erros.push(`${m.nome}: não achei na biblioteca: ${linha}`); continue; }
    usados.set(f.id, [...(usados.get(f.id) || []), m.id]);
    const limpo = limpar(f.artist || '', f.title || '');
    if (limpo.artista !== f.artist || limpo.titulo !== f.title) {
      correcoes[f.id] = { artista: limpo.artista, titulo: limpo.titulo };
    }
    faixas.push({
      id: f.id,
      titulo: limpo.titulo,
      artista: limpo.artista,
      album: f.album || '',
      ano: f.year || null,
      duracao: Math.round(f.duration || 0),
    });
  }
  const { faixas: _texto, ...resto } = m;
  return { ...resto, faixas };
});

if (erros.length) {
  console.error('Curadoria não bate com a biblioteca:\n  ' + erros.join('\n  '));
  process.exit(1);
}

// Correções de exibição também para o que estiver fora das listas (agora tocando).
for (const f of biblioteca) {
  const limpo = limpar(f.artist || '', f.title || '');
  if (limpo.artista !== f.artist || limpo.titulo !== f.title) {
    correcoes[f.id] = { artista: limpo.artista, titulo: limpo.titulo };
  }
}

const foraDasListas = [...porChave.values()]
  .filter(f => !usados.has(f.id))
  .map(f => `${f.artist} — ${f.title}`)
  .sort();

const semCapa = biblioteca.filter(f => /^\[unknown/i.test(f.album || '')).map(f => f.id);

fs.writeFileSync(path.join(RAIZ, 'dados', 'momentos.json'), JSON.stringify({ versao: 1, momentos, correcoes, semCapa }, null, 1));

const fmt = s => `${Math.floor(s / 3600)}h${String(Math.round(s % 3600 / 60)).padStart(2, '0')}`;
let md = '# Proposta de playlists da Rádio CLUBE\n\n';
md += 'Ainda não está no ar. Nada muda na rádio até você aprovar.\n\n';
md += '| Momento | Horário | Músicas | Duração da lista | Tempo no ar |\n|---|---|---:|---:|---:|\n';
for (const m of momentos) {
  const seg = m.faixas.reduce((a, f) => a + f.duracao, 0);
  const horas = (m.fim - m.inicio + 24) % 24;
  md += `| ${m.nome} | ${String(m.inicio).padStart(2, '0')}h às ${String(m.fim).padStart(2, '0')}h | ${m.faixas.length} | ${fmt(seg)} | ${horas}h |\n`;
}
for (const m of momentos) {
  md += `\n## ${m.nome} (${String(m.inicio).padStart(2, '0')}h às ${String(m.fim).padStart(2, '0')}h)\n\n${m.descricao}\n\n`;
  m.faixas.forEach((f, i) => { md += `${i + 1}. ${f.artista} — ${f.titulo}\n`; });
}
md += `\n## Fora das listas (${foraDasListas.length})\n\nContinuam na biblioteca; só não entram em nenhum momento.\n\n`;
foraDasListas.forEach(l => { md += `- ${l}\n`; });
const emDuas = [...usados.entries()].filter(([, ms]) => ms.length > 1);
md += `\n## Em dois momentos (${emDuas.length})\n\nMúsicas que servem para mais de um horário e ajudam a lista a durar o tempo no ar.\n\n`;
const porId = new Map(biblioteca.map(f => [f.id, f]));
for (const [id, ms] of emDuas) {
  const f = porId.get(id);
  const nomes = ms.map(x => momentos.find(m => m.id === x).nome).join(' e ');
  md += `- ${limpar(f.artist || '', f.title || '').artista} — ${limpar(f.artist || '', f.title || '').titulo}: ${nomes}\n`;
}
fs.writeFileSync(path.join(RAIZ, 'PROPOSTA.md'), md);

for (const m of momentos) {
  const seg = m.faixas.reduce((a, f) => a + f.duracao, 0);
  console.log(`${m.nome.padEnd(16)} ${String(m.faixas.length).padStart(3)} músicas  ${fmt(seg)}  (no ar ${(m.fim - m.inicio + 24) % 24}h)`);
}
console.log('fora das listas:', foraDasListas.length);
foraDasListas.forEach(l => console.log('  ' + l));
console.log('em dois momentos:', emDuas.length);
