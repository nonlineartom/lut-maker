// Patch sampling.
//
// Given the four corner positions of the chart in image space (top-left,
// top-right, bottom-right, bottom-left) and a (cols, rows) grid, compute
// each patch centre by bilinear interpolation and sample a small square
// region around it. Outliers are rejected with a per-channel trimmed mean
// (drop top/bottom 15%) so a hot pixel or speck on the patch can't drag
// the result.

(function (global) {

  // Compute patch centres in image (pixel) coordinates.
  // corners is [TL, TR, BR, BL] (each [x, y]), placed at the *centres of
  // the four corner patches*. Inner patch centres are placed by bilinear
  // interpolation, so u and v step from 0 to 1 across (cols-1) and
  // (rows-1) cells respectively.
  function patchCentres(corners, cols, rows) {
    const [TL, TR, BR, BL] = corners;
    const out = [];
    for (let r = 0; r < rows; r++) {
      const v = rows === 1 ? 0 : r / (rows - 1);
      for (let c = 0; c < cols; c++) {
        const u = cols === 1 ? 0 : c / (cols - 1);
        const tx = TL[0] + (TR[0] - TL[0]) * u;
        const ty = TL[1] + (TR[1] - TL[1]) * u;
        const bx = BL[0] + (BR[0] - BL[0]) * u;
        const by = BL[1] + (BR[1] - BL[1]) * u;
        const x = tx + (bx - tx) * v;
        const y = ty + (by - ty) * v;
        out.push({ row: r, col: c, x, y });
      }
    }
    return out;
  }

  // Approximate patch half-size (in pixels) using corner geometry.
  // Corners are at corner-patch centres, so the TL→TR span covers
  // (cols-1) patches; we divide by that to get one patch's width.
  // patchInsetPct is the fraction of the patch we sample from the centre
  // outwards — e.g. 0.4 means sample a square whose side is 80% of the
  // patch's nominal size, leaving a 20% margin to the patch edge.
  function patchSampleHalfSize(corners, cols, rows, patchInsetPct) {
    const [TL, TR, BR, BL] = corners;
    const horizCells = Math.max(1, cols - 1);
    const vertCells  = Math.max(1, rows - 1);
    const horizTop  = Math.hypot(TR[0] - TL[0], TR[1] - TL[1]) / horizCells;
    const horizBot  = Math.hypot(BR[0] - BL[0], BR[1] - BL[1]) / horizCells;
    const vertLeft  = Math.hypot(BL[0] - TL[0], BL[1] - TL[1]) / vertCells;
    const vertRight = Math.hypot(BR[0] - TR[0], BR[1] - TR[1]) / vertCells;
    const patchSize = (horizTop + horizBot + vertLeft + vertRight) / 4;
    return Math.max(1, Math.round(patchSize * patchInsetPct * 0.5));
  }

  // Sample one patch from an ImageData buffer using a trimmed mean.
  // Returns [r, g, b] in [0, 1].
  function samplePatch(imageData, cx, cy, half) {
    const { data, width, height } = imageData;
    const x0 = Math.max(0, Math.floor(cx - half));
    const x1 = Math.min(width - 1, Math.floor(cx + half));
    const y0 = Math.max(0, Math.floor(cy - half));
    const y1 = Math.min(height - 1, Math.floor(cy + half));

    const rs = [], gs = [], bs = [];
    for (let y = y0; y <= y1; y++) {
      let idx = (y * width + x0) * 4;
      for (let x = x0; x <= x1; x++) {
        rs.push(data[idx]);
        gs.push(data[idx + 1]);
        bs.push(data[idx + 2]);
        idx += 4;
      }
    }
    return [trimmedMean(rs) / 255, trimmedMean(gs) / 255, trimmedMean(bs) / 255];
  }

  function trimmedMean(arr) {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const trim = Math.floor(arr.length * 0.15);
    let sum = 0, n = 0;
    for (let i = trim; i < arr.length - trim; i++) { sum += arr[i]; n++; }
    return n > 0 ? sum / n : arr[Math.floor(arr.length / 2)];
  }

  // Convenience: sample all patches for a layout and corner set.
  // Returns array of { row, col, x, y, rgb01 } in row-major order.
  function sampleAllPatches(imageData, corners, cols, rows, insetPct) {
    const centres = patchCentres(corners, cols, rows);
    const half = patchSampleHalfSize(corners, cols, rows, insetPct);
    return centres.map(p => ({
      ...p,
      half,
      rgb: samplePatch(imageData, p.x, p.y, half),
    }));
  }

  global.Sampling = {
    patchCentres,
    patchSampleHalfSize,
    samplePatch,
    sampleAllPatches,
  };
})(window);
