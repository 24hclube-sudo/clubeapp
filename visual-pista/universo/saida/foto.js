// Abre o visual fora da tela (Electron do radio-saida) e grava um ou mais quadros em PNG, para conferir em resolução cheia.
// Uso: electron <pasta> "<prefixo de saída>" <segundos até o 1º quadro> <quantos> <intervalo em s> <largura> <altura> "<url>"
// O endereço tem de ser o último argumento: o Electron fecha na hora (código -1) se vier algo depois de uma URL.
// Registra em <prefixo>.log: quadros por segundo que a página entregou e o estado que ela informa.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

const [prefixo, esperaS, quantos, intervaloS, largura, altura, url] = process.argv.slice(2);
const log = (...a) => { try { fs.appendFileSync(prefixo + '.log', a.join(' ') + '\n'); } catch {} };
log('iniciando', url);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
process.on('uncaughtException', e => { log('erro', e.stack || e); app.exit(2); });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, p, r) => r(p === 'media'));
  session.defaultSession.setPermissionCheckHandler((_w, p) => p === 'media');
  const W = +largura, H = +altura;
  const janela = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  janela.setContentSize(W, H);
  janela.webContents.setAudioMuted(true);
  janela.webContents.setFrameRate(60);
  let pintados = 0, gravados = 0, proxima = Date.now() + (+esperaS) * 1000;
  janela.webContents.on('paint', (_e, _d, imagem) => {
    pintados++;
    if (Date.now() >= proxima && gravados < +quantos) {
      proxima = Date.now() + (+intervaloS) * 1000;
      gravados++;
      const nome = `${prefixo}-${gravados}.png`;
      fs.writeFileSync(nome, imagem.toPNG());
      const { width, height } = imagem.getSize();
      log(`gravado ${nome} (${width}x${height})`);
      if (gravados >= +quantos) {
        janela.webContents.executeJavaScript('JSON.stringify(window.__estado || null)').then(t => {
          log('estado', t);
          app.exit(0);
        }, () => app.exit(0));
      }
    }
  });
  janela.webContents.on('console-message', (_e, nivel, msg) => { if (nivel >= 2 && !msg.startsWith('Electron Security')) log('página:', msg); });
  setInterval(() => { log(`${pintados / 2} quadros/s`); pintados = 0; }, 2000);
  janela.loadURL(url);
  setTimeout(() => { log('tempo esgotado'); app.exit(1); }, ((+esperaS) + (+quantos) * (+intervaloS) + 60) * 1000);
});
