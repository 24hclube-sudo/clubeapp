"""Ponte de textura: quadro do Electron (textura compartilhada D3D11, handle NT) → Spout, sem passar pela CPU.

O Electron (offscreen com useSharedTexture) entrega em cada 'paint' um handle NT da textura do quadro, válido só
no processo principal dele. Aqui: duplica o handle para este processo, abre a textura num dispositivo D3D11 na
mesma placa (NVIDIA), copia para uma textura nossa e espera a cópia terminar (aí o Electron já pode devolver a
textura ao Chromium). A nossa textura está ligada ao OpenGL (WGL_NV_DX_interop) e vai ao Spout por sendTexture,
que cuida de todo o protocolo do Spout (lista de emissores, contagem de quadros etc.).

Tudo por ctypes (chamadas COM pela vtable); os índices das vtables são os da ordem dos métodos em d3d11.h/dxgi.h.
"""
import ctypes
import uuid
from ctypes import POINTER, WINFUNCTYPE, byref, c_int, c_long, c_uint, c_void_p, wintypes

GL_TEXTURE_2D = 0x0DE1
DXGI_FORMAT_B8G8R8A8_UNORM = 87


class GUID(ctypes.Structure):
    _fields_ = [('Data1', ctypes.c_uint32), ('Data2', ctypes.c_uint16), ('Data3', ctypes.c_uint16), ('Data4', ctypes.c_ubyte * 8)]

    @classmethod
    def de(cls, texto):
        u = uuid.UUID(texto)
        g = cls(u.fields[0], u.fields[1], u.fields[2])
        g.Data4[:] = u.bytes[8:]
        return g


IID_IDXGIFactory1 = GUID.de('770aae78-f26f-4dba-a829-253c83d1b387')
IID_ID3D11Device1 = GUID.de('a04bfb29-08ef-43d6-a49c-a9bdbdcbe686')
IID_ID3D11Texture2D = GUID.de('6f15aaf2-d208-4e89-9ab4-489535d34f9c')


class DXGI_ADAPTER_DESC1(ctypes.Structure):
    _fields_ = [('Description', ctypes.c_wchar * 128), ('VendorId', c_uint), ('DeviceId', c_uint), ('SubSysId', c_uint),
                ('Revision', c_uint), ('DedicatedVideoMemory', ctypes.c_size_t), ('DedicatedSystemMemory', ctypes.c_size_t),
                ('SharedSystemMemory', ctypes.c_size_t), ('LuidLow', wintypes.DWORD), ('LuidHigh', c_long), ('Flags', c_uint)]


class D3D11_TEXTURE2D_DESC(ctypes.Structure):
    _fields_ = [('Width', c_uint), ('Height', c_uint), ('MipLevels', c_uint), ('ArraySize', c_uint), ('Format', c_uint),
                ('SampleCount', c_uint), ('SampleQuality', c_uint), ('Usage', c_uint), ('BindFlags', c_uint),
                ('CPUAccessFlags', c_uint), ('MiscFlags', c_uint)]


class D3D11_BOX(ctypes.Structure):
    _fields_ = [(n, c_uint) for n in ('left', 'top', 'front', 'right', 'bottom', 'back')]


class D3D11_QUERY_DESC(ctypes.Structure):
    _fields_ = [('Query', c_uint), ('MiscFlags', c_uint)]


def com(obj, indice, *tipos, res=c_long):
    """Método 'indice' da vtable do objeto COM 'obj' (endereço), já com o 'this' preenchido."""
    end = obj.value if isinstance(obj, c_void_p) else obj
    vtabela = ctypes.cast(end, POINTER(POINTER(c_void_p)))[0]
    funcao = WINFUNCTYPE(res, c_void_p, *tipos)(vtabela[indice])
    return lambda *args: funcao(end, *args)


def conferir(hr, oque):
    if hr < 0:
        raise OSError(f'{oque} falhou (HRESULT 0x{hr & 0xffffffff:08X})')


def soltar(obj):
    if obj and obj.value:
        com(obj, 2, res=c_uint)()
        obj.value = None


class PonteTextura:
    def __init__(self, largura, altura):
        self.largura, self.altura = largura, altura
        k = self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        k.OpenProcess.restype = wintypes.HANDLE
        k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        k.GetCurrentProcess.restype = wintypes.HANDLE
        k.DuplicateHandle.argtypes = [wintypes.HANDLE, wintypes.HANDLE, wintypes.HANDLE, POINTER(wintypes.HANDLE),
                                      wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        k.CloseHandle.argtypes = [wintypes.HANDLE]
        self.processo = None
        self.pid = None

        # dispositivo D3D11 na placa com mais memória própria (a NVIDIA; a AMD integrada não tem tela)
        dxgi, d3d11 = ctypes.WinDLL('dxgi'), ctypes.WinDLL('d3d11')
        fabrica = c_void_p()
        conferir(dxgi.CreateDXGIFactory1(byref(IID_IDXGIFactory1), byref(fabrica)), 'CreateDXGIFactory1')
        placa, memoria, i = c_void_p(), -1, 0
        while True:
            a = c_void_p()
            if com(fabrica, 12, c_uint, POINTER(c_void_p))(i, byref(a)) < 0:  # EnumAdapters1
                break
            d = DXGI_ADAPTER_DESC1()
            com(a, 10, POINTER(DXGI_ADAPTER_DESC1))(byref(d))  # GetDesc1
            if not d.Flags & 2 and d.DedicatedVideoMemory > memoria:  # 2 = adaptador de software
                soltar(placa)
                placa, memoria, self.nome_placa = a, d.DedicatedVideoMemory, d.Description
            else:
                soltar(a)
            i += 1
        soltar(fabrica)
        self.disp, self.ctx, nivel = c_void_p(), c_void_p(), c_uint()
        conferir(d3d11.D3D11CreateDevice(placa, 0, None, 0x20, None, 0, 7, byref(self.disp), byref(nivel), byref(self.ctx)),
                 'D3D11CreateDevice')  # tipo UNKNOWN (placa escolhida), BGRA_SUPPORT, SDK 7
        soltar(placa)
        self.disp1 = c_void_p()
        conferir(com(self.disp, 0, POINTER(GUID), POINTER(c_void_p))(byref(IID_ID3D11Device1), byref(self.disp1)), 'ID3D11Device1')

        desc = D3D11_TEXTURE2D_DESC(largura, altura, 1, 1, DXGI_FORMAT_B8G8R8A8_UNORM, 1, 0, 0, 0x8 | 0x20, 0, 0)
        self.tex = c_void_p()
        conferir(com(self.disp, 5, POINTER(D3D11_TEXTURE2D_DESC), c_void_p, POINTER(c_void_p))(byref(desc), None, byref(self.tex)),
                 'CreateTexture2D')
        self.consulta = c_void_p()
        conferir(com(self.disp, 24, POINTER(D3D11_QUERY_DESC), POINTER(c_void_p))(byref(D3D11_QUERY_DESC(0, 0)), byref(self.consulta)),
                 'CreateQuery')  # D3D11_QUERY_EVENT: avisa quando a GPU terminou a cópia

        self._abrir = com(self.disp1, 48, wintypes.HANDLE, POINTER(GUID), POINTER(c_void_p))   # OpenSharedResource1
        self._copiar_tudo = com(self.ctx, 47, c_void_p, c_void_p, res=None)                     # CopyResource
        self._copiar_parte = com(self.ctx, 46, c_void_p, c_uint, c_uint, c_uint, c_uint, c_void_p, c_uint,
                                 POINTER(D3D11_BOX), res=None)                                  # CopySubresourceRegion
        self._fim = com(self.ctx, 28, c_void_p, res=None)                                       # End
        self._pronto = com(self.ctx, 29, c_void_p, c_void_p, c_uint, c_uint)                     # GetData
        self._descarregar = com(self.ctx, 111, res=None)                                        # Flush

        # a nossa textura vira uma textura OpenGL (o contexto glfw do saida.py tem de estar ativo)
        gl = ctypes.WinDLL('opengl32')
        gl.wglGetProcAddress.restype = c_void_p
        gl.wglGetProcAddress.argtypes = [ctypes.c_char_p]

        def wgl(nome, res, *tipos):
            p = gl.wglGetProcAddress(nome.encode())
            if not p:
                raise OSError(f'{nome} não existe (o driver não tem WGL_NV_DX_interop)')
            return WINFUNCTYPE(res, *tipos)(p)

        abrir_interop = wgl('wglDXOpenDeviceNV', wintypes.HANDLE, c_void_p)
        registrar = wgl('wglDXRegisterObjectNV', wintypes.HANDLE, wintypes.HANDLE, c_void_p, c_uint, c_uint, c_uint)
        self._travar = wgl('wglDXLockObjectsNV', wintypes.BOOL, wintypes.HANDLE, c_int, POINTER(wintypes.HANDLE))
        self._destravar = wgl('wglDXUnlockObjectsNV', wintypes.BOOL, wintypes.HANDLE, c_int, POINTER(wintypes.HANDLE))
        self._desregistrar = wgl('wglDXUnregisterObjectNV', wintypes.BOOL, wintypes.HANDLE, wintypes.HANDLE)
        self._fechar_interop = wgl('wglDXCloseDeviceNV', wintypes.BOOL, wintypes.HANDLE)
        self.gltex = c_uint()
        gl.glGenTextures(1, byref(self.gltex))
        self.gl = gl
        self.interop = abrir_interop(self.disp.value)
        if not self.interop:
            raise OSError(f'wglDXOpenDeviceNV falhou ({ctypes.get_last_error()})')
        self.objeto = wintypes.HANDLE(registrar(self.interop, self.tex.value, self.gltex.value, GL_TEXTURE_2D, 0))  # só leitura
        if not self.objeto:
            raise OSError(f'wglDXRegisterObjectNV falhou ({ctypes.get_last_error()})')

    def copiar(self, pid, handle, x, y, largura, altura, larg_total, alt_total):
        """Copia a parte visível da textura do Electron para a nossa e espera a GPU terminar."""
        if pid != self.pid:
            if self.processo:
                self.k.CloseHandle(self.processo)
            self.processo = self.k.OpenProcess(0x0040, False, pid)  # PROCESS_DUP_HANDLE
            if not self.processo:
                raise OSError(f'OpenProcess({pid}) falhou ({ctypes.get_last_error()})')
            self.pid = pid
        h = wintypes.HANDLE()
        if not self.k.DuplicateHandle(self.processo, wintypes.HANDLE(handle), self.k.GetCurrentProcess(), byref(h), 0, False, 2):
            raise OSError(f'DuplicateHandle falhou ({ctypes.get_last_error()})')
        origem = c_void_p()
        try:
            conferir(self._abrir(h, byref(IID_ID3D11Texture2D), byref(origem)), 'OpenSharedResource1')
        finally:
            self.k.CloseHandle(h)
        try:
            w, a = min(largura, self.largura), min(altura, self.altura)
            if (x, y, w, a) == (0, 0, larg_total, alt_total) == (0, 0, self.largura, self.altura):
                self._copiar_tudo(self.tex, origem)
            else:
                caixa = D3D11_BOX(x, y, 0, x + w, y + a, 1)
                self._copiar_parte(self.tex, 0, 0, 0, 0, origem, 0, byref(caixa))
            self._fim(self.consulta)
            self._descarregar()
            while self._pronto(self.consulta, None, 0, 0) == 1:  # S_FALSE = ainda copiando (dura menos de 1 ms)
                pass
        finally:
            soltar(origem)

    def enviar(self, spout):
        objetos = (wintypes.HANDLE * 1)(self.objeto)
        self._travar(self.interop, 1, objetos)
        try:
            spout.sendTexture(self.gltex.value, GL_TEXTURE_2D, self.largura, self.altura, False, 0)
        finally:
            self._destravar(self.interop, 1, objetos)

    def fechar(self):
        try:
            self._desregistrar(self.interop, self.objeto)
            self._fechar_interop(self.interop)
            self.gl.glDeleteTextures(1, byref(self.gltex))
        except Exception:
            pass
        for obj in (self.consulta, self.tex, self.disp1, self.ctx, self.disp):
            soltar(obj)
        if self.processo:
            self.k.CloseHandle(self.processo)
