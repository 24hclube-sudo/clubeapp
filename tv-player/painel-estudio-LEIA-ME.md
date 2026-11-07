# Estúdio do painel do 1º andar

Tela para criar o que passa no painel fininho do térreo (4472 x 86 px, 8,32 m de parede). Abre tocando no cartão do painel no app, ou em `/painel-estudio.html`. A lista antiga de cenas e o brilho seguem no ícone de ajustes, em `/celular#/z/telas%3Aled%3A1`.

## Como funciona

O T50 do painel é um Chrome 73 e só toca vídeo com segurança. Então a peça é desenhada na prévia e, ao gerar, vira um vídeo no formato dobrado de 2752 x 172.

1. `public/painel-estudio/motor.js` desenha a faixa em canvas 2D. A prévia e o vídeo usam a mesma função. Tudo é função do tempo dentro do loop: o último quadro emenda no primeiro.
2. `painel-estudio.js` guarda as peças em `painel-estudio.json`, faz a fila de geração e converte os vídeos da marca. As cenas entram em `public/cenas.json` com `estudio: true`, e a lista antiga do app só mostra a que estiver no ar, para não tocar dezenas de prévias no celular.
3. `painel-render.js` abre `public/painel-estudio-render.html` num Electron escondido, sem GPU e com prioridade baixa. Conferido: o LED seguiu a 60 q/s durante a geração.

## Capítulos

`public/painel-estudio/capitulos.js` tem um capítulo por grupo de visuais do LED da pista, com o mesmo elenco e a mesma matéria. O campo `led` lista os ids de `VISUAIS` em `visuais-led.js`. **Visual novo no LED: acrescentar o id no capítulo que combina**, ou criar um capítulo novo e gerar o vídeo.

Com a chave "Painel segue o LED" ligada, o servidor olha o visual no ar a cada 2 s e, depois de 6 s parado, põe a peça mais recente que responde a ele. Visuais da Pista Quente usam a cena `akin-letreiro`. A chave começa desligada.

## Brand book

A biblioteca vem de `Desktop\CLUBE`: 10 figuras sólidas, 10 fragmentos, os vídeos do estado Instância, logo, CLUBE Bar, Bar, logomark e os vídeos de motion deles, Archivo, Mythshire, a paleta, os gradientes, o grid (varredura e alternância) e a sinalização. O `geral-2.png` da sinalização não entra, porque é uma prancha de mockups. As `textura-NN.png` do Grid Motion também não, porque são as amostras da paleta.

As regras ficam na própria tela: só há cores da paleta, a arte só escala por inteiro e a aba Camadas confere o resto (Mythshire em caixa alta, texto pequeno, fragmento como protagonista, logo recortado). O Curador (h) segura um vinil: está na biblioteca, mas fica fora do elenco e dos capítulos.

## Vídeos da marca

A versão leve é feita na primeira vez que alguém usa, em `public/painel-estudio/proxy` (figura: quadrado de 480 px; logo: 360 px de altura). O original fica em `Desktop\CLUBE\08. Sistema\clube-sistema\assets`: se essa pasta mudar de lugar, ajustar `ACERVO` em `painel-estudio.js`.

## Mexer

- Efeito novo: função em `EFEITOS` de `motor.js` e entrada em `EF` de `estudio.js`, com os controles.
- Tudo que anda precisa dar um número inteiro de voltas no loop. Depois de mudar, comparar o último quadro com o primeiro.
- Fase presa a uma cópia usa `kp`, não `k`: depois de uma volta, a mesma cópia tem outro `k`, e isso abre uma emenda.
- Refazer as listas: `catalogo-videos.json` e as pastas `arte`, `mini` e `mini-v` foram geradas uma vez a partir de `Desktop\CLUBE`.
