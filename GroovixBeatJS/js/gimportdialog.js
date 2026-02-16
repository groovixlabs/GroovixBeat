"use strict"

let dp= new CDrumPatterns;
let gchordarpgen=new CChordARPGen;
let chords= new CChord;
let abcparser = new CABCParser;
let noteparser = new CNoteParser;

let MAX_PATTERNS=10;
let g_BeatsPerBar=4;
let g_CellsPerBeat=4;
let g_CurrentPattern=0;
let DEFAULT_VELOCITY=100;

function gParseInt(val, defaultValue) {
    const parsed = parseInt(val);
    return isNaN(parsed) ? defaultValue : parsed;
  }
function capitalizeFirstCharacter(str) {
    if (typeof str !== 'string' || str.length === 0) {
        return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}


let isDialogOpen=[];
function CloseAllDialogs()
{
  console.log("******** CloseAllDialogs");

  // Close old-style dialog modals
  $(".modal").each(function( index ) {
    let id=$( this ).prop('id');
    console.log( index + ": " + id );
    HideModal(id)
  });

  // Close new overlay-style modals (like Import)
  $(".file-browser-overlay").each(function( index ) {
    let id=$( this ).prop('id');
    if (id && isDialogOpen[id]) {
      console.log( index + ": " + id );
      HideModal(id)
    }
  });
}

function ShowModal(event,id,offx=5,offy=5,OkCallBack,CloseAll=true)
{
  if (CloseAll) CloseAllDialogs();

  console.log("Show Modal***",id);

  // Show the modal using display style
  const modal = document.getElementById(id);
  modal.style.display = 'flex';
  isDialogOpen[id]=true;

  $("#"+id+"_ok").off("click").on("click", () => { OkCallBack(true); } );
  $("#"+id+"_cancel").off("click").on("click",() => { OkCallBack(false); });
  $("#"+id+"_close").off("click").on("click",() => { OkCallBack(false); });

  // Close on overlay click (click outside the modal content)
  $(modal).off("click.overlay").on("click.overlay", (e) => {
    if (e.target === modal) {
      OkCallBack(false);
    }
  });

  // Handle Escape key
  $(document).off("keydown.modal_" + id).on("keydown.modal_" + id, (e) => {
    if (e.key === 'Escape' && isDialogOpen[id]) {
      OkCallBack(false);
    }
  });
}

function HideModal(id)
{
  isDialogOpen[id]=false;
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'none';
  }
  // Clean up escape key handler
  $(document).off("keydown.modal_" + id);
}

function GetGRNotesForDrum(barcount,pat,volvel_accent)
{
  let patA=pat.split("\n");
  let accent=[];
  let GRNotes=[]
  for(let i=0;i<patA.length;i++)
  {
      let line = patA[i].replace(/\s+/g, '');
      console.log(line);
      let noteA=line.split("|");
      if (noteA.length<3) continue;

      let note=noteA[1]
      let fr=0;
      if (note=='AC')
      {
        fr=0;
        for(let c=0;c<noteA.length;c++)
        {
          let note=noteA[2+c] ?? "";
          if (note.length>0)
          {
            accent[c]=1;
          }
          else
          {
            accent[c]=0;
          }
        }
      }
      else
      {
        fr=chords.drumAbbreviationMappings[note]?.midiNote,0;
        if (fr>0)
        {
          for(let bar=0;bar<barcount;bar++)
          {
            for(let c=0;c<noteA.length;c++)
            {
              let note=noteA[2+c] ?? "";
              let fc=c+bar*16;
              if (note.length>0)
              {
                let obj={ midi:fr , seq:fc ,  len: 1 };
                if (accent[c]==1) 
                {
                  obj.vel=volvel_accent;
                }
                GRNotes.push(obj)
              }
            }
          }
        }
        console.log("["+note+"]",chords.drumAbbreviationMappings[note],fr)
      }
  }

  return GRNotes;
}


let g_pCreateNoteEvent=null;
let g_pClearCurrentTrack=null;
function OpenImport(pCreateNoteEvent,pClearCurrentTrack)
{
  g_pCreateNoteEvent=pCreateNoteEvent;
  g_pClearCurrentTrack=pClearCurrentTrack;
  ShowModal(event,"Import",10,10, async (isok) => { await CloseImport(isok); });
}


function ABCRemoveCommentLines(text) {
  return text
    .split('\n')
    .filter(line => line.trim() !== '' && !line.trim().startsWith('%'))
    .join('\n');
}

async function CloseImport(isok)
{
  if (isok)
  {
    let ImportType=$("#ImportType").val()
    let p=g_CurrentPattern;
    let ImportClear=gParseInt($("#ImportClear").val());
    let ClearNotesBeforeImport=(ImportClear==1) ? true : false;
    
    console.log("_______ CloseImport  ",isok,ClearNotesBeforeImport,ImportClear);

    if (ClearNotesBeforeImport)
    {
      console.log("_______ CLEARING TRACK ");
      g_pClearCurrentTrack();
    }


    if (ImportType=="ABC")
    {
      let val=$("#ABCWizardText").val().trim();
      if (val[1]==':') // ABC Notatio has X: or some other header where the second char is a :
      {
        //val=ABCRemoveCommentLines(val);
        //console.log("ABCRemoveCommentLines:",val);
        let parsedNotesTracks=abcparser.ParseABCNotationUsingABCJS(val);
        //console.log("ParseABCNotationUsingABCJS",parsedNotesTracks);

        
        if ($("#ImportMergeTracks").val()=="1")
        {
            let notes=[];
            for(let p=0;p<parsedNotesTracks.length;p++)
            {
              for(let n=0;n<parsedNotesTracks[p].notes.length;n++)
              {
                notes.push(parsedNotesTracks[p].notes[n]);
              }
            }
            notes.sort((a, b) => { return a.seq - b.seq; });
            parsedNotesTracks[0].notes=notes;
            console.log("************ Combined ",notes);

            await LoadParsedTrackNotesToGrid([parsedNotesTracks[0]],ClearNotesBeforeImport)
        }
        else
        {
          await LoadParsedTrackNotesToGrid(parsedNotesTracks,ClearNotesBeforeImport)
        }
        
      }
      else
      {
        alert("Format Error.");return;
      }
    }
    else if (ImportType=="GNotes")
    {
      let val=$("#GNotesWizardText").val().trim();

      if (val[0]!='|')
      {
          let GRNotes=noteparser.ImportGNotes(val);
          SetNotesToGrid(p,GRNotes,0)
      }
      else
      {
        alert("Format Error.");return;
      }
    }
    else if (ImportType=="Drums")
    {
        let val=$("#DrumWizardText").val().trim();
        if (val[0]=='|')
        {
            
          let volvel_pattern=100;
          let volvel_accent=volvel_pattern+10;
          if (volvel_accent>100) volvel_accent=100;

          let barcount=1;
        //******************************************************************************* */  
          let GRNotes=GetGRNotesForDrum(barcount,val,volvel_accent);
          SetNotesToGrid(p,GRNotes,0);
        
        }
        else
        {
          alert("Format Error.");return;
        }
        
    }
    else if (ImportType=="ChordProg")
    {
        await InsertChordProgression()
    }
    else if (ImportType=="Midi")
    {
        if (typeof MidiImporter !== 'undefined' && MidiImporter.parsedMidi) {
            MidiImporter.importMidi();
        } else {
            alert("Please select a MIDI file first");
            return;
        }
    }

    console.log("ok");
  }
  else
    console.log("reopen");
  /*isAutoMapOpen=false;*/

  HideModal("Import");

  await UpdateStateForFieldChange();
  ScrollToVisible();
  await PaintGrid();
}

async function InsertChordProgression()
{
    let p=g_CurrentPattern;

    let ScaleMode=$("#ScaleMode").val();
    let RootTonic=$("#RootTonic").val();

    let NeedChords=parseInt($("#NeedChords").val());
    let ChordOctave=parseInt($("#ChordOctave").val());
    let ChordDuration=parseInt($("#ChordDuration").val());
    let NumChords=parseInt($("#NumChords").val());
    
    
    let ARPOctave=gParseInt(($("#ARPOctave").val()) , 4);
    let ArpLen=gParseInt(($("#ArpLen").val()) , 3) ;
    let ARPRepeat=gParseInt(($("#ARPRepeat").val()) , 2);
    let ARPDuration=gParseInt(($("#ARPDuration").val()) , 1);
    
    let ArpegeoPat=$("#ArpegeoPat").val()

    console.log("InsertCh ordProgression",ScaleMode,ChordOctave,RootTonic,ChordDuration);
    console.log("ArpLen",$("#ArpLen").val(),ArpLen,parseInt($("#ArpLen").val()));

   
    let ChordProgList=[];
    for(let cp=0;cp<NumChords;cp++)
    {
      let chord=$("#chord-prog-"+cp).val();
      ChordProgList.push(chord);
    }

    let [GRNotes,barcount]=gchordarpgen.GetARPPatterns({
      ScaleMode,
      RootTonic,

      NeedChords,
      ChordOctave,
      ChordDuration,
      ChordProgList,

      ARPOctave,
      ArpLen,
      ARPRepeat,
      ARPDuration,
      ArpegeoPat,
    });
    //*********************************************************************************************** */
    console.log("************** GRNotes:",GRNotes);
    SetNotesToGrid(p,GRNotes,0)
}

function OnChangeDrumPatternName()
{
    let drumpattern=$("#DrumPatternName").val();
    $("#DrumPatternStyle").html(dp.GetDrumPattern(drumpattern));
}

function OnChangeDrumPatternStyle()
{
    let drumpattern=$("#DrumPatternName").val();
    let drumstyle=$("#DrumPatternStyle").val();
    
    $("#DrumPatternTable").html(dp.GetDrumPatternStyle(drumpattern,drumstyle));
}

function InitImportDialog()
{
    $("#DrumPatternName").html(dp.LoadDrumPatternNames());
    $("#DrumPatternName").val(0);
    OnChangeDrumPatternName();
    $("#DrumPatternStyle").val(0);
    //OnChangeDrumPatternStyle()
  
    InitChordWizard();
  
    //$("#ImportType").val("ChordProg");
    $("#ImportType").val("ABC");
    OnChangeImportType();
  
}

function InitChordWizard()
{
  let note_keys=gchordarpgen.GetNoteKeys();
  let modes=gchordarpgen.GetModes();

  let modeHTML=`
  <table >
  <tr><td colspan=2>
  <label class='import-label'>Scale</label>
  <div class="dropdown-container">
  <select class='dropdown' id="ScaleMode" onchange="OnChangeScaleMode()">`;
  for(let i=0;i<modes.length;i++)
  {
    modeHTML+=`<option value='${modes[i]}'>${capitalizeFirstCharacter(modes[i])}</option>`;
  }
  modeHTML+=`</select>
  </div>
  </td>

  <td>
    <label class='import-label'>NumChords</label>

    <div class="dropdown-container-small">
    <select class='dropdown' id="NumChords" onchange="OnNumChords()">
    `;
    for(let i=1;i<=8;i++)
    {
      modeHTML+=`<option value='${i}'>${i}</option>`;
    }
    modeHTML+=`</select>
    </div>
  </td>

  </tr>
  
  <tr>
  <td>
  <label class='import-label'>Octave</label>
  <div class="dropdown-container-small">
  <select class='dropdown' id="ChordOctave" onchange="OnChangeChordOctave()">`;
  for(let i=-2;i<=6;i++)
  {
    modeHTML+=`<option value='${i}'>${i}</option>`;
  }
  modeHTML+=`</select>
  </div>
  </td>


  <td>
  <label class='import-label'>Root Tonic</label>
  <div class="dropdown-container-small">
  <select class='dropdown' id="RootTonic" onchange="OnChangeRootTonic()">`;
  for(let i=0;i<note_keys.length;i++)
  {
    modeHTML+=`<option value='${note_keys[i]}'>${note_keys[i]}</option>`;
  }
  modeHTML+=`</select>
  </div>
  </td>

  <td id=ChordLenTD>
  <label class='import-label'>Chord Duration</label>
  <div class="dropdown-container-small">
  <select class='dropdown' id="ChordDuration" onchange="OnChangeChordLength()">`;
  for(let i=1;i<=(16*4);i++)
  {
    modeHTML+=`<option value='${i}'>${i}</option>`;
  }
  modeHTML+=`</select>
  </div>
  </td>

  <td id=NeedChordsTD>
  <label class='import-label'>Need Chords</label>
  <div class="dropdown-container-small">
  <select class='dropdown' id="NeedChords">
    <option value='1'>Chord+ARP</option>
    <option value='0'>Only ARP</option>
  </select>
  </div>
  </td>


  </tr></table>`;

  let chordprog="";
  let op="";
  let ChordName=["i","ii","iii","iv","v","vi","vii"];
  for(let i=0;i<7;i++)
  {
    op+=`<option value='${i}'>${ChordName[i]}</option>`;
  }
  for(let cp=0;cp<8;cp++)
  {
    chordprog+=`<td><select id='chord-prog-${cp}' class="chord-prog dropdown">${op}</select></td>`;
  }

  let all=` 
    ${modeHTML}
    <div  id=ChordProgressionHolder style="margin-top:10px">
        <label class='import-label'>Chord Progression</label>
        <table><tr>${chordprog}</tr></table>
    </div>

    <hr class='import-hr'>
    <table><tr>

    <td>
    <label class='import-label'>Arp Count</label>

    <div class="dropdown-container-small">
    <select class='dropdown' id="ArpLen" onchange="OnChangeArpLen()">
    <option value='0'>No ARP</option>
    `;
    for(let i=3;i<=6;i++)
    {
      all+=`<option value='${i}'>${i}</option>`;
    }
    all+=`</select>
    </div>
    </td>

    <td class='ARPTD'>
      <label class='import-label'>Type</label>
      <div class="dropdown-container-small">
      <select class='dropdown' id="ArpType" onchange="OnChangeArpLen()">
        <option value='straight'>straight</option>
        <option value='looped'>looped</option>
      </select>
      </div>
    </td>
        
    <td class='ARPTD'>
      <label class='import-label'>Arpegeo</label>
      <div class="dropdown-container-small">
      <select class='dropdown' id="ArpegeoPat" >
      </select>
      </div>
    </td>

</tr>
<tr>

<td class='ARPTD'>
  <label class='import-label'>ARP Octave</label>
  <div class="dropdown-container-small">
  <select class='dropdown' id="ARPOctave" >`;
  for(let i=-2;i<=6;i++)
  {
    all+=`<option value='${i}'>${i}</option>`;
  }
  all+=`</select>
  </div>
  </td>

  <td class='ARPTD'>
    <label class='import-label'>ARP Repeat</label>
    <div class="dropdown-container-small">
    <select class='dropdown' id="ARPRepeat" >`;
    for(let i=1;i<=4;i++)
    {
      all+=`<option value='${i}'>${i}</option>`;
    }
    all+=`</select>
    </div>
  </td>

  <td class='ARPTD'>
    <label class='import-label'>ARP Duration</label>
    <div class="dropdown-container-small">
    <select class='dropdown' id="ARPDuration" >`;
    for(let i=1;i<=8;i++)
    {
      all+=`<option value='${i}'>${i}</option>`;
    }
    all+=`</select>
    </div>
  </td>

    </tr></table>
  `
  

  /* ############################################################### */
  $("#ChordArpGenWizard").html(all);

  $("#ChordOctave").val(2);
  $("#RootTonic").val("C");
  $("#ChordDuration").val(4);

  $("#ArpLen").val(3);OnChangeArpLen();
  $("#ArpegeoPat").val("0 1 2");
  $("#ArpType").val("straight");

  $("#ARPOctave").val(4);
  $("#ARPRepeat").val(2);

  $("#ARPDuration").val(1);

  for(let c=0;c<8;c++)
  {
    $("#chord-prog-"+c).val(c%7);
  }

  $("#NumChords").val(8);
  OnNumChords();

}

function OnNumChords()
{
  $(".chord-prog").hide();
  let NumChords=$("#NumChords").val()
  for(let c=0;c<NumChords;c++)
  {
    $("#chord-prog-"+c).show();
  }

}

function OnChangeArpLen()
{
  let ArpLen=$("#ArpLen").val();

  if (ArpLen==0)
  {
    $(".ARPTD").hide();
    $("#NeedChordsTD").hide();
    $("#ChordLenTD").show();
    
    return;
  }
  else
  {
    $(".ARPTD").show();
    $("#NeedChordsTD").show();
    $("#ChordLenTD").hide();
  }


  let ArpType=$("#ArpType").val();
  //console.log("OnChangeArpLen:",ArpLen,ArpType);

  let AP = gchordarpgen.GetArpeggioPatterns(ArpLen);
  //console.log(AP.patterns);
  let list= (ArpType=='straight') ?  AP.patterns.straight :  AP.patterns.looped ;
  //console.log(list);

  let op="";
  for(let i=0;i<list.length;i++)
  {
    let val=list[i].join(" ");
    op+=`<option value='${val}'>${val}</option>`;
  }
  $("#ArpegeoPat").html(op);
}


function OnChangeImportType()
{
  let val=$("#ImportType").val()
  //console.log("OnChangeImportType",val);

  $("#ABCWizard").hide();
  $("#DrumWizard").hide();
  $("#ChordArpGenWizard").hide();
  $("#GNotesWizard").hide();
  $("#ChordMelodyWizard").hide();
  $("#MidiImportWizard").hide();

  switch(val)
  {
    case "ABC": $("#ABCWizard").show();break;
    case "Drums": $("#DrumWizard").show();OnChangeDrumPatternStyle();break;
    case "ChordProg": $("#ChordArpGenWizard").show();break;
    case "GNotes": $("#GNotesWizard").show();break;
    case "ChordMelody": $("#ChordMelodyWizard").show();break;
    case "Midi": $("#MidiImportWizard").show();break;

  }

}

//******************************** */

  function ClearPattern(p){};
  function AutoClearPattern(p,auto){};
  function UpdateBarCountPattern(p,barcount){};
  async function UpdateUIForAnyParamChange(){};
  async function UpdateStateForFieldChange(){};
  async function OnScrollToVisible(){};
  function ScrollToVisible(){}; 
  async function PaintGrid(){}; 

  function CreateNote(p,fr,start_fc,sellen,issel=false,vel)
  {
    //console.log("CreateNote",p,fr,start_fc,sellen,issel,vel);
    g_pCreateNoteEvent(p,fr,start_fc,sellen,vel/127);
  }


let GR_lastlen=4,GR_lastoctave=5,GR_lastseq=0;
function SetNotesToGrid(p,notes,start)
{
  console.log("SetNotesToGrid",p,notes,start);
  GR_lastseq=start ?? 0;
  let midi;
  for(let i=0;i<notes.length;i++)
  {
    let note=notes[i];
    midi=note?.midi ?? null;
    
    if (note?.oct !=undefined ) GR_lastoctave=note.oct; 
    if (note?.len !=undefined ) 
    {
      if (note.len<0)
        GR_lastseq+=note.len; // this allows relative adjustments. -1 for example
      else
        GR_lastlen=note.len;
    }
    if (note?.seq !=undefined ) GR_lastseq=note.seq+start; // Always check for undefined since valid valud of 0 is also false.

    if ((midi==null)&&(note?.pitch))
    {
      midi=GetMidiForName(GR_lastoctave,note.pitch);// null if invalid
    }

    if (midi!=null)
    {
        CreateNote(p,midi,GR_lastseq,GR_lastlen,false,note?.vel ?? DEFAULT_VELOCITY)
    }
    // Increment this since we might have REST NOTES.
    GR_lastseq+=GR_lastlen;
  }
}

  async function LoadParsedTrackNotesToGrid(parsedNotesTracks,ClearNotesBeforeImport)
  {
    let fc=0;
    for(let p=0;p<parsedNotesTracks.length;p++)
    {
      let parsedNotes=parsedNotesTracks[p].notes;
      let instrument=parsedNotesTracks[p].instrument.number;
      let name=parsedNotesTracks[p].name;
      let cellcount=parsedNotesTracks[p].cellcount;
      let barcount=parseInt( ( cellcount / (g_BeatsPerBar*g_CellsPerBeat) )) +1;

      if (ClearNotesBeforeImport)
      {
       
      }

      SetNotesToGrid(p,parsedNotes,0);
    }
  }

function OnChangeChordLength(){}
function OnChangeRootTonic(){}
function OnChangeChordOctave(){}
