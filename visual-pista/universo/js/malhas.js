// Geometria do universo: cubo do voxel, cristal, pedras flutuantes (icosfera deformada por ruído).

// Mundo: x direita, y cima, z frente. Vista por fora, a face tem de sair anti-horária na tela.
export function malhaCubo() {
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const dados = [];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const n of faces) {
    const cima = Math.abs(n[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0];
    const olhar = [-n[0], -n[1], -n[2]];
    const dir = cruz(cima, olhar);
    const canto = (a, b) => [n[0] + dir[0] * a + cima[0] * b, n[1] + dir[1] * a + cima[1] * b, n[2] + dir[2] * a + cima[2] * b];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) dados.push(...canto(a, b), ...n);
  }
  return new Float32Array(dados);
}

// Cristal: prisma de 6 lados com ponta. y de 0 (base) a 1 (ponta), raio 1, faces planas.
export function malhaCristal() {
  const L = 6, Y = 0.68, dados = [];
  const v = (a, y, r) => [Math.cos(a) * r, y, Math.sin(a) * r];
  const tri = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const c0 = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
    const s = n[0] * c0[0] + n[2] * c0[2] < 0 ? -1 : 1, t = Math.hypot(...n) || 1;
    n = n.map(x => x * s / t);
    dados.push(...a, ...n, ...b, ...n, ...c, ...n);
  };
  for (let i = 0; i < L; i++) {
    const a0 = i / L * Math.PI * 2, a1 = (i + 1) / L * Math.PI * 2;
    const b0 = v(a0, 0, 0.8), b1 = v(a1, 0, 0.8), m0 = v(a0, Y, 1), m1 = v(a1, Y, 1), p = [0, 1, 0];
    tri(b0, b1, m1); tri(b0, m1, m0); tri(m0, m1, p);
  }
  return new Float32Array(dados);
}

// ---------- ruído com semente ----------
function criarRuido(semente) {
  const T = 256, tab = new Float32Array(T * 2), perm = new Int32Array(T * 2);
  let s = semente * 9301 + 49297;
  const acaso = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const p = Array.from({ length: T }, (_, i) => i);
  for (let i = T - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < T * 2; i++) { perm[i] = p[i % T]; tab[i] = acaso(); }
  const f = t => t * t * (3 - 2 * t);
  const ruido = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const g = (a, b, c) => tab[perm[perm[perm[(xi + a) & 255] + ((yi + b) & 255)] + ((zi + c) & 255)]];
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(g(0, 0, 0), g(1, 0, 0), u), l(g(0, 1, 0), g(1, 1, 0), u), v),
      l(l(g(0, 0, 1), g(1, 0, 1), u), l(g(0, 1, 1), g(1, 1, 1), u), v), w);
  };
  return (x, y, z, oit = 4) => {
    let a = 0.5, soma = 0, tot = 0;
    for (let i = 0; i < oit; i++) { soma += a * ruido(x, y, z); tot += a; x = x * 2.03 + 11; y = y * 2.03 + 7; z = z * 2.03 + 3; a *= 0.5; }
    return soma / tot;
  };
}

function icosfera(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  let vs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let fs = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const norm = v => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  vs = vs.map(norm);
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), novos = [];
    const meio = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (cache.has(k)) return cache.get(k);
      const m = norm([(vs[a][0] + vs[b][0]) / 2, (vs[a][1] + vs[b][1]) / 2, (vs[a][2] + vs[b][2]) / 2]);
      vs.push(m); cache.set(k, vs.length - 1);
      return vs.length - 1;
    };
    for (const [a, b, c] of fs) {
      const ab = meio(a, b), bc = meio(b, c), ca = meio(c, a);
      novos.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    fs = novos;
  }
  return { vs, fs };
}

// Pedra: entre laje (expoente alto = quinas de bloco) e bola amassada. Devolve vértices intercalados (pos + normal),
// índices e as listas para pendurar cristais.
export function malhaPedra(semente, { expoente = 3, forma = [1, 0.6, 1], sub = 5 } = {}) {
  const { vs, fs } = icosfera(sub);
  const fbm = criarRuido(semente);
  const pos = new Float32Array(vs.length * 3), nor = new Float32Array(vs.length * 3);
  vs.forEach((p, i) => {
    const e = expoente, s = Math.pow(Math.abs(p[0]) ** e + Math.abs(p[1]) ** e + Math.abs(p[2]) ** e, 1 / e);
    const d = 1 + 0.42 * (fbm(p[0] * 1.2 + 5, p[1] * 1.2, p[2] * 1.2, 3) - 0.5)
      + 0.2 * (fbm(p[0] * 4.3, p[1] * 4.3 + 9, p[2] * 4.3, 3) - 0.5)
      + 0.07 * (fbm(p[0] * 13, p[1] * 13, p[2] * 13 + 4, 3) - 0.5);
    pos[i * 3] = p[0] / s * forma[0] * d;
    pos[i * 3 + 1] = p[1] / s * forma[1] * d;
    pos[i * 3 + 2] = p[2] / s * forma[2] * d;
  });
  const ind = new Uint32Array(fs.length * 3);
  fs.forEach(([a, b, c], f) => {
    ind[f * 3] = a; ind[f * 3 + 1] = b; ind[f * 3 + 2] = c;
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
  });
  const dados = new Float32Array(vs.length * 6);
  for (let i = 0; i < vs.length; i++) {
    let nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (nx * pos[i * 3] + ny * pos[i * 3 + 1] + nz * pos[i * 3 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
    dados.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nx, ny, nz], i * 6);
  }
  return { dados, ind, pos, nor, n: vs.length };
}
