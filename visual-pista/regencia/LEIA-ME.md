# Regência

Sétima leva. As cenas entendem a música: cada instrumento tem um elemento, e a seção diz quais elementos aparecem. Junto vêm o diretor automático e a camada de cor.

## O que tem aqui

| Arquivo | O que faz |
|---|---|
| `analise.mjs` | A análise da faixa, sem nada de navegador. Grade (batida, compasso, frase), seção, energia, tensão, instrumentos, tom em Camelot e troca de música. |
| `ouvido.html`, `coletor.js` | Janela escondida da saída, sempre aberta. A grade não recomeça quando o visual troca. Fala com as páginas por `BroadcastChannel('clube-faixa')` e com a saída por `POST /diretor/analise`. |
| `regente.js` | Dentro de cada página: recebe a análise e prevê a batida, para o golpe cair na hora. `?sim=roteiro` ou `?sim=<seção>` simula a música. |
| `regencia.js` | O motor. É o do Firmamento, com partitura, elementos, simulação própria (`criar`/`passo`) e dados por cena (`C.arr`). |
| `cenas.js` | As cenas. |
| `diretor.cjs` | Roda em `mesa\saida\main.js`. Decide elementos e troca de cena, em cima da batida. |
| `cor.js` | A camada de cor. Entra por `flash-pagina.js`. |
| `aplicar-saida.py`, `aplicar-app.py` | Acrescentam tudo isso por trecho na saída e no app, sem copiar arquivo inteiro. |
| `testar-analise.mjs` | Roda a análise em música de verdade, fora do LED. |
| `foto.mjs`, `vista.mjs`, `foto-cor.js` | Foto fora da tela, vista de olho (a foto do painel deitado engana) e conferência da cor. |

## Seções

`silencio`, `calmo`, `groove`, `pico`, `break`, `build`, `drop`.

- **Bumbo presente:** houve golpe perto da grade (o detector se ajusta sozinho) e no nível de sempre. A subida em dB sozinha engana: quando o baixo entra entre os bumbos, ela cai de 68 para 18 dB com o bumbo ainda lá.
- **Break:** 8 tempos sem bumbo. Menos que isso é virada de bateria.
- **Build:** tensão alta, pela subida de chimbal, brilho e densidade nos últimos 16 tempos.
- **Drop:** bumbo forte de volta depois de pelo menos 12 tempos sem ele. Vale dentro do próprio passo, sem esperar a batida acabar. Bumbo solto no meio do break não conta.

## Cenas

| Id | Nome | Bumbo | Palma | Chimbal | Baixo | Voz | No drop |
|---|---|---|---|---|---|---|---|
| `r-feixes` | Feixes | feixes de frente | feixes de trás | um grupo corre | feixes de trás e névoa | | todos abrem |
| `r-astrolabio` | Astrolábio | anel avança um dente | anel vira 90° | fita de luz corre | anel balança | anel fino abre | túnel em volta do logo |
| `r-mercurio` | Mercúrio | onda sai do booth | onda no teto | gota | | | onda grande |
| `r-micelio` | Micélio | onda acelera e acende as veias | | | | | todos fogem do logo |
| `r-enxame` | Enxame | empurrão a partir do logo | | | | | explode e forma um personagem |

As cenas de moving head e laser (`cenas-luz.js`) são sempre simétricas: calculam uma metade e dobram o olhar no eixo. Para o feixe seguir depois de cruzar o eixo, o olhar também pergunta pelo lado de lá.

Um feixe que sobe inclinado some no ponto de fuga dele. A ponta do teto fica a 8,7° do horizonte, então, para chegar até lá, o feixe corre quase paralelo ao teto, num plano acima dele. O Feixes original acaba por volta da linha 1285 de 4988.

| Id | Nome | Bumbo | Palma | Chimbal | Baixo | No drop |
|---|---|---|---|---|---|---|
| `r-nave` | Nave | todas as costelas | as pares | pulso corre até o fundo | abre o feixe | abre e muda o desenho |
| `r-eixo` | Eixo | acende | eixo central | anda do centro para fora | abre o feixe | abre e muda o desenho |
| `r-losango` | Losango | lado do booth | lado do fundo | um feixe anda | abre o feixe | a treliça abre |
| `r-cordas` | Cordas | corre pelas cordas | corda central | as agudas tremem | as graves tremem | todas |
| `r-lamina` | Lâmina | acende | leque do fundo | acende | a varredura empurra | abre tudo |
| `r-portal` | Portal | manda um pórtico embora | | acende | abre o corredor | acende os trilhos |

Mercúrio no build: cimática, na frequência de ressonância da grade, apertando com a tensão. Feixes no build: fecham no centro e o portão acelera, até 4 por batida, nunca mais que isso, para não virar strobo sem ninguém pedir.

Cena nova: objeto em `cenas.js` com `res`, `estrelas`, `partitura`, `wgsl` (`ceuEm(v)`), e se precisar `iniciar`, `quadro`, `ritmo` e `criar`. Depois: `VISUAIS` em `main.js` e em `tv-player\visuais-led.js`, `GRUPOS` em `diretor.cjs`, miniatura em `public\visuais`.

## Camada de cor

Uma folha com `mix-blend-mode` por cima de tudo, embaixo do flash. Fora do ar, não existe na página.

- **Tingir tudo** (`color`): a cor toma o conteúdo, o preto segue preto.
- **Gelatina** (`multiply`), **Suave** (`soft-light`), **Duas cores** (degradê do fundo da pista até o booth).
- **Segue a música:** o tom em Camelot vira matiz, então tons vizinhos ficam em cores vizinhas. **Gira:** roda sozinha.

A cor passa depois pelo tom e pelo brilho do MadMapper, que multiplicam a imagem. Com o tom do teto quente, azul e ciano saem mais fracos no teto que na parede.

Estado em `mesa\saida\cor-camada.json`.

## Diretor

Estado em `mesa\saida\diretor.json`. Tudo começa desligado.

- **Elementos:** por seção, em `ELEMENTOS` de `diretor.cjs`. Valem por cima do que está em `/api/reacoes`, sem gravar nada: desligou, volta o que está no app. Acabamento e tamanho do logo não mudam. Vale em Firmamento, Espaço, Marca, Cinética e Regência.
- **Cenas:** a próxima carrega por trás e corta no tempo 1. Num build, deixa a cena forte pronta em ritmo baixo e corta no bumbo do drop. Se o drop não vier, solta.
- **À mão:** escolher um visual no app segura o diretor por 2 minutos.

## O que a análise não faz

- **Troca de faixa** num mix casado em andamento e em tom é só estimativa: timbre e harmonia também mudam dentro de uma faixa só. Por isso o app diz "quando a música muda". Silêncio e mudança de andamento são confiáveis.
- O **tempo 1** vem de harmonia e palma. Em trecho sem harmonia nem palma ele pode ficar fora por algumas batidas. O drop reancora a frase.
- A entrada estourada (+9 dB) piora chimbal e palma, porque o limite soma agudos falsos. Bumbo, andamento e seção aguentam.

## Conferido (07/11/2026)

- **Andamento:** 119,70 numa faixa rotulada 120; 118,00, 122,25 e 127,85 em faixas sem rótulo, estáveis. Num mix de teste a 124: 124,14.
- **Tom:** 8A em 86–91% do tempo, numa faixa rotulada 8A. Único rótulo disponível.
- **Drop e break:** conferidos pelo nível do sub, medido à parte pelo ffmpeg: *Burnin'* com drops em 1:00 e 2:00 (detectados em 1:01 e 2:01) e *Born in Blue* com drop em 6:12–6:14 (detectado em 6:14).
- **Custo:** a análise roda a cerca de 70 vezes o tempo real no Node.

## Teste sem encostar no LED

`mesa\saida-teste` é uma cópia da saída sem Spout e sem MadMapper, na porta 5213: `aplicar-saida.py` mais os remendos de teste. Ela ouve a entrada de verdade. Nunca matar `electron.exe` pelo nome: a saída do LED é o mesmo programa. Filtrar pela linha de comando.
