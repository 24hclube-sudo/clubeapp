// Parte do player das telas que desenha a programação circadiana e os anúncios.
// ES5 de propósito: o painel de LED do térreo é um Chrome 73 (sem "inset", sem "?.", sem @property).
//
// O degradê é calculado aqui, numa tela bem pequena esticada pela placa de vídeo: pouco trabalho
// para as TVs e para o T50, e cada aparelho segue o relógio do servidor mesmo sem Wi-Fi.
(function (raiz) {
  var ESTILO =
    '@font-face{font-family:"Archivo";font-weight:500;src:url("fonts/Archivo-Medium.ttf")}' +
    '#anuncio{position:absolute;top:0;right:0;bottom:0;left:0;z-index:5;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .9s ease}' +
    '#anuncio.on{opacity:1}' +
    '#anuncio .an-item{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .6s ease;background:transparent}' +
    '#anuncio .an-item.on{opacity:1}' +
    '#anuncio .an-veu{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;opacity:0;z-index:2}';

  function div(css) { var e = document.createElement('div'); e.style.cssText = css; return e; }

  function criar(o) {
    var A = raiz.Ambiente;
    var ehLed = o.info.grupo === 'led' || o.id.indexOf('led') === 0;
    var estilo = document.createElement('style');
    // Regra das TVs: anúncio em tela cheia, sem faixa preta.
    estilo.textContent = ESTILO + (ehLed ? '' : '#anuncio .an-item{object-fit:cover}');
    document.head.appendChild(estilo);
    var caixa = document.createElement('div'); caixa.id = 'anuncio';
    var veu = div(''); veu.className = 'an-veu'; caixa.appendChild(veu);
    var dim = o.$('dim'); dim.parentNode.insertBefore(caixa, dim);

    if (ehLed && document.fonts && document.fonts.load) { try { document.fonts.load('500 52px Archivo'); } catch (e) {} }
    var FPS = ehLed ? 12 : 15;
    var amb = null, timer = null;

    // ---------- degradê ----------
    function novaTela(cols, lins, mapa) {
      var cv = document.createElement('canvas'); cv.width = cols; cv.height = lins;
      cv.style.cssText = 'display:block;width:100%;height:100%';
      var ctx = cv.getContext('2d'), img = ctx.createImageData(cols, lins), n = cols * lins;
      var us = new Float32Array(n), vs = new Float32Array(n);
      for (var y = 0, i = 0; y < lins; y++) for (var x = 0; x < cols; x++, i++) {
        var m = mapa((x + 0.5) / cols, (y + 0.5) / lins); us[i] = m[0]; vs[i] = m[1];
        img.data[i * 4 + 3] = 255;
      }
      return { cv: cv, ctx: ctx, img: img, us: us, vs: vs, n: n };
    }
    // Grão quase invisível por cima: quebra as faixas que um degradê cinza faria numa TV grande.
    function grao() {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d'), im = x.createImageData(128, 128);
      for (var i = 0; i < im.data.length; i += 4) {
        var v = Math.random() < 0.5 ? 0 : 255;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.random() * 6;
      }
      x.putImageData(im, 0, 0);
      var g = div('position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;background:url(' + c.toDataURL() + ') repeat');
      return g;
    }
    function montar(c) {
      var el = div('position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;background:#000');
      var tam = o.dims(), telas = [];
      if (ehLed) {
        // Painel do térreo: faixa lógica 4472x86 dobrada (mesma geometria dos vídeos e do logo).
        var d = o.DOBRA_LED, s = tam.w / d.saidaW;
        var quadro = div('position:absolute;left:0;top:0;width:' + d.saidaW + 'px;height:' + d.saidaH + 'px;transform-origin:0 0;transform:scale(' + s + ')');
        d.seg.forEach(function (g) {
          var janela = div('position:absolute;overflow:hidden;left:' + g.dx + 'px;top:' + g.dy + 'px;width:' + g.len + 'px;height:' + d.h + 'px');
          var t = novaTela(Math.max(8, Math.round(g.len / 32)), 1, function (fx) { return [(g.sx + fx * g.len) / d.w, 0.5]; });
          janela.appendChild(t.cv); quadro.appendChild(janela); telas.push(t);
        });
        el.appendChild(quadro);
      } else {
        // TV: a parede inteira é um degradê só, e cada TV mostra a sua fatia.
        var p = c.parede || { i: 0, n: 1 };
        var deitada = (o.info.grupo === 'telas' || o.info.app === 'tizen') && tam.w > tam.h;
        var emPe = deitada || tam.h > tam.w;
        var alvo = el;
        if (deitada) {
          // navegador deitado na TV em pé: desenha em pé e gira, igual ao modo logo
          alvo = div('position:absolute;left:0;top:0;width:' + tam.h + 'px;height:' + tam.w + 'px;transform-origin:0 0;transform:translate(0px,' + tam.h + 'px) rotate(-90deg)');
          el.appendChild(alvo);
        }
        var t = novaTela(emPe ? 45 : 80, emPe ? 80 : 45, function (fx, fy) { return [(p.i + fx) / p.n, fy]; });
        alvo.appendChild(t.cv); telas.push(t);
        el.appendChild(grao());
      }
      return { el: el, telas: telas };
    }
    function desenhar() {
      if (!amb || amb.pausa) return;
      var ms = o.now();
      var mo = A.momento(amb.comp, ms, amb.c.teste), s = A.superficie(mo, 'telas');
      if (!amb.lut || ms - amb.tLut > 2000 || ms < amb.tLut) { amb.lut = A.criarLut(s); amb.tLut = ms; amb.media = A.corMedia(s, amb.lut); }
      var pinta = A.pintor(s, amb.lut, ms / 1000);
      for (var k = 0; k < amb.telas.length; k++) {
        var t = amb.telas[k], dados = t.img.data;
        for (var i = 0; i < t.n; i++) pinta(t.us[i], t.vs[i], dados, i * 4);
        t.ctx.putImageData(t.img, 0, 0);
      }
    }
    function mostrar(c) {
      var comp = A.compilar(c.prog);
      // Mudou a programação com o degradê já no ar: só troca a conta, sem piscar a tela.
      if (amb && amb.el.parentNode === o.camadaAtual() && JSON.stringify(amb.c.parede) === JSON.stringify(c.parede)) {
        amb.comp = comp; amb.c = c; amb.lut = null;
        desenhar();
        return;
      }
      parar();
      var m = montar(c);
      amb = { el: m.el, telas: m.telas, comp: comp, c: c, lut: null, tLut: 0, media: [0, 0, 0], pausa: false };
      desenhar();
      o.trocarCamada(m.el);
      timer = setInterval(desenhar, 1000 / FPS);
    }
    function parar() {
      if (timer) { clearInterval(timer); timer = null; }
      amb = null;
    }

    // ---------- anúncios ----------
    var an = null, anIdx = -1, textoNoAr = false, limparT = null;
    function receber(m) {
      if (m.fim) { fechar(); return; }
      clearTimeout(limparT);
      an = m; anIdx = -1;
      if (!ehLed) (m.itens || []).forEach(function (it) { o.urlLocal(o.versaoDaTela(it.src)); });
    }
    function esvaziar() {
      var filhos = caixa.querySelectorAll('.an-item, .an-texto');
      for (var i = 0; i < filhos.length; i++) {
        var f = filhos[i];
        if (f.tagName === 'VIDEO') { f.pause(); f.removeAttribute('src'); f.load(); }
        caixa.removeChild(f);
      }
    }
    function fechar() {
      if (!an && !textoNoAr) return;
      an = null; anIdx = -1; textoNoAr = false;
      if (amb) { amb.pausa = false; desenhar(); }
      caixa.classList.remove('on');
      clearTimeout(limparT);
      limparT = setTimeout(esvaziar, 1000);
    }
    function revelar(el) {
      el.classList.add('on');
      caixa.classList.add('on');
      // com fundo preto o degradê fica escondido: para de calcular enquanto o anúncio estiver no ar
      if (amb && an && an.fundo !== 'ambiente') setTimeout(function () { if (amb && an) amb.pausa = true; }, 1100);
      setTimeout(function () {
        var todos = caixa.querySelectorAll('.an-item');
        for (var i = 0; i < todos.length; i++) {
          if (todos[i] === el) break;
          if (todos[i].tagName === 'VIDEO') { todos[i].pause(); todos[i].removeAttribute('src'); todos[i].load(); }
          caixa.removeChild(todos[i]);
        }
      }, 800);
    }
    function mostrarItem(it, offMs, idx) {
      o.urlLocal(o.versaoDaTela(it.src)).then(function (url) {
        if (!an || anIdx !== idx) return;
        var el, feito = false;
        var pronto = function () { if (!feito && el.parentNode === caixa) { feito = true; revelar(el); } };
        if (it.kind === 'video') {
          el = document.createElement('video');
          el.muted = true; el.autoplay = true; el.playsInline = true; el.loop = false; el.src = url;
          el.addEventListener('loadedmetadata', function () { if (offMs > 400 && el.duration) el.currentTime = Math.min(el.duration - 0.1, offMs / 1000); });
          el.addEventListener('playing', pronto);
          el.onerror = pronto;
          var tocar = el.play(); if (tocar && tocar.catch) tocar.catch(function () {});
          setTimeout(pronto, 1500);
        } else {
          el = new Image(); el.onload = pronto; el.onerror = pronto; el.src = url;
        }
        el.className = 'an-item';
        caixa.insertBefore(el, veu);
      });
    }
    // Letreiro do painel de LED: o post não cabe numa faixa de 86 px, então vira texto passando.
    function mostrarTexto(texto) {
      var d = o.DOBRA_LED, tam = o.dims(), s = tam.w / d.saidaW;
      var fonte = '500 54px Archivo,Arial,sans-serif', cor = '#ffffff';
      var medida = document.createElement('span');
      medida.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + fonte;
      medida.textContent = texto; document.body.appendChild(medida);
      var periodo = Math.ceil(medida.offsetWidth) + 260; document.body.removeChild(medida);
      var t0 = document.timeline ? document.timeline.currentTime : null;
      var quadro = div('position:absolute;left:0;top:0;width:' + d.saidaW + 'px;height:' + d.saidaH + 'px;transform-origin:0 0;transform:scale(' + s + ')');
      quadro.className = 'an-texto';
      d.seg.forEach(function (g) {
        var janela = div('position:absolute;overflow:hidden;left:' + g.dx + 'px;top:' + g.dy + 'px;width:' + g.len + 'px;height:' + d.h + 'px');
        var trilho = div('position:absolute;top:0;left:' + (-g.sx) + 'px;height:' + d.h + 'px;display:flex;align-items:center;will-change:transform');
        for (var i = 0, n = Math.ceil(d.w / periodo) + 1; i < n; i++) {
          var sl = div('flex:0 0 ' + periodo + 'px;white-space:nowrap;color:' + cor + ';font:' + fonte);
          sl.textContent = texto; trilho.appendChild(sl);
        }
        janela.appendChild(trilho); quadro.appendChild(janela);
        var ani = trilho.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-periodo) + 'px)' }], { duration: periodo / 200 * 1000, iterations: Infinity, easing: 'linear' });
        if (t0 !== null) ani.startTime = t0;
      });
      caixa.insertBefore(quadro, veu);
      caixa.classList.add('on');
    }
    function tick() {
      if (!an) return;
      var t = o.now() - an.startAt;
      if (t < 0) return;
      if (t >= an.total) { fechar(); return; }
      // no LED o degradê escurece para o letreiro branco aparecer, a qualquer hora do dia
      caixa.style.background = ehLed ? 'rgba(0,0,0,.62)' : an.fundo === 'ambiente' ? 'transparent' : '#000';
      veu.style.opacity = String(1 - Math.max(0, Math.min(1, an.brilho == null ? 1 : an.brilho)));
      if (ehLed) {
        if (an.texto && !textoNoAr) { textoNoAr = true; esvaziar(); mostrarTexto(an.texto); }
        return;
      }
      var itens = an.itens || [], acum = 0;
      for (var i = 0; i < itens.length; i++) {
        var d = itens[i].dur * 1000;
        if (t < acum + d) {
          if (i !== anIdx) { anIdx = i; mostrarItem(itens[i], t - acum, i); }
          return;
        }
        acum += d;
      }
    }
    setInterval(tick, 200);

    return {
      mostrar: mostrar, parar: parar, receber: receber,
      anuncioNoAr: function () { return an ? an.id : null; },
    };
  }

  raiz.ProgPlayer = { criar: criar };
})(window);
