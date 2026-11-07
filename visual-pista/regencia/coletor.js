// Junta os blocos de 128 amostras em blocos de 512 e manda para a janela do ouvido. Só o que a análise precisa: mono.
class Coletor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(512); this.n = 0; }
  process(entradas) {
    const e = entradas[0];
    if (!e || !e[0]) return true;
    const canais = e.length, a = e[0];
    for (let i = 0; i < a.length; i++) {
      let v = a[i];
      if (canais > 1) v = (v + e[1][i]) * 0.5;
      this.buf[this.n++] = v;
      if (this.n === 512) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('coletor', Coletor);
