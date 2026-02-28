"use strict"

class CChord {

drumMidiMappings={};

constructor(brand) 
{
    for(let a in this.drumAbbreviationMappings)
    {
        //console.log(a);
        let midi=this.drumAbbreviationMappings[a].midiNote;
        this.drumMidiMappings[midi]=this.drumAbbreviationMappings[a]
    }

  }

foldIntoRange(midi, lo, hi) {
  while (midi < lo) midi += 12;
  while (midi > hi) midi -= 12;
  return midi;
}

normalizeChordType(ntypeRaw) {
  if (!ntypeRaw) return "maj";

  let t = ntypeRaw.trim();

  // Common symbols / variants
  t = t.replace(/Δ/gi, "maj");
  t = t.replace(/[–−]/g, "-"); // handle weird minus chars

  // Aliases: Cm, C-, etc.
  // Convert leading "m" (but not "maj") to "min"
  if (t === "m") return "min";
  if (t.startsWith("m") && !t.startsWith("maj")) t = "min" + t.slice(1);

  // Convert leading "-" to "min" (C-7, C-9, etc.)
  if (t.startsWith("-")) t = "min" + t.slice(1);

  // Some people write "minor7", "minor9" etc.
  t = t.replace(/^minor/i, "min");
  t = t.replace(/^major/i, "maj");

  // You already use "dim", "aug", "sus2", "sus4", etc.
  return t.toLowerCase();
}

splitChordAndBass(chordStr) {
  // Handle null/undefined/non-string inputs safely
  if (chordStr == null) {
    return { main: "", bass: null };
  }

  const s = String(chordStr).trim();
  if (!s.length) {
    return { main: "", bass: null };
  }

  const slash = s.indexOf("/");
  if (slash === -1) {
    return { main: s, bass: null };
  }

  return {
    main: s.slice(0, slash),
    bass: s.slice(slash + 1) || null
  };
}

chords = {
    C: {
        major: [60, 64, 67],
        minor: [60, 63, 67],
        diminished: [60, 63, 66],
        augmented: [60, 64, 68],
        dominant7: [60, 64, 67, 70],
        major7: [60, 64, 67, 71],
        minor7: [60, 63, 67, 70],
        diminished7: [60, 63, 66, 69]
    },
    D: {
        major: [62, 66, 69],
        minor: [62, 65, 69],
        diminished: [62, 65, 68],
        augmented: [62, 66, 70],
        dominant7: [62, 66, 69, 72],
        major7: [62, 66, 69, 73],
        minor7: [62, 65, 69, 72],
        diminished7: [62, 65, 68, 71]
    },
    E: {
        major: [64, 68, 71],
        minor: [64, 67, 71],
        diminished: [64, 67, 70],
        augmented: [64, 68, 72],
        dominant7: [64, 68, 71, 74],
        major7: [64, 68, 71, 75],
        minor7: [64, 67, 71, 74],
        diminished7: [64, 67, 70, 73]
    },
    F: {
        major: [65, 69, 72],
        minor: [65, 68, 72],
        diminished: [65, 68, 71],
        augmented: [65, 69, 73],
        dominant7: [65, 69, 72, 75],
        major7: [65, 69, 72, 76],
        minor7: [65, 68, 72, 75],
        diminished7: [65, 68, 71, 74]
    },
    G: {
        major: [67, 71, 74],
        minor: [67, 70, 74],
        diminished: [67, 70, 73],
        augmented: [67, 71, 75],
        dominant7: [67, 71, 74, 77],
        major7: [67, 71, 74, 78],
        minor7: [67, 70, 74, 77],
        diminished7: [67, 70, 73, 76]
    },
    A: {
        major: [69, 73, 76],
        minor: [69, 72, 76],
        diminished: [69, 72, 75],
        augmented: [69, 73, 77],
        dominant7: [69, 73, 76, 79],
        major7: [69, 73, 76, 80],
        minor7: [69, 72, 76, 79],
        diminished7: [69, 72, 75, 78]
    },
    B: {
        major: [71, 75, 78],
        minor: [71, 74, 78],
        diminished: [71, 74, 77],
        augmented: [71, 75, 79],
        dominant7: [71, 75, 78, 81],
        major7: [71, 75, 78, 82],
        minor7: [71, 74, 78, 81],
        diminished7: [71, 74, 77, 80]
    }
};

allChordProgressions = {
    major: {
        I_IV_V: [
            [60, 64, 67], // C Major (I)
            [65, 69, 72], // F Major (IV)
            [67, 71, 74]  // G Major (V)
        ],
        I_V_vi_IV: [
            [60, 64, 67], // C Major (I)
            [67, 71, 74], // G Major (V)
            [57, 60, 64], // A Minor (vi)
            [65, 69, 72]  // F Major (IV)
        ],
        I_ii_iii_IV: [
            [60, 64, 67], // C Major (I)
            [62, 65, 69], // D Minor (ii)
            [64, 67, 71], // E Minor (iii)
            [65, 69, 72]  // F Major (IV)
        ],
        I_IV_ii_V: [
            [60, 64, 67], // C Major (I)
            [65, 69, 72], // F Major (IV)
            [62, 65, 69], // D Minor (ii)
            [67, 71, 74]  // G Major (V)
        ],
        ii_V_I: [
            [62, 65, 69], // D Minor (ii)
            [67, 71, 74], // G Dominant7 (V7)
            [60, 64, 67]  // C Major (I)
        ]
    },
    minor: {
        i_iv_v: [
            [57, 60, 64], // A Minor (i)
            [65, 68, 72], // F Minor (iv)
            [67, 70, 74]  // G Minor (v)
        ],
        i_VI_III_VII: [
            [57, 60, 64], // A Minor (i)
            [53, 57, 60], // F Major (VI)
            [55, 59, 62], // C Major (III)
            [58, 62, 65]  // G Major (VII)
        ],
        i_vi_ii_V: [
            [57, 60, 64], // A Minor (i)
            [53, 57, 60], // F Major (vi)
            [62, 65, 69], // D Minor (ii)
            [67, 71, 74]  // G Dominant7 (V7)
        ],
        i_VI_vii_v: [
            [57, 60, 64], // A Minor (i)
            [53, 57, 60], // F Major (VI)
            [71, 74, 78], // B Diminished (vii°)
            [67, 70, 74]  // G Minor (v)
        ]
    },
    blues: {
        twelveBar: [
            [60, 64, 67], // C7 (I7)
            [65, 69, 72], // F7 (IV7)
            [60, 64, 67], // C7 (I7)
            [67, 71, 74]  // G7 (V7)
        ],
        minorBlues: [
            [57, 60, 64], // A Minor (i)
            [62, 65, 69], // D Minor (iv)
            [57, 60, 64], // A Minor (i)
            [67, 70, 74]  // G Minor (v)
        ]
    },
    pop: {
        fourChords: [
            [60, 64, 67], // C Major (I)
            [57, 60, 64], // A Minor (vi)
            [65, 69, 72], // F Major (IV)
            [67, 71, 74]  // G Major (V)
        ],
        I_V_ii_vi: [
            [60, 64, 67], // C Major (I)
            [67, 71, 74], // G Major (V)
            [62, 65, 69], // D Minor (ii)
            [57, 60, 64]  // A Minor (vi)
        ]
    },
    jazz: {
        ii_V_I: [
            [62, 65, 69], // D Minor (ii)
            [67, 71, 74], // G Dominant7 (V7)
            [60, 64, 67]  // C Major (I)
        ],
        I_vi_ii_V: [
            [60, 64, 67], // C Major (I)
            [57, 60, 64], // A Minor (vi)
            [62, 65, 69], // D Minor (ii)
            [67, 71, 74]  // G Dominant7 (V7)
        ],
        I_IV_iii_vi: [
            [60, 64, 67], // C Major (I)
            [65, 69, 72], // F Major (IV)
            [64, 67, 71], // E Minor (iii)
            [57, 60, 64]  // A Minor (vi)
        ]
    },
    classical: {
        I_IV_V_I: [
            [60, 64, 67], // C Major (I)
            [65, 69, 72], // F Major (IV)
            [67, 71, 74], // G Major (V)
            [60, 64, 67]  // C Major (I)
        ],
        I_vi_IV_V: [
            [60, 64, 67], // C Major (I)
            [57, 60, 64], // A Minor (vi)
            [65, 69, 72], // F Major (IV)
            [67, 71, 74]  // G Major (V)
        ]
    }
};


/*

Cmaj → A7 → Dm → G7 → Cmaj (Mixing dominant 7)
Cmaj → E7 → Am → Fmaj → G7 → Cmaj (Secondary dominant E7)
Cmaj → C#dim7 → Dm → G7 → Cmaj (Diminished passing chord)

A Minor with Diminished & Dominant 7:
Am → Bdim → E7 → Am (Bdim is the vii° of Am, E7 is the dominant 7)
Am → Fmaj → G7 → Cmaj → E7 → Am (Mixing major and dominant 7)


1. Pop Ballad (Emotional & Flowing)
Progression (C Major Key):
C → Am/C → Fmaj7/A → G/B → C
(Smooth descending bass line: C → C → A → B → C)

Chro matic Movement with Diminished 7:
Cmaj → C#dim7 → Dm7 → G7 → Cmaj
(C#dim7 creates a smooth chrom atic passing motion)


Chords Breakdown:

C (C-E-G)
Am/C (C-E-A) → First inversion of Am
Fmaj7/A (A-C-E-F) → First inversion of Fmaj7
G/B (B-D-G) → First inversion of G
C (C-E-G) → Resolves back to root
🎶 Usage: Found in pop songs like Adele’s Someone Like You or Elton John's Your Song.

🎸 2. Rock Ballad / Power Pop (Strong & Melodic)
Progression (G Major Key):
G → D/F# → Em → C/E → D → G
(Bass moves smoothly: G → F# → E → E → D → G)

Chords Breakdown:

G (G-B-D)
D/F# (F#-A-D) → First inversion of D major
Em (E-G-B)
C/E (E-G-C) → First inversion of C major
D (D-F#-A)
G (G-B-D)
🎶 Usage: Similar to "Boulevard of Broken Dreams" (Green Day) or "Don’t Stop Believin’" (Journey).

🎷 3. Jazz / Neo-Soul (Smooth & Sophisticated)
Progression (F Major Key):
Fmaj7 → Dm7/F → Gm7 → C9/E → Fmaj7
(Smooth jazz voicings, walking bass feel.)

Chords Breakdown:

Fmaj7 (F-A-C-E)
Dm7/F (F-A-C-D) → First inversion of Dm7
Gm7 (G-Bb-D-F)
C9/E (E-G-Bb-D) → First inversion of C9 (dominant 9th)
Fmaj7 (F-A-C-E)
🎶 Usage: Found in jazz standards and modern R&B, like "Just the Two of Us" by Bill Withers.

🎹 4. Classical / Film Score (Dramatic & Cinematic)
Progression (A Minor Key):
Am → Am/C → Fmaj7/A → E/G# → Am
(A dramatic descending bassline: A → C → A → G# → A)

Chords Breakdown:

Am (A-C-E)
Am/C (C-E-A) → First inversion of Am
Fmaj7/A (A-C-E-F) → First inversion of Fmaj7
E/G# (G#-B-E) → First inversion of E major
Am (A-C-E)
🎶 Usage: Similar to Hans Zimmer-style cinematic pieces or Beethoven's Moonlight Sonata.

🎤 5. Blues / Gospel (Soulful & Emotional)
Progression (C Major Key):
C → E7/B → Am → C/G → F → G7/F → C
(Adds gospel feel with bass movement: C → B → A → G → F → F → C)

Chords Breakdown:

C (C-E-G)
E7/B (B-D#-E-G) → First inversion of E7 (adds bluesy tension)
Am (A-C-E)
C/G (G-C-E) → Second inversion of C major
F (F-A-C)
G7/F (F-G-B-D) → 3rd inversion of G7 (bluesy feel)
C (C-E-G)
🎶 Usage: Found in gospel songs like Amazing Grace or bluesy ballads.



##################################################################



Major	C	C
Minor	C minor	Cm, C-
Diminished	C diminished	Cdim, C°
Augmented	C augmented	Caug, C+
Suspended 2	C suspended 2	Csus2
Suspended 4	C suspended 4	Csus4


Dominant 7	C dominant 7	C7
Major 7	C major 7	Cmaj7, CΔ7
Minor 7	C minor 7	Cm7, C-7
Diminished 7	C dim 7	Cdim7, C°7
Half-Diminished 7	C half-dim 7	Cm7♭5, Cø7
Minor Major 7	C minor major 7	Cm(maj7), Cmin(maj7)

Chord Type	Example (C)	Notation
9th	C dominant 9	C9
Major 9	C major 9	Cmaj9, CΔ9
Minor 9	C minor 9	Cm9
11th	C dominant 11	C11
Major 11	C major 11	Cmaj11
Minor 11	C minor 11	Cm11
13th	C dominant 13	C13
Major 13	C major 13	Cmaj13
Minor 13	C minor 13	Cm13

Chord Type	Example (C)	Notation
Dominant 7♯5	C7 sharp 5	C7♯5, C7+5
Dominant 7♭5	C7 flat 5	C7♭5
Dominant 7♯9	C7 sharp 9	C7♯9
Dominant 7♭9	C7 flat 9	C7♭9
Major 7♯5	C major 7 sharp 5	Cmaj7♯5, CΔ7♯5
Major 7♭5	C major 7 flat 5	Cmaj7♭5

Slash Chords (Inversions)
C/E → C major with E in the bass.
D/F# → D major with F# in the bass.
G/B → G major with B in the bass.


Common Inversions & Their Notation
Chord Type	Root Position	1st Inversion (3rd in Bass)	2nd Inversion (5th in Bass)
Major	C (C-E-G)	C/E (E-G-C)	C/G (G-C-E)
Minor	Am (A-C-E)	Am/C (C-E-A)	Am/E (E-A-C)
Dominant 7	G7 (G-B-D-F)	G7/B (B-D-F-G)	G7/D (D-F-G-B)
Major 7	Dmaj7 (D-F#-A-C#)	Dmaj7/F# (F#-A-C#-D)	Dmaj7/A (A-C#-D-F#)
Minor 7	Em7 (E-G-B-D)	Em7/G (G-B-D-E)	Em7/B (B-D-E-G)
Diminished 7	Bdim7 (B-D-F-Ab)	Bdim7/D (D-F-Ab-B)	Bdim7/F (F-Ab-B-D)


*/

//console.log(allChordProgressions);
 noteToMidi = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};


// since we use starts with we need the widest match first.
 chordFormulas = {
    "sus2": [0, 2, 7],        // Suspended 2
    "sus4": [0, 5, 7],        // Suspended 4
    "maj7": [0, 4, 7, 11],    // Major 7
    "min7": [0, 3, 7, 10],    // Minor 7
    "dim7": [0, 3, 6, 9],     // Diminished 7
    "m7b5": [0, 3, 6, 10],    // Half-diminished
    "maj9": [0, 4, 7, 11, 14],// Major 9
    "min9": [0, 3, 7, 10, 14],// Minor 9

    "maj": [0, 4, 7],         // Major
    "min": [0, 3, 7],         // Minor
    "dim": [0, 3, 6],         // Diminished
    "aug": [0, 4, 8],         // Augmented

    "m7": [0, 3, 7, 10],    // Minor 7

    "11": [0, 4, 7, 10, 14, 17], // Dominant 11
    "13": [0, 4, 7, 10, 14, 21],  // Dominant 13

    "7": [0, 4, 7, 10],       // Dominant 7    
    "9": [0, 4, 7, 10, 14]   // Dominant 9
};


voiceChordPianoFriendly(rootMidi, midiNotes, opts = {}) {
  const {
    leftRange  = [36, 55],   // C2..G3 (left hand)
    rightRange = [60, 84],   // C4..C6 (right hand)
    preferRootInBass = true,
    spreadMin = 7,           // minimum gap between LH and RH lowest note
    maxNotes = 5,            // keep it playable
    dropFifthIfCrowded = true
  } = opts;

  if (!Array.isArray(midiNotes) || midiNotes.length === 0) return [];

  // Work with pitch classes (intervals from root) to identify chord tones
  const rootPC = (rootMidi % 12 + 12) % 12;
  const pcs = [...new Set(midiNotes.map(n => (n % 12 + 12) % 12))];

  const has = (interval) => pcs.includes((rootPC + interval) % 12);

  // Identify functional tones by interval
  const pcRoot = (rootPC + 0)  % 12;
  const pc3    = has(3) ? (rootPC + 3) % 12 : (has(4) ? (rootPC + 4) % 12 : null);
  const pc5    = has(7) ? (rootPC + 7) % 12 : (has(6) ? (rootPC + 6) % 12 : (has(8) ? (rootPC + 8) % 12 : null));
  const pc7    = has(10) ? (rootPC + 10) % 12 : (has(11) ? (rootPC + 11) % 12 : null);
  const pc9    = has(14) ? (rootPC + 2) % 12 : null;
  const pc11   = has(17) ? (rootPC + 5) % 12 : null;
  const pc13   = has(21) ? (rootPC + 9) % 12 : null;

  // Build a target “piano-friendly” tone priority:
  // LH: root (or 3rd if rootless), maybe 7th
  // RH: 3rd, 7th, then color tones (9/11/13), then 5th if room
  const leftTargets = [];
  const rightTargets = [];

  if (preferRootInBass) leftTargets.push(pcRoot);
  else if (pc3 != null) leftTargets.push(pc3);
  else leftTargets.push(pcRoot);

  // Put 7th in left occasionally for richer harmony (helps dominant & maj7/min7)
  if (pc7 != null) leftTargets.push(pc7);

  if (pc3 != null) rightTargets.push(pc3);
  if (pc7 != null) rightTargets.push(pc7);

  // Color tones (if present)
  if (pc9 != null)  rightTargets.push(pc9);
  if (pc11 != null) rightTargets.push(pc11);
  if (pc13 != null) rightTargets.push(pc13);

  // Fifth is optional; often dropped in dense chords
  if (pc5 != null) rightTargets.push(pc5);

  // Remove duplicates while preserving order
  const uniq = (arr) => {
    const s = new Set();
    return arr.filter(x => (x != null) && (s.has(x) ? false : (s.add(x), true)));
  };

  const LHpcs = uniq(leftTargets);
  let RHpcs   = uniq(rightTargets);

  // If crowded and allowed, drop the 5th from RH
  if (dropFifthIfCrowded && RHpcs.length > 3 && pc5 != null) {
    RHpcs = RHpcs.filter(pc => pc !== pc5);
  }

  // Map pitch classes to actual midi in ranges
  const makeNotesInRange = (pcList, lo, hi) => {
    const notes = [];
    for (const pc of pcList) {
      // Start near the middle of the range, then fold
      const mid = Math.round((lo + hi) / 2);
      let n = mid - ((mid - pc) % 12);
      n = this.foldIntoRange(n, lo, hi);
      // Ensure exact pitch class
      while ((n % 12 + 12) % 12 !== pc) n += 12;
      n = this.foldIntoRange(n, lo, hi);
      notes.push(n);
    }
    return notes.sort((a,b)=>a-b);
  };

  let LH = makeNotesInRange(LHpcs, leftRange[0], leftRange[1]);
  let RH = makeNotesInRange(RHpcs, rightRange[0], rightRange[1]);

  // Ensure RH isn't too close to LH (avoid mud / hand collision)
  if (LH.length && RH.length) {
    const lhTop = Math.max(...LH);
    while (RH.length && RH[0] - lhTop < spreadMin) {
      RH = RH.map(n => n + 12).filter(n => n <= rightRange[1]);
      if (!RH.length) break;
    }
  }

  // Limit total notes to maxNotes (prefer keeping 3rd+7th+root)
  let combined = [...LH, ...RH].sort((a,b)=>a-b);
  if (combined.length > maxNotes) {
    // priority keep: root, 3rd, 7th, 9/13, then others
    const priorityPCs = uniq([pcRoot, pc3, pc7, pc9, pc13, pc11, pc5]);
    const scored = combined.map(n => {
      const pc = (n % 12 + 12) % 12;
      const idx = priorityPCs.indexOf(pc);
      return { n, score: (idx === -1 ? 999 : idx) };
    }).sort((a,b)=>a.score-b.score || a.n-b.n);

    combined = scored.slice(0, maxNotes).map(x => x.n).sort((a,b)=>a-b);
  }

  return combined;
}

parseQualityAndMods(ntypeRaw) {
  // returns { baseKey, mods, rawNorm }
  // baseKey must exist in chordFormulas (maj, min, dim, aug, sus2, sus4, 7, maj7, min7, dim7, m7b5, 9, 11, 13, maj9, min9)
  let t = this.normalizeChordType(ntypeRaw); // from the earlier upgrade

  // Handle minor-major 7 styles: min(maj7), m(maj7)
  // We treat this as a "min" base plus an added major 7 (11 semitones) instead of minor7's 10.
  let minorMajor7 = false;
  if (/\(maj7\)/i.test(t) || /\(M7\)/.test(t)) {
    minorMajor7 = true;
    t = t.replace(/\(maj7\)/ig, "").replace(/\(M7\)/g, "");
  }

  // Extract modifiers like b9, #9, b5, #5, #11, b13, add9 etc.
  // We'll collect tokens in order.
  const mods = [];

  // normalize unicode accidentals if any
  t = t.replace(/♭/g, "b").replace(/♯/g, "#");

  // capture tokens like: b9 #9 b5 #5 #11 b13 add9 add11 add13
  const re = /(add\d+|[#b]\d+)/ig;
  let m;
  while ((m = re.exec(t)) !== null) mods.push(m[1].toLowerCase());

  // Remove mod tokens from the base string
  const baseOnly = t.replace(re, "");

  // Base selection: try longest-first match in your existing chordFormulas
  const keys = Object.keys(this.chordFormulas).sort((a,b)=>b.length-a.length);
  let baseKey = keys.find(k => baseOnly.startsWith(k));
  if (!baseKey) baseKey = "maj"; // default

  // If it’s minor-major7, we’ll apply a special “replace 7th” later.
  return { baseKey, mods, rawNorm: t, minorMajor7 };
}

applyModsToIntervals(baseKey, baseIntervals, mods, minorMajor7=false) {
  // baseIntervals are semitone offsets from root, e.g. [0,4,7,10]
  const set = new Set(baseIntervals);

  // Helper: replace an interval if present
  const replace = (from, to) => {
    if (set.has(from)) { set.delete(from); set.add(to); }
    else { set.add(to); } // if not present, just add
  };

  // Minor-major7: ensure 11 (maj7) instead of 10 (min7)
  if (minorMajor7) {
    // If base is min7/min9 etc, it likely has 10; force 11.
    replace(10, 11);
  }

  for (const token of mods) {
    switch (token) {
      // Fifth alterations
      case "b5": replace(7, 6); break;
      case "#5": replace(7, 8); break;

      // 9 alterations (dominant/jazz)
      case "b9": replace(14, 13); break;
      case "#9": replace(14, 15); break;

      // 11 alterations
      case "b11": replace(17, 16); break;
      case "#11": replace(17, 18); break;

      // 13 alterations
      case "b13": replace(21, 20); break;
      case "#13": replace(21, 22); break;

      // Add tones (do not replace; just add)
      case "add9": set.add(14); break;
      case "add11": set.add(17); break;
      case "add13": set.add(21); break;

      default:
        // ignore unknown modifiers safely
        break;
    }
  }

  // Return sorted intervals (nice + stable)
  return Array.from(set).sort((a,b)=>a-b);
}

voiceChordPopTriad(rootMidi, midiNotes, opts = {}) {
  // Self-contained, "thick" pop triad voicing:
  // LH: root + (optional) root octave + (optional) fifth
  // RH: triad in a comfortable range + (optional) root octave

  const {
    leftRange  = [36, 52],   // C2..E3 (keeps bass clean)
    rightRange = [60, 84],   // C4..C6
    addLeftOctave = true,    // adds root+12 in LH (fat)
    addLeftFifth  = true,    // adds fifth in LH (power)
    addRightOctave = true,   // adds root+12 in RH (shine)
    maxNotes = 6,            // safety cap
  } = opts;

  if (!Array.isArray(midiNotes) || midiNotes.length === 0 || typeof rootMidi !== "number") return [];

  const foldIntoRange = (m, lo, hi) => {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  };

  const pc = (n) => ((n % 12) + 12) % 12;

  // Unique pitch classes from the chord
  const pcs = [...new Set(midiNotes.map(pc))];
  const rootPC = pc(rootMidi);

  const hasPC = (p) => pcs.includes(p);

  // Determine chord tones: 3rd (minor/major) and 5th (perf/dim/aug)
  const pcMin3 = (rootPC + 3) % 12;
  const pcMaj3 = (rootPC + 4) % 12;
  const pcP5   = (rootPC + 7) % 12;
  const pcDim5 = (rootPC + 6) % 12;
  const pcAug5 = (rootPC + 8) % 12;

  const thirdPC =
    hasPC(pcMin3) ? pcMin3 :
    hasPC(pcMaj3) ? pcMaj3 : null;

  const fifthPC =
    hasPC(pcP5) ? pcP5 :
    hasPC(pcDim5) ? pcDim5 :
    hasPC(pcAug5) ? pcAug5 : null;

  // Helper: pick a MIDI note of a pitch-class near a target, then fold into range
  const pcToMidiNear = (pitchClass, targetMidi, lo, hi) => {
    let n = targetMidi - ((targetMidi - pitchClass) % 12);
    while (pc(n) !== pitchClass) n += 12;
    return foldIntoRange(n, lo, hi);
  };

  // --- Left hand: root anchor (thick) ---
  const out = [];

  let lhRoot = foldIntoRange(rootMidi, leftRange[0], leftRange[1]);
  out.push(lhRoot);

  if (addLeftOctave) {
    let lhOct = lhRoot + 12;
    if (lhOct <= leftRange[1] + 7) out.push(lhOct); // allow a little spillover
  }

  if (addLeftFifth && fifthPC != null) {
    // Put 5th above the LH root if possible, else below
    let lh5 = pcToMidiNear(fifthPC, lhRoot + 7, leftRange[0], leftRange[1] + 12);
    // Avoid duplicating exact notes
    if (!out.includes(lh5)) out.push(lh5);
  }

  // --- Right hand: triad cluster (thick but not muddy) ---
  const rhMid = Math.round((rightRange[0] + rightRange[1]) / 2);

  // Build RH triad: root, 3rd, 5th (as available)
  const rh = [];

  const rhRoot = pcToMidiNear(rootPC, rhMid, rightRange[0], rightRange[1]);
  rh.push(rhRoot);

  if (thirdPC != null) rh.push(pcToMidiNear(thirdPC, rhRoot + 4, rightRange[0], rightRange[1]));
  if (fifthPC != null) rh.push(pcToMidiNear(fifthPC, rhRoot + 7, rightRange[0], rightRange[1]));

  // Keep RH ordered and spread a bit
  rh.sort((a, b) => a - b);

  // Optional RH octave of root for “shine”
  if (addRightOctave) {
    const rhOct = rhRoot + 12;
    if (rhOct <= rightRange[1] && !rh.includes(rhOct)) rh.push(rhOct);
  }

  // Merge, de-dup exact MIDI notes, sort
  const merged = [...out, ...rh]
    .filter((n) => typeof n === "number")
    .sort((a, b) => a - b)
    .filter((n, idx, arr) => idx === 0 || n !== arr[idx - 1]);

  // Safety: cap notes (keep lowest + then highest “musical” tones)
  if (merged.length > maxNotes) {
    // keep bass root, then keep top notes
    const bass = merged[0];
    const top = merged.slice(1).slice(-(maxNotes - 1));
    return [bass, ...top].sort((a, b) => a - b);
  }

  return merged;
}

 chordToMidi(octave = 4, mainChord,voicing='') {
  // Handle inversion first: "Cmin7/Eb"
  const { main, bass } = this.splitChordAndBass(mainChord);

  // Normalize accidentals in main chord and bass note
  let chord = main.replace('♯', '#').replace('♭', 'b');
  let bassNote = bass ? bass.replace('♯', '#').replace('♭', 'b') : null;

  // Parse root
  let root = "";
  let i = 0;

  if ((i < chord.length) && (((chord[i] >= 'A') && (chord[i] <= 'G')) || (chord[i] == 'Z'))) {
    root += chord[i]; i++;
  }
  if ((i < chord.length) && ((chord[i] == '#') || (chord[i] == 'b'))) {
    root += chord[i]; i++;
  }

  // Optional octave digit right after root (your existing behavior)
  /*
  if ((i < chord.length) && ((chord[i] >= '0') && (chord[i] <= '9'))) {
    octave = parseInt(chord[i]); i++;
  }
  */

// Optional octave digit ONLY if it looks like an octave spec (e.g., C4maj7)
// If it's end/operator/slash, it's almost certainly a chord extension (G7, C9, etc.)
if ((i < chord.length) && (chord[i] >= '0') && (chord[i] <= '9')) {
  const next = (i + 1 < chord.length) ? chord[i + 1] : '';
  if (/[A-Za-z(]/.test(next)) {   // only then treat as octave
    octave = parseInt(chord[i], 10);
    i++;
  }
}

  let remaining = chord.substring(i);

  // Split type vs duration operator (* / + -)
  let ntypeA = remaining.split(/[*+\-/]/);
  let ntypeRaw = (ntypeA[0].length === 0) ? "maj" : ntypeA[0];

  let oper = '';
  let fact = 0;
  if (ntypeA.length === 2) {
    let ol = i + ntypeA[0].length;
    oper = chord.substring(ol, ol + 1);
    fact = parseInt(ntypeA[1]);
  }

  // Rest chord
  if (root === 'Z') return [ true, root, octave, ntypeRaw, oper, fact, [] ];

  // Validate root
  if (this.noteToMidi[root] === undefined) {
    console.log("root not found:", root, this.noteToMidi[root]);
    return [ false, root, octave, ntypeRaw, oper, fact, [] ];
  }

  // Normalize chord type aliases
  let ntype = this.normalizeChordType(ntypeRaw);

  // Root MIDI
  let rootMidi = this.GetMidiForName(octave, root);
  

// Normalize chord type aliases + parse modifiers
const { baseKey, mods, minorMajor7 } = this.parseQualityAndMods(ntypeRaw);

let baseIntervals = this.chordFormulas[baseKey];
if (!baseIntervals) {
  console.log("base chord not found:", baseKey, "from:", ntypeRaw);
  return [ false, root, octave, ntypeRaw, oper, fact, [] ];
}

// Apply alterations/extensions
const finalIntervals = this.applyModsToIntervals(baseKey, baseIntervals, mods, minorMajor7);

// Build MIDI notes
let midiNotes = finalIntervals.map(interval => rootMidi + interval);

if (voicing=='piano')
{
    midiNotes = this.voiceChordPianoFriendly(rootMidi, midiNotes, {
    leftRange: [36, 55],
    rightRange: [60, 84],
    maxNotes: 5
    });
} else if (voicing=='pop')
{
    midiNotes = this.voiceChordPopTriad(rootMidi, midiNotes, {
    addLeftOctave: true,
    addLeftFifth: true,
    addRightOctave: true,
    maxNotes: 6
    });
}

  // Apply slash bass, if present
  if (bassNote) {
    // Allow bass note to include octave digit like "E3"
    let bn = bassNote;
    let bOct = octave;
    const m = bn.match(/^([A-Ga-g])([#b]?)(\d+)?$/);
    if (m) {
      bn = m[1].toUpperCase() + (m[2] || "");
      if (m[3] != null) bOct = parseInt(m[3], 10);
    } else {
      // If invalid, ignore slash to avoid crashing
      bn = null;
    }

    if (bn && this.noteToMidi[bn] !== undefined) {
      let bassMidi = this.GetMidiForName(bOct, bn);

      // Ensure bass is the lowest note:
      // If bass is higher than current lowest, drop it by octaves until it sits below.
      while (bassMidi >= Math.min(...midiNotes)) bassMidi -= 12;

      // Remove duplicates (same pitch class in same octave)
      midiNotes = midiNotes.filter(n => n !== bassMidi);
      midiNotes.unshift(bassMidi);
    }
  }

  return [ true, root, octave, ntypeRaw, oper, fact, midiNotes ];
}


    GetMidiForName(octave,note)
  {
      note = note.replace('♯', '#').replace('♭', 'b');
      return this.noteToMidi[note] !== undefined ? this.noteToMidi[note] + (12 * (octave + 1)) : null; // We start from -2 octave
  }
  
  GetNameFromMidi(midi, preferSharps = true) {
  if (typeof midi !== "number") return null;

  const sharpNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flatNames  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

  const names = preferSharps ? sharpNames : flatNames;

  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;  // MIDI 60 = C4

  return names[pc] + octave;
}

  MidiInstrumentNames = [
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavi",
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Choir Aahs",
  "VoiceGroup Oohs",
  "Synth Choir",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bagpipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Attack Helicopter",
  "Applause",
  "Gunshot",
  
  "Percussion"
];

soundfont_instruments= {
    "0": "acoustic_grand_piano",
    "1": "bright_acoustic_piano",
    "2": "electric_grand_piano",
    "3": "honkytonk_piano",
    "4": "electric_piano_1",
    "5": "electric_piano_2",
    "6": "harpsichord",
    "7": "clavichord",
    "8": "celesta",
    "9": "glockenspiel",
    "10": "music_box",
    "11": "vibraphone",
    "12": "marimba",
    "13": "xylophone",
    "14": "tubular_bells",
    "15": "dulcimer",
    "16": "drawbar_organ",
    "17": "percussive_organ",
    "18": "rock_organ",
    "19": "church_organ",
    "20": "reed_organ",
    "21": "accordion",
    "22": "harmonica",
    "23": "tango_accordion",
    "24": "acoustic_guitar_nylon",
    "25": "acoustic_guitar_steel",
    "26": "electric_guitar_jazz",
    "27": "electric_guitar_clean",
    "28": "electric_guitar_muted",
    "29": "overdriven_guitar",
    "30": "distortion_guitar",
    "31": "guitar_harmonics",
    "32": "acoustic_bass",
    "33": "electric_bass_finger",
    "34": "electric_bass_pick",
    "35": "fretless_bass",
    "36": "slap_bass_1",
    "37": "slap_bass_2",
    "38": "synth_bass_1",
    "39": "synth_bass_2",
    "40": "violin",
    "41": "viola",
    "42": "cello",
    "43": "contrabass",
    "44": "tremolo_strings",
    "45": "pizzicato_strings",
    "46": "orchestral_harp",
    "47": "timpani",
    "48": "string_ensemble_1",
    "49": "string_ensemble_2",
    "50": "synthstrings_1",
    "51": "synthstrings_2",
    "52": "choir_aahs",
    "53": "voice_oohs",
    "54": "synth_voice",
    "55": "orchestra_hit",
    "56": "trumpet",
    "57": "trombone",
    "58": "tuba",
    "59": "muted_trumpet",
    "60": "french_horn",
    "61": "brass_section",
    "62": "synthbrass_1",
    "63": "synthbrass_2",
    "64": "soprano_sax",
    "65": "alto_sax",
    "66": "tenor_sax",
    "67": "baritone_sax",
    "68": "oboe",
    "69": "english_horn",
    "70": "bassoon",
    "71": "clarinet",
    "72": "piccolo",
    "73": "flute",
    "74": "recorder",
    "75": "pan_flute",
    "76": "blown_bottle",
    "77": "shakuhachi",
    "78": "whistle",
    "79": "ocarina",
    "80": "lead_1_square",
    "81": "lead_2_sawtooth",
    "82": "lead_3_calliope",
    "83": "lead_4_chiff",
    "84": "lead_5_charang",
    "85": "lead_6_voice",
    "86": "lead_7_fifths",
    "87": "lead_8_bass_lead",
    "88": "pad_1_new_age",
    "89": "pad_2_warm",
    "90": "pad_3_polysynth",
    "91": "pad_4_choir",
    "92": "pad_5_bowed",
    "93": "pad_6_metallic",
    "94": "pad_7_halo",
    "95": "pad_8_sweep",
    "96": "fx_1_rain",
    "97": "fx_2_soundtrack",
    "98": "fx_3_crystal",
    "99": "fx_4_atmosphere",
    "100": "fx_5_brightness",
    "101": "fx_6_goblins",
    "102": "fx_7_echoes",
    "103": "fx_8_scifi",
    "104": "sitar",
    "105": "banjo",
    "106": "shamisen",
    "107": "koto",
    "108": "kalimba",
    "109": "bag_pipe",
    "110": "fiddle",
    "111": "shanai",
    "112": "tinkle_bell",
    "113": "agogo",
    "114": "steel_drums",
    "115": "woodblock",
    "116": "taiko_drum",
    "117": "melodic_tom",
    "118": "synth_drum",
    "119": "reverse_cymbal",
    "120": "guitar_fret_noise",
    "121": "breath_noise",
    "122": "seashore",
    "123": "bird_tweet",
    "124": "telephone_ring",
    "125": "helicopter",
    "126": "applause",
    "127": "gunshot",
    "128": "percussion"
  }



  MidiDrumNames={

    //GS extensions
    27 : "High Q or Filter Snap",
    28 : "Slap Noise",
    29 : "Scratch Push",
    30 : "Scratch Pull",
    31 : "Drum sticks",
    32 : "Square Click",
    33 : "Metronome Click",
    34 : "Metronome Bell",
    
    //Midi Standard
    35 : "Low Bass Drum",
    36 : "High Bass Drum",
    37 : "Side Stick",
    38 : "Acoustic Snare",
    39 : "Hand Clap",
    40 : "Electric Snare or Rimshot",
    41 : "Low Floor Tom",
    42 : "Closed Hi-hat",
    43 : "High Floor Tom",
    44 : "Pedal Hi-hat",
    45 : "Low Tom",
    46 : "Open Hi-hat",
    47 : "Low-Mid Tom",
    48 : "High-Mid Tom",
    49 : "Crash Cymbal 1",
    50 : "High Tom",
    51 : "Ride Cymbal 1",
    52 : "Chinese Cymbal",
    53 : "Ride Bell",
    54 : "Tambourine",
    55 : "Splash Cymbal",
    56 : "Cowbell",
    57 : "Crash Cymbal 2",
    58 : "Vibraslap",
    59 : "Ride Cymbal 2",
    60 : "High Bongo",
    61 : "Low Bongo",
    62 : "Mute High Conga",
    63 : "Open High Conga",
    64 : "Low Conga",
    65 : "High Timbale",
    66 : "Low Timbale",
    67 : "High Agogô",
    68 : "Low Agogô",
    69 : "Cabasa",
    70 : "Maracas",
    71 : "Short Whistle",
    72 : "Long Whistle",
    73 : "Short Güiro",
    74 : "Long Güiro",
    75 : "Claves",
    76 : "High Woodblock",
    77 : "Low Woodblock",
    78 : "Mute Cuíca",
    79 : "Open Cuíca",
    80 : "Mute Triangle",
    81 : "Open Triangle",

    //GS extensions
    82 : "Shaker",
    83 : "Jingle Bell",
    84 : "Belltree",
    85 : "Castanets",
    86 : "Mute Surdo",
    87 : "Open Surdo",
}

drumAbbreviationMappings = {
    "BD" : { abbreviation: "BD", name: "Bass Drum",     midiNote: 36 },
    "KD" : { abbreviation: "KD", name: "Kick Drum",     midiNote: 36 },
    
    "RS" : { abbreviation: "RS", name: "Rim Shot",      midiNote: 37 },
    "SS" : { abbreviation: "SS", name: "Side Stick",    midiNote: 37 },

    "SD" : { abbreviation: "SD", name: "Snare Drum",    midiNote: 38 },

    "CP" : { abbreviation: "CP", name: "Clap",          midiNote: 39 },
    "CL" : { abbreviation: "CL", name: "Clap",          midiNote: 39 },
    
    "CH" : { abbreviation: "CH", name: "Closed Hi-Hat", midiNote: 42 },
    "OH" : { abbreviation: "OH", name: "Open Hi-Hat",   midiNote: 46 },

    "LT" : { abbreviation: "LT", name: "Low Tom",       midiNote: 45 },
    "MT" : { abbreviation: "MT", name: "Mid Tom",       midiNote: 47 },
    "HT" : { abbreviation: "HT", name: "High Tom",      midiNote: 50 },
    
    "CC" : { abbreviation: "CC", name: "Crash Cymbal",  midiNote: 49 },
    "CY" : { abbreviation: "CY", name: "Crash Cymbal",  midiNote: 49 },
    "RC" : { abbreviation: "RC", name: "Ride Cymbal",   midiNote: 51 },
    
    "CB" : { abbreviation: "CB", name: "Cowbell",       midiNote: 56 },
    "RD" : { abbreviation: "RD", name: "Ride Bell",     midiNote: 53 },
    "TT" : { abbreviation: "TT", name: "Tambourine",    midiNote: 54 },
    "HS" : { abbreviation: "HS", name: "Hi-Hat (Foot)", midiNote: 44 },

    "AC" : { abbreviation: "AC", name: "Accent", midiNote: 0 }
};
  

};