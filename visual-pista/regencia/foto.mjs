// Tira fotos de uma cena fora da tela e monta a vista de olho. Uso: node foto.mjs <cena> <seção> [quantas=1] [intervalo=1] [espera=4] [escala=1]
// Passa pelo foto.js do Universo. Abre direto a pasta visual-pista pela saída que está no ar (5212), que só serve os arquivos: não mexe no LED.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [cena, secao, quantas = '1', intervalo = '1', espera = '4', escala = '1', extra = ''] = process.argv.slice(2);
const SAIDA = process.env.PREVIAS || 'C:/apps/previas-regencia';
fs.mkdirSync(SAIDA, { recursive: true });
const pref = `${SAIDA}/${cena}-${secao}`;
const W = Math.round(1032 * +escala), H = Math.round(5676 * +escala);
const url = `http://127.0.0.1:5212/regencia/?saida&led&escala=${escala}&audio=teste&sim=${secao}&modo=${cena}${extra ? '&' + extra : ''}`;
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(CHROME_|ELECTRON_)|^NODE_OPTIONS$/.test(k)) delete env[k];
const el = spawn('C:/apps/radio-saida/node_modules/electron/dist/electron.exe', ['C:/apps/visual-pista/universo/saida/foto.js', pref, espera, quantas, intervalo, String(W), String(H), url], { env, stdio: 'ignore' });
el.on('exit', c => {
  try {
    const log = fs.readFileSync(pref + '.log', 'utf8').split('\n');
    const q = log.filter(l => /quadros\/s/.test(l)).slice(-3).join(' | ');
    const er = log.filter(l => /página:|erro/.test(l)).slice(0, 8).join('\n');
    console.log(cena, secao, 'saída', c, '|', q);
    if (er) console.log(er);
    console.log(log.filter(l => /^estado/.test(l)).join('').slice(0, 400));
    fs.unlinkSync(pref + '.log');
  } catch (e) { console.log('sem log', e.message); }
});
