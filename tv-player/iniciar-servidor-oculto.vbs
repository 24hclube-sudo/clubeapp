' Abre o iniciar-servidor.cmd sem janela (usado na inicialização do Windows).
Set sh = CreateObject("WScript.Shell")
sh.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\iniciar-servidor.cmd""", 0, False
