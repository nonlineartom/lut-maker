// SpyderCheckr 24 reference patch values.
//
// Values are 8-bit sRGB / Rec.709 (D65). The two layouts below describe
// the same 24 patches in two physical orientations of the card:
//   - landscape: 6 columns × 4 rows  (long edge horizontal)
//   - portrait:  4 columns × 6 rows  (long edge vertical)
//
// The portrait layout is the landscape layout rotated 90° counter-clockwise,
// so the same 24 reference colours appear in both — only the grid shape and
// patch ordering changes.
//
// These are commonly cited Datacolor SpyderCheckr 24 sRGB targets; the user
// can edit any patch in the UI if their card prints with slightly different
// reference values.

(function (global) {
  // Landscape layout, row-major, top-left → bottom-right.
  // Row A (top): warm portraits / saturated row.
  // Row D (bottom): grayscale ramp, light → dark.
  const LANDSCAPE_24 = [
    // Row A — saturated / portrait reds & oranges
    [ 98,  66,  56], [144, 105,  86], [187, 144, 120], [220, 178, 150], [212, 168, 158], [188, 134, 132],
    // Row B — secondaries
    [ 80, 110,  65], [ 99, 154,  74], [ 76, 105, 142], [ 84, 138, 178], [ 64,  87, 132], [ 73,  58, 102],
    // Row C — bright primaries / accent colours
    [186,  61,  62], [219, 121,  44], [231, 199,  52], [102, 152,  70], [ 92, 102, 173], [194,  79, 137],
    // Row D — grayscale ramp (light → dark)
    [243, 242, 237], [201, 201, 201], [161, 161, 161], [122, 122, 122], [ 82,  82,  82], [ 46,  46,  46],
  ];

  function rotateCCW(grid, cols, rows) {
    // grid is rows*cols entries, row-major; rotate 90° CCW to (cols * rows).
    const newRows = cols;
    const newCols = rows;
    const out = new Array(newRows * newCols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nr = cols - 1 - c;
        const nc = r;
        out[nr * newCols + nc] = grid[r * cols + c];
      }
    }
    return out;
  }

  const PORTRAIT_24 = rotateCCW(LANDSCAPE_24, 6, 4);

  const LAYOUTS = {
    landscape: { cols: 6, rows: 4, patches: LANDSCAPE_24 },
    portrait:  { cols: 4, rows: 6, patches: PORTRAIT_24  },
  };

  function clonePatches(arr) {
    return arr.map(p => p.slice());
  }

  global.SpyderRefs = {
    LAYOUTS,
    getLayout(name) {
      const l = LAYOUTS[name] || LAYOUTS.landscape;
      return { cols: l.cols, rows: l.rows, patches: clonePatches(l.patches) };
    },
  };
})(window);
