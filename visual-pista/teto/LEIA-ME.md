# Teto de concreto

Botão **Fechar o teto / Abrir o teto** em LED da pista (item `teto` em `/api/reacoes`). Placas de cimento queimado fecham o céu em qualquer visual; a parede com o logo não muda.

- **Eixos:** em xadrez. Parte das placas entra pelas laterais (X), parte pelas pontas do teto (Y do painel). Cada eixo corre numa altura, então não se batem.
- **Ordem:** de fora para dentro, como um diafragma, em cerca de 6 s. Abrir é o mesmo filme ao contrário, e dá para inverter no meio.
- **Som:** fechado, o bumbo corre do booth para a entrada, com luz e um dedo de empurrão em cada placa.
- **Entrada:** `personagens\camada.js` e `mesa\saida\flash-pagina.js` importam `camada.js`. Nas páginas já abertas, só vale depois de trocar de visual.
- **Concreto e Teto automático:** quando o concreto cobre tudo, as placas do próprio visual abrem por baixo e o ciclo dele para até a página ser aberta de novo (`window.__tetoCena`).
- **Teste:** `teto/teste.html?escala=0.3&estado=fechado&t=3`. `t` congela o filme nesse segundo.
