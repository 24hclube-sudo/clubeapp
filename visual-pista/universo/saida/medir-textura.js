// Mede o visual no mesmo caminho da saída de verdade (quadro na GPU, textura compartilhada), sem abrir Spout nenhum.
// Uso: electron <pasta> "<arquivo de log>" <segundos> "<url>"  (a URL tem de ser o último argumento)
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

const [arqLog, segundos, url] = process.argv.slice(2);
const log = (...a) => { try { fs.appendFileSync(arqLog, a.join(' ') + '\n'); } catch {} };
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
process.on('uncaughtException', e => { log('erro', e.stack || e); app.exit(2); });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, p, r) => r(p === 'media'));
  session.defaultSession.setPermissionCheckHandler((_w, p) => p === 'media');
  const janela = new BrowserWindow({ width: 1032, height: 5676, show: false, frame: false, useContentSize: true,
    webPreferences: { offscreen: { useSharedTexture: true }, backgroundThrottling: false } });
  janela.setContentSize(1032, 5676);
  janela.webContents.setAudioMuted(true);
  janela.webContents.setFrameRate(60);
  let pintados = 0, comTextura = 0, tamanho = '';
  janela.webContents.on('paint', (e, _d, _im) => {
    pintados++;
    if (e.texture) {
      comTextura++;
      const v = e.texture.textureInfo.visibleRect;
      tamanho = `${v.width}x${v.height}`;
      e.texture.release();
    }
  });
  janela.webContents.on('console-message', (ev) => { if (ev.level === 'error') log('página:', ev.message); });
  setInterval(() => { log(`${pintados / 2} quadros/s (${comTextura / 2} com textura, ${tamanho})`); pintados = comTextura = 0; }, 2000);
  janela.loadURL(url);
  setTimeout(() => {
    janela.webContents.executeJavaScript('JSON.stringify(window.__estado || null)').then(t => { log('estado', t); app.exit(0); }, () => app.exit(0));
  }, (+segundos) * 1000);
});
