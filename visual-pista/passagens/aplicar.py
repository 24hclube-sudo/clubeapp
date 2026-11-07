"""Acrescenta as Passagens por trecho: outras sessões publicam nos mesmos arquivos.
Uso: python aplicar.py <saida|servidor|tela> <pasta> [pasta js]
saida: mesa/saida/flash-pagina.js e js/reacoes.js. Vale depois de reiniciar a saída; o LED fica sem imagem por uns segundos.
servidor: tv-player/reacoes.js. Vale depois de reiniciar o servidor (UAC).
tela: tv-player/public/visuais-app.js e reacoes.html. Vale na hora: aplicar só depois do reinício do servidor.
"""
import pathlib
import sys

etapa, pasta = sys.argv[1], pathlib.Path(sys.argv[2])
PADROES = "passagens: 'desligado', pasMeteoros: 'ligado', pasFaixas: 'ligado', pasVarredura: 'ligado', pasCometa: 'ligado', pasOnda: 'desligado', pasDobra: 'desligado', pasQuanto: 'medio', pasForca: 'medio', pasSom: 'bumbo'"


def trocar(arq, *pares):
    s = arq.read_text(encoding='utf8')
    if 'passagens' in s:
        print('já tem:', arq)
        return
    for a, b in pares:
        assert s.count(a) >= 1, 'não achei em ' + str(arq) + ': ' + a[:90]
        s = s.replace(a, b, 1)
    arq.write_text(s, encoding='utf8')
    print('aplicado:', arq)


def linha(chave, nome, txt):
    return f'        <div class="vis-linha"><div class="t"><b>{nome}</b><small>{txt}</small></div><button type="button" class="chave" data-chave="{chave}" aria-label="Ligar ou desligar: {nome}"></button></div>\n'


def chips(rotulo, chave, itens):
    botoes = ''.join(f'<button type="button" data-valor="{v}">{n}</button>' for v, n in itens)
    return f'        <small class="vis-rotulo">{rotulo}</small>\n        <div class="vis-chips" data-chave="{chave}">{botoes}</div>\n'


if etapa == 'saida':
    trocar(pasta / 'flash-pagina.js', ("""  import('/fumaca/camada.js').catch(e => console.error('fumaca: ' + e.message));
""", """  import('/fumaca/camada.js').catch(e => console.error('fumaca: ' + e.message));
  // passagens: meteoros, faixas de luz e o que mais atravessar o painel. Só abre a GPU quando ligadas. Ver passagens\\camada.js
  import('/passagens/camada.js').catch(e => console.error('passagens: ' + e.message));
"""))
    trocar(pathlib.Path(sys.argv[3]) / 'reacoes.js', ("fumacaSom: 'bumbo'", "fumacaSom: 'bumbo', " + PADROES))
elif etapa == 'servidor':
    trocar(pasta / 'reacoes.js',
           ("fumacaSom: 'bumbo'", "fumacaSom: 'bumbo', " + PADROES),
           ("    fumacaSom: SOM,\n", """    fumacaSom: SOM,
    passagens: ['ligado', 'desligado'],
    pasMeteoros: ['ligado', 'desligado'],
    pasFaixas: ['ligado', 'desligado'],
    pasVarredura: ['ligado', 'desligado'],
    pasCometa: ['ligado', 'desligado'],
    pasOnda: ['ligado', 'desligado'],
    pasDobra: ['ligado', 'desligado'],
    pasQuanto: ['pouco', 'medio', 'muito'],
    pasForca: ['suave', 'medio', 'forte'],
    pasSom: SOM,
"""))
elif etapa == 'tela':
    bloco = ('<div class="bloco vis-controles" id="vt-passagens">\n'
             + linha('passagens', 'Passagens no céu', 'Luz que atravessa o painel inteiro, por cima de qualquer visual e atrás do logo')
             + linha('pasMeteoros', 'Meteoros', 'Riscos rápidos, sozinhos ou em grupo')
             + linha('pasFaixas', 'Faixas de luz', 'Fitas que giram e correm o painel de ponta a ponta')
             + linha('pasVarredura', 'Varredura', 'Barras de lado a lado, em trem, sobre a pista')
             + linha('pasCometa', 'Cometa', 'Um só, lento, com cauda de gás')
             + linha('pasOnda', 'Onda do logo', 'Anel que sai do logo e cruza o teto')
             + linha('pasDobra', 'Salto no espaço', 'Rajada de riscos vindo da parede para cima da pista')
             + chips('Quantidade', 'pasQuanto', [('pouco', 'Pouco'), ('medio', 'Médio'), ('muito', 'Muito')])
             + chips('Força', 'pasForca', [('suave', 'Suave'), ('medio', 'Média'), ('forte', 'Forte')])
             + chips('Entram no', 'pasSom', [('bumbo', 'Bumbo'), ('grave', 'Grave'), ('medio', 'Médio'), ('agudo', 'Agudo'), ('desligado', 'Sozinhas')])
             + '      </div>\n')
    trocar(pasta / 'public' / 'visuais-app.js',
           ('<div class="bloco vis-controles" id="vt-personagens">', bloco + '<div class="bloco vis-controles" id="vt-personagens">'),
           ("const PADRAO_LIGA = { personagens: 'ligado',", "const PADRAO_LIGA = { passagens: 'ligado', pasMeteoros: 'ligado', pasFaixas: 'ligado', pasVarredura: 'ligado', pasCometa: 'ligado', pasOnda: 'ligado', pasDobra: 'ligado', personagens: 'ligado',"))
    trocar(pasta / 'public' / 'reacoes.html', ("  ['ceu', 'Céu do Firmamento',", "  ['pasSom', 'Passagens no céu', 'Meteoros, faixas e o resto entram neste golpe. Desligado: entram sozinhas', ['desligado', 'bumbo', 'grave', 'medio', 'agudo', 'volume']],\n  ['ceu', 'Céu do Firmamento',"))
else:
    sys.exit(__doc__)
