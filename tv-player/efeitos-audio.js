// Animações áudio-reativas das barras do 5º. O motor (balcao.js) relê este arquivo sozinho quando ele muda:
// animação nova entra sem reiniciar o servidor. Um erro de sintaxe mantém as anteriores; um erro ao desenhar
// deixa só aquela animação preta, sem derrubar as luzes.
//
// O que cada animação recebe em AU (audio-barras.js):
//   f[q]      nível da faixa q (0 bumbo, 1 baixo, 2 médio, 3 agudo), 0–1
//   b[n]      nível da banda n (uma por barra, grave → agudo), 0–1
//   picoF, picoB  picos que caem devagar
//   idade[q]  segundos desde o último golpe da faixa
//   n[q]      quantos golpes a faixa já deu
//   golpes[q] golpes recentes: { i: número do golpe, a: segundos atrás }
//   histF(q, k), histB(n, k)  nível k quadros atrás (25 ms cada, até 127)
//   lento     energia média suavizada; bpm, fase (batidas), conf (acerto); t em segundos
//   fundo     quanto as cenas sempre acesas ficam acesas sem som (0–1), ajustado no monitor
// x: posição da barra (0–1). h: altura (0 embaixo, 1 em cima). i: índice do pixel.
module.exports = ({ au, cor, hex, mix, escala, degrade, frac, hash01, onda01, MARCA }) => {
  const barra = x => Math.floor(x * 8);
  const doCentro = b => (b < 4 ? 3 - b : b - 4); // 0 = barras do meio, 3 = pontas
  const limita = v => Math.max(0, Math.min(1, v));
  const alcance = (h, ate) => limita((ate - h) * 24); // 1 até a altura "ate", com a ponta suave
  const PRETO = [0, 0, 0];

  // Coluna de VU: cor até o nível (mais forte quanto mais alto) e um ponto branco no pico.
  function comPico(c, h, nivel, pico) {
    const k = alcance(h, nivel) * (0.4 + 0.6 * nivel);
    const ponto = pico > 0.04 && Math.abs(h - pico) < 0.014 ? 0.85 : 0;
    return ponto > k ? [255 * ponto, 255 * ponto, 255 * ponto] : escala(c, k);
  }
  // Batida atual: pelo BPM quando ele é confiável; senão, cada bumbo conta como uma batida.
  function batida(AU) {
    if (AU.bpm && AU.conf >= 0.5) { const bat = Math.floor(AU.fase); return { bat, bf: AU.fase - bat, pos: AU.fase }; }
    const bf = Math.min(1, AU.idade[0] / 0.5);
    return { bat: AU.n[0], bf, pos: AU.n[0] + bf };
  }
  // Sem som, a cena respira baixinho em vez de parecer apagada ou com defeito. Erro ao desenhar vira preto.
  const reativo = fn => (p, x, r, fase, h, i) => {
    const AU = au();
    if (AU.ocioso) return escala(cor('branco', x, fase), 0.14 + 0.08 * onda01(AU.t / 7 + barra(x) / 8));
    try { return fn(AU, p, x, r, fase, h, i); } catch { return PRETO; }
  };

  // Cenas sempre acesas: a barra inteira fica no fundo e o som só empurra a intensidade para cima.
  // A função recebe o som e devolve quanto subir (0–1). Sem som, a barra continua acesa no fundo.
  const sempreAcesa = fn => (p, x, r, fase, h, i) => {
    const AU = au(), base = p.fundo != null ? p.fundo : AU.fundo;
    let v = 0;
    if (AU.ocioso) v = 0.06 * onda01(AU.t / 7 + barra(x) / 8);
    else { try { v = fn(AU, p, x, h, i); } catch { v = 0; } }
    return escala(cor(p.cor || 'branco', x, fase), base + (1 - base) * limita(v));
  };

  // Direções: cada uma dá a um pixel a posição u no caminho (0 = onde começa, 1 = onde termina).
  const CAMINHOS = {
    sobe: (b, q, h) => h,
    desce: (b, q, h) => 1 - h,
    direita: b => b / 7,
    esquerda: b => 1 - b / 7,
    abre: (b, q) => q / 3,
    fecha: (b, q) => 1 - q / 3,
    diagonal: (b, q, h) => (b / 7 + h) / 2,
    inversa: (b, q, h) => (1 - b / 7 + h) / 2,
    alterna: (b, q, h) => (b % 2 ? h : 1 - h),
    centro: (b, q, h) => Math.abs(h - 0.5) * 2,
  };
  const DIRECOES = Object.keys(CAMINHOS);
  // "varia" sorteia uma direção a cada tantos golpes; "vaivem" e "sobedesce" invertem a cada golpe.
  function direcaoDe(p, n, cadaPadrao) {
    if (p.dir === 'varia') return DIRECOES[Math.floor(hash01(Math.floor(n / (p.cada || cadaPadrao)) * 5.7 + 1) * DIRECOES.length)];
    if (p.dir === 'vaivem') return n % 2 ? 'direita' : 'esquerda';
    if (p.dir === 'sobedesce') return n % 2 ? 'sobe' : 'desce';
    return p.dir || 'sobe';
  }
  // Rastro: a intensidade da faixa passeia pelo caminho, como uma onda contínua.
  const nivelRastro = (AU, p, x, h) => {
    const b = barra(x), u = CAMINHOS[direcaoDe(p, AU.n[0], 16)](b, doCentro(b), h);
    return Math.pow(AU.histF(p.faixa || 0, Math.floor(u * (p.atraso || 48))), 1.3);
  };
  // Frente: cada golpe da faixa dispara uma onda com cauda, que atravessa e some.
  const nivelFrente = (AU, p, x, h) => {
    const b = barra(x), q = doCentro(b), vel = p.vel || 2.6, cauda = p.cauda || 0.24;
    let k = 0;
    for (const g of AU.golpes[p.faixa || 0]) {
      const d = g.a * vel - CAMINHOS[direcaoDe(p, g.i, 4)](b, q, h);
      if (d >= 0 && d < cauda) k = Math.max(k, Math.pow(1 - d / cauda, 2));
    }
    return k;
  };

  const QUENTE = hex('#ff7a1a'), AMBAR = hex('#ffc465'), BRASA = hex('#ff3308');
  const CORES_FAIXA = ['#ff2a00', '#ff7a1a', '#00c44a', '#00a0e6'].map(hex);
  const CORES_MARCA = ['#006faf', '#00bae3', '#00c44a', '#ff3308', '#ff7452', '#ffc465'].map(hex);

  const efeitos = {
    // ---------- SEMPRE ACESAS: nunca apagam, só ficam mais fortes ----------
    audioAceso: sempreAcesa((AU, p, x) => { // a barra inteira sobe junto; p.fonte diz o que empurra
      const b = barra(x);
      switch (p.fonte) {
        case 'bumbo': return Math.exp(-AU.idade[0] * (p.queda || 6));
        case 'grave': return AU.f[0] * 0.7 + AU.f[1] * 0.3;
        case 'agudo': return AU.f[3];
        case 'banda': return AU.b[b];
        case 'faixa': return AU.f[doCentro(b)];
        default: return (AU.f[0] + AU.f[1] + AU.f[2] + AU.f[3]) / 3;
      }
    }),
    audioMedidorAceso: sempreAcesa((AU, p, x, h) => { // barra acesa inteira; até o nível do som fica mais forte
      const q = doCentro(barra(x));
      return alcance(h, AU.f[q]) * (0.5 + 0.5 * AU.f[q]);
    }),
    audioRastroAceso: sempreAcesa(nivelRastro),
    audioFrenteAcesa: sempreAcesa(nivelFrente),

    // ---------- DIREÇÕES: o mesmo golpe andando para qualquer lado, com fundo preto ----------
    audioFrente: reativo((AU, p, x, r, fase, h) => escala(cor(p.cor || 'branco', x, fase), nivelFrente(AU, p, x, h))),
    audioRastro: reativo((AU, p, x, r, fase, h) => escala(cor(p.cor || 'branco', x, fase), nivelRastro(AU, p, x, h))),

    // ---------- POR FAIXA: cada frequência manda em um pedaço ----------
    audioFaixas: reativo((AU, p, x, r, fase, h) => { // uma faixa por par de barras: bumbo no meio, agudo nas pontas
      const q = doCentro(barra(x));
      return comPico(cor(p.cor || 'branco', x, fase), h, AU.f[q], AU.picoF[q]);
    }),
    audioEspectro: reativo((AU, p, x, r, fase, h) => { // grave à esquerda, agudo à direita
      const b = barra(x);
      return comPico(degrade(MARCA, b / 8 * 0.72), h, AU.b[b], AU.picoB[b]);
    }),
    audioCamadas: reativo((AU, p, x, r, fase, h) => { // as 4 faixas empilhadas: bumbo embaixo, agudo em cima
      const CAMADAS = [[0, 0.3], [0.3, 0.55], [0.55, 0.8], [0.8, 1]];
      const q = h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.8 ? 2 : 3, [a, z] = CAMADAS[q];
      return escala(CORES_FAIXA[q], AU.f[q] * alcance((h - a) / (z - a), AU.f[q] + 0.08));
    }),
    audioEspelho: reativo((AU, p, x, r, fase, h) => { // o espectro abre do meio da barra para cima e para baixo
      const b = barra(x), nivel = AU.b[b];
      return escala(cor(p.cor || 'branco', x, fase), alcance(Math.abs(h - 0.5) * 2, nivel) * (0.35 + 0.65 * nivel));
    }),
    audioTeto: reativo((AU, p, x, r, fase, h) => { // o nível desce do teto
      const q = doCentro(barra(x));
      return comPico(cor(p.cor || 'branco', x, fase), 1 - h, AU.f[q], AU.picoF[q]);
    }),
    audioCascata: reativo((AU, p, x, r, fase, h) => { // o som sobe pela barra: embaixo é agora, em cima é o que já passou
      const b = barra(x), v = AU.histB(b, Math.floor(h * 86));
      return escala(degrade(MARCA, b / 8 * 0.72), Math.pow(v, 1.3));
    }),
    audioTrilha: reativo((AU, p, x, r, fase, h) => { // o bumbo sobe em V, das barras do meio para as pontas
      const q = doCentro(barra(x)), v = AU.histF(0, Math.min(127, Math.floor(h * 60 + q * 7)));
      return escala(cor(p.cor || 'branco', x, fase), Math.pow(v, 1.6));
    }),
    audioTemperatura: reativo((AU, p, x, r, fase, h) => { // a cor diz onde está o som: vermelho no grave, azul no agudo
      const soma = AU.f[0] + AU.f[1] + AU.f[2] + AU.f[3] + 1e-3;
      const c = (AU.f[1] / 3 + AU.f[2] * 2 / 3 + AU.f[3]) / soma;
      const pos = c * 3, n = Math.min(2, Math.floor(pos));
      return escala(mix(CORES_FAIXA[n], CORES_FAIXA[n + 1], pos - n), limita(soma / 2.4));
    }),
    audioCortina: reativo((AU, p, x, r, fase, h) => { // quanto mais forte o som, mais barras abrem a partir do meio
      const abre = (AU.f[0] + AU.f[1] + AU.f[2]) / 3 * 5.2, q = doCentro(barra(x));
      return escala(cor(p.cor || 'branco', x, fase), limita(abre - q) * 0.85);
    }),
    audioDuelo: reativo((AU, p, x, r, fase, h) => { // grave à esquerda contra agudo à direita
      const esquerda = barra(x) < 4, q = esquerda ? 0 : 3;
      return comPico(CORES_FAIXA[q], h, AU.f[q], AU.picoF[q]);
    }),

    // ---------- NO GOLPE: cada batida dispara alguma coisa ----------
    audioBumbo: reativo((AU, p, x, r, fase, h) => { // todas juntas no bumbo, preto entre um e outro
      const k = Math.exp(-AU.idade[0] * (p.queda || 9));
      const base = AU.f[1] * 0.3 * Math.pow(1 - h, 2);
      return escala(cor(p.cor || 'branco', x, fase), Math.min(1, k * (0.45 + 0.55 * (1 - h * (1 - k))) + base));
    }),
    audioFlash: reativo((AU, p, x, r, fase) => // flash curto e seco, só o bumbo
      escala(cor(p.cor || 'branco', x, fase), Math.exp(-AU.idade[0] * 22))),
    audioOnda: reativo((AU, p, x, r, fase, h) => { // cada bumbo abre do meio para as pontas, de barra em barra
      const q = doCentro(barra(x));
      let k = 0;
      for (const idade of AU.ondas) {
        const a = idade - q * 0.05;
        if (a < 0) continue;
        k = Math.max(k, Math.exp(-a * 7) * alcance(Math.abs(h - 0.5), a * 3 + 0.08));
      }
      return escala(cor(p.cor || 'branco', x, fase), k);
    }),
    audioFoguetes: reativo((AU, p, x, r, fase, h) => { // cada bumbo lança um cometa numa barra sorteada
      const b = barra(x);
      let k = 0;
      for (const g of AU.golpes[0]) {
        if (Math.floor(hash01(g.i * 7.3) * 8) !== b && Math.floor(hash01(g.i * 3.9 + 1) * 8) !== b) continue;
        const d = g.a * 1.9 - h;
        if (d >= 0 && d < 0.4) k = Math.max(k, Math.pow(1 - d / 0.4, 2));
      }
      return escala(cor(p.cor || 'branco', x, fase), k);
    }),
    audioChuva: reativo((AU, p, x, r, fase, h) => { // cada chimbal pinga uma gota do teto
      const b = barra(x);
      let k = 0;
      for (const g of AU.golpes[3]) {
        if (Math.floor(hash01(g.i * 3.1 + 2) * 8) !== b) continue;
        const d = h - (1 - g.a * 1.5);
        if (d >= 0 && d < 0.22) k = Math.max(k, Math.pow(1 - d / 0.22, 2));
      }
      return escala(cor(p.cor || '#00bae3', x, fase), k);
    }),
    audioEncontro: reativo((AU, p, x, r, fase, h) => { // o bumbo sobe, o médio desce
      let quente = 0, frio = 0;
      for (const g of AU.golpes[0]) quente = Math.max(quente, limita(1 - Math.abs(h - g.a * 2.2) / 0.08) * (1 - g.a));
      for (const g of AU.golpes[2]) frio = Math.max(frio, limita(1 - Math.abs(h - (1 - g.a * 2.2)) / 0.06) * (1 - g.a));
      return [255 * quente + hex('#00a0e6')[0] * frio, 82 * quente + 160 * frio, 8 * quente + 230 * frio];
    }),
    audioSorteio: reativo((AU, p, x, r, fase) => { // cada bumbo acende uma barra sorteada, que vai apagando
      const b = barra(x);
      let k = 0;
      for (const g of AU.golpes[0]) if (Math.floor(hash01(g.i * 11.7) * 8) === b) k = Math.max(k, Math.exp(-g.a * 4));
      return escala(cor(p.cor || 'branco', x, fase), k);
    }),
    audioAlternado: reativo((AU, p, x, r, fase) => { // pares e ímpares trocam a cada bumbo
      if (barra(x) % 2 !== AU.n[0] % 2) return PRETO;
      return escala(cor(p.cor || 'branco', x, fase), 0.25 + 0.75 * Math.exp(-AU.idade[0] * 4));
    }),
    audioTrocaCor: reativo((AU, p, x, r, fase, h) => { // cada bumbo muda a cor da marca
      const c = CORES_MARCA[AU.n[0] % CORES_MARCA.length];
      return escala(c, 0.22 + 0.78 * Math.exp(-AU.idade[0] * 5) * (1 - h * 0.25));
    }),
    audioAcumula: reativo((AU, p, x, r, fase) => { // cada bumbo acende mais uma barra; encheu, recomeça
      const b = barra(x), passo = AU.n[0] % 8;
      if (b > passo) return PRETO;
      const nova = b === passo ? Math.exp(-AU.idade[0] * 4) : 0;
      return escala(cor(p.cor || 'branco', x, fase), 0.32 + 0.68 * nova);
    }),
    audioFaisca: reativo((AU, p, x, r, fase, h, i) => { // faíscas no agudo sobre o brilho do bumbo embaixo
      const base = AU.f[0] * 0.5 * Math.pow(1 - h, 2.5);
      const golpe = hash01(i + AU.n[3] * 37) > 0.93 ? Math.exp(-AU.idade[3] * 9) : 0;
      const chia = hash01(i * 1.3 + Math.floor(AU.t * 25)) < AU.f[3] * 0.05 ? 0.55 : 0;
      return escala(cor(p.cor || 'branco', x, fase), Math.min(1, base + golpe + chia));
    }),

    // ---------- NA BATIDA: o movimento anda no BPM da música ----------
    audioPasso: reativo((AU, p, x, r, fase) => { // a luz anda uma barra por batida
      const b = barra(x), { bat, bf } = batida(AU);
      const v = bat % 14, ativa = v < 8 ? v : 14 - v, d = Math.abs(b - ativa);
      const k = d === 0 ? 0.35 + 0.65 * Math.exp(-bf * 3) : d === 1 ? 0.14 * AU.f[1] : 0;
      return escala(cor(p.cor || 'branco', x, fase), k);
    }),
    audioVarredura: reativo((AU, p, x, r, fase) => { // um feixe vai e volta em 4 batidas, mais forte no bumbo
      const { pos } = batida(AU), t = frac(pos / 8), onde = (t < 0.5 ? t * 2 : 2 - t * 2) * 7;
      const d = barra(x) - onde;
      return escala(cor(p.cor || 'branco', x, fase), Math.exp(-d * d * 1.4) * (0.4 + 0.6 * AU.f[0]));
    }),
    audioEscada: reativo((AU, p, x, r, fase, h) => { // degraus em diagonal, um por batida
      const b = barra(x), { bat, bf } = batida(AU), degrau = Math.min(3, Math.floor(h * 4));
      if ((degrau + Math.floor(b / 2)) % 4 !== bat % 4) return PRETO;
      return escala(cor(p.cor || 'branco', x, fase), 0.3 + 0.7 * Math.exp(-bf * 3));
    }),
    audioSerpente: reativo((AU, p, x, r, fase, h) => { // uma linha ondula pelas barras: a altura da onda é o volume
      const { pos } = batida(AU), amp = 0.08 + 0.42 * (AU.f[0] + AU.f[1]) / 2;
      const y = 0.5 + amp * Math.sin(2 * Math.PI * (pos / 2 - barra(x) / 8));
      return escala(cor(p.cor || 'branco', x, fase), limita(1 - Math.abs(h - y) / 0.07));
    }),
    audioQuatro: reativo((AU, p, x, r, fase) => { // um par de barras por batida; a primeira do compasso acende tudo
      const { bat, bf } = batida(AU), ativo = Math.floor(barra(x) / 2) === bat % 4;
      const k = (ativo ? 0.3 + 0.7 * Math.exp(-bf * 4) : 0) + (bat % 4 === 0 ? 0.45 * Math.exp(-bf * 6) : 0);
      return escala(cor(p.cor || 'branco', x, fase), Math.min(1, k));
    }),

    // ---------- CALMAS: seguem a energia, para música sem batida marcada ----------
    audioRespira: reativo((AU, p, x, r, fase, h) => { // a luz cresce e diminui com a música
      const q = doCentro(barra(x)), onda = onda01(h - AU.t * 0.09 + q * 0.12);
      return escala(hex(p.cor || '#ffc465'), Math.min(1, (0.25 + 0.6 * AU.lento) * (0.45 + 0.55 * onda) + AU.f[0] * 0.15));
    }),
    audioNivel: reativo((AU, p, x, r, fase, h) => { // nível d'água: sobe com a energia, a superfície mexe com o baixo
      const b = barra(x);
      const nivel = 0.12 + 0.78 * AU.lento + 0.08 * AU.f[1] * Math.sin(AU.t * 2.2 + b * 0.9);
      if (h > nivel) return PRETO;
      return escala(mix(hex('#006faf'), hex('#00bae3'), h / nivel), 0.3 + 0.7 * Math.pow(h / nivel, 2));
    }),
    audioChama: reativo((AU, p, x, r, fase, h) => { // chama em cada barra: a altura é a banda, o tom é quente
      const b = barra(x);
      const altura = 0.12 + 0.82 * AU.b[b] * (0.85 + 0.15 * onda01(AU.t * 3 + hash01(b)));
      if (h > altura) return PRETO;
      const t = h / altura;
      return escala(t < 0.5 ? mix(BRASA, QUENTE, t * 2) : mix(QUENTE, AMBAR, t * 2 - 1), 1 - t * t * 0.6);
    }),
    audioBrasaViva: reativo((AU, p, x, r, fase, h, i) => { // brasa tremulando: acende mais quando a música cresce
      const k = onda01(hash01(i) * 5 + AU.t * (0.15 + hash01(i * 2) * 0.35));
      return escala(mix(BRASA, AMBAR, hash01(i * 3)), Math.min(1, k * k * (0.2 + 0.8 * AU.lento) + AU.f[0] * 0.12));
    }),
    audioConstelacao: reativo((AU, p, x, r, fase, h, i) => { // estrelas fixas que piscam com o médio
      if (hash01(i * 1.7) < 0.84) return PRETO;
      const k = 0.1 + 0.9 * Math.exp(-AU.idade[2] * (1.5 + hash01(i) * 4)) * (hash01(i + AU.n[2] * 13) > 0.45 ? 1 : 0.2);
      return escala(hex(p.cor || '#ffd6a1'), k);
    }),
  };

  // ---------- AUTOMÁTICO: troca sozinho, sem ninguém mexer ----------
  const ROTACAO = [
    ['audioOnda'], ['audioFaixas'], ['audioFrente', { dir: 'sobe' }], ['audioFoguetes'], ['audioCascata'],
    ['audioFrente', { dir: 'vaivem' }], ['audioEscada'], ['audioBumbo'], ['audioRastro', { dir: 'abre' }], ['audioEspectro'],
    ['audioSerpente'], ['audioFrente', { dir: 'desce' }], ['audioAlternado'], ['audioEspelho'], ['audioEncontro'],
    ['audioCamadas'], ['audioRastro', { dir: 'diagonal' }], ['audioQuatro'], ['audioFrente', { dir: 'varia' }], ['audioTrilha'],
  ];
  const ROTACAO_ACESA = [
    ['audioAceso', { fonte: 'bumbo' }], ['audioRastroAceso', { dir: 'sobe' }], ['audioAceso', { fonte: 'banda' }],
    ['audioFrenteAcesa', { dir: 'abre' }], ['audioAceso', { fonte: 'grave' }], ['audioRastroAceso', { dir: 'direita' }],
    ['audioMedidorAceso'], ['audioRastroAceso', { dir: 'desce' }], ['audioFrenteAcesa', { dir: 'varia' }],
    ['audioAceso', { fonte: 'faixa' }], ['audioRastroAceso', { dir: 'fecha' }], ['audioFrenteAcesa', { dir: 'vaivem' }],
  ];
  const ROTACAO_CALMA = [['audioRespira'], ['audioNivel'], ['audioChama'], ['audioBrasaViva'], ['audioConstelacao']];
  const rodar = ([nome, q], p, x, r, fase, h, i) => efeitos[nome]({ ...q, cor: p.cor, fundo: p.fundo }, x, r, fase, h, i);
  // Troca de animação a cada 32 bumbos (uns 16 s numa música a 120 BPM).
  efeitos.audioAuto = (p, x, r, fase, h, i) => rodar(ROTACAO[Math.floor(au().n[0] / (p.cada || 32)) % ROTACAO.length], p, x, r, fase, h, i);
  efeitos.audioAutoAceso = (p, x, r, fase, h, i) => rodar(ROTACAO_ACESA[Math.floor(au().n[0] / (p.cada || 32)) % ROTACAO_ACESA.length], p, x, r, fase, h, i);
  // Troca devagar, por tempo, para o começo da noite.
  efeitos.audioAutoCalmo = (p, x, r, fase, h, i) => rodar(ROTACAO_CALMA[Math.floor(au().t / (p.segundos || 45)) % ROTACAO_CALMA.length], p, x, r, fase, h, i);
  return efeitos;
};
