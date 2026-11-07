# App do CLUBE

Código do app da casa e dos visuais do LED. O que roda de verdade está neste PC, em `C:\apps`.

| Pasta | O que é |
|---|---|
| `tv-player` | App na porta 8080: Música, Rádio, Luzes, Balcões, Telas e LED da pista |
| `visual-pista` | Visuais do LED em WebGPU, a Mesa e a saída para o MadMapper |
| `radio-player` | Interface de streaming da rádio |
| `programacao-circadiana` | Telas e fitas que mudam ao longo do dia |

## O que não está aqui

Vídeos, áudios, malhas `.bin`, cópias de segurança (`antes-*`), registros, estado do servidor, certificados das TVs e senhas ficam só no PC. A lista está em `.gitignore`. Este repositório não basta para reinstalar a casa: faltam esses arquivos.
