// Abre mesa/diag-som.html fora da tela e registra, a cada 2 s, o que a análise de som está lendo.
// Uso: electron <pasta> "<arquivo de log>" <segundos> "<url>"  (a URL tem de ser o último argumento)
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

const [arqLog, segundos, url] = process.argv.slice(2);
const log = (...a) => { try { fs.appendFileSync(arqLog, a.join(' ') + '\n'); } catch {} };
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
process.on('uncaughtException', e => { log('erro', e.stack || e); app.exit(2); });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, p, r) => r(p === 'media'));
  session.defaultSession.setPermissionCheckHandler((_w, p) => p === 'media');
  const janela = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { backgroundThrottling: false } });
  janela.webContents.setAudioMuted(true);
  janela.webContents.on('console-message', ev => { if (ev.level === 'error') log('página:', ev.message); });
  janela.loadURL(url);
  setInterval(() => {
    janela.webContents.executeJavaScript('window.__diag ? JSON.stringify(window.__diag()) : "carregando"').then(t => log(t), () => {});
  }, 2000);
  setTimeout(() => app.exit(0), (+segundos) * 1000);
});
