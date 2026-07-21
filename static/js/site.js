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

  const tabPage = document.querySelector(".page-tab");
  const chords = Array.from(document.querySelectorAll(".chord"));
  const preBlocks = Array.from(document.querySelectorAll(".tab-sheet"));
  const sharpNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flatNotes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const notePitch = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
  };
  const flatKeyPitches = new Set([1, 3, 5, 8, 10]);
  const scaleIntervals = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
  };
  const degreeLabels = {
    major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    minor: ["i", "ii°", "bIII", "iv", "v", "bVI", "bVII"]
  };
  const scaleChordSuffixes = {
    major: ["7M", "m7", "m7", "7M", "7", "m7", "m7(b5)"],
    minor: ["m7", "m7(b5)", "7M", "m7", "m7", "7M", "7"]
  };
  const baseChordRegex = /^([A-G](?:#|b)?)/;
  const originalChords = chords.map((chord) => chord.textContent);
  const keyLabel = document.querySelector("[data-current-key]");
  const analysisToggle = document.querySelector("[data-harmonic-toggle]");
  const analysisPanel = document.querySelector("[data-harmonic-panel]");
  const analysisKeySelect = document.querySelector("[data-analysis-key]");
  const analysisModeSelect = document.querySelector("[data-analysis-mode]");
  const analysisSummary = document.querySelector("[data-harmonic-summary]");
  const scaleNotesContainer = document.querySelector("[data-scale-notes]");
  const harmonicTableBody = document.querySelector("[data-harmonic-table]");

  const declaredKey = tabPage?.dataset.harmonicKey || originalChords[0]?.match(baseChordRegex)?.[1] || "C";
  let analysisRoot = notePitch[declaredKey] ?? 0;
  let analysisMode = tabPage?.dataset.harmonicMode === "minor" ? "minor" : "major";
  let preferFlats = declaredKey.includes("b") || flatKeyPitches.has(analysisRoot);

  function pitchName(pitch) {
    const names = preferFlats ? flatNotes : sharpNotes;
    return names[(pitch + 12) % 12];
  }

  function fillKeySelect() {
    if (!analysisKeySelect) {
      return;
    }
    analysisKeySelect.innerHTML = flatNotes.map(function (name, pitch) {
      const sharpName = sharpNotes[pitch];
      const label = name === sharpName ? name : name + " / " + sharpName;
      return '<option value="' + pitch + '">' + label + "</option>";
    }).join("");
    analysisKeySelect.value = String(analysisRoot);
  }

  let toneOffset = 0;
  let fontSize = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--mono-size")
  );

  function transposeChord(chord, offset) {
    const transposedRoot = chord.replace(baseChordRegex, function (_, base) {
      const pitch = notePitch[base];
      if (pitch === undefined) {
        return base;
      }
      return pitchName(pitch + offset);
    });
    return transposedRoot.replace(/\/([A-G](?:#|b)?)/g, function (_, bass) {
      const pitch = notePitch[bass];
      return pitch === undefined ? "/" + bass : "/" + pitchName(pitch + offset);
    });
  }

  function updateToneLabel() {
    if (keyLabel) {
      keyLabel.textContent = pitchName(analysisRoot);
    }
  }

  function updateChords() {
    chords.forEach(function (chord, index) {
      chord.textContent = transposeChord(originalChords[index], toneOffset);
    });
    classifyChords();
  }

  function updateFontSize() {
    preBlocks.forEach(function (block) {
      block.style.fontSize = fontSize + "px";
    });
  }

  function chordPitchClasses(chordText) {
    const rootMatch = chordText.match(baseChordRegex);
    if (!rootMatch) {
      return [];
    }
    const root = notePitch[rootMatch[1]];
    const suffix = chordText.slice(rootMatch[0].length);
    const lowered = suffix.toLowerCase();
    let intervals;
    if (/(dim|º|°)/i.test(suffix)) {
      intervals = [0, 3, 6];
    } else if (/m7(?:\(b5\)|\/5-)/i.test(suffix)) {
      intervals = [0, 3, 6, 10];
    } else if (/aug|\+/.test(lowered) && !/7\+|9\+|11\+|13\+/.test(lowered)) {
      intervals = [0, 4, 8];
    } else if (/sus2/.test(lowered)) {
      intervals = [0, 2, 7];
    } else if (/sus4|7\/4/.test(lowered)) {
      intervals = [0, 5, 7];
    } else if (/^m(?!aj)/.test(lowered)) {
      intervals = [0, 3, 7];
    } else if (/^5(?:\/|$)/.test(lowered)) {
      intervals = [0, 7];
    } else {
      intervals = [0, 4, 7];
    }

    if (/(dim7|º7|°7)/i.test(suffix)) {
      intervals.push(9);
    } else if (/(7M|M7|maj7|7\+)/i.test(suffix)) {
      intervals.push(11);
    } else if (/7/.test(suffix) && !/7\/4/.test(suffix)) {
      intervals.push(10);
    } else if (/(^|[^0-9])6([^0-9]|$)/.test(suffix)) {
      intervals.push(9);
    }
    if (/(b9|9-)/i.test(suffix)) intervals.push(1);
    else if (/(#9|9\+)/i.test(suffix)) intervals.push(3);
    else if (/9/.test(suffix)) intervals.push(2);
    if (/(#11|11\+)/i.test(suffix)) intervals.push(6);
    else if (/11/.test(suffix)) intervals.push(5);
    if (/(b13|13-)/i.test(suffix)) intervals.push(8);
    else if (/13/.test(suffix)) intervals.push(9);

    const slashMatch = suffix.match(/\/([A-G](?:#|b)?)(?:$|\/)/);
    if (slashMatch && notePitch[slashMatch[1]] !== undefined) {
      intervals.push((notePitch[slashMatch[1]] - root + 12) % 12);
    }
    return Array.from(new Set(intervals.map((interval) => (root + interval) % 12)));
  }

  function currentScale() {
    return scaleIntervals[analysisMode].map((interval) => (analysisRoot + interval) % 12);
  }

  function classifyChords() {
    const scale = new Set(currentScale());
    chords.forEach(function (chord) {
      const pitches = chordPitchClasses(chord.textContent);
      const isDiatonic = pitches.length > 0 && pitches.every((pitch) => scale.has(pitch));
      chord.classList.toggle("is-diatonic", isDiatonic);
      chord.classList.toggle("is-outside", !isDiatonic);
      chord.title = isDiatonic ? "Acorde pertencente à escala" : "Acorde fora da escala";
    });
  }

  function renderAnalysis() {
    const scale = currentScale();
    const modeName = analysisMode === "minor" ? "menor natural" : "maior";
    if (analysisSummary) {
      const sourceText = tabPage?.dataset.harmonicKeySource === "declared" ? "informada no arquivo" : "estimada pelas cifras";
      analysisSummary.textContent = "Escala de " + pitchName(analysisRoot) + " " + modeName + " (" + sourceText + ").";
    }
    if (scaleNotesContainer) {
      scaleNotesContainer.innerHTML = scale.map(function (pitch, index) {
        return '<span class="scale-note">' + degreeLabels[analysisMode][index] + " · " + pitchName(pitch) + "</span>";
      }).join("");
    }
    if (harmonicTableBody) {
      harmonicTableBody.innerHTML = scale.map(function (target, index) {
        const dominant = target + 7;
        const substitute = target + 1;
        const substituteTwo = substitute + 7;
        const diminished = target - 1;
        return "<tr>" +
          "<td>" + degreeLabels[analysisMode][index] + "</td>" +
          "<td>" + pitchName(target) + "</td>" +
          "<td>" + pitchName(target) + scaleChordSuffixes[analysisMode][index] + "</td>" +
          "<td>" + pitchName(dominant) + "7</td>" +
          "<td>" + pitchName(substitute) + "7</td>" +
          "<td>" + pitchName(substituteTwo) + "m7</td>" +
          "<td>" + pitchName(diminished) + "°7</td>" +
          "</tr>";
      }).join("");
    }
    if (analysisKeySelect) analysisKeySelect.value = String(analysisRoot);
    if (analysisModeSelect) analysisModeSelect.value = analysisMode;
    updateToneLabel();
    classifyChords();
  }

  analysisToggle?.addEventListener("click", function () {
    const willOpen = analysisPanel.hidden;
    analysisPanel.hidden = !willOpen;
    analysisToggle.setAttribute("aria-expanded", String(willOpen));
    analysisToggle.classList.toggle("is-active", willOpen);
    tabPage?.classList.toggle("is-analysis-visible", willOpen);
    if (willOpen) renderAnalysis();
  });

  analysisKeySelect?.addEventListener("change", function () {
    analysisRoot = Number(analysisKeySelect.value);
    toneOffset = analysisRoot - (notePitch[declaredKey] ?? 0);
    preferFlats = flatKeyPitches.has(analysisRoot);
    updateChords();
    renderAnalysis();
  });

  analysisModeSelect?.addEventListener("change", function () {
    analysisMode = analysisModeSelect.value === "minor" ? "minor" : "major";
    renderAnalysis();
  });

  document.querySelectorAll("[data-tone-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      toneOffset += Number(button.dataset.toneStep);
      analysisRoot = (analysisRoot + Number(button.dataset.toneStep) + 12) % 12;
      preferFlats = flatKeyPitches.has(analysisRoot);
      updateChords();
      updateToneLabel();
      renderAnalysis();
    });
  });

  document.querySelectorAll("[data-font-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      const nextSize = fontSize + Number(button.dataset.fontStep);
      fontSize = Math.min(28, Math.max(12, nextSize));
      updateFontSize();
    });
  });

  fillKeySelect();
  renderAnalysis();
})();
