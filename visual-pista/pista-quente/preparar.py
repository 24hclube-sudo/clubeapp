"""Prepara a arte para os visuais da festa (Pista Quente + Millos Kaiser, sobre a identidade do CLUBE).

Cada elemento vira uma camada quadrada de 1024 px em atlas/, com os canais:
  R = tinta (traço do desenho), G = silhueta preenchida (o miolo vazio do desenho vira cheio), B = luminância (prata das figuras).
O atlas.json lista as camadas na ordem do array de texturas, com a proporção de cada desenho.

Os originais em originais/ vêm do Drive da Pista Quente (pasta "ID"). Só leitura.
Uso: python preparar.py
"""
import json
import math
import pathlib

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = AQUI / 'originais'
SAIDA = AQUI / 'atlas'
FIGURAS = AQUI.parent / 'assets' / 'figuras'
LOGO = AQUI.parent / 'assets' / 'clube.png'
ARCHIVO = str(AQUI.parent / 'assets' / 'Archivo-Regular.ttf')
MYTHSHIRE = r'C:\apps\instagram\assets\fonts\Mythshire.ttf'
TAM = 1024

# (nome da camada, arquivo, tamanho do fechamento para achar a silhueta de traços que não se encontram)
PQ = [
    ('bombinha', 'Bombinha PB.png', 15),
    ('fogo', 'Fogo Suado PB.png', 25),
    ('gelinho', 'Gelinho PB.png', 25),
    ('nuvem', 'Nuvem PB.png', 31),
    ('suado1', 'Suado 01 PB.png', 61),
    ('suado2', 'Suado 02 PB.png', 61),
    ('titulo', 'Titulo PB.png', 1),
]
FIGS = 'abdfhj'


def silhueta(alfa, fechar):
    """Tudo que o traço cerca vira cheio: inunda de fora para dentro; o que a água não alcança é o desenho."""
    m = (alfa > 127).astype(np.uint8)
    if fechar > 1:
        fechado = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (fechar, fechar)))
    else:
        return m
    h, w = m.shape
    com_borda = cv2.copyMakeBorder(fechado, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    agua = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(com_borda, agua, (0, 0), 2)
    dentro = (com_borda[1:-1, 1:-1] != 2).astype(np.uint8)
    # o fechamento engorda o contorno: volta o que passou do traço
    if fechar > 3:
        dentro = cv2.erode(dentro, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (fechar // 2 | 1, fechar // 2 | 1)))
    return np.maximum(dentro, m)


def enquadrar(img):
    """Recorta no desenho e centraliza num quadrado de TAM (HxWxC). Devolve imagem e (largura, altura) úteis em 0..1."""
    a = img[:, :, -1]
    ys, xs = np.nonzero(a > 8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rec = img[y0:y1, x0:x1]
    h, w = rec.shape[:2]
    k = TAM * 0.985 / max(w, h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    rec = cv2.resize(rec, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    tela = np.zeros((TAM, TAM, img.shape[2]), img.dtype)
    ox, oy = (TAM - nw) // 2, (TAM - nh) // 2
    tela[oy:oy + nh, ox:ox + nw] = rec
    return tela, nw / TAM, nh / TAM


def gravar(nome, r, g, b):
    Image.fromarray(np.dstack([r, g, b]).astype(np.uint8), 'RGB').save(SAIDA / f'{nome}.png', compress_level=6)


def texto(linhas, fonte, corpo, entre=1.0, folga=40):
    """Texto em alfa (uint8) com as linhas centralizadas."""
    f = ImageFont.truetype(fonte, corpo)
    caixas = [f.getbbox(t) for t in linhas]
    larg = max(c[2] - c[0] for c in caixas) + folga * 2
    alt_linha = round(corpo * entre)
    alt = alt_linha * len(linhas) + folga * 2 + corpo // 2
    im = Image.new('L', (larg, alt), 0)
    d = ImageDraw.Draw(im)
    for i, (t, c) in enumerate(zip(linhas, caixas)):
        d.text(((larg - (c[2] - c[0])) / 2 - c[0], folga + i * alt_linha), t, font=f, fill=255)
    return np.array(im)


def rotulo():
    """Texto em volta do selo do disco (gira no visual)."""
    frase = 'MILLOS KAISER  ·  PISTA QUENTE  ·  CLUBE  ·  SOFT OPENING  ·  07.11  ·  '
    f = ImageFont.truetype(ARCHIVO, 118)
    grande = TAM * 2
    im = Image.new('L', (grande, grande), 0)
    raio = grande * 0.42
    larguras = [f.getlength(c) for c in frase]
    total = sum(larguras)
    a = -math.pi / 2
    k = 2 * math.pi / total
    for c, l in zip(frase, larguras):
        ang = a + l * k / 2
        letra = Image.new('L', (240, 240), 0)
        ImageDraw.Draw(letra).text((120 - l / 2, 50), c, font=f, fill=255)
        letra = letra.rotate(-math.degrees(ang + math.pi / 2), resample=Image.BICUBIC)
        x, y = grande / 2 + math.cos(ang) * raio, grande / 2 + math.sin(ang) * raio
        im.paste(letra, (round(x - 120), round(y - 120)), letra)
        a += l * k
    return np.array(im.resize((TAM, TAM), Image.LANCZOS))


def main():
    SAIDA.mkdir(exist_ok=True)
    lista = []

    def acrescentar(nome, r, g, b, larg, alt, tipo):
        gravar(nome, r, g, b)
        lista.append(dict(nome=nome, largura=round(larg, 4), altura=round(alt, 4), tipo=tipo))
        print(nome, round(larg, 3), round(alt, 3), tipo, flush=True)

    # Pista Quente: tinta preta + silhueta preenchida
    for nome, arq, fechar in PQ:
        rgba = np.array(Image.open(ORIG / arq).convert('RGBA'))
        alfa = rgba[:, :, 3]
        s = silhueta(alfa, fechar) * 255
        tela, larg, alt = enquadrar(np.dstack([alfa, cv2.GaussianBlur(s, (0, 0), 0.8), alfa]))
        acrescentar(nome, tela[:, :, 0], tela[:, :, 1], np.full((TAM, TAM), 255, np.uint8), larg, alt, 'pq')

    # Figuras do CLUBE: prata (luminância) dentro da silhueta
    for letra in FIGS:
        rgba = np.array(Image.open(FIGURAS / f'{letra}-1.png').convert('RGBA'))
        lum = rgba[:, :, :3].mean(axis=2).astype(np.uint8)
        tela, larg, alt = enquadrar(np.dstack([lum, rgba[:, :, 3]]))
        acrescentar(f'fig-{letra}', np.zeros((TAM, TAM), np.uint8), tela[:, :, 1], tela[:, :, 0], larg, alt, 'figura')

    # Logo do CLUBE e textos: tudo como tinta, para o visual escolher a cor
    alfa = np.array(Image.open(LOGO).convert('RGBA'))[:, :, 3]
    tela, larg, alt = enquadrar(np.dstack([alfa, alfa]))
    acrescentar('clube', tela[:, :, 0], tela[:, :, 0], np.full((TAM, TAM), 255, np.uint8), larg, alt, 'texto')

    for nome, linhas, fonte, corpo, entre in (
        ('millos', ['Millos', 'Kaiser'], ARCHIVO, 300, 0.92),
        ('soft', ['soft opening'], MYTHSHIRE, 260, 1.0),
        ('data', ['07.11'], ARCHIVO, 300, 1.0),
    ):
        a = texto(linhas, fonte, corpo, entre)
        tela, larg, alt = enquadrar(np.dstack([a, a]))
        acrescentar(nome, tela[:, :, 0], tela[:, :, 0], np.full((TAM, TAM), 255, np.uint8), larg, alt, 'texto')

    r = rotulo()
    acrescentar('rotulo', r, r, np.full((TAM, TAM), 255, np.uint8), 1.0, 1.0, 'texto')

    (SAIDA / 'atlas.json').write_text(json.dumps(dict(tamanho=TAM, camadas=lista), ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(lista), 'camadas')


if __name__ == '__main__':
    main()
