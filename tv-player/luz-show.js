// Botões de flash do LED da pista: atrás do logo, painel, balcão, barras e strobo em tudo.
// Segurar mantém aceso; soltar apaga com uma cauda curta, então um toque rápido vira uma piscada. O app repete o pedido enquanto o dedo está no botão:
// se o aparelho cair com o dedo em cima, tudo solta sozinho em 1,2 s.
//
// Fitas: quem desenha é o motor de balcao.js, que pergunta o nível a cada quadro. Painel: a saída do LED recebe o comando e desenha na própria página.
// Os dois calculam o strobo pelo relógio do PC, por isso piscam juntos.
const ALVOS = ['atras', 'painel', 'balcao', 'barras'];
const FITA = { sexto: 'balcao', barras: 'barras' };
const NO_PAINEL = ['atras', 'painel'];
// 7,5 piscadas por segundo sem frequência pedida. O máximo é 15: 1 quadro aceso e 1 apagado no sinal de 30 Hz que chega ao painel. Mais que isso o painel não mostra.
const PERIODO = 400 / 3;
const CAUDA = 140, SEM_PEDIDO = 1200, STROBO_MINIMO = 400, VOLTA_DA_COR = 450;

const estado = Object.fromEntries(ALVOS.map(a => [a, { liga: false, strobo: false, ate: 0, minimo: 0, soltou: -1e12 }]));

// Cor do strobo nas fitas: a última pedida. Flash comum é sempre branco.
let corStrobo = [255, 255, 255];
let forcaFlash = 100;
function soltar(s, agora) { if (s.liga) { s.liga = false; s.soltou = agora; } }
// 0 a 1: quanto de branco. -1: preto, a metade apagada do strobo.
function nivel(alvo, agora) {
  const s = estado[alvo];
  if (s.liga && agora > s.ate) soltar(s, agora);
  if (s.liga) return s.strobo ? (Math.floor(agora / ((s.periodo || PERIODO) / 2)) % 2 === 0 ? 1 : -1) : 1;
  const k = Math.exp(-(agora - s.soltou) / CAUDA);
  return k > 0.004 ? k : 0;
}

function criarLuzShow({ pedir, cor, limiteHz, intensidade }) {
  let corAlta = false;
  function conferirCor() {
    const agora = Date.now();
    NO_PAINEL.forEach(a => nivel(a, agora));
    const ocupado = NO_PAINEL.some(a => estado[a].liga || agora - estado[a].soltou < VOLTA_DA_COR);
    if (ocupado !== corAlta) { corAlta = ocupado; cor(ocupado); }
  }
  setInterval(conferirCor, 60).unref();

  function comando(acao, alvos, strobo, hz, cor) {
    if (intensidade) forcaFlash = intensidade();
    if (acao === 'liga') corStrobo = strobo && cor ? [0, 2, 4].map(i => parseInt(cor.slice(i, i + 2), 16)) : [255, 255, 255];
    const agora = Date.now();
    for (const a of alvos) {
      const s = estado[a];
      if (acao === 'liga') {
        if (hz > 0) s.periodo = 1000 / hz;
        if (!s.liga || s.strobo !== strobo) s.minimo = strobo ? agora + STROBO_MINIMO : 0;
        s.liga = true; s.strobo = strobo; s.ate = agora + SEM_PEDIDO;
      } else if (s.minimo > agora) {
        // toque curto no strobo ainda dá uma rajada: ele para sozinho quando o mínimo acaba
        s.ate = s.minimo;
      } else soltar(s, agora);
    }
    const noPainel = alvos.filter(a => NO_PAINEL.includes(a));
    if (noPainel.length) pedir('POST', `/flash?acao=${acao}&alvos=${noPainel.join(',')}&strobo=${strobo ? 1 : 0}&hz=${hz || 0}&cor=${cor || ''}&forca=${forcaFlash}`, 1000);
    conferirCor();
  }

  function atender(req, res, p, url, sendJson) {
    if (p !== '/api/show') return false;
    if (req.method === 'GET') { const agora = Date.now(); sendJson(res, 200, Object.fromEntries(ALVOS.map(a => [a, nivel(a, agora)]))); return true; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'método não aceito' }); return true; }
    const acao = url.searchParams.get('acao');
    // A fumaça não é flash: não mexe nas cores do MadMapper nem nas fitas. Só avisa a página do LED, que desenha e controla o tempo.
    if (url.searchParams.get('alvos') === 'fumaca' && ['liga', 'solta'].includes(acao)) {
      pedir('POST', `/flash?acao=${acao}&alvos=fumaca`, 1000);
      sendJson(res, 200, { ok: true });
      return true;
    }
    const alvos = String(url.searchParams.get('alvos') || '').split(',').filter(a => ALVOS.includes(a));
    if (!['liga', 'solta'].includes(acao) || !alvos.length) { sendJson(res, 400, { error: 'pedido inválido' }); return true; }
    // 15 por segundo é o máximo que o sinal de 30 Hz consegue mostrar; o limite do app pode ser menor
    const hzPedido = Number(url.searchParams.get('hz')) || 0;
    comando(acao, alvos, url.searchParams.get('strobo') === '1', hzPedido > 0 ? Math.max(1, Math.min(15, limiteHz ? limiteHz() : 15, hzPedido)) : 0, /^[0-9a-f]{6}$/i.test(url.searchParams.get('cor') || '') ? url.searchParams.get('cor') : '');
    sendJson(res, 200, { ok: true });
    return true;
  }
  return { atender };
}

// Para o motor das fitas. Só o balcão e as barras do 5º têm botão.
const nivelDaFita = (id, agora) => (FITA[id] ? nivel(FITA[id], agora) : 0);

module.exports = { criarLuzShow, nivelDaFita, corDaFita: () => corStrobo, forcaDaFita: () => forcaFlash / 100 };
