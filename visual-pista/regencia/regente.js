// O regente, dentro de cada página: recebe a análise da faixa (janela escondida da saída, regencia\ouvido.html) e entrega às cenas
// a grade, a seção e os instrumentos, com a batida prevista, para o golpe cair na hora e não um instante depois.
// Sem a janela escondida (na Mesa, ou se ela cair), segue o maestro da própria página. ?sim=<seção> ou ?sim=roteiro simula a música, para foto e teste.
const Q = new URLSearchParams(location.search);
const SIM = Q.get('sim');
const ADIANTA = 0.045;   // s: o caminho até o LED (a mesma conta de js/audio.js)
export const SECOES = ['silencio', 'calmo', 'groove', 'pico', 'break', 'build', 'drop'];
const ROTEIRO = [['calmo', 8], ['groove', 16], ['pico', 8], ['break', 8], ['build', 8], ['drop', 4], ['pico', 12], ['groove', 8]];

export function criarRegente(M) {
  const R = {
    vivo: false, fase: 0, bpm: 124, noCompasso: 0, compasso: 0, frase: 0, secao: 'calmo', iSecao: 1, idade: 0,
    energia: 0.4, tensao: 0, presenca: 0, kick: 0, clap: 0, hat: 0, baixo: 0, medio: 0, agudo: 0, voz: 0, brilho: 0.5, novidade: 0,
    tom: '', nota: '', faixa: 1, golpe: 0, drop: 0, tempo: 0, seed: 0.37,
    // compasso + o quanto já andou dele, sem salto: é o relógio das cenas
    get noTempo() { return this.noCompasso + (this.fase - Math.floor(this.fase)); },
    get naFrase() { return (this.frase + this.noTempo / 4) / 16; },
    ao: { batida: [], compasso: [], frase: [], secao: [], drop: [], faixa: [], virada: [] },
  };
  const disparar = (nome, d) => { for (const f of R.ao[nome]) { try { f(d); } catch (e) { console.error(e.message); } } };
  let ult = null, tUlt = 0, batidaAntes = -1, tSim = 0, iSim = 0, compSim = 0, faseSim = 0;
  const aplicar = p => {
    ult = p; tUlt = performance.now();
    if (p.secao !== R.secao) { R.secao = p.secao; R.iSecao = SECOES.indexOf(p.secao); }
  };
  if (!SIM && 'BroadcastChannel' in window) {
    const canal = new BroadcastChannel('clube-faixa');
    canal.onmessage = ev => {
      const m = ev.data;
      if (m.foto) aplicar(m.foto);
      if (m.evento) {
        const e = m.evento;
        if (e.tipo === 'secao') disparar('secao', e);
        else if (e.tipo === 'drop') { R.drop = 1; R.seed = Math.random(); disparar('drop', e); }
        else if (e.tipo === 'compasso') disparar('compasso', e);
        else if (e.tipo === 'frase') { R.seed = (R.seed + 0.381966) % 1; disparar('frase', e); }
        else if (e.tipo === 'faixa') { R.seed = Math.random(); disparar('faixa', e); }
        else if (e.tipo === 'virada') disparar('virada', e);
      }
    };
    window.addEventListener('pagehide', () => canal.close());
  }

  function simular(dt) {
    faseSim += dt * 124 / 60;
    const f = faseSim - Math.floor(faseSim), nq = Math.floor(faseSim) % 4;
    let sec = SIM;
    if (SIM === 'roteiro') {
      const c = Math.floor(faseSim / 4);
      if (c !== compSim) {
        compSim = c;
        tSim++;
        disparar('compasso', {});
        if (tSim >= ROTEIRO[iSim][1]) {
          tSim = 0; iSim = (iSim + 1) % ROTEIRO.length;
          const nova = ROTEIRO[iSim][0];
          R.secao = nova; R.iSecao = SECOES.indexOf(nova); R.idade = 0;
          disparar('secao', { secao: nova });
          if (nova === 'drop') { R.drop = 1; R.seed = Math.random(); disparar('drop', { forca: 1 }); }
        }
        if (c % 8 === 0) { R.seed = (R.seed + 0.381966) % 1; disparar('frase', {}); }
      }
      sec = ROTEIRO[iSim][0];
    } else if (R.secao !== sec) { R.secao = sec; R.iSecao = SECOES.indexOf(sec); if (sec === 'drop') { R.drop = 1; disparar('drop', { forca: 1 }); } }
    const comK = sec !== 'break' && sec !== 'build' && sec !== 'silencio';
    const bu = sec === 'build' ? Math.min(1, tSim / Math.max(1, ROTEIRO[iSim][1]) + f / 32 + 0.15) : 0;
    const E = { silencio: 0, calmo: 0.28, groove: 0.55, pico: 0.85, break: 0.35, build: 0.55, drop: 0.95 }[sec];
    return {
      fase: faseSim, bpm: 124, noCompasso: nq, compasso: Math.floor(faseSim / 4), frase: Math.floor(faseSim / 4) % 16, idade: 0,
      energia: E, tensao: bu, presenca: comK ? 1 : 0, kick: comK ? Math.exp(-f * 5) : 0, clap: nq % 2 === 1 ? Math.exp(-f * 8) : 0, hat: E > 0.3 ? Math.exp(-((f * 2) % 1) * 7) * (0.4 + E * 0.6) : 0,
      baixo: comK ? 0.5 + 0.4 * Math.exp(-f * 3) : 0.15, medio: 0.3 + 0.3 * E * (0.5 + 0.5 * Math.sin(faseSim * 0.8)), agudo: 0.2 + E * 0.5 * Math.exp(-((f * 2) % 1) * 4), voz: sec === 'break' ? 0.75 : 0.25, brilho: 0.5,
    };
  }

  R.quadro = dt => {
    R.tempo += dt;
    R.drop *= Math.exp(-dt * 1.3);
    const agora = performance.now();
    const viva = SIM ? false : !!ult && agora - tUlt < 1500;
    R.vivo = viva;
    let p = null;
    if (SIM) p = simular(dt);
    else if (viva) p = ult;
    if (p) {
      const alvoFase = SIM ? p.fase : p.fase + (agora - tUlt) / 1000 * p.bpm / 60;
      if (p.bpm) R.bpm = p.bpm;
      // anda sozinho e é puxado aos poucos, para não tremer a cada foto que chega
      R.fase += dt * R.bpm / 60;
      const erro = alvoFase - R.fase;
      R.fase += Math.abs(erro) > 0.6 ? erro : erro * (1 - Math.exp(-dt * 8));
      R.noCompasso = p.noCompasso; R.compasso = p.compasso; R.frase = p.frase; if (!SIM) R.idade = p.idade;
      const sv = (a, b, s) => a + (b - a) * (1 - Math.exp(-dt * s));
      R.energia = sv(R.energia, p.energia, 3); R.tensao = sv(R.tensao, p.tensao, 5); R.presenca = sv(R.presenca, p.presenca, 8);
      R.baixo = sv(R.baixo, p.baixo, 30); R.medio = sv(R.medio, p.medio, 25); R.agudo = sv(R.agudo, p.agudo, 40); R.voz = sv(R.voz, p.voz, 10); R.brilho = sv(R.brilho, p.brilho, 6);
      R.kick = Math.max(R.kick * Math.exp(-dt * 7.5), p.kick); R.clap = Math.max(R.clap * Math.exp(-dt * 11), p.clap); R.hat = Math.max(R.hat * Math.exp(-dt * 22), p.hat);
      if (!SIM) { R.tom = p.tom; R.nota = p.nota; R.faixa = p.faixa; R.novidade = p.novidade; }
    } else {
      // sem análise: o maestro da página
      R.fase = M.fase; R.bpm = M.bpm; R.noCompasso = ((M.batida - M.tempo1) % 4 + 4) % 4; R.compasso = Math.floor(M.batida / 4); R.frase = R.compasso % 16;
      R.energia = M.energia; R.tensao = 0; R.presenca = M.semBumbo < 3 ? 1 : 0;
      R.kick = M.kick; R.baixo = M.grave; R.medio = M.medio; R.agudo = M.agudo; R.voz = M.medio * 0.5; R.clap = 0; R.hat = M.agudo * 0.4;
      const quer = !M.somReal ? 'silencio' : M.semBumbo >= 8 ? 'break' : M.calma ? 'calmo' : M.energia > 0.7 ? 'pico' : 'groove';
      if (quer !== R.secao) { R.secao = quer; R.iSecao = SECOES.indexOf(quer); disparar('secao', { secao: quer }); }
    }
    // Golpe previsto: bate exatamente na grade, um pouco adiantado. O bumbo detectado só chega depois: fica de reforço.
    const fa = R.fase + ADIANTA * R.bpm / 60;
    const fr = fa - Math.floor(fa);
    R.golpe = Math.max(R.presenca * Math.exp(-fr * 5.5), R.kick * 0.85);
    const b = Math.floor(fa);
    if (b !== batidaAntes) { batidaAntes = b; disparar('batida', { batida: b }); }
  };
  return R;
}
