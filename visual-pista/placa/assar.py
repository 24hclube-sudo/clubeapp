"""Assa as placas de metal em relevo para o LED da pista (1032x5676, dobra na linha 4988).

Cada composição vira três arquivos crus em dados/:
  <nome>-h.bin  altura em px do painel, float16, 1032x5676 (o shader tira a inclinação daqui)
  <nome>-m.bin  RGBA8 516x2838: R polimento (0 fosco, 1 espelho), G sulco da escovação, B sombra de contato, A corrosão
  <nome>-d.bin  RG8 258x1419: direção da escovação em ângulo duplo (cos 2θ, sin 2θ), para interpolar sem emenda

Uso: ..\\perspectiva\\.venv\\Scripts\\python.exe assar.py [nome da composição ...]
"""
import json
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

AQUI = pathlib.Path(__file__).resolve().parent
ASSETS = AQUI.parent / 'assets'
FIG = ASSETS / 'figuras'
ARCHIVO = str(ASSETS / 'Archivo-Regular.ttf')
MYTHSHIRE = r'C:\apps\instagram\assets\fonts\Mythshire.ttf'
SAIDA = AQUI / 'dados'

W, H, F = 1032, 5676, 4988
CX, CY = 516.0, 5332.0  # centro da parede do DJ
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5
y2, x2 = np.mgrid[0:H // 2, 0:W // 2].astype(np.float32) * 2 + 1.0
rng = np.random.default_rng(11)


def f32(a):
    return np.asarray(a, np.float32)


def liso(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def redondo(t):
    """Quarto de círculo: sobe rápido da borda e assenta no topo."""
    t = np.clip(t, 0, 1)
    return np.sqrt(1 - (1 - t) ** 2)


def chanfro(t):
    """Lâmina de buril: quase reto, com a aresta só um pouco quebrada."""
    t = np.clip(t, 0, 1)
    return t * 0.82 + liso(t) * 0.18


def filete(sd, pos, larg):
    return redondo(1 - np.abs(sd - pos) / larg)


def caixa(cx, cy, mw, mh):
    """Distância para dentro de um retângulo (positiva dentro)."""
    return -np.maximum(np.abs(xx - cx) - mw, np.abs(yy - cy) - mh)


def bilhete(cx, cy, mw, mh, raio):
    """Retângulo com os cantos mordidos para dentro, como placa de latão antiga."""
    sd = caixa(cx, cy, mw, mh)
    ax, ay = np.abs(xx - cx) - mw, np.abs(yy - cy) - mh
    return np.minimum(sd, np.hypot(ax, ay) - raio)


# ---------- escovação ----------
def _ruido_1d(escalas):
    n = 1 << 16
    base = rng.standard_normal(n)
    esp = np.fft.rfft(base)
    k = np.fft.rfftfreq(n)
    total = np.zeros(n)
    for s, peso in escalas:
        x = np.fft.irfft(esp * np.exp(-2 * (np.pi * k * s) ** 2), n)
        total += peso * x / x.std()
    return f32(total / total.std())


SULCO_1D = _ruido_1d([(1.3, 0.55), (4.0, 0.5), (13.0, 0.4)])
_TILE_A = cv2.GaussianBlur(f32(rng.standard_normal((512, 512))), (0, 0), 3, borderType=cv2.BORDER_REFLECT)
_TILE_A /= _TILE_A.std()


def sulcos(u, v):
    """u corre ao longo do risco, v atravessa."""
    n = SULCO_1D.size
    s = np.interp(np.mod(v, n), np.arange(n), SULCO_1D, period=n)
    m = cv2.remap(_TILE_A, f32(np.mod(u / 40.0, 512)), f32(np.mod(v, 512)), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    return f32(0.5 + 0.17 * s * (0.7 + 0.3 * np.abs(m)) + 0.025 * m)


def campo_linear(graus=90.0):
    th = np.radians(graus)
    c, s = np.cos(th), np.sin(th)
    u, v = x2 * c + y2 * s, -x2 * s + y2 * c
    return np.full_like(x2, np.cos(2 * th)), np.full_like(x2, np.sin(2 * th)), sulcos(u, v)


def campo_giro(cx, cy):
    """Metal girado no torno: risco em círculos."""
    dx, dy = x2 - cx, y2 - cy
    r, a = np.hypot(dx, dy), np.arctan2(dy, dx)
    su = sulcos(np.abs(a) * 300, r)
    su = 0.5 + (su - 0.5) * liso((r - 30) / 90)
    return -np.cos(2 * a), -np.sin(2 * a), su


def campo_raio(cx, cy):
    """Risco saindo do centro, como mostrador de relógio raiado."""
    dx, dy = x2 - cx, y2 - cy
    r, a = np.hypot(dx, dy), np.arctan2(dy, dx)
    return np.cos(2 * a), np.sin(2 * a), sulcos(r, np.abs(a) * 2600)


class Chapa:
    def __init__(self, nome):
        self.nome = nome
        self.h = np.zeros((H, W), np.float32)
        self.pol = np.full((H, W), 0.0, np.float32)
        self.c2, self.s2, self.su = campo_linear(90)
        self.cor = np.zeros((H // 2, W // 2), np.float32)

    def campo(self, mascara, campo):
        """Troca a escovação dentro da máscara (máscara em resolução cheia)."""
        m = cv2.resize(f32(mascara), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        self.c2 += (campo[0] - self.c2) * m
        self.s2 += (campo[1] - self.s2) * m
        self.su += (campo[2] - self.su) * m

    def gravar(self):
        h = cv2.GaussianBlur(self.h, (0, 0), 0.9)
        hm = cv2.resize(h, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        fundo = np.maximum(cv2.GaussianBlur(hm, (0, 0), 5) - hm, 0) * 0.05 + np.maximum(cv2.GaussianBlur(hm, (0, 0), 22) - hm, 0) * 0.018
        sombra = np.clip(1 - np.minimum(fundo, 0.55), 0, 1)
        pol = cv2.resize(self.pol, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        m = np.dstack([pol, np.clip(self.su, 0, 1), sombra, np.clip(self.cor, 0, 1)])
        d = np.dstack([cv2.resize(self.c2, (W // 4, H // 4), interpolation=cv2.INTER_AREA), cv2.resize(self.s2, (W // 4, H // 4), interpolation=cv2.INTER_AREA)])
        SAIDA.mkdir(exist_ok=True)
        (SAIDA / f'{self.nome}-h.bin').write_bytes(h.astype(np.float16).tobytes())
        (SAIDA / f'{self.nome}-m.bin').write_bytes((m * 255 + 0.5).astype(np.uint8).tobytes())
        (SAIDA / f'{self.nome}-d.bin').write_bytes(((d * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8).tobytes())
        print(self.nome, 'altura', round(float(h.min()), 2), 'a', round(float(h.max()), 2), flush=True)


# ---------- formas: alfa → distância com sobra em volta ----------
SOBRA = 60


def forma(alfa, larg=None, alt=None):
    """Mede a distância em dobro da resolução, para o chanfro sair liso. Devolve sd em 1x, com SOBRA px em volta."""
    ah, aw = alfa.shape
    k = larg / aw if larg else alt / ah
    tw, th = max(1, round(aw * k)), max(1, round(ah * k))
    a2 = cv2.resize(f32(alfa), (tw * 2, th * 2), interpolation=cv2.INTER_AREA if k < 2 else cv2.INTER_CUBIC)
    a2 = cv2.copyMakeBorder(a2, SOBRA * 2, SOBRA * 2, SOBRA * 2, SOBRA * 2, cv2.BORDER_CONSTANT, value=0)
    m = (a2 > 0.5).astype(np.uint8)
    sd = (cv2.distanceTransform(m, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)) * 0.5
    sd = cv2.resize(sd, (tw + SOBRA * 2, th + SOBRA * 2), interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(sd, (0, 0), 1.6)


def recorte(sd, cx, cy):
    """Janela do painel onde a forma cai: (fatia y, fatia x, fatia na forma)."""
    fh, fw = sd.shape
    x0, y0 = round(cx - fw / 2), round(cy - fh / 2)
    xa, ya = max(x0, 0), max(y0, 0)
    xb, yb = min(x0 + fw, W), min(y0 + fh, H)
    return (slice(ya, yb), slice(xa, xb)), (slice(ya - y0, yb - y0), slice(xa - x0, xb - x0))


def carimbar(C, sd, cx, cy, altura, lamina, pol=0.95, halo=16, perfil=chanfro, engrossar=0.0):
    """Forma em alto-relevo. Em volta dela, o fundo é aplainado (halo), para a leitura não brigar com o padrão."""
    pan, loc = recorte(sd, cx, cy)
    s = sd[loc] + engrossar
    if halo:
        C.h[pan] *= 1 - liso((s + halo) / 8)
        C.pol[pan] *= 1 - liso((s + halo) / 8)
    subida = perfil(s / lamina) * (s > -1)
    # a chapa estampada sobe um pouco antes da forma
    C.h[pan] += altura * subida + altura * 0.1 * liso((s + 10) / 10)
    C.pol[pan] += (pol - C.pol[pan]) * liso(s / 2)


def alfa_png(caminho):
    return f32(np.array(Image.open(caminho).convert('RGBA'))[:, :, 3]) / 255


LOGO = alfa_png(ASSETS / 'clube.png')


def logo(C, cx, cy, larg, altura=10.0, lamina=None, pol=0.97, halo=20):
    sd = forma(LOGO, larg=larg)
    traco = larg * 45 / 1478  # espessura do traço do logo
    carimbar(C, sd, cx, cy, altura, lamina or traco * 0.52, pol=pol, halo=halo)


def _texto_alfa(linhas, fonte, corpo, entre=1.0):
    f = ImageFont.truetype(fonte, corpo)
    caixas = [f.getbbox(t) for t in linhas]
    larg = max(c[2] - c[0] for c in caixas) + 80
    alt_l = round(corpo * entre)
    alt = alt_l * len(linhas) + 80 + corpo // 2
    im = Image.new('L', (larg, alt), 0)
    d = ImageDraw.Draw(im)
    for i, (t, c) in enumerate(zip(linhas, caixas)):
        d.text(((larg - (c[2] - c[0])) / 2 - c[0], 40 + i * alt_l), t, font=f, fill=255)
    a = f32(np.array(im)) / 255
    ys, xs = np.nonzero(a > 0.05)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


# ---------- figuras do CLUBE: corpo inflado, rachaduras gravadas, blocos riscados ----------
_cache_fig = {}


def _inflar(sil):
    """Poisson em baixa resolução (como inflar um balão) e sobe de volta."""
    h, w = sil.shape
    k = 6
    m = cv2.resize(sil, (w // k, h // k), interpolation=cv2.INTER_AREA) > 0.5
    m = m.astype(np.float32)
    u = np.zeros_like(m)
    for _ in range(1400):
        p = np.pad(u, 1)
        u = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 1.0) * 0.25 * m
    u = np.sqrt(u / max(u.max(), 1e-6))
    return cv2.GaussianBlur(cv2.resize(u, (w, h), interpolation=cv2.INTER_CUBIC), (0, 0), 3)


def _fig_fonte(letra):
    if letra not in _cache_fig:
        rgba = np.array(Image.open(FIG / f'{letra}-1.png').convert('RGBA'))
        a = f32(rgba[:, :, 3]) / 255
        lum = f32(rgba[:, :, :3].mean(axis=2)) / 255
        bl = f32(np.array(Image.open(FIG / f'{letra}-2.png').convert('RGBA'))[:, :, 3]) / 255
        if bl.shape != a.shape:
            bl = cv2.resize(bl, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
        sil = cv2.morphologyEx(a, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
        _cache_fig[letra] = (a, lum, bl, sil, _inflar(sil))
    return _cache_fig[letra]


def figura(C, letra, cx, cy, alt, volume=20.0, base=5.0, pol=0.94, halo=14, espelhar=False):
    a, lum, bl, sil, dome = _fig_fonte(letra)
    if espelhar:
        a, lum, bl, sil, dome = (np.fliplr(x) for x in (a, lum, bl, sil, dome))
    sd = forma(sil, alt=alt)
    fh, fw = sd.shape
    tw, th = fw - SOBRA * 2, fh - SOBRA * 2

    def sobe(x):
        r = cv2.resize(x, (tw, th), interpolation=cv2.INTER_AREA)
        return cv2.copyMakeBorder(r, SOBRA, SOBRA, SOBRA, SOBRA, cv2.BORDER_CONSTANT, value=0)

    d, lu, blo, al, si = sobe(dome), sobe(lum), sobe(bl), sobe(a), sobe(sil)
    k = alt / 1400
    risco = lu - cv2.GaussianBlur(lu, (0, 0), 7 * k + 1)
    racha = cv2.GaussianBlur(np.clip(si - al, 0, 1), (0, 0), 1.7)
    pan, loc = recorte(sd, cx, cy)
    s, d, blo, risco, racha = sd[loc], d[loc], blo[loc], risco[loc], racha[loc]
    if halo:
        C.h[pan] *= 1 - liso((s + halo) / 8)
        C.pol[pan] *= 1 - liso((s + halo) / 8)
    blo = cv2.GaussianBlur(blo, (0, 0), 0.8)
    corpo = redondo(s / 9) * (base + volume * d)
    C.h[pan] += corpo + (s > 0) * (blo * 1.6 + blo * risco * 4.0 - racha * 2.6)
    C.pol[pan] += (pol * (1 - 0.62 * blo) - C.pol[pan]) * liso(s / 2)


# ---------- peças comuns ----------
TETO = (516.0, F / 2 - 10, 516.0 - 20, F / 2 - 30)
PAREDE = (516.0, (F + H) / 2 + 8, 516.0 - 20, (H - F) / 2 - 28)


def moldura(C, ret, canto=46.0):
    """Dois fios polidos seguindo o recorte. Devolve a distância para dentro da placa, para limitar o fundo."""
    cx, cy, mw, mh = ret
    sd = bilhete(cx, cy, mw, mh, canto)
    C.h *= liso((sd - 40) / 5)
    C.pol *= sd > 42
    fio1, fio2 = filete(sd, 9, 9), filete(sd, 30, 4.5)
    C.h += fio1 * 7 + fio2 * 3.5
    C.pol = np.maximum(C.pol, np.maximum(liso(1 - np.abs(sd - 9) / 9), liso(1 - np.abs(sd - 30) / 4.5)) * 0.95)
    # tachinhas nos quatro cantos
    for sx in (-1, 1):
        for sy in (-1, 1):
            d = np.hypot(xx - (cx + sx * (mw - 8)), yy - (cy + sy * (mh - 8)))
            t = redondo(1 - d / 15) * (d < 15)
            C.h = np.maximum(C.h, t * 11)
            C.pol = np.maximum(C.pol, (d < 15) * 0.97)
    return sd


def parede(C, larg=800):
    """Parede do DJ: fundo girado no torno em volta do logo."""
    C.campo(yy > F, campo_giro(CX, CY))
    C.h[yy > F] = 0
    C.pol[yy > F] = 0.1
    moldura_parede(C)
    logo(C, CX, CY, larg, altura=12)


def moldura_parede(C):
    cx, cy, mw, mh = PAREDE
    sd = bilhete(cx, cy, mw, mh, 40.0)
    m = yy > F
    C.h[m] *= liso((sd[m] - 40) / 5)
    C.pol[m] *= (sd[m] > 42)
    C.h[m] += (filete(sd, 9, 9)[m] * 7 + filete(sd, 30, 4.5)[m] * 3.5)
    C.pol[m] = np.maximum(C.pol[m], np.maximum(liso(1 - np.abs(sd - 9) / 9), liso(1 - np.abs(sd - 30) / 4.5))[m] * 0.95)


def so_teto(C):
    m = yy < F - 2
    C.h *= m
    C.pol *= m


# ---------- composições ----------
def sol():
    """Leque art déco: raios saindo do logo na parede, faixas fosca e espelho, duas figuras e o logo na entrada."""
    C = Chapa('sol')
    dx, dy = xx - CX, yy - CY
    r, a = np.hypot(dx, dy), np.arctan2(dy, dx)
    h = np.zeros((H, W), np.float32)
    pol = np.zeros((H, W), np.float32)
    for r0, r1, n in ((0, 1300, 240), (1300, 2800, 180), (2800, 4250, 144), (4250, 9000, 112)):
        sel = (r >= r0) & (r < r1)
        q = (a + np.pi) / (2 * np.pi) * n
        fr = q - np.floor(q)
        par = np.floor(q).astype(np.int32) % 2 == 0
        dw = np.minimum(fr, 1 - fr) * 2 * np.pi / n * r
        h[sel] = (liso(dw / 9) * par * 3.0)[sel]
        pol[sel] = (par * 0.2)[sel]
    C.h, C.pol = h, pol
    C.campo(np.ones((H, W), bool), campo_raio(CX, CY))
    # anéis que seguram o leque
    for ri in (1300, 2800, 4250):
        anel = np.abs(r - ri)
        C.h[anel < 34] = 0
        C.pol[anel < 34] = 0.1
        C.h += filete(r - ri, -17, 7) * 5 + filete(r - ri, 17, 7) * 5 + filete(r - ri, 0, 3.5) * 2.5
        C.pol = np.maximum(C.pol, liso(1 - np.abs(np.abs(r - ri) - 17) / 7) * 0.95)
    so_teto(C)
    moldura(C, TETO)
    figura(C, 'h', 516, 4190, 1320, volume=24)
    figura(C, 'a', 516, 2240, 1060, volume=20)
    logo(C, 516, 760, 760, altura=11, halo=30)
    parede(C)
    return C


def medalhas():
    """Moedas em fila: aro serrilhado, fundo girado no torno, figura polida em cima. Fundo acetinado limpo entre elas."""
    C = Chapa('medalhas')
    C.pol[:] = 0.04
    so_teto(C)
    sd_teto = moldura(C, TETO)
    r_m = 462
    centros = [(590, 'a'), (1830, 'j'), (3070, 'f'), (4310, 'h')]
    for cy, _ in centros:
        d = np.hypot(xx - 516, yy - cy)
        dentro = d < r_m + 12
        C.h[dentro] = 0
        C.pol[dentro] = 0.06
        C.campo(d < r_m - 62, campo_giro(516, cy))
        a = np.arctan2(yy - cy, xx - 516)
        # aro liso, serrilha e fio interno
        sd = r_m - d
        aro = filete(sd, 15, 15) * 9
        serra = (np.cos(a * 180) * 0.5 + 0.5) * ((sd > 32) & (sd < 54)) * 4.5
        fio = filete(sd, 64, 4) * 4
        C.h += (aro + serra + fio) * (d < r_m + 12)
        C.pol = np.maximum(C.pol, liso(1 - np.abs(sd - 15) / 15) * 0.97)
        C.pol = np.maximum(C.pol, ((sd > 32) & (sd < 54)) * 0.85)
        C.pol = np.maximum(C.pol, liso(1 - np.abs(sd - 64) / 4) * 0.9)
        # fundo da moeda afunda um pouco
        C.h -= liso((sd - 56) / 12) * 3
    for cy, letra in centros:
        figura(C, letra, 516, cy, 2 * (r_m - 92), volume=17, halo=12)
    # entre as moedas: losango e fios
    for y in (1210, 2450, 3690):
        sd = 1 - (np.abs(xx - 516) / 74 + np.abs(yy - y) / 74)
        C.h += redondo(sd * 3) * (sd > 0) * 7
        C.pol = np.maximum(C.pol, (sd > 0) * 0.95)
        for sx in (-1, 1):
            C.h += filete(yy - y, 0, 3.5) * 3 * ((sx * (xx - 516) > 96) & (sx * (xx - 516) < 420))
            C.pol = np.maximum(C.pol, liso(1 - np.abs(yy - y) / 3.5) * ((sx * (xx - 516) > 96) & (sx * (xx - 516) < 420)) * 0.9)
    parede(C)
    return C


def matelasse():
    """Chapa capitonada, com tachinha polida em cada cruzamento. Uma placa com o logo e uma figura grande."""
    C = Chapa('matelasse')
    A, B = 172.0, 258.0
    u, v = xx / A + yy / B, xx / A - yy / B
    su, sv = np.abs(np.sin(np.pi * u)), np.abs(np.sin(np.pi * v))
    C.h = f32((su * sv) ** 0.55) * 11
    C.pol[:] = 0.3
    # tachinhas nos cruzamentos
    ui, vi = np.round(u), np.round(v)
    px, py = (ui + vi) * A / 2, (ui - vi) * B / 2
    d = np.hypot(xx - px, yy - py)
    t = (d < 12)
    C.h = np.where(t, np.maximum(C.h, redondo(1 - d / 12) * 8), C.h)
    C.pol = np.where(t, 0.97, C.pol)
    # escova em diagonal, acompanhando o capitonê
    C.campo(np.ones((H, W), bool), campo_linear(np.degrees(np.arctan2(B, A))))
    so_teto(C)
    moldura(C, TETO)
    # placa do logo
    cx, cy, mw, mh = 516.0, 1370.0, 440.0, 250.0
    sd = bilhete(cx, cy, mw, mh, 38.0)
    C.h *= 1 - liso((sd + 26) / 10)
    C.pol *= 1 - liso((sd + 26) / 10)
    C.h += liso(sd / 7) * 5
    C.pol += (0.1 - C.pol) * (sd > 0)
    C.campo(sd > 0, campo_linear(0))
    C.h += filete(sd, 14, 5) * 3.5
    C.pol = np.maximum(C.pol, liso(1 - np.abs(sd - 14) / 5) * 0.95)
    logo(C, cx, cy, 700, altura=11, halo=0)
    figura(C, 'j', 516, 3420, 1220, volume=24, halo=20)
    parede(C)
    return C


def festa():
    """Convite gravado: soft opening, Millos Kaiser, Pista Quente, 07.11."""
    C = Chapa('festa')
    C.pol[:] = 0.03
    so_teto(C)
    moldura(C, TETO)
    # fios finos que abrem e fecham o texto
    for y, m in ((420, 300), (2720, 300)):
        C.h += filete(yy - y, 0, 3.5) * 3 * (np.abs(xx - 516) < m)
        C.pol = np.maximum(C.pol, liso(1 - np.abs(yy - y) / 3.5) * (np.abs(xx - 516) < m) * 0.9)
    sc = _texto_alfa(['soft opening'], MYTHSHIRE, 260)
    carimbar(C, forma(sc, larg=930), 516, 780, 7, 8, pol=0.97, halo=0, perfil=redondo, engrossar=4)
    nome = _texto_alfa(['Millos', 'Kaiser'], ARCHIVO, 300, 0.95)
    carimbar(C, forma(nome, larg=880), 516, 1560, 14, 21, pol=0.97, halo=0, engrossar=7)
    data = _texto_alfa(['07.11'], ARCHIVO, 300)
    carimbar(C, forma(data, larg=430), 516, 2390, 9, 13, pol=0.97, halo=0, engrossar=4)
    tit = alfa_png(AQUI.parent / 'pista-quente' / 'originais' / 'Titulo PB.png')
    ys, xs = np.nonzero(tit > 0.05)
    tit = tit[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    carimbar(C, forma(tit, larg=840), 516, 3180, 15, 13, pol=0.9, halo=0, perfil=redondo)
    figura(C, 'h', 516, 4240, 1220, volume=22, halo=10)
    parede(C)
    return C


# ---------- latão minimalista: chapa quase vazia, relevo baixo e redondo, corrosão leve ----------
def _manchas(sigmas, pesos, semente):
    g = np.random.default_rng(semente)
    total = np.zeros((H // 2, W // 2), np.float32)
    for sg, peso in zip(sigmas, pesos):
        x = cv2.GaussianBlur(f32(g.standard_normal((H // 2, W // 2))), (0, 0), sg)
        total += peso * x / x.std()
    return total / total.std()


def patina(C):
    """A corrosão mancha a chapa de leve, junta nas reentrâncias e na volta do relevo, e gasta onde o relevo sobe."""
    hm = cv2.resize(C.h, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    # manchado contínuo e fraco: nada de borrão isolado, que lê como sujeira
    manchas = np.clip(0.42 + _manchas((60, 18, 6, 2), (1, 0.6, 0.5, 0.35), 21) * 0.2, 0, 1)
    g = np.random.default_rng(22)
    poros = cv2.GaussianBlur(f32(g.random((H // 2, W // 2)) > 0.9988), (0, 0), 0.7) * 3
    poros = np.clip(poros, 0, 1)
    volta = np.clip(np.maximum(cv2.GaussianBlur(hm, (0, 0), 8) - hm, 0) * 0.16, 0, 0.35)
    alto = np.clip(hm / 4.5, 0, 1)
    # a borda da chapa oxida primeiro
    borda = np.exp(-np.minimum(np.minimum(x2, W - x2), np.minimum(y2, H - y2)) / 70) * 0.3
    C.cor = np.clip(manchas * 0.5 + poros * 0.3 + volta + borda, 0, 1) * (1 - 0.8 * alto)
    # a texturinha do metal: ondulação larga de chapa batida à mão e um grão fino, os dois bem de leve
    larga = _manchas((80, 30), (1, 0.35), 23)
    grao = _manchas((1.4, 4), (1, 0.6), 24)
    micro = cv2.resize(larga * 0.3 + grao * 0.04, (W, H), interpolation=cv2.INTER_CUBIC)
    furo = cv2.resize(poros, (W, H), interpolation=cv2.INTER_CUBIC)
    C.h += micro - furo * 0.45


def fio_fundo(C, ret, pos=44.0):
    """Um único fio rebaixado acompanhando a chapa."""
    cx, cy, mw, mh = ret
    C.h -= filete(caixa(cx, cy, mw, mh), pos, 3.2) * 2.0


def logo_min(C, cx, cy, larg, altura=5.5):
    carimbar(C, forma(LOGO, larg=larg), cx, cy, altura, larg * 45 / 1478 * 0.62, pol=0.5, halo=0, perfil=redondo)


def figura_min(C, letra, cx, cy, alt, volume=11.0):
    """Só a silhueta, sem rachadura nem bloco riscado."""
    _a, _l, _b, sil, dome = _fig_fonte(letra)
    # contorno mais macio: tira os calombos pequenos e deixa os degraus de pixel, que são da marca
    sd = cv2.GaussianBlur(forma(sil, alt=alt), (0, 0), 3.5)
    fh, fw = sd.shape
    d = cv2.resize(dome, (fw - SOBRA * 2, fh - SOBRA * 2), interpolation=cv2.INTER_AREA)
    d = cv2.copyMakeBorder(d, SOBRA, SOBRA, SOBRA, SOBRA, cv2.BORDER_CONSTANT, value=0)
    pan, loc = recorte(sd, cx, cy)
    s, d = sd[loc], d[loc]
    C.h[pan] += redondo(s / 11) * (2.5 + volume * d)
    C.pol[pan] += (0.46 - C.pol[pan]) * liso(s / 2)


def _latao(nome):
    C = Chapa(nome)
    fio_fundo(C, TETO)
    fio_fundo(C, PAREDE, 34.0)
    logo_min(C, CX, CY, 620)
    return C


def latao_logo():
    C = _latao('latao-logo')
    logo_min(C, 516, 3350, 700)
    patina(C)
    return C


def latao_figura():
    C = _latao('latao-figura')
    figura_min(C, 'h', 516, 4120, 1180)
    patina(C)
    return C


def latao_disco():
    C = _latao('latao-disco')
    cy = 3640
    C.h += filete(np.hypot(xx - 516, yy - cy) - 420, 0, 6) * 3.6
    logo_min(C, 516, cy, 480, altura=4.5)
    patina(C)
    return C


def latao_festa():
    """O convite no latão: mesmo relevo baixo do logo."""
    C = _latao('latao-festa')
    nome = _texto_alfa(['Millos', 'Kaiser'], ARCHIVO, 300, 0.95)
    carimbar(C, forma(nome, larg=760), 516, 1500, 5.5, 14, pol=0.5, halo=0, perfil=redondo, engrossar=4)
    tit = alfa_png(AQUI.parent / 'pista-quente' / 'originais' / 'Titulo PB.png')
    ys, xs = np.nonzero(tit > 0.05)
    tit = tit[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    carimbar(C, forma(tit, larg=780), 516, 3300, 5.5, 11, pol=0.5, halo=0, perfil=redondo)
    patina(C)
    return C


COMPOSICOES = {'sol': sol, 'medalhas': medalhas, 'matelasse': matelasse, 'festa': festa}
MINIMAS = {'latao-logo': latao_logo, 'latao-figura': latao_figura, 'latao-disco': latao_disco, 'latao-festa': latao_festa}


def main():
    todas = {**COMPOSICOES, **MINIMAS}
    for nome in sys.argv[1:] or list(todas):
        todas[nome]().gravar()
    (SAIDA / 'dados.json').write_text(json.dumps(dict(largura=W, altura=H, composicoes=list(COMPOSICOES), minimas=list(MINIMAS)), ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
