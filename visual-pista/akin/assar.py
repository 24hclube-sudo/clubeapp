"""Prepara a arte do Akin (assets/akin, Drive PISTA CLUBE) para os visuais em tempo real.

dados/palavra-N.png, 4096x1024, em campo de distância: R = +-32 px em volta da borda, G = +-320 px.
  0 PISTA QUENTE em uma linha, 1 MILLOS KAISER em uma linha, 2 e 3 os mesmos em duas linhas,
  4 título do cartaz das TVs, 5 rodapé do cartaz das TVs.
dados/cabeca.png: a cabeça do Millos do cartaz. R = tinta azul, G = branco, B = silhueta cheia.
dados/medidas.json: largura e altura de cada palavra no quadro de 4096x1024 e proporção da cabeça.

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py
"""
import json
import pathlib

import cv2
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
FONTE = AQUI.parent / 'assets' / 'akin'
SAIDA = AQUI / 'dados'
SAIDA.mkdir(exist_ok=True)
W, H = 4096, 1024


def ler(nome):
    return cv2.imread(str(FONTE / nome), cv2.IMREAD_UNCHANGED)


def recortar(m):
    ys, xs = np.where(m > 127)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def palavra(i, mascara, largura_max=3880, altura_max=900):
    m = recortar(mascara)
    esc = min(largura_max / m.shape[1], altura_max / m.shape[0])
    mw, mh = round(m.shape[1] * esc), round(m.shape[0] * esc)
    k = 2
    grande = cv2.resize(m, (mw * k, mh * k), interpolation=cv2.INTER_CUBIC if esc > 1 else cv2.INTER_AREA)
    tela = np.zeros((H * k, W * k), np.uint8)
    x0, y0 = (W * k - mw * k) // 2, (H * k - mh * k) // 2
    tela[y0:y0 + mh * k, x0:x0 + mw * k] = (grande > 127).astype(np.uint8)
    fora = cv2.distanceTransform(1 - tela, cv2.DIST_L2, 5)
    dentro = cv2.distanceTransform(tela, cv2.DIST_L2, 5)
    d = cv2.resize((fora - dentro) / k, (W, H), interpolation=cv2.INTER_AREA)
    img = np.dstack([np.clip(d / 64 + 0.5, 0, 1), np.clip(d / 640 + 0.5, 0, 1), np.zeros_like(d)])
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGB').save(SAIDA / f'palavra-{i}.png', compress_level=6)
    print(i, mw, 'x', mh)
    return {'w': mw, 'h': mh}


girar = lambda a: cv2.rotate(a, cv2.ROTATE_90_CLOCKWISE)
medidas = {'palavras': []}
medidas['palavras'].append(palavra(0, girar(ler('LED_DA_PISTA_pista_transp.png')[:, :, 3])))
medidas['palavras'].append(palavra(1, girar(ler('LED_DA_PISTA_millos_transp.png')[:, :, 3])))
medidas['palavras'].append(palavra(2, ler('PROJECAO_MAPEADA_transp.png')[:, :, 3]))
medidas['palavras'].append(palavra(3, ler('PAREDE_DJ_millos_transp.png')[:, :, 3]))

tv = ler('TVS_BAR.png')[:, :, :3].astype(np.int32)
b, g, r = tv[:, :, 0], tv[:, :, 1], tv[:, :, 2]
azul = ((b > r + 30) & (b > g + 30)).astype(np.uint8) * 255
branco = (np.minimum(np.minimum(r, g), b) > 205).astype(np.uint8) * 255
medidas['palavras'].append(palavra(4, azul[:1000]))
medidas['palavras'].append(palavra(5, azul[2900:]))

# cabeça: só a maior mancha azul + branco do meio do cartaz, com os furos fechados
meio = np.zeros_like(azul)
meio[1000:2900] = cv2.bitwise_or(azul, branco)[1000:2900]
n, rot, est, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(meio, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))
maior = 1 + int(np.argmax(est[1:, cv2.CC_STAT_AREA]))
x, y, w, h = est[maior, :4]
sil = (rot == maior).astype(np.uint8)
contornos, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
sil = cv2.drawContours(np.zeros_like(sil), contornos, -1, 255, cv2.FILLED)
rec = lambda a: a[y:y + h, x:x + w]
cab = np.dstack([rec(azul), rec(branco) & rec(sil), rec(sil)])
lc = 1024
hc = round(h * lc / w)
cab = cv2.resize(cab, (lc, hc), interpolation=cv2.INTER_AREA)
Image.fromarray(cab, 'RGB').save(SAIDA / 'cabeca.png', compress_level=6)
medidas['cabeca'] = {'w': lc, 'h': hc}
print('cabeça', w, 'x', h, '->', lc, 'x', hc)

deg = ler('LED_DA_PISTA_degrade.png')
print('degradê', [deg[y, 500, ::-1].tolist() for y in (0, 1400, 2800, 4200, 5675)])
print('vermelho', ler('LED_DA_PISTA_pista_vermelho.png')[20, 20, ::-1].tolist())
print('azul do cartaz', np.median(tv[azul > 0], axis=0)[::-1].tolist())
(SAIDA / 'medidas.json').write_text(json.dumps(medidas), encoding='utf8')
