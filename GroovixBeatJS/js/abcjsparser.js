"use strict"

class CABCParser
{

 ParseABCNotationUsingABCJS(abcString)
{

let parserParams = {
      stop_on_warning: true,
      hint_measures: true,
      warnings: function (msg, line, charPos) {
        console.log("ABCJS warning:", msg, "on line:", line, "char:", charPos);
      }
    };

    let tunes = ABCJS.parseOnly(abcString, parserParams);
    let tune = tunes[0]; // We'll just handle the first tune.
    let DurationPerBeat= tune.getBeatLength() / tune.getBeatsPerMeasure();
    
    console.log("getBeatLength",tune.getBeatLength());
    console.log("getBeatsPerMeasure",tune.getBeatsPerMeasure());
    console.log("DurationPerBeat",DurationPerBeat);

    console.log("getBarLength",tune.getBarLength());
    console.log("getBeatsPerMeasure",tune.getBeatsPerMeasure());
    console.log("millisecondsPerMeasure",tune.millisecondsPerMeasure());

    
/*
addElementToEvents
getBarLength
getBeatLength
getBeatsPerMeasure
getBpm
getElementFromChar
getKeySignature
getMeter
getMeterFraction
getPickupLength
getSelectableArray
getTotalBeats
getTotalTime
lines
makeVoicesArray
media :  "screen"
metaText : {title: "Cooley's", rhythm: 'reel'}
metaTextInfo : {title: {…}, rhythm: {…}}
meter :  {num: 4, den: 4}
millisecondsPerMeasure
setTiming
setUpAudio
setupEvents
version : "1.1.0"
*/




/*    
options = {
	midiOutputType: "encoded" | "binary" | "link",
    // The following OPTIONAL parameters are only used when the type is "link":
    downloadClass: "class-name-to-add",
    preTextDownload: "text that appears before the link",
    downloadLabel: function() | "the text that appears as the body of the anchor tag that is clickable",
    postTextDownload: "text that appears after the link",
    fileName: "the name of the file that the midi will be saved as"
}
*/
    let midibin=ABCJS.synth.getMidiFile(tune, { midiOutputType: 'binary', bpm: 100 })
    const midi = new Midi(midibin);


if (!tunes.length) {
    console.log("No tunes found in ABC string.");
    throw new Error("No tunes parsed.");
  }
  
  return this.GetNoteArrayFromMidi(midi);
}

GetNoteArrayFromMidi(midi)
{
  let gNoteItems = []; // We'll collect { time, type, pitch } objects.
  let seq=0;
  let len=0;
  //console.log(midi)
  
  let PPQ=parseInt( midi.header.ppq ?? 480 );

  let track=0;
  midi.tracks.forEach(track => {
    //tracks have notes and controlChanges
  
    let gNotes=[];
    //console.log("TRACK:",track);
    //notes are an array
    const notes = track.notes


    //they are also aliased to the CC number's common name (if it has one)
    //console.log("controlChanges",JSON.stringify(track.controlChanges,0,4));


    if (notes.length==0) { console.log("NO NOTES.");return;}
    let maxcell=0;
    notes.forEach(note => {
      //note.midi, note.time, note.duration, note.name
      
      //console.log(track,note);

      len=parseInt((note.durationTicks/PPQ)*4);
      if (len==0) len=1;
      seq=parseInt((note.ticks/PPQ)*4);
      gNotes.push({ midi:note.midi ,seq:seq , len:len , name:note.name ,time:note.ticks,duration:note.durationTicks});
      
      if (seq>maxcell) maxcell=seq
    })


    console.log(track.instrument,track.name,maxcell);

    gNoteItems.push({
      track: track,
      midichannel: track.channel,
      instrument: track.instrument,
      name: track.name,
      notes: gNotes,
      cellcount: ((maxcell+16)/16)*16
    });

    track++;
    if (track>=MAX_PATTERNS) return;
  
    /*
    //the control changes are an object
    //the keys are the CC number
    track.controlChanges[64]
    //they are also aliased to the CC number's common name (if it has one)
    track.controlChanges.sustain.forEach(cc => {
      // cc.ticks, cc.value, cc.time
    })
      */
  
    //the track also has a trackchannel and instrument
    //track.instrument.name
  })

  return gNoteItems;
}


};