"use strict"

/*
# GridDJ User Manual

Welcome to GridDJ user Manual

In This Chapter we will see about GNote Notation.

Even though we support the ABC notation we felt that its too complex for quick Data entry
and quick repeats with recursion.

GNote Notation was created to quickly import Notes into the Piano roll without placing notes 
manually using mouse etc.

GNotes consist of lines of text You can have a Note Line and a Chord Line

The Lines start with Three characters

Example:  
#54 C 3(C)       D#     EbA CD  2(CD DE)  
&54 CMaj   Cmin   2(Cmin Cmin) 2(Cmin Dmin) 2(Fmaj7 Fmaj7)  

### Notes , Chords , Octave , Note Length
  
# Indicates that the Line Represents a Note Line ,   
& Indicates Chords.   


###########################
### Notes

You can use standard Note notation in upper case character for root note.  
Example : C D E F G H  

Sharp uses # symbol followed by the Note.  
Example : C# D#  

Flat uses lowercase b  chaacter followed by the Note.  
Example : Db Eb  

If you would like to specify the octave you can specify it as a number at the end  
Example : C6 Db4 F#3

### Controling the  Note Length

Normally the notes will play for the default note length   
Ex:  
#54 C  

Will Play C Note for 4 Slots.

If you want to Extend ( double ) the notelength you can use *2 .  
The note extends by the number of times you specify .

#54 C*2  
Will Play the C Note for 8 slots

#54 C*3  
Will Play the C Note for 12 slots

#54 C*4 D*3 E*2 F
Will Play the C Note for 16 slots followed by D for 12 slots and E for 8 and F for 4 slots.

You can shorten (Halve) the note length using the / character.

#54 C/2 D2/2 E F#/4
Will Play the C Note for 2 slots followed by D2(D In Octave 2) for 2 slots and E for 4 and F# for 1 slots.


Similarly if you want to add Slots instead of multiplying the defualt note length.
you can use + and -

#54 C+1 D-1
So C will play for 4+1=>5 slots and D for 4-1=>3 Slots.

##################

Reset notes are indicated by Z and follow the same time notation with * / + - .


### Playing multiple notes at the same time - Grouping.

To play multiple notes you should bunch the notes together without any spaces.
#54 CEG CEG
Will Play the CEG together for 4 slots , 2 times.

You can also control the leghth of the notes with . and ,  for individual notes.  
#54 C*2E/2G/2 C*2E*3G C*2E#/2Fb*2

### Repeating notes.

#54 C C C C 
You can repeat notes by specifying it multiple times or use the repeat notation N()
where N is the number of times to repeat the contents in the paranthesis ().

#54 4(C)
#54 2(C, D, CEG) D

You can also recurse the repeat pattern which is very powerfull. This can be used to repeat phrases.

#54 2(C, D, 3(CEG) ) D
#54 2(C, D, 3(C E G) ) D

### Chords

Chords are also use similar structure for repeating and need to be specified indivudually. 

&58 C D*2 E G

When nothing is specified its assumed to be a major chord.

Here are the specifiers for other chords.

- sus2  Suspended 2 
- sus4  Suspended 4
- maj7  Major 7
- min7  Minor 7
- dim7  Diminished 7
- m7b5  Half-diminished
- maj9  Major 9
- min9  Minor 9

- maj   Major
- min   Minor
- dim   Diminished
- aug   Augmented

- 11    Dominant 11
- 13    Dominant 13

- 7     Dominant 7    
- 9     Dominant 9

&58 Cmaj   Cmin   2(Cmin Cmin) 2(Cmin Dmin) 2(Fmaj7 Fmaj7)

&58 Cmaj Cmin

&58 Cmaj*2   Cmin R  2(Cmin Cmin) 2(Cmin Dmin) 2(Fmaj7 Fmaj7)

*/

// Removed special double-quote handling. Now the parser only cares about whitespace (for token boundaries)
// and parentheses (for grouping with parseRecursively).

class CNoteParser {

 tokenizeString(input) {
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

    let tokenContent = '';
    let parenDepth = 0;

    // Read until whitespace (when parenDepth is 0) or end of string.
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

  return tokens;
}

// Helper to deeply clone arrays (just for demonstration)
 deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

 parseRecursively(str) {
  const tokens = this.tokenizeString(str);
  const result = [];

  for (const t of tokens) {
    result.push(...this.parseToken(t));
  }

  return result;
}

 parseToken(token) {
  // If token matches the pattern N(...), replicate the inside N times.
  const match = token.match(/^([0-9]+)\((.*)\)$/);
  if (match) {
    const n = parseInt(match[1], 10);
    const inside = match[2].trim();
    const insideParsed = this.parseRecursively(inside);

    const repeated = [];
    for (let i = 0; i < n; i++) {
      repeated.push(this.deepClone(insideParsed));
    }
    return repeated;
  } else {
    // literal token
    return [token];
  }
}

// Flatten function to take an arbitrarily nested array and return a single-level array
 flattenArray(arr) {
  const flattened = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      flattened.push(...this.flattenArray(item));
    } else {
      flattened.push(item);
    }
  }
  return flattened;
}


 ImportGNotes(pat)
{

  let midiOutput = [];
  //let tokens = input.match(/\S+/g) || [];
  let linesA=pat.split("\n")
  let GRNotes=[];

  for(let i=0;i<linesA.length;i++)
  {
      let input=linesA[i].trim();if (input.length==0) continue;
      let tokens= this.parseRecursively(input);
      //console.log("input",input);
      //console.log("tokens",tokens);
      let Ftokens=this.flattenArray(tokens)
      //console.log("Flat",Ftokens);

      if (Ftokens[0][0]=='#')  // Notes.
      {
          let octave=gParseInt((Ftokens[0][1]) , 5);
          let notelen=gParseInt((Ftokens[0][2]) , 1);
          let fc=0;
          for(let c=1;c<Ftokens.length;c++)
          {
              // There can be multple Notes in one Note Token.
              fc=this.GetNotesFromToken(GRNotes,octave,fc,Ftokens[c],notelen);
          }
      }
      else if (Ftokens[0][0]=='&')  // Chords
      {
          let octave=gParseInt((Ftokens[0][1]) , 5);
          let notelen=gParseInt((Ftokens[0][2]) , 1);
          let fc=0;
          // Unlinke Notes, You dont play Multiple Chords at the same time so there can be
          // only one chord per token.
          for(let c=1;c<Ftokens.length;c++)
          {
              fc=this.GetChordsFromToken(GRNotes,octave,fc,Ftokens[c],notelen);
          }
      }
  }

  return GRNotes;
}



 GetNotesFromToken(GRNotes,octave,fc,input,notelen)
{
    let MaxRepeatC=0,midiNote=0,last_note;
    let slen=notelen;
    console.log("GetNotesFrom Token",octave,fc,input,notelen)

    for (let i = 0; i < input.length; i++) 
    {
        let char = input[i];
        let octave_t=octave;

        //console.log("------------------",i,char);

        let note = char.toUpperCase(); // Handle single-character notes like A, B, C...
        if ((i + 1 < input.length) && (input[i + 1] === "#" || input[i + 1] === "b")) {
            note += input[i + 1]; // Capture sharps/flats
            i++;
        }

        if ((i + 1 < input.length) && (input[i + 1] >= "0" && input[i + 1] <= "9")) {
            octave_t = gParseInt((input[i + 1]) ,octave); // Capture Octave
            i++;
        }

        //console.log(i,input[i]);

        if ((i + 1 < input.length) && input[i+1]=='*')
        {
          i+=2;
          let mulf=gParseInt((input[i]) , 0);
          slen=mulf*notelen
          //console.log("mulf",mulf,slen);
        }
        else if ((i + 1 < input.length) && input[i+1]=='/')
        {
          i+=2;
          let divf=gParseInt((input[i]) , 0);
          if (divf>1) slen=parseInt(notelen / divf );
          //console.log("divf",divf,slen);
        }
        else if ((i + 1 < input.length) && input[i+1]=='+')
        {
          i+=2;
          let addf=gParseInt((input[i]) , 0);
          slen=notelen+addf
          //console.log("addf",addf,slen);
        }
        else if ((i + 1 < input.length) && input[i+1]=='-')
        {
          i+=2;
          let subf=gParseInt((input[i]) , 0);
          if (subf>1) slen=notelen-subf;
          //console.log("subf",subf,slen);
        }
        

        if (slen>MaxRepeatC) MaxRepeatC=slen;
  
        if (note=='Z') continue;

        midiNote = chords.GetMidiForName(octave_t,note);
        console.log("GetMidiForName:","fc:"+fc,"o:"+octave_t,"N:"+note,"slen:"+slen,"midi:",midiNote);
        if (midiNote !== null) 
        {
          //CreateNotes(p,midiNote,fc,slen);
          GRNotes.push({ midi:midiNote ,  seq:fc ,  len: slen  })
        }
    }

    fc+=MaxRepeatC;
    console.log("\n")
    return fc;
}

 GetChordsFromToken(GRNotes,octave,fc,input,notelen)
{
    let slen=notelen;
    let [ret, root,roctave,ntype,oper,fact, midiNotes ]=chords.chordToMidi(octave,input);
    

    if (oper=='*')
    {
      slen=fact*notelen
      //console.log("mulf",mulf,slen);
     }
    else if (oper=='/')
    {
      if (fact>1) slen=parseInt(notelen / fact );
      //console.log("divf",divf,slen);
    }
    else if (oper=='+')
    {
      slen=notelen+fact
      //console.log("addf",addf,slen);
      
    }
    else if (oper=='-')
    {
      if (fact>1) slen=notelen-fact;
      //console.log("subf",subf,slen);
    }    

    //console.log("GetChordsFrom Token",fc,"root:"+root,"typ:"+ntype,midiNotes);
    //midiOutput.push(midiNotes);

    for(let i=0;i<midiNotes.length;i++)
    {
      //CreateNotes(p,midiNotes[i],fc,slen);
      GRNotes.push({ midi:midiNotes[i] ,  seq:fc ,  len: slen  })
    }

    fc+=slen
    return fc;
}

}
