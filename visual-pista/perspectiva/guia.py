"""Monta a imagem-guia para o MiniMax H3 (modo "Foto → vídeo") a partir da foto 07-pista-noite.jpg.

- guia-h3.jpg: a foto cortada em 3:4 e ampliada para 1440x1920, com o LED (teto e parede do DJ) limpo:
  sem as juntas dos gabinetes (senão o H3 desenha as juntas no conteúdo e elas apareceriam em dobro no painel)
  e sem o logo da parede, só o degradê vermelho. É o primeiro quadro do vídeo: fixa a perspectiva.
- guia-marcado.jpg: a mesma com o contorno do painel e as linhas da mídia, para conferir (não vai para o H3).
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import geometria as g

C = g.CAM


def contorno_foto(lin0, lin1, passos=60):
    """Polígono (u, v) na foto do trecho de linhas lin0..lin1 do painel."""
    lins = np.linspace(lin0, lin1, passos) - 0.5
    esq = np.array(g.painel_para_foto(lins, np.full_like(lins, -0.5))).T
    dir_ = np.array(g.painel_para_foto(lins, np.full_like(lins, g.LARG - 0.5))).T
    return np.vstack([esq, dir_[::-1]])


def mascara(poli, forma):
    m = np.zeros(forma[:2], np.uint8)
    cv2.fillPoly(m, [np.round(poli * 8).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=3)
    return m


def main():
    foto = cv2.imread(g.FOTO)
    alt, larg = foto.shape[:2]
    topo = g.primeira_linha_visivel()
    teto = cv2.dilate(mascara(contorno_foto(topo - 20, g.DOBRA), foto.shape), np.ones((3, 3), np.uint8))
    cabine_v = g.CABINE_V  # topo da cabine de pedra (cobre o pé da parede de LED)
    parede = mascara(contorno_foto(g.DOBRA, g.ALT), foto.shape)
    parede[cabine_v:] = 0

    limpa = foto.copy()
    # Teto: mediana vertical tira as juntas (linhas horizontais finas) e mantém a variação de lado a lado.
    vert = foto.copy()
    for c in range(3):
        canal = foto[:, :, c]
        # mediana 1x13 na vertical: ordena janelas deslizantes
        jan = np.lib.stride_tricks.sliding_window_view(np.pad(canal, ((6, 6), (0, 0)), mode='edge'), 13, axis=0)
        vert[:, :, c] = np.median(jan, axis=-1).astype(np.uint8)
    vert = cv2.GaussianBlur(vert, (0, 0), 1.2)
    a = (cv2.erode(teto, np.ones((3, 3), np.uint8)).astype(np.float32) / 255)[..., None]
    limpa = (vert * a + limpa * (1 - a)).astype(np.uint8)

    # Parede: degradê por linha (mediana das cores sem o logo branco), suavizado na vertical.
    hsv = cv2.cvtColor(foto, cv2.COLOR_BGR2HSV)
    logo = (hsv[:, :, 1] < 90) & (hsv[:, :, 2] > 150)
    logo = cv2.dilate(logo.astype(np.uint8) * 255, np.ones((9, 9), np.uint8)) > 0
    linhas = []
    vs = range(int(np.floor(C['v0'])), cabine_v + 6)
    u0, u1 = int(g.U_PAREDE[0]) + 4, int(g.U_PAREDE[1]) - 4
    for v in vs:
        px = foto[v, u0:u1][~logo[v, u0:u1]]
        linhas.append(np.median(px, 0) if len(px) > 20 else [np.nan] * 3)
    linhas = np.array(linhas, float)
    for c in range(3):  # buracos (linhas só de logo) por interpolação
        ok = ~np.isnan(linhas[:, c])
        linhas[:, c] = np.interp(np.arange(len(linhas)), np.flatnonzero(ok), linhas[ok, c])
    linhas = cv2.GaussianBlur(linhas[:, None, :].astype(np.float32), (1, 0), sigmaX=0.1, sigmaY=6)[:, 0, :]
    # leve queda de brilho para os lados, como na foto
    perfil_lat = np.ones(larg, np.float32)
    lado = np.median(foto[600:670, u0:u1].astype(float), 0).mean(1)
    lado_ref = np.median(lado)
    xs = np.arange(u0, u1)
    perfil_lat[u0:u1] = np.clip(cv2.GaussianBlur((lado / lado_ref)[None].astype(np.float32), (0, 0), 25)[0], 0.75, 1.05)
    degr = np.zeros_like(foto, np.float32)
    for i, v in enumerate(vs):
        degr[v] = linhas[i][None, :] * perfil_lat[:, None]
    degr = np.clip(degr, 0, 255).astype(np.uint8)
    a = (cv2.GaussianBlur(cv2.erode(parede, np.ones((3, 3), np.uint8)), (0, 0), 0.8).astype(np.float32) / 255)[..., None]
    limpa = (degr * a + limpa * (1 - a)).astype(np.uint8)

    x, y, w, h = g.CORTE
    guia = cv2.resize(limpa[y:y + h, x:x + w], g.GUIA, interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite('guia-h3.jpg', guia, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # Marcado: contorno e linhas da mídia
    im = Image.fromarray(cv2.cvtColor(guia, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    try:
        fonte = ImageFont.truetype('arial.ttf', 30)
    except OSError:
        fonte = ImageFont.load_default()
    def pg(lin, col):
        u, v = g.painel_para_foto(lin - 0.5, col - 0.5)
        return tuple(np.array(g.foto_para_guia(u, v), float))
    for poli, cor in ((contorno_foto(topo, g.DOBRA), (0, 255, 120)), (contorno_foto(g.DOBRA, g.ALT), (0, 200, 255))):
        p = np.array(g.foto_para_guia(poli[:, 0], poli[:, 1])).T
        d.line([tuple(q) for q in p] + [tuple(p[0])], fill=cor, width=4)
    for lin in list(range(3500, g.DOBRA, 250)) + [g.DOBRA, 5300]:
        a_, b_ = pg(lin, 0), pg(lin, g.LARG)
        d.line([a_, b_], fill=(255, 255, 255), width=2)
        d.text((b_[0] + 10, b_[1] - 15), f'linha {lin}' + (' (dobra)' if lin == g.DOBRA else ''), fill=(255, 255, 255), font=fonte)
    cab = cabine_v * g.ESCALA_GUIA
    d.line([pg(g.ALT, 0)[0], cab, pg(g.ALT, g.LARG)[0], cab], fill=(255, 80, 80), width=3)
    d.text((40, 40), f'teto visível: linhas {topo}–{g.DOBRA} (as {topo} primeiras, da entrada, ficam fora do quadro)', fill=(255, 255, 255), font=fonte)
    im.save('guia-marcado.jpg', quality=90)
    print(f'guia-h3.jpg {g.GUIA[0]}x{g.GUIA[1]}; teto visível a partir da linha {topo}')

    # guia-figura.jpg: o LED com conteúdo chapado (a mulher do drinque, figura a-1) desenhado do ponto de vista da foto,
    # atravessando teto e parede como na foto 06. É o ponto de partida para "o LED se abre".
    led = np.zeros((alt, larg), np.uint8)
    led[teto > 0] = 255
    led[parede > 0] = 255
    led = cv2.resize(led[y:y + h, x:x + w], g.GUIA, interpolation=cv2.INTER_LINEAR)
    fig = cv2.imread(FIGURA, cv2.IMREAD_UNCHANGED)
    alt_fig = 930
    fig = cv2.resize(fig, (round(fig.shape[1] * alt_fig / fig.shape[0]), alt_fig), interpolation=cv2.INTER_AREA)
    fx0, fy0 = 740 - fig.shape[1] // 2, 12
    camada = np.zeros((g.GUIA[1], g.GUIA[0], 4), np.uint8)
    camada[fy0:fy0 + fig.shape[0], fx0:fx0 + fig.shape[1]] = fig
    alfa = (camada[..., 3:4].astype(np.float32) / 255) * (led[..., None].astype(np.float32) / 255)
    prata = camada[..., :3].astype(np.float32) * 0.92
    comfig = (prata * alfa + guia.astype(np.float32) * (1 - alfa)).astype(np.uint8)
    cv2.imwrite('guia-figura.jpg', comfig, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print('guia-figura.jpg: figura a-1 no LED')


FIGURA = r'C:\apps\visual-pista\assets\figuras\a-1.png'


if __name__ == '__main__':
    main()
