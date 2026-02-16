// Clip Editor - Piano Roll Interface

const ClipEditor = {
    // Canvas contexts
    keysCtx: null,
    gridCtx: null,
    gridCanvas: null,
    keysCanvas: null,

    // Tool modes
    MODE_PENCIL: 'pencil',
    MODE_SELECT: 'select',
    MODE_AUTOMATION: 'automation',
    currentMode: 'pencil',

    // Automation state
    currentAutomationParam: 'velocity',
    automationNoteCtx: null,
    automationBarsCtx: null,
    automationNoteCanvas: null,
    automationBarsCanvas: null,
    isDraggingAutomation: false,
    automationBarsListenersAttached: false,
    automationBarPositions: [],
    automationZoom: 1.0,
    automationMinZoom: 1.0,
    automationMaxZoom: 4.0,

    // Mouse state for drawing/editing notes
    isDrawing: false,
    isResizing: false,
    isMoving: false,
    isSelecting: false,
    drawStartStep: -1,
    drawStartPitch: -1,
    currentDrawNote: null,
    selectedNote: null,
    moveOffsetStep: 0,  // Offset from note start when dragging

    // Selection state
    selectedNotes: new Set(),  // Set of selected note references
    selectionRect: null,  // { startX, startY, endX, endY } in canvas coordinates
    selectionStartX: 0,
    selectionStartY: 0,

    // Multi-note move state
    isMovingSelected: false,
    moveStartStep: 0,
    moveStartPitch: 0,
    noteStartPositions: [],  // Array of { note, startStep, startPitch } for each selected note

    // Clipboard for copy/paste
    noteClipboard: [],

    // Undo/Redo state
    undoStack: [],
    redoStack: [],
    maxUndoLevels: 50,

    // Resize handle width in pixels
    RESIZE_HANDLE_WIDTH: 8,

    // Piano roll zoom
    pianoRollZoom: 1.0,
    pianoRollMinZoom: 0.5,
    pianoRollMaxZoom: 4.0,

    // Selected note color
    SELECTED_NOTE_COLOR: '#65b8d5',

    // Track colors palette
    TRACK_COLORS: [
        '#d5a865',  // Gold (Track 1)
        '#65b8d5',  // Cyan (Track 2)
        '#d565a8',  // Pink (Track 3)
        '#65d58a',  // Green (Track 4)
        '#a865d5',  // Purple (Track 5)
        '#d57865',  // Coral (Track 6)
        '#65d5c8',  // Teal (Track 7)
        '#d5c865',  // Yellow (Track 8)
        '#7865d5',  // Indigo (Track 9)
        '#d5656e',  // Red (Track 10)
        '#65d565',  // Lime (Track 11)
        '#c865d5',  // Magenta (Track 12)
    ],

    // Get track color
    getTrackColor: function(trackIndex) {
        return this.TRACK_COLORS[trackIndex % this.TRACK_COLORS.length];
    },

    // Get ghost (darker/transparent) version of track color
    getGhostColor: function(trackIndex) {
        const color = this.getTrackColor(trackIndex);
        // Convert hex to rgba with transparency
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 0.35)`;
    },

    // Get ghost border color
    getGhostBorderColor: function(trackIndex) {
        const color = this.getTrackColor(trackIndex);
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 0.5)`;
    },

    // Get dark version of track color (for gradients)
    getDarkTrackColor: function(trackIndex) {
        const color = this.getTrackColor(trackIndex);
        const r = Math.floor(parseInt(color.slice(1, 3), 16) * 0.5);
        const g = Math.floor(parseInt(color.slice(3, 5), 16) * 0.5);
        const b = Math.floor(parseInt(color.slice(5, 7), 16) * 0.5);
        return `rgb(${r}, ${g}, ${b})`;
    },

    // Ghost tracks - Set of track indices to show as ghost notes
    ghostTracks: new Set(),

    // Track overview settings
    showTrackOverview: false,  // Whether to show track overview in main canvas
    TRACK_OVERVIEW_HEIGHT: 14,  // Height per track in overview section

    // Scale definitions (intervals from root, 0 = root)
    SCALES: {
        'none': { name: 'None', intervals: [] },
        'major': { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
        'minor': { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
        'harmonic-minor': { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
        'melodic-minor': { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
        'pentatonic-major': { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
        'pentatonic-minor': { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
        'blues': { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
        'dorian': { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
        'phrygian': { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
        'lydian': { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
        'mixolydian': { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
        'locrian': { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
        'chromatic': { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
    },

    // Root note names
    ROOT_NOTES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],


    // General MIDI Drum Map (MIDI note number -> drum name)
    DRUM_NAMES: {
        35: 'Kick 2',
        36: 'Kick',
        37: 'Side Stick',
        38: 'Snare',
        39: 'Clap',
        40: 'Snare 2',
        41: 'Low Tom 2',
        42: 'Closed HH',
        43: 'Low Tom',
        44: 'Pedal HH',
        45: 'Mid Tom 2',
        46: 'Open HH',
        47: 'Mid Tom',
        48: 'Hi Tom 2',
        49: 'Crash',
        50: 'Hi Tom',
        51: 'Ride',
        52: 'China',
        53: 'Ride Bell',
        54: 'Tamb',
        55: 'Splash',
        56: 'Cowbell',
        57: 'Crash 2',
        58: 'Vibraslap',
        59: 'Ride 2',
        60: 'Hi Bongo',
        61: 'Low Bongo',
        62: 'Mute Conga',
        63: 'Open Conga',
        64: 'Low Conga',
        65: 'Hi Timbal',
        66: 'Low Timbal',
        67: 'Hi Agogo',
        68: 'Low Agogo',
        69: 'Cabasa',
        70: 'Maracas',
        71: 'Whistle S',
        72: 'Whistle L',
        73: 'Guiro S',
        74: 'Guiro L',
        75: 'Claves',
        76: 'Hi Block',
        77: 'Low Block',
        78: 'Mute Cuica',
        79: 'Open Cuica',
        80: 'Mute Tri',
        81: 'Open Tri'
    },

    // Get track type for given track (track-level setting)
    // Returns 'melody' or 'sample' based on trackSettings.trackType
    getTrackMode: function(trackIndex, sceneIndex = null) {
        const trackSettings = AppState.getTrackSettings(trackIndex);

        if (trackSettings.trackType === 'sample') {
            return 'sample';
        }
        return 'melody'; // melody, sampled_instrument all use piano roll
    },

    // Check if track has percussion enabled (independent of track type)
    isPercussionTrack: function(trackIndex) {
        return AppState.getTrackSettings(trackIndex).isPercussion || false;
    },

    // Set track type for given track (track-level setting)
    setTrackMode: function(trackIndex, mode, sceneIndex = null) {
        if (mode === 'sample') {
            AppState.setTrackSettings(trackIndex, { trackType: 'sample' });
        } else if (mode === 'sampled_instrument') {
            AppState.setTrackSettings(trackIndex, { trackType: 'sampled_instrument' });
        } else {
            AppState.setTrackSettings(trackIndex, { trackType: 'melody' });
        }
    },

    // Get drum name for a MIDI pitch
    getDrumName: function(pitch) {
        return this.DRUM_NAMES[pitch] || `Drum ${pitch}`;
    },

    // Current scale settings (per track)
    trackScales: [], // Array of { root: 0-11, scale: 'major', hideNotesNotInScale: bool } per track

    // Get or initialize scale settings for a track
    getTrackScale: function(trackIndex) {
        if (!this.trackScales[trackIndex]) {
            this.trackScales[trackIndex] = { root: 0, scale: 'none', hideNotesNotInScale: false }; // Default: C, no scale, show all notes
        }
        // Ensure hideNotesNotInScale exists for older saved data
        if (this.trackScales[trackIndex].hideNotesNotInScale === undefined) {
            this.trackScales[trackIndex].hideNotesNotInScale = false;
        }
        return this.trackScales[trackIndex];
    },

    // Set scale for a track
    setTrackScale: function(trackIndex, root, scale, hideNotesNotInScale) {
        const current = this.getTrackScale(trackIndex);
        this.trackScales[trackIndex] = {
            root: root,
            scale: scale,
            hideNotesNotInScale: hideNotesNotInScale !== undefined ? hideNotesNotInScale : current.hideNotesNotInScale
        };
    },

    // Check if a pitch is in the current scale for a track
    isPitchInScale: function(pitch, trackIndex) {
        const trackScale = this.getTrackScale(trackIndex);
        if (trackScale.scale === 'none') {
            return true; // No scale filter, all notes are valid
        }

        const scaleData = this.SCALES[trackScale.scale];
        if (!scaleData || scaleData.intervals.length === 0) {
            return true;
        }

        // Get the note within the octave (0-11)
        const noteInOctave = pitch % 12;
        // Calculate interval from root
        const intervalFromRoot = (noteInOctave - trackScale.root + 12) % 12;

        return scaleData.intervals.includes(intervalFromRoot);
    },

    // Check if a pitch should be visible (considering hideNotesNotInScale)
    isPitchVisible: function(pitch, trackIndex) {
        const trackScale = this.getTrackScale(trackIndex);
        if (!trackScale.hideNotesNotInScale) {
            return true; // Show all notes when not hiding
        }
        return this.isPitchInScale(pitch, trackIndex);
    },

    // Get list of visible pitches for a track (highest to lowest, matching render order)
    getVisiblePitches: function(trackIndex) {
        const pitches = [];
        for (let i = 0; i < AppState.TOTAL_NOTES; i++) {
            const pitch = AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - i);
            if (this.isPitchVisible(pitch, trackIndex)) {
                pitches.push(pitch);
            }
        }
        return pitches;
    },

    // Get y-position for a pitch (considering hidden notes)
    getPitchY: function(pitch, trackIndex) {
        const trackScale = this.getTrackScale(trackIndex);
        if (!trackScale.hideNotesNotInScale) {
            // Normal mode - use standard calculation
            const noteIndex = (AppState.BASE_NOTE + AppState.TOTAL_NOTES - 1) - pitch;
            return noteIndex * AppState.NOTE_HEIGHT;
        }

        // Hidden notes mode - calculate based on visible notes only
        let y = 0;
        for (let i = 0; i < AppState.TOTAL_NOTES; i++) {
            const currentPitch = AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - i);
            if (currentPitch === pitch) {
                return this.isPitchVisible(currentPitch, trackIndex) ? y : -1; // -1 means not visible
            }
            if (this.isPitchVisible(currentPitch, trackIndex)) {
                y += AppState.NOTE_HEIGHT;
            }
        }
        return -1;
    },

    // Get total height of piano roll (considering hidden notes)
    getPianoRollHeight: function(trackIndex) {
        const trackScale = this.getTrackScale(trackIndex);
        if (!trackScale.hideNotesNotInScale) {
            return AppState.TOTAL_NOTES * AppState.NOTE_HEIGHT;
        }
        return this.getVisiblePitches(trackIndex).length * AppState.NOTE_HEIGHT;
    },

    // Convert y-coordinate to pitch (considering hidden notes)
    getPitchFromY: function(y, trackIndex) {
        const trackScale = this.getTrackScale(trackIndex);
        const isPercussion = this.isPercussionTrack(trackIndex);

        if (!trackScale.hideNotesNotInScale || isPercussion) {
            // Normal mode - use standard calculation
            const noteIndex = Math.floor(y / AppState.NOTE_HEIGHT);
            return AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - noteIndex);
        }

        // Hidden notes mode - find pitch from visible notes
        const visiblePitches = this.getVisiblePitches(trackIndex);
        const rowIndex = Math.floor(y / AppState.NOTE_HEIGHT);
        if (rowIndex >= 0 && rowIndex < visiblePitches.length) {
            return visiblePitches[rowIndex];
        }
        return -1; // Invalid
    },

    // Update scale selector UI - scale is now in track settings modal
    updateScaleSelector: function() {
        // Scale selector moved to track settings modal - nothing to update in toolbar
    },

    // Update mode selector UI to match current track
    updateModeSelector: function() {
        // Show/hide sample editor based on mode
        this.updateSampleEditorVisibility();
    },

    // Show or hide sample editor based on current track mode
    updateSampleEditorVisibility: function() {
        const mode = this.getTrackMode(AppState.currentTrack);
        const isSampleMode = mode === 'sample';

        // Show/hide sample editor
        if (isSampleMode) {
            // Exit automation mode if active
            if (this.currentMode === this.MODE_AUTOMATION) {
                this.currentMode = this.MODE_PENCIL;
                document.getElementById('pencilTool').classList.add('active');
                document.getElementById('selectTool').classList.remove('active');
                document.getElementById('automationTool').classList.remove('active');
            }

            // Hide automation view
            const automationView = document.getElementById('automationView');
            if (automationView) {
                automationView.style.display = 'none';
            }

            // Hide track overview
            const trackOverviewContainer = document.getElementById('trackOverviewContainer');
            if (trackOverviewContainer) {
                trackOverviewContainer.classList.remove('visible');
            }

            SampleEditor.show();
        } else {
            SampleEditor.hide();

            // Restore track overview if it was enabled
            if (this.showTrackOverview) {
                const trackOverviewContainer = document.getElementById('trackOverviewContainer');
                if (trackOverviewContainer) {
                    trackOverviewContainer.classList.add('visible');
                }
            }
        }

        // Disable/enable piano note editor buttons in sample mode
        const pianoToolButtons = ['pencilTool', 'selectTool', 'automationTool'];
        pianoToolButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('disabled', isSampleMode);
                if (isSampleMode) {
                    btn.setAttribute('disabled', 'disabled');
                } else {
                    btn.removeAttribute('disabled');
                }
            }
        });

        // Length selector is now enabled for all track types (including samples)
        // This allows setting clip length in bars for sample looping/one-shot timing
        const lengthSelect = document.getElementById('lengthSelect');
        if (lengthSelect) {
            lengthSelect.disabled = false;
            lengthSelect.style.opacity = '1';
        }

        // Show/hide VST UI button: visible only for melody tracks with an instrument assigned
        const vstUiBtn = document.getElementById('vstUiBtn');
        if (vstUiBtn) {
            const isMelody = mode === 'melody';
            const hasInstrument = typeof InstrumentSelector !== 'undefined' &&
                InstrumentSelector.trackInstruments[AppState.currentTrack] &&
                InstrumentSelector.trackInstruments[AppState.currentTrack].id;
            vstUiBtn.style.display = (isMelody && hasInstrument) ? '' : 'none';
        }
    },

    // Handle track type change from dropdown
    handleTrackTypeChange: function(newMode) {
        this.setTrackMode(AppState.currentTrack, newMode);
        this.updateModeSelector();
        this.updateScaleSelector();

        if (newMode !== 'sample') {
            this.renderPianoKeys();
            this.renderPianoGrid();
        }
    },

    // Toggle track overview visibility
    toggleTrackOverview: function() {
        this.showTrackOverview = !this.showTrackOverview;

        // Update toggle button state
        const toggleBtn = document.getElementById('overviewToggle');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.showTrackOverview);
        }

        // Show/hide the track overview container
        const container = document.getElementById('trackOverviewContainer');
        if (container) {
            container.classList.toggle('visible', this.showTrackOverview);
        }

        // Render track overview if visible
        if (this.showTrackOverview) {
            this.renderTrackOverviewCanvas();
            this.renderTrackOverviewLabels();
        }
    },

    // Setup scroll synchronization between piano roll and track overview
    setupScrollSync: function() {
        if (this.scrollSyncAttached) return;

        const pianoRollScroll = document.getElementById('pianoRollScroll');
        const trackOverviewScroll = document.getElementById('trackOverviewScroll');

        if (pianoRollScroll && trackOverviewScroll) {
            // Sync: piano roll -> track overview
            pianoRollScroll.addEventListener('scroll', () => {
                trackOverviewScroll.scrollLeft = pianoRollScroll.scrollLeft;
            });

            // Sync: track overview -> piano roll
            trackOverviewScroll.addEventListener('scroll', () => {
                pianoRollScroll.scrollLeft = trackOverviewScroll.scrollLeft;
            });

            this.scrollSyncAttached = true;
        }
    },

    // Render track overview labels
    renderTrackOverviewLabels: function() {
        const labelsContainer = document.getElementById('trackOverviewLabels');
        if (!labelsContainer) return;

        labelsContainer.innerHTML = '';

        for (let t = 0; t < AppState.numTracks; t++) {
            const label = document.createElement('div');
            label.className = 'track-overview-label' + (t === AppState.currentTrack ? ' current' : '');
            label.style.borderLeft = `3px solid ${this.getTrackColor(t)}`;
            const trackName = AppState.getTrackName(t);
            label.textContent = trackName.length > 6 ? trackName.substring(0, 5) + '.' : trackName;
            label.title = trackName;
            labelsContainer.appendChild(label);
        }
    },

    // Render track overview to its own canvas
    renderTrackOverviewCanvas: function() {
        if (!this.trackOverviewCtx || !this.showTrackOverview) return;

        const ctx = this.trackOverviewCtx;
        const canvas = this.trackOverviewCanvas;
        const stepWidth = this.getZoomedStepWidth();
        const trackHeight = this.TRACK_OVERVIEW_HEIGHT;
        const width = canvas.width;
        const height = canvas.height;

        // Reset canvas state
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Draw track rows
        for (let t = 0; t < AppState.numTracks; t++) {
            const y = t * trackHeight;

            // Alternate row colors
            ctx.fillStyle = t % 2 === 0 ? '#1d1d1d' : '#1a1a1a';
            ctx.fillRect(0, y, width, trackHeight);

            // Highlight current track row
            if (t === AppState.currentTrack) {
                ctx.fillStyle = this.getGhostColor(t);
                ctx.fillRect(0, y, width, trackHeight);
            }

            // Row border
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + trackHeight);
            ctx.lineTo(width, y + trackHeight);
            ctx.stroke();
        }

        // Draw bar and beat lines (aligned with piano roll)
        for (let step = 0; step <= AppState.currentLength; step++) {
            const x = step * stepWidth;
            if (step % 16 === 0) {
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            } else if (step % 4 === 0) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        }

        // Draw notes for each track
        for (let t = 0; t < AppState.numTracks; t++) {
            const clip = AppState.clips[AppState.currentScene][t];
            const y = t * trackHeight;
            const trackColor = this.getTrackColor(t);
            const trackScale = this.getTrackScale(t);
            const isPercussion = this.isPercussionTrack(t);
            const hasScale = trackScale.scale !== 'none' && !isPercussion;

            // Draw each note as a horizontal bar
            clip.notes.forEach(note => {
                const x = note.start * stepWidth;
                const noteWidth = note.duration * stepWidth;

                // Check if note is in scale (only for melody tracks with a scale set)
                const inScale = !hasScale || this.isPitchInScale(note.pitch, t);

                // Use warning color (red/orange) for out-of-scale notes
                ctx.fillStyle = inScale ? trackColor : '#cc4444';
                ctx.fillRect(x + 1, y + 2, noteWidth - 2, trackHeight - 4);

                // Add a small indicator border for out-of-scale notes
                if (!inScale) {
                    ctx.strokeStyle = '#ff6666';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 1, y + 2, noteWidth - 2, trackHeight - 4);
                }
            });

            // Draw track length indicator (dim area beyond track length)
            const trackLength = clip.length;
            if (trackLength < AppState.currentLength) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(trackLength * stepWidth, y, (AppState.currentLength - trackLength) * stepWidth, trackHeight);
            }
        }

        // Draw per-track playheads if playing (each track cycles based on its own length)
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isPlaying && AudioBridge.playbackStartTime) {
            // Calculate elapsed steps from start time
            const elapsed = (performance.now() - AudioBridge.playbackStartTime) / 1000;
            const elapsedSteps = elapsed / AudioBridge.playbackSecondsPerStep;

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 4;

            // Draw playhead for each track based on its own clip length
            for (let t = 0; t < AppState.numTracks; t++) {
                const clip = AppState.clips[AppState.currentScene][t];
                const trackClipLength = clip?.length || AppState.currentLength || 64;
                const y = t * trackHeight;

                // Calculate playhead position for this track (cycling within its clip length)
                const trackPlayheadStep = elapsedSteps % trackClipLength;
                const playheadX = trackPlayheadStep * stepWidth;

                ctx.beginPath();
                ctx.moveTo(playheadX, y);
                ctx.lineTo(playheadX, y + trackHeight);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }
    },

    // Bound event handlers (for proper removal)
    boundMouseDown: null,
    boundMouseMove: null,
    boundMouseUp: null,
    boundContextMenu: null,
    listenersAttached: false,

    // Open clip editor
    open: function(scene, track) {
        AppState.currentScene = scene;
        AppState.currentTrack = track;
        AppState.currentLength = AppState.clips[scene][track].length;

        // Clear selection and undo history when opening a new clip
        this.selectedNotes.clear();
        this.undoStack = [];
        this.redoStack = [];

        this.updateEditorInfo();
        document.getElementById('lengthSelect').value = AppState.currentLength;
        this.updateLengthDisplay();
        this.updateModeSelector();
        this.updateScaleSelector();

        // Update overview toggle button state and container visibility
        const overviewToggle = document.getElementById('overviewToggle');
        if (overviewToggle) {
            overviewToggle.classList.toggle('active', this.showTrackOverview);
        }
        const trackOverviewContainer = document.getElementById('trackOverviewContainer');
        if (trackOverviewContainer) {
            trackOverviewContainer.classList.toggle('visible', this.showTrackOverview);
        }

        // Switch to editor tab if TabManager is available
        if (typeof TabManager !== 'undefined') {
            TabManager.setClipSelected(true);
            TabManager.switchTab('editor');
        } else {
            // Fallback to overlay mode
            document.getElementById('clipEditorOverlay').classList.add('active');
        }

        this.initializeEditor();
        this.renderTrackButtons();
        this.renderPianoKeys();
        this.renderPianoGrid();

        // Render track overview if visible
        if (this.showTrackOverview) {
            this.renderTrackOverviewLabels();
        }
    },

    // Close clip editor (switch back to song tab)
    close: function() {
        // Update all clip visuals for the current scene
        for (let t = 0; t < AppState.numTracks; t++) {
            SongScreen.updateClipVisual(AppState.currentScene, t);
        }
        // Clear selection when closing
        this.selectedNotes.clear();

        // Switch to song tab if TabManager is available
        if (typeof TabManager !== 'undefined') {
            TabManager.switchTab('song');
        } else {
            // Fallback to overlay mode
            document.getElementById('clipEditorOverlay').classList.remove('active');
        }
    },

    // Set tool mode
    setMode: function(mode) {
        const previousMode = this.currentMode;
        this.currentMode = mode;
        this.selectionRect = null;

        // Update toolbar UI
        document.getElementById('pencilTool').classList.toggle('active', mode === this.MODE_PENCIL);
        document.getElementById('selectTool').classList.toggle('active', mode === this.MODE_SELECT);
        document.getElementById('automationTool').classList.toggle('active', mode === this.MODE_AUTOMATION);

        // Toggle view visibility
        const trackOverviewContainer = document.getElementById('trackOverviewContainer');
        const pianoRollContainer = document.getElementById('pianoRollContainer');
        const automationView = document.getElementById('automationView');
        const automationNotePreview = document.querySelector('.automation-note-preview');

        if (mode === this.MODE_AUTOMATION) {
            // Hide overview and piano roll, show automation view
            if (trackOverviewContainer) trackOverviewContainer.classList.remove('visible');
            if (pianoRollContainer) pianoRollContainer.style.display = 'none';
            if (automationView) automationView.style.display = 'flex';
            // Hide the separate note preview (notes are now in the main canvas)
            if (automationNotePreview) automationNotePreview.style.display = 'none';
            // Initialize and render automation view
            this.initializeAutomationView();
            this.renderAutomationBars();
            this.updateAutomationStepInfo();
        } else {
            // Show overview and piano roll, hide automation view
            if (trackOverviewContainer && this.showTrackOverview) {
                trackOverviewContainer.classList.add('visible');
                // Re-render track overview when coming back from automation mode
                this.renderTrackOverviewCanvas();
                this.renderTrackOverviewLabels();
            }
            if (pianoRollContainer) pianoRollContainer.style.display = 'flex';
            if (automationView) automationView.style.display = 'none';

            // Update cursor and help text
            if (mode === this.MODE_SELECT) {
                if (this.gridCanvas) this.gridCanvas.style.cursor = 'crosshair';
                document.getElementById('stepInfo').textContent = 'Select: Drag area to select | Drag selected notes to move | Del to delete';
            } else {
                document.getElementById('stepInfo').textContent = 'Pencil: Click to add | Drag to move | Drag edge to resize | Right-click to delete';
            }

            this.renderPianoGrid();
        }
    },

    // Get total track overview height
    getTrackOverviewHeight: function() {
        return AppState.numTracks * this.TRACK_OVERVIEW_HEIGHT;
    },

    // Track overview canvas references
    trackOverviewCanvas: null,
    trackOverviewCtx: null,
    scrollSyncAttached: false,

    // Initialize editor canvases
    initializeEditor: function() {
        this.keysCanvas = document.getElementById('pianoKeysCanvas');
        this.gridCanvas = document.getElementById('pianoGridCanvas');
        this.trackOverviewCanvas = document.getElementById('trackOverviewCanvas');

        this.keysCtx = this.keysCanvas.getContext('2d');
        this.gridCtx = this.gridCanvas.getContext('2d');
        this.trackOverviewCtx = this.trackOverviewCanvas.getContext('2d');

        // Set canvas sizes (with zoom applied to width)
        const gridHeight = this.getPianoRollHeight(AppState.currentTrack);
        const zoomedStepWidth = AppState.STEP_WIDTH * this.pianoRollZoom;
        const gridWidth = AppState.currentLength * zoomedStepWidth;

        this.keysCanvas.width = AppState.PIANO_KEY_WIDTH;
        this.keysCanvas.height = gridHeight;

        this.gridCanvas.width = gridWidth;
        this.gridCanvas.height = gridHeight;

        // Set track overview canvas size
        this.trackOverviewCanvas.width = gridWidth;
        this.trackOverviewCanvas.height = this.getTrackOverviewHeight();

        // Setup scroll synchronization
        this.setupScrollSync();

        // Only attach listeners once
        if (!this.listenersAttached) {
            // Create bound handlers
            this.boundMouseDown = this.handleMouseDown.bind(this);
            this.boundMouseMove = this.handleMouseMove.bind(this);
            this.boundMouseUp = this.handleMouseUp.bind(this);
            this.boundContextMenu = this.handleContextMenu.bind(this);
            this.boundPianoRollWheel = this.handlePianoRollWheel.bind(this);

            // Add event listeners for drawing notes
            this.gridCanvas.addEventListener('mousedown', this.boundMouseDown);
            this.gridCanvas.addEventListener('mousemove', this.boundMouseMove);
            this.gridCanvas.addEventListener('mouseup', this.boundMouseUp);
            this.gridCanvas.addEventListener('mouseleave', this.boundMouseUp);
            this.gridCanvas.addEventListener('contextmenu', this.boundContextMenu);
            this.gridCanvas.addEventListener('wheel', this.boundPianoRollWheel, { passive: false });

            this.listenersAttached = true;
        }
    },

    // Handle mouse wheel for piano roll zoom/scroll
    handlePianoRollWheel: function(e) {
        // Ctrl + wheel = zoom
        if (e.ctrlKey) {
            e.preventDefault();

            const zoomSpeed = 0.1;
            const oldZoom = this.pianoRollZoom;

            if (e.deltaY < 0) {
                // Zoom in
                this.pianoRollZoom = Math.min(this.pianoRollMaxZoom, this.pianoRollZoom + zoomSpeed);
            } else {
                // Zoom out
                this.pianoRollZoom = Math.max(this.pianoRollMinZoom, this.pianoRollZoom - zoomSpeed);
            }

            if (oldZoom !== this.pianoRollZoom) {
                this.initializeEditor();
                this.renderPianoKeys();
                this.renderPianoGrid();
                this.updatePianoRollStepInfo();
            }
            return;
        }

        // Shift + wheel = horizontal scroll
        if (e.shiftKey) {
            e.preventDefault();
            const wrapper = document.querySelector('.piano-roll-scroll');
            if (wrapper) {
                wrapper.scrollLeft += e.deltaY > 0 ? 50 : -50;
            }
        }
    },

    // Update step info with zoom level
    updatePianoRollStepInfo: function() {
        const zoomPercent = Math.round(this.pianoRollZoom * 100);
        if (this.currentMode === this.MODE_PENCIL) {
            document.getElementById('stepInfo').textContent =
                `Pencil: Click to add | Drag to move | Right-click to delete | Ctrl+Wheel: zoom (${zoomPercent}%)`;
        } else if (this.currentMode === this.MODE_SELECT) {
            document.getElementById('stepInfo').textContent =
                `Select: Drag to select | Move selected notes | Del to delete | Ctrl+Wheel: zoom (${zoomPercent}%)`;
        }
    },

    // Update editor info display (scene, track, instrument)
    updateEditorInfo: function() {
        const scene = AppState.currentScene;
        const track = AppState.currentTrack;
        let info = `${AppState.getSceneName(scene)} - ${AppState.getTrackName(track)}`;

        // Add instrument name if one is assigned
        if (typeof InstrumentSelector !== 'undefined') {
            const instrument = InstrumentSelector.getTrackInstrument(track);
            if (instrument && instrument.name) {
                info += ` | ${instrument.name}`;
            }
        }

        const editorInfoEl = document.getElementById('editorInfo');
        if (editorInfoEl) {
            editorInfoEl.textContent = info;
        }
    },

    // Update length display
    updateLengthDisplay: function() {
        const bars = AppState.currentLength / 16;
        document.getElementById('barsDisplay').textContent = bars;
    },

    // Render piano keys
    renderPianoKeys: function() {
        const ctx = this.keysCtx;
        const canvas = this.keysCanvas;
        const isPercussion = this.isPercussionTrack(AppState.currentTrack);
        const trackScale = this.getTrackScale(AppState.currentTrack);
        const hideNonScaleNotes = trackScale.hideNotesNotInScale && !isPercussion;

        // Get visible pitches
        const visiblePitches = hideNonScaleNotes ? this.getVisiblePitches(AppState.currentTrack) : null;
        const totalHeight = hideNonScaleNotes ? visiblePitches.length * AppState.NOTE_HEIGHT : AppState.TOTAL_NOTES * AppState.NOTE_HEIGHT;

        // Update canvas height if needed
        if (canvas.height !== totalHeight) {
            canvas.height = totalHeight;
        }

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let rowIndex = 0;
        for (let i = 0; i < AppState.TOTAL_NOTES; i++) {
            const pitch = AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - i);

            // Skip non-visible pitches when hiding
            if (hideNonScaleNotes && !this.isPitchVisible(pitch, AppState.currentTrack)) {
                continue;
            }

            const y = rowIndex * AppState.NOTE_HEIGHT;
            const isBlack = AppState.isBlackKey(pitch);
            rowIndex++;

            if (isPercussion) {
                // Percussion mode - show drum names, no scale highlighting
                const hasDrumName = this.DRUM_NAMES[pitch] !== undefined;

                // Key background - highlight rows with drum names
                if (hasDrumName) {
                    ctx.fillStyle = '#3a3a3a';
                } else {
                    ctx.fillStyle = '#2a2a2a';
                }
                ctx.fillRect(0, y, AppState.PIANO_KEY_WIDTH - 1, AppState.NOTE_HEIGHT - 1);

                // Key label - show drum name or MIDI note
                ctx.fillStyle = hasDrumName ? '#ddd' : '#666';
                ctx.font = hasDrumName ? '9px sans-serif' : '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const label = this.getDrumName(pitch);
                ctx.fillText(label, AppState.PIANO_KEY_WIDTH - 5, y + AppState.NOTE_HEIGHT / 2);

                // Highlight common drum sounds with left marker
                if ([36, 38, 42, 46, 49].includes(pitch)) { // Kick, Snare, Closed HH, Open HH, Crash
                    ctx.fillStyle = '#d5a865';
                    ctx.fillRect(0, y + 1, 3, AppState.NOTE_HEIGHT - 3);
                }
            } else {
                // Melody mode - show note names with scale highlighting
                const inScale = this.isPitchInScale(pitch, AppState.currentTrack);

                // Key background - reddish tint if out of scale (only when not hiding)
                if (!hideNonScaleNotes && !inScale) {
                    ctx.fillStyle = isBlack ? '#3d2525' : '#4a3030';
                } else {
                    ctx.fillStyle = isBlack ? '#333' : '#444';
                }
                ctx.fillRect(0, y, AppState.PIANO_KEY_WIDTH - 1, AppState.NOTE_HEIGHT - 1);

                // Key label - dimmer and reddish if out of scale (only when not hiding)
                if (!hideNonScaleNotes && !inScale) {
                    ctx.fillStyle = '#805050';
                } else {
                    ctx.fillStyle = isBlack ? '#bbb' : '#ddd';
                }
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(AppState.getNoteName(pitch), AppState.PIANO_KEY_WIDTH - 5, y + AppState.NOTE_HEIGHT / 2);

                // Get track scale for root note highlighting
                const isRootNote = trackScale.scale !== 'none' && pitch % 12 === trackScale.root;

                // Highlight C notes with left marker
                if (pitch % 12 === 0) {
                    ctx.fillStyle = (!hideNonScaleNotes && !inScale) ? '#665530' : '#d5a865';
                    ctx.fillRect(0, y + 1, 3, AppState.NOTE_HEIGHT - 3);
                }

                // Highlight root note of selected scale with a left marker (wider than C marker)
                if (isRootNote) {
                    ctx.fillStyle = '#d5a865';
                    ctx.fillRect(0, y + 1, 5, AppState.NOTE_HEIGHT - 3);
                }
            }
        }
    },

    // Get zoomed step width
    getZoomedStepWidth: function() {
        return AppState.STEP_WIDTH * this.pianoRollZoom;
    },

    // Render piano grid
    renderPianoGrid: function() {
        const ctx = this.gridCtx;
        const stepWidth = this.getZoomedStepWidth();
        const isPercussion = this.isPercussionTrack(AppState.currentTrack);
        const trackScale = this.getTrackScale(AppState.currentTrack);
        const hideNonScaleNotes = trackScale.hideNotesNotInScale && !isPercussion;

        // Calculate and update canvas height based on visible notes
        const totalHeight = this.getPianoRollHeight(AppState.currentTrack);
        if (this.gridCanvas.height !== totalHeight) {
            this.gridCanvas.height = totalHeight;
        }

        const width = this.gridCanvas.width;
        const height = this.gridCanvas.height;

        // Reset canvas state to ensure clean rendering
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Draw rows (notes)
        let rowIndex = 0;
        for (let i = 0; i < AppState.TOTAL_NOTES; i++) {
            const pitch = AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - i);

            // Skip non-visible pitches when hiding
            if (hideNonScaleNotes && !this.isPitchVisible(pitch, AppState.currentTrack)) {
                continue;
            }

            const y = rowIndex * AppState.NOTE_HEIGHT;
            const isBlack = AppState.isBlackKey(pitch);
            rowIndex++;

            if (isPercussion) {
                // Percussion mode - highlight rows with drum names
                const hasDrumName = this.DRUM_NAMES[pitch] !== undefined;
                ctx.fillStyle = hasDrumName ? '#282828' : '#1a1a1a';
                ctx.fillRect(0, y, width, AppState.NOTE_HEIGHT);

                // Row border
                ctx.strokeStyle = hasDrumName ? '#3a3a3a' : '#2a2a2a';
                ctx.beginPath();
                ctx.moveTo(0, y + AppState.NOTE_HEIGHT);
                ctx.lineTo(width, y + AppState.NOTE_HEIGHT);
                ctx.stroke();
            } else {
                // Melody mode - scale highlighting
                const inScale = this.isPitchInScale(pitch, AppState.currentTrack);

                // Row background - reddish tint if out of scale (only when not hiding)
                if (!hideNonScaleNotes && !inScale) {
                    ctx.fillStyle = isBlack ? '#261818' : '#2d1f1f';
                } else {
                    ctx.fillStyle = isBlack ? '#1f1f1f' : '#252525';
                }
                ctx.fillRect(0, y, width, AppState.NOTE_HEIGHT);

                // Row border
                ctx.strokeStyle = (!hideNonScaleNotes && !inScale) ? '#3d2828' : '#333';
                ctx.beginPath();
                ctx.moveTo(0, y + AppState.NOTE_HEIGHT);
                ctx.lineTo(width, y + AppState.NOTE_HEIGHT);
                ctx.stroke();
            }
        }

        // Draw columns (steps) - per row for scale-aware coloring
        for (let step = 0; step <= AppState.currentLength; step++) {
            const x = step * stepWidth;

            // Determine base line style
            let isBeatLine = step % 4 === 0;
            let isBarLine = step % 16 === 0;
            let lineWidth = isBarLine ? 2 : 1;
            ctx.lineWidth = lineWidth;

            // Draw vertical line segments per row
            let colRowIndex = 0;
            for (let i = 0; i < AppState.TOTAL_NOTES; i++) {
                const pitch = AppState.BASE_NOTE + (AppState.TOTAL_NOTES - 1 - i);

                // Skip non-visible pitches when hiding
                if (hideNonScaleNotes && !this.isPitchVisible(pitch, AppState.currentTrack)) {
                    continue;
                }

                const y = colRowIndex * AppState.NOTE_HEIGHT;
                colRowIndex++;

                if (isPercussion) {
                    // Percussion mode - simpler coloring
                    const hasDrumName = this.DRUM_NAMES[pitch] !== undefined;
                    if (isBarLine) {
                        ctx.strokeStyle = hasDrumName ? '#555' : '#444';
                    } else if (isBeatLine) {
                        ctx.strokeStyle = hasDrumName ? '#444' : '#333';
                    } else {
                        ctx.strokeStyle = hasDrumName ? '#333' : '#282828';
                    }
                } else {
                    // Melody mode - scale-aware coloring
                    const inScale = this.isPitchInScale(pitch, AppState.currentTrack);

                    // Brighter lines for in-scale rows, dimmer for out-of-scale (when not hiding)
                    if (!hideNonScaleNotes && !inScale) {
                        // Dimmer lines for out-of-scale rows
                        if (isBarLine) {
                            ctx.strokeStyle = '#3d2828';
                        } else if (isBeatLine) {
                            ctx.strokeStyle = '#332222';
                        } else {
                            ctx.strokeStyle = '#2a2020';
                        }
                    } else {
                        // Normal/bright lines for in-scale rows
                        if (isBarLine) {
                            ctx.strokeStyle = '#666';
                        } else if (isBeatLine) {
                            ctx.strokeStyle = '#4a4a4a';
                        } else {
                            ctx.strokeStyle = '#383838';
                        }
                    }
                }

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + AppState.NOTE_HEIGHT);
                ctx.stroke();
            }
        }

        // Draw bar numbers
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        for (let bar = 0; bar < AppState.currentLength / 16; bar++) {
            ctx.fillText(`${bar + 1}`, bar * 16 * stepWidth + 4, 12);
        }

        // Draw ghost notes from selected tracks (before current track notes)
        this.ghostTracks.forEach(trackIndex => {
            if (trackIndex !== AppState.currentTrack) {
                const ghostClip = AppState.clips[AppState.currentScene][trackIndex];
                if (ghostClip && ghostClip.notes.length > 0) {
                    this.drawGhostNotes(ghostClip.notes, trackIndex);
                }
            }
        });

        // Draw notes for current track (using track color)
        const currentTrackColor = this.getTrackColor(AppState.currentTrack);
        this.drawNotes(AppState.clips[AppState.currentScene][AppState.currentTrack].notes, currentTrackColor, true);

        // Also render the track overview canvas if visible
        if (this.showTrackOverview) {
            this.renderTrackOverviewCanvas();
        }

        // Draw playhead if playing (per-track cycling)
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isPlaying && AudioBridge.playbackStartTime) {
            ctx.save();
            // Calculate elapsed steps from start time
            const elapsed = (performance.now() - AudioBridge.playbackStartTime) / 1000;
            const elapsedSteps = elapsed / AudioBridge.playbackSecondsPerStep;

            // Use current clip's length for cycling
            const clipLength = AppState.currentLength || 64;
            const trackPlayheadStep = elapsedSteps % clipLength;
            const playheadX = trackPlayheadStep * stepWidth;

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();
            ctx.restore();
        }
    },

    // Draw ghost notes (semi-transparent notes from other tracks)
    drawGhostNotes: function(notes, trackIndex) {
        const ctx = this.gridCtx;
        const stepWidth = this.getZoomedStepWidth();
        const ghostColor = this.getGhostColor(trackIndex);
        const ghostBorderColor = this.getGhostBorderColor(trackIndex);

        notes.forEach(note => {
            // Get y position (returns -1 if note is hidden)
            const y = this.getPitchY(note.pitch, AppState.currentTrack);
            if (y === -1) return; // Skip notes on hidden pitches

            const x = note.start * stepWidth;
            const width = note.duration * stepWidth;

            // Ghost note body (semi-transparent track color)
            ctx.fillStyle = ghostColor;
            ctx.beginPath();
            ctx.roundRect(x + 1, y + 1, width - 2, AppState.NOTE_HEIGHT - 2, 3);
            ctx.fill();

            // Ghost note border
            ctx.strokeStyle = ghostBorderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x + 1, y + 1, width - 2, AppState.NOTE_HEIGHT - 2, 3);
            ctx.stroke();

            // Track indicator label (using slightly more visible version of track color)
            ctx.fillStyle = ghostBorderColor;
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`T${trackIndex + 1}`, x + 3, y + 10);
        });
    },

    // Draw notes on the grid
    drawNotes: function(notes, color, isCurrentTrack = false) {
        const ctx = this.gridCtx;
        const stepWidth = this.getZoomedStepWidth();

        notes.forEach(note => {
            // Get y position (returns -1 if note is hidden)
            const y = this.getPitchY(note.pitch, AppState.currentTrack);
            if (y === -1) return; // Skip notes on hidden pitches

            const x = note.start * stepWidth;
            const width = note.duration * stepWidth;

            // Check if note is selected
            const isSelected = this.selectedNotes.has(note);
            const noteColor = isSelected ? this.SELECTED_NOTE_COLOR : color;

            // Note body
            ctx.fillStyle = noteColor;
            ctx.beginPath();
            ctx.roundRect(x + 1, y + 1, width - 2, AppState.NOTE_HEIGHT - 2, 3);
            ctx.fill();

            // Note highlight
            if (isCurrentTrack) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                ctx.roundRect(x + 1, y + 1, width - 2, (AppState.NOTE_HEIGHT - 2) / 2, [3, 3, 0, 0]);
                ctx.fill();

                // Resize handle at the end of the note (only in pencil mode)
                if (this.currentMode === this.MODE_PENCIL) {
                    const handleX = x + width - this.RESIZE_HANDLE_WIDTH;
                    ctx.fillStyle = isSelected ? '#2a8a6b' : '#8a6b2a';
                    ctx.beginPath();
                    ctx.roundRect(handleX, y + 2, this.RESIZE_HANDLE_WIDTH - 1, AppState.NOTE_HEIGHT - 4, [0, 2, 2, 0]);
                    ctx.fill();

                    // Handle grip lines
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.lineWidth = 1;
                    const gripX = handleX + (this.RESIZE_HANDLE_WIDTH - 1) / 2;
                    ctx.beginPath();
                    ctx.moveTo(gripX - 1, y + 5);
                    ctx.lineTo(gripX - 1, y + AppState.NOTE_HEIGHT - 5);
                    ctx.moveTo(gripX + 1, y + 5);
                    ctx.lineTo(gripX + 1, y + AppState.NOTE_HEIGHT - 5);
                    ctx.stroke();
                }

                // Selection indicator border
                if (isSelected) {
                    ctx.strokeStyle = '#00e5ff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(x + 1, y + 1, width - 2, AppState.NOTE_HEIGHT - 2, 3);
                    ctx.stroke();
                }
            }
        });

        // Draw selection rectangle if active
        if (this.selectionRect) {
            const rect = this.selectionRect;
            const rx = Math.min(rect.startX, rect.endX);
            const ry = Math.min(rect.startY, rect.endY);
            const rw = Math.abs(rect.endX - rect.startX);
            const rh = Math.abs(rect.endY - rect.startY);

            ctx.strokeStyle = '#65b8d5';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(101, 184, 213, 0.1)';
            ctx.fillRect(rx, ry, rw, rh);
        }
    },

    // Render track buttons
    renderTrackButtons: function() {
        const container = document.getElementById('trackButtons');

        // Preserve the play-all and stop-all buttons
        const playAllBtn = document.getElementById('playAllTracksBtn');
        const stopAllBtn = document.getElementById('stopAllTracksBtn');
        container.innerHTML = '';
        if (playAllBtn) {
            container.appendChild(playAllBtn);
        }
        if (stopAllBtn) {
            container.appendChild(stopAllBtn);
        }

        for (let t = 0; t < AppState.numTracks; t++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'track-btn-group';

            // Ghost eye button (disabled for current track to keep layout stable)
            const ghostBtn = document.createElement('button');
            ghostBtn.className = 'track-ghost-btn' + (this.ghostTracks.has(t) ? ' active' : '');
            ghostBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            if (t === AppState.currentTrack) {
                ghostBtn.disabled = true;
                ghostBtn.title = 'Current track';
            } else {
                ghostBtn.title = 'Toggle ghost notes';
                ghostBtn.addEventListener('click', () => {
                    if (this.ghostTracks.has(t)) {
                        this.ghostTracks.delete(t);
                    } else {
                        this.ghostTracks.add(t);
                    }
                    this.renderTrackButtons();
                    this.renderPianoGrid();
                });
            }
            wrapper.appendChild(ghostBtn);

            const btn = document.createElement('button');
            btn.className = 'track-btn';
            if (t === AppState.currentTrack) btn.classList.add('active');
            if (AppState.clips[AppState.currentScene][t].notes.length > 0) btn.classList.add('has-notes');

            // Add color indicator
            const colorDot = document.createElement('span');
            colorDot.className = 'track-color-dot';
            colorDot.style.backgroundColor = this.getTrackColor(t);
            btn.appendChild(colorDot);
            btn.appendChild(document.createTextNode(AppState.getTrackName(t)));

            btn.addEventListener('click', () => {
                AppState.currentTrack = t;
                AppState.currentLength = AppState.clips[AppState.currentScene][AppState.currentTrack].length;

                // Clear selection when switching tracks
                this.selectedNotes.clear();

                document.getElementById('lengthSelect').value = AppState.currentLength;
                this.updateEditorInfo();
                this.updateLengthDisplay();
                this.updateModeSelector();
                this.updateScaleSelector();
                this.initializeEditor();
                this.renderTrackButtons();

                // Render appropriate view based on current mode
                if (this.currentMode === this.MODE_AUTOMATION) {
                    this.initializeAutomationView();
                    this.renderAutomationBars();
                } else {
                    this.renderPianoKeys();
                    this.renderPianoGrid();
                }
            });

            wrapper.appendChild(btn);
            container.appendChild(wrapper);
        }
    },

    // Old overview removed - now using track overview above piano roll
    renderOverview: function() {
        // No-op - old overview canvas removed
    },

    // Initialize automation view canvases
    initializeAutomationView: function() {
        this.automationNoteCanvas = document.getElementById('automationNoteCanvas');
        this.automationBarsCanvas = document.getElementById('automationBarsCanvas');

        this.automationNoteCtx = this.automationNoteCanvas.getContext('2d');
        this.automationBarsCtx = this.automationBarsCanvas.getContext('2d');

        // Reset zoom when opening
        this.automationZoom = 1.0;

        // Only attach listeners once
        if (!this.automationBarsListenersAttached) {
            this.automationBarsCanvas.addEventListener('mousedown', this.handleAutomationMouseDown.bind(this));
            this.automationBarsCanvas.addEventListener('mousemove', this.handleAutomationMouseMove.bind(this));
            this.automationBarsCanvas.addEventListener('mouseup', this.handleAutomationMouseUp.bind(this));
            this.automationBarsCanvas.addEventListener('mouseleave', this.handleAutomationMouseUp.bind(this));
            this.automationBarsCanvas.addEventListener('wheel', this.handleAutomationWheel.bind(this), { passive: false });
            this.automationBarsListenersAttached = true;
        }

        // Update VST parameters list for current track
        this.updateVstParametersList();

        // Request parameters from JUCE if we don't have them yet
        if (!this.trackPluginParams[AppState.currentTrack]) {
            if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                AudioBridge.getPluginParameters(AppState.currentTrack);
            }
        }
    },

    // Handle mouse wheel for automation zoom/scroll
    handleAutomationWheel: function(e) {
        e.preventDefault();

        // Shift + wheel = horizontal scroll
        if (e.shiftKey) {
            const wrapper = document.querySelector('.automation-bars-wrapper');
            if (wrapper) {
                const scrollSpeed = 50;
                wrapper.scrollLeft += e.deltaY > 0 ? scrollSpeed : -scrollSpeed;
            }
            return;
        }

        // Regular wheel = zoom
        const zoomSpeed = 0.1;
        const oldZoom = this.automationZoom;

        if (e.deltaY < 0) {
            // Zoom in
            this.automationZoom = Math.min(this.automationMaxZoom, this.automationZoom + zoomSpeed);
        } else {
            // Zoom out
            this.automationZoom = Math.max(this.automationMinZoom, this.automationZoom - zoomSpeed);
        }

        if (oldZoom !== this.automationZoom) {
            this.renderAutomationBars();
            this.updateAutomationStepInfo();
        }
    },

    // Update step info for automation mode
    updateAutomationStepInfo: function() {
        const zoomPercent = Math.round(this.automationZoom * 100);
        document.getElementById('stepInfo').textContent =
            `Automation: Drag bars to edit | Wheel: zoom (${zoomPercent}%) | Shift+Wheel: scroll`;
    },

    // Render automation bars with integrated note preview
    renderAutomationBars: function() {
        const canvas = this.automationBarsCanvas;
        const ctx = this.automationBarsCtx;
        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];

        const notePreviewHeight = this.AUTOMATION_NOTE_PREVIEW_HEIGHT;
        const barAreaHeight = this.AUTOMATION_BAR_AREA_HEIGHT;
        const totalHeight = notePreviewHeight + barAreaHeight;
        const baseStepWidth = AppState.STEP_WIDTH;
        const stepWidth = baseStepWidth * this.automationZoom;
        const barWidth = stepWidth - 4;

        const canvasWidth = AppState.currentLength * stepWidth;
        canvas.width = canvasWidth;
        canvas.height = totalHeight;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = totalHeight + 'px';

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // === Draw Note Preview Section (top) ===
        ctx.fillStyle = '#1f1f1f';
        ctx.fillRect(0, 0, canvas.width, notePreviewHeight);

        // Separator line
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, notePreviewHeight);
        ctx.lineTo(canvas.width, notePreviewHeight);
        ctx.stroke();

        // Draw bar lines in note preview
        for (let step = 0; step <= AppState.currentLength; step++) {
            if (step % 16 === 0) {
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(step * stepWidth, 0);
                ctx.lineTo(step * stepWidth, notePreviewHeight);
                ctx.stroke();

                // Bar number
                if (step < AppState.currentLength) {
                    ctx.fillStyle = '#555';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(`${step / 16 + 1}`, step * stepWidth + 2, 10);
                }
            } else if (step % 4 === 0) {
                ctx.strokeStyle = '#2a2a2a';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(step * stepWidth, 0);
                ctx.lineTo(step * stepWidth, notePreviewHeight);
                ctx.stroke();
            }
        }

        // Draw notes in preview (if any)
        if (clip.notes.length > 0) {
            // Find pitch range
            let minPitch = Infinity, maxPitch = -Infinity;
            clip.notes.forEach(note => {
                minPitch = Math.min(minPitch, note.pitch);
                maxPitch = Math.max(maxPitch, note.pitch);
            });

            const pitchRange = Math.max(12, maxPitch - minPitch + 4);
            const pitchMin = Math.max(AppState.BASE_NOTE, minPitch - 2);
            const noteAreaHeight = notePreviewHeight - 15;
            const pitchPerPixel = pitchRange / noteAreaHeight;

            const trackColor = this.getTrackColor(AppState.currentTrack);
            clip.notes.forEach(note => {
                const x = note.start * stepWidth;
                const width = note.duration * stepWidth;
                const y = notePreviewHeight - 5 - ((note.pitch - pitchMin) / pitchPerPixel);

                ctx.fillStyle = trackColor;
                ctx.fillRect(x + 1, y - 3, width - 2, 6);
            });
        }

        // === Draw Automation Bars Section (bottom) ===
        const barAreaTop = notePreviewHeight;
        const { min, max } = this.getAutomationRange(this.currentAutomationParam);
        const range = max - min;

        // Draw center line for pan/pitchBend
        if (this.currentAutomationParam === 'pan' || this.currentAutomationParam === 'pitchBend') {
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, barAreaTop + barAreaHeight / 2);
            ctx.lineTo(canvas.width, barAreaTop + barAreaHeight / 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Quarter guidelines
        for (let i = 0; i <= 4; i++) {
            const y = barAreaTop + (barAreaHeight / 4) * i;
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Bar lines (vertical)
        for (let step = 0; step <= AppState.currentLength; step++) {
            if (step % 16 === 0) {
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(step * stepWidth, barAreaTop);
                ctx.lineTo(step * stepWidth, totalHeight);
                ctx.stroke();
            } else if (step % 4 === 0) {
                ctx.strokeStyle = '#2a2a2a';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(step * stepWidth, barAreaTop);
                ctx.lineTo(step * stepWidth, totalHeight);
                ctx.stroke();
            }
        }

        // Draw bars for each note at its start position
        const param = this.currentAutomationParam;
        const defaultValue = this.getAutomationDefault(param);
        const trackColor = this.getTrackColor(AppState.currentTrack);
        const darkTrackColor = this.getDarkTrackColor(AppState.currentTrack);

        // Group notes by start step to handle chords
        const notesByStep = new Map();
        clip.notes.forEach(note => {
            if (!notesByStep.has(note.start)) {
                notesByStep.set(note.start, []);
            }
            notesByStep.get(note.start).push(note);
        });

        // Sort notes within each step by pitch (highest first) for consistent ordering
        notesByStep.forEach(notes => {
            notes.sort((a, b) => b.pitch - a.pitch);
        });

        // Store bar positions for hit testing
        this.automationBarPositions = [];

        // Draw bars for each step
        notesByStep.forEach((notesAtStep, step) => {
            const numNotes = notesAtStep.length;
            const stepStartX = step * stepWidth + 2;
            const availableWidth = stepWidth - 4;
            const singleBarWidth = Math.max(4, Math.floor(availableWidth / numNotes) - 1);

            notesAtStep.forEach((note, index) => {
                const value = note[param] !== undefined ? note[param] : defaultValue;
                const normalizedValue = (value - min) / range;
                const barDisplayHeight = normalizedValue * barAreaHeight;
                const x = stepStartX + index * (singleBarWidth + 1);
                const y = totalHeight - barDisplayHeight;

                // Store bar position for hit testing
                this.automationBarPositions.push({
                    note: note,
                    x: x,
                    width: singleBarWidth,
                    step: step
                });

                // Bar gradient (using track color)
                const gradient = ctx.createLinearGradient(0, y, 0, totalHeight);
                gradient.addColorStop(0, trackColor);
                gradient.addColorStop(1, darkTrackColor);

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundRect(x, y, singleBarWidth, barDisplayHeight, [2, 2, 0, 0]);
                ctx.fill();

                // Value text on bar (only if bar is wide enough)
                if (barDisplayHeight > 20 && singleBarWidth >= 12) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(Math.round(value), x + singleBarWidth / 2, totalHeight - 5);
                }

                // Note indicator at top of bar
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x + singleBarWidth / 2, y + 3, 2, 0, Math.PI * 2);
                ctx.fill();

                // Draw connecting line from note to bar (using track's ghost color)
                const noteY = notePreviewHeight - 5;
                ctx.strokeStyle = this.getGhostColor(AppState.currentTrack);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + singleBarWidth / 2, noteY);
                ctx.lineTo(x + singleBarWidth / 2, y);
                ctx.stroke();
            });
        });
    },

    // Find note at X position for automation (handles chords)
    findAutomationNoteAtX: function(x) {
        if (!this.automationBarPositions || this.automationBarPositions.length === 0) return null;

        for (const bar of this.automationBarPositions) {
            if (x >= bar.x && x < bar.x + bar.width) {
                return bar.note;
            }
        }
        return null;
    },

    // Find note at step position for automation (legacy, finds first note)
    findNoteAtStep: function(step) {
        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
        return clip.notes.find(note => note.start === step);
    },

    // Constants for automation canvas layout
    AUTOMATION_NOTE_PREVIEW_HEIGHT: 100,
    AUTOMATION_BAR_AREA_HEIGHT: 300,

    // Currently dragged note for automation
    automationDragNote: null,

    // Handle automation bar mouse events
    handleAutomationMouseDown: function(e) {
        const rect = this.automationBarsCanvas.getBoundingClientRect();
        const scaleX = this.automationBarsCanvas.width / rect.width;
        const scaleY = this.automationBarsCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Only allow editing in the bar area (below note preview)
        if (y < this.AUTOMATION_NOTE_PREVIEW_HEIGHT) return;

        const note = this.findAutomationNoteAtX(x);

        if (note) {
            this.isDraggingAutomation = true;
            this.automationDragNote = note;
            this.updateAutomationValue(note, y);
        }
    },

    handleAutomationMouseMove: function(e) {
        const rect = this.automationBarsCanvas.getBoundingClientRect();
        const scaleX = this.automationBarsCanvas.width / rect.width;
        const scaleY = this.automationBarsCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (!this.isDraggingAutomation) {
            // Update cursor based on hover (only in bar area)
            if (y < this.AUTOMATION_NOTE_PREVIEW_HEIGHT) {
                this.automationBarsCanvas.style.cursor = 'default';
                return;
            }
            const note = this.findAutomationNoteAtX(x);
            this.automationBarsCanvas.style.cursor = note ? 'ns-resize' : 'default';
            return;
        }

        // Continue updating the same note we started dragging
        if (this.automationDragNote) {
            this.updateAutomationValue(this.automationDragNote, y);
        }
    },

    handleAutomationMouseUp: function(e) {
        this.isDraggingAutomation = false;
        this.automationDragNote = null;
    },

    updateAutomationValue: function(note, canvasY) {
        const notePreviewHeight = this.AUTOMATION_NOTE_PREVIEW_HEIGHT;
        const barAreaHeight = this.AUTOMATION_BAR_AREA_HEIGHT;
        const { min, max } = this.getAutomationRange(this.currentAutomationParam);

        // Convert Y position to value (relative to bar area, inverted - top is max)
        const barAreaY = canvasY - notePreviewHeight;
        const normalizedValue = 1 - (barAreaY / barAreaHeight);
        const clampedNormalized = Math.max(0, Math.min(1, normalizedValue));
        const value = Math.round(min + clampedNormalized * (max - min));

        note[this.currentAutomationParam] = value;
        this.renderAutomationBars();
    },

    // Set automation parameter
    setAutomationParam: function(param, paramType = 'midi') {
        this.currentAutomationParam = param;
        this.currentAutomationParamType = paramType;

        // Update UI
        document.querySelectorAll('.automation-param').forEach(el => {
            el.classList.toggle('active', el.dataset.param === param);
        });

        this.renderAutomationBars();
    },

    // Track plugin parameters per track
    trackPluginParams: {},

    // Handle plugin parameters received from JUCE
    onPluginParametersReceived: function(trackIndex, data) {
        console.log('[ClipEditor] Received plugin parameters for track', trackIndex, ':', data.parameters?.length);

        // Store parameters for this track
        this.trackPluginParams[trackIndex] = {
            pluginName: data.pluginName,
            nodeId: data.nodeId,
            parameters: data.parameters || []
        };

        // If this is the current track and automation view is visible, update UI
        if (trackIndex === AppState.currentTrack && this.currentMode === this.MODE_AUTOMATION) {
            this.updateVstParametersList();
        }
    },

    // Update VST parameters list in automation view
    updateVstParametersList: function() {
        const vstSection = document.getElementById('automationVstSection');
        const vstParams = document.getElementById('automationVstParams');
        const vstPluginName = document.getElementById('automationVstPluginName');

        if (!vstSection || !vstParams) return;

        const trackData = this.trackPluginParams[AppState.currentTrack];

        if (!trackData || !trackData.parameters || trackData.parameters.length === 0) {
            // Hide VST section if no parameters
            vstSection.style.display = 'none';
            return;
        }

        // Show VST section and set plugin name
        vstSection.style.display = 'block';
        if (vstPluginName) {
            vstPluginName.textContent = trackData.pluginName || 'Plugin';
        }

        // Build parameter list HTML
        let html = '';
        trackData.parameters.forEach(param => {
            const paramId = `vst_${param.index}`;
            const isActive = this.currentAutomationParam === paramId;
            html += `<div class="automation-param ${isActive ? 'active' : ''}"
                         data-param="${paramId}"
                         data-param-type="vst"
                         data-param-index="${param.index}"
                         title="${param.name}${param.label ? ' (' + param.label + ')' : ''}">
                        ${param.name}
                    </div>`;
        });

        vstParams.innerHTML = html;

        // Add click handlers
        vstParams.querySelectorAll('.automation-param').forEach(el => {
            el.addEventListener('click', () => {
                this.setAutomationParam(el.dataset.param, 'vst');
            });
        });
    },

    // Get automation value range based on parameter type
    getAutomationRange: function(param) {
        if (this.currentAutomationParamType === 'vst') {
            // VST parameters are normalized 0-1, we'll display as 0-127 for consistency
            return { min: 0, max: 127 };
        }
        return { min: 0, max: 127 };
    },

    // Get default value for automation parameter
    getAutomationDefault: function(param) {
        if (this.currentAutomationParamType === 'vst') {
            // Get default from stored parameter data
            const trackData = this.trackPluginParams[AppState.currentTrack];
            if (trackData && trackData.parameters) {
                const paramIndex = parseInt(param.replace('vst_', ''));
                const paramData = trackData.parameters.find(p => p.index === paramIndex);
                if (paramData) {
                    return Math.round(paramData.defaultValue * 127);
                }
            }
            return 64; // Default to center
        }

        switch (param) {
            case 'velocity': return 100;  // 0-127
            case 'pan': return 64;        // 0-127, 64 = center
            case 'pitchBend': return 64;  // 0-127, 64 = no bend
            case 'modulation': return 0;  // 0-127
            default: return 64;
        }
    },

    // Find note at position and determine if clicking on resize handle
    findNoteAtPosition: function(x, y, clip) {
        const stepWidth = this.getZoomedStepWidth();
        const step = Math.floor(x / stepWidth);
        const pitch = this.getPitchFromY(y, AppState.currentTrack);
        if (pitch === -1) return { note: null, isResizeHandle: false };

        for (let i = 0; i < clip.notes.length; i++) {
            const note = clip.notes[i];
            if (note.pitch === pitch && step >= note.start && step < note.start + note.duration) {
                // Check if clicking on resize handle
                const noteEndX = (note.start + note.duration) * stepWidth;
                const handleStartX = noteEndX - this.RESIZE_HANDLE_WIDTH;
                const isOnHandle = x >= handleStartX && x <= noteEndX;

                return { note, index: i, isOnHandle };
            }
        }
        return null;
    },

    // Get notes within a rectangle
    getNotesInRect: function(rect, clip) {
        const stepWidth = this.getZoomedStepWidth();
        const minX = Math.min(rect.startX, rect.endX);
        const maxX = Math.max(rect.startX, rect.endX);
        const minY = Math.min(rect.startY, rect.endY);
        const maxY = Math.max(rect.startY, rect.endY);
        const trackIndex = AppState.currentTrack;

        const notes = [];
        clip.notes.forEach(note => {
            const noteX = note.start * stepWidth;
            const noteY = this.getPitchY(note.pitch, trackIndex);
            if (noteY === -1) return; // Skip hidden notes
            const noteWidth = note.duration * stepWidth;
            const noteHeight = AppState.NOTE_HEIGHT;

            // Check if note intersects with selection rectangle
            if (noteX < maxX && noteX + noteWidth > minX &&
                noteY < maxY && noteY + noteHeight > minY) {
                notes.push(note);
            }
        });
        return notes;
    },

    // Mouse handlers for drawing notes
    handleMouseDown: function(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        const scaleX = this.gridCanvas.width / rect.width;
        const scaleY = this.gridCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const stepWidth = this.getZoomedStepWidth();
        const step = Math.floor(x / stepWidth);
        const pitch = this.getPitchFromY(y, AppState.currentTrack);
        if (pitch === -1) return; // Clicked on invalid area

        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
        const hitResult = this.findNoteAtPosition(x, y, clip);

        if (this.currentMode === this.MODE_SELECT) {
            // Selection mode
            if (hitResult) {
                if (this.selectedNotes.has(hitResult.note)) {
                    // Clicked on a selected note - start moving all selected notes
                    this.saveUndoState();
                    this.isMovingSelected = true;
                    this.moveStartStep = step;
                    this.moveStartPitch = pitch;
                    // Store starting positions of all selected notes
                    this.noteStartPositions = [];
                    this.selectedNotes.forEach(note => {
                        this.noteStartPositions.push({
                            note: note,
                            startStep: note.start,
                            startPitch: note.pitch
                        });
                    });
                } else {
                    // Clicked on unselected note - toggle selection
                    if (e.shiftKey) {
                        this.selectedNotes.add(hitResult.note);
                    } else {
                        this.selectedNotes.clear();
                        this.selectedNotes.add(hitResult.note);
                    }
                    this.renderPianoGrid();
                }
            } else {
                // Start drawing selection rectangle
                this.isSelecting = true;
                this.selectionStartX = x;
                this.selectionStartY = y;
                this.selectionRect = { startX: x, startY: y, endX: x, endY: y };
                // Clear previous selection unless shift is held
                if (!e.shiftKey) {
                    this.selectedNotes.clear();
                }
            }
        } else {
            // Pencil mode (original behavior)
            if (hitResult) {
                this.saveUndoState();
                if (hitResult.isOnHandle) {
                    // Start resizing
                    this.isResizing = true;
                    this.selectedNote = hitResult.note;
                } else {
                    // Start moving
                    this.isMoving = true;
                    this.selectedNote = hitResult.note;
                    this.moveOffsetStep = step - hitResult.note.start;
                    this.drawStartPitch = hitResult.note.pitch;
                }
            } else {
                // Start drawing new note
                this.saveUndoState();
                this.isDrawing = true;
                this.drawStartStep = step;
                this.drawStartPitch = pitch;
                this.currentDrawNote = { pitch, start: step, duration: 1 };
                clip.notes.push(this.currentDrawNote);
                this.renderPianoGrid();
            }
        }

        this.updateStepInfo(step, pitch);
    },

    handleMouseMove: function(e) {
        const rect = this.gridCanvas.getBoundingClientRect();
        const scaleX = this.gridCanvas.width / rect.width;
        const scaleY = this.gridCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const stepWidth = this.getZoomedStepWidth();
        const step = Math.floor(x / stepWidth);
        const pitch = this.getPitchFromY(y, AppState.currentTrack);

        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];

        if (this.currentMode === this.MODE_SELECT) {
            // Selection mode cursor
            const hitResult = this.findNoteAtPosition(x, y, clip);
            if (this.selectedNotes.has(hitResult?.note)) {
                this.gridCanvas.style.cursor = 'move';
            } else {
                this.gridCanvas.style.cursor = hitResult ? 'pointer' : 'crosshair';
            }

            if (this.isSelecting) {
                // Update selection rectangle
                this.selectionRect.endX = x;
                this.selectionRect.endY = y;
                this.renderPianoGrid();
            } else if (this.isMovingSelected) {
                // Move all selected notes
                const stepDelta = step - this.moveStartStep;
                const trackIndex = AppState.currentTrack;
                const trackScale = this.getTrackScale(trackIndex);

                let canMove = true;
                const newPitches = new Map();

                if (trackScale.hideNotesNotInScale) {
                    // Visible-pitch-aware movement: work in visible pitch indices
                    const visiblePitches = this.getVisiblePitches(trackIndex);
                    const startIdx = visiblePitches.indexOf(this.moveStartPitch);
                    const currentIdx = visiblePitches.indexOf(pitch);
                    if (startIdx === -1 || currentIdx === -1) { canMove = false; }
                    else {
                        const idxDelta = currentIdx - startIdx;
                        this.noteStartPositions.forEach(({ note, startStep, startPitch }) => {
                            const noteIdx = visiblePitches.indexOf(startPitch);
                            const newIdx = noteIdx + idxDelta;
                            const newStart = startStep + stepDelta;
                            if (noteIdx === -1 || newIdx < 0 || newIdx >= visiblePitches.length || newStart < 0) {
                                canMove = false;
                            } else {
                                newPitches.set(note, visiblePitches[newIdx]);
                            }
                        });
                    }
                } else {
                    // Standard movement: use raw pitch delta
                    const pitchDelta = pitch - this.moveStartPitch;
                    this.noteStartPositions.forEach(({ note, startStep, startPitch }) => {
                        const newStart = startStep + stepDelta;
                        const newPitch = startPitch + pitchDelta;
                        if (newStart < 0 ||
                            newPitch < AppState.BASE_NOTE ||
                            newPitch > AppState.BASE_NOTE + AppState.TOTAL_NOTES - 1) {
                            canMove = false;
                        }
                        newPitches.set(note, newPitch);
                    });
                }

                if (canMove) {
                    this.noteStartPositions.forEach(({ note, startStep }) => {
                        note.start = startStep + stepDelta;
                        note.pitch = newPitches.get(note);
                    });
                    this.renderPianoGrid();
                }
            }
        } else {
            // Pencil mode cursor and behavior
            const hitResult = this.findNoteAtPosition(x, y, clip);

            if (hitResult && hitResult.isOnHandle) {
                this.gridCanvas.style.cursor = 'ew-resize';
            } else if (hitResult) {
                this.gridCanvas.style.cursor = 'move';
            } else {
                this.gridCanvas.style.cursor = 'crosshair';
            }

            if (this.isDrawing && this.currentDrawNote) {
                // Extend note duration while drawing
                const newDuration = Math.max(1, step - this.drawStartStep + 1);
                if (newDuration !== this.currentDrawNote.duration && newDuration > 0) {
                    this.currentDrawNote.duration = newDuration;
                    this.renderPianoGrid();
                }
            } else if (this.isResizing && this.selectedNote) {
                // Resize note
                const newDuration = Math.max(1, step - this.selectedNote.start + 1);
                if (newDuration !== this.selectedNote.duration) {
                    this.selectedNote.duration = newDuration;
                    this.renderPianoGrid();
                }
            } else if (this.isMoving && this.selectedNote) {
                // Move note
                const newStart = Math.max(0, step - this.moveOffsetStep);
                const newPitch = pitch;

                // Clamp pitch to valid range
                const clampedPitch = Math.max(AppState.BASE_NOTE,
                    Math.min(AppState.BASE_NOTE + AppState.TOTAL_NOTES - 1, newPitch));

                if (newStart !== this.selectedNote.start || clampedPitch !== this.selectedNote.pitch) {
                    this.selectedNote.start = newStart;
                    this.selectedNote.pitch = clampedPitch;
                    this.renderPianoGrid();
                }
            }
        }

        this.updateStepInfo(step, pitch);
    },

    handleMouseUp: function(e) {
        if (this.currentMode === this.MODE_SELECT) {
            if (this.isSelecting) {
                // Finish selection rectangle
                const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
                const notesInRect = this.getNotesInRect(this.selectionRect, clip);

                // Add notes to selection (shift key adds, otherwise replace)
                notesInRect.forEach(note => {
                    this.selectedNotes.add(note);
                });

                this.isSelecting = false;
                this.selectionRect = null;
                this.renderPianoGrid();
            }

            if (this.isMovingSelected) {
                this.isMovingSelected = false;
                this.noteStartPositions = [];
                this.notifyLiveNoteUpdate();
            }
        }

        if (this.isDrawing) {
            this.isDrawing = false;
            this.currentDrawNote = null;
            this.notifyLiveNoteUpdate();
        }

        if (this.isResizing) {
            this.isResizing = false;
            this.selectedNote = null;
            this.notifyLiveNoteUpdate();
        }

        if (this.isMoving) {
            this.isMoving = false;
            this.selectedNote = null;
            this.notifyLiveNoteUpdate();
        }

        this.renderTrackButtons();
    },

    // Right-click to delete a note
    handleContextMenu: function(e) {
        e.preventDefault(); // Prevent browser context menu

        const rect = this.gridCanvas.getBoundingClientRect();
        const scaleX = this.gridCanvas.width / rect.width;
        const scaleY = this.gridCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
        const hitResult = this.findNoteAtPosition(x, y, clip);

        if (hitResult) {
            // Delete the note
            this.saveUndoState();
            clip.notes.splice(hitResult.index, 1);
            this.renderPianoGrid();
            this.renderTrackButtons();
            this.notifyLiveNoteUpdate();
        }
    },

    updateStepInfo: function(step, pitch) {
        const bar = Math.floor(step / 16) + 1;
        const beat = Math.floor((step % 16) / 4) + 1;
        const sixteenth = (step % 4) + 1;
        const noteName = AppState.getNoteName(pitch);
        document.getElementById('stepInfo').textContent =
            `Note: ${noteName} | Bar ${bar}, Beat ${beat}.${sixteenth} (Step ${step + 1})`;
    },

    // Undo/Redo - snapshot based
    saveUndoState: function() {
        const scene = AppState.currentScene;
        const track = AppState.currentTrack;
        const clip = AppState.clips[scene][track];
        this.undoStack.push({ scene, track, notes: clip.notes.map(n => ({...n})) });
        if (this.undoStack.length > this.maxUndoLevels) this.undoStack.shift();
        this.redoStack = [];
    },

    undo: function() {
        if (this.undoStack.length === 0) return;
        const state = this.undoStack.pop();
        const clip = AppState.clips[state.scene][state.track];
        this.redoStack.push({ scene: state.scene, track: state.track, notes: clip.notes.map(n => ({...n})) });
        clip.notes = state.notes;
        this.selectedNotes.clear();
        this.renderPianoGrid();
        this.renderTrackButtons();
        this.notifyLiveNoteUpdate();
    },

    redo: function() {
        if (this.redoStack.length === 0) return;
        const state = this.redoStack.pop();
        const clip = AppState.clips[state.scene][state.track];
        this.undoStack.push({ scene: state.scene, track: state.track, notes: clip.notes.map(n => ({...n})) });
        clip.notes = state.notes;
        this.selectedNotes.clear();
        this.renderPianoGrid();
        this.renderTrackButtons();
        this.notifyLiveNoteUpdate();
    },

    // Copy selected notes to clipboard
    copySelectedNotes: function() {
        if (this.selectedNotes.size === 0) return;
        this.noteClipboard = [];
        this.selectedNotes.forEach(note => {
            this.noteClipboard.push({ pitch: note.pitch, start: note.start, duration: note.duration });
        });
    },

    // Paste notes from clipboard (+1 pitch, +1 step offset), select the pasted notes
    pasteNotes: function() {
        if (this.noteClipboard.length === 0) return;

        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
        const clipLength = clip.length || AppState.currentLength;

        this.saveUndoState();
        this.selectedNotes.clear();

        const newNotes = [];
        for (const src of this.noteClipboard) {
            const n = { pitch: src.pitch + 1, start: src.start + 1, duration: src.duration };
            // Clamp to valid range
            if (n.pitch >= AppState.BASE_NOTE && n.pitch < AppState.BASE_NOTE + AppState.TOTAL_NOTES &&
                n.start >= 0 && n.start + n.duration <= clipLength) {
                clip.notes.push(n);
                newNotes.push(n);
            }
        }

        newNotes.forEach(n => this.selectedNotes.add(n));
        this.renderPianoGrid();
        this.renderTrackButtons();
        this.notifyLiveNoteUpdate();
    },

    // Duplicate selected notes, placing copies right after the end of the selection
    duplicateSelectedNotes: function() {
        if (this.selectedNotes.size === 0) return;

        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
        const clipLength = clip.length || AppState.currentLength;

        // Snapshot selected notes and find the time span
        const selected = [...this.selectedNotes];
        let minStart = Infinity;
        let maxEnd = -Infinity;
        for (const note of selected) {
            if (note.start < minStart) minStart = note.start;
            const end = note.start + note.duration;
            if (end > maxEnd) maxEnd = end;
        }

        const offset = maxEnd - minStart; // shift so duplicates start right after last selected note

        this.saveUndoState();
        this.selectedNotes.clear();

        const newNotes = [];
        for (const src of selected) {
            const n = { pitch: src.pitch, start: src.start + offset, duration: src.duration };
            if (n.start + n.duration <= clipLength) {
                clip.notes.push(n);
                newNotes.push(n);
            }
        }

        newNotes.forEach(n => this.selectedNotes.add(n));
        this.renderPianoGrid();
        this.renderTrackButtons();
        this.notifyLiveNoteUpdate();
    },

    // Clear current track
    clearCurrentTrack: function() {
        this.saveUndoState();
        AppState.clips[AppState.currentScene][AppState.currentTrack].notes = [];

        // Clear sample data for this clip
        if (typeof SampleEditor !== 'undefined') {
            SampleEditor.clearSample();
        }

        this.renderTrackButtons();

        // Render appropriate view based on current mode
        if (this.currentMode === this.MODE_AUTOMATION) {
            this.renderAutomationBars();
        } else {
            this.renderPianoGrid();
        }

        this.notifyLiveNoteUpdate();
    },

    // Send live note update to JUCE when notes are modified during playback
    notifyLiveNoteUpdate: function() {
        if (!AudioBridge.isPlaying) return;

        const scene = AppState.currentScene;
        const track = AppState.currentTrack;
        const clip = AppState.clips[scene][track];
        const trackSettings = AppState.getTrackSettings(track);

        // Only for MIDI tracks (not sample tracks)
        if (trackSettings.trackType === 'sample') return;

        const clipLength = clip.length || AppState.currentLength;
        const notesToSend = (clip.notes || [])
            .filter(note => note.start < clipLength)
            .map(note => ({
                ...note,
                duration: Math.min(note.duration, clipLength - note.start)
            }));

        AudioBridge.send('updateClip', {
            trackIndex: track,
            notes: notesToSend
        });
    },

    // Handle length change
    handleLengthChange: function(length) {
        AppState.currentLength = length;
        AppState.clips[AppState.currentScene][AppState.currentTrack].length = AppState.currentLength;
        this.updateLengthDisplay();
        this.initializeEditor();
        this.renderTrackButtons();

        // Check if we're in sample mode
        const isSampleMode = this.getTrackMode(AppState.currentTrack) === 'sample';

        if (isSampleMode) {
            // Re-render sample editor to reflect new clip length
            if (typeof SampleEditor !== 'undefined' && SampleEditor.isVisible) {
                SampleEditor.render();
            }
        } else if (this.currentMode === this.MODE_AUTOMATION) {
            this.initializeAutomationView();
            this.renderAutomationBars();
        } else {
            this.renderPianoKeys();
            this.renderPianoGrid();
        }
    },

    // Initialize event listeners
    init: function() {
        // Click outside to close (only in overlay mode)
        const overlay = document.getElementById('clipEditorOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.close();
                }
            });
        }

        // Length select
        document.getElementById('lengthSelect').addEventListener('change', (e) => {
            this.handleLengthChange(parseInt(e.target.value));
        });

        // Track settings button
        document.getElementById('trackSettingsBtn').addEventListener('click', () => {
            this.showTrackSettings(AppState.currentTrack);
        });

        // VST UI button
        document.getElementById('vstUiBtn').addEventListener('click', () => {
            if (typeof InstrumentSelector !== 'undefined') {
                InstrumentSelector.showVstUI();
            }
        });

        // Clear track button (with confirmation)
        document.getElementById('clearClipBtn').addEventListener('click', () => {
            if (confirm('Clear all notes from this track?')) {
                this.clearCurrentTrack();
            }
        });

        // Clear track button (with confirmation)
        document.getElementById('openWizard').addEventListener('click', () => {
                OpenImport((p, pitch, seq, slen, vel)=>{
                            this.CreateNote(AppState.currentTrack, pitch, seq, slen, vel)
                            },
                            ()=>{this.clearCurrentTrack()});
        });

        // Toolbar buttons
        document.getElementById('pencilTool').addEventListener('click', () => this.setMode(this.MODE_PENCIL));
        document.getElementById('selectTool').addEventListener('click', () => this.setMode(this.MODE_SELECT));
        document.getElementById('automationTool').addEventListener('click', () => {
            // Toggle automation mode
            if (this.currentMode === this.MODE_AUTOMATION) {
                this.setMode(this.MODE_PENCIL);
            } else {
                this.setMode(this.MODE_AUTOMATION);
            }
        });
        document.getElementById('overviewToggle').addEventListener('click', () => this.toggleTrackOverview());

        // Automation parameter selection
        document.querySelectorAll('.automation-param').forEach(el => {
            el.addEventListener('click', () => {
                this.setAutomationParam(el.dataset.param);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Check if editor is active (either via overlay or tab)
            const overlay = document.getElementById('clipEditorOverlay');
            const editorActive = (overlay && overlay.classList.contains('active')) ||
                                 (typeof TabManager !== 'undefined' && TabManager.getCurrentTab() === 'editor');

            // We use Tab style UI so we should not close on Escape.
            /*
            if (e.key === 'Escape' && editorActive) {
                // Don't close editor if track settings modal is open
                const trackSettingsModal = document.getElementById('trackSettingsModal');
                if (trackSettingsModal && trackSettingsModal.style.display !== 'none') {
                    return; // Let the track settings handler handle this
                }

                const ImportModal = document.getElementById('Import');
                if (ImportModal && ImportModal.style.display !== 'none') {
                    return; // Let the track settings handler handle this
                }

                this.close();
            }
            */

            // Tool shortcuts (only when editor is active and not typing in an input)
            if (editorActive && !e.target.matches('input, select, textarea')) {
                const isSampleMode = this.getTrackMode(AppState.currentTrack) === 'sample';

                // Piano tool shortcuts - disabled in sample mode
                if (!isSampleMode) {
                    if (e.key === 'n' || e.key === 'N') {
                        e.preventDefault();
                        this.setMode(this.MODE_PENCIL);
                        return;
                    } else if (e.key === 's' || e.key === 'S') {
                        e.preventDefault();
                        this.setMode(this.MODE_SELECT);
                        return;
                    } else if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this.setMode(this.MODE_AUTOMATION);
                        return;
                    }
                }

                if (e.key === 'o' || e.key === 'O') {
                    e.preventDefault();
                    this.toggleTrackOverview();
                } else if (e.key === 's' || e.key === 'S') {
                    e.preventDefault();
                    this.showTrackSettings(AppState.currentTrack);
                } else if (e.key === 'w' || e.key === 'W') {
                    // Cycle through track types: melody -> sample -> sampled_instrument -> melody
                    e.preventDefault();
                    const trackSettings = AppState.getTrackSettings(AppState.currentTrack);
                    const currentType = trackSettings.trackType || 'melody';
                    const modes = ['melody', 'sample', 'sampled_instrument'];
                    const currentIndex = modes.indexOf(currentType);
                    const nextMode = modes[(currentIndex + 1) % modes.length];
                    this.handleTrackTypeChange(nextMode);
                } else if (!isSampleMode && (e.key === 'Delete' || e.key === 'Backspace')) {
                    // Delete selected notes (not in sample mode)
                    if (this.selectedNotes.size > 0) {
                        e.preventDefault();
                        this.saveUndoState();
                        const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
                        this.selectedNotes.forEach(note => {
                            const index = clip.notes.indexOf(note);
                            if (index > -1) {
                                clip.notes.splice(index, 1);
                            }
                        });
                        this.selectedNotes.clear();
                        this.renderPianoGrid();
                        this.renderTrackButtons();
                        this.notifyLiveNoteUpdate();
                    }
                } else if (!isSampleMode && e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if (!isSampleMode && (e.ctrlKey || e.metaKey) &&
                           (e.key === 'r' || e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                    e.preventDefault();
                    this.redo();
                } else if (!isSampleMode && e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                    // Select all notes (not in sample mode)
                    e.preventDefault();
                    const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
                    clip.notes.forEach(note => this.selectedNotes.add(note));
                    this.renderPianoGrid();
                } else if (!isSampleMode && e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                    // Copy selected notes
                    e.preventDefault();
                    this.copySelectedNotes();
                } else if (!isSampleMode && e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                    // Paste notes
                    e.preventDefault();
                    this.pasteNotes();
                } else if (!isSampleMode && e.key === 'd' && (e.ctrlKey || e.metaKey)) {
                    // Duplicate selected notes
                    e.preventDefault();
                    this.duplicateSelectedNotes();
                } else if (!isSampleMode && this.selectedNotes.size > 0 &&
                           (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                            e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    const clip = AppState.clips[AppState.currentScene][AppState.currentTrack];
                    const clipLength = clip.length || AppState.currentLength;
                    const trackIndex = AppState.currentTrack;
                    const stepDelta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                    const direction = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
                    const isOctave = e.ctrlKey && direction !== 0;

                    // Find the next visible pitch in the given direction
                    const nextVisiblePitch = (fromPitch, dir, octave) => {
                        if (dir === 0) return fromPitch;
                        const target = octave ? fromPitch + dir * 12 : fromPitch + dir;
                        // If hiding non-scale notes, find nearest visible pitch in direction
                        if (!this.isPitchVisible(target, trackIndex)) {
                            let p = target;
                            const minPitch = AppState.BASE_NOTE;
                            const maxPitch = AppState.BASE_NOTE + AppState.TOTAL_NOTES - 1;
                            while (p >= minPitch && p <= maxPitch) {
                                if (this.isPitchVisible(p, trackIndex)) return p;
                                p += dir;
                            }
                            return -1; // No visible pitch found
                        }
                        return target;
                    };

                    // Calculate new pitches for all selected notes
                    let canMove = true;
                    const newPitches = new Map();
                    this.selectedNotes.forEach(note => {
                        const newPitch = nextVisiblePitch(note.pitch, direction, isOctave);
                        const newStart = note.start + stepDelta;
                        if (newPitch === -1 || newPitch < AppState.BASE_NOTE || newPitch >= AppState.BASE_NOTE + AppState.TOTAL_NOTES) canMove = false;
                        if (newStart < 0 || newStart + note.duration > clipLength) canMove = false;
                        newPitches.set(note, newPitch);
                    });

                    if (canMove) {
                        this.saveUndoState();
                        this.selectedNotes.forEach(note => {
                            note.pitch = newPitches.get(note);
                            note.start += stepDelta;
                        });
                        this.renderPianoGrid();
                        this.renderTrackButtons();
                        this.notifyLiveNoteUpdate();
                    }
                }
            }
        });
    },

    // Track settings modal state
    trackSettingsTrackIndex: 0,

    // Show track settings modal
    // Cache for sampler instrument list from JUCE
    samplerInstrumentList: null,

    showTrackSettings: function(trackIndex) {
        this.trackSettingsTrackIndex = trackIndex;

        const modal = document.getElementById('trackSettingsModal');
        const nameSpan = document.getElementById('trackSettingsName');
        const trackTypeSelect = document.getElementById('trackTypeSelect');
        const channelSelect = document.getElementById('trackMidiChannel');
        const instrumentSelect = document.getElementById('trackMidiInstrument');
        const trackPlaybackSelect = document.getElementById('trackPlaybackMode');
        const trackPlaybackRow = document.getElementById('trackPlaybackRow');
        const scaleRootSelect = document.getElementById('scaleRootSelect');
        const scaleTypeSelect = document.getElementById('scaleTypeSelect');
        const scaleSettingsRow = document.getElementById('scaleSettingsRow');
        const hideNotesCheckbox = document.getElementById('trackHideNotesNotInScale');
        
        const samplerInstrumentRow = document.getElementById('samplerInstrumentRow');
        const samplerInstrumentSelect = document.getElementById('samplerInstrumentSelect');
        const percussionCheckbox = document.getElementById('trackPercussionCheckbox');
        const percussionRow = document.getElementById('trackPercussionRow');

        if (!modal) return;

        // Populate instrument select if empty
        if (instrumentSelect.options.length === 0) {
            AppState.GM_INSTRUMENTS.forEach((name, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${index}: ${name}`;
                instrumentSelect.appendChild(option);
            });
        }

        // Get current clip settings (per-clip properties)
        const clip = AppState.getClip(AppState.currentScene, trackIndex);

        // Get current scale settings
        const scaleSettings = this.getTrackScale(trackIndex);

        // Determine track type from track settings
        const trackSettings = AppState.getTrackSettings(trackIndex);
        let trackMode = trackSettings.trackType || 'melody';

        // Populate fields from track settings and clip properties
        nameSpan.textContent = AppState.getTrackName(trackIndex);
        trackTypeSelect.value = trackMode;
        channelSelect.value = trackSettings.midiChannel || 0;
        instrumentSelect.value = trackSettings.midiProgram || 0;
        trackPlaybackSelect.value = clip.playMode || 'loop';
        scaleRootSelect.value = scaleSettings.root;
        scaleTypeSelect.value = scaleSettings.scale;
        hideNotesCheckbox.checked = scaleSettings.hideNotesNotInScale;

        // Populate percussion checkbox
        percussionCheckbox.checked = trackSettings.isPercussion || false;
        // Show percussion checkbox for melody and sampled_instrument, hide for sample
        const showPercussion = trackMode !== 'sample';
        percussionRow.style.display = showPercussion ? 'flex' : 'none';

        // Show/hide settings based on track type and percussion state
        const showScaleSettings = (trackMode === 'melody' || trackMode === 'sampled_instrument') && !percussionCheckbox.checked;
        scaleSettingsRow.style.display = showScaleSettings ? 'flex' : 'none';
        
        // Playback mode is available for all clip types
        trackPlaybackRow.style.display = 'flex';

        // Show/hide rows based on track type
        const isMelody = trackMode === 'melody';
        const isSamplerInstrument = trackMode === 'sampled_instrument';
        const isSample = trackMode === 'sample';
        samplerInstrumentRow.style.display = isSamplerInstrument ? 'flex' : 'none';
        const midiChannelRow = document.getElementById('midiChannelRow');
        if (midiChannelRow) midiChannelRow.style.display = isMelody ? 'flex' : 'none';

        // Show/hide VST instrument row (only for melody tracks)
        const vstInstrumentRow = document.getElementById('vstInstrumentRow');
        if (vstInstrumentRow) {
            vstInstrumentRow.style.display = isMelody ? 'flex' : 'none';
            if (isMelody && typeof InstrumentSelector !== 'undefined') {
                const vstListEl = document.getElementById('vstInstrumentList');
                const vstSearchEl = document.getElementById('vstInstrumentSearch');
                InstrumentSelector.loadAndRenderInline(trackIndex, vstListEl, vstSearchEl);
            }
        }

        // Wire "Show UI" button for inline VST
        const vstShowUiBtn = document.getElementById('vstShowUiInlineBtn');
        if (vstShowUiBtn && !vstShowUiBtn.hasAttribute('data-handler-attached')) {
            vstShowUiBtn.setAttribute('data-handler-attached', 'true');
            vstShowUiBtn.addEventListener('click', () => {
                if (typeof InstrumentSelector !== 'undefined') {
                    InstrumentSelector.showVstUI();
                }
            });
        }

        // Populate sampler instrument dropdown
        if (isSamplerInstrument) {
            this.populateSamplerInstrumentSelect(samplerInstrumentSelect, trackSettings.samplerInstrument);
        }

        // Show loading indicator if this track is currently loading
        const loadingIndicator = document.getElementById('samplerLoadingIndicator');
        if (loadingIndicator) {
            const isLoading = typeof AudioBridge !== 'undefined' && AudioBridge.samplerLoadingTracks.has(trackIndex);
            loadingIndicator.style.display = (isSamplerInstrument && isLoading) ? 'inline' : 'none';
            loadingIndicator.textContent = isLoading ? 'Loading...' : '';
        }

        // Show modal
        modal.style.display = 'flex';

        // Attach event handlers if not already attached
        if (!modal.hasAttribute('data-handlers-attached')) {
            modal.setAttribute('data-handlers-attached', 'true');

            // Close button
            document.getElementById('trackSettingsCloseBtn').addEventListener('click', () => {
                this.hideTrackSettings();
            });

            // Save button
            document.getElementById('trackSettingsSaveBtn').addEventListener('click', () => {
                this.saveTrackSettings();
            });

            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideTrackSettings();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display !== 'none') {
                    this.hideTrackSettings();
                }
            });

            // Toggle settings visibility when track type changes
            document.getElementById('trackTypeSelect').addEventListener('change', (e) => {
                const scaleSettingsRow = document.getElementById('scaleSettingsRow');
                const samplerInstrumentRow = document.getElementById('samplerInstrumentRow');
                const samplerInstrumentSelect = document.getElementById('samplerInstrumentSelect');
                const percussionRow = document.getElementById('trackPercussionRow');
                const trackType = e.target.value;
                const percCheckbox = document.getElementById('trackPercussionCheckbox');
                const showScaleSettings = (trackType === 'melody' || trackType === 'sampled_instrument') && !(percCheckbox && percCheckbox.checked);
                scaleSettingsRow.style.display = showScaleSettings ? 'flex' : 'none';
                
                // Show percussion checkbox for melody and sampled_instrument, hide for sample
                if (percussionRow) {
                    percussionRow.style.display = trackType !== 'sample' ? 'flex' : 'none';
                }

                const isMelody = trackType === 'melody';
                const isSamplerInstrument = trackType === 'sampled_instrument';
                samplerInstrumentRow.style.display = isSamplerInstrument ? 'flex' : 'none';
                const midiChannelRow = document.getElementById('midiChannelRow');
                if (midiChannelRow) midiChannelRow.style.display = isMelody ? 'flex' : 'none';

                // Toggle VST instrument row
                const vstInstrumentRow = document.getElementById('vstInstrumentRow');
                if (vstInstrumentRow) {
                    vstInstrumentRow.style.display = isMelody ? 'flex' : 'none';
                    if (isMelody && typeof InstrumentSelector !== 'undefined') {
                        const vstListEl = document.getElementById('vstInstrumentList');
                        const vstSearchEl = document.getElementById('vstInstrumentSearch');
                        InstrumentSelector.loadAndRenderInline(this.trackSettingsTrackIndex, vstListEl, vstSearchEl);
                    }
                }

                if (isSamplerInstrument) {
                    const trackSettings = AppState.getTrackSettings(this.trackSettingsTrackIndex);
                    this.populateSamplerInstrumentSelect(samplerInstrumentSelect, trackSettings.samplerInstrument);
                }
            });

            // Toggle scale settings visibility when percussion checkbox changes
            document.getElementById('trackPercussionCheckbox').addEventListener('change', (e) => {
                const trackType = document.getElementById('trackTypeSelect').value;
                const scaleSettingsRow = document.getElementById('scaleSettingsRow');
                const showScaleSettings = (trackType === 'melody' || trackType === 'sampled_instrument') && !e.target.checked;
                scaleSettingsRow.style.display = showScaleSettings ? 'flex' : 'none';
            });
        }
    },

    // Hide track settings modal
    hideTrackSettings: function() {
        const modal = document.getElementById('trackSettingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    // Populate the sampler instrument dropdown, fetching list from JUCE if needed
    populateSamplerInstrumentSelect: function(selectEl, currentValue) {
        const populate = (instruments) => {
            selectEl.innerHTML = '';
            instruments.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                // Display name: replace underscores with spaces, title-case
                option.textContent = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                selectEl.appendChild(option);
            });
            if (currentValue) {
                selectEl.value = currentValue;
            }
        };

        if (this.samplerInstrumentList) {
            populate(this.samplerInstrumentList);
        } else {
            fetch('api/samplerInstrumentList.json')
                .then(res => res.json())
                .then(data => {
                    this.samplerInstrumentList = data.instruments || [];
                    populate(this.samplerInstrumentList);
                })
                .catch(err => {
                    console.error('Failed to fetch sampler instrument list:', err);
                });
        }
    },

    // Update sampler loading indicator for a track
    updateSamplerLoadingState: function(trackIndex, isLoading) {
        const indicator = document.getElementById('samplerLoadingIndicator');
        if (!indicator) return;

        // Only show for the track currently displayed in track settings
        if (this.trackSettingsTrackIndex === trackIndex) {
            indicator.style.display = isLoading ? 'inline' : 'none';
            indicator.textContent = isLoading ? 'Loading...' : '';
        }
    },

    // Save track settings (track-level) and clip settings (clip-level)
    saveTrackSettings: function() {
        const trackTypeSelect = document.getElementById('trackTypeSelect');
        const channelSelect = document.getElementById('trackMidiChannel');
        const instrumentSelect = document.getElementById('trackMidiInstrument');
        const trackPlaybackSelect = document.getElementById('trackPlaybackMode');
        const scaleRootSelect = document.getElementById('scaleRootSelect');
        const scaleTypeSelect = document.getElementById('scaleTypeSelect');
        const hideNotesCheckbox = document.getElementById('trackHideNotesNotInScale');
        const percussionCheckbox = document.getElementById('trackPercussionCheckbox');

        const trackMode = trackTypeSelect.value;
        const samplerInstrumentSelect = document.getElementById('samplerInstrumentSelect');

        // Build track settings update
        const settingsUpdate = {
            trackType: trackMode,
            isPercussion: trackMode !== 'sample' ? percussionCheckbox.checked : false,
            midiChannel: parseInt(channelSelect.value, 10),
            midiProgram: parseInt(instrumentSelect.value, 10)
        };

        // If sampled_instrument, store the selected instrument name and send to JUCE
        if (trackMode === 'sampled_instrument' && samplerInstrumentSelect) {
            const instrumentName = samplerInstrumentSelect.value;
            settingsUpdate.samplerInstrument = instrumentName;

            if (instrumentName && typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                AudioBridge.send('setSamplerInstrument', {
                    trackIndex: this.trackSettingsTrackIndex,
                    instrumentName: instrumentName
                });
            }
        }

        // Update track settings (track-level)
        AppState.setTrackSettings(this.trackSettingsTrackIndex, settingsUpdate);

        // Get current clip and update clip-level properties
        const clip = AppState.getClip(AppState.currentScene, this.trackSettingsTrackIndex);
        clip.playMode = trackPlaybackSelect.value;

        // Save scale settings (for melody and sampled_instrument tracks)
        if (trackMode === 'melody' || trackMode === 'sampled_instrument') {
            const root = parseInt(scaleRootSelect.value, 10);
            const scale = scaleTypeSelect.value;
            const hideNotes = hideNotesCheckbox.checked;
            this.setTrackScale(this.trackSettingsTrackIndex, root, scale, hideNotes);
        }

        const trackSettings = AppState.getTrackSettings(this.trackSettingsTrackIndex);
        console.log('Track settings saved:', this.trackSettingsTrackIndex, {
            trackType: trackSettings.trackType,
            midiChannel: trackSettings.midiChannel,
            midiProgram: trackSettings.midiProgram,
            samplerInstrument: trackSettings.samplerInstrument,
            playMode: clip.playMode
        });

        // If editing current track, refresh the view
        if (this.trackSettingsTrackIndex === AppState.currentTrack) {
            this.updateModeSelector();
            // Only render piano roll if not in sample mode
            if (trackMode !== 'sample') {
                this.renderPianoKeys();
                this.renderPianoGrid();
            }
        }

        this.hideTrackSettings();
    },

    // Programmatically create a note and add it to the UI
    // track: track index (0-based)
    // pitch: MIDI pitch number (e.g., 60 = C4)
    // seq: start step position (0-based, in 1/16th notes)
    // slen: step length/duration (in 1/16th notes)
    // vel: velocity (0.0 to 1.0, default 0.8)
    CreateNote: function(track, pitch, seq, slen, vel = 0.8) {
        const scene = AppState.currentScene;

        // Ensure clip exists for the given scene and track
        if (!AppState.clips[scene]) {
            AppState.clips[scene] = [];
        }
        if (!AppState.clips[scene][track]) {
            AppState.clips[scene][track] = { notes: [], length: 64, playMode: 'loop', mute: false, quantize: 0 };
        }

        const clip = AppState.clips[scene][track];

        // Clamp velocity to valid range
        const clampedVel = Math.max(0, Math.min(1, vel));

        // Create the note object
        const note = {
            pitch: pitch,
            start: seq,
            duration: slen,
            velocity: clampedVel
        };

        // Add note to the clip
        clip.notes.push(note);

        // If we're currently editing this track, re-render the grid
        if (AppState.currentTrack === track) {
            this.renderPianoGrid();
        }

        // Update the clip visual in the song screen
        if (typeof SongScreen !== 'undefined' && SongScreen.updateClipVisual) {
            SongScreen.updateClipVisual(scene, track);
        }

        return note;
    }
};
