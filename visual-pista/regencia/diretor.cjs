// Diretor automático. Roda dentro da saída do LED (main.js) e decide sozinho, ouvindo a análise da faixa:
//  - elementos: liga e desliga luz de trás, booth, brilhinhos e o jeito de o logo reagir, conforme a seção. Vale em todos os visuais em 3D. Não grava nada: desligou, volta o que está no app.
//  - cenas: troca de visual em cima da batida. O próximo carrega por trás e só entra no tempo 1. Num build, deixa a cena do drop pronta e corta no bumbo.
// Quem escolhe um visual à mão segura a cena: o diretor respeita por 2 minutos.
const fs = require('fs');
const path = require('path');

const PADRAO = {
  elementos: false,      // os elementos mudam sozinhos
  cenas: false,          // as cenas mudam sozinhas
  frequencia: 'secao',   // 'musica' (só quando a música muda de verdade) | 'secao' (a cada parte) | 'frase' (a cada 16 compassos)
  grupos: ['regencia', 'firmamento', 'espaco', 'marca', 'cinetica'],
  fumaca: false,         // solta fumaça no break, sozinha
};

// Peso de cada cena: calma para break e começo, forte para drop e pico.
const GRUPOS = {
  regencia: { calma: ['r-mercurio', 'r-micelio', 'r-cordas', 'r-lamina'], media: ['r-astrolabio', 'r-enxame', 'r-mercurio', 'r-nave', 'r-portal', 'r-cordas'], forte: ['r-feixes', 'r-astrolabio', 'r-enxame', 'r-eixo', 'r-losango', 'r-nave', 'r-lamina', 'r-portal'] },
  firmamento: { calma: ['f-lactea', 'f-aurora', 'f-rastros'], media: ['f-eclipse', 'f-aneis'], forte: ['f-horizonte', 'f-eclipse'] },
  espaco: { calma: ['e-concreto', 'e-caixotoes'], media: ['e-teto'], forte: ['e-porticos'] },
  marca: { calma: ['m-monolito', 'm-colossos'], media: ['m-travessia-todos', 'm-instancia-todos', 'm-grade'], forte: ['m-roda', 'm-queda', 'm-gigante', 'm-desfile'] },
  cinetica: { calma: ['c-camadas', 'c-relevo'], media: ['c-brise', 'c-cabos'], forte: ['c-agulhas'] },
};
const PESO_SECAO = { silencio: 'calma', calmo: 'calma', break: 'calma', groove: 'media', build: 'media', pico: 'forte', drop: 'forte' };

// O que cada seção pede dos elementos. Só os itens de /api/reacoes que não mudam o gosto do logo: acabamento e tamanho seguem o que foi escolhido.
const ELEMENTOS = {
  silencio: { contraluz: 'desligado', booth: 'desligado', faixa: 'desligado', brilhinhos: 'desligado', meteoros: 'ligado', logoReage: 'acende', logoFonte: 'grave', luz: 'desligado' },
  calmo: { contraluz: 'desligado', booth: 'desligado', faixa: 'desligado', brilhinhos: 'agudo', meteoros: 'ligado', logoReage: 'acende', logoFonte: 'grave', luz: 'grave' },
  groove: { contraluz: 'grave', estiloLuz: 'halo', booth: 'bumbo', faixa: 'desligado', brilhinhos: 'agudo', meteoros: 'desligado', logoReage: 'acende', logoFonte: 'bumbo', luz: 'grave' },
  pico: { contraluz: 'bumbo', estiloLuz: 'neon', booth: 'bumbo', faixa: 'bumbo', brilhinhos: 'agudo', meteoros: 'desligado', logoReage: 'pulsa', logoFonte: 'bumbo', luz: 'bumbo' },
  break: { contraluz: 'medio', estiloLuz: 'aurora', booth: 'desligado', faixa: 'desligado', brilhinhos: 'desligado', meteoros: 'ligado', logoReage: 'onda', logoFonte: 'medio', luz: 'medio' },
  build: { contraluz: 'agudo', estiloLuz: 'neon', booth: 'agudo', faixa: 'agudo', brilhinhos: 'agudo', meteoros: 'desligado', logoReage: 'equalizador', logoFonte: 'agudo', luz: 'agudo' },
  drop: { contraluz: 'bumbo', estiloLuz: 'neon', booth: 'bumbo', faixa: 'bumbo', brilhinhos: 'bumbo', meteoros: 'desligado', logoReage: 'pulsa', logoFonte: 'bumbo', luz: 'bumbo' },
};

function criarDiretor({ pasta, trocar, jaNoAr, carregando, comandoPagina, aoElementos, aoFumaca, log, visuais }) {
  const ARQ = path.join(pasta, 'diretor.json');
  let cfg = { ...PADRAO };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(ARQ, 'utf8')) }; } catch {}
  const guardar = () => { try { fs.writeFileSync(ARQ, JSON.stringify(cfg, null, 1)); } catch {} };

  let foto = null, ultFoto = 0, entrada = '';
  let seguraAte = 0, ultimaTroca = 0, compassoUltima = -99, ultimoMudou = '';
  let historia = [], preparada = null, elementosAgora = null;
  const eventosRecentes = [];

  const valeNoGrupo = (peso) => {
    const lista = [];
    for (const g of cfg.grupos) {
      const G = GRUPOS[g];
      if (!G) continue;
      for (const id of G[peso] || []) if (visuais[id] !== undefined) lista.push(id);
    }
    return lista;
  };
  // Sorteio que não repete o que passou há pouco
  function proxima(secao) {
    const peso = PESO_SECAO[secao] || 'media';
    let lista = valeNoGrupo(peso);
    if (!lista.length) lista = [...valeNoGrupo('media'), ...valeNoGrupo('calma'), ...valeNoGrupo('forte')];
    if (!lista.length) return null;
    const fresca = lista.filter(id => !historia.includes(id) && id !== jaNoAr());
    const de = fresca.length ? fresca : lista.filter(id => id !== jaNoAr());
    const base = de.length ? de : lista;
    return base[Math.floor(Math.random() * base.length)];
  }
  function registrar(id) { historia.push(id); if (historia.length > 8) historia.shift(); }

  // Tempo de 1 compasso, para o corte cair no tempo 1
  const tempoAteTempo1 = () => {
    if (!foto || !foto.bpm) return 0;
    const dur = 60 / foto.bpm;
    const fr = foto.fase - Math.floor(foto.fase);
    const idade = (Date.now() - ultFoto) / 1000;
    const faltam = (4 - foto.noCompasso - fr) * dur - idade;
    return faltam > 0.05 ? faltam : faltam + 4 * dur;
  };

  function mudar(motivo, secao) {
    if (!cfg.cenas || Date.now() < seguraAte || carregando() || preparada) return;
    const id = proxima(secao);
    if (!id) return;
    // Uma cena nova leva 1 s para carregar. Abaixo disso, deixa para o tempo 1 seguinte.
    let espera = tempoAteTempo1();
    if (espera < 1.6) espera += foto && foto.bpm ? 4 * 60 / foto.bpm : 2;
    ultimaTroca = Date.now();
    compassoUltima = foto ? foto.compasso : 0;
    registrar(id);
    ultimoMudou = motivo;
    log(`diretor: ${id} (${motivo}, corte em ${espera.toFixed(2)} s)`);
    trocar(id, Date.now() + espera * 1000);
  }

  function aplicarElementos(secao) {
    if (!cfg.elementos) return;
    const pedido = ELEMENTOS[secao];
    if (!pedido) return;
    elementosAgora = pedido;
    aoElementos(pedido);
  }

  // Build: deixa a cena forte pronta por trás, e o drop corta na hora
  function preparar() {
    if (!cfg.cenas || preparada || Date.now() < seguraAte || carregando()) return;
    const id = proxima('drop');
    if (!id) return;
    preparada = id;
    registrar(id);
    log(`diretor: deixando ${id} pronta para o drop`);
    trocar(id, Date.now() + 40000, true);   // sem hora certa: quem corta é o drop
  }
  function largarPreparada() { if (preparada) { preparada = null; trocar(null); } }
  function cortarPreparada() {
    if (!preparada) return false;
    trocar(preparada, Date.now());
    log(`diretor: corte no drop (${preparada})`);
    preparada = null;
    ultimaTroca = Date.now(); compassoUltima = foto ? foto.compasso : 0; ultimoMudou = 'drop';
    return true;
  }

  function aoEvento(e) {
    eventosRecentes.push(e);
    if (eventosRecentes.length > 40) eventosRecentes.shift();
    if (e.tipo === 'secao') {
      aplicarElementos(e.secao);
      if (e.secao === 'build' && cfg.frequencia !== 'musica') preparar();
      if (e.secao === 'break' && e.de !== 'build' && cfg.fumaca) aoFumaca();
      const dur = foto && foto.bpm ? 60 / foto.bpm * 4 : 2;
      const passou = foto ? foto.compasso - compassoUltima : 99;
      if (e.secao === 'drop') {
        if (cortarPreparada()) return;
        if (cfg.frequencia !== 'musica' && passou >= 8) mudar('drop', 'drop');
        return;
      }
      if (cfg.frequencia === 'secao' && passou >= 16 && (e.secao === 'break' || e.secao === 'pico' || e.secao === 'calmo')) mudar(e.secao, e.secao);
      void dur;
    } else if (e.tipo === 'faixa') {
      const passou = foto ? foto.compasso - compassoUltima : 99;
      if (passou >= 8) mudar('música nova', foto ? foto.secao : 'groove');
    } else if (e.tipo === 'frase') {
      const passou = foto ? foto.compasso - compassoUltima : 99;
      if (cfg.frequencia === 'frase' && e.de16 && passou >= 16) mudar('16 compassos', foto ? foto.secao : 'groove');
    }
  }

  return {
    aoEvento,
    aoFoto(f, nome) {
      if (foto && foto.secao !== f.secao && !elementosAgora) aplicarElementos(f.secao);
      foto = f; ultFoto = Date.now(); if (nome) entrada = nome;
      if (cfg.elementos && !elementosAgora) aplicarElementos(f.secao);
      // A foto e o aviso do drop vêm por caminhos separados: quem chegar primeiro corta. Entre break e build a música vai e volta, e a cena continua pronta.
      // Se o bumbo voltar sem drop, solta e libera a placa.
      if (preparada) {
        if (f.secao === 'drop') cortarPreparada();
        else if (f.secao !== 'build' && f.secao !== 'break') largarPreparada();
      }
    },
    // alguém escolheu à mão
    manual() { seguraAte = Date.now() + 120000; if (preparada) largarPreparada(); },
    // a saída desistiu da cena pronta, porque o drop demorou demais
    soltou() { preparada = null; },
    elementosAtuais: () => (cfg.elementos ? elementosAgora : null),
    config: () => cfg,
    ajustar(novo) {
      for (const k of Object.keys(PADRAO)) if (novo[k] !== undefined) cfg[k] = novo[k];
      if (!cfg.elementos) { elementosAgora = null; aoElementos(null); } else if (foto) aplicarElementos(foto.secao);
      if (!cfg.cenas && preparada) largarPreparada();
      guardar();
      return cfg;
    },
    estado() {
      const velha = !foto || Date.now() - ultFoto > 2500;
      return {
        ...cfg,
        analise: velha ? null : {
          bpm: foto.bpm, conf: foto.conf, secao: foto.secao, energia: foto.energia, tensao: foto.tensao, tom: foto.tom, nota: foto.nota, faixa: foto.faixa,
          compasso: foto.compasso, noCompasso: foto.noCompasso, frase: foto.frase, kick: foto.kick, clap: foto.clap, hat: foto.hat, baixo: foto.baixo, medio: foto.medio, agudo: foto.agudo, voz: foto.voz, musica: foto.musica, entrada,
        },
        seguraPor: Math.max(0, Math.round((seguraAte - Date.now()) / 1000)),
        ultimoMotivo: ultimoMudou,
        preparada,
      };
    },
  };
}
module.exports = { criarDiretor, GRUPOS };
