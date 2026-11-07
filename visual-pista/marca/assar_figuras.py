"""A arte real das figuras da marca, para pôr sobre os modelos 3D.

Lê Desktop\\CLUBE\\04.*\\Figuras_ElementosGráficos_Estáticas\\01 - Principais\\<letra>-1.png e grava dados/figura-<letra>.png, 1024x1024:
R = o desenho em cinza (o metal, as caneluras e as rachaduras), G = onde há desenho.
As malhas e os PNG têm a mesma pose. Em a, b e i, o modelo está espelhado em relação ao desenho; marca.js corrige isso.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar_figuras.py
"""
import pathlib

import cv2
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
CLUBE = pathlib.Path.home() / 'Desktop' / 'CLUBE'
BASE = next(CLUBE.glob('04.*')) / 'Figuras_ElementosGráficos_Estáticas' / '01 - Principais'
for letra in 'abcdefghij':
    im = cv2.imdecode(np.fromfile(str(BASE / f'{letra}-1.png'), np.uint8), cv2.IMREAD_UNCHANGED)
    a = im[:, :, 3].astype(np.float32) / 255
    cinza = cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    # pré-multiplica antes de reduzir, para a borda não trazer o fundo do arquivo
    p = cv2.resize(cinza * a, (1024, 1024), interpolation=cv2.INTER_AREA)
    q = cv2.resize(a, (1024, 1024), interpolation=cv2.INTER_AREA)
    g = np.where(q > 0.01, p / np.maximum(q, 0.01), 0)
    saida = np.dstack([g, q, np.zeros_like(q)])
    Image.fromarray((np.clip(saida, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(AQUI / 'dados' / f'figura-{letra}.png', compress_level=6)
    print(letra, round(float(g[q > 0.5].mean()), 3), round(float((q > 0.5).mean()), 3))
