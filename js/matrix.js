// Minimal linear-algebra helpers used by the colour fitter.
// Square systems only; Gaussian elimination with partial pivoting.

(function (global) {
  function zeros(n, m) {
    const A = new Array(n);
    for (let i = 0; i < n; i++) A[i] = new Float64Array(m);
    return A;
  }

  // Solve A x = b in place. A is n×n (array of Float64Array), b is length n.
  // Returns x (length n). Throws if singular.
  function solve(A, b) {
    const n = A.length;
    // Copy into augmented matrix so caller's data is preserved.
    const M = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Float64Array(n + 1);
      for (let j = 0; j < n; j++) row[j] = A[i][j];
      row[n] = b[i];
      M[i] = row;
    }

    for (let k = 0; k < n; k++) {
      // Partial pivot.
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(M[i][k]);
        if (v > maxVal) { maxVal = v; maxRow = i; }
      }
      if (maxVal < 1e-14) {
        throw new Error("Singular matrix in linear solve");
      }
      if (maxRow !== k) {
        const tmp = M[k]; M[k] = M[maxRow]; M[maxRow] = tmp;
      }
      // Eliminate below.
      const pivot = M[k][k];
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / pivot;
        if (f === 0) continue;
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
      }
    }

    // Back-substitute.
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // Solve a regularized least-squares problem:
  //     min ||X w - y||² + λ ||w||²
  // via the normal equations (Xᵀ X + λ I) w = Xᵀ y.
  // X is M×N (array of Float64Array), y is length M, lambda ≥ 0.
  function lsqRidge(X, y, lambda) {
    const M = X.length;
    const N = X[0].length;
    const XtX = zeros(N, N);
    const Xty = new Float64Array(N);
    for (let i = 0; i < M; i++) {
      const row = X[i];
      const yi = y[i];
      for (let a = 0; a < N; a++) {
        const ra = row[a];
        Xty[a] += ra * yi;
        for (let b = a; b < N; b++) {
          XtX[a][b] += ra * row[b];
        }
      }
    }
    // Mirror upper to lower and add λI.
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) XtX[b][a] = XtX[a][b];
      XtX[a][a] += lambda;
    }
    return solve(XtX, Xty);
  }

  global.LinAlg = { zeros, solve, lsqRidge };
})(window);
