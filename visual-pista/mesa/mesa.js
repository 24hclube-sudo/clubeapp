// Mesa dos visuais: seta para passar por eles, sempre vendo o mesmo jeito (a sala à esquerda, o painel chapado à direita).
// Cada visual roda na própria página, dentro de um quadro invisível; a imagem vem pelo captureStream do canvas dele.
// Ao trocar, o próximo carrega por trás e só entra na tela quando já está desenhando: o anterior fica até lá, sem tela preta.
// Passar pela seta NÃO mexe no LED: quem manda para o LED é o botão, que fala com a saída Spout (mesa/saida) em 127.0.0.1:5212.
// O painel do app bloqueia o microfone: o som da prévia vem da análise que a saída do LED faz (audio=saida).
const ESC = 'saida&escala=0.5';
const VISUAIS = [
  { id: 'derrete', nome: 'Derrete', selo: 'Opção 1', caminho: 'pista-quente/derrete/', led: true,
    desc: 'Gibi da Pista Quente sobre o degradê do CLUBE: tudo escorre do teto para a parede do DJ.' },
  { id: 'brinquedos', nome: 'Brinquedos 3D', selo: 'Opção 2', caminho: 'universo/', extra: 'mundo=quente', led: true,
    desc: 'Universo em brasa: personagens da Pista Quente infláveis e estátuas de cromo.' },
  { id: 'ondas', nome: 'Ondas', selo: 'Opção 3', caminho: 'pista-quente/ondas/', led: true,
    desc: 'O som sai da parede do DJ e anda pelo teto em blocos do tamanho dos módulos do LED.' },
  { id: 'placa-ouro', nome: 'Placa dourada', selo: 'Metal', caminho: 'placa/', extra: 'metal=ouro', led: true,
    desc: 'Chapa de ouro escovado com logo, figuras e moldura em alto-relevo polido. O bumbo corre pela chapa como luz.' },
  { id: 'placa-prata', nome: 'Placa prateada', selo: 'Metal', caminho: 'placa/', extra: 'metal=prata', led: true,
    desc: 'A mesma placa em prata, abrindo nas moedas. O relevo fica; o que anda é o reflexo.' },
  { id: 'placa-latao', nome: 'Latão minimalista', selo: 'Metal', caminho: 'placa/', extra: 'metal=latao', led: true,
    desc: 'Chapa de latão quase vazia, um pouco oxidada, com um único relevo baixo. A luz passa macia com o som.' },
  { id: 'brutal', nome: 'Brutal', selo: 'Novo', caminho: 'brutal/', led: true,
    desc: 'Fundo preto e massas de concreto bruto que apanham da música, com estilhaços. Corte seco entre as cenas.' },
  { id: 'concreto-ceu', nome: 'Concreto abrindo', selo: 'Novo', caminho: 'ceu/', extra: 'modo=concreto', led: true,
    desc: 'Laje de cimento queimado: as placas se soltam com o bumbo e sobem para um céu preto, com estrelas brancas.' },
  { id: 'teto-ceu', nome: 'Teto automático', selo: 'Novo', caminho: 'ceu/', extra: 'modo=teto', led: true,
    desc: 'Chapas de inox escovado abrem ao meio, em camadas, para um céu preto, com estrelas brancas.' },
  { id: 'caixotoes', nome: 'Caixotões', selo: 'Novo', caminho: 'ceu/', extra: 'modo=caixotoes', led: true,
    desc: 'Laje nervurada funda em cimento queimado: o som anda pelos poços e o bumbo traz as tampas para fora do teto.' },
  { id: 'porticos', nome: 'Pórticos de inox', selo: 'Novo', caminho: 'ceu/', extra: 'modo=porticos', led: true,
    desc: 'Voo por uma nave de pórticos de inox até o ponto de fuga na parede, com a fita de cada pórtico numa faixa do som.' },
  { id: 'e-concreto', nome: 'Concreto abrindo (de pé)', selo: 'Novo', caminho: 'espaco/', extra: 'modo=concreto', led: true,
    desc: 'Cimento queimado sem grão, visto a 1,60 m: as placas sobem devagar e o grave acende as estrelas.' },
  { id: 'e-teto', nome: 'Teto automático (de pé)', selo: 'Novo', caminho: 'espaco/', extra: 'modo=teto', led: true,
    desc: 'Chapas de inox abrem devagar, em camadas, e o grave acende as estrelas. Visto a 1,60 m.' },
  { id: 'e-caixotoes', nome: 'Caixotões (de pé)', selo: 'Novo', caminho: 'espaco/', extra: 'modo=caixotoes', led: true,
    desc: 'Poços grandes de cimento abertos para o céu, com tampas passando devagar. Visto a 1,60 m.' },
  { id: 'e-porticos', nome: 'Pórticos de inox (de pé)', selo: 'Novo', caminho: 'espaco/', extra: 'modo=porticos', led: true,
    desc: 'Voo contínuo por pórticos de inox até o ponto de fuga na parede. Visto a 1,60 m.' },
  { id: 'f-lactea', nome: 'Via Láctea', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=lactea', led: true,
    desc: "A galáxia de pé: o núcleo nasce atrás do logo e a faixa passa sobre a cabeça, com nuvens de poeira. O grave acende." },
  { id: 'f-rastros', nome: 'Rastros', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=rastros', led: true,
    desc: "Foto de longa exposição ao vivo: milhares de arcos giram em volta do polo. O grave abre a exposição." },
  { id: 'f-aurora', nome: 'Aurora', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=aurora', led: true,
    desc: "Cortinas de luz prateada caem do alto e se refletem num espelho d'água atrás do logo." },
  { id: 'f-eclipse', nome: 'Eclipse', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=eclipse', led: true,
    desc: "A lua cobre o sol atrás do logo. A coroa sobe pela parede e abre em raios pelo teto." },
  { id: 'f-aneis', nome: 'Anéis', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=aneis', led: true,
    desc: "Um planeta nasce atrás do logo e os anéis passam sobre a cabeça em milhares de riscos, até o ponto de fuga." },
  { id: 'f-horizonte', nome: 'Horizonte de eventos', selo: 'Firmamento', caminho: 'firmamento/', extra: 'modo=horizonte', led: true,
    desc: "Buraco negro traçado raio a raio: a luz e as estrelas se dobram em volta dele, e o disco corre ao longo do painel." },
  { id: 'c-camadas', nome: 'Camadas', selo: 'Cinética', caminho: 'cinetica/', extra: 'modo=camadas', led: true,
    desc: 'O personagem cortado em chapas de inox escovado, que viram como páginas com o som.' },
  { id: 'c-relevo', nome: 'Relevo', selo: 'Cinética', caminho: 'cinetica/', extra: 'modo=relevo', led: true,
    desc: 'O corpo em curvas de nível de chapa. Cada nível escuta uma faixa do som.' },
  { id: 'c-cabos', nome: 'Harpa de cabos', selo: 'Cinética', caminho: 'cinetica/', extra: 'modo=cabos', led: true,
    desc: 'Cabos de aço correm até a parede. O personagem os empurra, e cada cabo vibra na sua faixa.' },
  { id: 'c-agulhas', nome: 'Agulhas', selo: 'Cinética', caminho: 'cinetica/', extra: 'modo=agulhas', led: true,
    desc: 'Tela de 12 mil hastes de aço: o personagem atravessa, e as hastes descem com ele.' },
  { id: 'c-brise', nome: 'Brise', selo: 'Cinética', caminho: 'cinetica/', extra: 'modo=brise', led: true,
    desc: 'Lâminas de inox fecham o teto e abrem no desenho do personagem. Pelo vão aparece o céu.' },
  { id: 'a-cartaz', nome: 'Cartaz (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=cartaz', led: true,
    desc: 'O degradê do Akin, com Pista Quente, a cabeça do Millos e Millos Kaiser passando um de cada vez.' },
  { id: 'a-recortes', nome: 'Recortes (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=recortes', led: true,
    desc: 'Vermelho chapado e a palavra em fatias, cada uma andando com a sua faixa do som.' },
  { id: 'a-fila', nome: 'Fila (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=fila', led: true,
    desc: 'Três colunas de palavras em marcha, e o som engorda a letra.' },
  { id: 'a-letras', nome: 'Letras 3D (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=letras', led: true,
    desc: 'A palavra branca com volume azul atravessa o teto até a parede.' },
  { id: 'a-cabeca', nome: 'Cabeças 3D (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=cabeca', led: true,
    desc: 'Fila de cabeças do Millos em blocos, que descem como um equalizador.' },
  { id: 'a-tunel', nome: 'Túnel 3D (Akin)', selo: 'Novo', caminho: 'akin/', extra: 'modo=tunel', led: true,
    desc: 'Voo por portais vermelhos, laranja e amarelos sobre o azul.' },
  { id: 'm-roda', nome: 'Roda', selo: 'Novo', caminho: 'marca/', extra: 'modo=roda', led: true,
    desc: 'O elenco inteiro em círculo em volta da pista, entrando um de cada vez, com a arte real da marca.' },
  { id: 'm-queda', nome: 'Queda', selo: 'Novo', caminho: 'marca/', extra: 'modo=queda', led: true,
    desc: 'Um personagem de cada vez cai do céu girando e passa rente ao teto.' },
  { id: 'm-gigante', nome: 'Gigante', selo: 'Novo', caminho: 'marca/', extra: 'modo=gigante', led: true,
    desc: 'Um personagem de 30 m atrás da parede dá uma volta sobre a pista. A cada 40 s, entra outro.' },
  { id: 'm-desfile', nome: 'Desfile', selo: 'Novo', caminho: 'marca/', extra: 'modo=desfile', led: true,
    desc: 'O elenco passa em fila atrás da parede e por cima da pista.' },
  { id: 'm-colossos-todos', nome: 'Colossos: todos', selo: 'Novo', caminho: 'marca/', extra: 'modo=colossos-todos', led: true,
    desc: 'Os gigantes de inox, com um personagem novo subindo a cada 20 s até passar o elenco inteiro.' },
  { id: 'm-travessia-todos', nome: 'Travessia: todos', selo: 'Novo', caminho: 'marca/', extra: 'modo=travessia-todos', led: true,
    desc: 'Um personagem entra a cada 11 s e cruza o céu, até passar o elenco inteiro.' },
  { id: 'm-instancia-todos', nome: 'Instância: todos', selo: 'Novo', caminho: 'marca/', extra: 'modo=instancia-todos', led: true,
    desc: 'A laje monta um personagem diferente a cada 35 s.' },
  { id: 'm-colossos', nome: 'Colossos', selo: 'Marca', caminho: 'marca/', extra: 'modo=colossos', led: true,
    desc: 'Personagens gigantes em inox espelhado, com malha 3D real, vistos a 1,60 m. O reflexo segue o som.' },
  { id: 'm-travessia', nome: 'Travessia', selo: 'Marca', caminho: 'marca/', extra: 'modo=travessia', led: true,
    desc: 'Personagens de inox cruzam o céu em direção à parede, acima de uma grade de metal.' },
  { id: 'm-instancia', nome: 'Instância', selo: 'Marca', caminho: 'marca/', extra: 'modo=instancia', led: true,
    desc: 'Uma laje de blocos de inox se solta e monta um personagem no céu, e depois volta.' },
  { id: 'm-grade', nome: 'Grade de inox', selo: 'Marca', caminho: 'marca/', extra: 'modo=grade', led: true,
    desc: 'O sorteio de blocos do sistema da marca em chapas espelhadas e caneladas. As linhas respiram e o som aperta os blocos.' },
  { id: 'm-monolito', nome: 'Monólito', selo: 'Marca', caminho: 'marca/', extra: 'modo=monolito', led: true,
    desc: 'As letras do logo em malha 3D real, como blocos de inox no teto. Uma de cada vez dá uma volta lenta.' },
  { id: 'luz', nome: 'Luz', selo: 'Novo', caminho: 'luz/', led: true,
    desc: 'O painel como luminária: tubos e lâmpadas no preto, que acendem brancos com o som e esfriam como tungstênio.' },
  { id: 'universo', nome: 'Universo CLUBE', caminho: 'universo/', led: true,
    desc: 'Estátuas em voxels de cromo, pedras e cristais, o mundo do vídeo do H3 em tempo real.' },
  { id: 'laminas', nome: 'Lâminas', caminho: '', led: true,
    desc: 'O primeiro visual, em Three.js: parede de lâminas que giram com o bumbo.' },
  { id: 'h3-olho', nome: 'Vídeo H3: olho de peixe', video: '../perspectiva/saidas/h3-olho-1-painel.mp4', led: true,
    desc: 'Vídeo gerado no H3. O vídeo não reage ao som; os letreiros por cima, sim.' },
  { id: 'h3-abrir', nome: 'Vídeo H3: teto abrindo', video: '../perspectiva/saidas/h3-abrir-2-painel.mp4', led: true,
    desc: 'Vídeo gerado no H3. O vídeo não reage ao som; os letreiros por cima, sim.' },
];
const SAIDA_URL = 'http://127.0.0.1:5212';

const $ = id => document.getElementById(id);
const tela = $('tela');
let atual = 0, somTeste = false, noLed = null, abrindo = false;
try {
  const salvo = localStorage.getItem('mesa-visual');
  if (salvo) atual = Math.max(0, VISUAIS.findIndex(v => v.id === salvo));
} catch {}

// ---------- dois quadros: um na tela, outro carregando ----------
const criarPalco = el => {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.loop = true;
  return { el, video, fonte: null, quadros: 0 };
};
const palcos = [criarPalco($('palcoA')), criarPalco($('palcoB'))];
let ativo = 0;

function limpar(p) {
  if (p.fonte) p.fonte.getTracks().forEach(t => t.stop());
  p.fonte = null;
  p.video.pause();
  p.video.srcObject = null;
  p.video.removeAttribute('src');
  p.video.load();
  p.quadros = 0;
  p.el.src = 'about:blank';
}

let geracao = 0;
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(i) {
  atual = (i + VISUAIS.length) % VISUAIS.length;
  const v = VISUAIS[atual];
  try { localStorage.setItem('mesa-visual', v.id); } catch {}
  const minha = ++geracao;
  abrindo = true;
  desenharTopo();
  const alvo = palcos[1 - ativo];
  limpar(alvo);
  await espera(30);
  if (minha !== geracao) return;
  let ok = false;
  if (v.video) {
    alvo.video.src = v.video;
    alvo.video.play().catch(() => {});
    for (let n = 0; n < 240 && minha === geracao; n++) {
      if (alvo.video.readyState >= 2 && alvo.video.videoWidth > 0) { ok = true; break; }
      await espera(50);
    }
  } else {
    const q = [ESC, v.extra, `audio=${somTeste ? 'teste' : 'saida'}`].filter(Boolean).join('&');
    alvo.el.src = `../${v.caminho}?${q}`;
    for (let n = 0; n < 400 && minha === geracao; n++) {
      await espera(50);
      let doc = null, w = null;
      try { doc = alvo.el.contentDocument; w = alvo.el.contentWindow; } catch {}
      const c = doc && doc.querySelector('canvas');
      // só pega a imagem depois de a página montar tudo: canvas sem contexto ainda dá um fluxo que nunca recebe quadro
      const desenhando = w && (w.__estado || w.__painel);
      if (!alvo.fonte && c && desenhando) {
        alvo.fonte = c.captureStream(30);
        alvo.video.srcObject = alvo.fonte;
        alvo.video.play().catch(() => {});
      }
      // pronto = a imagem já chegou aqui
      if (alvo.fonte && alvo.video.readyState >= 2 && alvo.video.videoWidth > 0) { ok = true; break; }
    }
    if (ok) await espera(250);
  }
  if (minha !== geracao) return;
  abrindo = false;
  if (!ok) { limpar(alvo); $('aviso').textContent = `${v.nome} não abriu. Tente de novo pela seta.`; desenharTopo(); return; }
  $('aviso').textContent = '';
  const velho = palcos[ativo];
  ativo = 1 - ativo;
  desenharTopo();
  setTimeout(() => { if (palcos[ativo] !== velho) limpar(velho); }, 150);
}

// ---------- desenho: sala + painel (mesma conta do perspectiva/geometria.py) ----------
const gl = tela.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
const VS = `#version 300 es
out vec2 uv; void main(){ vec2 q = vec2(gl_VertexID==1?3.:-1., gl_VertexID==2?3.:-1.); uv = q*.5+.5; gl_Position = vec4(q,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 cor;
uniform sampler2D painel, guia;
uniform vec4 rPainel, rSala; uniform vec2 tam; uniform float temImagem;
const float LARG=1032., ALT=5676., DOBRA=4988., PASSO=.00186047, CY=711.2, ZF=4.39, V0=491.3, K=162.5, FO=713.4, HC=1.3532, ESC=1.42433;
void main(){
  vec2 px = vec2(gl_FragCoord.x, tam.y - gl_FragCoord.y);
  vec3 f = vec3(.043,.043,.047);
  vec2 sq = (px - rSala.xy) / rSala.zw;
  if (all(greaterThanEqual(sq, vec2(0.))) && all(lessThanEqual(sq, vec2(1.)))) {
    f = texture(guia, sq).rgb;
    float u = sq.x*1440./ESC+34., v = sq.y*1920./ESC;
    bool teto = v < V0;
    float z = FO*HC/max(CY-v,.5);
    float lin = teto ? DOBRA-(ZF-z)/PASSO : DOBRA+(v-V0)/(PASSO*K);
    float ue = teto ? .7569*v-.47 : 373.;
    float ud = teto ? -.9896*v+1184.54 : 685.;
    float col = (u-ue)/(ud-ue)*LARG;
    float base = V0+(ALT-DOBRA)*PASSO*K;
    if (v<CY && col>0. && col<LARG && lin>0. && v<=base && !(lin>=DOBRA && v>=679.)) {
      vec2 p = vec2(col/LARG, lin/ALT);
      f = temImagem > .5 ? texture(painel, p).rgb : vec3(.05);
    }
  }
  vec2 pq = (px - rPainel.xy) / rPainel.zw;
  if (all(greaterThanEqual(pq, vec2(0.))) && all(lessThanEqual(pq, vec2(1.)))) {
    f = temImagem > .5 ? texture(painel, pq).rgb : vec3(.05);
  }
  cor = vec4(f,1.);
}`;
function compilar(tipo, src) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);
gl.bindVertexArray(gl.createVertexArray());
const un = n => gl.getUniformLocation(prog, n);
const criarTex = () => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const ani = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ani) gl.texParameterf(gl.TEXTURE_2D, ani.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
};
const texPainel = criarTex(), texGuia = criarTex();
gl.uniform1i(un('painel'), 0);
gl.uniform1i(un('guia'), 1);
const foto = new Image();
foto.onload = () => {
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texGuia);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, foto);
  gl.generateMipmap(gl.TEXTURE_2D);
};
foto.src = '../perspectiva/guia-h3.jpg';

function medir() {
  const r = tela.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (tela.width !== W || tela.height !== H) { tela.width = W; tela.height = H; }
  const margem = Math.round(8 * dpr);
  const pH = H - margem * 2, pW = Math.round(pH * 1032 / 5676);
  const sW = Math.min(W - pW - margem * 3, Math.round(pH * 0.75)), sH = Math.round(sW / 0.75);
  gl.viewport(0, 0, W, H);
  gl.uniform2f(un('tam'), W, H);
  gl.uniform4f(un('rPainel'), W - pW - margem, margem, pW, pH);
  gl.uniform4f(un('rSala'), margem, Math.round((H - sH) / 2), sW, sH);
}

let temImagem = false;
function desenhar() {
  medir();
  const video = palcos[ativo].video;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texPainel);
  if (video.readyState >= 2 && video.videoWidth > 0) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);
    temImagem = true;
  }
  gl.uniform1f(un('temImagem'), temImagem ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  atualizarMedidor();
  requestAnimationFrame(desenhar);
}
requestAnimationFrame(desenhar);

// ---------- medidor do som: o que este visual está ouvindo agora ----------
const medBarras = { g: $('m-grave'), m: $('m-medio'), a: $('m-agudo') };
let medUltimo = 0;
function atualizarMedidor() {
  let A = null, relogio = 0;
  try {
    const w = palcos[ativo].el.contentWindow;
    if (w && w.__painel) { A = w.__painel.A; relogio = w.performance.now(); } // o relógio de cada quadro começa em zero na hora dele
  } catch {}
  const v = VISUAIS[atual];
  const sinal = A && (A.an || A.remoto) && relogio - A.ultimoSom < 2000;
  const fonteViva = sinal && A.musica;
  medBarras.g.style.width = (fonteViva ? A.grave * 100 : 0) + '%';
  medBarras.m.style.width = (fonteViva ? A.medio * 100 : 0) + '%';
  medBarras.a.style.width = (fonteViva ? A.agudo * 100 : 0) + '%';
  const b = A ? Math.max(0, A.bumbo) : 0;
  $('m-bumbo').style.opacity = fonteViva ? 0.15 + b * 0.85 : 0.1;
  const agora = performance.now();
  if (agora - medUltimo < 250) return;
  medUltimo = agora;
  let t;
  if (v.video) t = 'Vídeo: não reage ao som';
  else if (somTeste) t = 'Ouvindo: batida de teste';
  else if (!A) t = '';
  else if (fonteViva) t = `Ouvindo a entrada do PC: ${A.rmsDb.toFixed(0)} dB${A.bpm ? ` · ${A.bpm.toFixed(0)} BPM${A.confianca >= 0.25 ? '' : ' (incerto)'}` : ''}${A.picoDb > -0.2 ? ' · estourando' : ''}`;
  else if (sinal) t = `Chega sinal na entrada do PC (${A.rmsDb.toFixed(0)} dB), mas não parece música: batida interna`;
  else if (A.estado === 'ouvindo') t = 'Sem som na entrada do PC: batida interna';
  else t = 'Sem a saída do LED aberta: batida interna';
  $('m-texto').textContent = t;
}

// ---------- topo ----------
function desenharTopo() {
  const v = VISUAIS[atual];
  $('nome').innerHTML = '';
  $('nome').append(v.nome);
  const c = document.createElement('span');
  c.id = 'cont'; c.textContent = `${atual + 1} de ${VISUAIS.length}`;
  $('nome').append(c);
  if (v.selo) {
    const s = document.createElement('span');
    s.id = 'selo'; s.textContent = v.selo;
    $('nome').append(s);
  }
  if (abrindo) {
    const a = document.createElement('span');
    a.id = 'abrindo'; a.textContent = 'abrindo…';
    $('nome').append(a);
  }
  $('desc').textContent = v.desc;
  $('pontos').innerHTML = VISUAIS.map((x, i) => `<i class="${i === atual ? 'ligado' : (noLed && noLed.visual === x.id && noLed.noAr ? 'no-led' : '')}"></i>`).join('');
  $('som').textContent = somTeste ? 'Usar o som real' : 'Usar batida de teste';
  $('som').disabled = !!v.video;
  $('mandar').disabled = !v.led || !noLed;
  $('tirar').disabled = !noLed || !noLed.noAr;
  if (!noLed) $('estado').textContent = 'Saída para o LED fechada: abra mesa\\saida\\iniciar.vbs';
  else if (noLed.aviso) $('estado').textContent = 'LED: ' + noLed.aviso;
  else if (!noLed.noAr) $('estado').textContent = 'LED: mostrando outra coisa. Saída pronta.';
  else {
    const qual = VISUAIS.find(x => x.id === (noLed.carregando || noLed.visual));
    $('estado').textContent = (noLed.carregando ? 'Trocando o LED para: ' : 'No LED agora: ') + (qual ? qual.nome : noLed.visual) + (noLed.quadros ? ` · ${noLed.quadros} q/s` : '');
  }
}

async function perguntarSaida() {
  try {
    const r = await fetch(SAIDA_URL + '/estado', { cache: 'no-store' });
    noLed = await r.json();
  } catch { noLed = null; }
  desenharTopo();
}

async function mandar(rota) {
  $('estado').textContent = 'Enviando…';
  try {
    const r = await fetch(SAIDA_URL + rota, { method: 'POST' });
    noLed = await r.json();
  } catch { noLed = null; }
  desenharTopo();
  setTimeout(perguntarSaida, 800);
}

$('antes').onclick = () => abrir(atual - 1);
$('depois').onclick = () => abrir(atual + 1);
$('som').onclick = () => { somTeste = !somTeste; abrir(atual); };
$('mandar').onclick = () => mandar('/led?visual=' + encodeURIComponent(VISUAIS[atual].id));
$('tirar').onclick = () => mandar('/led?tirar=1');
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') abrir(atual - 1);
  else if (e.key === 'ArrowRight') abrir(atual + 1);
});
abrir(atual);
perguntarSaida();
setInterval(perguntarSaida, 3000);
window.__mesa = { abrir, get atual() { return VISUAIS[atual].id; }, get pronto() { return temImagem && !abrindo; }, get palco() { return palcos[ativo]; } };
