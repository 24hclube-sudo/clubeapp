// Volume das caixas deste PC, para a barra da aba Música: fala com caixas-volume.ps1, que fica aberto
// enquanto o servidor roda e só sobe no primeiro uso. Mexer na barra manda muitos valores seguidos,
// então só o mais recente é aplicado.
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const SCRIPT = path.join(__dirname, 'caixas-volume.ps1');
const LIMITE_MS = 8000;
const VALIDADE_LEITURA_MS = 1000;

let processo = null;
let esperando = [];

function encerrar(motivo) {
  const filho = processo;
  processo = null;
  if (filho) { try { filho.kill(); } catch { /* já saiu */ } }
  for (const pedido of esperando.splice(0)) {
    clearTimeout(pedido.timer);
    pedido.erro(new Error(motivo));
  }
}

function abrir() {
  const filho = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  processo = filho;
  filho.stdout.setEncoding('utf8');
  readline.createInterface({ input: filho.stdout }).on('line', linha => {
    const pedido = esperando.shift();
    if (!pedido) return;
    clearTimeout(pedido.timer);
    try {
      const resposta = JSON.parse(linha);
      if (resposta.erro) pedido.erro(new Error(resposta.erro));
      else pedido.ok(resposta);
    } catch (e) {
      pedido.erro(e);
    }
  });
  const aoSair = () => { if (processo === filho) encerrar('o ajuste de volume fechou'); };
  filho.on('exit', aoSair);
  filho.on('error', aoSair);
  filho.stdin.on('error', aoSair);
}

function comando(linha) {
  return new Promise((ok, erro) => {
    if (!processo) abrir();
    const timer = setTimeout(() => encerrar('o ajuste de volume não respondeu'), LIMITE_MS);
    esperando.push({ ok, erro, timer });
    processo.stdin.write(`${linha}\n`);
  });
}

let leitura = null;
let leituraEm = 0;

async function lerVolume() {
  if (leitura && Date.now() - leituraEm < VALIDADE_LEITURA_MS) return leitura;
  leitura = await comando('get');
  leituraEm = Date.now();
  return leitura;
}

let alvo = null;
let aplicando = null;

function definirVolume(valor) {
  alvo = valor;
  if (aplicando) return aplicando;
  aplicando = (async () => {
    try {
      let resposta;
      while (alvo !== null) {
        const v = alvo;
        alvo = null;
        resposta = await comando(`set ${v.toFixed(3)}`);
      }
      leitura = resposta;
      leituraEm = Date.now();
      return resposta;
    } finally {
      aplicando = null;
    }
  })();
  return aplicando;
}

module.exports = { lerVolume, definirVolume };
