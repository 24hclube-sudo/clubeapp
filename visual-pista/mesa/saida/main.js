// Saída dos visuais para o LED: abre o visual escolhido fora da tela (Electron do radio-saida), publica por Spout "Visual CLUBE"
// (o mesmo saida.py + textura.py da visual-pista\saida) e atende a mesa de visuais em 127.0.0.1:5212.
// A fonte Spout é sempre a mesma: trocar de visual não mexe no MadMapper. Só POST /led mexe nas superfícies LED PISTA e LED DJ FUNDO.
// Abre com o Windows (atalho "Visual LED" na pasta Inicializar) e deixa o LED como estava: ligado, a não ser que alguém tenha desligado.
const { app, BrowserWindow, Tray, Menu, nativeImage, session } = require('electron');
const { spawn } = require('child_process');
const dgram = require('dgram');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PASTA_VISUAL = path.join(__dirname, '..', '..');
const PASTA_SAIDA_ANTIGA = path.join(PASTA_VISUAL, 'saida');
const RADIO = 'C:\\apps\\radio-saida';
const VISUAIS = {
  'p-numeros': 'numeros/',
  'p-logo': 'pedra/?modo=logo',
  'p-campo': 'pedra/?modo=campo',
  'p-estelas': 'pedra/?modo=estelas',
  'p-corte': 'pedra/?modo=corte',
  'p-lajes': 'pedra/?modo=lajes',
  'p-degraus': 'pedra/?modo=degraus',
  'z-logo': 'zinco/',
  'r-feixes': 'regencia/?modo=feixes',
  'r-astrolabio': 'regencia/?modo=astrolabio',
  'r-mercurio': 'regencia/?modo=mercurio',
  'r-micelio': 'regencia/?modo=micelio',
  'r-enxame': 'regencia/?modo=enxame',
  'r-nave': 'regencia/?modo=nave',
  'r-eixo': 'regencia/?modo=eixo',
  'r-losango': 'regencia/?modo=losango',
  'r-cordas': 'regencia/?modo=cordas',
  'r-lamina': 'regencia/?modo=lamina',
  'r-portal': 'regencia/?modo=portal',
  derrete: 'pista-quente/derrete/',
  brinquedos: 'universo/?mundo=quente',
  ondas: 'pista-quente/ondas/',
  'placa-ouro': 'placa/?metal=ouro',
  'placa-prata': 'placa/?metal=prata',
  'placa-latao': 'placa/?metal=latao',
  brutal: 'brutal/',
  luz: 'luz/',
  'f-lactea': 'firmamento/?modo=lactea',
  'f-rastros': 'firmamento/?modo=rastros',
  'f-aurora': 'firmamento/?modo=aurora',
  'f-eclipse': 'firmamento/?modo=eclipse',
  'f-aneis': 'firmamento/?modo=aneis',
  'f-horizonte': 'firmamento/?modo=horizonte',
  'c-camadas': 'cinetica/?modo=camadas',
  'c-relevo': 'cinetica/?modo=relevo',
  'c-cabos': 'cinetica/?modo=cabos',
  'c-agulhas': 'cinetica/?modo=agulhas',
  'c-brise': 'cinetica/?modo=brise',
  'm-grade': 'marca/?modo=grade',
  'a-cartaz': 'akin/?modo=cartaz',
  'a-recortes': 'akin/?modo=recortes',
  'a-fila': 'akin/?modo=fila',
  'a-letras': 'akin/?modo=letras',
  'a-cabeca': 'akin/?modo=cabeca',
  'a-tunel': 'akin/?modo=tunel',
  'm-roda': 'marca/?modo=roda',
  'm-queda': 'marca/?modo=queda',
  'm-gigante': 'marca/?modo=gigante',
  'm-desfile': 'marca/?modo=desfile',
  'm-colossos-todos': 'marca/?modo=colossos-todos',
  'm-travessia-todos': 'marca/?modo=travessia-todos',
  'm-instancia-todos': 'marca/?modo=instancia-todos',
  'm-colossos': 'marca/?modo=colossos',
  'm-travessia': 'marca/?modo=travessia',
  'm-instancia': 'marca/?modo=instancia',
  'm-monolito': 'marca/?modo=monolito',
  'e-concreto': 'espaco/?modo=concreto',
  'e-teto': 'espaco/?modo=teto',
  'e-caixotoes': 'espaco/?modo=caixotoes',
  'e-porticos': 'espaco/?modo=porticos',
  'concreto-ceu': 'ceu/?modo=concreto',
  'teto-ceu': 'ceu/?modo=teto',
  'caixotoes': 'ceu/?modo=caixotoes',
  'porticos': 'ceu/?modo=porticos',
  'comportas': 'ceu/?modo=comportas',
  'trama': 'ceu/?modo=trama',
  'h3-olho': 'video/?v=h3-olho-1-painel.mp4',
  'h3-abrir': 'video/?v=h3-abrir-2-painel.mp4',
  universo: 'universo/',
  laminas: '',
};
// As cenas do gerador do app (tv-player): o mesmo desenho, sem a dobra da saída antiga e sem conversar com o servidor.
for (const g of ['grade', 'mare', 'constelacao', 'cromo', 'faixas', 'clube', 'pulso', 'scanner', 'aneis', 'flash', 'espectro', 'onda', 'bumbo']) VISUAIS['g-' + g] = '@gerador';
const PADRAO = { porta: 5212, escala: 1, fps: 60, audio: 'microfone', nome: 'Visual CLUBE', spout: true, ndi: false, textura: true, visual: 'universo' };
let config = PADRAO;
let erroConfig = null;
try { config = { ...PADRAO, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '')) }; } catch (e) { erroConfig = e.message; }
const LARGURA = Math.round(1032 * config.escala), ALTURA = Math.round(5676 * config.escala);
const ARQ_ULTIMO = path.join(__dirname, 'ultimo-visual.txt');
let visualAtual = config.visual;
try { const u = fs.readFileSync(ARQ_ULTIMO, 'utf8').trim(); if (VISUAIS[u] !== undefined) visualAtual = u; } catch {}

function endereco(id = visualAtual) {
  const caminho = VISUAIS[id] ?? VISUAIS.universo;
  if (caminho === '@gerador') return `http://127.0.0.1:8080/gerador.html?solto&previa&saidaled&mapa=reto&cena=${id}&audio=${encodeURIComponent(config.audio)}`;
  const [rota, extra] = caminho.split('?');
  // led = filtro vertical para o caminho até o painel; publicar = manda a análise do som para a prévia da mesa
  const q = ['saida', 'led', 'publicar', `escala=${config.escala}`, `audio=${encodeURIComponent(config.audio)}`];
  if (extra) q.push(extra);
  return `http://127.0.0.1:${config.porta}/${rota}?${q.join('&')}`;
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const UNICA = app.requestSingleInstanceLock();
if (!UNICA) app.exit(0);
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--sair')) app.quit();
  else if (argv.includes('--recarregar') && janela) { log('recarregando (pedido de fora)'); trocarVisual(visualAtual); }
});

let janela = null, janelaNova = null, visualNovo = null, python = null, saindo = false, quadros = 0, descartados = 0, ultimaTaxa = 0, bandeja = null;
let pendente = null, pendenteDesde = 0;

const FLASH_PAGINA = fs.readFileSync(path.join(__dirname, 'flash-pagina.js'), 'utf8');
// As baforadas recentes vão para a janela nova: a página refaz a fumaça até o ponto em que estava, e a troca de visual não some com ela.
let fumacaRecente = [];
function anotarFumaca(acao) {
  const agora = Date.now();
  fumacaRecente = fumacaRecente.filter(i => agora - i[1] < 30000);
  const u = fumacaRecente[fumacaRecente.length - 1];
  if (acao === 'liga') { if (u && agora <= u[1]) u[1] = Math.max(u[1], agora + 1500); else fumacaRecente.push([agora, agora + 1500]); }
  else if (u && agora <= u[1]) u[1] = Math.max(u[0] + 2200, agora);
}
// ---------- Regência: o ouvido da faixa, o diretor automático e a camada de cor. Ver visual-pista\regencia\LEIA-ME.md ----------
const { criarDiretor } = require(path.join(PASTA_VISUAL, 'regencia', 'diretor.cjs'));
const ARQ_COR = path.join(__dirname, 'cor-camada.json');
let corCamada = { ligada: false, cor: 'ff0040', cor2: '0040ff', modo: 'tingir', forca: 100, auto: 'fixa', giro: 6, tom: '' };
try { corCamada = { ...corCamada, ...JSON.parse(fs.readFileSync(ARQ_COR, 'utf8')) }; } catch {}
const guardarCor = () => { try { fs.writeFileSync(ARQ_COR, JSON.stringify(corCamada)); } catch {} };
const nasPaginas = js => { for (const w of [janela, janelaNova]) if (w && !w.isDestroyed()) w.webContents.executeJavaScript(js).catch(() => {}); };
const mandarCor = () => nasPaginas(`window.__corComando && window.__corComando(${JSON.stringify(corCamada)})`);
function mudarCor(q) {
  if (q.has('ligada')) corCamada.ligada = q.get('ligada') === '1';
  for (const k of ['cor', 'cor2']) if (/^[0-9a-f]{6}$/i.test(q.get(k) || '')) corCamada[k] = q.get(k).toLowerCase();
  if (['tingir', 'filtro', 'suave', 'duas'].includes(q.get('modo'))) corCamada.modo = q.get('modo');
  if (['fixa', 'faixa', 'gira'].includes(q.get('auto'))) corCamada.auto = q.get('auto');
  const num = (k, a, b) => { if (q.has(k) && Number.isFinite(+q.get(k))) corCamada[k] = Math.max(a, Math.min(b, +q.get(k))); };
  num('forca', 0, 100); num('giro', 1, 60);
  guardarCor();
  mandarCor();
}
let autoLed = null;
const mandarElementos = () => nasPaginas(`window.__autoLed && window.__autoLed(${JSON.stringify(autoLed)})`);
let janelaOuvido = null;
function abrirOuvido() {
  const url = `http://127.0.0.1:${config.porta}/regencia/ouvido.html?audio=${encodeURIComponent(config.audio)}`;
  const w = janelaOuvido = new BrowserWindow({ width: 320, height: 200, show: false, frame: false, webPreferences: { backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  w.webContents.on('console-message', ev => { if (ev.level === 'error') log(`ouvido: ${ev.message}`); });
  w.webContents.on('did-fail-load', () => { setTimeout(() => !w.isDestroyed() && w.loadURL(url), 5000); });
  w.webContents.on('render-process-gone', (_e, d) => { log(`ouvido caiu (${d.reason}); abrindo de novo`); setTimeout(() => !w.isDestroyed() && w.loadURL(url), 2000); });
  w.loadURL(url);
}
let diretor = null;
function criarODiretor() {
  diretor = criarDiretor({
    pasta: __dirname, visuais: VISUAIS, log,
    jaNoAr: () => visualAtual,
    carregando: () => !!visualNovo && !(corte && corte.segurar),
    trocar: (id, em, segurar) => trocarVisual(id, em, segurar),
    aoElementos: pedido => { autoLed = pedido; mandarElementos(); },
    aoFumaca: () => {
      anotarFumaca('liga');
      nasPaginas(`window.__luzShow && window.__luzShow.comando('liga', ['fumaca'])`);
      setTimeout(() => { anotarFumaca('solta'); nasPaginas(`window.__luzShow && window.__luzShow.comando('solta', ['fumaca'])`); }, 2200);
    },
  });
}

const ARQ_LOG = path.join(__dirname, 'saida.log');
try { if (fs.statSync(ARQ_LOG).size > 2e6) fs.writeFileSync(ARQ_LOG, ''); } catch {}
function log(texto) { fs.appendFile(ARQ_LOG, `[${new Date().toLocaleString('pt-BR')}] ${texto}\n`, () => {}); }

// ---------- MadMapper (OSC na 8010, OSCQuery por HTTP) ----------
const ARQ_LIGADO = path.join(__dirname, 'led-ligado.txt');
const ARQ_AJUSTE = 'C:\\apps\\tv-player\\visuais-ajuste.json';
const SUPERFICIES = ['LED_PISTA', 'LED_DJ_FUNDO'];
// O PROJETO CLUBE.mad abre com estas no lugar das duas acima; se ficarem visíveis, cobrem o visual.
const ESCONDER = ['LED_PISTA_5', 'LED_3X_CIMA', 'LED_3X_MEIO', 'LED_3X_BAIXO', 'LED_DEITADO', 'LED_DJ_LOGO'];
// Entrada certa para mídia 1032x5676: a pista pega as linhas 0–4988 e o fundo do DJ as 4988–5676, sem faixa preta nas beiradas.
const ENTRADA = { LED_PISTA: [0, 0.1212121], LED_DJ_FUNDO: [0, -0.8787879] };
const esperar = ms => new Promise(r => setTimeout(r, ms));

function osc(endereco_, tipo, valor) {
  return new Promise(ok => {
    const pad = b => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
    const str = s => pad(Buffer.from(String(s), 'utf8'));
    let arg = Buffer.alloc(0);
    if (tipo === 'f') { arg = Buffer.alloc(4); arg.writeFloatBE(+valor); }
    else if (tipo === 'i') { arg = Buffer.alloc(4); arg.writeInt32BE(+valor); }
    else if (tipo === 's') arg = str(valor);
    const msg = Buffer.concat([str(endereco_), str(',' + tipo), arg]);
    const s = dgram.createSocket('udp4');
    s.send(msg, 8010, '127.0.0.1', () => { s.close(); ok(); });
  });
}
// Sempre um valor por vez, nunca a raiz "/": com o PROJETO CLUBE ela tem 1,7 MB e o MadMapper CONGELA A IMAGEM do LED por 300–600 ms para
// montar a resposta (medido em 06/11: um engasgo a cada leitura). Um valor só leva 6–30 ms.
// Conexão nova a cada leitura: o MadMapper derruba a conexão reaproveitada (ECONNRESET). Se ele cair no meio da resposta, sem o
// limite de tempo a promessa nunca termina e a saída para de conferir o LED. Devolve null se o endereço não existe.
function lerNo(caminho) {
  return new Promise((ok, erro) => {
    const limite = setTimeout(() => { req.destroy(); erro(new Error('MadMapper não respondeu')); }, 4000);
    const req = http.get('http://127.0.0.1:8010' + caminho, { agent: false, headers: { Connection: 'close' } }, r => {
      let t = '';
      r.setEncoding('utf8');
      r.on('data', d => { t += d; });
      r.on('error', e => { clearTimeout(limite); erro(e); });
      r.on('end', () => {
        clearTimeout(limite);
        if (r.statusCode === 404) return ok(null);
        try { ok(JSON.parse(t)); } catch (e) { erro(e); }
      });
    });
    req.on('error', e => { clearTimeout(limite); erro(e); });
  });
}
const lerValor = async caminho => (await lerNo(caminho))?.VALUE?.[0];
let noAr = false, avisoLed = '';
async function conferirNoAr() {
  try {
    let certo = !!await lerValor('/application/view/fullscreen');
    if (certo) {
      certo = false;
      for (const s of SUPERFICIES) {
        if (await lerValor(`/surfaces/${s}/visible`) && await lerValor(`/surfaces/${s}/visual/name`) === config.nome && await lerValor(`/surfaces/${s}/opacity`) > 0) { certo = true; break; }
      }
    }
    noAr = certo;
  } catch { noAr = false; }
}
const lembrarLigado = ligado => { try { fs.writeFileSync(ARQ_LIGADO, ligado ? '1' : '0'); } catch {} };
const estavaLigado = () => { try { return fs.readFileSync(ARQ_LIGADO, 'utf8').trim() !== '0'; } catch { return true; } };

// Deixa o MadMapper pronto para o visual: só as duas superfícies dele, com a fonte Spout, e a saída em tela cheia (sem ela, nada chega ao LED).
async function montarSuperficies(opacidade) {
  const faltam = [];
  for (const s of SUPERFICIES) if (!await lerNo(`/surfaces/${s}/visible`)) faltam.push(s);
  if (faltam.length) throw new Error(`o projeto aberto não tem ${faltam.join(', ')}`);
  // A fonte Spout leva um instante para virar mídia; trocar para um nome que ainda não existe não dá erro, mas não acontece nada.
  const fonte = `/medias/${config.nome.replace(/ /g, '_')}`;
  let temFonte = !!await lerNo(fonte);
  for (let i = 0; i < 16 && !temFonte; i++) { await esperar(500); temFonte = !!await lerNo(fonte); }
  if (!temFonte) throw new Error(`o MadMapper ainda não vê a fonte "${config.nome}"`);
  for (const s of ESCONDER) await osc(`/surfaces/${s}/visible`, 'i', 0); // endereço que não existe no projeto é ignorado
  for (const s of SUPERFICIES) {
    await osc(`/surfaces/${s}/visual/name`, 's', config.nome);
    await osc(`/surfaces/${s}/input/x`, 'f', ENTRADA[s][0]);
    await osc(`/surfaces/${s}/input/y`, 'f', ENTRADA[s][1]);
    await osc(`/surfaces/${s}/opacity`, 'f', opacidade);
    await osc(`/surfaces/${s}/visible`, 'i', 1);
  }
  await osc('/application/view/fullscreen', 'i', 1);
}
async function porNoLed() {
  await montarSuperficies(1);
  lembrarLigado(true);
  log(`LED: "${config.nome}" posto em ${SUPERFICIES.join(' e ')}`);
}
// Desligar é apagar: as duas superfícies ficam em opacidade 0, com a saída em tela cheia e preta.
async function tirarDoLed() {
  for (const s of SUPERFICIES) await osc(`/surfaces/${s}/opacity`, 'f', 0);
  lembrarLigado(false);
  log('LED: apagado');
}

// O brilho mora no servidor do app. O MadMapper abre o projeto com as cores salvas, então é preciso reaplicar.
function pedirAoServidor(rota) {
  return new Promise(ok => {
    const req = http.request('http://127.0.0.1:8080' + rota, { method: 'POST', timeout: 5000 }, r => {
      let t = '';
      r.setEncoding('utf8');
      r.on('data', d => { t += d; });
      r.on('end', () => { try { ok(JSON.parse(t)); } catch { ok(null); } });
    });
    req.on('timeout', () => { req.destroy(); ok(null); });
    req.on('error', () => ok(null));
    req.end();
  });
}
async function reaplicarBrilho() {
  let brilho = null;
  try { brilho = JSON.parse(fs.readFileSync(ARQ_AJUSTE, 'utf8')).brilho; } catch {}
  if (typeof brilho !== 'number') return;
  for (let i = 0; i < 24 && estavaLigado(); i++) {
    const r = await pedirAoServidor(`/api/visuais/ajuste?brilho=${brilho}`);
    if (r && r.aplicado) return log(`LED: brilho ${brilho} reaplicado`);
    await esperar(5000);
    await conferirNoAr();
  }
  log('LED: brilho não reaplicado (servidor do app sem resposta ou LED fora do ar)');
}

// Quando a saída abre e sempre que o MadMapper reaparece (com o Windows, ele leva minutos para abrir o projeto), o LED volta a como estava.
let madMapperPronto = false, sincronizando = false, avisoInicio = '', falhasSeguidas = 0;
async function sincronizarLed() {
  if (sincronizando) return;
  sincronizando = true;
  try {
    await lerNo('/application/view/fullscreen');
    falhasSeguidas = 0;
    if (!madMapperPronto) {
      const ligado = estavaLigado();
      if (ligado) await porNoLed(); else await montarSuperficies(0);
      madMapperPronto = true;
      await esperar(1500); // o OSCQuery leva um instante para mostrar o que acabou de receber
      await conferirNoAr();
      log(`LED: pronto ao abrir (${ligado ? 'ligado' : 'apagado, como estava'}; noAr=${noAr})`);
      if (ligado) await reaplicarBrilho();
    }
  } catch (e) {
    // Uma leitura perdida não é o MadMapper fechado: só depois de 3 seguidas (15 s) ele conta como reaberto, e mexer de novo não atropela ajuste feito à mão.
    if (++falhasSeguidas >= 3) madMapperPronto = false;
    if (avisoInicio !== e.message) { avisoInicio = e.message; log(`LED: aguardando o MadMapper (${e.message})`); }
  }
  sincronizando = false;
}

// ---------- servidor: as páginas dos visuais e a conversa com a mesa ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Cache-Control': 'no-store' };
const responderJson = (res, obj, codigo = 200) => { res.writeHead(codigo, { ...CORS, 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const estado = () => {
  let som = null;
  try { const p = JSON.parse(somAtual); som = { rms: p.r, pico: p.k, bpm: p.bpm, confianca: p.c, musica: p.v, sinal: p.s, entrada: p.e }; } catch {}
  return { visual: visualAtual, carregando: visualNovo, noAr, quadros: Math.round(ultimaTaxa), nome: config.nome, aviso: avisoLed, som };
};
// análise do som feita pela página do LED, repassada para quem quiser ouvir (a prévia da mesa não tem acesso ao microfone)
let somAtual = '';
const ouvintes = new Set();
function repassarSom(corpo) {
  somAtual = corpo;
  for (const r of ouvintes) r.write(`data: ${corpo}\n\n`);
}

function servir() {
  return new Promise((ok, erro) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/estado') return responderJson(res, estado());
      if (url.pathname === '/som' && req.method === 'POST') {
        let corpo = '';
        req.setEncoding('utf8');
        req.on('data', d => { corpo += d; });
        req.on('end', () => { repassarSom(corpo); res.writeHead(204, CORS); res.end(); });
        return;
      }
      if (url.pathname === '/som') {
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write(': som do LED\n\n');
        ouvintes.add(res);
        req.on('close', () => ouvintes.delete(res));
        return;
      }
      // Botões de flash do app (tv-player\luz-show.js). Vai também para a janela que está carregando, para a troca de visual não cortar o flash.
      if (url.pathname === '/flash' && req.method === 'POST') {
        const acao = url.searchParams.get('acao') === 'liga' ? 'liga' : 'solta';
        const alvos = String(url.searchParams.get('alvos') || '').split(',');
        if (alvos.includes('fumaca')) anotarFumaca(acao);
        const js = `window.__luzShow && window.__luzShow.comando(${JSON.stringify(acao)}, ${JSON.stringify(alvos)}, ${url.searchParams.get('strobo') === '1'}, ${Number(url.searchParams.get('hz')) || 0}, ${JSON.stringify(/^[0-9a-f]{6}$/i.test(url.searchParams.get('cor') || '') ? url.searchParams.get('cor') : '')}, ${url.searchParams.has('forca') ? Number(url.searchParams.get('forca')) : 100})`;
        for (const w of [janela, janelaNova]) if (w && !w.isDestroyed()) w.webContents.executeJavaScript(js).catch(() => {});
        return responderJson(res, { ok: true });
      }
      if (url.pathname === '/diretor/analise' && req.method === 'POST') {
        let corpo = '';
        req.setEncoding('utf8');
        req.on('data', d => { corpo += d; });
        req.on('end', () => {
          res.writeHead(204, CORS); res.end();
          try {
            const p = JSON.parse(corpo);
            if (p.foto && diretor) {
              diretor.aoFoto(p.foto, p.entrada);
              if (p.foto.tom && p.foto.tom !== corCamada.tom) { corCamada.tom = p.foto.tom; mandarCor(); }
            }
            if (p.evento && diretor) diretor.aoEvento(p.evento);
          } catch {}
        });
        return;
      }
      if (url.pathname === '/diretor') {
        if (req.method === 'POST') {
          const q = url.searchParams, novo = {};
          for (const k of ['elementos', 'cenas', 'fumaca']) if (q.has(k)) novo[k] = q.get(k) === '1';
          if (['musica', 'secao', 'frase'].includes(q.get('frequencia'))) novo.frequencia = q.get('frequencia');
          if (q.has('grupos')) novo.grupos = q.get('grupos').split(',').filter(Boolean);
          diretor.ajustar(novo);
        }
        return responderJson(res, diretor.estado());
      }
      if (url.pathname === '/cor') {
        if (req.method === 'POST') mudarCor(url.searchParams);
        return responderJson(res, corCamada);
      }
      if (url.pathname === '/led' && req.method === 'POST') {
        avisoLed = '';
        try {
          if (url.searchParams.get('tirar')) {
            await tirarDoLed();
          } else {
            const v = url.searchParams.get('visual');
            if (v && VISUAIS[v] === undefined) return responderJson(res, { ...estado(), aviso: `visual desconhecido: ${v}` }, 400);
            if (v) diretor.manual();
            if (v && (v !== visualAtual || visualNovo)) trocarVisual(v);
            await porNoLed();
          }
        } catch (e) { avisoLed = e.message; log(`LED: erro: ${e.message}`); }
        await new Promise(r => setTimeout(r, 400));
        await conferirNoAr();
        return responderJson(res, estado());
      }
      let rota = decodeURIComponent(url.pathname);
      if (rota.endsWith('/')) rota += 'index.html';
      const arq = path.normalize(path.join(PASTA_VISUAL, rota));
      if (!arq.startsWith(PASTA_VISUAL) || arq.startsWith(__dirname) || arq.startsWith(PASTA_SAIDA_ANTIGA)) { res.writeHead(403); return res.end(); }
      fs.readFile(arq, (e, dados) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        res.end(dados);
      });
    });
    srv.on('error', erro);
    srv.listen(config.porta, '127.0.0.1', () => ok(srv));
  });
}

// ---------- Python (Spout) ----------
function iniciarPython() {
  python = spawn(path.join(RADIO, '.venv', 'Scripts', 'python.exe'), [path.join(PASTA_SAIDA_ANTIGA, 'saida.py'), JSON.stringify(config)],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd: PASTA_SAIDA_ANTIGA });
  for (const fluxo of [python.stdout, python.stderr]) {
    let resto = '';
    fluxo.setEncoding('utf8');
    fluxo.on('data', d => {
      const linhas = (resto + d).split(/\r?\n/);
      resto = linhas.pop();
      for (const l of linhas) if (l === '@ok') devolverTextura(); else if (l) log(l);
    });
  }
  python.stdin.on('error', () => {});
  python.on('exit', codigo => {
    python = null;
    devolverTextura();
    if (saindo) return;
    log(`saida.py parou (código ${codigo}); reiniciando em 2 s`);
    setTimeout(iniciarPython, 2000);
  });
}
function enviarTextura(textura) {
  if (!python || pendente) { textura.release(); descartados++; return; }
  const info = textura.textureInfo, v = info.visibleRect, h = info.handle && info.handle.ntHandle;
  if (!h) { textura.release(); return; }
  const cab = Buffer.alloc(40);
  [v.width, v.height, info.codedSize.width, info.codedSize.height, v.x, v.y, process.pid, 0].forEach((n, i) => cab.writeUInt32LE(n, i * 4));
  h.copy(cab, 32, 0, Math.min(8, h.length));
  pendente = textura; pendenteDesde = Date.now();
  python.stdin.write(cab);
  quadros++;
}
function devolverTextura() {
  if (!pendente) return;
  try { pendente.release(); } catch {}
  pendente = null;
}

function criarJanela(url) {
  const w = new BrowserWindow({
    width: LARGURA, height: ALTURA, show: false, frame: false, useContentSize: true,
    webPreferences: { offscreen: { useSharedTexture: true }, backgroundThrottling: false },
  });
  w.setContentSize(LARGURA, ALTURA);
  w.webContents.setAudioMuted(true);
  w.webContents.setFrameRate(config.fps);
  // só a janela que está no ar manda quadro para o Spout; a que está carregando devolve a textura na hora
  w.webContents.on('paint', e => {
    if (!e.texture) return;
    if (w === janela) enviarTextura(e.texture); else e.texture.release();
  });
  w.webContents.on('dom-ready', () => { w.webContents.executeJavaScript(`window.__portaSaida = ${config.porta}; window.__corCamada = ${JSON.stringify(corCamada)}; window.__autoLedValores = ${JSON.stringify(autoLed)}; window.__fumacaPassado = ${JSON.stringify(fumacaRecente.filter(i => Date.now() - i[1] < 30000))};\n` + FLASH_PAGINA).catch(() => {}); });
  w.webContents.on('console-message', ev => { if (ev.level === 'error' && !ev.message.startsWith('Electron Security')) log(`página: ${ev.message}`); });
  w.webContents.on('did-fail-load', (_e, _c, desc) => { log(`não abriu o visual (${desc}); tentando em 5 s`); setTimeout(() => !w.isDestroyed() && w.loadURL(url), 5000); });
  w.webContents.on('render-process-gone', (_e, d) => { log(`página caiu (${d.reason}); recarregando`); setTimeout(() => !w.isDestroyed() && w.loadURL(url), 2000); });
  w.loadURL(url);
  return w;
}
function abrirVisual() { janela = criarJanela(endereco()); }

// Troca sem tela preta: o próximo visual carrega numa segunda janela e só entra no Spout quando já está desenhando.
// em: hora marcada (o diretor marca o tempo 1). segurar: fica pronta por trás, em ritmo baixo, até alguém mandar cortar. id null: solta a que está segura.
let corte = null;
function trocarVisual(id, em = 0, segurar = false) {
  if (id === null) {
    if (janelaNova && !janelaNova.isDestroyed() && corte && corte.segurar) { janelaNova.destroy(); janelaNova = null; visualNovo = null; corte = null; }
    return;
  }
  // já está carregando esta: só muda a hora do corte
  if (id === visualNovo && janelaNova && !janelaNova.isDestroyed() && corte) { corte.em = em; corte.segurar = segurar; return; }
  if (janelaNova && !janelaNova.isDestroyed()) janelaNova.destroy();
  const w = janelaNova = criarJanela(endereco(id));
  visualNovo = id;
  corte = { em, segurar, ate: segurar ? em : 0 };
  const inicio = Date.now();
  log(`carregando: ${id}`);
  let prontaEm = 0;
  const entrar = () => {
    if (w !== janelaNova || w.isDestroyed()) return;
    const velha = janela;
    w.webContents.setFrameRate(config.fps);
    janela = w; janelaNova = null; visualAtual = id; visualNovo = null; corte = null;
    try { fs.writeFileSync(ARQ_ULTIMO, id); } catch {}
    log(`no ar: ${id} (${Date.now() - inicio} ms depois de pedir)`);
    // espera a última textura da janela velha voltar antes de fechar
    setTimeout(() => { if (velha && !velha.isDestroyed()) velha.destroy(); }, 400);
  };
  const aguardar = () => {
    if (w !== janelaNova || w.isDestroyed() || !corte) return;
    const agora = Date.now();
    if (corte.segurar) {
      // o drop não veio a tempo: desiste e libera a placa
      if (agora > corte.ate) { log(`${id} ficou pronta e o drop não veio; soltando`); w.destroy(); janelaNova = null; visualNovo = null; corte = null; if (diretor) diretor.soltou(); return; }
      setTimeout(aguardar, 8);
      return;
    }
    // meio segundo desenhando antes de entrar, a não ser que já esteja pronta há tempo
    const quando = Math.max(prontaEm + 200, corte.em);
    if (agora >= quando) return entrar();
    setTimeout(aguardar, Math.min(Math.max(quando - agora - 4, 1), 50));
  };
  const conferir = async () => {
    if (w !== janelaNova || w.isDestroyed()) return;
    let pronto = false;
    try { pronto = await w.webContents.executeJavaScript('!!(window.__estado || window.__painel)'); } catch {}
    if (w !== janelaNova || w.isDestroyed()) return;
    if (pronto) {
      prontaEm = Date.now();
      if (corte && corte.segurar) w.webContents.setFrameRate(15);
      aguardar();
      return;
    }
    if (Date.now() - inicio > 25000) {
      log(`${id} não ficou pronto em 25 s; continua o anterior`);
      if (!w.isDestroyed()) w.destroy();
      janelaNova = null; visualNovo = null; corte = null;
      return;
    }
    setTimeout(conferir, 150);
  };
  setTimeout(conferir, 300);
}
function montarBandeja() {
  const icone = nativeImage.createFromPath(path.join(PASTA_SAIDA_ANTIGA, 'icone.png')).resize({ width: 16, height: 16 });
  bandeja = new Tray(icone);
  bandeja.setToolTip(`Visuais da pista → Spout "${config.nome}" ${LARGURA}×${ALTURA}`);
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: `Saída "${config.nome}" · ${LARGURA}×${ALTURA} · ${config.fps} fps`, enabled: false },
    { label: 'Recarregar o visual', click: () => trocarVisual(visualAtual) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  if (!UNICA) return;
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) => responder(permissao === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => permissao === 'media');
  if (erroConfig) log(`config.json não foi lido (${erroConfig}); usando o padrão`);
  try { await servir(); } catch (e) { log(`porta ${config.porta} ocupada (${e.code}); saindo`); return app.quit(); }
  log(`abrindo ${endereco()} em ${LARGURA}×${ALTURA} a ${config.fps} fps → Spout "${config.nome}"`);
  iniciarPython();
  criarODiretor();
  abrirVisual();
  abrirOuvido();
  montarBandeja();
  setInterval(() => {
    if (pendente && Date.now() - pendenteDesde > 1000) { log('o Python não confirmou a textura em 1 s; devolvendo'); devolverTextura(); }
  }, 500);
  setInterval(() => {
    ultimaTaxa = quadros / 10;
    log(`${ultimaTaxa.toFixed(1)} quadros/s enviados (${(descartados / 10).toFixed(1)}/s descartados)`);
    quadros = descartados = 0;
    conferirNoAr();
  }, 10000);
  const perguntar = `JSON.stringify(window.__estado || null)`;
  const registrar = () => janela && janela.webContents.executeJavaScript(perguntar).then(t => log(`página: ${t}`), () => {});
  setTimeout(registrar, 15000);
  setInterval(registrar, 300000);
  setTimeout(sincronizarLed, 3000);
  setInterval(sincronizarLed, 5000);
});

app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', e => {
  if (saindo) return;
  saindo = true;
  devolverTextura();
  if (!python) return;
  e.preventDefault();
  const sair = () => app.exit(0);
  python.once('exit', sair);
  setTimeout(sair, 3000);
  python.stdin.end();
});
