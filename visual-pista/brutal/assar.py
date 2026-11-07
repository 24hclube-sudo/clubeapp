"""Assa a textura do visual Brutal: um ladrilho de concreto bruto, 2048x2048, sem emenda (dados/concreto.png).

R = luminância do concreto: manchas, marca de tábua da fôrma, agregado, furos de ar e furos de tirante.
G = ruído distribuído por igual de 0 a 1, para esfarelar as bordas das massas.
B = grão fino distribuído por igual, para o concreto crepitar com os agudos.

A textura é o que esconde a grade física do LED: em área lisa os módulos aparecem; aqui a variação forte em escala de 2 a 200 px
disfarça as emendas (a cada 86 e 172 px do painel).

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py
"""
import pathlib

import cv2
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
T = 2048
rng = np.random.default_rng(5)
_fy = np.fft.fftfreq(T)[:, None]
_fx = np.fft.rfftfreq(T)[None, :]


def ruido(sx, sy=None):
    """Ruído periódico (filtrado na frequência, por isso fecha nas bordas), desvio 1."""
    sy = sx if sy is None else sy
    f = np.fft.rfft2(rng.standard_normal((T, T)))
    y = np.fft.irfft2(f * np.exp(-2 * np.pi ** 2 * ((_fx * sx) ** 2 + (_fy * sy) ** 2)), s=(T, T))
    return y / y.std()


def uniforme(a):
    """Redistribui para ficar por igual entre 0 e 1: assim um limiar corta a fração exata da área."""
    ordem = np.argsort(a, axis=None)
    r = np.empty(a.size, np.float32)
    r[ordem] = np.linspace(0, 1, a.size, dtype=np.float32)
    return r.reshape(a.shape)


def furos(n, rmin, rmax, profundidade):
    """Círculos escuros, repetidos nas bordas para o ladrilho fechar."""
    m = np.zeros((T, T), np.float32)
    for _ in range(n):
        x, y = rng.integers(0, T, 2)
        r = rmin + (rmax - rmin) * rng.random() ** 3
        for dx in (-T, 0, T):
            for dy in (-T, 0, T):
                cv2.circle(m, (int(x + dx), int(y + dy)), max(1, round(r)), 1.0, -1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), 0.8) * profundidade


def main():
    lum = 0.58 + 0.09 * ruido(150) + 0.08 * ruido(45) + 0.1 * ruido(10) + 0.09 * ruido(3.2) + 0.05 * ruido(1.1)
    # fôrma de tábuas: cada tábua tem seu tom, seu veio estirado e uma junta escura
    alt = T // 8
    tom = np.repeat(rng.normal(0, 0.055, 8), alt)[:, None]
    lum += tom + 0.05 * ruido(90, 1.5)
    yy = np.arange(T)[:, None]
    junta = np.exp(-(np.minimum(yy % alt, alt - yy % alt) / 2.2) ** 2)
    lum -= junta * (0.24 + 0.08 * ruido(30))
    # furos de ar e os furos de tirante da fôrma, em grade
    lum -= furos(2600, 1, 7, 0.34)
    tir = np.zeros((T, T), np.float32)
    passo = T // 3
    for j in range(3):
        for i in range(3):
            cv2.circle(tir, (passo // 2 + i * passo, alt // 2 + j * passo), 13, 1.0, -1, cv2.LINE_AA)
    lum -= cv2.GaussianBlur(tir, (0, 0), 1.2) * 0.5
    lum = np.clip(lum, 0.03, 1)

    esfarela = uniforme(0.5 * ruido(2.5) + 0.65 * ruido(8) + 0.75 * ruido(26))
    grao = uniforme(ruido(1.0))
    (AQUI / 'dados').mkdir(exist_ok=True)
    img = np.dstack([lum, esfarela, grao])
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / 'concreto.png', compress_level=6)
    print('concreto: média', round(float(lum.mean()), 3), 'desvio', round(float(lum.std()), 3))


if __name__ == '__main__':
    main()
