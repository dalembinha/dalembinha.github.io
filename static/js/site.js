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
  const chromaticDegreeLabels = [
    "I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"
  ];
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
  const chordDiagramsContainer = document.querySelector("[data-chord-diagrams]");
  const directKeyLabel = document.querySelector("[data-direct-key]");
  const keySignature = document.querySelector("[data-key-signature]");
  const keySignatureAccidentals = document.querySelector("[data-key-signature-accidentals]");
  const guitarTuning = [4, 9, 2, 7, 11, 4];
  const guitarStringNames = ["E grave", "A", "D", "G", "B", "E agudo"];

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
    const directKey = pitchName(analysisRoot) + (analysisMode === "minor" ? "m" : "");
    if (keyLabel) {
      keyLabel.textContent = directKey;
    }
    if (directKeyLabel) directKeyLabel.textContent = directKey;
  }

  function keySignatureCount() {
    const majorSignatures = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
    const minorSignatures = [-3, 4, -1, -6, 1, -4, 3, -2, -7, 0, -5, 2];
    return (analysisMode === "minor" ? minorSignatures : majorSignatures)[analysisRoot];
  }

  function renderKeySignature() {
    const directKey = pitchName(analysisRoot) + (analysisMode === "minor" ? "m" : "");
    const count = keySignatureCount();
    const symbol = count >= 0 ? "♯" : "♭";
    const positions = count >= 0
      ? [16, 34, 10, 28, 46, 22, 40]
      : [40, 22, 46, 28, 52, 34, 58];
    if (keySignatureAccidentals) {
      keySignatureAccidentals.innerHTML = positions.slice(0, Math.abs(count)).map(function (top, index) {
        return '<span class="key-signature-accidental" style="--accidental-index:' + index +
          ";--accidental-top:" + top + 'px">' + symbol + "</span>";
      }).join("");
    }
    if (keySignature) {
      const accidentalDescription = count === 0
        ? "sem acidentes"
        : Math.abs(count) + (count > 0 ? " sustenido" : " bemol") + (Math.abs(count) > 1 ? "s" : "");
      keySignature.setAttribute(
        "aria-label",
        "Tom " + directKey + " em clave de sol, " + accidentalDescription
      );
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

  function hasMajorSeventh(suffix) {
    return /(7M|M7|7\+)/.test(suffix) || /maj7/i.test(suffix);
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
    } else if (hasMajorSeventh(suffix)) {
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

  function chordBassPitch(chordText) {
    const slashBass = chordText.match(/\/([A-G](?:#|b)?)(?:$|(?=\/))/);
    if (slashBass && notePitch[slashBass[1]] !== undefined) {
      return notePitch[slashBass[1]];
    }
    const root = chordText.match(baseChordRegex);
    return root ? notePitch[root[1]] : null;
  }

  function evaluateGuitarVoicing(frets, targetPitches, rootPitch, bassPitch) {
    const played = frets
      .map(function (fret, stringIndex) {
        return fret < 0 ? null : {
          fret: fret,
          stringIndex: stringIndex,
          pitch: (guitarTuning[stringIndex] + fret) % 12
        };
      })
      .filter(Boolean);
    if (played.length < 3) {
      return null;
    }

    const fretted = played.filter(function (item) { return item.fret > 0; });
    const positiveFrets = fretted.map(function (item) { return item.fret; });
    const minFret = positiveFrets.length ? Math.min.apply(null, positiveFrets) : 0;
    const maxFret = positiveFrets.length ? Math.max.apply(null, positiveFrets) : 0;
    if (maxFret - minFret > 3) {
      return null;
    }
    if (played.some(function (item) { return item.fret === 0; }) && maxFret > 4) {
      return null;
    }

    const covered = new Set(played.map(function (item) { return item.pitch; }));
    const firstPlayed = played[0];
    const firstString = firstPlayed.stringIndex;
    const lastString = played[played.length - 1].stringIndex;
    const interiorMutes = frets.slice(firstString, lastString + 1).filter(function (fret) {
      return fret < 0;
    }).length;
    let score = covered.size * 26 + played.length * 4;
    score -= (targetPitches.length - covered.size) * 18;
    score += covered.has(rootPitch) ? 14 : -20;
    score += firstPlayed.pitch === bassPitch ? 38 : -14;
    score -= frets.filter(function (fret) { return fret < 0; }).length * 2;
    score -= interiorMutes * 9;
    score -= minFret * 0.7;
    score -= positiveFrets.reduce(function (total, fret) { return total + fret; }, 0) * 0.08;
    if (covered.size === targetPitches.length) score += 24;
    if (played.some(function (item) { return item.fret === 0; })) score += 5;
    return score;
  }

  function generateGuitarVoicing(chordText) {
    const targetPitches = chordPitchClasses(chordText);
    const rootMatch = chordText.match(baseChordRegex);
    if (!targetPitches.length || !rootMatch) {
      return [-1, -1, -1, -1, -1, -1];
    }
    const targetSet = new Set(targetPitches);
    const rootPitch = notePitch[rootMatch[1]];
    const bassPitch = chordBassPitch(chordText) ?? rootPitch;
    let best = null;
    const seen = new Set();

    for (let baseFret = 1; baseFret <= 12; baseFret += 1) {
      const optionsByString = guitarTuning.map(function (openPitch) {
        const options = [-1];
        if (targetSet.has(openPitch)) options.push(0);
        for (let fret = baseFret; fret < baseFret + 4; fret += 1) {
          if (targetSet.has((openPitch + fret) % 12)) options.push(fret);
        }
        return Array.from(new Set(options));
      });
      const frets = new Array(6).fill(-1);

      function searchString(stringIndex) {
        if (stringIndex === 6) {
          const key = frets.join(",");
          if (seen.has(key)) return;
          seen.add(key);
          const score = evaluateGuitarVoicing(frets, targetPitches, rootPitch, bassPitch);
          if (score !== null && (!best || score > best.score)) {
            best = { score: score, frets: frets.slice() };
          }
          return;
        }
        optionsByString[stringIndex].forEach(function (fret) {
          frets[stringIndex] = fret;
          searchString(stringIndex + 1);
        });
      }

      searchString(0);
    }
    return best ? best.frets : [-1, -1, -1, -1, -1, -1];
  }

  function escapeMarkup(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function guitarDiagramMarkup(chordText) {
    const frets = generateGuitarVoicing(chordText);
    const positiveFrets = frets.filter(function (fret) { return fret > 0; });
    const minFret = positiveFrets.length ? Math.min.apply(null, positiveFrets) : 1;
    const hasOpenString = frets.some(function (fret) { return fret === 0; });
    const baseFret = hasOpenString || minFret <= 1 ? 1 : minFret;
    const colorClass = isChordDiatonic(chordText) ? "is-diatonic" : "is-outside";
    const escapedChord = escapeMarkup(chordText);
    const openMarkers = frets.map(function (fret) {
      return '<span aria-hidden="true">' + (fret < 0 ? "×" : fret === 0 ? "○" : "") + "</span>";
    }).join("");
    const strings = guitarTuning.map(function (_, index) {
      return '<i class="guitar-string" style="--string-index:' + index + '" aria-hidden="true"></i>';
    }).join("");
    const fretLines = [0, 1, 2, 3, 4].map(function (index) {
      return '<i class="guitar-fret' + (index === 0 ? " is-nut" : "") +
        '" style="--fret-index:' + index + '" aria-hidden="true"></i>';
    }).join("");
    const dots = frets.map(function (fret, stringIndex) {
      if (fret <= 0) return "";
      const relativeFret = fret - baseFret + 1;
      return '<i class="guitar-dot" style="--string-index:' + stringIndex +
        ";--fret-index:" + relativeFret + '" aria-hidden="true"></i>';
    }).join("");
    const positionLabel = baseFret > 1
      ? '<span class="guitar-position">' + baseFret + "ª</span>"
      : "";
    const description = frets.map(function (fret, index) {
      const state = fret < 0 ? "não tocar" : fret === 0 ? "solta" : "casa " + fret;
      return guitarStringNames[index] + ": " + state;
    }).join("; ");

    return '<figure class="guitar-chord-card" data-chord-name="' + escapedChord +
      '" data-frets="' + frets.join(",") + '">' +
      '<figcaption><span class="diagram-chord-name ' + colorClass + '">' + escapedChord + "</span>" +
      '<span class="diagram-degree">' + escapeMarkup(chordDegree(chordText)) + "</span></figcaption>" +
      '<div class="guitar-diagram" role="img" aria-label="' + escapedChord + ". " + escapeMarkup(description) + '">' +
      '<div class="guitar-open-markers">' + openMarkers + "</div>" +
      '<div class="guitar-neck' + (baseFret === 1 ? " is-first-position" : "") + '">' +
      positionLabel + strings + fretLines + dots +
      "</div></div></figure>";
  }

  function renderChordDiagrams() {
    if (!chordDiagramsContainer) return;
    const uniqueChords = [];
    const seen = new Set();
    chords.forEach(function (chord) {
      const chordText = chord.textContent.trim();
      if (chordText && !seen.has(chordText)) {
        seen.add(chordText);
        uniqueChords.push(chordText);
      }
    });
    chordDiagramsContainer.innerHTML = uniqueChords.map(guitarDiagramMarkup).join("");
  }

  function currentScale() {
    return scaleIntervals[analysisMode].map((interval) => (analysisRoot + interval) % 12);
  }

  function isChordDiatonic(chordText) {
    const scale = new Set(currentScale());
    const pitches = chordPitchClasses(chordText);
    return pitches.length > 0 && pitches.every((pitch) => scale.has(pitch));
  }

  function harmonicChordMarkup(chordText, isScaleChord) {
    const colorClass = isChordDiatonic(chordText) ? "is-diatonic" : "is-outside";
    const weightClass = isScaleChord ? " is-scale-chord" : "";
    return '<span class="harmonic-table-chord ' + colorClass + weightClass + '">' + chordText + "</span>";
  }

  function harmonicProgressionMarkup(firstChord, secondChord) {
    return harmonicChordMarkup(firstChord, false) +
      '<span class="harmonic-progression-separator"> – </span>' +
      harmonicChordMarkup(secondChord, false);
  }

  function chordDegree(chordText) {
    const rootMatch = chordText.match(baseChordRegex);
    if (!rootMatch) {
      return "—";
    }
    const root = notePitch[rootMatch[1]];
    const suffix = chordText.slice(rootMatch[0].length);
    const lowered = suffix.toLowerCase();
    const interval = (root - analysisRoot + 12) % 12;
    let degree = chromaticDegreeLabels[interval];
    const isHalfDiminished = /m7(?:\(b5\)|\/5-)/i.test(suffix);
    const isDiminished = isHalfDiminished || /(dim|º|°)/i.test(suffix);
    const isMinor = !isDiminished && /^m(?!aj)/.test(lowered);

    if (isMinor || isDiminished) {
      degree = degree.replace(/[IV]+/, function (roman) {
        return roman.toLowerCase();
      });
    }
    if (isHalfDiminished) {
      return degree + "ø7";
    }
    if (isDiminished) {
      return degree + (/(dim7|º7|°7)/i.test(suffix) ? "°7" : "°");
    }
    if (hasMajorSeventh(suffix)) {
      return degree + "7M";
    }
    if (/7/.test(suffix)) {
      return degree + "7";
    }
    if (/(^|[^0-9])6([^0-9]|$)/.test(suffix)) {
      return degree + "6";
    }
    return degree;
  }

  function classifyChords() {
    chords.forEach(function (chord) {
      const isDiatonic = isChordDiatonic(chord.textContent);
      const degree = chordDegree(chord.textContent);
      chord.classList.toggle("is-diatonic", isDiatonic);
      chord.classList.toggle("is-outside", !isDiatonic);
      chord.dataset.harmonicDegree = degree;
      chord.title = "Grau " + degree + " · " + (isDiatonic ? "acorde pertencente à escala" : "acorde fora da escala");
    });
  }

  let degreeSpacingFrame = 0;

  function measureDegreeBadge(chord) {
    const degree = chord.dataset.harmonicDegree || "";
    const style = getComputedStyle(chord, "::after");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return degree.length * 8 + 12;
    }
    context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily]
      .filter(Boolean)
      .join(" ");
    const horizontalExtras = [
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth
    ].reduce(function (total, value) {
      return total + (parseFloat(value) || 0);
    }, 0);
    return context.measureText(degree).width + horizontalExtras + 4;
  }

  function updateDegreeSpacing() {
    degreeSpacingFrame = 0;
    chords.forEach(function (chord) {
      chord.classList.remove("degree-needs-space");
    });
    if (!tabPage?.classList.contains("is-analysis-visible")) {
      return;
    }

    chords.forEach(function (chord, index) {
      const nextChord = chords[index + 1];
      if (!nextChord || chord.closest(".tab-sheet") !== nextChord.closest(".tab-sheet")) {
        return;
      }
      const chordRect = chord.getBoundingClientRect();
      const nextRect = nextChord.getBoundingClientRect();
      const sameLine = Math.abs(chordRect.top - nextRect.top) < Math.max(chordRect.height, 1) * 0.55;
      if (!sameLine) {
        return;
      }
      const availableGap = nextRect.left - chordRect.right;
      if (availableGap < measureDegreeBadge(chord)) {
        chord.classList.add("degree-needs-space");
      }
    });
  }

  function scheduleDegreeSpacing() {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return;
    }
    if (degreeSpacingFrame) {
      window.cancelAnimationFrame(degreeSpacingFrame);
    }
    degreeSpacingFrame = window.requestAnimationFrame(updateDegreeSpacing);
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
        const dominantTwo = target + 2;
        const diminished = target - 1;
        const scaleChord = pitchName(target) + scaleChordSuffixes[analysisMode][index];
        const dominantChord = pitchName(dominant) + "7";
        const substituteChord = flatNotes[(substitute + 12) % 12] + "7";
        const dominantTwoChord = pitchName(dominantTwo) + "m7";
        const diminishedChord = pitchName(diminished) + "°7";
        return "<tr>" +
          "<td>" + degreeLabels[analysisMode][index] + "</td>" +
          "<td>" + pitchName(target) + "</td>" +
          "<td>" + harmonicChordMarkup(scaleChord, true) + "</td>" +
          "<td>" + harmonicChordMarkup(dominantChord, false) + "</td>" +
          "<td>" + harmonicChordMarkup(substituteChord, false) + "</td>" +
          "<td>" + harmonicProgressionMarkup(dominantTwoChord, dominantChord) + "</td>" +
          "<td>" + harmonicProgressionMarkup(dominantTwoChord, substituteChord) + "</td>" +
          "<td>" + harmonicChordMarkup(diminishedChord, false) + "</td>" +
          "</tr>";
      }).join("");
    }
    if (analysisKeySelect) analysisKeySelect.value = String(analysisRoot);
    if (analysisModeSelect) analysisModeSelect.value = analysisMode;
    updateToneLabel();
    renderKeySignature();
    classifyChords();
    if (tabPage?.classList.contains("is-analysis-visible")) {
      renderChordDiagrams();
    }
    scheduleDegreeSpacing();
  }

  analysisToggle?.addEventListener("click", function () {
    const willOpen = analysisPanel.hidden;
    analysisPanel.hidden = !willOpen;
    analysisToggle.setAttribute("aria-expanded", String(willOpen));
    analysisToggle.classList.toggle("is-active", willOpen);
    tabPage?.classList.toggle("is-analysis-visible", willOpen);
    if (willOpen) renderAnalysis();
    else scheduleDegreeSpacing();
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
      scheduleDegreeSpacing();
    });
  });

  if (typeof window !== "undefined") {
    window.addEventListener("resize", scheduleDegreeSpacing);
  }

  fillKeySelect();
  renderAnalysis();
})();
