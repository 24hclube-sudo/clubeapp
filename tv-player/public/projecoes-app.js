// Tela "Projeções" do app (celular.html): as colunas e os clipes do Resolume dos projetores. A conversa passa por projecoes.js no servidor.
window.Projecoes = (function () {
  'use strict';
  const ROTA = '#/projecoes';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let C = null, dados = null, noQuinto = false, relogio = null, enviando = null, confirmarApagar = false, assinatura = '';

  const ativa = () => location.hash === ROTA;
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="10" rx="2"/><circle cx="15.5" cy="13" r="2.6"/><path d="M6.5 11.5h3M7 18v2M17 18v2"/></svg>';

  function estadoTexto() {
    if (!dados) return 'Carregando…';
    if (dados.semRota) return 'Falta reiniciar o servidor do app';
    if (!dados.conectado) return 'Resolume sem conexão';
    const on = (dados.colunas || []).find(c => c.noAr);
    if (on) return on.nome;
    const clipes = (dados.camadas || []).flatMap(l => l.clipes).filter(c => c.noAr);
    if (clipes.length) return clipes.map(c => c.nome).join(' · ');
    return 'Nada no ar';
  }
  async function buscar() {
    try {
      const r = await fetch(C.SERVIDOR + 'api/projecoes', { cache: 'no-store' });
      dados = r.status === 404 ? { conectado: false, semRota: true } : await r.json();
    } catch { dados = { conectado: false, erro: 'Sem resposta do servidor' }; }
    pintar();
    agendar();
  }
  function agendar() {
    clearTimeout(relogio);
    if (document.hidden || !(ativa() || noQuinto)) return;
    relogio = setTimeout(buscar, ativa() ? 2000 : 6000);
  }
  async function pedir(rota, chave) {
    if (enviando) return;
    enviando = chave;
    pintar();
    try {
      const r = await fetch(C.SERVIDOR + rota, { method: 'POST' });
      const d = await r.json();
      if (d.error) C.toast(d.error); else dados = d;
    } catch { C.toast('Sem resposta do servidor'); }
    enviando = null;
    pintar();
    agendar();
  }

  // ---------- cartão no 5º andar ----------
  function montarCartao() {
    $('projecoes-cartao').innerHTML = `<div class="cartao vis-cartao" id="pc-cartao">
      <div class="corpo"><div class="icone">${ICONE}</div>
        <div style="min-width:0"><div class="nome">Projeções</div><div class="sub" id="pc-sub">Carregando…</div></div></div></div>`;
    $('pc-cartao').onclick = () => {
      C.vibrar();
      if (C.PC.matches) { history.replaceState(null, '', ROTA); window.dispatchEvent(new HashChangeEvent('hashchange')); } else location.hash = ROTA;
    };
  }

  // ---------- tela ----------
  function ajuda() {
    if (dados.semRota) return '<div class="bloco"><b>Falta um passo neste PC</b><small class="proj-nota">Os botões das projeções entram quando o servidor do app reiniciar.</small></div>';
    return `<div class="bloco"><b>O app não alcança o Resolume</b>
      <small class="proj-nota">No PC dos projetores, abra o Arena em Preferences → Webserver e ligue, na porta 8080. Se continuar assim, libere o Arena no firewall do Windows.</small>
      <small class="proj-nota">Endereço: ${esc(dados.endereco || '')}. ${esc(dados.erro || '')}</small></div>`;
  }
  function montarLista() {
    const l = $('proj-lista');
    if (!dados.conectado) { l.innerHTML = ajuda(); assinatura = ''; return; }
    // só refaz a lista quando a composição mudar: repintar a cada 2 s faria as miniaturas piscarem
    const nova = JSON.stringify([dados.colunas.map(c => [c.i, c.nome]), dados.camadas.map(k => [k.i, k.nome, k.clipes.map(c => [c.i, c.id, c.nome, c.v])])]);
    if (nova === assinatura) return;
    assinatura = nova;
    const colunas = dados.colunas.length ? `<div class="secao">Cenas</div><div class="proj-colunas">${dados.colunas.map(c => `<button type="button" data-col="${c.i}">${esc(c.nome)}</button>`).join('')}</div>` : '';
    const camadas = dados.camadas.map(k => `<div class="secao">${esc(k.nome)}</div><div class="vis-grade">${k.clipes.map(c => `<button type="button" class="vis-item" data-l="${k.i}" data-c="${c.i}">
        <span class="vis-img proj-img"><img src="${C.SERVIDOR}api/projecoes/foto?id=${encodeURIComponent(c.id)}&v=${encodeURIComponent(c.v || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><em></em></span>
        <b>${esc(c.nome)}</b></button>`).join('')}</div>`).join('');
    l.innerHTML = (colunas + camadas) || '<div class="bloco"><small class="proj-nota">A composição do Resolume está vazia.</small></div>';
    l.querySelectorAll('[data-col]').forEach(b => { b.onclick = () => { C.vibrar(); pedir('api/projecoes/coluna?i=' + b.dataset.col, 'col' + b.dataset.col); }; });
    l.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => { C.vibrar(); pedir(`api/projecoes/clipe?l=${b.dataset.l}&c=${b.dataset.c}`, `c${b.dataset.l}-${b.dataset.c}`); }; });
  }
  function pintar() {
    const texto = estadoTexto();
    if ($('pc-sub')) {
      $('pc-sub').textContent = texto;
      $('pc-cartao').classList.toggle('desligado', !(dados && dados.conectado));
      $('pc-cartao').classList.toggle('sel', ativa() && C.PC.matches);
    }
    if (!ativa() || !$('proj-estado') || !dados) return;
    $('proj-estado').textContent = texto;
    $('proj-comp').textContent = dados.conectado ? 'Resolume · ' + (dados.nome || 'composição sem nome') : '';
    const apagar = $('proj-apagar');
    apagar.hidden = !dados.conectado;
    apagar.textContent = confirmarApagar ? 'Toque de novo' : 'Apagar tudo';
    apagar.classList.toggle('confirmar', confirmarApagar);
    montarLista();
    if (!dados.conectado) return;
    const col = {}, cli = {};
    dados.colunas.forEach(c => { col[c.i] = c.noAr; });
    dados.camadas.forEach(k => k.clipes.forEach(c => { cli[k.i + '-' + c.i] = c.noAr; }));
    document.querySelectorAll('#proj-lista [data-col]').forEach(b => {
      b.classList.toggle('on', !!col[b.dataset.col]);
      b.classList.toggle('troca', enviando === 'col' + b.dataset.col);
    });
    document.querySelectorAll('#proj-lista [data-l]').forEach(b => {
      const k = b.dataset.l + '-' + b.dataset.c, on = !!cli[k], tr = enviando === 'c' + k;
      b.classList.toggle('on', on);
      b.classList.toggle('troca', tr);
      b.querySelector('em').textContent = tr ? 'Trocando…' : on ? 'No ar' : '';
    });
  }
  function montarTela() {
    $('projecoes').innerHTML = `<div class="bloco vis-topo">
        <div class="t"><b id="proj-estado"></b><small id="proj-comp"></small></div>
        <button type="button" class="bt-andar" id="proj-apagar" hidden>Apagar tudo</button>
      </div>
      <div id="proj-lista"></div>`;
    assinatura = '';
    $('proj-apagar').onclick = () => {
      C.vibrar();
      if (!confirmarApagar) {
        confirmarApagar = true;
        pintar();
        setTimeout(() => { confirmarApagar = false; pintar(); }, 3000);
        return;
      }
      confirmarApagar = false;
      pedir('api/projecoes/apagar', 'apagar');
    };
  }

  // ---------- navegação ----------
  function rota() {
    const em = ativa();
    document.body.classList.toggle('em-projecoes', em);
    $('projecoes').hidden = !em;
    if (!em) { $('projecoes').innerHTML = ''; pintar(); return false; }
    $('inicio').hidden = !C.PC.matches;
    $('detalhe').hidden = true;
    $('bt-voltar').hidden = C.PC.matches;
    $('titulo').className = C.PC.matches ? 'marca' : 'titulo-det';
    $('titulo').textContent = C.PC.matches ? 'CLUBE' : 'Projeções';
    montarTela();
    pintar();
    buscar();
    window.scrollTo(0, 0);
    return true;
  }
  function mostrarNoAndar(sim) {
    $('projecoes-cartao').hidden = !sim;
    const mudou = sim !== noQuinto;
    noQuinto = sim;
    if (mudou && sim) buscar(); else if (mudou) agendar();
  }
  function iniciar(funcoes) {
    C = funcoes;
    montarCartao();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && (ativa() || noQuinto)) buscar(); });
  }
  return { iniciar, rota, ativa, mostrarNoAndar };
})();
