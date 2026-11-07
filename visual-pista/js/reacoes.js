// O que reage a quê, escolhido no app (tv-player\reacoes.js). A página pergunta ao servidor; se ele estiver fora, fica com o último valor.
// ?reacoesEm=<endereço> muda o servidor, só para teste.
export const REACOES = {
  led: { personagens: 'desligado', personagemTempo: '12', personagemSom: 'grave', personagemLugar: 'atras', ceu: 'grave', estrelas: 'grave', luz: 'desligado', faixa: 'bumbo', brilhinhos: 'agudo', empurra: 'bumbo', reflexo: 'grave', meteoros: 'ligado', booth: 'bumbo', logo: 'prata', contraluz: 'desligado', estiloLuz: 'halo', logoReage: 'acende', logoFonte: 'grave', logoTam: 'medio', akinCor: 'grave', akinLetra: 'bumbo', akinMassa: 'grave', fumacaSom: 'bumbo', passagens: 'desligado', pasMeteoros: 'ligado', pasFaixas: 'ligado', pasVarredura: 'ligado', pasCometa: 'ligado', pasOnda: 'desligado', pasDobra: 'desligado', pasQuanto: 'medio', pasForca: 'medio', pasSom: 'bumbo', teto: 'aberto' },
  outros: { bumbo: true, grave: true, medio: true, agudo: true },
  som: { piso: -28, forca: 100 },
  tela: { antiBanding: 2 },
};
const ORIGEM = new URLSearchParams(location.search).get('reacoesEm') || 'http://127.0.0.1:8080';
window.__REACOES = REACOES;   // o diretor automático acerta os elementos na hora, sem esperar a próxima pergunta
function buscar() {
  fetch(ORIGEM + '/api/reacoes', { cache: 'no-store' })
    .then(r => r.json())
    .then(j => { Object.assign(REACOES.led, j.led, window.__autoLedValores); Object.assign(REACOES.outros, j.outros); Object.assign(REACOES.som, j.som); Object.assign(REACOES.tela, j.tela); setTimeout(buscar, 1000); })
    .catch(() => setTimeout(buscar, 8000));
}
buscar();
