// App glue: file load, corner alignment, sampling, fit, export.
//
// Everything happens client-side. The image stays in a canvas; corners
// are dragged on an overlay canvas; the overlay is redrawn on every
// pointer event.

(function () {
  "use strict";

  const state = {
    image: null,            // HTMLImageElement
    imageData: null,        // ImageData (raw pixels of the loaded image)
    layoutName: "landscape",
    layout: null,           // { cols, rows, patches }
    corners: null,          // [TL, TR, BR, BL] in image pixel space
    refs: null,             // override-able copies of layout.patches
    samples: null,          // [{ row, col, x, y, rgb }]
    insetPct: 0.4,
    dragging: null,         // index of corner being dragged, or null
    transform: null,        // most-recent fitted transform
  };

  // DOM refs
  const $ = sel => document.querySelector(sel);
  const fileInput      = $("#file-input");
  const uploadHint     = $("#upload-hint");
  const stepAlign      = $("#step-align");
  const stepSample     = $("#step-sample");
  const stepFit        = $("#step-fit");
  const layoutSelect   = $("#chart-layout");
  const insetSlider    = $("#sample-inset");
  const insetValue     = $("#sample-inset-value");
  const resetCornersBtn= $("#reset-corners");
  const imgCanvas      = $("#image-canvas");
  const overlayCanvas  = $("#overlay-canvas");
  const patchGrid      = $("#patch-grid");
  const resampleBtn    = $("#resample-btn");
  const resetRefsBtn   = $("#reset-refs-btn");
  const modelSelect    = $("#fit-model");
  const lambdaInput    = $("#lambda");
  const sizeSelect     = $("#lut-size");
  const titleInput     = $("#lut-title");
  const generateBtn    = $("#generate-btn");
  const downloadLink   = $("#download-link");
  const fitStats       = $("#fit-stats");

  const imgCtx     = imgCanvas.getContext("2d", { willReadFrequently: true });
  const overlayCtx = overlayCanvas.getContext("2d");

  // ---------- load image ----------

  fileInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await loadImage(file);
      state.image = img;
      setupCanvasForImage(img);
      state.layoutName = layoutSelect.value;
      state.layout = SpyderRefs.getLayout(state.layoutName);
      state.refs = state.layout.patches.map(p => p.slice());
      state.corners = defaultCorners(img.width, img.height);
      uploadHint.textContent =
        `${img.width} × ${img.height} pixels — drag the four corner markers ` +
        `onto the corner patches of the chart.`;
      stepAlign.hidden = false;
      stepSample.hidden = false;
      stepFit.hidden = false;
      draw();
      sampleAndRender();
    } catch (err) {
      uploadHint.textContent = "Could not load that image: " + err.message;
    }
  });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }

  function setupCanvasForImage(img) {
    // Internal canvas resolution = full image resolution; CSS scales it
    // down to fit the page width.
    imgCanvas.width = img.width;
    imgCanvas.height = img.height;
    overlayCanvas.width = img.width;
    overlayCanvas.height = img.height;
    const maxDisplay = 900;
    const scale = Math.min(1, maxDisplay / img.width);
    const displayW = Math.round(img.width * scale);
    imgCanvas.style.width = displayW + "px";
    overlayCanvas.style.width = displayW + "px";
    imgCanvas.style.height = "auto";
    overlayCanvas.style.height = "auto";

    imgCtx.drawImage(img, 0, 0);
    state.imageData = imgCtx.getImageData(0, 0, img.width, img.height);
  }

  function defaultCorners(w, h) {
    // Start with a generous box centered in the image.
    const mx = w * 0.2, my = h * 0.2;
    return [
      [mx,        my       ], // TL
      [w - mx,    my       ], // TR
      [w - mx,    h - my   ], // BR
      [mx,        h - my   ], // BL
    ];
  }

  // ---------- corner dragging ----------

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
    // Hit threshold in image pixels — scale with canvas size so it feels
    // about the same regardless of source resolution.
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

  overlayCanvas.addEventListener("pointerup", e => {
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
    draw();
    sampleAndRender();
  });

  insetSlider.addEventListener("input", () => {
    state.insetPct = parseInt(insetSlider.value, 10) / 100;
    insetValue.textContent = insetSlider.value + "%";
    draw();
  });
  insetSlider.addEventListener("change", () => sampleAndRender());

  resetCornersBtn.addEventListener("click", () => {
    if (!state.image) return;
    state.corners = defaultCorners(state.image.width, state.image.height);
    draw();
    sampleAndRender();
  });

  resampleBtn.addEventListener("click", () => sampleAndRender());

  resetRefsBtn.addEventListener("click", () => {
    if (!state.layout) return;
    state.refs = state.layout.patches.map(p => p.slice());
    renderPatchGrid();
  });

  generateBtn.addEventListener("click", generateCube);

  // ---------- draw ----------

  function draw() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!state.corners || !state.layout) return;

    const [TL, TR, BR, BL] = state.corners;

    // Chart outline.
    overlayCtx.lineWidth = Math.max(2, overlayCanvas.width * 0.002);
    overlayCtx.strokeStyle = "rgba(88, 166, 255, 0.9)";
    overlayCtx.beginPath();
    overlayCtx.moveTo(TL[0], TL[1]);
    overlayCtx.lineTo(TR[0], TR[1]);
    overlayCtx.lineTo(BR[0], BR[1]);
    overlayCtx.lineTo(BL[0], BL[1]);
    overlayCtx.closePath();
    overlayCtx.stroke();

    // Sample regions.
    const { cols, rows } = state.layout;
    const centres = Sampling.patchCentres(state.corners, cols, rows);
    const half = Sampling.patchSampleHalfSize(state.corners, cols, rows, state.insetPct);
    overlayCtx.lineWidth = Math.max(1, overlayCanvas.width * 0.0012);
    overlayCtx.strokeStyle = "rgba(255, 180, 84, 0.95)";
    for (const c of centres) {
      overlayCtx.strokeRect(c.x - half, c.y - half, half * 2, half * 2);
    }

    // Corner markers.
    const r = Math.max(8, overlayCanvas.width * 0.012);
    const labels = ["TL", "TR", "BR", "BL"];
    overlayCtx.font = `${Math.max(12, overlayCanvas.width * 0.018)}px sans-serif`;
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    for (let i = 0; i < state.corners.length; i++) {
      const [x, y] = state.corners[i];
      overlayCtx.fillStyle = "rgba(20, 24, 29, 0.85)";
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, r, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.strokeStyle = "#58a6ff";
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
      overlayCtx.fillStyle = "#e6edf3";
      overlayCtx.fillText(labels[i], x, y);
    }
  }

  // ---------- sample + render table ----------

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
      <div></div>
      <div>Sampled</div>
      <div>Reference (click to edit)</div>
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
        <div class="rgb-text">${labelFor(idx, cols)}</div>
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

  // ---------- fit + export ----------

  function generateCube() {
    if (!state.samples || !state.refs) return;
    const samples01 = state.samples.map(s => s.rgb);
    const refs01    = state.refs.map(r => r.map(v => v / 255));
    const model = modelSelect.value;
    const lambda = Math.max(0, parseFloat(lambdaInput.value) || 0);
    const size = parseInt(sizeSelect.value, 10);
    const title = titleInput.value.trim() || "SpyderCheckr_to_Rec709";

    let transform;
    try {
      transform = ColorFit.fit(samples01, refs01, { model, lambda });
    } catch (err) {
      fitStats.textContent = "Fit failed: " + err.message;
      return;
    }
    state.transform = transform;

    const stats = ColorFit.residuals(transform, samples01, refs01);
    const cube = LUT.generateCube(transform, size, title, { clamp: true });

    fitStats.textContent =
      `Model: ${model}   λ: ${lambda}\n` +
      `Per-patch residual: RMS ${stats.rms.toFixed(2)}  ·  max ${stats.max.toFixed(2)}  (ΔRGB, 0-255 scale)\n` +
      `Cube size: ${size}³ = ${size * size * size} entries\n` +
      `Ready to download.`;

    const fname = title.replace(/[^A-Za-z0-9._-]+/g, "_") + ".cube";
    LUT.downloadBlob(cube, fname);

    downloadLink.hidden = false;
    downloadLink.textContent = `Re-download ${fname}`;
    downloadLink.onclick = e => {
      e.preventDefault();
      LUT.downloadBlob(cube, fname);
    };
  }

})();
