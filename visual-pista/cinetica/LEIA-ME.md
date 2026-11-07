# Cinética

Quarta leva em 3D, do mesmo ponto de vista: em pé no meio da pista, olhos a 1,60 m. Os personagens e o céu são os da Marca, mas a linguagem muda: em vez de um corpo liso de espelho, escultura feita de muitas peças de inox que se mexem. O personagem aparece no conjunto, e o som anda de peça em peça. Céu, estrelas e letreiro são iguais aos da Marca, e o letreiro reveza CLUBE com Pista Quente e Millos Kaiser.

Endereço: `cinetica/?modo=camadas`, `relevo`, `cabos`, `agulhas` ou `brise`.

## Modos

| Modo | Id no app | No app | Peça | O que faz |
|---|---|---|---|---|
| `camadas` | `c-camadas` | Camadas | Chapas de través | O corpo cortado em 36 fatias, que viram como páginas. O bumbo desce da cabeça aos pés, e cada chapa escuta uma faixa. A cada 48 tempos corre uma volta pelo corpo; a cada 112 entra outro personagem. |
| `relevo` | `c-relevo` | Relevo | Curvas de nível | O corpo deitado, cortado em chapas paralelas ao teto. Cada nível escuta uma faixa, e a pilha abre quando o som sobe. |
| `cabos` | `c-cabos` | Harpa de cabos | 150 cabos | Cabos de aço correm até a parede. O personagem passa por trás e empurra os cabos, e cada cabo vibra na sua faixa. |
| `agulhas` | `c-agulhas` | Agulhas | 12 mil hastes | Uma tela de alfinetes. O campo fica nos degraus da grade da marca, com blocos abertos para o céu. O personagem atravessa o campo, e as hastes descem com ele. |
| `brise` | `c-brise` | Brise | 6 mil lâminas | O teto fechado por lâminas de inox. Elas abrem no desenho do personagem, e pelo vão aparece o céu. A grade da marca está no ângulo de cada lâmina. |

## Como reage ao som

- **Peças:** cada peça escuta uma faixa, sempre por mola ou com atraso, para o metal não tremer.
- **Bumbo:** anda pelo espaço, nunca bate em tudo ao mesmo tempo.
- **Reflexo:** cada painel de luz que o inox reflete escuta uma faixa, como na Marca. Nos cabos, são as luzes que correm pelo fio.
- **App:** a chave `reflexo` da tela de reações desliga tudo isso, e estrelas, luz, booth e logo seguem as próprias chaves.

## Regras que valem aqui

- **Peça comprida no sentido do painel:** cabos, lâminas e riscos correm ao longo do painel, onde o sinal tem resolução de sobra. Linha de través serrilha.
- **Risco só muda com x:** ruído nos dois eixos vira papel-alumínio amassado.
- **Lado da haste apagado:** quem desenha é a ponta. Com o lado aceso, as hastes escondem o personagem.
- **Lâmina aberta fica escura:** o personagem é o vão.
- **Fios só na cena de cabos:** o cálculo roda em JS, são 42 mil pontos por quadro.
- **Sem O Curador (figura h):** ele segura um disco de vinil.

## Arquivos

- `cinetica.js`: cópia do motor da Marca, com chapas, material de lâmina (9) e agulha (10), e os cabos.
- `cenas.js`: uma função por modo, em metros, com o olho na origem.
- `assar_placas.py`: lê os OBJ de `Desktop\CLUBE`, faz um sólido por votação de três eixos, porque a malha da IA tem furos, e gera `dados/`. Roda com `..\perspectiva\.venv\Scripts\python.exe assar_placas.py` e usa funções de `..\marca\assar.py`.
- Usa `../espaco/maestro.js`, `../espaco/brilhinhos.js`, `../espaco/dados/materiais.png` e os letreiros do Espaço.
