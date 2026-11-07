"""Desdobra um vídeo gerado a partir da guia (a pista vista da pista) no vídeo do painel, 1032x5676.

    .venv\\Scripts\\python.exe desdobrar.py <video-do-h3.mp4> [--emenda 1.0] [--saida nome]

1. Acha a guia dentro do vídeo: o 1º quadro é a própria guia, refeita pelo H3 (pode vir em outro tamanho);
   o alinhamento é por ECC (afim) entre os dois.
2. Confere se a câmera andou (paredes, caixas de som e cabine comparadas ao 1º quadro). Se andou, segue quadro a quadro.
3. Para cada pixel do painel, pega a cor no ponto da foto onde ele aparece (geometria.py).
   - teto da entrada, fora do quadro (linhas 0–~3357): continua a borda de cima esticada, cada vez mais desfocada;
   - pé da parede do DJ, atrás da cabine: repete a última linha visível.
4. --emenda S: funde os S últimos segundos no começo, para o vídeo dar a volta sem pulo.

Sai em saidas\\: <nome>-painel.mp4 (H.264 1032x5676, sem som, para o MadMapper), <nome>-previa.mp4 (vídeo do H3 ao lado
do painel) e <nome>-quadro.png (um quadro do painel).
"""
import argparse
import os
import subprocess
import sys

import cv2
import numpy as np

import geometria as g

AQUI = os.path.dirname(os.path.abspath(__file__))
FFMPEG = r'C:\apps\instagram\motion\node_modules\ffmpeg-static\ffmpeg.exe'
GUIAS = [os.path.join(AQUI, n) for n in ('guia-h3.jpg', 'guia-figura.jpg')]
PEQ = (480, 640)  # tamanho de trabalho do alinhamento


def alinhar(guia, quadro, ini=None, mascara=None, modo=cv2.MOTION_AFFINE):
    """Afim 2x3 que leva coordenadas da guia (1440x1920) para as do quadro (pixels do vídeo)."""
    gh, gw = guia.shape[:2]
    qh, qw = quadro.shape[:2]
    a = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(guia, cv2.COLOR_BGR2GRAY), PEQ, interpolation=cv2.INTER_AREA), (0, 0), 1.2)
    b = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(quadro, cv2.COLOR_BGR2GRAY), PEQ, interpolation=cv2.INTER_AREA), (0, 0), 1.2)
    Sg = np.diag([PEQ[0] / gw, PEQ[1] / gh, 1.0])
    Sq = np.diag([qw / PEQ[0], qh / PEQ[1], 1.0])
    W = np.eye(2, 3, dtype=np.float32) if ini is None else (np.linalg.inv(Sq) @ np.vstack([ini, [0, 0, 1]]) @ np.linalg.inv(Sg))[:2].astype(np.float32)
    m = None if mascara is None else cv2.resize(mascara, PEQ, interpolation=cv2.INTER_NEAREST)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    cc, W = cv2.findTransformECC(a.astype(np.float32), b.astype(np.float32), W, modo, crit, m, 5)
    A = Sq @ np.vstack([W, [0, 0, 1]]) @ Sg
    return A[:2], cc


def mascara_fixa():
    """Partes da guia que não mudam com a luz do LED: paredes de cima, caixas de som, laterais (sem LED, sem chão)."""
    m = np.zeros((g.GUIA[1], g.GUIA[0]), np.uint8)
    m[:1250] = 255
    for lin0, lin1 in ((0, g.DOBRA), (g.DOBRA, g.ALT)):
        lins = np.linspace(lin0, lin1, 80) - 0.5
        e = np.array(g.painel_para_guia(lins, np.full_like(lins, -0.5))).T
        d = np.array(g.painel_para_guia(lins, np.full_like(lins, g.LARG - 0.5))).T
        p = np.vstack([e, d[::-1]])
        p = p[np.isfinite(p).all(1)]
        cv2.fillPoly(m, [np.round(p).astype(np.int32)], 0)
    return cv2.erode(m, np.ones((61, 61), np.uint8))


def mapas(A, qw, qh):
    """map_x/map_y (5676x1032) no vídeo, e as linhas que precisam de preenchimento."""
    lin, col = np.mgrid[0:g.ALT, 0:g.LARG].astype(np.float64)
    gu, gv = g.painel_para_guia(lin, col)
    # pé da parede atrás da cabine: repete a última linha que aparece
    cab = (g.CABINE_V - 3 - g.CORTE[1]) * g.ESCALA_GUIA
    parede = lin >= g.DOBRA
    gv = np.where(parede & (gv > cab), cab, gv)
    x = A[0, 0] * gu + A[0, 1] * gv + A[0, 2]
    y = A[1, 0] * gu + A[1, 1] * gv + A[1, 2]
    # linhas do teto que saem por cima do quadro
    fora = ~np.isfinite(y) | (y < 2)
    r_ref = int(np.max(np.where(fora.any(1))[0])) + 1 + 24 if fora.any() else 0  # 24 linhas para dentro da borda
    x = np.clip(np.nan_to_num(x, nan=0), 0, qw - 1.001)   # o que sai pelos lados repete a borda
    y = np.clip(np.nan_to_num(y, nan=0), 0, qh - 1.001)
    return x.astype(np.float32), y.astype(np.float32), r_ref


class Esticar:
    """Teto fora do quadro: a linha r_ref repetida para a entrada, desfocando com a distância."""

    def __init__(self, r_ref):
        self.r_ref = r_ref
        self.sigmas = [0, 6, 24, 96, 384]
        d = (r_ref - np.arange(r_ref)).astype(np.float64)          # distância até a linha de referência
        s = np.clip(d * 0.6, 0, self.sigmas[-1])                   # desfoque desejado em px (sem rastros nítidos)
        niveis = np.array(self.sigmas, float)
        idx = np.clip(np.searchsorted(niveis, s) - 1, 0, len(niveis) - 2)
        t = (s - niveis[idx]) / (niveis[idx + 1] - niveis[idx])
        self.w = np.zeros((r_ref, len(niveis)), np.float32)
        self.w[np.arange(r_ref), idx] = 1 - t
        self.w[np.arange(r_ref), idx + 1] = t

    def aplicar(self, painel):
        if not self.r_ref:
            return painel
        linha = painel[self.r_ref].astype(np.float32)[None]        # 1 x 1032 x 3
        niveis = [linha[0]] + [cv2.GaussianBlur(linha, (0, 0), sigmaX=s, sigmaY=0.01, borderType=cv2.BORDER_REFLECT)[0] for s in self.sigmas[1:]]
        bloco = np.einsum('rk,kcd->rcd', self.w, np.stack(niveis))
        # emenda suave entre o esticado e o vídeo (as 24 linhas junto da borda)
        painel[:self.r_ref] = np.clip(bloco, 0, 255).astype(np.uint8)
        return painel


def ler_quadros(cap, n):
    out = []
    for _ in range(n):
        ok, q = cap.read()
        if not ok:
            break
        out.append(q)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--emenda', type=float, default=1.0, help='segundos fundidos no começo para o loop (0 = sem)')
    ap.add_argument('--saida', default=None)
    ap.add_argument('--seguir', choices=['auto', 'sim', 'nao'], default='auto', help='seguir a câmera quadro a quadro')
    ap.add_argument('--guia', default=None, help='a imagem mandada como 1º quadro (padrão: a guia que mais se parece com ele)')
    a = ap.parse_args()

    nome = a.saida or os.path.splitext(os.path.basename(a.video))[0]
    pasta = os.path.join(AQUI, 'saidas')
    os.makedirs(pasta, exist_ok=True)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    qw, qh = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f'vídeo {qw}x{qh}, {fps:.2f} q/s, {total} quadros')

    quadros = ler_quadros(cap, total)
    cap.release()
    total = len(quadros)
    A0 = np.array([[qw / g.GUIA[0], 0, 0], [0, qh / g.GUIA[1], 0]])
    melhor = None
    for caminho in ([a.guia] if a.guia else GUIAS):
        gi = cv2.imread(caminho)
        try:
            Ai, ci = alinhar(gi, quadros[0], A0)
        except cv2.error:
            continue
        if melhor is None or ci > melhor[2]:
            melhor = (gi, Ai, ci, caminho)
    guia, A, cc, caminho = melhor
    print(f'guia {os.path.basename(caminho)} no 1º quadro: escala {A[0, 0]:.4f} x {A[1, 1]:.4f}, desvio {A[0, 2]:+.1f}, {A[1, 2]:+.1f} px (correlação {cc:.3f})')
    if cc < 0.9:
        A = A0
        print('  atenção: o 1º quadro não se parece com a guia; usando só a escala (confira a prévia)')

    # a câmera andou? (compara partes fixas da sala com o 1º quadro)
    fixa = mascara_fixa()
    deriva = []
    for i in np.linspace(0, total - 1, 6).astype(int)[1:]:
        try:
            Ai, c = alinhar(guia, quadros[i], A, fixa, cv2.MOTION_AFFINE)
            centro = np.array([g.GUIA[0] / 2, 700, 1])
            deriva.append((i, float(np.linalg.norm(Ai @ centro - A @ centro)), c))
        except cv2.error:
            deriva.append((i, float('nan'), 0))
    print('câmera em relação ao 1º quadro (px no LED): ' + ', '.join(f'{i / fps:.1f}s {d:.1f}' for i, d, _ in deriva))
    maior = np.nanmax([d for _, d, _ in deriva])
    # deriva pequena (a IA balançou a câmera): segue quadro a quadro. Grande (a IA moveu a câmera de verdade):
    # não dá para seguir; o LED mostra o que a câmera viu, como se fosse a janela.
    seguir = a.seguir == 'sim' or (a.seguir == 'auto' and 1.5 < maior < 20)
    if seguir:
        print('seguindo a câmera quadro a quadro')
    elif maior >= 20:
        print('  atenção: a câmera da IA se moveu bastante; o mapeamento fica preso ao 1º quadro')

    # emenda do loop
    n = int(round(a.emenda * fps)) if a.emenda > 0 else 0
    if n and total > 3 * n:
        for i in range(n):
            t = (i + 0.5) / n
            quadros[i] = cv2.addWeighted(quadros[i], t, quadros[total - n + i], 1 - t, 0)
        quadros = quadros[:total - n]
        print(f'loop: {n} quadros do fim fundidos no começo → {len(quadros) / fps:.2f} s')

    mx, my, r_ref = mapas(A, qw, qh)
    esticar = Esticar(r_ref)
    print(f'teto da entrada (linhas 0–{r_ref - 1}) esticado a partir da linha {r_ref}')

    saida = os.path.join(pasta, f'{nome}-painel.mp4')
    enc = subprocess.Popen([FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{g.LARG}x{g.ALT}',
                            '-r', f'{fps}', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', saida], stdin=subprocess.PIPE)
    alt_prev = 1280
    larg_v = int(round(qw * alt_prev / qh / 2)) * 2
    larg_p = int(round(g.LARG * alt_prev / g.ALT / 2)) * 2
    previa = os.path.join(pasta, f'{nome}-previa.mp4')
    prev = subprocess.Popen([FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{larg_v + 24 + larg_p}x{alt_prev}',
                             '-r', f'{fps}', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', previa], stdin=subprocess.PIPE)
    Aatual = A
    for i, q in enumerate(quadros):
        if seguir and i:
            try:
                Aatual, _ = alinhar(guia, q, Aatual, fixa)
            except cv2.error:
                pass
            mx, my, _ = mapas(Aatual, qw, qh)
        painel = cv2.remap(q, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        painel = esticar.aplicar(painel)
        enc.stdin.write(painel.tobytes())
        lado = np.zeros((alt_prev, larg_v + 24 + larg_p, 3), np.uint8)
        lado[:, :larg_v] = cv2.resize(q, (larg_v, alt_prev), interpolation=cv2.INTER_AREA)
        lado[:, larg_v + 24:] = cv2.resize(painel, (larg_p, alt_prev), interpolation=cv2.INTER_AREA)
        prev.stdin.write(lado.tobytes())
        if i == len(quadros) // 2:
            cv2.imwrite(os.path.join(pasta, f'{nome}-quadro.png'), painel)
        if i % 24 == 0:
            print(f'  {i}/{len(quadros)}', end='\r', flush=True)
    for p in (enc, prev):
        p.stdin.close()
        p.wait()
    print(f'\npronto: {saida}\n        {previa}')
    return 0 if enc.returncode == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
