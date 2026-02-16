// Sample Editor - Waveform Display and Editing

const SampleEditor = {
    // Canvas and context
    canvas: null,
    ctx: null,

    // Audio data per track
    trackSamples: [], // Array of { audioBuffer, fileName, selection: {start, end} } per track

    // Current state
    isVisible: false,
    zoom: 1.0,
    scrollOffset: 0,

    // Selection state
    isSelecting: false,
    selectionStart: null,
    selectionEnd: null,

    // Clipboard for copy/paste
    clipboard: null,

    // Audio context for decoding
    audioContext: null,

    // Playback state
    isPlaying: false,

    // Waveform colors
    WAVEFORM_COLOR: '#d5a865',
    WAVEFORM_BG: '#1a1a1a',
    SELECTION_COLOR: 'rgba(101, 184, 213, 0.3)',
    SELECTION_BORDER: '#65b8d5',
    GRID_COLOR: '#2a2a2a',
    GRID_BEAT_COLOR: '#8b3a3a',      // Red beat lines
    GRID_BAR_COLOR: '#cc4444',        // Brighter red bar lines
    TRANSIENT_COLOR: '#00ccff',       // Cyan/blue transient lines

    // Encode AudioBuffer to WAV format (returns ArrayBuffer)
    encodeWAV: function(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        // Interleave channels
        const length = audioBuffer.length * numChannels * (bitDepth / 8);
        const buffer = new ArrayBuffer(44 + length);
        const view = new DataView(buffer);

        // Write WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // byte rate
        view.setUint16(32, numChannels * (bitDepth / 8), true); // block align
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < audioBuffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = channels[ch][i];
                // Clamp to [-1, 1]
                sample = Math.max(-1, Math.min(1, sample));
                // Convert to 16-bit integer
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }

        return buffer;
    },

    // Save edited audio to JUCE and update path
    // Uses sceneIndex to properly identify which clip's sample to save
    saveEditedAudio: async function(trackIndex, sceneIndex) {
        const scene = sceneIndex !== undefined ? sceneIndex : (AppState.currentScene || 0);
        const trackSample = this.getClipSample(scene, trackIndex);
        if (!trackSample || !trackSample.audioBuffer) {
            console.log('[SampleEditor] No audio buffer to save');
            return false;
        }

        // Only save if in JUCE mode
        if (typeof AudioBridge === 'undefined' || !AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Not in JUCE mode, skipping save');
            return false;
        }

        try {
            console.log('[SampleEditor] Encoding audio buffer to WAV...');
            const wavBuffer = this.encodeWAV(trackSample.audioBuffer);

            // Convert to base64 for sending
            const base64 = this.arrayBufferToBase64(wavBuffer);

            // Use the current fullPath to overwrite the file
            // If no fullPath exists, use the filename
            const targetPath = trackSample.fullPath || trackSample.fileName || 'sample.wav';

            console.log('[SampleEditor] Sending edited audio to JUCE, overwriting:', targetPath);

            // Send to JUCE with unique request ID to handle concurrent saves
            return new Promise((resolve) => {
                this.pendingSaveCallbacks = this.pendingSaveCallbacks || {};
                this.saveRequestIdCounter = this.saveRequestIdCounter || 0;
                const requestId = ++this.saveRequestIdCounter;
                const key = `${requestId}_${scene}_${trackIndex}`;

                this.pendingSaveCallbacks[key] = resolve;

                AudioBridge.send('saveEditedSample', {
                    trackIndex: trackIndex,
                    sceneIndex: scene,
                    requestId: requestId,
                    filePath: targetPath,
                    wavData: base64
                });

                // Timeout fallback
                setTimeout(() => {
                    if (this.pendingSaveCallbacks[key]) {
                        console.warn('[SampleEditor] Save timeout for request', requestId);
                        delete this.pendingSaveCallbacks[key];
                        resolve(false);
                    }
                }, 10000);
            });
        } catch (error) {
            console.error('[SampleEditor] Error saving edited audio:', error);
            return false;
        }
    },

    // Convert ArrayBuffer to base64
    arrayBufferToBase64: function(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    // Initialize sample editor
    init: function() {
        this.canvas = document.getElementById('sampleWaveformCanvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        // Attach event listeners
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // File input handler
        const fileInput = document.getElementById('sampleFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }

        // Tool button handlers
        this.attachToolHandlers();
    },

    // Attach tool button event handlers
    attachToolHandlers: function() {
        const tools = {
            'sampleLoadBtn': () => this.openFileBrowser(),
            'sampleRestoreBtn': () => this.restoreSample(),
            'sampleTrimBtn': () => this.trimToSelection(),
            'sampleCutBtn': () => this.cutSelection(),
            'sampleCopyBtn': () => this.copySelection(),
            'samplePasteBtn': () => this.pasteClipboard(),
            'sampleSilenceBtn': () => this.silenceSelection(),
            'sampleFadeInBtn': () => this.fadeIn(),
            'sampleFadeOutBtn': () => this.fadeOut(),
            'sampleWarpBtn': () => this.showWarpDialog(),
            'sampleOffsetLeftBtn': () => this.offsetSample(-0.01),
            'sampleOffsetRightBtn': () => this.offsetSample(0.01),
            'sampleStretchBtn': () => this.stretchSample(1.01),
            'sampleShrinkBtn': () => this.stretchSample(0.99),
            'sampleZoomInBtn': () => this.zoomIn(),
            'sampleZoomOutBtn': () => this.zoomOut(),
            'sampleZoomFitBtn': () => this.zoomFit()
        };

        for (const [id, handler] of Object.entries(tools)) {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', handler);
            }
        }
    },

    // Clip samples storage - keyed by "sceneIndex_trackIndex"
    clipSamples: {},

    // Get or initialize sample data for a specific clip (scene + track)
    getClipSample: function(sceneIndex, trackIndex) {
        const key = `${sceneIndex}_${trackIndex}`;
        if (!this.clipSamples[key]) {
            this.clipSamples[key] = {
                audioBuffer: null,       // For browser playback only
                fileName: null,
                fullPath: null,          // Path to file in project folder
                originalSourcePath: null, // Original source path before copying (for restore)
                selection: { start: 0, end: 0 },
                offset: 0,               // Offset in seconds (can be negative)
                detectedBPM: null,       // Detected or user-set BPM
                // C++ waveform data for display
                waveformPeaks: null,     // Array of [min, max] pairs from C++
                duration: 0,             // Duration in seconds from C++
                transients: [],          // Detected transient positions in seconds from C++
                // Edit state tracking
                hasUnsavedCppEdits: false // True if sample has been edited in C++ but not saved
            };
        }
        return this.clipSamples[key];
    },

    // Get sample for a track using current scene (backward compatibility)
    getTrackSample: function(trackIndex, sceneIndex) {
        const scene = sceneIndex !== undefined ? sceneIndex : (AppState.currentScene || 0);
        return this.getClipSample(scene, trackIndex);
    },

    // Generate waveform peaks from AudioBuffer for display in song grid
    // Returns array of [min, max] pairs
    generateWaveformPeaks: function(audioBuffer, numPoints = 100) {
        if (!audioBuffer) return [];

        const channelData = audioBuffer.getChannelData(0); // Use first channel
        const totalSamples = channelData.length;
        const samplesPerPoint = Math.floor(totalSamples / numPoints);
        const peaks = [];

        for (let i = 0; i < numPoints; i++) {
            const start = i * samplesPerPoint;
            const end = Math.min(start + samplesPerPoint, totalSamples);

            let min = 0, max = 0;
            for (let j = start; j < end; j++) {
                const sample = channelData[j];
                if (sample < min) min = sample;
                if (sample > max) max = sample;
            }
            peaks.push([min, max]);
        }

        return peaks;
    },

    // Update waveform peaks from audioBuffer (for use after loading samples)
    updateWaveformFromAudioBuffer: function(sceneIndex, trackIndex) {
        const clipSample = this.getClipSample(sceneIndex, trackIndex);
        if (clipSample && clipSample.audioBuffer) {
            clipSample.waveformPeaks = this.generateWaveformPeaks(clipSample.audioBuffer, 100);
            clipSample.duration = clipSample.audioBuffer.duration;
            console.log('[SampleEditor] Generated waveform peaks for scene', sceneIndex, 'track', trackIndex,
                        '- peaks:', clipSample.waveformPeaks.length, 'duration:', clipSample.duration);
        }
    },

    // Show sample editor
    show: function() {
        this.isVisible = true;
        const container = document.getElementById('sampleEditorContainer');
        if (container) {
            container.style.display = 'flex';
        }
        // Resize canvas after container is visible to get correct dimensions
        setTimeout(() => {
            this.resizeCanvas();
            this.render();
        }, 0);

        // Show sample toolbar
        const toolbar = document.getElementById('sampleToolbar');
        if (toolbar) {
            toolbar.style.display = 'flex';
        }

        // Hide piano roll
        const pianoContainer = document.querySelector('.piano-roll-container');
        if (pianoContainer) {
            pianoContainer.style.display = 'none';
        }

        // Load current clip's sample into C++ for high-quality waveform
        // This ensures C++ has the correct sample for this specific clip
        this.loadCurrentClipIntoC();

        // Delay resize to let DOM layout settle
        requestAnimationFrame(() => {
            this.resizeCanvas();
            this.render();
        });
    },

    // Load the current clip's sample into C++ for editing
    // This should be called when user navigates to a clip to ensure C++ has the correct sample
    loadCurrentClipIntoC: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);

        // Update file name display for current clip
        const fileNameDisplay = document.getElementById('sampleFileName');
        if (fileNameDisplay) {
            fileNameDisplay.textContent = trackSample?.fileName || 'No file loaded';
        }

        if (typeof AudioBridge === 'undefined' || !AudioBridge.isExternalMode()) {
            return;
        }

        if (!trackSample || !trackSample.fullPath) {
            console.log('[SampleEditor] No sample to load into C++ for current clip');
            return;
        }

        // If sample has unsaved edits in C++, DON'T reload from disk - it would discard the edits
        // Just request the current waveform data from C++ (which still has the edited buffer)
        if (trackSample.hasUnsavedCppEdits) {
            console.log('[SampleEditor] Sample has unsaved C++ edits, skipping reload - track:', AppState.currentTrack);
            // Just request waveform from current C++ buffer
            setTimeout(() => {
                this.requestWaveformFromCpp(AppState.currentTrack);
            }, 50);
            return;
        }

        console.log('[SampleEditor] Loading current clip sample into C++ - track:', AppState.currentTrack,
                    'scene:', AppState.currentScene, 'path:', trackSample.fullPath);

        // Load sample for editing in C++
        AudioBridge.send('cppLoadForEditing', {
            trackIndex: AppState.currentTrack,
            filePath: trackSample.fullPath
        });

        // Request high-quality waveform data after a short delay
        setTimeout(() => {
            this.requestWaveformFromCpp(AppState.currentTrack);
        }, 100);
    },

    // Hide sample editor
    hide: function() {
        this.isVisible = false;

        // Stop any playing audio
        this.stop();

        const container = document.getElementById('sampleEditorContainer');
        if (container) {
            container.style.display = 'none';
        }

        // Hide sample toolbar
        const toolbar = document.getElementById('sampleToolbar');
        if (toolbar) {
            toolbar.style.display = 'none';
        }

        // Show piano roll
        const pianoContainer = document.querySelector('.piano-roll-container');
        if (pianoContainer) {
            pianoContainer.style.display = 'flex';
        }
    },

    // Resize canvas to fit container
    resizeCanvas: function() {
        if (!this.canvas) return;

        const wrapper = this.canvas.parentElement;
        const scrollContainer = wrapper ? wrapper.parentElement : null;
        if (!wrapper || !scrollContainer) return;

        const scrollRect = scrollContainer.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Base width is the scroll container width, zoomed width extends beyond
        const baseWidth = scrollRect.width;
        const zoomedWidth = baseWidth * this.zoom;
        const height = scrollRect.height;

        // Set wrapper width to enable horizontal scrolling when zoomed
        wrapper.style.width = zoomedWidth + 'px';

        // Set canvas dimensions (this resets the context)
        this.canvas.width = zoomedWidth * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = zoomedWidth + 'px';
        this.canvas.style.height = height + 'px';

        // Reset transform and scale for high DPI
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    },

    // Request waveform data from C++ for display
    requestWaveformFromCpp: function(trackIndex) {
        if (typeof AudioBridge === 'undefined' || !AudioBridge.isExternalMode()) {
            return;
        }

        // Calculate number of points based on canvas width
        const width = this.canvas ? Math.floor(this.canvas.width / (window.devicePixelRatio || 1)) : 800;
        const numPoints = Math.max(400, Math.min(2000, width));

        console.log('[SampleEditor] Requesting waveform from C++, track:', trackIndex, 'points:', numPoints);

        AudioBridge.send('cppGetWaveform', {
            trackIndex: trackIndex,
            numPoints: numPoints
        });
    },

    // Handle file selection
    handleFileSelect: function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Check if it's an audio file
        if (!file.type.startsWith('audio/')) {
            alert('Please select an audio file (WAV, MP3, etc.)');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(event.target.result);

                const trackSample = this.getTrackSample(AppState.currentTrack);
                trackSample.audioBuffer = audioBuffer;
                trackSample.fileName = file.name;
                trackSample.selection = { start: 0, end: 0 };
                trackSample.transients = [];  // Clear transients (no C++ detection available)
                trackSample.offset = 0;
                trackSample.detectedBPM = null;
                trackSample.stretchFactor = 1.0;

                this.zoom = 1.0;
                this.scrollOffset = 0;
                this.render();

                // Update file name display
                const fileNameDisplay = document.getElementById('sampleFileName');
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = file.name;
                }
            } catch (error) {
                console.error('Error decoding audio file:', error);
                alert('Error loading audio file. Please try a different file.');
            }
        };
        reader.readAsArrayBuffer(file);

        // Reset input so same file can be selected again
        e.target.value = '';
    },

    // Render waveform
    render: function() {
        if (!this.ctx || !this.canvas) return;

        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);

        // Clear canvas
        this.ctx.fillStyle = this.WAVEFORM_BG;
        this.ctx.fillRect(0, 0, width, height);

        // Draw timing grid
        this.drawGrid(width, height);

        const trackSample = this.getTrackSample(AppState.currentTrack);

        // Check if we have waveform data (from C++) or audioBuffer (browser mode)
        const hasWaveform = trackSample.waveformPeaks && trackSample.waveformPeaks.length > 0;
        const hasAudioBuffer = trackSample.audioBuffer;

        if (!hasWaveform && !hasAudioBuffer) {
            // Draw placeholder text
            this.ctx.fillStyle = '#666';
            this.ctx.font = '14px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('Click "Load" to import an audio file', width / 2, height / 2);
            return;
        }

        // Draw waveform - prefer C++ peaks data, fallback to audioBuffer
        if (hasWaveform) {
            this.drawWaveformFromPeaks(trackSample.waveformPeaks, width, height);
        } else if (hasAudioBuffer) {
            this.drawWaveform(trackSample.audioBuffer, width, height);
        }

        // Draw transient markers (wrapped in try-catch to prevent breaking render)
        try {
            this.drawTransients(trackSample, width, height);
        } catch (e) {
            console.error('[SampleEditor] Error drawing transients:', e);
        }

        // Draw selection
        if (trackSample.selection.start !== trackSample.selection.end) {
            this.drawSelection(trackSample, width, height);
        }

        // Draw playhead position indicator
        this.drawPlayhead(width, height);

        // Draw clip boundary indicator (shows where loop/clip ends based on length setting)
        this.drawClipBoundary(width, height);
    },

    // Draw clip boundary indicator to show where the clip ends based on length setting
    drawClipBoundary: function(width, height) {
        const ctx = this.ctx;
        const totalDuration = this.getTotalDuration();

        if (totalDuration <= 0) return;

        // Get clip length in steps and calculate duration in seconds
        const clip = AppState.clips[AppState.currentScene]?.[AppState.currentTrack];
        const clipLengthSteps = clip?.length || AppState.currentLength || 64;
        const clipDurationSeconds = this.getClipDuration();
        const sampleDuration = this.getSampleDuration();

        if (sampleDuration <= 0) return;

        // Calculate x positions
        const pixelsPerSecond = width / totalDuration;
        const clipBoundaryX = clipDurationSeconds * pixelsPerSecond;
        const sampleEndX = sampleDuration * pixelsPerSecond;

        if (sampleDuration > clipDurationSeconds) {
            // Sample is longer than clip - shade beyond clip boundary (existing behavior)
            if (clipBoundaryX > 0 && clipBoundaryX <= width) {
                // Draw clip boundary line
                ctx.strokeStyle = '#d5a865';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(clipBoundaryX, 0);
                ctx.lineTo(clipBoundaryX, height);
                ctx.stroke();
                ctx.setLineDash([]);

                // Shade beyond clip
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(clipBoundaryX, 0, width - clipBoundaryX, height);

                // Label
                ctx.fillStyle = '#d5a865';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                const bars = clipLengthSteps / 16;
                ctx.fillText(bars + (bars === 1 ? ' bar' : ' bars'), clipBoundaryX, 12);
            }
        } else if (clipDurationSeconds > sampleDuration) {
            // Clip is longer than sample - shade the silence padding area
            if (sampleEndX > 0 && sampleEndX < width) {
                // Shade silence padding area with a subtle pattern
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(sampleEndX, 0, width - sampleEndX, height);

                // Draw dashed line at sample end
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(sampleEndX, 0);
                ctx.lineTo(sampleEndX, height);
                ctx.stroke();
                ctx.setLineDash([]);

                // Label for silence padding
                ctx.fillStyle = '#888';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                const padX = sampleEndX + (width - sampleEndX) / 2;
                ctx.fillText('silence', padX, height / 2 + 4);
            }
        }
    },

    // Draw timing grid
    drawGrid: function(width, height) {
        const ctx = this.ctx;

        // Calculate grid spacing based on tempo
        const bpm = AppState.tempo || 120;
        const secondsPerBeat = 60 / bpm;
        const duration = this.getTotalDuration();
        const pixelsPerSecond = width / duration;

        if (pixelsPerSecond <= 0 || !isFinite(pixelsPerSecond)) {
            // No sample loaded, draw default grid
            const stepWidth = width / 64;
            for (let i = 0; i <= 64; i++) {
                const x = i * stepWidth;
                if (i % 16 === 0) {
                    ctx.strokeStyle = this.GRID_BAR_COLOR;
                    ctx.lineWidth = 2;
                } else if (i % 4 === 0) {
                    ctx.strokeStyle = this.GRID_BEAT_COLOR;
                    ctx.lineWidth = 1;
                } else {
                    ctx.strokeStyle = this.GRID_COLOR;
                    ctx.lineWidth = 1;
                }
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            return;
        }

        const pixelsPerBeat = secondsPerBeat * pixelsPerSecond;

        // Draw beat lines across full width
        let beat = 0;
        let x = 0;
        while (x <= width) {
            if (beat % 4 === 0) {
                ctx.strokeStyle = this.GRID_BAR_COLOR;
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = this.GRID_BEAT_COLOR;
                ctx.lineWidth = 1;
            }
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            x += pixelsPerBeat;
            beat++;
        }

        // Draw center line
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    },

    // Get the raw sample duration (without clip length consideration)
    getSampleDuration: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        if (trackSample.duration > 0) {
            return trackSample.duration;
        }
        if (trackSample.audioBuffer) {
            return trackSample.audioBuffer.duration;
        }
        return 0;
    },

    // Get clip duration in seconds based on lengthSelect
    getClipDuration: function() {
        const clip = AppState.clips[AppState.currentScene]?.[AppState.currentTrack];
        const clipLengthSteps = clip?.length || AppState.currentLength || 64;
        const tempo = AppState.tempo || 120;
        const secondsPerStep = 60 / tempo / 4;  // 1/16th note duration
        return clipLengthSteps * secondsPerStep;
    },

    // Get total duration for display - max of sample and clip duration
    getTotalDuration: function() {
        const sampleDuration = this.getSampleDuration();
        if (sampleDuration <= 0) return 4; // Default 4 seconds if no sample

        const clipDuration = this.getClipDuration();
        return Math.max(sampleDuration, clipDuration);
    },

    // Draw waveform from audioBuffer (browser mode fallback)
    drawWaveform: function(audioBuffer, width, height) {
        const ctx = this.ctx;
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const channelData = audioBuffer.getChannelData(0); // Use first channel
        const totalSamples = channelData.length;
        const totalDuration = this.getTotalDuration();
        const sampleDuration = this.getSampleDuration() || totalDuration;

        // Scale waveform to sample portion of the display width
        const sampleWidth = (sampleDuration / totalDuration) * width;

        // Samples per pixel for the sample portion
        const samplesPerPixel = Math.ceil(totalSamples / sampleWidth);

        // Calculate offset in pixels
        const offsetPixels = (trackSample.offset / totalDuration) * width;

        ctx.fillStyle = this.WAVEFORM_COLOR;

        const centerY = height / 2;

        for (let x = 0; x < width; x++) {
            // Adjust x position by offset
            const adjustedX = x - offsetPixels;
            const sampleIndex = Math.floor((adjustedX / sampleWidth) * totalSamples);
            if (sampleIndex < 0 || sampleIndex >= totalSamples) continue;

            // Find min and max in this pixel's sample range
            let min = 0, max = 0;
            for (let i = 0; i < samplesPerPixel && sampleIndex + i < totalSamples; i++) {
                const sample = channelData[sampleIndex + i];
                if (sample < min) min = sample;
                if (sample > max) max = sample;
            }

            const minY = centerY + min * (height / 2) * 0.9;
            const maxY = centerY + max * (height / 2) * 0.9;

            ctx.fillRect(x, maxY, 1, minY - maxY || 1);
        }
    },

    // Draw waveform from C++ peaks data
    drawWaveformFromPeaks: function(peaks, width, height) {
        const ctx = this.ctx;
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const totalDuration = this.getTotalDuration();
        const sampleDuration = trackSample.duration || this.getSampleDuration() || totalDuration;

        // Scale waveform to sample portion of the display width
        const sampleWidth = (sampleDuration / totalDuration) * width;

        // Calculate offset in pixels
        const offsetPixels = (trackSample.offset / totalDuration) * width;

        ctx.fillStyle = this.WAVEFORM_COLOR;

        const centerY = height / 2;
        const numPeaks = peaks.length;

        // Scale peaks to sample portion of canvas width
        const peaksPerPixel = numPeaks / sampleWidth;

        for (let x = 0; x < width; x++) {
            // Adjust x position by offset
            const adjustedX = x - offsetPixels;
            const peakIndex = Math.floor(adjustedX * peaksPerPixel);

            if (peakIndex < 0 || peakIndex >= numPeaks) continue;

            const [min, max] = peaks[peakIndex];

            const minY = centerY + min * (height / 2) * 0.9;
            const maxY = centerY + max * (height / 2) * 0.9;

            ctx.fillRect(x, maxY, 1, minY - maxY || 1);
        }
    },

    // Draw selection overlay
    drawSelection: function(trackSample, width, height) {
        const ctx = this.ctx;
        const duration = this.getTotalDuration();

        const startX = (trackSample.selection.start / duration) * width;
        const endX = (trackSample.selection.end / duration) * width;

        // Selection fill
        ctx.fillStyle = this.SELECTION_COLOR;
        ctx.fillRect(startX, 0, endX - startX, height);

        // Selection borders
        ctx.strokeStyle = this.SELECTION_BORDER;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();
    },

    // Draw transient markers
    drawTransients: function(trackSample, width, height) {
        if (!trackSample) return;

        const ctx = this.ctx;
        const transients = trackSample.transients;

        if (!transients || !Array.isArray(transients) || transients.length === 0) return;

        const duration = this.getTotalDuration();
        const offset = trackSample.offset || 0;

        // Save context state to isolate line dash changes
        ctx.save();

        ctx.strokeStyle = this.TRANSIENT_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); // Dashed line for transients

        for (const transientTime of transients) {
            // Transients come from C++ already scaled to current buffer
            // Just adjust for sample offset
            const adjustedTime = transientTime + offset;

            // Skip if outside visible range
            if (adjustedTime < 0 || adjustedTime > duration) continue;

            const x = (adjustedTime / duration) * width;

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Restore context state
        ctx.restore();
    },

    // Draw playhead
    drawPlayhead: function(width, height) {
        const ctx = this.ctx;

        // Get playhead position from AudioBridge (in steps/16th notes)
        if (typeof AudioBridge === 'undefined') {
            return; // AudioBridge not available
        }

        // Only draw playhead when actively playing
        if (!AudioBridge.isPlaying) {
            return;
        }

        const playheadStep = AudioBridge.playheadStep;
        if (playheadStep < 0) {
            return;
        }

        const bpm = AppState.tempo || 120;

        // Convert steps to seconds (1 step = 1/16th note = 1/4 of a beat)
        const secondsPerStep = 60 / bpm / 4;
        const playheadSeconds = playheadStep * secondsPerStep;

        // Get sample duration and offset
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const sampleOffset = trackSample.offset || 0;
        const duration = this.getTotalDuration();

        // Calculate position within sample (accounting for offset)
        let positionInSample = playheadSeconds - sampleOffset;

        // Skip if before sample starts or after sample ends
        if (positionInSample < 0 || positionInSample > duration) {
            return;
        }

        // Convert to pixel position (canvas width already includes zoom)
        const playheadX = (positionInSample / duration) * width;

        // Draw playhead line with green color and glow (same as piano roll)
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
        ctx.restore();
    },

    // Convert pixel X to time
    pixelToTime: function(x) {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const duration = this.getTotalDuration();
        return (x / width) * duration;
    },

    // Mouse handlers
    handleMouseDown: function(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        this.isSelecting = true;
        this.selectionStart = this.pixelToTime(x);
        this.selectionEnd = this.selectionStart;

        const trackSample = this.getTrackSample(AppState.currentTrack);
        trackSample.selection.start = this.selectionStart;
        trackSample.selection.end = this.selectionEnd;
    },

    handleMouseMove: function(e) {
        if (!this.isSelecting) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        this.selectionEnd = this.pixelToTime(x);

        const trackSample = this.getTrackSample(AppState.currentTrack);
        trackSample.selection.start = Math.min(this.selectionStart, this.selectionEnd);
        trackSample.selection.end = Math.max(this.selectionStart, this.selectionEnd);

        this.render();
    },

    handleMouseUp: function(e) {
        this.isSelecting = false;
    },

    handleWheel: function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }
        // Let native scrollbar handle horizontal scrolling without Ctrl
    },

    // Zoom controls
    zoomIn: function() {
        this.zoom = Math.min(16, this.zoom * 1.5);
        this.resizeCanvas();
        this.render();
    },

    zoomOut: function() {
        this.zoom = Math.max(0.5, this.zoom / 1.5);
        this.resizeCanvas();
        this.render();
    },

    zoomFit: function() {
        this.zoom = 1.0;
        this.resizeCanvas();
        this.render();
    },

    // Selection helpers
    getSelectionData: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        if (!trackSample.audioBuffer) return null;

        const { start, end } = trackSample.selection;
        if (start === end) return null;

        const buffer = trackSample.audioBuffer;
        const sampleRate = buffer.sampleRate;
        const startSample = Math.floor(start * sampleRate);
        const endSample = Math.floor(end * sampleRate);
        const length = endSample - startSample;

        return { buffer, startSample, endSample, length, sampleRate };
    },

    // Create new audio buffer from selection
    createBufferFromSelection: function(selectionData) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const { buffer, startSample, length, sampleRate } = selectionData;
        const numChannels = buffer.numberOfChannels;

        const newBuffer = audioContext.createBuffer(numChannels, length, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                newData[i] = oldData[startSample + i];
            }
        }

        return newBuffer;
    },

    // Editing functions
    trimToSelection: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region to trim');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ trim, range:', start, '-', end);

            AudioBridge.send('cppTrim', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });

            // Clear selection and reset zoom after trim
            trackSample.selection = { start: 0, end: 0 };
            this.zoom = 1.0;
            this.scrollOffset = 0;
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region to trim');
            return;
        }

        const newBuffer = this.createBufferFromSelection(selectionData);
        trackSample.audioBuffer = newBuffer;
        trackSample.selection = { start: 0, end: 0 };

        this.zoom = 1.0;
        this.scrollOffset = 0;
        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    cutSelection: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region to cut');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ cut, range:', start, '-', end);

            AudioBridge.send('cppCut', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });

            // Clear selection after cut
            trackSample.selection = { start: 0, end: 0 };
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region to cut');
            return;
        }

        // Copy to clipboard first
        this.clipboard = this.createBufferFromSelection(selectionData);

        // Remove selection from buffer
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const { buffer, startSample, endSample, sampleRate } = selectionData;
        const numChannels = buffer.numberOfChannels;
        const newLength = buffer.length - (endSample - startSample);

        const newBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            // Copy before selection
            for (let i = 0; i < startSample; i++) {
                newData[i] = oldData[i];
            }
            // Copy after selection
            for (let i = endSample; i < buffer.length; i++) {
                newData[i - (endSample - startSample)] = oldData[i];
            }
        }

        trackSample.audioBuffer = newBuffer;
        trackSample.selection = { start: 0, end: 0 };

        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    copySelection: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region to copy');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ copy, range:', start, '-', end);

            AudioBridge.send('cppCopy', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region to copy');
            return;
        }

        this.clipboard = this.createBufferFromSelection(selectionData);
    },

    pasteClipboard: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            // Determine insert position: at selection start, or at end of sample
            const positionSeconds = trackSample.selection.start > 0
                ? trackSample.selection.start
                : (trackSample.duration || 0);

            console.log('[SampleEditor] Using C++ paste at position:', positionSeconds);

            AudioBridge.send('cppPaste', {
                trackIndex: AppState.currentTrack,
                positionSeconds: positionSeconds
            });

            // Clear selection after paste
            trackSample.selection = { start: 0, end: 0 };
            return;
        }

        // Fallback to JS implementation
        if (!this.clipboard) {
            alert('Nothing in clipboard to paste');
            return;
        }

        if (!trackSample.audioBuffer) {
            // If no audio, just use clipboard as the audio
            trackSample.audioBuffer = this.clipboard;
            this.render();
            this.saveEditedAudio(AppState.currentTrack);
            return;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = trackSample.audioBuffer;
        const clipBuffer = this.clipboard;
        const sampleRate = buffer.sampleRate;
        const numChannels = Math.min(buffer.numberOfChannels, clipBuffer.numberOfChannels);

        // Insert at selection start or at end if no selection
        const insertSample = trackSample.selection.start > 0
            ? Math.floor(trackSample.selection.start * sampleRate)
            : buffer.length;

        const newLength = buffer.length + clipBuffer.length;
        const newBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const clipData = clipBuffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            // Copy before insert point
            for (let i = 0; i < insertSample; i++) {
                newData[i] = oldData[i];
            }
            // Copy clipboard
            for (let i = 0; i < clipBuffer.length; i++) {
                newData[insertSample + i] = clipData[i];
            }
            // Copy after insert point
            for (let i = insertSample; i < buffer.length; i++) {
                newData[i + clipBuffer.length] = oldData[i];
            }
        }

        trackSample.audioBuffer = newBuffer;
        trackSample.selection = { start: 0, end: 0 };
        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    silenceSelection: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region to silence');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ silence, range:', start, '-', end);

            AudioBridge.send('cppSilence', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region to silence');
            return;
        }

        const buffer = trackSample.audioBuffer;
        const { startSample, endSample } = selectionData;

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = startSample; i < endSample; i++) {
                data[i] = 0;
            }
        }

        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    fadeIn: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region for fade in');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ fade in, range:', start, '-', end);

            AudioBridge.send('cppFadeIn', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region for fade in');
            return;
        }

        const buffer = trackSample.audioBuffer;
        const { startSample, endSample, length } = selectionData;

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const gain = i / length;
                data[startSample + i] *= gain;
            }
        }

        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    fadeOut: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const { start, end } = trackSample.selection;

        // Check if there's a valid selection
        if (start === end || start === undefined || end === undefined) {
            alert('Please select a region for fade out');
            return;
        }

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ fade out, range:', start, '-', end);

            AudioBridge.send('cppFadeOut', {
                trackIndex: AppState.currentTrack,
                startSeconds: start,
                endSeconds: end
            });
            return;
        }

        // Fallback to JS implementation
        const selectionData = this.getSelectionData();
        if (!selectionData) {
            alert('Please select a region for fade out');
            return;
        }

        const buffer = trackSample.audioBuffer;
        const { startSample, endSample, length } = selectionData;

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const gain = 1 - (i / length);
                data[startSample + i] *= gain;
            }
        }

        this.render();

        // Save edited audio to JUCE
        this.saveEditedAudio(AppState.currentTrack);
    },

    // Clear sample for current track
    clearSample: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        trackSample.audioBuffer = null;
        trackSample.fileName = null;
        trackSample.fullPath = null;
        trackSample.originalSourcePath = null;
        trackSample.selection = { start: 0, end: 0 };
        trackSample.offset = 0;
        trackSample.detectedBPM = null;
        trackSample.waveformPeaks = null;
        trackSample.duration = 0;
        trackSample.transients = [];
        trackSample.hasUnsavedCppEdits = false;

        const fileNameDisplay = document.getElementById('sampleFileName');
        if (fileNameDisplay) {
            fileNameDisplay.textContent = 'No file loaded';
        }

        this.render();
    },

    // Restore sample from original source (re-copy from original location)
    restoreSample: async function() {
        const trackIndex = AppState.currentTrack;
        const sceneIndex = AppState.currentScene || 0;
        const trackSample = this.getTrackSample(trackIndex);

        if (!trackSample.originalSourcePath) {
            alert('No original source available to restore from.');
            return;
        }

        console.log('[SampleEditor] Restoring sample from:', trackSample.originalSourcePath);

        // Re-load the sample from the original source
        // This will copy it again to the project folder, overwriting any edits
        try {
            const sourcePath = trackSample.originalSourcePath;

            // Request JUCE to re-copy the sample
            const actualPath = await this.requestSampleCopy(sourcePath, trackIndex, sceneIndex);

            // Load the restored audio
            const encodedPath = encodeURIComponent(actualPath);
            const response = await fetch(`/api/loadSample?path=${encodedPath}`);

            if (!response.ok) {
                console.error('Failed to load restored sample:', response.status);
                alert('Failed to restore sample file.');
                return;
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioContext = this.initAudioContext();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const fileName = actualPath.split(/[/\\]/).pop();

            trackSample.audioBuffer = audioBuffer;  // Keep for browser playback
            trackSample.fileName = fileName;
            trackSample.fullPath = actualPath;
            // Keep originalSourcePath the same
            trackSample.selection = { start: 0, end: 0 };
            trackSample.offset = 0;
            trackSample.detectedBPM = null;
            trackSample.waveformPeaks = null;
            trackSample.duration = 0;
            trackSample.transients = [];
            trackSample.hasUnsavedCppEdits = false;  // Restored to original, no edits

            this.zoom = 1.0;
            this.scrollOffset = 0;

            const fileNameDisplay = document.getElementById('sampleFileName');
            if (fileNameDisplay) {
                fileNameDisplay.textContent = fileName;
            }

            // Request waveform from C++ (includes transients)
            if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                AudioBridge.send('cppLoadForEditing', {
                    trackIndex: trackIndex,
                    filePath: actualPath
                });
                setTimeout(() => {
                    this.requestWaveformFromCpp(trackIndex);
                }, 100);
            }

            this.render();
            console.log('[SampleEditor] Sample restored successfully');
        } catch (error) {
            console.error('Error restoring sample:', error);
            alert('Error restoring sample: ' + (error.message || 'Unknown error'));
        }
    },

    // Detect BPM from audio buffer using peak detection
    detectBPM: function(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Downsample for faster processing
        const downsampleFactor = 4;
        const downsampled = [];
        for (let i = 0; i < channelData.length; i += downsampleFactor) {
            let sum = 0;
            for (let j = 0; j < downsampleFactor && i + j < channelData.length; j++) {
                sum += Math.abs(channelData[i + j]);
            }
            downsampled.push(sum / downsampleFactor);
        }

        const downsampledRate = sampleRate / downsampleFactor;

        // Find peaks (onset detection)
        const threshold = this.calculateThreshold(downsampled);
        const peaks = [];
        const minPeakDistance = Math.floor(downsampledRate * 0.1); // Min 100ms between peaks

        let lastPeakIndex = -minPeakDistance;
        for (let i = 1; i < downsampled.length - 1; i++) {
            if (downsampled[i] > threshold &&
                downsampled[i] > downsampled[i - 1] &&
                downsampled[i] > downsampled[i + 1] &&
                i - lastPeakIndex >= minPeakDistance) {
                peaks.push(i);
                lastPeakIndex = i;
            }
        }

        if (peaks.length < 2) {
            // Fallback: estimate from duration assuming 4 bars
            const duration = audioBuffer.duration;
            const assumedBars = 4;
            const beatsPerBar = 4;
            return Math.round((assumedBars * beatsPerBar * 60) / duration);
        }

        // Calculate intervals between peaks
        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
        }

        // Find most common interval (mode)
        const intervalCounts = {};
        intervals.forEach(interval => {
            // Group similar intervals (within 5%)
            const rounded = Math.round(interval / 10) * 10;
            intervalCounts[rounded] = (intervalCounts[rounded] || 0) + 1;
        });

        let mostCommonInterval = intervals[0];
        let maxCount = 0;
        for (const [interval, count] of Object.entries(intervalCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostCommonInterval = parseInt(interval);
            }
        }

        // Convert interval to BPM
        const secondsPerBeat = mostCommonInterval / downsampledRate;
        let bpm = Math.round(60 / secondsPerBeat);

        // Normalize to reasonable BPM range (60-180)
        while (bpm < 60) bpm *= 2;
        while (bpm > 180) bpm /= 2;

        return bpm;
    },

    // Calculate threshold for peak detection
    calculateThreshold: function(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const mean = sum / data.length;
        return mean * 1.5;
    },

    // Show warp dialog
    showWarpDialog: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        if (!trackSample.audioBuffer) {
            alert('Please load a sample first');
            return;
        }

        // Use C++ BPM detection when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ BPM detection');

            // First ensure sample is loaded for editing in C++
            if (trackSample.fullPath) {
                AudioBridge.send('cppLoadForEditing', {
                    trackIndex: AppState.currentTrack,
                    filePath: trackSample.fullPath
                });
            }

            // Request C++ BPM detection - result will come back via handleCppBPMResult
            AudioBridge.send('cppDetectBPM', {
                trackIndex: AppState.currentTrack
            });

            // Show the modal with current BPM (will be updated by callback)
            const modal = document.getElementById('warpModal');
            const bpmInput = document.getElementById('warpBpmInput');
            const projectBpmSpan = document.getElementById('warpProjectBpm');

            if (modal && bpmInput && projectBpmSpan) {
                bpmInput.value = trackSample.detectedBPM || 120;
                projectBpmSpan.textContent = AppState.tempo || 120;
                modal.style.display = 'flex';
                bpmInput.focus();
                bpmInput.select();
            }
            return;
        }

        // Fallback to JS implementation
        // Detect BPM if not already detected
        if (!trackSample.detectedBPM) {
            trackSample.detectedBPM = this.detectBPM(trackSample.audioBuffer);
        }

        // Store original buffer if not stored
        if (!trackSample.originalBuffer) {
            trackSample.originalBuffer = trackSample.audioBuffer;
        }

        // Show the modal
        const modal = document.getElementById('warpModal');
        const bpmInput = document.getElementById('warpBpmInput');
        const projectBpmSpan = document.getElementById('warpProjectBpm');

        if (modal && bpmInput && projectBpmSpan) {
            bpmInput.value = trackSample.detectedBPM;
            projectBpmSpan.textContent = AppState.tempo || 120;
            modal.style.display = 'flex';
            bpmInput.focus();
            bpmInput.select();
        }
    },

    // Hide warp dialog
    hideWarpDialog: function() {
        const modal = document.getElementById('warpModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    // Apply warp to match project BPM
    applyWarp: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const trackIndex = AppState.currentTrack;
        const bpmInput = document.getElementById('warpBpmInput');

        if (!bpmInput) {
            this.hideWarpDialog();
            return;
        }

        const sampleBPM = parseFloat(bpmInput.value);
        const projectBPM = AppState.tempo || 120;

        if (isNaN(sampleBPM) || sampleBPM <= 0) {
            alert('Please enter a valid BPM');
            return;
        }

        trackSample.detectedBPM = sampleBPM;
        this.hideWarpDialog();

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ warp, sampleBPM:', sampleBPM, 'targetBPM:', projectBPM);

            // Call C++ warp (pass 0 for targetLengthSeconds to just warp without padding/trimming)
            // Clip length is just a playback boundary, not a target for modifying the sample
            AudioBridge.send('cppApplyWarp', {
                trackIndex: trackIndex,
                sampleBPM: sampleBPM,
                targetBPM: projectBPM,
                targetLengthSeconds: 0
            });

            // Request updated waveform after a short delay
            setTimeout(() => {
                this.requestWaveformFromCpp(trackIndex);
            }, 50);
            return;
        }

        // Browser fallback - stretch local audioBuffer
        if (!trackSample.audioBuffer) return;

        const stretchRatio = sampleBPM / projectBPM;
        this.timeStretchBuffer(trackSample.audioBuffer, stretchRatio).then(newBuffer => {
            trackSample.audioBuffer = newBuffer;
            this.render();
        }).catch(err => {
            console.error('Warp failed:', err);
            alert('Failed to warp sample');
        });
    },

    // Time-stretch audio buffer
    timeStretchBuffer: function(buffer, ratio) {
        return new Promise((resolve, reject) => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const numChannels = buffer.numberOfChannels;
                const sampleRate = buffer.sampleRate;
                const oldLength = buffer.length;
                const newLength = Math.round(oldLength * ratio);

                const newBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);

                for (let channel = 0; channel < numChannels; channel++) {
                    const oldData = buffer.getChannelData(channel);
                    const newData = newBuffer.getChannelData(channel);

                    // Linear interpolation for time stretching
                    for (let i = 0; i < newLength; i++) {
                        const srcIndex = i / ratio;
                        const srcIndexFloor = Math.floor(srcIndex);
                        const srcIndexCeil = Math.min(srcIndexFloor + 1, oldLength - 1);
                        const frac = srcIndex - srcIndexFloor;

                        newData[i] = oldData[srcIndexFloor] * (1 - frac) + oldData[srcIndexCeil] * frac;
                    }
                }

                resolve(newBuffer);
            } catch (err) {
                reject(err);
            }
        });
    },

    // Offset sample left or right
    offsetSample: function(deltaSeconds) {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        if (!trackSample.audioBuffer) return;

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ offset, delta:', deltaSeconds);

            AudioBridge.send('cppOffsetSample', {
                trackIndex: AppState.currentTrack,
                deltaSeconds: deltaSeconds
            });
        }

        // Always update local state for UI
        trackSample.offset += deltaSeconds;
        this.render();
    },

    // Stretch or shrink sample by a factor
    stretchSample: function(factor) {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const trackIndex = AppState.currentTrack;

        // Check if we have a sample loaded
        if (!trackSample.fullPath && !trackSample.audioBuffer) return;

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ time stretch, factor:', factor);

            // Call C++ time stretch (pass 0 for targetLengthSeconds to just stretch without padding/trimming)
            // Clip length is just a playback boundary, not a target for modifying the sample
            AudioBridge.send('cppTimeStretch', {
                trackIndex: trackIndex,
                ratio: factor,
                targetLengthSeconds: 0
            });

            // Request updated waveform after a short delay
            setTimeout(() => {
                this.requestWaveformFromCpp(trackIndex);
            }, 50);
            return;
        }

        // Browser fallback - stretch local audioBuffer
        if (!trackSample.audioBuffer) return;

        this.timeStretchBuffer(trackSample.audioBuffer, factor).then(newBuffer => {
            trackSample.audioBuffer = newBuffer;
            this.render();
        }).catch(err => {
            console.error('[SampleEditor] Error stretching buffer:', err);
        });
    },

    // Reset offset and stretch
    resetAdjustments: function() {
        const trackSample = this.getTrackSample(AppState.currentTrack);
        const trackIndex = AppState.currentTrack;

        trackSample.offset = 0;

        // Use C++ implementation when in JUCE mode
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            console.log('[SampleEditor] Using C++ reset');

            AudioBridge.send('cppReset', {
                trackIndex: trackIndex
            });

            // Request updated waveform after reset
            setTimeout(() => {
                this.requestWaveformFromCpp(trackIndex);
            }, 50);
            return;
        }

        // Browser fallback - no local reset needed, just re-render
        this.render();
    },

    // Open file browser for JUCE WebView
    openFileBrowser: function() {
        if (window.__JUCE_HOST__) {
            // Running in JUCE WebView - fetch file list from MIDI bridge
            this.openJuceFileBrowser();
        } else {
            // Fallback to native file input for browser
            document.getElementById('sampleFileInput').click();
        }
    },

    // JUCE File Browser state
    juceFileBrowser: {
        files: [],
        basePath: '',
        folderTree: {},
        expandedFolders: new Set(),
        currentFolder: '',
        selectedFile: null
    },

    // Open file browser via JUCE resource provider
    openJuceFileBrowser: async function() {
        try {
            // Fetch the sample file list from the C++ backend
            const response = await fetch('/api/sampleFileList.json');
            if (!response.ok) {
                console.error('Failed to fetch sample file list:', response.status);
                // Fallback to native file input
                document.getElementById('sampleFileInput').click();
                return;
            }

            const data = await response.json();
            if (!data.files || data.files.length === 0) {
                alert('No sample files found in the samples folder.');
                return;
            }

            // Store data and build folder tree
            this.juceFileBrowser.files = data.files;
            this.juceFileBrowser.basePath = data.basePath;
            this.juceFileBrowser.selectedFile = null;
            this.buildFolderTree();

            // Show the file browser dialog
            this.showJuceFileBrowserDialog();
        } catch (error) {
            console.error('Error fetching sample file list:', error);
            // Fallback to native file input
            document.getElementById('sampleFileInput').click();
        }
    },

    // Build folder tree structure from file list
    buildFolderTree: function() {
        const tree = { __files__: [] };

        this.juceFileBrowser.files.forEach(file => {
            // Normalize path separators
            const relativePath = file.relativePath.replace(/\\/g, '/');
            const parts = relativePath.split('/');
            const fileName = parts.pop();

            let current = tree;
            let folderPath = '';

            parts.forEach(part => {
                folderPath = folderPath ? folderPath + '/' + part : part;
                if (!current[part]) {
                    current[part] = { __files__: [], __path__: folderPath };
                }
                current = current[part];
            });

            current.__files__.push(file);
        });

        this.juceFileBrowser.folderTree = tree;
        this.juceFileBrowser.currentFolder = '';
        this.juceFileBrowser.expandedFolders = new Set(['']);
    },

    // Show the JUCE file browser dialog
    showJuceFileBrowserDialog: function() {
        const modal = document.getElementById('sampleFileBrowserModal');
        if (!modal) return;

        // Attach event handlers if not already done
        this.attachJuceFileBrowserHandlers();

        // Render tree view
        this.renderJuceTreeView();

        // Render file list for root
        this.renderJuceFileList('');

        // Update open button state
        this.updateJuceOpenButton();

        // Show modal
        modal.style.display = 'flex';
    },

    // Attach event handlers for JUCE file browser
    attachJuceFileBrowserHandlers: function() {
        // Only attach once
        if (this.juceFileBrowser.handlersAttached) return;
        this.juceFileBrowser.handlersAttached = true;

        // Close button
        const closeBtn = document.getElementById('sampleFileBrowserCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideJuceFileBrowserDialog());
        }

        // Cancel button
        const cancelBtn = document.getElementById('sampleFileBrowserCancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideJuceFileBrowserDialog());
        }

        // Open button
        const openBtn = document.getElementById('sampleFileBrowserOpenBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.confirmJuceFileSelection());
        }

        // Close on overlay click
        const modal = document.getElementById('sampleFileBrowserModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideJuceFileBrowserDialog();
                }
            });
        }
    },

    // Render tree view
    renderJuceTreeView: function() {
        const treeContainer = document.getElementById('sampleFileBrowserTree');
        if (!treeContainer) return;

        treeContainer.innerHTML = '';

        // Create root node
        const rootNode = this.createJuceTreeNode('', 'samples', this.juceFileBrowser.folderTree);
        treeContainer.appendChild(rootNode);
    },

    // Create a tree node element
    createJuceTreeNode: function(path, name, treeData) {
        const node = document.createElement('div');
        node.className = 'tree-node';
        node.dataset.path = path;

        const item = document.createElement('div');
        item.className = 'tree-item' + (path === this.juceFileBrowser.currentFolder ? ' active' : '');

        // Check if has subfolders
        const subfolders = Object.keys(treeData).filter(k => !k.startsWith('__'));
        const hasChildren = subfolders.length > 0;

        // Expand/collapse icon
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand';
        if (hasChildren) {
            expandIcon.innerHTML = this.juceFileBrowser.expandedFolders.has(path) ? '▼' : '▶';
            expandIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleJuceFolder(path, node, treeData);
            });
        } else {
            expandIcon.innerHTML = '&nbsp;';
        }

        // Folder icon
        const folderIcon = document.createElement('span');
        folderIcon.className = 'tree-icon';
        folderIcon.innerHTML = '📁';

        // Folder name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-name';
        nameSpan.textContent = name;

        item.appendChild(expandIcon);
        item.appendChild(folderIcon);
        item.appendChild(nameSpan);

        // Click to select folder
        item.addEventListener('click', () => {
            this.selectJuceFolder(path);
        });

        // Double-click to expand
        item.addEventListener('dblclick', () => {
            if (hasChildren) {
                this.toggleJuceFolder(path, node, treeData);
            }
        });

        node.appendChild(item);

        // Children container
        const children = document.createElement('div');
        children.className = 'tree-children';
        children.style.display = this.juceFileBrowser.expandedFolders.has(path) ? 'block' : 'none';

        // Add child folders if expanded
        if (this.juceFileBrowser.expandedFolders.has(path)) {
            subfolders.sort().forEach(subfolder => {
                const childPath = path ? path + '/' + subfolder : subfolder;
                const childNode = this.createJuceTreeNode(childPath, subfolder, treeData[subfolder]);
                children.appendChild(childNode);
            });
        }

        node.appendChild(children);

        return node;
    },

    // Toggle folder expand/collapse
    toggleJuceFolder: function(path, node, treeData) {
        const children = node.querySelector('.tree-children');
        const expandIcon = node.querySelector('.tree-expand');

        if (this.juceFileBrowser.expandedFolders.has(path)) {
            this.juceFileBrowser.expandedFolders.delete(path);
            children.style.display = 'none';
            expandIcon.innerHTML = '▶';
        } else {
            this.juceFileBrowser.expandedFolders.add(path);
            children.style.display = 'block';
            expandIcon.innerHTML = '▼';

            // Populate children if empty
            if (children.children.length === 0) {
                const subfolders = Object.keys(treeData).filter(k => !k.startsWith('__'));
                subfolders.sort().forEach(subfolder => {
                    const childPath = path ? path + '/' + subfolder : subfolder;
                    const childNode = this.createJuceTreeNode(childPath, subfolder, treeData[subfolder]);
                    children.appendChild(childNode);
                });
            }
        }
    },

    // Select folder in tree
    selectJuceFolder: function(path) {
        this.juceFileBrowser.currentFolder = path;
        this.juceFileBrowser.selectedFile = null;

        // Update tree active state
        document.querySelectorAll('#sampleFileBrowserTree .tree-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeNode = document.querySelector(`#sampleFileBrowserTree .tree-node[data-path="${CSS.escape(path)}"]`);
        if (activeNode) {
            const activeItem = activeNode.querySelector(':scope > .tree-item');
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }

        // Update path display
        const pathDisplay = document.getElementById('sampleFileBrowserPath');
        if (pathDisplay) {
            pathDisplay.textContent = path ? 'samples/' + path : 'samples';
        }

        // Render file list
        this.renderJuceFileList(path);
        this.updateJuceOpenButton();
    },

    // Render file list for current folder
    renderJuceFileList: function(folderPath) {
        const fileList = document.getElementById('sampleFileBrowserFiles');
        if (!fileList) return;

        fileList.innerHTML = '';

        // Navigate to the folder in tree
        let treeData = this.juceFileBrowser.folderTree;
        if (folderPath) {
            const parts = folderPath.split('/');
            for (const part of parts) {
                if (treeData[part]) {
                    treeData = treeData[part];
                } else {
                    treeData = { __files__: [] };
                    break;
                }
            }
        }

        // Get subfolders and files
        const subfolders = Object.keys(treeData).filter(k => !k.startsWith('__')).sort();
        const files = (treeData.__files__ || []).sort((a, b) => a.name.localeCompare(b.name));

        if (subfolders.length === 0 && files.length === 0) {
            fileList.innerHTML = '<div class="file-empty">Empty folder</div>';
            return;
        }

        // Add subfolders first
        subfolders.forEach(subfolder => {
            const item = document.createElement('div');
            item.className = 'file-item folder';
            item.dataset.isDirectory = 'true';
            item.dataset.path = folderPath ? folderPath + '/' + subfolder : subfolder;

            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.innerHTML = '📁';

            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = subfolder;

            item.appendChild(icon);
            item.appendChild(name);

            // Double-click to navigate
            item.addEventListener('dblclick', () => {
                const newPath = folderPath ? folderPath + '/' + subfolder : subfolder;
                this.juceFileBrowser.expandedFolders.add(folderPath);
                this.juceFileBrowser.expandedFolders.add(newPath);
                this.renderJuceTreeView();
                this.selectJuceFolder(newPath);
            });

            fileList.appendChild(item);
        });

        // Add files
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.path = file.fullPath;

            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.innerHTML = '🎵';

            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = file.name;

            item.appendChild(icon);
            item.appendChild(name);

            // Click to select
            item.addEventListener('click', () => {
                document.querySelectorAll('#sampleFileBrowserFiles .file-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                item.classList.add('selected');
                this.juceFileBrowser.selectedFile = file;
                this.updateJuceOpenButton();
            });

            // Double-click to open
            item.addEventListener('dblclick', () => {
                this.juceFileBrowser.selectedFile = file;
                this.confirmJuceFileSelection();
            });

            fileList.appendChild(item);
        });
    },

    // Update open button state
    updateJuceOpenButton: function() {
        const openBtn = document.getElementById('sampleFileBrowserOpenBtn');
        if (openBtn) {
            const hasSelection = this.juceFileBrowser.selectedFile !== null;
            openBtn.disabled = !hasSelection;
            openBtn.style.opacity = hasSelection ? '1' : '0.5';
        }
    },

    // Confirm file selection
    confirmJuceFileSelection: function() {
        if (this.juceFileBrowser.selectedFile) {
            this.hideJuceFileBrowserDialog();
            this.loadSampleFromJuce(this.juceFileBrowser.selectedFile.fullPath);
        }
    },

    // Hide the JUCE file browser dialog
    hideJuceFileBrowserDialog: function() {
        const modal = document.getElementById('sampleFileBrowserModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    // Pending sample copy callbacks (requestId -> resolve function)
    pendingSampleCopies: {},
    sampleCopyRequestIdCounter: 0,

    // Request JUCE to copy sample to project folder (called during project save)
    // Uses unique request IDs to handle multiple concurrent requests for the same track
    requestSampleCopy: function(sourcePath, trackIndex, sceneIndex) {
        return new Promise((resolve) => {
            // Generate unique request ID to handle concurrent requests for same track
            const requestId = ++this.sampleCopyRequestIdCounter;
            const key = `${requestId}_${sceneIndex !== undefined ? sceneIndex : 'x'}_${trackIndex}`;

            // Store the resolve function with unique key
            this.pendingSampleCopies[key] = resolve;

            // Send command to JUCE with request ID
            if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                AudioBridge.send('copySampleToProject', {
                    sourcePath: sourcePath,
                    trackIndex: trackIndex,
                    requestId: requestId
                });
            } else {
                // Not in JUCE mode, just resolve with original path
                delete this.pendingSampleCopies[key];
                resolve(sourcePath);
            }

            // Timeout fallback - if no response in 5 seconds, use original path
            setTimeout(() => {
                if (this.pendingSampleCopies[key]) {
                    console.warn('[SampleEditor] Sample copy timeout for request', requestId, ', using original path');
                    delete this.pendingSampleCopies[key];
                    resolve(sourcePath);
                }
            }, 5000);
        });
    },

    // Load a sample file via JUCE resource provider
    // sceneIndex and trackIndex are optional - if not provided, uses AppState.currentScene/Track
    loadSampleFromJuce: async function(filePath, sceneIndex, trackIndex) {
        try {
            // Capture scene and track at call time to avoid race conditions during async operations
            const scene = sceneIndex !== undefined ? sceneIndex : (AppState.currentScene || 0);
            const track = trackIndex !== undefined ? trackIndex : AppState.currentTrack;

            console.log('[SampleEditor] loadSampleFromJuce called - scene:', scene, 'track:', track, 'path:', filePath);

            // First, request JUCE to copy the sample to the project folder
            console.log('[SampleEditor] Requesting sample copy to project folder...');
            const actualPath = await this.requestSampleCopy(filePath, track, scene);
            console.log('[SampleEditor] Using sample path:', actualPath);

            // Encode the file path for URL
            const encodedPath = encodeURIComponent(actualPath);
            const response = await fetch(`/api/loadSample?path=${encodedPath}`);

            if (!response.ok) {
                console.error('Failed to load sample:', response.status);
                alert('Failed to load sample file.');
                return;
            }

            // Get the audio data as ArrayBuffer
            const arrayBuffer = await response.arrayBuffer();

            // Decode the audio
            const audioContext = this.initAudioContext();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Extract filename from path
            const fileName = actualPath.split(/[/\\]/).pop();

            // Use the captured scene/track values, not current AppState values
            const trackSample = this.getClipSample(scene, track);
            trackSample.audioBuffer = audioBuffer;  // Keep for browser playback
            trackSample.fileName = fileName;
            trackSample.fullPath = actualPath;  // Store the copied path for playback
            trackSample.originalSourcePath = filePath;  // Store original source for restore
            console.log('[SampleEditor] Sample STORED at key:', scene + '_' + track,
                        'scene:', scene, 'track:', track, 'fullPath:', actualPath);
            trackSample.selection = { start: 0, end: 0 };
            trackSample.offset = 0;
            trackSample.detectedBPM = null;
            trackSample.transients = [];
            trackSample.hasUnsavedCppEdits = false;  // Fresh load, no edits yet

            // Generate waveform peaks from AudioBuffer immediately for clip preview
            // (C++ may update with higher quality data later)
            trackSample.waveformPeaks = this.generateWaveformPeaks(audioBuffer, 100);
            trackSample.duration = audioBuffer.duration;
            console.log('[SampleEditor] Generated waveform peaks from AudioBuffer:',
                        trackSample.waveformPeaks.length, 'peaks, duration:', trackSample.duration);

            // Set track type to sample (track-level setting)
            AppState.setTrackSettings(track, { trackType: 'sample' });

            // Update song screen to show waveform preview in clip cell
            if (typeof SongScreen !== 'undefined') {
                SongScreen.renderCanvas();
            }

            this.zoom = 1.0;
            this.scrollOffset = 0;

            // Update file name display (only if this is the current track/scene)
            if (track === AppState.currentTrack && scene === AppState.currentScene) {
                const fileNameDisplay = document.getElementById('sampleFileName');
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = fileName;
                }
            }

            // Only request C++ waveform for the CURRENT clip being edited by user
            // During bulk loading (deserialization), skip C++ requests because:
            // 1. C++ only maintains one sample per track, so concurrent loads overwrite each other
            // 2. JS already generates correct peaks from AudioBuffer above
            // 3. C++ waveform is only needed for high-quality display in the editor
            const isCurrentClip = (track === AppState.currentTrack && scene === (AppState.currentScene || 0));

            if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode() && isCurrentClip) {
                console.log('[SampleEditor] Loading sample for editing in C++ - track:', track, 'scene:', scene);

                // First ensure sample is loaded for editing in C++
                AudioBridge.send('cppLoadForEditing', {
                    trackIndex: track,
                    filePath: actualPath
                });

                // Request waveform data (includes peaks, duration, transients)
                setTimeout(() => {
                    this.requestWaveformFromCpp(track);
                }, 100);  // Small delay to ensure load completes
            } else if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
                // For non-current clips, just log that we're skipping C++ load
                console.log('[SampleEditor] Skipping C++ load for non-current clip - track:', track, 'scene:', scene,
                            '(current track:', AppState.currentTrack, 'scene:', AppState.currentScene, ')');
            }

            this.render();
        } catch (error) {
            console.error('Error loading sample from JUCE:', error);
            alert('Error loading audio file: ' + (error.message || 'Unknown error'));
        }
    },

    // Initialize audio context (used for decoding audio data for waveform display)
    initAudioContext: function() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    },

    // Toggle play/pause
    togglePlay: function() {
        // If AudioBridge is in external mode, route sample playback through JUCE
        if (typeof AudioBridge !== 'undefined' && AudioBridge.isExternalMode()) {
            const trackSample = this.getTrackSample(AppState.currentTrack);
            if (!trackSample.audioBuffer || !trackSample.fullPath) {
                console.log('[SampleEditor] No sample loaded or no file path for JUCE playback');
                return;
            }

            // Check if in Live Mode - use queued (quantized) playback
            const isLiveMode = AudioBridge.liveMode;

            if (this.isPlaying) {
                // Stop playback via AudioBridge
                if (isLiveMode) {
                    AudioBridge.queueStopSample(AppState.currentTrack);
                } else {
                    AudioBridge.stopSampleFile(AppState.currentTrack);
                    // Also stop the transport
                    AudioBridge.send('stopClip', {});
                }

                // Update AudioBridge state
                AudioBridge.isPlaying = false;
                AudioBridge.clipPaused = false;
                AudioBridge.playheadStep = 0;
                AudioBridge.updatePlayButton(false);

                this.isPlaying = false;
                this.updatePlayButton();
            } else {
                // Start playback via AudioBridge with file path
                if (isLiveMode) {
                    // Live Mode: Queue playback at next quantization boundary
                    AudioBridge.queueSampleFile(
                        AppState.currentTrack,
                        trackSample.fullPath,
                        trackSample.offset || 0
                    );
                } else {
                    // Normal Mode: Play immediately
                    // Get playback mode and clip length from settings
                    const trackSettings = AppState.getTrackSettings(AppState.currentTrack);
                    const shouldLoop = trackSettings.playbackMode === 'loop';
                    const clip = AppState.clips[AppState.currentScene]?.[AppState.currentTrack];
                    const clipLength = clip?.length || 64;  // Default 4 bars

                    // Let JUCE handle looping natively with the clip length
                    AudioBridge.playSampleFile(
                        AppState.currentTrack,
                        trackSample.fullPath,
                        trackSample.offset || 0,
                        shouldLoop,
                        clipLength  // Pass clip length in steps for JUCE to handle looping
                    );

                    // Start the transport so timing updates flow
                    AudioBridge.send('playClip', {});

                    // Set AudioBridge state for UI updates
                    AudioBridge.isPlaying = true;
                    AudioBridge.clipPaused = false;
                    AudioBridge.clipResumeOffset = 0;
                    AudioBridge.updatePlayButton(true, false);
                }
                this.isPlaying = true;
                this.updatePlayButton();
            }
            return;
        }
    },

    // Stop playback
    stop: function() {
        // Check if in Live Mode - use queued (quantized) stop
        const isLiveMode = typeof AudioBridge !== 'undefined' && AudioBridge.liveMode;

        if (isLiveMode) {
            AudioBridge.queueStopSample(AppState.currentTrack);
        } else if (typeof AudioBridge !== 'undefined') {
            AudioBridge.stopSampleFile(AppState.currentTrack);
        }
        this.isPlaying = false;
        this.updatePlayButton();
    },

    // Update play button icon (uses the main toolbar play button)
    updatePlayButton: function() {
        const playBtn = document.getElementById('clipPlayBtn');
        if (!playBtn) return;

        const icon = playBtn.querySelector('.icon');

        if (this.isPlaying) {
            // Show pause icon and highlight
            if (icon) {
                icon.classList.remove('icon-play');
                icon.classList.add('icon-pause');
            }
            playBtn.classList.add('playing');
        } else {
            // Show play icon
            if (icon) {
                icon.classList.remove('icon-pause');
                icon.classList.add('icon-play');
            }
            playBtn.classList.remove('playing');
        }
    }
};

// Global callback function for JUCE to call when sample copy is complete
// Supports both new format (with requestId) and legacy format (trackIndex only)
function handleSampleCopyResult(trackIndex, newPath, requestId) {
    console.log('[handleSampleCopyResult] Track:', trackIndex, 'New path:', newPath, 'RequestId:', requestId);

    if (!SampleEditor.pendingSampleCopies) return;

    // Try to find the pending callback
    let foundKey = null;
    let resolve = null;

    if (requestId !== undefined && requestId !== null) {
        // New format: Look for key with matching requestId
        for (const key of Object.keys(SampleEditor.pendingSampleCopies)) {
            if (key.startsWith(`${requestId}_`)) {
                foundKey = key;
                resolve = SampleEditor.pendingSampleCopies[key];
                break;
            }
        }
    }

    // Fallback: Look for any pending callback for this trackIndex (for backward compatibility)
    if (!resolve) {
        for (const key of Object.keys(SampleEditor.pendingSampleCopies)) {
            if (key.endsWith(`_${trackIndex}`)) {
                foundKey = key;
                resolve = SampleEditor.pendingSampleCopies[key];
                break;
            }
        }
    }

    if (resolve && foundKey) {
        delete SampleEditor.pendingSampleCopies[foundKey];
        resolve(newPath);
    }
}

// Global callback function for JUCE to call when edited sample is saved
// Supports both new format (with requestId and sceneIndex) and legacy format (trackIndex only)
function handleEditedSampleSaved(trackIndex, newPath, success, requestId, sceneIndex) {
    console.log('[handleEditedSampleSaved] Track:', trackIndex, 'Scene:', sceneIndex, 'New path:', newPath, 'Success:', success, 'RequestId:', requestId);

    // Determine which scene to update
    const scene = sceneIndex !== undefined ? sceneIndex : (AppState.currentScene || 0);

    if (success && newPath) {
        // Update the track sample path
        const trackSample = SampleEditor.getClipSample(scene, trackIndex);
        if (trackSample) {
            trackSample.fullPath = newPath;
            trackSample.fileName = newPath.split(/[/\\]/).pop();
            // Clear the unsaved edits flag since we just saved
            trackSample.hasUnsavedCppEdits = false;
            console.log('[handleEditedSampleSaved] Updated fullPath to:', newPath, '- cleared unsaved edits flag');
        }
    }

    if (!SampleEditor.pendingSaveCallbacks) return;

    // Try to find the pending callback
    let foundKey = null;
    let resolve = null;

    if (requestId !== undefined && requestId !== null) {
        // New format: Look for key with matching requestId
        for (const key of Object.keys(SampleEditor.pendingSaveCallbacks)) {
            if (key.startsWith(`${requestId}_`)) {
                foundKey = key;
                resolve = SampleEditor.pendingSaveCallbacks[key];
                break;
            }
        }
    }

    // Fallback: Look for any pending callback for this trackIndex (for backward compatibility)
    if (!resolve) {
        for (const key of Object.keys(SampleEditor.pendingSaveCallbacks)) {
            if (key.endsWith(`_${trackIndex}`)) {
                foundKey = key;
                resolve = SampleEditor.pendingSaveCallbacks[key];
                break;
            }
        }
    }

    if (resolve && foundKey) {
        delete SampleEditor.pendingSaveCallbacks[foundKey];
        resolve(success);
    }
}

// Global callback function for C++ sample editing operations
function handleCppEditResult(command, trackIndex, success) {
    console.log('[handleCppEditResult] Command:', command, 'Track:', trackIndex, 'Success:', success);

    if (success) {
        // Mark the sample as having unsaved edits (unless it's a reset command)
        const trackSample = SampleEditor.getTrackSample(trackIndex);
        if (trackSample) {
            if (command === 'cppReset') {
                // Reset clears all edits
                trackSample.hasUnsavedCppEdits = false;
                console.log('[handleCppEditResult] Cleared unsaved edits flag (reset)');
            } else {
                // All other edit commands mark as having unsaved edits
                trackSample.hasUnsavedCppEdits = true;
                console.log('[handleCppEditResult] Marked as having unsaved C++ edits');
            }
        }

        // Request updated waveform from C++
        SampleEditor.requestWaveformFromCpp(trackIndex);
    } else {
        console.error('[handleCppEditResult] Operation failed:', command);
    }
}

// Global callback function for C++ BPM detection result
function handleCppBPMResult(trackIndex, bpm) {
    console.log('[handleCppBPMResult] Track:', trackIndex, 'BPM:', bpm);

    // Update the track sample's detected BPM
    const trackSample = SampleEditor.getTrackSample(trackIndex);
    if (trackSample) {
        trackSample.detectedBPM = bpm;
    }

    // Update the BPM input in the warp dialog if it's open
    const bpmInput = document.getElementById('warpBpmInput');
    if (bpmInput && bpm > 0) {
        bpmInput.value = bpm;
    }
}

// Global callback function for C++ transient detection result
function handleCppTransientsResult(trackIndex, transients) {
    try {
        const count = Array.isArray(transients) ? transients.length : 0;
        console.log('[handleCppTransientsResult] Track:', trackIndex, 'Transients:', count);

        // Update the track sample's transients
        const trackSample = SampleEditor.getTrackSample(trackIndex);
        if (trackSample) {
            trackSample.transients = Array.isArray(transients) ? transients : [];
            console.log('[handleCppTransientsResult] Stored', trackSample.transients.length, 'transients for track', trackIndex);

            // Re-render to show transients
            if (SampleEditor.isVisible && AppState.currentTrack === trackIndex) {
                SampleEditor.render();
            }
        }
    } catch (e) {
        console.error('[handleCppTransientsResult] Error:', e);
    }
}

// Global callback function for C++ waveform data
// IMPORTANT: Only updates the CURRENT track/scene being edited, not background-loaded samples.
// This is because C++ only maintains one sample per track, while JS has per-clip samples.
// During deserialization, JS generates its own peaks from AudioBuffer which are correct.
function handleCppWaveformResult(trackIndex, peaks, duration, transients) {
    try {
        console.log('[handleCppWaveformResult] Track:', trackIndex,
                    'Peaks:', peaks ? peaks.length : 0,
                    'Duration:', duration,
                    'Transients:', transients ? transients.length : 0);

        // Only update if this is the currently active track being edited
        // This prevents C++ peaks from overwriting JS-generated peaks for other scenes
        if (AppState.currentTrack !== trackIndex) {
            console.log('[handleCppWaveformResult] Ignoring - not current track (current:', AppState.currentTrack, ')');
            return;
        }

        const trackSample = SampleEditor.getTrackSample(trackIndex);
        if (trackSample) {
            const isNewSample = trackSample.duration === 0 && duration > 0;

            // Always update peaks when we receive them from C++ for the current track
            // This ensures waveform updates after edit operations like stretch/compress
            // The current track check above prevents overwriting JS-generated peaks for other scenes
            if (peaks && peaks.length > 0) {
                trackSample.waveformPeaks = peaks;
                console.log('[handleCppWaveformResult] Updated peaks from C++ (' + peaks.length + ' points)');
            }

            // Always update duration and transients from C++ as they're more accurate
            if (duration > 0) {
                trackSample.duration = duration;
            }
            trackSample.transients = transients || [];

            // Auto-calculate clip length when a new sample is loaded
            if (isNewSample && duration > 0) {
                const tempo = AppState.tempo || 120;
                const secondsPerStep = 60 / tempo / 4;  // Duration of one 1/16th note
                const stepsFromSample = Math.ceil(duration / secondsPerStep);
                // Round up to nearest bar (16 steps), minimum 16 steps (1 bar)
                const calculatedLength = Math.max(16, Math.ceil(stepsFromSample / 16) * 16);

                // Update clip length only for the current clip (samples are now per-clip)
                const currentScene = AppState.currentScene || 0;
                const clip = AppState.clips[currentScene]?.[trackIndex];
                if (clip) {
                    clip.length = calculatedLength;
                }

                // Update currentLength if this is the current track
                AppState.currentLength = calculatedLength;

                console.log('[handleCppWaveformResult] Auto-set clip length:', calculatedLength,
                            'steps (', calculatedLength / 16, 'bars) for', duration.toFixed(2),
                            'sec sample at', tempo, 'BPM, scene:', currentScene);
            }

            // Re-render to show updated waveform
            if (SampleEditor.isVisible) {
                SampleEditor.render();
            }

            // Update song screen to reflect new clip length
            if (typeof SongScreen !== 'undefined') {
                SongScreen.renderCanvas();
            }
        }
    } catch (e) {
        console.error('[handleCppWaveformResult] Error:', e);
    }
}
