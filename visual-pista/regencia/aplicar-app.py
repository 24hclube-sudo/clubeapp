"""Acrescenta no app (tv-player) as cenas da Regência, a camada de cor e o diretor automático, por trecho: outras sessões publicam nos mesmos arquivos.
Uso: python aplicar-app.py <pasta do tv-player> [servidor|tela]
servidor: visuais-led.js, que só vale depois de reiniciar o servidor (UAC). tela: public/visuais-app.js, que vale na hora: aplicar depois do reinício.
"""
import sys
import pathlib

pasta = pathlib.Path(sys.argv[1])
etapa = sys.argv[2] if len(sys.argv) > 2 else 'tudo'

# ---------- servidor ----------
p = pasta / 'visuais-led.js'
s = p.read_text(encoding='utf8')
if 'api/visuais/regencia' in s and etapa != 'tela':
    sys.exit('visuais-led.js já tem a Regência')


def rep(a, b):
    global s
    assert s.count(a) >= 1, 'não achei: ' + a[:90]
    s = s.replace(a, b, 1)


# Na etapa da tela, o servidor já recebeu estes trechos: aplicar de novo falha.
if etapa != 'tela':
  rep("const VISUAIS = [\n", """const VISUAIS = [
  { id: 'r-feixes', nome: 'Feixes', desc: 'Moving lights de verdade na névoa, de trás do logo para cima da pista. O desenho muda a cada 8 compassos. No build fecham, no drop abrem tudo.', grupo: 'Regência' },
  { id: 'r-astrolabio', nome: 'Astrolábio', desc: 'Anéis de inox do tamanho do céu, um para cada instrumento. No drop, todos se alinham em volta do logo num túnel.', grupo: 'Regência' },
  { id: 'r-mercurio', nome: 'Mercúrio', desc: 'O painel vira um lago de mercúrio. O bumbo faz ondas de verdade, o chimbal pinga, e no build o lago treme num desenho de cimática.', grupo: 'Regência' },
  { id: 'r-micelio', nome: 'Micélio', desc: 'Um organismo de prata cresce pelo painel e procura o logo. A seção da música muda o jeito de ele crescer.', grupo: 'Regência' },
  { id: 'r-enxame', nome: 'Enxame', desc: 'Milhões de pontos em véus no ar. No build giram num vórtice, e no drop formam um personagem da marca.', grupo: 'Regência' },
""")
  rep("""    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método não aceito' });
    if (p === '/api/visuais/led') {""", """    // Camada de cor e diretor automático: quem guarda e aplica é a saída do LED. O app só repassa e avisa os outros aparelhos.
    if (p === '/api/visuais/regencia' && req.method === 'GET') {
      const [diretor, cor] = await Promise.all([pedir('GET', '/diretor', 1500), pedir('GET', '/cor', 1500)]);
      return sendJson(res, 200, { diretor, cor });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método não aceito' });
    if (p === '/api/visuais/regencia') {
      const alvo = url.searchParams.get('alvo') === 'cor' ? '/cor' : '/diretor';
      const q = new URLSearchParams(url.searchParams);
      q.delete('alvo');
      const r = await pedir('POST', alvo + '?' + q.toString(), 2500);
      if (!r) return sendJson(res, 503, { error: 'saída do LED fechada' });
      avisar({ regencia: true });
      return sendJson(res, 200, r);
    }
    if (p === '/api/visuais/led') {""")
if etapa != 'tela':
    p.write_text(s, encoding='utf8')
if etapa == 'servidor':
    print('servidor aplicado em', pasta)
    sys.exit(0)

# ---------- tela do app ----------
p = pasta / 'public' / 'visuais-app.js'
s = p.read_text(encoding='utf8')
# Os blocos novos também usam o estilo vis-chips, mas não falam com /api/reacoes
s = s.replace("""    raiz.querySelectorAll('.vis-chips').forEach(g => {
      g.querySelectorAll('button').forEach(b => b.classList.toggle('on', reacoesLed[g.dataset.chave] === b.dataset.valor));""", """    raiz.querySelectorAll('.vis-chips[data-chave]').forEach(g => {
      g.querySelectorAll('button').forEach(b => b.classList.toggle('on', reacoesLed[g.dataset.chave] === b.dataset.valor));""", 1)
s = s.replace("""    raiz.querySelectorAll('.vis-chips').forEach(g => {
      g.querySelectorAll('button').forEach(b => { b.onclick = () => mudarControle(g.dataset.chave, b.dataset.valor); });""", """    raiz.querySelectorAll('.vis-chips[data-chave]').forEach(g => {
      g.querySelectorAll('button').forEach(b => { b.onclick = () => mudarControle(g.dataset.chave, b.dataset.valor); });""", 1)
assert ".vis-chips[data-chave]" in s

rep("  // ---------- tela ----------\n  function montarTela() {", """  // ---------- camada de cor e diretor automático ----------
  // Moram na saída do LED, por /api/visuais/regencia. Todos os aparelhos acompanham: quem muda avisa por WS, e a análise da música é lida 1 vez por segundo enquanto a tela está aberta.
  const CORES_CAMADA = [['ff0040', 'Vermelho'], ['ff5a00', 'Laranja'], ['ffc400', 'Âmbar'], ['00e05a', 'Verde'], ['00d0ff', 'Ciano'], ['1238e0', 'Azul'], ['7a2bff', 'Violeta'], ['ff00a0', 'Rosa']];
  const SECAO_TXT = { silencio: 'Sem música', calmo: 'Calmo', groove: 'Groove', pico: 'Pico', break: 'Break', build: 'Subindo', drop: 'Drop' };
  let corCam = null, diretor = null, relogioReg = null, mudandoRegAte = 0, sliderCor = null, envioCor = null;
  function pintarRegencia() {
    const raiz = $('vt-cor');
    if (!raiz) return;
    if (corCam) {
      $('vt-cor-chave').classList.toggle('on', !!corCam.ligada);
      raiz.classList.toggle('vc-off', !corCam.ligada);
      raiz.querySelectorAll('[data-cor]').forEach(b => { const on = b.dataset.cor === corCam.cor; b.style.outline = on ? '3px solid #fff' : 'none'; });
      raiz.querySelectorAll('[data-cor2]').forEach(b => { const on = b.dataset.cor2 === corCam.cor2; b.style.outline = on ? '3px solid #fff' : 'none'; });
      $('vt-cor-livre').value = '#' + corCam.cor;
      $('vt-cor2-livre').value = '#' + corCam.cor2;
      $('vt-cor2-caixa').hidden = corCam.modo !== 'duas';
      raiz.querySelectorAll('[data-corchave]').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', corCam[g.dataset.corchave] === b.dataset.valor)));
      if (sliderCor && Date.now() >= mudandoRegAte) sliderCor.definir(corCam.forca);
      $('vt-cor-nota').textContent = corCam.auto === 'faixa' ? `Segue o tom da música${corCam.tom ? ': agora ' + corCam.tom : ''}. Tons vizinhos ficam em cores vizinhas.` : corCam.auto === 'gira' ? 'A cor roda devagar pela roda de cores.' : '';
    }
    const dt = diretor;
    if (dt) {
      $('vt-dir-elem').classList.toggle('on', !!dt.elementos);
      $('vt-dir-cenas').classList.toggle('on', !!dt.cenas);
      $('vt-dir-fumaca').classList.toggle('on', !!dt.fumaca);
      const f = $('vt-dir-freq');
      f.querySelectorAll('button').forEach(b => b.classList.toggle('on', dt.frequencia === b.dataset.valor));
      $('vt-dir-grupos').querySelectorAll('button').forEach(b => b.classList.toggle('on', (dt.grupos || []).includes(b.dataset.valor)));
      const a = dt.analise;
      $('vt-dir-sec').textContent = a ? (SECAO_TXT[a.secao] || a.secao) : 'Sem análise';
      $('vt-dir-num').textContent = a ? `${a.bpm ? a.bpm.toFixed(1) + ' BPM' : 'Procurando a batida'}${a.tom ? ' · ' + a.tom + (a.nota ? ' (' + a.nota + ')' : '') : ''} · parte ${a.frase + 1} de 16` : 'A janela de análise ainda não respondeu.';
      $('vt-dir-seg').textContent = dt.seguraPor > 0 ? `Você escolheu a cena: o diretor espera ${dt.seguraPor} s.` : dt.preparada ? 'Cena do drop pronta, esperando o bumbo voltar.' : '';
      const barra = (id, v) => { $(id).style.width = Math.round(Math.max(0, Math.min(1, v || 0)) * 100) + '%'; };
      barra('vt-dir-e', a && a.energia); barra('vt-dir-t', a && a.tensao);
      const inst = { k: a && a.kick, c: a && a.clap, h: a && a.hat, b: a && a.baixo, v: a && a.voz };
      Object.keys(inst).forEach(k => { $('vt-dir-i-' + k).style.opacity = 0.18 + 0.82 * Math.min(1, inst[k] || 0); });
    }
  }
  async function buscarRegencia() {
    if (!$('vt-cor') || document.hidden || Date.now() < mudandoRegAte) return;
    try {
      const j = await (await fetch(C.SERVIDOR + 'api/visuais/regencia', { cache: 'no-store' })).json();
      if (Date.now() < mudandoRegAte) return;
      if (j.cor) corCam = j.cor;
      if (j.diretor) diretor = j.diretor;
      pintarRegencia();
    } catch {}
  }
  async function pedirRegencia(alvo, params) {
    mudandoRegAte = Date.now() + 700;
    try {
      const q = new URLSearchParams({ alvo, ...params });
      const r = await fetch(C.SERVIDOR + 'api/visuais/regencia?' + q.toString(), { method: 'POST' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (alvo === 'cor') corCam = j; else diretor = j;
      pintarRegencia();
    } catch { mudandoRegAte = 0; C.toast('Sem resposta da saída do LED'); buscarRegencia(); }
  }
  // Arrastar na cor manda no máximo 12 pedidos por segundo. O último valor sempre chega.
  function mudarCor(params) {
    Object.assign(corCam || (corCam = {}), params);
    pintarRegencia();
    clearTimeout(envioCor);
    const agora = Date.now();
    const manda = () => { mudarCor.ultimo = Date.now(); const juntos = mudarCor.fila; mudarCor.fila = {}; pedirRegencia('cor', juntos); };
    mudarCor.fila = { ...(mudarCor.fila || {}), ...params };
    if (agora - (mudarCor.ultimo || 0) > 80) manda(); else envioCor = setTimeout(manda, 80);
  }
  function montarRegencia() {
    const r = $('vt-cor');
    $('vt-cor-chave').onclick = () => { C.vibrar(); mudarCor({ ligada: corCam && corCam.ligada ? '0' : '1' }); if (corCam) corCam.ligada = corCam.ligada === '1'; pintarRegencia(); };
    r.querySelectorAll('[data-cor]').forEach(b => { b.onclick = () => { C.vibrar(); mudarCor({ cor: b.dataset.cor, ...(corCam && corCam.ligada ? {} : { ligada: '1' }) }); if (corCam && corCam.ligada === '1') corCam.ligada = true; pintarRegencia(); }; });
    r.querySelectorAll('[data-cor2]').forEach(b => { b.onclick = () => { C.vibrar(); mudarCor({ cor2: b.dataset.cor2 }); }; });
    $('vt-cor-livre').oninput = e => mudarCor({ cor: e.target.value.slice(1) });
    $('vt-cor2-livre').oninput = e => mudarCor({ cor2: e.target.value.slice(1) });
    r.querySelectorAll('[data-corchave]').forEach(g => g.querySelectorAll('button').forEach(b => { b.onclick = () => { C.vibrar(); mudarCor({ [g.dataset.corchave]: b.dataset.valor }); }; }));
    sliderCor = C.criarSlider({ valor: 100, rotulo: 'Força da cor', onChange: v => mudarCor({ forca: v }) });
    $('vt-cor-forca').appendChild(sliderCor);
    const chave = (id, k) => { $(id).onclick = () => { C.vibrar(); pedirRegencia('diretor', { [k]: diretor && diretor[k] ? '0' : '1' }); }; };
    chave('vt-dir-elem', 'elementos'); chave('vt-dir-cenas', 'cenas'); chave('vt-dir-fumaca', 'fumaca');
    $('vt-dir-freq').querySelectorAll('button').forEach(b => { b.onclick = () => { C.vibrar(); pedirRegencia('diretor', { frequencia: b.dataset.valor }); }; });
    $('vt-dir-grupos').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        C.vibrar();
        const atuais = new Set((diretor && diretor.grupos) || []);
        if (atuais.has(b.dataset.valor)) atuais.delete(b.dataset.valor); else atuais.add(b.dataset.valor);
        if (!atuais.size) return C.toast('Deixe pelo menos um grupo');
        pedirRegencia('diretor', { grupos: [...atuais].join(',') });
      };
    });
    buscarRegencia();
    clearInterval(relogioReg);
    relogioReg = setInterval(() => { if (!$('vt-cor')) { clearInterval(relogioReg); relogioReg = null; return; } buscarRegencia(); }, 1000);
  }

  // ---------- tela ----------
  function montarTela() {""")

rep("""      <div class="bloco vis-flash" id="vt-flash">""", """      <div class="bloco" id="vt-dir">
        <div class="t"><b>Diretor automático</b><small>Ouve a música, entende a parte em que ela está e muda sozinho o que está no LED.</small></div>
        <div style="margin:12px 0 4px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><b id="vt-dir-sec" style="font-size:20px">…</b><small id="vt-dir-num"></small></div>
        <div style="display:grid;grid-template-columns:64px 1fr;gap:6px 10px;align-items:center;margin:8px 0">
          <small>Energia</small><div style="height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden"><div id="vt-dir-e" style="height:100%;width:0;background:#fff;transition:width .3s"></div></div>
          <small>Tensão</small><div style="height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden"><div id="vt-dir-t" style="height:100%;width:0;background:#fff;transition:width .3s"></div></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 10px">
          <small id="vt-dir-i-k" style="opacity:.2">Bumbo</small><small id="vt-dir-i-c" style="opacity:.2">Palma</small><small id="vt-dir-i-h" style="opacity:.2">Chimbal</small><small id="vt-dir-i-b" style="opacity:.2">Baixo</small><small id="vt-dir-i-v" style="opacity:.2">Voz</small>
        </div>
        <small id="vt-dir-seg" style="display:block;margin-bottom:6px"></small>
        <div class="vis-linha"><div class="t"><b>Elementos mudam sozinhos</b><small>Luz atrás do logo, booth, brilhinhos e o jeito de o logo reagir acompanham a parte da música. Vale nos visuais em 3D</small></div><button type="button" class="chave" id="vt-dir-elem" aria-label="Elementos mudam sozinhos"></button></div>
        <div class="vis-linha"><div class="t"><b>Cenas mudam sozinhas</b><small>A cena troca em cima da batida. Escolher um visual à mão segura ele por 2 minutos</small></div><button type="button" class="chave" id="vt-dir-cenas" aria-label="Cenas mudam sozinhas"></button></div>
        <small class="vis-rotulo">Troca de cena</small>
        <div class="vis-chips" id="vt-dir-freq"><button type="button" data-valor="secao">A cada parte</button><button type="button" data-valor="musica">Só quando a música muda</button><button type="button" data-valor="frase">A cada 16 compassos</button></div>
        <small class="vis-rotulo">Entram na troca</small>
        <div class="vis-chips" id="vt-dir-grupos"><button type="button" data-valor="regencia">Regência</button><button type="button" data-valor="firmamento">Firmamento</button><button type="button" data-valor="espaco">Espaço de pé</button><button type="button" data-valor="marca">Marca em inox</button><button type="button" data-valor="cinetica">Escultura cinética</button></div>
        <div class="vis-linha"><div class="t"><b>Fumaça no break</b><small>Solta uma baforada quando a música entra no break</small></div><button type="button" class="chave" id="vt-dir-fumaca" aria-label="Fumaça no break"></button></div>
      </div>
      <div class="bloco" id="vt-cor">
        <div class="vis-linha"><div class="t"><b>Cor por cima de tudo</b><small>Uma camada na frente de qualquer visual, que muda a cor do conteúdo inteiro</small></div><button type="button" class="chave" id="vt-cor-chave" aria-label="Ligar ou desligar a camada de cor"></button></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0">${CORES_CAMADA.map(([c, n]) => `<button type="button" data-cor="${c}" aria-label="${n}" title="${n}" style="width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:#${c};padding:0"></button>`).join('')}<input id="vt-cor-livre" type="color" aria-label="Outra cor" style="width:46px;height:38px;padding:0;border:0;background:none"></div>
        <div id="vt-cor2-caixa" hidden style="margin-bottom:10px"><small class="vis-rotulo">Segunda cor, perto do booth</small><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px">${CORES_CAMADA.map(([c, n]) => `<button type="button" data-cor2="${c}" aria-label="${n}" title="${n}" style="width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:#${c};padding:0"></button>`).join('')}<input id="vt-cor2-livre" type="color" aria-label="Outra segunda cor" style="width:42px;height:32px;padding:0;border:0;background:none"></div></div>
        <div id="vt-cor-forca" style="margin:8px 0"></div>
        <small class="vis-rotulo">Como a cor entra</small>
        <div class="vis-chips" data-corchave="modo"><button type="button" data-valor="tingir">Tingir tudo</button><button type="button" data-valor="filtro">Gelatina</button><button type="button" data-valor="suave">Suave</button><button type="button" data-valor="duas">Duas cores</button></div>
        <small class="vis-rotulo">De onde vem a cor</small>
        <div class="vis-chips" data-corchave="auto"><button type="button" data-valor="fixa">A que escolhi</button><button type="button" data-valor="faixa">Segue a música</button><button type="button" data-valor="gira">Gira sozinha</button></div>
        <small id="vt-cor-nota" style="display:block;margin-top:6px"></small>
      </div>
      <div class="bloco vis-flash" id="vt-flash">""")
rep("    montarControles();\n    $('vt-flash')", "    montarControles();\n    montarRegencia();\n    $('vt-flash')")
rep("  function remoto(m) {", "  function remoto(m) {\n    if (m.regencia) return buscarRegencia();")
p.write_text(s, encoding='utf8')
print('aplicado em', pasta)
