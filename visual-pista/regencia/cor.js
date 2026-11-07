// Camada de cor: uma folha por cima de tudo o que sai no LED, em qualquer visual, que muda a cor do conteúdo inteiro.
// Entra por mesa\saida\flash-pagina.js, abaixo do flash e por cima dos personagens e da fumaça. Desligada, não existe na página e não gasta nada.
// O estado vem da saída (main.js): window.__corCamada, e depois __corComando(estado) a cada mudança.
//   modo: tingir (a cor toma tudo, o preto fica preto), filtro (gelatina na frente da luz), suave (só puxa o tom), duas (degradê do fundo da pista até o booth)
//   auto: 'fixa' | 'faixa' (a cor segue o tom da música e muda na troca de faixa) | 'gira' (roda devagar pela roda de cores)
const Z = 2147483647;   // personagens e fumaça são 2147483646: ficam embaixo. O flash tem este mesmo número, mas vem depois na página: fica por cima.
const MISTURA = { tingir: 'color', filtro: 'multiply', suave: 'soft-light', duas: 'color' };
let folha = null, estado = null, raf = 0;
let atual = { h: 0, s: 1, l: 0.5, h2: 0, f: 0 };
let alvo = { h: 0, s: 1, l: 0.5, h2: 0, f: 0 };
let matizFaixa = 200, antes = performance.now(), corAplicada = '', opAplicada = -1, misturaAplicada = '';

const hexParaHsl = hex => {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), l = (M + m) / 2, d = M - m;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
};
// A roda de Camelot é a própria roda de cores: tons vizinhos, que combinam na mixagem, ficam em cores vizinhas.
const matizDoTom = tom => {
  const n = parseInt(tom, 10);
  if (!n) return null;
  return ((n - 1) * 30 + (tom.endsWith('B') ? 12 : 0)) % 360;
};
const pertoAng = (a, b, k) => { const d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; };

function criarFolha() {
  folha = document.createElement('div');
  folha.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z};will-change:opacity;`;
  document.documentElement.insertBefore(folha, document.body ? document.body.nextSibling : null);
}
function tirarFolha() { if (folha) { folha.remove(); folha = null; corAplicada = ''; opAplicada = -1; misturaAplicada = ''; } }

function passo() {
  raf = requestAnimationFrame(passo);
  const agora = performance.now();
  const dt = Math.min((agora - antes) / 1000, 0.1);
  antes = agora;
  if (!estado) return;
  const ligada = estado.ligada;
  const k = 1 - Math.exp(-dt / (estado.troca ?? 0.35));
  const base = hexParaHsl(estado.cor || 'ff0040');
  const base2 = hexParaHsl(estado.cor2 || '0040ff');
  alvo = { h: base.h, s: base.s, l: base.l, h2: base2.h, s2: base2.s, l2: base2.l, f: ligada ? (estado.forca ?? 100) / 100 : 0 };
  if (estado.auto === 'faixa') { alvo.h = matizFaixa; alvo.h2 = (matizFaixa + 42) % 360; alvo.s = alvo.s2 = 1; alvo.l = alvo.l2 = 0.5; }
  else if (estado.auto === 'gira') { const g = (agora / 1000 * (estado.giro ?? 6)) % 360; alvo.h = (base.h + g) % 360; alvo.h2 = (base2.h + g) % 360; }
  atual.h = pertoAng(atual.h, alvo.h, k); atual.h2 = pertoAng(atual.h2, alvo.h2, k);
  atual.s += (alvo.s - atual.s) * k; atual.l += (alvo.l - atual.l) * k; atual.f += (alvo.f - atual.f) * k;
  atual.s2 = (atual.s2 ?? alvo.s2) + (alvo.s2 - (atual.s2 ?? alvo.s2)) * k; atual.l2 = (atual.l2 ?? alvo.l2) + (alvo.l2 - (atual.l2 ?? alvo.l2)) * k;
  // Depois de apagar, a folha sai da página: sem ela, o navegador nem faz a conta da mistura
  if (!ligada && atual.f < 0.004) { tirarFolha(); cancelAnimationFrame(raf); raf = 0; return; }
  if (!folha) criarFolha();
  const c1 = `hsl(${atual.h.toFixed(1)} ${(atual.s * 100).toFixed(1)}% ${(atual.l * 100).toFixed(1)}%)`;
  const c2 = `hsl(${atual.h2.toFixed(1)} ${(atual.s2 * 100).toFixed(1)}% ${(atual.l2 * 100).toFixed(1)}%)`;
  // O degradê corre ao longo do painel: do fundo da pista até a parede do DJ
  const fundo = estado.modo === 'duas' ? `linear-gradient(180deg,${c1} 0%,${c2} 88%)` : c1;
  if (fundo !== corAplicada) { folha.style.background = fundo; corAplicada = fundo; }
  const mist = MISTURA[estado.modo] || 'color';
  if (mist !== misturaAplicada) { folha.style.mixBlendMode = mist; misturaAplicada = mist; }
  const op = +atual.f.toFixed(3);
  if (op !== opAplicada) { folha.style.opacity = op; opAplicada = op; }
}

window.__corComando = novo => {
  estado = novo;
  if (estado && estado.tom) { const m = matizDoTom(estado.tom); if (m !== null) matizFaixa = m; }
  if (estado && (estado.ligada || folha) && !raf) { antes = performance.now(); raf = requestAnimationFrame(passo); }
};

// A primeira cor entra sem transição: a página nova já nasce na cor que estava no ar, e a troca de visual não pisca
if (window.__corCamada) {
  const e = window.__corCamada;
  if (e.ligada) {
    const b = hexParaHsl(e.cor || 'ff0040'), b2 = hexParaHsl(e.cor2 || '0040ff');
    atual = { h: b.h, s: b.s, l: b.l, h2: b2.h, s2: b2.s, l2: b2.l, f: (e.forca ?? 100) / 100 };
  }
  window.__corComando(e);
}
window.__corEstado = () => ({ estado, atual, folha: !!folha, mistura: misturaAplicada });
