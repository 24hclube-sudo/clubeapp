# Firmamento

Sexta leva 3D. O céu é o personagem. Teto e parede do LED são janelas para o mesmo céu, vistas por quem está em pé na pista, com os olhos a 1,60 m. Por cima ficam as estrelas nítidas, as cadentes e o logo em prata do Espaço. Tudo em tons de prata, sem cor.

Endereço: `firmamento/?modo=lactea`, `rastros`, `aurora`, `eclipse`, `aneis` ou `horizonte`.

## Céus

| Modo | Id no app | O que faz |
|---|---|---|
| `lactea` | `f-lactea` | Via Láctea em ruído dobrado e achatado no plano da galáxia, com filamentos de poeira. O núcleo nasce atrás do logo. Há espelho d'água abaixo da linha do horizonte. |
| `rastros` | `f-rastros` | Arcos de longa exposição em volta do polo, que fica no teto, perto da parede. Todos cobrem o mesmo ângulo, como numa foto. O som alonga os arcos. |
| `aurora` | `f-aurora` | Cortinas marchadas por altura, com raios verticais que convergem para o zênite. Há espelho d'água. |
| `eclipse` | `f-eclipse` | Lua preta atrás do logo, coroa em lobos, plumas e fios, sem linha em volta da lua, e conta de diamante no bumbo. A luz de trás do app soma na coroa. |
| `aneis` | `f-aneis` | Plano dos anéis que sobe para a parede, por isso os riscos convergem para um ponto de fuga no teto. O perfil tem 8192 pontos com mipmaps, sem moiré. O bumbo anda ao longo dos anéis. Um planeta preto nasce atrás do logo, com a atmosfera acesa. |
| `horizonte` | `f-horizonte` | Buraco negro traçado raio a raio, até 110 passos por pixel, com disco, Doppler e anel de fótons. As estrelas nítidas passam por uma lente fina e viram duas imagens. O bumbo acende um ponto quente que orbita. |

## Som

- **Céu:** item `ceu` em `/reacoes.html`, padrão grave. Muda o brilho e faz o céu andar mais depressa (`fluxo`). Sem música, o céu fica escuro e anda bem devagar.
- **Estrelas:** item `estrelas`, a mesma regra do Espaço. Sem música, ficam paradas e fracas.
- **Logo, brilhinhos, booth, cadentes e luz de trás:** os mesmos itens do Espaço.

## Motor

- O céu é calculado num alvo próprio de 16 bits (`res` em `ceus.js`, fração do painel). Depois entra sobre as estrelas, e o alfa dele diz quanto delas passa: lua, planeta e anel tapam mesmo.
- A aurora e o buraco negro somam quadros (`acumula`), com o ponto de amostra deslocado a cada quadro, para limpar serrilhado e ruído sem grão.
- Linha fina usa a medida do corte do sinal (`CORTE_C`): vai mais larga no sentido em que o sinal só leva 1 linha a cada 2,63 do painel.
- O cruzamento do ruído perto de (0, 0) não é aleatório: `rn()` desloca a origem para longe. Sem isso, aparecia uma emenda sobre a cabeça.
- Estrela do teto só vai até a parede. Além dela, cairia amontoada no alto da parede.

## Teste

`?simsom=1` simula música a 124 BPM, sem passar pela entrada. `?nivel=0` fixa o nível do céu. `?letreiro=clube` fixa o logo. `?meteoro=9999` adia a primeira cadente. Foto fora da tela: `universo\saida\foto.js`.

## Arquivos

- `firmamento.js`: motor, janelas, estrelas, cadentes e logo.
- `ceus.js`: um objeto por céu, com o WGSL dele e os parâmetros.
- Usa `espaco/maestro.js`, `espaco/brilhinhos.js` e `espaco/dados/`. Mudanças neles valem aqui também.
