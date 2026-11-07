// Rádio CLUBE: interface. Sem dependências e sem etapa de build.
//
// Isto é uma rádio ao vivo: todo mundo ouve a mesma coisa. "Ouvir" entra na
// transmissão, as playlists mostram o que toca em cada horário e clicar numa
// música põe ela no ar na hora, para todo mundo.
'use strict';

const $ = id => document.getElementById(id);
const principal = $('principal');

const estado = {
  momentos: [],
  modo: 'proposta',
  agora: null,
  faixasPorMomento: new Map(),
  exibida: null,        // faixa mostrada, descontado o atraso do áudio
  pendente: null,
  ouvindo: false,
  rota: '',
};

// ---------- formatos ----------

const doisDig = n => String(n).padStart(2, '0');
const hh = h => `${doisDig(h)}h`;
const faixaHoraria = m => `${hh(m.inicio)} às ${hh(m.fim)}`;

function relogio(seg) {
  if (!Number.isFinite(seg) || seg < 0) return '0:00';
  const s = Math.floor(seg);
  return `${Math.floor(s / 60)}:${doisDig(s % 60)}`;
}

function duracaoLonga(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.round((seg % 3600) / 60);
  return h ? `${h}h ${doisDig(m)}min` : `${m}min`;
}

const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capaDaFaixa = id => `api/capa/${encodeURIComponent(id)}?v=2`;
const corDe = m => `--cor:${m.cor};--cor2:${m.cor2}`;

function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function pedir(caminho) {
  const r = await fetch(caminho, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

// ---------- pedaços de tela ----------

function capaMomento(m) {
  return `<span class="capa-foto" style="${corDe(m)}">
    <img src="${escapar(m.capa)}" alt="" loading="lazy">
    <span class="capa-c" aria-hidden="true"></span>
    <span class="capa-momento-texto">${escapar(m.nome)}</span>
  </span>`;
}

function capinha(id) {
  if (!id) return '<span class="capinha sem-imagem"></span>';
  return `<span class="capinha"><img src="${capaDaFaixa(id)}" alt="" loading="lazy" onerror="semImagem(this)"></span>`;
}

// Faixa sem capa: fica o C do CLUBE no lugar da imagem quebrada.
window.semImagem = img => {
  const pai = img.parentElement;
  pai.classList.add('sem-imagem');
  img.remove();
};

const ondas = '<span class="ondas" aria-label="Tocando agora"><i></i><i></i><i></i></span>';

function linhaFaixa(f, i) {
  const tocando = estado.exibida?.id === f.id;
  return `<li class="faixa ${tocando ? 'tocando' : ''}" data-id="${escapar(f.id)}" tabindex="0" title="Tocar agora na rádio">
    <span class="faixa-num">${tocando ? ondas : i + 1}</span>
    ${capinha(f.id)}
    <span class="faixa-corpo">
      <span class="faixa-titulo">${escapar(f.titulo)}</span>
      <span class="faixa-artista">${escapar(f.artista)}</span>
    </span>
    <span class="faixa-album">${escapar(f.album)}</span>
    <span class="faixa-tempo">${relogio(f.duracao)}</span>
  </li>`;
}

function linhaCurta(f, direita) {
  return `<li class="faixa faixa-curta">
    ${capinha(f.id)}
    <span class="faixa-corpo">
      <span class="faixa-titulo">${escapar(f.titulo)}</span>
      <span class="faixa-artista">${escapar(f.artista)}</span>
    </span>
    <span class="faixa-quando">${escapar(direita || '')}</span>
  </li>`;
}

function avisoProposta() {
  if (estado.modo !== 'proposta' || estado.caixa?.modo === 'player') return '';
  return `<p class="aviso-proposta"><strong>Proposta, ainda sem valer na rádio.</strong>
    A música de agora vem da programação automática atual. As listas e os horários abaixo só entram no ar depois da aprovação.</p>`;
}

function botaoOuvir() {
  const ouvindo = estado.ouvindo;
  const icone = ouvindo
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  return `<button class="botao-pilula" data-acao="tocar">${icone}${ouvindo ? 'Pausar' : 'Tocar'}</button>`;
}

function linhaDoDia(agora) {
  const blocos = [];
  // A madrugada cruza a meia-noite: no gráfico ela aparece em dois pedaços.
  for (const m of estado.momentos) {
    if (m.inicio < m.fim) blocos.push({ m, de: m.inicio, ate: m.fim });
    else {
      blocos.push({ m, de: 0, ate: m.fim, curto: true });
      blocos.push({ m, de: m.inicio, ate: 24 });
    }
  }
  const pos = agora ? ((agora.relogio.hora + agora.relogio.minuto / 60) / 24) * 100 : null;
  return `<div class="linha-dia">
    ${pos != null ? `<span class="linha-dia-agora" style="left:${pos}%" data-hora="${doisDig(agora.relogio.hora)}:${doisDig(agora.relogio.minuto)}"></span>` : ''}
    <div class="linha-dia-faixas">
      ${blocos.map(b => `<a href="#/momento/${b.m.id}" style="left:${(b.de / 24) * 100}%;width:${((b.ate - b.de) / 24) * 100}%;${corDe(b.m)}"
          aria-label="${escapar(b.m.nome)}, ${faixaHoraria(b.m)}">${b.ate - b.de >= 3 ? escapar(b.m.nome) : ''}</a>`).join('')}
    </div>
    <div class="linha-dia-horas"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
  </div>`;
}

function fundoDoMomentoAtual() {
  const m = estado.momentos.find(x => x.id === estado.agora?.momentoAtual);
  return m ? corDe(m) : '--cor:#333;--cor2:#111';
}

// ---------- páginas ----------

function paginaInicio() {
  const ag = estado.agora;
  const f = estado.exibida;
  const atual = estado.momentos.find(m => m.id === ag?.momentoAtual);
  const seguinte = estado.momentos.find(m => m.id === ag?.momentoSeguinte);
  const legenda = estado.caixa?.modo === 'player'
    ? 'Tocando agora · Player'
    : estado.modo === 'proposta'
    ? 'No ar agora'
    : `No ar agora · ${atual ? atual.nome : 'Rádio CLUBE'}`;
  const proxima = ag?.proximas?.[0];
  const tocaram = (ag?.tocaram || []).slice(0, 6);

  return `<div class="pagina">
    ${avisoProposta()}
    <section class="heroi" style="${fundoDoMomentoAtual()}" aria-live="polite">
      <div class="heroi-capa ${f?.id ? '' : 'sem-imagem'}" id="heroi-capa">
        ${f?.id ? `<img src="${capaDaFaixa(f.id)}" alt="" onerror="semImagem(this)">` : ''}
      </div>
      <div class="heroi-texto">
        <p class="rotulo"><i class="ponto"></i>${escapar(legenda)}</p>
        <h1 id="heroi-titulo">${escapar(f?.titulo || 'Rádio CLUBE')}</h1>
        <p class="heroi-artista">${escapar(f?.artista || 'Conectando à estação')}</p>
        ${f?.album ? `<p class="heroi-album">${escapar(f.album)}</p>` : ''}
      </div>
      <div class="heroi-acoes" style="grid-column:2">
        ${botaoOuvir()}
        ${proxima ? `<span class="texto-mudo">A seguir: ${escapar(proxima.titulo)}, ${escapar(proxima.artista)}</span>` : ''}
      </div>
    </section>

    <section class="secao">
      <div class="secao-topo"><h2>Momentos do dia</h2><a href="#/programacao">Ver programação</a></div>
      <div class="grade-momentos">
        ${estado.momentos.map(m => `<a class="cartao" href="#/momento/${m.id}">
          ${capaMomento(m)}
          <span class="cartao-nome">${escapar(m.nome)}</span>
          <span class="cartao-info">${m.noAr ? '<span class="etiqueta-no-ar"><i class="ponto"></i>agora</span> · ' : ''}${faixaHoraria(m)}</span>
        </a>`).join('')}
      </div>
    </section>

    <section class="secao">
      <div class="secao-topo"><h2>O dia na rádio</h2></div>
      ${linhaDoDia(ag)}
      ${seguinte ? `<p class="nota">${estado.modo === 'proposta' ? 'Pela proposta, o próximo momento seria' : 'Próximo momento:'} ${escapar(seguinte.nome)}, às ${hh(seguinte.inicio)}. A troca é sozinha, no fim da música que estiver tocando.</p>` : ''}
    </section>

    ${tocaram.length ? `<section class="secao">
      <div class="secao-topo"><h2>Tocaram há pouco</h2></div>
      <ul class="dupla">${tocaram.map(t => linhaCurta(t, t.inicio ? new Date(t.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')).join('')}</ul>
    </section>` : ''}
  </div>`;
}

async function paginaMomento(id) {
  const dados = await pedir(`api/momentos/${encodeURIComponent(id)}`);
  estado.faixasPorMomento.set(id, dados.faixas);
  const m = dados;
  const seraNoAr = m.noAr && estado.modo === 'no-ar';
  return `<div style="${corDe(m)}">
    <header class="momento-topo">
      ${capaMomento(m)}
      <div>
        <p class="rotulo">${seraNoAr ? '<i class="ponto"></i>No ar agora' : `Playlist · ${faixaHoraria(m)}`}</p>
        <h1>${escapar(m.nome)}</h1>
        <p class="momento-desc">${escapar(m.descricao)}</p>
        <p class="momento-dados">${faixaHoraria(m)}, todos os dias <span>· ${m.totalFaixas} músicas · ${duracaoLonga(m.duracao)}</span></p>
      </div>
    </header>
    <div class="momento-acoes">
      ${botaoOuvir()}
      <span class="texto-mudo">${seraNoAr
        ? 'Tocando agora na rádio, em ordem variada.'
        : estado.modo === 'no-ar'
          ? `Entra no ar sozinha às ${hh(m.inicio)}. Ouvir leva você ao que está tocando agora.`
          : 'Quando aprovada, entra no ar sozinha neste horário.'}</span>
    </div>
    ${estado.modo === 'proposta' ? `<div style="padding:0 var(--gutter)">${avisoProposta()}</div>` : ''}
    <section class="momento-faixas" aria-label="Músicas de ${escapar(m.nome)}">
      <div class="lista-cabecalho"><span>#</span><span></span><span>Título</span><span>Álbum</span><span>Tempo</span></div>
      <ol>${m.faixas.map(linhaFaixa).join('')}</ol>
    </section>
  </div>`;
}

function paginaProgramacao() {
  const ag = estado.agora;
  return `<div class="pagina">
    ${avisoProposta()}
    <section class="secao" style="margin-top:0">
      <div class="secao-topo"><h2>Programação</h2></div>
      ${linhaDoDia(ag)}
    </section>
    <section class="secao">
      <div class="tabela-prog">
        ${estado.momentos.map(m => `<a href="#/momento/${m.id}" data-no-ar="${m.noAr ? 'sim' : 'nao'}">
          <span class="prog-capa">${capaMomento({ ...m, nome: '' })}</span>
          <span class="prog-hora">${faixaHoraria(m)}</span>
          <span><span class="prog-nome">${escapar(m.nome)}</span><span class="prog-desc">${escapar(m.descricao)}</span></span>
          <span class="prog-info">${m.noAr ? '<span class="etiqueta-no-ar"><i class="ponto"></i>agora</span> · ' : ''}${m.totalFaixas} músicas · ${duracaoLonga(m.duracao)}</span>
        </a>`).join('')}
      </div>
      <p class="nota">Os momentos valem para os sete dias da semana. A troca acontece sozinha, no horário marcado, sempre no fim da música que estiver tocando. A rádio é uma transmissão ao vivo: todo mundo ouve a mesma coisa, ao mesmo tempo.</p>
    </section>
  </div>`;
}

function paginaBusca() {
  return `<div class="pagina">
    <section class="secao" style="margin-top:0">
      <div class="secao-topo"><h2>Em que momento toca?</h2></div>
      <label class="busca-campo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>
        <span class="escondido">Buscar música ou artista</span>
        <input id="campo-busca" type="search" placeholder="Música ou artista" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="busca-resultado" id="busca-resultado"></div>
    </section>
  </div>`;
}

async function carregarTudoParaBusca() {
  await Promise.all(estado.momentos.map(async m => {
    if (estado.faixasPorMomento.has(m.id)) return;
    const d = await pedir(`api/momentos/${m.id}`);
    estado.faixasPorMomento.set(m.id, d.faixas);
  }));
}

function buscar(termo) {
  const alvo = $('busca-resultado');
  if (!alvo) return;
  const q = normalizar(termo).trim();
  if (q.length < 2) {
    alvo.innerHTML = '<p class="vazio">Digite o nome de uma música ou de um artista.</p>';
    return;
  }
  const achadas = new Map();
  for (const m of estado.momentos) {
    for (const f of estado.faixasPorMomento.get(m.id) || []) {
      if (!normalizar(`${f.titulo} ${f.artista}`).includes(q)) continue;
      const item = achadas.get(f.id) || { f, momentos: [] };
      item.momentos.push(m);
      achadas.set(f.id, item);
    }
  }
  if (!achadas.size) {
    alvo.innerHTML = `<p class="vazio">Nada encontrado para “${escapar(termo)}”.</p>`;
    return;
  }
  alvo.innerHTML = `<ul>${[...achadas.values()].slice(0, 60).map(({ f, momentos }) => `<li class="faixa faixa-busca" data-id="${escapar(f.id)}" tabindex="0" title="Tocar agora na rádio">
    ${capinha(f.id)}
    <span class="faixa-corpo">
      <span class="faixa-titulo">${escapar(f.titulo)}</span>
      <span class="faixa-artista">${escapar(f.artista)}</span>
    </span>
    <span class="etiquetas">${momentos.map(m => `<a class="etiqueta" href="#/momento/${m.id}" style="${corDe(m)}">${escapar(m.nome)}</a>`).join('')}</span>
  </li>`).join('')}</ul>`;
}

// ---------- rotas ----------

function marcarNavegacao(nome, idMomento) {
  document.querySelectorAll('[data-rota]').forEach(a => {
    if (a.dataset.rota === nome) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('#lista-momentos a').forEach(a => {
    if (a.dataset.id === idMomento) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function desenhar() {
  const rota = location.hash.replace(/^#\/?/, '');
  estado.rota = rota;
  const [nome, id] = rota.split('/');
  try {
    if (nome === 'momento' && id) {
      marcarNavegacao('', id);
      principal.innerHTML = await paginaMomento(id);
    } else if (nome === 'programacao') {
      marcarNavegacao('programacao');
      principal.innerHTML = paginaProgramacao();
    } else if (nome === 'busca') {
      marcarNavegacao('busca');
      principal.innerHTML = paginaBusca();
      await carregarTudoParaBusca();
      buscar('');
      const campo = $('campo-busca');
      campo.addEventListener('input', () => buscar(campo.value));
      if (window.matchMedia('(min-width: 861px)').matches) campo.focus();
    } else {
      marcarNavegacao('inicio');
      principal.innerHTML = paginaInicio();
    }
    principal.scrollTop = 0;
  } catch {
    principal.innerHTML = '<p class="erro-carregar">Não consegui carregar esta página. Vou tentar de novo em instantes.</p>';
  }
}

function desenharLateral() {
  $('lista-momentos').innerHTML = estado.momentos.map(m => `<li><a href="#/momento/${m.id}" data-id="${m.id}">
    <span class="capinha capinha-momento" style="background-image:url('${escapar(m.capa)}')"></span>
    <span>
      <span class="linha-nome">${escapar(m.nome)}</span>
      <span class="linha-info">${m.noAr ? '<i class="ponto"></i><b>agora</b> · ' : ''}${faixaHoraria(m)}</span>
    </span>
  </a></li>`).join('');
}

// ---------- o que está tocando ----------

function atualizarBarra() {
  const f = estado.exibida;
  const ag = estado.agora;
  $('barra-titulo').textContent = f?.titulo || 'Rádio CLUBE';
  $('barra-artista').textContent = f?.artista || (ag ? 'Sem informação da faixa' : 'Conectando à estação');
  const online = !!ag?.online;
  $('ao-vivo').dataset.online = online ? 'sim' : 'nao';
  $('ao-vivo-texto').textContent = online ? 'ao vivo' : 'fora do ar';

  for (const [alvo, classe] of [[$('barra-capa'), 'capinha'], [$('tela-capa'), 'tela-capa']]) {
    const anterior = alvo.dataset.id || '';
    const novo = f?.id || '';
    if (anterior === novo && (alvo.querySelector('img') || alvo.classList.contains('sem-imagem'))) continue;
    alvo.dataset.id = novo;
    alvo.className = classe + (novo ? '' : ' sem-imagem');
    alvo.innerHTML = novo ? `<img src="${capaDaFaixa(novo)}" alt="" onerror="semImagem(this)">` : '';
  }

  const m = estado.momentos.find(x => x.id === ag?.momentoAtual);
  $('tela-titulo').textContent = f?.titulo || 'Rádio CLUBE';
  $('tela-artista').textContent = f?.artista || '';
  $('tela-album').textContent = f?.album || '';
  $('tela-momento').textContent = estado.modo === 'no-ar' && m ? m.nome : 'Rádio CLUBE';
  const prox = ag?.proximas?.[0];
  $('tela-proxima').textContent = prox ? `A seguir: ${prox.titulo}, ${prox.artista}` : '';
  if (m) {
    $('tela-cheia').style.setProperty('--cor', m.cor);
  }
  atualizarSessaoDeMidia(f);
  marcarFaixaTocando();
}

function marcarFaixaTocando() {
  document.querySelectorAll('.faixa[data-id]').forEach(li => {
    const era = li.classList.contains('tocando');
    const e = li.dataset.id === estado.exibida?.id;
    if (era === e) return;
    li.classList.toggle('tocando', e);
    const num = li.querySelector('.faixa-num');
    const posicao = [...li.parentElement.children].indexOf(li) + 1;
    if (num) num.innerHTML = e ? ondas : String(posicao);
  });
}

function atualizarTempo() {
  const f = estado.exibida;
  const ag = estado.agora;
  let feito = 0;
  let total = f?.duracao || 0;
  if (f?.inicio) {
    const atraso = estado.ouvindo ? (ag?.atrasoAudio || 0) * 1000 : 0;
    feito = f.posicaoFixa != null ? f.posicaoFixa : Math.max(0, (Date.now() - f.inicio - atraso) / 1000);
    if (total) feito = Math.min(feito, total);
  }
  const pct = total ? `${(feito / total) * 100}%` : '0%';
  $('tempo-atual').textContent = relogio(feito);
  $('tempo-total').textContent = relogio(total);
  $('trilho-feito').style.width = pct;
  $('trilho-celular').style.width = pct;
  $('tela-trilho').style.width = pct;
  $('tela-atual').textContent = relogio(feito);
  $('tela-total').textContent = relogio(total);
  // Quem está ouvindo recebe o áudio com alguns segundos de atraso: a faixa nova
  // só aparece quando ela de fato começa nos fones.
  if (estado.pendente) {
    const espera = estado.ouvindo ? (ag?.atrasoAudio || 0) * 1000 : 0;
    if (!estado.pendente.inicio || Date.now() >= estado.pendente.inicio + espera) {
      estado.exibida = estado.pendente;
      estado.pendente = null;
      atualizarBarra();
      if (estado.rota === '' || estado.rota === 'inicio') desenhar();
    }
  }
}

async function atualizarAgora() {
  try {
    const dados = await pedir('api/agora');
    if (estado.caixa?.modo === 'player') {
      dados.faixa = faixaDoPlayer(estado.caixa);
      dados.proximas = estado.caixa.proximas;
      dados.tocaram = [];
      dados.atrasoAudio = 0;
    }
    const mudouMomento = estado.agora?.momentoAtual !== dados.momentoAtual || estado.modo !== dados.modo;
    estado.agora = dados;
    estado.modo = dados.modo;
    const nova = dados.faixa;
    const atual = estado.exibida;
    if (!atual) {
      estado.exibida = nova;
    } else if (nova && nova.id !== atual.id) {
      estado.pendente = nova;
    } else if (nova) {
      estado.exibida = { ...atual, ...nova };
      estado.pendente = null;
    }
    if (mudouMomento || !estado.momentos.length) {
      const lista = await pedir('api/momentos');
      estado.momentos = lista.momentos;
      estado.modo = lista.modo;
      desenharLateral();
      marcarNavegacao(estado.rota.split('/')[0] || 'inicio', estado.rota.split('/')[1]);
      await desenhar();
    }
    atualizarBarra();
  } catch {
    if (estado.agora) estado.agora.online = false;
    atualizarBarra();
  }
}

// ---------- áudio ao vivo ----------

function definirEstadoBotoes(valor) {
  estado.ouvindo = valor === 'tocando' || valor === 'carregando';
  for (const b of [$('tocar'), $('tela-tocar')]) {
    b.dataset.estado = valor;
    b.setAttribute('aria-label', estado.ouvindo ? 'Pausar as caixas' : 'Tocar nas caixas');
  }
  document.querySelectorAll('[data-acao="tocar"]').forEach(b => {
    const ouvindo = estado.ouvindo;
    b.innerHTML = (ouvindo
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>') + (ouvindo ? 'Pausar' : 'Tocar');
  });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = estado.ouvindo ? 'playing' : 'paused';
}

// O app só manda: quem toca é a página caixa.html, aberta neste PC. Pausar no modo Rádio corta o som
// daqui e a rádio segue no ar para os outros lugares; no Player continua do mesmo ponto.
let caixaMexidaEm = 0;
let avisouCaixaFechada = false;

function faixaDoPlayer(c) {
  if (!c.faixa) return null;
  return {
    ...c.faixa,
    inicio: Date.now() - c.posicao * 1000,
    posicaoFixa: c.pausado ? c.posicao : null,
  };
}

function aplicarCaixa(c) {
  const mudouModo = estado.caixa?.modo !== c.modo;
  estado.caixa = c;
  definirEstadoBotoes(c.pausado ? 'parado' : 'tocando');
  document.querySelectorAll('[data-modo]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.modo === c.modo));
  });
  if (!c.caixaAberta && !avisouCaixaFechada) {
    avisouCaixaFechada = true;
    aviso('A janela de som deste PC está fechada: as caixas não vão tocar.');
  }
  if (c.caixaAberta) avisouCaixaFechada = false;

  if (c.modo === 'player') {
    const f = faixaDoPlayer(c);
    const trocou = f?.id !== estado.exibida?.id;
    estado.exibida = trocou ? f : { ...estado.exibida, ...f };
    estado.pendente = null;
    if (estado.agora) {
      estado.agora.proximas = c.proximas;
      estado.agora.tocaram = [];
      estado.agora.atrasoAudio = 0;
    }
    if (trocou || mudouModo) {
      atualizarBarra();
      if (estado.rota === '' || estado.rota === 'inicio') desenhar();
    }
  }
  if (mudouModo) atualizarAgora().then(() => {
    if (estado.rota === '' || estado.rota === 'inicio') desenhar();
  });
}

async function lerCaixa() {
  if (Date.now() - caixaMexidaEm < 1000) return;
  try {
    const r = await fetch('api/caixa', { cache: 'no-store' });
    if (r.ok && Date.now() - caixaMexidaEm >= 1000) aplicarCaixa(await r.json());
  } catch { /* sem rede agora: tenta na próxima */ }
}

async function comandoCaixa(corpo) {
  let resposta;
  caixaMexidaEm = Date.now();
  try {
    const r = await fetch('api/caixa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    resposta = await r.json();
    if (!r.ok && resposta.erro) aviso(resposta.erro);
    caixaMexidaEm = Date.now();
  } catch {
    caixaMexidaEm = 0;
    aviso('Não consegui falar com as caixas.');
    return;
  }
  if (resposta.modo) aplicarCaixa(resposta);
}

function alternar() {
  const pausar = estado.ouvindo;
  definirEstadoBotoes(pausar ? 'parado' : 'tocando');
  comandoCaixa({ acao: pausar ? 'pausar' : 'continuar' });
}

function passar(acao, texto) {
  if (estado.caixa?.modo === 'player') comandoCaixa({ acao });
  else passarMusica(`api/${acao}`, texto);
}

let passando = false;

async function passarMusica(rota, texto) {
  if (passando) return;
  passando = true;
  aviso(texto, true);
  document.querySelectorAll('.botao-passar').forEach(b => { b.disabled = true; });
  try {
    const r = await fetch(rota, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) aviso(d.erro || 'A música não trocou.');
    else $('aviso-tocar').hidden = true;
    atualizarAgora();
  } catch {
    aviso('Não consegui falar com o app. A música não trocou.');
  } finally {
    passando = false;
    document.querySelectorAll('.botao-passar').forEach(b => { b.disabled = false; });
  }
}

function atualizarSessaoDeMidia(f) {
  if (!('mediaSession' in navigator) || !f) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: f.titulo,
    artist: f.artista,
    album: 'Rádio CLUBE',
    artwork: f.id
      ? [{ src: new URL(capaDaFaixa(f.id), location.href).href, sizes: '512x512' }]
      : [{ src: new URL('icones/512.png', location.href).href, sizes: '512x512', type: 'image/png' }],
  });
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', alternar);
  navigator.mediaSession.setActionHandler('pause', alternar);
}

// ---------- controles ----------

$('tocar').addEventListener('click', alternar);
$('tela-tocar').addEventListener('click', alternar);
document.querySelectorAll('[data-modo]').forEach(b => {
  b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') !== 'true') comandoCaixa({ acao: 'modo', modo: b.dataset.modo });
  });
});
document.addEventListener('click', ev => {
  if (ev.target.closest('[data-acao="tocar"]')) alternar();
  if (ev.target.closest('[data-acao="proxima"]')) passar('proxima', 'Passando para a próxima…');
  if (ev.target.closest('[data-acao="anterior"]')) passar('anterior', 'Voltando para a anterior…');
});

// ---------- clicar numa música: entra no ar na hora ----------

let timerAviso = null;
function aviso(texto, fica) {
  let caixa = $('aviso-tocar');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = 'aviso-tocar';
    caixa.className = 'aviso-tocar';
    caixa.setAttribute('role', 'status');
    document.body.append(caixa);
  }
  caixa.textContent = texto;
  caixa.hidden = false;
  clearTimeout(timerAviso);
  if (!fica) timerAviso = setTimeout(() => { caixa.hidden = true; }, 6000);
}

let entrandoNoAr = false;
async function tocarNaRadio(linha) {
  if (estado.caixa?.modo === 'player') {
    const [nome, id] = estado.rota.split('/');
    return comandoCaixa({ acao: 'tocar', id: linha.dataset.id, momento: nome === 'momento' ? id : null });
  }
  if (entrandoNoAr) return aviso('Espere: outra música está entrando.');
  entrandoNoAr = true;
  const titulo = linha.querySelector('.faixa-titulo')?.textContent || 'Música';
  linha.classList.add('entrando');
  aviso(`Entrando: ${titulo}`, true);
  try {
    const r = await fetch('api/tocar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: linha.dataset.id }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) aviso(d.erro || 'A rádio não trocou a música.');
    else if (d.entrou) aviso(`No ar: ${titulo}`);
    else aviso(`${titulo} entra logo depois do que está no ar.`);
  } catch {
    aviso('Não consegui falar com o app. A música não trocou.');
  } finally {
    entrandoNoAr = false;
    linha.classList.remove('entrando');
  }
}

document.addEventListener('click', ev => {
  if (ev.target.closest('a, button')) return;
  const linha = ev.target.closest('.faixa[data-id]');
  if (linha) tocarNaRadio(linha);
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.matches?.('.faixa[data-id]')) tocarNaRadio(ev.target);
});

// A barra muda o som que sai das caixas do PC, e não o da página neste aparelho.
const camposVolume = [...document.querySelectorAll('.campo-volume')];
let volumeMexidoEm = 0;
let volumePendente = null;
let enviandoVolume = false;

function mostrarVolume(v) {
  for (const campo of camposVolume) {
    campo.value = v;
    campo.style.setProperty('--cheio', `${v * 100}%`);
  }
}

async function lerVolume() {
  try {
    const r = await fetch('api/volume', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (!enviandoVolume && Date.now() - volumeMexidoEm >= 2000) mostrarVolume(d.volume);
  } catch { /* sem rede agora: tenta na próxima */ }
}

// Só um envio por vez, sempre com o valor mais recente: arrastar a barra manda muitos seguidos.
async function enviarVolume() {
  if (enviandoVolume) return;
  enviandoVolume = true;
  try {
    while (volumePendente !== null) {
      const volume = volumePendente;
      volumePendente = null;
      const r = await fetch('api/volume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ volume }),
      });
      if (!r.ok) throw new Error('volume recusado');
    }
  } catch {
    volumePendente = null;
    volumeMexidoEm = 0;
    aviso('Não consegui mudar o volume das caixas.');
  } finally {
    enviandoVolume = false;
  }
}

for (const campo of camposVolume) {
  campo.addEventListener('input', () => {
    const v = Number(campo.value);
    volumeMexidoEm = Date.now();
    mostrarVolume(v);
    volumePendente = v;
    enviarVolume();
  });
}
lerVolume();
setInterval(lerVolume, 2000);
lerCaixa();
setInterval(lerCaixa, 2000);

// Sincronia: volume, modo das caixas e música no ar acompanham na hora o que outro aparelho mudou.
// As leituras acima ficam de reserva, para quando esta conexão cair.
const sincronia = new EventSource('api/sinc');
sincronia.onmessage = ev => {
  let d;
  try { d = JSON.parse(ev.data); } catch { return; }
  if (d.volume != null && !enviandoVolume && Date.now() - volumeMexidoEm >= 1000) mostrarVolume(d.volume);
  if (d.caixa && Date.now() - caixaMexidaEm >= 1000) aplicarCaixa(d.caixa);
  if (d.agora) atualizarAgora();
};

$('abrir-tela').addEventListener('click', () => { $('tela-cheia').hidden = false; });
$('fechar-tela').addEventListener('click', () => { $('tela-cheia').hidden = true; });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') $('tela-cheia').hidden = true;
});

window.addEventListener('hashchange', desenhar);

// ---------- início ----------

atualizarAgora();
setInterval(atualizarAgora, 5000);
setInterval(atualizarTempo, 1000);
