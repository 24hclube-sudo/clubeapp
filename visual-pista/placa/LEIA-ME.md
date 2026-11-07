# Placa de metal (dourada e prateada)

Visual em tempo real para o LED da pista (1032x5676, teto + parede do DJ): uma chapa de metal com tudo em alto-relevo. O relevo é fixo; o que anda é o reflexo, e o som entra como luz e como onda na chapa.

- **Abrir:** Mesa, `http://localhost:5210/mesa/`, "Placa dourada" e "Placa prateada". Sozinha: `placa/?metal=ouro` ou `placa/?metal=prata`.
- **Latão minimalista:** "Latão minimalista" na Mesa, ou `placa/?metal=latao`. Chapa quase vazia, oxidação leve, um único relevo baixo e o logo na parede.
- **Prévias:** `previa.jpg` (ouro e prata), `previa-latao.jpg`, `previa-sala.jpg` (as três na foto da pista).

## Endereço

| Parâmetro | Valores | O que faz |
| --- | --- | --- |
| `metal` | `ouro` (padrão), `prata`, `latao` | Ouro e prata mudam só a cor e a exposição; a prata abre nas moedas. O latão tem composições próprias, oxidação e luz mais macia |
| `comp` | `sol`, `medalhas`, `matelasse`, `festa`; no latão, `latao-logo`, `latao-figura`, `latao-disco` | Fica só nessa composição, sem trocar |
| `troca` | 64 | Batidas em cada composição (64 é cerca de 31 s a 124 BPM) |
| `relevo` | 1 | Força do relevo |
| `teto` | 1 | Quanto o teto sai mais quente, para compensar o ângulo de visão. `0` desliga |
| `brilho` | 1 | Brilho final |
| `saida`, `escala`, `audio`, `bpm` | | Iguais aos outros visuais (`pista-quente/nucleo.js`) |

## Composições

- **sol:** leque art déco saindo do logo na parede, com duas figuras e o logo na entrada.
- **medalhas:** quatro moedas com aro serrilhado, fundo girado no torno e uma figura em cada.
- **matelasse:** chapa capitonada com tachinhas, placa com o logo e uma figura.
- **festa:** soft opening, Millos Kaiser, 07.11, Pista Quente e a figura com o disco. **Tirar depois da festa:** apagar `festa` de `COMPOSICOES` em `assar.py` e assar de novo.

A troca é uma passagem: a composição nova sobe da parede do DJ até a entrada, em 8 batidas, enquanto a antiga afunda.

## Como reage ao som

- **Bumbo:** sai do logo na parede e corre pelo teto como um lençol de luz (cerca de 3 s até a entrada). O relevo salta por onde ele passa.
- **Graves:** o relevo respira.
- **Médios:** a faixa larga de luz fica mais forte.
- **Agudos:** faíscas nas arestas polidas.
- **Faixas do espectro:** ondulam a chapa, do meio para as beiradas.
- **A luz segue a batida:** faixas atravessam a chapa e a luz principal muda de lado devagar, a cada 64 batidas.

## Arquivos

- `assar.py`: monta o relevo e grava `dados/` (cerca de 18 MB por composição). Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py [composição]`.
- `placa.js`: som, roteiro e shader do metal. As paletas estão em `PALETAS`.

## Parede e teto com o mesmo tom

Em 05/11 a parede do DJ refletia outra parte da luz e saía com outro tom. Tirei isso: os dois usam a mesma conta. Medido na saída real com o latão: teto com matiz 40,4 e brilho 0,33; parede com matiz 40,6 e brilho 0,34. A cor das superfícies no MadMapper é igual (#B3B3B3). Com o sinal igual, o olho ainda via a parede mais dourada e o teto mais amarelado. A parede é vista de frente e o teto de lado, então a hipótese é o ângulo do SMD (não testada no local).

Por isso o teto das placas sai de propósito mais quente: vermelho x1,045, verde e azul x0,97 (`AJUSTE_TETO` em `placa.js`). Na saída, o teto fica cerca de 4° de matiz abaixo da parede (cerca de 36 contra 40). Parâmetro `teto`: `0` desliga, `1` é o padrão, `1.5` reforça. A cor no MadMapper não muda, e os outros visuais também não.

## Armadilhas

- `smoothstep` com as pontas invertidas é indefinido no WGSL: usar `1. - smoothstep(a, b, x)`.
- Figura larga estoura o painel: a largura fica em cerca de 0,7 a 0,83 da altura, então a altura máxima é perto de 1200 px.
- Foto em resolução cheia pelo evento `paint` do Electron: gravar o PNG segura o processo e os quadros entram em fila, então a foto sai atrasada. Guardar só o último quadro e gravar por relógio.
