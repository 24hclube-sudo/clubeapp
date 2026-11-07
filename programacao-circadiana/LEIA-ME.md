# Programação circadiana das telas e fitas

Camada por cima do `tv-player`: cores e efeitos que mudam durante o dia, anúncios a cada Z minutos, tudo pelo app (cartão "Programação" no início).

## Publicar no clube

1. `node C:\apps\programacao-circadiana\programacao-instalar.js C:\apps\tv-player`
   Copia os arquivos novos e liga nos existentes. É tudo ou nada, pode rodar de novo, e guarda os originais em `*.antes-programacao`.
2. Reiniciar o servidor da 8080 (roda como administrador, pede UAC). Os celulares recarregam sozinhos.
3. Recarregar as TVs e o painel LED para pegarem o `player.html` novo (comando WS `reload`).
4. `node C:\apps\tv-player\programacao-anuncio-millos.js` cria o anúncio do soft opening.

A programação começa **desligada**: nada muda nas telas até alguém ligar no app (dois toques).

## Se outra sessão sobrescrever server.js, celular.html ou player.html

Rodar o passo 1 de novo: ele repõe só as ligações que faltarem.

## Como funciona

- `public/ambiente.js`: a conta de cor. O mesmo arquivo roda no servidor (fitas), nas telas e no app. Escrito em ES5 porque o painel LED é um Chrome 73.
- `programacao.js`: horários, modo manual e anúncios. Estado em `tv-player\programacao.json`.
- `public/programacao-player.js`: desenha o degradê e os anúncios nas telas.
- `public/programacao-app.js` e `programacao.css`: a tela do app.

Regras combinadas:

- Nada do estado manual é apagado: desligou a programação, volta o que estava no ar.
- Enquanto uma fita segue a programação, o filtro "Cor da saída" dela fica guardado e não é aplicado.
- Escolher cena, cor ou logo num aparelho tira só ele da programação até o horário de retorno (06:00).
- O brilho do app vale como teto; a faixa do dia escurece dentro dele.
- O painel da pista do 5º continua no MadMapper, fora da programação.

## Testar sem encostar no clube

Cópia do tv-player + `stub-rede.js` (bloqueia Art-Net, OSC, HTTP para as TVs e tizen), em outra porta.
