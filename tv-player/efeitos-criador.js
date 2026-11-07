// Velas, fogueira, física e composição em camadas das barras do 5º. O motor (balcao.js) relê este arquivo sozinho
// quando ele muda, como o efeitos-audio.js. Só as barras usam estas animações: 8 colunas de 86 pixels.
//
// As simulações guardam estado entre quadros. O motor chama a animação uma vez por pixel, então cada simulação
// avança uma vez por quadro: sim() só dá o passo quando o relógio do som mudou. Sem som, velas e fogueira seguem
// acesas e as outras recebem um empurrão de vez em quando, para nunca parecer apagado.
const COLS = 8, LIN = 86, TOTAL = COLS * LIN;

const PALETAS = {
  fogo: { nome: 'Fogo', c: ['#000000', '#4a0800', '#ff2a00', '#ff7a1a', '#ffc465', '#fff0cc'] },
  vela: { nome: 'Vela', c: ['#000000', '#5a1500', '#ff5a10', '#ffa63c', '#ffdc9a', '#fff4dc'] },
  ambar: { nome: 'Âmbar', c: ['#000000', '#3a1a00', '#b85a00', '#ffaf32', '#ffd6a1', '#fff0d8'] },
  brasa: { nome: 'Brasa', c: ['#000000', '#2a0200', '#8a1000', '#ff3308', '#ff7452', '#ffc465'] },
  gas: { nome: 'Gás azul', c: ['#000000', '#00103a', '#0040d0', '#00a0e6', '#7fe0ff', '#ffffff'] },
  gelo: { nome: 'Gelo', c: ['#000000', '#00202a', '#006f8f', '#00bae3', '#b0f0ff', '#ffffff'] },
  esmeralda: { nome: 'Esmeralda', c: ['#000000', '#002a10', '#007000', '#00c44a', '#7fffb0', '#f0fff0'] },
  ametista: { nome: 'Ametista', c: ['#000000', '#1a0038', '#5a00b0', '#b040ff', '#e0a0ff', '#fff0ff'] },
  rosa: { nome: 'Rosa', c: ['#000000', '#3a0018', '#b0004a', '#ff3388', '#ff9ac8', '#fff0f6'] },
  marca: { nome: 'Marca', c: ['#000000', '#006faf', '#00bae3', '#00c44a', '#ff3308', '#ffc465'] },
  prata: { nome: 'Prata', c: ['#000000', '#303030', '#6f6f6f', '#9d9d9d', '#e1e2e3', '#ffffff'] },
};
const MISTURAS = {
  cima: 'Por cima', somar: 'Somar', tela: 'Tela', multiplicar: 'Multiplicar', maximo: 'Mais claro',
  diferenca: 'Diferença', mascara: 'Máscara', recorte: 'Recorte',
};
const FUNDOS = {
  preto: 'Preto', cor: 'Cor', vertical: 'Degradê subindo', lateral: 'Degradê de lado', paleta: 'Paleta andando',
  respira: 'Respira com o som', brasas: 'Brasas', estrelas: 'Estrelas',
};

const fabrica = ({ au, cor, hex, mix, escala, frac, hash01, onda01, efeitos: TODOS }) => {
  const barra = x => Math.floor(x * COLS);
  const doCentro = b => (b < 4 ? 3 - b : b - 4);
  const limita = v => Math.max(0, Math.min(1, v));
  const linha = h => Math.max(0, Math.min(LIN - 1, Math.floor(h * LIN)));
  const ponto = (c, y) => c * LIN + y;
  const PRETO = [0, 0, 0];

  // ---------- cores ----------
  const cacheHex = new Map();
  const corHex = h => { let v = cacheHex.get(h); if (!v) { v = hex(/^#[0-9a-f]{6}$/i.test(h) ? h : '#000000'); cacheHex.set(h, v); } return v; };
  const cachePaletas = new Map(), cacheProprias = new WeakMap();
  function paletaDe(id, padrao) {
    if (Array.isArray(id)) { // paleta própria: as cores vêm do escuro para o claro
      let v = cacheProprias.get(id);
      if (!v) { v = [PRETO, ...id.map(corHex)]; cacheProprias.set(id, v); }
      return v;
    }
    const chave = PALETAS[id] ? id : padrao;
    let v = cachePaletas.get(chave);
    if (!v) { v = PALETAS[chave].c.map(corHex); cachePaletas.set(chave, v); }
    return v;
  }
  function grad(pal, t) {
    const p = limita(t) * (pal.length - 1), n = Math.min(pal.length - 2, Math.floor(p));
    return mix(pal[n], pal[n + 1], p - n);
  }

  // ---------- simulações ----------
  const estados = new Map();
  function sim(nome, p, AU, criar, passo) {
    const chave = p._chave || nome;
    let S = estados.get(chave);
    if (!S || S._nome !== nome) { S = criar(); S._nome = nome; S._t = AU.t; estados.set(chave, S); }
    if (AU.t !== S._t) {
      const dt = Math.min(0.1, Math.max(0, AU.t - S._t));
      S._t = AU.t;
      if (dt > 0) passo(S, AU, dt, p);
    }
    return S;
  }
  // Golpe novo na faixa q. Sem som, um empurrão fraco a cada 2,2 s mantém a simulação viva.
  function golpe(S, AU, q) {
    const k = 'n' + q, atual = AU.n[q], novo = S[k] !== undefined && atual !== S[k];
    S[k] = atual;
    if (novo) return AU.ocioso ? 0.4 : 0.55 + 0.45 * AU.f[q];
    if (AU.ocioso && AU.t - (S['auto' + q] || 0) > 2.2) { S['auto' + q] = AU.t; return 0.4; }
    return 0;
  }
  function carimbar(buf, c, yf, v, raio) {
    const y0 = Math.round(yf);
    for (let d = -raio; d <= raio; d++) {
      const y = y0 + d;
      if (y < 0 || y >= LIN || c < 0 || c >= COLS) continue;
      const o = ponto(c, y), w = v * (1 - Math.abs(d) / (raio + 1));
      if (w > buf[o]) buf[o] = w;
    }
  }
  const apagar = (buf, dt, vel) => { const k = Math.exp(-dt * vel); for (let o = 0; o < TOTAL; o++) buf[o] *= k; };

  // ---------- velas ----------
  const criarVelas = () => {
    const S = { alt: new Float32Array(COLS), vel: new Float32Array(COLS), fa: new Float32Array(COLS) };
    for (let b = 0; b < COLS; b++) { S.alt[b] = 0.3; S.fa[b] = hash01(b + 3) * 6.28; }
    return S;
  };
  function passoVelas(S, AU, dt, p) {
    const base = p.alt != null ? p.alt : 0.62, forca = p.audio != null ? p.audio : 0.34;
    const rajada = golpe(S, AU, 0) * (p.sopro != null ? p.sopro : 0.7);
    for (let b = 0; b < COLS; b++) {
      const f = S.fa[b], t = AU.t;
      const tremor = 0.5 * Math.sin(t * 2.1 + f) + 0.3 * Math.sin(t * 5.3 + f * 2) + 0.2 * Math.sin(t * 11 + f * 3);
      const alvo = base + tremor * 0.07 + AU.b[b] * forca;
      if (Math.random() < dt * 1.3) S.vel[b] += (Math.random() - 0.5) * 1.5; // tremida solta da chama
      if (rajada) S.vel[b] += rajada * (0.5 + Math.random() * 0.7);
      S.vel[b] += (38 * (alvo - S.alt[b]) - 7 * S.vel[b]) * dt; // a altura segue o alvo como uma mola
      S.alt[b] = Math.max(0.08, Math.min(1.02, S.alt[b] + S.vel[b] * dt));
    }
  }

  // ---------- fogueira ----------
  const criarFogo = () => ({ calor: new Float32Array(TOTAL), faisca: new Float32Array(TOTAL), part: [], acc: 0 });
  function subirFaiscas(S, AU, dt, chance) {
    const nova = golpe(S, AU, 3);
    if (nova && S.part.length < 40) {
      const n = 1 + Math.floor(nova * 3);
      for (let k = 0; k < n; k++) S.part.push({ c: Math.floor(Math.random() * COLS), y: 0.18 + Math.random() * 0.35, v: 0.28 + Math.random() * 0.45, vida: 1.1 + Math.random() });
    }
    if (Math.random() < chance * dt && S.part.length < 40) S.part.push({ c: Math.floor(Math.random() * COLS), y: Math.random() * 0.25, v: 0.2 + Math.random() * 0.35, vida: 1 + Math.random() });
    apagar(S.faisca, dt, 16);
    S.part = S.part.filter(e => (e.vida -= dt) > 0 && e.y < 1.02);
    for (const e of S.part) {
      e.y += e.v * dt;
      if (Math.random() < dt * 0.8) e.c = Math.max(0, Math.min(COLS - 1, e.c + (Math.random() < 0.5 ? -1 : 1))); // o vento leva para a barra do lado
      carimbar(S.faisca, e.c, e.y * LIN, limita(e.vida), 1);
    }
  }
  function passoFogo(S, AU, dt, p) {
    const vol = (AU.f[0] + AU.f[1] + AU.f[2]) / 3;
    const frio = (p.frio != null ? p.frio : 0.55) * (1 - 0.45 * vol);
    const q = S.calor;
    const pancada = golpe(S, AU, 0);
    if (pancada) for (let c = 0; c < COLS; c++) for (let y = 0; y < 9; y++) q[ponto(c, y)] = Math.min(1, q[ponto(c, y)] + 0.55 * pancada);
    S.acc = Math.min(6, S.acc + dt * 42);
    while (S.acc >= 1) {
      S.acc -= 1;
      for (let c = 0; c < COLS; c++) {
        const lado = 1 + 0.9 * doCentro(c) / 3; // as pontas esfriam mais: a chama é mais alta no meio
        const maxFrio = 0.033 * (frio / 0.55) * lado;
        const o = ponto(c, 0);
        for (let y = 0; y < LIN; y++) q[o + y] = Math.max(0, q[o + y] - Math.random() * maxFrio);
        for (let y = LIN - 1; y >= 2; y--) q[o + y] = (q[o + y - 1] + q[o + y - 2] * 2) / 3;
        if (Math.random() < 0.45 + 0.5 * AU.b[c]) { const y = Math.floor(Math.random() * 7); q[o + y] = Math.min(1, q[o + y] + 0.55 + Math.random() * 0.45); }
      }
      // O calor passa um pouco para a barra do lado.
      for (let y = 0; y < LIN; y++) {
        let antes = q[ponto(0, y)];
        for (let c = 1; c < COLS - 1; c++) {
          const aqui = q[ponto(c, y)];
          q[ponto(c, y)] = aqui * 0.94 + (antes + q[ponto(c + 1, y)]) * 0.03;
          antes = aqui;
        }
      }
    }
    subirFaiscas(S, AU, dt, 0.8 + vol * 3);
  }

  // ---------- física ----------
  const criarBolinhas = () => ({ y: new Float32Array(COLS), v: new Float32Array(COLS), buf: new Float32Array(TOTAL) });
  function passoBolinhas(S, AU, dt) {
    apagar(S.buf, dt, 9);
    const g = golpe(S, AU, 0);
    for (let b = 0; b < COLS; b++) {
      if (g && (S.y[b] < 0.3 || Math.random() < 0.3)) S.v[b] = Math.max(S.v[b], (0.8 + 1.3 * AU.b[b] + Math.random() * 0.5) * (0.5 + g * 0.6));
      S.v[b] -= 2.6 * dt;
      S.y[b] += S.v[b] * dt;
      if (S.y[b] < 0) { S.y[b] = 0; S.v[b] = Math.abs(S.v[b]) < 0.14 ? 0 : -S.v[b] * 0.72; }
      if (S.y[b] > 1) { S.y[b] = 1; S.v[b] = -S.v[b] * 0.5; }
      carimbar(S.buf, b, S.y[b] * (LIN - 1), 1, 2);
    }
  }
  const criarMolas = () => ({ x: new Float32Array(COLS), v: new Float32Array(COLS) });
  function passoMolas(S, AU, dt) {
    for (let b = 0; b < COLS; b++) {
      const alvo = AU.ocioso ? 0.08 + 0.06 * onda01(AU.t / 5 + b / COLS) : AU.b[b];
      S.v[b] += (120 * (alvo - S.x[b]) - 7 * S.v[b]) * dt; // pouco amortecida: passa do alvo e volta
      S.x[b] = Math.max(0, Math.min(1.05, S.x[b] + S.v[b] * dt));
    }
  }
  const criarCorda = () => ({ y: new Float32Array(COLS), v: new Float32Array(COLS) });
  function ondaNaCorda(S, dt, c2, retorno, atrito, pontasPresas) {
    const passos = 4, h = dt / passos;
    for (let k = 0; k < passos; k++) {
      for (let b = 0; b < COLS; b++) {
        const e = b > 0 ? S.y[b - 1] : (pontasPresas ? 0 : S.y[b]);
        const d = b < COLS - 1 ? S.y[b + 1] : (pontasPresas ? 0 : S.y[b]);
        S.v[b] += (c2 * (e + d - 2 * S.y[b]) - retorno * S.y[b] - atrito * S.v[b]) * h;
      }
      for (let b = 0; b < COLS; b++) S.y[b] = Math.max(-1, Math.min(1, S.y[b] + S.v[b] * h));
    }
  }
  function passoCorda(S, AU, dt) {
    const g = golpe(S, AU, 0);
    if (g) { const n = Math.floor(Math.random() * COLS); S.v[n] += (Math.random() < 0.5 ? -1 : 1) * (2.2 + 3.5 * g); }
    ondaNaCorda(S, dt, 90, 3, 1.4, true);
  }
  function passoAgua(S, AU, dt) {
    const g = golpe(S, AU, 0);
    if (g) { const n = Math.floor(Math.random() * COLS); S.v[n] -= 1 + 2.2 * g; }
    const m = golpe(S, AU, 1);
    if (m) { const n = Math.floor(Math.random() * COLS); S.v[n] += 0.5 + 1 * m; }
    ondaNaCorda(S, dt, 45, 2, 0.9, false);
  }
  const criarPendulo = () => ({ a: 0.9, w: 0, buf: new Float32Array(TOTAL) });
  function passoPendulo(S, AU, dt) {
    apagar(S.buf, dt, 5);
    const periodo = AU.bpm > 40 && AU.conf >= 0.5 ? 240 / AU.bpm : 2; // uma ida e volta a cada 4 batidas
    const w0 = 2 * Math.PI / periodo;
    const g = golpe(S, AU, 0);
    if (g) S.w += (S.w >= 0 ? 1 : -1) * 0.9 * g;
    S.w += (-w0 * w0 * Math.sin(S.a) - 0.25 * S.w) * dt;
    S.a = Math.max(-1.25, Math.min(1.25, S.a + S.w * dt));
    if (Math.abs(S.a) >= 1.25) S.w *= -0.6;
    const c = Math.round(3.5 + 3.5 * S.a / 1.25);
    const y = 0.1 + 0.8 * (1 - Math.cos(S.a)) / (1 - Math.cos(1.25));
    carimbar(S.buf, c, y * (LIN - 1), 1, 4);
  }
  const criarFogos = () => ({ fog: [], part: [], buf: new Float32Array(TOTAL), espera: 0 });
  function passoFogos(S, AU, dt) {
    apagar(S.buf, dt, 13);
    S.espera -= dt;
    const g = golpe(S, AU, 0);
    if (g && S.espera <= 0 && S.fog.length < 3) {
      S.espera = 0.26;
      S.fog.push({ c: Math.floor(Math.random() * COLS), y: 0, v: 1.25 + Math.random() * 0.55 + g * 0.4 });
    }
    S.fog = S.fog.filter(f => {
      f.v -= 1.6 * dt; f.y += f.v * dt;
      carimbar(S.buf, f.c, f.y * (LIN - 1), 0.75, 2);
      if (f.v > 0.3 && f.y < 0.95) return true;
      const n = 12 + Math.floor(Math.random() * 8);
      for (let k = 0; k < n && S.part.length < 140; k++) {
        const ang = Math.random() * 6.283, vel = 0.4 + Math.random() * 1;
        S.part.push({ x: f.c, y: f.y, vx: Math.cos(ang) * vel * 3, vy: Math.sin(ang) * vel * 0.5, vida: 0.7 + Math.random() * 0.7 });
      }
      return false;
    });
    S.part = S.part.filter(e => (e.vida -= dt) > 0 && e.y > -0.02);
    for (const e of S.part) {
      e.vy -= 0.8 * dt; e.vx *= 1 - 1.2 * dt; e.x += e.vx * dt; e.y += e.vy * dt;
      carimbar(S.buf, Math.round(e.x), e.y * (LIN - 1), limita(e.vida * 1.1), 1);
    }
  }
  const criarBolhas = () => ({ lista: [], buf: new Float32Array(TOTAL) });
  function passoBolhas(S, AU, dt) {
    apagar(S.buf, dt, 22);
    const g = golpe(S, AU, 2);
    if (g && S.lista.length < 26) for (let k = 0; k < 1 + Math.floor(g * 2); k++) S.lista.push({ c: Math.floor(Math.random() * COLS), y: 0, v: 0.05, r: 2 + Math.floor(Math.random() * 3) });
    S.lista = S.lista.filter(b => {
      b.v += (0.75 * (b.r / 3) - 2.2 * b.v) * dt; // o empuxo sobe e o arrasto segura: bolha maior anda mais rápido
      b.y += b.v * (0.7 + AU.lento) * dt;
      carimbar(S.buf, b.c, b.y * (LIN - 1), 1, b.r);
      return b.y < 1;
    });
  }
  const criarAreia = () => ({ pilha: new Float32Array(COLS), graos: [], buf: new Float32Array(TOTAL) });
  function passoAreia(S, AU, dt) {
    apagar(S.buf, dt, 18);
    const g = golpe(S, AU, 3);
    if (g && S.graos.length < 50) for (let k = 0; k < 2; k++) S.graos.push({ c: Math.floor(Math.random() * COLS), y: 1, v: -0.1 });
    const tranco = golpe(S, AU, 0);
    S.graos = S.graos.filter(e => {
      e.v -= 2.4 * dt; e.y += e.v * dt;
      carimbar(S.buf, e.c, e.y * (LIN - 1), 1, 1);
      if (e.y > S.pilha[e.c]) return true;
      S.pilha[e.c] = Math.min(1, S.pilha[e.c] + 0.016);
      return false;
    });
    // A areia escorre para o lado quando o morro fica íngreme; o bumbo sacode e derruba um pouco.
    for (let b = 0; b < COLS - 1; b++) {
      const d = S.pilha[b] - S.pilha[b + 1];
      if (Math.abs(d) > 0.05) { const m = d * Math.min(1, dt * 3); S.pilha[b] -= m; S.pilha[b + 1] += m; }
    }
    for (let b = 0; b < COLS; b++) {
      S.pilha[b] *= tranco ? 1 - 0.03 * tranco : 1 - 0.02 * dt;
      if (S.pilha[b] > 0.7) S.pilha[b] -= dt * 0.1;
    }
  }

  // Cada animação simulada desenha a partir de uma função que devolve o quanto o pixel acende (0–1).
  const comPaleta = (nome, criar, passo, padrao, valor) => (p, x, r, fase, h, i) => {
    try {
      const AU = au(), S = sim(nome, p, AU, criar, passo);
      const v = valor(S, barra(x), h, AU, p, i);
      return v <= 0.002 ? PRETO : grad(paletaDe(p.paleta, padrao), v);
    } catch { return PRETO; }
  };

  const novos = {
    audioVelas: comPaleta('audioVelas', criarVelas, passoVelas, 'vela', (S, b, h, AU, p) => {
      const cera = p.cera || 0, topo = S.alt[b];
      if (h < cera) return 0.3 + 0.1 * (h / cera); // corpo da vela, aceso de leve pela chama
      const u = (h - cera) / Math.max(0.02, (cera + (1 - cera) * topo) - cera);
      if (u >= 1) return 0;
      const lingua = 0.88 + 0.12 * Math.sin(6.283 * (u * 2.5 - AU.t * 1.6) + S.fa[b]);
      return Math.pow(1 - u, 0.55) * lingua * Math.min(1, (1 - u) * 8);
    }),
    audioFogueira: (p, x, r, fase, h) => {
      try {
        const AU = au(), S = sim('audioFogueira', p, AU, criarFogo, passoFogo), o = ponto(barra(x), linha(h));
        const pal = paletaDe(p.paleta, 'fogo'), v = S.calor[o], f = S.faisca[o];
        if (f > 0.05 && f > v) return grad(pal, 0.55 + f * 0.45);
        return v <= 0.01 ? PRETO : grad(pal, v);
      } catch { return PRETO; }
    },
    audioBrasas: comPaleta('audioBrasas', criarFogo, (S, AU, dt) => subirFaiscas(S, AU, dt, 2 + AU.lento * 10), 'brasa', (S, b, h, AU) => {
      const o = ponto(b, linha(h));
      const base = h < 0.28 ? Math.pow(1 - h / 0.28, 2) * (0.3 + 0.4 * AU.lento) * (0.75 + 0.25 * onda01(AU.t * 0.4 + b * 0.31)) : 0;
      return Math.max(base, S.faisca[o]);
    }),
    fisBolinhas: comPaleta('fisBolinhas', criarBolinhas, passoBolinhas, 'prata', (S, b, h) => S.buf[ponto(b, linha(h))]),
    fisMolas: comPaleta('fisMolas', criarMolas, passoMolas, 'gelo', (S, b, h) => {
      const x = S.x[b];
      if (x < 0.01 || h > x) return 0;
      return 0.3 + 0.7 * Math.pow(h / x, 2.5);
    }),
    fisCorda: comPaleta('fisCorda', criarCorda, passoCorda, 'prata', (S, b, h) => {
      const d = h - (0.5 + S.y[b] * 0.46);
      return Math.exp(-d * d * 900);
    }),
    fisAgua: comPaleta('fisAgua', criarCorda, passoAgua, 'gas', (S, b, h, AU) => {
      const topo = 0.24 + 0.4 * AU.lento + S.y[b] * 0.2;
      if (h > topo) return 0;
      const crista = Math.exp(-(topo - h) * (topo - h) * 1400);
      return Math.max(0.28 + 0.34 * Math.pow(h / Math.max(0.02, topo), 2), crista);
    }),
    fisPendulo: comPaleta('fisPendulo', criarPendulo, passoPendulo, 'ambar', (S, b, h) => S.buf[ponto(b, linha(h))]),
    fisFogos: comPaleta('fisFogos', criarFogos, passoFogos, 'marca', (S, b, h) => S.buf[ponto(b, linha(h))]),
    fisBolhas: comPaleta('fisBolhas', criarBolhas, passoBolhas, 'gelo', (S, b, h) => S.buf[ponto(b, linha(h))]),
    fisAreia: comPaleta('fisAreia', criarAreia, passoAreia, 'ambar', (S, b, h) => {
      const topo = S.pilha[b];
      return Math.max(S.buf[ponto(b, linha(h))], h < topo ? 0.3 + 0.35 * (h / Math.max(0.02, topo)) : 0);
    }),
  };
  const COM_PALETA_PROPRIA = new Set(Object.keys(novos));

  // ---------- composição em camadas ----------
  function misturar(modo, b, a, op) {
    const r = [0, 0, 0];
    const al = Math.max(a[0], a[1], a[2]) / 255;
    for (let k = 0; k < 3; k++) {
      const v = a[k] * op, f = b[k];
      switch (modo) {
        case 'somar': r[k] = f + v; break;
        case 'tela': r[k] = 255 - (255 - f) * (255 - v) / 255; break;
        case 'multiplicar': r[k] = f * (1 - op + op * a[k] / 255); break;
        case 'maximo': r[k] = Math.max(f, v); break;
        case 'diferenca': r[k] = Math.abs(f - v); break;
        case 'mascara': r[k] = f * (1 - op + op * al); break; // só aparece o de baixo onde esta camada acende
        case 'recorte': r[k] = f * (1 - al * op); break;      // apaga o de baixo onde esta camada acende
        default: r[k] = f * (1 - al * op) + v;                // "por cima": o preto da camada é transparente
      }
      r[k] = Math.max(0, Math.min(255, r[k]));
    }
    return r;
  }

  // Duck: compressor na luz. Um golpe ou o nível da faixa escolhida abaixa o que estiver marcado, e a luz volta na soltura.
  const criarDuck = () => ({ env: 0 });
  function passoDuck(S, AU, dt, p) {
    const d = p.duck;
    if (!d || !d.ligado) { S.env = 0; S.mult = 1; return; }
    const q = d.fonte != null ? d.fonte : 0, qtd = limita(d.quantidade != null ? d.quantidade : 0.7);
    let alvo = 0;
    if (d.modo === 'nivel') {
      const nivel = q === 4 ? (AU.f[0] + AU.f[1] + AU.f[2] + AU.f[3]) / 4 : AU.f[q];
      const lim = limita(d.limiar != null ? d.limiar : 0.4);
      if (nivel > lim) alvo = qtd * (nivel - lim) / Math.max(0.05, 1 - lim);
    } else {
      const n = AU.n[q === 4 ? 0 : q];
      if (S.visto !== undefined && n !== S.visto && !AU.ocioso) alvo = qtd;
      S.visto = n;
    }
    const soltura = Math.max(0.02, d.soltura != null ? d.soltura : 0.25);
    S.env = alvo > S.env ? alvo : S.env * Math.exp(-dt / soltura);
    S.mult = d.inverso ? 1 - qtd + S.env : 1 - S.env;
  }

  function pintarFundo(f, AU, x, h, i) {
    if (!f || !f.tipo || f.tipo === 'preto') return PRETO;
    const k = f.k != null ? limita(f.k) : 0.3;
    if (k <= 0) return PRETO;
    const c1 = corHex(f.c1 || '#ff7a1a'), c2 = corHex(f.c2 || '#000000');
    switch (f.tipo) {
      case 'cor': return escala(c1, k);
      case 'vertical': return escala(mix(c1, c2, h), k);
      case 'lateral': return escala(mix(c1, c2, x), k);
      case 'paleta': { const t = frac(h * 0.5 + AU.t * 0.05); return escala(grad(paletaDe(f.paleta, 'marca'), 0.25 + 0.75 * (t < 0.5 ? t * 2 : 2 - t * 2)), k); }
      case 'respira': return escala(c1, k * (0.3 + 0.7 * AU.lento));
      case 'brasas': { const v = onda01(hash01(i) * 5 + AU.t * (0.15 + hash01(i * 2) * 0.35)); return escala(grad(paletaDe(f.paleta, 'brasa'), v * v), k); }
      case 'estrelas': {
        if (hash01(i * 1.7) < 0.88) return PRETO;
        return escala(grad(paletaDe(f.paleta, 'prata'), 0.3 + 0.7 * onda01(hash01(i) * 7 + AU.t * (0.1 + hash01(i * 3) * 0.3))), k);
      }
      default: return PRETO;
    }
  }

  const memoCamadas = new WeakMap();
  function paramsDa(cam, idx, rascunho) {
    let m = memoCamadas.get(cam);
    if (!m) {
      const paleta = cam.paleta || (cam.p && cam.p.paleta);
      m = { ...(cam.p || {}), _chave: (rascunho ? 'r' : 'a') + idx + cam.efeito, B: cam.batidas || 4 };
      if (paleta) m.paleta = paleta;
      memoCamadas.set(cam, m);
    }
    return m;
  }

  novos.composicao = (p, x, r, fase, h, i) => {
    try {
      const AU = au();
      const M = sim('duck', { _chave: 'duck:' + (p.rascunho ? 'r' : 'a'), duck: p.duck }, AU, criarDuck, (S, A, dt) => passoDuck(S, A, dt, p));
      const mult = M.mult != null ? M.mult : 1;
      const f = p.fundo || {};
      let c = pintarFundo(f, AU, x, h, i);
      if (f.duck !== false && mult !== 1) c = escala(c, mult);
      const camadas = p.camadas || [];
      for (let k = 0; k < camadas.length; k++) {
        const cam = camadas[k], fn = TODOS[cam.efeito];
        if (!fn || cam.efeito === 'composicao') continue;
        const dur = cam.batidas ? cam.batidas * 60 / (AU.bpm || 120) : (cam.duracao || 8);
        let a = fn(paramsDa(cam, k, p.rascunho), cam.espelhar ? 1 - x : x, r, frac(AU.t / dur), cam.virar ? 1 - h : h, i);
        if (cam.paleta && !COM_PALETA_PROPRIA.has(cam.efeito)) {
          const l = Math.max(a[0], a[1], a[2]) / 255;
          a = l > 0.004 ? grad(paletaDe(cam.paleta, 'prata'), l) : PRETO;
        }
        let op = cam.opacidade != null ? limita(cam.opacidade) : 1;
        if (cam.duck && mult !== 1) op *= mult;
        c = misturar(cam.mistura || 'cima', c, a, op);
      }
      return c;
    } catch { return PRETO; }
  };
  return novos;
};

fabrica.PALETAS = PALETAS;
fabrica.MISTURAS = MISTURAS;
fabrica.FUNDOS = FUNDOS;
module.exports = fabrica;
