# Rádio CLUBE: interface

Interface no estilo de um app de música para a Rádio CLUBE. Mostra o que está tocando e as playlists de cada momento do dia.

- Abrir: aba Música do app do CLUBE, em http://localhost:8080/celular#/musica. O app sobe sozinho com o Windows e `iniciar.cmd` só abre essa página.
- A rádio é uma transmissão ao vivo: todo mundo ouve a mesma coisa. Clicar numa música a coloca no ar em segundos, para todos os lugares e sem confirmação.

## Onde o app entra

O app lê desta pasta `publico/` e `dados/`. As rotas ficam em `C:\apps\tv-player\musica.js`.

- Mudar `publico/` ou `dados/momentos.json` aparece na hora para quem está com o app aberto, inclusive em celulares.
- Mudar rota em `servidor.mjs` não chega ao app. Esse servidor, na porta 7920, serve só para testar a interface aqui e não precisa ficar ligado.

## Como a troca funciona

A troca é da própria estação, sem agendador externo:

| Na estação | O que é |
|---|---|
| Playlist (Navidrome) | A lista de músicas de cada momento |
| Programa (show) | Toca só a sua lista, inteira, antes de repetir |
| Grade semanal | Diz qual programa vale em cada hora dos 7 dias |

## Arquivos

| Arquivo | Para quê |
|---|---|
| `scripts/montar-momentos.mjs` | Curadoria e horários. Gera `dados/momentos.json` e `PROPOSTA.md` |
| `scripts/aplicar-na-estacao.mjs` | Sem opção só confere. `--aplicar` grava na estação. `--desfazer` volta à programação automática |
| `dados/estacao.json` | Criado ao aplicar. É o que faz a interface sair do modo "proposta" |
| `servidor.mjs` | Só para teste, fora do app. Sem dependências, só leitura e sem rota livre para a estação |
| `publico/` | A interface, a mesma que o app mostra na aba Música |

`--aplicar` e `--desfazer` mudam o que toca em público.

## Mudar uma lista

1. Editar a lista em `scripts/montar-momentos.mjs`.
2. `node scripts/montar-momentos.mjs`
3. `node scripts/aplicar-na-estacao.mjs --aplicar` (regrava as playlists sem trocar os ids).
