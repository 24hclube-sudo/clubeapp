# Marca

Terceira leva em 3D, do mesmo ponto de vista do Espaço: em pé no meio da pista, olhos a 1,60 m. Aqui entra a identidade do CLUBE: personagens, logo e grade, tudo em inox sobre preto e estrelas. O letreiro da parede reveza CLUBE com Pista Quente e Millos Kaiser, como no Espaço (`?letreiro=clube|pista|millos` fixa um), e nada passa na frente dele.

Endereço: `marca/?modo=grade`, `colossos`, `travessia`, `instancia` ou `monolito`.

## Modos

| Modo | Id no app | No app | O que faz |
|---|---|---|---|
| `grade` | `m-grade` | Grade de inox | O sorteio de blocos do Grid Motion Studio em chapas espelhadas e caneladas. As linhas respiram, e a cada 64 tempos a composição sobe e outra desce. |
| `colossos` | `m-colossos` | Colossos | Dois personagens de 34 m, um à frente e outro atrás de quem olha. A cada 120 tempos, afundam e sobem outros dois. |
| `travessia` | `m-travessia` | Travessia | Personagens deitados cruzam o céu em direção à parede, acima de uma grade de inox. |
| `instancia` | `m-instancia` | Instância | O teto é uma laje de blocos. Eles se soltam, montam um personagem no céu e voltam. |
| `monolito` | `m-monolito` | Monólito | As cinco letras do logo como blocos de inox no teto. Uma de cada vez dá uma volta lenta. |

`?estado=figura` para a Instância com a figura montada.

## Como reage ao som

O metal pesa e não dança. O som entra por quatro caminhos:

- **Reflexo:** o inox reflete uma sala de painéis de luz, e cada painel escuta uma faixa do som. É a reação principal.
- **Onda no corpo:** o bumbo sobe pelo personagem como ondulação em metal líquido. O corpo fica parado, e só o reflexo se mexe.
- **Peso:** os blocos descem com as faixas, por mola, e o bumbo anda da parede para a entrada.
- **Estrelas e logo:** iguais ao Espaço.

## Material

- **Reflexo:** o horizonte é o gradiente metal do brand book, nas oito paradas.
- **Inox espelhado (7) e canelado (8):** a canelura é a dos blocos da marca e corre ao longo do painel, onde o sinal tem resolução de sobra.
- **Corpos:** só painéis grandes e de borda macia. Painel pequeno vira mosaico, e borda dura vira papel-alumínio amassado.

## Regras que valem aqui

- **Sem O Curador (figura h):** ele segura um disco de vinil, elemento que o usuário pediu para não voltar.
- **O LED é um vão:** o que está do lado de cá do plano não aparece. Sem isso, um braço passaria na frente da parede.
- **Figura perto do teto vira só uma barriga:** do olho, o tamanho no teto é altura x 0,75 / y. Por isso a figura fica a cerca de 2,4 m do olho.
- **Corpo não gira inteiro na Travessia e na Instância:** balança, senão o braço desce para dentro da sala.

## Arquivos

- `marca.js`: motor, janelas, materiais, estrelas e logo.
- `cenas.js`: onde fica cada peça em cada quadro, em metros, com o olho na origem.
- `assar.py`: lê os OBJ de `Desktop\CLUBE` e gera `dados/`. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py`. As malhas vêm de IA e são alisadas aqui.
- Usa `../espaco/maestro.js`, `../espaco/dados/materiais.png` e `../espaco/dados/letreiro-clube.png`.
