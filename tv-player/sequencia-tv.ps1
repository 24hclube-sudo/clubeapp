# Sequencia para as TVs: varios videos em seguida, cada um com -segundos de duracao, tudo num arquivo so
# (1080x1920, 30 q/s, sem som, velocidade normal). A cena das TVs toca esse arquivo em loop com o mesmo
# relogio em todas, entao todas mostram o mesmo video ao mesmo tempo.
# Video mais curto que -segundos repete do comeco; no ponto da repeticao o fim se mistura com o comeco (1 s).
# Entre um video e outro: fade pelo preto de 1 s (saida e entrada).
# Gera tambem a versao -deitado, que o player usa se o navegador da TV estiver deitado.
# Uso: sequencia-tv.ps1 -pasta <videos em pe> -nome tv-hear-pista -saida <pasta de trabalho>
param(
  [Parameter(Mandatory = $true)][string]$pasta,
  [Parameter(Mandatory = $true)][string]$nome,
  [Parameter(Mandatory = $true)][string]$saida,
  [int]$segundos = 60
)
$ErrorActionPreference = 'Stop'
$ff = 'C:\Program Files (x86)\Nova Star\ViPlex Express\Bin\VideoConverter\ffmpeg.exe'   # tem fps, framerate, blend e fade
$dir = 'C:\apps\led-videos\node_modules\@remotion\compositor-win32-x64-msvc'
$ffCopia = Join-Path $dir 'ffmpeg.exe'
$ffp = Join-Path $dir 'ffprobe.exe'
$inv = [Globalization.CultureInfo]::InvariantCulture
$QPS = 30
$MISTURA = $QPS                       # 1 s de dissolucao e de fade
$trecho = $segundos * $QPS
$codificar = @('-an', '-map_metadata', '-1', '-c:v', 'libx264',   # sem metadados: o timecode do ProRes viraria uma trilha extra no mp4
 '-preset', 'medium', '-crf', '18', '-maxrate', '15M', '-bufsize', '30M',
  '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-g', '60',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-video_track_timescale', '15360')

(Get-Process -Id $PID).PriorityClass = 'BelowNormal'   # nao atrapalhar o MadMapper e o servidor

function Sonda($arq, $campo) { (& $ffp -v error -select_streams v:0 -show_entries "stream=$campo" -of csv=p=0 $arq).Trim() }
function Quadros($arq) { [int](& $ffp -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 $arq).Trim().TrimEnd(',') }
function Fazer($entrada, [int]$n, $arq) {
  & $ff -hide_banner -v error -y @entrada -frames:v $n @codificar $arq
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou em $arq" }
  $tem = Quadros $arq
  if ($tem -ne $n) { throw "$arq tem $tem quadros, esperava $n" }
}

$partes = Join-Path $saida "partes-$nome"
New-Item -ItemType Directory -Force $partes | Out-Null
$lista = New-Object System.Collections.ArrayList
$videos = Get-ChildItem -LiteralPath $pasta -File | Where-Object { $_.Extension -match 'mov|mp4' } | Sort-Object Name
$i = 0
foreach ($v in $videos) {
  $i++
  $arq = $v.FullName
  $dur = [double]::Parse((Sonda $arq 'duration'), $inv)
  $fr = (Sonda $arq 'r_frame_rate').Split('/')
  $fps = [double]$fr[0] / [double]$fr[1]
  # 30 e 60 q/s entram sem misturar quadros; 25 e 50 precisam da interpolacao.
  $multiplo = ([math]::Abs($fps - 30) -lt 0.1) -or ([math]::Abs($fps - 60) -lt 0.1)
  $taxa = if ($multiplo) { "fps=$QPS" } else { "framerate=fps=$QPS" }
  $base = "setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p,$taxa"
  $total = [int][math]::Floor($dur * $QPS) - 2   # folga: o fim do arquivo pode render um ou dois quadros a menos
  $p = Join-Path $partes ('{0:00}' -f $i)
  $inicio = $base + ",fade=t=in:s=0:n=$MISTURA"
  Write-Output ("[{0}/{1}] {2}: {3:0.00} s a {4:0.##} q/s ({5})" -f $i, $videos.Count, $v.Name, $dur, $fps, $taxa)

  if ($total -ge $trecho) {
    # Mais longo que o trecho: entra so o comeco.
    Fazer @('-i', $arq, '-vf', "$inicio,fade=t=out:s=$($trecho - $MISTURA - 1):n=$MISTURA") $trecho "$p-unico.mp4"
    [void]$lista.Add("$p-unico.mp4")
    continue
  }

  $h = $total - $MISTURA                # do comeco ate o ponto onde a dissolucao comeca
  $m = $total - 2 * $MISTURA            # as repeticoes comecam 1 s depois do inicio (esse 1 s ja apareceu na dissolucao)
  $ss = ($h / $QPS).ToString('0.######', $inv)
  $falta = $trecho - $h - $MISTURA
  if ($falta -lt ($MISTURA + 1)) { throw "$($v.Name): sobra pouco para o fade de saida" }

  Fazer @('-i', $arq, '-vf', $inicio) $h "$p-a.mp4"
  $filtroDissolve = "[0:v]$base[a];[1:v]$base[b];[a][b]blend=all_expr=A*(1-T)+B*T[s]"
  Fazer @('-ss', $ss, '-i', $arq, '-i', $arq, '-filter_complex', $filtroDissolve, '-map', '[s]') $MISTURA "$p-x.mp4"
  [void]$lista.Add("$p-a.mp4"); [void]$lista.Add("$p-x.mp4")

  $repetiu = $false
  while ($falta -gt ($m + $MISTURA)) {
    if (-not $repetiu) { Fazer @('-ss', '1', '-i', $arq, '-vf', $base) $m "$p-m.mp4"; $repetiu = $true }
    [void]$lista.Add("$p-m.mp4"); [void]$lista.Add("$p-x.mp4")
    $falta -= ($m + $MISTURA)
  }
  if ($falta -lt ($MISTURA + 1)) { throw "$($v.Name): sobra pouco para o fade de saida" }
  Fazer @('-ss', '1', '-i', $arq, '-vf', "$base,fade=t=out:s=$($falta - $MISTURA - 1):n=$MISTURA") $falta "$p-f.mp4"
  [void]$lista.Add("$p-f.mp4")
}

$arqLista = Join-Path $partes 'lista.txt'
$linhas = $lista | ForEach-Object { "file '" + ($_ -replace '\\', '/') + "'" }
[IO.File]::WriteAllLines($arqLista, [string[]]$linhas, (New-Object Text.UTF8Encoding($false)))
$final = Join-Path $saida "$nome.mp4"
& $ffCopia -hide_banner -v error -y -f concat -safe 0 -i $arqLista -c copy -movflags +faststart $final
if ($LASTEXITCODE -ne 0) { throw 'concat falhou' }
$tem = Quadros $final
$esperado = $videos.Count * $trecho
Write-Output "$final : $tem quadros (esperado $esperado), $([math]::Round((Get-Item $final).Length / 1MB)) MB"
if ($tem -ne $esperado) { throw 'numero de quadros errado no arquivo final' }

$deitado = Join-Path $saida "$nome-deitado.mp4"
& $ff -hide_banner -v error -y -i $final -vf 'transpose=2' @codificar -movflags +faststart $deitado
if ($LASTEXITCODE -ne 0) { throw 'versao deitada falhou' }
Write-Output "$deitado : $(Quadros $deitado) quadros, $([math]::Round((Get-Item $deitado).Length / 1MB)) MB"
Write-Output 'PRONTO'
