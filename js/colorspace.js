// CIE Lab D50 → sRGB (D65 / Rec.709 primaries) conversion.
//
// Pipeline:
//   Lab(D50) → XYZ(D50) → XYZ(D65)  [Bradford CAT]
//             → linear sRGB         [XYZ→RGB matrix, D65]
//             → sRGB γ encoded      [IEC 61966-2-1 piecewise]
//
// Datacolor publishes SpyderCheckr reference values as CIE Lab measured
// with a D50 illuminant (the colorimetry standard for graphic-arts
// reference targets). To target Rec.709 / sRGB display we have to
// chromatically adapt to D65 before applying the sRGB matrix and OETF.

(function (global) {

  // CIE standard constants for the inverse f(t) function.
  const EPS   = 216 / 24389;        // 0.008856
  const KAPPA = 24389 / 27;         // 903.296...

  // D50 white point in XYZ, Y normalized to 1.
  const Xw50 = 0.96422, Yw50 = 1.00000, Zw50 = 0.82521;

  // Bradford chromatic-adaptation matrix, D50 → D65.
  const M_D50_TO_D65 = [
    [ 0.9555766, -0.0230393,  0.0631636],
    [-0.0282895,  1.0099416,  0.0210077],
    [ 0.0122982, -0.0204830,  1.3299098],
  ];

  // XYZ (D65) → linear sRGB. Standard IEC 61966-2-1 / Rec.709 matrix.
  const M_XYZ_TO_RGB = [
    [ 3.2406, -1.5372, -0.4986],
    [-0.9689,  1.8758,  0.0415],
    [ 0.0557, -0.2040,  1.0570],
  ];

  function mul3(M, v) {
    return [
      M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
      M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
      M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2],
    ];
  }

  // Inverse Lab nonlinearity. Returns 0 if t corresponds to a negative
  // tristimulus (numerical safety only — should not happen for valid Lab).
  function finv(t) {
    const t3 = t * t * t;
    if (t3 > EPS) return t3;
    return (116 * t - 16) / KAPPA;
  }

  // Lab D50 → XYZ D50 (Y normalized to 1).
  function labD50ToXyzD50(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    return [Xw50 * finv(fx), Yw50 * finv(fy), Zw50 * finv(fz)];
  }

  // Linear → sRGB piecewise (forward OETF).
  function linearToSrgb(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    if (v <= 0.0031308) return 12.92 * v;
    return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  // sRGB → linear piecewise (inverse OETF).
  function srgbToLinear(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    if (v <= 0.04045) return v / 12.92;
    return Math.pow((v + 0.055) / 1.055, 2.4);
  }

  // Lab D50 → sRGB float [0, 1] (Rec.709 primaries, D65).
  // Out-of-gamut values are clipped to [0, 1].
  function labD50ToSrgbFloat(L, a, b) {
    const xyz50 = labD50ToXyzD50(L, a, b);
    const xyz65 = mul3(M_D50_TO_D65, xyz50);
    const lin = mul3(M_XYZ_TO_RGB, xyz65);
    return [
      linearToSrgb(Math.max(0, Math.min(1, lin[0]))),
      linearToSrgb(Math.max(0, Math.min(1, lin[1]))),
      linearToSrgb(Math.max(0, Math.min(1, lin[2]))),
    ];
  }

  function labD50ToSrgb8(L, a, b) {
    const f = labD50ToSrgbFloat(L, a, b);
    return [
      Math.round(f[0] * 255),
      Math.round(f[1] * 255),
      Math.round(f[2] * 255),
    ];
  }

  global.ColorSpace = {
    labD50ToXyzD50,
    labD50ToSrgbFloat,
    labD50ToSrgb8,
    linearToSrgb,
    srgbToLinear,
  };
})(window);
