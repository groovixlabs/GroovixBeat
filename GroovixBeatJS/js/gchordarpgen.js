"use strict"


class ArpeggioPatterns {
    constructor(params) {
      this.steps = params.steps;
      this._loadPatterns();
      this.updatePatterns = this.pubUpdatePatterns;
    };
    
    pubUpdatePatterns(params) {
      this.steps = params.steps;
      this._loadPatterns();
    };
    
    _loadPatterns() {
      this.arr = [];
      this.patterns = [];
      for(let i = 0; i < this.steps; i++) { this.arr.push(i); }
      this._used = [];
      this.permutations = this._permute(this.arr);
      this.looped = this._loop();
      this.patterns = {
        straight: this.permutations,
        looped: this.looped
      };
    };
    
    _permute(input, permutations) {
      permutations = permutations || [];
      var i, ch;
      for (i = 0; i < input.length; i++) {
        ch = input.splice(i, 1)[0];
        this._used.push(ch);
        if (input.length === 0) {
          permutations.push(this._used.slice());
        }
        this._permute(input, permutations);
        input.splice(i, 0, ch);
        this._used.pop();
      }
      return permutations;
    };
    
    _loop() {
      let looped = [];
      for(let p = 0; p < this.permutations.length; p++) {
        let perm = this.permutations[p];
        let arr = Array.from(perm);
        for(let x = 1; x < perm.length - 1; x++) {
          arr.push(perm[perm.length - 1 - x]);
        }
        looped.push(arr);
      }
      return looped;
    };
    
  };

class CChordARPGen {

  modes= [
          'ionian', 'dorian', 'phrygian', 
          'lydian', 'mixolydian', 'aeolian',
          'locrian', 'major', 'minor', 
          'melodic', 'harmonic'
        ]

  note_keys= 'C C# D D# E F F# G G# A A# B'.split(' ');

 GetModes()
{
  return this.modes
}

 GetNoteKeys()
{
  return this.note_keys
}


 GetArpeggioPatterns(ap_steps)
{
  return new ArpeggioPatterns({ steps: ap_steps })
}

  
  
  
   genScaleTriads(offset) {
      // this is ionian, each mode bumps up one offset.
      let base = 'maj min min maj maj min dim'.split(' ');
      let triads = [];
      for(let i = 0; i < base.length; i++) {
        triads.push(base[(i + offset) % base.length]);
      }
      return triads;
    };
  
   scales = {
          ion: {
            name: 'Ionian',
            intervels: 'W W H W W W H',
            dominance: [3,0,1,0,2,0,1],
            triads: this.genScaleTriads(0)
          },
          dor: {
            name: 'Dorian',
            intervels: 'W H W W W H W',
            dominance: [3,0,1,0,2,2,1],
            triads: this.genScaleTriads(1)
          },
          phr: {
            name: 'Phrygian',
            intervels: 'H W W W H W W',
            dominance: [3,2,1,0,2,0,1],
            triads: this.genScaleTriads(2)
          },
          lyd: {
            name: 'Lydian',
            intervels: 'W W W H W W H',
            dominance: [3,0,1,2,2,0,1],
            triads: this.genScaleTriads(3)
          },
          mix: {
            name: 'Mixolydian',
            intervels: 'W W H W W H W',
            dominance: [3,0,1,0,2,0,2],
            triads: this.genScaleTriads(4)
          },
          aeo: {
            name: 'Aeolian',
            intervels: 'W H W W H W W',
            dominance: [3,0,1,0,2,0,1],
            triads: this.genScaleTriads(5)
          },
          loc: {
            name: 'Locrian',
            intervels: 'H W W H W W W',
            dominance: [3,0,1,0,3,0,0],
            triads: this.genScaleTriads(6)
          },
          mel: {
            name: 'Melodic Minor',
            intervels: 'W H W W W W H',
            dominance: [3,0,1,0,3,0,0],
            triads: 'min min aug maj maj dim dim'.split(' ')
          },
          har: {
            name: 'Harmonic Minor',
            intervels: 'W H W W H WH H',
            dominance: [3,0,1,0,3,0,0],
            triads: 'min dim aug min maj maj dim'.split(' ')
          }
        };
  
  
   flat_sharp= {
          Cb: 'B',
          Db: 'C#',
          Eb: 'D#',
          Fb: 'E',
          Gb: 'F#',
          Ab: 'G#',
          Bb: 'A#'
        }
  
  /*
  let triads_seq= {
          maj: [0,4,7],
          min: [0,3,7],
          dim: [0,3,6],
          aug: [0,4,8]
        }
  
  const chordFormulas = {
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
  
      "11": [0, 4, 7, 10, 14, 17], // Dominant 11
      "13": [0, 4, 7, 10, 14, 21],  // Dominant 13
  
      "7": [0, 4, 7, 10],       // Dominant 7    
      "9": [0, 4, 7, 10, 14]   // Dominant 9
  };
  */
  
  // this is so that we can map minor and aeolian to the same struct
   ModeNameMap={
        minor: 'aeo',
        major: 'ion',
        ionian: 'ion',
        dorian: 'dor',
        phrygian: 'phr',
        lydian: 'lyd',
        mixolydian: 'mix',
        aeolian: 'aeo',
        locrian: 'loc',
        melodic: 'mel',
        harmonic: 'har'
      };
  
   GenSteps(steps_str)
      {
      let arr = steps_str.split(' ');
      let offsets = [0];
      let keys = [this.note_keys[0]];
  
      let step = 0;
      for(let i = 0; i < arr.length - 1; i++) {
        let inc = 0;
        switch(arr[i]) {
          case 'W':
            inc = 2; break;
          case 'H':
            inc = 1; break;
          case 'WH':
            inc = 3; break;
        }
        step += inc;
        offsets.push(step);
  
        keys.push(this.note_keys[step])
      }
      return {offsets:offsets,keys:keys};
    }
  
     IntervalFromType(step, type) 
    {
      let steps = 'i ii iii iv v vi vii'.split(' ');
      let s = steps[step];
      switch(type) {
        case 'maj':
          s = s.toUpperCase(); break;
        case 'min':
          // s = s; // To Avoid lint error
          break;
        case 'aug':
          s = s.toUpperCase() + '+'; break;
        case 'dim':
          s = s + '°'; break;
      }
      return s;
    };
  
    // create a chord of notes based on chord type
     GenChordNotes(s, offset, octave, t) {
      // get the steps for this chord type
      let steps = chords.chordFormulas[t];
      // instantiate the chord
      let chord = { type: t, interval: this.IntervalFromType(s, t), notes: [] };
      // load the notes
      
      for(let i = 0; i < steps.length; i++) {
        let step = steps[i];
        let idx = (offset + step) % this.note_keys.length;
        // relative octave to base
        let rel_octave = (offset + step) > this.note_keys.length - 1 ? octave + 1 : octave;
        // define the note
        chord.notes.push({ pitch: this.note_keys[idx], rel_octave: rel_octave });
      }
      return chord;
    };
  
  
  //console.log(keys);
  
   GetNotes(tonic_root_key,scale_mode)
  {
  //let tonic_root_key="C";
  //let scale_mode="minor";//"major"
  let tmode=this.ModeNameMap[scale_mode];
  console.log(tmode,this.scales[tmode]);
  
  let intervels=this.scales[tmode].intervels;
  let scale_triads=this.scales[tmode].triads;
  console.log("intervels",intervels,"scale_triads",scale_triads);
  
  let steps=this.GenSteps(intervels);
  console.log("GenSteps:",this.scales[tmode].name,steps);
  
  
  let offset = this.note_keys.indexOf(tonic_root_key);
  let notes=[];
  let note_offsets=steps.offsets
  for(let s = 0; s < note_offsets.length; s++) {
      let step = note_offsets[s];
      let idx = (offset + step) % this.note_keys.length;
      // relative octave. 0 = same as root, 1 = next ocave up
      let rel_octave = (offset + step) > this.note_keys.length - 1 ? 1 : 0;
      // generate the relative triads
      //let triad =[];
      let chordnotes = this.GenChordNotes(s, idx, rel_octave, scale_triads[s]);
      // define the note
      let note = { step: s, pitch: this.note_keys[idx], rel_octave: rel_octave, chordnotes: chordnotes };
      // add the note
      notes.push(note);
  }
  return notes;
  }

  

  GetARPPatterns(obj)
{
  let fc=0;
  let GRNotes=[];
  console.log("GetARPPatterns",obj);

  let notes=this.GetNotes(obj.RootTonic,obj.ScaleMode)

  let ChordDuration=obj.ChordDuration;
  // ARP will Modify the obj.ChordDuration
  let ArpegeoPatA=[];
  if (obj.ArpLen>0)
  {
    console.log("________________________________________")
    if (typeof(obj.ArpegeoPat)=='string')
      ArpegeoPatA=obj.ArpegeoPat.split(" ");
    else
      ArpegeoPatA=obj.ArpegeoPat

    console.log("ArpegeoPat:",ArpegeoPatA)
    ChordDuration=ArpegeoPatA.length*obj.ARPRepeat;
  }
  
  for(let cp=0;cp<obj.ChordProgList.length;cp++)
  {
      let chord=obj.ChordProgList[cp]
      console.log("InsertChord Progression:",chord,notes[chord]);
      let chord_notes=notes[chord].chordnotes.notes
      console.log("InsertChord Progression ----- ",cp,chord,chord_notes);
      let chord_note_count=chord_notes.length;
        
        if (obj.NeedChords)
        {
          for(let n=0;n<chord_note_count;n++)
          {
            let midi=chords.GetMidiForName(obj.ChordOctave+(chord_notes[n].rel_octave),chord_notes[n].pitch)
            GRNotes.push({ midi:midi ,  seq:fc ,  len: ChordDuration*obj.ARPDuration  });
          }
        }
        
        if (obj.ArpLen>0)
        {
          for(let arpi=0;arpi<ChordDuration;arpi++)
          {
            let player_step=(arpi) % ArpegeoPatA.length
            let arpnote = chord_notes[ArpegeoPatA[player_step] % chord_note_count ];
            let arpnote_adj_octave=parseInt(ArpegeoPatA[player_step] / chord_note_count); // When ARP Index is greater than the current chord count.
          
            let midi=chords.GetMidiForName(obj.ARPOctave+(arpnote.rel_octave)+arpnote_adj_octave,arpnote.pitch)
            GRNotes.push({ midi:midi ,  seq:fc+(arpi*obj.ARPDuration) ,  len: obj.ARPDuration });
          }
          
        }

      fc+=(ChordDuration*obj.ARPDuration);
  }

  let barcount=parseInt(fc/(g_CellsPerBeat*g_BeatsPerBar));
  return [GRNotes,barcount]
}

}