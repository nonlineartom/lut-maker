// Output-target post processing.
//
// The fitter produces a neutral Rec.709 mapping. To approximate Sony's
// "Rec.709(A)" look — the more contrasty / saturated variant they ship
// alongside the neutral Rec.709 LUT for S-Log3.cine — we apply a fixed,
// reproducible styling pass to the fit output:
//
//   1. A centred sigmoid S-curve on each channel (endpoints pinned to
//      0 and 1) for added mid-tone contrast.
//   2. A saturation push in display-encoded space using Rec.709 luma
//      weights.
//
// Sony does not publish the exact Rec.709(A) transfer, so the defaults
// here are a community-tested approximation. The user can dial contrast
// and saturation independently if they want a closer match.

(function (global) {
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Centred sigmoid with endpoints normalized to (0 -> 0) and (1 -> 1).
  // k controls slope; larger k = stronger S-curve.
  function contrastCurve(k) {
    if (k <= 0.0001) return x => x; // flat curve = identity
    const s = v => 1 / (1 + Math.exp(-k * (v - 0.5)));
    const s0 = s(0), s1 = s(1);
    const span = s1 - s0;
    return x => (s(x) - s0) / span;
  }

  function identity() { return rgb => [rgb[0], rgb[1], rgb[2]]; }

  // Rec.709 → Rec.709(A)-style look.
  // contrast: sigmoid slope (typical 3–6, default 4.5)
  // saturation: 1.0 = neutral, 1.15 ≈ Sony 709A feel
  function rec709A(opts) {
    const contrast   = (opts && opts.contrast   != null) ? opts.contrast   : 4.5;
    const saturation = (opts && opts.saturation != null) ? opts.saturation : 1.15;
    const curve = contrastCurve(contrast);
    return function (rgb) {
      let r = curve(clamp01(rgb[0]));
      let g = curve(clamp01(rgb[1]));
      let b = curve(clamp01(rgb[2]));
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
      return [r, g, b];
    };
  }

  // Convenience selector by target name.
  function forTarget(name, params) {
    if (name === "rec709a") return rec709A(params);
    return identity();
  }

  global.PostFx = { identity, rec709A, contrastCurve, forTarget };
})(window);
