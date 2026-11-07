p='saida-teste/main.js'
s=open(p,encoding='utf8').read()
# sem Spout, sem MadMapper, em outra porta e com pasta de dados própria: o LED nem fica sabendo
s=s.replace("const UNICA = app.requestSingleInstanceLock();","app.setPath('userData', path.join(__dirname, 'dados'));\nconst UNICA = app.requestSingleInstanceLock();")
a=s.index("function osc(endereco_, tipo, valor) {")
s=s[:a]+"function osc() { return Promise.resolve(); }\nfunction oscVelho(endereco_, tipo, valor) {"+s[a+len("function osc(endereco_, tipo, valor) {"):]
s=s.replace("function lerNo(caminho) {","function lerNo() { return Promise.reject(new Error('teste')); }\nfunction lerNoVelho(caminho) {")
s=s.replace("function iniciarPython() {","function iniciarPython() { return; }\nfunction iniciarPythonVelho() {")
s=s.replace("if (!python || pendente) { textura.release(); descartados++; return; }","quadros++; textura.release(); return;")
s=s.replace("{ porta: 5212,","{ porta: 5213,")
s=s.replace("config = { ...PADRAO, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '')) };","config = { ...PADRAO, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '')), porta: 5213, nome: 'Visual TESTE' };")
s=s.replace("montarBandeja();","")
s=s.replace("setTimeout(sincronizarLed, 3000);","")
s=s.replace("setInterval(sincronizarLed, 5000);","")
s=s.replace("arq.startsWith(__dirname) ||","")
open(p,'w',encoding='utf8').write(s)
print('stub ok', 'porta: 5213' in s)
