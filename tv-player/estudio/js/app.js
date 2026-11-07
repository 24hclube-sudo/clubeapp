(() => {
  const $ = (id) => document.getElementById(id);

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const stage = $("stage");
  const textHud = $("textHud");
  const viewerSurface = stage ? stage.closest(".viewerSurface") : null;

  const ui = {
    gridToggle: $("gridToggle"),
    gridOpacity: $("gridOpacity"),
    aspect: $("aspect"),
    fitMode: $("fitMode"),
    motionMode: $("motionMode"),
    paletteA: $("paletteA"),

    tintMotion: $("tintMotion"),
    mediaTintMotion: $("mediaTintMotion"),
    overlayTintMotion: $("overlayTintMotion"),

    tintPalette: $("tintPalette"),
    mediaTintPalette: $("mediaTintPalette"),
    overlayTintPalette: $("overlayTintPalette"),

    tintColorSlot: $("tintColorSlot"),
    mediaTintColorSlot: $("mediaTintColorSlot"),
    overlayTintColorSlot: $("overlayTintColorSlot"),

    tintDuration: $("tintDuration"),
    gradTintOpacity: $("gradTintOpacity"),
    mediaTintOpacity: $("mediaTintOpacity"),
    overlayTintOpacity: $("overlayTintOpacity"),

    sceneMode: $("sceneMode"),
    sceneDuration: $("sceneDuration"),

    speed: $("speed"),
    motionLoopDuration: $("motionLoopDuration"),
    contrast: $("contrast"),
    light: $("light"),
    tilt3d: $("tilt3d"),
    tilt3dMode: $("tilt3dMode"),
    depthDuration: $("depthDuration"),
    depthSyncExport: $("depthSyncExport"),

    complexity: $("complexity"),
    regen: $("regen"),
    reset: $("reset"),

    layoutMode: $("layoutMode"),
    layoutDir: $("layoutDir"),
    layoutAmt: $("layoutAmt"),
    layoutSmooth: $("layoutSmooth"),

    pauseBtn: $("pauseBtn"),

    selId: $("selId"),
    selType: $("selType"),
    selName: $("selName"),

    cellPalette: $("cellPalette"),
    cellColor: $("cellColor"),
    applyCellColor: $("applyCellColor"),
    autoCell: $("autoCell"),
    clearCell: $("clearCell"),

    lockCell: $("lockCell"),
    unlockCell: $("unlockCell"),

    mediaScale: $("mediaScale"),
    mediaOffsetX: $("mediaOffsetX"),
    mediaOffsetY: $("mediaOffsetY"),
    mediaReset: $("mediaReset"),

    exportPng: $("exportPng"),
    recSeconds: $("recSeconds"),
    recFps: $("recFps"),
    recRes: $("recRes"),
    recStart: $("recStart"),
    recStop: $("recStop"),
    exportSummary: $("exportSummary"),

    addText: $("addText"),
    deleteText: $("deleteText"),
    bringFront: $("bringFront"),
    sendBack: $("sendBack"),

    textFont: $("textFont"),
    textRole: $("textRole"),
    textMotion: $("textMotion"),
    textBindBlock: $("textBindBlock"),
    textReleaseBlock: $("textReleaseBlock"),
    textLines: $("textLines"),
    textMargin: $("textMargin"),
    textMetrics: $("textMetrics"),
    textSize: $("textSize"),
    textColor: $("textColor"),
    textOpacity: $("textOpacity"),
    textTracking: $("textTracking"),
    textAlign: $("textAlign"),
    textBoxW: $("textBoxW"),
    textLineH: $("textLineH"),

    assetTintMode: $("assetTintMode"),
    assetTint: $("assetTint"),
    assetOpacity: $("assetOpacity"),

    assetsMount: $("assetsMount"),
  };

  const PALETTES = {
    vermelho: ["#ff8564", "#ff4c2c", "#ff0016"],
    verde: ["#00bd64", "#00ae40", "#007529"],
    azul: ["#54b7dc", "#009edd", "#006eaa"],
    neutro: ["#111111", "#ffffff", "#9c9d9d", "#d2d3d3", "#b4b4b5", "#858585", "#bcbccd", "#e3e4e5"],
  };

  const ASPECTS = {
    reels: 9 / 16,
    feed: 4 / 5,
  };

  const PORTRAIT_ASPECT_KEYS = new Set(["reels", "feed"]);
  const TEXT_UNIT = 6;
  const TEXT_TOKENS = [18, 24, 30, 36, 42, 48, 54, 60, 72, 84, 96, 108, 120, 132, 144, 156, 180, 216, 240];
  const TEXT_ROLE_RATIOS = {
    title: 1,
    section: 0.38,
    body: 0.38,
    micro: 0.24,
    special: 1,
  };
  const GRID_TEXT_MOTION_MODES = new Set(["follow", "driftX", "driftY"]);
  const textMeasureCanvas = document.createElement("canvas");
  const textMeasureCtx = textMeasureCanvas.getContext("2d");
  let textFlowProbe = null;

  const state = {
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    screenW: 0,
    screenH: 0,
    cols: 4,
    rows: 4,
    blocks: [],
    media: new Map(),
    selectedBlockId: null,

    paused: false,
    pauseTimeSec: 0,
    lastTimeSec: 0,

    overlays: [],
    selectedOverlayId: null,

    assets: {
      uiReady: false,
      selectEl: null,
      addBtn: null,
    },

    assetCache: new Map(),
    sceneSeed: 1337,
    tintSeed: 7331,

    exporting: false,
    exportDuration: 6,

    recording: false,
    recordingStartSec: 0,
    recordingPhaseOffset01: 0,
  };

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function smootherstep(t) {
    t = clamp01(t);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function wrap01(x) {
    const y = x - Math.floor(x);
    return y < 0 ? y + 1 : y;
  }

  function getMotionLoopDurationSec(p) {
    return Math.max(4, parseFloat(p?.motionLoopDuration ?? 12) || 12);
  }

  function getLoopCycleCount(loopDurationSec, targetDurationSec) {
    const safeTarget = Math.max(0.2, parseFloat(targetDurationSec || loopDurationSec) || loopDurationSec);
    return Math.max(1, Math.round(loopDurationSec / safeTarget));
  }

  function getLoopSubdivisionDuration(p, targetDurationSec) {
    const loopDurationSec = getMotionLoopDurationSec(p);
    return loopDurationSec / getLoopCycleCount(loopDurationSec, targetDurationSec);
  }

  function getLoopPhase01(p, rawTimeSec, targetDurationSec = getMotionLoopDurationSec(p), phaseOffset01 = 0) {
    const loopDurationSec = getMotionLoopDurationSec(p);
    const loopPhase01 = wrap01(rawTimeSec / loopDurationSec);
    const cycles = getLoopCycleCount(loopDurationSec, targetDurationSec);
    return wrap01((loopPhase01 * cycles) + phaseOffset01);
  }

  function getLoopAngle(p, rawTimeSec, targetDurationSec, phaseOffset01 = 0) {
    return getLoopPhase01(p, rawTimeSec, targetDurationSec, phaseOffset01) * Math.PI * 2;
  }

  function getLoopSegmentState(p, rawTimeSec, targetDurationSec) {
    const loopDurationSec = getMotionLoopDurationSec(p);
    const cycles = getLoopCycleCount(loopDurationSec, targetDurationSec);
    const cyclePos = wrap01(rawTimeSec / loopDurationSec) * cycles;
    const whole = Math.floor(cyclePos);
    return {
      index: whole % cycles,
      cycles,
      duration: loopDurationSec / cycles,
      localT: cyclePos - whole,
    };
  }

  function getSpeedScaledDuration(baseDurationSec, speed = 1) {
    const safeSpeed = Math.max(0, parseFloat(speed || 0) || 0);
    const t = clamp01(safeSpeed / 2.5);
    return baseDurationSec * lerp(1.85, 0.45, t);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = String(hex).replace("#", "").trim();
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToCss({ r, g, b }) {
    return `rgb(${r},${g},${b})`;
  }

  function applyContrastToRgbString(rgb, contrast = 1) {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgb;
    let r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    const mid = 128;
    r = Math.round(mid + (r - mid) * contrast);
    g = Math.round(mid + (g - mid) * contrast);
    b = Math.round(mid + (b - mid) * contrast);
    return rgbToCss({
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
    });
  }

  function lerpColor(c1, c2, t) {
    const a = hexToRgb(c1);
    const b = hexToRgb(c2);
    return rgbToCss({
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
    });
  }

  function pickStops(name) {
    return (PALETTES[name] || PALETTES.azul).slice();
  }

  function sampleStopsForGradient(stops) {
    if (stops.length <= 3) return stops.slice(0, 3);
    const mid = Math.floor(stops.length * 0.55);
    return [stops[0], stops[mid], stops[stops.length - 1]];
  }

  function getTintBaseColor(paletteName, slot) {
    const triad = sampleStopsForGradient(pickStops(paletteName));
    const idx = Math.max(0, Math.min(2, parseInt(slot, 10) || 0));
    return triad[idx] || triad[1] || triad[0] || "#ffffff";
  }

  function updateTintSlotLabelsForSelect(selectEl, paletteName) {
    if (!selectEl) return;
    const stops = sampleStopsForGradient(pickStops(paletteName));
    Array.from(selectEl.options).forEach((opt, i) => {
      const hex = stops[i] || stops[0] || "#ffffff";
      opt.textContent = `Cor ${i + 1} ${hex}`;
    });
  }

  function refreshTintSlotLabels() {
    updateTintSlotLabelsForSelect(ui.tintColorSlot, ui.tintPalette.value);
    updateTintSlotLabelsForSelect(ui.mediaTintColorSlot, ui.mediaTintPalette.value);
    updateTintSlotLabelsForSelect(ui.overlayTintColorSlot, ui.overlayTintPalette.value);
  }

  function setCanvasQuality(targetCtx) {
    if (!targetCtx) return;
    targetCtx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in targetCtx) targetCtx.imageSmoothingQuality = "high";
  }

  function normalizeAspectKey(key) {
    return PORTRAIT_ASPECT_KEYS.has(key) ? key : "feed";
  }

  function getStageHostBox() {
    const host = viewerSurface || stage?.parentElement;
    if (!host) {
      return {
        width: Math.max(1, window.innerWidth || 1),
        height: Math.max(1, window.innerHeight || 1),
      };
    }

    const rect = host.getBoundingClientRect();
    const styles = window.getComputedStyle(host);
    const padX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
    const padY = parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");

    return {
      width: Math.max(1, Math.round(rect.width - padX)),
      height: Math.max(1, Math.round(rect.height - padY)),
    };
  }

  function fitStageToViewport() {
    const aspect = getSelectedAspectRatio();
    const hostBox = getStageHostBox();
    const desktopPreview = window.matchMedia(`(min-width: ${DESKTOP_STAGE_BREAKPOINT}px)`).matches;
    const maxWidth = Math.max(1, Math.min(STAGE_MAX_WIDTH, hostBox.width));
    const maxHeight = desktopPreview ? Math.max(1, hostBox.height) : Number.POSITIVE_INFINITY;

    let width = maxWidth;
    let height = Math.round(width / Math.max(0.0001, aspect));

    if (Number.isFinite(maxHeight) && height > maxHeight) {
      height = maxHeight;
      width = Math.max(1, Math.round(height * aspect));
    }

    width = Math.max(1, Math.min(width, maxWidth, STAGE_MAX_WIDTH));
    height = Math.max(1, Math.round(width / Math.max(0.0001, aspect)));

    if (Number.isFinite(maxHeight) && height > maxHeight) {
      height = maxHeight;
      width = Math.max(1, Math.round(height * aspect));
    }

    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.aspectRatio = `${aspect}`;
  }

  function scheduleResizeCanvas() {
    if (resizeCanvasRaf) return;
    resizeCanvasRaf = requestAnimationFrame(() => {
      resizeCanvasRaf = 0;
      resizeCanvas();
    });
  }

  function resizeCanvas() {
    fitStageToViewport();

    const rect = stage.getBoundingClientRect();
    const nextScreenW = Math.max(1, Math.round(rect.width));
    const nextScreenH = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    state.dpr = nextDpr;
    state.screenW = nextScreenW;
    state.screenH = nextScreenH;

    const renderW = Math.max(1, Math.round(state.screenW * state.dpr));
    const renderH = Math.max(1, Math.round(state.screenH * state.dpr));

    if (canvas.width !== renderW) canvas.width = renderW;
    if (canvas.height !== renderH) canvas.height = renderH;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    setCanvasQuality(ctx);

    layoutOverlaysDom();
  }

  function setAspect(key) {
    const normalizedKey = normalizeAspectKey(key);
    const ar = ASPECTS[normalizedKey] ?? ASPECTS.feed;
    ui.aspect.value = normalizedKey;
    stage.style.aspectRatio = `${ar}`;
    scheduleResizeCanvas();
    refreshExportSummary();
  }

  function normalizeWeights(w) {
    const minW = 0.11;
    const ww = w.map(v => Math.max(minW, v));
    const sum = ww.reduce((a, b) => a + b, 0);
    return ww.map(v => v / sum);
  }

  function enforceMinSpacingSoft(arr, pad) {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < arr.length - 1; i++) {
        const lo = arr[i - 1] + pad;
        const hi = arr[i + 1] - pad;
        arr[i] = Math.max(lo, Math.min(arr[i], hi));
      }
    }
  }

  function makeLayoutState() {
    return {
      seed: Math.floor(Math.random() * 1e9),
      lastKey: "",
      progress: 0,
      lastTime: null,
      fromCol: [0.25, 0.25, 0.25, 0.25],
      fromRow: [0.25, 0.25, 0.25, 0.25],
      toCol: [0.25, 0.25, 0.25, 0.25],
      toRow: [0.25, 0.25, 0.25, 0.25],
      smoothXs: null,
      smoothYs: null,
    };
  }

  const layoutScreen = makeLayoutState();
  const STAGE_MAX_WIDTH = 900;
  const DESKTOP_STAGE_BREAKPOINT = 1181;
  let resizeCanvasRaf = 0;

  function scaleLineArray(values, sourceSize, targetSize) {
    if (!Array.isArray(values)) return null;
    const safeSource = Math.max(1, sourceSize || 1);
    const scale = (targetSize || safeSource) / safeSource;
    return values.map((value) => value * scale);
  }

  function cloneLayoutState(layoutState, sourceW = state.screenW, sourceH = state.screenH, targetW = sourceW, targetH = sourceH) {
    return {
      seed: layoutState.seed,
      lastKey: layoutState.lastKey,
      progress: layoutState.progress,
      lastTime: layoutState.lastTime,
      fromCol: (layoutState.fromCol || [0.25, 0.25, 0.25, 0.25]).slice(),
      fromRow: (layoutState.fromRow || [0.25, 0.25, 0.25, 0.25]).slice(),
      toCol: (layoutState.toCol || [0.25, 0.25, 0.25, 0.25]).slice(),
      toRow: (layoutState.toRow || [0.25, 0.25, 0.25, 0.25]).slice(),
      smoothXs: scaleLineArray(layoutState.smoothXs, sourceW, targetW),
      smoothYs: scaleLineArray(layoutState.smoothYs, sourceH, targetH),
    };
  }

  function getSelectedAspectRatio() {
    return ASPECTS[normalizeAspectKey(ui.aspect.value)] ?? ASPECTS.feed;
  }

  function getExportDimensions() {
    const base = Math.max(240, parseInt(ui.recRes.value || "1080", 10) || 1080);
    const aspect = getSelectedAspectRatio();

    if (aspect >= 1) {
      const height = base;
      return {
        width: Math.max(1, Math.round(height * aspect)),
        height,
      };
    }

    const width = base;
    return {
      width,
      height: Math.max(1, Math.round(width / Math.max(0.0001, aspect))),
    };
  }

  function pickRecordingFormat() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
      return { mimeType: "", extension: "webm", label: "MediaRecorder indisponivel", fallback: true };
    }

    const h264Candidates = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4;codecs=avc1.4d001f",
      "video/mp4;codecs=avc1.4d0028",
      "video/mp4;codecs=avc1.640028",
      "video/mp4;codecs=avc1.4d002a",
      "video/mp4;codecs=avc1",
      "video/mp4;codecs=h264",
      "video/mp4",
    ];

    for (const mimeType of h264Candidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return { mimeType, extension: "mp4", label: "H.264 MP4", fallback: false };
      }
    }

    const fallbackCandidates = [
      { mimeType: "video/webm;codecs=vp9", extension: "webm", label: "Fallback WebM VP9" },
      { mimeType: "video/webm;codecs=vp8", extension: "webm", label: "Fallback WebM VP8" },
      { mimeType: "video/webm", extension: "webm", label: "Fallback WebM" },
    ];

    for (const candidate of fallbackCandidates) {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
        return { ...candidate, fallback: true };
      }
    }

    return { mimeType: "", extension: "webm", label: "Browser default codec", fallback: true };
  }

  function isMp4Format(format) {
    return !!(format && format.extension === "mp4");
  }

  function refreshExportSummary() {
    if (!ui.exportSummary) return;
    const { width, height } = getExportDimensions();
    const fps = Math.max(1, parseInt(ui.recFps.value || "60", 10) || 60);
    const format = pickRecordingFormat();

    ui.exportSummary.textContent = `${width} x ${height} / ${fps} fps / ${format.label}`;
    ui.exportSummary.dataset.codecFallback = format.fallback ? "true" : "false";
    ui.exportSummary.title = format.fallback
      ? "H.264 nao foi exposto pelo navegador; o export vai usar um codec de fallback."
      : "Export configurado para MP4 em H.264.";
    if (ui.recStart) {
      ui.recStart.title = ui.exportSummary.title;
    }
  }

  function makeTargetWeights(mode, amt, dir, seed) {
    const rnd = mulberry32(seed);
    const a = clamp01(amt);
    const rand = (min, max) => min + (max - min) * rnd();

    let cw = [1, 1, 1, 1];
    let rw = [1, 1, 1, 1];

    const tiltToRight = dir === "right" ? 1 : dir === "left" ? -1 : 0;
    const tiltToDown = dir === "down" ? 1 : dir === "up" ? -1 : 0;

    function biasIndex(i, sign) {
      const centered = (i - 1.5) / 1.5;
      return 1 + a * 0.22 * centered * sign;
    }

    if (mode === "morph") {
      const pool = ["stripeV", "stripeH", "twoCols", "twoRows", "frameCenter", "frameCorner", "ladder", "balance", "quadrant", "ripple"];
      mode = pool[Math.floor(rnd() * pool.length)];
    }

    if (mode === "quadrant") {
      const s = 1 + a * rand(0.6, 1.2);
      const inv = 2 - s;
      const corner = ["tl", "tr", "bl", "br"][Math.floor(rnd() * 4)];
      if (corner === "tl" || corner === "bl") cw = [s, s, inv, inv];
      if (corner === "tr" || corner === "br") cw = [inv, inv, s, s];
      if (corner === "tl" || corner === "tr") rw = [s, s, inv, inv];
      if (corner === "bl" || corner === "br") rw = [inv, inv, s, s];
    }

    if (mode === "ripple") {
      cw = cw.map((_, i) => 1 + a * rand(-0.35, 0.95) * biasIndex(i, tiltToRight));
      rw = rw.map((_, j) => 1 + a * rand(-0.35, 0.95) * biasIndex(j, tiltToDown));
      const hot = rnd() < 0.5 ? 0 : 3;
      cw[hot] *= 1 + a * rand(0.25, 0.85);
      rw[hot] *= 1 + a * rand(0.20, 0.70);
    }

    if (mode === "stripeV") {
      const hero = Math.floor(rnd() * 4);
      cw = cw.map((_, i) => (1 - a * 0.18 + a * rand(-0.12, 0.20)) * biasIndex(i, tiltToRight));
      cw[hero] = (1 + a * rand(0.9, 1.6)) * biasIndex(hero, tiltToRight);
      rw = rw.map((_, j) => (1 + a * rand(-0.20, 0.45)) * biasIndex(j, tiltToDown));
    }

    if (mode === "stripeH") {
      const hero = Math.floor(rnd() * 4);
      rw = rw.map((_, j) => (1 - a * 0.18 + a * rand(-0.12, 0.20)) * biasIndex(j, tiltToDown));
      rw[hero] = (1 + a * rand(0.9, 1.6)) * biasIndex(hero, tiltToDown);
      cw = cw.map((_, i) => (1 + a * rand(-0.20, 0.45)) * biasIndex(i, tiltToRight));
    }

    if (mode === "twoCols") {
      const a1 = Math.floor(rnd() * 4);
      const a2 = (a1 + 1 + Math.floor(rnd() * 3)) % 4;
      cw = cw.map((_, i) => (1 - a * 0.20 + a * rand(-0.12, 0.22)) * biasIndex(i, tiltToRight));
      cw[a1] = (1 + a * rand(0.6, 1.25)) * biasIndex(a1, tiltToRight);
      cw[a2] = (1 + a * rand(0.6, 1.25)) * biasIndex(a2, tiltToRight);
      rw = rw.map((_, j) => (1 + a * rand(-0.20, 0.45)) * biasIndex(j, tiltToDown));
    }

    if (mode === "twoRows") {
      const a1 = Math.floor(rnd() * 4);
      const a2 = (a1 + 1 + Math.floor(rnd() * 3)) % 4;
      rw = rw.map((_, j) => (1 - a * 0.20 + a * rand(-0.12, 0.22)) * biasIndex(j, tiltToDown));
      rw[a1] = (1 + a * rand(0.6, 1.25)) * biasIndex(a1, tiltToDown);
      rw[a2] = (1 + a * rand(0.6, 1.25)) * biasIndex(a2, tiltToDown);
      cw = cw.map((_, i) => (1 + a * rand(-0.20, 0.45)) * biasIndex(i, tiltToRight));
    }

    if (mode === "frameCenter") {
      const mid = 1 + a * rand(1.0, 1.8);
      const edge = 1 - a * rand(0.2, 0.55);
      cw = [edge, mid, mid, edge].map((v, i) => v * biasIndex(i, tiltToRight));
      rw = [edge, mid, mid, edge].map((v, j) => v * biasIndex(j, tiltToDown));
    }

    if (mode === "frameCorner") {
      const fat = 1 + a * rand(0.8, 1.5);
      const slim = 1 - a * rand(0.15, 0.45);
      const corner = ["tl", "tr", "bl", "br"][Math.floor(rnd() * 4)];
      cw = corner === "tl" || corner === "bl" ? [fat, fat, slim, slim] : [slim, slim, fat, fat];
      rw = corner === "tl" || corner === "tr" ? [fat, fat, slim, slim] : [slim, slim, fat, fat];
      cw = cw.map((v, i) => v * biasIndex(i, tiltToRight));
      rw = rw.map((v, j) => v * biasIndex(j, tiltToDown));
    }

    if (mode === "ladder") {
      const k = 1 + a * rand(0.35, 1.0);
      cw[Math.floor(rnd() * 4)] *= k;
      rw[Math.floor(rnd() * 4)] *= k;
      cw = cw.map((v, i) => v * (1 + a * 0.12 * (i - 1.5) * tiltToRight));
      rw = rw.map((v, j) => v * (1 + a * 0.12 * (j - 1.5) * tiltToDown));
    }

    if (mode === "balance") {
      cw = cw.map((_, i) => (1 + a * rand(-0.28, 0.55)) * biasIndex(i, tiltToRight));
      rw = rw.map((_, j) => (1 + a * rand(-0.28, 0.55)) * biasIndex(j, tiltToDown));
    }

    return { cw: normalizeWeights(cw), rw: normalizeWeights(rw) };
  }

  function smoothLines(lines, dt, smooth, layoutState, W, H) {
    const strength = clamp01(smooth);
    const alpha = 1 - Math.exp(-dt * (2 + strength * 18));

    if (!layoutState.smoothXs || !layoutState.smoothYs) {
      layoutState.smoothXs = lines.xs.slice();
      layoutState.smoothYs = lines.ys.slice();
      return { xs: lines.xs, ys: lines.ys };
    }

    for (let i = 0; i < lines.xs.length; i++) layoutState.smoothXs[i] = lerp(layoutState.smoothXs[i], lines.xs[i], alpha);
    for (let j = 0; j < lines.ys.length; j++) layoutState.smoothYs[j] = lerp(layoutState.smoothYs[j], lines.ys[j], alpha);

    layoutState.smoothXs[0] = 0;
    layoutState.smoothXs[layoutState.smoothXs.length - 1] = W;
    layoutState.smoothYs[0] = 0;
    layoutState.smoothYs[layoutState.smoothYs.length - 1] = H;

    return { xs: layoutState.smoothXs.slice(), ys: layoutState.smoothYs.slice() };
  }

  function computeLayoutLinesGeneric(timeSec, p, W, H, layoutState) {
    const cols = state.cols;
    const rows = state.rows;
    const mode = p.layoutMode || "morph";
    const dir = p.layoutDir || "right";
    const amt = typeof p.layoutAmt === "number" ? p.layoutAmt : 0.35;
    const duration = getLoopSubdivisionDuration(p, p.layoutDuration || 3.4);
    const smooth = typeof p.layoutSmooth === "number" ? p.layoutSmooth : 0.72;

    if (layoutState.lastTime == null) layoutState.lastTime = timeSec;
    const dt = Math.max(0.001, Math.min(0.05, timeSec - layoutState.lastTime));
    layoutState.lastTime = timeSec;

    if (mode === "scrollX" || mode === "scrollY" || mode === "scrollXY") {
      const baseX = [0, W * 0.25, W * 0.5, W * 0.75, W];
      const baseY = [0, H * 0.25, H * 0.5, H * 0.75, H];

      const sx = (dir === "left") ? -1 : 1;
      const sy = (dir === "up") ? -1 : 1;

      const scrollDuration = getSpeedScaledDuration(duration, p.speed);
      const fx = getLoopPhase01(p, timeSec, scrollDuration) * sx;
      const fy = getLoopPhase01(p, timeSec, scrollDuration, 0.18) * sy;

      let xs = baseX.slice();
      let ys = baseY.slice();

      if (mode === "scrollX" || mode === "scrollXY") xs = xs.map(v => v + (fx * W) / cols);
      if (mode === "scrollY" || mode === "scrollXY") ys = ys.map(v => v + (fy * H) / rows);

      xs = [0, ...xs.slice(1, 4).map(v => ((v % W) + W) % W).sort((a, b) => a - b), W];
      ys = [0, ...ys.slice(1, 4).map(v => ((v % H) + H) % H).sort((a, b) => a - b), H];

      enforceMinSpacingSoft(xs, 10);
      enforceMinSpacingSoft(ys, 10);
      return smoothLines({ xs, ys }, dt, smooth, layoutState, W, H);
    }

    const step = getLoopSegmentState(p, timeSec, duration);
    const key = `${mode}|${dir}|${Math.round(amt * 100)}|${step.cycles}`;
    if (layoutState.lastKey !== key) {
      layoutState.lastKey = key;
      layoutState.smoothXs = null;
      layoutState.smoothYs = null;
    }

    const fromWeights = makeTargetWeights(mode, amt, dir, layoutState.seed + (step.index * 131));
    const toWeights = makeTargetWeights(mode, amt, dir, layoutState.seed + (((step.index + 1) % step.cycles) * 131));
    layoutState.fromCol = fromWeights.cw.slice();
    layoutState.fromRow = fromWeights.rw.slice();
    layoutState.toCol = toWeights.cw.slice();
    layoutState.toRow = toWeights.rw.slice();

    const t = smoothstep(step.localT);
    const cw = fromWeights.cw.map((v, i) => lerp(v, toWeights.cw[i], t));
    const rw = fromWeights.rw.map((v, i) => lerp(v, toWeights.rw[i], t));

    const xs = new Array(cols + 1);
    const ys = new Array(rows + 1);
    xs[0] = 0;
    ys[0] = 0;

    for (let i = 0; i < cols; i++) xs[i + 1] = xs[i] + cw[i] * W;
    for (let j = 0; j < rows; j++) ys[j + 1] = ys[j] + rw[j] * H;

    xs[0] = 0; xs[cols] = W;
    ys[0] = 0; ys[rows] = H;

    enforceMinSpacingSoft(xs, 10);
    enforceMinSpacingSoft(ys, 10);

    return smoothLines({ xs, ys }, dt, smooth, layoutState, W, H);
  }

  function generateBlocks(complexity = 9) {
    const maxSplits = Math.max(1, Math.min(14, parseInt(complexity, 10) || 9));
    let rects = [{ x: 0, y: 0, w: state.cols, h: state.rows }];

    function canSplit(r) {
      return (r.w > 1 || r.h > 1);
    }

    for (let i = 0; i < maxSplits; i++) {
      const candidates = rects
        .map((r, idx) => ({ r, idx, area: r.w * r.h }))
        .filter(o => canSplit(o.r));

      if (!candidates.length) break;

      candidates.sort((a, b) => b.area - a.area);
      const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 4))];
      const r = pick.r;

      const bias = r.w / (r.h || 1);
      let vertical = Math.random() < (bias >= 1 ? 0.58 : 0.42);
      if (r.w === 1) vertical = false;
      if (r.h === 1) vertical = true;

      if (vertical) {
        const cut = 1 + Math.floor(Math.random() * (r.w - 1));
        const a = { x: r.x, y: r.y, w: cut, h: r.h };
        const b = { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h };
        rects.splice(pick.idx, 1, a, b);
      } else {
        const cut = 1 + Math.floor(Math.random() * (r.h - 1));
        const a = { x: r.x, y: r.y, w: r.w, h: cut };
        const b = { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut };
        rects.splice(pick.idx, 1, a, b);
      }
    }

    state.blocks = rects.map((r, i) => ({
      id: `b${i}`,
      gx: r.x,
      gy: r.y,
      gw: r.w,
      gh: r.h,
      phase: Math.random() * Math.PI * 2,
      dir: Math.random() * Math.PI * 2,
      overrideMode: "auto",
      overrideColor: null,
      locked: false,
      lockDepth: 0,
      mediaScale: 1,
      mediaX: 0,
      mediaY: 0,
    }));

    state.sceneSeed = Math.floor(Math.random() * 1e9);
    state.tintSeed = Math.floor(Math.random() * 1e9);
    if (state.selectedBlockId && !state.blocks.find(b => b.id === state.selectedBlockId)) {
      state.selectedBlockId = null;
    }
  }

  function blockToPx(b, lines) {
    const x = lines.xs[b.gx];
    const y = lines.ys[b.gy];
    const w = lines.xs[b.gx + b.gw] - lines.xs[b.gx];
    const h = lines.ys[b.gy + b.gh] - lines.ys[b.gy];
    return { x, y, w, h };
  }

  function getBlockById(id) {
    return state.blocks.find(b => b.id === id) || null;
  }

  function getParamsFromUI() {
    return {
      gridOn: ui.gridToggle.checked,
      gridOpacity: parseFloat(ui.gridOpacity.value),
      motionMode: ui.motionMode.value,

      tintMotion: ui.tintMotion.value,
      mediaTintMotion: ui.mediaTintMotion.value,
      overlayTintMotion: ui.overlayTintMotion.value,

      tintPalette: ui.tintPalette.value,
      mediaTintPalette: ui.mediaTintPalette.value,
      overlayTintPalette: ui.overlayTintPalette.value,

      tintColorSlot: parseInt(ui.tintColorSlot.value || "1", 10),
      mediaTintColorSlot: parseInt(ui.mediaTintColorSlot.value || "1", 10),
      overlayTintColorSlot: parseInt(ui.overlayTintColorSlot.value || "1", 10),

      tintDuration: parseFloat(ui.tintDuration.value),
      gradTintOpacity: parseFloat(ui.gradTintOpacity.value),
      mediaTintOpacity: parseFloat(ui.mediaTintOpacity.value),
      overlayTintOpacity: parseFloat(ui.overlayTintOpacity.value),

      palette: ui.paletteA.value,
      speed: parseFloat(ui.speed.value),
      motionLoopDuration: parseFloat(ui.motionLoopDuration.value || "12"),
      contrast: parseFloat(ui.contrast.value),
      light: parseFloat(ui.light.value),
      fitMode: ui.fitMode.value,
      layoutMode: ui.layoutMode.value,
      layoutDir: ui.layoutDir.value,
      layoutAmt: parseFloat(ui.layoutAmt.value),
      layoutSmooth: parseFloat(ui.layoutSmooth.value),
      sceneMode: ui.sceneMode.value,
      sceneDuration: parseFloat(ui.sceneDuration.value),
      tilt3d: parseFloat(ui.tilt3d.value),
      tilt3dMode: ui.tilt3dMode.value,
      depthDuration: parseFloat(ui.depthDuration.value || "6"),
      depthSyncExport: !!ui.depthSyncExport.checked,
    };
  }

  function drawGuideGrid(targetCtx, W, H, p) {
    if (!p.gridOn || state.exporting) return;

    const op = p.gridOpacity;
    if (op <= 0.001) return;

    targetCtx.save();
    targetCtx.lineWidth = 1;
    targetCtx.strokeStyle = `rgba(255,255,255,${0.45 * op})`;

    for (let i = 1; i < state.cols; i++) {
      const x = (W / state.cols) * i;
      targetCtx.beginPath();
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, H);
      targetCtx.stroke();
    }

    for (let j = 1; j < state.rows; j++) {
      const y = (H / state.rows) * j;
      targetCtx.beginPath();
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(W, y);
      targetCtx.stroke();
    }

    targetCtx.restore();
  }

  function drawBackdropPlane(targetCtx, W, H, p, timeSec) {
    targetCtx.save();
    targetCtx.fillStyle = "#0b0d12";
    targetCtx.fillRect(0, 0, W, H);

    const stops = sampleStopsForGradient(pickStops(p.palette));
    const g = targetCtx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, applyContrastToRgbString(lerpColor(stops[0], stops[1], 0.35), Math.max(0.6, p.contrast * 0.9)));
    g.addColorStop(1, applyContrastToRgbString(lerpColor(stops[1], stops[2], 0.55), Math.max(0.6, p.contrast * 0.85)));

    targetCtx.globalAlpha = 0.14;
    targetCtx.fillStyle = g;
    targetCtx.fillRect(0, 0, W, H);

    const tt = getLoopAngle(p, timeSec, getMotionLoopDurationSec(p));
    const rg = targetCtx.createRadialGradient(
      W * (0.5 + 0.08 * Math.sin(tt)),
      H * (0.42 + 0.08 * Math.cos(tt)),
      0,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.85
    );
    rg.addColorStop(0, "rgba(255,255,255,0.10)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    targetCtx.fillStyle = rg;
    targetCtx.fillRect(0, 0, W, H);

    targetCtx.restore();
  }

  function drawSelectionOutline(targetCtx, timeSec, lines) {
    const id = state.selectedBlockId;
    if (!id) return;
    const b = getBlockById(id);
    if (!b) return;

    const { x, y, w, h } = blockToPx(b, lines);
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * 2.2);

    targetCtx.save();
    targetCtx.lineWidth = 2;
    targetCtx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * pulse})`;
    targetCtx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    targetCtx.restore();
  }

  function drawBlockSolidRect(targetCtx, color, rect) {
    targetCtx.fillStyle = color;
    targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  function drawTintAnimatedLayer(targetCtx, rect, color, opacity, motion, duration, timeSec, seed = 0, loopP = null) {
    if (opacity <= 0.001 || motion === "none") return;

    const phase = loopP
      ? getLoopPhase01(loopP, timeSec, duration, seed * 0.013)
      : wrap01((timeSec / Math.max(0.0001, duration)) + seed * 0.013);

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(rect.x, rect.y, rect.w, rect.h);
    targetCtx.clip();

    if (motion === "pingpong") {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "fullPulse") {
      const a = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "fullSine") {
      const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "fullFade") {
      const a = phase < 0.5
        ? lerp(0.08, 1.0, phase / 0.5)
        : lerp(1.0, 0.08, (phase - 0.5) / 0.5);
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "fullBlinkSoft") {
      const a = (0.5 + 0.5 * Math.sin(phase * Math.PI * 2)) > 0.45 ? 1 : 0.22;
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "fullBlinkHard") {
      const a = (0.5 + 0.5 * Math.sin(phase * Math.PI * 2)) > 0.5 ? 1 : 0;
      targetCtx.globalAlpha = opacity * a;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "flash") {
      const on = (Math.floor(t * 4 + seed) % 2) === 0 ? 1 : 0.18;
      targetCtx.globalAlpha = opacity * on;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "shuffle") {
      const rnd = mulberry32((Math.floor(t * 3) + seed * 131) >>> 0);
      const a = 0.35 + rnd() * 0.65;
      const dir = rnd() > 0.5 ? "x" : "y";
      targetCtx.globalAlpha = opacity * a;

      if (dir === "x") {
        const bandW = rect.w * 0.38;
        const x = rect.x + (rect.w + bandW) * phase - bandW;
        const g = targetCtx.createLinearGradient(x, rect.y, x + bandW, rect.y);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        targetCtx.fillStyle = g;
        targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      } else {
        const bandH = rect.h * 0.38;
        const y = rect.y + (rect.h + bandH) * phase - bandH;
        const g = targetCtx.createLinearGradient(rect.x, y, rect.x, y + bandH);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        targetCtx.fillStyle = g;
        targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }

      targetCtx.restore();
      return;
    }

    if (motion === "cycleX") {
      const bandW = rect.w * 0.45;
      const x = rect.x + (rect.w + bandW) * phase - bandW;
      const g = targetCtx.createLinearGradient(x, rect.y, x + bandW, rect.y);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      targetCtx.globalAlpha = opacity;
      targetCtx.fillStyle = g;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "cycleY") {
      const bandH = rect.h * 0.45;
      const y = rect.y + (rect.h + bandH) * phase - bandH;
      const g = targetCtx.createLinearGradient(rect.x, y, rect.x, y + bandH);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      targetCtx.globalAlpha = opacity;
      targetCtx.fillStyle = g;
      targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      targetCtx.restore();
      return;
    }

    if (motion === "bandsX") {
      const step = rect.w / 5;
      const offset = phase * step * 2;
      targetCtx.globalAlpha = opacity;
      for (let i = -2; i < 8; i++) {
        const x = rect.x + i * step - offset;
        const g = targetCtx.createLinearGradient(x, rect.y, x + step * 0.6, rect.y);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        targetCtx.fillStyle = g;
        targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      targetCtx.restore();
      return;
    }

    if (motion === "bandsY") {
      const step = rect.h / 5;
      const offset = phase * step * 2;
      targetCtx.globalAlpha = opacity;
      for (let i = -2; i < 8; i++) {
        const y = rect.y + i * step - offset;
        const g = targetCtx.createLinearGradient(rect.x, y, rect.x, y + step * 0.6);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        targetCtx.fillStyle = g;
        targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      targetCtx.restore();
      return;
    }

    targetCtx.globalAlpha = opacity;
    targetCtx.fillStyle = color;
    targetCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    targetCtx.restore();
  }

  function drawBlockGradientRect(targetCtx, b, timeSec, p, rect) {
    const { x, y, w, h } = rect;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const speed = Math.max(0, p.speed || 0);
    const blockPhase01 = bPhase01(b);

    let driftX = 0;
    let driftY = 0;
    let sweep = 0;

    if (speed > 0.001) {
      if (p.motionMode === "drift") {
        driftX = 0.18 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(7.2, speed), blockPhase01));
        driftY = 0.18 * Math.cos(getLoopAngle(p, timeSec, getSpeedScaledDuration(8.8, speed), blockPhase01 * 0.7));
      } else if (p.motionMode === "pulse") {
        driftX = 0.08 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(4.4, speed), blockPhase01));
        driftY = 0.08 * Math.cos(getLoopAngle(p, timeSec, getSpeedScaledDuration(5.2, speed), blockPhase01));
        sweep = 0.28 * (0.5 + 0.5 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(5.8, speed), blockPhase01)));
      } else if (p.motionMode === "sweep") {
        sweep = 0.65 * (0.5 + 0.5 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(6.4, speed), blockPhase01)));
        driftX = 0.10 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(7.6, speed), blockPhase01));
      } else if (p.motionMode === "orbit") {
        const r = 0.22;
        const orbitAngle = getLoopAngle(p, timeSec, getSpeedScaledDuration(7.4, speed), blockPhase01);
        driftX = r * Math.sin(orbitAngle);
        driftY = r * Math.cos(orbitAngle);
        sweep = 0.25 * (0.5 + 0.5 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(5.6, speed), blockPhase01)));
      }
    }

    const dir2 = b.dir + (
      speed > 0.001
        ? 0.15 * Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(9.8, speed), blockPhase01 * 0.5))
        : 0
    );
    const dx = Math.cos(dir2);
    const dy = Math.sin(dir2);

    const p1x = cx - dx * w * (0.65 + sweep) + driftX * w;
    const p1y = cy - dy * h * (0.65 + sweep) + driftY * h;
    const p2x = cx + dx * w * (0.65 + sweep) + driftX * w;
    const p2y = cy + dy * h * (0.65 + sweep) + driftY * h;

    const stops = sampleStopsForGradient(pickStops(p.palette));
    const c0 = applyContrastToRgbString(lerpColor(stops[0], stops[0], 0), p.contrast);
    const c1 = applyContrastToRgbString(lerpColor(stops[1], stops[1], 0), p.contrast);
    const c2 = applyContrastToRgbString(lerpColor(stops[2], stops[2], 0), p.contrast);

    const g = targetCtx.createLinearGradient(p1x, p1y, p2x, p2y);
    g.addColorStop(0.0, c0);
    g.addColorStop(0.55, c1);
    g.addColorStop(0.91, c2);

    targetCtx.fillStyle = g;
    targetCtx.fillRect(x, y, w, h);

    const tintColor = getTintBaseColor(p.tintPalette, p.tintColorSlot);
    drawTintAnimatedLayer(
      targetCtx,
      rect,
      tintColor,
      p.gradTintOpacity,
      p.tintMotion,
      p.tintDuration,
      timeSec,
      b.gx * 19 + b.gy * 31,
      p
    );

    const lx = cx + (
      speed > 0.001
        ? Math.sin(getLoopAngle(p, timeSec, getSpeedScaledDuration(10.8, speed), blockPhase01)) * w * 0.22
        : 0
    );
    const ly = cy + (
      speed > 0.001
        ? Math.cos(getLoopAngle(p, timeSec, getSpeedScaledDuration(12.4, speed), blockPhase01 * 0.35)) * h * 0.22
        : 0
    );
    const rg = targetCtx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.95);
    rg.addColorStop(0.0, `rgba(255,255,255,${0.22 * p.light})`);
    rg.addColorStop(0.55, `rgba(255,255,255,${0.08 * p.light})`);
    rg.addColorStop(1.0, `rgba(255,255,255,0)`);

    targetCtx.save();
    targetCtx.globalCompositeOperation = "screen";
    targetCtx.fillStyle = rg;
    targetCtx.fillRect(x, y, w, h);
    targetCtx.restore();
  }

  function drawMediaRect(targetCtx, media, p, rect, block, timeSec) {
    const { x, y, w, h } = rect;

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(x, y, w, h);
    targetCtx.clip();

    const el = media.el;
    const iw = el.videoWidth || el.naturalWidth || 1;
    const ih = el.videoHeight || el.naturalHeight || 1;

    const srcAR = iw / ih;
    const cellAR = w / h;
    const scale = Math.max(0.5, block.mediaScale || 1);
    let drawW, drawH;

    if (p.fitMode === "cover") {
      if (srcAR > cellAR) {
        drawH = h * scale;
        drawW = drawH * srcAR;
      } else {
        drawW = w * scale;
        drawH = drawW / srcAR;
      }
    } else {
      if (srcAR > cellAR) {
        drawW = w * scale;
        drawH = drawW / srcAR;
      } else {
        drawH = h * scale;
        drawW = drawH * srcAR;
      }
    }

    const offsetX = (block.mediaX || 0) * w * 0.5;
    const offsetY = (block.mediaY || 0) * h * 0.5;

    const drawX = x + (w - drawW) / 2 + offsetX;
    const drawY = y + (h - drawH) / 2 + offsetY;

    targetCtx.drawImage(el, drawX, drawY, drawW, drawH);

    if (p.mediaTintMotion !== "none" && p.mediaTintOpacity > 0.001) {
      const tintColor = getTintBaseColor(p.mediaTintPalette, p.mediaTintColorSlot);
      targetCtx.save();
      targetCtx.globalCompositeOperation = "source-atop";
      drawTintAnimatedLayer(
        targetCtx,
        rect,
        tintColor,
        p.mediaTintOpacity,
        p.mediaTintMotion,
        p.tintDuration,
        timeSec,
        5000 + block.gx * 17 + block.gy * 13,
        p
      );
      targetCtx.restore();
    }

    targetCtx.restore();
  }

  function drawQuadrantOverlayTint(targetCtx, block, rect, p, timeSec) {
    if (p.overlayTintMotion === "none" || p.overlayTintOpacity <= 0.001) return;
    const tintColor = getTintBaseColor(p.overlayTintPalette, p.overlayTintColorSlot);
    drawTintAnimatedLayer(
      targetCtx,
      rect,
      tintColor,
      p.overlayTintOpacity,
      p.overlayTintMotion,
      p.tintDuration,
      timeSec,
      9000 + block.gx * 23 + block.gy * 29,
      p
    );
  }

  function drawContentIntoRect(targetCtx, blockId, rect, timeSec, p) {
    const b = getBlockById(blockId);
    if (!b) return;

    if (b.overrideMode === "solid" && b.overrideColor) {
      drawBlockSolidRect(targetCtx, b.overrideColor, rect);
    } else {
      drawBlockGradientRect(targetCtx, b, timeSec, p, rect);
    }

    const media = state.media.get(blockId);
    if (media) {
      drawMediaRect(targetCtx, media, p, rect, b, timeSec);
    }

    drawQuadrantOverlayTint(targetCtx, b, rect, p, timeSec);
  }

  function drawContentClipped(targetCtx, clipRect, drawFn) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    targetCtx.clip();
    drawFn();
    targetCtx.restore();
  }

  function buildUnlockedPermutation(blocks, sceneMode, sceneIndex) {
    const unlocked = blocks.filter(b => !b.locked);
    const unlockedIds = unlocked.map(b => b.id);

    if (sceneMode === "none") return unlockedIds.slice();

    const rnd = mulberry32((state.sceneSeed ^ ((sceneIndex + 1) * 99991) ^ 0xABCDEF) >>> 0);
    const perm = unlockedIds.slice();

    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    return perm;
  }

  function getPushVector(sceneMode, rect) {
    if (sceneMode === "pushLeft" || sceneMode === "carouselX" || sceneMode === "revealX" || sceneMode === "coverNextX" || sceneMode === "wipeX") return { dx: -rect.w, dy: 0 };
    if (sceneMode === "pushUp" || sceneMode === "carouselY" || sceneMode === "revealY" || sceneMode === "coverNextY" || sceneMode === "wipeY") return { dx: 0, dy: -rect.h };
    if (sceneMode === "pushDown") return { dx: 0, dy: rect.h };
    return { dx: rect.w, dy: 0 };
  }

  function renderSceneCard(targetCtx, mode, quadRect, outId, inId, timeSec, p, localT) {
    const push = getPushVector(mode, quadRect);

    if (mode === "splitX") {
      drawContentClipped(targetCtx, quadRect, () => {
        drawContentIntoRect(targetCtx, outId, {
          x: quadRect.x - quadRect.w * 0.5 * localT,
          y: quadRect.y,
          w: quadRect.w,
          h: quadRect.h,
        }, timeSec, p);

        drawContentIntoRect(targetCtx, inId, {
          x: quadRect.x + quadRect.w * (1 - localT),
          y: quadRect.y,
          w: quadRect.w,
          h: quadRect.h,
        }, timeSec, p);
      });
      return;
    }

    if (mode === "splitY") {
      drawContentClipped(targetCtx, quadRect, () => {
        drawContentIntoRect(targetCtx, outId, {
          x: quadRect.x,
          y: quadRect.y - quadRect.h * 0.5 * localT,
          w: quadRect.w,
          h: quadRect.h,
        }, timeSec, p);

        drawContentIntoRect(targetCtx, inId, {
          x: quadRect.x,
          y: quadRect.y + quadRect.h * (1 - localT),
          w: quadRect.w,
          h: quadRect.h,
        }, timeSec, p);
      });
      return;
    }

    if (mode === "revealX" || mode === "revealY" || mode === "wipeX" || mode === "wipeY") {
      drawContentClipped(targetCtx, quadRect, () => {
        drawContentIntoRect(targetCtx, outId, quadRect, timeSec, p);

        targetCtx.save();
        targetCtx.beginPath();

        if (mode === "revealX" || mode === "wipeX") {
          const w = quadRect.w * localT;
          targetCtx.rect(quadRect.x, quadRect.y, w, quadRect.h);
        } else {
          const h = quadRect.h * localT;
          targetCtx.rect(quadRect.x, quadRect.y, quadRect.w, h);
        }

        targetCtx.clip();
        drawContentIntoRect(targetCtx, inId, quadRect, timeSec, p);
        targetCtx.restore();
      });
      return;
    }

    if (mode === "coverNextX" || mode === "coverNextY") {
      drawContentClipped(targetCtx, quadRect, () => {
        drawContentIntoRect(targetCtx, outId, quadRect, timeSec, p);
        drawContentIntoRect(targetCtx, inId, {
          x: quadRect.x + push.dx * (1 - localT),
          y: quadRect.y + push.dy * (1 - localT),
          w: quadRect.w,
          h: quadRect.h,
        }, timeSec, p);
      });
      return;
    }

    drawContentClipped(targetCtx, quadRect, () => {
      drawContentIntoRect(targetCtx, outId, {
        x: quadRect.x + push.dx * localT,
        y: quadRect.y + push.dy * localT,
        w: quadRect.w,
        h: quadRect.h,
      }, timeSec, p);

      drawContentIntoRect(targetCtx, inId, {
        x: quadRect.x + push.dx * (localT - 1),
        y: quadRect.y + push.dy * (localT - 1),
        w: quadRect.w,
        h: quadRect.h,
      }, timeSec, p);
    });
  }

  function makeOffscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function renderBlockOffscreen(blockId, rect, timeSec, p) {
    const off = makeOffscreen(rect.w, rect.h);
    const octx = off.getContext("2d", { alpha: false });
    octx.fillStyle = "#0b0d12";
    octx.fillRect(0, 0, off.width, off.height);
    drawContentIntoRect(octx, blockId, { x: 0, y: 0, w: off.width, h: off.height }, timeSec, p);
    return off;
  }

  function getFreeDepthPhase01(p, rawTimeSec) {
    const exportDur = Math.max(0.8, parseFloat(ui.recSeconds.value || "15"));
    if (p.depthSyncExport) {
      return wrap01(rawTimeSec / exportDur);
    }

    return getLoopPhase01(p, rawTimeSec, p.depthDuration || 6.0);
  }

  function getStableDepthPhase01(p, rawTimeSec) {
    const exportDur = Math.max(0.8, parseFloat(ui.recSeconds.value || "15"));
    if (state.recording && p.depthSyncExport) {
      const fps = parseInt(ui.recFps.value || "60", 10);
      const totalFrames = Math.max(2, Math.round(exportDur * fps));
      const elapsed = Math.max(0, rawTimeSec - state.recordingStartSec);
      const frameIndex = Math.min(totalFrames - 1, Math.floor(elapsed * fps));
      const offset = wrap01(state.recordingPhaseOffset01 || 0);
      return wrap01(offset + (frameIndex / (totalFrames - 1)));
    }

    return getFreeDepthPhase01(p, rawTimeSec);
  }

  function loopCos01(phase01, offset01 = 0) {
    const a = (phase01 + offset01) * Math.PI * 2;
    return 0.5 - 0.5 * Math.cos(a);
  }

  function bPhase01(block) {
    const raw = ((block.phase || 0) % (Math.PI * 2)) / (Math.PI * 2);
    return raw < 0 ? raw + 1 : raw;
  }

  function getDepthMotion(block, rect, p, rawTimeSec, W, H) {
    const mode = p.tilt3dMode || "none";
    const amount = clamp01(p.tilt3d || 0);

    if (mode === "none" || amount <= 0.001) {
      if (!block.locked) block.lockDepth = 0;
      return { z: 0 };
    }

    if (block.locked) {
      return { z: block.lockDepth ?? 0 };
    }

    const phase01 = getStableDepthPhase01(p, rawTimeSec);
    const softPhase = smootherstep(phase01);

    const cx = rect.x + rect.w * 0.5;
    const cy = rect.y + rect.h * 0.5;
    const nx = (cx / Math.max(1, W)) * 2 - 1;
    const ny = (cy / Math.max(1, H)) * 2 - 1;

    let z = 0;

    if (mode === "depthRows") {
      z = loopCos01(softPhase, block.gy * 0.095) * 180 * amount;
    }

    if (mode === "depthColumns") {
      z = loopCos01(softPhase, block.gx * 0.11) * 180 * amount;
    }

    if (mode === "depthWave") {
      z = loopCos01(softPhase, bPhase01(block)) * 220 * amount;
    }

    if (mode === "depthPulse") {
      z = loopCos01(softPhase, bPhase01(block) * 0.8) * 190 * amount;
    }

    if (mode === "depthStairs") {
      const step = (block.gx + block.gy) / Math.max(1, state.cols + state.rows - 2);
      z = loopCos01(softPhase, step * 0.5) * 180 * amount;
    }

    if (mode === "depthCenter") {
      const d = Math.sqrt(nx * nx + ny * ny);
      const base = (1 - Math.min(1, d)) * 220 * amount;
      z = base * (0.65 + 0.35 * loopCos01(softPhase, bPhase01(block)));
    }

    if (mode === "depthBreath") {
      z = (35 + loopCos01(softPhase, bPhase01(block)) * 170) * amount;
    }

    block.lockDepth = z;
    return { z };
  }

  function drawExtrudedBlock(targetCtx, off, rect, depth) {
    const extrude = depth.z;
    const side = extrude * 0.45;
    const down = extrude * 0.45;

    const x = rect.x;
    const y = rect.y;
    const w = rect.w;
    const h = rect.h;

    targetCtx.save();

    targetCtx.beginPath();
    targetCtx.moveTo(x + w, y);
    targetCtx.lineTo(x + w + side, y + down);
    targetCtx.lineTo(x + w + side, y + h + down);
    targetCtx.lineTo(x + w, y + h);
    targetCtx.closePath();

    const gradSide = targetCtx.createLinearGradient(x + w, y, x + w + side, y + down);
    gradSide.addColorStop(0, "rgba(0,0,0,0.35)");
    gradSide.addColorStop(1, "rgba(0,0,0,0.10)");
    targetCtx.fillStyle = gradSide;
    targetCtx.fill();

    targetCtx.beginPath();
    targetCtx.moveTo(x, y + h);
    targetCtx.lineTo(x + w, y + h);
    targetCtx.lineTo(x + w + side, y + h + down);
    targetCtx.lineTo(x + side, y + h + down);
    targetCtx.closePath();

    const gradBottom = targetCtx.createLinearGradient(x, y + h, x, y + h + down);
    gradBottom.addColorStop(0, "rgba(0,0,0,0.28)");
    gradBottom.addColorStop(1, "rgba(0,0,0,0.06)");
    targetCtx.fillStyle = gradBottom;
    targetCtx.fill();

    targetCtx.shadowColor = "rgba(0,0,0,0.25)";
    targetCtx.shadowBlur = extrude * 0.5;
    targetCtx.shadowOffsetY = extrude * 0.25;
    targetCtx.globalAlpha = 0.98;

    targetCtx.drawImage(off, x, y, w, h);
    targetCtx.restore();
  }

  function drawBlockPossibly3D(targetCtx, blockId, rect, rawTimeSec, p, W, H) {
    const block = getBlockById(blockId);
    if (!block) return;

    if ((p.tilt3dMode || "none") === "none" || p.tilt3d <= 0.001) {
      drawContentIntoRect(targetCtx, blockId, rect, rawTimeSec, p);
      return;
    }

    const depth = getDepthMotion(block, rect, p, rawTimeSec, W, H);
    const off = renderBlockOffscreen(blockId, rect, rawTimeSec, p);
    drawExtrudedBlock(targetCtx, off, rect, depth);
  }

  function renderLockedSceneBlocks(targetCtx, blocks, lines, rawTimeSec, p, W, H) {
    for (const block of blocks) {
      if (!block.locked) continue;
      const rect = blockToPx(block, lines);
      drawBlockPossibly3D(targetCtx, block.id, rect, rawTimeSec, p, W, H);
    }
  }

  function renderUnlockedSceneBlocks(targetCtx, blocks, lines, rawTimeSec, p, W, H) {
    const sceneMode = p.sceneMode || "none";
    const unlockedBlocks = blocks.filter(b => !b.locked);
    if (!unlockedBlocks.length) return;

    const sceneStep = getLoopSegmentState(p, rawTimeSec, p.sceneDuration || 3.4);
    const sceneIndex = sceneStep.index;
    const prevSceneIndex = (sceneIndex - 1 + sceneStep.cycles) % sceneStep.cycles;
    const localT = smoothstep(sceneStep.localT);

    const fromIds = buildUnlockedPermutation(blocks, sceneMode, prevSceneIndex);
    const toIds = buildUnlockedPermutation(blocks, sceneMode, sceneIndex);

    for (let i = 0; i < unlockedBlocks.length; i++) {
      const dstBlock = unlockedBlocks[i];
      const quadRect = blockToPx(dstBlock, lines);

      const outId = fromIds[i % fromIds.length];
      const inId = toIds[i % toIds.length];

      renderSceneCard(targetCtx, sceneMode, quadRect, outId, inId, rawTimeSec, p, localT);
    }
  }

  function renderFrame(targetCtx, W, H, rawTimeSec, p, layoutState, drawSelection) {
    const lines = computeLayoutLinesGeneric(rawTimeSec, p, W, H, layoutState);

    targetCtx.clearRect(0, 0, W, H);
    drawBackdropPlane(targetCtx, W, H, p, rawTimeSec);

    const sceneMode = p.sceneMode || "none";

    if (sceneMode === "none") {
      const ordered = state.blocks
        .map(b => {
          const r = blockToPx(b, lines);
          const depth = getDepthMotion(b, r, p, rawTimeSec, W, H);
          return { b, r, z: depth.z };
        })
        .sort((a, b) => a.z - b.z);

      for (const item of ordered) {
        drawBlockPossibly3D(targetCtx, item.b.id, item.r, rawTimeSec, p, W, H);
      }
    } else {
      renderUnlockedSceneBlocks(targetCtx, state.blocks, lines, rawTimeSec, p, W, H);
      renderLockedSceneBlocks(targetCtx, state.blocks, lines, rawTimeSec, p, W, H);
    }

    drawGuideGrid(targetCtx, W, H, p);
    if (drawSelection) drawSelectionOutline(targetCtx, rawTimeSec, lines);

    return lines;
  }

  function updateSelectionUI() {
    const id = state.selectedBlockId;
    if (!id) {
      ui.selId.textContent = "nenhuma";
      ui.selType.textContent = "-";
      ui.selName.textContent = "-";
      refreshTextControlState();
      return;
    }

    ui.selId.textContent = id;
    const b = getBlockById(id);
    const m = state.media.get(id);

    if (m) {
      ui.selType.textContent = b && b.locked ? `${m.type} travado` : m.type;
      ui.selName.textContent = m.name || "-";
    } else if (b && b.overrideMode === "solid") {
      ui.selType.textContent = b.locked ? "cor sólida travada" : "cor sólida";
      ui.selName.textContent = b.overrideColor || "-";
    } else {
      ui.selType.textContent = b && b.locked ? "gradiente travado" : "gradiente";
      ui.selName.textContent = ui.paletteA.value || "-";
    }

    if (b) {
      ui.mediaScale.value = String(b.mediaScale ?? 1);
      ui.mediaOffsetX.value = String(b.mediaX ?? 0);
      ui.mediaOffsetY.value = String(b.mediaY ?? 0);
    }

    refreshTextControlState();
  }

  function populatePaletteEditor() {
    ui.cellPalette.innerHTML = "";
    const names = Object.keys(PALETTES);

    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      ui.cellPalette.appendChild(opt);
    }

    ui.cellPalette.value = "azul";
    populateColorList();
  }

  function populateColorList() {
    const palName = ui.cellPalette.value;
    const colors = PALETTES[palName] || [];
    ui.cellColor.innerHTML = "";

    colors.forEach((hex, idx) => {
      const opt = document.createElement("option");
      opt.value = hex;
      opt.textContent = `${palName} ${idx + 1} ${hex}`;
      ui.cellColor.appendChild(opt);
    });

    if (colors.length) ui.cellColor.value = colors[0];
  }

  function findPaletteNameByColor(hex) {
    const h = String(hex || "").toLowerCase();
    for (const [name, arr] of Object.entries(PALETTES)) {
      if (arr.map(x => x.toLowerCase()).includes(h)) return name;
    }
    return null;
  }

  function syncEditorUIToSelection() {
    const id = state.selectedBlockId;
    if (!id) return;

    const b = getBlockById(id);
    if (!b) return;

    if (b.overrideMode === "solid" && b.overrideColor) {
      const found = findPaletteNameByColor(b.overrideColor);
      if (found) ui.cellPalette.value = found;
      populateColorList();
      ui.cellColor.value = b.overrideColor;
    } else {
      ui.cellPalette.value = "azul";
      populateColorList();
    }

    ui.mediaScale.value = String(b.mediaScale ?? 1);
    ui.mediaOffsetX.value = String(b.mediaX ?? 0);
    ui.mediaOffsetY.value = String(b.mediaY ?? 0);
  }

  function pauseAllVideos() {
    for (const [, m] of state.media.entries()) {
      if (m && m.type === "video" && m.el) {
        try { m.el.pause(); } catch {}
      }
    }
  }

  function playAllVideos() {
    for (const [, m] of state.media.entries()) {
      if (m && m.type === "video" && m.el) {
        try { m.el.play().catch(() => {}); } catch {}
      }
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    if (state.paused) {
      state.pauseTimeSec = state.lastTimeSec;
      pauseAllVideos();
      ui.pauseBtn.textContent = "Retomar";
    } else {
      playAllVideos();
      ui.pauseBtn.textContent = "Pausar";
    }
  }

  function setMediaForBlock(blockId, file) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) return;

    const b = getBlockById(blockId);
    if (b) {
      b.overrideMode = "auto";
      b.overrideColor = null;
      b.mediaScale = 1;
      b.mediaX = 0;
      b.mediaY = 0;
    }

    if (isVideo) {
      const v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.addEventListener("canplay", () => {
        if (!state.paused) v.play().catch(() => {});
      });
      if (state.paused) {
        try { v.pause(); } catch {}
      }
      state.media.set(blockId, { type: "video", el: v, name: file.name });
    } else {
      const img = new Image();
      img.onload = () => {
        state.media.set(blockId, { type: "image", el: img, name: file.name });
      };
      img.src = url;
    }

    updateSelectionUI();
    syncEditorUIToSelection();
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }

  function getOverlayById(id) {
    return state.overlays.find(o => o.id === id) || null;
  }

  function deselectOverlay() {
    state.selectedOverlayId = null;
    for (const o of state.overlays) {
      if (o.el) o.el.classList.remove("selected");
      if (o.handles) o.handles.style.display = "none";
    }
    syncTextUiFromSelection();
    syncAssetUiFromSelection();
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  function selectOverlay(id) {
    state.selectedOverlayId = id;
    for (const o of state.overlays) {
      const selected = o.id === id;
      if (o.el) o.el.classList.toggle("selected", selected);
      if (o.handles) {
        const hideHandles = selected && o.type === "text" && isGridTextMotionMode(o.textMotion) && o.anchorBlockId;
        o.handles.style.display = selected && !hideHandles ? "block" : "none";
      }
    }
    syncTextUiFromSelection();
    syncAssetUiFromSelection();
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  function clearAllOverlays() {
    for (const o of state.overlays) {
      try { o.el?.remove(); } catch {}
      try { o.handles?.remove(); } catch {}
    }
    state.overlays = [];
    state.selectedOverlayId = null;
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  let placingId = null;

  function cancelPlacing() {
    if (!placingId) return;
    const ov = getOverlayById(placingId);
    placingId = null;
    if (ov) {
      ov.isPlacing = false;
      ov.el?.classList.remove("placing");
    }
  }

  function clampStagePx(x, y) {
    return {
      x: Math.max(0, Math.min(state.screenW, x)),
      y: Math.max(0, Math.min(state.screenH, y)),
    };
  }

  function getStageWidthReference() {
    return Math.max(
      320,
      state.screenW || Math.round(stage?.getBoundingClientRect().width || 0) || 900
    );
  }

  function stageNormToPx(nx, ny, W, H) {
    return { x: nx * W, y: ny * H };
  }

  function pxToStageNorm(x, y, W, H) {
    return { nx: x / Math.max(1, W), ny: y / Math.max(1, H) };
  }

  function getCurrentOverlayLines(W = state.screenW, H = state.screenH) {
    if (window.__currentLinesForLock) return window.__currentLinesForLock;
    return {
      xs: [0, W * 0.25, W * 0.5, W * 0.75, W],
      ys: [0, H * 0.25, H * 0.5, H * 0.75, H],
    };
  }

  function isGridTextMotionMode(mode) {
    return GRID_TEXT_MOTION_MODES.has(mode);
  }

  function getTextRoleRatio(role) {
    return TEXT_ROLE_RATIOS[role] ?? 1;
  }

  function getTextRenderScale(W) {
    const { width } = getExportDimensions();
    return Math.max(0.1, W / Math.max(1, width));
  }

  function snapTextToken(value) {
    let closest = TEXT_TOKENS[0];
    let best = Math.abs(value - closest);
    for (const token of TEXT_TOKENS) {
      const diff = Math.abs(value - token);
      if (diff < best) {
        closest = token;
        best = diff;
      }
    }
    return closest;
  }

  function measureTrackedTextWidth(text, fontPx, fontFamily, trackingEm = 0) {
    if (!textMeasureCtx) return Math.max(1, text.length * fontPx * 0.6);
    textMeasureCtx.font = `${fontPx}px ${fontFamily}`;
    const raw = textMeasureCtx.measureText(text || " ").width;
    const trackingPx = Math.max(0, (String(text || "").length - 1) * trackingEm * fontPx);
    return raw + trackingPx;
  }

  function drawTrackedTextLine(ctx2, text, x, y, align, fontPx, fontFamily, trackingEm = 0) {
    const content = String(text || "");
    if (!content) return;

    const trackingPx = trackingEm * fontPx;
    if (Math.abs(trackingPx) <= 0.001) {
      ctx2.fillText(content, x, y);
      return;
    }

    const totalWidth = measureTrackedTextWidth(content, fontPx, fontFamily, trackingEm);
    let drawX = x;
    if (align === "center") drawX -= totalWidth * 0.5;
    if (align === "right") drawX -= totalWidth;

    for (const char of content) {
      ctx2.fillText(char, drawX, y);
      drawX += ctx2.measureText(char).width + trackingPx;
    }
  }

  function getTextFlowProbe() {
    if (textFlowProbe) return textFlowProbe;
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.whiteSpace = "pre-wrap";
    probe.style.wordBreak = "normal";
    probe.style.overflowWrap = "break-word";
    probe.style.textWrap = "balance";
    probe.style.display = "block";
    probe.style.padding = "0";
    probe.style.margin = "0";
    document.body.appendChild(probe);
    textFlowProbe = probe;
    return textFlowProbe;
  }

  function extractWrappedLinesFromProbe(probe, text) {
    const paragraphs = String(text || "").split(/\r?\n/);
    probe.textContent = "";

    const fragment = document.createDocumentFragment();

    for (const paragraph of paragraphs) {
      const paragraphEl = document.createElement("div");
      paragraphEl.style.display = "block";
      paragraphEl.style.whiteSpace = "pre-wrap";
      paragraphEl.style.wordBreak = "normal";
      paragraphEl.style.overflowWrap = "break-word";
      paragraphEl.style.textWrap = "balance";
      paragraphEl.style.margin = "0";
      paragraphEl.style.padding = "0";

      const chunks = paragraph
        ? (paragraph.match(/\S+\s*/g) || [paragraph])
        : [""];

      for (const chunk of chunks) {
        const span = document.createElement("span");
        span.textContent = chunk || "\u200b";
        paragraphEl.appendChild(span);
      }

      fragment.appendChild(paragraphEl);
    }

    probe.appendChild(fragment);

    const lines = [];

    for (const paragraphEl of Array.from(probe.children)) {
      const spans = Array.from(paragraphEl.children);
      if (!spans.length) {
        lines.push("");
        continue;
      }

      const paragraphRect = paragraphEl.getBoundingClientRect();
      let currentTop = null;
      let currentLine = "";

      for (const span of spans) {
        const spanRect = span.getBoundingClientRect();
        const spanTop = Math.round((spanRect.top - paragraphRect.top) * 2) / 2;
        const spanText = (span.textContent || "").replace(/\u200b/g, "");

        if (currentTop == null) {
          currentTop = spanTop;
        }

        if (Math.abs(spanTop - currentTop) > 0.5) {
          lines.push(currentLine.trimEnd());
          currentLine = spanText;
          currentTop = spanTop;
          continue;
        }

        currentLine += spanText;
      }

      lines.push(currentLine.trimEnd());
    }

    return lines.length ? lines : [String(text || "")];
  }

  function measureBalancedTextFlow(text, width, fontPx, fontFamily, trackingEm, lineHeight) {
    const probe = getTextFlowProbe();
    if (!probe) {
      const fallbackLines = String(text || "").split(/\r?\n/);
      return {
        width,
        height: fontPx * lineHeight,
        lineCount: Math.max(1, fallbackLines.length),
        lines: fallbackLines,
      };
    }

    probe.style.width = `${Math.max(12, width)}px`;
    probe.style.fontFamily = fontFamily;
    probe.style.fontSize = `${fontPx}px`;
    probe.style.letterSpacing = `${trackingEm}em`;
    probe.style.lineHeight = String(lineHeight);
    const lines = extractWrappedLinesFromProbe(probe, text);

    const rect = probe.getBoundingClientRect();
    const lineHpx = fontPx * lineHeight;
    const lineCount = Math.max(1, lines.filter((line, index) => index < lines.length - 1 || line.length > 0).length || Math.round(rect.height / Math.max(1, lineHpx)));

    return {
      width,
      height: rect.height,
      lineCount,
      lines: lines.length ? lines : [String(text || "")],
    };
  }

  function findBalancedTextWidth(text, maxWidth, minWidth, desiredLines, fontPx, fontFamily, trackingEm, lineHeight) {
    const safeMax = Math.max(24, maxWidth);
    const safeMin = Math.max(24, Math.min(minWidth, safeMax));
    let best = measureBalancedTextFlow(text, safeMax, fontPx, fontFamily, trackingEm, lineHeight);
    best.score = Math.abs(best.lineCount - desiredLines) * 1000;

    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const width = Math.round(lerp(safeMin, safeMax, t));
      const candidate = measureBalancedTextFlow(text, width, fontPx, fontFamily, trackingEm, lineHeight);
      const rag = Math.abs(candidate.width - ((safeMax + safeMin) * 0.5));
      candidate.score = (Math.abs(candidate.lineCount - desiredLines) * 1000) + rag;
      if (candidate.score < best.score) {
        best = candidate;
      }
    }

    return best;
  }

  function wrapTextLinesToWidth(text, maxWidth, fontPx, fontFamily, trackingEm = 0) {
    const paragraphs = String(text || "").split(/\r?\n/);
    const wrapped = [];
    const safeWidth = Math.max(12, maxWidth || 12);

    for (const paragraph of paragraphs) {
      const raw = paragraph.trim();
      if (!raw) {
        wrapped.push("");
        continue;
      }

      const words = raw.split(/\s+/);
      let current = words.shift() || "";

      for (const word of words) {
        const candidate = `${current} ${word}`.trim();
        if (measureTrackedTextWidth(candidate, fontPx, fontFamily, trackingEm) <= safeWidth) {
          current = candidate;
          continue;
        }

        wrapped.push(current);
        current = word;

        while (measureTrackedTextWidth(current, fontPx, fontFamily, trackingEm) > safeWidth && current.length > 1) {
          let splitIndex = current.length - 1;
          while (splitIndex > 1 && measureTrackedTextWidth(current.slice(0, splitIndex), fontPx, fontFamily, trackingEm) > safeWidth) {
            splitIndex--;
          }
          wrapped.push(current.slice(0, splitIndex));
          current = current.slice(splitIndex);
        }
      }

      wrapped.push(current);
    }

    return wrapped.length ? wrapped : [""];
  }

  function getTextMotionOffset(ov, box, timeSec) {
    return { x: 0, y: 0 };
  }

  function shouldDistortTextTexture(ov) {
    return ov.textMotion === "driftX" || ov.textMotion === "driftY";
  }

  function buildTextTextureKey(ov, metrics) {
    return JSON.stringify({
      text: ov.isEditing && ov.inner ? ov.inner.textContent : ov.text,
      role: ov.textRole,
      color: ov.color,
      align: metrics.align,
      fontPx: Math.round(metrics.fontPx * 100) / 100,
      fontFamily: metrics.fontFamily,
      tracking: Math.round(metrics.tracking * 1000) / 1000,
      width: Math.round(metrics.width),
      lineHpx: Math.round(metrics.lineHpx * 100) / 100,
      lines: metrics.lines,
    });
  }

  function getTextTextureCanvas(ov, metrics) {
    const cacheKey = buildTextTextureKey(ov, metrics);
    if (ov.textTextureCanvas && ov.textTextureKey === cacheKey) {
      return ov.textTextureCanvas;
    }

    const tex = document.createElement("canvas");
    tex.width = Math.max(1, Math.ceil(metrics.width));
    tex.height = Math.max(1, Math.ceil(metrics.availableHeight));
    const tctx = tex.getContext("2d", { alpha: true });
    if (!tctx) return null;

    tctx.clearRect(0, 0, tex.width, tex.height);
    tctx.fillStyle = ov.color || "#ffffff";
    tctx.font = `${metrics.fontPx}px ${metrics.fontFamily}`;
    tctx.textBaseline = "top";
    tctx.textAlign = metrics.align || "center";

    let drawX = 0;
    if (metrics.align === "center") drawX = tex.width * 0.5;
    if (metrics.align === "right") drawX = tex.width;

    for (let i = 0; i < metrics.lines.length; i++) {
      drawTrackedTextLine(
        tctx,
        metrics.lines[i],
        drawX,
        i * metrics.lineHpx,
        metrics.align,
        metrics.fontPx,
        metrics.fontFamily,
        metrics.tracking
      );
    }

    ov.textTextureCanvas = tex;
    ov.textTextureKey = cacheKey;
    return tex;
  }

  function smoothFalloff(distance, radius) {
    if (radius <= 0) return 0;
    return smootherstep(1 - clamp01(distance / radius));
  }

  function drawDistortedTextTexture(ctx2, texture, metrics, ov, rawTimeSec, p) {
    const stripH = Math.max(1, Math.round(metrics.fontPx * 0.1));
    const phase = ov.motionPhase || 0;
    const phase01 = wrap01(phase / (Math.PI * 2));
    const radius = Math.max(metrics.width, metrics.availableHeight) * 0.38;
    const fishX = metrics.width * (0.5 + 0.22 * Math.sin(getLoopAngle(p, rawTimeSec, 7.8, phase01)));
    const fishY = metrics.availableHeight * (0.5 + 0.26 * Math.cos(getLoopAngle(p, rawTimeSec, 5.8, phase01 * 0.8)));
    const flowDirX = ov.textMotion === "driftX" ? 1 : -1;
    const waveAngle = getLoopAngle(p, rawTimeSec, 3.2, phase01);
    const driftXAngle = getLoopAngle(p, rawTimeSec, 2.4, phase01);
    const driftYAngle = getLoopAngle(p, rawTimeSec, 3.6, phase01 * 0.7);

    for (let sy = 0; sy < texture.height; sy += stripH) {
      const sh = Math.min(stripH, texture.height - sy);
      const centerY = sy + (sh * 0.5);
      const dyFromFish = centerY - fishY;
      const falloff = smoothFalloff(Math.abs(dyFromFish), radius);
      const wave = Math.sin((centerY / Math.max(12, texture.height)) * Math.PI * 8 + waveAngle);
      let dx = wave * metrics.width * 0.014;
      let dy = 0;

      if (ov.textMotion === "driftX") {
        dx += flowDirX * falloff * metrics.width * 0.04;
      } else if (ov.textMotion === "driftY") {
        dx += Math.sin(driftXAngle + (centerY * 0.055)) * falloff * metrics.width * 0.06;
        dy += Math.cos(driftYAngle + (centerY * 0.035)) * falloff * metrics.lineHpx * 0.12;
      }

      ctx2.drawImage(
        texture,
        0,
        sy,
        texture.width,
        sh,
        metrics.left + dx,
        metrics.top + sy + dy,
        metrics.width,
        sh
      );
    }
  }

  function drawTextTextureToCanvas(ctx2, ov, metrics, rawTimeSec, p) {
    const texture = getTextTextureCanvas(ov, metrics);
    if (!texture) return;

    ctx2.save();
    ctx2.globalAlpha = clamp01(ov.opacity ?? 1);
    ctx2.beginPath();
    ctx2.rect(metrics.left, metrics.top, metrics.width, metrics.availableHeight);
    ctx2.clip();

    if (shouldDistortTextTexture(ov)) {
      drawDistortedTextTexture(ctx2, texture, metrics, ov, rawTimeSec, p);
    } else {
      ctx2.drawImage(texture, metrics.left, metrics.top, metrics.width, metrics.availableHeight);
    }

    ctx2.restore();
  }

  function getTextLayoutMetrics(ov, W, H, lines, rawTimeSec) {
    const fontFamily = pickFontFamily(ov.fontKey);
    const textAlign = ov.align || "center";
    const role = ov.textRole || "title";
    const lineHeight = Math.max(0.8, ov.lineH || 1.08);
    const tracking = ov.tracking || 0;
    const scale = getTextRenderScale(W);
    const sourceText = ov.isEditing && ov.inner ? ov.inner.textContent : ov.text;
    const desiredLines = Math.max(1, parseInt(ov.lineCount || String(String(sourceText || "").split(/\r?\n/).length), 10) || 1);

    if (isGridTextMotionMode(ov.textMotion) && ov.anchorBlockId && lines) {
      const block = getBlockById(ov.anchorBlockId);
      if (block) {
        const rect = blockToPx(block, lines);
        const marginPx = Math.max(0, (ov.marginPx || 24) * scale);
        const box = {
          x: rect.x + marginPx,
          y: rect.y + marginPx,
          w: Math.max(24, rect.w - (marginPx * 2)),
          h: Math.max(24, rect.h - (marginPx * 2)),
        };

        const headlineIdealBase = ((box.h / Math.max(0.1, scale)) * 0.40) / Math.max(1, desiredLines * lineHeight);
        const textIdealBase = headlineIdealBase * getTextRoleRatio(role);
        let tokenIndex = TEXT_TOKENS.indexOf(snapTextToken(textIdealBase));
        if (tokenIndex < 0) tokenIndex = Math.max(0, TEXT_TOKENS.length - 1);

        let chosen = null;

        for (let i = tokenIndex; i >= 0; i--) {
          const token = TEXT_TOKENS[i];
          const fontPx = token * scale;
          const lineHpx = fontPx * lineHeight;
          const flow = findBalancedTextWidth(
            sourceText,
            box.w,
            box.w * 0.42,
            desiredLines,
            fontPx,
            fontFamily,
            tracking,
            lineHeight
          );
          const wrapped = (flow.lines && flow.lines.length)
            ? flow.lines
            : wrapTextLinesToWidth(sourceText, flow.width, fontPx, fontFamily, tracking);
          const totalHeight = Math.max(flow.height, wrapped.length * lineHpx);

          if (totalHeight <= box.h) {
            chosen = { token, fontPx, wrapped, lineHpx, flowWidth: flow.width, flowHeight: totalHeight };
            break;
          }
        }

        if (!chosen) {
          const token = TEXT_TOKENS[0];
          const fontPx = token * scale;
          const lineHpx = fontPx * lineHeight;
          const flow = findBalancedTextWidth(
            sourceText,
            box.w,
            box.w * 0.42,
            desiredLines,
            fontPx,
            fontFamily,
            tracking,
            lineHeight
          );
          chosen = {
            token,
            fontPx,
            wrapped: (flow.lines && flow.lines.length)
              ? flow.lines
              : wrapTextLinesToWidth(sourceText, flow.width, fontPx, fontFamily, tracking),
            lineHpx,
            flowWidth: flow.width,
            flowHeight: Math.max(flow.height, lineHpx),
          };
        }

        const motion = getTextMotionOffset(ov, box, rawTimeSec);
        const totalHeight = Math.max(chosen.flowHeight, chosen.wrapped.length * chosen.lineHpx);
        const clippedHeight = Math.min(box.h, totalHeight);
        let left = box.x;
        if (textAlign === "center") left = box.x + ((box.w - chosen.flowWidth) * 0.5);
        if (textAlign === "right") left = box.x + (box.w - chosen.flowWidth);

        return {
          mode: "grid",
          anchorBlockId: block.id,
          token: chosen.token,
          fontPx: chosen.fontPx,
          fontFamily,
          tracking,
          align: textAlign,
          lines: chosen.wrapped,
          lineHpx: chosen.lineHpx,
          left: left + motion.x,
          top: box.y + motion.y,
          width: chosen.flowWidth,
          height: clippedHeight,
          availableHeight: box.h,
          marginPx,
        };
      }
    }

    const fontPx = Math.max(10, ov.size || 72);
    const width = Math.max(60, (ov.boxWN || 0.55) * W);
    const anchor = stageNormToPx(ov.xN, ov.yN, W, H);
    const flow = measureBalancedTextFlow(sourceText, width, fontPx, fontFamily, tracking, lineHeight);
    const wrapped = (flow.lines && flow.lines.length)
      ? flow.lines
      : wrapTextLinesToWidth(sourceText, width, fontPx, fontFamily, tracking);
    const lineHpx = fontPx * lineHeight;
    const height = Math.max(flow.height || 0, wrapped.length * lineHpx);

    let left = anchor.x;
    if (textAlign === "center") left -= width * 0.5;
    if (textAlign === "right") left -= width;

    return {
      mode: "free",
      anchorBlockId: null,
      token: null,
      fontPx,
      fontFamily,
      tracking,
      align: textAlign,
      lines: wrapped,
      lineHpx,
      left,
      top: anchor.y,
      width,
      height,
      availableHeight: height,
      marginPx: 0,
    };
  }

  function refreshTextMetricsUi() {
    if (!ui.textMetrics) return;
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "text") {
      ui.textMetrics.textContent = 'Texto livre. Selecione um bloco e use "Usar bloco" para encaixar no grid.';
      return;
    }

    if (ov.lastTextMetrics) {
      const metrics = ov.lastTextMetrics;
      const tokenLabel = metrics.token ? `Token ${metrics.token}` : `Livre ${Math.round(metrics.fontPx)}px`;
      const blockLabel = metrics.anchorBlockId ? `Bloco ${metrics.anchorBlockId}` : "Sem bloco";
      ui.textMetrics.textContent = `${ov.textRole || "title"} / ${tokenLabel} / ${metrics.lines.length} linhas / ${blockLabel}`;
      return;
    }

    ui.textMetrics.textContent = 'Texto selecionado. Ajuste o movimento e use "Usar bloco" para vincular ao grid.';
  }

  function refreshTextControlState() {
    const ov = getOverlayById(state.selectedOverlayId);
    const hasText = !!(ov && ov.type === "text");
    const gridManaged = !!(hasText && isGridTextMotionMode(ov.textMotion) && ov.anchorBlockId);

    if (ui.textBindBlock) ui.textBindBlock.disabled = !hasText || !state.selectedBlockId;
    if (ui.textReleaseBlock) ui.textReleaseBlock.disabled = !hasText || !ov.anchorBlockId;
    if (ui.textSize) ui.textSize.disabled = gridManaged;
    if (ui.textBoxW) ui.textBoxW.disabled = gridManaged;
  }

  function pickFontFamily(key) {
    if (key === "archivoRegular") return "ArchivoRegular";
    if (key === "archivoMedium") return "ArchivoMedium";
    if (key === "archivoSemiBold") return "ArchivoSemiBold";
    if (key === "archivoBold") return "ArchivoBold";
    if (key === "mythshire") return "Mythshire";
    return "ArchivoRegular";
  }

  function addTextOverlay() {
    const id = uid("txt");
    const requestedMotion = ui.textMotion.value || "follow";
    const anchorBlockId = isGridTextMotionMode(requestedMotion) && state.selectedBlockId
      ? state.selectedBlockId
      : null;

    const ov = {
      id,
      type: "text",
      text: "Texto",
      textRole: ui.textRole.value || "title",
      textMotion: anchorBlockId ? requestedMotion : "free",
      anchorBlockId,
      lineCount: parseInt(ui.textLines.value || "2", 10) || 2,
      marginPx: parseFloat(ui.textMargin.value || "24") || 24,
      fontKey: ui.textFont.value || "archivoRegular",
      size: parseFloat(ui.textSize.value || "72"),
      color: ui.textColor.value || "#ffffff",
      opacity: parseFloat(ui.textOpacity.value || "1"),
      tracking: parseFloat(ui.textTracking.value || "0"),
      align: ui.textAlign.value || "center",
      boxWN: clamp01(parseFloat(ui.textBoxW.value || "520") / getStageWidthReference()),
      lineH: parseFloat(ui.textLineH.value || "1.08"),
      motionPhase: Math.random() * Math.PI * 2,
      lastTextMetrics: null,
      xN: 0.5,
      yN: 0.5,
      isEditing: false,
      isPlacing: !anchorBlockId,
      el: null,
      inner: null,
      handles: null,
    };

    state.overlays.push(ov);

    const el = document.createElement("div");
    el.className = `overlayItem textItem${anchorBlockId ? "" : " placing"}`;
    el.dataset.id = id;

    const inner = document.createElement("div");
    inner.className = "inner";
    inner.textContent = ov.text;

    el.appendChild(inner);
    textHud.appendChild(el);

    ov.el = el;
    ov.inner = inner;
    ov.handles = createHandlesForOverlay(ov);

    setTextDomStyle(ov);
    selectOverlay(id);

    placingId = anchorBlockId ? null : id;

    let isDragging = false;
    let pointerOffset = { x: 0, y: 0 };

    el.addEventListener("pointerdown", (e) => {
      if (ov.isEditing) return;
      if (isGridTextMotionMode(ov.textMotion) && ov.anchorBlockId) {
        selectOverlay(id);
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      selectOverlay(id);

      const rect = el.getBoundingClientRect();
      pointerOffset.x = e.clientX - (rect.left + rect.width / 2);
      pointerOffset.y = e.clientY - (rect.top + rect.height / 2);

      isDragging = true;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
      if (!isDragging) return;

      const stageRect = stage.getBoundingClientRect();
      const px = e.clientX - stageRect.left - pointerOffset.x;
      const py = e.clientY - stageRect.top - pointerOffset.y;
      const clamped = clampStagePx(px, py);
      const layout = getTextLayoutMetrics(ov, stageRect.width, stageRect.height, getCurrentOverlayLines(stageRect.width, stageRect.height), state.paused ? state.pauseTimeSec : state.lastTimeSec);
      let anchorX = clamped.x;
      if (ov.align === "center") anchorX += (layout.width || 0) * 0.5;
      if (ov.align === "right") anchorX += (layout.width || 0);
      const norm = pxToStageNorm(anchorX, clamped.y, stageRect.width, stageRect.height);

      ov.xN = clamp01(norm.nx);
      ov.yN = clamp01(norm.ny);

      ov.isPlacing = false;
      ov.el.classList.remove("placing");
      placingId = null;

      layoutOverlaysDom();
    });

    el.addEventListener("pointerup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch {}
    });

    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startEditingText(ov);
    });

    return ov;
  }

  function startEditingText(ov) {
    if (!ov || ov.type !== "text") return;
    ov.isEditing = true;
    ov.el.classList.add("editing");
    ov.inner.setAttribute("contenteditable", "true");
    ov.inner.focus();

    const range = document.createRange();
    range.selectNodeContents(ov.inner);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function stopEditingText(ov) {
    if (!ov || ov.type !== "text") return;
    ov.isEditing = false;
    ov.el.classList.remove("editing");
    ov.inner.removeAttribute("contenteditable");
    ov.text = ov.inner.textContent || "";
    setTextDomStyle(ov);
    layoutOverlaysDom();
  }

  document.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (!t) return;

    const insideOverlay = t.closest && t.closest(".overlayItem");
    const insideHandle = t.closest && t.closest(".overlayHandle");
    const insideHud = t.closest && t.closest("#textHud");

    if (!insideHud) return;
    if (!insideOverlay && !insideHandle) deselectOverlay();
  });

  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t) return;
    const el = t.closest && t.closest(".overlayItem");
    if (!el) return;
    const id = el.dataset.id;
    const ov = getOverlayById(id);
    if (ov && ov.type === "text" && ov.isEditing) stopEditingText(ov);
  });

  function applyTextUiToSelected() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "text") return;

    ov.textRole = ui.textRole.value || ov.textRole || "title";
    ov.textMotion = ui.textMotion.value || ov.textMotion || "free";
    ov.lineCount = parseInt(ui.textLines.value || ov.lineCount || "2", 10) || 2;
    ov.marginPx = parseFloat(ui.textMargin.value || ov.marginPx || "24") || 24;
    ov.fontKey = ui.textFont.value || ov.fontKey;
    ov.size = parseFloat(ui.textSize.value || ov.size);
    ov.color = ui.textColor.value || ov.color;
    ov.opacity = parseFloat(ui.textOpacity.value || ov.opacity);
    ov.tracking = parseFloat(ui.textTracking.value || ov.tracking);
    ov.align = ui.textAlign.value || ov.align;
    ov.boxWN = clamp01(parseFloat(ui.textBoxW.value || "520") / getStageWidthReference());
    ov.lineH = parseFloat(ui.textLineH.value || ov.lineH);

    if (isGridTextMotionMode(ov.textMotion) && !ov.anchorBlockId && state.selectedBlockId) {
      ov.anchorBlockId = state.selectedBlockId;
    }
    if (!isGridTextMotionMode(ov.textMotion)) {
      ov.anchorBlockId = null;
    }

    setTextDomStyle(ov);
    layoutOverlaysDom();
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  function syncTextUiFromSelection() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "text") {
      if (ui.textRole) ui.textRole.value = "title";
      if (ui.textMotion) ui.textMotion.value = state.selectedBlockId ? "follow" : "free";
      if (ui.textLines) ui.textLines.value = "2";
      if (ui.textMargin) ui.textMargin.value = "24";
      refreshTextControlState();
      refreshTextMetricsUi();
      return;
    }

    ui.textRole.value = ov.textRole || "title";
    ui.textMotion.value = ov.textMotion || "free";
    ui.textLines.value = String(Math.max(1, ov.lineCount || 2));
    ui.textMargin.value = String(Math.round(ov.marginPx || 24));
    ui.textFont.value = ov.fontKey;
    ui.textSize.value = String(Math.round(ov.size));
    ui.textColor.value = ov.color;
    ui.textOpacity.value = String(ov.opacity);
    ui.textTracking.value = String(ov.tracking);
    ui.textAlign.value = ov.align;
    ui.textBoxW.value = String(Math.round((ov.boxWN || 0.55) * getStageWidthReference()));
    ui.textLineH.value = String(ov.lineH || 1.08);
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  function bindSelectedTextToBlock() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "text" || !state.selectedBlockId) return;
    ov.anchorBlockId = state.selectedBlockId;
    ov.isPlacing = false;
    ov.el?.classList.remove("placing");
    if (!isGridTextMotionMode(ov.textMotion)) {
      ov.textMotion = "follow";
      if (ui.textMotion) ui.textMotion.value = "follow";
    }
    setTextDomStyle(ov);
    layoutOverlaysDom();
    syncTextUiFromSelection();
  }

  function releaseSelectedTextFromBlock() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "text") return;
    const metrics = getTextLayoutMetrics(ov, state.screenW, state.screenH, getCurrentOverlayLines(), state.paused ? state.pauseTimeSec : state.lastTimeSec);
    let anchorX = metrics.left;
    if (metrics.align === "center") anchorX += metrics.width * 0.5;
    if (metrics.align === "right") anchorX += metrics.width;
    ov.xN = clamp01(anchorX / Math.max(1, state.screenW));
    ov.yN = clamp01(metrics.top / Math.max(1, state.screenH));
    ov.anchorBlockId = null;
    ov.textMotion = "free";
    ov.isPlacing = false;
    ov.el?.classList.remove("placing");
    if (ui.textMotion) ui.textMotion.value = "free";
    setTextDomStyle(ov);
    layoutOverlaysDom();
    syncTextUiFromSelection();
  }
  function setTextDomStyle(ov, metrics = null) {
    if (!ov.el || !ov.inner) return;
    const sourceText = ov.isEditing && ov.inner ? ov.inner.textContent : ov.text;

    const resolved = metrics || getTextLayoutMetrics(
      ov,
      state.screenW || Math.round(stage?.getBoundingClientRect().width || 1),
      state.screenH || Math.round(stage?.getBoundingClientRect().height || 1),
      getCurrentOverlayLines(),
      state.paused ? state.pauseTimeSec : state.lastTimeSec
    );

    ov.lastTextMetrics = resolved;

    ov.inner.style.fontFamily = resolved.fontFamily;
    ov.inner.style.fontSize = `${resolved.fontPx}px`;
    ov.inner.style.color = ov.color;
    ov.el.style.opacity = String(ov.opacity);
    ov.inner.style.textAlign = resolved.align;
    ov.inner.style.letterSpacing = `${resolved.tracking}em`;
    ov.inner.style.lineHeight = String(ov.lineH || 1.08);
    ov.inner.style.width = `${Math.max(24, resolved.width)}px`;
    ov.inner.style.maxWidth = `${Math.max(24, resolved.width)}px`;
    ov.inner.style.textWrap = resolved.mode === "grid" ? "balance" : "pretty";
    ov.inner.style.overflowWrap = "break-word";
    ov.inner.style.wordBreak = "normal";
    if (!ov.isEditing) {
      ov.inner.textContent = sourceText || "";
    }

    ov.el.style.transform = "none";
    ov.el.style.width = `${Math.max(24, resolved.width)}px`;
    ov.el.style.height = `${Math.max(12, resolved.height)}px`;
    ov.el.style.overflow = resolved.mode === "grid" ? "hidden" : "visible";
    ov.inner.style.visibility = ov.isEditing ? "visible" : "visible";
    refreshTextMetricsUi();
  }

  function applyAssetViewportStyle(ov) {
    if (!ov.assetWrap || !ov.assetBase || !ov.assetFx) return;

    const src = `./assets/images/${ov.filename}`;
    const w = Math.max(1, (ov.boxWN || 0.25) * state.screenW);
    const h = Math.max(1, w / (ov.aspect || 1));

    ov.assetWrap.style.width = `${w}px`;
    ov.assetWrap.style.height = `${h}px`;

    ov.assetBase.style.backgroundImage = `url("${src}")`;
    ov.assetBase.style.display = "block";

    ov.assetFx.style.display = "none";
    ov.el.style.opacity = String(ov.opacity ?? 1);

    const mode = ov.tintMode || "original";
    const tint = ov.tint || "#ffffff";

    if (mode === "original") return;

    if (mode === "flat") {
      ov.assetFx.style.display = "block";
      ov.assetFx.style.backgroundColor = tint;
      ov.assetFx.style.webkitMaskImage = `url("${src}")`;
      ov.assetFx.style.webkitMaskRepeat = "no-repeat";
      ov.assetFx.style.webkitMaskPosition = "center";
      ov.assetFx.style.webkitMaskSize = "contain";
      ov.assetFx.style.maskImage = `url("${src}")`;
      ov.assetFx.style.maskRepeat = "no-repeat";
      ov.assetFx.style.maskPosition = "center";
      ov.assetFx.style.maskSize = "contain";
      ov.assetBase.style.display = "none";
      return;
    }

    if (mode === "lumaDiff") {
      ov.assetFx.style.display = "block";
      ov.assetFx.style.backgroundImage = `linear-gradient(90deg, rgba(255,255,255,0.92) 0%, ${tint} 50%, rgba(255,255,255,0.85) 100%)`;
      ov.assetFx.style.webkitMaskImage = `url("${src}")`;
      ov.assetFx.style.webkitMaskRepeat = "no-repeat";
      ov.assetFx.style.webkitMaskPosition = "center";
      ov.assetFx.style.webkitMaskSize = "contain";
      ov.assetFx.style.maskImage = `url("${src}")`;
      ov.assetFx.style.maskRepeat = "no-repeat";
      ov.assetFx.style.maskPosition = "center";
      ov.assetFx.style.maskSize = "contain";
      ov.assetBase.style.display = "none";
    }
  }

  function applyAssetUiToSelected() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "asset") return;

    ov.tintMode = ui.assetTintMode.value;
    ov.tint = ui.assetTint.value;
    ov.opacity = parseFloat(ui.assetOpacity.value || "1");

    applyAssetViewportStyle(ov);
  }

  function syncAssetUiFromSelection() {
    const ov = getOverlayById(state.selectedOverlayId);
    if (!ov || ov.type !== "asset") return;

    ui.assetTintMode.value = ov.tintMode || "original";
    ui.assetTint.value = ov.tint || "#ffffff";
    ui.assetOpacity.value = String(ov.opacity ?? 1);
  }

  function layoutOverlaysDom() {
    const lines = getCurrentOverlayLines();
    const rawTimeSec = state.paused ? state.pauseTimeSec : state.lastTimeSec;

    for (const ov of state.overlays) {
      if (!ov.el) continue;
      if (ov.type === "text") {
        const metrics = getTextLayoutMetrics(ov, state.screenW, state.screenH, lines, rawTimeSec);
        setTextDomStyle(ov, metrics);
        ov.el.style.left = `${metrics.left}px`;
        ov.el.style.top = `${metrics.top}px`;
      } else {
        const px0 = stageNormToPx(ov.xN, ov.yN, state.screenW, state.screenH);
        const px = clampStagePx(px0.x, px0.y);
        ov.el.style.left = `${px.x}px`;
        ov.el.style.top = `${px.y}px`;
      }

      if (ov.type === "asset") applyAssetViewportStyle(ov);

      if (ov.handles) {
        ov.handles.style.left = ov.el.style.left;
        ov.handles.style.top = ov.el.style.top;
        updateHandlesBox(ov);
      }
    }
  }

  function deleteSelectedOverlay() {
    const id = state.selectedOverlayId;
    if (!id) return;
    const idx = state.overlays.findIndex(o => o.id === id);
    if (idx < 0) return;

    const ov = state.overlays[idx];
    try { ov.el?.remove(); } catch {}
    try { ov.handles?.remove(); } catch {}

    state.overlays.splice(idx, 1);
    state.selectedOverlayId = null;
    syncTextUiFromSelection();
    refreshTextControlState();
    refreshTextMetricsUi();
  }

  function bringOverlayFront() {
    const id = state.selectedOverlayId;
    if (!id) return;
    const idx = state.overlays.findIndex(o => o.id === id);
    if (idx < 0) return;

    const [ov] = state.overlays.splice(idx, 1);
    state.overlays.push(ov);

    if (ov.el) textHud.appendChild(ov.el);
    if (ov.handles) textHud.appendChild(ov.handles);
  }

  function sendOverlayBack() {
    const id = state.selectedOverlayId;
    if (!id) return;
    const idx = state.overlays.findIndex(o => o.id === id);
    if (idx < 0) return;

    const [ov] = state.overlays.splice(idx, 1);
    state.overlays.unshift(ov);

    if (ov.el) textHud.insertBefore(ov.el, textHud.firstChild);
    if (ov.handles) textHud.insertBefore(ov.handles, textHud.firstChild);
  }

  function createHandlesForOverlay(ov) {
    const wrap = document.createElement("div");
    wrap.className = "overlayHandles";
    wrap.dataset.id = ov.id;
    wrap.style.display = "none";

    const box = document.createElement("div");
    box.className = "overlayBox";
    wrap.appendChild(box);

    const mk = (name) => {
      const h = document.createElement("div");
      h.className = `overlayHandle ${name}`;
      h.dataset.handle = name;
      wrap.appendChild(h);
      return h;
    };

    const hL = mk("left");
    const hR = mk("right");
    const hTL = mk("tl");
    const hTR = mk("tr");
    const hBL = mk("bl");
    const hBR = mk("br");

    textHud.appendChild(wrap);

    const onResizeStart = (handleName, e) => {
      e.preventDefault();
      e.stopPropagation();
      selectOverlay(ov.id);
      if (ov.type === "text" && isGridTextMotionMode(ov.textMotion) && ov.anchorBlockId) {
        return;
      }

      const start = {
        px: e.clientX,
        py: e.clientY,
        boxWN: ov.boxWN,
        size: ov.size || 100,
      };

      const rect = stage.getBoundingClientRect();

      const move = (ev) => {
        const dxN = (ev.clientX - start.px) / Math.max(1, rect.width);
        const dy = (ev.clientY - start.py);

        if (handleName === "left" || handleName === "right") {
          const s = handleName === "right" ? 1 : -1;
          ov.boxWN = Math.max(0.02, Math.min(2.0, start.boxWN + dxN * s));
        } else {
          ov.boxWN = Math.max(0.02, Math.min(2.0, start.boxWN + dxN * (handleName.includes("r") ? 1 : -1)));
          if (ov.type === "text") {
            const k = 1 + (dy / 220);
            ov.size = Math.max(4, Math.min(2000, start.size * k));
          }
        }

        if (ov.type === "text") setTextDomStyle(ov);
        if (ov.type === "asset") applyAssetViewportStyle(ov);
        layoutOverlaysDom();
      };

      const up = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
      };

      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
    };

    [hL, hR, hTL, hTR, hBL, hBR].forEach((h) => {
      h.addEventListener("pointerdown", (e) => onResizeStart(h.dataset.handle, e));
    });

    return wrap;
  }

  function updateHandlesBox(ov) {
    if (!ov.el || !ov.handles) return;
    const r = ov.el.getBoundingClientRect();
    ov.handles.style.width = `${r.width}px`;
    ov.handles.style.height = `${r.height}px`;

    const box = ov.handles.querySelector(".overlayBox");
    if (box) {
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    }
  }

  function drawTextToCanvas(ctx2, ov, W, H, lines, rawTimeSec, p) {
    const metrics = getTextLayoutMetrics(ov, W, H, lines, rawTimeSec);
    ov.lastTextMetrics = metrics;
    drawTextTextureToCanvas(ctx2, ov, metrics, rawTimeSec, p);
  }

  function loadAssetImage(filename) {
    if (state.assetCache.has(filename)) return state.assetCache.get(filename);
    const img = new Image();
    img.onload = () => layoutOverlaysDom();
    img.src = `./assets/images/${filename}`;
    state.assetCache.set(filename, img);
    return img;
  }

  function renderAssetOffscreen(ov, W) {
    const img = loadAssetImage(ov.filename);
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const drawW = Math.max(1, (ov.boxWN || 0.25) * W);
    const drawH = drawW * (ih / iw);

    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.floor(drawW));
    off.height = Math.max(1, Math.floor(drawH));
    const octx = off.getContext("2d", { alpha: true });

    octx.clearRect(0, 0, off.width, off.height);

    const mode = ov.tintMode || "original";
    const tint = ov.tint || "#ffffff";

    if (mode === "original") {
      octx.drawImage(img, 0, 0, off.width, off.height);
      return off;
    }

    if (mode === "flat") {
      octx.drawImage(img, 0, 0, off.width, off.height);
      octx.globalCompositeOperation = "source-in";
      octx.fillStyle = tint;
      octx.fillRect(0, 0, off.width, off.height);
      octx.globalCompositeOperation = "source-over";
      return off;
    }

    if (mode === "lumaDiff") {
      octx.drawImage(img, 0, 0, off.width, off.height);
      octx.globalCompositeOperation = "source-in";
      const grad = octx.createLinearGradient(0, 0, off.width, 0);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.5, tint);
      grad.addColorStop(1, "rgba(255,255,255,0.85)");
      octx.fillStyle = grad;
      octx.fillRect(0, 0, off.width, off.height);
      octx.globalCompositeOperation = "source-over";
      return off;
    }

    octx.drawImage(img, 0, 0, off.width, off.height);
    return off;
  }

  function drawAssetToCanvas(ctx2, ov, W, H) {
    const px = stageNormToPx(ov.xN, ov.yN, W, H);
    const asset = renderAssetOffscreen(ov, W);

    ctx2.save();
    ctx2.globalAlpha = clamp01(ov.opacity ?? 1);
    ctx2.drawImage(asset, px.x - asset.width * 0.5, px.y - asset.height * 0.5);
    ctx2.restore();
  }

  function drawOverlaysToCanvas(ctx2, lines, W, H, rawTimeSec, p) {
    for (const ov of state.overlays) {
      if (ov.type === "text") drawTextToCanvas(ctx2, ov, W, H, lines, rawTimeSec, p);
      if (ov.type === "asset") drawAssetToCanvas(ctx2, ov, W, H);
    }
  }

  function addAssetOverlay(filename) {
    const id = uid("ast");
    const img = loadAssetImage(filename);
    const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1;

    const ov = {
      id,
      type: "asset",
      filename,
      tintMode: "original",
      tint: "#ffffff",
      opacity: 1,
      xN: 0.5,
      yN: 0.5,
      boxWN: 0.25,
      aspect,
      isPlacing: true,
      el: null,
      assetWrap: null,
      assetBase: null,
      assetFx: null,
      handles: null,
    };

    state.overlays.push(ov);

    const el = document.createElement("div");
    el.className = "overlayItem assetItem placing";
    el.dataset.id = id;

    const assetWrap = document.createElement("div");
    assetWrap.className = "assetWrap";

    const assetBase = document.createElement("div");
    assetBase.className = "assetBase";

    const assetFx = document.createElement("div");
    assetFx.className = "assetFx";

    assetWrap.appendChild(assetBase);
    assetWrap.appendChild(assetFx);
    el.appendChild(assetWrap);
    textHud.appendChild(el);

    ov.el = el;
    ov.assetWrap = assetWrap;
    ov.assetBase = assetBase;
    ov.assetFx = assetFx;
    ov.handles = createHandlesForOverlay(ov);

    applyAssetViewportStyle(ov);
    selectOverlay(id);

    placingId = id;

    let isDragging = false;
    let pointerOffset = { x: 0, y: 0 };

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      selectOverlay(id);

      const rect = el.getBoundingClientRect();
      pointerOffset.x = e.clientX - (rect.left + rect.width / 2);
      pointerOffset.y = e.clientY - (rect.top + rect.height / 2);

      isDragging = true;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
      if (!isDragging) return;

      const stageRect = stage.getBoundingClientRect();
      const px = e.clientX - stageRect.left - pointerOffset.x;
      const py = e.clientY - stageRect.top - pointerOffset.y;
      const clamped = {
        x: Math.max(0, Math.min(stageRect.width, px)),
        y: Math.max(0, Math.min(stageRect.height, py)),
      };
      const norm = pxToStageNorm(clamped.x, clamped.y, stageRect.width, stageRect.height);

      ov.xN = clamp01(norm.nx);
      ov.yN = clamp01(norm.ny);

      ov.isPlacing = false;
      ov.el.classList.remove("placing");
      placingId = null;

      layoutOverlaysDom();
    });

    el.addEventListener("pointerup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch {}
    });

    return ov;
  }

  const ASSET_LIBRARY = [
    "logo_clube.png",
    "logo_clube_bar.png",
    "el_boy_01.png",
    "el_boy_02.png",
    "el_boy_03.png",
    "el_boy_04.png",
    "el_casal_01.png",
    "el_mina_01.png",
    "el_mina_02.png",
    "el_pixel_boy_01.png",
    "el_pixel_boy_02.png",
    "el_pixel_boy_03.png",
    "el_pixel_boy_04.png",
    "el_pixel_casal_01.png",
    "el_pixel_mina_01.png",
    "el_pixel_mina_02.png",
    "el_pixel_mina_03.png",
  ];

  function categorizeAsset(name) {
    const n = name.toLowerCase();
    if (n.startsWith("logo_")) return "logos";
    if (n.startsWith("el_pixel_")) return "pixel";
    if (n.startsWith("el_")) return "elements";
    return "outros";
  }

  function initAssetsUI() {
    if (!ui.assetsMount || state.assets.uiReady) return;

    const wrap = document.createElement("div");
    wrap.className = "assetsUi";

    const title = document.createElement("div");
    title.className = "assetsTitle";
    title.textContent = "Biblioteca";

    const row = document.createElement("div");
    row.className = "assetsRow";

    const select = document.createElement("select");
    select.className = "assetsSelect";

    const groups = {};
    for (const f of ASSET_LIBRARY) {
      const g = categorizeAsset(f);
      groups[g] ||= [];
      groups[g].push(f);
    }

    for (const [g, files] of Object.entries(groups)) {
      const og = document.createElement("optgroup");
      og.label = g;
      files.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        og.appendChild(opt);
      });
      select.appendChild(og);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small";
    btn.textContent = "Inserir";

    btn.addEventListener("click", () => {
      const filename = select.value;
      if (!filename) return;
      addAssetOverlay(filename);
    });

    row.appendChild(select);
    row.appendChild(btn);

    wrap.appendChild(title);
    wrap.appendChild(row);

    ui.assetsMount.appendChild(wrap);

    state.assets.uiReady = true;
    state.assets.selectEl = select;
    state.assets.addBtn = btn;
  }

  function exportPNG() {
    const { width, height } = getExportDimensions();
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const outCtx = out.getContext("2d", { alpha: false });
    if (!outCtx) return;

    const p = getParamsFromUI();
    const rawTimeSec = state.paused ? state.pauseTimeSec : state.lastTimeSec;

    state.exporting = true;
    state.exportDuration = parseFloat(ui.recSeconds.value || "15");

    const lines = renderCompositeFrame(
      outCtx,
      out.width,
      out.height,
      rawTimeSec,
      p,
      cloneLayoutState(layoutScreen, state.screenW, state.screenH, out.width, out.height),
      false
    );

    state.exporting = false;

    if (!lines) return;

    out.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, "clube-frame.png");
    }, "image/png");
  }

  let recorder = null;
  let recordedChunks = [];
  let exportSession = null;

  function renderCompositeFrame(targetCtx, W, H, rawTimeSec, p, layoutState, drawSelection) {
    setCanvasQuality(targetCtx);
    const timeSec = state.paused ? state.pauseTimeSec : rawTimeSec;
    const lines = renderFrame(targetCtx, W, H, timeSec, p, layoutState, drawSelection);
    drawOverlaysToCanvas(targetCtx, lines, W, H, rawTimeSec, p);
    return lines;
  }

  function estimateVideoBitrate(width, height, fps, format) {
    const density = isMp4Format(format) ? 0.085 : 0.11;
    const bitrate = Math.round(width * height * fps * density);
    const maxBitrate = isMp4Format(format) ? 24_000_000 : 48_000_000;
    const minBitrate = isMp4Format(format) ? 6_000_000 : 8_000_000;
    return Math.max(minBitrate, Math.min(maxBitrate, bitrate));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function stopMediaStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((mediaTrack) => {
      try { mediaTrack.stop(); } catch {}
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setRecordingUi(isRecording) {
    ui.recStart.disabled = isRecording;
    ui.recStop.disabled = !isRecording;
  }

  async function startRecording() {
    if (recorder || exportSession) return;
    if (typeof MediaRecorder === "undefined") {
      console.error("MediaRecorder nao esta disponivel neste navegador.");
      return;
    }

    const p = getParamsFromUI();
    const fps = Math.max(1, parseInt(ui.recFps.value || "60", 10) || 60);
    const secs = Math.max(1, parseFloat(ui.recSeconds.value || "15") || 15);
    const { width, height } = getExportDimensions();
    const format = pickRecordingFormat();

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext("2d", { alpha: false });
    if (!exportCtx) return;

    const exportLayout = cloneLayoutState(layoutScreen, state.screenW, state.screenH, width, height);
    const startRawTimeSec = state.paused ? state.pauseTimeSec : state.lastTimeSec;

    state.exporting = true;
    state.exportDuration = secs;

    const warmupFrames = 2;
    for (let i = warmupFrames; i > 0; i--) {
      const warmupTimeSec = Math.max(0, startRawTimeSec - (i / fps));
      renderCompositeFrame(exportCtx, width, height, warmupTimeSec, p, exportLayout, false);
    }
    renderCompositeFrame(exportCtx, width, height, startRawTimeSec, p, exportLayout, false);

    let stream = exportCanvas.captureStream(0);
    let frameTrack = stream.getVideoTracks()[0] || null;
    const manualFrameControl = typeof frameTrack?.requestFrame === "function";

    if (!manualFrameControl) {
      stopMediaStream(stream);
      stream = exportCanvas.captureStream(fps);
      frameTrack = stream.getVideoTracks()[0] || null;
    }

    const recorderOptions = {
      videoBitsPerSecond: estimateVideoBitrate(width, height, fps, format),
    };
    if (format.mimeType) recorderOptions.mimeType = format.mimeType;
    if (isMp4Format(format)) recorderOptions.videoKeyFrameIntervalCount = Math.max(1, Math.round(fps));

    let currentRecorder = null;

    try {
      currentRecorder = new MediaRecorder(stream, recorderOptions);
    } catch (err) {
      console.error("Nao foi possivel iniciar o export em video.", err);
      stopMediaStream(stream);
      state.exporting = false;
      return;
    }

    recorder = currentRecorder;
    recordedChunks = [];
    exportSession = {
      stopped: false,
      stream,
      format,
      width,
      height,
    };

    state.recording = true;
    state.recordingStartSec = startRawTimeSec;
    state.recordingPhaseOffset01 = getFreeDepthPhase01(p, startRawTimeSec);

    setRecordingUi(true);

    currentRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    currentRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, {
        type: currentRecorder.mimeType || format.mimeType || "video/webm",
      });

      downloadBlob(blob, `clube-rec.${format.extension}`);

      stopMediaStream(stream);

      recorder = null;
      recordedChunks = [];
      exportSession = null;
      state.exporting = false;
      state.recording = false;
      state.recordingPhaseOffset01 = 0;
      setRecordingUi(false);
      refreshExportSummary();
    };

    currentRecorder.onerror = (event) => {
      console.error("Falha durante o export em video.", event);
      stopRecording();
    };

    currentRecorder.start();
    if (manualFrameControl) {
      frameTrack.requestFrame();
    }
    refreshExportSummary();

    const totalFrames = Math.max(1, Math.round(secs * fps));
    const frameDurationMs = 1000 / fps;
    const wallClockStart = performance.now();

    for (let frameIndex = 1; frameIndex < totalFrames; frameIndex++) {
      if (!exportSession || exportSession.stopped || currentRecorder.state === "inactive") break;

      const nextFrameAt = wallClockStart + (frameIndex * frameDurationMs);
      const waitMs = nextFrameAt - performance.now();

      if (waitMs > 1) {
        await sleep(waitMs);
      } else {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }

      const rawTimeSec = state.paused
        ? state.pauseTimeSec
        : startRawTimeSec + (frameIndex / fps);

      renderCompositeFrame(exportCtx, width, height, rawTimeSec, p, exportLayout, false);
      if (manualFrameControl) {
        frameTrack.requestFrame();
      }
    }

    await sleep(Math.min(50, frameDurationMs));

    if (currentRecorder.state !== "inactive") {
      currentRecorder.stop();
    }
  }

  function stopRecording() {
    if (exportSession) exportSession.stopped = true;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function init() {
    setAspect(ui.aspect.value);
    generateBlocks(ui.complexity.value);
    bindEvents();
    updateSelectionUI();
    populatePaletteEditor();
    initAssetsUI();
    refreshTintSlotLabels();
    refreshExportSummary();
    setRecordingUi(false);
    if (typeof ResizeObserver !== "undefined" && viewerSurface) {
      const resizeObserver = new ResizeObserver(() => scheduleResizeCanvas());
      resizeObserver.observe(viewerSurface);
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => scheduleResizeCanvas()).catch(() => {});
    }
    scheduleResizeCanvas();
    requestAnimationFrame(render);
  }

  function bindEvents() {
    window.addEventListener("resize", scheduleResizeCanvas);
    window.visualViewport?.addEventListener("resize", scheduleResizeCanvas);

    ui.aspect.addEventListener("change", () => setAspect(ui.aspect.value));
    ui.recFps.addEventListener("change", refreshExportSummary);
    ui.recRes.addEventListener("change", refreshExportSummary);

    ui.tintPalette.addEventListener("change", refreshTintSlotLabels);
    ui.mediaTintPalette.addEventListener("change", refreshTintSlotLabels);
    ui.overlayTintPalette.addEventListener("change", refreshTintSlotLabels);

    ui.regen.addEventListener("click", () => {
      generateBlocks(ui.complexity.value);
      layoutScreen.smoothXs = null;
      layoutScreen.smoothYs = null;
      syncEditorUIToSelection();
      updateSelectionUI();
    });

    ui.reset.addEventListener("click", () => {
      ui.gridToggle.checked = true;
      ui.gridOpacity.value = "0.22";
      ui.aspect.value = "feed";
      ui.fitMode.value = "cover";
      ui.motionMode.value = "drift";

      ui.tintMotion.value = "none";
      ui.mediaTintMotion.value = "none";
      ui.overlayTintMotion.value = "none";

      ui.tintPalette.value = "azul";
      ui.mediaTintPalette.value = "azul";
      ui.overlayTintPalette.value = "azul";

      ui.tintColorSlot.value = "1";
      ui.mediaTintColorSlot.value = "1";
      ui.overlayTintColorSlot.value = "1";

      ui.tintDuration.value = "2.8";
      ui.gradTintOpacity.value = "0.16";
      ui.mediaTintOpacity.value = "0.18";
      ui.overlayTintOpacity.value = "0.12";

      ui.sceneMode.value = "none";
      ui.sceneDuration.value = "3.4";
      ui.paletteA.value = "azul";

      ui.speed.value = "1.0";
      ui.motionLoopDuration.value = "12";
      ui.contrast.value = "1.0";
      ui.light.value = "1.0";
      ui.tilt3d.value = "0.42";
      ui.tilt3dMode.value = "none";
      ui.depthDuration.value = "6.0";
      ui.depthSyncExport.checked = true;

      ui.complexity.value = "9";

      ui.layoutMode.value = "morph";
      ui.layoutDir.value = "right";
      ui.layoutAmt.value = "0.35";
      ui.layoutSmooth.value = "0.72";

      ui.mediaScale.value = "1";
      ui.mediaOffsetX.value = "0";
      ui.mediaOffsetY.value = "0";

      ui.recSeconds.value = "15";
      ui.recFps.value = "30";
      ui.recRes.value = "1080";

      ui.assetTintMode.value = "original";
      ui.assetTint.value = "#ffffff";
      ui.assetOpacity.value = "1";

      ui.textRole.value = "title";
      ui.textMotion.value = "follow";
      ui.textLines.value = "2";
      ui.textMargin.value = "24";
      ui.textFont.value = "archivoRegular";
      ui.textSize.value = "72";
      ui.textColor.value = "#ffffff";
      ui.textOpacity.value = "1";
      ui.textTracking.value = "0";
      ui.textAlign.value = "center";
      ui.textBoxW.value = "520";
      ui.textLineH.value = "1.08";

      state.paused = false;
      ui.pauseBtn.textContent = "Pausar";

      setAspect("feed");
      generateBlocks(9);

      state.media.clear();
      state.selectedBlockId = null;
      updateSelectionUI();

      layoutScreen.smoothXs = null;
      layoutScreen.smoothYs = null;

      populatePaletteEditor();
      clearAllOverlays();
      refreshTintSlotLabels();
      refreshExportSummary();
    });

    ui.pauseBtn.addEventListener("click", () => togglePause());

    ui.cellPalette.addEventListener("change", () => populateColorList());

    ui.applyCellColor.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;

      const color = ui.cellColor.value;
      state.media.delete(id);
      b.overrideMode = "solid";
      b.overrideColor = color;

      updateSelectionUI();
      syncEditorUIToSelection();
    });

    ui.autoCell.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;

      b.overrideMode = "auto";
      b.overrideColor = null;

      updateSelectionUI();
      syncEditorUIToSelection();
    });

    ui.clearCell.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      state.media.delete(id);
      const b = getBlockById(id);
      if (b) {
        b.mediaScale = 1;
        b.mediaX = 0;
        b.mediaY = 0;
      }
      updateSelectionUI();
    });

    ui.lockCell.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;

      const currentLines = window.__currentLinesForLock;
      if (currentLines) {
        const rect = blockToPx(b, currentLines);
        const p = getParamsFromUI();
        const depth = getDepthMotion(
          b,
          rect,
          p,
          state.paused ? state.pauseTimeSec : state.lastTimeSec,
          state.screenW,
          state.screenH
        );
        b.lockDepth = depth.z;
      }

      b.locked = true;
      updateSelectionUI();
    });

    ui.unlockCell.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;
      b.locked = false;
      updateSelectionUI();
    });

    ui.mediaScale.addEventListener("input", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;
      b.mediaScale = parseFloat(ui.mediaScale.value || "1");
    });

    ui.mediaOffsetX.addEventListener("input", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;
      b.mediaX = parseFloat(ui.mediaOffsetX.value || "0");
    });

    ui.mediaOffsetY.addEventListener("input", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;
      b.mediaY = parseFloat(ui.mediaOffsetY.value || "0");
    });

    ui.mediaReset.addEventListener("click", () => {
      const id = state.selectedBlockId;
      if (!id) return;
      const b = getBlockById(id);
      if (!b) return;
      b.mediaScale = 1;
      b.mediaX = 0;
      b.mediaY = 0;
      updateSelectionUI();
    });

    canvas.addEventListener("click", (ev) => {
      if (!window.__currentLinesForLock) return;

      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;

      const hit = state.blocks.find(b => {
        const r = blockToPx(b, window.__currentLinesForLock);
        return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
      });

      state.selectedBlockId = hit ? hit.id : null;
      updateSelectionUI();
      syncEditorUIToSelection();

      if (!hit) deselectOverlay();
    });

    canvas.addEventListener("dragover", (ev) => ev.preventDefault());

    canvas.addEventListener("drop", (ev) => {
      ev.preventDefault();
      if (!window.__currentLinesForLock) return;

      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;

      const hit = state.blocks.find(b => {
        const r = blockToPx(b, window.__currentLinesForLock);
        return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
      });

      if (!hit) return;

      state.selectedBlockId = hit.id;
      updateSelectionUI();
      syncEditorUIToSelection();

      const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!file) return;
      setMediaForBlock(hit.id, file);
    });

    ui.exportPng.addEventListener("click", exportPNG);
    ui.recStart.addEventListener("click", startRecording);
    ui.recStop.addEventListener("click", stopRecording);

    ui.addText.addEventListener("click", () => addTextOverlay());
    ui.deleteText.addEventListener("click", () => deleteSelectedOverlay());
    ui.bringFront.addEventListener("click", () => bringOverlayFront());
    ui.sendBack.addEventListener("click", () => sendOverlayBack());

    ui.textRole.addEventListener("change", () => applyTextUiToSelected());
    ui.textMotion.addEventListener("change", () => applyTextUiToSelected());
    ui.textBindBlock.addEventListener("click", () => bindSelectedTextToBlock());
    ui.textReleaseBlock.addEventListener("click", () => releaseSelectedTextFromBlock());
    ui.textLines.addEventListener("input", () => applyTextUiToSelected());
    ui.textMargin.addEventListener("input", () => applyTextUiToSelected());
    ui.textFont.addEventListener("change", () => applyTextUiToSelected());
    ui.textSize.addEventListener("input", () => applyTextUiToSelected());
    ui.textColor.addEventListener("input", () => applyTextUiToSelected());
    ui.textOpacity.addEventListener("input", () => applyTextUiToSelected());
    ui.textTracking.addEventListener("input", () => applyTextUiToSelected());
    ui.textAlign.addEventListener("change", () => applyTextUiToSelected());
    ui.textBoxW.addEventListener("input", () => applyTextUiToSelected());
    ui.textLineH.addEventListener("input", () => applyTextUiToSelected());

    ui.assetTintMode.addEventListener("change", () => applyAssetUiToSelected());
    ui.assetTint.addEventListener("input", () => applyAssetUiToSelected());
    ui.assetOpacity.addEventListener("input", () => applyAssetUiToSelected());

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cancelPlacing();
      if ((e.key === "Backspace" || e.key === "Delete") && state.selectedOverlayId) {
        const ov = getOverlayById(state.selectedOverlayId);
        if (ov && ov.type === "text" && ov.isEditing) return;
        deleteSelectedOverlay();
      }
    });
  }

  function render(timeMs) {
    const rawTimeSec = timeMs / 1000;
    state.lastTimeSec = rawTimeSec;
    const timeSec = state.paused ? state.pauseTimeSec : rawTimeSec;

    const p = getParamsFromUI();
    const lines = renderFrame(ctx, state.screenW, state.screenH, timeSec, p, layoutScreen, true);
    window.__currentLinesForLock = lines;

    layoutOverlaysDom();
    requestAnimationFrame(render);
  }

  init();

  // Acesso para o render quadro a quadro das TVs (js/render-tv.js).
  window.__grid = {
    state, ui, PALETTES, renderCompositeFrame, getParamsFromUI, makeLayoutState,
    generateBlocks, getBlockById, loadAssetImage, mulberry32,
  };
})();
