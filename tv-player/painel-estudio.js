// Estúdio do painel do 1º andar: guarda as peças, gera o vídeo e, se pedido, faz o painel seguir o LED da pista.
// O T50 só toca vídeo. Por isso cada peça é desenhada quadro a quadro por um Electron escondido (painel-render.js), com o
// mesmo motor da prévia, e sai no formato dobrado, como em dobrar-painel.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ACERVO = 'C:\\Users\\user\\Desktop\\CLUBE\\08. Sistema\\clube-sistema\\assets';
const FFMPEG = 'C:\\apps\\led-videos\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffmpeg.exe';
const FFMPEG_MOV = 'C:\\Program Files (x86)\\Nova Star\\ViPlex Express\\Bin\\VideoConverter\\ffmpeg.exe'; // o outro não abre QuickTime Animation
const ELECTRON = 'C:\\apps\\radio-saida\\node_modules\\electron\\dist\\electron.exe';
const FPS = 30;

function criarEstudio({ dir, publico, media, porta, lerCenas, visualNoAr, noPainel }) {
  // Põe a cena no ar pelo mesmo comando do app: assim a programação, o startAt e o estado seguem iguais.
  function porNoAr(cena) {
    return new Promise((ok, erro) => {
      const ws = new WebSocket('ws://127.0.0.1:' + porta() + '/ws');
      const tempo = setTimeout(() => { try { ws.terminate(); } catch {} erro(new Error('sem resposta do servidor')); }, 5000);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello-panel' }));
        ws.send(JSON.stringify({ type: 'cena', andar: '1', zona: 'telas:led:1', id: cena }));
        setTimeout(() => { clearTimeout(tempo); ws.close(); ok(); }, 300);
      });
      ws.on('error', e => { clearTimeout(tempo); erro(e); });
    });
  }
  const ARQ = path.join(dir, 'painel-estudio.json');
  const PROXY = path.join(publico, 'painel-estudio', 'proxy');
  const TEMP = path.join(os.tmpdir(), 'painel-estudio');
  const CATALOGO = path.join(publico, 'painel-estudio', 'catalogo-videos.json');
  const CENAS = path.join(publico, 'cenas.json');
  let dados = { pecas: [], seguir: false, mapa: {} };
  try { dados = Object.assign(dados, JSON.parse(fs.readFileSync(ARQ, 'utf8'))); } catch {}
  const gravar = () => { try { fs.writeFileSync(ARQ, JSON.stringify(dados, null, 1)); } catch (e) { console.log('painel-estudio:', e.message); } };

  const limpo = s => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 60);
  const novoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const idCena = id => 'pe-' + id;
  const peca = id => dados.pecas.find(p => p.id === id);

  // ---------- geração ----------
  const fila = []; let atual = null;
  const jobs = new Map();
  function novoJob(p) {
    const job = { id: novoId(), peca: p.id, nome: p.nome, fase: 'na-fila', quadro: 0, total: Math.round(p.comp.duracao * FPS), erro: null, criado: Date.now(), hash: p.hash };
    jobs.set(job.id, job);
    for (const k of jobs.keys()) if (jobs.size > 30) jobs.delete(k);
    fila.push(job);
    proximo();
    return job;
  }
  function ffmpeg(args, exe) {
    return new Promise((ok, erro) => {
      const f = spawn(exe || FFMPEG, ['-y', '-v', 'error', ...args], { windowsHide: true });
      try { os.setPriority(f.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
      let e = ''; f.stderr.on('data', d => { e += d; });
      f.on('error', erro);
      f.on('close', c => (c ? erro(new Error(e.slice(-400))) : ok()));
    });
  }
  function proximo() {
    if (atual || !fila.length) return;
    atual = fila.shift();
    const job = atual;
    job.fase = 'desenhando';
    job.pasta = path.join(TEMP, job.id);
    fs.mkdirSync(job.pasta, { recursive: true });
    const url = `http://127.0.0.1:${porta()}/painel-estudio-render.html?job=${job.id}`;
    let proc;
    try {
      proc = spawn(ELECTRON, [path.join(dir, 'painel-render.js'), url], { windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    } catch (e) { return falhou(job, e); }
    job.proc = proc;
    proc.on('error', e => falhou(job, e));
    proc.on('exit', () => { job.proc = null; if (job.fase === 'desenhando') falhou(job, new Error('o gerador fechou antes de terminar')); });
    clearTimeout(job.tempo);
    job.tempo = setTimeout(() => falhou(job, new Error('tempo esgotado')), Math.max(600000, job.total * 400));
  }
  function falhou(job, e) {
    if (job.fase === 'pronto' || job.fase === 'erro') return;
    job.fase = 'erro'; job.erro = e.message; console.log('painel-estudio:', job.nome, e.message);
    encerrar(job);
  }
  function encerrar(job) {
    clearTimeout(job.tempo);
    if (job.proc) { try { job.proc.kill(); } catch {} job.proc = null; }
    if (job.pasta) { fs.rm(job.pasta, { recursive: true, force: true }, () => {}); job.pasta = null; }
    if (atual === job) { atual = null; setImmediate(proximo); }
  }
  async function montar(job) {
    job.fase = 'codificando';
    const p = peca(job.peca);
    if (!p) throw new Error('a peça foi apagada');
    const id = idCena(p.id), video = 'painel-' + id + '.mp4';
    const entrada = ['-framerate', String(FPS), '-i', path.join(job.pasta, 'q%05d.png')];
    const destino = path.join(media, video), novo = destino + '.novo.mp4';
    await ffmpeg([...entrada, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-g', String(FPS), '-an', '-movflags', '+faststart', novo]);
    fs.renameSync(novo, destino);
    // ícone e prévia, como nas outras cenas do painel: 344x86 do meio da faixa
    const recorte = 'crop=344:86:344:86';
    await ffmpeg([...entrada, '-an', '-vf', recorte, '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(publico, 'cenas', 'painel-' + id + '.mp4')]);
    await ffmpeg(['-i', path.join(job.pasta, 'q' + String(Math.floor(job.total * 0.3)).padStart(5, '0') + '.png'), '-frames:v', '1', '-vf', recorte, path.join(publico, 'cenas', 'painel-' + id + '.png')]);
    // entra na lista de cenas do painel, antes do "Apagar"
    const cenas = JSON.parse(fs.readFileSync(CENAS, 'utf8')).filter(c => c.id !== id);
    const cena = { id, nome: p.nome, video, thumb: 'cenas/painel-' + id + '.png', preview: 'cenas/painel-' + id + '.mp4', duracao: p.comp.duracao, estudio: true };
    const i = cenas.findIndex(c => c.apagar);
    cenas.splice(i < 0 ? cenas.length : i, 0, cena);
    fs.writeFileSync(CENAS, JSON.stringify(cenas, null, 2));
    p.gerado = { hash: job.hash, em: Date.now(), cena: id };
    gravar();
    job.fase = 'pronto'; job.cena = id;
    encerrar(job);
  }
  function tudoProntoParaSeguir() { return dados.pecas.filter(p => p.gerado && (p.comp.led || []).length).length; }

  // ---------- vídeos da marca em versão leve ----------
  let catalogo = [];
  try { catalogo = JSON.parse(fs.readFileSync(CATALOGO, 'utf8')); } catch {}
  const convertendo = new Map();
  function proxyDe(id) {
    const v = catalogo.find(x => x.id === id);
    if (!v) return Promise.reject(new Error('vídeo desconhecido'));
    const nome = limpo(id) + '.mp4', arq = path.join(PROXY, nome), url = 'painel-estudio/proxy/' + nome;
    if (fs.existsSync(arq)) return Promise.resolve(url);
    if (convertendo.has(id)) return convertendo.get(id);
    fs.mkdirSync(PROXY, { recursive: true });
    const fonte = path.join(ACERVO, ...v.arq.split('/'));
    // figuras: o quadrado do meio, onde a figura gira; logos: o quadro inteiro, porque são largos
    const lado = Math.min(v.w, v.h);
    const filtro = v.grupo === 'instancia' ? `crop=${lado}:${lado},scale=480:480` : 'scale=-2:360';
    const tmp = arq + '.tmp.mp4';
    const p = ffmpeg(['-i', fonte, '-an', '-vf', filtro, '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', '-g', '10', '-bf', '0', '-movflags', '+faststart', tmp], v.qt ? FFMPEG_MOV : FFMPEG)
      .then(() => { fs.renameSync(tmp, arq); return url; })
      .finally(() => convertendo.delete(id));
    convertendo.set(id, p);
    return p;
  }

  // ---------- painel segue o LED ----------
  // Só age com a chave ligada, depois que o visual ficou 6 s parado. Nunca volta atrás se a cena for a mesma.
  let ultimoVisto = null, vistoEm = 0, aplicado = null, relogioSeguir = null;
  function cenaDoVisual(v) {
    if (!v) return null;
    if (dados.mapa && dados.mapa[v]) return dados.mapa[v];
    // a peça mais recente que responde a esse visual e já virou vídeo
    const achada = dados.pecas.filter(p => p.gerado && (p.comp.led || []).includes(v)).sort((a, b) => (b.mudou || 0) - (a.mudou || 0))[0];
    if (achada) return achada.gerado.cena;
    if (/^a-|^derrete$|^brinquedos$|^ondas$/.test(v)) return 'akin-letreiro'; // cartaz da festa: o letreiro do Akin
    return null;
  }
  async function vigiar() {
    if (!dados.seguir) return;
    let v = null;
    try { v = await visualNoAr(); } catch { return; }
    if (!v) return;
    if (v !== ultimoVisto) { ultimoVisto = v; vistoEm = Date.now(); return; }
    if (Date.now() - vistoEm < 6000 || aplicado === v) return;
    aplicado = v;
    const cena = cenaDoVisual(v);
    if (!cena || !lerCenas().some(c => c.id === cena) || noPainel() === cena) return;
    console.log('painel-estudio: LED em', v, '→ painel em', cena);
    porNoAr(cena).catch(e => console.log('painel-estudio:', e.message));
  }
  function ligarSeguir() {
    clearInterval(relogioSeguir); relogioSeguir = null;
    if (dados.seguir) { aplicado = null; relogioSeguir = setInterval(vigiar, 2000); }
  }
  ligarSeguir();

  // ---------- rotas ----------
  function corpo(req, limite = 3e6) {
    return new Promise((ok, erro) => {
      let n = 0; const partes = [];
      req.on('data', d => { n += d.length; if (n > limite) { erro(new Error('grande demais')); req.destroy(); } else partes.push(d); });
      req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch (e) { erro(e); } });
      req.on('error', erro);
    });
  }
  const resumo = p => ({ id: p.id, nome: p.nome, comp: p.comp, capitulo: p.capitulo || null, gerado: p.gerado || null, hash: p.hash, mudou: p.mudou });
  function estado() {
    return { pecas: dados.pecas.map(resumo), seguir: !!dados.seguir, mapa: dados.mapa || {}, noPainel: noPainel(),
      job: atual ? publico_(atual) : null, fila: fila.map(publico_), prontasParaSeguir: tudoProntoParaSeguir() };
  }
  const publico_ = j => ({ id: j.id, peca: j.peca, nome: j.nome, fase: j.fase, quadro: j.quadro, total: j.total, erro: j.erro, cena: j.cena || null });
  const hashDe = comp => { let h = 2166136261; const s = JSON.stringify(comp); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  function salvar(b) {
    const comp = b.comp;
    if (!comp || !Array.isArray(comp.camadas) || comp.camadas.length > 40) throw new Error('peça inválida');
    comp.duracao = Math.max(4, Math.min(600, Math.round(+comp.duracao || 30)));
    let p = b.id && peca(b.id);
    if (!p) { p = { id: b.id && limpo(b.id) || novoId() }; dados.pecas.push(p); }
    p.nome = String(b.nome || 'Peça sem nome').slice(0, 60);
    if (b.capitulo !== undefined) p.capitulo = b.capitulo ? limpo(b.capitulo) : null;
    p.comp = comp; p.hash = hashDe(comp); p.mudou = Date.now();
    gravar();
    return p;
  }

  function atender(req, res, p, url, sendJson) {
    if (!p.startsWith('/api/painel-estudio')) return false;
    const erro = (c, e) => sendJson(res, c, { error: e.message || String(e) });
    const sub = p.slice('/api/painel-estudio'.length);
    if (sub === '' && req.method === 'GET') { sendJson(res, 200, estado()); return true; }
    if (sub === '/pecas' && req.method === 'POST') {
      corpo(req).then(b => { const x = salvar(b); sendJson(res, 200, resumo(x)); }).catch(e => erro(400, e));
      return true;
    }
    if (sub.startsWith('/pecas/') && req.method === 'DELETE') {
      const id = limpo(sub.slice(7));
      const x = peca(id);
      if (x) {
        dados.pecas = dados.pecas.filter(q => q !== x); gravar();
        // a cena sai da lista; o vídeo só é apagado se não estiver no ar
        const cena = idCena(id);
        if (noPainel() !== cena) {
          try {
            const cenas = JSON.parse(fs.readFileSync(CENAS, 'utf8')).filter(c => c.id !== cena);
            fs.writeFileSync(CENAS, JSON.stringify(cenas, null, 2));
            for (const f of [path.join(media, 'painel-' + cena + '.mp4'), path.join(publico, 'cenas', 'painel-' + cena + '.mp4'), path.join(publico, 'cenas', 'painel-' + cena + '.png')]) fs.unlink(f, () => {});
          } catch {}
        }
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (sub === '/gerar' && req.method === 'POST') {
      corpo(req).then(b => {
        const x = b.comp ? salvar(b) : peca(limpo(b.id));
        if (!x) throw new Error('peça não encontrada');
        const repetido = [atual, ...fila].find(j => j && j.peca === x.id && j.hash === x.hash);
        const j = repetido || novoJob(x);
        sendJson(res, 200, { job: publico_(j), peca: resumo(x) });
      }).catch(e => erro(400, e));
      return true;
    }
    if (sub.startsWith('/job/') && req.method === 'GET') {
      const parte = sub.slice(5).split('/'), j = jobs.get(limpo(parte[0]));
      if (!j) { erro(404, new Error('não encontrei')); return true; }
      if (parte[1] === 'comp') { const x = peca(j.peca); sendJson(res, x ? 200 : 404, x ? { comp: x.comp, total: j.total, fps: FPS } : { error: 'apagada' }); return true; }
      sendJson(res, 200, publico_(j));
      return true;
    }
    if (sub === '/quadro' && req.method === 'POST') { // só o gerador, nesta máquina
      const ip = req.socket.remoteAddress || '';
      const j = jobs.get(limpo(url.searchParams.get('job'))), n = parseInt(url.searchParams.get('n'), 10);
      if (!/127\.0\.0\.1|::1/.test(ip) || !j || !j.pasta || !(n >= 0)) { erro(403, new Error('não')); return true; }
      const out = fs.createWriteStream(path.join(j.pasta, 'q' + String(n).padStart(5, '0') + '.png'));
      req.pipe(out);
      out.on('finish', () => { j.quadro = Math.max(j.quadro, n + 1); sendJson(res, 200, { ok: true }); });
      out.on('error', e => erro(500, e));
      return true;
    }
    if (sub === '/fim' && req.method === 'POST') {
      const j = jobs.get(limpo(url.searchParams.get('job')));
      if (!j) { erro(404, new Error('não encontrei')); return true; }
      corpo(req).then(b => {
        if (b.erro) { falhou(j, new Error(b.erro)); return sendJson(res, 200, { ok: true }); }
        sendJson(res, 200, { ok: true });
        montar(j).catch(e => falhou(j, e));
      }).catch(e => erro(400, e));
      return true;
    }
    if (sub === '/por-no-ar' && req.method === 'POST') {
      corpo(req).then(b => {
        const cena = limpo(b.cena) || (peca(limpo(b.id)) && peca(limpo(b.id)).gerado && peca(limpo(b.id)).gerado.cena);
        if (!cena || !lerCenas().some(c => c.id === cena)) throw new Error('ainda não há vídeo dessa peça');
        return porNoAr(cena).then(() => sendJson(res, 200, { ok: true, cena }));
      }).catch(e => erro(400, e));
      return true;
    }
    if (sub === '/seguir' && req.method === 'POST') {
      corpo(req).then(b => {
        if (typeof b.ligado === 'boolean') { dados.seguir = b.ligado; gravar(); ligarSeguir(); }
        sendJson(res, 200, { seguir: !!dados.seguir });
      }).catch(e => erro(400, e));
      return true;
    }
    if (sub === '/proxy' && req.method === 'GET') {
      proxyDe(url.searchParams.get('id')).then(u => sendJson(res, 200, { url: u })).catch(e => erro(500, e));
      return true;
    }
    erro(404, new Error('rota desconhecida'));
    return true;
  }
  return { atender };
}

module.exports = { criarEstudio };
