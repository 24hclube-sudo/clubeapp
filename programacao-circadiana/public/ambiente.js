// Ambiente: a conta de cor da programação circadiana. O mesmo arquivo roda no servidor (fitas),
// nas telas (player.html) e no app (prévia), então todos chegam na mesma cor na mesma hora.
// Escrito em ES5 de propósito: o painel de LED do térreo é um Chrome 73.
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api; else raiz.Ambiente = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var TAU = Math.PI * 2, DIA = 1440, TAM_LUT = 256, ABERTURA = 0.35;

  function frac(v) { return v - Math.floor(v); }
  function limita(v, a, b) { return v < a ? a : v > b ? b : v; }
  function suave(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------- cor: as misturas são em OKLab, para o cinza virar cor sem passar por um tom sujo ----------
  function linear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gama(c) { c = limita(c, 0, 1); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  function raiz3(x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); }

  function paraLab(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    var r = linear(n >> 16), g = linear((n >> 8) & 255), b = linear(n & 255);
    var l = raiz3(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = raiz3(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = raiz3(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function deLab(L, a, b, saida, o) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b;
    var m = L - 0.1055613458 * a - 0.0638541728 * b;
    var s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    saida[o] = gama(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    saida[o + 1] = gama(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    saida[o + 2] = gama(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  }
  function hexDe(rgb, o) {
    var t = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(limita(rgb[(o || 0) + i], 0, 255)).toString(16); t += v.length < 2 ? '0' + v : v; }
    return t;
  }

  // ---------- efeitos: cada um é um conjunto de pesos, assim um efeito vira o outro devagar ----------
  var EFEITOS = {
    parado: { nome: 'Parado', mov: 0, warp: 0.05, resp: 0, onda: 0, plasma: 0 },
    deriva: { nome: 'Deriva', mov: 1, warp: 0.05, resp: 0, onda: 0, plasma: 0 },
    respira: { nome: 'Respira', mov: 0.6, warp: 0.04, resp: 0.28, onda: 0, plasma: 0 },
    onda: { nome: 'Brilho', mov: 1, warp: 0.03, resp: 0, onda: 1, plasma: 0 },
    plasma: { nome: 'Plasma', mov: 1, warp: 0, resp: 0, onda: 0, plasma: 1 },
  };
  var CAMPOS_EFEITO = ['mov', 'warp', 'resp', 'onda', 'plasma'];

  // ---------- programação: faixas do dia ----------
  // prog = { tz: minutos em relação ao UTC (São Paulo = -180), faixas: [{ id, nome, inicio: "HH:MM",
  //   transicao: min, telas: { cores: [a,b,c], efeito, vel, brilho }, fitas: { igual, cores, efeito, vel, brilho } }] }
  function minutos(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) % DIA : 0;
  }
  function textoHora(min) {
    min = ((Math.round(min) % DIA) + DIA) % DIA;
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function compilarSuperficie(s, reserva) {
    s = s || {};
    var base = s.igual && reserva ? reserva : s;
    var cores = base.cores && base.cores.length === 3 ? base.cores : ['#000000', '#000000', '#000000'];
    var ef = EFEITOS[base.efeito] || EFEITOS.deriva;
    return {
      lab: [paraLab(cores[0]), paraLab(cores[1]), paraLab(cores[2])],
      ef: ef, vel: Math.max(0, +base.vel || 0),
      brilho: limita((s.brilho == null ? 100 : +s.brilho) / 100, 0, 1),
    };
  }
  function parDoMinuto(fs, m) {
    var n = fs.length, i = n - 1;
    for (var k = 0; k < n; k++) if (fs[k].ini <= m) i = k;
    var b = fs[i], a = fs[(i + n - 1) % n];
    var dt = ((m - b.ini) % DIA + DIA) % DIA;
    return { a: a, b: b, k: b.trans > 0 && dt < b.trans ? suave(dt / b.trans) : 1, i: i, prox: fs[(i + 1) % n] };
  }
  function velDaSuperficie(par, qual) {
    var va = par.a[qual], vb = par.b[qual];
    return lerp(va.vel * va.ef.mov, vb.vel * vb.ef.mov, par.k);
  }
  function compilar(prog) {
    var fs = (prog.faixas || []).map(function (f) {
      var telas = compilarSuperficie(f.telas);
      return { id: f.id, nome: f.nome, ini: minutos(f.inicio), trans: Math.max(0, +f.transicao || 0), telas: telas, fitas: compilarSuperficie(f.fitas, f.telas) };
    }).sort(function (x, y) { return x.ini - y.ini; });
    if (!fs.length) fs = [{ id: 'nada', nome: '', ini: 0, trans: 0, telas: compilarSuperficie(null), fitas: compilarSuperficie(null) }];
    // a transição nunca passa do tempo desde a faixa anterior (senão a cor pularia)
    fs.forEach(function (f, i) {
      var ant = fs[(i + fs.length - 1) % fs.length];
      var gap = fs.length === 1 ? DIA : (f.ini - ant.ini + DIA) % DIA || DIA;
      f.trans = Math.min(f.trans, gap);
    });
    // Fase acumulada minuto a minuto: mudar a velocidade de uma faixa para outra nunca dá salto,
    // e virar o dia também não (dia × volta do dia inteiro + o que já andou hoje).
    var tabela = { telas: new Float64Array(DIA + 1), fitas: new Float64Array(DIA + 1) };
    ['telas', 'fitas'].forEach(function (q) {
      for (var m = 0; m < DIA; m++) tabela[q][m + 1] = tabela[q][m] + velDaSuperficie(parDoMinuto(fs, m + 0.5), q) / 60;
    });
    return { faixas: fs, tz: +prog.tz || 0, tabela: tabela };
  }

  // Momento: qual faixa vale e como cada superfície está naquele instante.
  // teste = { minuto, desde } mostra a hora escolhida, ainda com movimento.
  function momento(c, ms, teste) {
    var local = ms + c.tz * 60000, dia = Math.floor(local / 86400000);
    var minuto = teste ? teste.minuto : (local - dia * 86400000) / 60000;
    var par = parDoMinuto(c.faixas, minuto);
    return { minuto: minuto, dia: dia, par: par, faixa: par.b, proxima: par.prox, transicao: par.k < 1, ms: ms, teste: teste || null, c: c };
  }
  function superficie(mo, qual) {
    var par = mo.par, a = par.a[qual], b = par.b[qual], k = par.k, tab = mo.c.tabela[qual];
    var lab = [], ef = {};
    for (var i = 0; i < 3; i++) lab.push([lerp(a.lab[i][0], b.lab[i][0], k), lerp(a.lab[i][1], b.lab[i][1], k), lerp(a.lab[i][2], b.lab[i][2], k)]);
    CAMPOS_EFEITO.forEach(function (f) { ef[f] = lerp(a.ef[f], b.ef[f], k); });
    var im = Math.min(DIA - 1, Math.floor(mo.minuto)), fase = lerp(tab[im], tab[im + 1], mo.minuto - im) + mo.dia * tab[DIA];
    if (mo.teste) fase += (mo.ms - (mo.teste.desde || mo.ms)) / 3600000 * velDaSuperficie(par, qual);
    return { lab: lab, ef: ef, fase: frac(fase), brilho: lerp(a.brilho, b.brilho, k) };
  }

  // Degradê que dá a volta: a → b → c → a, em curva (Catmull-Rom), sem quina visível nas cores.
  function criarLut(s) {
    var lut = new Float32Array(TAM_LUT * 3), L = s.lab, v = [0, 0, 0];
    for (var i = 0; i < TAM_LUT; i++) {
      var p = i / TAM_LUT * 3, j = Math.floor(p), t = p - j;
      var p0 = L[(j + 2) % 3], p1 = L[j % 3], p2 = L[(j + 1) % 3], p3 = L[(j + 2) % 3];
      for (var c = 0; c < 3; c++) {
        v[c] = 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t);
      }
      deLab(v[0], v[1], v[2], lut, i * 3);
    }
    return lut;
  }

  // Pintor: devolve a função (u ao longo da parede, v na outra direção) → RGB 0–255.
  // lut pode ser reaproveitada: as cores mudam em minutos, o movimento muda a cada quadro.
  function pintor(s, lut, tSeg) {
    var f = s.fase, e = s.ef;
    var kResp = 1 - e.resp * (0.5 + 0.5 * Math.cos(TAU * tSeg / 14));
    var kBase = s.brilho * kResp, ultimo = TAM_LUT - 1;
    return function (u, v, saida, o) {
      // A parede inteira mostra só um trecho do degradê (ABERTURA) e esse trecho vai andando:
      // as telas ficam quase da mesma cor e o conjunto muda junto, em vez de uma cor por tela.
      var w = u * ABERTURA + f;
      if (e.warp) w += e.warp * (Math.sin(TAU * (v * 0.6 + f + u * 0.7)) + 0.6 * Math.sin(TAU * (v * 1.1 - 2 * f + u * 1.3)));
      if (e.plasma) {
        var pl = Math.sin(TAU * (u * 0.8 + v * 0.5 + f)) + Math.sin(TAU * (u * 0.35 - v * 0.9 - 2 * f + 0.3)) + Math.sin(TAU * (u * 1.1 + v * 0.7 + 3 * f + 0.6));
        w += e.plasma * pl * 0.07;
      }
      var q = frac(w) * TAM_LUT, i = Math.floor(q), t = q - i, a = i * 3, b = (i < ultimo ? i + 1 : 0) * 3;
      var r = lut[a] + (lut[b] - lut[a]) * t, g = lut[a + 1] + (lut[b + 1] - lut[a + 1]) * t, bl = lut[a + 2] + (lut[b + 2] - lut[a + 2]) * t;
      if (e.onda) { // faixa de luz macia atravessando: é o que dá cara de metal escovado
        var d = (frac(u * 0.9 + v * 0.3 - f * 3) - 0.5) / 0.16, luz = Math.exp(-d * d) * 0.55 * e.onda;
        r += (255 - r) * luz; g += (255 - g) * luz; bl += (255 - bl) * luz;
      }
      saida[o] = r * kBase; saida[o + 1] = g * kBase; saida[o + 2] = bl * kBase;
    };
  }

  // Cor média (rótulos, cor do texto por cima, cartões do app).
  function corMedia(s, lut) {
    var r = 0, g = 0, b = 0;
    for (var i = 0; i < TAM_LUT; i++) { r += lut[i * 3]; g += lut[i * 3 + 1]; b += lut[i * 3 + 2]; }
    return [r / TAM_LUT * s.brilho, g / TAM_LUT * s.brilho, b / TAM_LUT * s.brilho];
  }
  // As três cores do momento em hexadecimal, já com o brilho.
  function coresDe(s) {
    var out = [0, 0, 0];
    return s.lab.map(function (c) {
      deLab(c[0], c[1], c[2], out, 0);
      return hexDe([out[0] * s.brilho, out[1] * s.brilho, out[2] * s.brilho]);
    });
  }

  return {
    EFEITOS: EFEITOS, DIA: DIA, minutos: minutos, textoHora: textoHora, compilar: compilar, momento: momento,
    superficie: superficie, criarLut: criarLut, pintor: pintor, corMedia: corMedia, coresDe: coresDe, hexDe: hexDe,
  };
});
