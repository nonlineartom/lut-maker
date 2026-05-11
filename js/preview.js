// Output preview.
//
// Apply a fitted transform to every pixel of the source image so the user
// can see what the LUT will do to footage. Because the transform itself
// only runs once per fit, parameter tweaks to the post-process (e.g. the
// Rec.709(A) contrast and saturation sliders) repaint the preview in a
// few ms — we cache the fit output per pixel in a Float32Array and only
// re-run the cheap post stage on style changes.

(function (global) {

  // Run the transform over the source ImageData and store the result as
  // a packed Float32Array of length W*H*3 (RGB, no alpha) in [0, 1].
  // For images larger than ~2 megapixels this is split across animation
  // frames so the page stays responsive; progress is reported via the
  // onProgress callback (0..1).
  function buildFitBuffer(transform, imageData, onProgress) {
    const { data, width, height } = imageData;
    const out = new Float32Array(width * height * 3);
    return new Promise(resolve => {
      const rowsPerChunk = Math.max(1, Math.floor(120000 / width));
      let y = 0;
      function chunk() {
        const yEnd = Math.min(height, y + rowsPerChunk);
        for (; y < yEnd; y++) {
          let pi = (y * width) * 4;
          let oi = (y * width) * 3;
          for (let x = 0; x < width; x++) {
            const r = data[pi]     / 255;
            const g = data[pi + 1] / 255;
            const b = data[pi + 2] / 255;
            const o = transform.evaluate(r, g, b);
            out[oi]     = o[0];
            out[oi + 1] = o[1];
            out[oi + 2] = o[2];
            pi += 4;
            oi += 3;
          }
        }
        if (onProgress) onProgress(y / height);
        if (y < height) {
          requestAnimationFrame(chunk);
        } else {
          resolve(out);
        }
      }
      chunk();
    });
  }

  // Apply the post-process to the cached fit buffer and write the result
  // into a target ImageData (RGBA8). post is (rgb01) -> rgb01 or null.
  function applyPostToImageData(fitBuffer, target, post) {
    const data = target.data;
    const N = fitBuffer.length / 3;
    if (!post) {
      for (let i = 0, j = 0; i < N; i++, j += 3) {
        const di = i * 4;
        data[di]     = clamp255(fitBuffer[j]     * 255);
        data[di + 1] = clamp255(fitBuffer[j + 1] * 255);
        data[di + 2] = clamp255(fitBuffer[j + 2] * 255);
        data[di + 3] = 255;
      }
      return;
    }
    const tmp = [0, 0, 0];
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      tmp[0] = fitBuffer[j];
      tmp[1] = fitBuffer[j + 1];
      tmp[2] = fitBuffer[j + 2];
      const o = post(tmp);
      const di = i * 4;
      data[di]     = clamp255(o[0] * 255);
      data[di + 1] = clamp255(o[1] * 255);
      data[di + 2] = clamp255(o[2] * 255);
      data[di + 3] = 255;
    }
  }

  function clamp255(v) {
    if (v <= 0) return 0;
    if (v >= 255) return 255;
    return v | 0;
  }

  // Hook up a before/after split slider over two canvases sharing the
  // same parent. The "after" canvas sits on top; we clip it from the
  // left so the underlying "before" canvas shows through on the right.
  // Drag anywhere on the wrapper to move the split.
  function attachSplitSlider({ wrap, beforeCanvas, afterCanvas, handle }) {
    let split = 0.5;
    function apply() {
      const wPct = (split * 100).toFixed(3);
      afterCanvas.style.clipPath = `inset(0 0 0 ${wPct}%)`;
      handle.style.left = `${wPct}%`;
    }
    function setFromEvent(e) {
      const rect = wrap.getBoundingClientRect();
      const x = (e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX)) - rect.left;
      split = Math.max(0, Math.min(1, x / rect.width));
      apply();
    }
    let dragging = false;
    wrap.addEventListener("pointerdown", e => {
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      setFromEvent(e);
    });
    wrap.addEventListener("pointermove", e => { if (dragging) setFromEvent(e); });
    wrap.addEventListener("pointerup",   e => { dragging = false; });
    wrap.addEventListener("pointercancel", () => { dragging = false; });
    apply();
    return { setSplit(v) { split = Math.max(0, Math.min(1, v)); apply(); } };
  }

  global.Preview = { buildFitBuffer, applyPostToImageData, attachSplitSlider };
})(window);
