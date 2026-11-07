# Universo CLUBE (WebGPU)

Visual em tempo real para o LED da pista (1032x5676, teto + parede do DJ): o mundo do vídeo do H3, com as figuras da marca em
voxels de cromo e o logo reagindo ao som. Roda em WebGPU puro, sem Three.js.

Prévia: config "visual-pista" (`C:\apps\.claude\launch.json`), `http://localhost:5210/universo/`. À esquerda a sala (foto da pista
com o LED ligado), à direita o painel chapado.

## Endereço

| Parâmetro | Valores | O que faz |
| --- | --- | --- |
| `saida` | (sem valor) | Só o painel, sem prévia |
| `escala` | 0,5 na prévia; 1 na saída | Resolução do desenho |
| `msaa` | 4 (padrão) ou 1 | Borda lisa dos voxels |
| `audio` | `teste`, ou parte do nome da entrada | `teste` = batida sintética muda. Na prévia é o padrão |
| `lente` | `janela` (padrão), `plana` | `janela` = perspectiva certa do ponto da foto 07. `plana` ainda não foi ajustada |
| `paleta` | `h3`, `vermelho`, `azul`, `vinho`, `verde`, `petroleo`, `terracota`, `urban` | Céu, areia e cristais |
| `bpm` | 124 | Batida interna quando não tem música |
| `brilho` | 0,95 | Brilho final |
| `estatuas` | 6 | Quantas estátuas |
| `estouro` | `0` desliga | Estátua que se desfaz e volta como outra figura |

## Como cada coisa reage ao som

- **Bumbo:** a câmera dá um empurrão para a frente, uma onda sobe do pé à cabeça das estátuas, a superfície treme, o horizonte acende e o logo pula.
- **Espectro:** cada altura da estátua e cada coluna do logo seguem uma faixa de frequência. No logo, cada voxel é uma barra e a profundidade é a faixa.
- **Graves:** os voxels engrossam e o corpo balança mais.
- **Médios:** balançam os espelhinhos de cada voxel e as faixas de luz do reflexo.
- **Agudos:** cristais crescem, estrelas e pó piscam.
- **A cada 16 batidas:** uma estátua à frente vira nuvem e, 4 batidas depois, se monta de baixo para cima como outra figura.
- **Som fraco:** sobram só os blocos da versão `-2` das figuras. Sem música, usa a batida interna, com a figura inteira.

## Arquivos

- `assar.py`: PNG das figuras e do logo → `dados/figuras.bin` + `figuras.json`. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py 400`.
  A figura vira volume pela equação de Poisson (como inflar um balão), então é uma figura inflada, não um modelo 3D com articulações.
- `js/main.js`: mundo, câmera, roteiro, passes. `js/shaders.js`: WGSL. `js/malhas.js`: cubo, cristal, pedras.
- `saida/foto.js`: grava quadros em resolução cheia fora da tela. `saida/medir-textura.js`: mede os quadros por segundo pelo mesmo caminho da saída (textura na GPU), sem abrir Spout.

## Armadilhas

- Abrir o Electron a partir do app do Claude: tirar `CHROME_*`, `ELECTRON_*`, `NODE_OPTIONS` e `CLAUDE*` do ambiente, e o endereço tem de ser o **último** argumento. Argumento depois de URL fecha o Electron na hora, com código -1 e sem log.
- Sem os testes de vídeo por perto, o LED divide a GPU com isto: olhar `nvidia-smi` antes de medir qualquer coisa.
- Figura muito perto da câmera perde a leitura. A parede do DJ é uma janela estreita (±12°), então as estátuas laterais ficam a 11–24 m do caminho e as gigantes passam com o vão das pernas em cima dele.
