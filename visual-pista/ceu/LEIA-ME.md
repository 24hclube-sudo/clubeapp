# Céu 3D

O teto e a parede do LED são janelas para um mesmo espaço, desenhado em 3D de verdade e visto de um ponto só: o olho da foto 07, no meio da pista, a 4,39 m da parede. O teto fica 1,35 m acima desse olho (`perspectiva/geometria.py`).

Só entram cimento queimado, inox, preto e estrelas brancas. Sem Pista Quente e sem Millos. Na parede fica sempre o logo do CLUBE em inox polido, com espessura real.

## Modos

Endereço: `ceu/?modo=concreto`, `teto`, `caixotoes` ou `porticos`.

| Modo | No app | O que faz |
|---|---|---|
| `concreto` | Concreto abrindo | Laje de cimento queimado com furos de tirante. A cada dois bumbos uma placa desce um palmo, se solta e sobe, girando. Ficam a fila da parede e a da entrada. |
| `teto` | Teto automático | Chapas de inox escovado abrem ao meio em camadas, do vão da parede para a entrada, com a fita de luz na ponta. As travessas ficam paradas e riscam a perspectiva. |
| `caixotoes` | Caixotões | Laje nervurada funda. Cada poço tem uma tampa, que segue uma faixa do som. O bumbo corre da parede para a entrada e traz as tampas para fora do teto. Em algumas frases, tampas sobem e abrem óculos para o céu. |
| `porticos` | Pórticos de inox | Voo por pórticos de inox até o ponto de fuga na parede. A fita de cada pórtico segue uma faixa do som. As longarinas ligam o teto à parede. |

Só `concreto` e `teto` têm ciclo: fechado, abrindo, aberto por 64 batidas e fechando. `?estado=aberto` ou `?estado=fechado` para no estado pedido.

## Som

- **Bumbo:** o logo vem para a frente, uma faixa de luz atravessa as letras e uma varredura de luz corre pelo teto.
- **Grave:** a luz atrás do logo e o reflexo do inox respiram.
- **Faixas:** cada placa, tampa ou fita segue uma faixa, com ganho automático.
- **Estrelas:** cintilam cada uma com uma faixa e andam devagar, as mais baixas mais rápido, o que dá profundidade.

## Grade do LED

Nenhuma superfície é lisa: cimento e inox têm mancha, risco e grão em `dados/materiais.png`. As juntas não caem nas emendas dos módulos de 16 cm. Só dá para julgar olhando o LED.

## Arquivos

- `ceu.js`: motor, câmera das duas janelas, estrelas, logo e materiais.
- `cenas.js`: onde ficam as caixas em cada quadro, em metros, com o olho na origem.
- `assar.py`: gera `dados/materiais.png` e `dados/logo-sdf.png`. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py`. Não usa foto nem banco de textura: é tudo gerado por código, e o logo vem de `assets/clube.png`.
