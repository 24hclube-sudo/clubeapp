# Regra das TVs: tudo no formato delas

Pedido do usuário em 05/11/2026. Vale para tudo que vai para as TVs (`telas:telas:1`, TV Bar 1 a 5), seja cena, arte ou anúncio.

- **Formato:** em pé, 9:16, tela cheia. O ideal é 2160x3840; 1080x1920 é aceito. A versão `-deitado` é a mesma peça girada.
- **Peça em outro formato se adapta:** post 4:5, story, foto deitada. Não vale encaixar sobre preto nem com fundo desfocado.
- **Peça com texto ou layout é recomposta em 9:16:** só cortar ou esticar perde conteúdo. Exemplo: `instagram\motion\tv\soft-opening`, gerada por `arte-soft-opening\montar-tv.ps1`.
- **Texto da peça também se adapta:** tirar o que só faz sentido no Instagram, como "link na bio", e avisar o usuário.

## Conferir antes de pôr no ar

```bash
node conferir-tvs.js <arquivo>
```

Sem argumento, confere a lista toda de `public/cenas-tv.json`. Ele olha os quadros, porque um post 4:5 encaixado em 1080x1920 passa em qualquer conferência de medida.

Uma peça de fundo preto de propósito, como um logo no meio da tela, entra com `"foraDaRegra": "<motivo>"` na cena.

## O que já aplica a regra sozinho

- **Arte enviada pelo app** (`/api/arte-tv` em `server.js`) e **anúncio** (`/api/anuncio` em `programacao.js`): preenchem 1080x1920 e cortam o excesso.
- **Player nas TVs** (`public/player.html`, `public/programacao-player.js`): `object-fit: cover`, para nada aparecer com faixa mesmo se chegar fora do formato. O painel de LED continua em `contain`.

Esse corte automático só garante a forma. Se a peça tiver texto perto da borda, recomponha antes de subir.

O painel de LED do térreo tem formato próprio: faixa 4472x86 dobrada, com `dobrar-painel.js`.
