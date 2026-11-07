// Criações das fitas: guarda, troca e apaga os modelos feitos no Estúdio (public/estudio.html).
// Os modelos ficam em public/animacoes-barras.json ou animacoes-balcoes.json, categoria "audio", grupo "minhas", como qualquer outra cena.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const receita = require('./efeitos-criador');

const ID = /^m-[a-z0-9]{4,24}$/;
const SENTIDOS = ['centro', 'fecha', 'direita', 'esquerda', 'blocos'];
const COR = /^#[0-9a-fA-F]{6}$/;
const numero = (v, min, max, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao; };
const cor = (v, padrao) => (typeof v === 'string' && COR.test(v) ? v.toLowerCase() : padrao);
function paleta(v) {
  if (Array.isArray(v)) {
    const l = v.filter(x => typeof x === 'string' && COR.test(x)).slice(0, 5).map(x => x.toLowerCase());
    return l.length >= 2 ? l : null;
  }
  return typeof v === 'string' && receita.PALETAS[v] ? v : null;
}
// Parâmetros de uma camada: só valores simples, com nomes e tamanhos curtos.
function parametros(p) {
  const saida = {};
  if (!p || typeof p !== 'object') return saida;
  for (const [k, v] of Object.entries(p).slice(0, 24)) {
    if (!/^[a-zA-Z]{1,16}$/.test(k) || k === 'efeito') continue;
    if (typeof v === 'number' && Number.isFinite(v)) saida[k] = v;
    else if (typeof v === 'boolean') saida[k] = v;
    else if (typeof v === 'string' && v.length <= 40) saida[k] = v;
    else if (Array.isArray(v) && v.length <= 12 && v.every(x => typeof x === 'string' && x.length <= 32)) saida[k] = v;
  }
  return saida;
}

// Devolve a composição só com o que o motor aceita, ou null se não der para usar.
function limpar(b, temEfeito) {
  if (!b || typeof b !== 'object' || !Array.isArray(b.camadas)) return null;
  const f = b.fundo || {};
  const fundo = {
    tipo: receita.FUNDOS[f.tipo] ? f.tipo : 'preto', c1: cor(f.c1, '#ff7a1a'), c2: cor(f.c2, '#000000'),
    paleta: paleta(f.paleta) || undefined, k: numero(f.k, 0, 1, 0.3), duck: f.duck !== false,
  };
  const camadas = [];
  for (const c of b.camadas.slice(0, 20)) {
    if (camadas.length >= 5) break;
    if (!c || typeof c.efeito !== 'string' || !/^[a-zA-Z]{1,32}$/.test(c.efeito) || c.efeito === 'composicao' || c.efeito === 'video' || !temEfeito(c.efeito)) continue;
    camadas.push({
      efeito: c.efeito, nome: String(c.nome || '').slice(0, 40), cena: String(c.cena || '').slice(0, 40), p: parametros(c.p),
      duracao: numero(c.duracao, 0.5, 300, 8), batidas: c.batidas ? numero(c.batidas, 1, 64, 4) : undefined,
      mistura: receita.MISTURAS[c.mistura] ? c.mistura : 'cima', opacidade: numero(c.opacidade, 0, 1, 1),
      paleta: paleta(c.paleta) || undefined, duck: !!c.duck, virar: !!c.virar, espelhar: !!c.espelhar, oculta: !!c.oculta, nativa: !!c.nativa,
    });
  }
  const d = b.duck || {};
  const duck = {
    ligado: !!d.ligado, fonte: Math.round(numero(d.fonte, 0, 4, 0)), modo: d.modo === 'nivel' ? 'nivel' : 'golpe',
    quantidade: numero(d.quantidade, 0, 1, 0.7), soltura: numero(d.soltura, 0.03, 2, 0.25), limiar: numero(d.limiar, 0, 1, 0.4), inverso: !!d.inverso,
  };
  const brilhos = [];
  for (const br of Array.isArray(b.brilhos) ? b.brilhos.slice(0, 12) : []) {
    if (!br || !receita.BRILHOS[br.tipo] || brilhos.length >= 5 || brilhos.some(x => x.tipo === br.tipo)) continue;
    brilhos.push({ tipo: br.tipo, fonte: Math.round(numero(br.fonte, 0, 3, receita.BRILHOS[br.tipo].fonte)), forca: numero(br.forca, 0, 1, 0.85), qtd: numero(br.qtd, 0, 1, 0.5), cor: cor(br.cor, '#ffffff') });
  }
  return { efeito: 'composicao', sentido: SENTIDOS.includes(b.sentido) ? b.sentido : undefined, fundo, camadas, duck, brilhos, paletaPropria: paleta(b.paletaPropria) && Array.isArray(b.paletaPropria) ? paleta(b.paletaPropria) : undefined };
}

function criarCriacoes({ dir, publico, temEfeito, avisar, noAr }) {
  const ARQS = { barras: path.join(publico, 'animacoes-barras.json'), balcoes: path.join(publico, 'animacoes-balcoes.json') };
  const ler = (qual = 'barras') => JSON.parse(fs.readFileSync(ARQS[qual], 'utf8'));
  function gravar(lista, qual = 'barras') {
    const tmp = `${ARQS[qual]}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
    fs.renameSync(tmp, ARQS[qual]);
  }

  // Miniaturas uma de cada vez, fora do processo que manda as fitas.
  let fila = [];
  let gerando = false;
  const tirarArquivos = id => { for (const ext of ['png', 'mp4']) fs.rm(path.join(publico, 'cenas', `anim-${id}.${ext}`), { force: true }, () => {}); };
  function proximaMiniatura() {
    if (gerando || !fila.length) return;
    gerando = true;
    const { id, qual } = fila.shift();
    const filho = spawn(process.execPath, [path.join(dir, 'gerar-previas-fitas.js')], {
      cwd: dir, windowsHide: true, stdio: 'ignore', env: { ...process.env, PREVIA_ID: id, PREVIA_LISTA: qual, FORCAR: '1' },
    });
    const fim = () => {
      gerando = false;
      // Apagado enquanto a miniatura era feita: ela não pode ficar para trás.
      try { if (!ler(qual).some(c => c.id === id)) tirarArquivos(id); } catch {}
      avisar();
      proximaMiniatura();
    };
    filho.on('exit', fim);
    filho.on('error', fim);
  }

  function lerCorpo(req) {
    return new Promise((ok, erro) => {
      let t = '';
      req.setEncoding('utf8');
      req.on('data', d => { t += d; if (t.length > 24000) { erro(new Error('grande demais')); req.destroy(); } });
      req.on('end', () => { try { ok(JSON.parse(t)); } catch { erro(new Error('JSON inválido')); } });
      req.on('error', erro);
    });
  }

  function atender(req, res, p, sendJson) {
    if (!p.startsWith('/api/criacoes')) return false;
    if (p === '/api/criacoes/catalogo' && req.method === 'GET') {
      const paletas = {};
      for (const [k, v] of Object.entries(receita.PALETAS)) paletas[k] = { nome: v.nome, cores: v.c };
      const brilhos = {};
      for (const [k, v] of Object.entries(receita.BRILHOS)) brilhos[k] = { nome: v.nome, fonte: v.fonte };
      sendJson(res, 200, { paletas, misturas: receita.MISTURAS, fundos: receita.FUNDOS, brilhos });
      return true;
    }
    // A composição que está nas barras, para outro aparelho continuar dela.
    if (p === '/api/criacoes/no-ar' && req.method === 'GET') {
      sendJson(res, 200, noAr ? noAr(new URL(req.url, 'http://x').searchParams.get('z')) : {});
      return true;
    }
    if (p === '/api/criacoes' && req.method === 'POST') {
      lerCorpo(req).then(m => {
        const nome = String(m.nome || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!nome) return sendJson(res, 400, { erro: 'Dê um nome para o modelo' });
        const balcao = limpar(m.balcao, temEfeito);
        if (!balcao) return sendJson(res, 400, { erro: 'Essa criação não dá para salvar' });
        if (!balcao.camadas.length && balcao.fundo.tipo === 'preto') return sendJson(res, 400, { erro: 'Ponha pelo menos uma camada ou um fundo' });
        const qual = m.lista === 'balcoes' ? 'balcoes' : 'barras';
        const lista = ler(qual);
        const v = Date.now().toString(36);
        const antiga = ID.test(String(m.id)) ? lista.findIndex(c => c.id === m.id && c.criada) : -1;
        const id = antiga >= 0 ? m.id : 'm-' + v;
        const item = {
          id, nome, duracao: 8, balcao, categoria: 'audio', grupo: 'minhas', criada: true,
          thumb: `cenas/anim-${id}.png?v=${v}`, preview: `cenas/anim-${id}.mp4?v=${v}`,
        };
        const iApagar = qual === 'balcoes' ? lista.findIndex(c => c.apagar) : -1; // "apagar" fica sempre por último nos balcões
        if (antiga >= 0) lista[antiga] = item; else if (iApagar >= 0) lista.splice(iApagar, 0, item); else lista.push(item);
        gravar(lista, qual);
        if (!fila.some(f => f.id === id)) fila.push({ id, qual });
        proximaMiniatura();
        avisar();
        sendJson(res, 200, { ok: true, id, nome });
      }).catch(e => sendJson(res, 400, { erro: e.message }));
      return true;
    }
    const apagar = /^\/api\/criacoes\/(m-[a-z0-9]{4,24})$/.exec(p);
    if (apagar && req.method === 'DELETE') {
      const qual = ['barras', 'balcoes'].find(q => ler(q).some(c => c.id === apagar[1] && c.criada));
      if (!qual) { sendJson(res, 404, { erro: 'Esse modelo não existe' }); return true; }
      gravar(ler(qual).filter(c => !(c.id === apagar[1] && c.criada)), qual);
      fila = fila.filter(f => f.id !== apagar[1]);
      tirarArquivos(apagar[1]);
      avisar();
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 404, { erro: 'Rota não existe' });
    return true;
  }

  return { atender, limpar: b => limpar(b, temEfeito) };
}

module.exports = { criarCriacoes };
