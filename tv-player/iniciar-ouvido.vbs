' Abre o ouvido das barras do 5o sem janela. Se ele cair, volta em 5 s. Um segundo ouvido sai sozinho.
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "cmd /c ""for /l %i in (0,0,1) do (""C:\Program Files\nodejs\node.exe"" ouvido-barras.js >> logs\ouvido.log 2>&1 & timeout /t 5 /nobreak >nul)""", 0, False
