@echo off
rem Mantém o painel das TVs sempre rodando: se o servidor cair, sobe de novo em 5 s.
rem Iniciado sozinho pelo atalho na pasta Inicializar do Windows (ou pela tarefa agendada).
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
rem Se já existe um servidor na porta 8080 (outra cópia deste script), só espera.
netstat -ano | findstr /c:":8080 " | findstr /i "LISTENING ESCUTANDO" > nul && (timeout /t 30 /nobreak > nul & goto loop)
echo [%date% %time%] iniciando servidor>> logs\servidor.log
"C:\Program Files\nodejs\node.exe" server.js >> logs\servidor.log 2>&1
echo [%date% %time%] servidor parou (codigo %errorlevel%), reiniciando em 5 s>> logs\servidor.log
timeout /t 5 /nobreak > nul
goto loop
