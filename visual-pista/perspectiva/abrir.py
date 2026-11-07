"""Versão controlada de "o LED se abre", montada no próprio painel (1032x5676).

    .venv\\Scripts\\python.exe abrir.py <voo-do-h3.mp4> [--horizonte 1550] [--zoom 1.0] [--saida nome] [--quadros 40,90,150]

1. Conteúdo chapado: a figura a-1 vista da pista, igual à guia-figura.jpg, mas tirada do PNG em resolução cheia.
2. Os módulos do LED (86 px = 16 cm) se partem a partir da dobra, giram como lâminas e caem para dentro do teto e da
   parede. A queda é calculada na perspectiva de quem está na pista: um módulo empurrado para trás do plano aparece no
   painel encolhendo em direção ao ponto que fica bem em cima (teto) ou bem na frente (parede) da câmera da foto.
3. Atrás, o voo pelo universo do CLUBE (H3, só o universo, sem a sala) entra como por uma janela: cada pixel do painel
   pega a cor na direção em que é visto da pista. A câmera do H3 olha para cima; --horizonte é a altura do horizonte
   no vídeo (px) e acerta essa inclinação. O teto da entrada, fora do vídeo, continua a borda de cima do vídeo,
   desfocada, com partículas prateadas em 3D passando por cima da pista.
4. Os módulos voltam da entrada para a dobra e travam com um brilho; o vídeo termina na figura chapada (loop).

Sai em saidas\\: <nome>-painel.mp4 (H.264 1032x5676, para o MadMapper), <nome>-sala.mp4 (simulação vista da pista, com o
som do H3) e <nome>-previa.mp4 (simulação ao lado do painel). --quadros só grava esses quadros em PNG, para conferir.
"""
import argparse
import os
import subprocess
import sys

import cv2
import numpy as np

import geometria as g
from desdobrar import Esticar, FFMPEG, mapas

AQUI = os.path.dirname(os.path.abspath(__file__))
FIGURA = r'C:\apps\visual-pista\assets\figuras\a-1.png'
C = g.CAM
H, ZF = C['h'], C['zf']
CX_FOTO = g.BORDA_ESQ[0] * C['cy'] + g.BORDA_ESQ[1]      # a borda esquerda passa pelo ponto de fuga
XL = (g.U_PAREDE[0] - CX_FOTO) / C['k']                   # borda esquerda do LED, em metros (câmera em x = 0)
F_GUIA = C['f'] * g.ESCALA_GUIA                           # distância focal da guia, em px

T = 86                                                    # módulo de 16 cm
NL, NC = g.ALT // T, g.LARG // T                          # 66 x 12
ZEN = (g.DOBRA - ZF / g.PASSO, -XL / g.PASSO)             # (linha, coluna) do teto bem em cima da câmera
FRENTE = (g.DOBRA + H / g.PASSO, -XL / g.PASSO)           # ... e da parede bem na frente dela

# tempos (s)
T_ABRE, ONDA, GIRO, ACASO = 1.5, 2.0, 0.9, 0.12
FIM_PLANO = 1.0                                           # figura parada depois de fechar
BRILHO = (0.2, 1.2)                                       # reflexo passando na figura, no começo


def suave(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# ---------- conteúdo chapado ----------

def chapado():
    """Painel com a figura a-1 do jeito que aparece na guia-figura, em resolução cheia, e a máscara da figura."""
    guia = cv2.imread(os.path.join(AQUI, 'guia-h3.jpg'))
    mx, my, r_ref = mapas(np.array([[1.0, 0, 0], [0, 1.0, 0]]), g.GUIA[0], g.GUIA[1])
    fundo = Esticar(r_ref).aplicar(cv2.remap(guia, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE))

    fig = cv2.imread(FIGURA, cv2.IMREAD_UNCHANGED).astype(np.float32)
    fig = cv2.GaussianBlur(fig, (0, 0), 0.6)
    alt_fig = 930                                          # como em guia.py
    larg_fig = round(fig.shape[1] * alt_fig / fig.shape[0])
    fx0, fy0 = 740 - larg_fig // 2, 12
    lin, col = np.mgrid[0:g.ALT, 0:g.LARG].astype(np.float64)
    gu, gv = g.painel_para_guia(lin, col)
    px = ((gu - fx0 + 0.5) * fig.shape[1] / larg_fig - 0.5).astype(np.float32)
    py = ((gv - fy0 + 0.5) * fig.shape[0] / alt_fig - 0.5).astype(np.float32)
    px, py = np.nan_to_num(px, nan=-10), np.nan_to_num(py, nan=-10)
    f = cv2.remap(fig, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = f[..., 3:4] / 255
    painel = f[..., :3] * 0.92 * a + fundo.astype(np.float32) * (1 - a)
    faixa = np.nan_to_num(gu * 0.45 + gv * 0.9, nan=-1e4).astype(np.float32)   # para o reflexo diagonal
    return painel, a[..., 0], faixa


# ---------- universo (janela) ----------

def raios():
    """Direção (x, y, z) em que cada pixel do painel é visto da câmera da foto, em metros (modelo métrico)."""
    lin, col = np.mgrid[0:g.ALT, 0:g.LARG].astype(np.float64) + 0.5
    X = XL + col * g.PASSO
    teto = lin < g.DOBRA
    Y = np.where(teto, H, H - (lin - g.DOBRA) * g.PASSO)
    Z = np.where(teto, ZF - (g.DOBRA - lin) * g.PASSO, ZF)
    return X, Y, Z


def mapa_universo(qw, qh, horizonte, zoom):
    X, Y, Z = raios()
    f = F_GUIA * zoom * qw / g.GUIA[0]
    a = np.arctan((horizonte - qh / 2) / f)                # a câmera do H3 olha para cima
    yc = Y * np.cos(a) - Z * np.sin(a)
    zc = Y * np.sin(a) + Z * np.cos(a)
    with np.errstate(divide='ignore', invalid='ignore'):
        u = np.where(zc > 0.05, qw / 2 + f * X / zc, np.nan)
        v = np.where(zc > 0.05, qh / 2 - f * yc / zc, np.nan)
    fora = ~np.isfinite(v) | (v < 2)
    r_ref = int(np.max(np.where(fora.any(1))[0])) + 1 + 24 if fora.any() else 0
    u = np.nan_to_num(u, nan=0)
    u = np.where(u < 0, -u, u)                             # dos lados: espelha (não vira rastro)
    u = np.where(u > qw - 1, 2 * (qw - 1) - u, u)
    u = np.clip(u, 0, qw - 1.001)
    v = np.clip(np.nan_to_num(v, nan=0), 0, qh - 1.001)
    return u.astype(np.float32), v.astype(np.float32), r_ref


def medir_olho(clipe):
    """Elipse do horizonte num voo em olho de peixe (câmera para cima): a borda de areia clara na mediana dos quadros.
    Devolve (cx, cy, eixo_a, eixo_b, ângulo) como cv2.fitEllipse; sem borda visível, um círculo que toca os lados."""
    qh, qw = clipe[0].shape[:2]
    med = np.median(np.stack(clipe[::3]), 0).astype(np.uint8)
    hsv = cv2.cvtColor(med, cv2.COLOR_BGR2HSV).astype(int)
    areia = cv2.morphologyEx(((hsv[..., 1] < 80) & (hsv[..., 2] > 140)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    pts = []
    for y in range(8, qh - 8, max(qh // 110, 4)):
        lin = areia[y] > 0
        if lin[0]:
            pts.append((np.argmax(~lin), y))
        if lin[-1]:
            pts.append((qw - 1 - np.argmax(~lin[::-1]), y))
    if len(pts) < 20:
        return (qw / 2, qh / 2, qw, qw, 0.0), None
    p = np.array(pts, np.float32)
    for _ in range(4):
        (ex, ey), (ea, eb), ang = cv2.fitEllipse(p)
        t = np.radians(ang)
        dx, dy = p[:, 0] - ex, p[:, 1] - ey
        r = (np.hypot((dx * np.cos(t) + dy * np.sin(t)) / (ea / 2), (-dx * np.sin(t) + dy * np.cos(t)) / (eb / 2)) - 1) * (ea + eb) / 4
        rms = float(np.sqrt((r ** 2).mean()))
        p = p[np.abs(r) < max(2.5 * rms, 4)]
    return (ex, ey, ea, eb, ang), rms


def mapa_olho(qw, qh, elipse, ponto=0.0, frente=1):
    """Painel inteiro a partir de um voo em olho de peixe olhando para cima (equidistante: o ângulo a partir do zênite
    cresce em linha reta até o horizonte, na borda da elipse). A frente (DJ) fica no lado direito do quadro (frente=1)
    ou no esquerdo (-1). ponto = metros que o ponto da ilusão anda da foto para a entrada."""
    ex, ey, ea, eb, ang = elipse
    t = np.radians(ang)
    M = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]]) @ np.diag([ea / 2, eb / 2])
    d0 = np.linalg.solve(M, [frente, 0])
    a0 = np.arctan2(d0[1], d0[0])                          # ângulo no círculo que cai na frente do quadro
    X, Y, Z = raios()
    Z = Z + ponto
    rho = np.arctan2(np.hypot(X, Z), Y) / (np.pi / 2)
    al = a0 + np.arctan2(X, Z)
    u = ex + rho * (M[0, 0] * np.cos(al) + M[0, 1] * np.sin(al))
    v = ey + rho * (M[1, 0] * np.cos(al) + M[1, 1] * np.sin(al))
    return np.clip(u, 0, qw - 1.001).astype(np.float32), np.clip(v, 0, qh - 1.001).astype(np.float32)


def vista_sintetica(painel, inclina, z0, lado=560, fov=100):
    """O painel visto de um ponto da pista (z0 metros em relação à foto; negativo = para a entrada), a ~1 m do chão,
    olhando para o DJ inclinado 'inclina' graus para cima. Fora do LED: sala escura."""
    f = lado / 2 / np.tan(np.radians(fov / 2))
    y, x = np.mgrid[0:lado, 0:lado].astype(np.float64)
    d = np.stack([(x + 0.5 - lado / 2) / f, -(y + 0.5 - lado / 2) / f, np.ones_like(x)], -1)
    r = np.radians(inclina)
    d = d @ np.array([[1, 0, 0], [0, np.cos(r), np.sin(r)], [0, -np.sin(r), np.cos(r)]]).T
    dx, dy, dz = d[..., 0], d[..., 1], d[..., 2]
    with np.errstate(divide='ignore', invalid='ignore', over='ignore'):
        tt = np.where(dy > 1e-6, H / dy, np.inf)
        Xc, Zc = dx * tt, z0 + dz * tt
        lin = np.where(Zc <= ZF, g.DOBRA - (ZF - Zc) / g.PASSO, np.nan)
        tw = np.where(dz > 1e-6, (ZF - z0) / dz, np.inf)
        Yw, Xw = dy * tw, dx * tw
        par = ~(Zc <= ZF) & (Yw >= H - 1.28) & (Yw <= H)
        lin = np.where(par, g.DOBRA + (H - Yw) / g.PASSO, lin)
        col = (np.where(par, Xw, Xc) - XL) / g.PASSO
    ok = np.isfinite(lin) & (lin >= 0) & (lin < g.ALT) & (col >= 0) & (col < g.LARG)
    im = cv2.remap(painel, np.where(ok, col - 0.5, 0).astype(np.float32), np.where(ok, lin - 0.5, 0).astype(np.float32), cv2.INTER_LINEAR)
    im[~ok] = (28, 22, 24)
    im[~ok & (dy < 0)] = (20, 20, 60)
    return im


class Particulas:
    """Pontos prateados em 3D acima do teto, vindo do fundo para a entrada (o mesmo sentido do voo)."""

    def __init__(self, n=2600, vel=3.0, semente=7):
        r = np.random.default_rng(semente)
        self.y = H + r.uniform(0.4, 12, n)
        self.zmin = -5.2 * self.y / H                       # passou da entrada
        self.zmax = ZF * self.y / H * 1.05                  # depois disso o raio bate na parede
        self.z = r.uniform(self.zmin, self.zmax)
        self.x = r.uniform(XL - 0.2, -XL + 0.2, n) * self.y / H
        self.tam = r.uniform(0.018, 0.05, n)
        self.fase = r.uniform(0, 2 * np.pi, n)
        self.cor = np.where(r.random(n) < 0.18, 1, 0)       # alguns violeta
        self.vel = vel

    def desenhar(self, t, camada):
        z = self.z - self.vel * t
        z = self.zmin + np.mod(z - self.zmin, self.zmax - self.zmin)
        s = H / self.y
        lin = g.DOBRA - (ZF - z * s) / g.PASSO
        col = (self.x * s - XL) / g.PASSO
        lado = np.maximum(self.tam * s / g.PASSO, 1.0)
        brilho = (0.35 + 0.65 * s) * (0.75 + 0.25 * np.sin(t * 5 + self.fase))
        ok = (lin > -lado) & (lin < g.DOBRA) & (col > -lado) & (col < g.LARG + lado)
        for i in np.flatnonzero(ok):
            b = brilho[i] * 255
            cor = (b, b * 0.55, b * 0.85) if self.cor[i] else (b * 0.95, b * 0.95, b)
            h = lado[i] / 2
            cv2.rectangle(camada, (int(round(col[i] - h)), int(round(lin[i] - h))),
                          (int(round(col[i] + h)), int(round(lin[i] + h))), cor, -1)


# ---------- módulos ----------

class Modulos:
    def __init__(self, total_s, semente=3):
        r = np.random.default_rng(semente)
        li, ci = np.mgrid[0:NL, 0:NC]
        self.rc = (li + 0.5) * T
        self.cc = (ci + 0.5) * T
        self.teto = (li * T) < g.DOBRA
        d = np.hypot(self.rc - g.DOBRA, self.cc - g.LARG / 2)
        d = d / d.max()
        self.eixo_h = r.random(d.shape) < 0.7               # gira em torno do eixo de lado a lado (como persiana)
        self.ini_abre = T_ABRE + ACASO + ONDA * d ** 0.6 + r.uniform(-ACASO, ACASO, d.shape)
        self.t_fecha = total_s - FIM_PLANO - (ONDA + GIRO + 2 * ACASO)
        self.ini_fecha = self.t_fecha + ACASO + ONDA * (1 - d ** 0.6) + r.uniform(-ACASO, ACASO, d.shape)
        self.trava = self.ini_fecha + GIRO

    def progresso(self, t):
        if t < self.t_fecha:
            return np.clip((t - self.ini_abre) / GIRO, 0, 1)
        return 1 - np.clip((t - self.ini_fecha) / GIRO, 0, 1)

    def ganho(self, t):
        """Brilho de quando o módulo trava de volta."""
        dt = t - self.trava
        return 1 + np.where((t >= self.t_fecha) & (dt >= 0), 0.55 * np.exp(-dt / 0.12), 0)


def desenhar_modulo(tela, textura, rc, cc, teto, eixo_h, p, ganho):
    rach = suave(p / 0.12)
    q = np.clip((p - 0.12) / 0.88, 0, 1)
    c = 1 - 0.07 * rach                                      # a junta abre e mostra o universo
    d = 0.03 * rach + 5.0 * q * q                            # metros para dentro do teto / da parede
    th = np.pi / 2 * 0.96 * suave(q)
    alfa = 1 - suave((q - 0.6) / 0.4)
    if alfa <= 0.003:
        return
    if teto:
        s = H / (H + d)
        r0, c0 = ZEN
    else:
        s = ZF / (ZF + d)
        r0, c0 = FRENTE
    rc2, cc2 = r0 + s * (rc - r0), c0 + s * (cc - c0)
    esp = 3 * s                                              # espessura da lâmina, em px
    lado = T * c * s
    alt = max(lado * (np.cos(th) if eixo_h else 1), esp)
    larg = max(lado * (1 if eixo_h else np.cos(th)), esp)
    luz = 0.3 + 0.7 * np.cos(th)
    reflexo = 0.9 * np.exp(-((th - 0.75) / 0.22) ** 2)
    fino = np.clip(1 - (lado * np.cos(th)) / (esp * 1.5), 0, 1)   # quase de lado: aparece a borda prateada
    tex = textura * (luz * ganho) + 235 * reflexo * 0.6
    tex = tex * (1 - fino) + np.array([215, 210, 220], np.float32) * fino
    y0, y1 = int(np.floor(rc2 - alt / 2)) - 1, int(np.ceil(rc2 + alt / 2)) + 1
    x0, x1 = int(np.floor(cc2 - larg / 2)) - 1, int(np.ceil(cc2 + larg / 2)) + 1
    Y0, Y1, X0, X1 = max(y0, 0), min(y1, g.ALT), max(x0, 0), min(x1, g.LARG)
    if Y1 <= Y0 or X1 <= X0:
        return
    # reduz primeiro (sem serrilhado) e depois posiciona com fração de pixel
    pw, ph = max(int(np.ceil(larg)), 1), max(int(np.ceil(alt)), 1)
    peq = cv2.resize(tex, (pw, ph), interpolation=cv2.INTER_AREA)
    peq = np.dstack([peq, np.full((ph, pw), 255, np.float32)])
    peq = cv2.copyMakeBorder(peq, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    M = np.array([[larg / pw, 0, cc2 - larg / 2 - (larg / pw) - X0 + (larg / pw) * 0.5 - 0.5],
                  [0, alt / ph, rc2 - alt / 2 - (alt / ph) - Y0 + (alt / ph) * 0.5 - 0.5]], np.float32)
    w = cv2.warpAffine(peq, M, (X1 - X0, Y1 - Y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a = w[..., 3:4] / 255 * alfa
    roi = tela[Y0:Y1, X0:X1]
    roi[:] = w[..., :3] * a + roi * (1 - a)


# ---------- vista da pista (simulação) ----------

def mapa_sala():
    gy, gx = np.mgrid[0:g.GUIA[1], 0:g.GUIA[0]].astype(np.float64)
    u = (gx + 0.5) / g.ESCALA_GUIA + g.CORTE[0]
    v = (gy + 0.5) / g.ESCALA_GUIA + g.CORTE[1]
    lin, col = g.foto_para_painel(u, v)
    led = np.isfinite(lin) & ~((lin >= g.DOBRA) & (v >= g.CABINE_V))
    led = cv2.GaussianBlur(led.astype(np.float32), (0, 0), 0.7)[..., None]
    return np.nan_to_num(col, nan=0).astype(np.float32), np.nan_to_num(lin, nan=0).astype(np.float32), led


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--horizonte', type=float, default=1550, help='altura do horizonte no vídeo do H3, em px')
    ap.add_argument('--zoom', type=float, default=1.0, help='>1 aproxima o universo')
    ap.add_argument('--vel', type=float, default=3.0, help='velocidade das partículas (m/s)')
    ap.add_argument('--lente', choices=['janela', 'olho'], default='janela',
                    help='janela = voo olhando para a frente (cobre o lado do DJ); olho = olho de peixe para cima (painel inteiro)')
    ap.add_argument('--elipse', default=None, help='olho: cx,cy,eixo_a,eixo_b,ângulo do horizonte (padrão: medido no vídeo)')
    ap.add_argument('--ponto', type=float, default=0.0, help='olho: metros que o ponto da ilusão anda da foto para a entrada')
    ap.add_argument('--frente', choices=['direita', 'esquerda'], default='direita', help='olho: lado do quadro que é a frente (DJ)')
    ap.add_argument('--saida', default='h3-abrir-2')
    ap.add_argument('--quadros', default=None, help='só grava estes quadros (lista) em PNG')
    a = ap.parse_args()

    pasta = os.path.join(AQUI, 'saidas')
    os.makedirs(pasta, exist_ok=True)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    qw, qh = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    clipe = []
    while True:
        ok, q = cap.read()
        if not ok:
            break
        clipe.append(q)
    cap.release()
    n0 = int(round(T_ABRE * fps))
    total = n0 + len(clipe) + int(round(FIM_PLANO * fps))
    print(f'voo {qw}x{qh}, {len(clipe)} quadros; painel {total} quadros ({total / fps:.2f} s)')

    plano, fig_a, faixa = chapado()
    if a.lente == 'olho':
        if a.elipse:
            elipse, rms = tuple(float(x) for x in a.elipse.split(',')), None
        else:
            elipse, rms = medir_olho(clipe)
        mu, mv = mapa_olho(qw, qh, elipse, a.ponto, 1 if a.frente == 'direita' else -1)
        r_ref = 0
        print('olho de peixe: horizonte em elipse centro (%.1f, %.1f), eixos %.1f x %.1f, %.1f°' % elipse +
              (f' (medida, rms {rms:.1f} px)' if rms is not None else '') + f'; ponto da ilusão {a.ponto:+.1f} m')
    else:
        mu, mv, r_ref = mapa_universo(qw, qh, a.horizonte, a.zoom)
    if r_ref:
        # céu da entrada: a cor do alto do vídeo (mediana no tempo e na largura, sem as pedras que passam), escurecendo
        # para a entrada; o vídeo se apaga nela ao longo de ENTRA linhas, e o que sai por cima do quadro some suave
        amostras = np.stack([cv2.remap(q, mu[r_ref:r_ref + 1], mv[r_ref:r_ref + 1], cv2.INTER_LINEAR) for q in clipe[::6]])
        linha_ceu = np.median(amostras.reshape(-1, 3), 0).astype(np.float32)[None, None]
        escurece = (0.55 + 0.45 * suave(np.arange(r_ref) / max(r_ref, 1)))[:, None, None].astype(np.float32)
        ceu = np.broadcast_to(linha_ceu * escurece, (r_ref, g.LARG, 3))
        ENTRA = 320
        w_ent = suave((np.arange(ENTRA) + 0.5) / ENTRA)[:, None, None].astype(np.float32)
        print(f'universo: linhas {r_ref}–{g.ALT - 1} vêm do vídeo; 0–{r_ref - 1} são o céu parado com partículas')
        linhas = np.arange(g.ALT, dtype=np.float32)
        apagar = np.clip(1 - (linhas - (r_ref - 300)) / 900, 0.15, 1)              # partículas somem no vídeo
        apagar[g.DOBRA:] = 0
        apagar = apagar[:, None, None]
        part = Particulas(vel=a.vel)
    mods = Modulos(total / fps)
    sx, sy, led = mapa_sala()
    sala = cv2.imread(os.path.join(AQUI, 'guia-h3.jpg')).astype(np.float32)
    s_min, s_max = np.nanmin(np.where(fig_a > 0.05, faixa, np.nan)), np.nanmax(np.where(fig_a > 0.05, faixa, np.nan))

    def quadro(i):
        t = i / fps
        p = mods.progresso(t)
        ganho = mods.ganho(t)
        textura = plano
        if BRILHO[0] <= t <= BRILHO[1]:
            pos = s_min - 300 + (s_max - s_min + 600) * (t - BRILHO[0]) / (BRILHO[1] - BRILHO[0])
            b = np.exp(-((faixa - pos) / 90) ** 2) * fig_a * 0.55
            textura = plano + (255 - plano) * b[..., None]
        if (p == 0).all():
            tela = textura * np.repeat(np.repeat(ganho, T, 0), T, 1)[..., None]
            return np.clip(tela, 0, 255).astype(np.uint8)
        k = int(np.clip(i - n0, 0, len(clipe) - 1))
        uni = cv2.remap(clipe[k], mu, mv, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        tela = uni
        if r_ref:
            uni[:r_ref] = ceu
            uni[r_ref:r_ref + ENTRA] = linha_ceu * (1 - w_ent) + uni[r_ref:r_ref + ENTRA] * w_ent
            camada = np.zeros((g.ALT, g.LARG, 3), np.uint8)
            part.desenhar(t, camada)
            tela = uni + camada.astype(np.float32) * apagar
        fechado = np.repeat(np.repeat(p == 0, T, 0), T, 1)
        g_px = np.repeat(np.repeat(ganho, T, 0), T, 1)[..., None]
        tela = np.where(fechado[..., None], textura * g_px, tela)
        ativos = np.argwhere((p > 0) & (p < 1))
        prof = [0.03 * suave(p[l, c] / 0.12) + 5 * np.clip((p[l, c] - 0.12) / 0.88, 0, 1) ** 2 for l, c in ativos]
        for j in np.argsort(prof)[::-1]:                                         # o mais fundo primeiro
            l, c = ativos[j]
            desenhar_modulo(tela, textura[l * T:(l + 1) * T, c * T:(c + 1) * T], mods.rc[l, c], mods.cc[l, c],
                            mods.teto[l, c], mods.eixo_h[l, c], p[l, c], ganho[l, c])
        return np.clip(tela, 0, 255).astype(np.uint8)

    def vista(painel):
        v = cv2.remap(painel, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        return np.clip(v * led + sala * (1 - led), 0, 255).astype(np.uint8)

    if a.quadros:
        for i in [int(x) for x in a.quadros.split(',')]:
            pn = quadro(i)
            cv2.imwrite(os.path.join(pasta, f'{a.saida}-q{i:03d}-sala.jpg'), vista(pn), [cv2.IMWRITE_JPEG_QUALITY, 92])
            cv2.imwrite(os.path.join(pasta, f'{a.saida}-q{i:03d}-painel.jpg'), cv2.resize(pn, (g.LARG // 3, g.ALT // 3), interpolation=cv2.INTER_AREA))
            vistas = []
            for inc, z0, nome in ((12, 0, 'meio: olhando o DJ'), (60, 0, 'meio: para cima'), (8, -4.4, 'fim: olhando o DJ'), (55, -4.4, 'fim: para cima')):
                v = vista_sintetica(pn, inc, z0)
                cv2.putText(v, nome, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
                vistas.append(np.pad(v, ((0, 0), (0, 8), (0, 0))))
            cv2.imwrite(os.path.join(pasta, f'{a.saida}-q{i:03d}-vistas.jpg'), np.hstack(vistas), [cv2.IMWRITE_JPEG_QUALITY, 90])
            print(f'quadro {i} ({i / fps:.2f} s)')
        return 0

    def x264(caminho, w, h, crf, preset):
        return subprocess.Popen([FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}',
                                 '-r', f'{fps}', '-i', '-', '-c:v', 'libx264', '-preset', preset, '-crf', str(crf),
                                 '-pix_fmt', 'yuv420p', '-movflags', '+faststart', caminho], stdin=subprocess.PIPE)

    s_painel = os.path.join(pasta, f'{a.saida}-painel.mp4')
    s_sala = os.path.join(pasta, f'{a.saida}-sala-mudo.mp4')
    s_prev = os.path.join(pasta, f'{a.saida}-previa-mudo.mp4')
    alt_prev = 1280
    larg_v = int(round(g.GUIA[0] * alt_prev / g.GUIA[1] / 2)) * 2
    larg_p = int(round(g.LARG * alt_prev / g.ALT / 2)) * 2
    enc = x264(s_painel, g.LARG, g.ALT, 16, 'slow')
    sal = x264(s_sala, 1080, 1440, 18, 'medium')
    prev = x264(s_prev, larg_v + 24 + larg_p, alt_prev, 20, 'medium')
    for i in range(total):
        pn = quadro(i)
        enc.stdin.write(pn.tobytes())
        vs = vista(pn)
        sal.stdin.write(cv2.resize(vs, (1080, 1440), interpolation=cv2.INTER_AREA).tobytes())
        lado = np.zeros((alt_prev, larg_v + 24 + larg_p, 3), np.uint8)
        lado[:, :larg_v] = cv2.resize(vs, (larg_v, alt_prev), interpolation=cv2.INTER_AREA)
        lado[:, larg_v + 24:] = cv2.resize(pn, (larg_p, alt_prev), interpolation=cv2.INTER_AREA)
        prev.stdin.write(lado.tobytes())
        if i % 12 == 0:
            print(f'  {i}/{total}', end='\r', flush=True)
    for pr in (enc, sal, prev):
        pr.stdin.close()
        pr.wait()
    # som do H3 na simulação, entrando junto com a abertura
    atraso = int(T_ABRE * 1000)
    for mudo in (s_sala, s_prev):
        final = mudo.replace('-mudo', '')
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', mudo, '-i', a.video, '-map', '0:v', '-map', '1:a?',
                        '-af', f'adelay={atraso}|{atraso},apad', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        final], check=True)
        os.remove(mudo)
    print(f'\npronto: {s_painel}')
    return 0 if enc.returncode == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
