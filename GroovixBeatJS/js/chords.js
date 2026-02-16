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

 chordToMidi(octave = 4,mainChord) {

    // Parse inversion (if present)
    //let [mainChord, bassNote] = chord.split("/");
    // Extract root and chord type
    /*
    const match = mainChord.match(/^([A-Ga-g#b]+)(.*)$/);
    if (!match) {console.log("No Match:",mainChord);return [ "","", [] ];}

    const root = match[1].replace('♯', '#').replace('♭', 'b');
    const mtype = match[2] ?? "";  // We send this back for length adjustment to let the tokenizer figure out the timing.
    */

    mainChord=mainChord.replace('♯', '#').replace('♭', 'b');
    let root="";
    let i=0;
    if ((i < mainChord.length) && (((mainChord[i]>='A')&&(mainChord[i]<='G')) || (mainChord[i]=='Z') ))
    {
      root+=mainChord[i];i++;
    }
    if ((i < mainChord.length) && ((mainChord[i]=='#')||(mainChord[i]=='b')))
    {
      root+=mainChord[i];i++;
    }
    if ((i < mainChord.length) && ((mainChord[i]>='0')&&(mainChord[i]<='9')))
    {
      octave=parseInt(mainChord[i]);i++;
    }
    let remaining=mainChord.substring(i)
    console.log(i,mainChord,"remaining:",remaining);
    let ntypeA=remaining.split(/[*+\-/]/) ;
    let ntype="",fact=0;
    let oper='';
    if (ntypeA[0].length==0) ntype='maj';else ntype=ntypeA[0];
    if (ntypeA.length==2) 
    {
      let ol=i+ntypeA[0].length;
      oper=mainChord.substring(ol,ol+1);
      fact=parseInt(ntypeA[1]);
    }
    //console.log(mainChord,"root:"+root,"o:"+octave,"typ:",ntypeA,"ntype",ntype,"oper",oper,"fact",fact);

    if (root=='Z') return [ true,root,octave,ntype,oper,fact, [] ];

    if (this.noteToMidi[root]==undefined) {console.log("root not found:",root,this.noteToMidi[root]);return [ false,root,octave,ntype,oper,fact, [] ];} // Invalid chord
    //let rootMidi = noteTo Midi[root] + (12 * (octave + 2));
    let rootMidi =this.GetMidiForName(octave,root);


    let chordFormula = Object.keys(this.chordFormulas).find(key => ntype.startsWith(key));
    if (chordFormula==undefined) 
      {
        console.log("chord Formulas not found:",ntype);
        return [ false,root,octave,ntype,oper,fact, [] ];
      } // Invalid chord

    let midiNotes = this.chordFormulas[chordFormula].map(interval => rootMidi + interval);
    //console.log("chordFormula:",chordFormula,"midiNotes:",midiNotes);

    return [true, root,octave,ntype,oper,fact, midiNotes ];


/*    //if (ntype.length==0) ntype="maj";// Default to major if no suffix
    //console.log("match:",match,type);

    // Get MIDI number of root
    if (noteToMidi[root]==undefined) {console.log("root not found:",root,noteToMidi[root]);return [ root,mtype, [] ];}
    let rootMidi = noteToMidi[root] + (12 * (octave + 1));
    console.log("rootMidi:",rootMidi);

    // Find the chord formula

    let chordFormula = Object.keys(chordFormulas).find(key => ntype.startsWith(key));
    if (chordFormula==undefined) {console.log("chordFormulas not found:",mtype,ntype);return [ root,mtype, [] ];} // Invalid chord

    return;

    // Generate MIDI notes
    let midiNotes = chordFormulas[chordFormula].map(interval => rootMidi + interval);
    //console.log("chordFormula:",chordFormula,"midiNotes:",midiNotes);

    // Handle inversion (if present)
    if (bassNote) {
        bassNote = bassNote.replace('♯', '#').replace('♭', 'b');
        if (!noteToMidi[bassNote]) return [];

        let bassMidi = noteToMidi[bassNote] + (12 * (octave + 1));
        
        // Ensure the bass note is the lowest note
        midiNotes = midiNotes.filter(note => note !== bassMidi);
        midiNotes.unshift(bassMidi);
    }

    return [ root,mtype,midiNotes];
*/    
}

/*
console.log(chordToMidi("C"));        // C Major: [60, 64, 67]
console.log(chordToMidi("Am"));       // A Minor: [57, 60, 64]
console.log(chordToMidi("Csus2"));    // C Suspended 2: [60, 62, 67]
console.log(chordToMidi("Cmaj9"));    // C Major 9: [60, 64, 67, 71, 74]
console.log(chordToMidi("G7"));       // G Dominant 7: [55, 59, 62, 65]
console.log(chordToMidi("Ddim7"));    // D Diminished 7: [62, 65, 68, 71]
console.log(chordToMidi("C/E"));      // C Major 1st inversion: [64, 67, 72, 60]
console.log(chordToMidi("G/B"));      // G Major 1st inversion: [59, 62, 67, 71]
console.log(chordToMidi("D/F#"));     // D Major 1st inversion: [54, 57, 62, 66]
*/


//************************************************************************************** */

/*
function stringToMidi(input, octave = 4) {

    const extractChord = (chord) => {
        let match = chord.match(/^([A-Ga-g#b]+)(.*)$/);
        if (!match) return [];

        const root = match[1].replace('♯', '#').replace('♭', 'b');
        const type = match[2] || "maj";

        if (!noteToMidi[root]) return [];
        let rootMidi = noteToMidi[root] + (12 * (octave + 1));

        let chordFormula = Object.keys(chordFormulas).find(key => type.startsWith(key));
        if (!chordFormula) return []; 

        return chordFormulas[chordFormula].map(interval => rootMidi + interval);
    };

    const extractNote = (note) => {
        note = note.replace('♯', '#').replace('♭', 'b');
        return noteToMidi[note] !== undefined ? noteToMidi[note] + (12 * (octave + 1)) : null;
    };

    let midiOutput = [];
    let isChord = false;
    let chordBuffer = "";

    for (let i = 0; i < input.length; i++) {
        let char = input[i];

        if (char === '"') {
            if (isChord) {
                midiOutput.push(extractChord(chordBuffer.trim()));
                chordBuffer = "";
            }
            isChord = !isChord;
        } else if (isChord) {
            chordBuffer += char;
        } else if (char === " ") {
            continue; // Ignore spaces
        } else {
            let note = char.toUpperCase(); // Handle single-character notes like A, B, C...
            if (i + 1 < input.length && (input[i + 1] === "#" || input[i + 1] === "b")) {
                note += input[i + 1]; // Capture sharps/flats
                i++;
            }
            let midiNote = extractNote(note);
            if (midiNote !== null) {
                midiOutput.push(midiNote);
            }
        }
    }

    return midiOutput;
}


// 🎹 Test Cases:
console.log(stringToMidi('A "CMaj" C D')); // [69, [60, 64, 67], 60, 62]
console.log(stringToMidi('"Amaj" CMaj D "Cmin"')); // [[57, 61, 64], [60, 64, 67], 62, [60, 63, 67]]
console.log(stringToMidi('"Amaj" D E F G "Cmin"')); // [[57, 61, 64], 62, 64, 65, 67, [60, 63, 67]]
console.log(stringToMidi('"G7" B "Fmaj7" A')); // [[55, 59, 62, 65], 59, [53, 57, 60, 64], 69]
*/



// We'll modify the tokenizeString function to preserve the double quotes in the token.
// Then in parseToken, if a token is wrapped in quotes, we'll treat it as a literal.
// This allows us to distinguish quoted tokens from regular tokens.
/*
function tokenizeString(input) {
    const tokens = [];
    let i = 0;
  
    function skipWhitespace() {
      while (i < input.length && /\s/.test(input[i])) {
        i++;
      }
    }
  
    while (i < input.length) {
      skipWhitespace();
      if (i >= input.length) break;
  
      // If we start with a double quote, record the entire quoted string, including quotes.
      if (input[i] === '"') {
        // Mark the start
        const start = i;
        i++; // skip the opening quote
        // Move until we find the closing quote (simplified, ignoring escape sequences)
        while (i < input.length && input[i] !== '"') {
          i++;
        }
        // If we found a closing quote, move one more char to include it.
        if (i < input.length && input[i] === '"') {
          i++;
        }
        const end = i;
        tokens.push(input.substring(start, end));
      } else {
        // Otherwise, read a token that might contain nested parentheses.
        let tokenContent = '';
        let parenDepth = 0;
  
        while (
          i < input.length && (
            !/\s/.test(input[i]) || parenDepth > 0
          )
        ) {
          const c = input[i];
          if (c === '(') {
            parenDepth++;
          } else if (c === ')') {
            if (parenDepth > 0) {
              parenDepth--;
            }
          }
          tokenContent += c;
          i++;
        }
  
        tokens.push(tokenContent);
      }
    }
  
    return tokens;
  }
  
  // Helper to deeply clone arrays (just for demonstration)
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  
  function parseRecursively(str) {
    const tokens = tokenizeString(str);
    const result = [];
  
    for (const t of tokens) {
      result.push(...parseToken(t));
    }
  
    return result;
  }
  
  function parseToken(token) {
    // If token starts with a double quote and ends with a double quote,
    // treat as a literal (i.e., do not interpret as N(...)).
    if (token.length >= 2 && token[0] === '"' && token[token.length - 1] === '"') {
      return [token];
    }
  
    // Otherwise, check if it matches the pattern N(...)
    const match = token.match(/^([0-9]+)\((.*)\)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      const inside = match[2].trim();
      const insideParsed = parseRecursively(inside);
  
      const repeated = [];
      for (let i = 0; i < n; i++) {
        repeated.push(deepClone(insideParsed));
      }
      return repeated;
    } else {
      // literal token
      return [token];
    }
  }

  // Flatten function to take an arbitrarily nested array and return a single-level array
function flattenArray(arr) {
    const flattened = [];
    for (const item of arr) {
      if (Array.isArray(item)) {
        flattened.push(...flattenArray(item));
      } else {
        flattened.push(item);
      }
    }
    return flattened;
  }
  */


    GetMidiForName(octave,note)
  {
      note = note.replace('♯', '#').replace('♭', 'b');
      return this.noteToMidi[note] !== undefined ? this.noteToMidi[note] + (12 * (octave + 1)) : null; // We start from -2 octave
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