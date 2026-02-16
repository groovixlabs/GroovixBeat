// Audio Bridge - Abstraction layer for internal/external audio rendering
// Allows GrooviXBeat to work with Web Audio (internal) or external renderers (e.g., JUCE plugin host)
//
// ============================================================================
// MESSAGE PROTOCOL REFERENCE
// ============================================================================
//
// OUTGOING MESSAGES (UI → Audio Engine)
// --------------------------------------
// All messages have the format: { command: string, payload: object, timestamp: number }
//
// Note Playback:
//   playNote        { trackIndex, pitch, velocity, startTime, duration, program, isDrum }
//   previewNote     { pitch, program, isDrum }
//   scheduleClip    { trackIndex, notes[], startTime, loopLength, program, isDrum }
//
// Transport - Clip:
//   playClip        {}
//   stopClip        {}
//   toggleClip      {}
//   pauseClip       {}
//   resumeClip      {}
//
// Transport - Scene:
//   playScene       {}
//   stopScene       {}
//   toggleScene     {}
//   pauseScene      {}
//   resumeScene     {}
//   playSceneByIndex { sceneIndex }
//
// Transport - Song:
//   playSong        {}
//   stopSong        {}
//   toggleSong      {}
//   pauseSong       {}
//   resumeSong      {}
//
// Live Mode:
//   startLiveMode   {}
//   stopLiveMode    {}
//   toggleLiveMode  {}
//   queueLiveClip   { sceneIndex, trackIndex }
//
// Mixer:
//   setTrackVolume  { trackIndex, volume: 0-1 }
//   setTrackMute    { trackIndex, muted: bool }
//   setTrackSolo    { trackIndex, solo: bool }
//   setTrackPan     { trackIndex, pan: -1 to 1 }
//
// Global:
//   setTempo        { bpm }
//   stopAll         {}
//   syncProjectState { tempo, numScenes, numTracks, clips[], trackSettings[], mixerStates[] }
//
// Sample:
//   playSample      { trackIndex, startTime }
//   stopSample      { trackIndex }
//   playSampleFile  { trackIndex, filePath, offset }  - Play sample file in JUCE (synced with MIDI)
//   stopSampleFile  { trackIndex }                    - Stop sample file playback in JUCE
//
// Live Mode Sample (quantized):
//   queueSampleFile    { trackIndex, filePath, offset }  - Queue sample to play at next quantize boundary
//   queueStopSample    { trackIndex }                    - Queue sample stop at next quantize boundary
//   triggerSampleScene { sceneIndex, clips[] }           - Trigger all samples in a scene
//                      clips: [{ trackIndex, filePath, loopLengthBeats, offset }, ...]
//   setQuantizeSteps   { steps }                         - Set quantization (1/16ths: 4=beat, 16=bar)
//
// INCOMING MESSAGES (Audio Engine → UI)
// --------------------------------------
// Call AudioBridge.receiveFromExternal(message) with:
//
//   timingUpdate    { type: 'timingUpdate', position: number, isPlaying: bool }
//                   - Send at ~60fps for smooth playhead animation
//                   - position is in steps (1/16th notes)
//
//   transportState  { type: 'transportState', state: { isPlaying, isPlayingScene, isPlayingSong } }
//                   - Send when transport state changes
//
//   meterUpdate     { type: 'meterUpdate', trackIndex, levelL: 0-1, levelR: 0-1 }
//                   - Send for level meter visualization
//
// ============================================================================
// JUCE INTEGRATION EXAMPLE
// ============================================================================
//
// C++ Side (JUCE WebViewComponent):
//
//   webView.evaluateJavascript("AudioBridge.receiveFromExternal(" + jsonString + ")");
//
//   webView.addCallback("audioCommand", [this](const var& args) {
//       auto jsonString = args[0].toString();
//       auto msg = JSON::parse(jsonString);
//       auto command = msg["command"].toString();
//       auto payload = msg["payload"];
//
//       if (command == "playNote") {
//           int track = payload["trackIndex"];
//           int pitch = payload["pitch"];
//           float velocity = payload["velocity"];
//           double startTime = payload["startTime"];
//           double duration = payload["duration"];
//           // Route to your synth/sampler
//       }
//       else if (command == "setTempo") {
//           double bpm = payload["bpm"];
//           // Update audio engine tempo
//       }
//       // ... handle other commands
//   });
//
// JavaScript Side (in webview):
//
//   // Option 1: Auto-connect if juceBridge is on window
//   // (happens automatically on DOMContentLoaded)
//
//   // Option 2: Manual connection
//   AudioBridge.connectExternal((msg) => {
//       window.webkit.messageHandlers.audioCommand.postMessage(JSON.stringify(msg));
//   });
//
// ============================================================================


//*************************************************************************************************************** */
// Juce Interop
//*************************************************************************************************************** */

class PromiseHandler {
  constructor() {

    if (!window.__JUCE__?.backend) return;

    this.lastPromiseId = 0;
    this.promises = new Map();
    window.__JUCE__.backend.addEventListener(
      "__juce__complete",
      ({ promiseId, result }) => {
        if (this.promises.has(promiseId)) {
          this.promises.get(promiseId).resolve(result);
          this.promises.delete(promiseId);
        }
      }
    );
  }

  createPromise() {
    const promiseId = this.lastPromiseId++;
    const result = new Promise((resolve, reject) => {
      this.promises.set(promiseId, { resolve: resolve, reject: reject });
    });
    return [promiseId, result];
  }
}

const promiseHandler = new PromiseHandler();

// Call Native Function from JS -> JUCE
function getNativeFunction(name) {
  if (!window.__JUCE__.initialisationData.__juce__functions.includes(name))
    console.warn(
      `Creating native function binding for '${name}', which is unknown to the backend`
    );

  const f = function () {
    const [promiseId, result] = promiseHandler.createPromise();

    window.__JUCE__.backend.emitEvent("__juce__invoke", {
      name: name,
      params: Array.prototype.slice.call(arguments),
      resultId: promiseId,
    });

    return result;
  };

  return f;
}


// SEND Events from JS  JS -> JUCE
function sendEventToJuceBacked(emittedCount)
{
    window.__JUCE__.backend.emitEvent("audioBridgeEvent", {
      emittedCount: emittedCount,
    });
}

// RECEIVE Events in JS <- JUCE from JUCE.
function HandleEventsFromJuceBackend(func)
{
    window.__JUCE__.backend.addEventListener("juceBridgeEvents", (data) => {
        func(data);
    });
}

function JSFunctionForCallingFromJUCE(funcname,args)
{
    //console.log("JSFunctionForCallingFromJUCE:",funcname,args);
    //return { result : "OK" };
    console.log("JSFunctionForCallingFromJUCE:",funcname);

    if (funcname=='GetAppState')
    {
        let st=AppState.serialize();
        console.log("Return ***** ",st);
        return st;
    }

    if (funcname=='SetAppState')
    {
        // Ensure JUCE connection is established before deserializing
        // This allows the deserialize function to send instrument commands to JUCE
        if (typeof window.connectToJUCE === 'function' && !AudioBridge.isExternalMode()) {
            console.log('[JSFunctionForCallingFromJUCE] Connecting to JUCE before SetAppState...');
            window.connectToJUCE();
        }

        const success = AppState.deserialize(args);
        if (success) {
            // Update UI - use SongScreen object, not 'this'
            if (typeof SongScreen !== 'undefined') {
                SongScreen.stop();
                SongScreen.updateTempoDisplay();
                SongScreen.updateGridStyles();
                SongScreen.renderGrid();
            }
        } else {
            alert('Failed to load song file. The file may be corrupted or in an invalid format.');
        }
        return "OK";
    }

    if (funcname=='NewProject')
    {
        console.log('[JSFunctionForCallingFromJUCE] Creating new project...');
        // Reset AppState to default values
        AppState.reset();
        // Update UI
        if (typeof SongScreen !== 'undefined') {
            SongScreen.stop();
            SongScreen.updateTempoDisplay();
            SongScreen.updateGridStyles();
            SongScreen.renderGrid();
        }
        return "OK";
    }

    return " JSFunctionForCallingFromJUCE You can return from here.";
}

//*************************************************************************************************************** */


const AudioBridge = {
    // ==========================================
    // Configuration
    // ==========================================

    mode: 'external',  // JUCE-only mode

    // External message handler (set by host)
    externalHandler: null,

    // Callback for receiving timing updates from external renderer
    onTimingUpdate: null,

    // Callback for receiving transport state changes from external renderer
    onTransportStateChange: null,

    // Debug mode
    debug: true,  // Enable debug logging

    // ==========================================
    // Playback State (migrated from MidiEngine)
    // ==========================================

    isPlaying: false,
    isPlayingScene: false,
    isPlayingSong: false,
    playheadStep: -1,
    playingSceneIndex: -1,
    playbackStartTime: 0,
    playbackSecondsPerStep: 0,
    playbackTotalSteps: 0,
    playbackLoop: false,
    animationFrameId: null,

    // Clip pause/resume state
    clipPaused: false,
    clipPausedPosition: 0,
    clipResumeOffset: 0,

    // Scene pause/resume state
    scenePaused: false,
    scenePausedPosition: 0,
    sceneResumeOffset: 0,
    sceneLength: 0,           // Total scene length including repeats (for end detection)
    sceneIterationLength: 0,  // Single iteration length (for playhead wrapping)

    // Song playback state
    songPaused: false,
    currentSongScene: 0,

    // Sampler loading state - tracks currently loading instruments
    samplerLoadingTracks: new Set(),
    _pendingPlayCommand: null,

    // Live mode state
    liveMode: false,
    livePlayingClips: {},
    liveQueuedClips: {},
    liveStartTime: 0,
    liveQuantizeInterval: null,
    liveAnimationFrameId: null,

    // ==========================================
    // UI Methods (migrated from MidiEngine)
    // ==========================================

    updatePlayButton: function(playing, paused = false) {
        const playBtn = document.getElementById('clipPlayBtn');
        if (!playBtn) return;

        const icon = playBtn.querySelector('.icon');

        // If sampler instruments are loading, show hourglass in red
        if (this.samplerLoadingTracks.size > 0) {
            if (icon) {
                icon.classList.remove('icon-play', 'icon-pause');
                icon.classList.add('icon-hourglass');
            }
            playBtn.classList.remove('playing');
            playBtn.classList.add('sampler-loading');
            return;
        }

        // Clear loading state
        playBtn.classList.remove('sampler-loading');
        if (icon) {
            icon.classList.remove('icon-hourglass');
        }

        if (playing && !paused) {
            if (icon) {
                icon.classList.remove('icon-play');
                icon.classList.add('icon-pause');
            }
            playBtn.classList.add('playing');
        } else {
            if (icon) {
                icon.classList.remove('icon-pause');
                icon.classList.add('icon-play');
            }
            playBtn.classList.toggle('playing', playing && paused);
        }
    },

    updatePlayAllButton: function(playing, paused) {
        const playBtn = document.getElementById('playAllTracksBtn');
        if (!playBtn) return;

        const icon = playBtn.querySelector('.icon');

        if (playing && !paused) {
            if (icon) {
                icon.classList.remove('icon-play');
                icon.classList.add('icon-pause');
            }
            playBtn.classList.add('playing');
        } else {
            if (icon) {
                icon.classList.remove('icon-pause');
                icon.classList.add('icon-play');
            }
            playBtn.classList.toggle('playing', playing && paused);
        }
    },

    updateSongPlayButton: function(playing, paused) {
        const playBtn = document.getElementById('playBtn');
        if (!playBtn) return;

        const svg = playBtn.querySelector('svg');
        if (!svg) return;

        if (playing && !paused) {
            svg.innerHTML = '<rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/>';
            playBtn.classList.add('playing');
        } else {
            svg.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
            playBtn.classList.toggle('playing', playing && paused);
        }
    },

    updateTrackControlsState: function(disabled) {
        const playBtn = document.getElementById('clipPlayBtn');
        const stopBtn = document.getElementById('clipStopBtn');

        if (playBtn) {
            playBtn.disabled = disabled;
            playBtn.style.opacity = disabled ? '0.4' : '1';
        }
        if (stopBtn) {
            stopBtn.disabled = disabled;
            stopBtn.style.opacity = disabled ? '0.4' : '1';
        }
    },

    // ==========================================
    // Playhead Animation (migrated from MidiEngine)
    // ==========================================

    startPlayheadAnimation: function(totalSteps, secondsPerStep, loop = false) {
        this.playbackTotalSteps = totalSteps;
        this.playbackSecondsPerStep = secondsPerStep;
        this.playbackStartTime = performance.now();
        this.playbackLoop = loop;
        this.playheadStep = 0;

        this.animatePlayhead();
    },

    animatePlayhead: function() {
        if (!this.isPlaying) {
            this.hidePlayheads();
            return;
        }

        const elapsed = (performance.now() - this.playbackStartTime) / 1000;
        let currentStep = elapsed / this.playbackSecondsPerStep;

        if (currentStep >= this.playbackTotalSteps) {
            if (this.playbackLoop) {
                currentStep = currentStep % this.playbackTotalSteps;
            } else {
                this.hidePlayheads();
                return;
            }
        }

        this.playheadStep = currentStep;

        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
            ClipEditor.renderPianoGrid();
        }

        if (this.playingSceneIndex >= 0 && typeof SongScreen !== 'undefined') {
            SongScreen.renderClipPreviews();
        }

        this.animationFrameId = requestAnimationFrame(() => this.animatePlayhead());
    },

    hidePlayheads: function() {
        const wasPlayingScene = this.playingSceneIndex;
        this.playheadStep = -1;
        this.playingSceneIndex = -1;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
            ClipEditor.renderPianoGrid();
        }

        if (wasPlayingScene >= 0 && typeof SongScreen !== 'undefined') {
            SongScreen.renderClipPreviews();
        }
    },

    // ==========================================
    // Live Mode (migrated from MidiEngine, JUCE paths only)
    // ==========================================

    startLiveMode: function() {
        console.log('[AudioBridge] startLiveMode called');
        this.liveMode = true;
        this.livePlayingClips = {};
        this.liveQueuedClips = {};
        this.liveStartTime = performance.now();

        this.preloadAllSamplesForLiveMode();
        this.startLiveQuantizeLoop();
        this.startLivePlayheadAnimation();

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveMode(true);
            console.log('[AudioBridge] Live mode UI updated');
        }
    },

    preloadAllSamplesForLiveMode: function() {
        if (!this.externalHandler) {
            console.log('[AudioBridge] No external handler, skipping sample preload');
            if (typeof SongScreen !== 'undefined') {
                SongScreen.setLiveModeLoadingState('ready');
            }
            return;
        }

        const samplePaths = [];
        const seenPaths = new Set();

        if (typeof SampleEditor !== 'undefined' && typeof AppState !== 'undefined') {
            for (let scene = 0; scene < AppState.numScenes; scene++) {
                for (let track = 0; track < AppState.numTracks; track++) {
                    const trackSample = SampleEditor.getClipSample(scene, track);
                    if (trackSample && trackSample.fullPath) {
                        const path = trackSample.fullPath;
                        if (!seenPaths.has(path)) {
                            seenPaths.add(path);
                            samplePaths.push(path);
                        }
                    }
                }
            }
        }

        if (samplePaths.length > 0) {
            if (typeof SongScreen !== 'undefined') {
                SongScreen.setLiveModeLoadingState('loading');
            }

            console.log('[AudioBridge] Preloading', samplePaths.length, 'samples for Live Mode');
            this.externalHandler({
                command: 'preloadSamplesForLiveMode',
                payload: { samplePaths: samplePaths },
                timestamp: performance.now()
            });
        } else {
            console.log('[AudioBridge] No samples to preload');
            if (typeof SongScreen !== 'undefined') {
                SongScreen.setLiveModeLoadingState('ready');
            }
        }
    },

    stopLiveMode: function() {
        this.liveMode = false;

        if (this.liveQuantizeInterval) {
            clearInterval(this.liveQuantizeInterval);
            this.liveQuantizeInterval = null;
        }

        this.stopLivePlayheadAnimation();

        for (const trackIndex in this.livePlayingClips) {
            this.stopLiveClip(parseInt(trackIndex), true);
        }

        this.livePlayingClips = {};
        this.liveQueuedClips = {};

        if (this.externalHandler) {
            this.externalHandler({ command: 'stop', payload: {}, timestamp: performance.now() });
            this.externalHandler({ command: 'stopAllSamples', payload: {}, timestamp: performance.now() });
            this.externalHandler({ command: 'clearSampleCache', payload: {}, timestamp: performance.now() });
        }

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveMode(false);
        }
    },

    toggleLiveMode: function() {
        console.log('[AudioBridge] toggleLiveMode called, current liveMode:', this.liveMode);
        if (this.liveMode) {
            this.stopLiveMode();
        } else {
            this.startLiveMode();
        }
    },

    startLiveQuantizeLoop: function() {
        if (this.liveQuantizeInterval) {
            clearInterval(this.liveQuantizeInterval);
        }

        const tempo = AppState.tempo || 120;
        const msPerStep = (60 / tempo / 4) * 1000;

        this.liveQuantizeInterval = setInterval(() => {
            if (!this.liveMode) return;

            const elapsed = performance.now() - this.liveStartTime;
            const currentStep = elapsed / msPerStep;

            for (const trackIndex in this.liveQueuedClips) {
                const queued = this.liveQueuedClips[trackIndex];
                const track = parseInt(trackIndex);

                let quantize = AppState.songQuantize || 4;
                if (queued.action === 'play') {
                    quantize = AppState.getEffectiveQuantize(queued.scene, queued.track);
                } else if (queued.action === 'stop') {
                    const playing = this.livePlayingClips[track];
                    if (playing) {
                        quantize = AppState.getEffectiveQuantize(playing.scene, playing.track);
                    }
                }

                const stepInQuantize = currentStep % quantize;
                if (stepInQuantize < 0.5 || stepInQuantize > quantize - 0.5) {
                    if (queued.action === 'play') {
                        this.executeLiveClipStart(track, queued.scene, queued.track);
                    } else if (queued.action === 'stop') {
                        this.executeLiveClipStop(track);
                    }
                    delete this.liveQueuedClips[trackIndex];

                    if (typeof SongScreen !== 'undefined') {
                        SongScreen.updateLiveClipStates();
                    }
                }
            }
        }, 10);
    },

    queueLiveClip: function(sceneIndex, trackIndex) {
        const clip = AppState.clips[sceneIndex][trackIndex];

        const playing = this.livePlayingClips[trackIndex];
        if (playing && playing.scene === sceneIndex && playing.track === trackIndex) {
            if (this.liveQueuedClips[trackIndex] && this.liveQueuedClips[trackIndex].action === 'stop') {
                delete this.liveQueuedClips[trackIndex];
            } else {
                this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'stop' };
            }
        } else {
            this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'play' };
        }

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveClipStates();
        }
    },

    executeLiveClipStart: function(trackIndex, sceneIndex, clipTrackIndex) {
        const clip = AppState.clips[sceneIndex][clipTrackIndex];
        if (!clip || clip.mute) return;

        const tempo = AppState.tempo || 120;
        const secondsPerStep = 60 / tempo / 4;
        const mixerState = AppState.getMixerState(trackIndex);

        if (mixerState.mute) return;

        const trackSettings = AppState.getTrackSettings(trackIndex);
        const isSampleTrack = trackSettings.trackType === 'sample';
        const playbackMode = clip.playMode || 'loop';
        const clipLength = clip.length || 64;

        const timestamp = performance.now();

        if (isSampleTrack) {
            if (this.livePlayingClips[trackIndex]) {
                if (this.livePlayingClips[trackIndex].loopTimeout) {
                    clearTimeout(this.livePlayingClips[trackIndex].loopTimeout);
                }
                delete this.livePlayingClips[trackIndex];
            }

            if (typeof SampleEditor !== 'undefined') {
                const trackSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
                if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                    const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                    const offset = trackSample.offset || 0;
                    const loop = playbackMode === 'loop';

                    this.externalHandler({
                        command: 'playSampleFile',
                        payload: {
                            trackIndex: trackIndex,
                            filePath: filePath,
                            offset: offset,
                            loop: loop,
                            loopLengthSteps: clipLength,
                            seamless: true
                        },
                        timestamp
                    });
                }
            }
        } else if (clip.notes && clip.notes.length > 0) {
            if (this.livePlayingClips[trackIndex]) {
                this.stopLiveClip(trackIndex, true);
            }

            const notesToSchedule = clip.notes
                .filter(note => note.start < clipLength)
                .map(note => ({
                    ...note,
                    duration: Math.min(note.duration, clipLength - note.start)
                }));

            this.externalHandler({
                command: 'scheduleClip',
                payload: {
                    trackIndex: trackIndex,
                    sceneIndex: sceneIndex,
                    notes: notesToSchedule,
                    loopLength: clipLength,
                    loop: (clip.playMode || 'loop') === 'loop',
                    program: trackSettings.midiProgram || 0,
                    isDrum: trackSettings.isPercussion || false
                },
                timestamp
            });

            this.externalHandler({
                command: 'playLiveClip',
                payload: { trackIndex: trackIndex },
                timestamp
            });
        }

        this.livePlayingClips[trackIndex] = {
            scene: sceneIndex,
            track: clipTrackIndex,
            startTime: performance.now(),
            loopStartTime: performance.now(),
            clipLength: clipLength,
            secondsPerStep: secondsPerStep,
            scheduledNotes: [],
            loopTimeout: null,
            isSampleTrack: isSampleTrack,
            playbackMode: playbackMode,
            isExternal: true
        };
    },

    executeLiveClipStop: function(trackIndex) {
        this.stopLiveClip(trackIndex, false);
    },

    stopLiveClip: function(trackIndex, immediate) {
        const playing = this.livePlayingClips[trackIndex];
        if (!playing) return;

        if (playing.loopTimeout) {
            clearTimeout(playing.loopTimeout);
        }

        const timestamp = performance.now();
        if (this.externalHandler) {
            if (playing.isSampleTrack) {
                this.externalHandler({
                    command: 'stopSample',
                    payload: { trackIndex: trackIndex },
                    timestamp
                });
            } else {
                this.externalHandler({
                    command: 'stopLiveClip',
                    payload: { trackIndex: trackIndex },
                    timestamp
                });
            }
        }
        delete this.livePlayingClips[trackIndex];
    },

    isLiveClipPlaying: function(sceneIndex, trackIndex) {
        const playing = this.livePlayingClips[trackIndex];
        return playing && playing.scene === sceneIndex && playing.track === trackIndex;
    },

    isLiveClipQueued: function(sceneIndex, trackIndex) {
        const queued = this.liveQueuedClips[trackIndex];
        return queued && queued.scene === sceneIndex && queued.track === trackIndex && queued.action === 'play';
    },

    isLiveClipStopping: function(sceneIndex, trackIndex) {
        const queued = this.liveQueuedClips[trackIndex];
        const playing = this.livePlayingClips[trackIndex];
        return queued && queued.action === 'stop' && playing && playing.scene === sceneIndex && playing.track === trackIndex;
    },

    getLiveClipPlayheadStep: function(trackIndex) {
        const playing = this.livePlayingClips[trackIndex];
        if (!playing) return -1;

        const elapsed = (performance.now() - playing.loopStartTime) / 1000;
        const currentStep = elapsed / playing.secondsPerStep;

        return currentStep % playing.clipLength;
    },

    startLivePlayheadAnimation: function() {
        if (this.liveAnimationFrameId) {
            cancelAnimationFrame(this.liveAnimationFrameId);
        }

        const animate = () => {
            if (!this.liveMode) {
                this.liveAnimationFrameId = null;
                return;
            }

            if (typeof SongScreen !== 'undefined') {
                SongScreen.renderLivePlayheads();
            }

            this.liveAnimationFrameId = requestAnimationFrame(animate);
        };

        this.liveAnimationFrameId = requestAnimationFrame(animate);
    },

    stopLivePlayheadAnimation: function() {
        if (this.liveAnimationFrameId) {
            cancelAnimationFrame(this.liveAnimationFrameId);
            this.liveAnimationFrameId = null;
        }
    },

    // ==========================================
    // Event Handlers (migrated from MidiEngine)
    // ==========================================

    isInSampleMode: function() {
        return typeof ClipEditor !== 'undefined' &&
               ClipEditor.getTrackMode(AppState.currentTrack) === 'sample';
    },

    attachEventHandlers: function() {
        const playBtn = document.getElementById('clipPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (this.isInSampleMode() && typeof SampleEditor !== 'undefined') {
                    SampleEditor.togglePlay();
                } else {
                    this.toggleClip();
                }
            });
        }

        const stopBtn = document.getElementById('clipStopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopClip();
                if (this.isInSampleMode() && typeof SampleEditor !== 'undefined') {
                    SampleEditor.stop();
                }
            });
        }

        const playAllBtn = document.getElementById('playAllTracksBtn');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                this.toggleScene();
            });
        }

        const stopAllBtn = document.getElementById('stopAllTracksBtn');
        if (stopAllBtn) {
            stopAllBtn.addEventListener('click', () => {
                this.stopScene();
            });
        }

        document.addEventListener('keydown', (e) => {
            const editorPanel = document.getElementById('clipEditorPanel');
            if (!editorPanel || editorPanel.style.display === 'none') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (this.isInSampleMode() && typeof SampleEditor !== 'undefined') {
                    SampleEditor.togglePlay();
                } else {
                    this.toggleClip();
                }
            }
        });
    },

    // ==========================================
    // Core Message Passing
    // ==========================================

    /**
     * Send a command to the audio engine (JUCE)
     * @param {string} command - The command name
     * @param {object} payload - Command parameters
     */
    send(command, payload) {
        if (this.debug) {
            console.log('[AudioBridge] Send:', command, payload);
        }

        if (this.externalHandler) {
            this._sendExternal(command, payload);
        } else {
            console.warn('[AudioBridge] No external handler connected, command ignored:', command);
        }
    },

    /**
     * Handle external mode - convert play commands to scheduleClip with clip data
     */
    _sendExternal(command, payload) {
        const timestamp = performance.now();

        // Block playback if any sampler instruments are still loading
        if (this.samplerLoadingTracks.size > 0) {
            const playCommands = ['toggleClip', 'playClip', 'toggleScene', 'playScene',
                                  'playSceneByIndex', 'toggleSong', 'playSong'];
            if (playCommands.includes(command)) {
                console.warn('[AudioBridge] Playback blocked - sampler instruments loading on tracks:',
                    [...this.samplerLoadingTracks]);
                return;
            }
        }

        // For toggle clip command, handle play/pause/resume logic
        if (command === 'toggleClip') {
            // Check clipPaused first - JUCE may have set isPlaying=false when paused
            if (this.clipPaused) {
                // Currently paused -> stop and restart from saved position
                const resumePosition = this.clipPausedPosition || 0;

                this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp });
                this.externalHandler({ command: 'stopClip', payload: {}, timestamp });

                const scene = AppState.currentScene;
                const track = AppState.currentTrack;
                const clip = AppState.getClip(scene, track);
                const trackSettings = AppState.getTrackSettings(track);

                if (trackSettings.trackType !== 'sample' && clip.notes && clip.notes.length > 0) {
                    const clipLength = clip.length || AppState.currentLength;

                    let notesInClip = clip.notes
                        .filter(note => note.start < clipLength)
                        .map(note => ({
                            ...note,
                            duration: Math.min(note.duration, clipLength - note.start)
                        }));

                    const adjustedNotes = notesInClip
                        .filter(note => (note.start + note.duration) > resumePosition)
                        .map(note => ({
                            ...note,
                            start: Math.max(0, note.start - resumePosition),
                            duration: note.start < resumePosition
                                ? note.duration - (resumePosition - note.start)
                                : note.duration
                        }));

                    const remainingLength = clipLength - resumePosition;

                    this.externalHandler({
                        command: 'scheduleClip',
                        payload: {
                            trackIndex: track,
                            sceneIndex: scene,
                            notes: adjustedNotes,
                            loopLength: remainingLength,
                            loop: (clip.playMode || 'loop') === 'loop',
                            program: trackSettings.midiProgram || 0,
                            isDrum: trackSettings.isPercussion || false
                        },
                        timestamp
                    });
                }

                this.externalHandler({ command: 'playClip', payload: {}, timestamp });

                this.clipResumeOffset = resumePosition;
                this.clipPaused = false;
                this.isPlaying = true;
                this.playbackStartTime = performance.now();
                this.playbackSecondsPerStep = 60 / (AppState.tempo || 120) / 4;
                this.updatePlayButton(true, false);
            } else if (this.isPlaying) {
                // Currently playing -> stop and save position
                this.clipPausedPosition = this.playheadStep || 0;
                this.externalHandler({ command: 'stopClip', payload: {}, timestamp });
                this.clipPaused = true;
                this.updatePlayButton(true, true);
            } else {
                // Not playing -> start playback (single track only)
                this._pendingPlayCommand = 'playClip';
                this._ensureSamplerInstrumentsLoaded();

                const scene = AppState.currentScene;
                const track = AppState.currentTrack;
                const clip = AppState.getClip(scene, track);
                const trackSettings = AppState.getTrackSettings(track);

                this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp });
                this.externalHandler({ command: 'clearAllClips', payload: {}, timestamp });
                this.externalHandler({ command: 'stopAllSamples', payload: {}, timestamp });

                if (trackSettings.trackType !== 'sample' && clip.notes && clip.notes.length > 0) {
                    const clipLength = clip.length || AppState.currentLength;

                    const notesToSchedule = clip.notes
                        .filter(note => note.start < clipLength)
                        .map(note => ({
                            ...note,
                            duration: Math.min(note.duration, clipLength - note.start)
                        }));

                    this.externalHandler({
                        command: 'scheduleClip',
                        payload: {
                            trackIndex: track,
                            sceneIndex: scene,
                            notes: notesToSchedule,
                            loopLength: clipLength,
                            loop: (clip.playMode || 'loop') === 'loop',
                            program: trackSettings.midiProgram || 0,
                            isDrum: trackSettings.isPercussion || false
                        },
                        timestamp
                    });
                } else if (trackSettings.trackType === 'sample') {
                    if (typeof SampleEditor !== 'undefined') {
                        const trackSample = SampleEditor.getClipSample(scene, track);
                        if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                            const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                            const offset = trackSample.offset || 0;
                            const loop = (clip.playMode || 'loop') === 'loop';
                            const clipLength = clip.length || 64;

                            this.externalHandler({
                                command: 'playSampleFile',
                                payload: { trackIndex: track, filePath, offset, loop, loopLengthSteps: clipLength },
                                timestamp
                            });
                        }
                    }
                }
                this.externalHandler({ command: 'playClip', payload: {}, timestamp });
                this.isPlaying = true;
                this.clipPaused = false;
                this.clipResumeOffset = 0;
                this.playbackStartTime = performance.now();
                this.playbackSecondsPerStep = 60 / (AppState.tempo || 120) / 4;
                this.updatePlayButton(true, false);
            }
        }
        // For play clip command, always start fresh playback (single track only)
        else if (command === 'playClip') {
            this._pendingPlayCommand = 'playClip';
            this._ensureSamplerInstrumentsLoaded();

            const scene = AppState.currentScene;
            const track = AppState.currentTrack;
            const clip = AppState.getClip(scene, track);
            const trackSettings = AppState.getTrackSettings(track);

            this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp });
            this.externalHandler({ command: 'clearAllClips', payload: {}, timestamp });
            this.externalHandler({ command: 'stopAllSamples', payload: {}, timestamp });

            if (trackSettings.trackType !== 'sample' && clip.notes && clip.notes.length > 0) {
                const clipLength = clip.length || AppState.currentLength;

                const notesToSchedule = clip.notes
                    .filter(note => note.start < clipLength)
                    .map(note => ({
                        ...note,
                        duration: Math.min(note.duration, clipLength - note.start)
                    }));

                this.externalHandler({
                    command: 'scheduleClip',
                    payload: {
                        trackIndex: track,
                        sceneIndex: scene,
                        notes: notesToSchedule,
                        loopLength: clipLength,
                        loop: (clip.playMode || 'loop') === 'loop',
                        program: trackSettings.midiProgram || 0,
                        isDrum: trackSettings.isPercussion || false
                    },
                    timestamp
                });
            } else if (trackSettings.trackType === 'sample') {
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(scene, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                        const offset = trackSample.offset || 0;
                        const loop = (clip.playMode || 'loop') === 'loop';
                        const clipLength = clip.length || 64;

                        this.externalHandler({
                            command: 'playSampleFile',
                            payload: { trackIndex: track, filePath, offset, loop, loopLengthSteps: clipLength },
                            timestamp
                        });
                    }
                }
            }
            this.externalHandler({ command, payload, timestamp });

            this.isPlaying = true;
            this.clipPaused = false;
            this.clipPausedPosition = 0;
            this.clipResumeOffset = 0;
            this.playbackStartTime = performance.now();
            this.playbackSecondsPerStep = 60 / (AppState.tempo || 120) / 4;
            this.updatePlayButton(true, false);
        }
        // For stop clip command
        else if (command === 'stopClip') {
            this._pendingPlayCommand = null;
            this.externalHandler({ command, payload, timestamp });
            this.isPlaying = false;
            this.clipPaused = false;
            this.clipPausedPosition = 0;
            this.clipResumeOffset = 0;
            this.playheadStep = 0;
            this.playbackStartTime = 0;
            this.updatePlayButton(false);
            this._lastLoopIteration = 0;
        }
        // For pause clip command
        else if (command === 'pauseClip') {
            this.clipPausedPosition = this.playheadStep || 0;
            this.externalHandler({
                command,
                payload: { ...payload, position: this.clipPausedPosition || 0 },
                timestamp
            });
            this.clipPaused = true;
            this.updatePlayButton(true, true);
        }
        // For resume clip command
        else if (command === 'resumeClip') {
            const resumePosition = this.clipPausedPosition || 0;
            this.externalHandler({
                command,
                payload: { ...payload, position: resumePosition },
                timestamp
            });
            this.clipPaused = false;
            this.updatePlayButton(true, false);
        }
        // For toggle scene command - handle play/pause/resume
        // When triggered from clips screen (playAllTracksBtn), loops indefinitely
        else if (command === 'toggleScene') {
            if (this.scenePaused) {
                this._resumeSceneFromPosition(timestamp);
            } else if (this.isPlayingScene) {
                this._pauseScene(timestamp);
            } else {
                this._startScene(AppState.currentScene, 0, timestamp, true);
            }
        }
        // For play scene command - always start fresh
        else if (command === 'playScene') {
            this._startScene(AppState.currentScene, 0, timestamp);
        }
        // For stop scene command
        else if (command === 'stopScene') {
            this._pendingPlayCommand = null;
            this.externalHandler({ command, payload, timestamp });
            this.isPlaying = false;
            this.isPlayingScene = false;
            this.scenePaused = false;
            this.scenePausedPosition = 0;
            this.sceneResumeOffset = 0;
            this.sceneLength = 0;
            this.sceneIterationLength = 0;
            this.playingSceneIndex = -1;
            this.playheadStep = 0;
            this.updatePlayButton(false);
            this.updatePlayAllButton(false, false);
            this.updateTrackControlsState(false);
            if (typeof SongScreen !== 'undefined') {
                SongScreen.highlightPlayingScene(-1);
            }
        }
        // For playSceneByIndex, use _startScene helper for consistent behavior
        else if (command === 'playSceneByIndex') {
            const scene = payload.sceneIndex;
            this._startScene(scene, 0, timestamp);
        }
        // For toggleSong command - handle play/pause/resume
        else if (command === 'toggleSong') {
            if (this.songPaused) {
                this._resumeSong(timestamp);
            } else if (this.isPlayingSong) {
                this._pauseSong(timestamp);
            } else {
                this._playSong(timestamp);
            }
        }
        // For playSong command - always start fresh
        else if (command === 'playSong') {
            this._playSong(timestamp);
        }
        // For stopSong command
        else if (command === 'stopSong') {
            this._stopSong(timestamp);
        }
        // For pauseSong command
        else if (command === 'pauseSong') {
            this._pauseSong(timestamp);
        }
        // For resumeSong command
        else if (command === 'resumeSong') {
            this._resumeSong(timestamp);
        }
        // Live mode commands
        else if (command === 'toggleLiveMode') {
            this.toggleLiveMode();
        }
        else if (command === 'startLiveMode') {
            this.startLiveMode();
        }
        else if (command === 'stopLiveMode') {
            this.stopLiveMode();
        }
        else if (command === 'queueLiveClip') {
            this.queueLiveClip(payload.sceneIndex, payload.trackIndex);
        }
        // All other commands pass through directly
        else {
            this.externalHandler({ command, payload, timestamp });
        }
    },

    /**
     * Ensure sampler instruments are loaded on JUCE side before playback.
     * Sends setSamplerInstrument for any tracks that need it.
     * C++ skips if already loaded; if loading is triggered, C++ sends
     * samplerLoadState + allSamplersReady events.
     */
    _ensureSamplerInstrumentsLoaded() {
        for (let t = 0; t < AppState.numTracks; t++) {
            const ts = AppState.getTrackSettings(t);
            if (ts.trackType === 'sampled_instrument' && ts.samplerInstrument) {
                this.externalHandler({
                    command: 'setSamplerInstrument',
                    payload: { trackIndex: t, instrumentName: ts.samplerInstrument },
                    timestamp: performance.now()
                });
            }
        }
    },

    /**
     * Helper: Start scene playback from a position
     */
    _startScene(sceneIndex, startPosition, timestamp, infiniteLoop = false) {
        this._pendingPlayCommand = 'playScene';
        this._ensureSamplerInstrumentsLoaded();

        // Debug: Log all stored samples
        if (typeof SampleEditor !== 'undefined' && SampleEditor.clipSamples) {
            console.log('[AudioBridge] _startScene - All stored samples:', Object.keys(SampleEditor.clipSamples));
            for (const [key, sample] of Object.entries(SampleEditor.clipSamples)) {
                if (sample && (sample.fullPath || sample.fileName)) {
                    console.log('[AudioBridge]   Key:', key, '-> File:', sample.fullPath || sample.fileName);
                }
            }
        }

        // IMPORTANT: Send current tempo before starting playback
        this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp });

        // First stop any existing playback and clear clips from previous scene
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });
        this.externalHandler({ command: 'clearAllClips', payload: {}, timestamp });

        // Calculate the longest track length in the scene (both MIDI and sample tracks)
        let maxLength = 0;
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);

            if (trackSettings.trackType === 'sample') {
                // Sample tracks use clip length for looping
                const clipLength = clip.length || 64;
                maxLength = Math.max(maxLength, clipLength);
            } else if (clip.notes && clip.notes.length > 0) {
                // MIDI tracks
                const clipLength = clip.length || 64;
                maxLength = Math.max(maxLength, clipLength);
            }
        }

        // Get scene repeat count from properties
        const sceneRepeat = AppState.getSceneProperties(sceneIndex).repeat || 1;

        // Store scene lengths for end detection and playhead wrapping
        this.sceneIterationLength = maxLength;
        // infiniteLoop: no end detection (clips screen loops until user stops)
        this.sceneLength = infiniteLoop ? 0 : maxLength * sceneRepeat;
        this.sceneResumeOffset = startPosition;

        // Schedule clips for each track
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);
            const mixerState = AppState.getMixerState(track);

            // Skip muted tracks or muted clips
            if (mixerState.mute || clip.mute) continue;

            // Use track type to determine playback mode
            if (trackSettings.trackType === 'sample') {
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    console.log('[AudioBridge] Looking up sample for scene', sceneIndex, 'track', track,
                                '-> key:', sceneIndex + '_' + track,
                                '-> found:', trackSample ? (trackSample.fullPath || trackSample.fileName || 'no file') : 'null');
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                        const offset = trackSample.offset || 0;
                        const loop = (clip.playMode || 'loop') === 'loop';
                        const clipLength = clip.length || 64;
                        console.log('[AudioBridge] Playing sample - scene:', sceneIndex, 'track:', track, 'file:', filePath);
                        this.externalHandler({
                            command: 'playSampleFile',
                            payload: { trackIndex: track, filePath, offset, loop, loopLengthSteps: clipLength },
                            timestamp
                        });
                    }
                }
            } else if (clip.notes && clip.notes.length > 0) {
                const clipLength = clip.length || AppState.currentLength;

                // First filter notes to only include those within the clip length
                // Notes that start at or after clipLength are excluded
                // Notes that extend past clipLength are trimmed
                let notesToSchedule = clip.notes
                    .filter(note => note.start < clipLength)
                    .map(note => ({
                        ...note,
                        // Trim duration if note extends past clip length
                        duration: Math.min(note.duration, clipLength - note.start)
                    }));

                let loopLength = clipLength;

                // Further filter and adjust notes if resuming from a position
                if (startPosition > 0) {
                    notesToSchedule = notesToSchedule
                        .filter(note => (note.start + note.duration) > startPosition)
                        .map(note => ({
                            ...note,
                            start: Math.max(0, note.start - startPosition),
                            duration: note.start < startPosition
                                ? note.duration - (startPosition - note.start)
                                : note.duration
                        }));
                    loopLength = loopLength - startPosition;
                }

                this.externalHandler({
                    command: 'scheduleClip',
                    payload: {
                        trackIndex: track,
                        sceneIndex: sceneIndex,
                        notes: notesToSchedule,
                        loopLength: loopLength,
                        loop: (clip.playMode || 'loop') === 'loop',
                        program: trackSettings.midiProgram || 0,
                        isDrum: trackSettings.isPercussion || false
                    },
                    timestamp
                });
            }
        }

        // Send play command
        this.externalHandler({ command: 'playScene', payload: {}, timestamp });

        // Update UI state and start playhead animation
        this.isPlaying = true;
        this.isPlayingScene = true;
        this.scenePaused = false;
        this.playingSceneIndex = sceneIndex;
        this.updatePlayButton(true);
        this.updatePlayAllButton(true, false);
        this.updateTrackControlsState(true);
        if (typeof SongScreen !== 'undefined') {
            SongScreen.highlightPlayingScene(sceneIndex);
        }

        const tempo = AppState.tempo || 120;
        const secondsPerStep = 60 / tempo / 4;
        const totalSteps = Math.max(maxLength, AppState.getMaxLengthInScene(sceneIndex));
        this.startPlayheadAnimation(totalSteps, secondsPerStep);
    },

    /**
     * Helper: Pause scene playback
     */
    _pauseScene(timestamp) {
        this.scenePausedPosition = this.playheadStep || 0;
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });

        this.scenePaused = true;
        this.isPlaying = false;
        this.updatePlayButton(true, true);
        this.updatePlayAllButton(true, true);
    },

    /**
     * Helper: Resume scene from paused position
     */
    _resumeSceneFromPosition(timestamp) {
        const resumePosition = this.scenePausedPosition || 0;
        const sceneIndex = this.playingSceneIndex >= 0 ? this.playingSceneIndex : AppState.currentScene;

        this._startScene(sceneIndex, resumePosition, timestamp);
    },

    /**
     * Helper: Start song playback from scene 0
     */
    _playSong(timestamp) {
        // Stop any current playback first
        this._stopSong(timestamp);
        this._pendingPlayCommand = 'playSong';

        this.isPlayingSong = true;
        this.songPaused = false;
        this.currentSongScene = 0;
        this.updateSongPlayButton(true, false);

        // Start playing from scene 0
        this._playSongScene(0, timestamp);
    },

    /**
     * Helper: Play a specific scene as part of song playback
     */
    _playSongScene(sceneIndex, timestamp) {
        if (!this.isPlayingSong || this.songPaused) return;

        if (sceneIndex >= AppState.numScenes) {
            // Song finished - stop
            this._stopSong(timestamp);
            return;
        }

        // Check if scene is empty (no notes and no sample tracks with files)
        let hasContent = false;
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);

            if (trackSettings.trackType === 'sample') {
                // Check if sample track has a file loaded for this clip
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        hasContent = true;
                        break;
                    }
                }
            } else if (clip.notes && clip.notes.length > 0) {
                hasContent = true;
                break;
            }
        }

        if (!hasContent) {
            // Empty scene - stop the song
            console.log('[AudioBridge] Empty scene encountered at', sceneIndex + 1, '- stopping song');
            this._stopSong(timestamp);
            return;
        }

        this.currentSongScene = sceneIndex;

        // Use _startScene to play this scene (schedules clips to JUCE)
        this._startScene(sceneIndex, 0, timestamp);

        // Also set song-specific state
        this.isPlayingSong = true;

        // Calculate scene duration for timeout
        const tempo = AppState.tempo || 120;
        const secondsPerStep = 60 / tempo / 4;

        // Get scene-level repeat count
        const sceneProps = AppState.getSceneProperties(sceneIndex);
        const sceneRepeat = sceneProps.repeat || 1;

        // Calculate base loop length (without repeats) and total length (with clip repeats)
        let baseLoopLength = 0;
        let totalLength = 0;
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);

            if (trackSettings.trackType === 'sample') {
                const clipLength = clip.length || 64;
                baseLoopLength = Math.max(baseLoopLength, clipLength);
                totalLength = Math.max(totalLength, clipLength);
            } else if (clip.notes && clip.notes.length > 0) {
                const clipLength = clip.length || 64;
                const repeatCount = clip.repeat || 1;
                baseLoopLength = Math.max(baseLoopLength, clipLength);
                totalLength = Math.max(totalLength, clipLength * repeatCount);
            }
        }
        baseLoopLength = Math.max(baseLoopLength, AppState.getMaxLengthInScene(sceneIndex));
        totalLength = Math.max(totalLength, baseLoopLength);

        // Apply scene-level repeat to total duration
        totalLength = totalLength * sceneRepeat;

        // Restart playhead animation with looping enabled for song mode
        this.startPlayheadAnimation(baseLoopLength, secondsPerStep, true);

        const sceneDuration = totalLength * secondsPerStep;

        console.log('[AudioBridge] Playing song scene', sceneIndex + 1, 'duration:', sceneDuration.toFixed(2) + 's');

        // Clear any existing song scene timeout
        if (this._songSceneTimeout) {
            clearTimeout(this._songSceneTimeout);
        }

        // Schedule next scene after this one finishes
        this._songSceneTimeout = setTimeout(() => {
            if (this.isPlayingSong && !this.songPaused) {
                // Stop current scene's clips
                this.externalHandler({ command: 'stopScene', payload: {}, timestamp: performance.now() });

                // Play next scene
                this._playSongScene(sceneIndex + 1, performance.now());
            }
        }, (sceneDuration + 0.2) * 1000);
    },

    /**
     * Helper: Stop song playback
     */
    _stopSong(timestamp) {
        this._pendingPlayCommand = null;
        // Clear song scene timeout
        if (this._songSceneTimeout) {
            clearTimeout(this._songSceneTimeout);
            this._songSceneTimeout = null;
        }

        // Stop the current scene
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });

        // Reset all song state
        this.isPlayingSong = false;
        this.songPaused = false;
        this.currentSongScene = 0;
        this.isPlaying = false;
        this.isPlayingScene = false;
        this.playingSceneIndex = -1;
        this.updateSongPlayButton(false, false);
        this.updatePlayButton(false);
        this.updatePlayAllButton(false, false);
        this.updateTrackControlsState(false);
        if (typeof SongScreen !== 'undefined') {
            SongScreen.highlightPlayingScene(-1);
        }
    },

    /**
     * Helper: Pause song playback
     */
    _pauseSong(timestamp) {
        // Clear song scene timeout
        if (this._songSceneTimeout) {
            clearTimeout(this._songSceneTimeout);
            this._songSceneTimeout = null;
        }

        // Pause the current scene
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });

        this.songPaused = true;
        this.isPlaying = false;
        this.updateSongPlayButton(true, true);
        this.updatePlayButton(true, true);
        this.updatePlayAllButton(true, true);
    },

    /**
     * Helper: Resume song playback from paused position
     */
    _resumeSong(timestamp) {
        this.songPaused = false;
        this.updateSongPlayButton(true, false);

        // Resume from the current song scene
        const sceneIndex = this.currentSongScene || 0;
        this._playSongScene(sceneIndex, timestamp);
    },

    // Song scene timeout reference
    _songSceneTimeout: null,

    // ==========================================
    // High-Level API (called by UI components)
    // ==========================================

    /**
     * Play a single note
     */
    playNote(trackIndex, pitch, velocity, startTime, duration, program = 0, isDrum = false) {
        this.send('playNote', {
            trackIndex,
            pitch,
            velocity,
            startTime,
            duration,
            program,
            isDrum
        });
    },

    /**
     * Preview a note (immediate playback for auditioning)
     */
    previewNote(pitch, program = 0, isDrum = false) {
        this.send('previewNote', { pitch, program, isDrum });
    },

    /**
     * Schedule an entire clip for playback
     */
    scheduleClip(trackIndex, notes, startTime, loopLength, program = 0, isDrum = false, loop = true) {
        this.send('scheduleClip', {
            trackIndex,
            notes,
            startTime,
            loopLength,
            loop,
            program,
            isDrum
        });
    },

    // Transport - Clip
    playClip() { this.send('playClip', {}); },
    stopClip() { this.send('stopClip', {}); },
    toggleClip() { this.send('toggleClip', {}); },
    pauseClip() { this.send('pauseClip', {}); },
    resumeClip() { this.send('resumeClip', {}); },

    // Transport - Scene
    playScene() { this.send('playScene', {}); },
    stopScene() { this.send('stopScene', {}); },
    toggleScene() { this.send('toggleScene', {}); },
    pauseScene() { this.send('pauseScene', {}); },
    resumeScene() { this.send('resumeScene', {}); },
    playSceneByIndex(sceneIndex) { this.send('playSceneByIndex', { sceneIndex }); },

    // Transport - Song
    playSong() { this.send('playSong', {}); },
    stopSong() { this.send('stopSong', {}); },
    toggleSong() { this.send('toggleSong', {}); },
    pauseSong() { this.send('pauseSong', {}); },
    resumeSong() { this.send('resumeSong', {}); },

    // Live mode methods defined earlier in the object (startLiveMode, stopLiveMode, toggleLiveMode, queueLiveClip)

    // Mixer controls
    setTrackVolume(trackIndex, volume) {
        this.send('setTrackVolume', { trackIndex, volume });
    },
    setTrackMute(trackIndex, muted) {
        this.send('setTrackMute', { trackIndex, muted });
    },
    setTrackSolo(trackIndex, solo) {
        this.send('setTrackSolo', { trackIndex, solo });
    },
    setTrackPan(trackIndex, pan) {
        this.send('setTrackPan', { trackIndex, pan });
    },

    // Global settings
    setTempo(bpm) {
        this.send('setTempo', { bpm });
    },

    // Sample playback
    playSample(trackIndex, startTime = 0) {
        this.send('playSample', { trackIndex, startTime });
    },
    stopSample(trackIndex) {
        this.send('stopSample', { trackIndex });
    },

    // Sample file playback (for JUCE - includes file path for synced playback)
    // loopLengthSteps: clip length in 1/16th notes (JUCE will handle looping at this boundary)
    playSampleFile(trackIndex, filePath, offset = 0, loop = false, loopLengthSteps = 0) {
        this.send('playSampleFile', { trackIndex, filePath, offset, loop, loopLengthSteps });
    },
    stopSampleFile(trackIndex) {
        this.send('stopSampleFile', { trackIndex });
    },

    // Live Mode sample playback (quantized to beat grid)
    queueSampleFile(trackIndex, filePath, offset = 0) {
        this.send('queueSampleFile', { trackIndex, filePath, offset });
    },
    queueStopSample(trackIndex) {
        this.send('queueStopSample', { trackIndex });
    },
    /**
     * Trigger all samples in a scene (Live Mode)
     * @param {number} sceneIndex - Scene number
     * @param {Array} clips - Array of clip objects: { trackIndex, filePath, loopLengthBeats, offset }
     */
    triggerSampleScene(sceneIndex, clips) {
        this.send('triggerSampleScene', { sceneIndex, clips });
    },
    /**
     * Set quantization for Live Mode
     * @param {number} steps - Quantization in 1/16th notes (4 = 1 beat, 16 = 1 bar, 64 = 4 bars)
     */
    setQuantizeSteps(steps) {
        this.send('setQuantizeSteps', { steps });
    },

    // Stop all audio
    stopAll() {
        this.send('stopAll', {});
    },

    // ==========================================
    // Graph State Serialization
    // ==========================================

    /**
     * Request the current graph state from JUCE (plugins, connections, parameters)
     * Returns a Promise that resolves with { graphXml, trackInstrumentNodes }
     */
    getGraphState() {
        return new Promise((resolve, reject) => {
            if (!this.isExternalMode()) {
                // Not in external mode, return empty state
                resolve({ graphXml: '', trackInstrumentNodes: {} });
                return;
            }

            // Set up resolver for the response
            this._graphStateResolve = resolve;

            // Set timeout for response
            setTimeout(() => {
                if (this._graphStateResolve) {
                    console.warn('[AudioBridge] getGraphState timed out');
                    this._graphStateResolve = null;
                    resolve({ graphXml: '', trackInstrumentNodes: {} });
                }
            }, 5000);

            // Request graph state from JUCE
            this.send('getGraphState', {});
        });
    },

    /**
     * Restore the graph state in JUCE from saved data
     * @param {string} graphXml - The serialized graph XML
     * @param {object} trackInstrumentNodes - Mapping of track index to node ID
     */
    setGraphState(graphXml, trackInstrumentNodes = {}) {
        if (!this.isExternalMode()) {
            console.log('[AudioBridge] Not in external mode, skipping setGraphState');
            return;
        }

        this.send('setGraphState', {
            graphXml: graphXml,
            trackInstrumentNodes: trackInstrumentNodes
        });
    },

    /**
     * Request plugin parameters for a track's instrument (for automation UI)
     * @param {number} trackIndex - Track index
     */
    getPluginParameters(trackIndex) {
        if (!this.isExternalMode()) {
            return;
        }

        this.send('getPluginParameters', { trackIndex });
    },

    // ==========================================
    // External Renderer Integration
    // ==========================================

    /**
     * Connect to an external audio renderer (e.g., JUCE plugin host)
     * @param {function} handler - Function to receive audio commands
     */
    connectExternal(handler) {
        this.mode = 'external';
        this.externalHandler = handler;
        console.log('[AudioBridge] Connected to external renderer');
    },

    /**
     * Disconnect from external renderer and revert to internal Web Audio
     */
    disconnectExternal() {
        this.mode = 'internal';
        this.externalHandler = null;
        console.log('[AudioBridge] Disconnected from external renderer, using internal Web Audio');
    },

    /**
     * Check if connected to an external renderer
     */
    isExternalMode() {
        return this.mode === 'external' && this.externalHandler !== null;
    },

    /**
     * Receive a message from the external renderer (for bidirectional communication)
     * Call this from your JUCE bridge to send timing/state updates to the UI
     */
    receiveFromExternal(message) {
        if (this.debug) {
            //console.log('[AudioBridge] Receive:', message);
        }

        switch (message.type) {
            case 'timingUpdate':
                // External renderer sends current playhead position
                if (this.onTimingUpdate) {
                    this.onTimingUpdate(message.position, message.isPlaying);
                }
                // Update internal state for UI rendering
                {
                    let position = parseFloat(message.position) || 0;

                    // Determine if this is scene or clip playback and apply appropriate offset
                    if (this.isPlayingScene && !this.scenePaused) {
                        // Scene playback - apply scene resume offset
                        if (this.sceneResumeOffset && this.sceneResumeOffset > 0) {
                            position += this.sceneResumeOffset;
                        }
                        this.isPlaying = message.isPlaying === true || message.isPlaying === 'true';

                        // Check if scene has reached the end (including repeats)
                        if (this.sceneLength && position >= this.sceneLength) {
                            console.log('[AudioBridge] Scene reached end (after ' +
                                (this.sceneIterationLength > 0 ? Math.round(this.sceneLength / this.sceneIterationLength) : 1) +
                                ' repeat(s)), stopping playback');
                            this.stopScene();
                        } else {
                            // Wrap playhead within single iteration for UI display
                            if (this.sceneIterationLength > 0) {
                                this.playheadStep = position % this.sceneIterationLength;
                            } else {
                                this.playheadStep = position;
                            }
                        }
                    } else if (this.scenePaused) {
                        // Scene is paused - don't update playhead
                    } else if (!this.clipPaused) {
                        // Clip playback - apply clip resume offset
                        if (this.clipResumeOffset && this.clipResumeOffset > 0) {
                            position += this.clipResumeOffset;
                        }
                        this.playheadStep = position;
                        this.isPlaying = message.isPlaying === true || message.isPlaying === 'true';

                        // Check if clip has reached the end
                        // MIDI looping is now handled in JUCE (MidiClipScheduler)
                        // Sample looping is handled in JUCE (SamplePlayerPlugin)
                        // We only need to wrap playhead for UI display and handle oneshot mode
                        if (this.isPlaying && !this.isPlayingScene) {
                            const scene = AppState.currentScene;
                            const track = AppState.currentTrack;
                            const clip = AppState.clips[scene]?.[track];
                            if (clip) {
                                const clipLength = clip.length || 64;
                                const playbackMode = clip.playMode || 'loop';

                                if (position >= clipLength) {
                                    if (playbackMode === 'loop') {
                                        // Wrap playhead position for UI display only
                                        // JUCE handles the actual audio looping
                                        this.playheadStep = position % clipLength;
                                    } else {
                                        // One-shot mode - stop playback
                                        console.log('[AudioBridge] Clip reached end (one-shot mode), stopping playback. Track:', track, 'Mode:', playbackMode);
                                        this.stopClip();
                                    }
                                }
                            }
                        }
                    }
                    // Clip is paused - don't update playhead

                    // Trigger canvas redraws for playhead visualization
                    if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
                        ClipEditor.renderPianoGrid();
                    }

                    if (typeof SampleEditor !== 'undefined' && SampleEditor.isVisible) {
                        SampleEditor.render();
                    }

                    // Redraw clip previews in song screen (for scene playback)
                    if (this.isPlayingScene && !this.scenePaused && typeof SongScreen !== 'undefined') {
                        SongScreen.renderClipPreviews();
                    }
                }
                break;

            case 'transportState':
                // External renderer sends transport state change
                if (this.onTransportStateChange) {
                    this.onTransportStateChange(message.state);
                }
                // Update internal flags for UI
                {
                    const wasPlaying = this.isPlaying;
                    const wasPlayingScene = this.isPlayingScene;

                    // Don't override state if we're in paused state (UI manages pause/resume)
                    const isPaused = this.clipPaused || this.scenePaused;

                    if (!isPaused) {
                        this.isPlaying = message.state.isPlaying;
                        this.updatePlayButton(message.state.isPlaying);
                    }

                    // Don't override scene playing state if scene is paused
                    if (!this.scenePaused) {
                        this.isPlayingScene = message.state.isPlayingScene;
                        if (message.state.isPlayingScene !== undefined) {
                            this.updatePlayAllButton(message.state.isPlayingScene, false);
                        }
                    }

                    this.isPlayingSong = message.state.isPlayingSong;

                    // If playback fully stopped (not paused), hide playheads and redraw
                    if (wasPlaying && !message.state.isPlaying && !isPaused) {
                        this.playheadStep = -1;

                        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
                            ClipEditor.renderPianoGrid();
                        }
                        if (wasPlayingScene && typeof SongScreen !== 'undefined') {
                            SongScreen.renderClipPreviews();
                        }
                    }
                }
                break;

            case 'meterUpdate':
                // External renderer sends level meter data
                if (typeof AppState !== 'undefined' && message.trackIndex !== undefined) {
                    const state = AppState.getMixerState(message.trackIndex);
                    state.levelL = message.levelL;
                    state.levelR = message.levelR;

                    // Update mixer UI level meters if visible
                    this.updateMixerLevelMeter(message.trackIndex, message.levelL, message.levelR);
                }
                break;

            case 'graphStateResponse':
                // JUCE sends back the serialized graph state
                console.log('[AudioBridge] Received graph state response');
                if (this._graphStateResolve) {
                    this._graphStateResolve({
                        graphXml: message.graphXml,
                        trackInstrumentNodes: message.trackInstrumentNodes
                    });
                    this._graphStateResolve = null;
                }
                break;

            case 'samplerLoadState':
                // JUCE sends sampler instrument loading state
                if (message.loading) {
                    this.samplerLoadingTracks.add(message.trackIndex);
                    console.log('[AudioBridge] Sampler loading started for track', message.trackIndex);
                } else {
                    this.samplerLoadingTracks.delete(message.trackIndex);
                    console.log('[AudioBridge] Sampler loading finished for track', message.trackIndex);
                }
                // Update play button icon (hourglass while loading, play when done)
                this.updatePlayButton(this.isPlaying, this.clipPaused);
                // Update clip editor loading indicator if visible
                if (typeof ClipEditor !== 'undefined' && ClipEditor.updateSamplerLoadingState) {
                    ClipEditor.updateSamplerLoadingState(message.trackIndex, message.loading);
                }
                break;

            case 'allSamplersReady':
                // All sampler instruments finished loading - auto-play if a command was pending
                console.log('[AudioBridge] All sampler instruments ready');
                if (this._pendingPlayCommand) {
                    // Map toggle commands to their play equivalents for a clean restart
                    const cmdMap = { 'toggleClip': 'playClip', 'toggleScene': 'playScene', 'toggleSong': 'playSong' };
                    const cmd = cmdMap[this._pendingPlayCommand] || this._pendingPlayCommand;
                    this._pendingPlayCommand = null;
                    console.log('[AudioBridge] Auto-playing after sampler load:', cmd);
                    this.send(cmd, {});
                }
                break;

            case 'pluginParameters':
                // JUCE sends automatable parameters for a plugin
                console.log('[AudioBridge] Received plugin parameters for track', message.trackIndex,
                    ':', message.parameters?.length || 0, 'params');

                // Store parameters per track
                if (!this.trackPluginParams) {
                    this.trackPluginParams = {};
                }
                this.trackPluginParams[message.trackIndex] = {
                    pluginName: message.pluginName,
                    nodeId: message.nodeId,
                    parameters: message.parameters || []
                };

                // Notify automation editor if it exists
                if (typeof ClipEditor !== 'undefined' && ClipEditor.onPluginParametersReceived) {
                    ClipEditor.onPluginParametersReceived(message.trackIndex, message);
                }
                break;

            default:
                console.warn('[AudioBridge] Unknown external message type:', message.type);
        }
    },

    // ==========================================
    // State Query (for external renderer sync)
    // ==========================================

    /**
     * Get the full project state for syncing with external renderer
     * Call this when connecting to send initial state to JUCE
     */
    getProjectState() {
        if (typeof AppState === 'undefined') return null;

        return {
            tempo: AppState.tempo || 120,
            numScenes: AppState.numScenes,
            numTracks: AppState.numTracks,
            currentScene: AppState.currentScene,
            currentTrack: AppState.currentTrack,
            clips: AppState.clips,
            trackSettings: this._getAllTrackSettings(),
            mixerStates: this._getAllMixerStates()
        };
    },

    _getAllTrackSettings() {
        const settings = [];
        for (let t = 0; t < AppState.numTracks; t++) {
            settings.push(AppState.getTrackSettings(t));
        }
        return settings;
    },

    _getAllMixerStates() {
        const states = [];
        for (let t = 0; t < AppState.numTracks; t++) {
            states.push(AppState.getMixerState(t));
        }
        return states;
    },

    /**
     * Send mixer state update for a single track to JUCE
     * Call this when volume, pan, mute, or solo changes
     */
    updateTrackMixerState(trackIndex) {
        if (this.mode !== 'external') return;

        const mixerState = AppState.getMixerState(trackIndex);
        this.send('setTrackMixerState', {
            trackIndex: trackIndex,
            volume: mixerState.volume,
            pan: mixerState.pan,
            mute: mixerState.mute,
            solo: mixerState.solo
        });
    },

    /**
     * Get clip data for a specific scene/track
     */
    getClipData(sceneIndex, trackIndex) {
        if (typeof AppState === 'undefined') return null;
        return AppState.clips[sceneIndex]?.[trackIndex] || null;
    },

    // ==========================================
    // JUCE Webview Helpers
    // ==========================================

    /**
     * Update mixer level meter UI for a specific track
     * @param {number} trackIndex - Track index
     * @param {number} levelL - Left channel level (0-1)
     * @param {number} levelR - Right channel level (0-1)
     */
    updateMixerLevelMeter(trackIndex, levelL, levelR) {
        // Update song mixer level meters (in mixer tab)
        const songLevelL = document.getElementById(`songLevelL-${trackIndex}`);
        const songLevelR = document.getElementById(`songLevelR-${trackIndex}`);

        if (songLevelL) {
            songLevelL.style.height = `${Math.min(levelL * 100, 100)}%`;
        }
        if (songLevelR) {
            songLevelR.style.height = `${Math.min(levelR * 100, 100)}%`;
        }
    },

    /**
     * Log to JUCE debug console (useful when browser dev tools unavailable)
     */
    log(...args) {
        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        console.log('[AudioBridge]', message);
        if (this.mode === 'external') {
            this.send('debugLog', { message });
        }
    },

    /**
     * Setup for JUCE webview integration
     * Uses withNativeFunction for direct callback communication
     */
    autoConnectJUCE() {


        window.audioBridgeCommand = getNativeFunction("audioBridgeCommand");

        // Debug: List all window properties that might be JUCE-related
        console.log('[AudioBridge] Checking for JUCE native functions...',window.vendor);
        console.log('[AudioBridge] window.__JUCE_HOST__:', window.__JUCE_HOST__);
        console.log('[AudioBridge] typeof audioBridgeCommand:', typeof window.audioBridgeCommand);

        

        // Check if JUCE native function is available
        if (typeof window !== 'undefined' && typeof window.audioBridgeCommand === 'function') {
            console.log('[AudioBridge] ✓ audioBridgeCommand FOUND!');

            console.log("[AudioBridge]",window.lastSavedData);

            // Testing to see if we can send events to the backend.
            sendEventToJuceBacked(12345);

            HandleEventsFromJuceBackend((msgString) => {
                try {
                    const msg = JSON.parse(msgString);

                    if (msg.type=='pluginParameters')
                    {
                        console.log('[HandleEventsFromJuceBackend] ', msg);
                    }

                    this.receiveFromExternal(msg);
                } catch (e) {
                    console.error('[HandleEventsFromJuceBackend] Failed to parse JUCE message:', e);
                }
            } );

            this.connectExternal((msg) => {
                // Call the native function registered by JUCE
                window.audioBridgeCommand(msg);
            });

            /*
            // Expose global function for JUCE to call (for receiving messages from C++)
            // This was used in eval JS in juce Not used now we use Events now.
            window.AudioBridgeReceive = (msgString) => {
                try {
                    const msg = JSON.parse(msgString);
                    this.receiveFromExternal(msg);
                } catch (e) {
                    console.error('[AudioBridge] Failed to parse JUCE message:', e);
                }
            };
            */

            const state = this.getProjectState();
            if (state) {
                this.send('syncProjectState', state);
            }

            console.log('[AudioBridge] Connected to JUCE via native function');
            return true;
        } else {
            console.log('[AudioBridge] ✗ audioBridgeCommand NOT FOUND');
        }

        /*
        // Legacy: Direct bridge object (for compatibility)
        if (typeof window !== 'undefined' && window.juceBridge) {
            this.connectExternal((msg) => {
                window.juceBridge.postMessage(JSON.stringify(msg));
            });

            if (window.juceBridge.onMessage) {
                window.juceBridge.onMessage = (msgString) => {
                    try {
                        const msg = JSON.parse(msgString);
                        this.receiveFromExternal(msg);
                    } catch (e) {
                        console.error('[AudioBridge] Failed to parse JUCE message:', e);
                    }
                };
            }

            const state = this.getProjectState();
            if (state) {
                this.send('syncProjectState', state);
            }

            return true;
        }
            */

        return false;
    }
};

// Attach event handlers when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    AudioBridge.attachEventHandlers();
});

// Don't auto-connect - let JUCE explicitly call connectToJUCE()
if (typeof window !== 'undefined') {
    // Expose a manual connect function for JUCE to call
    window.connectToJUCE = () => {
        window.__JUCE_HOST__ = true;

        // Try to connect immediately
        if (AudioBridge.autoConnectJUCE()) {
            console.log('[AudioBridge] Connected to JUCE webview');
            return "Juce Connected.";
        }

        // If immediate connection fails, retry with delays
        // (native functions might not be ready yet)
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = 100; // ms

        const retryConnection = () => {
            retryCount++;
            console.log(`[AudioBridge] Retry ${retryCount}/${maxRetries}...`);

            if (AudioBridge.autoConnectJUCE()) {
                console.log('[AudioBridge] Connected to JUCE webview on retry ' + retryCount);
                return true;
            }

            if (retryCount < maxRetries) {
                setTimeout(retryConnection, retryInterval);
            } else {
                console.error('[AudioBridge] Failed to connect to JUCE after ' + maxRetries + ' retries');
            }
        };

        setTimeout(retryConnection, retryInterval);
        return "Connecting...";
    };
}
