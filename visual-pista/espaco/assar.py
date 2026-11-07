"""Assa a textura limpa do Espaço: dados/materiais.png, ladrilho 2048x2048 sem emenda.

R = cimento queimado: só as nuvens largas da desempenadeira e um alisamento bem leve. Sem grão, sem poros.
G = inox escovado: risco macio e comprido na direção x, largo o bastante para sobreviver ao corte de linhas do sinal (1 linha a cada 2,63).
B = textura fina: mancha miúda de 2 a 5 mm, irregular, com poros raros. É parada e some sozinha ao longe, nos mipmaps.

dados/letreiro-*.png, 2048x720, um por palavra, em campo de distância (R = +-24 px em volta da borda, G = +-256 px).

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py
"""
import pathlib

import cv2
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
T = 2048
rng = np.random.default_rng(23)
_fy = np.fft.fftfreq(T)[:, None]
_fx = np.fft.rfftfreq(T)[None, :]


def ruido(sx, sy=None):
    sy = sx if sy is None else sy
    f = np.fft.rfft2(rng.standard_normal((T, T)))
    y = np.fft.irfft2(f * np.exp(-2 * np.pi ** 2 * ((_fx * sx) ** 2 + (_fy * sy) ** 2)), s=(T, T))
    return (y / y.std()).astype(np.float32)


def alisado():
    risco = ruido(120, 9)
    yy, xx = np.mgrid[0:T, 0:T].astype(np.float32)
    mx = (xx + 190 * ruido(300)) % T
    my = (yy + 260 * ruido(340)) % T
    return cv2.remap(risco, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)


cimento = np.clip(0.5 + 0.06 * ruido(280) + 0.032 * ruido(95) + 0.012 * alisado(), 0, 1)
inox = np.clip(0.5 + 0.11 * ruido(240, 3.5) + 0.07 * ruido(90, 6) + 0.05 * ruido(340, 20), 0, 1)
mancha = 0.72 * ruido(0.95) + 0.28 * ruido(2.0)
mancha /= mancha.std()
poro = np.clip((ruido(1.7) - 2.75) / 0.5, 0, 1)
fino = np.clip(0.5 + 0.145 * mancha * (0.8 + 0.2 * ruido(70)) - 0.22 * poro, 0, 1)
img = np.dstack([cimento, inox, fino])
(AQUI / 'dados').mkdir(exist_ok=True)
Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / 'materiais.png', compress_level=6)
print('cimento', round(float(cimento.mean()), 3), round(float(cimento.std()), 3), 'inox', round(float(inox.std()), 3))

def letreiro(arq, nome):
    a = np.asarray(Image.open(AQUI.parent / arq).convert('RGBA'), np.float32) / 255
    # clube.png é preto sobre transparente; os letreiros são brancos sobre transparente: a tinta é o que é opaco
    tinta = a[:, :, 3]
    if tinta.min() > 0.9:
        tinta = 1 - a[:, :, :3].mean(axis=2)
    ys, xs = np.where(tinta > 0.5)
    tinta = tinta[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    W, H, k = 2048, 720, 4
    esc = min(1720 / tinta.shape[1], 500 / tinta.shape[0])
    lk, hk = round(tinta.shape[1] * esc * k), round(tinta.shape[0] * esc * k)
    grande = cv2.resize(tinta, (lk, hk), interpolation=cv2.INTER_CUBIC)
    tela = np.zeros((H * k, W * k), np.uint8)
    x0, y0 = (W * k - lk) // 2, (H * k - hk) // 2
    tela[y0:y0 + hk, x0:x0 + lk] = (grande > 0.5).astype(np.uint8)
    fora = cv2.distanceTransform(1 - tela, cv2.DIST_L2, 5)
    dentro = cv2.distanceTransform(tela, cv2.DIST_L2, 5)
    d = cv2.resize((fora - dentro) / k, (W, H), interpolation=cv2.INTER_AREA)
    img = np.dstack([np.clip(d / 48 + 0.5, 0, 1), np.clip(d / 512 + 0.5, 0, 1), np.zeros_like(d)])
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / f'letreiro-{nome}.png', compress_level=6)
    print(nome, round(lk / k), 'x', round(hk / k))


letreiro('assets/clube.png', 'clube')
letreiro('assets/letreiros/titulo.png', 'pista')
letreiro('assets/letreiros/millos.png', 'millos')
