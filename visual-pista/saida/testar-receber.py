"""Teste: recebe a fonte Spout "Visual Pista CLUBE" (como o MadMapper faria), mede os quadros e salva um PNG.

Uso: C:\\apps\\radio-saida\\.venv\\Scripts\\python.exe testar-receber.py [arquivo.png]
"""
import struct
import sys
import time
import zlib

import glfw
import numpy as np
import SpoutGL

NOME = 'Visual Pista CLUBE'


def salvar_png(caminho, rgb):
    altura, largura, _ = rgb.shape
    cru = b''.join(b'\x00' + rgb[y].tobytes() for y in range(altura))
    def bloco(tipo, dados):
        return struct.pack('>I', len(dados)) + tipo + dados + struct.pack('>I', zlib.crc32(tipo + dados) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', struct.pack('>IIBBBBB', largura, altura, 8, 2, 0, 0, 0)) + bloco(b'IDAT', zlib.compress(cru, 6)) + bloco(b'IEND', b'')
    with open(caminho, 'wb') as f:
        f.write(png)


def main():
    glfw.init()
    glfw.window_hint(glfw.VISIBLE, glfw.FALSE)
    janela = glfw.create_window(16, 16, 'teste', None, None)
    glfw.make_context_current(janela)
    rx = SpoutGL.SpoutReceiver()
    rx.setReceiverName(NOME)
    buf = None
    quadros = 0
    inicio = None
    fim = time.time() + 8
    while time.time() < fim:
        ok = rx.receiveImage(buf, 0x80E1, False, 0)  # GL_BGRA
        if rx.isUpdated():
            w, h = rx.getSenderWidth(), rx.getSenderHeight()
            buf = bytearray(w * h * 4)
            continue
        if ok and buf is not None and rx.isFrameNew():
            if inicio is None:
                inicio = time.time()
            quadros += 1
        time.sleep(0.002)
    if not buf:
        print('Spout: emissor NÃO encontrado')
        return
    w, h = rx.getSenderWidth(), rx.getSenderHeight()
    img = np.frombuffer(buf, np.uint8).reshape(h, w, 4)
    seg = time.time() - (inicio or time.time())
    print(f'Spout: "{rx.getActiveSender() if hasattr(rx, "getActiveSender") else NOME}" {w}x{h}, '
          f'{quadros} quadros novos em {seg:.1f} s ({quadros / max(seg, .1):.1f}/s), brilho médio {img[:, :, :3].mean():.1f}')
    salvar_png(sys.argv[1] if len(sys.argv) > 1 else 'teste-spout.png', np.ascontiguousarray(img[:, :, [2, 1, 0]]))


if __name__ == '__main__':
    main()
