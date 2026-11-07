// LED da pista dentro do app: visuais, brilho e tom. Quem desenha é a saída mesa\saida (Electron → Spout "Visual CLUBE" → MadMapper), que só
// escuta em 127.0.0.1:5212. O app repassa os pedidos para ela, para funcionar também no celular e sem porta nova.
const dgram = require('dgram');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SAIDA = process.env.VISUAIS_SAIDA || 'http://127.0.0.1:5212';
const INICIAR = process.env.VISUAIS_INICIAR !== undefined ? process.env.VISUAIS_INICIAR : 'C:\\apps\\visual-pista\\mesa\\saida\\iniciar.vbs';

// Mesmos ids de VISUAIS em mesa\saida\main.js. Visual novo: acrescentar nos dois lugares e pôr a miniatura em public\visuais\<id>.jpg.
const g = (id, nome, desc) => ({ id, nome, desc, grupo: 'Gerador', foto: `cenas/gp-${id}.png` });
const VISUAIS = [
  { id: 'p-numeros', nome: 'Personagens de código', desc: 'Os personagens gigantes em 3D com pele de micronúmeros que brilham como código. No bumbo, uma onda acende os números do peito para fora e uma onda de números se solta do corpo e se espalha pelo céu.', grupo: 'Pedra com código' },
  { id: 'p-logo', nome: 'Logo de pedra', desc: 'CLUBE, Pista Quente e Millos Kaiser em rocha preta, com a frente polida coberta de números que brilham como código, e pares de rochas no céu. O bumbo passa como onda e troca os números.', grupo: 'Pedra com código' },
  { id: 'p-campo', nome: 'Campo de rochas', desc: 'Rochas geradas na hora, com faces de código, e uma grande no meio que abre como livro a cada 32 tempos.', grupo: 'Pedra com código' },
  { id: 'p-estelas', nome: 'Personagens de pedra', desc: 'Um personagem de cada vez recortado em pedra preta no teto, com o desenho dele nos números. Entra pelas costas de quem olha, fica e sobe.', grupo: 'Pedra com código' },
  { id: 'p-corte', nome: 'Rocha fatiada', desc: 'Uma rocha de 4 m ao longo do teto, cortada em 7 fatias que abrem em leque, com faces de números.', grupo: 'Pedra com código' },
  { id: 'p-lajes', nome: 'Lajes de travertino', desc: 'Teto de placas de travertino amarronzado, face lisa e lateral lascada, com o pé recuado. Abre em onda simétrica para o céu e fecha.', grupo: 'Teto de pedra' },
  { id: 'p-degraus', nome: 'Degraus de pedra', desc: 'Caixotões em pirâmide invertida de travertino. Os anéis sobem e descem como telescópio, com o céu no alto.', grupo: 'Teto de pedra' },
  { id: 'z-logo', nome: 'Logo em zinco', desc: 'CLUBE na parede, e Pista Quente, Millos Kaiser e CLUBE passando no teto até o fim do painel, em metal zincado com furta-cor discreto. O bumbo corre pelo reflexo.', grupo: 'Logo em zinco' },
  { id: 'comportas', nome: 'Comportas', desc: 'Comportas de cimento correm de lado e as de inox correm no comprimento. O céu abre num retângulo, um eixo de cada vez, e depois fecha.', grupo: 'Teto que desliza' },
  { id: 'trama', nome: 'Trama', desc: 'Faixas de cimento correm de lado e réguas de inox correm no comprimento. No meio do caminho o céu aparece em xadrez, e depois abre inteiro.', grupo: 'Teto que desliza' },
  { id: 'r-nave', nome: 'Nave', desc: 'Duas fileiras de moving heads cruzam sobre o eixo e viram costelas de ponta a ponta do painel. O bumbo acende, o chimbal corre do booth até o fundo.', grupo: 'Moving head e laser' },
  { id: 'r-eixo', nome: 'Eixo', desc: 'Feixes quase paralelos, do booth até o fim do painel. Abrem, fecham e se cruzam em bloco. Na parede, viram um sol atrás do logo.', grupo: 'Moving head e laser' },
  { id: 'r-losango', nome: 'Losango', desc: 'Moving heads nas duas pontas do painel. Os feixes se cruzam numa treliça que aperta no build e abre no drop.', grupo: 'Moving head e laser' },
  { id: 'r-cordas', nome: 'Cordas', desc: 'Cordas de laser esticadas até o fim do painel. Cada uma é uma faixa do som e treme quando ela toca. O bumbo corre por elas.', grupo: 'Moving head e laser' },
  { id: 'r-lamina', nome: 'Lâmina', desc: 'Leques de laser atrás do logo e no fundo do painel, que se cruzam em riscos finos. No drop abrem tudo.', grupo: 'Moving head e laser' },
  { id: 'r-portal', nome: 'Portal', desc: 'Pórticos de laser em fila, da parede até o fundo. Cada bumbo manda um embora, e o logo fica no fim do corredor.', grupo: 'Moving head e laser' },
  { id: 'r-feixes', nome: 'Feixes', desc: 'Moving lights de verdade na névoa, de trás do logo para cima da pista. O desenho muda a cada 8 compassos. No build fecham, no drop abrem tudo.', grupo: 'Regência' },
  { id: 'r-astrolabio', nome: 'Astrolábio', desc: 'Anéis de inox do tamanho do céu, um para cada instrumento. No drop, todos se alinham em volta do logo num túnel.', grupo: 'Regência' },
  { id: 'r-mercurio', nome: 'Mercúrio', desc: 'O painel vira um lago de mercúrio. O bumbo faz ondas de verdade, o chimbal pinga, e no build o lago treme num desenho de cimática.', grupo: 'Regência' },
  { id: 'r-micelio', nome: 'Micélio', desc: 'Um organismo de prata cresce pelo painel e procura o logo. A seção da música muda o jeito de ele crescer.', grupo: 'Regência' },
  { id: 'r-enxame', nome: 'Enxame', desc: 'Milhões de pontos em véus no ar. No build giram num vórtice, e no drop formam um personagem da marca.', grupo: 'Regência' },
  { id: 'f-lactea', nome: 'Via Láctea', desc: "A galáxia de pé: o núcleo nasce atrás do logo e a faixa passa sobre a cabeça, com nuvens de poeira. O grave acende.", grupo: 'Firmamento' },
  { id: 'f-rastros', nome: 'Rastros', desc: "Foto de longa exposição ao vivo: milhares de arcos giram em volta do polo. O grave abre a exposição.", grupo: 'Firmamento' },
  { id: 'f-aurora', nome: 'Aurora', desc: "Cortinas de luz prateada caem do alto e se refletem num espelho d'água atrás do logo.", grupo: 'Firmamento' },
  { id: 'f-eclipse', nome: 'Eclipse', desc: "A lua cobre o sol atrás do logo. A coroa sobe pela parede e abre em raios pelo teto.", grupo: 'Firmamento' },
  { id: 'f-aneis', nome: 'Anéis', desc: "Um planeta nasce atrás do logo e os anéis passam sobre a cabeça em milhares de riscos, até o ponto de fuga.", grupo: 'Firmamento' },
  { id: 'f-horizonte', nome: 'Horizonte de eventos', desc: "Buraco negro traçado raio a raio: a luz e as estrelas se dobram em volta dele, e o disco corre ao longo do painel.", grupo: 'Firmamento' },
  { id: 'a-cartaz', nome: 'Cartaz', desc: 'O degradê do Akin, com as palavras e a cabeça do Millos passando.', grupo: 'Pista Quente: Akin' },
  { id: 'a-recortes', nome: 'Recortes', desc: 'Vermelho chapado e a palavra em fatias que andam com o som.', grupo: 'Pista Quente: Akin' },
  { id: 'a-fila', nome: 'Fila', desc: 'Três colunas de palavras em marcha, e o som engorda a letra.', grupo: 'Pista Quente: Akin' },
  { id: 'a-letras', nome: 'Letras 3D', desc: 'A palavra branca com volume azul atravessa o teto.', grupo: 'Pista Quente: Akin' },
  { id: 'a-cabeca', nome: 'Cabeças 3D', desc: 'Cabeças do Millos em blocos, que descem como um equalizador.', grupo: 'Pista Quente: Akin' },
  { id: 'a-tunel', nome: 'Túnel 3D', desc: 'Voo por portais quentes sobre o azul.', grupo: 'Pista Quente: Akin' },
  { id: 'c-camadas', nome: 'Camadas', desc: 'O personagem cortado em chapas de inox escovado, que viram como páginas com o som.', grupo: 'Escultura cinética' },
  { id: 'c-relevo', nome: 'Relevo', desc: 'O corpo em curvas de nível de chapa. Cada nível escuta uma faixa do som.', grupo: 'Escultura cinética' },
  { id: 'c-cabos', nome: 'Harpa de cabos', desc: 'Cabos de aço correm até a parede. O personagem os empurra, e cada cabo vibra na sua faixa.', grupo: 'Escultura cinética' },
  { id: 'c-agulhas', nome: 'Agulhas', desc: 'Tela de 12 mil hastes de aço: o personagem atravessa, e as hastes descem com ele.', grupo: 'Escultura cinética' },
  { id: 'c-brise', nome: 'Brise', desc: 'Lâminas de inox fecham o teto e abrem no desenho do personagem. Pelo vão aparece o céu.', grupo: 'Escultura cinética' },
  { id: 'm-colossos', nome: 'Colossos', desc: 'Personagens gigantes de inox espelhado, vistos de baixo. O reflexo segue o som.', grupo: 'Marca em inox' },
  { id: 'm-travessia', nome: 'Travessia', desc: 'Personagens de inox cruzam o céu acima de uma grade de metal.', grupo: 'Marca em inox' },
  { id: 'm-instancia', nome: 'Instância', desc: 'Uma laje de blocos de inox se solta e monta um personagem no céu.', grupo: 'Marca em inox' },
  { id: 'm-grade', nome: 'Grade de inox', desc: 'A grade generativa da marca em chapas espelhadas e caneladas.', grupo: 'Marca em inox' },
  { id: 'm-monolito', nome: 'Monólito', desc: 'As letras do logo como blocos de inox no teto.', grupo: 'Marca em inox' },
  { id: 'm-roda', nome: 'Roda', desc: 'O elenco inteiro em círculo, com a arte real da marca, entrando um de cada vez.', grupo: 'Marca em inox' },
  { id: 'm-queda', nome: 'Queda', desc: 'Um personagem de cada vez cai do céu girando e passa rente ao teto.', grupo: 'Marca em inox' },
  { id: 'm-gigante', nome: 'Gigante', desc: 'Um personagem de 30 m dá uma volta sobre a pista. A cada 40 s, entra outro.', grupo: 'Marca em inox' },
  { id: 'm-desfile', nome: 'Desfile', desc: 'O elenco passa em fila atrás da parede e por cima da pista.', grupo: 'Marca em inox' },
  { id: 'm-colossos-todos', nome: 'Colossos: todos', desc: 'Um personagem novo sobe a cada 20 s, até passar o elenco inteiro.', grupo: 'Marca em inox' },
  { id: 'm-travessia-todos', nome: 'Travessia: todos', desc: 'Um personagem entra a cada 11 s e cruza o céu.', grupo: 'Marca em inox' },
  { id: 'm-instancia-todos', nome: 'Instância: todos', desc: 'A laje monta um personagem diferente a cada 35 s.', grupo: 'Marca em inox' },
  { id: 'e-concreto', nome: 'Concreto abrindo', desc: 'Cimento com textura fina, visto de pé: as placas sobem devagar e o grave acende as estrelas.', grupo: 'Espaço de pé' },
  { id: 'e-teto', nome: 'Teto automático', desc: 'Chapas de inox abrem devagar e o grave acende as estrelas.', grupo: 'Espaço de pé' },
  { id: 'e-caixotoes', nome: 'Caixotões', desc: 'Poços grandes de cimento abertos para o céu estrelado.', grupo: 'Espaço de pé' },
  { id: 'e-porticos', nome: 'Pórticos de inox', desc: 'Voo por pórticos de inox até o ponto de fuga na parede.', grupo: 'Espaço de pé' },
  { id: 'concreto-ceu', nome: 'Concreto abrindo', desc: 'Laje de cimento queimado que se solta com o bumbo e abre para o céu preto.', grupo: 'Espaço 3D' },
  { id: 'teto-ceu', nome: 'Teto automático', desc: 'Chapas de inox abrem ao meio, em camadas, para o céu preto.', grupo: 'Espaço 3D' },
  { id: 'caixotoes', nome: 'Caixotões', desc: 'Laje funda de cimento: o som anda pelos poços e o bumbo traz as tampas para fora.', grupo: 'Espaço 3D' },
  { id: 'porticos', nome: 'Pórticos de inox', desc: 'Voo por pórticos de inox até o logo na parede, com fitas de luz no som.', grupo: 'Espaço 3D' },
  { id: 'brutal', nome: 'Brutal', desc: 'Massas de concreto no preto, que apanham da música.', grupo: 'Fundo preto' },
  { id: 'luz', nome: 'Luz', desc: 'O painel como luminária: tubos que acendem e esfriam.', grupo: 'Fundo preto' },
  { id: 'derrete', nome: 'Derrete', desc: 'Gibi da Pista Quente escorrendo para a parede do DJ.', grupo: 'Pista Quente' },
  { id: 'brinquedos', nome: 'Brinquedos 3D', desc: 'Personagens infláveis, cromo e pedras em brasa.', grupo: 'Pista Quente' },
  { id: 'ondas', nome: 'Ondas', desc: 'O som sai da parede do DJ e anda pelo teto em blocos.', grupo: 'Pista Quente' },
  { id: 'universo', nome: 'Universo CLUBE', desc: 'Estátuas de cromo, pedras e cristais.', grupo: 'CLUBE' },
  { id: 'laminas', nome: 'Lâminas', desc: 'Parede de lâminas que giram com o bumbo.', grupo: 'CLUBE' },
  g('g-grade', 'Grade viva', 'Calma.'), g('g-mare', 'Maré', 'Calma.'), g('g-constelacao', 'Constelação', 'Calma.'),
  g('g-cromo', 'Cromo', 'Média.'), g('g-faixas', 'Faixas', 'Média.'), g('g-clube', 'CLUBE passando', 'Média.'),
  g('g-pulso', 'Pulso', 'Pista.'), g('g-scanner', 'Scanner', 'Pista.'), g('g-aneis', 'Anéis', 'Pista.'), g('g-flash', 'Flash', 'Pista.'),
  g('g-espectro', 'Espectro', 'Segue o som.'), g('g-onda', 'Onda do som', 'Segue o som.'), g('g-bumbo', 'Bumbo', 'Segue o som.'),
  { id: 'placa-latao', nome: 'Latão minimalista', desc: 'Chapa de latão quase vazia, com um relevo baixo.', grupo: 'Metal' },
  { id: 'placa-ouro', nome: 'Placa dourada', desc: 'Ouro escovado com logo e figuras em relevo.', grupo: 'Metal' },
  { id: 'placa-prata', nome: 'Placa prateada', desc: 'A mesma placa em prata.', grupo: 'Metal' },
  { id: 'h3-olho', nome: 'Vídeo: olho de peixe', desc: 'Vídeo do H3, com os letreiros por cima.', grupo: 'Vídeos' },
  { id: 'h3-abrir', nome: 'Vídeo: teto abrindo', desc: 'Vídeo do H3, com os letreiros por cima.', grupo: 'Vídeos' },
];

// Devolve o JSON da saída, ou null se ela estiver fechada.
function pedir(metodo, rota, limite) {
  return new Promise(ok => {
    let fim = false;
    const acabar = v => { if (!fim) { fim = true; ok(v); } };
    const req = http.request(SAIDA + rota, { method: metodo, timeout: limite }, r => {
      let t = '';
      r.setEncoding('utf8');
      r.on('data', d => { t += d; });
      r.on('end', () => { try { acabar(JSON.parse(t)); } catch { acabar(null); } });
    });
    req.on('timeout', () => { req.destroy(); acabar(null); });
    req.on('error', () => acabar(null));
    req.end();
  });
}

// ---------- Brilho e tom ----------
// Os dois valem só com visual no ar e mudam a cor das superfícies no MadMapper, que multiplica a imagem. Não ficam salvos no .mad;
// "Tirar do LED" devolve as cores de antes.
// Tom: o teto é visto de lado e os LEDs mudam de cor com a direção do olhar: azulado da pista para o DJ, amarelo do DJ para a pista.
// Nenhum ajuste serve às duas direções; este acerta para uma delas. Por isso vale só no teto (LED_PISTA) e não na parede (LED_DJ_FUNDO).
const ARQ_AJUSTE = path.join(__dirname, 'visuais-ajuste.json');
const TETO = 'LED_PISTA', PAREDE = 'LED_DJ_FUNDO';
const FORCA_QUENTE = [1.15, 1, 0.8], FORCA_FRIO = [0.85, 1, 1.2], PESOS_BRILHO = [0.2126, 0.7152, 0.0722];
let ajuste = { tom: 0, brilho: null, antes: null, enviadas: null, limite: 100, hzMax: 15, intensidade: 100 };
try { ajuste = { ...ajuste, ...JSON.parse(fs.readFileSync(ARQ_AJUSTE, 'utf8')) }; } catch {}
// Depois de um reinício do PC, o MadMapper abre com as cores do projeto. Sem isto, a diferença parece mudança feita à mão e o brilho guardado se perde.
ajuste.enviadas = null;
let ultimoEnvio = 0;
// Avisa os apps abertos quando o LED muda (visual, brilho ou tom), para todos acompanharem na hora.
let avisar = () => {};

const hexParaRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const parecida = (a, b) => !!a && !!b && hexParaRgb(a).every((v, i) => Math.abs(v - hexParaRgb(b)[i]) <= 2);
const brilhoDaCor = h => Math.round(Math.max(...hexParaRgb(h)) / 2.55);
const paraHex = canais => '#' + canais.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('').toUpperCase() + 'FF';
// tom de -100 (frio) a 100 (quente), mantendo o brilho aparente
function corDoTeto(brilhoPedido, tom) {
  const brilho = Math.min(brilhoPedido, ajuste.limite);   // o limite do app vale para tudo que vai ao painel, flash e strobo também
  const t = Math.abs(tom) / 100, alvo = tom >= 0 ? FORCA_QUENTE : FORCA_FRIO;
  const ganhos = alvo.map(k => 1 + (k - 1) * t);
  const medio = ganhos.reduce((s, k, i) => s + k * PESOS_BRILHO[i], 0);
  // sem isto, no máximo o vermelho bate em 255 e o tom perde a proporção: é melhor abaixar os três juntos
  const canais = ganhos.map(k => brilho * 2.55 * k / medio);
  const maior = Math.max(...canais);
  return paraHex(maior > 255 ? canais.map(c => c * 255 / maior) : canais);
}
const corDaParede = pedido => { const brilho = Math.min(pedido, ajuste.limite); return paraHex([brilho * 2.55, brilho * 2.55, brilho * 2.55]); };
function enviarCor(superficie, cor) {
  const pad = b => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const str = s => pad(Buffer.from(s, 'utf8'));
  const msg = Buffer.concat([str(`/surfaces/${superficie}/color/rgba`), str(',r'), Buffer.from(cor.slice(1), 'hex')]);
  const s = dgram.createSocket('udp4');
  s.send(msg, 8010, '127.0.0.1', () => s.close());
}
function lerCor(superficie) {
  return new Promise(ok => {
    const req = http.get(`http://127.0.0.1:8010/surfaces/${superficie}/color/rgba`, { timeout: 1500 }, r => {
      let t = '';
      r.setEncoding('utf8');
      r.on('data', d => { t += d; });
      r.on('end', () => {
        try {
          const v = String(JSON.parse(t).VALUE).toUpperCase();
          ok(/^#[0-9A-F]{8}$/.test(v) ? v : null);
        } catch { ok(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); ok(null); });
    req.on('error', () => ok(null));
  });
}
const guardarAjuste = () => { try { fs.writeFileSync(ARQ_AJUSTE, JSON.stringify(ajuste)); } catch {} };
async function brilhoAtual() {
  if (ajuste.brilho === null) {
    const c = await lerCor(TETO);
    if (c) ajuste.brilho = brilhoDaCor(c);
  }
  return ajuste.brilho === null ? 70 : ajuste.brilho;
}
// Flash: enquanto dura, as duas superfícies vão ao máximo permitido pelo limite, mantendo o tom do teto. O que o slider mudar nesse meio-tempo vale quando o flash acabar.
let corAlta = false, querCorAlta = false;
async function corDoFlash(liga) {
  querCorAlta = liga;
  if (liga) {
    if (!ajuste.enviadas) await aplicarAjuste();
    if (!querCorAlta) return;
    corAlta = true;
    // sobe só até a intensidade pedida, nunca abaixo do brilho normal, e o limite continua valendo
    const alto = Math.max(await brilhoAtual(), ajuste.intensidade);
    if (!querCorAlta) return;
    enviarCor(TETO, corDoTeto(alto, ajuste.tom));
    enviarCor(PAREDE, corDaParede(alto));
  } else {
    corAlta = false;
    // o OSC vai sem confirmação: repete a volta, para a cor nunca ficar presa na do flash
    const devolver = () => { if (!corAlta && ajuste.enviadas) { enviarCor(TETO, ajuste.enviadas[TETO]); enviarCor(PAREDE, ajuste.enviadas[PAREDE]); } };
    devolver(); setTimeout(devolver, 150); setTimeout(devolver, 600);
  }
  // a leitura do MadMapper vem atrasada: sem isto, o branco do flash pareceria um ajuste feito à mão
  ultimoEnvio = Date.now();
}
async function aplicarAjuste() {
  if (corAlta) {
    const b = await brilhoAtual();
    ajuste.enviadas = { [TETO]: corDoTeto(b, ajuste.tom), [PAREDE]: corDaParede(b) };
    guardarAjuste();
    return;
  }
  // Cor mudada direto no MadMapper vira o novo ponto de partida. Durante o arraste não dá para comparar, porque a leitura vem atrasada.
  if (!ajuste.enviadas || Date.now() - ultimoEnvio > 3000) {
    const [t, p] = await Promise.all([lerCor(TETO), lerCor(PAREDE)]);
    if (!t || !p) return;
    if (!ajuste.enviadas) { ajuste.antes = { [TETO]: t, [PAREDE]: p }; if (ajuste.brilho === null) ajuste.brilho = brilhoDaCor(t); }
    else if (!parecida(t, ajuste.enviadas[TETO])) { ajuste.antes = { [TETO]: t, [PAREDE]: p }; ajuste.brilho = brilhoDaCor(t); }
  }
  const brilho = await brilhoAtual();
  ajuste.enviadas = { [TETO]: corDoTeto(brilho, ajuste.tom), [PAREDE]: corDaParede(brilho) };
  enviarCor(TETO, ajuste.enviadas[TETO]);
  enviarCor(PAREDE, ajuste.enviadas[PAREDE]);
  ultimoEnvio = Date.now();
  guardarAjuste();
}
function devolverCores() {
  if (!ajuste.antes || !ajuste.enviadas) return;
  enviarCor(TETO, ajuste.antes[TETO]);
  enviarCor(PAREDE, ajuste.antes[PAREDE]);
  ajuste.enviadas = null;
  guardarAjuste();
}

// Com o Windows, o servidor roda na sessão 0, sem área de trabalho: o que ele abre direto não aparece nem desenha. A tarefa "CLUBE Visual LED"
// roda iniciar.vbs na sessão do usuário, sem elevação. O explorer fica para o servidor aberto à mão, sem a tarefa criada.
function abrirSaida() {
  if (!INICIAR) return;
  const reserva = () => spawn('explorer.exe', [INICIAR], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  spawn('schtasks.exe', ['/run', '/tn', 'CLUBE Visual LED'], { stdio: 'ignore', windowsHide: true })
    .on('error', reserva)
    .on('exit', codigo => { if (codigo !== 0) reserva(); });
}

// ---------- Monitor de som ----------
// A análise é feita pela página do LED e publicada em 127.0.0.1:5212/som, a 33 por segundo. Uma única ligação com a saída, aberta só enquanto
// alguém está olhando, e repasse a 16 por segundo: o celular não precisa de mais, e a página do LED não pode depender de quem está ouvindo.
const ouvintesSom = new Set();
let ligacaoSom = null, ultimoSom = 0, religar = null;
function abrirSom() {
  if (ligacaoSom || !ouvintesSom.size) return;
  ligacaoSom = http.get(SAIDA + '/som', r => {
    let resto = '';
    r.setEncoding('utf8');
    r.on('data', d => {
      resto += d;
      const partes = resto.split('\n\n');
      resto = partes.pop();
      const agora = Date.now();
      const ultima = partes.filter(x => x.startsWith('data:')).pop();
      if (!ultima || agora - ultimoSom < 60) return;
      ultimoSom = agora;
      for (const o of ouvintesSom) if (o.writableLength < 64000) o.write(ultima + '\n\n');
    });
    r.on('close', fecharSom);
  });
  ligacaoSom.on('error', fecharSom);
}
function fecharSom() {
  if (ligacaoSom) { ligacaoSom.destroy(); ligacaoSom = null; }
  clearTimeout(religar);
  if (ouvintesSom.size) religar = setTimeout(abrirSom, 2000);
}
function fluxoSom(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(': som do LED\n\n');
  ouvintesSom.add(res);
  abrirSom();
  req.on('close', () => { ouvintesSom.delete(res); if (!ouvintesSom.size) fecharSom(); });
}

function atender(req, res, p, url, sendJson) {
  if (!p.startsWith('/api/visuais')) return false;
  if (p === '/api/visuais/som' && req.method === 'GET') { fluxoSom(req, res); return true; }
  const responder = async () => {
    if (p === '/api/visuais' && req.method === 'GET') {
      return sendJson(res, 200, { visuais: VISUAIS, tom: ajuste.tom, brilho: await brilhoAtual(), limite: ajuste.limite, limiteHz: ajuste.hzMax, intensidade: ajuste.intensidade, saida: await pedir('GET', '/estado', 2000) });
    }
    // Camada de cor e diretor automático: quem guarda e aplica é a saída do LED. O app só repassa e avisa os outros aparelhos.
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
    if (p === '/api/visuais/led') {
      const id = url.searchParams.get('visual');
      if (!VISUAIS.some(v => v.id === id)) return sendJson(res, 400, { error: 'visual desconhecido' });
      const saida = await pedir('POST', '/led?visual=' + encodeURIComponent(id), 12000);
      if (saida && saida.noAr) await aplicarAjuste();
      avisar({});
      return sendJson(res, 200, { saida });
    }
    if (p === '/api/visuais/tirar') {
      const saida = await pedir('POST', '/led?tirar=1', 12000);
      if (saida && !saida.noAr) devolverCores();
      avisar({});
      return sendJson(res, 200, { saida });
    }
    if (p === '/api/visuais/ajuste') {
      const numero = (nome, min, max) => {
        if (!url.searchParams.has(nome)) return null;
        const v = Number(url.searchParams.get(nome));
        return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : null;
      };
      const tom = numero('tom', -100, 100), brilho = numero('brilho', 0, 100);
      const limite = numero('limite', 5, 100), limiteHz = numero('limiteHz', 1, 15), intensidade = numero('intensidade', 0, 100);
      if (tom === null && brilho === null && limite === null && limiteHz === null && intensidade === null) return sendJson(res, 400, { error: 'valor inválido' });
      if (limite !== null) ajuste.limite = limite;
      if (limiteHz !== null) ajuste.hzMax = limiteHz;
      if (intensidade !== null) ajuste.intensidade = intensidade;
      if (tom !== null) ajuste.tom = tom;
      if (brilho !== null) ajuste.brilho = brilho;
      avisar({ tom: ajuste.tom, brilho: ajuste.brilho });
      const saida = await pedir('GET', '/estado', 2000);
      if (saida && saida.noAr) await aplicarAjuste(); else guardarAjuste();
      return sendJson(res, 200, { tom: ajuste.tom, brilho: ajuste.brilho, limite: ajuste.limite, limiteHz: ajuste.hzMax, intensidade: ajuste.intensidade, aplicado: !!(saida && saida.noAr) });
    }
    if (p === '/api/visuais/abrir') {
      const saida = await pedir('GET', '/estado', 2000);
      if (!saida) abrirSaida();
      return sendJson(res, 200, { saida });
    }
    sendJson(res, 404, { error: 'rota desconhecida' });
  };
  responder().catch(e => sendJson(res, 500, { error: e.message }));
  return true;
}

module.exports = { atender, paraShow: { pedir, cor: corDoFlash, limiteHz: () => ajuste.hzMax, intensidade: () => ajuste.intensidade }, aoMudar: fn => { avisar = fn; } };
