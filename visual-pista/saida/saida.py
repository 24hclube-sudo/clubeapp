"""Recebe os quadros do main.js (Electron) pelo stdin e publica como Spout (e NDI, se ligado).

Dois modos (config "textura"):
- textura (padrão): o Electron manda só o handle da textura do quadro na GPU (cabeçalho de 40 bytes:
  8 uint32 = largura, altura, largura e altura totais, x, y, pid do Electron, 0; + handle uint64). A cópia
  fica na placa de vídeo (textura.py); depois de copiar, imprime "@ok" para o Electron devolver a textura.
- cópia: largura e altura (uint32 little-endian) + largura*altura*4 bytes BGRA, como no C:\\apps\\radio-saida.
  O quadro do painel inteiro tem 23 MB, então um fio lê o próximo do cano enquanto o anterior vai ao Spout.
"""
import ctypes
import json
import re
import struct
import sys
import threading
import time
from ctypes import wintypes

import numpy as np

GL_BGRA = 0x80E1
CAB_TEXTURA = struct.Struct('<8IQ')


class ListaSpout:
    """Lê a lista de emissores do Spout ("SpoutSenderNames": nomes de 256 bytes em sequência).

    O MadMapper só mostra quem está nessa lista, e ao recarregar o projeto ele a "limpa" e tira o
    nosso nome, embora o emissor continue vivo. Então o laço confere e, se sumiu, registra de novo.
    """

    class _Regiao(ctypes.Structure):
        _fields_ = [('BaseAddress', ctypes.c_void_p), ('AllocationBase', ctypes.c_void_p),
                    ('AllocationProtect', wintypes.DWORD), ('PartitionId', wintypes.WORD),
                    ('RegionSize', ctypes.c_size_t), ('State', wintypes.DWORD),
                    ('Protect', wintypes.DWORD), ('Type', wintypes.DWORD)]

    def __init__(self):
        k = self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        k.OpenFileMappingW.restype = wintypes.HANDLE
        k.OpenFileMappingW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
        k.MapViewOfFile.restype = ctypes.c_void_p
        k.MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t]
        k.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
        k.VirtualQuery.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
        k.CloseHandle.argtypes = [wintypes.HANDLE]

    def nomes(self):
        """Nomes na lista, ou None se a lista ainda não existe."""
        k = self.k
        h = k.OpenFileMappingW(0x0004, False, 'SpoutSenderNames')  # FILE_MAP_READ
        if not h:
            return None
        try:
            p = k.MapViewOfFile(h, 0x0004, 0, 0, 0)  # 0 = a lista inteira, qualquer que seja o tamanho
            if not p:
                return None
            try:
                regiao = self._Regiao()
                k.VirtualQuery(p, ctypes.byref(regiao), ctypes.sizeof(regiao))
                dados = ctypes.string_at(p, regiao.RegionSize)
            finally:
                k.UnmapViewOfFile(p)
        finally:
            k.CloseHandle(h)
        return {dados[i:i + 256].split(b'\0')[0].decode('latin1') for i in range(0, len(dados) - 255, 256) if dados[i]}

    def existe(self, nome):
        """O emissor 'nome' está vivo (a memória de informação dele existe)?"""
        h = self.k.OpenFileMappingW(0x0004, False, nome)
        if h:
            self.k.CloseHandle(h)
        return bool(h)

    def limpar(self, nome):
        """Tira da lista 'nome' e 'nome_N' que ficaram de um processo derrubado sem soltar o emissor.

        Com o nome velho preso na lista, o Spout registraria o novo como "nome_1" e o MadMapper perderia a fonte.
        """
        k = self.k
        h = k.OpenFileMappingW(0x0002 | 0x0004, False, 'SpoutSenderNames')  # FILE_MAP_WRITE | READ
        if not h:
            return []
        tirados = []
        try:
            p = k.MapViewOfFile(h, 0x0002 | 0x0004, 0, 0, 0)
            if not p:
                return []
            try:
                regiao = self._Regiao()
                k.VirtualQuery(p, ctypes.byref(regiao), ctypes.sizeof(regiao))
                tamanho = regiao.RegionSize - regiao.RegionSize % 256
                dados = ctypes.string_at(p, tamanho)
                ficam = []
                for i in range(0, tamanho, 256):
                    n = dados[i:i + 256].split(b'\0')[0].decode('latin1')
                    if not n:
                        continue
                    if re.fullmatch(re.escape(nome) + r'(_\d+)?', n) and not self.existe(n):
                        tirados.append(n)
                    else:
                        ficam.append(dados[i:i + 256])
                if tirados:
                    novo = b''.join(ficam).ljust(tamanho, b'\0')
                    ctypes.memmove(p, novo, tamanho)
            finally:
                k.UnmapViewOfFile(p)
        finally:
            k.CloseHandle(h)
        return tirados


def ler_exato(fluxo, destino):
    """Enche 'destino' (memoryview) com bytes do fluxo; False se o fluxo acabou."""
    lidos = 0
    while lidos < len(destino):
        n = fluxo.readinto(destino[lidos:])
        if not n:
            return False
        lidos += n
    return True


class Leitor(threading.Thread):
    """Lê quadros do stdin sem parar. Guarda só o mais novo: se o Spout atrasar, o velho é descartado."""

    def __init__(self, fluxo):
        super().__init__(daemon=True)
        self.fluxo = fluxo
        self.cond = threading.Condition()
        self.pronto = None    # (largura, altura, pixels) ainda não enviado
        self.livres = []      # buffers já enviados, para reaproveitar
        self.fim = False
        self.descartados = 0
        self.tempo_ler = 0.

    def run(self):
        cabecalho = bytearray(8)
        while ler_exato(self.fluxo, memoryview(cabecalho)):
            largura, altura = struct.unpack('<II', cabecalho)
            tamanho = largura * altura * 4
            with self.cond:
                buf = self.livres.pop() if self.livres else None
            if buf is None or len(buf) != tamanho:
                buf = bytearray(tamanho)
            t0 = time.perf_counter()
            if not ler_exato(self.fluxo, memoryview(buf)):
                break
            self.tempo_ler += time.perf_counter() - t0
            with self.cond:
                if self.pronto:
                    self.livres.append(self.pronto[2])
                    self.descartados += 1
                self.pronto = (largura, altura, buf)
                self.cond.notify()
        with self.cond:
            self.fim = True
            self.cond.notify()

    def proximo(self):
        with self.cond:
            while not self.pronto and not self.fim:
                self.cond.wait()
            quadro, self.pronto = self.pronto, None
            return quadro

    def devolver(self, buf):
        with self.cond:
            self.livres.append(buf)


def main():
    cfg = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    nome = cfg.get('nome', 'Visual Pista CLUBE')
    fps = int(cfg.get('fps', 30))

    spout = None
    if cfg.get('spout', True):
        import glfw
        import SpoutGL
        # O Spout precisa de um contexto OpenGL; uma janela glfw invisível dá isso sem aparecer nada.
        if not glfw.init():
            raise RuntimeError('glfw não iniciou')
        glfw.window_hint(glfw.VISIBLE, glfw.FALSE)
        contexto = glfw.create_window(16, 16, nome, None, None)
        glfw.make_context_current(contexto)
        lista_spout = ListaSpout()
        tirados = lista_spout.limpar(nome)
        if tirados:
            print(f'saida.py: tirei da lista do Spout nomes presos de uma execução anterior: {", ".join(tirados)}', flush=True)
        spout = SpoutGL.SpoutSender()
        spout.setSenderName(nome)
        conferido = time.time()

    def conferir_lista():
        """O MadMapper, ao recarregar o projeto, tira o nosso nome da lista: registra de novo."""
        nonlocal conferido
        if not spout or time.time() - conferido < 2:
            return
        conferido = time.time()
        nomes = lista_spout.nomes()
        if nomes is not None and nome not in nomes:
            print(f'saida.py: "{nome}" saiu da lista do Spout (o MadMapper recarregou?); registrando de novo', flush=True)
            spout.releaseSender()       # o próximo envio cria o emissor e põe o nome na lista;
            lista_spout.limpar(nome)
            spout.setSenderName(nome)   # sem isto o Spout volta ao nome padrão ("Spout")

    ndi = ndi_envio = quadro_ndi = None
    if cfg.get('ndi', False):
        import NDIlib as ndi
        if not ndi.initialize():
            raise RuntimeError('NDI não iniciou')
        criar = ndi.SendCreate()
        criar.ndi_name = nome
        criar.clock_video = False  # o ritmo já vem do Electron
        ndi_envio = ndi.send_create(criar)
        quadro_ndi = ndi.VideoFrameV2()
        quadro_ndi.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
        quadro_ndi.frame_rate_N = fps * 1000
        quadro_ndi.frame_rate_D = 1000

    print(f'saida.py: publicando "{nome}" (Spout {"sim" if spout else "não"}, NDI {"sim" if ndi_envio else "não"})', flush=True)

    if cfg.get('textura', True) and spout:
        laco_textura(spout, conferir_lista)
    else:
        laco_copia(spout, conferir_lista, ndi, ndi_envio, quadro_ndi)

    if spout:
        spout.releaseSender()
    if ndi_envio:
        ndi.send_destroy(ndi_envio)
        ndi.destroy()


def laco_textura(spout, conferir_lista):
    from textura import PonteTextura
    entrada = sys.stdin.buffer
    cab = bytearray(CAB_TEXTURA.size)
    ponte = None
    ultimo_log = time.time()
    enviados = erros = 0
    tempo_copiar = tempo_enviar = 0.
    while ler_exato(entrada, memoryview(cab)):
        largura, altura, larg_total, alt_total, x, y, pid, _, handle = CAB_TEXTURA.unpack(cab)
        t0 = time.perf_counter()
        try:
            if not ponte or (ponte.largura, ponte.altura) != (largura, altura):
                if ponte:
                    ponte.fechar()
                ponte = PonteTextura(largura, altura)
                print(f'saida.py: textura {largura}x{altura} na placa "{ponte.nome_placa}"', flush=True)
            ponte.copiar(pid, handle, x, y, largura, altura, larg_total, alt_total)
        except OSError as e:
            erros += 1
            if erros <= 5 or erros % 1000 == 0:
                print(f'saida.py: erro na textura ({erros}): {e}', flush=True)
            print('@ok', flush=True)
            continue
        print('@ok', flush=True)  # a cópia terminou: o Electron já pode devolver a textura ao Chromium
        t1 = time.perf_counter()
        conferir_lista()
        ponte.enviar(spout)
        t2 = time.perf_counter()
        tempo_copiar += t1 - t0
        tempo_enviar += t2 - t1
        enviados += 1
        if enviados % 30 == 0:
            import glfw
            glfw.poll_events()
        if time.time() - ultimo_log > 60:
            print(f'saida.py: {enviados} quadros no último minuto, {largura}x{altura} pela GPU, '
                  f'copiar {tempo_copiar / enviados * 1000:.2f} ms + enviar {tempo_enviar / enviados * 1000:.2f} ms por quadro', flush=True)
            enviados, ultimo_log, tempo_copiar, tempo_enviar = 0, time.time(), 0., 0.
    if ponte:
        ponte.fechar()


def laco_copia(spout, conferir_lista, ndi, ndi_envio, quadro_ndi):
    leitor = Leitor(sys.stdin.buffer)
    leitor.start()
    ultimo_log = time.time()
    enviados = 0
    tempo_enviar = 0.
    while True:
        quadro = leitor.proximo()
        if not quadro:
            break
        largura, altura, pixels = quadro
        t0 = time.perf_counter()
        if spout:
            conferir_lista()
            spout.sendImage(pixels, largura, altura, GL_BGRA, False, 0)
        if ndi_envio:
            quadro_ndi.data = np.frombuffer(pixels, dtype=np.uint8).reshape(altura, largura, 4)
            ndi.send_send_video_v2(ndi_envio, quadro_ndi)
        tempo_enviar += time.perf_counter() - t0
        leitor.devolver(pixels)
        enviados += 1
        if spout and enviados % 30 == 0:
            import glfw
            glfw.poll_events()
        if time.time() - ultimo_log > 60:
            conexoes = ndi.send_get_no_connections(ndi_envio, 0) if ndi_envio else 0
            print(f'saida.py: {enviados} quadros no último minuto ({leitor.descartados} descartados), {largura}x{altura}, '
                  f'ler {leitor.tempo_ler / enviados * 1000:.1f} ms + enviar {tempo_enviar / enviados * 1000:.1f} ms por quadro'
                  + (f', receptores NDI: {conexoes}' if ndi_envio else ''), flush=True)
            enviados, ultimo_log, tempo_enviar = 0, time.time(), 0.
            leitor.descartados, leitor.tempo_ler = 0, 0.


if __name__ == '__main__':
    main()
