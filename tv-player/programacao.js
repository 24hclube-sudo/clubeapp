// Programação circadiana das telas e fitas: uma camada por cima do que está no ar.
// Nada do estado manual (cena, cor, filtro) é apagado: desligou a programação, volta tudo como estava.
//
// Regras:
//  - Cada zona só segue a programação se ela estiver ligada e a zona marcada.
//  - Mexer numa zona pelo app (cena, cor, logo) tira só aquela zona da programação até o horário
//    de retorno (padrão 06:00), para ninguém ser atropelado no meio de uma festa.
//  - O brilho do app continua valendo por cima: é o teto, e a faixa do dia escurece dentro dele.
const fs = require('fs');
const path = require('path');
const Ambiente = require('./public/ambiente.js');

const ARQUIVO = path.join(__dirname, 'programacao.json');

// Telas e fitas que entram na programação. O painel da pista (5º) fica de fora: ele é do MadMapper.
const ZONAS = [
  { id: 'telas:telas:1', nome: 'TVs do bar', andar: '1', tipo: 'tela' },
  { id: 'telas:led:1', nome: 'Painel LED do térreo', andar: '1', tipo: 'tela' },
  { id: 'fita:terreo', nome: 'Bancada do térreo', andar: '1', tipo: 'fita' },
  { id: 'fita:sexto', nome: 'Bancada do 5º', andar: '5', tipo: 'fita' },
  { id: 'fita:barras', nome: 'Barras do 5º', andar: '5', tipo: 'fita' },
];

// Brancos das fitas: a fita tem LED branco QUENTE e aplica gama 2 antes de separar o W. Por isso
// #ffd5a1 sai só no LED quente (~2700 K), #ffffff soma verde e azul (neutro) e #e8f0ff é o mais frio.
const BRANCO_QUENTE = '#ffd5a1', BRANCO_MORNO = '#ffead0', BRANCO = '#ffffff', BRANCO_FRIO = '#e8f0ff';

// Tons da identidade (instagram/assets/clube.css: névoa, aço, grafite, metal, azul, verde, vermelho).
function faixasPadrao() {
  const f = (id, nome, inicio, transicao, telas, fitas) => ({ id, nome, inicio, transicao, telas, fitas });
  const t = (cores, efeito, vel, brilho) => ({ cores, efeito, vel, brilho });
  const igual = brilho => ({ igual: true, brilho });
  return [
    f('amanhecer', 'Amanhecer', '06:00', 60, t(['#9d9d9e', '#6f6f6f', '#b7b9bc'], 'deriva', 4, 55), t([BRANCO_QUENTE, '#ffc98a', BRANCO_MORNO], 'deriva', 4, 60)),
    f('manha', 'Manhã', '08:30', 60, t(['#b7b9bc', '#9d9d9e', '#cccccd'], 'deriva', 4, 85), t([BRANCO_MORNO, BRANCO, BRANCO_MORNO], 'deriva', 4, 85)),
    f('dia', 'Dia', '11:30', 60, t(['#e3e4e5', '#cccccd', '#b7b9bc'], 'onda', 4, 100), t([BRANCO, BRANCO_FRIO, BRANCO], 'onda', 4, 100)),
    f('tarde', 'Tarde', '15:30', 60, t(['#b7b9bc', '#9d9d9e', '#858585'], 'onda', 4, 85), t([BRANCO, BRANCO_MORNO, BRANCO], 'deriva', 4, 90)),
    f('fim-de-tarde', 'Fim de tarde', '17:30', 45, t(['#d2d3d3', '#9c9d9d', '#6f6f6f'], 'respira', 4, 70), t([BRANCO_QUENTE, BRANCO_MORNO, BRANCO_QUENTE], 'respira', 4, 75)),
    f('anoitecer', 'Anoitecer', '19:00', 60, t(['#07b9df', '#0070ae', '#003a5c'], 'deriva', 8, 70), igual(70)),
    f('noite', 'Noite', '21:30', 45, t(['#00c059', '#00771a', '#003d2a'], 'plasma', 10, 65), igual(65)),
    f('madrugada', 'Madrugada', '23:30', 45, t(['#ff8564', '#ff4c2c', '#b00000'], 'plasma', 12, 60), igual(60)),
    f('fim-de-noite', 'Fim de noite', '03:00', 60, t(['#ff7a1a', '#b53a00', '#3a0e00'], 'respira', 4, 35), igual(40)),
  ];
}

function padrao() {
  const zonas = {};
  for (const z of ZONAS) zonas[z.id] = true;
  return { ligada: false, zonas, retorno: '06:00', faixas: faixasPadrao(), anuncios: [], manual: {} };
}

const HEX = /^#[0-9a-f]{6}$/i, HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const num = (v, a, b, reserva) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : reserva; };
const txt = (v, max) => String(v == null ? '' : v).slice(0, max);
const idNovo = p => p + '-' + Date.now().toString(36);

function limparSuperficie(s, antes) {
  s = s || {}; antes = antes || {};
  const cores = Array.isArray(s.cores) && s.cores.length === 3 && s.cores.every(c => HEX.test(c)) ? s.cores.map(c => c.toLowerCase()) : antes.cores;
  const fora = { brilho: num(s.brilho, 0, 100, antes.brilho == null ? 100 : antes.brilho) };
  if (s.igual === true || (s.igual === undefined && !s.cores && antes.igual)) return { igual: true, ...fora };
  return {
    cores: cores || ['#9d9d9e', '#6f6f6f', '#b7b9bc'],
    efeito: Ambiente.EFEITOS[s.efeito] ? s.efeito : (antes.efeito || 'deriva'),
    vel: num(s.vel, 0, 120, antes.vel == null ? 4 : antes.vel),
    ...fora,
  };
}
function limparFaixa(f, antes) {
  antes = antes || {};
  return {
    id: txt(f.id || antes.id || idNovo('faixa'), 40),
    nome: txt(f.nome == null ? antes.nome : f.nome, 30) || 'Faixa',
    inicio: HORA.test(f.inicio) ? f.inicio : (antes.inicio || '12:00'),
    transicao: num(f.transicao, 0, 240, antes.transicao == null ? 45 : antes.transicao),
    telas: limparSuperficie(f.telas, antes.telas),
    fitas: limparSuperficie(f.fitas, antes.fitas),
  };
}

function criarProgramacao(op) {
  // op: { zonaDaTela(id), telasDaZona(zid), enviarTela(id, msg), aoMudarConteudo(), aoMudarEstado(),
  //       aoMudarArquivos(), publicar(msg), srcDeMidia(arq), ffmpeg(args), lerDuracao(arq), MEDIA_DIR, PUBLIC_DIR, sendJson }
  let d = padrao();
  try {
    const lido = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8').replace(/^﻿/, '')); // sem o BOM do PowerShell
    d = { ...d, ...lido, zonas: { ...d.zonas, ...(lido.zonas || {}) }, manual: lido.manual || {} };
  } catch (e) {
    if (e.code !== 'ENOENT') console.log(`programação: não li ${ARQUIVO} (${e.message}), usando a padrão`);
  }

  let salvarT = null;
  function salvar() {
    clearTimeout(salvarT);
    salvarT = setTimeout(() => {
      // grava num temporário e renomeia: uma queda de luz no meio não corrompe o arquivo
      const tmp = ARQUIVO + '.tmp';
      fs.writeFile(tmp, JSON.stringify(d, null, 2), e => {
        if (e) return console.log('programação: não salvou:', e.message);
        fs.rename(tmp, ARQUIVO, e2 => { if (e2) console.log('programação: não salvou:', e2.message); });
      });
    }, 300);
  }

  const tz = () => -new Date().getTimezoneOffset();
  const progPublica = () => ({ tz: tz(), faixas: d.faixas });
  let comp;
  try {
    comp = Ambiente.compilar(progPublica());
  } catch (e) { // programacao.json estragado não pode impedir o servidor de subir
    console.log(`programação: faixas inválidas (${e.message}), usando as originais`);
    d.faixas = faixasPadrao(); d.ligada = false;
    comp = Ambiente.compilar(progPublica());
  }
  let teste = null;        // { minuto, desde, ate }
  let atual = null;        // anúncio no ar: { id, startAt, fim, msg }
  let ultimaFaixa = null;
  const recompilar = () => { comp = Ambiente.compilar(progPublica()); cacheFitas = {}; };

  const segue = zid => !!(d.ligada && d.zonas[zid] && !d.manual[zid]);

  // Próxima vez que o relógio marca HH:MM (a saída do modo manual).
  function proximoHorario(hhmm, agora) {
    const local = agora + tz() * 60000, dia = Math.floor(local / 86400000);
    let alvo = dia * 86400000 + Ambiente.minutos(hhmm) * 60000;
    if (alvo <= local) alvo += 86400000;
    return alvo - tz() * 60000;
  }

  // ---------- telas ----------
  function conteudo(id) {
    const zid = op.zonaDaTela(id);
    const ids = op.telasDaZona(zid);
    return { kind: 'ambiente', prog: progPublica(), parede: { i: Math.max(0, ids.indexOf(id)), n: Math.max(1, ids.length) },
      teste: teste ? { minuto: teste.minuto, desde: teste.desde } : null };
  }

  // ---------- fitas ----------
  // Uma função por instalação, trocada a cada quadro; as cores só são recalculadas de 2 em 2 s.
  let cacheFitas = {};
  function lutFitas(agora) {
    const c = cacheFitas;
    if (c.lut && agora - c.t < 2000) return c.lut;
    c.lut = Ambiente.criarLut(Ambiente.superficie(Ambiente.momento(comp, agora, teste), 'fitas'));
    c.t = agora;
    return c.lut;
  }
  function estadoFita(inst, agora) {
    if (!segue('fita:' + inst)) return null;
    const mo = Ambiente.momento(comp, agora, teste);
    const s = Ambiente.superficie(mo, 'fitas');
    const pinta = Ambiente.pintor(s, lutFitas(agora), agora / 1000);
    const saida = [0, 0, 0];
    const vertical = inst === 'barras';
    const pintar = (_p, x, _r, _f, h) => {
      // bancada: ao longo do comprimento; barras: sobe pela altura, cada barra um pouco defasada
      if (vertical) pinta(h * 0.8 + x * 0.25, x, saida, 0); else pinta(x, h, saida, 0);
      return saida;
    };
    return { ativo: { tipo: 'ambiente', pintar }, velocidade: 1, bpm: 120, filtro: null };
  }

  // ---------- anúncios ----------
  const noPrazo = (a, agora) => {
    if (a.de && agora < new Date(a.de).getTime()) return false;
    if (a.ate && agora > new Date(a.ate).getTime()) return false;
    return true;
  };
  const naJanela = (a, agora) => {
    if (!a.horaDe || !a.horaAte) return true;
    const m = Ambiente.momento(comp, agora).minuto, x = Ambiente.minutos(a.horaDe), y = Ambiente.minutos(a.horaAte);
    return x <= y ? m >= x && m < y : m >= x || m < y;
  };
  const totalMs = a => (a.itens || []).reduce((s, i) => s + (i.dur || a.durImagem || 10) * 1000, 0);
  const zonasDoAnuncio = a => (a.zonas || []).filter(segue);

  function msgAnuncio(a, startAt) {
    const s = Ambiente.superficie(Ambiente.momento(comp, startAt, teste), 'telas');
    return {
      type: 'anuncio', id: a.id, startAt, total: totalMs(a), fundo: a.fundo === 'ambiente' ? 'ambiente' : 'preto',
      // o anúncio acompanha o dia: de madrugada não estoura o brilho, mas nunca fica ilegível
      brilho: Math.max(0.6, s.brilho), texto: a.textoLed || '',
      itens: (a.itens || []).map(i => ({ kind: i.kind, src: op.srcDeMidia(i.arquivo), dur: i.dur || a.durImagem || 10 })),
    };
  }
  function enviarAnuncio(msg, a) {
    for (const zid of zonasDoAnuncio(a)) {
      const paraTela = zid === 'telas:led:1' ? { ...msg, itens: [] } : { ...msg, texto: '' };
      if (zid === 'telas:led:1' && !msg.texto) continue;
      for (const id of op.telasDaZona(zid)) op.enviarTela(id, paraTela);
    }
  }
  function dispararAnuncio(a, agora) {
    const startAt = agora + 1500; // folga para todas as telas começarem juntas
    const msg = msgAnuncio(a, startAt);
    atual = { id: a.id, startAt, fim: startAt + msg.total, msg };
    a.ultimo = agora;
    enviarAnuncio(msg, a);
    console.log(`anúncio no ar: ${a.nome}`);
    salvar();
    publicar();
  }
  function encerrarAnuncio() {
    if (!atual) return;
    const a = d.anuncios.find(x => x.id === atual.id);
    atual = null;
    for (const z of ZONAS) if (z.tipo === 'tela') for (const id of op.telasDaZona(z.id)) op.enviarTela(id, { type: 'anuncio', fim: true });
    if (a) publicar();
  }
  function tickAnuncios(agora) {
    if (atual) {
      if (agora >= atual.fim) { atual = null; publicar(); }
      return;
    }
    if (!d.ligada || teste) return;
    let melhor = null, atraso = 0;
    for (const a of d.anuncios) {
      if (!a.ativo || !(a.itens || []).length || !noPrazo(a, agora) || !naJanela(a, agora)) continue;
      if (!zonasDoAnuncio(a).length) continue;
      const passou = agora - (a.ultimo || 0) - (a.cadaMin || 10) * 60000;
      if (passou >= 0 && (!melhor || passou > atraso)) { melhor = a; atraso = passou; }
    }
    if (melhor) dispararAnuncio(melhor, agora);
  }
  function statusAnuncio(a, agora) {
    if (a.ate && agora > new Date(a.ate).getTime()) return { tipo: 'encerrado', texto: 'Encerrado' };
    if (a.de && agora < new Date(a.de).getTime()) return { tipo: 'agendado', texto: 'Começa depois' };
    if (!a.ativo) return { tipo: 'pausado', texto: 'Pausado' };
    if (!d.ligada) return { tipo: 'parado', texto: 'Programação desligada' };
    if (atual && atual.id === a.id) return { tipo: 'noar', texto: 'No ar agora' };
    if (!naJanela(a, agora)) return { tipo: 'janela', texto: 'Fora do horário' };
    const falta = (a.ultimo || 0) + (a.cadaMin || 10) * 60000 - agora;
    return { tipo: 'espera', texto: falta <= 0 ? 'Entra já' : `Entra em ${Math.ceil(falta / 60000)} min`, falta: Math.max(0, falta) };
  }
  const arquivosAnuncios = () => {
    const l = [];
    for (const a of d.anuncios) for (const i of a.itens || []) l.push(i.arquivo);
    return l;
  };

  // Reenvia o anúncio que está no ar para quem acabou de conectar (TV que voltou do Wi-Fi).
  function anuncioPara(id) {
    if (!atual) return null;
    const a = d.anuncios.find(x => x.id === atual.id);
    if (!a) return null;
    const zid = op.zonaDaTela(id);
    if (!zonasDoAnuncio(a).includes(zid)) return null;
    if (zid === 'telas:led:1') return atual.msg.texto ? { ...atual.msg, itens: [] } : null;
    return { ...atual.msg, texto: '' };
  }

  // ---------- para o app ----------
  function resumoZona(z, agora) {
    const manual = d.manual[z.id];
    return { id: z.id, nome: z.nome, andar: z.andar, tipo: z.tipo, marcada: !!d.zonas[z.id], segue: segue(z.id), manualAte: manual ? manual.ate : null };
  }
  function publico() {
    const agora = Date.now();
    return {
      type: 'programacao', agora, tz: tz(), ligada: d.ligada, retorno: d.retorno, faixas: d.faixas,
      zonas: ZONAS.map(z => resumoZona(z, agora)),
      anuncios: d.anuncios.map(a => ({ ...a, status: statusAnuncio(a, agora) })),
      noAr: atual ? { id: atual.id, startAt: atual.startAt, fim: atual.fim } : null,
      teste: teste ? { minuto: teste.minuto, ate: teste.ate } : null,
      efeitos: Object.keys(Ambiente.EFEITOS).map(k => ({ id: k, nome: Ambiente.EFEITOS[k].nome })),
    };
  }
  function publicar() { op.publicar(publico()); }

  // O que cada zona mostra no início do app (nome da faixa, cores do cartão).
  function daZona(zid) {
    if (!ZONAS.some(z => z.id === zid) || !d.ligada || !d.zonas[zid]) return null;
    if (d.manual[zid]) return { ativa: false, manualAte: d.manual[zid].ate };
    const mo = Ambiente.momento(comp, Date.now(), teste);
    const s = Ambiente.superficie(mo, zid.startsWith('fita:') ? 'fitas' : 'telas');
    return { ativa: true, faixa: mo.faixa.nome, cores: Ambiente.coresDe(s) };
  }

  // Alguém escolheu uma cena/cor/logo nesta zona: ela sai da programação até o horário de retorno.
  function assumirManual(zid) {
    if (!segue(zid)) return false;
    d.manual[zid] = { ate: proximoHorario(d.retorno, Date.now()) };
    console.log(`programação: ${zid} em manual até ${new Date(d.manual[zid].ate).toLocaleString('pt-BR')}`);
    salvar();
    if (atual) { // tira o anúncio só desta zona
      for (const id of op.telasDaZona(zid)) op.enviarTela(id, { type: 'anuncio', fim: true });
    }
    publicar();
    return true;
  }

  // ---------- comandos do app ----------
  function comando(m) {
    const agora = Date.now();
    switch (m.acao) {
      case 'ligar':
        d.ligada = !!m.valor;
        if (d.ligada) d.manual = {}; // ligar agora vale para tudo; manual antigo não fica preso
        if (!d.ligada) { teste = null; encerrarAnuncio(); }
        console.log(`programação ${d.ligada ? 'LIGADA' : 'desligada'}`);
        break;
      case 'zona': {
        if (!ZONAS.some(z => z.id === m.id)) return;
        d.zonas[m.id] = !!m.valor;
        delete d.manual[m.id];
        if (!m.valor) for (const id of op.telasDaZona(m.id)) op.enviarTela(id, { type: 'anuncio', fim: true });
        break;
      }
      case 'voltar':
        if (m.id === 'todas') d.manual = {}; else delete d.manual[m.id];
        break;
      case 'retorno':
        if (HORA.test(m.valor)) d.retorno = m.valor;
        for (const k of Object.keys(d.manual)) d.manual[k].ate = proximoHorario(d.retorno, agora);
        break;
      case 'faixa': {
        if (!m.faixa) return;
        const i = d.faixas.findIndex(f => f.id === m.faixa.id);
        const nova = limparFaixa(m.faixa, i >= 0 ? d.faixas[i] : null);
        if (i >= 0) d.faixas[i] = nova; else d.faixas.push(nova);
        d.faixas.sort((a, b) => Ambiente.minutos(a.inicio) - Ambiente.minutos(b.inicio));
        recompilar();
        break;
      }
      case 'faixa-apagar':
        if (d.faixas.length <= 1) return;
        d.faixas = d.faixas.filter(f => f.id !== m.id);
        recompilar();
        break;
      case 'faixas-padrao':
        d.faixas = faixasPadrao();
        recompilar();
        break;
      case 'testar': { // mostra uma hora do dia nas telas de verdade por um tempinho
        const seg = num(m.seg, 10, 600, 120);
        teste = { minuto: num(m.minuto, 0, Ambiente.DIA - 0.01, 0), desde: agora, ate: agora + seg * 1000 };
        cacheFitas = {};
        break;
      }
      case 'testar-parar':
        teste = null;
        cacheFitas = {};
        break;
      case 'anuncio': {
        const a = d.anuncios.find(x => x.id === m.id);
        if (!a) return;
        const c = m.campos || {};
        if (c.nome != null) a.nome = txt(c.nome, 60) || a.nome;
        if (c.ativo != null) a.ativo = !!c.ativo;
        if (c.cadaMin != null) a.cadaMin = num(c.cadaMin, 1, 720, a.cadaMin);
        if (c.durImagem != null) {
          a.durImagem = num(c.durImagem, 3, 120, a.durImagem);
          for (const i of a.itens) if (i.kind === 'image') i.dur = a.durImagem;
        }
        if (c.de !== undefined) a.de = c.de || null;
        if (c.ate !== undefined) a.ate = c.ate || null;
        if (c.horaDe !== undefined) a.horaDe = HORA.test(c.horaDe) ? c.horaDe : null;
        if (c.horaAte !== undefined) a.horaAte = HORA.test(c.horaAte) ? c.horaAte : null;
        if (c.textoLed != null) a.textoLed = txt(c.textoLed, 140);
        if (c.fundo != null) a.fundo = c.fundo === 'ambiente' ? 'ambiente' : 'preto';
        if (Array.isArray(c.zonas)) a.zonas = c.zonas.filter(z => ZONAS.some(y => y.id === z && y.tipo === 'tela'));
        break;
      }
      case 'anuncio-agora': {
        const a = d.anuncios.find(x => x.id === m.id);
        if (!a || !(a.itens || []).length || !d.ligada) return;
        encerrarAnuncio();
        dispararAnuncio(a, agora);
        return;
      }
      case 'anuncio-parar':
        encerrarAnuncio();
        break;
      default:
        return;
    }
    salvar();
    op.aoMudarConteudo();
    op.aoMudarEstado();
    publicar();
  }

  // ---------- envio de anúncios pelo app ----------
  // Cada slide vira dois arquivos, em pé e girado "-deitado", preenchendo a TV 9:16 sem esticar.
  // As TVs baixam com antecedência, igual às cenas.
  const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp'];
  const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv'];
  function receberSlide(req, res, url) {
    const original = String(url.searchParams.get('arquivo') || '');
    const ext = path.extname(original).toLowerCase();
    const imagem = EXT_IMAGEM.includes(ext), video = EXT_VIDEO.includes(ext);
    if (!imagem && !video) { req.resume(); return op.sendJson(res, 400, { error: 'Envie uma imagem (png/jpg/webp) ou um vídeo (mp4/mov/webm).' }); }
    let a = d.anuncios.find(x => x.id === url.searchParams.get('id'));
    if (url.searchParams.get('id') && !a) { req.resume(); return op.sendJson(res, 404, { error: 'anúncio não encontrado' }); }
    const id = a ? a.id : idNovo('an');
    const n = a ? Math.max(0, ...a.itens.map(i => i.n || 0)) + 1 : 1;
    const tmp = path.join(op.MEDIA_DIR, `${id}-${n}-original${ext}`);
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on('error', e => op.sendJson(res, 500, { error: e.message }));
    out.on('finish', async () => {
      // Regra das TVs: tudo no formato delas (9:16, tela cheia). Peça com texto perto da borda precisa
      // ser recomposta antes de subir, como em arte-soft-opening; aqui o excesso é cortado.
      const preencher = 'scale=w=1080:h=1920:force_original_aspect_ratio=increase,crop=1080:1920';
      const arq = `tv-anuncio-${id}-${n}${imagem ? '.jpg' : '.mp4'}`;
      const deitado = arq.replace(/\.(jpg|mp4)$/, '-deitado.$1');
      const thumb = `anuncio-${id}-${n}.png`;
      try {
        for (const [vf, nome] of [[preencher, arq], [preencher + ',transpose=2', deitado]]) {
          if (imagem) await op.ffmpeg(['-i', tmp, '-vf', vf, '-frames:v', '1', '-q:v', '2', path.join(op.MEDIA_DIR, nome)]);
          else await op.ffmpeg(['-i', tmp, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-an', '-movflags', '+faststart', path.join(op.MEDIA_DIR, nome)]);
        }
        const dur = imagem ? null : await op.lerDuracao(tmp);
        // vídeo: miniatura do meio, porque os posts animados começam na tela preta
        const seek = dur ? ['-ss', String(Math.round(dur * 0.6 * 10) / 10)] : [];
        await op.ffmpeg([...seek, '-i', tmp, '-frames:v', '1', '-vf', 'scale=270:480:force_original_aspect_ratio=increase,crop=270:480', path.join(op.PUBLIC_DIR, 'cenas', thumb)]);
        if (!a) {
          a = {
            id, nome: txt(url.searchParams.get('nome') || path.basename(original, ext), 60), ativo: true, cadaMin: 10, durImagem: 10,
            de: null, ate: null, horaDe: null, horaAte: null, textoLed: '', fundo: 'preto', zonas: ['telas:telas:1', 'telas:led:1'], ultimo: 0, itens: [],
          };
          d.anuncios.push(a);
        }
        const item = { n, kind: imagem ? 'image' : 'video', arquivo: arq, thumb: 'cenas/' + thumb, dur: imagem ? a.durImagem : Math.max(1, Math.round((dur || 10) * 10) / 10) };
        a.itens.push(item);
        console.log(`anúncio: ${a.nome}, slide ${n} (${arq})`);
        salvar();
        op.aoMudarArquivos();
        publicar();
        op.sendJson(res, 200, { ok: true, id: a.id, item });
      } catch (e) {
        console.log('anúncio:', e.message);
        op.sendJson(res, 500, { error: 'Não consegui converter: ' + e.message.slice(0, 200) });
      } finally {
        fs.unlink(tmp, () => {});
      }
    });
  }
  function apagarArquivosDoItem(i) {
    const deitado = i.arquivo.replace(/\.(jpg|mp4)$/, '-deitado.$1');
    for (const f of [path.join(op.MEDIA_DIR, i.arquivo), path.join(op.MEDIA_DIR, deitado), path.join(op.PUBLIC_DIR, i.thumb)]) fs.unlink(f, () => {});
  }
  function atenderHttp(req, res, url, p) {
    if (p === '/api/anuncio' && req.method === 'POST') { receberSlide(req, res, url); return true; }
    const m = /^\/api\/anuncio\/([^/]+)(?:\/(\d+))?$/.exec(p);
    if (m && req.method === 'DELETE') {
      const a = d.anuncios.find(x => x.id === m[1]);
      if (!a) { op.sendJson(res, 404, { error: 'anúncio não encontrado' }); return true; }
      if (atual && atual.id === a.id) encerrarAnuncio();
      if (m[2]) {
        const i = a.itens.find(x => String(x.n) === m[2]);
        if (i) { apagarArquivosDoItem(i); a.itens = a.itens.filter(x => x !== i); }
      } else {
        a.itens.forEach(apagarArquivosDoItem);
        d.anuncios = d.anuncios.filter(x => x !== a);
      }
      salvar(); op.aoMudarArquivos(); publicar();
      op.sendJson(res, 200, { ok: true });
      return true;
    }
    return false;
  }

  // ---------- relógio ----------
  // A cada segundo: fim do teste, fim do modo manual, anúncios e troca de faixa.
  setInterval(() => {
    try {
      const agora = Date.now();
      let mudou = false;
      if (teste && agora >= teste.ate) { teste = null; cacheFitas = {}; mudou = true; }
      for (const k of Object.keys(d.manual)) if (agora >= d.manual[k].ate) { delete d.manual[k]; mudou = true; console.log(`programação: ${k} voltou sozinha`); }
      tickAnuncios(agora);
      const nome = d.ligada ? Ambiente.momento(comp, agora, teste).faixa.id : null;
      if (nome !== ultimaFaixa) { ultimaFaixa = nome; op.aoMudarEstado(); publicar(); }
      if (mudou) { salvar(); op.aoMudarConteudo(); op.aoMudarEstado(); publicar(); }
    } catch (e) { console.log('programação:', e.message); }
  }, 1000);

  return { ZONAS, segue, conteudo, estadoFita, assumirManual, comando, publico, daZona, anuncioPara, arquivosAnuncios, atenderHttp };
}

module.exports = { criarProgramacao };
