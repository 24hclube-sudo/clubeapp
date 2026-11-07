// Vinhetas da Rádio CLUBE: falas prontas (geradas no Suno pela Sunor), botão que abaixa a música e
// entra na hora, especiais e programação. Só vai ao ar o que foi aprovado, e com a programação
// desligada nada toca sozinho (só o que alguém agendou ou apertou).
//
// O áudio entra pelo canal de voz da rádio: escrever o caminho em state\say.txt faz o mixer abaixar a
// música (duck de voz) e tocar o arquivo em menos de 1 s, sem mexer na instalação da rádio. Não usa
// o rodízio de vinhetas da estação, que sorteia a qualquer hora e tocaria "boa noite" de manhã.
//
// A chave da Sunor fica em C:\Users\user\.env (SUNOR_API_KEY): é lida na hora e nunca vai para log nem app.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ESTADO = process.env.RADIO_ESTADO || 'C:\\radio-clube\\estacao\\state';
const ESTADO_NA_RADIO = '/var/sub-wave';
const NOME_PASTA = 'vinhetas-clube';
const PASTA = path.join(ESTADO, NOME_PASTA);
const BRUTOS = path.join(PASTA, 'brutos');
const BANCO = path.join(PASTA, 'vinhetas.json');
const SAY = path.join(ESTADO, 'say.txt');
const TEXTOS = process.env.VINHETAS_TEXTOS || 'C:\\apps\\vinheta-suno\\textos.json';
const ARQUIVO_ENV = 'C:\\Users\\user\\.env';
const RADIO = process.env.RADIO_URL || 'http://127.0.0.1:7900';
// Teste local: só aceita 127.0.0.1, para a chave de verdade nunca ir a outro endereço.
const SUNOR_TESTE = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUNOR_BASE_TESTE || '');
const SUNOR = SUNOR_TESTE ? process.env.SUNOR_BASE_TESTE : 'https://sunor.cc/api/v1';

// O app não tem senha na rede: este teto limita o gasto se alguém apertar demais.
const LIMITE_ESPECIAIS_DIA = 10;
const GERACOES_JUNTAS = 2;
const ESPERA_CONSULTA_MS = 8000;
const LIMITE_GERACAO_MS = 15 * 60 * 1000;

const ESTILO = {
  tags: 'spoken word, male radio host, young deep calm voice, close microphone, slow intimate talking, brazilian portuguese, sparse analog downtempo, warm vintage synth',
  negative_tags: 'singing, sung vocals, choir, rap, shouting, upbeat, pop, english',
};

const espera = ms => new Promise(ok => setTimeout(ok, ms));

// ---------- banco ----------
let banco = null;

function salvar() {
  const tmp = BANCO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(banco, null, 1));
  fs.renameSync(tmp, BANCO);
}

function carregar() {
  fs.mkdirSync(BRUTOS, { recursive: true });
  try { banco = JSON.parse(fs.readFileSync(BANCO, 'utf8')); } catch { banco = null; }
  banco = Object.assign({
    itens: {},
    agendadas: [],
    programacao: { ativo: false, horas: true, musicasEntreFalas: 4, minutosEntreClimas: 180 },
    gasto: { dia: '', especiais: 0 },
    ultimaHora: '',
    ultimoClima: 0,
  }, banco || {});
  try {
    for (const t of JSON.parse(fs.readFileSync(TEXTOS, 'utf8'))) {
      const it = banco.itens[t.id];
      if (!it) banco.itens[t.id] = novoItem(t.id, t.categoria, t.chave, t.texto, 'texto');
      else if (it.status === 'texto') it.texto = t.texto;
    }
  } catch (e) { console.log(`vinhetas: textos padrão não lidos (${e.message})`); }
  // Tarefa já criada continua de onde parou, sem gastar de novo. Sem id, não dá para saber se foi
  // cobrada, então não repete sozinha.
  for (const it of Object.values(banco.itens)) {
    if (it.status === 'gerando' && it.tarefa) it.status = 'na-fila';
    else if (it.status === 'gerando') { it.status = 'erro'; it.erro = 'Interrompida ao criar. Confira o saldo antes de repetir.'; }
  }
  salvar();
}

function novoItem(id, categoria, chave, texto, status) {
  return { id, categoria, chave: chave || null, texto, status, tarefa: null, tomadas: [], escolhida: null, erro: null, vezes: 0, ultimaVez: 0, criadaEm: Date.now() };
}

// ---------- rede ----------
function pedir(url, { metodo = 'GET', corpo = null, cabecalhos = {}, tempo = 30000 } = {}) {
  return new Promise((ok, erro) => {
    const u = new URL(url);
    const dados = corpo ? Buffer.from(corpo) : null;
    const headers = Object.assign({}, cabecalhos);
    if (dados) headers['content-length'] = dados.length;
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: metodo, headers, timeout: tempo }, r => {
      const partes = [];
      r.on('data', d => partes.push(d));
      r.on('end', () => ok({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
      r.on('error', erro);
    });
    req.on('timeout', () => req.destroy(new Error('sem resposta')));
    req.on('error', erro);
    if (dados) req.write(dados);
    req.end();
  });
}

function chaveSunor() {
  if (SUNOR_TESTE) return 'chave-de-teste';
  let txt = '';
  try { txt = fs.readFileSync(ARQUIVO_ENV, 'utf8'); } catch { /* cai no erro abaixo */ }
  const m = /^\s*SUNOR_API_KEY\s*=\s*(.*?)\s*$/m.exec(txt.replace(/^\uFEFF/, ''));
  const valor = m ? m[1].replace(/^["']|["']$/g, '') : '';
  if (!valor) throw new Error('A chave da Sunor não está salva no .env');
  return valor;
}

async function sunor(metodo, caminho, corpo) {
  const r = await pedir(SUNOR + caminho, {
    metodo,
    corpo: corpo ? JSON.stringify(corpo) : null,
    cabecalhos: { 'x-api-key': chaveSunor(), 'content-type': 'application/json' },
  });
  let json = null;
  try { json = JSON.parse(r.corpo.toString('utf8')); } catch { /* resposta sem JSON */ }
  if (r.status >= 400) throw new Error(`Sunor ${r.status}: ${(json && (json.error_code || json.message)) || 'erro'}`);
  return json;
}

// ---------- geração ----------
let rodando = 0;

function girarFila() {
  while (rodando < GERACOES_JUNTAS) {
    const item = Object.values(banco.itens).find(i => i.status === 'na-fila');
    if (!item) return;
    item.status = 'gerando';
    rodando++;
    produzir(item)
      .then(() => { item.status = 'ouvir'; item.erro = null; })
      .catch(e => { item.status = 'erro'; item.erro = e.message; console.log(`vinhetas: ${item.id} falhou (${e.message})`); })
      .finally(() => { rodando--; salvar(); girarFila(); });
  }
}

async function produzir(item) {
  salvar();
  if (!item.tarefa) {
    // Uma tentativa só: a API não protege contra envio duplicado e cada envio custa.
    const r = await sunor('POST', '/task', {
      model: 'suno',
      task_type: 'music',
      audio_format: 'mp3',
      input: Object.assign({}, ESTILO, {
        title: `Radio Clube ${item.id}`,
        prompt: `[Spoken]\n${item.texto.replace(/([.!?])\s+/g, '$1\n')}\n\n[Instrumental outro]`,
      }),
    });
    item.tarefa = r && r.data && r.data.task_id;
    if (!item.tarefa) throw new Error('A Sunor não devolveu a tarefa');
    salvar();
  }
  const limite = Date.now() + LIMITE_GERACAO_MS;
  let tarefa = null;
  while (!tarefa) {
    await espera(ESPERA_CONSULTA_MS);
    let t = null;
    try { t = (await sunor('GET', `/task/${item.tarefa}`)).data; } catch (e) {
      if (Date.now() > limite) throw e;
      continue;
    }
    if (t.status === 'success') tarefa = t;
    else if (t.status === 'failure' || t.status === 'timeout') {
      item.tarefa = null;
      throw new Error(`A geração falhou (${t.error_code || t.status}); a documentação diz que o crédito volta`);
    } else if (Date.now() > limite) throw new Error('A Sunor não terminou em 15 minutos');
  }
  const clipes = (tarefa.output && tarefa.output.result) || [];
  if (!clipes.length) throw new Error('A Sunor não devolveu áudio');
  const tomadas = [];
  for (let i = 0; i < clipes.length; i++) {
    const bruto = `${item.id}-${i + 1}.bruto`;
    const r = await pedir(clipes[i].audio_url, { tempo: 120000 });
    if (r.status !== 200 || !r.corpo.length) throw new Error(`Não baixei o áudio (${r.status})`);
    fs.writeFileSync(path.join(BRUTOS, bruto), r.corpo);
    const original = Number(clipes[i].metadata && clipes[i].metadata.duration) || 0;
    const arquivo = `${item.id}-${i + 1}.mp3`;
    const duracao = await cortar(bruto, arquivo, segundosDaFala(item.texto, original));
    tomadas.push({ arquivo, duracao, original, bruto });
  }
  item.tomadas = tomadas;
  item.escolhida = null;
  item.tarefa = null;
}

// O Suno devolve uma faixa longa: fica o trecho da fala, com fade no fim.
function segundosDaFala(texto, original) {
  const s = Math.max(5, Math.ceil(texto.trim().split(/\s+/).length / 1.7) + 3);
  return original ? Math.min(s, original) : s;
}

function cortar(bruto, arquivo, segundos) {
  if (process.env.VINHETAS_SEM_CORTE) {
    fs.copyFileSync(path.join(BRUTOS, bruto), path.join(PASTA, arquivo));
    return Promise.resolve(segundos);
  }
  const fade = Math.min(1.2, segundos / 3);
  return new Promise((ok, erro) => {
    execFile('docker', ['exec', 'cl-controller', 'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
      '-i', `${ESTADO_NA_RADIO}/${NOME_PASTA}/brutos/${bruto}`, '-t', String(segundos),
      '-af', `afade=t=in:d=0.03,afade=t=out:st=${(segundos - fade).toFixed(2)}:d=${fade.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11`,
      '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k',
      `${ESTADO_NA_RADIO}/${NOME_PASTA}/${arquivo}`],
    { windowsHide: true, timeout: 120000 }, e => (e ? erro(new Error('Não consegui cortar o áudio')) : ok(segundos)));
  });
}

// ---------- no ar ----------
let ocupadoAte = 0;
let aoNoAr = null;
const aoEntrarNoAr = fn => { aoNoAr = fn; };

function tocar(id, origem) {
  const item = banco.itens[id];
  if (!item || item.status !== 'aprovada') return { ok: false, erro: 'Essa vinheta não está aprovada' };
  const tomada = item.tomadas[item.escolhida];
  if (!tomada) return { ok: false, erro: 'Essa vinheta está sem áudio' };
  if (Date.now() < ocupadoAte || fs.existsSync(SAY)) return { ok: false, erro: 'Já tem uma fala entrando. Tente em instantes.' };
  const caminho = `${ESTADO_NA_RADIO}/${NOME_PASTA}/${tomada.arquivo}`;
  // subwave_voice faz o mixer tratar como fala: não sobrepõe uma vinheta do rodízio.
  const voz = `clube-${crypto.randomBytes(4).toString('hex')}`;
  const tmp = `${SAY}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `annotate:subwave_voice="${voz}":${caminho}\n`);
  fs.renameSync(tmp, SAY);
  if (aoNoAr) aoNoAr(tomada.arquivo); // lugares fora da transmissão também recebem a vinheta
  ocupadoAte = Date.now() + (tomada.duracao + 2) * 1000;
  item.vezes++;
  item.ultimaVez = Date.now();
  salvar();
  console.log(`vinhetas: no ar ${id} (${origem})`);
  return { ok: true, id, texto: item.texto, duracao: tomada.duracao };
}

const periodoDe = h => (h >= 6 && h < 12 ? 'manha' : h >= 12 && h < 18 ? 'tarde' : h >= 18 ? 'noite' : 'madrugada');

function aprovadas(filtro) { return Object.values(banco.itens).filter(i => i.status === 'aprovada' && filtro(i)); }

// As que tocaram há mais tempo têm a preferência; um pouco de sorteio para não virar sequência fixa.
function sortear(lista) {
  if (!lista.length) return null;
  const ordem = [...lista].sort((a, b) => a.ultimaVez - b.ultimaVez);
  const grupo = ordem.slice(0, Math.max(3, Math.ceil(ordem.length / 3)));
  return grupo[Math.floor(Math.random() * grupo.length)];
}

function falaDoMomento(agora = new Date()) {
  const periodo = periodoDe(agora.getHours());
  return sortear(aprovadas(i => i.categoria === periodo || i.categoria === 'geral'));
}

function condicaoAtual(w) {
  if (!w) return null;
  const quente = typeof w.temp === 'number' && w.temp >= 30;
  const frio = typeof w.temp === 'number' && w.temp <= 14;
  if (w.condition === 'stormy') return 'tempestade';
  if (w.condition === 'rainy') return 'chuva';
  if (w.condition === 'foggy') return 'neblina';
  if (w.condition === 'clear') return quente ? 'calor' : frio ? 'frio' : w.isDay ? 'sol' : 'ceu-noite';
  if (w.condition === 'cloudy') return quente ? 'calor' : frio ? 'frio' : 'nublado';
  return null;
}

// ---------- programação ----------
let faixa = null;
let musicas = 0;

function agendadasDoMomento(agora) {
  let mudou = false;
  for (const a of banco.agendadas) {
    if (a.feita || a.quando > agora) continue;
    if (agora - a.quando > 10 * 60 * 1000) {
      console.log(`vinhetas: agendamento perdido ${a.vinheta}`);
    } else if (!tocar(a.vinheta, 'agendada').ok) {
      continue; // ocupado: tenta de novo no próximo ciclo
    }
    if (a.repetir === 'diario') { while (a.quando <= agora) a.quando += 24 * 60 * 60 * 1000; } else a.feita = true;
    mudou = true;
  }
  const antes = banco.agendadas.length;
  banco.agendadas = banco.agendadas.filter(a => !a.feita);
  if (mudou || antes !== banco.agendadas.length) salvar();
}

function horaCheia(agora) {
  if (!banco.programacao.horas || agora.getMinutes() >= 3) return;
  const hh = String(agora.getHours()).padStart(2, '0');
  const marca = `${agora.toDateString()}-${hh}`;
  if (banco.ultimaHora === marca) return;
  const item = aprovadas(i => i.categoria === 'hora' && i.chave === hh)[0];
  if (item && !tocar(item.id, 'hora').ok) return;
  banco.ultimaHora = marca;
  salvar();
}

async function aoTrocarFaixa(agora, clima) {
  musicas++;
  const entre = Number(banco.programacao.musicasEntreFalas) || 0;
  if (!entre || musicas < entre) return;
  const intervalo = (Number(banco.programacao.minutosEntreClimas) || 0) * 60 * 1000;
  let item = null;
  if (intervalo && agora - banco.ultimoClima >= intervalo) {
    const cond = condicaoAtual(clima);
    item = sortear(aprovadas(i => i.categoria === 'clima' && i.chave === cond));
    if (item) banco.ultimoClima = +agora;
  }
  item = item || falaDoMomento(agora);
  if (item && tocar(item.id, 'programação').ok) musicas = 0;
}

async function ciclo() {
  const agora = new Date();
  try {
    agendadasDoMomento(+agora);
    if (!banco.programacao.ativo) { faixa = null; musicas = 0; return; }
    horaCheia(agora);
    const r = await pedir(`${RADIO}/api/now-playing`, { tempo: 5000 });
    const j = JSON.parse(r.corpo.toString('utf8'));
    const np = j.nowPlaying;
    if (!np || !j.streamOnline) return;
    const atual = `${np.artist}|${np.title}`;
    if (faixa && faixa !== atual) await aoTrocarFaixa(agora, j.context && j.context.weather);
    faixa = atual;
  } catch (e) {
    console.log(`vinhetas: ciclo com erro (${e.message})`);
  }
}

// ---------- rotas ----------
function resumo() {
  const hoje = new Date().toDateString();
  return {
    itens: Object.values(banco.itens).map(i => ({
      id: i.id, categoria: i.categoria, chave: i.chave, texto: i.texto, status: i.status, erro: i.erro,
      tomadas: i.tomadas.map(t => ({ arquivo: t.arquivo, duracao: t.duracao })), escolhida: i.escolhida, vezes: i.vezes, criadaEm: i.criadaEm,
    })),
    agendadas: banco.agendadas,
    programacao: banco.programacao,
    especiaisHoje: banco.gasto.dia === hoje ? banco.gasto.especiais : 0,
    limiteEspeciais: LIMITE_ESPECIAIS_DIA,
    ocupadoSeg: Math.max(0, Math.ceil((ocupadoAte - Date.now()) / 1000)),
  };
}

function lerCorpo(req) {
  return new Promise(ok => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 20000) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } });
    req.on('error', () => ok({}));
  });
}

const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

async function responder(req, p, b) {
  if (p === '/api/vinhetas/tocar') {
    if (b.id) return tocar(String(b.id), 'app');
    const item = falaDoMomento();
    return item ? tocar(item.id, 'botão') : { ok: false, erro: 'Ainda não há vinheta aprovada para este horário' };
  }
  if (p === '/api/vinhetas/especial') {
    const texto = String(b.texto || '').trim().slice(0, 300);
    if (!texto) return { ok: false, erro: 'Escreva o texto da vinheta' };
    const hoje = new Date().toDateString();
    if (banco.gasto.dia !== hoje) banco.gasto = { dia: hoje, especiais: 0 };
    if (banco.gasto.especiais >= LIMITE_ESPECIAIS_DIA) return { ok: false, erro: `Limite de ${LIMITE_ESPECIAIS_DIA} especiais por dia atingido` };
    chaveSunor();
    banco.gasto.especiais++;
    const id = `especial-${Date.now().toString(36)}`;
    banco.itens[id] = novoItem(id, 'especial', null, texto, 'na-fila');
    salvar();
    girarFila();
    return { ok: true, id };
  }
  if (p === '/api/vinhetas/aprovar') {
    const item = banco.itens[b.id];
    const n = Number(b.tomada) || 0;
    if (!item || !item.tomadas[n]) return { ok: false, erro: 'Vinheta não encontrada' };
    item.status = 'aprovada';
    item.escolhida = n;
    salvar();
    return { ok: true };
  }
  if (p === '/api/vinhetas/descartar') {
    const item = banco.itens[b.id];
    if (!item) return { ok: false, erro: 'Vinheta não encontrada' };
    item.status = 'descartada';
    banco.agendadas = banco.agendadas.filter(a => a.vinheta !== item.id);
    salvar();
    return { ok: true };
  }
  if (p === '/api/vinhetas/agendar') {
    const item = banco.itens[b.id];
    const quando = new Date(b.quando).getTime();
    if (!item || item.status !== 'aprovada') return { ok: false, erro: 'Aprove a vinheta antes de programar' };
    if (!quando || quando < Date.now() - 60000) return { ok: false, erro: 'Escolha um horário no futuro' };
    banco.agendadas.push({ id: crypto.randomBytes(4).toString('hex'), vinheta: item.id, quando, repetir: b.repetir === 'diario' ? 'diario' : 'nao' });
    salvar();
    return { ok: true };
  }
  if (p === '/api/vinhetas/desagendar') {
    banco.agendadas = banco.agendadas.filter(a => a.id !== b.id);
    salvar();
    return { ok: true };
  }
  if (p === '/api/vinhetas/programacao') {
    const atual = banco.programacao;
    if (typeof b.ativo === 'boolean') atual.ativo = b.ativo;
    if (typeof b.horas === 'boolean') atual.horas = b.horas;
    if (b.musicasEntreFalas !== undefined) atual.musicasEntreFalas = Math.max(0, Math.min(30, Number(b.musicasEntreFalas) || 0));
    if (b.minutosEntreClimas !== undefined) atual.minutosEntreClimas = Math.max(0, Math.min(1440, Number(b.minutosEntreClimas) || 0));
    salvar();
    return { ok: true };
  }
  // Lote gasta crédito em volume: só deste PC e com autorização explícita no pedido.
  if (p === '/api/vinhetas/lote') {
    if (!local(req)) return { ok: false, erro: 'Só neste computador' };
    if (b.autorizado !== true) return { ok: false, erro: 'Falta autorizado:true' };
    const ids = Array.isArray(b.ids) ? b.ids : [];
    chaveSunor();
    let filas = 0;
    for (const id of ids) {
      const item = banco.itens[id];
      if (item && (item.status === 'texto' || item.status === 'erro' || item.status === 'descartada')) { item.status = 'na-fila'; item.erro = null; filas++; }
    }
    salvar();
    girarFila();
    return { ok: true, filas };
  }
  return null;
}

// Devolve true se a rota é daqui.
function atender(req, res, p, serveFile, sendJson) {
  if (p.startsWith('/vinhetas-audio/') && req.method === 'GET') {
    const nome = p.slice('/vinhetas-audio/'.length);
    if (!/^[a-z0-9-]+\.mp3$/i.test(nome)) { res.writeHead(404); res.end(); return true; }
    serveFile(req, res, path.join(PASTA, nome));
    return true;
  }
  if (!p.startsWith('/api/vinhetas')) return false;
  if (p === '/api/vinhetas' && req.method === 'GET') { sendJson(res, 200, resumo()); return true; }
  if (p === '/api/vinhetas/saldo' && req.method === 'GET') {
    sunor('GET', '/account/balance').then(j => sendJson(res, 200, { ok: true, saldo: j }), e => sendJson(res, 200, { ok: false, erro: e.message }));
    return true;
  }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return true; }
  lerCorpo(req)
    .then(b => responder(req, p, b))
    .then(r => (r ? sendJson(res, 200, r) : sendJson(res, 404, { ok: false, erro: 'não encontrado' })))
    .catch(e => sendJson(res, 200, { ok: false, erro: e.message }));
  return true;
}

function iniciar() {
  carregar();
  girarFila();
  setInterval(ciclo, 10000);
  console.log(`vinhetas: ${Object.keys(banco.itens).length} no banco, programação ${banco.programacao.ativo ? 'ligada' : 'desligada'}`);
}

module.exports = { iniciar, atender, aoEntrarNoAr };
