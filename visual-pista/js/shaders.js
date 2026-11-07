// Shaders do painel. Coordenadas em pixels do painel: x 0–1032, y 0–5676 de cima para baixo
// (y = 0 é a ponta do teto longe do DJ; de 4988 para baixo é o fundo do DJ).
const COMUM = /* glsl */`
#define PW 1032.
#define PH 5676.
#define TETO 4988.
#define PI 3.14159265
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

export const vertConteudo = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;

// ---- Conteúdo: degradê da marca + figuras prateadas + CLUBE no fundo do DJ ----
export const fragConteudo = /* glsl */`
precision highp float;
${COMUM}
uniform vec3 uC0, uC1, uC2;                  // degradê oficial (pontos 0 / 55 / 91 %)
uniform sampler2D uF1, uF2, uE1, uE2, uLogo, uNome, uEspectro;
uniform vec4 uRectF, uRectE, uRectD, uRectL, uRectN; // x, y, largura, altura (px do painel)
uniform float uTempo, uFluxo, uGrave, uMedio, uAgudo, uBumbo, uBatida, uCompasso, uBrilho, uCena, uVelOnda;
uniform vec4 uOndas[8];                      // (início, força) de cada bumbo
varying vec2 vUv;

float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * ruido(p); p = p * 2.03 + 17.1; a *= .5; } return s; }

vec3 grad3(float t) {
  t = clamp(t, 0., 1.);
  return t < .55 ? mix(uC0, uC1, t / .55) : mix(uC1, uC2, min(1., (t - .55) / .36));
}
// gradiente "metal" do brand book (8 pontos, todos cinza)
float metal(float t) {
  t = clamp(t, 0., 1.);
  float v = .435;
  v = mix(v, 1.,   smoothstep(.01, .19, t));
  v = mix(v, .612, smoothstep(.19, .41, t));
  v = mix(v, .824, smoothstep(.41, .52, t));
  v = mix(v, .706, smoothstep(.52, .64, t));
  v = mix(v, .522, smoothstep(.64, .70, t));
  v = mix(v, .796, smoothstep(.70, .75, t));
  v = mix(v, .890, smoothstep(.75, .84, t));
  return v;
}
// fatias verticais (43 px = largura das lâminas) que pulam na batida, como o recorte das figuras
float deslFatia(float x, float forca) {
  float f = floor(x / 43.);
  return step(.55, hash(vec2(f, uBatida))) * (hash(vec2(f + 7.3, uBatida * 1.37)) - .5) * 2. * forca;
}
vec2 localRect(vec4 r, vec2 p, float desl) { vec2 u = (p - r.xy) / r.zw; u.y += desl / r.w; return u; }
float dentro(vec2 u) { return step(0., u.x) * step(u.x, 1.) * step(0., u.y) * step(u.y, 1.); }
vec2 tc(vec2 u) { return clamp(vec2(u.x, 1. - u.y), 0., 1.); }

void main() {
  vec2 p = vec2(vUv.x * PW, (1. - vUv.y) * PH);
  float dj = step(TETO, p.y);
  float s = max(0., TETO - p.y);             // distância da dobra, subindo pelo teto
  float k = (p.y - TETO) / (PH - TETO);      // 0 = topo do fundo do DJ, 1 = base

  // fundo: degradê claro perto do DJ, escurecendo para a entrada, com ruído lento correndo para a pista
  vec2 q = vec2(p.x / PW * 1.3, (p.y + uFluxo) / 1100.);
  vec2 w = vec2(fbm(q + vec2(0., uTempo * .02)), fbm(q + vec2(5.2, 1.3)));
  float n = fbm(q + 1.6 * w);
  float t = mix(.06 + .92 * pow(s / TETO, .75), .78 - .62 * k, dj) + (n - .5) * .36;
  vec3 col = grad3(t);
  col *= mix(mix(1., .3, smoothstep(.3, 1., s / TETO)), 1., dj);
  col *= .8 + .28 * uGrave;

  // ondas do bumbo saindo do DJ para o fundo da pista
  float onda = 0.;
  for (int i = 0; i < 8; i++) {
    vec4 o = uOndas[i];
    float dt = uTempo - o.x;
    if (o.y <= 0. || dt < 0.) continue;
    float d = (s - dt * uVelOnda) / 520.;
    onda += o.y * exp(-d * d) * exp(-dt * .8);
  }
  col = mix(col, uC0 * 1.12 + .06, min(onda, 1.) * .55);

  float fatia = floor(p.x / 43.);
  float varre = uCompasso * 2.2 - .5;        // brilho que desce pela figura uma vez por compasso

  if (uCena < .5 || uCena > 1.5) {
    // figura grande perto da dobra: no bumbo ela se desfaz e ficam os blocos (versão "-2")
    float desl = uCena > 1.5
      ? texture2D(uEspectro, vec2(abs(fatia - 11.5) / 12. * .9 + .02, .5)).r * 520.  // equalizador
      : deslFatia(p.x, uBumbo * uBumbo * 150. + uMedio * 12.);
    vec2 u = localRect(uRectF, p, desl);
    float m = dentro(u);
    vec4 f1 = texture2D(uF1, tc(u)) * m, f2 = texture2D(uF2, tc(u)) * m;
    float a = max(f1.a * (1. - uBumbo * .7 * (1. - f2.a)), f2.a * uBumbo);
    vec3 prata = mix(f1.rgb, f2.rgb, f2.a * uBumbo) * (.9 + .22 * uAgudo);
    prata += exp(-pow((u.y + u.x * .35 - varre) / .05, 2.)) * .3 + f2.a * uBumbo * .35;
    col = mix(col, prata, a);

    // eco na ponta de lá: só os blocos de outra figura, mais apagados, acendendo no bumbo
    vec2 ue = localRect(uRectE, p, desl * .5);
    vec4 e2 = texture2D(uE2, tc(ue)) * dentro(ue);
    col = mix(col, e2.rgb * .95, e2.a * (.42 + .5 * uBumbo));

    // Pista Quente e Millos Kaiser, alternando, passando pelas lâminas como todo o resto
    vec2 un = localRect(uRectN, p, desl * .5);
    float mn = texture2D(uNome, tc(un)).a * dentro(un);
    col = mix(col, vec3(metal(un.x * .9 + .05 + .08 * sin(uTempo * .4))) * (.95 + .2 * uBumbo), mn);
  }

  if (dj > .5) {
    // fundo do DJ: figura pequena + CLUBE em metal, como nas fotos da pista
    vec2 u = localRect(uRectD, p, deslFatia(p.x * 2.5, uBumbo * uBumbo * 50.));
    float m = dentro(u);
    vec4 d1 = texture2D(uE1, tc(u)) * m, d2 = texture2D(uE2, tc(u)) * m;
    float a = max(d1.a * (1. - uBumbo * .5 * (1. - d2.a)), d2.a * uBumbo);
    vec3 prata = mix(d1.rgb, d2.rgb, d2.a * uBumbo) + exp(-pow((u.y + u.x * .35 - varre) / .06, 2.)) * .3;
    col = mix(col, prata, a);

    vec2 ul = localRect(uRectL, p, 0.);
    float ml = texture2D(uLogo, tc(ul)).a * dentro(ul);
    float lum = metal(ul.x * .9 + .05 + .08 * sin(uTempo * .4)) + exp(-pow((ul.x - (uCompasso * 1.6 - .3)) / .06, 2.)) * .35;
    col = mix(col, vec3(lum) * (.95 + .1 * uBumbo), ml);
  }
  gl_FragColor = vec4(col * uBrilho, 1.);
}
`;

// ---- Lâminas: o painel inteiro vira uma parede de lâminas de metal (43 x 86 px, 4 por módulo)
// que giram no eixo vertical. Paradas, mostram o conteúdo limpo; o som as faz girar (aparecem
// as frestas pretas e o reflexo do metal) e, na virada, giram 180° mostrando o próximo quadro.
export const vertLaminas = /* glsl */`
${COMUM}
#define CW 43.
#define CH 86.
#define NCOL 24.
attribute vec4 aCelula;                      // centro x, centro y (px), coluna, linha
uniform float uTempo, uVirada, uVelOnda, uEspAmt, uGrave;
uniform vec4 uOndas[8];
uniform sampler2D uEspectro;
varying vec2 vLocal, vCentro;
varying float vAng;
void main() {
  vec2 c = aCelula.xy;
  float col = aCelula.z, lin = aCelula.w;
  float s = max(0., TETO - c.y);
  float ang = 0.;
  // espectro espelhado: graves no meio, agudos nas bordas; lâminas vizinhas giram para lados opostos
  float e = texture2D(uEspectro, vec2(abs(col - (NCOL - 1.) * .5) / (NCOL * .5) * .9 + .02, .5)).r;
  ang += (mod(col, 2.) * 2. - 1.) * e * e * uEspAmt;        // e²: faixas calmas ficam paradas
  // grave: ondulação lenta ao longo do teto
  ang += sin(s / 700. - uTempo * 1.3 + col * .25) * uGrave * .12;
  // bumbos: faixa de lâminas girando que corre do DJ para a entrada
  float acaso = hash(vec2(col, lin));
  for (int i = 0; i < 8; i++) {
    vec4 o = uOndas[i];
    float dt = uTempo - o.x;
    if (o.y <= 0. || dt < 0.) continue;
    float d = (s - dt * uVelOnda) / 380.;
    ang += o.y * 1.05 * exp(-d * d) * exp(-dt * .7) * (.85 + .3 * acaso);
  }
  // zona morta: giro pequeno vira fresta de 1 px no painel inteiro; abaixo disso a lâmina fica parada
  ang = sign(ang) * max(0., abs(ang) - .08);
  ang = clamp(ang * (c.y > TETO ? .35 : 1.), -1.45, 1.45);
  // virada para o próximo quadro: 180°, começando no DJ e subindo o teto
  if (uVirada >= 0.) {
    float atraso = hash(vec2(col * 3.1, lin * 1.7)) * 380. + abs(col - 11.5) * 14.;
    float v = clamp((uVirada - s - atraso) / 520., 0., 1.);
    ang += PI * v * v * (3. - 2. * v);
  }
  vAng = ang; vLocal = position.xy; vCentro = c;
  float x = position.x * CW, y = position.y * CH;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(c.x + x * cos(ang), -c.y + y, -x * sin(ang), 1.);
}
`;

export const fragLaminas = /* glsl */`
precision highp float;
${COMUM}
#define CW 43.
#define CH 86.
uniform sampler2D uA, uB;
uniform float uReflexo;
varying vec2 vLocal, vCentro;
varying float vAng;
void main() {
  // frente = quadro atual; verso = próximo (lido sem espelhar, para ficar certo depois dos 180°)
  float lx = vLocal.x * CW;
  vec2 p = vec2(vCentro.x + (gl_FrontFacing ? lx : -lx), vCentro.y - vLocal.y * CH);
  vec2 uv = vec2(p.x / PW, 1. - p.y / PH);
  vec3 col = gl_FrontFacing ? texture2D(uA, uv).rgb : texture2D(uB, uv).rgb;
  float sn = abs(sin(vAng));
  col *= mix(1., .45, sn);                                   // girada, pega menos luz
  col *= 1. - sn * .5 * smoothstep(.3, .5, abs(vLocal.x));   // aresta
  float r = exp(-pow((sn - .6) / .13, 2.)) * uReflexo;       // reflexo do metal ao passar pela luz
  col += vec3(.89, .89, .9) * r * (.6 + .4 * (1. - abs(vLocal.x) * 2.));
  gl_FragColor = vec4(col, 1.);
}
`;
