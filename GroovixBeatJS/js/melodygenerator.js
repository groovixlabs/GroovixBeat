function durTo16Steps(duration) {
  // supports the durations we emit: 16n, 8n, 8n., 4n, 4n., 2n, 2n., 1m
  // returns whole-number 16th steps
  switch (duration) {
    case "16n": return 1;
    case "8n":  return 2;
    case "8n.": return 3;
    case "4n":  return 4;
    case "4n.": return 6;
    case "2n":  return 8;
    case "2n.": return 12;
    case "1m":  return 16;
    default:    return 2; // fallback to 8n-ish
  }
}

const PC_TO_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NOTE_TO_PC = { C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11 };

// Parse "C#4" -> {pc, oct}
function parseNoteName(note) {
  const m = String(note).match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const name = m[1].toUpperCase() + (m[2] || "");
  const pc = NOTE_TO_PC[name];
  if (!Number.isInteger(pc)) return null;
  return { pc, oct: Number(m[3]) };
}

  // Tone.js / scientific pitch: C4 = 60  => octave = floor(midi/12) - 1
function midiToNote(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${PC_TO_SHARP[pc]}${oct}`;
}



/**
 * Generate a melody (Tone.js note JSON) from chord progression + genre.
 *
 * chordProgression example:
 * [
 *   { chord: "Cmaj7", bars: 1 },
 *   { chord: "Am7", bars: 1 },
 *   { chord: "Dm7", bars: 1 },
 *   { chord: "G7", bars: 1 }
 * ]
 *
 * Output: [{ time: "0:0:0", note: "E4", duration: "8n", velocity: 0.85 }, ...]
 */
function generateMelodyToneJSON(chordProgression, genre = "pop", params = {}) {
  // -------------------------
  // Parameters (tweakable)
  // -------------------------
  const P = {
    // timeline
    timeSig: [4, 4],
    barsPerPhrase: 4,              // question phrase length (answer phrase matches)
    startTimeBars: 0,

    // register / range
    preferredOctave: 4,            // center octave
    rangeSemitones: 12,            // +/- from center note (soft clamp)

    preferredScale: { root: "D", mode: "dorian" }, // ionian, aeolian, dorian, mixolydian, etc.
    //preferredScale: { notes: ["C", "D", "Eb", "F", "G", "Ab", "Bb"] } // pitch classes only

    avoidOutOfScaleChordTones: true,     // strong-beat safety
    allowChromaticPassing: false,        // if true, chromatic allowed only on weak beats
    chromaticPassingChance: 0.08,        // used only if allowChromaticPassing=true


    // melody behavior
    scaleMode: "auto",             // "auto" | "ionian" | "aeolian" | "dorian" | "mixolydian" ...
    targetChordTonesBias: 0.72,    // 0..1 (higher = more chord tones on strong beats)
    approachNoteChance: 0.25,      // chance to precede target with stepwise approach note
    stepwiseBias: 0.70,            // 0..1 (higher = more steps, lower = more leaps)
    maxLeapSemitones: 9,           // limit leaps for singable melodies
    motifReuseChance: 0.55,        // reuse motif fragments inside phrase

    // call/response
    questionCadenceBias: 0.35,     // less resolved ending for question phrase
    answerCadenceBias: 0.85,       // more resolved ending for answer phrase
    answerVariation: 0.30,         // 0..1 how much answer deviates from question motif

    // rhythm
    density: 0.65,                 // 0..1 probability of placing a note on available slots
    syncopation: 0.35,             // 0..1 (genre-pattern blend)
    restChance: 0.18,              // chance a slot becomes rest
    useTripletsChance: 0.08,       // occasional triplet spice

    // articulation
    legatoChance: 0.35,            // ties/longer notes
    velocityHumanize: 0.12,        // +/- variation
    baseVelocity: 0.82,

    // randomness
    seed: null,                    // number | null (if you want reproducible)
    randomness: 0.35,              // 0..1: how adventurous choices are

    // formatting
    defaultDur: "8n",              // base duration if pattern doesn't specify
    ...params
  };

  // -------------------------
  // Seeded RNG (optional)
  // -------------------------
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = (typeof P.seed === "number") ? mulberry32(P.seed >>> 0) : Math.random;
  const r01 = () => rnd();
  const rPick = (arr) => arr[Math.floor(r01() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // -------------------------
  // Music theory helpers
  // -------------------------

  function pcToNote(pc, oct) {
    pc = ((pc % 12) + 12) % 12;
    return `${PC_TO_SHARP[pc]}${oct}`;
  }
  function transposePc(pc, semis) {
    return ((pc + semis) % 12 + 12) % 12;
  }
  function semitoneDistance(aPc, aOct, bPc, bOct) {
    const a = aOct * 12 + aPc;
    const b = bOct * 12 + bPc;
    return b - a;
  }


function parsePitchClassName(n) {
  const s = String(n).trim();
  const m = s.match(/^([A-G])([#b]?)$/i);
  if (!m) return null;
  const name = m[1].toUpperCase() + (m[2] || "");
  return NOTE_TO_PC[name] ?? null;
}

function buildScaleFromPreferred(preferredScale) {
  if (!preferredScale) return null;

  // { notes: [...] }
  if (Array.isArray(preferredScale.notes)) {
    const pcs = preferredScale.notes
      .map(parsePitchClassName)
      .filter((x) => Number.isInteger(x));
    if (pcs.length >= 5) return { rootPc: pcs[0], modeName: "custom", scale: Array.from(new Set(pcs)) };
    return null;
  }

  // { root, mode }
  if (preferredScale.root && preferredScale.mode) {
    const rootPc = parsePitchClassName(preferredScale.root);
    const modeName = String(preferredScale.mode).toLowerCase();
    if (!Number.isInteger(rootPc)) return null;
    const scale = scalePcs(rootPc, modeName);
    return { rootPc, modeName, scale };
  }

  return null;
}

function intersectScale(pcs, scaleSet) {
  return pcs.filter(pc => scaleSet.has(pc));
}


  // Very practical chord parser: root + quality (maj/min/dom/dim/aug) + optional 7/maj7
  function parseChordSymbol(sym) {
    // Examples: C, Cm, Cmin, Cmaj7, Am7, G7, Ddim, F#maj7, Bb7, Em, Asus2 (sus ignored -> treated as maj)
    const s = String(sym).trim();
    const m = s.match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return null;
    const rootName = m[1] + (m[2] || "");
    const rest = (m[3] || "").toLowerCase();

    let quality = "maj";
    if (rest.startsWith("m") && !rest.startsWith("maj")) quality = "min";
    if (rest.includes("min")) quality = "min";
    if (rest.includes("dim")) quality = "dim";
    if (rest.includes("aug")) quality = "aug";
    // dominant if has "7" but not "maj7"
    const isMaj7 = rest.includes("maj7");
    const is7 = rest.includes("7");
    const seventh = isMaj7 ? "maj7" : (is7 ? "7" : null);

    const rootPc = NOTE_TO_PC[rootName];
    return { rootPc, quality, seventh, symbol: sym };
  }

  function chordTones(ch) {
    // returns pitch classes for basic triad + 7th
    // maj: 0,4,7 ; min:0,3,7 ; dim:0,3,6 ; aug:0,4,8 ; dom7 adds 10 ; maj7 adds 11 ; min7 adds 10
    const { rootPc, quality, seventh } = ch;
    let third = 4, fifth = 7;
    if (quality === "min") third = 3;
    if (quality === "dim") { third = 3; fifth = 6; }
    if (quality === "aug") { third = 4; fifth = 8; }

    const pcs = [rootPc, transposePc(rootPc, third), transposePc(rootPc, fifth)];
    if (seventh) {
      if (seventh === "maj7") pcs.push(transposePc(rootPc, 11));
      else pcs.push(transposePc(rootPc, 10)); // dom7 or min7-ish
    }
    return pcs;
  }

  const MODES = {
    ionian:       [0,2,4,5,7,9,11],
    dorian:       [0,2,3,5,7,9,10],
    phrygian:     [0,1,3,5,7,8,10],
    lydian:       [0,2,4,6,7,9,11],
    mixolydian:   [0,2,4,5,7,9,10],
    aeolian:      [0,2,3,5,7,8,10],
    locrian:      [0,1,3,5,6,8,10],
  };

  // Pick a usable "scale root" from progression (very lightweight heuristic)
  function inferKeyRootPc(chords) {
    // Use first chord root as home base; works surprisingly well for pop loops.
    const first = chords[0]?.parsed;
    return first ? first.rootPc : 0;
  }

  function inferMode(chords) {
    const first = chords[0]?.parsed;
    if (!first) return "ionian";

    // If tonic is minor, default to aeolian
    if (first.quality === "min") return "aeolian";

    // If tonic itself is a dominant-7 chord (blues/rock vibe), then mixolydian makes sense
    const tonicIsDom7 = (first.quality === "maj" && first.seventh === "7");
    if (tonicIsDom7) return "mixolydian";

    // For normal major progressions (like Cmaj7 ... G7), stay ionian
    return "ionian";
  }


  function scalePcs(rootPc, modeName) {
    const intervals = MODES[modeName] || MODES.ionian;
    return intervals.map(i => transposePc(rootPc, i));
  }

  function nearestInScale(targetPc, scaleSet) {
    // choose targetPc if in scale, else move by 1 semitone toward a scale pc
    if (scaleSet.has(targetPc)) return targetPc;
    for (let d = 1; d <= 2; d++) {
      const up = transposePc(targetPc, d);
      const dn = transposePc(targetPc, -d);
      if (scaleSet.has(up)) return up;
      if (scaleSet.has(dn)) return dn;
    }
    // fallback: just return targetPc
    return targetPc;
  }

  function pickOctaveForPc(pc, lastMidi, preferredOct = P.preferredOctave) {
    // choose octave near lastMidi and preferred range
    const centerMidi = preferredOct * 12 + pc;
    if (lastMidi == null) return centerMidi;

    const candidates = [centerMidi - 12, centerMidi, centerMidi + 12, centerMidi + 24, centerMidi - 24];
    candidates.sort((a, b) => Math.abs(a - lastMidi) - Math.abs(b - lastMidi));
    return candidates[0];
  }


  // -------------------------
  // Rhythm pattern lookups
  // -------------------------
  // Slots are in 16ths; pattern elements: { step: 0..15, dur16: 1..16, accent: 0..1 }
  const RHYTHM = {
    pop: [
      // bouncy 8th-ish with a couple 16ths
      [{step:0,dur16:2,accent:1},{step:2,dur16:2,accent:0.6},{step:4,dur16:2,accent:0.9},{step:6,dur16:1,accent:0.7},{step:7,dur16:1,accent:0.55},{step:8,dur16:2,accent:0.85},{step:10,dur16:2,accent:0.6},{step:12,dur16:4,accent:0.95}],
      // syncopated hook
      [{step:0,dur16:3,accent:1},{step:3,dur16:1,accent:0.6},{step:4,dur16:2,accent:0.9},{step:6,dur16:2,accent:0.7},{step:8,dur16:3,accent:0.95},{step:11,dur16:1,accent:0.55},{step:12,dur16:4,accent:0.9}],
    ],
    edm: [
      // offbeat / driving
      [{step:0,dur16:2,accent:0.9},{step:2,dur16:2,accent:0.7},{step:4,dur16:2,accent:0.9},{step:6,dur16:2,accent:0.7},{step:8,dur16:2,accent:0.95},{step:10,dur16:2,accent:0.7},{step:12,dur16:2,accent:0.9},{step:14,dur16:2,accent:0.7}],
      // bigger gaps (anthem)
      [{step:0,dur16:4,accent:1},{step:4,dur16:2,accent:0.85},{step:6,dur16:2,accent:0.65},{step:8,dur16:4,accent:0.95},{step:12,dur16:4,accent:0.9}],
    ],
    hiphop: [
      // laid back with rests
      [{step:0,dur16:2,accent:1},{step:3,dur16:1,accent:0.55},{step:4,dur16:2,accent:0.8},{step:7,dur16:1,accent:0.5},{step:8,dur16:3,accent:0.85},{step:12,dur16:4,accent:0.9}],
      // triplet-ish feel via dense 16ths
      [{step:0,dur16:2,accent:1},{step:2,dur16:1,accent:0.6},{step:3,dur16:1,accent:0.55},{step:4,dur16:2,accent:0.85},{step:8,dur16:2,accent:0.9},{step:10,dur16:1,accent:0.6},{step:11,dur16:1,accent:0.55},{step:12,dur16:4,accent:0.9}],
    ],
    jazz: [
      // swung-ish (approx with 16ths)
      [{step:0,dur16:3,accent:0.9},{step:3,dur16:1,accent:0.6},{step:4,dur16:3,accent:0.85},{step:7,dur16:1,accent:0.55},{step:8,dur16:3,accent:0.9},{step:11,dur16:1,accent:0.55},{step:12,dur16:4,accent:0.8}],
      // bebop-y
      [{step:0,dur16:1,accent:0.8},{step:1,dur16:1,accent:0.55},{step:2,dur16:1,accent:0.55},{step:3,dur16:1,accent:0.55},
       {step:4,dur16:2,accent:0.85},{step:6,dur16:2,accent:0.65},{step:8,dur16:2,accent:0.9},{step:10,dur16:2,accent:0.65},{step:12,dur16:4,accent:0.85}],
    ],
  };

  function dur16ToTone(dur16) {
    // 1=16n,2=8n,4=4n,8=2n, etc. If odd, return "16n" and rely on Part length; keep simple.
    if (dur16 === 1) return "16n";
    if (dur16 === 2) return "8n";
    if (dur16 === 3) return "8n."; // dotted 8th
    if (dur16 === 4) return "4n";
    if (dur16 === 6) return "4n."; // dotted quarter (rare)
    if (dur16 === 8) return "2n";
    if (dur16 === 12) return "2n."; // dotted half
    if (dur16 === 16) return "1m";  // one bar in Tone transport terms
    return P.defaultDur;
  }

  // -------------------------
  // Build expanded bar plan
  // -------------------------
  const expanded = [];
  chordProgression.forEach((c) => {
    const bars = c.bars ?? 1;
    const parsed = parseChordSymbol(c.chord || c.symbol || c);
    for (let i = 0; i < bars; i++) expanded.push({ raw: c, parsed });
  });

  const totalBars = expanded.length;
  const forced = buildScaleFromPreferred(P.preferredScale);

  const keyRootPc = forced?.rootPc ?? inferKeyRootPc(expanded);
  const modeName = forced?.modeName ?? ((P.scaleMode === "auto") ? inferMode(expanded) : String(P.scaleMode).toLowerCase());
  const scale = forced?.scale ?? scalePcs(keyRootPc, modeName);
  const scaleSet = new Set(scale);


  // -------------------------
  // Note choice logic
  // -------------------------
  function isStrongStep(step16) {
    // strong beats at 0,4,8,12 (quarters) and medium at 2,6,10,14 (off 8ths)
    return step16 % 4 === 0;
  }

  function weightedPick(options) {
    // options: [{v, w}]
    let sum = 0;
    for (const o of options) sum += o.w;
    let x = r01() * sum;
    for (const o of options) {
      x -= o.w;
      if (x <= 0) return o.v;
    }
    return options[options.length - 1].v;
  }

function chooseTargetPc(chord, step16, phraseRole) {
  const chordPcs = chordTones(chord);
  const inScaleChordPcs = intersectScale(chordPcs, scaleSet);

  const strong = isStrongStep(step16);
  const wantChordTone = strong
    ? (r01() < P.targetChordTonesBias)
    : (r01() < (P.targetChordTonesBias * 0.55));

  // cadence behavior (keep it in scale)
  const cadenceBias = (phraseRole === "question") ? P.questionCadenceBias : P.answerCadenceBias;
  const atCadence = (step16 >= 12);
  if (atCadence && r01() < cadenceBias) {
    const cadPc = weightedPick([
      { v: chord.rootPc, w: 0.65 },
      { v: keyRootPc,    w: 0.35 },
    ]);
    return nearestInScale(cadPc, scaleSet);
  }

  // --- Strong-beat guard: never pick out-of-scale chord tones on strong beats ---
  if (wantChordTone) {
    if (P.avoidOutOfScaleChordTones && strong) {
      // if chord has any in-scale chord tones, pick only those
      if (inScaleChordPcs.length > 0) return rPick(inScaleChordPcs);
      // otherwise fall back to scale tone near chord root
      return nearestInScale(chord.rootPc, scaleSet);
    }

    // weak beats: optionally allow chromatic passing tones
    if (
      P.allowChromaticPassing &&
      !strong &&
      r01() < (P.chromaticPassingChance * (0.5 + P.randomness))
    ) {
      return rPick(chordPcs); // may be chromatic, but only on weak beats
    }

    // default: chord tone, snapped to scale
    return nearestInScale(rPick(chordPcs), scaleSet);
  }

  // non-chord tone: pick from scale with light spice
  const weights = scale.map((pc) => {
    const rel = (pc - keyRootPc + 12) % 12;
    const spice = (rel === 2 || rel === 5 || rel === 9 || rel === 11) ? 1.15 : 1.0;
    return { v: pc, w: spice };
  });

  return weightedPick(weights);
}


  function chooseNextMidi(lastMidi, targetPc) {
    const targetMidiCenter = pickOctaveForPc(targetPc, lastMidi, P.preferredOctave);
    // We may adjust for stepwise/leapwise
    if (lastMidi == null) return targetMidiCenter;

    const dist = targetMidiCenter - lastMidi;
    const absd = Math.abs(dist);

    const preferStep = r01() < P.stepwiseBias;
    let next = targetMidiCenter;

    if (preferStep && absd > 2) {
      // pull closer by moving octave if needed
      if (dist > 0) next = targetMidiCenter - 12;
      else next = targetMidiCenter + 12;
    } else if (!preferStep && absd < 3) {
      // encourage a leap occasionally
      if (r01() < (0.35 + 0.35 * P.randomness)) {
        next = targetMidiCenter + (r01() < 0.5 ? 7 : -7);
      }
    }

    // clamp max leap
    const leap = next - lastMidi;
    if (Math.abs(leap) > P.maxLeapSemitones) {
      next = lastMidi + Math.sign(leap) * P.maxLeapSemitones;
    }

    // clamp range around preferred octave
    const centerMidi = P.preferredOctave * 12 + keyRootPc;
    next = clamp(next, centerMidi - P.rangeSemitones, centerMidi + P.rangeSemitones);

    // snap to scale
    const pc = ((next % 12) + 12) % 12;
    const oct = Math.floor(next / 12);
    const snappedPc = nearestInScale(pc, scaleSet);
    return oct * 12 + snappedPc;
  }

  function maybeApproach(lastMidi, targetMidi) {
    if (lastMidi == null) return null;
    if (r01() > P.approachNoteChance) return null;

    const diff = targetMidi - lastMidi;
    // approach by step from above or below
    const approach = targetMidi + (diff >= 0 ? -1 : +1);
    // snap approach to scale
    const pc = ((approach % 12) + 12) % 12;
    const oct = Math.floor(approach / 12);
    const snappedPc = nearestInScale(pc, scaleSet);
    return oct * 12 + snappedPc;
  }

  // -------------------------
  // Phrase / motif building
  // -------------------------
  function buildPhrase(barStartIndex, barsCount, phraseRole, motifFromQuestion = null) {
    const notes = [];
    let lastMidi = null;

    // choose rhythm patterns per bar
    const patterns = RHYTHM[genre] || RHYTHM.pop;

    // create motif skeleton (pc offsets) if this is question
    let motif = motifFromQuestion ? [...motifFromQuestion] : [];

    for (let b = 0; b < barsCount; b++) {
      const barIndex = barStartIndex + b;
      const chord = expanded[barIndex]?.parsed || parseChordSymbol("C");
      const pat = rPick(patterns);

      // possibly shuffle pattern toward syncopation
      const useSync = r01() < P.syncopation;
      const patSteps = useSync ? pat : pat.filter(x => x.step % 2 === 0 || x.step === 0);

      // per bar: maybe reuse motif fragments
      const reuseMotif = motif.length > 0 && (r01() < P.motifReuseChance);

      for (let i = 0; i < patSteps.length; i++) {
        const slot = patSteps[i];

        // density / rests
        if (r01() > P.density) continue;
        if (r01() < P.restChance) continue;

        // question/answer: in answer phrase, transform motif slightly
        let targetPc;
        if (reuseMotif && motif[i % motif.length] != null) {
          const basePc = motif[i % motif.length];
          // Variation for answer
          if (phraseRole === "answer" && r01() < P.answerVariation) {
            // move by scale degree-ish (+/- 2 semis then snap)
            const delta = rPick([-2, -1, 1, 2]);
            targetPc = nearestInScale(transposePc(basePc, delta), scaleSet);
          } else {
            targetPc = basePc;
          }
        } else {
          targetPc = chooseTargetPc(chord, slot.step, phraseRole);
          if (phraseRole === "question") motif[i] = targetPc; // capture motif
        }

        // midi selection (step/leap control)
        const targetMidi = chooseNextMidi(lastMidi, targetPc);

        // optional approach note (adds "catchy" movement)
        const appMidi = maybeApproach(lastMidi, targetMidi);

        // time formatting: "bar:quarter:sixteenth"
        const barNum = P.startTimeBars + barIndex;
        const time = `${barNum}:${Math.floor(slot.step / 4)}:${slot.step % 4}`;

        // duration, legato
        let dur16 = slot.dur16;
        if (r01() < P.legatoChance) dur16 = clamp(dur16 + rPick([1,2]), 1, 8);
        const duration = dur16ToTone(dur16);

        // velocity humanize + accent
        const vel = clamp(
          P.baseVelocity * (0.75 + 0.5 * slot.accent) + (r01() * 2 - 1) * P.velocityHumanize,
          0.2, 1.0
        );

        // insert approach note as a quick 16th just before the main note (if room)
        if (appMidi != null && slot.step > 0 && r01() < (0.55 + 0.25 * P.randomness)) {
          const appTime = `${barNum}:${Math.floor((slot.step - 1) / 4)}:${(slot.step - 1) % 4}`;
          notes.push({
            time: appTime,
            midi:appMidi,
            note: midiToNote(appMidi),
            duration: "16n",
            velocity: clamp(vel * 0.78, 0.2, 1.0),
            seq: timeToTicks(appTime),   // same-time notes => same seq
            len: 1
          });
        }

        notes.push({
          time,
          midi:targetMidi,
          note: midiToNote(targetMidi),
          duration,
          velocity: vel,
          seq: timeToTicks(time),          // absolute 16th
          len: durTo16Steps(duration)   // whole-number 16th length
        });

        lastMidi = targetMidi;

        // optional triplet burst (rare)
        if (r01() < P.useTripletsChance * P.randomness && slot.step <= 12) {
          // emulate a quick fill with 16ths (Tone triplets are "8t"/"16t" but keeping it simple)
          const fillSteps = [slot.step + 1, slot.step + 2].filter(s => s < 16);
          for (const fs of fillSteps) {
            if (r01() < 0.55) continue;
            const fillPc = nearestInScale(transposePc(targetPc, rPick([-2,-1,1,2])), scaleSet);
            const fillMidi = chooseNextMidi(lastMidi, fillPc);
            const fillTime = `${barNum}:${Math.floor(fs / 4)}:${fs % 4}`;
            notes.push({
              time: fillTime,
              midi:fillMidi,
              note: midiToNote(fillMidi),
              duration: "16n",
              velocity: clamp(vel * 0.7, 0.2, 1.0),
              seq: timeToTicks(fillTime),
              len: 1
            });
            lastMidi = fillMidi;
          }
        }
      }
    }

    return { notes, motif };
  }

  // -------------------------
  // Build question + answer
  // -------------------------
  const barsPerPhrase = P.barsPerPhrase;
  const qBars = Math.min(barsPerPhrase, totalBars);
  const aBars = Math.min(barsPerPhrase, Math.max(0, totalBars - qBars));

  const question = buildPhrase(0, qBars, "question", null);
  const answer = (aBars > 0)
    ? buildPhrase(qBars, aBars, "answer", question.motif)
    : { notes: [], motif: question.motif };

  // if progression longer than 8 bars etc, continue with alternating phrases
  let cursor = qBars + aBars;
  let toggle = 0;
  let motif = question.motif;

  const allNotes = [...question.notes, ...answer.notes];

  while (cursor < totalBars) {
    const role = (toggle % 2 === 0) ? "question" : "answer";
    const chunk = buildPhrase(cursor, Math.min(barsPerPhrase, totalBars - cursor), role, motif);
    allNotes.push(...chunk.notes);
    motif = chunk.motif;
    cursor += Math.min(barsPerPhrase, totalBars - cursor);
    toggle++;
  }

  // -------------------------
  // Clean-up: sort by time and de-duplicate collisions
  // -------------------------
  function timeToTicks(t) {
    // "bar:q:s" => ticks in 16ths; bar = 16 steps, q = 4 steps
    const m = String(t).match(/^(\d+):(\d+):(\d+)$/);
    if (!m) return 0;
    const bar = Number(m[1]);
    const q = Number(m[2]);
    const s = Number(m[3]);
    return bar * 16 + q * 4 + s;
  }

  allNotes.sort((a, b) => timeToTicks(a.time) - timeToTicks(b.time));

  // remove exact time duplicates by keeping the louder one
  const out = [];
  const seen = new Map();
  for (const n of allNotes) {
    const k = n.time;
    if (!seen.has(k)) {
      seen.set(k, out.length);
      out.push(n);
    } else {
      const idx = seen.get(k);
      if ((n.velocity ?? 0) > (out[idx].velocity ?? 0)) out[idx] = n;
    }
  }

  return out;
}


function generateCatchyMelodyToneJSON(chordProgression, genre = "pop", params = {}) {
  const P = {
    candidates: 24,          // generate many; keep best
    keepTop: 3,              // optional: pick randomly among top K for variety
    seed: null,
    preferredScale: { root: "C", mode: "ionian" }, // set by caller if needed
    barsPerPhrase: 4,

    // scoring weights (tweak)
    score: {
      chordToneStrong: 2.2,
      scalePenalty: 6.0,
      tooManyLeapsPenalty: 1.8,
      directionJitterPenalty: 1.1,
      motifReuseBonus: 1.6,
      cadenceAnswerBonus: 2.0,
      cadenceQuestionBonus: 1.0,
      rhythmMotifBonus: 1.1,
      rangePenalty: 1.0,
    },

    // make generation less random by default
    randomness: 0.20,
    stepwiseBias: 0.78,
    targetChordTonesBias: 0.80,
    motifReuseChance: 0.72,
    answerVariation: 0.22,
    density: 0.70,
    syncopation: 0.30,
    avoidOutOfScaleChordTones: true,
    allowChromaticPassing: false,

    ...params,
  };

  
function parseChordSymbol(sym) {
  // Supports: C, Cm, Cmin, Cmaj7, Am7, G7, Ddim, F#maj7, Bb7, Em
  // Ignores extensions beyond 7 (9,11,13) for tone picking simplicity.
  const s = String(sym).trim();
  const m = s.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;

  const rootName = (m[1] + (m[2] || "")).replace(/^\w/, c => c.toUpperCase());
  const rest = (m[3] || "").toLowerCase();

  let quality = "maj";
  if ((rest.startsWith("m") && !rest.startsWith("maj")) || rest.includes("min")) quality = "min";
  if (rest.includes("dim") || rest.includes("o")) quality = "dim";
  if (rest.includes("aug") || rest.includes("+")) quality = "aug";
  // sus -> treat as major-ish for now
  if (rest.includes("sus")) quality = "maj";

  const isMaj7 = rest.includes("maj7") || rest.includes("ma7") || rest.includes("Δ7");
  const has7 = rest.includes("7");
  // dominant 7 if it has 7 but not maj7
  const seventh = isMaj7 ? "maj7" : (has7 ? "7" : null);

  const rootPc = NOTE_TO_PC[rootName];
  if (!Number.isInteger(rootPc)) return null;

  return { rootPc, quality, seventh, symbol: sym };
}

function chordTones(ch) {
  // triad + optional 7th (PCs)
  // maj: 0,4,7 ; min:0,3,7 ; dim:0,3,6 ; aug:0,4,8
  // add 7: dom/min -> +10 ; maj7 -> +11
  const rootPc = ch.rootPc;

  let third = 4, fifth = 7;
  if (ch.quality === "min") third = 3;
  if (ch.quality === "dim") { third = 3; fifth = 6; }
  if (ch.quality === "aug") { third = 4; fifth = 8; }

  const pcs = [
    rootPc,
    (rootPc + third) % 12,
    (rootPc + fifth) % 12
  ];

  if (ch.seventh) {
    pcs.push((rootPc + (ch.seventh === "maj7" ? 11 : 10)) % 12);
  }

  return pcs;
}


  function pcToNote(pc, oct) {
    pc = ((pc % 12) + 12) % 12;
    return `${PC_TO_SHARP[pc]}${oct}`;
  }
  function transposePc(pc, semis) {
    return ((pc + semis) % 12 + 12) % 12;
  }
  function semitoneDistance(aPc, aOct, bPc, bOct) {
    const a = aOct * 12 + aPc;
    const b = bOct * 12 + bPc;
    return b - a;
  }

function scoreMelody(melody, chordProgression, genre, P) {
  // Helpers (assume these exist in your file already from earlier patches):
  // - timeToTicks("bar:q:s") -> absolute 16th
  // - durTo16Steps(duration) -> whole number
  // - NOTE_TO_PC, parseNoteName(...)
  // - parseChordSymbol(...), chordTones(...)

  // Expand chords to per-bar like earlier
  const expanded = [];
  chordProgression.forEach((c) => {
    const bars = c.bars ?? 1;
    const parsed = parseChordSymbol(c.chord || c.symbol || c);
    for (let i = 0; i < bars; i++) expanded.push({ parsed });
  });

  const scaleSet = (() => {
    // rebuild from P.preferredScale (same helper you added earlier)
    const forced = (typeof buildScaleFromPreferred === "function")
      ? buildScaleFromPreferred(P.preferredScale)
      : null;
    const scale = forced?.scale || [];
    return new Set(scale);
  })();

  let score = 0;

  // sort by seq (absolute 16ths)
  const events = [...melody].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // melody stats
  const midis = [];
  const seqs = [];
  const strongBeatSeqSet = new Set(); // seq where step%4==0

  for (const e of events) {
    const pn = parseNoteName(e.note);
    if (!pn) continue;
    const midi = pn.oct * 12 + pn.pc;
    midis.push(midi);
    seqs.push(e.seq ?? timeToTicks(e.time));

    // strong if 16th pos within bar is 0,4,8,12
    const stepInBar = (e.seq ?? timeToTicks(e.time)) % 16;
    if (stepInBar % 4 === 0) strongBeatSeqSet.add(e.seq ?? timeToTicks(e.time));

    // strict scale check (should be in-scale if you forced it)
    if (scaleSet.size > 0 && !scaleSet.has(pn.pc)) {
      score -= P.score.scalePenalty;
    }
  }

  if (midis.length < 4) return -9999;

  // range penalty (too wide tends to sound random)
  const minM = Math.min(...midis);
  const maxM = Math.max(...midis);
  const range = maxM - minM;
  if (range > 16) score -= (range - 16) * P.score.rangePenalty;

  // chord-tone on strong beats bonus
  for (const e of events) {
    const seq = e.seq ?? timeToTicks(e.time);
    if (!strongBeatSeqSet.has(seq)) continue;

    const bar = Math.floor(seq / 16);
    const ch = expanded[bar]?.parsed;
    if (!ch) continue;

    const pn = parseNoteName(e.note);
    if (!pn) continue;

    const chordSet = new Set(chordTones(ch));
    if (chordSet.has(pn.pc)) score += P.score.chordToneStrong;
  }

  // interval + direction smoothness
  let leaps = 0;
  let jitter = 0;
  let prevDir = 0;

  for (let i = 1; i < midis.length; i++) {
    const d = midis[i] - midis[i - 1];
    const ad = Math.abs(d);
    if (ad >= 7) leaps++; // 5th or more
    const dir = d === 0 ? 0 : (d > 0 ? 1 : -1);
    if (prevDir !== 0 && dir !== 0 && dir !== prevDir) jitter++;
    if (dir !== 0) prevDir = dir;
  }

  score -= leaps * P.score.tooManyLeapsPenalty;
  score -= jitter * P.score.directionJitterPenalty;

  // motif reuse bonus: reward repeated pitch-interval bigrams
  // (cheap but effective)
  const intervalBigrams = new Map();
  for (let i = 2; i < midis.length; i++) {
    const a = midis[i - 1] - midis[i - 2];
    const b = midis[i] - midis[i - 1];
    const k = `${Math.sign(a)}:${Math.min(12, Math.abs(a))}|${Math.sign(b)}:${Math.min(12, Math.abs(b))}`;
    intervalBigrams.set(k, (intervalBigrams.get(k) || 0) + 1);
  }
  let repeats = 0;
  for (const v of intervalBigrams.values()) if (v >= 2) repeats += (v - 1);
  score += repeats * P.score.motifReuseBonus;

  // cadence: last note of each 4-bar phrase should behave differently
  const phraseBars = P.barsPerPhrase || 4;
  const totalBars = expanded.length;
  const phraseCount = Math.ceil(totalBars / phraseBars);

  function lastNoteInBar(barIdx) {
    const start = barIdx * 16;
    const end = start + 16;
    const inBar = events.filter(e => {
      const s = e.seq ?? timeToTicks(e.time);
      return s >= start && s < end;
    });
    if (!inBar.length) return null;
    const last = inBar[inBar.length - 1];
    const pn = parseNoteName(last.note);
    if (!pn) return null;
    return { pc: pn.pc, seq: last.seq ?? timeToTicks(last.time) };
  }

  const tonicPc = (() => {
    const forced = (typeof buildScaleFromPreferred === "function")
      ? buildScaleFromPreferred(P.preferredScale)
      : null;
    return forced?.rootPc ?? 0;
  })();

  for (let p = 0; p < phraseCount; p++) {
    const phraseStartBar = p * phraseBars;
    const phraseEndBar = Math.min(totalBars - 1, phraseStartBar + phraseBars - 1);
    const last = lastNoteInBar(phraseEndBar);
    if (!last) continue;

    const role = (p % 2 === 0) ? "question" : "answer";
    const isTonic = last.pc === tonicPc;

    if (role === "answer") score += isTonic ? P.score.cadenceAnswerBonus : -0.8;
    else score += (!isTonic) ? P.score.cadenceQuestionBonus : -0.6;
  }

  // simple rhythm motif bonus: repeated seq differences
  const diffs = [];
  for (let i = 1; i < seqs.length; i++) diffs.push(seqs[i] - seqs[i - 1]);
  const diffCounts = new Map();
  for (const d of diffs) diffCounts.set(d, (diffCounts.get(d) || 0) + 1);
  let rhythmRepeats = 0;
  for (const v of diffCounts.values()) if (v >= 3) rhythmRepeats++;
  score += rhythmRepeats * P.score.rhythmMotifBonus;

  return score;
}  

  // if seed given, vary each candidate deterministically
  const baseSeed = (typeof P.seed === "number") ? (P.seed >>> 0) : null;

  const candidates = [];
  for (let i = 0; i < P.candidates; i++) {
    const melody = generateMelodyToneJSON(chordProgression, genre, {
      ...P,
      seed: (baseSeed == null) ? null : (baseSeed + i * 9973) >>> 0,
    });

    const s = scoreMelody(melody, chordProgression, genre, P);
    candidates.push({ melody, score: s });
  }

  candidates.sort((a, b) => b.score - a.score);

  // optionally pick among top-K so you don't always get the same result
  const k = Math.max(1, Math.min(P.keepTop, candidates.length));
  const pick = candidates[Math.floor(Math.random() * k)];
  return pick.melody;
}




/*

import * as Tone from "tone";
import { generateMelodyToneJSON } from "./melodyGen.js";

const chords = [
  { chord: "Cmaj7", bars: 1 },
  { chord: "Am7", bars: 1 },
  { chord: "Dm7", bars: 1 },
  { chord: "G7", bars: 1 },
  { chord: "Cmaj7", bars: 1 },
  { chord: "Am7", bars: 1 },
  { chord: "Dm7", bars: 1 },
  { chord: "G7", bars: 1 },
];

const melody = generateMelodyToneJSON(chords, "pop", {
  seed: 1234,
  density: 0.72,
  stepwiseBias: 0.78,
  syncopation: 0.42,
  barsPerPhrase: 4
});

const synth = new Tone.Synth().toDestination();

const part = new Tone.Part((time, value) => {
  synth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
}, melody).start(0);

Tone.Transport.bpm.value = 110;
Tone.Transport.start();

*/

function GNoteChordsToMelChords(pat,octave=5)
{
    let melchords = []
    let chords=pat.split(" ")
    let notelen=4;
    for(let i=0;i<chords.length;i++)
    {
       let txt=chords[i].trim();
       //console.log(i,chords[i],txt);
       if (txt.length==0) continue;
       let nlen=gParseInt(txt, 0);
       //console.log("*** notelen",i,nlen,notelen);
       if (nlen>0) { notelen=nlen;continue;} // we can have length anywhere its a number. Chords are text.
       // console.log("GNoteChordsToMelChords:",chords[i], notelen, notelen/4 ,octave);
       melchords.push({ chord: chords[i], bars: notelen/4 ,octave:octave});
    }

    return melchords;
}


function GenMelodyFromGNoteChords(pat,genre,props,includechords=false)
{
  let chord_octave=2,fc=0;
  let melchords = GNoteChordsToMelChords(pat,chord_octave);
  
  let GRNotes = generateMelodyToneJSON(melchords, genre, props);
  //let GRNotes = generateCatchyMelodyToneJSON(melchords, "pop", props);


  console.log(GRNotes);
  
  if (includechords)
  {
    for(let c=0;c<melchords.length;c++)
    {
        let length=melchords[c].bars*4
        fc=GetChordsFromToken(GRNotes,chord_octave,fc,melchords[c].chord,length);
    }
  }

  //melody.concat(ChordGNotes)
  return GRNotes;
}