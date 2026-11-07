"""Onde cada pixel do LED da pista aparece na foto 07-pista-noite.jpg (1080x1350), a perspectiva do guia.

Painel (mídia 1032x5676, P1,86 mm): linhas 0–4988 no teto (linha 0 = ponta da entrada, 4988 = dobra),
4988–5676 na parede atrás do DJ (5676 = embaixo, junto da cabine). Coluna 0 = esquerda de quem olha para o DJ.

Medido na foto (python geometria.py mostra o ajuste):
- juntas dos gabinetes no teto em v = 474, 454, 430, 401, 365, 320, 263, 185, 73, a cada 0,32 m (2 módulos de 16 cm,
  o único passo que divide os 9,28 m do teto e os 1,28 m da parede). Com uma câmera nivelada (as verticais da foto são
  retas), v = cy - f*h/Z: o ajuste dá o horizonte (cy), a distância até a parede e a dobra (v0), com resíduo de 0,35 px.
  Isso decide em que altura da foto cai cada LINHA do teto.
- bordas do teto: esquerda u = 0,7569 v - 0,47 e direita u = -0,9896 v + 1184,5 (retas, resíduo 0,5 px). A esquerda
  passa pelo ponto de fuga das juntas; a direita não (a foto parece retocada desse lado: o teto fica mais largo que a
  parede). Como o H3 vê a foto, as COLUNAS seguem as bordas da foto: em cada linha, de uma borda à outra.
- parede do DJ: laterais em u = 373 e 685; vai da dobra até v0 + 1,28 m na escala da parede (a cabine cobre de ~679 para baixo).
"""
import numpy as np

LARG, ALT, DOBRA = 1032, 5676, 4988
PASSO = 1.92 / LARG  # metros por pixel do painel (1,86 mm)

FOTO = r'C:\apps\instagram\feed-sobrio\fotos\drive\07-pista-noite.jpg'
U_PAREDE = (373.0, 685.0)
BORDA_ESQ = (0.7569, -0.47)      # u = a*v + b
BORDA_DIR = (-0.9896, 1184.54)
JUNTAS = [474, 454, 430, 401, 365, 320, 263, 185, 73]  # 1ª a 9ª junta a partir da dobra
JUNTA_M = 0.32
CABINE_V = 679                    # topo da cabine de pedra na foto

# Guia: a foto cortada em 3:4 no meio (x 34–1045, y 0–1348) e ampliada para 1440x1920 (2K do H3).
CORTE = (34, 0, 1011, 1348)
GUIA = (1440, 1920)
ESCALA_GUIA = GUIA[0] / CORTE[2]


def _ajustar():
    k = (U_PAREDE[1] - U_PAREDE[0]) / 1.92        # px por metro no plano da parede = f/Zf
    # v_n = cy(1 - g_n) + v0 g_n, g_n = Zf/(Zf - 0,32 n); v0 = a dobra
    v = np.array(JUNTAS, float)
    n = np.arange(1, len(JUNTAS) + 1)
    melhor = None
    for cy in np.arange(660, 760, 0.25):
        for zf in np.arange(3.5, 6.0, 0.005):
            gn = zf / (zf - JUNTA_M * n)
            v0 = ((v - cy * (1 - gn)) @ gn) / (gn @ gn)
            rms = np.sqrt(((v - cy * (1 - gn) - v0 * gn) ** 2).mean())
            if melhor is None or rms < melhor[0]:
                melhor = (rms, cy, zf, v0)
    rms, cy, zf, v0 = melhor
    return dict(cy=cy, zf=zf, v0=v0, k=k, f=k * zf, h=(cy - v0) / k, rms=rms)


CAM = _ajustar()


def painel_para_foto(lin, col):
    """Centro do pixel (lin, col) do painel → (u, v) na foto 07. Aceita arrays. NaN = atrás da câmera."""
    c = CAM
    lin = np.asarray(lin, float) + 0.5
    col = np.asarray(col, float) + 0.5
    teto = lin < DOBRA
    with np.errstate(divide='ignore', invalid='ignore'):
        z = c['zf'] - (DOBRA - lin) * PASSO                      # profundidade da linha do teto
        v_teto = np.where(z > 0.05, c['cy'] - c['f'] * c['h'] / z, np.nan)
    v_par = c['v0'] + (lin - DOBRA) * PASSO * c['k']
    v = np.where(teto, v_teto, v_par)
    t = col / LARG
    ue = np.where(teto, BORDA_ESQ[0] * v + BORDA_ESQ[1], U_PAREDE[0])
    ud = np.where(teto, BORDA_DIR[0] * v + BORDA_DIR[1], U_PAREDE[1])
    return ue + t * (ud - ue), v


def foto_para_painel(u, v):
    """Inverso de painel_para_foto: (u, v) da foto → (lin, col) do painel (fração; NaN fora do LED)."""
    c = CAM
    u = np.asarray(u, float)
    v = np.asarray(v, float)
    v_base = c['v0'] + (ALT - DOBRA) * PASSO * c['k']
    with np.errstate(divide='ignore', invalid='ignore'):
        z = c['f'] * c['h'] / (c['cy'] - v)
        lin_teto = DOBRA - (c['zf'] - z) / PASSO
        lin_par = DOBRA + (v - c['v0']) / (PASSO * c['k'])
        teto = v < c['v0']
        lin = np.where(teto, lin_teto, lin_par) - 0.5
        ue = np.where(teto, BORDA_ESQ[0] * v + BORDA_ESQ[1], U_PAREDE[0])
        ud = np.where(teto, BORDA_DIR[0] * v + BORDA_DIR[1], U_PAREDE[1])
        col = (u - ue) / (ud - ue) * LARG - 0.5
    dentro = (col > -0.5) & (col < LARG - 0.5) & (lin > -0.5) & (v <= v_base) & (v < c['cy'])
    return np.where(dentro, lin, np.nan), np.where(dentro, col, np.nan)


def foto_para_guia(u, v):
    return (np.asarray(u) - CORTE[0]) * ESCALA_GUIA, (np.asarray(v) - CORTE[1]) * ESCALA_GUIA


def painel_para_guia(lin, col):
    return foto_para_guia(*painel_para_foto(lin, col))


def primeira_linha_visivel():
    """Primeira linha do teto que aparece no quadro (v >= 0)."""
    c = CAM
    z_topo = c['f'] * c['h'] / c['cy']
    return int(np.ceil(DOBRA - (c['zf'] - z_topo) / PASSO))


if __name__ == '__main__':
    c = CAM
    print('horizonte v=%.1f, parede a %.2f m da câmera, teto %.2f m acima dela, dobra em v=%.1f (juntas: rms %.2f px)' % (
        c['cy'], c['zf'], c['h'], c['v0'], c['rms']))
    print('borda esquerda cruza o horizonte em u=%.1f; a direita em u=%.1f' % (
        BORDA_ESQ[0] * c['cy'] + BORDA_ESQ[1], BORDA_DIR[0] * c['cy'] + BORDA_DIR[1]))
    for i, vj in enumerate(JUNTAS, 1):
        lin = DOBRA - i * JUNTA_M / PASSO
        print('  junta %d (linha %.0f): medida v=%.1f  calculada v=%.1f' % (i, lin, vj, painel_para_foto(lin - 0.5, 0)[1]))
    print('  base da parede do DJ em v=%.1f (a cabine cobre a partir de %d)' % (painel_para_foto(ALT - 0.5, 0)[1], CABINE_V))
    print('  teto visível a partir da linha %d (de %d)' % (primeira_linha_visivel(), DOBRA))
