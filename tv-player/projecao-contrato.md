# Projeção: o combinado entre os dois PCs

O app (este PC, porta 8080) e o servidor das paredes (DESKTOP-36LP19S) não compartilham código para funcionar. Eles conversam só pela nuvem: `https://clube-parede.vercel.app/api/cena`, com o cabeçalho `x-chave`.

## O que o servidor das paredes publica (GET)

```json
{
  "cena": "nuvem",
  "logo": true,
  "cenas": ["auto", "nuvem", "..."],
  "grupos": [
    ["", [["auto", "Automática"], ["logo", "Logo: ligado"]]],
    ["Fotos", [["nuvem", "Nuvem"], ["corredor", "Corredor"]]],
    ["Física", [["f-cachoeira", "Cachoeira", { "icone": "f-cachoeira", "desc": "Água de luz caindo pelas três paredes" }]]]
  ]
}
```

- **`grupos` manda no menu do app.** Cena nova criada lá aparece no app sozinha, sem mexer neste PC.
- **Ícone:** o terceiro item é opcional. Sem ele, o app usa o ícone pelo id da cena e, se não tiver, o do grupo (Fotos, Física, CLUBE). Nomes de ícone que o app conhece estão em `public/projecao-app.js`, no objeto `P`.
- **Grupo vazio (`""`):** `auto` vira a chave Automática; `logo` vira a chave Logo CLUBE, ligada conforme `logo`.

## O que o app pede (POST)

`{"cena": "<id>"}` troca a cena; `{"cena": "logo"}` liga ou desliga o logo. A resposta é o mesmo JSON do GET.

## Arquivos do app

`public/projecao-app.js` (cartão do 5º e lógica, com a chave) e `public/projecao.html` (tela das cenas). A chave nunca vai para repositório público: `.gitignore` já tira `projecao-app.js`.
