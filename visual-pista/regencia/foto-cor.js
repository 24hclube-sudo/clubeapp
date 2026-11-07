// Confere a camada de cor fora da tela, pelo mesmo caminho da saída: injeta o estado e o flash-pagina.js depois do dom-ready.
// Uso: electron foto-cor.js <prefixo> <espera s> <largura> <altura> <flash-pagina.js> <json do estado da cor> <url>
// Grava PNG e registra quadros por segundo com a camada ligada.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const [prefixo, esperaS, largura, altura, flash, corJson, url] = process.argv.slice(2);
const log = (...a) => { try { fs.appendFileSync(prefixo + '.log', a.join(' ') + '\n'); } catch {} };
app.setPath('userData', prefixo + '-dados');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
process.on('uncaughtException', e => { log('erro', e.stack || e); app.exit(2); });
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, p, r) => r(p === 'media'));
  const W = +largura, H = +altura;
  const j = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  j.setContentSize(W, H);
  j.webContents.setFrameRate(60);
  j.webContents.on('dom-ready', () => { j.webContents.executeJavaScript(`window.__portaSaida = 5212; window.__corCamada = ${corJson}; window.__fumacaPassado = [];\n` + fs.readFileSync(flash, 'utf8')).catch(e => log('inj', e.message)); });
  j.webContents.on('console-message', (_e, n, msg) => { if (n >= 2 && !msg.startsWith('Electron Security') && !msg.includes('powerPreference')) log('página:', msg); });
  let pint = 0, feito = false; const fim = Date.now() + (+esperaS) * 1000;
  j.webContents.on('paint', (_e, _d, img) => {
    pint++;
    if (!feito && Date.now() > fim) {
      feito = true;
      fs.writeFileSync(prefixo + '.png', img.toPNG());
      j.webContents.executeJavaScript('JSON.stringify(window.__corEstado ? {mistura: window.__corEstado().mistura, folha: window.__corEstado().folha} : null)').then(t => { log('cor', t); app.exit(0); }, () => app.exit(0));
    }
  });
  setInterval(() => { log(`${pint / 2} q/s`); pint = 0; }, 2000);
  j.loadURL(url);
  setTimeout(() => { log('tempo esgotado'); app.exit(1); }, (+esperaS + 40) * 1000);
});
