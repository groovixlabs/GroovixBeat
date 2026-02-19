// Song Screen - Grid of Scenes and Tracks with Single Canvas Rendering

const SongScreen = {
    // Settings mode - when true, clicking scenes/clips opens properties
    settingsMode: false,

    // Live performance mode - when true, clicking clips starts/stops playback
    livePerformanceMode: false,

    // Song mixer visibility
    mixerVisible: false,

    // Pan drag state for mixer
    panDragState: null,
    boundPanDrag: null,
    boundPanDragEnd: null,

    // Canvas and rendering constants
    canvas: null,
    ctx: null,
    CELL_WIDTH: 70,
    CELL_HEIGHT: 70,
    CELL_GAP: 8,
    SCENE_LABEL_WIDTH: 80,

    // Track colors for clip previews
    TRACK_COLORS: [
        '#e85555', '#e8a055', '#d5a865', '#65d58a',
        '#55a8e8', '#8855e8', '#e855a8', '#888888'
    ],

    // Hover state for visual feedback
    hoveredCell: null,

    // Create the song grid
    createGrid: function() {
        this.renderGrid();
        this.attachControls();
    },

    // Render the entire grid
    renderGrid: function() {
        this.renderHeader();
        this.renderSceneLabels();
        this.initCanvas();
        this.renderCanvas();
    },

    // Render track header labels
    renderHeader: function() {
        const header = document.getElementById('gridHeader');
        header.innerHTML = '<div></div>'; // Empty cell for scene labels column

        for (let t = 0; t < AppState.numTracks; t++) {
            const label = document.createElement('div');
            label.className = 'track-label';
            label.dataset.track = t;
            label.textContent = AppState.getTrackName(t);
            label.title = 'Double-click to rename';

            // Click to open properties in settings mode
            label.addEventListener('click', () => {
                if (this.settingsMode) {
                    this.openTrackProperties(t);
                }
            });

            // Double-click to edit
            label.addEventListener('dblclick', () => this.editTrackName(t, label));
            header.appendChild(label);
        }

        // Add track button in header
        const addTrackBtn = document.createElement('button');
        addTrackBtn.className = 'add-btn add-track-btn';
        addTrackBtn.innerHTML = '+';
        addTrackBtn.title = 'Add Track';
        addTrackBtn.addEventListener('click', () => this.handleAddTrack());
        header.appendChild(addTrackBtn);
    },

    // Render scene labels column
    renderSceneLabels: function() {
        let labelsContainer = document.getElementById('sceneLabelsContainer');
        if (!labelsContainer) {
            // Create the container structure if it doesn't exist
            const grid = document.getElementById('grid');
            grid.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.className = 'grid-canvas-wrapper';

            labelsContainer = document.createElement('div');
            labelsContainer.id = 'sceneLabelsContainer';
            labelsContainer.className = 'scene-labels-container';
            wrapper.appendChild(labelsContainer);

            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'clip-canvas-container';
            const canvas = document.createElement('canvas');
            canvas.id = 'clipGridCanvas';
            canvasContainer.appendChild(canvas);
            wrapper.appendChild(canvasContainer);

            grid.appendChild(wrapper);

            // Add scene button row
            const addSceneRow = document.createElement('div');
            addSceneRow.className = 'add-scene-row';
            const addSceneBtn = document.createElement('button');
            addSceneBtn.className = 'add-btn add-scene-btn';
            addSceneBtn.innerHTML = '+';
            addSceneBtn.addEventListener('click', () => this.handleAddScene());
            addSceneRow.appendChild(addSceneBtn);
            grid.appendChild(addSceneRow);
        }

        labelsContainer.innerHTML = '';

        for (let row = 0; row < AppState.numScenes; row++) {
            const sceneLabel = document.createElement('div');
            sceneLabel.className = 'scene-label';
            sceneLabel.dataset.scene = row;
            sceneLabel.style.height = (this.CELL_HEIGHT) + 'px';
            sceneLabel.style.marginBottom = this.CELL_GAP + 'px';

            // Inner container for label content
            const labelContainer = document.createElement('div');
            labelContainer.className = 'scene-label-container';

            // Scene name text
            const labelText = document.createElement('span');
            labelText.className = 'scene-label-text';
            labelText.textContent = AppState.getSceneName(row);
            labelText.title = 'Double-click to rename';
            labelText.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.editSceneName(row, labelText);
            });
            labelContainer.appendChild(labelText);

            // Play button
            const playBtn = document.createElement('button');
            playBtn.className = 'scene-play-btn';
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            playBtn.title = 'Play Scene';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.settingsMode) return;
                AudioBridge.playSceneByIndex(row);
            });
            labelContainer.appendChild(playBtn);

            sceneLabel.appendChild(labelContainer);

            // Scene label click - opens properties in settings mode
            sceneLabel.addEventListener('click', (e) => {
                if (this.settingsMode) {
                    e.stopPropagation();
                    this.openSceneProperties(row);
                }
            });

            // Show indicators for non-default properties
            const props = AppState.getSceneProperties(row);
            if (props.signature !== '4/4' || props.repeat > 1 || props.fadeIn || props.fadeOut) {
                const indicators = document.createElement('div');
                indicators.className = 'scene-indicators';

                if (props.signature !== '4/4') {
                    const sigInd = document.createElement('span');
                    sigInd.className = 'scene-indicator active';
                    sigInd.textContent = props.signature;
                    indicators.appendChild(sigInd);
                }
                if (props.repeat > 1) {
                    const repInd = document.createElement('span');
                    repInd.className = 'scene-indicator active';
                    repInd.textContent = `×${props.repeat}`;
                    indicators.appendChild(repInd);
                }
                if (props.fadeIn) {
                    const fiInd = document.createElement('span');
                    fiInd.className = 'scene-indicator active';
                    fiInd.textContent = 'FI';
                    fiInd.title = 'Fade In';
                    indicators.appendChild(fiInd);
                }
                if (props.fadeOut) {
                    const foInd = document.createElement('span');
                    foInd.className = 'scene-indicator active';
                    foInd.textContent = 'FO';
                    foInd.title = 'Fade Out';
                    indicators.appendChild(foInd);
                }

                sceneLabel.appendChild(indicators);
            }

            labelsContainer.appendChild(sceneLabel);
        }
    },

    // Initialize the clip grid canvas
    initCanvas: function() {
        this.canvas = document.getElementById('clipGridCanvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        // Calculate canvas size
        const width = AppState.numTracks * (this.CELL_WIDTH + this.CELL_GAP) - this.CELL_GAP;
        const height = AppState.numScenes * (this.CELL_HEIGHT + this.CELL_GAP) - this.CELL_GAP;

        // Set canvas size with device pixel ratio for sharpness
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.scale(dpr, dpr);

        // Store logical dimensions
        this.canvasWidth = width;
        this.canvasHeight = height;

        // Create or resize the playhead overlay canvas.
        // It sits on top of the main canvas (pointer-events: none) and is the only
        // thing redrawn every animation frame — the main canvas only redraws on state changes.
        if (!this.playheadCanvas) {
            this.playheadCanvas = document.createElement('canvas');
            this.playheadCanvas.id = 'clipPlayheadCanvas';
            this.playheadCanvas.style.cssText =
                'position:absolute;top:0;left:0;pointer-events:none;border-radius:4px;';
            this.canvas.parentElement.appendChild(this.playheadCanvas);
            this.playheadCtx = this.playheadCanvas.getContext('2d');
        }
        this.playheadCanvas.width = width * dpr;
        this.playheadCanvas.height = height * dpr;
        this.playheadCanvas.style.width = width + 'px';
        this.playheadCanvas.style.height = height + 'px';

        // Attach event listeners
        this.attachCanvasEvents();
    },

    // Attach canvas event listeners
    attachCanvasEvents: function() {
        if (!this.canvas) return;

        // Remove old listeners if any
        this.canvas.removeEventListener('click', this.boundCanvasClick);
        this.canvas.removeEventListener('mousemove', this.boundCanvasMouseMove);
        this.canvas.removeEventListener('mouseleave', this.boundCanvasMouseLeave);
        this.canvas.removeEventListener('dragover', this.boundCanvasDragOver);
        this.canvas.removeEventListener('dragleave', this.boundCanvasDragLeave);
        this.canvas.removeEventListener('drop', this.boundCanvasDrop);

        // Bind handlers
        this.boundCanvasClick = this.handleCanvasClick.bind(this);
        this.boundCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.boundCanvasMouseLeave = this.handleCanvasMouseLeave.bind(this);
        this.boundCanvasDragOver = this.handleCanvasDragOver.bind(this);
        this.boundCanvasDragLeave = this.handleCanvasDragLeave.bind(this);
        this.boundCanvasDrop = this.handleCanvasDrop.bind(this);

        this.canvas.addEventListener('click', this.boundCanvasClick);
        this.canvas.addEventListener('mousemove', this.boundCanvasMouseMove);
        this.canvas.addEventListener('mouseleave', this.boundCanvasMouseLeave);

        // Drag and drop for audio files
        this.canvas.addEventListener('dragover', this.boundCanvasDragOver);
        this.canvas.addEventListener('dragleave', this.boundCanvasDragLeave);
        this.canvas.addEventListener('drop', this.boundCanvasDrop);
    },

    // Drag/drop state
    dragOverCell: null,

    // Get cell at canvas position
    getCellAtPosition: function(x, y) {
        const cellTotalWidth = this.CELL_WIDTH + this.CELL_GAP;
        const cellTotalHeight = this.CELL_HEIGHT + this.CELL_GAP;

        const col = Math.floor(x / cellTotalWidth);
        const row = Math.floor(y / cellTotalHeight);

        // Check if click is within the cell (not in the gap)
        const cellX = x - col * cellTotalWidth;
        const cellY = y - row * cellTotalHeight;

        if (cellX > this.CELL_WIDTH || cellY > this.CELL_HEIGHT) {
            return null; // Click in gap
        }

        if (row >= 0 && row < AppState.numScenes && col >= 0 && col < AppState.numTracks) {
            return { row, col };
        }
        return null;
    },

    // Handle canvas click
    handleCanvasClick: function(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const cell = this.getCellAtPosition(x, y);
        if (!cell) return;

        const { row, col } = cell;

        if (this.settingsMode) {
            this.openClipProperties(row, col);
        } else if (this.livePerformanceMode) {
            AudioBridge.queueLiveClip(row, col);
        } else {
            ClipEditor.open(row, col);
        }
    },

    // Handle canvas mouse move (for hover effects)
    handleCanvasMouseMove: function(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const cell = this.getCellAtPosition(x, y);
        const prevHovered = this.hoveredCell;

        this.hoveredCell = cell;

        // Update cursor
        this.canvas.style.cursor = cell ? 'pointer' : 'default';

        // Update step info with track type and clip path
        this.updateHoverInfo(cell);

        // Re-render if hover state changed
        if ((prevHovered?.row !== cell?.row) || (prevHovered?.col !== cell?.col)) {
            this.renderCanvas();
        }
    },

    // Update step info display when hovering over a clip
    updateHoverInfo: function(cell) {
        const stepInfo = document.getElementById('stepInfo');
        if (!stepInfo) return;

        if (!cell) {
            stepInfo.textContent = 'Hover over a clip for info | Click to edit | Drag audio file to load sample';
            return;
        }

        const { row: sceneIndex, col: trackIndex } = cell;
        const trackSettings = AppState.getTrackSettings(trackIndex);
        const trackType = trackSettings.trackType || 'melody';
        const trackName = AppState.getTrackName(trackIndex);
        const sceneName = AppState.getSceneName(sceneIndex);

        let info = `${sceneName} - ${trackName} | Type: ${trackType}`;

        // Add sample path for sample tracks
        if (trackType === 'sample' && typeof SampleEditor !== 'undefined') {
            const clipSample = SampleEditor.getClipSample(sceneIndex, trackIndex);
            if (clipSample && (clipSample.fullPath || clipSample.fileName)) {
                const fileName = clipSample.fileName || clipSample.fullPath?.split(/[/\\]/).pop() || 'Unknown';
                info += ` | Sample: ${fileName}`;
            } else {
                info += ' | No sample loaded';
            }
        } else if (trackType !== 'sample') {
            const clip = AppState.getClip(sceneIndex, trackIndex);
            const noteCount = clip.notes ? clip.notes.length : 0;
            info += ` | Notes: ${noteCount}`;
        }

        stepInfo.textContent = info;
    },

    // Handle canvas mouse leave
    handleCanvasMouseLeave: function() {
        if (this.hoveredCell) {
            this.hoveredCell = null;
            this.renderCanvas();
            // Reset step info
            this.updateHoverInfo(null);
        }
    },

    // Render the entire canvas (static content — no playheads)
    renderCanvas: function() {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;

        // Reset transform and clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Draw all clips
        for (let row = 0; row < AppState.numScenes; row++) {
            for (let col = 0; col < AppState.numTracks; col++) {
                this.renderClipCell(ctx, row, col);
            }
        }

        // Draw drag overlay if dragging over a cell
        if (this.dragOverCell) {
            this.renderDragOverlay(this.dragOverCell.row, this.dragOverCell.col);
        }
    },

    // Schedule one static-canvas redraw at most per animation frame.
    // Use this instead of calling renderCanvas() directly from event/timer handlers.
    scheduleRedraw: function() {
        if (this._redrawPending) return;
        this._redrawPending = true;
        requestAnimationFrame(() => {
            this._redrawPending = false;
            this.renderCanvas();
        });
    },

    // Draw only the moving playhead lines on the transparent overlay canvas.
    // Called every animation frame by the playhead loop — very cheap.
    renderPlayheadOverlay: function() {
        if (!this.playheadCtx) return;
        const ctx = this.playheadCtx;
        const dpr = window.devicePixelRatio || 1;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        if (typeof AudioBridge === 'undefined') return;

        const padding = 4;
        const cellW = this.CELL_WIDTH - padding * 2;
        const cellH = this.CELL_HEIGHT - padding * 2;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 4;

        for (let row = 0; row < AppState.numScenes; row++) {
            for (let col = 0; col < AppState.numTracks; col++) {
                const cellX = col * (this.CELL_WIDTH + this.CELL_GAP) + padding;
                const cellY = row * (this.CELL_HEIGHT + this.CELL_GAP) + padding;

                let playheadX = -1;
                const clip = AppState.getClip(row, col);
                const clipLength = (clip && clip.length) || 64;

                // Scene playback
                if (AudioBridge.playingSceneIndex === row &&
                    AudioBridge.isPlaying &&
                    AudioBridge.playbackStartTime &&
                    AudioBridge.playbackSecondsPerStep > 0) {
                    const elapsed = (performance.now() - AudioBridge.playbackStartTime) / 1000;
                    const step = (elapsed / AudioBridge.playbackSecondsPerStep) % clipLength;
                    playheadX = cellX + (step / clipLength) * cellW;
                }
                // Live mode
                else if (AudioBridge.liveMode && AudioBridge.isLiveClipPlaying?.(row, col)) {
                    const step = AudioBridge.getLiveClipPlayheadStep?.(col);
                    if (step != null && step >= 0) {
                        playheadX = cellX + (step / clipLength) * cellW;
                    }
                }

                if (playheadX >= cellX) {
                    ctx.beginPath();
                    ctx.moveTo(playheadX, cellY);
                    ctx.lineTo(playheadX, cellY + cellH);
                    ctx.stroke();
                }
            }
        }

        ctx.shadowBlur = 0;
    },

    // Start the per-frame overlay loop. Idempotent — safe to call multiple times.
    startPlayheadLoop: function() {
        if (this._playheadLoopId) {
            cancelAnimationFrame(this._playheadLoopId);
        }
        const loop = () => {
            this.renderPlayheadOverlay();
            this._playheadLoopId = requestAnimationFrame(loop);
        };
        this._playheadLoopId = requestAnimationFrame(loop);
    },

    // Stop the overlay loop and clear the overlay canvas.
    stopPlayheadLoop: function() {
        if (this._playheadLoopId) {
            cancelAnimationFrame(this._playheadLoopId);
            this._playheadLoopId = null;
        }
        if (this.playheadCtx) {
            const dpr = window.devicePixelRatio || 1;
            this.playheadCtx.setTransform(1, 0, 0, 1, 0, 0);
            this.playheadCtx.clearRect(0, 0, this.canvasWidth * dpr, this.canvasHeight * dpr);
        }
    },

    // Render a single clip cell
    renderClipCell: function(ctx, row, col) {
        const x = col * (this.CELL_WIDTH + this.CELL_GAP);
        const y = row * (this.CELL_HEIGHT + this.CELL_GAP);
        const clip = AppState.getClip(row, col);
        const trackSettings = AppState.getTrackSettings(col);
        const isSampleTrack = trackSettings.trackType === 'sample';
        const hasNotes = !isSampleTrack && clip.notes && clip.notes.length > 0;

        // Check if this track has a sample loaded for this clip
        let hasSample = false;
        let sampleInfo = null;
        if (isSampleTrack && typeof SampleEditor !== 'undefined') {
            const trackSample = SampleEditor.getClipSample(row, col);
            hasSample = trackSample && (trackSample.fullPath || trackSample.fileName);
            if (hasSample) {
                sampleInfo = trackSample;
            }
        }

        // Check states
        const isHovered = this.hoveredCell?.row === row && this.hoveredCell?.col === col;
        const isPlaying = typeof AudioBridge !== 'undefined' && AudioBridge.isLiveClipPlaying?.(row, col);
        const isQueued = typeof AudioBridge !== 'undefined' && AudioBridge.isLiveClipQueued?.(row, col);
        const isStopping = typeof AudioBridge !== 'undefined' && AudioBridge.isLiveClipStopping?.(row, col);
        const isScenePlaying = typeof AudioBridge !== 'undefined' && AudioBridge.playingSceneIndex === row;
        const isMuted = clip?.mute;

        // Draw cell background
        ctx.save();

        // Background gradient
        if (hasNotes || hasSample) {
            const gradient = ctx.createLinearGradient(x, y, x + this.CELL_WIDTH, y + this.CELL_HEIGHT);
            gradient.addColorStop(0, '#2a2a2a');
            gradient.addColorStop(1, '#242424');
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = '#242424';
        }

        // Draw rounded rectangle
        this.roundRect(ctx, x, y, this.CELL_WIDTH, this.CELL_HEIGHT, 4);
        ctx.fill();

        // Border/glow effects based on state
        if (isPlaying) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 8;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (isQueued) {
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 2;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
        } else if (isStopping) {
            ctx.strokeStyle = '#ff5555';
            ctx.lineWidth = 2;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
        } else if (isScenePlaying && (hasNotes || hasSample)) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
            ctx.lineWidth = 2;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
        } else if (isHovered) {
            ctx.strokeStyle = 'rgba(213, 168, 101, 0.5)';
            ctx.lineWidth = 1;
            this.roundRect(ctx, x + 0.5, y + 0.5, this.CELL_WIDTH - 1, this.CELL_HEIGHT - 1, 4);
            ctx.stroke();
        }

        // Draw settings mode indicator
        if (this.settingsMode) {
            ctx.strokeStyle = 'rgba(160, 100, 220, 0.6)';
            ctx.lineWidth = 2;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
        }

        // Draw live mode indicator
        if (this.livePerformanceMode && !isPlaying && !isQueued && !isStopping) {
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.4)';
            ctx.lineWidth = 2;
            this.roundRect(ctx, x + 1, y + 1, this.CELL_WIDTH - 2, this.CELL_HEIGHT - 2, 4);
            ctx.stroke();
        }

        ctx.restore();

        // Draw note preview if has notes
        if (hasNotes) {
            this.renderClipNotes(ctx, x, y, clip, col, row);
        }

        // Draw sample waveform preview if sample track with sample loaded
        if (hasSample && sampleInfo) {
            this.renderSamplePreview(ctx, x, y, sampleInfo, col, row);
        }

        // Draw indicators (mute, oneshot, sample)
        if (isMuted || clip?.playMode === 'oneshot' || hasSample) {
            this.renderClipIndicators(ctx, x, y, clip, hasSample);
        }
    },

    // Render clip notes preview
    renderClipNotes: function(ctx, cellX, cellY, clip, trackIndex, sceneIndex) {
        const padding = 4;
        const x = cellX + padding;
        const y = cellY + padding;
        const width = this.CELL_WIDTH - padding * 2;
        const height = this.CELL_HEIGHT - padding * 2;

        // Find pitch range
        let minPitch = Infinity, maxPitch = -Infinity;
        clip.notes.forEach(note => {
            minPitch = Math.min(minPitch, note.pitch);
            maxPitch = Math.max(maxPitch, note.pitch);
        });

        const clipLength = clip.length || 64;
        const stepWidth = width / clipLength;
        const pitchRange = maxPitch - minPitch + 1;
        const noteHeight = height / pitchRange;

        // Get track color
        const trackColor = this.TRACK_COLORS[trackIndex % this.TRACK_COLORS.length];

        // Draw notes (clip to cell bounds to prevent overflow)
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.globalAlpha = 0.9;
        const noteGap = Math.max(1, noteHeight * 0.1);

        clip.notes.forEach(note => {
            const noteX = x + note.start * stepWidth;
            const noteW = Math.max(note.duration * stepWidth - 1, 2);
            const pitchOffset = note.pitch - minPitch;
            const noteY = y + height - (pitchOffset + 1) * noteHeight + noteGap / 2;
            const noteH = Math.max(noteHeight - noteGap, 2);

            ctx.fillStyle = trackColor;
            ctx.fillRect(noteX, noteY, noteW, noteH);
        });

        ctx.globalAlpha = 1;

        ctx.restore();
    },

    // Render sample waveform preview
    renderSamplePreview: function(ctx, cellX, cellY, sampleInfo, trackIndex, sceneIndex) {
        const padding = 4;
        const x = cellX + padding;
        const y = cellY + padding;
        const width = this.CELL_WIDTH - padding * 2;
        const height = this.CELL_HEIGHT - padding * 2;

        // Get track color
        const trackColor = this.TRACK_COLORS[trackIndex % this.TRACK_COLORS.length];

        ctx.save();

        // Draw waveform if we have peaks data
        if (sampleInfo.waveformPeaks && sampleInfo.waveformPeaks.length > 0) {
            const peaks = sampleInfo.waveformPeaks;
            const numPeaks = Math.min(peaks.length, width);
            const stepWidth = width / numPeaks;
            const centerY = y + height / 2;

            ctx.strokeStyle = trackColor;
            ctx.fillStyle = trackColor;
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 1;

            ctx.beginPath();
            for (let i = 0; i < numPeaks; i++) {
                const peak = peaks[Math.floor(i * peaks.length / numPeaks)];
                const minVal = peak[0] || peak.min || -0.5;
                const maxVal = peak[1] || peak.max || 0.5;

                const peakX = x + i * stepWidth;
                const minY = centerY - minVal * (height / 2);
                const maxY = centerY - maxVal * (height / 2);

                ctx.moveTo(peakX, minY);
                ctx.lineTo(peakX, maxY);
            }
            ctx.stroke();
        } else {
            // No waveform data yet - draw placeholder with file name
            ctx.fillStyle = trackColor;
            ctx.globalAlpha = 0.6;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Truncate file name if too long
            let fileName = sampleInfo.fileName || 'Sample';
            if (fileName.length > 10) {
                fileName = fileName.substring(0, 8) + '...';
            }
            ctx.fillText(fileName, x + width / 2, y + height / 2);
        }

        ctx.restore();
    },

    // Render clip indicators (mute, oneshot, sample)
    renderClipIndicators: function(ctx, x, y, clip, hasSample) {
        const indicators = [];
        if (clip?.mute) indicators.push({ text: 'M', color: '#ff5555' });
        if (clip?.playMode === 'oneshot') indicators.push({ text: '1', color: '#55aaff' });
        if (hasSample) indicators.push({ text: 'S', color: '#55ff88' });

        ctx.save();
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let offsetX = x + this.CELL_WIDTH - 10;
        indicators.forEach(ind => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.arc(offsetX, y + 10, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = ind.color;
            ctx.fillText(ind.text, offsetX, y + 10);
            offsetX -= 16;
        });

        ctx.restore();
    },

    // Draw rounded rectangle
    roundRect: function(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    // Edit track name
    editTrackName: function(trackIndex, labelElement) {
        const currentName = AppState.getTrackName(trackIndex);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'name-edit-input';
        input.value = currentName;

        const finishEdit = () => {
            const newName = input.value.trim() || `Track ${trackIndex + 1}`;
            AppState.setTrackName(trackIndex, newName);
            labelElement.textContent = newName;
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });

        labelElement.textContent = '';
        labelElement.appendChild(input);
        input.focus();
        input.select();
    },

    // Edit scene name
    editSceneName: function(sceneIndex, textElement) {
        const currentName = AppState.getSceneName(sceneIndex);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'name-edit-input';
        input.value = currentName;

        const finishEdit = () => {
            const newName = input.value.trim() || `Scene ${sceneIndex + 1}`;
            AppState.setSceneName(sceneIndex, newName);
            textElement.textContent = newName;
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });

        textElement.textContent = '';
        textElement.appendChild(input);
        input.focus();
        input.select();
    },

    // Current scene being edited in properties popup
    currentPropsScene: -1,

    // Current track being edited in properties popup
    currentPropsTrack: -1,

    // Current clip being edited in properties popup
    currentPropsClip: { scene: -1, track: -1 },

    // Open scene properties popup
    openSceneProperties: function(sceneIndex) {
        this.currentPropsScene = sceneIndex;
        const props = AppState.getSceneProperties(sceneIndex);
        const name = AppState.getSceneName(sceneIndex);

        document.getElementById('scenePropsName').value = name;
        document.getElementById('scenePropsSignature').value = props.signature;
        document.getElementById('scenePropsRepeat').value = props.repeat;
        document.getElementById('scenePropsQuantize').value = props.quantize !== undefined ? props.quantize : 0;
        document.getElementById('scenePropsFadeIn').checked = props.fadeIn;
        document.getElementById('scenePropsFadeOut').checked = props.fadeOut;

        // Enable/disable manage buttons based on scene position
        document.getElementById('scenePropsMoveUp').disabled = (sceneIndex === 0);
        document.getElementById('scenePropsMoveDown').disabled = (sceneIndex >= AppState.numScenes - 1);
        document.getElementById('scenePropsDelete').disabled = (AppState.numScenes <= 1);

        document.getElementById('scenePropsOverlay').classList.add('active');
    },

    // Close scene properties popup
    closeSceneProperties: function() {
        document.getElementById('scenePropsOverlay').classList.remove('active');
        this.currentPropsScene = -1;
    },

    // Save scene properties
    saveSceneProperties: function() {
        if (this.currentPropsScene < 0) return;

        const name = document.getElementById('scenePropsName').value.trim() || `Scene ${this.currentPropsScene + 1}`;
        const signature = document.getElementById('scenePropsSignature').value;
        const repeat = parseInt(document.getElementById('scenePropsRepeat').value) || 1;
        const quantize = parseInt(document.getElementById('scenePropsQuantize').value) || 0;
        const fadeIn = document.getElementById('scenePropsFadeIn').checked;
        const fadeOut = document.getElementById('scenePropsFadeOut').checked;

        AppState.setSceneName(this.currentPropsScene, name);
        AppState.setSceneProperties(this.currentPropsScene, {
            signature, repeat, quantize, fadeIn, fadeOut
        });

        this.closeSceneProperties();
        this.renderSceneLabels();
    },

    // Open track properties popup
    openTrackProperties: function(trackIndex) {
        this.currentPropsTrack = trackIndex;
        const name = AppState.getTrackName(trackIndex);

        document.getElementById('trackPropsName').value = name;

        // Enable/disable manage buttons based on track position
        document.getElementById('trackPropsMoveLeft').disabled = (trackIndex === 0);
        document.getElementById('trackPropsMoveRight').disabled = (trackIndex >= AppState.numTracks - 1);
        document.getElementById('trackPropsDelete').disabled = (AppState.numTracks <= 1);

        document.getElementById('trackPropsOverlay').classList.add('active');
    },

    // Close track properties popup
    closeTrackProperties: function() {
        document.getElementById('trackPropsOverlay').classList.remove('active');
        this.currentPropsTrack = -1;
    },

    // Save track properties
    saveTrackProperties: function() {
        if (this.currentPropsTrack < 0) return;

        const name = document.getElementById('trackPropsName').value.trim() || `Track ${this.currentPropsTrack + 1}`;
        AppState.setTrackName(this.currentPropsTrack, name);

        this.closeTrackProperties();
        this.renderGrid();
    },

    // Open clip properties popup
    openClipProperties: function(sceneIndex, trackIndex) {
        this.currentPropsClip = { scene: sceneIndex, track: trackIndex };
        const clip = AppState.clips[sceneIndex][trackIndex];
        const sceneName = AppState.getSceneName(sceneIndex);
        const trackName = AppState.getTrackName(trackIndex);

        document.getElementById('clipPropsSubtitle').textContent = `${sceneName} - ${trackName}`;
        document.getElementById('clipPropsLength').value = clip.length;
        document.getElementById('clipPropsPlayMode').value = clip.playMode || 'loop';
        document.getElementById('clipPropsQuantize').value = clip.quantize !== undefined ? clip.quantize : 0;
        document.getElementById('clipPropsMute').checked = clip.mute || false;

        document.getElementById('clipPropsOverlay').classList.add('active');
    },

    // Close clip properties popup
    closeClipProperties: function() {
        document.getElementById('clipPropsOverlay').classList.remove('active');
        this.currentPropsClip = { scene: -1, track: -1 };
    },

    // Save clip properties
    saveClipProperties: function() {
        if (this.currentPropsClip.scene < 0) return;

        const clip = AppState.clips[this.currentPropsClip.scene][this.currentPropsClip.track];

        clip.length = parseInt(document.getElementById('clipPropsLength').value) || 64;
        clip.playMode = document.getElementById('clipPropsPlayMode').value;
        clip.quantize = parseInt(document.getElementById('clipPropsQuantize').value) || 0;
        clip.mute = document.getElementById('clipPropsMute').checked;

        this.closeClipProperties();
        this.renderCanvas();
    },

    // Handle adding a new track
    handleAddTrack: function() {
        AppState.addTrack();
        this.renderGrid();
        this.updateGridStyles();
    },

    // Handle adding a new scene
    handleAddScene: function() {
        AppState.addScene();
        this.renderGrid();
    },

    // Update grid CSS for dynamic column count
    updateGridStyles: function() {
        const style = document.documentElement.style;
        style.setProperty('--num-tracks', AppState.numTracks);
    },

    // Update clip visual state (called from ClipEditor)
    updateClipVisual: function(scene, track) {
        this.renderCanvas();
    },

    // Render clip previews (compatibility method)
    renderClipPreviews: function() {
        this.scheduleRedraw();
    },

    // Render rows (compatibility method for loadSong etc.)
    renderRows: function() {
        this.renderSceneLabels();
        this.initCanvas();
        this.renderCanvas();
    },

    // Get clip element (compatibility - returns null for canvas-based rendering)
    getClipElement: function(row, col) {
        return null; // No longer using DOM elements for clips
    },

    // Attach control button handlers
    attachControls: function() {
        document.getElementById('playBtn').addEventListener('click', () => AudioBridge.toggleSong());
        document.getElementById('stopBtn').addEventListener('click', () => AudioBridge.stopSong());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());

        // Tempo controls
        const tempoInput = document.getElementById('tempoInput');
        tempoInput.addEventListener('change', (e) => {
            const tempo = Math.max(20, Math.min(300, parseInt(e.target.value) || 120));
            AppState.tempo = tempo;
            tempoInput.value = tempo;
            this.updatePlaybackTiming();
        });


        // Song quantization control
        const songQuantizeSelect = document.getElementById('songQuantizeSelect');
        if (songQuantizeSelect) {
            songQuantizeSelect.addEventListener('change', (e) => {
                AppState.songQuantize = parseInt(e.target.value) || 4;
            });
        }

        // Settings toggle button
        const settingsToggleBtn = document.getElementById('settingsToggleBtn');
        if (settingsToggleBtn) {
            settingsToggleBtn.addEventListener('click', () => this.toggleSettingsMode());
        }

        // Live Performance toggle button
        const livePerformanceBtn = document.getElementById('livePerformanceBtn');
        console.log('[SongScreen] livePerformanceBtn:', livePerformanceBtn);
        if (livePerformanceBtn) {
            livePerformanceBtn.addEventListener('click', () => this.toggleLivePerformanceMode());
            console.log('[SongScreen] Live performance button listener attached');
        }

        // Song Mixer toggle button
        const songMixerBtn = document.getElementById('songMixerBtn');
        if (songMixerBtn) {
            songMixerBtn.addEventListener('click', () => {
                if (typeof TabManager !== 'undefined') {
                    TabManager.switchTab('mixer');
                } else {
                    this.toggleSongMixer();
                }
            });
        }

        // Setup pan drag handlers
        this.boundPanDrag = this.handlePanDrag.bind(this);
        this.boundPanDragEnd = this.handlePanDragEnd.bind(this);

        // Scene properties popup
        document.getElementById('scenePropsClose').addEventListener('click', () => this.closeSceneProperties());
        document.getElementById('scenePropsCancel').addEventListener('click', () => this.closeSceneProperties());
        document.getElementById('scenePropsSave').addEventListener('click', () => this.saveSceneProperties());

        document.getElementById('scenePropsOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('scenePropsOverlay')) {
                this.closeSceneProperties();
            }
        });

        // Scene manage buttons
        document.getElementById('scenePropsClone').addEventListener('click', () => {
            if (this.currentPropsScene < 0) return;
            AppState.cloneScene(this.currentPropsScene);
            this.closeSceneProperties();
            this.renderGrid();
        });

        document.getElementById('scenePropsDelete').addEventListener('click', () => {
            if (this.currentPropsScene < 0) return;
            if (!confirm('Delete this scene? This cannot be undone.')) return;
            AppState.deleteScene(this.currentPropsScene);
            this.closeSceneProperties();
            this.renderGrid();
        });

        document.getElementById('scenePropsMoveUp').addEventListener('click', () => {
            if (this.currentPropsScene <= 0) return;
            AppState.moveSceneUp(this.currentPropsScene);
            this.currentPropsScene--;
            this.renderGrid();
            // Update button states for new position
            document.getElementById('scenePropsMoveUp').disabled = (this.currentPropsScene === 0);
            document.getElementById('scenePropsMoveDown').disabled = (this.currentPropsScene >= AppState.numScenes - 1);
        });

        document.getElementById('scenePropsMoveDown').addEventListener('click', () => {
            if (this.currentPropsScene >= AppState.numScenes - 1) return;
            AppState.moveSceneDown(this.currentPropsScene);
            this.currentPropsScene++;
            this.renderGrid();
            // Update button states for new position
            document.getElementById('scenePropsMoveUp').disabled = (this.currentPropsScene === 0);
            document.getElementById('scenePropsMoveDown').disabled = (this.currentPropsScene >= AppState.numScenes - 1);
        });

        // Track properties popup
        document.getElementById('trackPropsClose').addEventListener('click', () => this.closeTrackProperties());
        document.getElementById('trackPropsCancel').addEventListener('click', () => this.closeTrackProperties());
        document.getElementById('trackPropsSave').addEventListener('click', () => this.saveTrackProperties());

        document.getElementById('trackPropsOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('trackPropsOverlay')) {
                this.closeTrackProperties();
            }
        });

        // Track manage buttons
        document.getElementById('trackPropsClone').addEventListener('click', () => {
            if (this.currentPropsTrack < 0) return;
            AppState.cloneTrack(this.currentPropsTrack);
            this.closeTrackProperties();
            this.updateGridStyles();
            this.renderGrid();
        });

        document.getElementById('trackPropsDelete').addEventListener('click', () => {
            if (this.currentPropsTrack < 0) return;
            if (!confirm('Delete this track? This cannot be undone.')) return;
            AppState.deleteTrack(this.currentPropsTrack);
            this.closeTrackProperties();
            this.updateGridStyles();
            this.renderGrid();
        });

        document.getElementById('trackPropsMoveLeft').addEventListener('click', () => {
            if (this.currentPropsTrack <= 0) return;
            AppState.moveTrackLeft(this.currentPropsTrack);
            this.currentPropsTrack--;
            this.renderGrid();
            // Update button states for new position
            document.getElementById('trackPropsMoveLeft').disabled = (this.currentPropsTrack === 0);
            document.getElementById('trackPropsMoveRight').disabled = (this.currentPropsTrack >= AppState.numTracks - 1);
        });

        document.getElementById('trackPropsMoveRight').addEventListener('click', () => {
            if (this.currentPropsTrack >= AppState.numTracks - 1) return;
            AppState.moveTrackRight(this.currentPropsTrack);
            this.currentPropsTrack++;
            this.renderGrid();
            // Update button states for new position
            document.getElementById('trackPropsMoveLeft').disabled = (this.currentPropsTrack === 0);
            document.getElementById('trackPropsMoveRight').disabled = (this.currentPropsTrack >= AppState.numTracks - 1);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('scenePropsOverlay').classList.contains('active')) {
                    this.closeSceneProperties();
                }
                if (document.getElementById('trackPropsOverlay').classList.contains('active')) {
                    this.closeTrackProperties();
                }
                if (document.getElementById('clipPropsOverlay').classList.contains('active')) {
                    this.closeClipProperties();
                }
            }
        });

        // Clip properties popup
        document.getElementById('clipPropsClose').addEventListener('click', () => this.closeClipProperties());
        document.getElementById('clipPropsCancel').addEventListener('click', () => this.closeClipProperties());
        document.getElementById('clipPropsSave').addEventListener('click', () => this.saveClipProperties());

        document.getElementById('clipPropsOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('clipPropsOverlay')) {
                this.closeClipProperties();
            }
        });
    },

    // Update tempo display
    updateTempoDisplay: function() {
        document.getElementById('tempoInput').value = AppState.tempo;
        const songQuantizeSelect = document.getElementById('songQuantizeSelect');
        if (songQuantizeSelect) {
            songQuantizeSelect.value = AppState.songQuantize || 4;
        }
    },

    // Toggle settings mode
    toggleSettingsMode: function() {
        this.settingsMode = !this.settingsMode;
        const btn = document.getElementById('settingsToggleBtn');
        if (btn) {
            btn.classList.toggle('active', this.settingsMode);
        }

        if (this.settingsMode && this.livePerformanceMode) {
            AudioBridge.stopLiveMode();
        }

        // Toggle scene play button visibility
        const labelsContainer = document.getElementById('sceneLabelsContainer');
        if (labelsContainer) {
            labelsContainer.classList.toggle('settings-active', this.settingsMode);
        }

        this.renderCanvas();
    },

    // Toggle live performance mode
    toggleLivePerformanceMode: function() {
        console.log('[SongScreen] toggleLivePerformanceMode called');
        AudioBridge.toggleLiveMode();
    },

    // Update live mode UI state
    updateLiveMode: function(enabled) {
        this.livePerformanceMode = enabled;

        // Update live performance button - change icon to stop when active
        const liveBtn = document.getElementById('livePerformanceBtn');
        if (liveBtn) {
            liveBtn.classList.toggle('active', enabled);
            // Clear loading/ready states when disabling
            if (!enabled) {
                liveBtn.classList.remove('loading', 'ready');
            }
            const icon = liveBtn.querySelector('.icon');
            if (icon) {
                if (enabled) {
                    icon.classList.remove('icon-live');
                    icon.classList.add('icon-stop');
                } else {
                    icon.classList.remove('icon-stop');
                    icon.classList.add('icon-live');
                }
            }
        }

        // Disable/enable play and stop buttons
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        if (playBtn) {
            playBtn.disabled = enabled;
            playBtn.style.opacity = enabled ? '0.4' : '1';
            playBtn.style.pointerEvents = enabled ? 'none' : 'auto';
        }
        if (stopBtn) {
            stopBtn.disabled = enabled;
            stopBtn.style.opacity = enabled ? '0.4' : '1';
            stopBtn.style.pointerEvents = enabled ? 'none' : 'auto';
        }

        if (enabled && this.settingsMode) {
            this.settingsMode = false;
            const settingsBtn = document.getElementById('settingsToggleBtn');
            if (settingsBtn) {
                settingsBtn.classList.remove('active');
            }
        }

        this.renderCanvas();
    },

    // Set live mode loading state (red = loading, green = ready)
    setLiveModeLoadingState: function(state) {
        const liveBtn = document.getElementById('livePerformanceBtn');
        if (!liveBtn) return;

        if (state === 'loading') {
            liveBtn.classList.add('loading');
            liveBtn.classList.remove('ready');
            console.log('[SongScreen] Live Mode: Loading samples...');
        } else if (state === 'ready') {
            liveBtn.classList.remove('loading');
            liveBtn.classList.add('ready');
            console.log('[SongScreen] Live Mode: Ready to play!');
        } else {
            // Clear both states
            liveBtn.classList.remove('loading', 'ready');
        }
    },

    // Called when sample preloading is complete
    onSamplesPreloaded: function() {
        this.setLiveModeLoadingState('ready');
    },

    // Update live clip visual states
    updateLiveClipStates: function() {
        this.renderCanvas();
    },

    // Clear all live clip visual states
    clearLiveClipStates: function() {
        this.renderCanvas();
    },

    // Render playheads for live playing clips
    // No-op: playheads are drawn on the overlay canvas by the playhead loop.
    renderLivePlayheads: function() {},

    // Update playback timing when tempo changes
    updatePlaybackTiming: function() {
        if (AppState.isPlaying) {
            this.stop();
            this.play();
        }
    },

    // Save song to file
    saveSong: async function() {
        const data = await AppState.serializeAsync();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'song.groovi';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Load song from file
    loadSong: function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const success = AppState.deserialize(event.target.result);
            if (success) {
                this.stop();
                this.updateTempoDisplay();
                this.updateGridStyles();
                this.renderGrid();
            } else {
                alert('Failed to load song file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    },

    // Calculate playback interval
    getPlaybackInterval: function() {
        return 60000 / AppState.tempo;
    },

    // Play functionality
    play: function() {
        if (AppState.isPlaying) return;
        AppState.isPlaying = true;
        document.getElementById('playBtn').classList.add('playing');

        const playStep = () => {
            AppState.playingScene = (AppState.playingScene + 1) % AppState.numScenes;
            this.renderCanvas();
        };

        AppState.playInterval = setInterval(playStep, this.getPlaybackInterval());
    },

    // Stop functionality
    stop: function() {
        AppState.isPlaying = false;
        clearInterval(AppState.playInterval);
        AppState.playingScene = 0;
        document.getElementById('playBtn').classList.remove('playing');
        this.renderCanvas();
    },

    // Clear all clips
    clearAll: function() {
        AudioBridge.stopSong();
        if (confirm('Clear all Clips?')) {
            // Clear notes from all clips
            for (let row = 0; row < AppState.numScenes; row++) {
                for (let col = 0; col < AppState.numTracks; col++) {
                    AppState.clips[row][col].notes = [];
                }
            }

            // Clear all sample data
            if (typeof SampleEditor !== 'undefined') {
                SampleEditor.clipSamples = {};
            }

            // Reset all track types to melody
            for (let t = 0; t < AppState.numTracks; t++) {
                AppState.setTrackSettings(t, { trackType: 'melody' });
            }

            this.renderCanvas();
        }
    },

    // Highlight the currently playing scene
    highlightPlayingScene: function(sceneIndex) {
        // Remove previous highlight from scene labels
        document.querySelectorAll('.scene-label.playing').forEach(label => {
            label.classList.remove('playing');
        });

        if (sceneIndex >= 0) {
            const sceneLabels = document.querySelectorAll('.scene-label');
            if (sceneLabels[sceneIndex]) {
                sceneLabels[sceneIndex].classList.add('playing');
            }
        }

        // Re-render canvas to show scene highlight on clips
        this.renderCanvas();
    },

    // ==========================================
    // Song Screen Mixer (unchanged)
    // ==========================================

    toggleSongMixer: function() {
        this.mixerVisible = !this.mixerVisible;
        const panel = document.getElementById('songMixerPanel');
        const btn = document.getElementById('songMixerBtn');

        if (this.mixerVisible) {
            panel.classList.add('visible');
            btn.classList.add('active');
            this.renderSongMixer();
        } else {
            panel.classList.remove('visible');
            btn.classList.remove('active');
        }
    },

    renderSongMixer: function() {
        const container = document.getElementById('songMixerChannels');
        if (!container) return;

        container.innerHTML = '';

        const trackColors = [
            '#e85555', '#e8a055', '#d5a865', '#65d58a',
            '#55a8e8', '#8855e8', '#e855a8', '#888888'
        ];

        for (let t = 0; t < AppState.numTracks; t++) {
            const mixerState = AppState.getMixerState(t);
            const channel = document.createElement('div');
            channel.className = 'song-mixer-channel';
            channel.dataset.track = t;

            const colorBar = document.createElement('div');
            colorBar.className = 'channel-color';
            colorBar.style.background = trackColors[t % trackColors.length];
            channel.appendChild(colorBar);

            const name = document.createElement('div');
            name.className = 'channel-name';
            name.textContent = AppState.getTrackName(t);
            name.title = AppState.getTrackName(t);
            channel.appendChild(name);

            const buttons = document.createElement('div');
            buttons.className = 'channel-buttons';

            const muteBtn = document.createElement('button');
            muteBtn.className = 'channel-btn mute-btn' + (mixerState.mute ? ' active' : '');
            muteBtn.textContent = 'M';
            muteBtn.title = 'Mute';
            muteBtn.addEventListener('click', () => this.toggleMixerMute(t));
            buttons.appendChild(muteBtn);

            const soloBtn = document.createElement('button');
            soloBtn.className = 'channel-btn solo-btn' + (mixerState.solo ? ' active' : '');
            soloBtn.textContent = 'S';
            soloBtn.title = 'Solo';
            soloBtn.addEventListener('click', () => this.toggleMixerSolo(t));
            buttons.appendChild(soloBtn);

            channel.appendChild(buttons);

            const panContainer = document.createElement('div');
            panContainer.className = 'pan-container';

            const panLabel = document.createElement('div');
            panLabel.className = 'pan-label';
            panLabel.textContent = 'Pan';
            panContainer.appendChild(panLabel);

            const panKnob = document.createElement('div');
            panKnob.className = 'pan-knob';
            const panIndicator = document.createElement('div');
            panIndicator.className = 'pan-indicator';
            const panRotation = mixerState.pan * 135;
            panIndicator.style.transform = `translate(-50%, -100%) rotate(${panRotation}deg)`;
            panKnob.appendChild(panIndicator);
            panKnob.addEventListener('mousedown', (e) => this.startPanDrag(e, t));
            panContainer.appendChild(panKnob);

            const panValue = document.createElement('div');
            panValue.className = 'pan-value';
            panValue.id = `songPanValue-${t}`;
            panValue.textContent = this.formatPanValue(mixerState.pan);
            panContainer.appendChild(panValue);

            channel.appendChild(panContainer);

            const faderContainer = document.createElement('div');
            faderContainer.className = 'fader-container';

            const levelMeterL = document.createElement('div');
            levelMeterL.className = 'level-meter';
            const levelFillL = document.createElement('div');
            levelFillL.className = 'level-fill';
            levelFillL.id = `songLevelL-${t}`;
            levelFillL.style.height = `${mixerState.levelL * 100}%`;
            levelMeterL.appendChild(levelFillL);
            faderContainer.appendChild(levelMeterL);

            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'volume-slider-container';
            const volumeSlider = document.createElement('input');
            volumeSlider.type = 'range';
            volumeSlider.className = 'volume-slider';
            volumeSlider.id = `songVolume-${t}`;
            volumeSlider.min = 0;
            volumeSlider.max = 100;
            volumeSlider.value = mixerState.volume * 100;
            volumeSlider.addEventListener('input', (e) => this.handleMixerVolumeChange(t, e.target.value / 100));
            sliderContainer.appendChild(volumeSlider);
            faderContainer.appendChild(sliderContainer);

            const levelMeterR = document.createElement('div');
            levelMeterR.className = 'level-meter';
            const levelFillR = document.createElement('div');
            levelFillR.className = 'level-fill';
            levelFillR.id = `songLevelR-${t}`;
            levelFillR.style.height = `${mixerState.levelR * 100}%`;
            levelMeterR.appendChild(levelFillR);
            faderContainer.appendChild(levelMeterR);

            channel.appendChild(faderContainer);

            const volumeValue = document.createElement('div');
            volumeValue.className = 'volume-value';
            volumeValue.id = `songVolumeValue-${t}`;
            volumeValue.textContent = this.formatVolumeValue(mixerState.volume);
            channel.appendChild(volumeValue);

            container.appendChild(channel);
        }
    },

    toggleMixerMute: function(trackIndex) {
        const state = AppState.getMixerState(trackIndex);
        state.mute = !state.mute;
        this.renderSongMixer();
        if (typeof AudioBridge !== 'undefined') {
            AudioBridge.updateTrackMixerState(trackIndex);
        }
    },

    toggleMixerSolo: function(trackIndex) {
        const state = AppState.getMixerState(trackIndex);
        state.solo = !state.solo;
        this.renderSongMixer();
        if (typeof AudioBridge !== 'undefined') {
            for (let t = 0; t < AppState.numTracks; t++) {
                AudioBridge.updateTrackMixerState(t);
            }
        }
    },

    handleMixerVolumeChange: function(trackIndex, volume) {
        const state = AppState.getMixerState(trackIndex);
        state.volume = volume;
        const valueDisplay = document.getElementById(`songVolumeValue-${trackIndex}`);
        if (valueDisplay) {
            valueDisplay.textContent = this.formatVolumeValue(volume);
        }
        if (typeof AudioBridge !== 'undefined') {
            AudioBridge.updateTrackMixerState(trackIndex);
        }
    },

    startPanDrag: function(e, trackIndex) {
        e.preventDefault();
        const state = AppState.getMixerState(trackIndex);
        this.panDragState = {
            trackIndex: trackIndex,
            startX: e.clientX,
            startY: e.clientY,
            startPan: state.pan
        };

        document.addEventListener('mousemove', this.boundPanDrag);
        document.addEventListener('mouseup', this.boundPanDragEnd);
    },

    handlePanDrag: function(e) {
        if (!this.panDragState) return;

        const deltaX = e.clientX - this.panDragState.startX;
        const deltaY = this.panDragState.startY - e.clientY;
        const delta = (deltaX + deltaY) / 100;

        let newPan = this.panDragState.startPan + delta;
        newPan = Math.max(-1, Math.min(1, newPan));

        const state = AppState.getMixerState(this.panDragState.trackIndex);
        state.pan = newPan;

        this.renderSongMixer();

        if (typeof AudioBridge !== 'undefined') {
            AudioBridge.updateTrackMixerState(this.panDragState.trackIndex);
        }
    },

    handlePanDragEnd: function() {
        if (this.panDragState) {
            if (typeof AudioBridge !== 'undefined') {
                AudioBridge.updateTrackMixerState(this.panDragState.trackIndex);
            }
        }
        this.panDragState = null;
        document.removeEventListener('mousemove', this.boundPanDrag);
        document.removeEventListener('mouseup', this.boundPanDragEnd);
    },

    formatPanValue: function(pan) {
        if (Math.abs(pan) < 0.05) return 'C';
        if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`;
        return `R${Math.round(pan * 100)}`;
    },

    formatVolumeValue: function(volume) {
        if (volume === 0) return '-∞';
        const db = 20 * Math.log10(volume);
        return db.toFixed(1) + ' dB';
    },

    updateLevelMeter: function(trackIndex, levelL, levelR) {
        const songLevelL = document.getElementById(`songLevelL-${trackIndex}`);
        const songLevelR = document.getElementById(`songLevelR-${trackIndex}`);

        if (songLevelL) {
            songLevelL.style.height = `${Math.min(levelL * 100, 100)}%`;
        }
        if (songLevelR) {
            songLevelR.style.height = `${Math.min(levelR * 100, 100)}%`;
        }
    },

    updateAllLevelMeters: function() {
        for (let t = 0; t < AppState.numTracks; t++) {
            const state = AppState.getMixerState(t);
            this.updateLevelMeter(t, state.levelL, state.levelR);
        }
    },

    // ==========================================
    // Drag and Drop for Audio Files
    // ==========================================

    // Handle dragover event - show visual feedback
    handleCanvasDragOver: function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Check if dragging files
        if (!e.dataTransfer.types.includes('Files')) {
            return;
        }

        e.dataTransfer.dropEffect = 'copy';

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const cell = this.getCellAtPosition(x, y);
        const prevDragOver = this.dragOverCell;

        this.dragOverCell = cell;

        // Re-render if drag position changed (overlay is drawn automatically in renderCanvas)
        if ((prevDragOver?.row !== cell?.row) || (prevDragOver?.col !== cell?.col)) {
            this.renderCanvas();
        }
    },

    // Handle dragleave event - clear visual feedback
    handleCanvasDragLeave: function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Only clear if leaving the canvas entirely
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            this.dragOverCell = null;
            this.renderCanvas();
        }
    },

    // Handle drop event - load the audio file
    handleCanvasDrop: async function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Clear drag visual state
        const targetCell = this.dragOverCell;
        this.dragOverCell = null;
        this.renderCanvas();

        if (!targetCell) {
            return;
        }

        // Get dropped files
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];  // Only handle first file

        // Check if it's an audio file
        const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif', '.m4a'];
        const fileName = file.name.toLowerCase();
        const isAudio = audioExtensions.some(ext => fileName.endsWith(ext));

        if (!isAudio) {
            console.log('[SongScreen] Dropped file is not an audio file:', file.name);
            return;
        }

        const { row: sceneIndex, col: trackIndex } = targetCell;

        // Set track type to 'sample' (track-level setting)
        AppState.setTrackSettings(trackIndex, { trackType: 'sample' });

        // Get the file path - for JUCE mode, we need the full path from dataTransfer
        let filePath = null;

        // In Electron/JUCE, files have a 'path' property
        if (file.path) {
            filePath = file.path;
        } else {
            // Fallback - try to get path from dataTransfer (for some browsers/environments)
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const item = items[0];
                if (item.getAsFile) {
                    const f = item.getAsFile();
                    if (f && f.path) {
                        filePath = f.path;
                    }
                }
            }
        }

        if (!filePath) {
            console.warn('[SongScreen] Could not get file path from dropped file. File:', file.name);
            // For web-only mode, we could potentially load via FileReader, but JUCE mode needs paths
            alert('Drag and drop requires the full file path. This may not work in all browsers.');
            return;
        }

        // Load the sample using SampleEditor - pass scene and track indices explicitly
        if (typeof SampleEditor !== 'undefined' && typeof SampleEditor.loadSampleFromJuce === 'function') {
            await SampleEditor.loadSampleFromJuce(filePath, sceneIndex, trackIndex);
            console.log('[SongScreen] Sample loaded successfully for scene', sceneIndex, 'track', trackIndex);
        } else {
            console.warn('[SongScreen] SampleEditor not available for loading sample');
        }

        // Update the grid to show the sample indicator
        this.renderCanvas();
    },

    // Render drag overlay on target cell
    renderDragOverlay: function(row, col) {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const x = col * (this.CELL_WIDTH + this.CELL_GAP);
        const y = row * (this.CELL_HEIGHT + this.CELL_GAP);

        ctx.save();

        // Draw highlight border
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 10;
        this.roundRect(ctx, x + 2, y + 2, this.CELL_WIDTH - 4, this.CELL_HEIGHT - 4, 4);
        ctx.stroke();

        // Draw "drop" icon/text
        ctx.fillStyle = 'rgba(0, 170, 255, 0.2)';
        this.roundRect(ctx, x + 2, y + 2, this.CELL_WIDTH - 4, this.CELL_HEIGHT - 4, 4);
        ctx.fill();

        // Draw drop icon
        ctx.fillStyle = '#00aaff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DROP', x + this.CELL_WIDTH / 2, y + this.CELL_HEIGHT / 2);

        ctx.restore();
    }
};
