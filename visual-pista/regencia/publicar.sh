#!/bin/bash
# Publica a Regência no ar: acrescenta por trecho, porque outras sessões publicam nos mesmos arquivos. Rodar só com o ok do usuário. Ordem:
#   publicar.sh saida     -> depois reiniciar a saída (parar.vbs e iniciar.vbs por explorer.exe)
#   publicar.sh servidor  -> depois reiniciar o servidor (UAC)
#   publicar.sh app-tela  -> vale na hora, sobre o arquivo que estiver lá
set -e
VP=/c/apps/visual-pista; TV=/c/apps/tv-player; DATA=$(date +%H%M)
case "$1" in
  saida)
    mkdir -p "$VP/antes-regencia/$DATA"
    cp "$VP/mesa/saida/main.js" "$VP/mesa/saida/flash-pagina.js" "$VP/js/reacoes.js" "$VP/antes-regencia/$DATA/"
    python "$VP/regencia/aplicar-saida.py" "C:/apps/visual-pista/mesa/saida" "C:/apps/visual-pista/js"
    node --check "$VP/mesa/saida/main.js"
    echo "saída pronta para reiniciar; originais em antes-regencia/$DATA"
    ;;
  servidor)
    mkdir -p "$TV/antes-regencia"
    cp "$TV/visuais-led.js" "$TV/antes-regencia/"
    python "$VP/regencia/aplicar-app.py" "C:/apps/tv-player" servidor
    node --check "$TV/visuais-led.js"
    cp "$VP"/regencia/dados/miniaturas/r-*.jpg "$TV/public/visuais/"
    echo "servidor pronto para reiniciar"
    ;;
  app-tela)
    mkdir -p "$TV/antes-regencia"
    cp "$TV/public/visuais-app.js" "$TV/antes-regencia/"
    python "$VP/regencia/aplicar-app.py" "C:/apps/tv-player" tela
    node --check "$TV/public/visuais-app.js"
    echo "tela do app no ar"
    ;;
  *) echo "uso: publicar.sh saida | servidor | app-tela"; exit 1 ;;
esac
