// Instala a programação circadiana num tv-player: copia os arquivos novos e faz as ligações nos
// arquivos que já existem. Tudo ou nada: se um ponto de encaixe não for achado, não grava nada.
// Pode rodar de novo: o que já está aplicado é pulado (por exemplo, se outra sessão publicar por cima).
//
//   node programacao-instalar.js <pasta do tv-player> [--conferir]
const fs = require('fs');
const path = require('path');

const destino = path.resolve(process.argv[2] || '.');
const soConferir = process.argv.includes('--conferir');
const NOVOS = ['programacao.js', 'programacao-instalar.js', 'programacao-anuncio-millos.js', 'public/ambiente.js', 'public/programacao-player.js',
  'public/programacao-app.js', 'public/programacao.css', 'public/fonts/Archivo-Medium.ttf'];

// [âncora (uma linha, tem que aparecer uma vez só), texto novo, marca que indica "já aplicado"]
const antes = (ancora, novo) => ({ ancora, troca: novo + '\n' + ancora, marca: novo.trim().split('\n')[0].trim() });
const depois = (ancora, novo) => ({ ancora, troca: ancora + '\n' + novo, marca: novo.trim().split('\n')[0].trim() });
const trocar = (ancora, novo, marca) => ({ ancora, troca: novo, marca: marca || novo.trim().split('\n')[0].trim() });

const LIGACOES = {
  'server.js': [
    depois("const { criarBalcao, INSTALACOES, VIDEOS_DIR, esquecerVideo } = require('./balcao');", "const { criarProgramacao } = require('./programacao');"),
    antes('  return [...arqs].map(srcDeMidia).filter(Boolean);', "  if (g === 'telas') prog.arquivosAnuncios().forEach(a => arqs.add(a)); // anúncios já baixados nas TVs"),
    antes("  if (p === '/api/media' && req.method === 'GET') return sendJson(res, 200, listMedia());", '  if (prog.atenderHttp(req, res, url, p)) return; // anúncios da programação'),
    trocar("  try { m = fs.statSync(path.join(PUBLIC_DIR, 'celular.html')).mtimeMs; } catch {}",
      "  for (const arq of ['celular.html', 'programacao-app.js', 'programacao.css', 'ambiente.js']) {\n    try { m = Math.max(m, fs.statSync(path.join(PUBLIC_DIR, arq)).mtimeMs); } catch {}\n  }"),
    trocar('    return { ...z, ...resto };', '    return { ...z, ...resto, prog: prog.daZona(z.id) };'),
    antes('const balcao = criarBalcao({', `// ---------- programação circadiana (programacao.js) ----------
// É uma camada: enquanto uma zona a segue, o conteúdo manual dela fica guardado em state, sem mexer.
const zonaDaTela = id => \`telas:\${grupoDe(id)}:\${andarDe(id)}\`;
function conteudoEfetivo(id) { return prog.segue(zonaDaTela(id)) ? prog.conteudo(id) : state.tvs[id].content; }
const prog = criarProgramacao({
  zonaDaTela,
  telasDaZona: zid => telasDaZona(zid).sort((a, b) => (state.tvs[a].name || a).localeCompare(state.tvs[b].name || b, 'pt', { numeric: true })),
  enviarTela: (id, msg) => sendTela(id, msg),
  aoMudarConteudo: () => {
    // o player ignora conteúdo igual ao que já está na tela, então reenviar não reinicia nada
    for (const id of Object.keys(state.tvs)) {
      if (prog.ZONAS.some(z => z.id === zonaDaTela(id))) sendTela(id, { type: 'content', content: conteudoEfetivo(id) });
    }
  },
  aoMudarEstado: () => pushEstado(),
  aoMudarArquivos: () => Object.keys(state.tvs).forEach(enviarPreBaixar),
  publicar: msg => broadcastPanels(msg),
  srcDeMidia, ffmpeg, sendJson, MEDIA_DIR, PUBLIC_DIR,
  lerDuracao: arq => new Promise(ok => exec(FFMPEG, ['-hide_banner', '-i', arq], { windowsHide: true }, (_e, _o, se) => {
    const m = /Duration: (\\d+):(\\d+):([\\d.]+)/.exec(se || '');
    ok(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null);
  })),
});
`),
    trocar("  estado: instalacao => zona('fita:' + instalacao),", `  estado: instalacao => {
    try { const p = prog.estadoFita(instalacao, Date.now()); if (p) return p; } catch (e) { console.log('programação (fitas):', e.message); }
    return zona('fita:' + instalacao);
  },`),
    trocar('  for (const id of ids) zona(`telas:${grupoDe(id)}:${andarDe(id)}`).cena = null;',
      '  for (const id of ids) { zona(`telas:${grupoDe(id)}:${andarDe(id)}`).cena = null; prog.assumirManual(`telas:${grupoDe(id)}:${andarDe(id)}`); }'),
    trocar("      if (state.tvs[id].content) send(ws, { type: 'content', content: state.tvs[id].content });",
      "      const conteudoInicial = conteudoEfetivo(id);\n      if (conteudoInicial) send(ws, { type: 'content', content: conteudoInicial });\n      const anuncioNoAr = prog.anuncioPara(id);\n      if (anuncioNoAr) send(ws, anuncioNoAr);"),
    depois("      send(ws, { type: 'tvs', tvs: tvList() });", '      send(ws, prog.publico());'),
    antes('    // Cena: cada tela recebe a sua versão (painel = faixa, TV = vertical) e cada fita o seu', `    // Programação circadiana: comandos da tela Programação do app.
    if (m.type === 'prog') { try { prog.comando(m); } catch (e) { console.log('programação:', e.message); } return; }
    // Escolher cena, cor ou logo numa zona tira só ela da programação (até o horário de retorno).
    if (['cena', 'logo', 'balcao-cor'].includes(m.type)) for (const zid of zonasDoComando()) prog.assumirManual(zid);
`),
  ],
  'balcao.js': [
    depois('  if (!ativo) return { fn: EFEITOS.preto };', "  if (ativo.tipo === 'ambiente') return { fn: ativo.pintar }; // programação circadiana (programacao.js)"),
  ],
  'public/player.html': [
    depois('<div id="net" title="sem conexão com o servidor"></div>', '<script src="ambiente.js"></script>\n<script src="programacao-player.js"></script>'),
    antes("      else if (m.type === 'reload') { location.reload(); }", "      else if (m.type === 'anuncio') { if (progPlayer) progPlayer.receber(m); }"),
    depois("    content = c; current = -1; currentKey = '';", "    if (progPlayer && (!c || c.kind !== 'ambiente')) progPlayer.parar();\n    if (progPlayer && c && c.kind === 'ambiente') { progPlayer.mostrar(c); updateStatus(); return; }"),
    antes('  function clearLayer(l) {', `  // Programação circadiana e anúncios (programacao-player.js).
  // Se der erro aqui (navegador antigo), a tela segue tocando as cenas normais em vez de apagar.
  var progPlayer = null;
  try {
    if (window.ProgPlayer && window.Ambiente) progPlayer = ProgPlayer.criar({
      $: $, now: now, dims: dims, info: info, id: id, urlLocal: urlLocal, versaoDaTela: versaoDaTela, DOBRA_LED: DOBRA_LED,
      camadaAtual: function () { return front; },
      trocarCamada: function (el) {
        clearLayer(back); back.appendChild(el);
        back.classList.add('on'); front.classList.remove('on');
        var old = front; front = back; back = old;
        setTimeout(function () { if (!back.classList.contains('on')) clearLayer(back); }, 100);
      }
    });
  } catch (e) { progPlayer = null; }
`),
    depois("      tipo: content ? (content.kind || '?') : 'nada',", "      anuncio: progPlayer ? progPlayer.anuncioNoAr() : null,"),
  ],
  'public/celular.html': [
    trocar('</style>', '</style>\n<link rel="stylesheet" href="programacao.css">', '<link rel="stylesheet" href="programacao.css">'),
    antes('    <div class="andares" id="andares">', '    <div id="prog-cartao"></div>'),
    antes('  <!-- DETALHE de um aparelho -->', '  <!-- PROGRAMAÇÃO: cores e efeitos do dia, anúncios (programacao-app.js) -->\n  <section id="programacao" class="tela" hidden></section>\n'),
    antes('    <nav class="abas" id="abas"></nav>', '    <div id="det-prog" hidden></div>'),
    depois('<div class="toast" id="toast"></div>', '\n<script src="ambiente.js"></script>\n<script src="programacao-app.js"></script>'),
    antes("        else if (m.type === 'balcao-previa') desenharPrevia(m);", "        else if (m.type === 'programacao') Programacao.estado(m);"),
    antes('    const m = /^#\\/z\\/(.+)$/.exec(location.hash);', "    if (Programacao.rota()) { zonaAberta = null; montadas = ''; aba = null; if (PC.matches) renderInicio(); return; }"),
    depois('  function render() {', '    if (Programacao.ativa()) { if (PC.matches) renderInicio(); return; }'),
    depois('  function noAr(z) {', "    if (z.prog && z.prog.ativa) return 'Programação · ' + z.prog.faixa;"),
    depois('  function tinta(z) {', "    if (z.prog && z.prog.ativa) { const c = z.prog.cores; return `linear-gradient(135deg, ${c[0]}aa, ${c[1]}66 55%, rgba(21,23,27,.9) 100%)`; }"),
    trocar("  const ligado = z => { const f = fitaDe(z); return f ? !!f.saida && z.cena !== 'apagar' : !!z.cena && z.cena !== 'apagar'; };",
      "  const ligado = z => { const f = fitaDe(z); if (z.prog && z.prog.ativa) return f ? !!f.saida : true; return f ? !!f.saida && z.cena !== 'apagar' : !!z.cena && z.cena !== 'apagar'; };"),
    antes('    const c = cenaAtual(z);', '    if (z.prog && z.prog.ativa) return `<i class="prog-previa" style="background:linear-gradient(90deg,${z.prog.cores.join(\',\')})"></i>`;'),
    trocar("      const pk = z.tipo === 'fita' ? 'fita' : (cenaAtual(z) || {}).thumb || '';",
      "      const pk = z.tipo === 'fita' ? 'fita' : z.prog && z.prog.ativa ? 'prog' + z.prog.cores : (cenaAtual(z) || {}).thumb || '';"),
    trocar("    const pk = z.id + '|' + (z.tipo === 'fita' ? 'fita' : (cenaAtual(z) || {}).thumb || '');",
      "    const pk = z.id + '|' + (z.tipo === 'fita' ? 'fita' : z.prog && z.prog.ativa ? 'prog' + z.prog.cores : (cenaAtual(z) || {}).thumb || '');"),
    trocar("    const temVel = z.grupo === 'led' || z.grupo === 'painel' || z.tipo === 'fita';",
      "    const naProg = !!(z.prog && z.prog.ativa); // na programação, velocidade/BPM/filtro não mandam nada\n    const temVel = !naProg && (z.grupo === 'led' || z.grupo === 'painel' || z.tipo === 'fita');"),
    trocar("    $('det-bpm').hidden = !temRitmo(z);", "    $('det-bpm').hidden = naProg || !temRitmo(z);"),
    trocar("    $('det-filtro').hidden = !f;", "    $('det-filtro').hidden = !f || !!(z.prog && z.prog.ativa);"),
    antes('    montarFiltro(z, f);', '    Programacao.bannerZona(z);'),
    trocar("    Array.from($('grade-cenas').children).forEach(b => b.classList.toggle('on', b.dataset.id === z.cena));",
      "    Array.from($('grade-cenas').children).forEach(b => b.classList.toggle('on', b.dataset.id === z.cena && !(z.prog && z.prog.ativa)));"),
    trocar("    const atual = (z.cor || '').toLowerCase();", "    const atual = z.prog && z.prog.ativa ? '' : (z.cor || '').toLowerCase();"),
    antes('  // ---------- render geral ----------', '  Programacao.iniciar({ enviar, toast, vibrar, criarSlider, SERVIDOR, PC });\n'),
  ],
};

const conta = (txt, s) => txt.split(s).length - 1;
const saidas = {};
let faltou = 0;
for (const [arq, lista] of Object.entries(LIGACOES)) {
  const caminho = path.join(destino, arq);
  const bruto = fs.readFileSync(caminho, 'utf8');
  const crlf = bruto.includes('\r\n');
  let txt = crlf ? bruto.replace(/\r\n/g, '\n') : bruto;
  let aplicadas = 0, jaEstavam = 0;
  for (const l of lista) {
    if (txt.includes(l.marca)) { jaEstavam++; continue; }
    const n = conta(txt, l.ancora);
    if (n !== 1) { console.log(`FALTOU em ${arq}: âncora aparece ${n}x → ${l.ancora.slice(0, 90)}`); faltou++; continue; }
    txt = txt.replace(l.ancora, () => l.troca);
    aplicadas++;
  }
  console.log(`${arq}: ${aplicadas} ligação(ões) nova(s), ${jaEstavam} já estavam`);
  if (aplicadas) saidas[caminho] = crlf ? txt.replace(/\n/g, '\r\n') : txt;
}
if (faltou) { console.log(`Nada foi gravado: ${faltou} âncora(s) não encontrada(s).`); process.exit(1); }
if (soConferir) { console.log('Só conferi. Nada foi gravado.'); process.exit(0); }

// Primeiro os arquivos novos: as ligações dependem deles.
if (path.resolve(__dirname) !== destino) {
  for (const arq of NOVOS) {
    fs.mkdirSync(path.dirname(path.join(destino, arq)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, arq), path.join(destino, arq));
  }
  console.log(`${NOVOS.length} arquivos novos copiados`);
}
for (const [caminho, txt] of Object.entries(saidas)) {
  const reserva = caminho + '.antes-programacao';
  if (!fs.existsSync(reserva)) fs.copyFileSync(caminho, reserva);
  fs.writeFileSync(caminho, txt);
}
console.log('Pronto.');
