# Perspectiva da pista → vídeo do LED

Gera conteúdo para o LED da pista (1032×5676, em L) com um gerador de vídeo por IA (MiniMax H3, Seedance…), desenhado
**na perspectiva de quem está na pista**: a IA recebe uma foto da pista como primeiro quadro e anima só o LED; depois o
`desdobrar.py` recorta o LED de cada quadro e "desamassa" a perspectiva, devolvendo o vídeo do painel. No LED, visto da
pista, o teto e a parede do DJ formam uma imagem só (como na foto 06, a mulher que continua do teto para a parede).

## Passo a passo

1. **Guia:** `guia-h3.jpg` (1440×1920, 3:4). É a foto `07-pista-noite.jpg` com o LED limpo (sem as juntas dos gabinetes e
   sem o logo, só o degradê vermelho). Uma cópia está em `instagram\gerador-video\entradas\pista-guia-perspectiva.jpg`.
   `guia-marcado.jpg` mostra o contorno do painel e as linhas da mídia (não mande essa para a IA).
2. **Gerar:** no gerador (`http://localhost:4330`, configuração "gerador"), modelo **MiniMax H3**, modo
   **Foto → vídeo**, foto inicial = a guia, 2K. No prompt, sempre: câmera parada, sala igual, só as duas telas de LED mudam,
   uma imagem só nas duas telas, na perspectiva da sala. Exemplo em `prompt-teste.txt`.
3. **Desdobrar:**

   ```
   .venv\Scripts\python.exe desdobrar.py <vídeo.mp4> [--emenda 1.0] [--saida nome]
   ```

   Sai em `saidas\`: `<nome>-painel.mp4` (H.264 1032×5676, sem som: é o que vai para o MadMapper, na superfície
   LED PISTA 5), `<nome>-previa.mp4` (o vídeo da IA ao lado do painel) e `<nome>-quadro.png`.
   `--emenda 1.0` funde o último segundo no começo, para dar a volta sem pulo (0 = sem emenda).

## Guias e prompts prontos

- `guia-h3.jpg` + `prompt-teste.txt`: LED só com o degradê vermelho; onda prateada (teste de 02/11, `saidas\h3-teste-1-*`).
- `guia-figura.jpg` + `prompt-abrir.txt`: LED com a mulher do drinque (figura a-1) chapada, vista de pé da pista,
  atravessando teto e parede. Mandada como **primeiro e último quadro** (modo "Quadro inicial e final", 12 s, 2K):
  o LED se parte em blocos, abre um portal para o universo do CLUBE (estátuas prateadas pixeladas, pedras, cristais
  roxos) e fecha de volta na figura, então o vídeo do painel faz loop sozinho (`--emenda 0`).
  Resultado de 02/11: `saidas\h3-abrir-1-*` (vídeo original em `instagram\gerador-video\saidas\2026-11-02-minimax-h3-2.mp4`).
- O desdobrador escolhe sozinho a guia que mais se parece com o 1º quadro (ou `--guia arquivo.jpg`).

**Cuidado com o prompt:** frases como "voando para dentro pelo teto" fazem o H3 mover a câmera da sala de verdade
(no h3-2 ela inclina e entra no teto entre ~3 e 10 s). O desdobrador então fica preso ao 1º quadro e o LED mostra o
que a câmera viu, como uma janela: funciona, mas em alguns trechos as paredes escuras da sala "passam" pelo LED.
Para controle total: gerar só o voo pelo universo (sem a sala, com as figuras como referência) e fazer a abertura
dos blocos no próprio painel, por código.

## Versão controlada: os módulos se abrem por código (abrir.py)

O H3 gera só o voo pelo universo (sem a sala) e a abertura é feita no próprio painel:

```
.venv\Scripts\python.exe abrir.py <voo.mp4> [--horizonte 1550] [--zoom 1.0] [--saida h3-abrir-2] [--quadros 40,90]
```

- **Voo:** `prompt-universo.txt`, modo **Referências**, 3:4, 2K, 9 s. Referências na ordem: `universo-ref.jpg` (um quadro
  do universo do h3-2), `figura-a-1.jpg`, `figura-h-1.jpg`, `figura-b-1.jpg` (em `instagram\gerador-video\entradas`).
  No H3 as referências se chamam `@Image 1`, `@Image 2`…
- **Janela:** cada pixel do painel pega a cor na direção em que é visto da pista. A câmera do H3 olha para cima;
  `--horizonte` é a altura do horizonte no vídeo (no h3-3, ~1550 de 1918). Do voo saem as linhas 2866–5675; o teto
  da entrada vira um céu escuro parado com partículas prateadas em 3D passando por cima da pista.
- **Abertura:** a figura chapada (a-1, como na guia-figura, mas tirada do PNG em resolução cheia) se parte nos
  módulos de 16 cm (86 px), a partir da dobra. Os módulos giram como lâminas e caem para dentro do teto e da parede,
  em perspectiva de quem está na pista. No fim voltam da entrada para a dobra e travam com um brilho.
- **Tempo:** figura 1,5 s → abre (~3 s) → voo → fecha (~3 s) → figura 1 s; faz loop sozinho (11,9 s com o voo de 9,4 s).
- **Saídas** (`saidas\`):
  - `-painel.mp4`: vai para o MadMapper.
  - `-sala.mp4`: simulação vista da pista, 1080×1440, com o som do H3.
  - `-previa.mp4`: a simulação ao lado do painel.
- **Conferir antes:** `--quadros` grava só alguns quadros em JPG.
- **Resultado de 02/11:** `saidas\h3-abrir-2-*`, a partir do voo `instagram\gerador-video\saidas\2026-11-02-minimax-h3-3.mp4`.

## Painel inteiro: olho de peixe para cima (abrir.py --lente olho)

O voo olhando para a frente não alcança o teto da entrada: ele fica em cima e atrás de quem está no meio da pista.
Do meio, o LED ocupa quase meia volta (~164°, do horizonte na frente até 15° acima do horizonte atrás), e isso só
cabe num olho de peixe olhando para cima. Por isso o H3 gera o voo assim:

- `prompt-olho-de-peixe-2k.txt`, modo Referências, **21:9**, 2K, 10 s (~US$ 0,64). Referências na ordem:
  - `universo-ref.jpg`;
  - as três figuras;
  - `olho-ref.jpg`, um quadro do teste em 768p, para o enquadramento da lente.
- O lado direito do quadro é a frente (DJ), o esquerdo a entrada, e o centro é o zênite.
- O `abrir.py` mede sozinho o horizonte, que é a borda de areia clara (uma elipse), e trata a lente como equidistante.
  Cada pixel do painel pega a direção em que é visto do ponto da ilusão.

```
.venv\Scripts\python.exe abrir.py <voo-olho.mp4> --lente olho [--ponto 0] [--frente direita] [--elipse cx,cy,a,b,ang]
```

- **Onde a ilusão funciona:** fica certa numa área de ~2 m em volta do ponto da foto (`--ponto` move esse ponto,
  em metros, para a entrada). Longe dele, a imagem estica. Isso é geometria, vale para qualquer vídeo.
- **Conferir antes:** `--quadros` grava, além do painel e da sala, `-vistas.jpg`, com quem está no meio e no fim da
  pista olhando para o DJ e para cima.
- **Armadilha do H3:** nas duas gerações em olho de peixe (h3-4 e h3-5, 02/11) a câmera **girou em volta do zênite** em
  vez de andar para a frente, mesmo com o prompt proibindo. Com a referência `olho-ref.jpg` ele copia quase o mesmo
  quadro. No painel, o universo gira em cima da pista.
- **Resultado de 02/11:** `saidas\h3-olho-1-*`, a partir de `instagram\gerador-video\saidas\2026-11-02-minimax-h3-5.mp4`.

## O que a foto cobre

- A foto foi tirada a ~4,4 m da parede do DJ, a ~1 m do chão. Dali aparecem as linhas **3357–4988 do teto** (os ~3 m
  mais perto do DJ) e a parede do DJ inteira menos o pé, que fica atrás da cabine.
- As **linhas 0–3357** (6 m do teto, do lado da entrada) ficam fora do quadro: o desdobrador continua a borda de cima,
  esticada e cada vez mais desfocada (bom para degradês; com desenhos nítidos vira um rastro de luz).
- O pé da parede (atrás da cabine, ~70 linhas) repete a última linha visível.
- A ilusão é perfeita de onde a foto foi tirada; de outros pontos da pista o desenho entorta um pouco, como todo
  anamórfico. Perto da dobra a foto tem pouca resolução (a parede do DJ tem ~440 px de largura na guia), então o
  conteúdo fica mais macio ali.

## Geometria (geometria.py)

Medida na própria foto: as juntas dos gabinetes do teto (a cada 0,32 m) dão o horizonte e a distância (ajuste com erro
de 0,35 px); as bordas do LED dão as colunas. A borda direita do teto na foto não converge para o mesmo ponto de fuga
da esquerda (a foto parece retocada desse lado); o mapeamento segue a foto, que é o que a IA vê.
`python geometria.py` imprime o ajuste. `teste_sintetico.py` pinta um cartão de teste na guia, simula a IA (outro
tamanho, deslocado) e confere que o desdobrador devolve o cartão.

Ambiente: `.venv` próprio (Python 3.12, numpy, Pillow, opencv-python-headless). O ffmpeg é o de
`instagram\motion\node_modules\ffmpeg-static`.
