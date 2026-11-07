// Animações das TVs (em pé, 2160x3840) feitas com o motor de motion da marca, quadro a quadro.
// Cada quadro é desenhado no instante exato (sem gravar em tempo real) e enviado ao
// estudio-servidor.js, que monta os vídeos com o ffmpeg. Os loops fecham perfeitos: todo
// movimento do motor é periódico em "motionLoopDuration".
(() => {
  const G = window.__grid;
  const W = 2160, H = 3840, FPS = 30;

  // Parâmetros comuns (os do painel da ferramenta ficam de fora, para o resultado não depender da tela).
  const BASE = {
    gridOn: false, gridOpacity: 0, motionMode: 'drift', speed: 0.7, contrast: 1, light: 1, fitMode: 'contain',
    tintMotion: 'none', mediaTintMotion: 'none', overlayTintMotion: 'none',
    tintPalette: 'neutro', mediaTintPalette: 'neutro', overlayTintPalette: 'neutro',
    tintColorSlot: 1, mediaTintColorSlot: 1, overlayTintColorSlot: 1,
    tintDuration: 6, gradTintOpacity: 0.16, mediaTintOpacity: 0.18, overlayTintOpacity: 0.12,
    layoutMode: 'morph', layoutDir: 'down', layoutAmt: 0.4, layoutSmooth: 0.72, layoutDuration: 6,
    sceneMode: 'none', sceneDuration: 6, tilt3d: 0, tilt3dMode: 'none', depthDuration: 12, depthSyncExport: true,
  };

  // figuras: { arquivo, rank (0 = maior bloco), zoom (amplitude da respiração), escala, x, y }
  // logo: { arquivo, largura (fração da tela), y (0..1), flutuar (px), cor }
  const PRESETS = [
    {
      id: 'grade-vermelha', nome: 'Grade vermelha', seed: 11, complexidade: 9, loop: 24,
      p: { palette: 'vermelho', layoutMode: 'morph', layoutAmt: 0.45, motionMode: 'drift' },
      figuras: [{ arquivo: 'el_boy_01.png', rank: 0 }, { arquivo: 'el_mina_01.png', rank: 2 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'grade-azul', nome: 'Grade azul', seed: 23, complexidade: 9, loop: 24,
      p: { palette: 'azul', layoutMode: 'ripple', layoutAmt: 0.5, motionMode: 'sweep',
        mediaTintMotion: 'cycleY', mediaTintPalette: 'azul', mediaTintColorSlot: 2, mediaTintOpacity: 0.35 },
      figuras: [{ arquivo: 'el_casal_01.png', rank: 0 }, { arquivo: 'el_boy_03.png', rank: 1 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'grade-verde', nome: 'Grade verde', seed: 37, complexidade: 9, loop: 24,
      p: { palette: 'verde', layoutMode: 'quadrant', layoutAmt: 0.5, motionMode: 'orbit' },
      figuras: [{ arquivo: 'el_mina_02.png', rank: 0 }, { arquivo: 'el_boy_02.png', rank: 3 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'prata', nome: 'Prata 3D', seed: 41, complexidade: 10, loop: 24,
      p: { palette: 'neutro', layoutMode: 'balance', layoutAmt: 0.4, motionMode: 'pulse', tilt3dMode: 'depthWave', tilt3d: 0.35, contrast: 1.35, light: 0.6 },
      figuras: [{ arquivo: 'el_boy_02.png', rank: 0 }, { arquivo: 'el_casal_01.png', rank: 1 }, { arquivo: 'el_mina_01.png', rank: 4 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'carrossel', nome: 'Carrossel', seed: 53, complexidade: 8, loop: 24,
      p: { palette: 'vermelho', layoutMode: 'twoRows', layoutAmt: 0.4, motionMode: 'drift', sceneMode: 'carouselY', sceneDuration: 4 },
      figuras: [{ arquivo: 'el_boy_04.png', rank: 0 }, { arquivo: 'image (70).png', rank: 1 }, { arquivo: 'el_mina_02.png', rank: 3 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'pixel', nome: 'Pixel', seed: 67, complexidade: 9, loop: 24,
      p: { palette: 'azul', layoutMode: 'stripeV', layoutAmt: 0.5, motionMode: 'sweep',
        overlayTintMotion: 'bandsY', overlayTintPalette: 'azul', overlayTintColorSlot: 0, overlayTintOpacity: 0.14 },
      figuras: [{ arquivo: 'el_pixel_mina_02.png', rank: 0 }, { arquivo: 'el_pixel_boy_03.png', rank: 1 }, { arquivo: 'el_pixel_mina_03.png', rank: 2 }],
      logo: { arquivo: 'logo_clube.png', largura: 0.62, y: 0.5 },
    },
    {
      id: 'clube', nome: 'CLUBE', seed: 79, complexidade: 5, loop: 24,
      p: { palette: 'vermelho', layoutMode: 'frameCenter', layoutAmt: 0.45, layoutDuration: 8, motionMode: 'orbit', speed: 0.5 },
      figuras: [],
      logo: { arquivo: 'logo_clube_bar.png', largura: 0.78, y: 0.5, flutuar: 18 },
    },
  ];

  const imagens = new Map();
  function imagem(arquivo) {
    if (!imagens.has(arquivo)) {
      const img = new Image();
      img.src = './assets/images/' + arquivo;
      imagens.set(arquivo, img.decode().then(() => img));
    }
    return imagens.get(arquivo);
  }

  // Logo em uma cor só (os arquivos são pretos sobre transparente), já na largura final.
  const logos = new Map();
  async function logoPintado(arquivo, largura, cor) {
    const chave = arquivo + '|' + largura + '|' + cor;
    if (!logos.has(chave)) {
      const img = await imagem(arquivo);
      const c = document.createElement('canvas');
      c.width = Math.round(largura);
      c.height = Math.round(largura * img.naturalHeight / img.naturalWidth);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = cor;
      x.fillRect(0, 0, c.width, c.height);
      logos.set(chave, c);
    }
    return logos.get(chave);
  }

  // Os blocos saem do gerador da ferramenta, com sorteio fixo (a mesma semente dá a mesma grade).
  function semeado(seed, fn) {
    const original = Math.random;
    Math.random = G.mulberry32(seed);
    try { return fn(); } finally { Math.random = original; }
  }

  async function montar(pr) {
    semeado(pr.seed, () => G.generateBlocks(pr.complexidade || 9));
    G.state.sceneSeed = pr.seed * 7919;
    G.state.tintSeed = pr.seed * 104729;
    G.state.media.clear();
    const porArea = G.state.blocks.slice().sort((a, b) => (b.gw * b.gh) - (a.gw * a.gh) || a.gy - b.gy || a.gx - b.gx);
    for (const f of pr.figuras || []) {
      const b = porArea[Math.min(f.rank, porArea.length - 1)];
      const el = await imagem(f.arquivo);
      Object.assign(b, { mediaScale: f.escala || 0.92, mediaX: f.x || 0, mediaY: f.y || 0 });
      b.figura = f;
      G.state.media.set(b.id, { type: 'image', el, name: f.arquivo });
    }
    const p = { ...G.getParamsFromUI(), ...BASE, ...pr.p, motionLoopDuration: pr.loop };
    G.ui.recSeconds.value = String(pr.loop); // fase da profundidade 3D acompanha o loop
    const logo = pr.logo ? await logoPintado(pr.logo.arquivo, W * pr.logo.largura, pr.logo.cor || '#ffffff') : null;
    return { p, logo };
  }

  // Um quadro no instante t (segundos). Figuras respiram devagar; o logo pode flutuar.
  function quadro(ctx, w, h, t, pr, m, layout) {
    const fase = t / pr.loop;
    for (const b of G.state.blocks) {
      if (!b.figura) continue;
      const base = b.figura.escala || 0.92;
      b.mediaScale = base * (1 + (b.figura.zoom ?? 0.035) * Math.sin(2 * Math.PI * (fase * 2 + b.gx * 0.13 + b.gy * 0.07)));
    }
    G.renderCompositeFrame(ctx, w, h, t, m.p, layout, false);
    if (m.logo) {
      const k = w / W;
      const lw = m.logo.width * k, lh = m.logo.height * k;
      const dy = (pr.logo.flutuar || 10) * k * Math.sin(2 * Math.PI * fase * 3);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 40 * k;
      ctx.drawImage(m.logo, (w - lw) / 2, h * pr.logo.y - lh / 2 + dy, lw, lh);
      ctx.restore();
    }
  }

  function novoLayout(pr) {
    const l = G.makeLayoutState();
    l.seed = pr.seed * 131;
    return l;
  }

  // Prévia de um instante, pequena, no painel.
  async function previa(id, t = 0, largura = 540) {
    const pr = PRESETS.find(x => x.id === id);
    const m = await montar(pr);
    G.state.exporting = true;
    const c = document.getElementById('rtv-previa');
    c.width = largura; c.height = Math.round(largura * H / W);
    const ctx = c.getContext('2d', { alpha: false });
    const layout = novoLayout(pr);
    // aquece o suavizador das linhas (2 s antes do instante pedido)
    for (let i = 2 * FPS; i > 0; i--) G.renderCompositeFrame(ctx, c.width, c.height, t - i / FPS, m.p, layout, false);
    quadro(ctx, c.width, c.height, t, pr, m, layout);
    G.state.exporting = false;
    return c.toDataURL('image/jpeg', 0.85).length;
  }

  function estado(txt) { document.getElementById('rtv-estado').textContent = txt; }

  async function renderizar(id) {
    const pr = PRESETS.find(x => x.id === id);
    const m = await montar(pr);
    const total = Math.round(pr.loop * FPS);
    await fetch('/inicio?job=' + pr.id, { method: 'POST' });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { alpha: false });
    const layout = novoLayout(pr);
    G.state.exporting = true;
    // Aquecimento em tempo contínuo (t < 0): o quadro 0 chega com o mesmo estado do fim do loop.
    for (let i = 2 * FPS; i > 0; i--) G.renderCompositeFrame(ctx, W, H, -i / FPS, m.p, layout, false);
    const t0 = performance.now();
    const envios = new Set();
    for (let n = 0; n < total; n++) {
      quadro(ctx, W, H, n / FPS, pr, m, layout);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.95));
      const envio = fetch(`/quadro?job=${pr.id}&n=${n}`, { method: 'POST', body: blob }).then(r => { if (!r.ok) throw new Error('quadro ' + n); });
      envios.add(envio);
      envio.finally(() => envios.delete(envio));
      if (envios.size >= 4) await Promise.race(envios);
      if (n % 10 === 0) {
        const s = (performance.now() - t0) / 1000 / (n + 1);
        estado(`${pr.nome}: ${n + 1}/${total} quadros · ${(s * 1000).toFixed(0)} ms/quadro · faltam ${Math.round(s * (total - n))} s`);
      }
    }
    await Promise.all(envios);
    G.state.exporting = false;
    estado(`${pr.nome}: codificando vídeos…`);
    const r = await (await fetch(`/finalizar?job=${pr.id}&fps=${FPS}`, { method: 'POST' })).json();
    estado(r.ok ? `${pr.nome}: pronto (${r.video})` : `${pr.nome}: erro ${r.error}`);
    return r;
  }

  async function renderizarTodos() {
    const res = [];
    for (const pr of PRESETS) res.push({ id: pr.id, ...(await renderizar(pr.id)) });
    estado('Todos prontos: ' + res.map(r => r.id + (r.ok ? ' ✓' : ' ✗')).join(', '));
    return res;
  }

  // painel
  const painel = document.createElement('div');
  painel.id = 'rtv';
  painel.style.cssText = 'position:fixed;right:12px;top:12px;z-index:99999;background:#111;color:#eee;font:12px/1.4 system-ui;padding:10px;border-radius:10px;box-shadow:0 6px 24px #0008;width:300px';
  painel.innerHTML = `<b>TVs 4K</b> <span style="opacity:.6">(2160×3840, ${FPS} fps)</span>
    <div style="display:flex;gap:6px;margin:8px 0"><select id="rtv-sel" style="flex:1">${PRESETS.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
    <button id="rtv-ver">Prévia</button><button id="rtv-ir">Render</button></div>
    <button id="rtv-todos" style="width:100%">Renderizar todos</button>
    <div id="rtv-estado" style="margin:8px 0;min-height:32px"></div>
    <canvas id="rtv-previa" width="270" height="480" style="width:270px;display:block;margin:auto;background:#000"></canvas>`;
  document.body.appendChild(painel);
  const sel = () => document.getElementById('rtv-sel').value;
  document.getElementById('rtv-ver').onclick = () => previa(sel(), 3);
  document.getElementById('rtv-ir').onclick = () => renderizar(sel());
  document.getElementById('rtv-todos').onclick = renderizarTodos;

  window.renderTv = { PRESETS, previa, renderizar, renderizarTodos, montar, quadro, novoLayout, W, H, FPS };
})();
