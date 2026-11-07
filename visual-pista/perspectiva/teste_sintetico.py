"""Teste do desdobrador sem gastar crédito: pinta um cartão de teste do painel (em movimento) na guia,
em perspectiva, simula o H3 (outro tamanho, leve deslocamento, compressão), desdobra e compara.

    .venv\\Scripts\\python.exe teste_sintetico.py
"""
import os
import subprocess

import cv2
import numpy as np

import geometria as g
from desdobrar import FFMPEG

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, 'saidas')


def cartao(t):
    """Painel 1032x5676: grade de módulos, números das linhas e uma faixa que anda da parede para a entrada."""
    p = np.zeros((g.ALT, g.LARG, 3), np.uint8)
    lin = np.arange(g.ALT)[:, None]
    col = np.arange(g.LARG)[None, :]
    p[..., 2] = (60 + 120 * (lin / g.ALT)).astype(np.uint8)
    p[..., 0] = (40 + 100 * (col / g.LARG)).astype(np.uint8)
    p[(lin[:, 0] % 172) < 6] = (255, 255, 255)                 # uma linha a cada 2 módulos (32 cm)
    p[:, (col[0] % 172) < 6] = (255, 255, 255)
    p[g.DOBRA - 8:g.DOBRA + 8] = (0, 255, 255)
    faixa = int(g.ALT - (t * 900) % g.ALT)
    p[max(0, faixa - 40):faixa] = (0, 255, 0)
    for r in range(0, g.ALT, 344):
        cv2.putText(p, str(r), (380, r + 120), cv2.FONT_HERSHEY_SIMPLEX, 4, (255, 255, 255), 10)
    return p


def main():
    guia = cv2.imread(os.path.join(AQUI, 'guia-h3.jpg'))
    gh, gw = guia.shape[:2]
    gu, gv = np.meshgrid(np.arange(gw, dtype=float), np.arange(gh, dtype=float))
    u = gu / g.ESCALA_GUIA + g.CORTE[0]
    v = gv / g.ESCALA_GUIA + g.CORTE[1]
    lin, col = g.foto_para_painel(u, v)
    dentro = np.isfinite(lin) & (v < g.CABINE_V)
    mx = np.nan_to_num(col, nan=-10).astype(np.float32)
    my = np.nan_to_num(lin, nan=-10).astype(np.float32)
    # "H3" de mentira: 1440x1918, 4 px para a direita, 3 para baixo
    W, H, dx, dy = 1440, 1918, 4, 3
    M = np.float32([[W / gw, 0, dx], [0, H / gh, dy]])
    os.makedirs(SAIDA, exist_ok=True)
    video = os.path.join(SAIDA, 'teste-sintetico.mp4')
    enc = subprocess.Popen([FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '24',
                            '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', video], stdin=subprocess.PIPE)
    for i in range(48):
        c = cartao(i / 24)
        pint = cv2.remap(c, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        q = guia.copy()
        q[dentro] = pint[dentro] if i else q[dentro]               # 1º quadro = a guia
        enc.stdin.write(cv2.warpAffine(q, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).tobytes())
        if i == 24:
            cv2.imwrite(os.path.join(SAIDA, 'teste-sintetico-esperado.png'), c)
    enc.stdin.close()
    enc.wait()
    subprocess.run([os.path.join(AQUI, '.venv', 'Scripts', 'python.exe'), os.path.join(AQUI, 'desdobrar.py'), video, '--emenda', '0'], check=True)
    # compara o quadro do meio (24) com o cartão, nas linhas visíveis
    cap = cv2.VideoCapture(os.path.join(SAIDA, 'teste-sintetico-painel.mp4'))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 24)
    ok, obtido = cap.read()
    esperado = cv2.imread(os.path.join(SAIDA, 'teste-sintetico-esperado.png'))
    topo = g.primeira_linha_visivel() + 40
    base = int(g.DOBRA + (g.CABINE_V - 3 - g.CAM['v0']) / (g.PASSO * g.CAM['k']))
    for nome, (a, b) in {'teto (linhas %d–%d)' % (topo, g.DOBRA): (topo, g.DOBRA), 'parede (linhas %d–%d)' % (g.DOBRA, base): (g.DOBRA, base)}.items():
        e = cv2.GaussianBlur(esperado[a:b, 60:-60], (0, 0), 3).astype(float)
        o = cv2.GaussianBlur(obtido[a:b, 60:-60], (0, 0), 3).astype(float)
        print(f'{nome}: diferença média {np.abs(e - o).mean():.1f} (0–255)')
    lado = np.hstack([cv2.resize(esperado, (258, 1419)), np.zeros((1419, 12, 3), np.uint8), cv2.resize(obtido, (258, 1419))])
    cv2.imwrite(os.path.join(SAIDA, 'teste-sintetico-comparacao.png'), lado)


if __name__ == '__main__':
    main()
