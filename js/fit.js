// Colour transform fitting. Given pairs of (input RGB, target RGB) in
// [0, 1]³, fit a function f: R³ → R³ that maps the sampled chart values
// to the Rec.709 reference values.
//
// Two model families:
//
//   - Polynomial of degree 2 or 3 with ridge regularization (default).
//     Cheap, stable, behaves predictably outside the convex hull of the
//     samples (no wild oscillations).
//
//   - Thin-plate-style RBF (φ(r) = r in 3D) with a degree-1 polynomial
//     tail and Tikhonov regularization on the RBF weights. More flexible
//     than the polynomial for chart points that look non-smooth, but more
//     prone to overshooting at the boundaries.

(function (global) {
  // ---------- polynomial basis ----------

  // All monomials in (r, g, b) up to total degree d.
  // Returns a function basis(r, g, b) -> Float64Array of length N(d).
  function polynomialBasis(degree) {
    const exps = [];
    for (let i = 0; i <= degree; i++) {
      for (let j = 0; j + i <= degree; j++) {
        for (let k = 0; k + i + j <= degree; k++) {
          exps.push([i, j, k]);
        }
      }
    }
    const N = exps.length;
    return {
      size: N,
      evaluate(r, g, b) {
        const v = new Float64Array(N);
        for (let n = 0; n < N; n++) {
          const e = exps[n];
          v[n] = Math.pow(r, e[0]) * Math.pow(g, e[1]) * Math.pow(b, e[2]);
        }
        return v;
      },
    };
  }

  function fitPolynomial(samples, refs, degree, lambda) {
    const basis = polynomialBasis(degree);
    const M = samples.length;
    const N = basis.size;
    if (M < N) {
      throw new Error(`Need at least ${N} samples for degree-${degree} fit (have ${M}).`);
    }
    const X = new Array(M);
    for (let i = 0; i < M; i++) {
      const s = samples[i];
      X[i] = basis.evaluate(s[0], s[1], s[2]);
    }
    const wR = LinAlg.lsqRidge(X, refs.map(r => r[0]), lambda);
    const wG = LinAlg.lsqRidge(X, refs.map(r => r[1]), lambda);
    const wB = LinAlg.lsqRidge(X, refs.map(r => r[2]), lambda);
    return {
      kind: "poly",
      degree,
      evaluate(r, g, b) {
        const v = basis.evaluate(r, g, b);
        let R = 0, G = 0, B = 0;
        for (let n = 0; n < v.length; n++) {
          R += wR[n] * v[n];
          G += wG[n] * v[n];
          B += wB[n] * v[n];
        }
        return [R, G, B];
      },
    };
  }

  // ---------- thin-plate-style RBF ----------

  function dist(a, b) {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // φ(r) = r is the 3D analogue of the thin-plate kernel; smooth enough for
  // colour data and doesn't need a tunable scale parameter.
  function phi(r) { return r; }

  function fitTPS(samples, refs, lambda) {
    const n = samples.length;
    // System size: (n + 4) × (n + 4) (RBF weights + 4 polynomial terms).
    const dim = n + 4;
    const A = LinAlg.zeros(dim, dim);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        A[i][j] = phi(dist(samples[i], samples[j]));
      }
      // Tikhonov on the RBF block to damp overshoot.
      A[i][i] += lambda;
      A[i][n]     = 1;
      A[i][n + 1] = samples[i][0];
      A[i][n + 2] = samples[i][1];
      A[i][n + 3] = samples[i][2];
      A[n][i]     = 1;
      A[n + 1][i] = samples[i][0];
      A[n + 2][i] = samples[i][1];
      A[n + 3][i] = samples[i][2];
    }
    // Bottom-right 4×4 block stays zero.

    function solveChannel(target) {
      const rhs = new Float64Array(dim);
      for (let i = 0; i < n; i++) rhs[i] = target[i];
      return LinAlg.solve(A, rhs);
    }

    const wR = solveChannel(refs.map(r => r[0]));
    const wG = solveChannel(refs.map(r => r[1]));
    const wB = solveChannel(refs.map(r => r[2]));

    return {
      kind: "tps",
      evaluate(r, g, b) {
        let R = wR[n] + wR[n + 1] * r + wR[n + 2] * g + wR[n + 3] * b;
        let G = wG[n] + wG[n + 1] * r + wG[n + 2] * g + wG[n + 3] * b;
        let B = wB[n] + wB[n + 1] * r + wB[n + 2] * g + wB[n + 3] * b;
        for (let i = 0; i < n; i++) {
          const p = phi(dist([r, g, b], samples[i]));
          R += wR[i] * p;
          G += wG[i] * p;
          B += wB[i] * p;
        }
        return [R, G, B];
      },
    };
  }

  // ---------- public API ----------

  // samples: array of [r, g, b] in [0, 1]
  // refs:    array of [r, g, b] in [0, 1] (Rec.709 targets)
  // opts:    { model: "poly2" | "poly3" | "tps", lambda }
  function fit(samples, refs, opts) {
    const model = (opts && opts.model) || "poly3";
    const lambda = (opts && opts.lambda != null) ? opts.lambda : 0.001;
    if (samples.length !== refs.length) {
      throw new Error("samples / refs length mismatch");
    }
    switch (model) {
      case "poly2": return fitPolynomial(samples, refs, 2, lambda);
      case "poly3": return fitPolynomial(samples, refs, 3, lambda);
      case "tps":   return fitTPS(samples, refs, lambda);
      default: throw new Error("unknown fit model: " + model);
    }
  }

  // Per-patch residuals after fitting (in 8-bit ΔRGB for readability).
  function residuals(transform, samples, refs) {
    let sumSq = 0;
    let maxErr = 0;
    const per = samples.map((s, i) => {
      const out = transform.evaluate(s[0], s[1], s[2]);
      const dR = (out[0] - refs[i][0]) * 255;
      const dG = (out[1] - refs[i][1]) * 255;
      const dB = (out[2] - refs[i][2]) * 255;
      const e = Math.sqrt(dR * dR + dG * dG + dB * dB);
      sumSq += dR * dR + dG * dG + dB * dB;
      if (e > maxErr) maxErr = e;
      return e;
    });
    const rms = Math.sqrt(sumSq / samples.length);
    return { per, rms, max: maxErr };
  }

  global.ColorFit = { fit, residuals };
})(window);
