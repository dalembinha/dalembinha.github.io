(function () {
  const pageType = document.body.dataset.pageType;
  const pageSlug = document.body.dataset.pageSlug;

  if (pageType === "listing" && pageSlug === "musicas") {
    const listShell = document.querySelector(".tab-directory-shell");
    const listButtons = Array.from(document.querySelectorAll("[data-list-column-count]"));
    let listColumns = Number(listShell?.dataset.defaultListColumns || 2);

    function updateListButtons() {
      listButtons.forEach(function (button) {
        button.classList.toggle(
          "is-active",
          Number(button.dataset.listColumnCount) === listColumns
        );
      });
    }

    function updateListColumns() {
      if (!listShell) {
        return;
      }
      listShell.style.setProperty("--list-columns", String(listColumns));
      updateListButtons();
    }

    listButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        listColumns = Number(button.dataset.listColumnCount);
        updateListColumns();
      });
    });

    updateListColumns();
  }

  if (pageType !== "tab") {
    return;
  }

  const chordColorButtons = Array.from(document.querySelectorAll("[data-chord-color]"));
  const chords = Array.from(document.querySelectorAll(".chord"));
  const preBlocks = Array.from(document.querySelectorAll(".tab-sheet"));
  const chordThemes = {
    blue: "#1f5fbf",
    terracotta: "#b85c38",
    olive: "#5d7758"
  };
  const chordColorStorageKey = "misc-site-chord-color";
  let chordColor = localStorage.getItem(chordColorStorageKey) || "blue";

  function updateChordColor() {
    const nextColor = chordThemes[chordColor] || chordThemes.blue;
    document.documentElement.style.setProperty("--chord-color", nextColor);
    chordColorButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.chordColor === chordColor);
    });
  }

  chordColorButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      chordColor = button.dataset.chordColor;
      localStorage.setItem(chordColorStorageKey, chordColor);
      updateChordColor();
    });
  });

  updateChordColor();

  if (!chords.length) {
    return;
  }

  const notes = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const aliases = { Db: "C#", "D#": "Eb", Gb: "F#", "G#": "Ab", "A#": "Bb" };
  const baseChordRegex = /^([A-G](?:#|b)?)/;
  const originalChords = chords.map((chord) => chord.textContent);
  const keyLabel = document.querySelector("[data-current-key]");

  function normalize(note) {
    return aliases[note] || note;
  }

  function initialKey() {
    const match = originalChords[0].match(baseChordRegex);
    if (!match) {
      return "C";
    }
    return normalize(match[1]);
  }

  const initialIndex = Math.max(notes.indexOf(initialKey()), 0);
  let toneOffset = 0;
  let fontSize = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--mono-size")
  );

  function transposeChord(chord, offset) {
    return chord.replace(baseChordRegex, function (_, base) {
      const normalized = normalize(base);
      const idx = notes.indexOf(normalized);
      if (idx === -1) {
        return base;
      }
      return notes[(idx + offset + notes.length) % notes.length];
    });
  }

  function updateToneLabel() {
    const nextKey = notes[(initialIndex + toneOffset + notes.length) % notes.length];
    keyLabel.textContent = nextKey;
  }

  function updateChords() {
    chords.forEach(function (chord, index) {
      chord.textContent = transposeChord(originalChords[index], toneOffset);
    });
  }

  function updateFontSize() {
    preBlocks.forEach(function (block) {
      block.style.fontSize = fontSize + "px";
    });
  }

  document.querySelectorAll("[data-tone-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      toneOffset += Number(button.dataset.toneStep);
      updateChords();
      updateToneLabel();
    });
  });

  document.querySelectorAll("[data-font-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      const nextSize = fontSize + Number(button.dataset.fontStep);
      fontSize = Math.min(28, Math.max(12, nextSize));
      updateFontSize();
    });
  });

  updateToneLabel();
})();
