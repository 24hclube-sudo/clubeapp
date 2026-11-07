# Pedra

Rochas pretas com micronúmeros que brilham como código (referência: a pedra de números de Terumasa Ikeda que o usuário mandou em 07/11/2026), o logo e os personagens recortados em pedra, e tetos de placas de travertino que puxam para o marrom, como a laje da outra referência.

Visto do olho a 1,60 m, como o Espaço e a Marca: cada ponto do painel é um raio de visão. Tudo é simétrico em x.

Endereço: `pedra/?modo=logo`, `campo`, `estelas`, `corte`, `lajes` ou `degraus`.

## Modos

| Modo | Id no app | No app | O que faz |
|---|---|---|---|
| `logo` | `p-logo` | Logo de pedra | O letreiro da parede em rocha preta, com a frente polida e coberta de números. No céu, pares de rochas com faces de código. |
| `campo` | `p-campo` | Campo de rochas | Mais rochas, menores, e uma grande no meio que abre como um livro a cada 32 tempos: as duas faces de dentro são de números. |
| `estelas` | `p-estelas` | Personagens de pedra | Um personagem de cada vez, recortado numa laje de pedra preta, deitado no teto. O desenho dele aparece nos números. Entra pelas costas, fica e sobe. |
| `corte` | `p-corte` | Rocha fatiada | Uma rocha de 4 m deitada ao longo do teto, cortada em 7 fatias que abrem em leque a cada 32 tempos. |
| `lajes` | `p-lajes` | Lajes de travertino | Teto de placas de travertino, face apicoada e lateral lascada, com o pé recuado da referência. Fecha, abre de dentro para fora e da parede para a entrada, fica aberto 64 tempos e fecha. |
| `degraus` | `p-degraus` | Degraus de pedra | Três caixotões em pirâmide invertida, de pedra; os anéis sobem e descem como telescópio. No alto, o céu. |

Na parede, CLUBE, Pista Quente e Millos Kaiser revezam a cada 32 tempos (CLUBE volta entre os outros). Na troca, os números embaralham e acendem.

## Como reage ao som

- **Bumbo:** uma onda corre da parede para a entrada; por onde passa, os números trocam e acendem. Uma barra de luz corre embaixo do teto e aparece no reflexo das faces polidas.
- **Grave:** a luz do booth e o brilho dos números respiram.
- **Agudo:** os números trocam mais rápido.
- **Sem música:** os números trocam devagar e nada pisca.

## Como é feito

- **Rochas:** 12 formas (monólito, laje, bloco, lasca, seixo, cunha) nascem a cada abertura da página (`?semente=n` repete uma). Cada uma é um poliedro de faces largas com lascas em concha arrancadas da superfície, como carvão e obsidiana, e algumas têm uma fenda. Vão para um volume 3D de 80³ por rocha na placa de vídeo; o raio anda nesse volume.
- **Corte polido:** um plano exato por cima do volume, por isso a face fica lisa e a borda é de pedra quebrada. A camada de números fica 2 mm abaixo do vidro: muda de lugar com o ângulo.
- **Números:** fonte de 3x5 pontos, filtrada pelo tamanho do ponto do painel. Número menor que o ponto vira um tracinho e depois a média, sem cintilar. No teto a casa cresce com a distância (`casaPara` em `cenas.js`): o número precisa de uns 18 pontos de altura para sobreviver ao corte de linhas do sinal.
- **Cor:** manchas grandes de violeta, azul, ciano e verde, como no vídeo, com um rosa e um âmbar raros.
- **Personagens:** silhuetas de `../marca/dados/figura-*.png`, em campo de distância (`assar.py` gera `dados/figura-sdf-*.png`). Sem O Curador (h), por causa do vinil. Deitado no teto, a cabeça aponta para -z: quem olha para a frente vê o lado de perto em cima.
- **Travertino:** cor em `PEDRA` de `cenas.js`. Face apicoada com nuvem de tom, veios e poros pequenos; lateral lascada só nos lados.
- **Brilho:** bloom em cascata com média de Karis no primeiro passo, ACES e sRGB no fim.
- **Custo:** calcula metade das linhas (`?linhas=0.5`) e estica, porque o sinal só leva 1 linha em 2,63. As seis cenas fecham 60 q/s em 1032x5676 com o LED no ar na mesma placa.

## Arquivos

- `pedra.js`: motor, volume das rochas, materiais, números, luz, brilho e saída.
- `cenas.js`: onde fica cada peça em cada quadro, em metros, com o olho na origem.
- `assar.py`: silhuetas dos personagens. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py`.
