# Arte do soft opening para as TVs, no formato delas: em pe, 9:16, 2160x3840, tela cheia.
# NAO e o post 4:5 encaixado: a peca e recomposta em instagram\motion\tv\soft-opening (HyperFrames).
# Um arquivo so, para todas as TVs tocarem juntas. Gera tambem a versao -deitado e os dois trechos
# que o anuncio da programacao usa (capa e servico).
$ErrorActionPreference = 'Continue'   # a HyperFrames escreve avisos no stderr; erro real vem por $LASTEXITCODE
$raiz = 'C:\apps\instagram\motion'
$dir = "$raiz\tv\soft-opening"
$ff = "$raiz\node_modules\ffmpeg-static\ffmpeg.exe"
$hf = 'hyperframes@0.8.186'
$env:PATH = "$raiz\node_modules\ffmpeg-static;C:\apps\instagram\reels-abertura\node_modules\@remotion\compositor-win32-x64-msvc;" + $env:PATH
$env:HYPERFRAMES_SKIP_SKILLS = '1'
$env:DO_NOT_TRACK = '1'
$saida = Join-Path $PSScriptRoot 'saida'
New-Item -ItemType Directory -Force $saida | Out-Null
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'   # nao atrapalhar o MadMapper e o servidor
if (-not (Test-Path "$dir\assets")) { New-Item -ItemType Junction -Path "$dir\assets" -Target "$raiz\assets" | Out-Null }

$bruto = Join-Path $saida 'bruto-4k.mp4'
Push-Location $dir
npx --yes $hf render . -o $bruto -q delivery --resolution portrait-4k -w 4 --quiet
$erro = $LASTEXITCODE
Pop-Location
if ($erro -ne 0 -or -not (Test-Path $bruto)) { throw 'render falhou' }

$cor = @('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
$comum = @('-an', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60') + $cor

function Fazer($arq) { if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou em $arq" } }

$final = Join-Path $saida 'tv-soft-opening.mp4'
& $ff -hide_banner -v error -y -i $bruto @comum -crf 18 -maxrate 40M -bufsize 80M -level 5.1 -movflags +faststart $final
Fazer $final
$deitado = Join-Path $saida 'tv-soft-opening-deitado.mp4'
& $ff -hide_banner -v error -y -i $bruto -vf 'scale=1080:1920:flags=lanczos,transpose=2' @comum -crf 18 -maxrate 15M -bufsize 30M -level 4.1 -movflags +faststart $deitado
Fazer $deitado
# trechos para o anuncio da programacao (programacao-anuncio-millos.js)
& $ff -hide_banner -v error -y -i $bruto -t 8 -vf 'scale=1080:1920:flags=lanczos' @comum -crf 18 -level 4.1 -movflags +faststart (Join-Path $saida 'anuncio-capa.mp4')
Fazer 'anuncio-capa'
& $ff -hide_banner -v error -y -ss 17 -i $bruto -t 9 -vf 'scale=1080:1920:flags=lanczos' @comum -crf 18 -level 4.1 -movflags +faststart (Join-Path $saida 'anuncio-servico.mp4')
Fazer 'anuncio-servico'
# miniatura (capa em pe) e quadros para conferir
& $ff -hide_banner -v error -y -ss 4 -i $final -frames:v 1 -vf 'scale=270:480' (Join-Path $saida 'tv-soft-opening.png')
Fazer 'miniatura'
foreach ($t in 4, 16, 25, 30) {
  & $ff -hide_banner -v error -y -ss $t -i $final -frames:v 1 -vf 'scale=540:960' (Join-Path $saida "quadro-$t.png")
  Fazer "quadro-$t"
}
Remove-Item $bruto
Get-ChildItem $saida -Filter '*.mp4' | ForEach-Object { "{0}  {1:0.0} MB" -f $_.Name, ($_.Length / 1MB) }
'PRONTO'
