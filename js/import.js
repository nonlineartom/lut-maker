// Import-references modal controller.
//
// The user pastes 24 patch values (either sRGB 0–255 or CIE Lab D50) and
// the active panel's references are overwritten with the parsed values.
// All parsing lives in SpyderRefs.parsePastedRefs.

(function (global) {
  const modal     = document.getElementById("import-modal");
  const closeBtn  = document.getElementById("import-close");
  const cancelBtn = document.getElementById("import-cancel");
  const applyBtn  = document.getElementById("import-apply");
  const formatSel = document.getElementById("import-format");
  const textArea  = document.getElementById("import-text");
  const feedback  = document.getElementById("import-feedback");
  const panelName = document.getElementById("import-panel-name");

  let onApplyCallback = null;

  function open(opts) {
    // opts: { layoutName, label, expectedCount, onApply }
    panelName.textContent = opts.label || opts.layoutName;
    onApplyCallback = opts.onApply;
    feedback.textContent = "";
    feedback.classList.remove("bad", "good");
    textArea.dataset.expected = String(opts.expectedCount);
    textArea.dataset.layout = opts.layoutName;
    modal.hidden = false;
    setTimeout(() => textArea.focus(), 0);
  }
  function close() {
    modal.hidden = true;
    onApplyCallback = null;
  }

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  document.addEventListener("keydown", e => {
    if (!modal.hidden && e.key === "Escape") close();
  });

  applyBtn.addEventListener("click", () => {
    const expected = parseInt(textArea.dataset.expected, 10) || 24;
    const layoutName = textArea.dataset.layout;
    const format = formatSel.value;
    try {
      const parsed = SpyderRefs.parsePastedRefs(textArea.value, format, expected);
      SpyderRefs.setLayoutPatches(layoutName, parsed);
      feedback.textContent = `Imported ${parsed.patches.length} patches.`;
      feedback.classList.add("good");
      feedback.classList.remove("bad");
      if (onApplyCallback) onApplyCallback(parsed);
      setTimeout(close, 350);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add("bad");
      feedback.classList.remove("good");
    }
  });

  global.ImportDialog = { open, close };
})(window);
