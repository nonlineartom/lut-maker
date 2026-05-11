// App glue: file load, corner alignment, sampling, fit, post-process,
// preview render, and .cube export. Everything client-side.

(function () {
  "use strict";

  const state = {
    image: null,            // HTMLImageElement
    imageData: null,        // ImageData of the original
    layoutName: "color",
    layout: null,           // { cols, rows, patches }
    corners: null,          // [TL, TR, BR, BL] in image pixel space
    refs: null,             // editable copies of layout.patches
    samples: null,          // [{ row, col, x, y, rgb }]
    insetPct: 0.4,
    dragging: null,
    transform: null,        // most-recent fitted transform
    fitBuffer: null,        // Float32Array W*H*3 - fit output per pixel
    previewW: 0,
    previewH: 0,
    target: "rec709",
    styleContrast: 4.5,
    styleSaturation: 1.15,
    lastCubeText: null,
    lastCubeName: null,
  };

  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  // DOM refs
  const dropzone        = $("#dropzone");
  const fileInput       = $("#file-input");
  const uploadHint      = $("#upload-hint");
  const stepAlign       = $("#step-align");
  const stepSample      = $("#step-sample");
  const stepFit         = $("#step-fit");
  const stepPreview     = $("#step-preview");
  const layoutSelect    = $("#chart-layout");
  const insetSlider     = $("#sample-inset");
  const insetValue      = $("#sample-inset-value");
  const resetCornersBtn = $("#reset-corners");
  const imgCanvas       = $("#image-canvas");
  const overlayCanvas   = $("#overlay-canvas");
  const patchGrid       = $("#patch-grid");
  const resampleBtn     = $("#resample-btn");
  const resetRefsBtn    = $("#reset-refs-btn");
  const modelSelect     = $("#fit-model");
  const lambdaInput     = $("#lambda");
  const sizeSelect      = $("#lut-size");
  const titleInput      = $("#lut-title");
  const generateBtn     = $("#generate-btn");
  const downloadLink    = $("#download-link");
  const fitStats        = $("#fit-stats");
  const busyPill        = $("#busy-pill");
  const targetSegmented = $("#target-segmented");
  const styleControls   = $("#style-controls");
  const styleContrast   = $("#style-contrast");
  const styleContrastVal= $("#style-contrast-value");
  const styleSat        = $("#style-sat");
  const styleSatVal     = $("#style-sat-value");

  const previewBefore   = $("#preview-before");
  const previewAfter    = $("#preview-after");
  const previewWrap     = $("#preview-wrap");
  const splitHandle     = $("#split-handle");
  const previewHint     = $("#preview-hint");

  const imgCtx     = imgCanvas.getContext("2d", { willReadFrequently: true });
  const overlayCtx = overlayCanvas.getContext("2d");
  const beforeCtx  = previewBefore.getContext("2d");
  const afterCtx   = previewAfter.getContext("2d");

  // ---------- file load ----------

  dropzone.addEventListener("click", () => fileInput.click());
  ["dragenter", "dragover"].forEach(ev =>
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach(ev =>
    dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.remove("is-drag");
    })
  );
  dropzone.addEventListener("drop", e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });

  async function handleFile(file) {
    try {
      const img = await loadImage(file);
      state.image = img;
      setupCanvasForImage(img);
      setupPreviewCanvas(img);
      state.layoutName = layoutSelect.value;
      state.layout = SpyderRefs.getLayout(state.layoutName);
      state.refs = state.layout.patches.map(p => p.slice());
      state.corners = defaultCorners(img.width, img.height, state.layout.defaultRegion);
      uploadHint.textContent =
        `${img.width} × ${img.height} px — pick a panel and drag the markers onto its corner patches.`;
      stepAlign.hidden = false;
      stepSample.hidden = false;
      stepFit.hidden = false;
      stepPreview.hidden = true;
      draw();
      sampleAndRender();
    } catch (err) {
      uploadHint.textContent = "Could not load that image: " + err.message;
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }

  function setupCanvasForImage(img) {
    imgCanvas.width = img.width;
    imgCanvas.height = img.height;
    overlayCanvas.width = img.width;
    overlayCanvas.height = img.height;
    const maxDisplay = 960;
    const scale = Math.min(1, maxDisplay / img.width);
    const displayW = Math.round(img.width * scale);
    [imgCanvas, overlayCanvas].forEach(c => {
      c.style.width = displayW + "px";
      c.style.height = "auto";
    });
    imgCtx.drawImage(img, 0, 0);
    state.imageData = imgCtx.getImageData(0, 0, img.width, img.height);
  }

  function setupPreviewCanvas(img) {
    // The preview can be a touch smaller than the source for responsiveness.
    // We process the source at native res and just CSS-scale the canvas.
    const targetMax = 1280;
    const scale = Math.min(1, targetMax / img.width);
    state.previewW = Math.round(img.width * scale);
    state.previewH = Math.round(img.height * scale);
    [previewBefore, previewAfter].forEach(c => {
      c.width  = state.previewW;
      c.height = state.previewH;
      c.style.width = "100%";
      c.style.height = "auto";
    });
  }

  function defaultCorners(w, h, region) {
    // region is [x0, y0, x1, y1] in image-relative coordinates (0..1).
    // Falls back to a centred 20%-inset box.
    const r = region || [0.20, 0.20, 0.80, 0.80];
    const x0 = w * r[0], y0 = h * r[1];
    const x1 = w * r[2], y1 = h * r[3];
    return [
      [x0, y0], // TL
      [x1, y0], // TR
      [x1, y1], // BR
      [x0, y1], // BL
    ];
  }

  // ---------- corner drag ----------

  function clientToImage(evt) {
    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    return [
      (evt.clientX - rect.left) * scaleX,
      (evt.clientY - rect.top)  * scaleY,
    ];
  }
  function nearestCorner(p, threshold) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < state.corners.length; i++) {
      const c = state.corners[i];
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD < threshold ? best : -1;
  }
  overlayCanvas.addEventListener("pointerdown", e => {
    if (!state.corners) return;
    overlayCanvas.setPointerCapture(e.pointerId);
    const p = clientToImage(e);
    const threshold = Math.max(20, overlayCanvas.width * 0.03);
    const i = nearestCorner(p, threshold);
    if (i >= 0) {
      state.dragging = i;
      state.corners[i] = p;
      draw();
    }
  });
  overlayCanvas.addEventListener("pointermove", e => {
    if (state.dragging == null || !state.corners) return;
    state.corners[state.dragging] = clientToImage(e);
    draw();
  });
  overlayCanvas.addEventListener("pointerup", () => {
    if (state.dragging != null) {
      state.dragging = null;
      sampleAndRender();
    }
  });

  // ---------- controls ----------

  layoutSelect.addEventListener("change", () => {
    state.layoutName = layoutSelect.value;
    state.layout = SpyderRefs.getLayout(state.layoutName);
    state.refs = state.layout.patches.map(p => p.slice());
    // Re-bias default corners to the panel side we just switched to.
    if (state.image) {
      state.corners = defaultCorners(state.image.width, state.image.height, state.layout.defaultRegion);
    }
    draw();
    sampleAndRender();
  });
  insetSlider.addEventListener("input", () => {
    state.insetPct = parseInt(insetSlider.value, 10) / 100;
    insetValue.textContent = insetSlider.value + "%";
    updateRangeFill(insetSlider);
    draw();
  });
  insetSlider.addEventListener("change", () => sampleAndRender());
  resetCornersBtn.addEventListener("click", () => {
    if (!state.image) return;
    state.corners = defaultCorners(
      state.image.width, state.image.height, state.layout && state.layout.defaultRegion
    );
    draw();
    sampleAndRender();
  });
  resampleBtn.addEventListener("click", () => sampleAndRender());
  resetRefsBtn.addEventListener("click", () => {
    if (!state.layout) return;
    state.refs = state.layout.patches.map(p => p.slice());
    renderPatchGrid();
  });

  // Target segmented control
  targetSegmented.addEventListener("click", e => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    setTarget(btn.dataset.target);
  });
  function setTarget(name) {
    state.target = name;
    $$("#target-segmented .seg").forEach(b => {
      const on = b.dataset.target === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    styleControls.hidden = name !== "rec709a";
    // Auto-update title prefix unless the user has customized it.
    const cur = titleInput.value.trim();
    if (cur === "SpyderBro_Rec709" || cur === "SpyderBro_Rec709A" || cur === "") {
      titleInput.value = name === "rec709a" ? "SpyderBro_Rec709A" : "SpyderBro_Rec709";
    }
    // If we already have a fit buffer, repaint preview with new post.
    if (state.fitBuffer) repaintPreview();
  }

  function onStyleChange() {
    state.styleContrast   = parseFloat(styleContrast.value);
    state.styleSaturation = parseFloat(styleSat.value);
    styleContrastVal.textContent = state.styleContrast.toFixed(1);
    styleSatVal.textContent      = state.styleSaturation.toFixed(2);
    updateRangeFill(styleContrast);
    updateRangeFill(styleSat);
    if (state.fitBuffer) repaintPreview();
  }
  styleContrast.addEventListener("input", onStyleChange);
  styleSat.addEventListener("input", onStyleChange);

  generateBtn.addEventListener("click", () => generate().catch(err => {
    fitStats.textContent = "Generate failed: " + err.message;
    setBusy(false);
  }));

  // Visual fill for the custom range sliders.
  function updateRangeFill(el) {
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const v = parseFloat(el.value);
    const pct = ((v - min) / (max - min)) * 100;
    el.style.setProperty("--rng", pct + "%");
  }
  [insetSlider, styleContrast, styleSat].forEach(updateRangeFill);

  // ---------- draw alignment overlay ----------

  function draw() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!state.corners || !state.layout) return;
    const [TL, TR, BR, BL] = state.corners;

    overlayCtx.lineWidth = Math.max(2, overlayCanvas.width * 0.002);
    overlayCtx.strokeStyle = "rgba(0, 212, 255, 0.9)";
    overlayCtx.beginPath();
    overlayCtx.moveTo(TL[0], TL[1]);
    overlayCtx.lineTo(TR[0], TR[1]);
    overlayCtx.lineTo(BR[0], BR[1]);
    overlayCtx.lineTo(BL[0], BL[1]);
    overlayCtx.closePath();
    overlayCtx.stroke();

    const { cols, rows } = state.layout;
    const centres = Sampling.patchCentres(state.corners, cols, rows);
    const half = Sampling.patchSampleHalfSize(state.corners, cols, rows, state.insetPct);
    overlayCtx.lineWidth = Math.max(1, overlayCanvas.width * 0.0012);
    overlayCtx.strokeStyle = "rgba(255, 91, 133, 0.9)";
    for (const c of centres) {
      overlayCtx.strokeRect(c.x - half, c.y - half, half * 2, half * 2);
    }

    const r = Math.max(8, overlayCanvas.width * 0.012);
    const labels = ["TL", "TR", "BR", "BL"];
    overlayCtx.font = `${Math.max(12, overlayCanvas.width * 0.018)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    for (let i = 0; i < state.corners.length; i++) {
      const [x, y] = state.corners[i];
      overlayCtx.fillStyle = "rgba(10, 13, 18, 0.88)";
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, r, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.strokeStyle = "#00d4ff";
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
      overlayCtx.fillStyle = "#e9eef7";
      overlayCtx.fillText(labels[i], x, y);
    }
  }

  // ---------- patch sampling ----------

  function sampleAndRender() {
    if (!state.imageData || !state.corners || !state.layout) return;
    const { cols, rows } = state.layout;
    state.samples = Sampling.sampleAllPatches(
      state.imageData, state.corners, cols, rows, state.insetPct
    );
    renderPatchGrid();
  }

  function renderPatchGrid() {
    if (!state.samples) return;
    const { cols } = state.layout;
    patchGrid.innerHTML = "";

    const header = document.createElement("div");
    header.className = "patch-row header";
    header.innerHTML = `
      <div>Patch</div>
      <div>Sampled</div>
      <div>Reference</div>
      <div>Sampled RGB</div>
      <div>Reference RGB</div>`;
    patchGrid.appendChild(header);

    state.samples.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className = "patch-row";
      const ref = state.refs[idx];
      const r = Math.round(s.rgb[0] * 255);
      const g = Math.round(s.rgb[1] * 255);
      const b = Math.round(s.rgb[2] * 255);
      row.innerHTML = `
        <div class="label">${labelFor(idx, cols)}</div>
        <div><span class="swatch" style="background: rgb(${r}, ${g}, ${b})"></span></div>
        <div><span class="swatch editable" data-idx="${idx}" title="Click to edit"
              style="background: rgb(${ref[0]}, ${ref[1]}, ${ref[2]})"></span></div>
        <div class="rgb-text">${r}, ${g}, ${b}</div>
        <div class="rgb-text">${ref[0]}, ${ref[1]}, ${ref[2]}</div>`;
      patchGrid.appendChild(row);
    });

    patchGrid.querySelectorAll(".swatch.editable").forEach(el => {
      el.addEventListener("click", () => editRef(parseInt(el.dataset.idx, 10)));
    });
  }

  function labelFor(idx, cols) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    return String.fromCharCode(65 + r) + (c + 1);
  }

  function editRef(idx) {
    const cur = state.refs[idx];
    const input = prompt(
      `Reference RGB for patch ${labelFor(idx, state.layout.cols)} (0-255, comma or space separated):`,
      cur.join(", ")
    );
    if (input == null) return;
    const m = input.split(/[\s,]+/).filter(Boolean).map(Number);
    if (m.length !== 3 || m.some(v => !isFinite(v) || v < 0 || v > 255)) {
      alert("Need three numbers in 0-255.");
      return;
    }
    state.refs[idx] = m.map(v => Math.round(v));
    renderPatchGrid();
  }

  // ---------- post selector ----------

  function currentPost() {
    return PostFx.forTarget(state.target, {
      contrast:   state.styleContrast,
      saturation: state.styleSaturation,
    });
  }

  // ---------- generate + preview ----------

  function setBusy(on) {
    busyPill.hidden = !on;
    generateBtn.disabled = on;
    generateBtn.style.opacity = on ? 0.7 : 1;
  }

  async function generate() {
    if (!state.samples || !state.refs || !state.image) return;
    setBusy(true);
    fitStats.textContent = "Fitting…";

    // Fit the neutral Rec.709 transform.
    const samples01 = state.samples.map(s => s.rgb);
    const refs01    = state.refs.map(r => r.map(v => v / 255));
    const model  = modelSelect.value;
    const lambda = Math.max(0, parseFloat(lambdaInput.value) || 0);
    const transform = ColorFit.fit(samples01, refs01, { model, lambda });
    state.transform = transform;
    const stats = ColorFit.residuals(transform, samples01, refs01);

    // Build the per-pixel fit buffer at preview resolution.
    fitStats.textContent = "Rendering preview…";
    const preImg = downsampleImageData(state.imageData, state.previewW, state.previewH);
    state.fitBuffer = await Preview.buildFitBuffer(transform, preImg, frac => {
      fitStats.textContent = `Rendering preview… ${(frac * 100).toFixed(0)}%`;
    });

    // Draw the "before" canvas once (original log frame at preview size).
    beforeCtx.putImageData(preImg, 0, 0);

    // Paint "after" through the current post.
    repaintPreview();

    // Show the preview section and the split slider.
    stepPreview.hidden = false;
    ensureSplitSlider();

    // Generate and download the .cube file.
    const size = parseInt(sizeSelect.value, 10);
    const title = titleInput.value.trim() || "SpyderBro_LUT";
    const cube = LUT.generateCube(transform, size, title, {
      clamp: true,
      post: state.target === "rec709a" ? currentPost() : null,
    });
    state.lastCubeText = cube;
    state.lastCubeName = title.replace(/[^A-Za-z0-9._-]+/g, "_") + ".cube";
    LUT.downloadBlob(cube, state.lastCubeName);

    fitStats.textContent =
      `Model: ${model}   λ: ${lambda}   Target: ${state.target === "rec709a" ? "Rec.709(A)" : "Rec.709"}\n` +
      `Per-patch residual: RMS ${stats.rms.toFixed(2)}  ·  max ${stats.max.toFixed(2)}  (ΔRGB, 0–255 scale)\n` +
      `Cube: ${size}³ = ${size * size * size} entries · saved as ${state.lastCubeName}`;

    downloadLink.hidden = false;
    downloadLink.textContent = `Re-download ${state.lastCubeName}`;
    downloadLink.onclick = e => {
      e.preventDefault();
      if (state.lastCubeText && state.lastCubeName) {
        LUT.downloadBlob(state.lastCubeText, state.lastCubeName);
      }
    };

    setBusy(false);
  }

  function repaintPreview() {
    if (!state.fitBuffer) return;
    const out = afterCtx.createImageData(state.previewW, state.previewH);
    const post = state.target === "rec709a" ? currentPost() : null;
    Preview.applyPostToImageData(state.fitBuffer, out, post);
    afterCtx.putImageData(out, 0, 0);
  }

  // Downsample using a temporary canvas — keeps the fit-buffer work bounded
  // for very large screenshots.
  function downsampleImageData(src, w, h) {
    if (src.width === w && src.height === h) return src;
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext("2d");
    // Round-trip through an off-screen canvas the same size as the source.
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = src.width;
    srcCanvas.height = src.height;
    srcCanvas.getContext("2d").putImageData(src, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  // ---------- preview split slider ----------

  let splitSliderReady = false;
  function ensureSplitSlider() {
    if (splitSliderReady) return;
    Preview.attachSplitSlider({
      wrap: previewWrap,
      beforeCanvas: previewBefore,
      afterCanvas: previewAfter,
      handle: splitHandle,
    });
    splitSliderReady = true;
  }

})();
