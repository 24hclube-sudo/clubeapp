"""Assa os personagens da marca para a Cinética: o corpo vira um sólido, e o sólido vira chapas cortadas e um mapa de relevo.

dados/placas.bin: vértices (8 int16: u, lado, v, 1, nx, ny, nz, 0) seguidos dos índices (uint32).
dados/placas.json: onde começa cada chapa de cada personagem, nos dois sentidos de corte.
dados/alturas.bin: relevo visto de frente, 1 byte por célula (0 = fora do corpo).

Chapa: u é o x do corpo, lado é +1 ou -1 (a espessura, que a cena escolhe) e v é o outro eixo do corte.
Corte y: fatias na altura do corpo, v = z do corpo. Corte z: fatias da frente para trás, v = y do corpo menos 0,5.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar_placas.py
"""
import json
import pathlib
import sys

import cv2
import numpy as np

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'marca'))
import assar as base  # noqa: E402

R = 192          # células por altura do corpo
MEIA_X = 0.68    # o corpo mais largo tem 1,3 de largura
FATIAS = 36      # o mesmo passo nos dois cortes
ELENCO = 'acdefgbij'   # sem O Curador (h): segura um disco de vinil


def preencher(parede, eixo):
    """Fecha cada fatia do volume num eixo: o que está dentro do contorno externo é corpo."""
    n = parede.shape[eixo]
    saida = np.zeros_like(parede)
    nucleo = np.ones((3, 3), np.uint8)
    for i in range(n):
        corte = [slice(None)] * 3
        corte[eixo] = i
        m = parede[tuple(corte)].astype(np.uint8)
        if not m.any():
            continue
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, nucleo)
        res = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cheio = np.zeros(m.shape, np.uint8)
        cv2.drawContours(cheio, res[-2], -1, 1, -1)
        saida[tuple(corte)] = cheio.astype(bool)
    return saida


def solido(v, f):
    """A malha da IA tem furos, então não dá para inundar por fora. Cada eixo vota: é corpo se 2 dos 3 eixos enxergam corpo.
    O vão entre braço e tronco fecha só no corte de frente, e por isso continua sendo vão."""
    pts, _ = base.amostrar(v, f, 420000)
    zlo, zhi = v[:, 2].min() - 0.02, v[:, 2].max() + 0.02
    nx, ny, nz = int(2 * MEIA_X * R), R + 4, int((zhi - zlo) * R) + 4
    parede = np.zeros((nx, ny, nz), bool)
    i = np.clip(((pts[:, 0] + MEIA_X) * R).astype(np.int64), 0, nx - 1)
    j = np.clip((pts[:, 1] * R).astype(np.int64) + 2, 0, ny - 1)
    k = np.clip(((pts[:, 2] - zlo) * R).astype(np.int64) + 2, 0, nz - 1)
    parede[i, j, k] = True
    votos = preencher(parede, 0).astype(np.uint8) + preencher(parede, 1).astype(np.uint8) + preencher(parede, 2).astype(np.uint8)
    vol = (votos >= 2).astype(np.uint8)
    # os furinhos que sobram da malha: fecha fatia a fatia, de frente
    miolo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    for kk in range(nz):
        vol[:, :, kk] = cv2.morphologyEx(vol[:, :, kk], cv2.MORPH_CLOSE, miolo)
    vol = vol.astype(np.float32)
    fx, fy, fz = np.meshgrid(np.fft.fftfreq(nx), np.fft.fftfreq(ny), np.fft.rfftfreq(nz), indexing='ij')
    borrado = np.fft.irfftn(np.fft.rfftn(vol, axes=(0, 1, 2)) * np.exp(-2 * np.pi ** 2 * 1.15 ** 2 * (fx ** 2 + fy ** 2 + fz ** 2)), s=(nx, ny, nz), axes=(0, 1, 2))
    return borrado.astype(np.float32), zlo

def area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def cruza(a, b, p, q):
    """Se o segmento ab cruza algum dos segmentos p[i]q[i]."""
    d = b - a
    e = q - p
    den = d[0] * e[:, 1] - d[1] * e[:, 0]
    with np.errstate(divide='ignore', invalid='ignore'):
        t = ((p[:, 0] - a[0]) * e[:, 1] - (p[:, 1] - a[1]) * e[:, 0]) / den
        u = ((p[:, 0] - a[0]) * d[1] - (p[:, 1] - a[1]) * d[0]) / den
    return np.any((t > 1e-6) & (t < 1 - 1e-6) & (u > 1e-6) & (u < 1 - 1e-6))


def costurar(anel, furos):
    """Liga cada furo ao contorno por um corte, para tudo virar um polígono só."""
    idx = list(range(len(anel)))
    pontos = [anel]
    base_i = len(anel)
    for furo in sorted(furos, key=lambda h: -h[:, 0].max()):
        pontos.append(furo)
        tudo = np.vstack(pontos)
        comeco = int(np.argmax(furo[:, 0]))
        m = tudo[base_i + comeco]
        cad = np.array(idx)
        ordem = cad[np.argsort(np.linalg.norm(tudo[cad] - m, axis=1))]
        p = tudo[cad]
        q = np.roll(p, -1, axis=0)
        h0 = furo
        h1 = np.roll(furo, -1, axis=0)
        escolhido = int(ordem[0])
        for c in ordem[:80]:
            if not cruza(m, tudo[c], p, q) and not cruza(m, tudo[c], h0, h1):
                escolhido = int(c)
                break
        pos = idx.index(escolhido)
        volta = [base_i + (comeco + t) % len(furo) for t in range(len(furo) + 1)]
        idx = idx[:pos + 1] + volta + idx[pos:]
        base_i += len(furo)
    return np.vstack(pontos), idx


def cortar_orelhas(p, idx):
    """Triangula o polígono já costurado, cortando uma orelha por vez."""
    tri = []
    ativo = list(idx)
    tentativas = 0
    while len(ativo) > 3 and tentativas < len(idx) * 8:
        n = len(ativo)
        a = np.array(ativo)
        ant, atu, pro = p[np.roll(a, 1)], p[a], p[np.roll(a, -1)]
        e1 = atu - ant
        e2 = pro - atu
        conv = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
        reflexos = a[conv <= 0]
        achou = False
        # orelha pequena primeiro: evita triângulo comprido, que treme no reflexo
        for k in np.argsort(np.abs(conv)):
            tentativas += 1
            if conv[k] <= 0:
                continue
            A, B, C = ant[k], atu[k], pro[k]
            fora_dos_3 = reflexos[(reflexos != a[k - 1]) & (reflexos != a[k]) & (reflexos != a[(k + 1) % n])]
            if len(fora_dos_3):
                P = p[fora_dos_3]
                # ponto repetido pelo corte de costura não conta
                P = P[(np.abs(P - A).sum(1) > 1e-7) & (np.abs(P - B).sum(1) > 1e-7) & (np.abs(P - C).sum(1) > 1e-7)]
                d1 = (B[0] - A[0]) * (P[:, 1] - A[1]) - (B[1] - A[1]) * (P[:, 0] - A[0])
                d2 = (C[0] - B[0]) * (P[:, 1] - B[1]) - (C[1] - B[1]) * (P[:, 0] - B[0])
                d3 = (A[0] - C[0]) * (P[:, 1] - C[1]) - (A[1] - C[1]) * (P[:, 0] - C[0])
                if np.any((d1 >= 0) & (d2 >= 0) & (d3 >= 0)):
                    continue
            tri.append((int(a[k - 1]), int(a[k]), int(a[(k + 1) % n])))
            del ativo[k]
            achou = True
            break
        if not achou:
            break
    # o que sobrar (polígono ruim) fecha em leque: é raro e fica escondido no meio da chapa
    for i in range(1, len(ativo) - 1):
        tri.append((ativo[0], ativo[i], ativo[i + 1]))
    return tri


def chapa(fatia, u0, v0, passo):
    """fatia: volume borrado cortado num plano, eixo 0 = u, eixo 1 = v. Devolve vértices, normais e índices da chapa."""
    AMPLIA = 3
    g = cv2.resize(fatia, None, fx=AMPLIA, fy=AMPLIA, interpolation=cv2.INTER_CUBIC)
    m = (g > 0.5).astype(np.uint8)
    res = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cont, hier = res[-2], res[-1]
    if hier is None:
        return None
    hier = hier[0]
    px = passo / AMPLIA
    converter = lambda c: np.array([(c[:, 0, 1] + 0.5) * px + u0, (c[:, 0, 0] + 0.5) * px + v0], np.float64).T   # cv2 lê x na coluna: coluna é v
    vs, ns, fs = [], [], []
    total = 0

    def lado(anel):
        nonlocal total
        n = len(anel)
        e = np.roll(anel, -1, axis=0) - anel
        nor = np.stack([e[:, 1], -e[:, 0]], 1)
        nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-12)
        nv = nor + np.roll(nor, 1, axis=0)
        nv /= np.maximum(np.linalg.norm(nv, axis=1, keepdims=True), 1e-12)
        for s in (1, -1):
            vs.append(np.stack([anel[:, 0], np.full(n, s), anel[:, 1]], 1))
            ns.append(np.stack([nv[:, 0], np.zeros(n), nv[:, 1]], 1))
        for i in range(n):
            j = (i + 1) % n
            a, b, c, d = total + i, total + j, total + n + j, total + n + i
            fs.extend([(a, b, c), (a, c, d)])
        total += 2 * n

    for i, c in enumerate(cont):
        if hier[i][3] != -1 or cv2.contourArea(c) < 12 * AMPLIA ** 2:
            continue
        reduz = lambda q: cv2.approxPolyDP(q, 1.05, True)
        anel = converter(reduz(c))
        if len(anel) < 3:
            continue
        if area(anel) < 0:
            anel = anel[::-1]
        furos = []
        filho = hier[i][2]
        while filho != -1:
            if cv2.contourArea(cont[filho]) >= 120 * AMPLIA ** 2:
                h = converter(reduz(cont[filho]))
                if len(h) >= 3:
                    furos.append(h[::-1] if area(h) > 0 else h)
            filho = hier[filho][0]
        lado(anel)
        for h in furos:
            lado(h)
        pts, idx = costurar(anel, furos)
        tri = cortar_orelhas(pts, idx)
        n = len(pts)
        for s in (1, -1):
            vs.append(np.stack([pts[:, 0], np.full(n, s), pts[:, 1]], 1))
            ns.append(np.tile([0, s, 0], (n, 1)))
            fs.extend([(total + a, total + b, total + c) for a, b, c in tri])
            total += n
    if not vs:
        return None
    return np.vstack(vs), np.vstack(ns), np.array(fs, np.int64)


def main():
    (AQUI / 'dados').mkdir(exist_ok=True)
    verts, indices, base_v, base_i = [], [], 0, 0
    alturas, inicio_a = [], 0
    meta = {'figuras': [], 'passo': 1 / FATIAS}

    def guardar(c):
        nonlocal base_v, base_i
        v, n, f = c
        q = np.zeros((len(v), 8), np.int16)
        q[:, :3] = np.clip(v, -1, 1) * 32767
        q[:, 3] = 32767
        q[:, 4:7] = np.clip(n, -1, 1) * 32767
        verts.append(q)
        indices.append(f.astype(np.uint32).ravel())
        e = dict(baseV=base_v, primeiro=base_i, n=int(f.size), escala=1.0)
        base_v += len(v)
        base_i += f.size
        return e

    for letra in ELENCO:
        v, f, _ = base.ler_obj(base.PASTA_FIG / f'{letra}-.obj')
        v, f = base.soldar(v, f)
        lo, hi = v.min(axis=0), v.max(axis=0)
        v = (v - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2], np.float32)) / (hi[1] - lo[1])
        v = base.alisar_posicoes(v, f, 15)
        vol, zlo = solido(v, f)
        nx, ny, nz = vol.shape
        passo = 1 / R
        fig = dict(nome=letra, largura=float(np.ptp(v[:, 0])), fundo=float(np.ptp(v[:, 2])), y=[], z=[])

        # corte y: fatias ao longo da altura
        for k in range(FATIAS):
            j = min(ny - 1, int(((k + 0.5) / FATIAS) * R) + 2)
            c = chapa(vol[:, j, :], -MEIA_X, zlo - 2 * passo, passo)
            fig['y'].append(None if c is None else guardar(c))

        # corte z: fatias da frente para trás, no mesmo passo
        zhi = zlo + (nz - 4) * passo
        nf = max(4, int(round((zhi - zlo) * FATIAS)))
        for k in range(nf):
            zc = zhi - (k + 0.5) / nf * (zhi - zlo)
            kk = min(nz - 1, max(0, int((zc - zlo) * R) + 2))
            c = chapa(vol[:, :, kk], -MEIA_X, -0.5 - 2 * passo, passo)
            if c is None:
                continue
            e = guardar(c)
            e['prof'] = float(zhi - zc)
            fig['z'].append(e)

        # relevo visto de frente: 0 fora do corpo, 1 no ponto mais perto
        dentro = vol > 0.5
        frente = nz - 1 - np.argmax(dentro[:, :, ::-1], axis=2)
        tem = dentro.any(axis=2)
        rel = np.where(tem, 0.2 + 0.8 * (frente - frente[tem].min()) / max(1, np.ptp(frente[tem])), 0)
        rel = cv2.GaussianBlur(rel.astype(np.float32), (0, 0), 1.0)
        a8 = np.round(np.clip(rel, 0, 1) * 255).astype(np.uint8)
        alturas.append(a8.tobytes())
        fig['alturas'] = dict(inicio=inicio_a, nx=nx, ny=ny)
        inicio_a += a8.size

        meta['figuras'].append(fig)
        print(letra, 'y', sum(1 for e in fig['y'] if e), 'z', len(fig['z']), 'chapas,', 'volume', round(float(dentro.mean()) * 100, 1), '%', flush=True)

    v_bytes = np.vstack(verts).astype('<i2').tobytes()
    i_bytes = np.concatenate(indices).astype('<u4').tobytes()
    meta['bytesVertices'] = len(v_bytes)
    meta['meiaX'] = MEIA_X
    (AQUI / 'dados' / 'placas.bin').write_bytes(v_bytes + i_bytes)
    (AQUI / 'dados' / 'alturas.bin').write_bytes(b''.join(alturas))
    (AQUI / 'dados' / 'placas.json').write_text(json.dumps(meta), encoding='utf-8')
    print('total', round((len(v_bytes) + len(i_bytes)) / 1e6, 1), 'MB,', round(inicio_a / 1e6, 1), 'MB de relevo')


if __name__ == '__main__':
    main()
