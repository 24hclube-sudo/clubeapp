# Passagens no céu

Elementos de luz que atravessam o painel por cima de qualquer visual: Meteoros, Faixas de luz, Varredura, Cometa, Onda do logo e Salto no espaço. Só somam luz. Nos visuais que publicam `window.__logoTela`, passam atrás das letras. Em prata: a cor vem da camada de cor, que fica na frente.

- **App:** LED da pista → Passagens no céu. Chave geral, uma chave por elemento, Quantidade, Força e "Entram no" (golpe do som ou Sozinhas). Itens `passagens` e `pas*` em `/api/reacoes`.
- **Som:** o elemento pronto espera o próximo golpe. Sem golpe por 2,5 s ou passando de 1,5 vez da fila, entra assim mesmo: sem música, continuam passando.
- **Custo:** desligada, não abre a GPU. Ao desligar, apaga em meio segundo e o laço para.
- **Coordenadas:** tudo em pixels do painel (1032x5676, dobra em 4988). Reta no painel é reta para quem está em pé. Conferir com `regencia\vista.mjs`.

## Publicar

Acrescenta por trecho, porque outras sessões mexem nos mesmos arquivos. Guardar os originais em `antes-passagens` antes.

1. `python passagens\aplicar.py saida C:\apps\visual-pista\mesa\saida C:\apps\visual-pista\js`, depois reiniciar a saída. O LED fica sem imagem por uns segundos.
2. `python passagens\aplicar.py servidor C:\apps\tv-player`, depois reiniciar o servidor. Pede UAC: só com o usuário perto.
3. `python passagens\aplicar.py tela C:\apps\tv-player`. Vale na hora, por isso vem por último.

Mudar `camada.js` vale ao trocar de visual, sem reiniciar nada.

## Teste

Definir `window.__passagensTeste = { ligado: true, led: { pasFaixas: 'ligado', ... }, semSorteio: true }` antes de importar. `window.__passagens.dispara('faixas')` lança um agora, e `.estado()` conta golpes e lançamentos.
