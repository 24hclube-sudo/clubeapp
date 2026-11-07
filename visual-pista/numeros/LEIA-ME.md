# Números

Os personagens gigantes do Colossos Todos (malhas 3D da agência) com pele de micronúmeros que brilham como código, no furta-cor da pedra de números da referência. Id `p-numeros`, "Personagens de código", grupo Pedra com código.

- `numeros.js` é gerado de `../marca/marca.js` por `fazer-numeros.js` (no rascunho da sessão de 07/11/2026): o Colossos continua intacto em `marca/`. Usa `../marca/cenas.js` e `../marca/dados/`. Se o `marca.js` mudar, este arquivo não muda junto.
- **Pele:** projeção pelo eixo dominante da normal, no espaço do modelo, para o número ficar preso ao corpo e em pé. Casa de 0,0056 da altura do corpo (cerca de 19 cm num gigante de 34 m). Filtrada pelo ponto do painel, contando o corte de linhas do sinal: número menor que o ponto vira tracinho e depois média.
- **Bumbo:** uma onda sai do peito e acende e troca os números por onde passa (`C.contra.z` e `w`), e cerca de 600 números por corpo se soltam dos vértices, saem pela normal, freiam e somem em 1,15 s.
- **Corpo:** vidro preto com o reflexo do inox a 20% e o fio de luz na quina. O logo da parede segue a seção do logo do app.
- `?modo=colossos` usa os dois gigantes do Colossos; o padrão é `colossos-todos`. `?simsom=1` testa sem música.
