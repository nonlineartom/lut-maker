// .cube LUT generation.
//
// Iridas/Adobe .cube 3D LUT format. Triplets are written in the canonical
// order: R varies fastest, then G, then B.  Domain is [0, 1]³ in/out.

(function (global) {

  // Format a float for .cube output. 6 decimals is overkill but keeps things
  // human-readable and stable round-tripping.
  function f(v) {
    if (!isFinite(v)) v = 0;
    // Clamp slightly inside [0, 1] to keep the LUT compatible with strict
    // parsers; most NLEs accept values outside that range but Resolve, for
    // example, treats out-of-range cube values inconsistently.
    return v.toFixed(6);
  }

  function clamp01(v) {
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  // transform: object with .evaluate(r, g, b) -> [R, G, B] in [0, 1]³
  // size:      LUT cube side length (17, 33, 65, …)
  // title:     LUT title
  // opts:      { clamp: true, post: rgb => rgb }
  function generateCube(transform, size, title, opts) {
    const clamp = !opts || opts.clamp !== false;
    const post  = (opts && opts.post) || null;
    const lines = [];
    lines.push(`TITLE "${(title || "Untitled").replace(/"/g, "'")}"`);
    lines.push(`LUT_3D_SIZE ${size}`);
    lines.push(`DOMAIN_MIN 0.0 0.0 0.0`);
    lines.push(`DOMAIN_MAX 1.0 1.0 1.0`);

    const step = 1 / (size - 1);
    for (let bi = 0; bi < size; bi++) {
      const b = bi * step;
      for (let gi = 0; gi < size; gi++) {
        const g = gi * step;
        for (let ri = 0; ri < size; ri++) {
          const r = ri * step;
          let out = transform.evaluate(r, g, b);
          if (post) out = post(out);
          let R = out[0], G = out[1], B = out[2];
          if (clamp) { R = clamp01(R); G = clamp01(G); B = clamp01(B); }
          lines.push(`${f(R)} ${f(G)} ${f(B)}`);
        }
      }
    }
    lines.push("");
    return lines.join("\n");
  }

  function downloadBlob(text, filename) {
    const blob = new Blob([text], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.LUT = { generateCube, downloadBlob };
})(window);
