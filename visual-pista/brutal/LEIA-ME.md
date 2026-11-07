# Brutal

Fundo preto e massas de concreto bruto, sem relevo e sem luz. Tudo entra seco e volta devagar, como peso.

- **Abrir:** "Brutal" na Mesa, ou `brutal/`. `?cena=` fixa uma cena; `?troca=` muda as batidas por cena (padrão 32, cerca de 15 s).
- **Grade do LED:** nenhuma massa é lisa. A textura de `dados/concreto.png` (manchas, tábua da fôrma, agregado, furos), com variação forte de 2 a 200 px, fica presa na massa e disfarça as emendas dos módulos. As bordas são esfareladas.

## Cenas (corte seco, na batida)

- **suprema:** lajes tortas, como composição suprematista. A cada bumbo uma salta de lugar; uma barra preta corta o que estiver embaixo.
- **torres:** colunas desiguais saindo da parede e da entrada, com o comprimento dado pela banda.
- **estatua:** figuras do CLUBE e logo em fatias que escorregam com o som.
- **prensa:** concreto saindo das duas beiradas e fechando o corredor preto.
- **fenda:** um rasgo do DJ até a entrada, que o som abre pelo caminho.

## Som

- **Bandas:** cada uma vira um pistão, com ganho automático, para mexer igual com a entrada alta ou baixa.
- **Bumbo:** salto, tranco em tudo e estilhaços.
- **Agudos:** o concreto crepita com pontos pretos.

## Arquivos

- `assar.py`: gera a textura. Roda com `..\perspectiva\.venv\Scripts\python.exe assar.py`.
- `brutal.js`: som, cenas, estilhaços e shader. As lajes são instâncias desenhadas uma a uma, então o preto não custa nada.
