// Shared application state and constants

const AppState = {
    // Constants
    NOTE_HEIGHT: 16,
    STEP_WIDTH: 20,
    PIANO_KEY_WIDTH: 60,
    TOTAL_NOTES: 49, // 4 octaves (C1 to C5)
    BASE_NOTE: 36, // C1 in MIDI (Yamaha/Ableton convention)
    NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // Grid dimensions (can grow)
    numScenes: 5,
    numTracks: 8,

    // Scene and track names
    sceneNames: [],
    trackNames: [],

    // Scene properties: { signature: '4/4', repeat: 1, fadeIn: false, fadeOut: false, quantize: 0 }
    // quantize: 0 = inherit from song level
    sceneProperties: [],

    // Initialize scene properties
    initSceneProperties: function(sceneIndex) {
        if (!this.sceneProperties[sceneIndex]) {
            this.sceneProperties[sceneIndex] = {
                signature: '4/4',
                repeat: 1,
                fadeIn: false,
                fadeOut: false,
                quantize: 0  // 0 = inherit from song level
            };
        }
        return this.sceneProperties[sceneIndex];
    },

    // Get scene properties
    getSceneProperties: function(sceneIndex) {
        return this.initSceneProperties(sceneIndex);
    },

    // Set scene properties
    setSceneProperties: function(sceneIndex, props) {
        if (!this.sceneProperties[sceneIndex]) {
            this.initSceneProperties(sceneIndex);
        }
        Object.assign(this.sceneProperties[sceneIndex], props);
    },

    // Get effective quantization for a clip (clip -> scene -> song hierarchy)
    // Returns 0 if set to "inherit" (use parent level), otherwise returns the quantize value
    getEffectiveQuantize: function(sceneIndex, trackIndex) {
        const clip = this.clips[sceneIndex] && this.clips[sceneIndex][trackIndex];
        const sceneProps = this.getSceneProperties(sceneIndex);

        // Check clip level first (0 means inherit from scene)
        if (clip && clip.quantize && clip.quantize > 0) {
            return clip.quantize;
        }

        // Check scene level (0 means inherit from song)
        if (sceneProps && sceneProps.quantize && sceneProps.quantize > 0) {
            return sceneProps.quantize;
        }

        // Fall back to song level
        return this.songQuantize || 4;
    },

    // Clip data structure: clips[scene][track] = { ...clipProperties }
    // Per-clip: notes, length, playMode, mute, quantize, repeat
    // Per-track (in trackSettings): trackType, midiProgram, midiChannel, instrument, fxChain
    // Each note: { pitch: number, start: number, duration: number }
    clips: [],

    // Default clip properties - only per-clip properties
    DEFAULT_CLIP: {
        notes: [],
        length: 64,
        playMode: 'loop',      // 'loop' or 'oneshot'
        mute: false,
        quantize: 0,           // 0 = inherit from scene/song
        repeat: 1              // Number of times to repeat in song mode
    },

    // Create a new clip with default properties
    createClip: function(trackIndex = 0) {
        return JSON.parse(JSON.stringify(this.DEFAULT_CLIP));
    },

    // Get clip with ensured properties (for backward compatibility)
    getClip: function(sceneIndex, trackIndex) {
        if (!this.clips[sceneIndex]) {
            this.clips[sceneIndex] = [];
        }
        if (!this.clips[sceneIndex][trackIndex]) {
            this.clips[sceneIndex][trackIndex] = this.createClip(trackIndex);
        }
        const clip = this.clips[sceneIndex][trackIndex];

        // Ensure all default properties exist (backward compatibility)
        if (clip.playMode === undefined) clip.playMode = 'loop';
        if (clip.mute === undefined) clip.mute = false;
        if (clip.quantize === undefined) clip.quantize = 0;
        if (clip.repeat === undefined) clip.repeat = 1;

        return clip;
    },

    // Set clip properties
    setClipProperties: function(sceneIndex, trackIndex, properties) {
        const clip = this.getClip(sceneIndex, trackIndex);
        Object.assign(clip, properties);
        return clip;
    },

    // Current editor state
    currentScene: 0,
    currentTrack: 0,
    currentLength: 64,

    // Playback state
    isPlaying: false,
    playingScene: 0,
    playInterval: null,
    tempo: 120, // BPM
    songQuantize: 4, // Song-level quantization (1, 4, 8, 16 steps) - can be overridden by scene/clip

    // Mixer state per track
    mixerState: [],

    // Track MIDI settings per track
    trackSettings: [],

    // General MIDI instrument names
    GM_INSTRUMENTS: [
        // Piano (0-7)
        'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
        'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
        // Chromatic Percussion (8-15)
        'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
        'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
        // Organ (16-23)
        'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
        'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
        // Guitar (24-31)
        'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
        'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
        // Bass (32-39)
        'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
        'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
        // Strings (40-47)
        'Violin', 'Viola', 'Cello', 'Contrabass',
        'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
        // Ensemble (48-55)
        'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
        'Choir Aahs', 'Voice Oohs', 'Synth Choir', 'Orchestra Hit',
        // Brass (56-63)
        'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
        'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
        // Reed (64-71)
        'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
        'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
        // Pipe (72-79)
        'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
        'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
        // Synth Lead (80-87)
        'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
        'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
        // Synth Pad (88-95)
        'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
        'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
        // Synth Effects (96-103)
        'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
        'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
        // Ethnic (104-111)
        'Sitar', 'Banjo', 'Shamisen', 'Koto',
        'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
        // Percussive (112-119)
        'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
        'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
        // Sound Effects (120-127)
        'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
        'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
    ],

    // Initialize mixer state for a track
    initMixerState: function(trackIndex) {
        if (!this.mixerState[trackIndex]) {
            this.mixerState[trackIndex] = {
                mute: false,
                solo: false,
                pan: 0,      // -1 (left) to 1 (right), 0 = center
                volume: 0.8, // 0 to 1
                levelL: 0,   // Left level meter (0-1)
                levelR: 0    // Right level meter (0-1)
            };
        }
        return this.mixerState[trackIndex];
    },

    // Initialize track settings for a track
    initTrackSettings: function(trackIndex) {
        if (!this.trackSettings[trackIndex]) {
            this.trackSettings[trackIndex] = {
                midiChannel: trackIndex % 16,  // 0-15, default to track index mod 16
                midiProgram: 0,                // 0-127, General MIDI program number
                trackType: 'melody',           // 'melody', 'sample', or 'sampled_instrument'
                isPercussion: false,           // Independent percussion flag (drum names + MIDI ch 10)
                playbackMode: 'loop',          // 'oneshot' or 'loop' (for all track types)
                instrument: null,              // { pluginId, nodeId, name, state }
                fxChain: []                    // Array of { pluginId, nodeId, name, state, bypass }
            };
        }
        return this.trackSettings[trackIndex];
    },

    // Get track settings
    getTrackSettings: function(trackIndex) {
        const settings = this.initTrackSettings(trackIndex);
        // Ensure all default properties exist (for backwards compatibility with older saved data)
        if (settings.playbackMode === undefined) {
            settings.playbackMode = 'loop';
        }
        if (settings.trackType === undefined) {
            settings.trackType = 'melody';
        }
        if (settings.instrument === undefined) {
            settings.instrument = null;
        }
        if (settings.fxChain === undefined) {
            settings.fxChain = [];
        }
        if (settings.isPercussion === undefined) {
            settings.isPercussion = false;
        }
        // Compute isDrumTrack for backwards compatibility
        settings.isDrumTrack = settings.isPercussion;
        return settings;
    },

    // Set track settings
    setTrackSettings: function(trackIndex, settings) {
        if (!this.trackSettings[trackIndex]) {
            this.initTrackSettings(trackIndex);
        }
        Object.assign(this.trackSettings[trackIndex], settings);
    },

    // Get mixer state for a track
    getMixerState: function(trackIndex) {
        return this.initMixerState(trackIndex);
    },

    // Initialize clips array and names
    initClips: function() {
        this.clips = [];
        this.sceneNames = [];
        this.trackNames = [];
        this.mixerState = [];
        this.trackSettings = [];
        this.sceneProperties = [];

        // Initialize scene names and properties
        for (let s = 0; s < this.numScenes; s++) {
            this.sceneNames[s] = `Scene ${s + 1}`;
            this.initSceneProperties(s);
            this.clips[s] = [];
            for (let t = 0; t < this.numTracks; t++) {
                this.clips[s][t] = this.createClip(t);
            }
        }

        // Initialize track names, mixer state, and track settings
        for (let t = 0; t < this.numTracks; t++) {
            this.trackNames[t] = `Track ${t + 1}`;
            this.initMixerState(t);
            this.initTrackSettings(t);
        }
    },

    // Add a new scene
    addScene: function() {
        const newScene = [];
        for (let t = 0; t < this.numTracks; t++) {
            newScene.push(this.createClip(t));
        }
        this.clips.push(newScene);
        this.sceneNames.push(`Scene ${this.numScenes + 1}`);
        this.initSceneProperties(this.numScenes);
        this.numScenes++;
        return this.numScenes - 1; // Return new scene index
    },

    // Clone a scene (deep copy) and insert after the given index
    cloneScene: function(sceneIndex) {
        // Deep copy clips
        const clonedClips = [];
        for (let t = 0; t < this.numTracks; t++) {
            clonedClips.push(JSON.parse(JSON.stringify(this.clips[sceneIndex][t])));
        }
        this.clips.splice(sceneIndex + 1, 0, clonedClips);

        // Clone scene name with "(Copy)" suffix
        const origName = this.getSceneName(sceneIndex);
        this.sceneNames.splice(sceneIndex + 1, 0, origName + ' (Copy)');

        // Clone scene properties
        const origProps = JSON.parse(JSON.stringify(this.getSceneProperties(sceneIndex)));
        this.sceneProperties.splice(sceneIndex + 1, 0, origProps);

        this.numScenes++;

        // Rekey SampleEditor clipSamples: shift entries with scene >= sceneIndex+1 up by 1
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            const newSamples = {};
            for (const key in samples) {
                const parts = key.split('_');
                const s = parseInt(parts[0]);
                const t = parseInt(parts[1]);
                if (s > sceneIndex) {
                    newSamples[`${s + 1}_${t}`] = samples[key];
                } else {
                    newSamples[key] = samples[key];
                }
            }
            // Copy entries from sceneIndex to sceneIndex+1
            for (let t = 0; t < this.numTracks; t++) {
                const srcKey = `${sceneIndex}_${t}`;
                if (samples[srcKey]) {
                    newSamples[`${sceneIndex + 1}_${t}`] = JSON.parse(JSON.stringify(samples[srcKey]));
                }
            }
            SampleEditor.clipSamples = newSamples;
        }

        return sceneIndex + 1;
    },

    // Delete a scene (must have at least 2 scenes)
    deleteScene: function(sceneIndex) {
        if (this.numScenes <= 1) return false;

        this.clips.splice(sceneIndex, 1);
        this.sceneNames.splice(sceneIndex, 1);
        this.sceneProperties.splice(sceneIndex, 1);
        this.numScenes--;

        // Rekey SampleEditor clipSamples
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            const newSamples = {};
            for (const key in samples) {
                const parts = key.split('_');
                const s = parseInt(parts[0]);
                const t = parseInt(parts[1]);
                if (s === sceneIndex) continue; // skip deleted scene
                if (s > sceneIndex) {
                    newSamples[`${s - 1}_${t}`] = samples[key];
                } else {
                    newSamples[key] = samples[key];
                }
            }
            SampleEditor.clipSamples = newSamples;
        }

        return true;
    },

    // Move a scene up (swap with sceneIndex-1)
    moveSceneUp: function(sceneIndex) {
        if (sceneIndex <= 0) return false;
        this._swapScenes(sceneIndex, sceneIndex - 1);
        return true;
    },

    // Move a scene down (swap with sceneIndex+1)
    moveSceneDown: function(sceneIndex) {
        if (sceneIndex >= this.numScenes - 1) return false;
        this._swapScenes(sceneIndex, sceneIndex + 1);
        return true;
    },

    // Internal helper: swap two scenes
    _swapScenes: function(a, b) {
        // Swap clips
        [this.clips[a], this.clips[b]] = [this.clips[b], this.clips[a]];
        // Swap scene names
        [this.sceneNames[a], this.sceneNames[b]] = [this.sceneNames[b], this.sceneNames[a]];
        // Swap scene properties
        [this.sceneProperties[a], this.sceneProperties[b]] = [this.sceneProperties[b], this.sceneProperties[a]];

        // Swap SampleEditor clipSamples
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            for (let t = 0; t < this.numTracks; t++) {
                const keyA = `${a}_${t}`;
                const keyB = `${b}_${t}`;
                const tmpA = samples[keyA];
                const tmpB = samples[keyB];
                if (tmpA) { samples[keyB] = tmpA; } else { delete samples[keyB]; }
                if (tmpB) { samples[keyA] = tmpB; } else { delete samples[keyA]; }
            }
        }
    },

    // Clone a track (deep copy) and insert after the given index
    cloneTrack: function(trackIndex) {
        // Deep copy clips for this track in every scene
        for (let s = 0; s < this.numScenes; s++) {
            const clonedClip = JSON.parse(JSON.stringify(this.clips[s][trackIndex]));
            this.clips[s].splice(trackIndex + 1, 0, clonedClip);
        }

        // Clone track name with "(Copy)" suffix
        const origName = this.getTrackName(trackIndex);
        this.trackNames.splice(trackIndex + 1, 0, origName + ' (Copy)');

        // Clone mixer state (deep copy)
        const origMixer = JSON.parse(JSON.stringify(this.getMixerState(trackIndex)));
        origMixer.levelL = 0;
        origMixer.levelR = 0;
        this.mixerState.splice(trackIndex + 1, 0, origMixer);

        // Clone track settings (deep copy)
        const origSettings = JSON.parse(JSON.stringify(this.getTrackSettings(trackIndex)));
        this.trackSettings.splice(trackIndex + 1, 0, origSettings);

        this.numTracks++;

        // Rekey SampleEditor clipSamples: shift entries where track > trackIndex up by 1
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            const newSamples = {};
            for (const key in samples) {
                const parts = key.split('_');
                const s = parseInt(parts[0]);
                const t = parseInt(parts[1]);
                if (t > trackIndex) {
                    newSamples[`${s}_${t + 1}`] = samples[key];
                } else {
                    newSamples[key] = samples[key];
                }
            }
            // Copy entries from trackIndex to trackIndex+1
            for (let s = 0; s < this.numScenes; s++) {
                const srcKey = `${s}_${trackIndex}`;
                if (samples[srcKey]) {
                    newSamples[`${s}_${trackIndex + 1}`] = JSON.parse(JSON.stringify(samples[srcKey]));
                }
            }
            SampleEditor.clipSamples = newSamples;
        }

        // Rekey InstrumentSelector.trackInstruments
        if (typeof InstrumentSelector !== 'undefined') {
            const instruments = InstrumentSelector.trackInstruments;
            const newInstruments = {};
            for (const key in instruments) {
                const t = parseInt(key);
                if (t > trackIndex) {
                    newInstruments[t + 1] = instruments[key];
                } else {
                    newInstruments[key] = instruments[key];
                }
            }
            // Copy instrument from trackIndex to trackIndex+1
            if (instruments[trackIndex]) {
                newInstruments[trackIndex + 1] = JSON.parse(JSON.stringify(instruments[trackIndex]));
            }
            InstrumentSelector.trackInstruments = newInstruments;
        }

        return trackIndex + 1;
    },

    // Delete a track (must have at least 2 tracks)
    deleteTrack: function(trackIndex) {
        if (this.numTracks <= 1) return false;

        // Remove clip data for this track from every scene
        for (let s = 0; s < this.numScenes; s++) {
            this.clips[s].splice(trackIndex, 1);
        }

        // Remove from arrays
        this.trackNames.splice(trackIndex, 1);
        this.mixerState.splice(trackIndex, 1);
        this.trackSettings.splice(trackIndex, 1);

        this.numTracks--;

        // Rekey SampleEditor clipSamples
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            const newSamples = {};
            for (const key in samples) {
                const parts = key.split('_');
                const s = parseInt(parts[0]);
                const t = parseInt(parts[1]);
                if (t === trackIndex) continue; // skip deleted track
                if (t > trackIndex) {
                    newSamples[`${s}_${t - 1}`] = samples[key];
                } else {
                    newSamples[key] = samples[key];
                }
            }
            SampleEditor.clipSamples = newSamples;
        }

        // Rekey InstrumentSelector.trackInstruments
        if (typeof InstrumentSelector !== 'undefined') {
            const instruments = InstrumentSelector.trackInstruments;
            const newInstruments = {};
            for (const key in instruments) {
                const t = parseInt(key);
                if (t === trackIndex) continue; // skip deleted track
                if (t > trackIndex) {
                    newInstruments[t - 1] = instruments[key];
                } else {
                    newInstruments[key] = instruments[key];
                }
            }
            InstrumentSelector.trackInstruments = newInstruments;
        }

        return true;
    },

    // Move a track left (swap with trackIndex-1)
    moveTrackLeft: function(trackIndex) {
        if (trackIndex <= 0) return false;
        this._swapTracks(trackIndex, trackIndex - 1);
        return true;
    },

    // Move a track right (swap with trackIndex+1)
    moveTrackRight: function(trackIndex) {
        if (trackIndex >= this.numTracks - 1) return false;
        this._swapTracks(trackIndex, trackIndex + 1);
        return true;
    },

    // Internal helper: swap two tracks
    _swapTracks: function(a, b) {
        // Swap clips in every scene
        for (let s = 0; s < this.numScenes; s++) {
            [this.clips[s][a], this.clips[s][b]] = [this.clips[s][b], this.clips[s][a]];
        }
        // Swap track names
        [this.trackNames[a], this.trackNames[b]] = [this.trackNames[b], this.trackNames[a]];
        // Swap mixer state
        [this.mixerState[a], this.mixerState[b]] = [this.mixerState[b], this.mixerState[a]];
        // Swap track settings
        [this.trackSettings[a], this.trackSettings[b]] = [this.trackSettings[b], this.trackSettings[a]];

        // Swap SampleEditor clipSamples
        if (typeof SampleEditor !== 'undefined') {
            const samples = SampleEditor.clipSamples;
            for (let s = 0; s < this.numScenes; s++) {
                const keyA = `${s}_${a}`;
                const keyB = `${s}_${b}`;
                const tmpA = samples[keyA];
                const tmpB = samples[keyB];
                if (tmpA) { samples[keyB] = tmpA; } else { delete samples[keyB]; }
                if (tmpB) { samples[keyA] = tmpB; } else { delete samples[keyA]; }
            }
        }

        // Swap InstrumentSelector.trackInstruments
        if (typeof InstrumentSelector !== 'undefined') {
            const instruments = InstrumentSelector.trackInstruments;
            const tmpA = instruments[a];
            const tmpB = instruments[b];
            if (tmpA) { instruments[b] = tmpA; } else { delete instruments[b]; }
            if (tmpB) { instruments[a] = tmpB; } else { delete instruments[a]; }
        }
    },

    // Add a new track
    addTrack: function() {
        for (let s = 0; s < this.numScenes; s++) {
            this.clips[s].push(this.createClip(this.numTracks));
        }
        this.trackNames.push(`Track ${this.numTracks + 1}`);
        this.initMixerState(this.numTracks);
        this.initTrackSettings(this.numTracks);
        this.numTracks++;
        return this.numTracks - 1; // Return new track index
    },

    // Get scene name
    getSceneName: function(index) {
        return this.sceneNames[index] || `Scene ${index + 1}`;
    },

    // Set scene name
    setSceneName: function(index, name) {
        this.sceneNames[index] = name || `Scene ${index + 1}`;
    },

    // Get track name
    getTrackName: function(index) {
        return this.trackNames[index] || `Track ${index + 1}`;
    },

    // Set track name
    setTrackName: function(index, name) {
        this.trackNames[index] = name || `Track ${index + 1}`;
    },

    // Helper: Get note name from pitch
    getNoteName: function(pitch) {
        const note = pitch % 12;
        const octave = Math.floor(pitch / 12) - 2;
        return this.NOTE_NAMES[note] + octave;
    },

    // Helper: Check if a note is a black key
    isBlackKey: function(pitch) {
        const note = pitch % 12;
        return [1, 3, 6, 8, 10].includes(note);
    },

    // Get the maximum length across all tracks in a scene
    getMaxLengthInScene: function(sceneIndex) {
        let maxLength = 16;
        for (let t = 0; t < this.numTracks; t++) {
            if (this.clips[sceneIndex] && this.clips[sceneIndex][t]) {
                maxLength = Math.max(maxLength, this.clips[sceneIndex][t].length);
            }
        }
        return maxLength;
    },

    // Serialize song data to JSON
    serialize: function() {
        // Clean mixer state for serialization (remove level meters)
        const cleanMixerState = this.mixerState.map(state => ({
            mute: state.mute,
            solo: state.solo,
            pan: state.pan,
            volume: state.volume
        }));

        // Clean track settings for serialization (track-level properties)
        const cleanTrackSettings = this.trackSettings.map(settings => ({
            midiChannel: settings.midiChannel,
            midiProgram: settings.midiProgram,
            trackType: settings.trackType || 'melody',
            isPercussion: settings.isPercussion || false,
            playbackMode: settings.playbackMode || 'loop',
            instrument: settings.instrument || null,
            samplerInstrument: settings.samplerInstrument || null,
            fxChain: settings.fxChain || []
        }));

        // Get track scales from ClipEditor
        const trackScales = typeof ClipEditor !== 'undefined' ? ClipEditor.trackScales : [];

        // Clean clips for serialization (only per-clip properties)
        const cleanClips = this.clips.map((scene, sceneIndex) =>
            scene.map((clip, trackIndex) => {
                // Create clean clip with per-clip properties only
                const cleanClip = {
                    notes: clip.notes || [],
                    length: clip.length || 64,
                    playMode: clip.playMode || 'loop',
                    mute: clip.mute || false,
                    quantize: clip.quantize || 0,
                    repeat: clip.repeat || 1
                };
                return cleanClip;
            })
        );

        // Get sample data from SampleEditor (only serializable properties)
        // Keyed by "sceneIndex_trackIndex"
        const clipSamples = {};
        if (typeof SampleEditor !== 'undefined' && SampleEditor.clipSamples) {
            for (const [key, sample] of Object.entries(SampleEditor.clipSamples)) {
                if (sample && (sample.fileName || sample.fullPath)) {
                    clipSamples[key] = {
                        fileName: sample.fileName,
                        filePath: sample.filePath || sample.fullPath || null,
                        offset: sample.offset || 0,
                        detectedBPM: sample.detectedBPM || null,
                        stretchFactor: sample.stretchFactor || 1.0,
                        selection: sample.selection || { start: 0, end: 0 }
                    };
                }
            }
        }

        // Get pending graph state (set by serializeAsync)
        const graphState = this._pendingGraphState || null;

        // Get track instruments from InstrumentSelector
        const trackInstruments = typeof InstrumentSelector !== 'undefined'
            ? InstrumentSelector.trackInstruments
            : {};

        return JSON.stringify({
            version: 8,  // Version 8: track-level type/instrument/FX (rolled back from per-clip)
            tempo: this.tempo,
            songQuantize: this.songQuantize,
            numScenes: this.numScenes,
            numTracks: this.numTracks,
            sceneNames: this.sceneNames,
            trackNames: this.trackNames,
            sceneProperties: this.sceneProperties,
            clips: cleanClips,
            mixerState: cleanMixerState,
            trackSettings: cleanTrackSettings,  // Keep for track-level defaults
            trackScales: trackScales,
            clipSamples: clipSamples,
            trackInstruments: trackInstruments,
            graphState: graphState
        });
    },

    // Async serialize that fetches graph state from JUCE first
    serializeAsync: async function() {
        // Request graph state from JUCE if in external mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            try {
                console.log('[AppState] Requesting graph state from JUCE...');
                const graphState = await AudioBridge.getGraphState();
                this._pendingGraphState = graphState;
                console.log('[AppState] Got graph state, XML length:', graphState.graphXml?.length || 0);
            } catch (e) {
                console.warn('[AppState] Failed to get graph state:', e);
                this._pendingGraphState = null;
            }
        } else {
            this._pendingGraphState = null;
        }

        const result = this.serialize();
        this._pendingGraphState = null; // Clear after use
        return result;
    },

    // Load song data from JSON
    deserialize: function(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate version
            if (!data.version) {
                throw new Error('Invalid song file format');
            }

            // Load data
            this.tempo = data.tempo || 120;
            this.songQuantize = data.songQuantize || 4;
            this.numScenes = data.numScenes || 8;
            this.numTracks = data.numTracks || 8;
            this.sceneNames = data.sceneNames || [];
            this.trackNames = data.trackNames || [];
            this.clips = data.clips || [];
            this.mixerState = [];

            // Ensure clip properties have defaults (only per-clip properties)
            for (let s = 0; s < this.numScenes; s++) {
                if (this.clips[s]) {
                    for (let t = 0; t < this.numTracks; t++) {
                        if (this.clips[s][t]) {
                            const clip = this.clips[s][t];
                            // Only per-clip properties
                            if (clip.playMode === undefined) clip.playMode = 'loop';
                            if (clip.mute === undefined) clip.mute = false;
                            if (clip.quantize === undefined) clip.quantize = 0;
                            if (clip.repeat === undefined) clip.repeat = 1;
                            if (clip.length === undefined) clip.length = 64;
                            if (clip.notes === undefined) clip.notes = [];
                        }
                    }
                }
            }

            // Ensure arrays are properly sized
            while (this.sceneNames.length < this.numScenes) {
                this.sceneNames.push(`Scene ${this.sceneNames.length + 1}`);
            }
            while (this.trackNames.length < this.numTracks) {
                this.trackNames.push(`Track ${this.trackNames.length + 1}`);
            }

            // Load mixer state and track settings
            this.trackSettings = [];
            for (let t = 0; t < this.numTracks; t++) {
                if (data.mixerState && data.mixerState[t]) {
                    this.mixerState[t] = {
                        mute: data.mixerState[t].mute || false,
                        solo: data.mixerState[t].solo || false,
                        pan: data.mixerState[t].pan || 0,
                        volume: data.mixerState[t].volume !== undefined ? data.mixerState[t].volume : 0.8,
                        levelL: 0,
                        levelR: 0
                    };
                } else {
                    this.initMixerState(t);
                }

                // Load track settings
                if (data.trackSettings && data.trackSettings[t]) {
                    let trackType = data.trackSettings[t].trackType;
                    let isPercussion = data.trackSettings[t].isPercussion || false;

                    if (!trackType) {
                        // Convert from old isDrumTrack format
                        trackType = data.trackSettings[t].isDrumTrack ? 'melody' : 'melody';
                        isPercussion = data.trackSettings[t].isDrumTrack || false;
                    }

                    // Backwards compat: if trackType was 'percussion', convert to melody + isPercussion
                    if (trackType === 'percussion') {
                        trackType = 'melody';
                        isPercussion = true;
                    }

                    this.trackSettings[t] = {
                        midiChannel: data.trackSettings[t].midiChannel !== undefined ? data.trackSettings[t].midiChannel : t % 16,
                        midiProgram: data.trackSettings[t].midiProgram || 0,
                        trackType: trackType,
                        isPercussion: isPercussion,
                        playbackMode: data.trackSettings[t].playbackMode || 'loop',
                        instrument: data.trackSettings[t].instrument || null,
                        samplerInstrument: data.trackSettings[t].samplerInstrument || null,
                        fxChain: data.trackSettings[t].fxChain || []
                    };
                } else {
                    this.initTrackSettings(t);
                }
            }

            // Load scene properties
            this.sceneProperties = [];
            for (let s = 0; s < this.numScenes; s++) {
                if (data.sceneProperties && data.sceneProperties[s]) {
                    this.sceneProperties[s] = {
                        signature: data.sceneProperties[s].signature || '4/4',
                        repeat: data.sceneProperties[s].repeat || 1,
                        fadeIn: data.sceneProperties[s].fadeIn || false,
                        fadeOut: data.sceneProperties[s].fadeOut || false,
                        quantize: data.sceneProperties[s].quantize !== undefined ? data.sceneProperties[s].quantize : 0
                    };
                } else {
                    this.initSceneProperties(s);
                }
            }

            // Load track modes from old format (backwards compatibility)
            // If trackModes exists in old save file, use it to set trackType
            if (data.trackModes) {
                for (let t = 0; t < data.trackModes.length; t++) {
                    if (data.trackModes[t]) {
                        if (data.trackModes[t] === 'percussion') {
                            this.setTrackSettings(t, { trackType: 'melody', isPercussion: true });
                        } else {
                            this.setTrackSettings(t, { trackType: data.trackModes[t] });
                        }
                    }
                }
            }

            // Load track scales
            if (typeof ClipEditor !== 'undefined' && data.trackScales) {
                ClipEditor.trackScales = data.trackScales;
            }

            // Load sample data - support both new clipSamples format and old trackSamples format
            if (typeof SampleEditor !== 'undefined') {
                // Clear existing samples
                SampleEditor.clipSamples = {};

                // Helper function to load a sample into a specific clip
                const loadClipSample = (sceneIndex, trackIndex, sampleData) => {
                    if (!sampleData || !sampleData.filePath) {
                        // Just store metadata
                        const clipSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
                        clipSample.fileName = sampleData?.fileName;
                        clipSample.filePath = sampleData?.filePath;
                        clipSample.fullPath = sampleData?.filePath;
                        clipSample.offset = sampleData?.offset || 0;
                        clipSample.detectedBPM = sampleData?.detectedBPM;
                        clipSample.stretchFactor = sampleData?.stretchFactor || 1.0;
                        clipSample.selection = sampleData?.selection || { start: 0, end: 0 };
                        return;
                    }

                    // Set track type to sample (track-level setting)
                    AppState.setTrackSettings(trackIndex, { trackType: 'sample' });

                    console.log('[AppState] Loading sample for scene', sceneIndex, 'track', trackIndex, ':', sampleData.filePath);

                    // Load sample via JUCE resource provider - pass scene and track indices to avoid race conditions
                    let loadPromise;
                    if (typeof SampleEditor.loadSampleFromJuce === 'function') {
                        loadPromise = SampleEditor.loadSampleFromJuce(sampleData.filePath, sceneIndex, trackIndex);
                    } else {
                        loadPromise = Promise.resolve();
                    }

                    loadPromise.then(() => {
                        const clipSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
                        clipSample.offset = sampleData.offset || 0;
                        clipSample.detectedBPM = sampleData.detectedBPM;
                        clipSample.stretchFactor = sampleData.stretchFactor || 1.0;
                        clipSample.selection = sampleData.selection || { start: 0, end: 0 };
                        clipSample.filePath = sampleData.filePath;
                        clipSample.fullPath = sampleData.filePath;
                        clipSample.fileName = sampleData.fileName;

                        // Generate waveform peaks from AudioBuffer for clip preview
                        if (typeof SampleEditor.updateWaveformFromAudioBuffer === 'function') {
                            SampleEditor.updateWaveformFromAudioBuffer(sceneIndex, trackIndex);
                        }

                        // Refresh song screen to show waveform preview
                        if (typeof SongScreen !== 'undefined') {
                            SongScreen.renderCanvas();
                        }

                        console.log('[AppState] Sample loaded successfully for scene', sceneIndex, 'track', trackIndex);
                    }).catch(err => {
                        console.warn('Failed to reload sample for scene', sceneIndex, 'track', trackIndex, ':', err);
                        const clipSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
                        clipSample.fileName = sampleData.fileName;
                        clipSample.filePath = sampleData.filePath;
                        clipSample.fullPath = sampleData.filePath;
                        clipSample.offset = sampleData.offset || 0;
                        clipSample.detectedBPM = sampleData.detectedBPM;
                        clipSample.stretchFactor = sampleData.stretchFactor || 1.0;
                        clipSample.selection = sampleData.selection || { start: 0, end: 0 };

                        // Try to generate waveform if audioBuffer exists
                        if (clipSample.audioBuffer && typeof SampleEditor.updateWaveformFromAudioBuffer === 'function') {
                            SampleEditor.updateWaveformFromAudioBuffer(sceneIndex, trackIndex);
                        }
                    });
                };

                // New format: clipSamples keyed by "sceneIndex_trackIndex"
                if (data.clipSamples) {
                    for (const [key, sampleData] of Object.entries(data.clipSamples)) {
                        const [sceneIndex, trackIndex] = key.split('_').map(Number);
                        loadClipSample(sceneIndex, trackIndex, sampleData);
                    }
                }
                // Old format: trackSamples per track (load into scene 0 for backward compatibility)
                else if (data.trackSamples) {
                    for (let t = 0; t < this.numTracks; t++) {
                        if (data.trackSamples[t]) {
                            loadClipSample(0, t, data.trackSamples[t]);
                        }
                    }
                }
            }

            // Load FX chain data
            if (typeof FxChain !== 'undefined' && data.trackFxChains) {
                FxChain.trackFxChains = data.trackFxChains;

                // Recreate FX chains in JUCE
                if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                    for (const [trackIndexStr, chain] of Object.entries(data.trackFxChains)) {
                        if (chain && chain.length > 0) {
                            const trackIndex = parseInt(trackIndexStr);
                            console.log('[AppState] Recreating FX chain for track', trackIndex, ':', chain.length, 'plugins');
                            AudioBridge.send('setTrackFxChain', {
                                trackIndex: trackIndex,
                                plugins: chain.map(p => ({
                                    name: p.name,
                                    id: p.id,
                                    fileOrIdentifier: p.fileOrIdentifier || p.id || p.name
                                }))
                            });
                        }
                    }
                }
            }

            // Load track instruments
            if (typeof InstrumentSelector !== 'undefined' && data.trackInstruments) {
                InstrumentSelector.trackInstruments = data.trackInstruments;
                console.log('[AppState] Restored track instruments:', Object.keys(data.trackInstruments).length);

                // Recreate track instruments in JUCE
                if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                    for (const [trackIndexStr, instrument] of Object.entries(data.trackInstruments)) {
                        const trackIndex = parseInt(trackIndexStr);
                        if (instrument && instrument.id) {
                            console.log('[AppState] Recreating instrument for track', trackIndex, ':', instrument.name);
                            AudioBridge.send('setTrackInstrument', {
                                trackIndex: trackIndex,
                                pluginId: instrument.id
                            });
                        }
                    }
                }
            }

            // Restore sampler instruments for tracks with sampled_instrument type
            if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                for (let t = 0; t < this.numTracks; t++) {
                    const ts = this.getTrackSettings(t);
                    if (ts.trackType === 'sampled_instrument' && ts.samplerInstrument) {
                        console.log('[AppState] Restoring sampler instrument for track', t, ':', ts.samplerInstrument);
                        AudioBridge.send('setSamplerInstrument', {
                            trackIndex: t,
                            instrumentName: ts.samplerInstrument
                        });
                    }
                }
            }

            // Restore JUCE graph state (plugin parameters) after a delay to let instruments load
            if (data.graphState && data.graphState.graphXml) {
                if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                    // Delay state restore to allow plugins to load first
                    setTimeout(() => {
                        console.log('[AppState] Restoring plugin states from graph...');
                        AudioBridge.setGraphState(
                            data.graphState.graphXml,
                            data.graphState.trackInstrumentNodes || {}
                        );
                    }, 1000);
                }
            }

            return true;
        } catch (e) {
            console.error('Failed to load song:', e);
            return false;
        }
    },

    // Reset to default state (for new project)
    reset: function() {
        console.log('AppState.reset() called - creating new project');

        // Reset grid dimensions to defaults
        this.numScenes = 5;
        this.numTracks = 8;

        // Reset playback state
        this.isPlaying = false;
        this.playingScene = 0;
        this.tempo = 120;
        this.songQuantize = 4;

        // Reset current editor state
        this.currentScene = 0;
        this.currentTrack = 0;
        this.currentLength = 64;

        // Clear sample data if SampleEditor exists
        if (typeof SampleEditor !== 'undefined') {
            SampleEditor.trackSamples = [];
        }

        // Reinitialize clips and all arrays
        this.initClips();

        console.log('AppState reset complete');
    }
};

// Initialize clips on load
AppState.initClips();
