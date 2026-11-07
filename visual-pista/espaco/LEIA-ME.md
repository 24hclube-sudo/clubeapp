# Espaço

Segunda leva do céu em 3D. Os quatro visuais de `../ceu` continuam como estavam. Aqui o teto e a parede do LED são janelas para um mesmo espaço, vistas por quem está em pé no meio da pista, com os olhos a 1,60 m e a 4,39 m da parede.

Endereço: `espaco/?modo=concreto`, `teto`, `caixotoes` ou `porticos`. `?olho=1.60` muda a altura do olho; o pé-direito de 2,35 m vem da foto 07.

## O que muda em relação ao `ceu`

- **Sem grão:** cimento e inox só têm variação larga. Nada de ruído fino nem de poros.
- **A arquitetura não dança:** placas, chapas e tampas andam sozinhas e devagar, no próprio tempo.
- **Quem reage ao som:** as estrelas e o letreiro.
- **Estrelas:** cerca de 40% ficam sempre acesas; as outras só aparecem conforme o grave sobe. O grave vai de 0 a 1 entre o vale e o pico dos últimos segundos, para pulsar mesmo com a entrada estourada. O tamanho nunca muda, só o brilho.
- **Estrelas cadentes:** um traço fino a cada 3 a 9 s, no máximo 3 ao mesmo tempo, sem relação com o som.
- **Inox:** brilho anisotrópico de Ward, com o risco no sentido do lado mais comprido da peça. O risco aparece dentro da luz, não como grão no escuro.

## Modos

| Modo | No app | O que faz |
|---|---|---|
| `concreto` | Concreto abrindo | Uma placa a cada 1,5 s desce um palmo, se solta e sobe. Aberto por 50 s; depois as placas voltam devagar. |
| `teto` | Teto automático | As chapas abrem em 24 s, do vão da parede para a entrada. Aberto por 50 s. Fecham em 18 s. |
| `caixotoes` | Caixotões | Poços grandes e rasos, abertos para o céu. Uma faixa de tampas anda da parede para a entrada a cada 90 s. |
| `porticos` | Pórticos de inox | Voo contínuo, um pórtico a cada 4 tempos. O fundo some no preto. |

`?estado=aberto` ou `?estado=fechado` para no estado pedido, em `concreto` e `teto`.

## Letreiro

Fica na parede, em inox, sempre sobre o que estiver lá. Roteiro: CLUBE 38 s, Pista Quente 10 s, CLUBE 38 s, Millos Kaiser 10 s, com 1,1 s derretendo de um para o outro. `?letreiro=clube|pista|millos` fixa um deles.

Reage ao som: vem para a frente no bumbo, por mola, e a luz atrás dele segue o grave.

**Por que não serrilha:** o sinal só leva 1 linha a cada 2,63 do painel. A parede tem 262 linhas para 688 fileiras de LED. Por isso a borda da letra se abre 2,63 vezes mais na vertical do que na horizontal, e a frente é um degradê largo, sem linha fina. O logo fica macio, mas a limitação de resolução continua.

## Arquivos

- `espaco.js`: motor, janelas, materiais, estrelas, estrelas cadentes e letreiro.
- `cenas.js`: onde ficam as caixas em cada quadro, em metros, com o olho na origem.
- `maestro.js`: BPM firme, bumbo e grave normalizado.
- `assar.py`: gera `dados/`. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py`. Não usa foto nem banco de textura.
