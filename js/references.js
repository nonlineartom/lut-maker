// Datacolor SpyderCheckr Photo (a.k.a. SpyderCheckr 48) reference values.
//
// The physical card is a hinged folder with two 4-column × 6-row panels.
//
//   - "Color" panel (right side when the folder is open flat):
//       Column 0 is a 6-step grayscale ramp from white (top) to black
//       (bottom). Columns 1–3 hold 18 saturated reference colours arranged
//       in three groups: RGB primaries, secondaries, and additional hues.
//       This is the side that corresponds to the older single-panel
//       SpyderCheckr 24.
//
//   - "Creative" panel (left side when open flat):
//       More pastel, skin-tone, and naturalistic colours intended for
//       portrait and photographic grading.
//
// The user samples ONE panel at a time. The chart layout selector below
// chooses which 24-patch set we use as the fitting target.
//
// sRGB / Rec.709 D65 8-bit values. Datacolor's exact reference numbers are
// printed on the card insert and vary slightly between production runs;
// these are best-effort approximations. Click any reference swatch in the
// UI to override a patch with the exact value from your card.
//
// All grids are stored row-major, top-to-bottom, left-to-right, in 4×6
// portrait orientation (matching how the card sits when the hinge runs
// vertically through the middle of the open folder).

(function (global) {

  // Color panel (right side). Column 0 = white→black grayscale ramp.
  const COLOR_PANEL_4x6 = [
    // Row 0
    [249, 242, 238], [  0, 127, 159], [222, 118,  32], [ 98, 187, 166],
    // Row 1
    [202, 198, 195], [192,  75, 145], [ 25,  55, 135], [133, 128, 177],
    // Row 2
    [161, 157, 154], [245, 205,   0], [195,  79,  95], [ 87, 108,  67],
    // Row 3
    [122, 118, 116], [186,  26,  51], [ 83,  58, 106], [ 72,  92, 168],
    // Row 4
    [ 80,  80,  78], [ 57, 146,  64], [157, 188,  64], [220, 178, 150],
    // Row 5
    [ 43,  41,  43], [ 58,  88, 159], [230, 162,  39], [140,  95,  60],
  ];

  // Creative panel (left side). More portrait/pastel set; best-effort
  // visual estimates from the printed card — override per-patch in the UI
  // if your card prints different reference values.
  const CREATIVE_PANEL_4x6 = [
    // Row 0
    [220, 130, 145], [175, 185, 195], [200, 180, 150], [235, 235, 230],
    // Row 1
    [230, 195,  75], [180, 205, 200], [195, 175, 130], [200, 200, 200],
    // Row 2
    [130, 185, 130], [170, 175, 180], [180, 140,  70], [170, 170, 175],
    // Row 3
    [100, 175, 200], [ 75,  50,  50], [110,  75,  45], [150, 150, 155],
    // Row 4
    [145, 175, 215], [ 50,  75,  65], [ 50,  40,  40], [110, 110, 120],
    // Row 5
    [195, 130, 195], [ 65,  50,  90], [ 35,  30,  30], [ 80,  80,  85],
  ];

  const LAYOUTS = {
    color: {
      cols: 4, rows: 6,
      patches: COLOR_PANEL_4x6,
      label: "Color panel (right side)",
      // Default corner placement, in image-relative coordinates (0..1):
      // bias to the right half of the frame.
      defaultRegion: [0.55, 0.10, 0.95, 0.92],
    },
    creative: {
      cols: 4, rows: 6,
      patches: CREATIVE_PANEL_4x6,
      label: "Creative panel (left side)",
      defaultRegion: [0.05, 0.10, 0.45, 0.92],
    },
  };

  function clonePatches(arr) {
    return arr.map(p => p.slice());
  }

  global.SpyderRefs = {
    LAYOUTS,
    getLayout(name) {
      const l = LAYOUTS[name] || LAYOUTS.color;
      return {
        cols: l.cols,
        rows: l.rows,
        patches: clonePatches(l.patches),
        label: l.label,
        defaultRegion: l.defaultRegion.slice(),
      };
    },
  };
})(window);
