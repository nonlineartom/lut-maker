// Datacolor SpyderCheckr Photo reference colour data.
//
// Source: visual reading of the Datacolor application's reference-swatch
// display (the swatches the Datacolor app itself uses for chart alignment).
// The app displays the chart rotated 180° from the physical card's
// standard reading orientation, so the values below have been rotated
// 180° to match the layout the user sees when sampling a photo of the
// physical card (column 0 = white→black grayscale ramp, top-to-bottom).
//
// These are read by eye from a screenshot and are accurate to roughly
// ±5 per channel at 8-bit. For colorimetrically precise work, use the
// "Import reference values…" button to paste the exact values printed on
// your card's insert sheet or pulled from Datacolor's CGATS spec file.
// Import accepts both sRGB 0–255 and CIE Lab D50 triplets.

(function (global) {

  // Color panel (right side of the open folder).
  // 4 cols × 6 rows, row-major top-to-bottom, left-to-right.
  // Column 0 is the grayscale ramp; cols 1–3 are 18 colour patches.
  const COLOR_PANEL_SRGB = [
    // Row 0
    [245, 245, 240], [ 55, 130, 175], [220, 130,  50], [170, 215, 200],
    // Row 1
    [215, 215, 215], [200, 105, 165], [ 75, 100, 175], [140, 135, 175],
    // Row 2
    [195, 195, 195], [220, 215,  80], [190, 130, 135], [100, 120,  90],
    // Row 3
    [150, 150, 150], [200,  65,  65], [ 95,  80, 130], [125, 150, 175],
    // Row 4
    [115, 115, 115], [100, 175,  95], [195, 200,  85], [225, 195, 175],
    // Row 5
    [ 60,  60,  60], [ 60,  80, 165], [200, 165,  65], [108,  75,  55],
  ];

  // Creative panel (left side of the open folder). Pastel / portrait /
  // skin-tone set.
  const CREATIVE_PANEL_SRGB = [
    // Row 0
    [220, 160, 150], [220, 215, 215], [225, 205, 180], [235, 230, 220],
    // Row 1
    [220, 195, 105], [215, 220, 210], [200, 180, 145], [225, 220, 200],
    // Row 2
    [170, 215, 165], [220, 220, 215], [200, 170, 110], [195, 195, 195],
    // Row 3
    [160, 195, 215], [ 98,  98, 100], [160, 125,  75], [150, 150, 150],
    // Row 4
    [175, 180, 215], [ 95, 110, 100], [118,  95,  70], [118, 118, 118],
    // Row 5
    [225, 185, 220], [ 88,  88, 105], [ 78,  78,  78], [ 65,  65,  65],
  ];

  function clonePatches(arr) { return arr.map(p => p.slice()); }

  const LAYOUTS = {
    color: {
      cols: 4, rows: 6,
      label: "Color (right side)",
      patches: clonePatches(COLOR_PANEL_SRGB),
      defaultRegion: [0.55, 0.10, 0.95, 0.92],
    },
    creative: {
      cols: 4, rows: 6,
      label: "Creative (left side)",
      patches: clonePatches(CREATIVE_PANEL_SRGB),
      defaultRegion: [0.05, 0.10, 0.45, 0.92],
    },
  };

  // Parse a pasted block of reference values. Accepted formats:
  //   - "L, a, b" per line (CIE Lab D50)       — when format = "lab50"
  //   - "R, G, B" per line (sRGB 0–255 or 0–1) — when format = "srgb"
  // Comma, whitespace, semicolon, or tab delimiters all work; blank lines
  // and lines starting with # or // are skipped.
  function parsePastedRefs(text, format, expectedCount) {
    const lines = text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("#") && !s.startsWith("//"));
    const parsed = lines.map(line => {
      const nums = line.split(/[\s,;\t]+/).filter(Boolean).map(Number);
      if (nums.length < 3 || nums.some(n => !isFinite(n))) {
        throw new Error(`Could not parse line: "${line}"`);
      }
      return nums.slice(0, 3);
    });
    if (parsed.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} patches but got ${parsed.length}.`);
    }
    if (format === "lab50") {
      return {
        labD50: parsed,
        patches: parsed.map(([L, a, b]) => ColorSpace.labD50ToSrgb8(L, a, b)),
      };
    }
    const looksFloat = parsed.every(p => p.every(v => v >= 0 && v <= 1.0001));
    return {
      labD50: null,
      patches: parsed.map(p => p.map(v => {
        const u = looksFloat ? v * 255 : v;
        return Math.max(0, Math.min(255, Math.round(u)));
      })),
    };
  }

  global.SpyderRefs = {
    LAYOUTS,
    getLayout(name) {
      const l = LAYOUTS[name] || LAYOUTS.color;
      return {
        cols: l.cols, rows: l.rows, label: l.label,
        patches: clonePatches(l.patches),
        defaultRegion: l.defaultRegion.slice(),
      };
    },
    parsePastedRefs,
    setLayoutPatches(name, parsed) {
      const l = LAYOUTS[name];
      if (!l) return;
      l.patches = parsed.patches.map(p => p.slice());
    },
  };
})(window);
