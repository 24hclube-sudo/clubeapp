"""Acrescenta a Regência (ouvido, diretor, camada de cor, cenas) na saída do LED, por trecho, sem copiar o arquivo inteiro: outras sessões publicam nos mesmos arquivos.
Uso: python aplicar-saida.py <pasta da saída> <pasta do js com reacoes.js>
Só altera main.js, flash-pagina.js e reacoes.js da pasta dada. Não reinicia nada.
"""
import sys
import pathlib

pasta = pathlib.Path(sys.argv[1])
pasta_js = pathlib.Path(sys.argv[2])


def carregar(p):
    return p.read_text(encoding='utf8')


m = carregar(pasta / 'main.js')
if 'criarDiretor' in m:
    sys.exit('main.js já tem a Regência')


def rep(a, b):
    global m
    assert m.count(a) >= 1, 'não achei: ' + a[:90]
    m = m.replace(a, b, 1)


# cenas novas
rep("const VISUAIS = {\n", """const VISUAIS = {
  'r-feixes': 'regencia/?modo=feixes',
  'r-astrolabio': 'regencia/?modo=astrolabio',
  'r-mercurio': 'regencia/?modo=mercurio',
  'r-micelio': 'regencia/?modo=micelio',
  'r-enxame': 'regencia/?modo=enxame',
""")

# estado da regência
rep("const ARQ_LOG = path.join(__dirname, 'saida.log');", """// ---------- Regência: o ouvido da faixa, o diretor automático e a camada de cor. Ver visual-pista\\regencia\\LEIA-ME.md ----------
const { criarDiretor } = require(path.join(PASTA_VISUAL, 'regencia', 'diretor.cjs'));
const ARQ_COR = path.join(__dirname, 'cor-camada.json');
let corCamada = { ligada: false, cor: 'ff0040', cor2: '0040ff', modo: 'tingir', forca: 100, auto: 'fixa', giro: 6, tom: '' };
try { corCamada = { ...corCamada, ...JSON.parse(fs.readFileSync(ARQ_COR, 'utf8')) }; } catch {}
const guardarCor = () => { try { fs.writeFileSync(ARQ_COR, JSON.stringify(corCamada)); } catch {} };
const nasPaginas = js => { for (const w of [janela, janelaNova]) if (w && !w.isDestroyed()) w.webContents.executeJavaScript(js).catch(() => {}); };
const mandarCor = () => nasPaginas(`window.__corComando && window.__corComando(${JSON.stringify(corCamada)})`);
function mudarCor(q) {
  if (q.has('ligada')) corCamada.ligada = q.get('ligada') === '1';
  for (const k of ['cor', 'cor2']) if (/^[0-9a-f]{6}$/i.test(q.get(k) || '')) corCamada[k] = q.get(k).toLowerCase();
  if (['tingir', 'filtro', 'suave', 'duas'].includes(q.get('modo'))) corCamada.modo = q.get('modo');
  if (['fixa', 'faixa', 'gira'].includes(q.get('auto'))) corCamada.auto = q.get('auto');
  const num = (k, a, b) => { if (q.has(k) && Number.isFinite(+q.get(k))) corCamada[k] = Math.max(a, Math.min(b, +q.get(k))); };
  num('forca', 0, 100); num('giro', 1, 60);
  guardarCor();
  mandarCor();
}
let autoLed = null;
const mandarElementos = () => nasPaginas(`window.__autoLed && window.__autoLed(${JSON.stringify(autoLed)})`);
let janelaOuvido = null;
function abrirOuvido() {
  const url = `http://127.0.0.1:${config.porta}/regencia/ouvido.html?audio=${encodeURIComponent(config.audio)}`;
  const w = janelaOuvido = new BrowserWindow({ width: 320, height: 200, show: false, frame: false, webPreferences: { backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  w.webContents.on('console-message', ev => { if (ev.level === 'error') log(`ouvido: ${ev.message}`); });
  w.webContents.on('did-fail-load', () => { setTimeout(() => !w.isDestroyed() && w.loadURL(url), 5000); });
  w.webContents.on('render-process-gone', (_e, d) => { log(`ouvido caiu (${d.reason}); abrindo de novo`); setTimeout(() => !w.isDestroyed() && w.loadURL(url), 2000); });
  w.loadURL(url);
}
let diretor = null;
function criarODiretor() {
  diretor = criarDiretor({
    pasta: __dirname, visuais: VISUAIS, log,
    jaNoAr: () => visualAtual,
    carregando: () => !!visualNovo && !(corte && corte.segurar),
    trocar: (id, em, segurar) => trocarVisual(id, em, segurar),
    aoElementos: pedido => { autoLed = pedido; mandarElementos(); },
    aoFumaca: () => {
      anotarFumaca('liga');
      nasPaginas(`window.__luzShow && window.__luzShow.comando('liga', ['fumaca'])`);
      setTimeout(() => { anotarFumaca('solta'); nasPaginas(`window.__luzShow && window.__luzShow.comando('solta', ['fumaca'])`); }, 2200);
    },
  });
}

const ARQ_LOG = path.join(__dirname, 'saida.log');""")

# rotas
rep("      if (url.pathname === '/led' && req.method === 'POST') {", """      if (url.pathname === '/diretor/analise' && req.method === 'POST') {
        let corpo = '';
        req.setEncoding('utf8');
        req.on('data', d => { corpo += d; });
        req.on('end', () => {
          res.writeHead(204, CORS); res.end();
          try {
            const p = JSON.parse(corpo);
            if (p.foto && diretor) {
              diretor.aoFoto(p.foto, p.entrada);
              if (p.foto.tom && p.foto.tom !== corCamada.tom) { corCamada.tom = p.foto.tom; mandarCor(); }
            }
            if (p.evento && diretor) diretor.aoEvento(p.evento);
          } catch {}
        });
        return;
      }
      if (url.pathname === '/diretor') {
        if (req.method === 'POST') {
          const q = url.searchParams, novo = {};
          for (const k of ['elementos', 'cenas', 'fumaca']) if (q.has(k)) novo[k] = q.get(k) === '1';
          if (['musica', 'secao', 'frase'].includes(q.get('frequencia'))) novo.frequencia = q.get('frequencia');
          if (q.has('grupos')) novo.grupos = q.get('grupos').split(',').filter(Boolean);
          diretor.ajustar(novo);
        }
        return responderJson(res, diretor.estado());
      }
      if (url.pathname === '/cor') {
        if (req.method === 'POST') mudarCor(url.searchParams);
        return responderJson(res, corCamada);
      }
      if (url.pathname === '/led' && req.method === 'POST') {""")
rep("if (v && (v !== visualAtual || visualNovo)) trocarVisual(v);", "if (v) diretor.manual();\n            if (v && (v !== visualAtual || visualNovo)) trocarVisual(v);")

# arquivos servem também para o gerador, que está em outra origem
rep("res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });",
    "res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });")

# página nova já nasce com a cor e os elementos que estão valendo
rep("w.webContents.executeJavaScript(`window.__fumacaPassado = ${JSON.stringify(fumacaRecente.filter(i => Date.now() - i[1] < 30000))};\\n` + FLASH_PAGINA)",
    "w.webContents.executeJavaScript(`window.__portaSaida = ${config.porta}; window.__corCamada = ${JSON.stringify(corCamada)}; window.__autoLedValores = ${JSON.stringify(autoLed)}; window.__fumacaPassado = ${JSON.stringify(fumacaRecente.filter(i => Date.now() - i[1] < 30000))};\\n` + FLASH_PAGINA)")

# troca: com hora marcada, ou segurando pronta até o drop
a = m.index("// Troca sem tela preta: o próximo visual carrega numa segunda janela")
b = m.index("function montarBandeja() {")
m = m[:a] + """// Troca sem tela preta: o próximo visual carrega numa segunda janela e só entra no Spout quando já está desenhando.
// em: hora marcada (o diretor marca o tempo 1). segurar: fica pronta por trás, em ritmo baixo, até alguém mandar cortar. id null: solta a que está segura.
let corte = null;
function trocarVisual(id, em = 0, segurar = false) {
  if (id === null) {
    if (janelaNova && !janelaNova.isDestroyed() && corte && corte.segurar) { janelaNova.destroy(); janelaNova = null; visualNovo = null; corte = null; }
    return;
  }
  // já está carregando esta: só muda a hora do corte
  if (id === visualNovo && janelaNova && !janelaNova.isDestroyed() && corte) { corte.em = em; corte.segurar = segurar; return; }
  if (janelaNova && !janelaNova.isDestroyed()) janelaNova.destroy();
  const w = janelaNova = criarJanela(endereco(id));
  visualNovo = id;
  corte = { em, segurar, ate: segurar ? em : 0 };
  const inicio = Date.now();
  log(`carregando: ${id}`);
  let prontaEm = 0;
  const entrar = () => {
    if (w !== janelaNova || w.isDestroyed()) return;
    const velha = janela;
    w.webContents.setFrameRate(config.fps);
    janela = w; janelaNova = null; visualAtual = id; visualNovo = null; corte = null;
    try { fs.writeFileSync(ARQ_ULTIMO, id); } catch {}
    log(`no ar: ${id} (${Date.now() - inicio} ms depois de pedir)`);
    // espera a última textura da janela velha voltar antes de fechar
    setTimeout(() => { if (velha && !velha.isDestroyed()) velha.destroy(); }, 400);
  };
  const aguardar = () => {
    if (w !== janelaNova || w.isDestroyed() || !corte) return;
    const agora = Date.now();
    if (corte.segurar) {
      // o drop não veio a tempo: desiste e libera a placa
      if (agora > corte.ate) { log(`${id} ficou pronta e o drop não veio; soltando`); w.destroy(); janelaNova = null; visualNovo = null; corte = null; if (diretor) diretor.soltou(); return; }
      setTimeout(aguardar, 8);
      return;
    }
    // meio segundo desenhando antes de entrar, a não ser que já esteja pronta há tempo
    const quando = Math.max(prontaEm + 200, corte.em);
    if (agora >= quando) return entrar();
    setTimeout(aguardar, Math.min(Math.max(quando - agora - 4, 1), 50));
  };
  const conferir = async () => {
    if (w !== janelaNova || w.isDestroyed()) return;
    let pronto = false;
    try { pronto = await w.webContents.executeJavaScript('!!(window.__estado || window.__painel)'); } catch {}
    if (w !== janelaNova || w.isDestroyed()) return;
    if (pronto) {
      prontaEm = Date.now();
      if (corte && corte.segurar) w.webContents.setFrameRate(15);
      aguardar();
      return;
    }
    if (Date.now() - inicio > 25000) {
      log(`${id} não ficou pronto em 25 s; continua o anterior`);
      if (!w.isDestroyed()) w.destroy();
      janelaNova = null; visualNovo = null; corte = null;
      return;
    }
    setTimeout(conferir, 150);
  };
  setTimeout(conferir, 300);
}
""" + m[b:]

# partida
rep("  iniciarPython();\n  abrirVisual();\n", "  iniciarPython();\n  criarODiretor();\n  abrirVisual();\n  abrirOuvido();\n")
(pasta / 'main.js').write_text(m, encoding='utf8')

# ---------- flash-pagina.js ----------
f = carregar(pasta / 'flash-pagina.js')
a = "  // fumaça virtual: nasce embaixo do booth e sobe. Ver fumaca\\camada.js\n"
assert a in f
f = f.replace(a, """  // Os elementos que o diretor automático pede agora. Valem por cima do que está no app, sem gravar nada: desligou, volta o que está lá.
  window.__autoLed = v => { window.__autoLedValores = v; if (v && window.__REACOES) Object.assign(window.__REACOES.led, v); };
  // camada de cor por cima de tudo. Endereço inteiro: as cenas do gerador moram em outra origem. Ver regencia\\cor.js
  import('http://127.0.0.1:' + (window.__portaSaida || 5212) + '/regencia/cor.js').catch(e => console.error('cor: ' + e.message));
""" + a, 1)
(pasta / 'flash-pagina.js').write_text(f, encoding='utf8')

# ---------- js/reacoes.js ----------
r = carregar(pasta_js / 'reacoes.js')
a = "Object.assign(REACOES.led, j.led);"
assert a in r
r = r.replace(a, "Object.assign(REACOES.led, j.led, window.__autoLedValores);", 1)
a = "function buscar() {"
assert a in r
r = r.replace(a, "window.__REACOES = REACOES;   // o diretor automático acerta os elementos na hora, sem esperar a próxima pergunta\nfunction buscar() {", 1)
(pasta_js / 'reacoes.js').write_text(r, encoding='utf8')
print('aplicado em', pasta)
