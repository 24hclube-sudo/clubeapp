# Coloca o gerador do painel (cenas ao vivo + áudio reativo) em tela cheia na saída de vídeo que vai
# para a controladora do LED da pista (NovaStar, tela 3840x2160 "NOV DVI").
# ATENÇÃO: feche antes a saída do Resolume nessa tela, senão os dois brigam pela mesma imagem.
#
#   .\gerador-saida.ps1                     abre (áudio pela entrada padrão do Windows, se ligado no app)
#   .\gerador-saida.ps1 -Audio "line"       escolhe a entrada de som pelo nome (ex.: "line", "usb", "realtek")
#   .\gerador-saida.ps1 -Atraso 80          ajusta a compensação de atraso da batida (ms)
#   .\gerador-saida.ps1 -Parar              fecha o gerador
param([string]$Audio = '', [int]$Atraso = 60, [switch]$Parar)

$perfil = Join-Path $PSScriptRoot '.chrome-gerador'
$abertos = Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($perfil) }
if ($Parar -or $abertos) {
  $abertos | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($Parar) { 'Gerador fechado.'; return }
  Start-Sleep -Seconds 1
}

Add-Type -AssemblyName System.Windows.Forms
$tela = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.Bounds.Width -eq 3840 -and $_.Bounds.Height -eq 2160 } | Select-Object -First 1
if (-not $tela) { Write-Error 'Não achei a tela 3840x2160 da controladora do LED.'; return }

$url = "http://localhost:8080/gerador.html?id=painel-5&name=Painel%20Pista&grupo=painel&andar=5&atraso=$Atraso"
if ($Audio) { $url += '&audio=' + [uri]::EscapeDataString($Audio) }

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
& $chrome "--user-data-dir=$perfil" "--app=$url" "--window-position=$($tela.Bounds.X),$($tela.Bounds.Y)" `
  '--window-size=3840,2160' '--kiosk' '--force-device-scale-factor=1' `
  '--autoplay-policy=no-user-gesture-required' '--use-fake-ui-for-media-stream' `
  '--disable-background-timer-throttling' '--disable-renderer-backgrounding' '--disable-backgrounding-occluded-windows' `
  '--no-first-run' '--noerrdialogs' '--disable-infobars' '--disable-session-crashed-bubble'
"Gerador aberto em $($tela.DeviceName) ($($tela.Bounds.X),$($tela.Bounds.Y)) — controle pelo app, 5º andar > Painel LED."
