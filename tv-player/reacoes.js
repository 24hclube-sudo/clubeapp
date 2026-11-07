// O que reage a quê: escolhas do app, guardadas em reacoes.json. A tela é public/reacoes.html.
// - led: cada elemento dos visuais de pé e da Marca escolhe a sua fonte de som. As páginas perguntam a cada segundo (js/reacoes.js).
// - outros: quais sons chegam aos demais visuais do LED, que têm as reações desenhadas dentro de cada um.
// - barras: nas cenas de áudio das barras, de onde vem o que a cena chama de bumbo, baixo, médio e agudo (audio-barras.js).
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, 'reacoes.json');
const PADRAO = () => ({
  led: { personagens: 'desligado', personagemTempo: '12', personagemSom: 'grave', personagemLugar: 'atras', ceu: 'grave', estrelas: 'grave', luz: 'desligado', faixa: 'bumbo', brilhinhos: 'agudo', empurra: 'bumbo', reflexo: 'grave', meteoros: 'ligado', booth: 'bumbo', logo: 'prata', contraluz: 'desligado', estiloLuz: 'halo', logoReage: 'acende', logoFonte: 'grave', logoTam: 'medio', akinCor: 'grave', akinLetra: 'bumbo', akinMassa: 'grave', fumacaSom: 'bumbo', passagens: 'desligado', pasMeteoros: 'ligado', pasFaixas: 'ligado', pasVarredura: 'ligado', pasCometa: 'ligado', pasOnda: 'desligado', pasDobra: 'desligado', pasQuanto: 'medio', pasForca: 'medio', pasSom: 'bumbo', teto: 'aberto' },
  outros: { bumbo: true, grave: true, medio: true, agudo: true },
  som: { piso: -28, forca: 100 },
  tela: { antiBanding: 2 },
  barras: { bumbo: 'bumbo', baixo: 'baixo', medio: 'medio', agudo: 'agudo' },
});
const SOM = ['desligado', 'bumbo', 'grave', 'medio', 'agudo', 'volume'];
const ACEITA = {
  led: {
    ceu: SOM,
    personagens: ['ligado', 'desligado'],
    personagemTempo: ['6', '12', '24', '48'],
    personagemSom: ['desligado', 'grave', 'medio', 'agudo', 'volume'],
    personagemLugar: ['atras', 'frente'],
    estrelas: SOM,
    luz: [...SOM, 'fixo'],
    faixa: [...SOM, 'fixo'],
    brilhinhos: [...SOM, 'fixo'],
    empurra: SOM,
    reflexo: SOM,
    meteoros: ['ligado', 'desligado'],
    booth: [...SOM, 'fixo'],
    logo: ['prata', 'cromado', 'canelado', 'branco', 'contorno', 'metal', 'zinco'],
    estiloLuz: ['halo', 'aurora', 'neon'],
    logoReage: ['nada', 'acende', 'pulsa', 'equalizador', 'onda'],
    logoFonte: SOM.slice(1),
    logoTam: ['pequeno', 'medio', 'grande'],
    contraluz: [...SOM, 'fixo'],
    akinCor: SOM,
    akinLetra: SOM,
    akinMassa: SOM,
    fumacaSom: SOM,
    passagens: ['ligado', 'desligado'],
    pasMeteoros: ['ligado', 'desligado'],
    pasFaixas: ['ligado', 'desligado'],
    pasVarredura: ['ligado', 'desligado'],
    pasCometa: ['ligado', 'desligado'],
    pasOnda: ['ligado', 'desligado'],
    pasDobra: ['ligado', 'desligado'],
    pasQuanto: ['pouco', 'medio', 'muito'],
    pasForca: ['suave', 'medio', 'forte'],
    pasSom: SOM,
    teto: ['aberto', 'fechado'],
  },
  barras: Object.fromEntries(['bumbo', 'baixo', 'medio', 'agudo'].map(k => [k, ['desligado', 'bumbo', 'baixo', 'medio', 'agudo']])),
};

let atual = PADRAO();
try {
  const salvo = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  for (const g of Object.keys(atual)) Object.assign(atual[g], salvo[g]);
} catch {}

const FAIXAS = ['bumbo', 'baixo', 'medio', 'agudo'];
let mapa = [];
const refazerMapa = () => { mapa = FAIXAS.map(k => FAIXAS.indexOf(atual.barras[k])); };
refazerMapa();

const FAIXA_NUM = { som: { piso: [-70, 0], forca: [0, 200] }, tela: { antiBanding: [0, 8] } };
function mudar(grupo, chave, valor) {
  if (FAIXA_NUM[grupo]) {
    const lim = FAIXA_NUM[grupo][chave];
    if (!lim || !Number.isFinite(valor)) return false;
    atual[grupo][chave] = Math.max(lim[0], Math.min(lim[1], valor));
    return true;
  }
  if (grupo === 'outros') {
    if (!(chave in atual.outros) || typeof valor !== 'boolean') return false;
  } else if (!ACEITA[grupo] || !ACEITA[grupo][chave] || !ACEITA[grupo][chave].includes(valor)) return false;
  atual[grupo][chave] = valor;
  return true;
}
const salvar = () => fs.writeFile(ARQ, JSON.stringify(atual, null, 2), () => {});
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST' };

function atender(req, res, p, sendJson) {
  if (p !== '/api/reacoes') return false;
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'GET') { sendJson(res, 200, atual); return true; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'método não aceito' }); return true; }
  let corpo = '';
  req.on('data', d => { corpo += d; if (corpo.length > 2000) req.destroy(); });
  req.on('end', () => {
    let m;
    try { m = JSON.parse(corpo); } catch { return sendJson(res, 400, { error: 'JSON inválido' }); }
    if (m.padrao) atual = PADRAO();
    else if (!mudar(m.grupo, m.chave, m.valor)) return sendJson(res, 400, { error: 'valor inválido' });
    refazerMapa();
    salvar();
    sendJson(res, 200, atual);
  });
  return true;
}

// Para cada faixa da cena (0 bumbo, 1 baixo, 2 médio, 3 agudo): o índice da faixa que manda nela, ou -1 se estiver desligada.
module.exports = { atender, mapaBarras: () => mapa, som: () => atual.som };
