"""Silhuetas dos personagens para recortar em pedra.

Lê ../marca/dados/figura-<letra>.png (R = desenho em cinza, G = onde há desenho) e grava dados/figura-sdf-<letra>.png, 1024x1024:
R = distância perto da borda (px, de -24 a 24), G = distância longe (px, de -256 a 256), B = o desenho em cinza, A = 255.
Mesma codificação dos letreiros de ../espaco/dados. Negativo é dentro do corpo.
Sem O Curador (h): ele segura um disco de vinil, que o usuário pediu para não voltar.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py
"""
import pathlib

import cv2
import numpy as np

AQUI = pathlib.Path(__file__).resolve().parent
FIG = AQUI.parent / 'marca' / 'dados'
(AQUI / 'dados').mkdir(exist_ok=True)
for letra in 'abcdefgij':
    im = cv2.imread(str(FIG / f'figura-{letra}.png'))
    cinza = im[:, :, 2].astype(np.float32) / 255
    cob = im[:, :, 1].astype(np.float32) / 255
    # a arte tem migalhas de pixel soltas em volta do corpo: fecha e tira as ilhas pequenas, para a pedra não virar cascalho
    m = (cob > 0.5).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, rot, est, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        maior = est[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if est[i, cv2.CC_STAT_AREA] < maior * 0.02:
                m[rot == i] = 0
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.2)
    dentro = m > 0.5
    # distância com sub-pixel: em 4x, depois reduz
    g = cv2.resize(m, (4096, 4096), interpolation=cv2.INTER_LINEAR) > 0.5
    fora = cv2.distanceTransform((~g).astype(np.uint8), cv2.DIST_L2, 5)
    den = cv2.distanceTransform(g.astype(np.uint8), cv2.DIST_L2, 5)
    d = (fora - den) / 4.0
    d = cv2.resize(d, (1024, 1024), interpolation=cv2.INTER_AREA)
    perto = np.clip((d + 24) / 48, 0, 1)
    longe = np.clip((d + 256) / 512, 0, 1)
    saida = np.dstack([np.clip(cinza * (cob > 0.01), 0, 1), longe, perto, np.full_like(d, 1.0)])  # BGRA: B cinza, G longe, R perto
    cv2.imwrite(str(AQUI / 'dados' / f'figura-sdf-{letra}.png'), (saida * 255 + 0.5).astype(np.uint8))
    print(letra, 'dentro', round(float(dentro.mean()), 3), 'min', round(float(d.min()), 1))
