' Abre o "Visual Pista -> Spout" sem janela de console (fica so o icone na bandeja).
' Usa o Electron do C:\apps\radio-saida. Para fechar: Sair na bandeja, ou rodar parar.vbs.
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run """C:\apps\radio-saida\node_modules\electron\dist\electron.exe"" """ & pasta & """", 0, False
