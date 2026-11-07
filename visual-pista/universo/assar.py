"""Transforma as figuras prateadas do CLUBE (PNG 2D) e o logo em voxels 3D, para o visual em WebGPU.

Figura: a silhueta vira volume resolvendo a equação de Poisson dentro dela e tirando a raiz (inflar como um balão):
numa faixa de largura constante o corte sai redondo, então braço e perna ficam roliços e o tronco, largo e fundo.
Só a casca é guardada.
A luminância do PNG (rachaduras, sombras do metal) entra como relevo e como tinta de cada voxel.

Saída em dados/: figuras.bin (8 int16 por voxel: x y z tinta nx ny nz g) e figuras.json (onde começa cada figura).
- x, y, z em unidades da altura da figura (y 0 = pé, 1 = cabeça), escala 1/32767 com limite de +-1.
- tinta: positiva = voxel está nos blocos da versão -2 da figura; negativa = só na versão inteira.
- g: 0 = centro do tronco, 1 = ponta mais distante pela silhueta (mão, cabelo, pé).
No logo: y centrado, x de -0,5 a 0,5, z = 0 na frente até 1 no fundo; g = posição na largura (faixa do espectro).

Uso: python assar.py [linhas=320]
"""
import json
import pathlib
import sys
from collections import deque

import cv2
import numpy as np

AQUI = pathlib.Path(__file__).resolve().parent
FIGURAS = AQUI.parent / 'assets' / 'figuras'
LOGO = AQUI.parent / 'assets' / 'clube.png'
SAIDA = AQUI / 'dados'
LINHAS = int(sys.argv[1]) if len(sys.argv) > 1 else 320
ESCALA = 32767.0
LOGO_LARG = 420
ATLAS = AQUI.parent / 'pista-quente' / 'atlas'
# nome, material (1 vermelho, 2 branco, 3 gelo, 4 fogo), lado em voxels, corpo inteiro sem traço, flutua no ar
PERSONAGENS = [
    ('bombinha', 2, 300, False, False),
    ('fogo', 4, 320, False, False),
    ('gelinho', 3, 300, False, False),
    ('nuvem', 1, 340, False, True),
    ('suado1', 2, 320, False, True),
    ('suado2', 2, 320, False, True),
    ('titulo', 1, 400, True, True),
]
rng = np.random.default_rng(7)


def ler(caminho, linhas):
    im = cv2.imread(str(caminho), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255.0
    h, w = im.shape[:2]
    larg = max(1, round(w * linhas / h))
    return cv2.resize(im, (larg, linhas), interpolation=cv2.INTER_AREA)


def resolver_poisson(mascara, c, u, passos, celula=1.0):
    """Jacobi de  laplaciano(u) = -c  dentro da máscara, u = 0 fora."""
    fonte = c * celula * celula
    for _ in range(passos):
        p = np.pad(u, 1)
        u = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + fonte) * 0.25 * mascara
    return u


def inflar(mascara):
    """Altura em voxels: raiz da solução de Poisson. Resolve do grosso para o fino para convergir rápido."""
    h, w = mascara.shape
    D = cv2.distanceTransform(mascara, cv2.DIST_L2, 5).astype(np.float32)
    u = np.zeros((h // 8 + 1, w // 8 + 1), np.float32)
    for fator, passos in ((8, 300), (4, 240), (2, 200), (1, 200)):
        tam = (max(1, w // fator), max(1, h // fator))
        m = (cv2.resize(mascara.astype(np.float32), tam, interpolation=cv2.INTER_AREA) > 0.5).astype(np.float32)
        u = cv2.resize(u, tam, interpolation=cv2.INTER_LINEAR) * m
        u = resolver_poisson(m, 2.6, u, passos, float(fator))
    Z = np.sqrt(np.maximum(u, 0))
    return np.maximum(Z, 1.0) * mascara, D


def distancia_geodesica(mascara, inicio):
    h, w = mascara.shape
    dist = np.full((h, w), -1, np.int32)
    fila = deque([inicio])
    dist[inicio] = 0
    while fila:
        y, x = fila.popleft()
        d = dist[y, x] + 1
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and mascara[ny, nx] and dist[ny, nx] < 0:
                dist[ny, nx] = d
                fila.append((ny, nx))
    return dist


def assar_figura(letra):
    im = ler(FIGURAS / f'{letra}-1.png', LINHAS)
    h, w = im.shape[:2]
    # pedaços soltos pequenos (os "pixels" caindo em volta) ficam: fazem parte da figura
    mascara = (im[:, :, 3] > 0.5).astype(np.uint8)
    lum = cv2.GaussianBlur(im[:, :, :3].mean(axis=2), (0, 0), 0.6) * mascara

    blocos = ler(FIGURAS / f'{letra}-2.png', LINHAS)
    if blocos.shape[:2] != (h, w):
        blocos = cv2.resize(blocos, (w, h), interpolation=cv2.INTER_AREA)
    bloco = blocos[:, :, 3] > 0.5

    Z, D = inflar(mascara)
    Z *= 0.9
    media = lum[mascara > 0].mean()
    # relevo: rachadura afunda, brilho sobe (até 2,5 voxels)
    relevo = cv2.GaussianBlur(lum, (0, 0), 1.0) - media
    Zr = np.where(mascara > 0, np.maximum(Z + relevo * 2.5, 1.0), 0.0)
    Zi = np.rint(Zr).astype(np.int32)

    suave = cv2.GaussianBlur(Z, (0, 0), 1.3)
    gx = cv2.Sobel(suave, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(suave, cv2.CV_32F, 0, 1, ksize=3) / 8.0

    # tronco = ponto mais largo da silhueta; só o maior pedaço conta para a distância
    n_comp, comp, stats, _ = cv2.connectedComponentsWithStats(mascara, connectivity=4)
    maior_comp = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    D_maior = D * (comp == maior_comp)
    inicio = np.unravel_index(int(np.argmax(D_maior)), D.shape)
    geo = distancia_geodesica((comp == maior_comp).astype(np.uint8), inicio).astype(np.float32)
    geo[geo < 0] = geo.max()
    geo /= max(geo.max(), 1.0)

    ys, xs = np.nonzero(mascara)
    cx = xs.mean()
    base = ys.max() + 1
    # vizinho mais baixo: preenche a parede entre um degrau e outro para não ver através
    viz = np.pad(Zi, 1)
    menor = np.minimum.reduce([viz[:-2, 1:-1], viz[2:, 1:-1], viz[1:-1, :-2], viz[1:-1, 2:]])

    pts = []
    for y, x in zip(ys, xs):
        topo = int(Zi[y, x])
        z0 = max(int(menor[y, x]), 0)
        for z in range(max(z0, topo - 22), topo + 1):
            n = np.array((-gx[y, x], gy[y, x], 1.0), np.float32)
            t = float(np.clip(lum[y, x], 0.02, 1.0)) * (1 if bloco[y, x] else -1)
            X, Y = (x - cx) / LINHAS, (base - y) / LINHAS
            n /= np.linalg.norm(n)
            pts.append((X, Y, z / LINHAS, t, n[0], n[1], n[2], geo[y, x]))
            if z > 0:
                pts.append((X, Y, -z / LINHAS, t, n[0], n[1], -n[2], geo[y, x]))
    a = np.array(pts, np.float32)
    # ordem de baixo para cima, com um pouco de acaso: duas figuras se misturam sem cruzar o corpo todo
    a = a[np.argsort(a[:, 1] + rng.random(len(a)) * 0.03)]
    # vão entre as pernas: a maior coluna vazia entre 12% e 30% da altura, para a pista passar por baixo
    faixa = mascara[int(base - LINHAS * 0.30):int(base - LINHAS * 0.12), :].sum(axis=0) > 0
    colunas = np.nonzero(faixa)[0]
    vao = (0.0, 0.0)
    if len(colunas) > 1:
        inicio_, melhor = None, (0, 0)
        for x in range(colunas[0], colunas[-1] + 1):
            if not faixa[x]:
                inicio_ = x if inicio_ is None else inicio_
            elif inicio_ is not None:
                if x - inicio_ > melhor[1]:
                    melhor = (inicio_, x - inicio_)
                inicio_ = None
        if melhor[1] > 0:
            vao = (float((melhor[0] + melhor[1] / 2 - cx) / LINHAS), float(melhor[1] / LINHAS))
    return a, vao


def assar_personagem(nome, material, lado, corpo_inteiro, flutua):
    """Personagem da Pista Quente como boneco inflado: silhueta do atlas vira volume, o traço fica como tinta preta."""
    im = cv2.imread(str(ATLAS / f'{nome}.png')).astype(np.float32) / 255.0  # BGR: prata, cheio, tinta
    cheio, traco = im[:, :, 1], im[:, :, 2]
    ys, xs = np.nonzero(cheio > 0.5)
    cheio, traco = cheio[ys.min():ys.max() + 1, xs.min():xs.max() + 1], traco[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = cheio.shape
    k = lado / max(h, w)
    tam = (max(2, round(w * k)), max(2, round(h * k)))
    cheio = cv2.resize(cheio, tam, interpolation=cv2.INTER_AREA)
    traco = cv2.resize(traco, tam, interpolation=cv2.INTER_AREA)
    mascara = (cheio > 0.5).astype(np.uint8)
    # tinta da figura: 1 = corpo do boneco, 0 = traço preto
    lum = np.ones_like(cheio) if corpo_inteiro else np.clip(1.0 - (traco - 0.35) / 0.3, 0.0, 1.0)
    Z, D = inflar(mascara)
    Z *= 0.85
    Zr = np.where(mascara > 0, np.maximum(Z + (lum - 0.5) * 2.2, 1.0), 0.0)
    Zi = np.rint(Zr).astype(np.int32)
    suave = cv2.GaussianBlur(Z, (0, 0), 1.3)
    gx = cv2.Sobel(suave, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(suave, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    _, comp, stats, _ = cv2.connectedComponentsWithStats(mascara, connectivity=4)
    maior = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    inicio = np.unravel_index(int(np.argmax(D * (comp == maior))), D.shape)
    geo = distancia_geodesica((comp == maior).astype(np.uint8), inicio).astype(np.float32)
    geo[geo < 0] = geo.max()
    geo /= max(geo.max(), 1.0)
    ys, xs = np.nonzero(mascara)
    cx, base = (xs.min() + xs.max()) / 2, ys.max() + 1
    viz = np.pad(Zi, 1)
    menor = np.minimum.reduce([viz[:-2, 1:-1], viz[2:, 1:-1], viz[1:-1, :-2], viz[1:-1, 2:]])
    pts = []
    for y, x in zip(ys, xs):
        topo = int(Zi[y, x])
        n = np.array((-gx[y, x], gy[y, x], 1.0), np.float32)
        n /= np.linalg.norm(n)
        t = float(np.clip(lum[y, x], 0.0, 1.0))
        X, Y = (x - cx) / lado, (base - y) / lado
        for z in range(max(int(menor[y, x]), 0, topo - 22), topo + 1):
            pts.append((X, Y, z / lado, t, n[0], n[1], n[2], geo[y, x]))
            if z > 0:
                pts.append((X, Y, -z / lado, t, n[0], n[1], -n[2], geo[y, x]))
    a = np.array(pts, np.float32)
    a = a[np.argsort(a[:, 1] + rng.random(len(a)) * 0.03)]
    return a, dict(nome=nome, n=len(a), linhas=lado, mat=material, flutua=flutua, altura=float(a[:, 1].max()))


def alfa_do_logo():
    return cv2.imread(str(LOGO), cv2.IMREAD_UNCHANGED).astype(np.float32)[:, :, 3] / 255.0


def alfa_do_atlas(nome):
    r = cv2.imread(str(ATLAS / f'{nome}.png')).astype(np.float32)[:, :, 2] / 255.0
    ys, xs = np.nonzero(r > 0.5)
    return r[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def assar_logo(alfa):
    h, w = alfa.shape[:2]
    alt = round(LOGO_LARG * h / w)
    a = cv2.resize(alfa, (LOGO_LARG, alt), interpolation=cv2.INTER_AREA)
    mascara = (a > 0.5).astype(np.uint8)
    # chanfro: a normal vira para fora perto da borda da letra, e o cromo ganha linhas de reflexo
    suave = cv2.GaussianBlur(a, (0, 0), 2.2)
    gx = cv2.Sobel(suave, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(suave, cv2.CV_32F, 0, 1, ksize=3)
    pts = []
    for y, x in zip(*np.nonzero(mascara)):
        X, Y = x / LOGO_LARG - 0.5, (alt / 2 - y) / LOGO_LARG
        n = np.array((-gx[y, x] * 1.6, gy[y, x] * 1.6, -1.0), np.float32)
        n /= np.linalg.norm(n)
        # cada voxel do logo é uma barra: a frente vira para quem olha (-z) e a profundidade sai do espectro
        pts.append((X, Y, 0.0, 1.0, n[0], n[1], n[2], x / LOGO_LARG))
    return np.array(pts, np.float32), alt / LOGO_LARG


def main():
    SAIDA.mkdir(exist_ok=True)
    lista, inicio, partes = [], 0, []
    for letra in 'abcdefghij':
        a, vao = assar_figura(letra)
        lista.append(dict(nome=letra, inicio=inicio, n=len(a), largura=float(a[:, 0].max() - a[:, 0].min()), vao_x=vao[0], vao=vao[1]))
        print('  vão entre as pernas:', round(vao[1], 3), 'em x', round(vao[0], 3))
        inicio += len(a)
        partes.append(a)
        print(letra, len(a), 'voxels', flush=True)
    for f in lista:
        f['linhas'] = LINHAS
        f['mat'] = 0
    logos = []
    for nome, alfa in (('clube', alfa_do_logo()), ('titulo', alfa_do_atlas('titulo')), ('millos', alfa_do_atlas('millos'))):
        logo, prop = assar_logo(alfa)
        logos.append(dict(nome=nome, inicio=inicio, n=len(logo), proporcao=prop))
        inicio += len(logo)
        partes.append(logo)
        print('logo', nome, len(logo), 'voxels', flush=True)
    personagens = []
    for nome, material, lado, corpo, flutua in PERSONAGENS:
        a, info = assar_personagem(nome, material, lado, corpo, flutua)
        info['inicio'] = inicio
        inicio += len(a)
        partes.append(a)
        personagens.append(info)
        print(nome, len(a), 'voxels', flush=True)
    meta = dict(linhas=LINHAS, figuras=lista, logo=logos[0], logos=logos, personagens=personagens)
    tudo = np.concatenate(partes)
    (np.clip(tudo, -1, 1) * ESCALA).astype('<i2').tofile(SAIDA / 'figuras.bin')
    (SAIDA / 'figuras.json').write_text(json.dumps(meta), encoding='utf-8')
    print('total', len(tudo), 'voxels,', round((SAIDA / 'figuras.bin').stat().st_size / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
