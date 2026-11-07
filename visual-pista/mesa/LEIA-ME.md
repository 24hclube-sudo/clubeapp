# Mesa dos visuais da pista

Tela com seta para passar pelos visuais, vendo cada um na foto da pista e no painel chapado.

- **Abrir:** config "visual-pista" (`C:\apps\.claude\launch.json`), `http://localhost:5210/mesa/`.
- **Seta (ou ← →):** troca só a prévia. Não mexe no LED.
- **Mandar para o LED:** o visual aberto na mesa vai para a saída Spout "Visual CLUBE" e o MadMapper mostra nas superfícies LED PISTA e LED DJ FUNDO.
- **Tirar do LED:** apaga o painel (LED PISTA e LED DJ FUNDO em opacidade 0). Igual à chave do app. Desde 06/11 não devolve o que estava antes.
- **Som:** a saída para o LED ouve a entrada "Microfone (Realtek)" do PC. O painel do app bloqueia o microfone, então a prévia recebe a análise que a saída faz (`audio=saida`, fluxo em `127.0.0.1:5212/som`). Com a saída fechada, ou sem música na entrada, os visuais seguem uma batida interna; o medidor "Som" da mesa diz qual é o caso. "Usar batida de teste" serve só para ver sem música.
- **Troca:** o próximo visual carrega por trás e só entra quando já está desenhando, na tela e no LED. Sem tela preta.

## Visuais

| Nome | Página | O que é |
| --- | --- | --- |
| Derrete (opção 1) | `pista-quente/derrete/` | Gibi da Pista Quente sobre o degradê do CLUBE. Tudo escorre para a parede do DJ. |
| Brinquedos 3D (opção 2) | `universo/?mundo=quente` | Personagens infláveis, estátuas de cromo e pedras em brasa. |
| Ondas (opção 3) | `pista-quente/ondas/` | O som sai da parede do DJ e anda pelo teto em blocos do tamanho dos módulos do LED. |
| Placa dourada e Placa prateada | `placa/?metal=ouro` e `placa/?metal=prata` | Chapa de metal com logo, figuras e moldura em alto-relevo. O relevo fica; o reflexo anda com o som. Ver `placa\LEIA-ME.md`. |
| Latão minimalista | `placa/?metal=latao` | Chapa de latão quase vazia, um pouco oxidada, com um único relevo baixo. |
| Brutal | `brutal/` | Fundo preto e massas de concreto bruto que apanham da música. Ver `brutal\LEIA-ME.md`. |
| Luz | `luz/` | O painel como luminária: tubos e lâmpadas que esfriam como tungstênio. Ver `luz\LEIA-ME.md`. |
| Universo CLUBE | `universo/` | Mundo do vídeo do H3 em tempo real. |
| Lâminas | `/` (Three.js) | O primeiro visual. |
| Vídeos H3 | `perspectiva/saidas/*.mp4` | Só para comparar; não reagem ao som nem têm botão de LED. |

## Saída para o LED (`saida\`)

- **Abre com o Windows** (atalho "Visual LED" na pasta Inicializar, desde 06/11). Espera o MadMapper abrir, que leva uns 2 min, e deixa o LED como estava: ligado com o último visual e o brilho do app, ou apagado se alguém desligou (`led-ligado.txt`).
- `iniciar.vbs` abre, `parar.vbs` fecha soltando o Spout.
- O app abre a saída pela tarefa agendada "CLUBE Visual LED", porque o servidor roda na sessão 0, sem área de trabalho.
- O Resolume Arena saiu da inicialização: ele tomava a saída do LED. O atalho está em `saida\fora-do-inicio`.
- Usa o Electron e o Python de `C:\apps\radio-saida` e o `saida.py` + `textura.py` de `visual-pista\saida`.
- `config.json`: `fps`, `audio`, `nome`. `saida.log`: quadros por segundo e o que a página ouve.
- Conversa em `127.0.0.1:5212`: `GET /estado`, `POST /led?visual=<id>`, `POST /led?tirar=1`.
- Para lançar a partir do app do Claude: `explorer.exe ...\iniciar.vbs`. Assim ele sai sem as variáveis do Chromium e não morre junto com a sessão.

## Arte

`pista-quente\originais` = PNGs da pasta "ID" do Drive da Pista Quente. `pista-quente\preparar.py` faz o atlas; `universo\assar.py` faz os voxels dos personagens e dos letreiros.
Do Millos Kaiser não há foto nem logo: entra o nome. Os discos que eu tinha posto saíram a pedido (05/11); o único vinil que sobra é o do desenho "Nuvem" da Pista Quente, no Derrete.

## O que mexe no projeto do MadMapper

A mídia Spout aparece sozinha no projeto aberto. O botão troca a mídia e a opacidade, acerta a entrada para 1032x5676 (x 0; y 0,1212 na pista e -0,8788 no fundo), mostra as duas superfícies, esconde as que cobririam o visual (LED PISTA 5, LED 3X, LED DJ LOGO) e liga a tela cheia. Nada disso é salvo no `.mad` sem pedir.

**Nunca ler a raiz do OSCQuery (`http://127.0.0.1:8010/`) com o LED no ar.** Com o PROJETO CLUBE ela tem 1,7 MB, e montar a resposta congela a imagem por 300–600 ms. Medido em 06/11: um engasgo a cada leitura. Ler um valor por vez (`/surfaces/LED_PISTA/opacity`), que leva 6–30 ms.

Em 05/11 a LED DJ FUNDO ficou com a imagem 178 vezes menor depois de um teste, com o OSC lendo tudo certo. Foi corrigida ao vivo com `/surfaces/LED_DJ_FUNDO/input/scale 0.00562`. Se a parede do DJ aparecer preta com um pontinho no meio, é isso: conferir com uma captura da DISPLAY3 e medir a escala de novo (a largura da imagem é proporcional a 1/escala).

## Som: o que aprendi medindo a entrada (05/11)

- Às 16:10 e às 16:30 a música chegava estourada: 34% das amostras no teto, RMS +7 a +9 dB e pico +10,7 dB (o Microfone está em 77% = +10,7 dB no Windows). Entre as duas, chegava só ruído de cabo, por volta de -18 dB, com pulso regular de interferência.
- `js/audio.js` agora mede tudo em dB em relação ao sobe e desce recente de cada faixa, então aguenta sinal estourado. Conferido com música estourada gravada (119 BPM, um bumbo por batida), faixa limpa (123 BPM) e ruído (não dispara como música). Ao vivo: 120 bumbos por minuto a 121 BPM, grave, médio e agudo usando a escala inteira.
- Baixar o nível da entrada ainda melhora: som menos estourado separa melhor bumbo e agudo. Gravações de teste em `mesa\testes`; para repetir, `mesa/diag-som?audio=arquivo:/mesa/testes/<arquivo>` (sem `.html`, senão o servidor perde o parâmetro).

## Tela de frente: por que parece com pouca resolução

A processadora recebe 3840x2160 e estica para 1032x5676. Na vertical, são 2160 linhas para 5676 fileiras de LED: a parede do DJ (688 fileiras) recebe 262 linhas. No teto isso não aparece porque se olha de lado; a parede é vista de frente.
O `?led` da saída filtra a imagem na vertical na medida desse corte (Lanczos), para a borda não virar escada, e os letreiros da parede são grandes. Isso melhora, mas não cria linhas novas. Para ter a parede nativa seria preciso mudar na processadora: uma camada só para a parede, com recorte 1:1 de 1032x688 (ou uma segunda entrada).
