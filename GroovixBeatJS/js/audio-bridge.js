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
        if (typeof window.connectToJUCE === 'function' && !AudioBridge.externalHandler) {
            window.connectToJUCE();
        }

        // Reset wiring cache so _ensureGraphWired() re-wires every track on next play.
        // This ensures VST instruments from the loaded project are properly connected.
        AudioBridge._wiredInstruments = {};

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

    // External message handler (set by JUCE host)
    externalHandler: null,

    // Callback for receiving timing updates from external renderer
    onTimingUpdate: null,

    // Callback for receiving transport state changes from external renderer
    onTransportStateChange: null,

    // Debug mode
    debug: false,

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

    // MIDI input connect/record state
    midiConnectedTracks: {},      // trackIndex -> true if MIDI input is connected
    midiRecordingTrack: null,     // trackIndex being recorded, or null
    _pendingRecordNotes: {},      // pitch -> { start: step, velocity, pitchBend, modulation } for active note-ons
    _midiDeviceList: null,        // cached list of MIDI input device names from JUCE

    // Record head - wall-clock-based position counter (independent of JUCE playback)
    _recordStartTime: null,       // performance.now() when first note-on fires (null = waiting for first note)
    _recordHeadStep: 0,           // current record position in steps
    _recordWaitingForFirstNote: false, // true after pressing record, before the first note-on arrives
    _recordCurrentPitchBend: 64,  // current incoming pitch bend value (0-127, 64=center)
    _recordCurrentModulation: 0,  // current incoming modulation CC1 value (0-127)

    // Live mode state
    liveMode: false,
    liveModePreloading: false,   // true while JUCE is loading samples; clips not launchable yet
    livePlayingClips: {},
    liveQueuedClips: {},
    liveStartTime: 0,

    // Graph wiring cache: tracks which VST pluginId was last sent to JUCE for each track.
    // Used by _ensureGraphWired() to skip reloading a plugin that is already loaded.
    // Reset on project load so new instruments are always wired correctly.
    _wiredInstruments: {},   // { trackIndex: pluginId }

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

    updateSongPlayButton: function(playing, paused, loading) {
        const playBtn = document.getElementById('playBtn');
        if (!playBtn) return;

        const svg = playBtn.querySelector('svg');
        if (!svg) return;

        if (loading) {
            // Spinning ring to indicate sample pre-loading
            svg.innerHTML = '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="16 34" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle>';
            playBtn.classList.remove('playing');
            playBtn.classList.add('loading');
        } else if (playing && !paused) {
            svg.innerHTML = '<rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/>';
            playBtn.classList.add('playing');
            playBtn.classList.remove('loading');
        } else {
            svg.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
            playBtn.classList.toggle('playing', playing && paused);
            playBtn.classList.remove('loading');
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

    updateSceneControlsState: function(disabled) {
        const playAllBtn = document.getElementById('playAllTracksBtn');
        const stopAllBtn = document.getElementById('stopAllTracksBtn');

        if (playAllBtn) {
            playAllBtn.disabled = disabled;
            playAllBtn.style.opacity = disabled ? '0.4' : '1';
        }
        if (stopAllBtn) {
            stopAllBtn.disabled = disabled;
            stopAllBtn.style.opacity = disabled ? '0.4' : '1';
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

        if (typeof SongScreen !== 'undefined') SongScreen.startPlayheadLoop();
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

        if (typeof SampleEditor !== 'undefined' && SampleEditor.isVisible) {
            SampleEditor.render();
        }

        // SongScreen playhead is drawn by the overlay loop — no static canvas redraw needed here.

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

        if (typeof SongScreen !== 'undefined') SongScreen.stopPlayheadLoop();

        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
            ClipEditor.renderPianoGrid();
        }

        if (wasPlayingScene >= 0 && typeof SongScreen !== 'undefined') {
            SongScreen.renderCanvas();
        }
    },

    // ==========================================
    // Live Mode (migrated from MidiEngine, JUCE paths only)
    // ==========================================

    // Phase 1: called when user clicks the Live button.
    // Shows loading state immediately and kicks off sample preloading in JUCE.
    // Live mode is NOT active yet — clips cannot be launched until onLiveModePreloadComplete().
    /**
     * Ensure every track's audio graph is wired to match its trackType.
     * Called before live mode and scene play so tracks don't require manual
     * re-wiring via Track Settings.
     *
     * - 'sample'            → setupSamplePlayerTrack   (idempotent in C++)
     * - 'drum_kit'          → setDrumKitTrack           (reuses existing node in C++)
     * - 'sampled_instrument'→ setSamplerInstrument      (C++ skips if already loaded)
     * - 'melody' + VST      → setTrackInstrument        (guarded by _wiredInstruments cache
     *                                                    to avoid reloading the plugin)
     * - 'melody' + no VST   → setTrackInstrument('')    (disconnects any stale node)
     */
    _ensureGraphWired: function() {
        if (!this.externalHandler) return;
        const ts = performance.now();

        for (let t = 0; t < AppState.numTracks; t++) {
            const trackSettings = AppState.getTrackSettings(t);
            const trackType = trackSettings.trackType || 'melody';

            if (trackType === 'sample') {
                this.externalHandler({
                    command: 'setupSamplePlayerTrack',
                    payload: { trackIndex: t },
                    timestamp: ts
                });

            } else if (trackType === 'drum_kit') {
                this.externalHandler({
                    command: 'setDrumKitTrack',
                    payload: { trackIndex: t },
                    timestamp: ts
                });

            } else if (trackType === 'sampled_instrument') {
                const instrumentName = trackSettings.samplerInstrument || '';
                this.externalHandler({
                    command: 'setSamplerInstrument',
                    payload: { trackIndex: t, instrumentName },
                    timestamp: ts
                });

            } else {
                // 'melody' track — wire VST instrument if assigned.
                const pluginId = (typeof InstrumentSelector !== 'undefined' &&
                                  InstrumentSelector.trackInstruments[t])
                    ? (InstrumentSelector.trackInstruments[t].id || '')
                    : '';

                // Guard: skip if we already sent this exact plugin to JUCE this session.
                // setTrackInstrument reloads the plugin from disk, so avoid repeating it.
                if (this._wiredInstruments[t] === pluginId) continue;

                this._wiredInstruments[t] = pluginId;
                this.externalHandler({
                    command: 'setTrackInstrument',
                    payload: { trackIndex: t, pluginId },
                    timestamp: ts
                });
            }
        }
    },

    startLiveMode: function() {
        console.log('[AudioBridge] startLiveMode → beginLiveModePreload');
        this.beginLiveModePreload();
    },

    beginLiveModePreload: function() {
        if (this.liveModePreloading) return; // already preloading
        console.log('[AudioBridge] beginLiveModePreload');

        this.liveModePreloading = true;

        // Clear any stale scene playback state so timingUpdate never fires stopScene()
        // (→ midiBridge.stop() → stopAllSamples) during the preload window.
        this.isPlayingScene = false;
        this.sceneLength = 0;
        this.scenePaused = false;
        this.sceneResumeOffset = 0;

        // Show loading indicator on the button right away.
        if (typeof SongScreen !== 'undefined') {
            SongScreen.setLiveModeLoadingState('loading');
        }

        // Tell JUCE to clear MIDI clips and set its internal live-mode flag.
        // Also sync tempo so loop-length step→sample conversion is correct from the first clip.
        if (this.externalHandler) {
            const ts = performance.now();
            this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp: ts });
            // Ensure every track's audio graph connections match its current trackType before
            // any clip is launched, so no manual Track Settings visit is required.
            this._ensureGraphWired();
            this.externalHandler({ command: 'startLiveMode', payload: {}, timestamp: ts });
        }

        // Gather unique sample paths across all clips.
        const samplePaths = [];
        const seenPaths = new Set();
        if (typeof SampleEditor !== 'undefined' && typeof AppState !== 'undefined') {
            for (let scene = 0; scene < AppState.numScenes; scene++) {
                for (let track = 0; track < AppState.numTracks; track++) {
                    const sample = SampleEditor.getClipSample(scene, track);
                    if (sample && sample.fullPath && !seenPaths.has(sample.fullPath)) {
                        seenPaths.add(sample.fullPath);
                        samplePaths.push(sample.fullPath);
                    }
                }
            }
        }

        if (samplePaths.length > 0 && this.externalHandler) {
            console.log('[AudioBridge] Preloading', samplePaths.length, 'samples for Live Mode');
            this.externalHandler({
                command: 'preloadSamplesForLiveMode',
                payload: { samplePaths },
                timestamp: performance.now()
            });
            // onLiveModePreloadComplete() will be called by SongScreen.onSamplesPreloaded()
            // once JUCE finishes loading.
        } else {
            // No samples to preload (or no JUCE connection) — activate immediately.
            console.log('[AudioBridge] No samples to preload, activating live mode immediately');
            this.onLiveModePreloadComplete();
        }
    },

    // Phase 2: called by SongScreen.onSamplesPreloaded() after JUCE finishes loading.
    // Fully activates live mode: JS state, quantize loop, and UI.
    onLiveModePreloadComplete: function() {
        console.log('[AudioBridge] onLiveModePreloadComplete — activating live mode');
        this.liveModePreloading = false;
        this.liveMode = true;
        this.livePlayingClips = {};
        this.liveQueuedClips = {};
        this.liveStartTime = performance.now();

        if (typeof SongScreen !== 'undefined') SongScreen.startPlayheadLoop();

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveMode(true);
        }
    },

    stopLiveMode: function() {
        this.liveMode = false;
        this.liveModePreloading = false;

        if (typeof SongScreen !== 'undefined') SongScreen.stopPlayheadLoop();

        for (const trackIndex in this.livePlayingClips) {
            this.stopLiveClip(parseInt(trackIndex), true);
        }

        this.livePlayingClips = {};
        this.liveQueuedClips = {};

        if (this.externalHandler) {
            this.externalHandler({ command: 'stopLiveMode', payload: {}, timestamp: performance.now() });
            this.externalHandler({ command: 'stop', payload: {}, timestamp: performance.now() });
            this.externalHandler({ command: 'stopAllSamples', payload: {}, timestamp: performance.now() });
            this.externalHandler({ command: 'clearSampleCache', payload: {}, timestamp: performance.now() });
        }

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveMode(false);
        }
    },

    toggleLiveMode: function() {
        console.log('[AudioBridge] toggleLiveMode — liveMode:', this.liveMode, 'preloading:', this.liveModePreloading);
        if (this.liveMode) {
            this.stopLiveMode();
        } else if (!this.liveModePreloading) {
            this.beginLiveModePreload();
        }
        // If preloading is in progress, ignore the click.
    },

    queueLiveClip: function(sceneIndex, trackIndex) {
        if (!this.liveMode) return;

        const playing = this.livePlayingClips[trackIndex];
        const queued  = this.liveQueuedClips[trackIndex];

        if (playing && playing.scene === sceneIndex) {
            const trackSettings = AppState.getTrackSettings(trackIndex);
            const isSample = trackSettings.trackType === 'sample';

            if (isSample) {
                // Sample tracks: mute/unmute instead of stop/start so transport keeps running
                if (playing.muted) {
                    // Currently muted — queue unmute (or cancel pending mute)
                    if (queued && queued.action === 'mute') {
                        delete this.liveQueuedClips[trackIndex];
                        if (this.externalHandler)
                            this.externalHandler({ command: 'cancelQueuedSample', payload: { trackIndex }, timestamp: performance.now() });
                    } else {
                        this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'unmute' };
                        if (this.externalHandler)
                            this.externalHandler({ command: 'queueUnmuteSample', payload: { trackIndex }, timestamp: performance.now() });
                    }
                } else {
                    // Currently playing (not muted) — queue mute (or cancel pending unmute)
                    if (queued && queued.action === 'unmute') {
                        delete this.liveQueuedClips[trackIndex];
                        if (this.externalHandler)
                            this.externalHandler({ command: 'cancelQueuedSample', payload: { trackIndex }, timestamp: performance.now() });
                    } else {
                        this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'mute' };
                        if (this.externalHandler)
                            this.externalHandler({ command: 'queueMuteSample', payload: { trackIndex }, timestamp: performance.now() });
                    }
                }
            } else {
                // MIDI tracks: stop/start as before
                if (queued && queued.action === 'stop') {
                    delete this.liveQueuedClips[trackIndex];
                    if (this.externalHandler)
                        this.externalHandler({ command: 'cancelQueuedSample', payload: { trackIndex }, timestamp: performance.now() });
                } else {
                    this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'stop' };
                    if (this.externalHandler)
                        this.externalHandler({ command: 'queueLiveMidiStop', payload: { trackIndex }, timestamp: performance.now() });
                }
            }
        } else {
            // Clip is not playing — queue to start
            if (queued && queued.action === 'play') {
                // Already queued — cancel
                delete this.liveQueuedClips[trackIndex];
                const trackSettings = AppState.getTrackSettings(trackIndex);
                const isSample = trackSettings.trackType === 'sample';
                if (this.externalHandler) {
                    // Sample tracks: cancelQueuedSample clears the pending file in SamplePlayerManager.
                    // MIDI tracks: queueLiveMidiStop cancels the pendingLivePlay flag in MidiClipScheduler.
                    const cancelCmd = isSample ? 'cancelQueuedSample' : 'queueLiveMidiStop';
                    this.externalHandler({ command: cancelCmd, payload: { trackIndex }, timestamp: performance.now() });
                }
            } else {
                this.liveQueuedClips[trackIndex] = { scene: sceneIndex, track: trackIndex, action: 'play' };
                const isFirst = Object.keys(this.livePlayingClips).length === 0 &&
                                Object.keys(this.liveQueuedClips).length === 1; // just added
                this._sendLiveClipToCpp(trackIndex, sceneIndex, /*seamless=*/!isFirst);
                // For the immediate (first-clip) case, JS updates livePlayingClips right away
                // since there is no quantize delay.
                if (isFirst) {
                    this.onLiveClipStarted(trackIndex);
                }
                // For seamless (quantized) case, JUCE will call onLiveClipStarted when it fires.
            }
        }

        if (typeof SongScreen !== 'undefined') SongScreen.updateLiveClipStates();
    },

    // Trigger an entire scene in Live Mode.
    // If nothing is currently playing: all clips start immediately.
    // If clips are playing: at the next quantize boundary, stop all current clips
    // and start all clips in the new scene.
    queueLiveScene: function(sceneIndex) {
        if (!this.liveMode) return;

        // Collect tracks in the target scene that have actual playable content.
        // Tracks with empty clips (no notes / no sample file) are excluded so that
        // any clip currently playing on those tracks is stopped at the boundary.
        const tracksToStart = new Set();
        for (let t = 0; t < AppState.numTracks; t++) {
            const clip = AppState.clips[sceneIndex]?.[t];
            if (!clip || clip.mute) continue;
            const mixerState = AppState.getMixerState(t);
            if (mixerState.mute) continue;

            const trackSettings = AppState.getTrackSettings(t);
            if (trackSettings.trackType === 'sample') {
                if (typeof SampleEditor === 'undefined') continue;
                const s = SampleEditor.getClipSample(sceneIndex, t);
                if (!s || (!s.fullPath && !s.fileName)) continue;
            } else {
                if (!clip.notes || clip.notes.length === 0) continue;
            }

            tracksToStart.add(t);
        }

        const nothingActive = Object.keys(this.livePlayingClips).length === 0 &&
                              Object.keys(this.liveQueuedClips).length === 0;
        const timestamp = performance.now();

        if (nothingActive) {
            // No clips playing — start all scene clips immediately (seamless=false).
            // Immediate starts have no targetStartSample, so JUCE won't fire a callback;
            // call onLiveClipStarted directly for all tracks.
            for (const track of tracksToStart) {
                this.liveQueuedClips[track] = { scene: sceneIndex, track: track, action: 'play' };
                this._sendLiveClipToCpp(track, sceneIndex, /*seamless=*/false);
                this.onLiveClipStarted(track);
            }
        } else {
            // Queue stops for all playing tracks that won't be in the new scene
            for (const trackIndex in this.livePlayingClips) {
                const track = parseInt(trackIndex);
                const playing = this.livePlayingClips[track];
                if (playing.loopTimeout) clearTimeout(playing.loopTimeout);
                if (!tracksToStart.has(track)) {
                    this.liveQueuedClips[track] = { scene: playing.scene, track: playing.track, action: 'stop' };
                    if (this.externalHandler) {
                        if (playing.isSampleTrack) {
                            this.externalHandler({ command: 'queueStopSample', payload: { trackIndex: track }, timestamp });
                        } else {
                            this.externalHandler({ command: 'queueLiveMidiStop', payload: { trackIndex: track }, timestamp });
                        }
                    }
                }
            }

            // Cancel queued plays for tracks not in the new scene
            for (const trackIndex in this.liveQueuedClips) {
                const track = parseInt(trackIndex);
                const queued = this.liveQueuedClips[track];
                if (queued.action === 'play' && !tracksToStart.has(track)) {
                    delete this.liveQueuedClips[track];
                    if (this.externalHandler) {
                        this.externalHandler({ command: 'cancelQueuedSample', payload: { trackIndex: track }, timestamp });
                    }
                }
            }

            // Queue starts for all tracks in the new scene at the next quantize boundary
            for (const track of tracksToStart) {
                this.liveQueuedClips[track] = { scene: sceneIndex, track: track, action: 'play' };
                this._sendLiveClipToCpp(track, sceneIndex, /*seamless=*/true);
            }
        }

        if (typeof SongScreen !== 'undefined') {
            SongScreen.updateLiveClipStates();
        }
    },

    // Internal helper: send the JUCE commands for a live clip start without updating JS state.
    // Used when adding a non-first clip to the queue (JS state is updated by the UI loop instead).
    _sendLiveClipToCpp: function(trackIndex, sceneIndex, seamless) {
        const clip = AppState.clips[sceneIndex]?.[trackIndex];
        if (!clip || clip.mute) return;

        const mixerState = AppState.getMixerState(trackIndex);
        if (mixerState.mute) return;

        const trackSettings = AppState.getTrackSettings(trackIndex);
        const isSampleTrack = trackSettings.trackType === 'sample';
        const playbackMode = clip.playMode || 'loop';
        const clipLength = clip.length || 64;
        const timestamp = performance.now();

        if (!this.externalHandler) return;

        if (isSampleTrack) {
            if (typeof SampleEditor !== 'undefined') {
                const trackSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
                if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                    const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                    const offset = trackSample.offset || 0;
                    const loop = playbackMode === 'loop';
                    this.externalHandler({
                        command: 'setTempo',
                        payload: { bpm: AppState.tempo || 120 },
                        timestamp
                    });
                    this.externalHandler({
                        command: 'playSampleFile',
                        payload: { trackIndex, filePath, offset, loop, loopLengthSteps: clipLength, seamless },
                        timestamp
                    });
                }
            }
        } else if (clip.notes && clip.notes.length > 0) {
            const notesToSchedule = clip.notes
                .filter(note => note.start < clipLength)
                .map(note => ({ ...note, duration: Math.min(note.duration, clipLength - note.start) }));

            this.externalHandler({
                command: 'scheduleClip',
                payload: {
                    trackIndex, sceneIndex,
                    notes: notesToSchedule,
                    loopLength: clipLength,
                    loop: playbackMode === 'loop',
                    program: trackSettings.midiProgram || 0,
                    isDrum: trackSettings.isPercussion || false
                },
                timestamp
            });

            // seamless=true → queue in C++ at boundary; seamless=false → start immediately
            this.externalHandler({
                command: seamless ? 'queueLiveMidiPlay' : 'playLiveClip',
                payload: { trackIndex },
                timestamp
            });
        }
    },

    executeLiveClipStart: function(trackIndex, sceneIndex, clipTrackIndex, seamless = true) {
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

                    // Always sync tempo before playSampleFile so JUCE converts
                    // loopLengthSteps → loopLengthSamples with the correct BPM.
                    this.externalHandler({
                        command: 'setTempo',
                        payload: { bpm: AppState.tempo || 120 },
                        timestamp
                    });

                    this.externalHandler({
                        command: 'playSampleFile',
                        payload: {
                            trackIndex: trackIndex,
                            filePath: filePath,
                            offset: offset,
                            loop: loop,
                            loopLengthSteps: clipLength,
                            seamless: seamless
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

            // seamless=false → start immediately (first clip in live mode)
            // seamless=true  → queue in C++ at the next quantize boundary
            this.externalHandler({
                command: seamless ? 'queueLiveMidiPlay' : 'playLiveClip',
                payload: { trackIndex: trackIndex },
                timestamp
            });
        }

        // Note: livePlayingClips is updated by onLiveClipStarted() when JUCE fires the
        // actual start event. For immediate (first-clip) MIDI, queueLiveClip calls
        // onLiveClipStarted() directly. For sample tracks, JUCE fires the callback.
    },

    // Called by JUCE when a live-mode clip actually starts at the quantize boundary.
    onLiveClipStarted: function(trackIndex) {
        const track = parseInt(trackIndex);
        const queued = this.liveQueuedClips[track];
        if (!queued) return;

        const clip = AppState.clips[queued.scene]?.[queued.track];
        const trackSettings = AppState.getTrackSettings(track);
        const tempo = AppState.tempo || 120;
        const clipLength = (clip && clip.length) || 64;

        this.livePlayingClips[track] = {
            scene: queued.scene,
            track: queued.track,
            startTime: performance.now(),
            clipLength,
            secondsPerStep: 60 / tempo / 4,
            scheduledNotes: [],
            loopTimeout: null,
            isSampleTrack: trackSettings.trackType === 'sample',
            playbackMode: (clip && clip.playMode) || 'loop',
            isExternal: true
        };
        delete this.liveQueuedClips[track];

        if (typeof SongScreen !== 'undefined') SongScreen.updateLiveClipStates();
    },

    // Called by JUCE when a live-mode clip actually stops at the quantize boundary.
    onLiveClipStopped: function(trackIndex) {
        const track = parseInt(trackIndex);
        delete this.livePlayingClips[track];
        delete this.liveQueuedClips[track];

        if (typeof SongScreen !== 'undefined') SongScreen.updateLiveClipStates();
    },

    // Called by JUCE when a sample-accurate mute fires at the quantize boundary.
    onLiveClipMuted: function(trackIndex) {
        const track = parseInt(trackIndex);
        if (this.livePlayingClips[track]) {
            this.livePlayingClips[track].muted = true;
        }
        delete this.liveQueuedClips[track];

        if (typeof SongScreen !== 'undefined') SongScreen.updateLiveClipStates();
    },

    // Called by JUCE when a sample-accurate unmute fires at the quantize boundary.
    onLiveClipUnmuted: function(trackIndex) {
        const track = parseInt(trackIndex);
        if (this.livePlayingClips[track]) {
            this.livePlayingClips[track].muted = false;
            // Reset startTime so the JS playhead animation restarts from step 0.
            this.livePlayingClips[track].startTime = performance.now();
        }
        delete this.liveQueuedClips[track];

        if (typeof SongScreen !== 'undefined') SongScreen.updateLiveClipStates();
    },

    isLiveClipMuted: function(sceneIndex, trackIndex) {
        const playing = this.livePlayingClips[trackIndex];
        return playing && playing.scene === sceneIndex && playing.muted === true;
    },

    isLiveClipMuting: function(sceneIndex, trackIndex) {
        const queued = this.liveQueuedClips[trackIndex];
        const playing = this.livePlayingClips[trackIndex];
        return queued && queued.action === 'mute' && playing && playing.scene === sceneIndex;
    },

    isLiveClipUnmuting: function(sceneIndex, trackIndex) {
        const queued = this.liveQueuedClips[trackIndex];
        const playing = this.livePlayingClips[trackIndex];
        return queued && queued.action === 'unmute' && playing && playing.scene === sceneIndex;
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
        if (!playing || playing.muted) return -1;

        const elapsed = (performance.now() - playing.startTime) / 1000;
        const currentStep = elapsed / playing.secondsPerStep;

        return currentStep % playing.clipLength;
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
                // In Live Mode these clip-level transport buttons must not interfere
                // with the live session — clips are controlled via the grid instead.
                if (this.liveMode) return;
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
                if (this.liveMode) return;
                this.stopClip();
                if (this.isInSampleMode() && typeof SampleEditor !== 'undefined') {
                    SampleEditor.stop();
                }
            });
        }

        const playAllBtn = document.getElementById('playAllTracksBtn');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                if (this.liveMode) return;
                this.toggleScene();
            });
        }

        const stopAllBtn = document.getElementById('stopAllTracksBtn');
        if (stopAllBtn) {
            stopAllBtn.addEventListener('click', () => {
                if (this.liveMode) return;
                this.stopScene();
            });
        }

        document.addEventListener('keydown', (e) => {
            const editorPanel = document.getElementById('clipEditorPanel');
            if (!editorPanel || editorPanel.style.display === 'none') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                // Space bar must not call stopClip() in Live Mode — that routes through
                // midiBridge.stop() which kills ALL sample players, not just one clip.
                if (this.liveMode) return;
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
            if (this.clipPaused) {
                // Paused -> resume (C++ continues from where it stopped)
                this.externalHandler({ command: 'resumeClip', payload: {}, timestamp });
                this.clipPaused = false;
                this.clipResumeOffset = 0;
                this.isPlaying = true;
                const resumeScene = AppState.currentScene;
                const resumeTrack = AppState.currentTrack;
                const resumeClipData = AppState.getClip(resumeScene, resumeTrack);
                const resumeLen = resumeClipData.length || AppState.currentLength;
                const resumeSecPerStep = 60 / (AppState.tempo || 120) / 4;
                const resumeLoop = (resumeClipData.playMode || 'loop') === 'loop';
                this.startPlayheadAnimation(resumeLen, resumeSecPerStep, resumeLoop);
                this.updatePlayButton(true, false);
                this.updateSceneControlsState(true);
            } else if (this.isPlaying) {
                // Playing -> pause (C++ holds position)
                this.clipPausedPosition = this.playheadStep || 0;
                this.externalHandler({ command: 'pauseClip', payload: { position: this.clipPausedPosition }, timestamp });
                this.clipPaused = true;
                this.updatePlayButton(true, true);
                this.updateSceneControlsState(true);
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
                const clipLength2 = clip.length || AppState.currentLength;
                const secPerStep2 = 60 / (AppState.tempo || 120) / 4;
                const clipLoop2 = (clip.playMode || 'loop') === 'loop';
                this.startPlayheadAnimation(clipLength2, secPerStep2, clipLoop2);
                this.updatePlayButton(true, false);
                this.updateSceneControlsState(true);
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
            const clipLen3 = clip.length || AppState.currentLength;
            const secPerStep3 = 60 / (AppState.tempo || 120) / 4;
            const clipLoop3 = (clip.playMode || 'loop') === 'loop';
            this.startPlayheadAnimation(clipLen3, secPerStep3, clipLoop3);
            this.updatePlayButton(true, false);
            this.updateSceneControlsState(true);
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
            this.updateSceneControlsState(false);
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
            this.updateSceneControlsState(true);
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
            this.updateSceneControlsState(true);
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
        else if (command === 'queueLiveScene') {
            this.queueLiveScene(payload.sceneIndex);
        }
        else if (command === 'liveClipStarted') {
            this.onLiveClipStarted(payload.trackIndex);
        }
        else if (command === 'liveClipStopped') {
            this.onLiveClipStopped(payload.trackIndex);
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
    _startScene(sceneIndex, startPosition, timestamp, infiniteLoop = false, seamless = false) {
        this._pendingPlayCommand = 'playScene';
        this._ensureSamplerInstrumentsLoaded();

        // Send current tempo before starting playback
        this.externalHandler({ command: 'setTempo', payload: { bpm: AppState.tempo || 120 }, timestamp });

        // For seamless song transitions: pre-arm sample tracks BEFORE stopping the old scene.
        // This queues the new file on the audio thread so it fires at the very next audio block
        // after transport restarts, eliminating the gap between scenes.
        if (seamless && typeof SampleEditor !== 'undefined') {
            for (let track = 0; track < AppState.numTracks; track++) {
                const clip = AppState.getClip(sceneIndex, track);
                const trackSettings = AppState.getTrackSettings(track);
                const mixerState = AppState.getMixerState(track);
                if (mixerState.mute || clip.mute) continue;
                if (trackSettings.trackType === 'sample') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                        const offset = trackSample.offset || 0;
                        const loop = (clip.playMode || 'loop') === 'loop';
                        const clipLength = clip.length || 64;
                        // Pre-arm with seamless=true: queues the new file on the audio thread
                        // so it fires at the very next block after transport restarts
                        this.externalHandler({
                            command: 'playSampleFile',
                            payload: { trackIndex: track, filePath, offset, loop, loopLengthSteps: clipLength, seamless: true },
                            timestamp
                        });
                    }
                }
            }
        }

        // Ensure every track's audio graph is wired for its current type before playing.
        this._ensureGraphWired();

        // Stop any existing playback and clear clips from previous scene
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });
        this.externalHandler({ command: 'clearAllClips', payload: {}, timestamp });

        // Calculate the longest track length in the scene (both MIDI and sample tracks)
        let maxLength = 0;
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);

            if (trackSettings.trackType === 'sample') {
                // Only count sample tracks that have an actual file
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const clipLength = clip.length || 64;
                        maxLength = Math.max(maxLength, clipLength);
                    }
                }
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
                // In seamless mode, sample tracks were already queued above — skip here
                if (seamless) continue;
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
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
     * Helper: Start song playback.
     * Scene timing is driven entirely by C++ (MidiBridge timer detects scene-end
     * via audio thread signal and calls advanceSongScene).  JS only supplies
     * clip data upfront and responds to 'sceneChanged' events for UI updates.
     */
    _playSong(timestamp) {
        this._stopSong(timestamp);
        this._pendingPlayCommand = 'playSong';

        this.isPlayingSong = true;
        this.songPaused = false;
        this.updateSongPlayButton(true, false);

        // Collect ALL non-empty scenes upfront
        const scenes = [];
        for (let s = 0; s < AppState.numScenes; s++) {
            const data = this._buildSongSceneData(s);
            if (data) scenes.push(data);
        }

        if (scenes.length === 0) {
            this._stopSong(timestamp);
            return;
        }

        const firstSceneIndex = scenes[0].sceneIndex;
        this.currentSongScene = firstSceneIndex;
        this.playingSceneIndex = firstSceneIndex;
        this.sceneLength = 0;          // C++ drives all scene boundaries

        // Show loading spinner — C++ will emit songReady when all samples are loaded
        // and transport has started, at which point we start the playhead animation.
        this.updateSongPlayButton(false, false, true);
        if (typeof SongScreen !== 'undefined')
            SongScreen.highlightPlayingScene(firstSceneIndex);

        // Prepare audio graph and tempo before handing off to C++
        this._ensureSamplerInstrumentsLoaded();
        this._ensureGraphWired();
        this.send('setTempo', { bpm: AppState.tempo || 120 });

        // Hand ALL scene data to C++ — it preloads all samples, starts scene 0,
        // and will emit songReady when the transport is rolling.
        this.send('startSong', { scenes });
    },

    /**
     * Helper: Calculate the total playback duration of a scene in beats.
     * Accounts for per-clip repeat counts and the scene-level repeat setting.
     */
    _calcSongSceneDurationBeats(sceneIndex) {
        const sceneProps = AppState.getSceneProperties(sceneIndex);
        const sceneRepeat = sceneProps.repeat || 1;

        let maxSteps = 0;
        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);
            const mixerState = AppState.getMixerState(track);
            if (mixerState.mute || clip.mute) continue;

            let clipSteps = clip.length || 64;
            if (trackSettings.trackType === 'sample') {
                // Only count sample tracks that have an actual file
                if (typeof SampleEditor === 'undefined') continue;
                const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                if (!trackSample || (!trackSample.fullPath && !trackSample.fileName)) continue;
            } else {
                // Only count MIDI tracks that have notes
                if (!clip.notes || clip.notes.length === 0) continue;
                const repeatCount = clip.repeat || 1;
                clipSteps = clipSteps * repeatCount;
            }
            maxSteps = Math.max(maxSteps, clipSteps);
        }

        return (maxSteps * sceneRepeat) / 4.0;  // steps → beats
    },

    /**
     * Build the payload for one scene to be sent inside startSong.
     * Returns null if the scene has no playable content.
     */
    _buildSongSceneData(sceneIndex) {
        const midiClips = [];
        const sampleFiles = [];

        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);
            const mixerState = AppState.getMixerState(track);
            if (mixerState.mute || clip.mute) continue;

            if (trackSettings.trackType === 'sample') {
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                        sampleFiles.push({
                            trackIndex: track,
                            filePath,
                            offset: trackSample.offset || 0,
                            loop: (clip.playMode || 'loop') === 'loop',
                            loopLengthBeats: (clip.length || 64) / 4.0
                        });
                    }
                }
            } else if (clip.notes && clip.notes.length > 0) {
                const clipLength = clip.length || AppState.currentLength;
                const notesToSchedule = clip.notes
                    .filter(n => n.start < clipLength)
                    .map(n => ({
                        ...n,
                        duration: Math.min(n.duration, clipLength - n.start)
                    }));
                midiClips.push({
                    trackIndex: track,
                    notes: notesToSchedule,
                    loopLength: clipLength,
                    loop: (clip.playMode || 'loop') === 'loop',
                    program: trackSettings.midiProgram || 0,
                    isDrum: trackSettings.isPercussion || false
                });
            }
        }

        if (midiClips.length === 0 && sampleFiles.length === 0) return null;

        const durationBeats = this._calcSongSceneDurationBeats(sceneIndex);
        if (durationBeats <= 0) return null;

        return { sceneIndex, midiClips, sampleFiles, durationBeats };
    },

    /**
     * Helper: Find the next scene index (>= startIndex) that has playable content.
     * Returns -1 if no such scene exists.
     */
    _findNextSongScene(startIndex) {
        for (let s = startIndex; s < AppState.numScenes; s++) {
            for (let t = 0; t < AppState.numTracks; t++) {
                const clip = AppState.getClip(s, t);
                const trackSettings = AppState.getTrackSettings(t);
                const mixerState = AppState.getMixerState(t);
                if (mixerState.mute || clip.mute) continue;

                if (trackSettings.trackType === 'sample') {
                    if (typeof SampleEditor !== 'undefined') {
                        const trackSample = SampleEditor.getClipSample(s, t);
                        if (trackSample && (trackSample.fullPath || trackSample.fileName))
                            return s;
                    }
                } else if (clip.notes && clip.notes.length > 0) {
                    return s;
                }
            }
        }
        return -1;
    },

    /**
     * Pre-queue the next scene's data to C++ so the scene transition is instant
     * when the audio thread fires the scene-end event.
     * Called at song start (for scene 1) and after each 'sceneChanged' event.
     */
    _preQueueNextSongScene(nextSceneIndex) {
        const sceneIndex = this._findNextSongScene(nextSceneIndex);

        if (sceneIndex < 0) {
            // No more scenes — C++ will call songSceneChangedCallback(-1) to signal end
            return;
        }

        const midiClips = [];
        const sampleFiles = [];
        const timestamp = performance.now();

        for (let track = 0; track < AppState.numTracks; track++) {
            const clip = AppState.getClip(sceneIndex, track);
            const trackSettings = AppState.getTrackSettings(track);
            const mixerState = AppState.getMixerState(track);
            if (mixerState.mute || clip.mute) continue;

            if (trackSettings.trackType === 'sample') {
                if (typeof SampleEditor !== 'undefined') {
                    const trackSample = SampleEditor.getClipSample(sceneIndex, track);
                    if (trackSample && (trackSample.fullPath || trackSample.fileName)) {
                        const filePath = trackSample.fullPath || trackSample.filePath || trackSample.fileName;
                        sampleFiles.push({
                            trackIndex: track,
                            filePath,
                            offset: trackSample.offset || 0,
                            loop: (clip.playMode || 'loop') === 'loop',
                            loopLengthBeats: (clip.length || 64) / 4.0
                        });
                    }
                }
            } else if (clip.notes && clip.notes.length > 0) {
                const clipLength = clip.length || AppState.currentLength;
                const notesToSchedule = clip.notes
                    .filter(n => n.start < clipLength)
                    .map(n => ({
                        ...n,
                        duration: Math.min(n.duration, clipLength - n.start)
                    }));
                midiClips.push({
                    trackIndex: track,
                    notes: notesToSchedule,
                    loopLength: clipLength,
                    loop: (clip.playMode || 'loop') === 'loop',
                    program: trackSettings.midiProgram || 0,
                    isDrum: trackSettings.isPercussion || false
                });
            }
        }

        const durationBeats = this._calcSongSceneDurationBeats(sceneIndex);

        this.send('preQueueSongScene', {
            sceneIndex,
            midiClips,
            sampleFiles,
            durationBeats
        });
    },

    /**
     * Helper: Start playhead animation for a song scene (looping mode).
     */
    _startSongPlayheadAnimation(sceneIndex) {
        const tempo = AppState.tempo || 120;
        const secondsPerStep = 60 / tempo / 4;
        const baseLoopLength = AppState.getMaxLengthInScene(sceneIndex);
        this.startPlayheadAnimation(baseLoopLength, secondsPerStep, true);
    },

    /**
     * Helper: Stop song playback.
     */
    _stopSong(timestamp) {
        this._pendingPlayCommand = null;

        // Tell C++ to clear song mode state
        if (this.externalHandler) {
            this.externalHandler({ command: 'stopSongMode', payload: {}, timestamp });
            this.externalHandler({ command: 'stopScene', payload: {}, timestamp });
        }

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
     * Helper: Pause song playback.
     */
    _pauseSong(timestamp) {
        this.externalHandler({ command: 'stopSongMode', payload: {}, timestamp });
        this.externalHandler({ command: 'stopScene', payload: {}, timestamp });

        this.songPaused = true;
        this.isPlaying = false;
        this.updateSongPlayButton(true, true);
        this.updatePlayButton(true, true);
        this.updatePlayAllButton(true, true);
    },

    /**
     * Helper: Resume song playback from the current scene (restarts from beat 0).
     */
    _resumeSong(timestamp) {
        this.songPaused = false;
        this.updateSongPlayButton(true, false);

        const startScene = this.currentSongScene || 0;

        // Collect scenes from the current scene onwards and re-hand to C++
        const scenes = [];
        for (let s = startScene; s < AppState.numScenes; s++) {
            const data = this._buildSongSceneData(s);
            if (data) scenes.push(data);
        }

        if (scenes.length === 0) {
            this._stopSong(timestamp);
            return;
        }

        this.updateSongPlayButton(false, false, true);  // loading spinner
        this._ensureGraphWired();
        this.send('setTempo', { bpm: AppState.tempo || 120 });
        this.send('startSong', { scenes });

        this.isPlayingSong = true;
        this.sceneLength = 0;
        // Playhead animation starts when C++ emits songReady
    },

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
            if (!this.externalHandler) {
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
        if (!this.externalHandler) return;

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
        this.send('getPluginParameters', { trackIndex });
    },

    // ==========================================
    // External Renderer Integration
    // ==========================================

    /** Returns true when connected to the JUCE host */
    isExternalMode() { return !!this.externalHandler; },

    /**
     * Connect to the JUCE host
     * @param {function} handler - Function to receive audio commands
     */
    connectExternal(handler) {
        this.externalHandler = handler;
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
                        // Do NOT trigger stopScene() in Live Mode: transport runs
                        // continuously and stale sceneLength from a prior scene play
                        // would kill all live samples via midiBridge.stop().
                        if (!this.liveMode && this.sceneLength && position >= this.sceneLength) {
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
                        // Only check for clip end when NOT in live mode.
                        // In live mode the transport runs continuously (started by the first sample
                        // clip), so the global position keeps growing past any individual clip's
                        // length.  Firing stopClip() here would call midiBridge.stop() and kill
                        // all MIDI rendering for every live clip currently playing.
                        if (this.isPlaying && !this.isPlayingScene && !this.liveMode) {
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
                                    } else if (!this.liveMode) {
                                        // One-shot mode - stop playback (not in Live Mode)
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

                    // SongScreen playhead is drawn by the overlay loop — no redraw needed here.
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

                        // If clip (not scene) was playing, re-enable scene buttons
                        if (!wasPlayingScene) {
                            this.updateSceneControlsState(false);
                        }

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
                    if (message.trackIndex === -1) {
                        // Master mixer meter
                        AppState.masterMixerState.levelL = message.levelL;
                        AppState.masterMixerState.levelR = message.levelR;
                        this.updateMixerLevelMeter(-1, message.levelL, message.levelR);
                    } else {
                        const state = AppState.getMixerState(message.trackIndex);
                        state.levelL = message.levelL;
                        state.levelR = message.levelR;
                        // Update mixer UI level meters if visible
                        this.updateMixerLevelMeter(message.trackIndex, message.levelL, message.levelR);
                    }
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

            case 'drumSampleSelected':
                // JUCE notifies JS that a drum sample was copied to drumkit/ folder and loaded
                if (typeof AppState !== 'undefined') {
                    AppState.setDrumKitSample(
                        message.trackIndex,
                        message.noteNumber,
                        message.filePath,
                        message.fileName
                    );
                }
                // Refresh the clip editor piano keys if it's showing this track
                if (typeof ClipEditor !== 'undefined' &&
                    AppState.currentTrack === message.trackIndex) {
                    ClipEditor.renderPianoKeys();
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

            case 'midiDeviceList': {
                // JUCE sends the list of available MIDI input device names
                this._midiDeviceList = message.devices || [];
                // Update the pending select if the track settings modal is open
                const pendingSel = this._pendingDeviceSelect;
                const pendingVal = this._pendingDeviceValue;
                this._pendingDeviceSelect = null;
                this._pendingDeviceValue = null;
                if (pendingSel) {
                    // Repopulate directly (cache is now set, won't re-request).
                    // Preserve fixed options at index 0 ("None") and index 1 ("Any").
                    while (pendingSel.options.length > 2) pendingSel.remove(2);
                    this._midiDeviceList.forEach(name => {
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.textContent = name;
                        pendingSel.appendChild(opt);
                    });
                    if (pendingVal) pendingSel.value = pendingVal;
                }
                break;
            }

            case 'midiNoteIn': {
                // JUCE forwards an incoming MIDI note event from the connected input device
                // Only process if recording is active for this track
                if (this.midiRecordingTrack !== message.trackIndex) break;
                const trackIndex = message.trackIndex;
                const pitch = message.pitch;
                const velocity = message.velocity || 0;
                const isNoteOn = message.isNoteOn && velocity > 0;

                if (typeof AppState === 'undefined') break;
                const clip = AppState.getClip(AppState.currentScene, trackIndex);
                if (!clip) break;

                if (isNoteOn) {
                    // If this is the first note after pressing record, start the clock now
                    if (this._recordWaitingForFirstNote) {
                        this._recordStartTime = performance.now();
                        this._recordWaitingForFirstNote = false;
                    }

                    // Apply C Major → target scale mapping if the track setting is enabled
                    const trackSettings = (typeof AppState !== 'undefined') ? AppState.getTrackSettings(trackIndex) : {};
                    const mappedPitch = trackSettings.useCMajorMapping
                        ? this._mapCMajorToScale(pitch, trackIndex)
                        : pitch;

                    // Stamp note-on with current record head position and capture CC state
                    this._pendingRecordNotes[pitch] = {
                        start: this._getRecordHeadStep(),
                        velocity: velocity,                          // 0-127 (matches automation bar scale)
                        pitchBend: this._recordCurrentPitchBend,   // 0-127 snapshot at note-on
                        modulation: this._recordCurrentModulation,  // 0-127 snapshot at note-on
                        mappedPitch: mappedPitch                    // resolved target pitch
                    };
                } else {
                    // Note-off: compute duration from record head and write to clip
                    const info = this._pendingRecordNotes[pitch];
                    if (info !== undefined) {
                        const endStep = this._getRecordHeadStep();
                        const startSnapped = Math.round(info.start);
                        const duration = Math.max(1, Math.round(endStep - info.start));
                        const note = { pitch: info.mappedPitch, start: startSnapped, duration: duration, velocity: info.velocity };
                        // Only store CC overrides when they differ from the defaults
                        if (info.pitchBend !== 64) note.pitchBend = info.pitchBend;
                        if (info.modulation !== 0)  note.modulation = info.modulation;
                        clip.notes.push(note);
                        delete this._pendingRecordNotes[pitch];

                        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx &&
                            AppState.currentTrack === trackIndex) {
                            ClipEditor.renderPianoGrid();
                        }
                        if (typeof SongScreen !== 'undefined' && SongScreen.updateClipVisual) {
                            SongScreen.updateClipVisual(AppState.currentScene, trackIndex);
                        }
                    }
                }
                break;
            }

            case 'midiPitchBendIn': {
                // JUCE forwards an incoming pitch bend event; track current value for recording
                if (this.midiRecordingTrack === message.trackIndex) {
                    this._recordCurrentPitchBend = message.value; // 0-127, 64=center
                }
                break;
            }

            case 'midiCCIn': {
                // JUCE forwards an incoming CC event; track CC#1 (modulation) for recording
                if (this.midiRecordingTrack === message.trackIndex && message.cc === 1) {
                    this._recordCurrentModulation = message.value; // 0-127
                }
                break;
            }

            case 'songLoading': {
                // C++ has started loading all scene samples — keep the spinner visible.
                // (Usually the spinner is already showing from _playSong; this ensures
                // it is shown even if the message arrives slightly late.)
                this.updateSongPlayButton(false, false, true);
                break;
            }

            case 'songReady': {
                // All samples are loaded and the transport is rolling — start the UI.
                const readyScene = message.sceneIndex ?? this.currentSongScene ?? 0;
                this.currentSongScene = readyScene;
                this.playingSceneIndex = readyScene;
                this.sceneIterationLength = AppState.getMaxLengthInScene(readyScene);
                this.sceneLength = 0;
                this.playheadStep = 0;
                this.isPlaying = true;
                this.isPlayingScene = true;
                this.scenePaused = false;
                this.updateSongPlayButton(true, false);
                this.updatePlayButton(true);
                this.updatePlayAllButton(true, false);
                this.updateTrackControlsState(true);
                if (typeof SongScreen !== 'undefined')
                    SongScreen.highlightPlayingScene(readyScene);
                this._startSongPlayheadAnimation(readyScene);
                break;
            }

            case 'sceneChanged': {
                // C++ advanced to the next scene (or song ended when sceneIndex == -1).
                // JS updates UI and pre-queues the scene after this one.
                const newScene = message.sceneIndex;
                if (newScene < 0) {
                    // Song finished naturally
                    this._stopSong(performance.now());
                } else if (this.isPlayingSong && !this.songPaused) {
                    this.currentSongScene = newScene;
                    // Update playingSceneIndex so ClipEditor and SongScreen
                    // draw the playhead in the correct scene row
                    this.playingSceneIndex = newScene;
                    // Update iteration length so timingUpdate wraps correctly
                    this.sceneIterationLength = AppState.getMaxLengthInScene(newScene);
                    // Disable JS-side scene-end detection — C++ drives it in song mode
                    this.sceneLength = 0;
                    // Reset playhead to start of new scene
                    this.playheadStep = 0;
                    if (typeof SongScreen !== 'undefined')
                        SongScreen.highlightPlayingScene(newScene);
                    this._startSongPlayheadAnimation(newScene);
                    // C++ handles all pre-queuing internally — no JS round-trip needed
                }
                break;
            }

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

    // ==========================================
    // MIDI Input Connect / Record
    // ==========================================

    /**
     * Enable or disable MIDI input routing from an external device to a track's instrument.
     * Sends setMidiInput command to JUCE.
     */
    setMidiInputConnect(trackIndex, device, channel, enabled) {
        this.midiConnectedTracks[trackIndex] = enabled;
        if (this.externalHandler) {
            this.send('setMidiInput', {
                trackIndex: trackIndex,
                device: device || '',
                channel: parseInt(channel, 10) || 0,
                enabled: enabled
            });
        }
    },

    /**
     * Start MIDI note recording into the current clip for the given track.
     * A wall-clock record head advances from step 0 at the current tempo.
     * Recording auto-stops when the record head reaches the clip length.
     */
    startMidiRecord(trackIndex) {
        this.midiRecordingTrack = trackIndex;
        this._pendingRecordNotes = {};
        this._recordStartTime = null;           // Clock starts on the first note-on, not on button press
        this._recordHeadStep = 0;
        this._recordWaitingForFirstNote = true;
        this._recordCurrentPitchBend = 64;
        this._recordCurrentModulation = 0;

        // Ensure connect is active so MIDI events flow
        if (!this.midiConnectedTracks[trackIndex]) {
            const trackSettings = typeof AppState !== 'undefined' ? AppState.getTrackSettings(trackIndex) : {};
            this.setMidiInputConnect(trackIndex, trackSettings.midiInputDevice || '', trackSettings.midiInputChannel || 0, true);
        }

        // Kick off the record head animation loop
        this._animateRecordHead();
    },

    /**
     * Returns the current record head position in steps, derived from
     * wall-clock elapsed time and the current tempo.
     */
    _getRecordHeadStep() {
        if (this._recordStartTime === null) return 0;
        const tempo = (typeof AppState !== 'undefined' && AppState.tempo) ? AppState.tempo : 120;
        const elapsedMs = performance.now() - this._recordStartTime;
        // steps = elapsed_seconds * (tempo_bpm * 4_steps_per_beat / 60)
        return elapsedMs / 1000 * tempo * 4 / 60;
    },

    /**
     * Animation loop that drives the record head forward and auto-stops
     * when the clip length is reached.
     */
    _animateRecordHead() {
        if (this.midiRecordingTrack === null) return;

        this._recordHeadStep = this._getRecordHeadStep();

        // Drive the piano-roll playhead so the user can see progress
        this.playheadStep = this._recordHeadStep;

        // Redraw the grid to show the moving record head (or the waiting-at-0 state)
        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
            ClipEditor.renderPianoGrid();
        }

        // Auto-stop only once recording has actually started (after first note)
        if (!this._recordWaitingForFirstNote && typeof AppState !== 'undefined') {
            const clip = AppState.getClip(AppState.currentScene, this.midiRecordingTrack);
            const clipLength = clip ? (clip.length || 64) : 64;
            if (this._recordHeadStep >= clipLength) {
                this.stopMidiRecord();
                // Update button states
                if (typeof ClipEditor !== 'undefined') ClipEditor.updateModeSelector();
                return;
            }
        }

        requestAnimationFrame(() => this._animateRecordHead());
    },

    /**
     * Stop MIDI recording. Any held notes are finalized at the current
     * record head position, then the record head is reset.
     */
    stopMidiRecord() {
        if (this.midiRecordingTrack === null) return;
        const trackIndex = this.midiRecordingTrack;

        // Snapshot final record head position before clearing state
        const finalStep = this._getRecordHeadStep();

        this.midiRecordingTrack = null;
        this._recordStartTime = null;
        this._recordHeadStep = 0;
        this._recordWaitingForFirstNote = false;

        // Finalize any notes still held at stop time
        if (typeof AppState !== 'undefined') {
            const clip = AppState.getClip(AppState.currentScene, trackIndex);
            if (clip) {
                Object.entries(this._pendingRecordNotes).forEach(([pitch, info]) => {
                    const duration = Math.max(1, Math.round(finalStep - info.start));
                    const note = { pitch: info.mappedPitch ?? parseInt(pitch, 10), start: info.start, duration: duration, velocity: info.velocity };
                    if (info.pitchBend !== undefined && info.pitchBend !== 64) note.pitchBend = info.pitchBend;
                    if (info.modulation !== undefined && info.modulation !== 0)  note.modulation = info.modulation;
                    clip.notes.push(note);
                });
            }
        }
        this._pendingRecordNotes = {};

        // Reset playhead only if JUCE isn't playing (so we don't jump the real playhead)
        if (!this.isPlaying) {
            this.playheadStep = 0;
        }

        if (typeof ClipEditor !== 'undefined' && ClipEditor.gridCtx) {
            ClipEditor.renderPianoGrid();
        }
        if (typeof SongScreen !== 'undefined' && SongScreen.updateClipVisual) {
            SongScreen.updateClipVisual(AppState.currentScene, trackIndex);
        }
    },

    /**
     * Map an incoming MIDI pitch from C Major to the track's configured scale/root.
     *
     * The user plays in C Major (white keys = C,D,E,F,G,A,B). Each C Major scale
     * degree is mapped to the same degree in the track's target scale, preserving
     * octave. Non-C-Major notes (black keys) are snapped to the nearest C Major
     * note before mapping.
     *
     * Returns the original pitch unchanged if the track has no scale set.
     */
    _mapCMajorToScale(pitch, trackIndex) {
        if (typeof ClipEditor === 'undefined') return pitch;
        const trackScale = ClipEditor.getTrackScale(trackIndex);
        if (!trackScale || trackScale.scale === 'none') return pitch;

        const targetScaleData = ClipEditor.SCALES[trackScale.scale];
        if (!targetScaleData || targetScaleData.intervals.length === 0) return pitch;

        const CM = [0, 2, 4, 5, 7, 9, 11]; // C Major semitone intervals
        const octave      = Math.floor(pitch / 12);
        const noteInOct   = pitch % 12;

        // Find degree in C Major — snap to nearest if note is a black key
        let degree = CM.indexOf(noteInOct);
        if (degree === -1) {
            let minDist = Infinity;
            CM.forEach((interval, i) => {
                // Circular distance within the octave
                const dist = Math.min(
                    Math.abs(noteInOct - interval),
                    Math.abs(noteInOct - interval + 12),
                    Math.abs(noteInOct - interval - 12)
                );
                if (dist < minDist) { minDist = dist; degree = i; }
            });
        }

        // Map that degree to the same degree in the target scale
        const ti       = targetScaleData.intervals;
        const degIdx   = degree % ti.length;
        const octShift = Math.floor(degree / ti.length);
        const mapped   = (octave + octShift) * 12 + trackScale.root + ti[degIdx];
        return Math.max(0, Math.min(127, mapped));
    },

    /**
     * Populate a <select> element with MIDI input device names.
     * Always requests a fresh list from JUCE; if a cached list exists it is
     * applied immediately and then overwritten when the response arrives.
     */
    populateMidiInputDevices(selectEl, currentValue) {
        const populate = (devices) => {
            // Preserve the fixed "None" (index 0) and "Any" (index 1) options;
            // remove only the dynamically-added device entries beyond them.
            while (selectEl.options.length > 2) selectEl.remove(2);
            devices.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                selectEl.appendChild(opt);
            });
            if (currentValue) selectEl.value = currentValue;
        };

        // Apply cached list immediately so the modal isn't blank while waiting
        if (this._midiDeviceList && this._midiDeviceList.length > 0) {
            populate(this._midiDeviceList);
        }

        // Always request a fresh list from JUCE
        if (this.externalHandler) {
            this._pendingDeviceSelect = selectEl;
            this._pendingDeviceValue = currentValue;
            this.send('getMidiInputDevices', {});
        }
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
        if (!this.externalHandler) return;

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
     * Send master mixer state update to JUCE
     * Call this when master volume, pan, or mute changes
     */
    updateMasterMixerState() {
        if (!this.externalHandler) return;

        const state = AppState.masterMixerState;
        this.send('setMasterMixerState', {
            volume: state.volume,
            pan: state.pan,
            mute: state.mute
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
        // trackIndex = -1 means the master mixer strip
        const suffix = trackIndex === -1 ? 'master' : trackIndex;
        const songLevelL = document.getElementById(`songLevelL-${suffix}`);
        const songLevelR = document.getElementById(`songLevelR-${suffix}`);

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
        if (this.externalHandler) {
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

            const state = this.getProjectState();
            if (state) {
                this.send('syncProjectState', state);
            }

            // Pre-fetch MIDI input device list so it's ready when track settings opens
            this.send('getMidiInputDevices', {});

            console.log('[AudioBridge] Connected to JUCE via native function');
            return true;
        } else {
            console.log('[AudioBridge] ✗ audioBridgeCommand NOT FOUND');
        }

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
