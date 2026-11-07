// Motor do Estúdio do painel: desenha a faixa de 4472 x 86 px em canvas 2D.
// Tudo é função do tempo dentro do loop, então o último quadro emenda no primeiro. A prévia do app e o
// vídeo que vai para o T50 saem desta mesma função.
(function (raiz) {
  'use strict';
  const W = 4472, H = 86, TAU = Math.PI * 2;

  // ---------- paleta do brand book (nada fora dela entra nas telas) ----------
  const COR = {
    black: '#000000', white: '#ffffff', deepGrey: '#6f6f6f', baseGrey: '#9d9d9e', midGrey: '#b7b9bc', lightGrey: '#cccccd', softGrey: '#e3e4e5',
    heat: '#ff0000', pulse: '#ff4c2c', impact: '#ff8564', field: '#00771a', flow: '#00b02a', signal: '#00c059', night: '#0070ae', frequency: '#00a0e2', glow: '#07b9df',
  };
  const NOME_COR = { black: 'Black', white: 'White', deepGrey: 'Deep Grey', baseGrey: 'Base Grey', midGrey: 'Mid Grey', lightGrey: 'Light Grey', softGrey: 'Soft Grey', heat: 'Heat', pulse: 'Pulse', impact: 'Impact', field: 'Field', flow: 'Flow', signal: 'Signal', night: 'Night', frequency: 'Frequency', glow: 'Glow' };
  const GRAD = {
    metal: [[0.01, '#6f6f6f'], [0.19, '#ffffff'], [0.41, '#9c9d9d'], [0.52, '#d2d3d3'], [0.64, '#b4b4b5'], [0.70, '#858585'], [0.75, '#cbcccd'], [0.84, '#e3e4e5']],
    red: [[0, '#ff8564'], [0.55, '#ff4c2c'], [0.91, '#ff0000']],
    green: [[0, '#00c059'], [0.55, '#00b02a'], [0.91, '#00771a']],
    blue: [[0, '#07b9df'], [0.55, '#00a0e2'], [0.91, '#0070ae']],
  };

  // ---------- biblioteca ----------
  const LETRAS = 'abcdefghij'.split('');
  const NOME_FIG = { a: 'A Anfitriã', b: 'A Eufórica', c: 'O Flerte, ele', d: 'O Flerte, ela', e: 'O Frequente', f: 'O Registro', g: 'A It Girl', h: 'O Curador', i: 'O Beijo', j: 'O Faminto' };
  const ELENCO = ['a', 'b', 'e', 'f', 'g', 'j', 'c', 'i', 'd']; // sem O Curador (h), que segura um vinil
  const ARTES = {};
  for (const l of LETRAS) {
    ARTES['sol-' + l] = { fam: 'personagem', nome: NOME_FIG[l], arq: 'arte/sol-' + l + '.webp', mini: 'mini/sol-' + l + '.webp', fig: l };
    ARTES['frag-' + l] = { fam: 'fragmento', nome: NOME_FIG[l], arq: 'arte/frag-' + l + '.webp', mini: 'mini/frag-' + l + '.webp', fig: l };
  }
  Object.assign(ARTES, {
    'logo-clube': { fam: 'logo', nome: 'CLUBE', arq: 'arte/logo-clube.webp', mini: 'mini/logo-clube.webp', trat: 'metal' },
    'logo-clubebar': { fam: 'logo', nome: 'CLUBE Bar', arq: 'arte/logo-clubebar.webp', mini: 'mini/logo-clubebar.webp', trat: 'metal' },
    'logo-bar': { fam: 'logo', nome: 'Bar', arq: 'arte/logo-bar.webp', mini: 'mini/logo-bar.webp', trat: 'metal' },
    logomark: { fam: 'logo', nome: 'Logomark', trat: 'metal', caminho: 'M63.11,219.67c19.82,23.87,51.38,38.43,83.74,38.43,43.29,0,69.58-19.42,98.3-50.97l29.13,21.85c-36,39.24-70.79,62.3-127.43,62.3C63.92,291.26,0,227.35,0,144.82S64.73,0,146.85,0c31.55,0,58.66,11.33,81.31,28.32,20.23,14.97,34.79,35.2,46.12,59.47l-30.83,19.25c-4.64-20.12-15.26-38.63-31.76-52.64-26.01-22.08-58.6-26.23-92.81-18.95-27.74,5.9-50.5,24.24-65.26,47.59-26.12,41.31-21.74,99.04,9.49,136.64Z', vb: [274.28, 291.26] },
    'sinal-rooftop': { fam: 'sinal', nome: 'Rooftop', arq: 'arte/sinal-rooftop.webp', mini: 'mini/sinal-rooftop.webp' },
    'sinal-elevador': { fam: 'sinal', nome: 'Elevador', arq: 'arte/sinal-elevador.webp', mini: 'mini/sinal-elevador.webp' },
    'sinal-saida': { fam: 'sinal', nome: 'Saída', arq: 'arte/sinal-saida.webp', mini: 'mini/sinal-saida.webp' },
    'sinal-banheiro': { fam: 'sinal', nome: 'Banheiro e staff', arq: 'arte/sinal-banheiro.webp', mini: 'mini/sinal-banheiro.webp' },
  });

  // ---------- contas ----------
  const limita = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const frac = v => v - Math.floor(v);
  const mod = (a, n) => ((a % n) + n) % n;
  const suave = t => t * t * (3 - 2 * t);
  const inOutQuint = t => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);
  function acaso(semente) { let s = semente >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // (quem desenha a miniatura de um vídeo não dispara a conversão dele)
  const novoCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // Faixas de cor prontas: a sequência do gradiente da marca e o espelho dela, para repetir sem emenda.
  const faixas = {};
  function faixaGrad(nome) {
    if (faixas[nome]) return faixas[nome];
    const c = novoCanvas(2048, 2), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 2048, 0);
    const paradas = GRAD[nome] || GRAD.metal;
    for (const [p, cor] of paradas) gr.addColorStop(p / 2, cor);
    for (const [p, cor] of paradas.slice().reverse()) gr.addColorStop(1 - p / 2, cor);
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 2);
    return (faixas[nome] = c);
  }
  // O gradiente na vertical, para barras finas de inox.
  let metalV = null;
  function faixaMetalV() {
    if (metalV) return metalV;
    const c = novoCanvas(2, H), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H);
    for (const [p, cor] of GRAD.metal) gr.addColorStop(p, cor);
    g.fillStyle = gr; g.fillRect(0, 0, 2, H);
    return (metalV = c);
  }
  // Pinta o gradiente repetido em [xa, xb], com período `per` (ida e volta) e deslocamento `fase` em px.
  function pintarFaixa(g, nome, xa, ya, xb, yb, per, fase) {
    const tile = faixaGrad(nome);
    const ini = xa - mod(xa - fase, per), TW = tile.width;
    for (let x = ini; x < xb; x += per) {
      const a = Math.max(x, xa), b = Math.min(x + per, xb);
      if (b > a) g.drawImage(tile, ((a - x) / per) * TW, 0, Math.max(0.01, ((b - a) / per) * TW), 2, a, ya, b - a, yb - ya);
    }
  }
  // Canvas de ruído fixo: cimento e inox escovado.
  const texturas = {};
  function textura(nome) {
    if (texturas[nome]) return texturas[nome];
    const w = 1024, h = H, c = novoCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    const r = acaso(nome === 'concreto' ? 7 : 11);
    if (nome === 'concreto') {
      // nuvens em três escalas + poros: cimento queimado, liso e limpo
      const camada = (px, py) => { const cw = Math.ceil(w / px) + 1, ch = Math.ceil(h / py) + 2, v = new Float32Array(cw * ch); for (let i = 0; i < v.length; i++) v[i] = r(); for (let y = 0; y < ch; y++) v[y * cw + cw - 1] = v[y * cw]; return (x, y) => { const fx = x / px, fy = y / py, ix = Math.floor(fx), iy = Math.floor(fy), tx = suave(fx - ix), ty = suave(fy - iy), a = v[iy * cw + ix], b = v[iy * cw + ix + 1], c2 = v[(iy + 1) * cw + ix], e = v[(iy + 1) * cw + ix + 1]; return (a + (b - a) * tx) + ((c2 + (e - c2) * tx) - (a + (b - a) * tx)) * ty; }; };
      const n1 = camada(128, 64), n2 = camada(32, 24), n3 = camada(8, 8);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = 0.5 * n1(x, y) + 0.33 * n2(x, y) + 0.17 * n3(x, y), poro = r() > 0.993 ? -38 : 0;
        const v = 64 + (k - 0.5) * 52 + (r() - 0.5) * 7 + poro, i = (y * w + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.01; d[i + 3] = 255;
      }
    } else { // inox escovado: riscos longos na horizontal
      const lin = new Float32Array(h); for (let y = 0; y < h; y++) lin[y] = r();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 200 + (lin[y] - 0.5) * 46 + (Math.sin((x / w) * TAU * 3 + lin[y] * 9) * 0.5) * 12 + (r() - 0.5) * 8, i = (y * w + x) * 4;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return (texturas[nome] = c);
  }
  let brilhoV = null;
  function bandaBrilho() { // mancha horizontal branca, para o reflexo que corre no metal
    if (brilhoV) return brilhoV;
    const c = novoCanvas(256, 2), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 2);
    return (brilhoV = c);
  }

  const tmp = novoCanvas(16, 16), tmpG = tmp.getContext('2d');
  function prepararTmp(w, h) { if (tmp.width < w) tmp.width = Math.ceil(w); if (tmp.height < h) tmp.height = Math.ceil(h); }

  // ---------- motor ----------
  function criar(opcoes) {
    const base = (opcoes && opcoes.base) || '';
    const urlProxy = (opcoes && opcoes.urlProxy) || null; // quem converte os vídeos da marca
    const fontes = {}; // id -> { w, h, pronta, nivel(px), desenha... }
    const textos = new Map();
    const videos = {};
    let catalogo = (opcoes && opcoes.catalogo) || [];
    let aoMudar = () => {};

    // níveis de redução (mip): sem eles a textura fina das figuras serrilha na hora de encolher
    function fazerNiveis(img, w, h) {
      const niveis = [{ fonte: img, h, w }];
      let cw = w, ch = h, ant = img;
      while (ch > 24) {
        const nw = Math.max(1, Math.round(cw / 2)), nh = Math.max(1, Math.round(ch / 2)), c = novoCanvas(nw, nh), g = c.getContext('2d');
        g.imageSmoothingQuality = 'high'; g.drawImage(ant, 0, 0, nw, nh);
        niveis.push({ fonte: c, h: nh, w: nw }); ant = c; cw = nw; ch = nh;
      }
      return niveis;
    }
    function nivelPara(f, alvoH) {
      const ns = f.niveis; let i = 0;
      while (i + 1 < ns.length && ns[i + 1].h >= alvoH) i++;
      return i;
    }
    function fonteArte(id) {
      if (fontes[id]) return fontes[id];
      const a = ARTES[id];
      if (!a) return null;
      const f = fontes[id] = { id, w: 1, h: 1, pronta: false, tintas: {}, niveis: null };
      if (a.caminho) {
        const es = 1024 / a.vb[1], c = novoCanvas(a.vb[0] * es, 1024), g = c.getContext('2d');
        g.scale(es, es); g.fillStyle = '#fff'; g.fill(new Path2D(a.caminho));
        f.w = c.width; f.h = c.height; f.niveis = fazerNiveis(c, c.width, c.height); f.pronta = true;
        f.carga = Promise.resolve(f);
      } else {
        f.carga = new Promise(ok => {
          const img = new Image();
          img.onload = () => { f.w = img.naturalWidth; f.h = img.naturalHeight; f.niveis = fazerNiveis(img, f.w, f.h); f.pronta = true; aoMudar(); ok(f); };
          img.onerror = () => ok(f);
          img.src = base + a.arq;
        });
      }
      return f;
    }
    // Texto: rasterizado uma vez, depois se comporta como qualquer arte.
    const familias = {
      archivo: { 200: 'Archivo-ExtraLight.ttf', 300: 'Archivo-Light.ttf', 400: 'Archivo-Regular.ttf', 500: 'Archivo-Medium.ttf', 600: 'Archivo-SemiBold.ttf' },
    };
    const carregadas = {};
    function carregarFonte(nome, peso, italico) {
      const chave = nome + peso + (italico ? 'i' : '');
      if (carregadas[chave]) return carregadas[chave];
      let fam, arq;
      if (nome === 'mythshire') { fam = 'CLUBE Mythshire'; arq = 'fontes/MythshireRegular.woff2'; peso = 400; italico = false; }
      else {
        fam = 'CLUBE Archivo';
        arq = italico ? 'fontes/' + (peso <= 300 ? 'Archivo-LightItalic.ttf' : 'Archivo-Italic.ttf') : 'fontes/' + (familias.archivo[peso] || familias.archivo[400]);
      }
      const ff = new FontFace(fam, 'url("' + base + arq + '")', { weight: String(peso), style: italico ? 'italic' : 'normal' });
      return (carregadas[chave] = ff.load().then(x => { document.fonts.add(x); aoMudar(); return x; }).catch(() => null));
    }
    function fonteTexto(c) {
      const peso = c.fonte === 'mythshire' ? 400 : (c.peso || 300), it = !!c.italico && c.fonte !== 'mythshire';
      const chave = [c.texto, c.fonte, peso, it, c.tracking || 0].join('|');
      if (textos.has(chave)) return textos.get(chave);
      const f = { id: 'tx:' + chave, w: 1, h: 1, pronta: false, tintas: {}, niveis: null };
      textos.set(chave, f);
      if (textos.size > 40) textos.delete(textos.keys().next().value);
      f.carga = carregarFonte(c.fonte, peso, it).then(() => {
        const px = 220, fam = c.fonte === 'mythshire' ? '"CLUBE Mythshire"' : '"CLUBE Archivo"';
        const fonteCss = (it ? 'italic ' : '') + peso + ' ' + px + 'px ' + fam;
        const med = novoCanvas(4, 4).getContext('2d'); med.font = fonteCss;
        const txt = String(c.texto || ' '), tr = (c.tracking || 0) * px;
        const chars = Array.from(txt);
        let larg = 0, esq = 0, sobe = 0, desce = 0;
        for (const ch of chars) { const m = med.measureText(ch); sobe = Math.max(sobe, m.actualBoundingBoxAscent); desce = Math.max(desce, m.actualBoundingBoxDescent); }
        if (tr) { for (const ch of chars) larg += med.measureText(ch).width + tr; larg -= tr; } else { const m = med.measureText(txt); larg = m.width; esq = m.actualBoundingBoxLeft; larg = Math.max(larg, m.actualBoundingBoxRight + esq); }
        const folga = 8, cnv = novoCanvas(larg + folga * 2 + Math.max(0, esq), sobe + desce + folga * 2), g = cnv.getContext('2d');
        g.font = fonteCss; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
        const y0 = folga + sobe;
        if (tr) { let x = folga; for (const ch of chars) { g.fillText(ch, x, y0); x += med.measureText(ch).width + tr; } } else g.fillText(txt, folga + Math.max(0, esq), y0);
        f.w = cnv.width; f.h = cnv.height; f.niveis = fazerNiveis(cnv, f.w, f.h); f.pronta = true; aoMudar();
        return f;
      });
      return f;
    }
    // Vídeos do estado Instância e motion do logo: o servidor gera uma versão leve, quadrada, sobre preto.
    function fonteVideo(id) {
      if (videos[id]) return videos[id];
      const info = catalogo.find(v => v.id === id);
      const f = videos[id] = { id, w: 1, h: 1, pronta: false, video: true, dur: (info && info.dur) || 12, el: null, mini: null };
      if (info && info.mini) { const m = new Image(); m.onload = () => { f.mini = m; aoMudar(); }; m.src = base + info.mini; }
      if (!urlProxy) { f.carga = Promise.resolve(f); f.iniciar = () => f.carga; return f; }
      f.iniciar = () => f.carga || (f.carga = urlProxy(id).then(url => new Promise(ok => {
        const el = document.createElement('video');
        el.muted = true; el.playsInline = true; el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
        el.setAttribute('playsinline', ''); el.setAttribute('muted', '');
        el.oncanplay = () => { if (f.pronta) return; f.el = el; f.w = el.videoWidth; f.h = el.videoHeight; f.dur = el.duration || f.dur; f.pronta = true; aoMudar(); ok(f); };
        el.onerror = () => { f.erro = true; ok(f); };
        el.src = url;
        el.load();
      })).catch(() => { f.erro = true; aoMudar(); return f; }));
      return f;
    }
    function fontesDaCamada(c) {
      if (c.tipo === 'texto') return [fonteTexto(c)];
      if (c.tipo === 'video') return (c.artes || []).map(fonteVideo);
      if (c.tipo === 'arte') return (c.artes || []).map(fonteArte).filter(Boolean);
      return [];
    }
    function preparar(comp, opcoes) { // espera tudo que a peça usa
      const prom = [], soMini = opcoes && opcoes.soMini;
      for (const c of comp.camadas) for (const f of fontesDaCamada(c)) {
        if (f.video) { if (!soMini) prom.push(f.iniciar()); } else if (f.carga) prom.push(f.carga);
      }
      return Promise.all(prom);
    }

    // Tinta chapada guardada por nível, para não recompor a cada quadro.
    function tinta(f, nivel, cor) {
      const k = nivel + cor;
      if (f.tintas[k]) return f.tintas[k];
      const n = f.niveis[nivel], c = novoCanvas(n.w, n.h), g = c.getContext('2d');
      g.drawImage(n.fonte, 0, 0, n.w, n.h);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = cor; g.fillRect(0, 0, n.w, n.h);
      return (f.tintas[k] = c);
    }

    // Desenha uma cópia com o tratamento pedido. `v` é a janela da tela; (x, y, w, h) em px da faixa.
    function pintar(ctx, f, x, y, w, h, c, T, v, alfa, recorte) {
      if (!(w > 0.3) || !(h > 0.3)) return;
      const trat = c.trat || 'original';
      const x1 = Math.max(x, v.x0), x2 = Math.min(x + w, v.x0 + v.vw), y1 = Math.max(y, 0), y2 = Math.min(y + h, H);
      if (x2 <= x1 || y2 <= y1) return;
      if (f.video) {
        if (!v.soMini && f.iniciar) f.iniciar();
        if (!f.pronta) { if (f.mini) { ctx.globalAlpha = alfa * 0.5; ctx.drawImage(f.mini, x, y, w, h); } return; }
        ctx.globalAlpha = alfa;
        ctx.drawImage(f.el, x, y, w, h);
        return;
      }
      if (!f.pronta) return;
      const es = v.es;
      const nv = nivelPara(f, h * es), n = f.niveis[nv];
      const R = recorte; // { cels, ativa(i) } para o efeito de montar
      if (trat === 'original' && !c.reflexo && !R) { ctx.globalAlpha = alfa; ctx.drawImage(n.fonte, x, y, w, h); return; }
      if (COR[trat] && !c.reflexo && !R) { ctx.globalAlpha = alfa; ctx.drawImage(tinta(f, nv, COR[trat]), x, y, w, h); return; }
      if (trat === 'relevo') { // gravado em chapa de metal (Special Treatment do brand book)
        const d = Math.max(0.7, h / 44);
        ctx.globalAlpha = alfa * 0.75; ctx.drawImage(tinta(f, nv, '#ffffff'), x + d, y + d, w, h);
        ctx.globalAlpha = alfa * 0.9; ctx.drawImage(tinta(f, nv, '#000000'), x - d, y - d, w, h);
        ctx.globalAlpha = alfa; ctx.drawImage(tinta(f, nv, '#6f6f6f'), x, y, w, h);
        return;
      }
      // Composição numa tela temporária só do tamanho visível.
      const tw = Math.ceil((x2 - x1) * es) + 2, th = Math.ceil((y2 - y1) * es) + 2;
      prepararTmp(tw, th);
      const g = tmpG;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, tw, th);
      g.setTransform(es, 0, 0, es, -x1 * es, -y1 * es);
      g.imageSmoothingQuality = 'high';
      const fonteDes = COR[trat] ? tinta(f, nv, COR[trat]) : n.fonte;
      if (R) { // só as células já acesas
        const ncols = R.cols, nlins = R.lins, cw = w / ncols, ch = h / nlins, sw = n.w / ncols, sh = n.h / nlins;
        for (let ly = 0; ly < nlins; ly++) {
          const py = y + ly * ch; if (py > y2 || py + ch < y1) continue;
          for (let lx = 0; lx < ncols; lx++) {
            if (!R.ativa(lx, ly)) continue;
            const px = x + lx * cw; if (px > x2 || px + cw < x1) continue;
            g.drawImage(fonteDes, lx * sw, ly * sh, sw, sh, px, py, cw + 0.3 / es, ch + 0.3 / es);
          }
        }
      } else g.drawImage(fonteDes, x, y, w, h);
      if (GRAD[trat]) {
        const per = Math.max(w * 2, 300), fase = (c.reflexo || 0) * per * T.f + (c.faseCor || 0);
        const fam = ARTES[f.id] && ARTES[f.id].fam;
        if (trat !== 'metal' && !R && (fam === 'personagem' || fam === 'fragmento')) { // figura: mantém a textura, só leva a cor
          g.globalCompositeOperation = 'multiply';
          pintarFaixa(g, trat, x1 - 1, y1 - 1, x2 + 1, y2 + 1, per, x + fase);
          g.globalCompositeOperation = 'destination-in';
          g.drawImage(n.fonte, x, y, w, h);
        } else {
          g.globalCompositeOperation = 'source-atop';
          pintarFaixa(g, trat, x1 - 1, y1 - 1, x2 + 1, y2 + 1, per, x + fase);
        }
      } else if (c.reflexo) { // a arte como está, com um risco de luz correndo por cima
        g.globalCompositeOperation = 'source-atop';
        const bw = Math.max(h * 1.3, w * 0.55), px = x - bw + mod(c.reflexo * T.f * (w + bw * 2) + (c.faseCor || 0), w + bw * 2);
        g.globalAlpha = 0.85; g.drawImage(bandaBrilho(), px, y1 - 1, bw, y2 - y1 + 2); g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alfa;
      ctx.drawImage(tmp, 0, 0, tw, th, x1, y1, tw / es, th / es);
    }

    function janelaAlfa(c, f) {
      const j = c.janela;
      if (!j || (j.ini <= 0 && j.fim >= 1)) return 1;
      const fade = Math.max(0.0005, j.fade == null ? 0.02 : j.fade);
      let m = 0;
      for (const ff of [f, f - 1, f + 1]) {
        const a = limita((ff - (j.ini - fade)) / fade), b = limita(((j.fim + fade) - ff) / fade);
        m = Math.max(m, Math.min(a, b));
      }
      return suave(m);
    }

    // Uma camada de arte, texto ou vídeo: é aqui que moram os movimentos.
    function camadaArte(ctx, c, T, v, saida) {
      const lista = fontesDaCamada(c);
      if (!lista.length) return;
      if (!lista.some(f => f.pronta || f.mini)) { if (!v.soMini) lista.forEach(f => f.iniciar && f.iniciar()); return; }
      const n = lista.length, f = T.f, D = T.D;
      const hBase = (c.tamanho / 100) * H;
      const larg = fn => (fn.w / fn.h) * hBase;
      const larguraMax = lista.reduce((m, fn) => Math.max(m, fn.pronta ? larg(fn) : hBase), 0);
      const S = Math.max(4, c.espaco || larguraMax * 1.5);
      const L = S * n;
      let desloc = 0, repete = false, dirMov = 0;
      if (c.caminho === 'passar' && c.vel > 0) {
        const voltas = Math.max(1, Math.round((c.vel * D) / L));
        dirMov = c.dir < 0 ? -1 : 1;
        desloc = dirMov * voltas * L * f; repete = true;
      } else if (c.caminho === 'passo') {
        const paradas = Math.max(1, c.ciclos || n), avanco = L * Math.max(1, Math.round(paradas / n));
        const p = f * paradas, i = Math.floor(p), r = p - i, gira = 0.42;
        const s = r < 1 - gira ? 0 : inOutQuint((r - (1 - gira)) / gira);
        dirMov = c.dir < 0 ? -1 : 1;
        desloc = dirMov * ((i + s) / paradas) * avanco; repete = true;
      } else if (c.caminho === 'vaievem') {
        desloc = (c.amp || 200) * Math.sin(TAU * Math.max(1, c.ciclos || 1) * f);
      }
      const copias = Math.max(1, c.copias || 1);
      const margem = larguraMax * (1 + (c.respira || 0)) + 60;
      let kMin, kMax;
      if (repete) {
        kMin = Math.floor((v.x0 - margem - c.x - desloc) / S); kMax = Math.ceil((v.x0 + v.vw + margem - c.x - desloc) / S);
      } else { kMin = 0; kMax = copias - 1; }
      // Troca de arte no lugar (virar, montar, corte seco).
      let trocas = Math.max(0, c.trocas || 0);
      if (c.troca && c.troca !== 'nenhuma' && trocas) trocas = Math.ceil(trocas / n) * n;
      const atraso = c.atraso || 0;
      for (let k = kMin; k <= kMax; k++) {
        const kp = repete ? mod(k, n) : k; // a mesma cópia depois de uma volta inteira, para o loop fechar
        let idx = mod(k, n), sx = 1, recorte = null;
        if (c.troca && c.troca !== 'nenhuma' && trocas) {
          const p = f * trocas - kp * atraso, ciclo = Math.floor(p), r = p - ciclo;
          const durS = Math.min(0.46, (c.troca === 'montar' ? 2.4 : 1.1) / (D / trocas));
          idx = mod(k + ciclo, n);
          if (c.troca === 'virar') {
            if (r < durS) sx = Math.sin(inOutQuint(r / durS) * Math.PI / 2);
            else if (r > 1 - durS) sx = Math.cos(inOutQuint((r - (1 - durS)) / durS) * Math.PI / 2);
          } else if (c.troca === 'montar') {
            let prog = 1, sai = false;
            if (r < durS) prog = r / durS; else if (r > 1 - durS) { prog = 1 - (r - (1 - durS)) / durS; sai = true; }
            if (prog < 1) {
              const sem = (kp * 977 + mod(ciclo, trocas) * 131 + 7) >>> 0;
              recorte = { cols: Math.max(4, c.celulas || 14), lins: Math.max(6, Math.round((c.celulas || 14) * 1.25)),
                ativa: (lx, ly) => { const h1 = frac(Math.sin(lx * 12.9898 + ly * 78.233 + sem) * 43758.5453); return h1 <= suave(prog) * 1.02 && (prog > 0.001 || !sai); } };
            }
          }
        }
        const fn = lista[idx];
        if (!(fn.pronta || fn.mini)) continue;
        let w = fn.pronta ? larg(fn) : hBase, h = hBase;
        let esc = 1;
        if (c.respira) esc = 1 + c.respira * Math.sin(TAU * (Math.max(1, c.ciclosR || 2) * f + kp * 0.19));
        w *= esc; h *= esc;
        // giro no eixo vertical (rotação 360 do logomark e das figuras)
        let brilho = 1;
        if (c.giro) { const a = TAU * c.giro * f + kp * (c.faseGiro || 0.6); sx *= Math.cos(a); brilho = 0.45 + 0.55 * Math.abs(Math.cos(a)); }
        // lugar
        const xc = repete ? c.x + k * S + desloc : c.x + (k - (copias - 1) / 2) * S + desloc;
        let ancY = c.y == null ? 0.5 : c.y;
        if (c.varreY) ancY = limita(ancY + c.varreY * 0.5 * Math.sin(TAU * Math.max(1, c.ciclosY || 1) * f + kp * 1.7));
        let y = (H - h) * ancY;
        if (c.balanco) y += c.balanco * Math.sin(TAU * (Math.max(1, c.ciclosB || 8) * f + kp * 0.37));
        const wEf = Math.abs(w * sx);
        if (xc + wEf / 2 < v.x0 || xc - wEf / 2 > v.x0 + v.vw) continue;
        const alfa = (T.alfa != null ? T.alfa : 1) * (c.opacidade == null ? 1 : c.opacidade) * brilho;
        const invertido = (sx < 0) !== !!(c.espelhar && mod(kp, 2));
        const faz = (xx, al) => {
          if (invertido) {
            ctx.save(); ctx.translate(xx, 0); ctx.scale(-1, 1);
            const v2 = { x0: -v.vw * 2 - margem, vw: v.vw * 4 + margem * 2, es: v.es };
            pintar(ctx, fn, -wEf / 2, y, wEf, h, c, T, v2, al, recorte);
            ctx.restore();
          } else pintar(ctx, fn, xx - wEf / 2, y, wEf, h, c, T, v, al, recorte);
        };
        // rastro: cópias atrás do movimento, cada vez mais fracas
        if (c.rastro && dirMov) {
          const gap = c.rastroGap || 22;
          for (let i = c.rastro; i >= 1; i--) faz(xc - dirMov * i * gap, alfa * Math.pow(0.5, i) * 0.8);
        }
        faz(xc, alfa);
        if (saida) saida.push({ id: c.id, x: xc - wEf / 2, y, w: wEf, h, nome: fn.id });
      }
    }

    // ---------- efeitos: a matéria que o LED da pista usa, na escala da faixa ----------
    const memoEstrelas = {}, memoRastros = {}, memoBlocos = {}, memoMicelio = {};
    let bufMerc = null, gMerc = null, imgMerc = null;
    const EFEITOS = {
      preto(ctx, c, T, v, a) { ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.fillRect(v.x0, 0, v.vw, H); },
      cor(ctx, c, T, v, a) { ctx.globalAlpha = a; ctx.fillStyle = COR[c.cor] || '#000'; ctx.fillRect(v.x0, 0, v.vw, H); },
      gradiente(ctx, c, T, v, a) {
        const per = (c.esticar || 2236) * 2, fase = (c.voltas || 0) * per * T.f;
        ctx.globalAlpha = a;
        pintarFaixa(ctx, c.cor || 'metal', v.x0, 0, v.x0 + v.vw, H, per, fase);
      },
      inox(ctx, c, T, v, a) {
        const per = (c.esticar || 1400) * 2, fase = (c.voltas == null ? 1 : c.voltas) * per * T.f;
        ctx.fillStyle = '#000'; ctx.globalAlpha = a; ctx.fillRect(v.x0, 0, v.vw, H);
        ctx.globalAlpha = a * (c.brilho == null ? 0.42 : c.brilho);
        pintarFaixa(ctx, 'metal', v.x0, 0, v.x0 + v.vw, H, per, fase);
        const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = a;
        const t = textura('inox'); for (let x = v.x0 - mod(v.x0, t.width); x < v.x0 + v.vw; x += t.width) ctx.drawImage(t, x, 0);
        ctx.globalCompositeOperation = o;
      },
      canelado(ctx, c, T, v, a) { // chapa canelada: a canelura dos blocos da marca
        const per = (c.esticar || 900) * 2, fase = (c.voltas == null ? 1 : c.voltas) * per * T.f, p = c.passo || 14;
        ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.fillRect(v.x0, 0, v.vw, H);
        ctx.globalAlpha = a * (c.brilho == null ? 0.55 : c.brilho);
        pintarFaixa(ctx, 'metal', v.x0, 0, v.x0 + v.vw, H, per, fase);
        ctx.globalAlpha = a * 0.72; ctx.fillStyle = '#000';
        const ini = v.x0 - mod(v.x0, p), sombra = Math.max(1, p * 0.42);
        for (let x = ini; x < v.x0 + v.vw; x += p) ctx.fillRect(x, 0, sombra, H);
      },
      concreto(ctx, c, T, v, a) { // placas de cimento que abrem nas juntas para o que está atrás
        const nome = c.semente || 3, r = acaso(nome * 91 + 5), placas = [];
        let x = 0; while (x < W) { const w = 180 + Math.floor(r() * 520); placas.push([x, Math.min(W, x + w), r()]); x += w; }
        const aber = c.abertura == null ? 26 : c.abertura, ciclos = Math.max(1, c.ciclos || 2), t = textura('concreto');
        const brilho = c.brilho == null ? 1 : c.brilho;
        const gap = i => aber * Math.pow(0.5 + 0.5 * Math.sin(TAU * (ciclos * T.f - i / placas.length * 3)), 2);
        for (let i = 0; i < placas.length; i++) {
          const [xa, xb] = placas[i], g1 = gap(i) / 2, g2 = gap((i + 1) % placas.length) / 2, x1 = xa + g1, x2 = xb - g2;
          if (x2 < v.x0 || x1 > v.x0 + v.vw) continue;
          ctx.globalAlpha = a * brilho;
          ctx.save(); ctx.beginPath(); ctx.rect(x1, 0, x2 - x1, H); ctx.clip();
          for (let tx = x1 - mod(x1 + i * 137, t.width); tx < x2; tx += t.width) ctx.drawImage(t, tx, 0);
          ctx.restore();
          ctx.globalAlpha = a * 0.5 * brilho; ctx.fillStyle = '#d2d3d3'; ctx.fillRect(x1, 0, 1, H);
          ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#000'; ctx.fillRect(x2 - 1.5, 0, 1.5, H);
        }
      },
      estrelas(ctx, c, T, v, a) {
        const dens = c.densidade == null ? 60 : c.densidade, k = dens + '|' + (c.semente || 1);
        const lista = memoEstrelas[k] || (memoEstrelas[k] = (() => { const r = acaso((c.semente || 1) * 17 + 3), n = Math.round(dens * W / 1000), l = []; for (let i = 0; i < n; i++) { const g = r(); l.push({ x: r() * W, y: r() * H, t: g > 0.93 ? 2 : g > 0.55 ? 1.4 : 1, b: 0.25 + 0.75 * r() * r(), m: 1 + Math.floor(r() * 5), p: r(), am: 0.15 + 0.6 * r() }); } return l; })());
        ctx.fillStyle = '#fff';
        for (const s of lista) {
          const x = s.x;
          if (x < v.x0 - 2 || x > v.x0 + v.vw + 2) continue;
          const pis = 1 - s.am * (0.5 + 0.5 * Math.sin(TAU * (s.m * T.f + s.p)));
          ctx.globalAlpha = a * s.b * pis;
          ctx.fillRect(x, s.y, s.t, s.t);
        }
        // cadentes: cada uma nasce num momento do loop e cruza um trecho da faixa
        const nc = c.cadentes || 0;
        if (nc) {
          const r = acaso((c.semente || 1) * 311 + 9), dur = Math.min(0.5, 1.3 / T.D);
          for (let i = 0; i < nc; i++) {
            const ini = r(), x0 = r() * W, dirx = r() > 0.5 ? 1 : -1, y0 = r() * H * 0.35, compr = 160 + r() * 240, vel = 900 + r() * 900;
            const p = mod(T.f - ini, 1);
            if (p > dur) continue;
            const q = p / dur, cx = x0 + dirx * vel * 1.3 * q, cy = y0 + 46 * q;
            if (cx < v.x0 - compr || cx > v.x0 + v.vw + compr) continue;
            const gr = ctx.createLinearGradient(cx, cy, cx - dirx * compr, cy - 46 * compr / (vel * 1.3));
            gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = gr; ctx.lineWidth = 1.4; ctx.globalAlpha = a * Math.sin(q * Math.PI);
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - dirx * compr, cy - 46 * compr / (vel * 1.3)); ctx.stroke();
          }
        }
      },
      via(ctx, c, T, v, a) { // faixa de poeira da Via Láctea, parada: quem anda é o brilho
        const t = viaTile(c.semente || 2);
        const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        const per = t.width, fase = (c.voltas || 0) * per * T.f;
        ctx.globalAlpha = a * (c.brilho == null ? 0.8 : c.brilho);
        for (let x = v.x0 - mod(v.x0 - fase, per); x < v.x0 + v.vw; x += per) ctx.drawImage(t, x, 0, per, H);
        ctx.globalCompositeOperation = o;
      },
      rastros(ctx, c, T, v, a) { // longa exposição: arcos que correm ao longo da faixa
        const n = c.qtd || 46, k = n + '|' + (c.semente || 4);
        const l = memoRastros[k] || (memoRastros[k] = (() => { const r = acaso((c.semente || 4) * 53 + 1), o = []; for (let i = 0; i < n; i++) o.push({ y: r() * H, x: r() * W, c: 180 + r() * 760, b: 0.25 + 0.75 * r() * r(), vo: 1 + Math.floor(r() * 3), g: r() > 0.86 ? 1.6 : 1 }); return o; })());
        const dir = c.dir < 0 ? -1 : 1, vol = c.voltas == null ? 1 : c.voltas;
        const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        for (const s of l) {
          const x = mod(s.x + dir * vol * s.vo * W * T.f, W);
          for (const xx of [x, x - W, x + W]) {
            const xa = dir > 0 ? xx - s.c : xx, xb = dir > 0 ? xx : xx + s.c;
            if (xb < v.x0 || xa > v.x0 + v.vw) continue;
            const gr = ctx.createLinearGradient(xa, 0, xb, 0);
            gr.addColorStop(dir > 0 ? 0 : 1, 'rgba(255,255,255,0)'); gr.addColorStop(dir > 0 ? 1 : 0, 'rgba(255,255,255,1)');
            ctx.fillStyle = gr; ctx.globalAlpha = a * s.b; ctx.fillRect(xa, s.y, s.c, s.g);
          }
        }
        ctx.globalCompositeOperation = o;
      },
      aurora(ctx, c, T, v, a) { // cortinas de luz prateada caindo do alto
        const passo = Math.max(5, 2 / v.es), g = faixaQueda(), f = T.f, o = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        const x0 = Math.floor(v.x0 / passo) * passo;
        for (let x = x0; x < v.x0 + v.vw; x += passo) {
          const u = x / W;
          const b = 0.42 + 0.34 * Math.sin(TAU * (u * 5 + 2 * f)) + 0.2 * Math.sin(TAU * (u * 13 - 3 * f) + 1.3) + 0.07 * Math.sin(TAU * (u * 31 + 4 * f) + 0.7);
          ctx.globalAlpha = a * limita(b * b * 1.3) * (c.brilho == null ? 0.9 : c.brilho);
          ctx.drawImage(g, x, 0, passo + 0.5, H);
        }
        ctx.globalCompositeOperation = o;
      },
      eclipse(ctx, c, T, v, a) { // disco preto com a coroa correndo ao longo da faixa
        const xc = c.x == null ? W / 2 : c.x, R = c.raio || 36, alc = c.alcance || 1500;
        const res = 0.8 + 0.2 * Math.sin(TAU * Math.max(1, c.ciclos || 2) * T.f);
        const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        for (const [al, alt, pes] of [[alc * res, H, 0.3], [alc * 0.45 * res, 34, 0.45], [alc * 0.22, 8, 0.9]]) {
          const gr = ctx.createLinearGradient(xc - al, 0, xc + al, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + pes + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr; ctx.globalAlpha = a; ctx.fillRect(xc - al, H / 2 - alt / 2, al * 2, alt);
        }
        const r = ctx.createRadialGradient(xc, H / 2, R * 0.9, xc, H / 2, R * 2.6);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = r; ctx.globalAlpha = a; ctx.fillRect(xc - R * 3, 0, R * 6, H);
        ctx.globalCompositeOperation = o;
        if (c.disco !== false) { ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(xc, H / 2, R, 0, TAU); ctx.fill(); }
      },
      grade(ctx, c, T, v, a) { // grade fina de inox: linhas verticais e um fio no meio
        const P = c.passo || 86, x0 = Math.floor((v.x0 - P) / P) * P, fase = (c.voltas || 0) * W * T.f;
        ctx.fillStyle = '#b7b9bc';
        for (let x = x0; x < v.x0 + v.vw + P; x += P) {
          const xx = x + mod(fase, P), onda = 0.5 + 0.5 * Math.sin(TAU * (xx / (c.onda || 1118) - Math.max(1, c.ciclos || 2) * T.f));
          ctx.globalAlpha = a * (0.06 + 0.3 * onda * onda);
          ctx.fillRect(xx, 0, 1, H);
        }
        ctx.globalAlpha = a * 0.18; ctx.fillRect(v.x0, c.fio == null ? H - 1 : c.fio, v.vw, 1);
      },
      clareira(ctx, c, T, v, a) { // preto de borda macia: o respiro do logo sobre o que passa atrás
        const xc = c.x == null ? W / 2 : c.x, l = c.largura || 500, m = c.borda || 180;
        const gr = ctx.createLinearGradient(xc - l / 2 - m, 0, xc + l / 2 + m, 0), tot = l + m * 2;
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(m / tot, 'rgba(0,0,0,1)'); gr.addColorStop(1 - m / tot, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.fillRect(xc - l / 2 - m, 0, tot, H);
      },
      porticos(ctx, c, T, v, a) { // voo por pórticos de inox até o ponto de fuga
        const xc = c.x == null ? W / 2 : c.x, K = c.qtd || 18, vol = Math.max(1, c.voltas || 2), metal = faixaMetalV();
        for (let i = 0; i < K; i++) {
          const fi = frac(vol * T.f + i / K);
          const d = 6 + 2500 * Math.pow(fi, 3.1), esp = 0.8 + 34 * Math.pow(fi, 2.4);
          const al = a * Math.min(1, fi * 7) * (c.brilho == null ? 0.95 : c.brilho);
          ctx.globalAlpha = al;
          for (const xx of [xc - d - esp, xc + d]) {
            if (xx + esp < v.x0 || xx > v.x0 + v.vw) continue;
            ctx.drawImage(metal, xx, 0, esp, H);
          }
        }
      },
      brise(ctx, c, T, v, a) { // lâminas que abrem em onda e deixam ver o que vem antes delas
        const P = c.passo || 30, cic = Math.max(1, c.ciclos || 2), lam = c.onda || 2236, x0 = Math.floor(v.x0 / P) * P;
        const per = 1400; ctx.fillStyle = '#000';
        for (let x = x0; x < v.x0 + v.vw; x += P) {
          const onda = 0.5 + 0.5 * Math.sin(TAU * (cic * T.f - x / lam)), ab = suave(limita(onda * 1.7));
          const lw = P * (1 - ab * 0.94); if (lw < 0.4) continue;
          const xa = x + (P - lw) / 2;
          ctx.globalAlpha = a; ctx.fillStyle = '#060606'; ctx.fillRect(xa, 0, lw, H);
          ctx.globalAlpha = a * (c.brilho == null ? 0.7 : c.brilho) * (0.25 + 0.75 * ab);
          pintarFaixa(ctx, 'metal', xa, 0, xa + Math.min(2, lw), H, per, (c.voltas || 1) * per * T.f);
          ctx.globalAlpha = a * 0.1 * (1 - ab);
          pintarFaixa(ctx, 'metal', xa, 0, xa + lw, H, per, (c.voltas || 1) * per * T.f);
        }
      },
      harpa(ctx, c, T, v, a) { // cabos de aço que vibram: cada um numa frequência
        const n = c.qtd || 7, f = T.f, passo = Math.max(10, 3 / v.es), o = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = c.espessura || 1.2;
        for (let i = 0; i < n; i++) {
          const y0 = ((i + 0.5) / n) * H, m = 1 + (i % 4), xp = frac(f * Math.max(1, c.voltas || 1) + i * 0.19) * W, om = 90 + i * 37;
          ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : '#b7b9bc'; ctx.globalAlpha = a * (0.5 + 0.5 * ((i * 7) % 3) / 2);
          ctx.beginPath();
          for (let x = Math.floor(v.x0 / passo) * passo; x <= v.x0 + v.vw + passo; x += passo) {
            let dd = mod(x - xp, W); if (dd > W / 2) dd -= W;
            const env = Math.exp(-(dd * dd) / (2 * 460 * 460));
            const y = y0 + (c.amp || 13) * env * Math.sin(x / om * 3) * Math.sin(TAU * (m * 6 * f) + i);
            if (x === Math.floor(v.x0 / passo) * passo) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = o;
      },
      agulhas(ctx, c, T, v, a) { // hastes de aço que descem quando algo passa
        const P = c.passo || 9, x0 = Math.floor(v.x0 / P) * P, metal = faixaMetalV(), vol = Math.max(1, c.voltas || 1);
        const n = c.ondas || 3;
        for (let x = x0; x < v.x0 + v.vw; x += P) {
          let b = 0;
          for (let i = 0; i < n; i++) { let dd = mod(x - (frac(vol * T.f * (i % 2 ? -1 : 1) + i / n) * W), W); if (dd > W / 2) dd -= W; b += Math.exp(-(dd * dd) / (2 * 300 * 300)); }
          const h = 6 + limita(b) * (H - 6), ph = 0.5 + 0.5 * Math.sin(x * 0.7);
          ctx.globalAlpha = a * (0.28 + 0.72 * limita(b)) * (0.7 + 0.3 * ph);
          ctx.drawImage(metal, 0, 0, 2, H, x, H - h, Math.max(1, P * 0.22), h);
        }
      },
      tubos(ctx, c, T, v, a) { // o painel como luminária: tubos que acendem e esfriam
        const n = c.qtd || 22, r = acaso((c.semente || 8) * 29 + 2), o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        const y = c.y == null ? H / 2 : c.y;
        for (let i = 0; i < n; i++) {
          const x = (i / n) * W, w = (W / n) * 0.92, ini = r(), m = 1 + Math.floor(r() * 2);
          if (x + w < v.x0 || x > v.x0 + v.vw) continue;
          const p = frac(m * T.f - ini);
          const b = p < 0.03 ? (Math.sin(p * 900) > 0 ? 1 : 0.3) : Math.exp(-(p - 0.03) * 5);
          ctx.globalAlpha = a * b; ctx.fillStyle = '#fff'; ctx.fillRect(x, y - 1.5, w, 3);
          ctx.globalAlpha = a * b * 0.34; ctx.fillStyle = '#e3e4e5'; ctx.fillRect(x - 4, y - 7, w + 8, 14);
          ctx.globalAlpha = a * b * 0.16; ctx.fillRect(x - 12, 0, w + 24, H);
        }
        ctx.globalCompositeOperation = o;
      },
      feixes(ctx, c, T, v, a) { // moving lights na névoa: nascem na borda de baixo e varrem a faixa
        const n = c.qtd || 14, o = ctx.globalCompositeOperation, cic = Math.max(1, c.ciclos || 2), abre = c.abertura == null ? 1.35 : c.abertura;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const x0 = ((i + 0.5) / n) * W, ang = abre * Math.sin(TAU * (cic * (1 + (i % 3)) * T.f + i * 0.37));
          const dx = Math.tan(ang) * H, l = 4 + (i % 4) * 5 + Math.abs(dx) * 0.05;
          if (Math.max(x0, x0 + dx) + l < v.x0 || Math.min(x0, x0 + dx) - l > v.x0 + v.vw) continue;
          const gr = ctx.createLinearGradient(x0, H, x0 + dx, 0);
          gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.65, 'rgba(226,230,240,.22)'); gr.addColorStop(1, 'rgba(226,230,240,0)');
          ctx.globalAlpha = a * (c.brilho == null ? 0.85 : c.brilho); ctx.fillStyle = gr;
          ctx.beginPath(); ctx.moveTo(x0 - 1.5, H); ctx.lineTo(x0 + 1.5, H); ctx.lineTo(x0 + dx + l, 0); ctx.lineTo(x0 + dx - l, 0); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = o;
      },
      aneis(ctx, c, T, v, a) { // astrolábio: anéis de inox em volta de um centro, cada um no seu tempo
        const xc = c.x == null ? W / 2 : c.x, n = c.qtd || 9, cic = Math.max(1, c.ciclos || 2), yc = H / 2;
        ctx.lineCap = 'butt';
        for (let i = 0; i < n; i++) {
          const r0 = 150 * Math.pow(1.27, i), r = r0 * (1 + 0.05 * Math.sin(TAU * (cic * (1 + (i % 2)) * T.f + i * 0.71)));
          ctx.lineWidth = 1 + (i % 3) * 1.6;
          ctx.strokeStyle = i % 2 ? '#cbcccd' : '#858585';
          ctx.globalAlpha = a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(TAU * (cic * T.f + i * 0.3))));
          if (i % 3 === 1) { // dentes correndo; 16 é o período do tracejado, então o loop fecha
            ctx.setLineDash([9, 7]);
            ctx.lineDashOffset = -16 * Math.round(c.voltas == null ? 8 : c.voltas) * (i % 2 ? 1 : -1) * T.f;
          } else ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(xc, yc, r, 0, TAU); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      },
      mercurio(ctx, c, T, v, a) { // fio de mercúrio: ondas que nascem em vários pontos e se cruzam
        const cw = Math.max(40, Math.min(420, Math.ceil(v.vw / 11))), ch = 8;
        if (!bufMerc || bufMerc.width !== cw) { bufMerc = novoCanvas(cw, ch); gMerc = bufMerc.getContext('2d', { willReadFrequently: true }); imgMerc = gMerc.createImageData(cw, ch); }
        const r = acaso((c.semente || 5) * 37 + 4), n = c.qtd || 7, fontesM = [], d = imgMerc.data, cic = Math.max(1, c.ciclos || 8), comp = TAU / (c.onda || 260);
        for (let i = 0; i < n; i++) fontesM.push([r() * W, Math.max(1, Math.round(cic * (0.6 + r() * 0.8))), r()]);
        const br = c.brilho == null ? 1 : c.brilho;
        let q = 0;
        for (let y = 0; y < ch; y++) {
          const Y = (((y + 0.5) / ch) * H - H / 2) * 4;
          for (let x = 0; x < cw; x++) {
            const X = v.x0 + ((x + 0.5) / cw) * v.vw;
            let so = 0;
            for (const [xi, m, ph] of fontesM) { const dd = Math.sqrt((X - xi) * (X - xi) + Y * Y); so += Math.sin(dd * comp - TAU * (m * T.f + ph)) * Math.exp(-dd / 1500); }
            const g = Math.pow(limita(0.5 + so * 0.24), 3.4), lum = (5 + 225 * g) * br;
            d[q++] = lum; d[q++] = lum; d[q++] = lum * 1.02; d[q++] = 255;
          }
        }
        gMerc.putImageData(imgMerc, 0, 0);
        ctx.globalAlpha = a; ctx.drawImage(bufMerc, v.x0, 0, v.vw, H);
      },
      micelio(ctx, c, T, v, a) { // organismo de prata: cresce das pontas e procura o centro
        const k = c.semente || 3, xc = c.x == null ? W / 2 : c.x, chave = k + '|' + xc;
        const seg = memoMicelio[chave] || (memoMicelio[chave] = (() => {
          const r = acaso(k * 61 + 7), lista = [];
          const andar = (x, y, ang, prof, t0, passos) => {
            let t = t0;
            for (let i = 0; i < passos; i++) {
              const alvo = Math.atan2(0, xc - x) + (r() - 0.5) * 3.4;
              ang += (alvo - ang) * 0.42;
              const px = 15 + r() * 24, nx = x + Math.cos(ang) * px;
              let ny = y + Math.sin(ang) * px * 0.8;
              if (ny < 3 || ny > H - 3) { ny = y < H / 2 ? 4 + r() * 12 : H - 4 - r() * 12; ang = -ang; } // volta para dentro, sem correr colado na borda
              t += px;
              lista.push([x, y, nx, ny, t, prof]);
              x = nx; y = ny;
              if (Math.abs(x - xc) < 210) return;
              if (prof < 3 && r() < 0.09) andar(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r()), prof + 1, t, Math.round(passos * 0.5));
            }
          };
          for (let i = 0; i < 24; i++) { const lado = i % 2 ? 1 : -1, x0 = xc + lado * (500 + r() * 1730); andar(x0, 4 + r() * (H - 8), lado > 0 ? Math.PI : 0, 0, 0, 26 + Math.floor(r() * 40)); }
          const maior = lista.reduce((m, q) => Math.max(m, q[4]), 1);
          for (const q of lista) q[4] /= maior;
          return lista;
        })());
        const f = frac(T.f * Math.max(1, c.ciclos || 2)), cres = suave(limita(f / 0.72)), some = 1 - suave(limita((f - 0.86) / 0.14));
        if (some <= 0) return;
        const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#d2d3d3';
        for (let p = 0; p <= 3; p++) {
          ctx.lineWidth = 1.2 - p * 0.2; ctx.globalAlpha = a * some * (0.72 - p * 0.14);
          ctx.beginPath();
          for (const q of seg) { if (q[5] !== p || q[4] > cres) continue; if (Math.max(q[0], q[2]) < v.x0 || Math.min(q[0], q[2]) > v.x0 + v.vw) continue; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); }
          ctx.stroke();
        }
        // as pontas que acabaram de crescer brilham
        ctx.fillStyle = '#fff'; ctx.globalAlpha = a * some;
        for (const q of seg) { if (q[4] > cres || q[4] < cres - 0.022) continue; if (q[2] < v.x0 || q[2] > v.x0 + v.vw) continue; ctx.fillRect(q[2] - 1, q[3] - 1, 2, 2); }
        ctx.globalCompositeOperation = o;
      },
      reflexo(ctx, c, T, v, a) { // risco de luz que atravessa a faixa inteira
        const bw = c.largura || 900, vol = Math.max(1, c.voltas || 1), o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        const x = mod(vol * T.f * (W + bw * 2), W + bw * 2) - bw;
        ctx.globalAlpha = a * (c.brilho == null ? 0.3 : c.brilho);
        ctx.drawImage(bandaBrilho(), x, 0, bw, H);
        ctx.globalCompositeOperation = o;
      },
    };
    let queda = null;
    function faixaQueda() {
      if (queda) return queda;
      const c = novoCanvas(2, H), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(226,230,240,1)'); gr.addColorStop(0.55, 'rgba(183,185,188,.45)'); gr.addColorStop(1, 'rgba(183,185,188,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 2, H);
      return (queda = c);
    }
    const tilesVia = {};
    function viaTile(sem) {
      if (tilesVia[sem]) return tilesVia[sem];
      const w = 2236, c = novoCanvas(w, H), g = c.getContext('2d'), r = acaso(sem * 71 + 13);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 520; i++) {
        const x = r() * w, y = H * 0.5 + (r() - 0.5) * H * 0.9, ra = 8 + r() * r() * 110, al = 0.012 + r() * 0.05;
        for (const xx of [x, x - w, x + w]) {
          const gr = g.createRadialGradient(xx, y, 0, xx, y, ra);
          const q = r() > 0.8 ? '200,211,239' : '227,228,229';
          gr.addColorStop(0, 'rgba(' + q + ',' + al + ')'); gr.addColorStop(1, 'rgba(' + q + ',0)');
          g.fillStyle = gr; g.fillRect(xx - ra, y - ra, ra * 2, ra * 2);
        }
      }
      g.globalCompositeOperation = 'source-over';
      return (tilesVia[sem] = c);
    }

    // Blocos: o grid da marca na faixa. Varredura (desliza numa direção) e alternância (cores trocam em 5 ou 10 quadros).
    function camadaBlocos(ctx, c, T, v, a) {
      const k = [c.semente, c.colunas, c.linhas, (c.pinturas || []).join()].join('|');
      const pint = (c.pinturas && c.pinturas.length) ? c.pinturas : ['metal', 'black', 'deepGrey'];
      const dados = memoBlocos[k] || (memoBlocos[k] = (() => {
        const r = acaso((c.semente || 1) * 131 + 17), cols = c.colunas || 24, lins = c.linhas || 1, linhas = [];
        for (let l = 0; l < lins; l++) {
          const blocos = []; let x = 0, q = 0;
          while (x < cols) { const larg = Math.min(cols - x, [1, 1, 2, 2, 3, 4, 6][Math.floor(r() * 7)]); blocos.push({ x, l: larg, i: q++ % pint.length, s: r() }); x += larg; }
          linhas.push(blocos);
        }
        return { cols, lins, linhas };
      })());
      const colW = W / dados.cols, altL = H / dados.lins, vao = c.vao == null ? 0 : c.vao;
      const modo = c.modo || 'varredura';
      const qds = c.quadros || 10;
      const passos = Math.max(pint.length, Math.round(T.D * 30 / qds / pint.length) * pint.length);
      const passoA = Math.floor(T.f * passos);
      const vol = Math.max(1, c.voltas || 1), dir = c.dir < 0 ? -1 : 1;
      for (let l = 0; l < dados.lins; l++) {
        let desl = 0;
        if (modo === 'varredura') {
          const paradas = Math.max(1, c.paradas || 8), p = T.f * paradas, i = Math.floor(p), r = p - i;
          const s = c.linear ? r : (r < 0.55 ? 0 : inOutQuint((r - 0.55) / 0.45));
          desl = ((l % 2 ? -dir : dir) * ((i + s) / paradas) * vol) * W;
        }
        for (const b of dados.linhas[l]) {
          let qual = b.i;
          if (modo === 'continua') qual = mod(b.i + passoA, pint.length);
          else if (modo === 'dividida') qual = mod(b.i + (b.x % 2 ? passoA : passos - passoA), pint.length);
          const nome = pint[qual], bx = b.x * colW, bw = b.l * colW - vao;
          for (const off of [0, -W, W]) {
            const xx = mod(bx + desl, W) + off;
            if (xx + bw < v.x0 || xx > v.x0 + v.vw) continue;
            ctx.globalAlpha = a;
            if (GRAD[nome]) {
              ctx.save(); ctx.beginPath(); ctx.rect(xx, l * altL, bw, altL - vao); ctx.clip();
              const per = Math.max(bw * 2, 400);
              pintarFaixa(ctx, nome, xx, l * altL, xx + bw, l * altL + altL - vao, per, xx + (c.reflexo || 0) * per * T.f);
              if (c.canelado && nome === 'metal') {
                ctx.globalAlpha = a * 0.42; ctx.fillStyle = '#000'; ctx.fillRect(xx, l * altL, bw, altL);
                ctx.globalAlpha = a * 0.3;
                for (let z = xx; z < xx + bw; z += 7) ctx.fillRect(z, l * altL, 2.5, altL);
              }
              ctx.restore();
            } else { ctx.fillStyle = COR[nome] || '#000'; ctx.fillRect(xx, l * altL, bw, altL - vao); }
          }
        }
      }
    }

    // ---------- quadro ----------
    function desenhar(ctx, comp, t, vista) {
      const D = Math.max(1, comp.duracao || 30);
      const f = frac(t / D);
      const v = vista || { x0: 0, vw: W, es: 1 };
      const T = { t: f * D, f, D };
      const caixas = [];
      ctx.save();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#000'; ctx.globalAlpha = 1; ctx.fillRect(v.x0, 0, v.vw, H);
      for (const c of comp.camadas) {
        if (c.oculta) continue;
        const a = janelaAlfa(c, f);
        if (a <= 0) continue;
        const base = c.opacidade == null ? 1 : c.opacidade;
        ctx.globalCompositeOperation = c.mistura || (c.tipo === 'video' ? 'lighter' : 'source-over');
        try {
          if (c.tipo === 'efeito') { const fx = EFEITOS[c.efeito]; if (fx) fx(ctx, c, T, v, a * base); }
          else if (c.tipo === 'blocos') camadaBlocos(ctx, c, T, v, a * base);
          else { T.alfa = a; camadaArte(ctx, c, T, v, caixas); T.alfa = null; }
        } catch (e) { if (!desenhar.avisou) { desenhar.avisou = true; console.error('camada', c.id, e); } }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return caixas;
    }

    // Vídeos seguem o relógio da peça. Na prévia, acerta quando desvia; na geração, cada quadro espera o vídeo chegar lá.
    function tempoDoVideo(fn, comp, t) {
      const D = Math.max(1, comp.duracao || 30), d = fn.dur || 12, n = Math.max(1, Math.round(D / d));
      return { alvo: mod(frac(t / D) * n * d, d), taxa: (n * d) / D };
    }
    function acertarVideos(comp, t, tocando) {
      for (const c of comp.camadas) {
        if (c.tipo !== 'video' || c.oculta) continue;
        for (const id of c.artes || []) {
          const fn = videos[id]; if (!fn || !fn.pronta) continue;
          const { alvo, taxa } = tempoDoVideo(fn, comp, t), el = fn.el;
          if (Math.abs(el.playbackRate - taxa) > 0.01) el.playbackRate = taxa;
          if (tocando) { if (el.paused) el.play().catch(() => {}); } else if (!el.paused) el.pause();
          let dif = Math.abs(el.currentTime - alvo); if (dif > fn.dur / 2) dif = fn.dur - dif;
          if (dif > (tocando ? 0.4 : 0.05)) el.currentTime = alvo;
        }
      }
    }
    async function videosExatos(comp, t) {
      const prom = [];
      for (const c of comp.camadas) {
        if (c.tipo !== 'video' || c.oculta) continue;
        for (const id of c.artes || []) {
          const fn = videos[id]; if (!fn || !fn.pronta) continue;
          const { alvo } = tempoDoVideo(fn, comp, t), el = fn.el;
          el.pause();
          if (Math.abs(el.currentTime - alvo) < 0.001) continue;
          prom.push(new Promise(ok => { const fim = () => { el.removeEventListener('seeked', fim); ok(); }; el.addEventListener('seeked', fim); el.currentTime = alvo; setTimeout(fim, 2000); }));
        }
      }
      await Promise.all(prom);
    }

    return { desenhar, preparar, fontesDaCamada, acertarVideos, videosExatos, fonteArte,
      aoMudar: fn => { aoMudar = fn; }, definirCatalogo: l => { catalogo = l; } };
  }

  // Dobra para o T50: linha de cima começa em x=1032 com o trecho 0..1720; a de baixo tem 1720..4472.
  function dobrar(g, faixa) {
    g.fillStyle = '#000'; g.fillRect(0, 0, 2752, 172);
    g.drawImage(faixa, 0, 0, 1720, H, 1032, 0, 1720, H);
    g.drawImage(faixa, 1720, 0, 2752, H, 0, 86, 2752, H);
  }

  raiz.PainelMotor = { W, H, COR, NOME_COR, GRAD, ARTES, LETRAS, NOME_FIG, ELENCO, criar, dobrar, faixaGrad };
})(typeof self !== 'undefined' ? self : this);
