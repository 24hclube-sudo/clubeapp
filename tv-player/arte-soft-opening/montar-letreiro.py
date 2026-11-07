# Letreiro do soft opening para o painel do térreo: faixa 4472x86 em loop sem emenda.
# Texto só com o que está no post 06: soft opening · Pista Quente apresenta Millos Kaiser · 07.11 · sábado, a partir das 22h.
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = r'C:\apps\instagram\assets\fonts'
SAIDA = os.path.join(AQUI, 'arte-millos')
os.makedirs(SAIDA, exist_ok=True)
FF = r'C:\Program Files (x86)\Nova Star\ViPlex Express\Bin\VideoConverter\ffmpeg.exe'
W, H = 4472, 86
PX_POR_QUADRO, QPS = 2, 30

script = ImageFont.truetype(os.path.join(FONTES, 'Mythshire.ttf'), 74)
texto = ImageFont.truetype(os.path.join(FONTES, 'Archivo-Medium.ttf'), 46)
VERMELHO, CINZA, BRANCO = (255, 76, 44), (183, 185, 188), (243, 244, 246)
PECAS = [('soft opening', script, VERMELHO), ('Pista Quente apresenta', texto, CINZA), ('Millos Kaiser', texto, BRANCO),
         ('07.11', texto, BRANCO), ('sábado, a partir das 22h', texto, CINZA)]
VAO_PECA, VAO_FIM = 110, 300

# logo do CLUBE: o PNG do app é máscara (alfa), então vale qualquer cor
logo = Image.open(r'C:\apps\tv-player\public\logo_clube.png').convert('RGBA')
LOGO_H = 44
logo = logo.resize((round(logo.width * LOGO_H / logo.height), LOGO_H), Image.LANCZOS)

medir = ImageDraw.Draw(Image.new('L', (10, 10)))
larguras = [medir.textbbox((0, 0), t, font=f) for t, f, _ in PECAS]
periodo = sum(b[2] - b[0] for b in larguras) + VAO_PECA * len(PECAS) + logo.width + VAO_FIM
periodo += periodo % 2  # par, para o passo de 2 px fechar o loop exato
print('período', periodo, 'px')

faixa = Image.new('RGB', (periodo, H), (0, 0, 0))
d = ImageDraw.Draw(faixa)
x = 0
for (t, f, cor), b in zip(PECAS, larguras):
    # centraliza pela caixa real do desenho
    d.text((x - b[0], (H - (b[3] - b[1])) // 2 - b[1]), t, font=f, fill=cor)
    x += (b[2] - b[0]) + VAO_PECA
branco = Image.new('RGB', logo.size, BRANCO)
faixa.paste(branco, (x, (H - LOGO_H) // 2), logo.getchannel('A'))
faixa.save(os.path.join(SAIDA, 'letreiro-periodo.png'))

# fita repetida: dá para recortar qualquer janela de 4472 px dela
copias = (W // periodo) + 2
fita = Image.new('RGB', (periodo * copias, H))
for i in range(copias): fita.paste(faixa, (i * periodo, 0))
quadros = periodo // PX_POR_QUADRO
destino = os.path.join(SAIDA, 'letreiro-faixa.mp4')
p = subprocess.Popen([FF, '-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(QPS), '-i', '-',
                      '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', destino], stdin=subprocess.PIPE)
crus = fita.tobytes()
linha = fita.width * 3
for q in range(quadros):
    x0 = q * PX_POR_QUADRO * 3
    p.stdin.write(b''.join(crus[y * linha + x0: y * linha + x0 + W * 3] for y in range(H)))
p.stdin.close()
if p.wait(): sys.exit('ffmpeg falhou')
print(f'{quadros} quadros = {quadros / QPS:.1f} s', destino)
# prévia para conferir: o começo da faixa em tamanho real
fita.crop((0, 0, 2400, H)).save(os.path.join(SAIDA, 'letreiro-previa.png'))
