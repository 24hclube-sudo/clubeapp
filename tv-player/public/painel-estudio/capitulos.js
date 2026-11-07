// Capítulos do painel: cada um responde a um grupo de visuais do LED da pista, com o mesmo elenco e a mesma matéria,
// na escala da faixa. O campo `led` lista os ids de VISUAIS em visuais-led.js.
(function (raiz) {
  'use strict';
  const M = raiz.PainelMotor, W = M.W, CENTRO = W / 2;
  let n = 0;
  const id = () => 'c' + (++n).toString(36);
  const E = (efeito, o) => Object.assign({ id: id(), tipo: 'efeito', efeito, opacidade: 1 }, o);
  const A = (artes, o) => Object.assign({ id: id(), tipo: 'arte', artes, tamanho: 96, y: 0.5, x: 0, caminho: 'parado', vel: 40, dir: -1, espaco: 600, copias: 1, trat: 'original', opacidade: 1 }, o);
  const V = (artes, o) => Object.assign({ id: id(), tipo: 'video', artes, tamanho: 150, y: 0.5, x: 0, caminho: 'parado', vel: 40, dir: -1, espaco: 600, copias: 1, opacidade: 1, mistura: 'lighter' }, o);
  const TX = (texto, o) => Object.assign({ id: id(), tipo: 'texto', texto, fonte: 'archivo', peso: 300, italico: false, tracking: 0, tamanho: 50, y: 0.5, x: 0, caminho: 'parado', vel: 40, dir: -1, espaco: 1200, copias: 1, trat: 'white', opacidade: 1 }, o);
  const B = o => Object.assign({ id: id(), tipo: 'blocos', colunas: 26, linhas: 1, semente: 1, pinturas: ['metal', 'black', 'deepGrey'], modo: 'varredura', quadros: 10, paradas: 8, voltas: 1, dir: -1, vao: 0, opacidade: 1 }, o);
  const sol = l => 'sol-' + l;
  const elenco = (...ls) => ls.map(sol);
  const LOGO = (o) => A(['logo-clube'], Object.assign({ tamanho: 64, x: CENTRO, trat: 'metal', reflexo: 2, nome: 'Logo' }, o));

  const LISTA = [
    { id: 'feixes', nome: 'Feixes', grupo: 'Regência', duracao: 48, led: ['r-feixes', 'r-nave', 'r-eixo', 'r-losango', 'r-lamina'],
      frase: 'Moving lights na névoa. Nascem na borda de baixo da faixa e varrem os oito metros, com o logo parado no meio.',
      camadas: () => [
        E('estrelas', { densidade: 24, semente: 21 }),
        E('feixes', { qtd: 15, ciclos: 2, abertura: 1.38 }),
        E('clareira', { x: CENTRO, largura: 310, borda: 90 }),
        LOGO(),
      ] },
    { id: 'astrolabio', nome: 'Astrolábio', grupo: 'Regência', duracao: 60, led: ['r-astrolabio'],
      frase: 'Anéis de inox em volta do logo, cada um no seu tempo, como um instrumento do tamanho da parede.',
      camadas: () => [
        E('estrelas', { densidade: 34, semente: 22 }),
        E('aneis', { x: CENTRO, qtd: 12, ciclos: 3, voltas: 8 }),
        E('clareira', { x: CENTRO, largura: 250, borda: 14 }),
        LOGO({ tamanho: 58 }),
      ] },
    { id: 'mercurio', nome: 'Mercúrio', grupo: 'Regência', duracao: 48, led: ['r-mercurio'],
      frase: 'A faixa vira um fio de mercúrio. As ondas nascem em vários pontos e se cruzam até a parede inteira tremer.',
      camadas: () => [
        E('mercurio', { qtd: 7, ciclos: 9, onda: 260, semente: 5 }),
        E('clareira', { x: CENTRO, largura: 310, borda: 80 }),
        LOGO(),
      ] },
    { id: 'micelio', nome: 'Micélio', grupo: 'Regência', duracao: 60, led: ['r-micelio'],
      frase: 'Um organismo de prata cresce das duas pontas da faixa e procura o logo no meio. Quando chega, recomeça.',
      camadas: () => [
        E('estrelas', { densidade: 18, semente: 23 }),
        E('micelio', { x: CENTRO, ciclos: 2, semente: 3 }),
        LOGO(),
      ] },
    { id: 'enxame', nome: 'Enxame', grupo: 'Regência', duracao: 54, led: ['r-enxame'],
      frase: 'Milhares de pontos no ar. De tempos em tempos eles formam um personagem da marca e se desfazem.',
      camadas: () => [
        E('estrelas', { densidade: 190, cadentes: 3, semente: 24 }),
        A(elenco('b', 'a', 'j', 'g', 'e', 'f', 'i', 'd', 'c'), { nome: 'Personagem', tamanho: 98, y: 0.5, x: CENTRO, copias: 5, espaco: 880, troca: 'montar', trocas: 9, atraso: 0.22, celulas: 27 }),
      ] },
    { id: 'colossos', nome: 'Colossos', grupo: 'Marca em inox', duracao: 90, led: ['m-colossos', 'm-colossos-todos', 'm-gigante', 'universo'],
      frase: 'Personagens maiores que a faixa cruzam a fresta. Quem passa no bar lê um pedaço do corpo por vez.',
      camadas: () => [
        E('estrelas', { densidade: 34, cadentes: 2, semente: 5 }),
        A(elenco('a', 'i', 'b'), { nome: 'Colossos', tamanho: 620, y: 0.3, varreY: 0.5, ciclosY: 2, espaco: 1490, caminho: 'passar', vel: 50, reflexo: 3 }),
        E('clareira', { x: CENTRO, largura: 420, borda: 200 }),
        LOGO(),
      ] },
    { id: 'travessia', nome: 'Travessia', grupo: 'Marca em inox', duracao: 60, led: ['m-travessia', 'm-travessia-todos', 'm-desfile', 'm-queda'],
      frase: 'O elenco inteiro atravessa em fila sobre uma grade de inox, na direção da escada para a pista.',
      camadas: () => [
        E('estrelas', { densidade: 26, semente: 3 }),
        E('grade', { passo: 172, ciclos: 3 }),
        A(elenco('a', 'b', 'e', 'f', 'g', 'j', 'c', 'i', 'd'), { nome: 'Elenco', tamanho: 95, y: 1, espaco: 497, caminho: 'passar', vel: 75, balanco: 1.4, ciclosB: 48, reflexo: 2 }),
      ] },
    { id: 'instancia', nome: 'Instância', grupo: 'Marca em inox', duracao: 54, led: ['m-instancia', 'm-instancia-todos'],
      frase: 'Blocos se soltam e montam um personagem de cada vez, com o logo parado no meio.',
      camadas: () => [
        E('estrelas', { densidade: 30, semente: 7 }),
        E('grade', { passo: 86, ciclos: 2 }),
        A(elenco('a', 'b', 'e', 'f', 'g', 'j', 'c', 'i', 'd'), { nome: 'Montagem', tamanho: 98, y: 0.5, x: CENTRO, copias: 4, espaco: 1080, troca: 'montar', trocas: 9, atraso: 0.17, celulas: 13, reflexo: 2 }),
        LOGO(),
      ] },
    { id: 'grade', nome: 'Grade de inox', grupo: 'Marca em inox', duracao: 48, led: ['m-grade', 'g-grade'],
      frase: 'O grid da marca em chapas caneladas. Os blocos varrem numa direção só, em ciclos.',
      camadas: () => [
        B({ nome: 'Grid', colunas: 26, pinturas: ['metal', 'black', 'deepGrey', 'black', 'metal', 'baseGrey', 'black'], paradas: 8, canelado: true, reflexo: 2, vao: 2, semente: 4 }),
        E('clareira', { x: CENTRO, largura: 360, borda: 24 }),
        LOGO({ tamanho: 56, trat: 'white', reflexo: 0 }),
      ] },
    { id: 'monolito', nome: 'Monólito', grupo: 'Marca em inox', duracao: 40, led: ['m-monolito'],
      frase: 'O logo em cinco blocos de inox, um de cada vez dá uma volta lenta.',
      camadas: () => [
        E('estrelas', { densidade: 22, semente: 9 }),
        A(['logo-clube'], { nome: 'Logos', tamanho: 74, x: CENTRO, copias: 5, espaco: 880, trat: 'metal', reflexo: 3, troca: 'virar', trocas: 5, atraso: 0.2 }),
      ] },
    { id: 'via-lactea', nome: 'Via Láctea', grupo: 'Firmamento', duracao: 60, led: ['f-lactea', 'g-constelacao'],
      frase: 'A galáxia deita na faixa. O núcleo acende atrás do logo, como na parede do DJ.',
      camadas: () => [
        E('via', { brilho: 0.9, semente: 2 }),
        E('estrelas', { densidade: 120, cadentes: 5, semente: 2 }),
        E('eclipse', { x: CENTRO, disco: false, raio: 24, alcance: 1100, ciclos: 3, opacidade: 0.6 }),
        LOGO({ trat: 'black', reflexo: 0 }),
      ] },
    { id: 'rastros', nome: 'Rastros', grupo: 'Firmamento', duracao: 45, led: ['f-rastros', 'f-aneis', 'g-aneis'],
      frase: 'Longa exposição: riscos de estrela correm em volta do logomark, que gira devagar no centro.',
      camadas: () => [
        E('rastros', { qtd: 74, voltas: 1, dir: -1, semente: 4 }),
        E('estrelas', { densidade: 34, semente: 8 }),
        E('clareira', { x: CENTRO, largura: 90, borda: 90 }),
        A(['logomark'], { nome: 'Logomark', tamanho: 78, x: CENTRO, trat: 'metal', giro: 3, reflexo: 2 }),
      ] },
    { id: 'aurora', nome: 'Aurora', grupo: 'Firmamento', duracao: 60, led: ['f-aurora', 'g-mare'],
      frase: 'Cortinas de luz prateada descem da borda de cima da faixa. O logo aparece e some nelas.',
      camadas: () => [
        E('estrelas', { densidade: 70, semente: 6 }),
        E('aurora', { brilho: 0.85 }),
        E('clareira', { x: CENTRO, largura: 330, borda: 240 }),
        LOGO({ tamanho: 58 }),
      ] },
    { id: 'eclipse', nome: 'Eclipse', grupo: 'Firmamento', duracao: 45, led: ['f-eclipse', 'f-horizonte'],
      frase: 'A lua cobre o sol no meio da faixa. A coroa corre oito metros de parede para os dois lados.',
      camadas: () => [
        E('estrelas', { densidade: 60, semente: 11 }),
        E('rastros', { qtd: 26, voltas: 1, dir: 1, semente: 9, opacidade: 0.5 }),
        E('eclipse', { x: CENTRO, raio: 41, alcance: 1900, ciclos: 3 }),
        A(['logo-clube'], { nome: 'Logos', tamanho: 56, x: CENTRO, copias: 2, espaco: 2300, trat: 'metal', reflexo: 2 }),
      ] },
    { id: 'brise', nome: 'Brise', grupo: 'Escultura cinética', duracao: 54, led: ['c-brise', 'c-camadas'],
      frase: 'Lâminas de inox fecham a faixa e abrem em onda. Pelo vão aparece o personagem.',
      camadas: () => [
        E('estrelas', { densidade: 40, semente: 12 }),
        A(elenco('b', 'g', 'j', 'a'), { nome: 'Personagens', tamanho: 300, y: 0.28, varreY: 0.5, ciclosY: 2, espaco: 900, caminho: 'passar', vel: 67, reflexo: 2 }),
        E('brise', { passo: 34, ciclos: 3, onda: 1490, brilho: 0.8 }),
      ] },
    { id: 'harpa', nome: 'Harpa de cabos', grupo: 'Escultura cinética', duracao: 48, led: ['c-cabos', 'c-relevo', 'r-cordas'],
      frase: 'Cabos de aço correm os oito metros. O elenco passa atrás e faz cada cabo vibrar.',
      camadas: () => [
        A(elenco('e', 'f', 'g', 'c', 'i', 'd'), { nome: 'Elenco', tamanho: 95, y: 1, espaco: 745, caminho: 'passar', vel: 93, opacidade: 0.75 }),
        E('harpa', { qtd: 9, voltas: 2, amp: 14 }),
      ] },
    { id: 'agulhas', nome: 'Agulhas', grupo: 'Escultura cinética', duracao: 45, led: ['c-agulhas', 'laminas', 'g-espectro', 'g-onda', 'g-bumbo'],
      frase: 'Tela de hastes de aço: uma onda atravessa e as hastes descem até o chão da faixa.',
      camadas: () => [
        E('agulhas', { passo: 9, voltas: 1, ondas: 4 }),
        E('clareira', { x: CENTRO, largura: 360, borda: 70 }),
        LOGO(),
      ] },
    { id: 'concreto', nome: 'Concreto abrindo', grupo: 'Espaço de pé', duracao: 48, led: ['e-concreto', 'concreto-ceu', 'e-caixotoes', 'caixotoes', 'brutal'],
      frase: 'Cimento queimado que se abre nas juntas para o céu preto. O logo fica gravado na placa.',
      camadas: () => [
        E('estrelas', { densidade: 130, cadentes: 2, semente: 13 }),
        E('concreto', { abertura: 58, ciclos: 2, semente: 3, brilho: 0.92 }),
        A(['logo-clube'], { nome: 'Logo gravado', tamanho: 56, x: CENTRO, trat: 'relevo' }),
      ] },
    { id: 'porticos', nome: 'Pórticos', grupo: 'Espaço de pé', duracao: 40, led: ['e-porticos', 'porticos', 'e-teto', 'teto-ceu', 'g-faixas', 'g-pulso', 'g-scanner', 'g-flash', 'r-portal'],
      frase: 'Voo por pórticos de inox até o ponto de fuga no meio da faixa, onde está o logo.',
      camadas: () => [
        E('estrelas', { densidade: 30, semente: 14 }),
        E('porticos', { x: CENTRO, qtd: 16, voltas: 2, brilho: 0.82 }),
        E('clareira', { x: CENTRO, largura: 330, borda: 26 }),
        LOGO(),
      ] },
    { id: 'luz', nome: 'Luz', grupo: 'Fundo preto', duracao: 40, led: ['luz', 'g-cromo', 'g-clube'],
      frase: 'O painel vira luminária: tubos acendem com um tremido e esfriam devagar.',
      camadas: () => [
        E('tubos', { qtd: 24, semente: 8 }),
        A(['logomark'], { nome: 'Logomark', tamanho: 70, x: CENTRO, copias: 2, espaco: 2800, trat: 'metal', giro: 2 }),
      ] },
    { id: 'relevo', nome: 'Chapa gravada', grupo: 'Metal', duracao: 40, led: ['placa-latao', 'placa-ouro', 'placa-prata', 'h3-olho', 'h3-abrir'],
      frase: 'Inox escovado com o logo em baixo-relevo, como pede o brand book. Só o reflexo se move.',
      camadas: () => [
        E('inox', { brilho: 0.6, voltas: 2, esticar: 1100 }),
        A(['logo-clube'], { nome: 'Logos', tamanho: 58, x: 0, caminho: 'passar', vel: 28, espaco: 1118, trat: 'relevo' }),
        E('reflexo', { voltas: 2, largura: 700, brilho: 0.34 }),
      ] },
    { id: 'roda', nome: 'Elenco em 360', grupo: 'Marca em inox', duracao: 48, led: ['m-roda'],
      frase: 'O estado Instância da marca: as figuras giram 360° no próprio eixo, vídeo original do TouchDesigner.',
      camadas: () => [
        E('estrelas', { densidade: 26, semente: 15 }),
        V(['v-a-detalhe-alto-iso', 'v-f-detalhe-alto-iso', 'v-i-detalhe-alto-iso', 'v-g-detalhe-alto-iso'], { nome: 'Instância', tamanho: 132, x: CENTRO, copias: 4, espaco: 1118, caminho: 'parado' }),
      ] },
  ];

  // A noite inteira numa peça só: capítulos em sequência, com fusão. A cada troca a duração muda, então os ciclos
  // são recalculados para manter a mesma velocidade de cada capítulo.
  const CICLOS = ['voltas', 'ciclos', 'ciclosY', 'ciclosB', 'ciclosR', 'reflexo', 'trocas', 'giro', 'paradas', 'cadentes'];
  function sequencia(ids, segundos) {
    const caps = ids.map(i => LISTA.find(c => c.id === i)).filter(Boolean);
    const total = caps.length * segundos, camadas = [];
    caps.forEach((cap, i) => {
      for (const c of cap.camadas()) {
        const d = Object.assign({}, c, { id: id(), capitulo: cap.id });
        for (const k of CICLOS) if (typeof d[k] === 'number' && d[k] !== 0) d[k] = Math.max(1, Math.round(d[k] * (total / cap.duracao)));
        d.janela = { ini: i / caps.length, fim: (i + 1) / caps.length, fade: 1.2 / total };
        camadas.push(d);
      }
    });
    return { duracao: total, camadas };
  }

  raiz.PainelCapitulos = {
    LISTA,
    SEQUENCIA: { id: 'noite', nome: 'A noite inteira', grupo: 'Sequência', frase: 'Seis capítulos do LED em seguida, 30 s cada, com fusão.', ids: ['via-lactea', 'travessia', 'colossos', 'grade', 'porticos', 'concreto'], segundos: 30 },
    comp(idCap) {
      if (idCap === 'noite') { const s = this.SEQUENCIA, r = sequencia(s.ids, s.segundos); return { nome: s.nome, duracao: r.duracao, camadas: r.camadas, capitulo: 'noite', led: [] }; }
      const c = LISTA.find(x => x.id === idCap);
      if (!c) return null;
      return { nome: c.nome, duracao: c.duracao, camadas: c.camadas(), capitulo: c.id, led: c.led.slice() };
    },
    fabricas: { E, A, V, TX, B, id },
  };
})(typeof self !== 'undefined' ? self : this);
