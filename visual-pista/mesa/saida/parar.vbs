' Fecha a saida dos visuais soltando o Spout direitinho (igual ao Sair da bandeja).
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run """C:\apps\radio-saida\node_modules\electron\dist\electron.exe"" """ & pasta & """ --sair", 0, True
