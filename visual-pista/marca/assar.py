"""Assa as malhas 3D reais da marca (OBJ da agência, pasta Desktop\\CLUBE) para o visual Marca.

dados/malhas.bin: vértices (8 int16: x y z oclusão nx ny nz 0) seguidos dos índices (uint32).
dados/malhas.json: onde começa cada malha.
dados/voxels.bin: blocos das figuras no estado Instância (3 int8 de posição + 3 int8 de normal, módulo = 1/LINHAS da altura).

Figura: pé em y = 0, altura 1, centrada em x e z. Letra: frente em z = 0, a palavra inteira tem largura 1.
A malha vem de IA e é suja: normais soldadas e alisadas, porque espelho mostra qualquer calombo. A oclusão sai de um volume em blocos.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py
"""
import json
import pathlib

import numpy as np

AQUI = pathlib.Path(__file__).resolve().parent
CLUBE = pathlib.Path.home() / 'Desktop' / 'CLUBE'
PASTA_FIG = next(CLUBE.glob('04.*')) / 'Figuras_ElementosGráficos_Estáticas' / '04ArquivosAbertos_figuras' / 'OBJ'
LOGO = CLUBE / '00. Logo' / 'OBJ' / 'CLUBE.obj'
LINHAS = 72
rng = np.random.default_rng(11)


def ler_obj(caminho):
    """Devolve vértices, faces trianguladas e o grupo de cada face."""
    vs, fs, gs = [], [], []
    grupo = -1
    with open(caminho, encoding='utf8', errors='ignore') as f:
        for lin in f:
            if lin.startswith('v '):
                p = lin.split()
                vs.append((float(p[1]), float(p[2]), float(p[3])))
            elif lin.startswith('f '):
                idx = [int(t.split('/')[0]) for t in lin.split()[1:]]
                idx = [i - 1 if i > 0 else len(vs) + i for i in idx]
                for k in range(1, len(idx) - 1):
                    fs.append((idx[0], idx[k], idx[k + 1]))
                    gs.append(grupo)
            elif lin.startswith('g '):
                grupo += 1
    return np.array(vs, np.float32), np.array(fs, np.int64), np.array(gs, np.int32)


def soldar(v, f):
    chave = np.round(v / 2e-5).astype(np.int64)
    _, primeiro, inv = np.unique(chave, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    f2 = inv[f]
    ok = (f2[:, 0] != f2[:, 1]) & (f2[:, 1] != f2[:, 2]) & (f2[:, 0] != f2[:, 2])
    return v[primeiro], f2[ok]


def normais_lisas(v, f, passadas):
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    n = np.zeros_like(v, dtype=np.float64)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    arestas = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    grau = np.bincount(arestas[:, 0], minlength=len(v)).astype(np.float64)[:, None]
    for _ in range(passadas):
        s = np.zeros_like(n)
        np.add.at(s, arestas[:, 0], n[arestas[:, 1]])
        n = n * 0.4 + 0.6 * s / np.maximum(grau, 1)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n.astype(np.float32)


def alisar_posicoes(v, f, passadas, lam=0.5):
    """Tira o calombo fino sem encolher: Taubin."""
    arestas = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    grau = np.maximum(np.bincount(arestas[:, 0], minlength=len(v)), 1)[:, None]
    p = v.astype(np.float64)
    for _ in range(passadas):
        for peso in (lam, -lam * 1.03):
            s = np.zeros_like(p)
            np.add.at(s, arestas[:, 0], p[arestas[:, 1]])
            p = p + peso * (s / grau - p)
    return p.astype(np.float32)


def amostrar(v, f, por_area):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) * 0.5
    n = np.minimum(np.ceil(area * por_area).astype(np.int64), 400) + 1
    ids = np.repeat(np.arange(len(f)), n)
    u, w = rng.random((2, len(ids)))
    tr = u + w > 1
    u[tr], w[tr] = 1 - u[tr], 1 - w[tr]
    return (a[ids] + (b[ids] - a[ids]) * u[:, None] + (c[ids] - a[ids]) * w[:, None]).astype(np.float32), ids


def oclusao(v, n, f):
    """Quanto de corpo há perto de cada vértice, no rumo da normal: escurece axila, vão de pernas e entre os corpos."""
    R = 96
    pts, _ = amostrar(v, f, 900000)
    lo = v.min(axis=0) - 0.12
    esc = R / (v.max(axis=0) - lo + 0.12).max()
    vol = np.zeros((R, R, R), np.float32)
    idx = np.clip(((pts - lo) * esc).astype(np.int64), 0, R - 1)
    vol[idx[:, 0], idx[:, 1], idx[:, 2]] = 1
    freq = np.fft.fftfreq(R)
    fx, fy, fz = np.meshgrid(freq, freq, np.fft.rfftfreq(R), indexing='ij')
    borrado = np.fft.irfftn(np.fft.rfftn(vol) * np.exp(-2 * np.pi ** 2 * 2.6 ** 2 * (fx ** 2 + fy ** 2 + fz ** 2)), s=(R, R, R))
    q = np.clip((((v + n * 0.045) - lo) * esc).astype(np.int64), 0, R - 1)
    d = borrado[q[:, 0], q[:, 1], q[:, 2]]
    d = d / max(np.percentile(d, 98), 1e-6)
    return np.clip(1.08 - d * 0.95, 0.12, 1).astype(np.float32)


def voxels(v, f, n):
    """Estado Instância: a casca da figura em blocos, na grade de LINHAS módulos por altura."""
    pts, ids = amostrar(v, f, 60000)
    cel = np.floor(pts * LINHAS).astype(np.int64)
    nf = n[f[ids]].mean(axis=1)
    _, prim, inv = np.unique(cel, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    soma = np.zeros((len(prim), 3), np.float64)
    np.add.at(soma, inv, nf)
    soma /= np.maximum(np.linalg.norm(soma, axis=1, keepdims=True), 1e-9)
    return np.hstack([cel[prim], np.round(soma * 127)]).astype(np.int8)


def normais_quebradas(v, f, angulo=32):
    """Letra: quina fica quina, curva fica curva. Cada canto da face calcula a própria normal e o vértice só é repartido onde precisa."""
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    fu = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    em_volta = [[] for _ in range(len(v))]
    for i, t in enumerate(f):
        for k in t:
            em_volta[k].append(i)
    lim = np.cos(np.radians(angulo))
    out_v, out_n, out_f, cache = [], [], [], {}
    for i, t in enumerate(f):
        novo = []
        for k in t:
            viz = [j for j in em_volta[k] if fu[i].dot(fu[j]) > lim]
            s = fn[viz].sum(axis=0)
            s /= max(np.linalg.norm(s), 1e-12)
            ch = (int(k), *np.round(s * 200).astype(int))
            if ch not in cache:
                cache[ch] = len(out_v)
                out_v.append(v[k])
                out_n.append(s)
            novo.append(cache[ch])
        out_f.append(novo)
    return np.array(out_v, np.float32), np.array(out_n, np.float32), np.array(out_f, np.int64)


def main():
    (AQUI / 'dados').mkdir(exist_ok=True)
    verts, indices, meta, base_v, base_i = [], [], {'figuras': [], 'letras': [], 'voxels': [], 'linhas': LINHAS}, 0, 0
    bloco_vox, base_x = [], 0

    def guardar(v, n, ao, f, escala):
        nonlocal base_v, base_i
        q = np.zeros((len(v), 8), np.int16)
        q[:, :3] = np.clip(v / escala, -1, 1) * 32767
        q[:, 3] = ao * 32767
        q[:, 4:7] = np.clip(n, -1, 1) * 32767
        verts.append(q)
        indices.append(f.astype(np.uint32).ravel())
        e = dict(baseV=base_v, primeiro=base_i, n=int(f.size), escala=escala)
        base_v += len(v)
        base_i += f.size
        return e

    for letra in 'abcdefghij':
        v, f, _ = ler_obj(PASTA_FIG / f'{letra}-.obj')
        v, f = soldar(v, f)
        lo, hi = v.min(axis=0), v.max(axis=0)
        v = (v - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2], np.float32)) / (hi[1] - lo[1])
        v = alisar_posicoes(v, f, 40)
        n = normais_lisas(v, f, 10)
        ao = oclusao(v, n, f)
        e = guardar(v, n, ao, f, 1.0)
        e.update(nome=letra, largura=float(np.ptp(v[:, 0])), fundo=float(np.ptp(v[:, 2])))
        meta['figuras'].append(e)
        vx = voxels(v, f, n)
        meta['voxels'].append(dict(nome=letra, inicio=base_x, n=len(vx)))
        bloco_vox.append(vx)
        base_x += len(vx)
        print(letra, len(v), 'vértices', f.shape[0], 'tri', len(vx), 'blocos', 'oclusão', round(float(ao.mean()), 2), flush=True)

    v, f, g = ler_obj(LOGO)
    lo, hi = v.min(axis=0), v.max(axis=0)
    larg = hi[0] - lo[0]
    print('logo', v.shape[0], 'caixa', lo, hi, 'grupos', np.unique(g))
    centros = []
    for grupo in np.unique(g):
        ff = f[g == grupo]
        usados, inv = np.unique(ff, return_inverse=True)
        vv = v[usados]
        centros.append((grupo, vv[:, 0].mean()))
    for grupo, _ in sorted(centros, key=lambda c: c[1]):
        ff = f[g == grupo]
        usados, inv = np.unique(ff, return_inverse=True)
        vv = v[usados].copy()
        ff2 = inv.reshape(-1, 3)
        vs, ns, fs = normais_quebradas(vv, ff2)
        l0, l1 = vs.min(axis=0), vs.max(axis=0)
        c = (l0 + l1) / 2
        vs = (vs - c) / larg
        e = guardar(vs, ns, np.ones(len(vs), np.float32), fs, 0.5)
        e.update(meia=[float(x) for x in (l1 - l0) / larg / 2], x=float((c[0] - (lo[0] + hi[0]) / 2) / larg), y=float((c[1] - (lo[1] + hi[1]) / 2) / larg))
        meta['letras'].append(e)
        print('letra', e['meia'], 'em x', round(e['x'], 3), fs.shape[0], 'tri', flush=True)

    v_bytes = np.vstack(verts).astype('<i2').tobytes()
    i_bytes = np.concatenate(indices).astype('<u4').tobytes()
    meta['bytesVertices'] = len(v_bytes)
    (AQUI / 'dados' / 'malhas.bin').write_bytes(v_bytes + i_bytes)
    np.vstack(bloco_vox).tofile(AQUI / 'dados' / 'voxels.bin')
    (AQUI / 'dados' / 'malhas.json').write_text(json.dumps(meta), encoding='utf-8')
    print('total', round((len(v_bytes) + len(i_bytes)) / 1e6, 1), 'MB,', base_x, 'blocos')


if __name__ == '__main__':
    main()
