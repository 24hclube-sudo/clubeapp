"""Assa os dados do Céu 3D.

dados/materiais.png, ladrilho 2048x2048 sem emenda:
  R = cimento queimado: nuvens suaves da desempenadeira, arcos do alisamento, poucos poros e fissuras finas.
  G = inox escovado: risco fino e comprido na direção x.
  B = grão fino, distribuído por igual, para disfarçar as emendas dos módulos do LED.

dados/logo-sdf.png, 2048x720, logo do CLUBE com 1720 px de largura, em campo de distância:
  R = perto da borda (0,5 = na borda, faixa de +-24 px), para a letra sair nítida em qualquer tamanho.
  G = longe da borda (0,5 = na borda, faixa de +-256 px), para o chanfro e a luz atrás do logo.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py [pasta do logo]
"""
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else AQUI.parent
T = 2048
rng = np.random.default_rng(11)
_fy = np.fft.fftfreq(T)[:, None]
_fx = np.fft.rfftfreq(T)[None, :]


def ruido(sx, sy=None):
    """Ruído periódico, filtrado na frequência, com desvio 1."""
    sy = sx if sy is None else sy
    f = np.fft.rfft2(rng.standard_normal((T, T)))
    y = np.fft.irfft2(f * np.exp(-2 * np.pi ** 2 * ((_fx * sx) ** 2 + (_fy * sy) ** 2)), s=(T, T))
    return (y / y.std()).astype(np.float32)


def uniforme(a):
    ordem = np.argsort(a, axis=None)
    r = np.empty(a.size, np.float32)
    r[ordem] = np.linspace(0, 1, a.size, dtype=np.float32)
    return r.reshape(a.shape)


def arcos():
    """Risco comprido entortado por um campo suave: as passadas da desempenadeira no cimento."""
    risco = ruido(90, 4.5)
    yy, xx = np.mgrid[0:T, 0:T].astype(np.float32)
    mx = (xx + 170 * ruido(260)) % T
    my = (yy + 240 * ruido(300)) % T
    return cv2.remap(risco, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)


def fissuras(n):
    m = np.zeros((T, T), np.float32)
    for _ in range(n):
        x, y = rng.random(2) * T
        ang = rng.random() * np.pi * 2
        pts = []
        for _ in range(int(rng.integers(30, 90))):
            pts.append((x, y))
            ang += rng.normal(0, 0.28)
            x += np.cos(ang) * 11
            y += np.sin(ang) * 11
        for dx in (-T, 0, T):
            for dy in (-T, 0, T):
                p = np.array([(a + dx, b + dy) for a, b in pts], np.int32)
                cv2.polylines(m, [p], False, 1.0, 1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), 0.7)


def poros(n):
    m = np.zeros((T, T), np.float32)
    for _ in range(n):
        x, y = rng.integers(0, T, 2)
        r = 1 + 2.2 * rng.random() ** 4
        cv2.circle(m, (int(x), int(y)), max(1, round(r)), 1.0, -1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), 0.8)


def materiais():
    lum = 0.5 + 0.075 * ruido(240) + 0.05 * ruido(80) + 0.03 * ruido(22) + 0.02 * ruido(5) + 0.016 * ruido(1.3)
    lum += 0.016 * arcos()
    lum -= 0.09 * fissuras(5) + 0.16 * poros(900)
    lum = np.clip(lum, 0.03, 1)
    # risco do inox: fino em y, comprido em x, com variação lenta para a chapa não parecer impressa
    inox = 0.5 + 0.17 * ruido(170, 0.8) + 0.09 * ruido(60, 2.2) + 0.06 * ruido(320, 16)
    inox = np.clip(inox, 0, 1)
    grao = uniforme(ruido(1.0))
    img = np.dstack([lum, inox, grao])
    (AQUI / 'dados').mkdir(exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / 'materiais.png', compress_level=6)
    print('cimento: média', round(float(lum.mean()), 3), 'desvio', round(float(lum.std()), 3))


def logo():
    bruto = Image.open(RAIZ / 'assets' / 'clube.png').convert('RGBA')
    a = np.asarray(bruto, np.float32) / 255
    # o logo é preto: conta como tinta o que é opaco e escuro
    tinta = a[:, :, 3] * (1 - a[:, :, :3].mean(axis=2))
    ys, xs = np.where(tinta > 0.5)
    tinta = tinta[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    W, H, LL = 2048, 720, 1720
    # resolve em 4x para a borda sair limpa e reduz a distância depois
    k = 4
    LLk = LL * k
    HHk = round(tinta.shape[0] * LLk / tinta.shape[1])
    grande = cv2.resize(tinta, (LLk, HHk), interpolation=cv2.INTER_CUBIC)
    tela = np.zeros((H * k, W * k), np.uint8)
    x0, y0 = (W * k - LLk) // 2, (H * k - HHk) // 2
    tela[y0:y0 + HHk, x0:x0 + LLk] = (grande > 0.5).astype(np.uint8)
    fora = cv2.distanceTransform(1 - tela, cv2.DIST_L2, 5)
    dentro = cv2.distanceTransform(tela, cv2.DIST_L2, 5)
    d = cv2.resize((fora - dentro) / k, (W, H), interpolation=cv2.INTER_AREA)
    perto = np.clip(d / 48 + 0.5, 0, 1)
    longe = np.clip(d / 512 + 0.5, 0, 1)
    img = np.dstack([perto, longe, np.zeros_like(d)])
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / 'logo-sdf.png', compress_level=6)
    print('logo: altura', HHk // k, 'de', H)


materiais()
logo()
