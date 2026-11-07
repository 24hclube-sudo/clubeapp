# Personagens na parede

Os personagens da marca na parede do DJ, atrás do logo. Viram devagar e vão trocando. É uma camada transparente por cima de qualquer visual do LED.

Nos visuais com o logo em 3D (Firmamento, Espaço, Marca e Cinética), a página conta em `window.__logoTela` onde o logo está, e as letras abrem um buraco na camada: o logo de verdade fica à frente, com o acabamento escolhido. Nos outros visuais, o corpo fica por cima.

- **Botão:** LED da pista → Personagens da marca (`personagens` em `/api/reacoes`). Desligado, a camada não carrega a malha e não gasta GPU.
- **Entrada:** `mesa\saida\flash-pagina.js` importa `camada.js` em toda página que a saída abre. Mudar `flash-pagina.js` pede reiniciar a saída; mudar `camada.js` vale ao trocar de visual.
- **Tela:** só a parede, as últimas 688 das 5676 linhas. A luz que passa para o teto é uma `div` com `plus-lighter`, porque a tela da camada acaba na dobra.

## Movimento

- **Poses:** ele para numa pose e vira para a próxima a cada 3,1 s, com `inOutQuint`. Uma mola por cima dá o resto do peso. O corpo inclina um pouco ao virar e respira parado.
- **Troca:** a cada 6, 12, 24 ou 48 s. O corpo acelera (`inCubic`) até ficar de perfil, troca no meio do clarão, e o novo chega freando (`outQuint`).
- **Ordem:** sorteada, sem repetir antes de passar todos. Fica sem O Curador (h), que segura um vinil.

## Brilho

- **Corpo:** arte real da marca (`marca\dados\figura-*.png`) sobre a malha real, refletindo um estúdio de softboxes que andam.
- **Papel-alumínio:** a normal da malha é irregular. O reflexo usa a normal puxada para a frente do corpo, e por isso o brilho corre liso quando ele vira.
- **Aro e risco:** a borda acende com o som, e um risco de luz atravessa o corpo a cada virada.
- **Bloom:** 16 bits, cadeia de 6 níveis, mais um rastro comprido no sentido horizontal. Sai com alfa zero: só soma, e o logo continua a aparecer através dele.
- **Sinal:** o último passo tem o mesmo filtro vertical de `FILTRO_LED`, ou a camada serrilharia no corte de linhas.

## Teste

Definir `window.__personagensTeste` antes de importar: `{ fig: 'e', nivel: .5, tempo: 2, yaw: .3, semTroca: true, dt: .033 }`. `dt` fixa o passo: gravar PNG atrasa o relógio real, e a sequência de fotos pareceria parada.
