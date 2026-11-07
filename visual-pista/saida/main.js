// Visual da pista → Spout (para o MadMapper pôr no LED Pista).
// Serve a pasta do visual num servidor local, abre a página em ?saida numa janela fora da tela
// (offscreen rendering do Electron, sem captura de tela) e manda cada quadro para o saida.py,
// que publica como Spout. Mesmo esquema do C:\apps\radio-saida (usa o Electron e o Python de lá).
// Modo textura (padrão): o quadro fica na GPU; vai só o handle da textura (40 bytes, ver saida.py) e o
// Python responde "@ok" quando já copiou, para devolvermos a textura ao Chromium.
// Modo cópia ("textura": false): largura e altura (uint32 little-endian) + pixels BGRA pelo cano.
const { app, BrowserWindow, Tray, Menu, nativeImage, session } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PASTA_VISUAL = path.join(__dirname, '..');
const RADIO = 'C:\\apps\\radio-saida';
const PADRAO = {
  porta: 5211, escala: 1, fps: 30, audio: 'teste', cena: '', paleta: '', compassos: 8, brilho: 1,
  nome: 'Visual Pista CLUBE', spout: true, ndi: false, textura: true,
};
let config = PADRAO;
let erroConfig = null; // o Bloco de Notas/PowerShell podem gravar com BOM: tira antes de ler
try { config = { ...PADRAO, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '')) }; } catch (e) { erroConfig = e.message; }
const LARGURA = Math.round(1032 * config.escala), ALTURA = Math.round(5676 * config.escala);

function endereco() {
  const q = new URLSearchParams({ saida: '', escala: String(config.escala) });
  for (const k of ['audio', 'cena', 'paleta', 'compassos', 'brilho']) if (config[k] !== '' && config[k] != null) q.set(k, String(config[k]));
  return `http://127.0.0.1:${config.porta}/?${q.toString().replace('saida=&', 'saida&')}`;
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('force-device-scale-factor', '1'); // 1 px da página = 1 px do painel
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Uma instância só. Chamar de novo com --sair fecha a que está rodando (limpo, soltando o Spout);
// com --recarregar, recarrega o visual (ex.: depois de mexer no js/).
const UNICA = app.requestSingleInstanceLock();
if (!UNICA) app.exit(0); // a mensagem já foi para a que está rodando
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--sair')) app.quit();
  else if (argv.includes('--recarregar') && janela) { log('recarregando o visual (pedido de fora)'); janela.loadURL(endereco()); }
});

let janela = null, python = null, ocupado = false, saindo = false, quadros = 0, descartados = 0, bandeja = null;
let pendente = null, pendenteDesde = 0; // textura com o Python, esperando o "@ok"

const ARQ_LOG = path.join(__dirname, 'saida.log');
try { if (fs.statSync(ARQ_LOG).size > 2e6) fs.writeFileSync(ARQ_LOG, ''); } catch {}
function log(texto) {
  fs.appendFile(ARQ_LOG, `[${new Date().toLocaleString('pt-BR')}] ${texto}\n`, () => {});
}

// Servidor só para este PC (127.0.0.1): a página usa módulos ES e o microfone, que não rodam de file://.
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
function servir() {
  return new Promise((ok, erro) => {
    const srv = http.createServer((req, res) => {
      let rota = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rota.endsWith('/')) rota += 'index.html';
      const arq = path.normalize(path.join(PASTA_VISUAL, rota));
      if (!arq.startsWith(PASTA_VISUAL) || arq.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
      fs.readFile(arq, (e, dados) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(dados);
      });
    });
    srv.on('error', erro);
    srv.listen(config.porta, '127.0.0.1', () => ok(srv));
  });
}

function iniciarPython() {
  ocupado = false;
  python = spawn(path.join(RADIO, '.venv', 'Scripts', 'python.exe'), [path.join(__dirname, 'saida.py'), JSON.stringify(config)],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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

function enviar(imagem) {
  if (!python || ocupado) { descartados++; return; } // Python ainda no quadro anterior: descarta, sem acumular atraso
  const { width, height } = imagem.getSize();
  const pixels = imagem.toBitmap(); // BGRA
  if (pixels.length !== width * height * 4) return;
  const cab = Buffer.alloc(8);
  cab.writeUInt32LE(width, 0); cab.writeUInt32LE(height, 4);
  ocupado = true;
  python.stdin.write(cab);
  python.stdin.write(pixels, () => { ocupado = false; });
  quadros++;
}

function enviarTextura(textura) {
  // Python ainda copiando o anterior: devolve este já (o Chromium tem poucas texturas para girar)
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
  if (pendente) { pendente.release(); pendente = null; }
}

function abrirVisual() {
  janela = new BrowserWindow({
    width: LARGURA, height: ALTURA, show: false, frame: false, useContentSize: true,
    webPreferences: { offscreen: config.textura ? { useSharedTexture: true } : true, backgroundThrottling: false },
  });
  // Na criação o Windows corta a janela na altura útil da tela; ajustando depois, ela fica inteira.
  janela.setContentSize(LARGURA, ALTURA);
  janela.webContents.setAudioMuted(true);
  janela.webContents.setFrameRate(config.fps);
  janela.webContents.on('paint', (e, _sujo, imagem) => e.texture ? enviarTextura(e.texture) : enviar(imagem));
  // (o aviso de segurança do Electron sai a cada abertura; a página é nossa e só está em 127.0.0.1)
  janela.webContents.on('console-message', (_e, nivel, msg) => { if (nivel >= 2 && !msg.startsWith('Electron Security Warning')) log(`página: ${msg}`); });
  janela.webContents.on('did-fail-load', (_e, _c, desc) => { log(`não abriu o visual (${desc}); tentando em 5 s`); setTimeout(() => janela && janela.loadURL(endereco()), 5000); });
  janela.webContents.on('render-process-gone', (_e, d) => { log(`página caiu (${d.reason}); recarregando`); setTimeout(() => janela && janela.loadURL(endereco()), 2000); });
  janela.loadURL(endereco());
}

function montarBandeja() {
  const icone = nativeImage.createFromPath(path.join(__dirname, 'icone.png')).resize({ width: 16, height: 16 });
  bandeja = new Tray(icone);
  bandeja.setToolTip(`Visual Pista → Spout "${config.nome}" ${LARGURA}×${ALTURA}`);
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: `Saída "${config.nome}" · ${LARGURA}×${ALTURA} · ${config.fps} fps`, enabled: false },
    { label: 'Recarregar o visual', click: () => janela && janela.loadURL(endereco()) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  if (!UNICA) return;
  // a página pede o microfone (entrada de linha da mesa); aqui não há quem clique em "permitir"
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) => responder(permissao === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => permissao === 'media');
  if (erroConfig) log(`config.json não foi lido (${erroConfig}); usando o padrão`);
  try { await servir(); } catch (e) { log(`porta ${config.porta} ocupada (${e.code}); saindo`); return app.quit(); }
  log(`abrindo ${endereco()} em ${LARGURA}×${ALTURA} a ${config.fps} fps → Spout "${config.nome}" (${config.textura ? 'textura na GPU' : 'cópia pela CPU'})`);
  iniciarPython();
  abrirVisual();
  montarBandeja();
  setInterval(() => {
    // Python travado ou reiniciando com uma textura nossa: devolve, senão o Chromium para de desenhar
    if (pendente && Date.now() - pendenteDesde > 1000) { log('o Python não confirmou a textura em 1 s; devolvendo'); devolverTextura(); }
  }, 500);
  setInterval(() => { log(`${(quadros / 10).toFixed(1)} quadros/s enviados (${(descartados / 10).toFixed(1)}/s descartados)`); quadros = descartados = 0; }, 10000);
  // o que a página está ouvindo (não dá para ver o HUD na saída)
  const estado = `(() => { const p = window.__painel; if (!p) return 'carregando';
    const { A, R, atual } = p, vivo = performance.now() - A.ultimoOnset < 4000;
    let db = -Infinity;
    if (A.an) { const b = new Float32Array(A.an.fftSize); A.an.getFloatTimeDomainData(b);
      db = 10 * Math.log10(b.reduce((s, x) => s + x * x, 0) / b.length); }
    return 'áudio: ' + (A.an ? A.entrada : A.estado) + (A.an ? (vivo ? ' · com bumbo' : ' · sem bumbo') + ' · ' + db.toFixed(0) + ' dBFS' : '') +
      ' · ' + R.bpm.toFixed(1) + ' BPM' + (A.bpm ? ' (confiança ' + Math.round(A.confianca * 100) + '%)' : ' (relógio interno)') +
      ' · quadro ' + atual.cena + '/' + atual.paleta; })()`;
  const registrarEstado = () => janela && janela.webContents.executeJavaScript(estado).then(t => log(`página: ${t}`), () => {});
  setTimeout(registrarEstado, 15000);
  setInterval(registrarEstado, 300000);
});

app.on('window-all-closed', e => e.preventDefault()); // a janela é invisível; só sai pelo menu da bandeja
// Fechar o stdin em vez de matar: o Python termina o laço e solta o emissor, senão o nome fica preso na lista do Spout.
// Espera ele sair (até 3 s), porque o Windows derruba os processos filhos junto com o Electron.
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
