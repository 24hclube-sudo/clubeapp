// Confere a análise com música de verdade, fora do LED. Uso: node testar-analise.mjs [--linha] <arquivo> [<arquivo>...]
// O ffmpeg decodifica para PCM; a análise recebe em blocos de 128, como na janela escondida. Imprime andamento, tom, seções e trocas de faixa.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { AnaliseFaixa } from './analise.mjs';

const FFMPEG = 'C:\\Program Files (x86)\\Nova Star\\ViPlex Express\\Bin\\VideoConverter\\ffmpeg.exe';
const args = process.argv.slice(2);
const linha = args[0] === '--linha' ? (args.shift(), true) : false;
const SR = 48000;
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function decodificar(arq, aoBloco) {
  return new Promise((ok, erro) => {
    const ff = spawn(FFMPEG, ['-v', 'error', '-i', arq, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let resto = Buffer.alloc(0);
    ff.stdout.on('data', d => {
      const b = resto.length ? Buffer.concat([resto, d]) : d;
      const n = Math.floor(b.length / 4);
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = b.readFloatLE(i * 4);
      resto = b.subarray(n * 4);
      for (let i = 0; i < n; i += 128) aoBloco(f.subarray(i, Math.min(n, i + 128)));
    });
    ff.on('close', c => (c === 0 ? ok() : erro(new Error('ffmpeg ' + c))));
  });
}

for (const arq of args) {
  const inicio = Date.now();
  const secoes = [], faixas = [];
  const a = new AnaliseFaixa(SR, { aoEvento: e => {
    if (e.tipo === 'secao') secoes.push(e);
    if (e.tipo === 'faixa') faixas.push(e);
  } });
  const bpms = [], tons = {}; let topoTroca = 0;
  let prox = 8;
  await decodificar(arq, b => {
    a.empurrar(b);
    if (a.scoreTroca > topoTroca) topoTroca = a.scoreTroca;
    if (a.t >= prox) { prox += 1; if (a.bpm) bpms.push(a.bpm); if (a.tom) tons[a.tom] = (tons[a.tom] || 0) + 1; }
  });
  bpms.sort((x, y) => x - y);
  const med = bpms[bpms.length >> 1] || 0, p10 = bpms[bpms.length >> 3] || 0, p90 = bpms[bpms.length - 1 - (bpms.length >> 3)] || 0;
  const topTom = Object.entries(tons).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(100 * v / bpms.length)}%`).join(', ');
  const tempoEm = {};
  for (let i = 0; i < secoes.length; i++) {
    const fim = i + 1 < secoes.length ? secoes[i + 1].t : a.t;
    tempoEm[secoes[i].secao] = (tempoEm[secoes[i].secao] || 0) + fim - secoes[i].t;
  }
  console.log(`\n== ${path.basename(arq)}\n   ${mmss(a.t)} de música, analisado em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  console.log(`   BPM mediana ${med.toFixed(2)} (p10 ${p10.toFixed(2)}, p90 ${p90.toFixed(2)}) | tom: ${topTom} | golpes: ${a.golpesKick} bumbos (${(a.golpesKick / a.t * 60).toFixed(0)}/min), ${a.golpesClap} palmas, ${a.golpesHat} chimbais | compassos ${a.compasso}`);
  console.log('   tempo por seção: ' + Object.entries(tempoEm).map(([k, v]) => `${k} ${Math.round(v)}s`).join(', '));
  console.log('   maior score de troca: ' + topoTroca.toFixed(3));
  if (faixas.length) console.log('   trocas de faixa: ' + faixas.map(f => `${mmss(f.t)} (${f.motivo})`).join(', '));
  if (linha) for (const s of secoes) console.log(`   ${mmss(s.t).padStart(6)}  ${s.secao.padEnd(8)} energia ${s.energia}${s.forca ? ' força ' + s.forca + ' semBumbo ' + s.semBumbo : ''}  compasso ${s.compasso}`);
}
