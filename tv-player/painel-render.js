// Gerador do Estúdio do painel: abre a página de render num Electron escondido, sem GPU e com prioridade baixa,
// para não disputar nada com a saída do LED da pista. A página fala direto com o servidor e fecha quando acaba.
const { app, BrowserWindow } = require('electron');
const os = require('os');
const path = require('path');

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', path.join(os.tmpdir(), 'painel-estudio', 'electron'));

const url = process.argv[process.argv.length - 1];
app.whenReady().then(() => {
  const janela = new BrowserWindow({ width: 800, height: 200, show: false, webPreferences: { backgroundThrottling: false } });
  janela.webContents.on('render-process-gone', () => app.exit(2));
  janela.webContents.on('did-fail-load', () => app.exit(3));
  janela.webContents.on('console-message', (_e, nivel, msg) => { if (nivel >= 2) console.error(msg); });
  // a página avisa que acabou mudando o título
  janela.on('page-title-updated', (_e, t) => { if (t === 'fim') app.exit(0); });
  janela.loadURL(url);
});
