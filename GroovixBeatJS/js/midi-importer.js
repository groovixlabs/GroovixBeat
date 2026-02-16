// MIDI File Importer
const MidiImporter = {
    parsedMidi: null,

    init: function() {
        const fileInput = document.getElementById('midiFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    },

    handleFileSelect: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Update file name display
        const fileNameSpan = document.getElementById('midiFileName');
        if (fileNameSpan) {
            fileNameSpan.textContent = file.name;
        }

        // Read and parse the MIDI file
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target.result;
                this.parsedMidi = this.parseMidiFile(arrayBuffer);
                this.displayTrackInfo();
            } catch (error) {
                console.error('Error parsing MIDI file:', error);
                alert('Error parsing MIDI file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    displayTrackInfo: function() {
        const infoDiv = document.getElementById('midiTrackInfo');
        if (!infoDiv || !this.parsedMidi) return;

        const trackCount = this.parsedMidi.tracks.length;
        const tracksWithNotes = this.parsedMidi.tracks.filter(t => t.notes.length > 0).length;
        const totalNotes = this.parsedMidi.tracks.reduce((sum, t) => sum + t.notes.length, 0);

        infoDiv.innerHTML = `
            <div>Format: ${this.parsedMidi.format}</div>
            <div>Tracks: ${trackCount} (${tracksWithNotes} with notes)</div>
            <div>Total notes: ${totalNotes}</div>
            <div>Ticks per beat: ${this.parsedMidi.ticksPerBeat}</div>
        `;
    },

    importMidi: function() {
        const mergeSelect = document.getElementById('ImportMergeTracks');
        const mergeTracks = mergeSelect ? mergeSelect.value === '1' : false;

        if (mergeTracks) {
            this.importMerged();
        } else {
            this.importSeparate();
        }

        // Refresh the UI
        if (typeof ClipEditor !== 'undefined') {
            ClipEditor.renderPianoGrid();
            ClipEditor.renderTrackButtons();
        }
        if (typeof SongScreen !== 'undefined') {
            SongScreen.renderClipPreviews();
        }
    },

    importMerged: function() {
        // Merge all tracks into current track
        const allNotes = [];
        const ticksPerStep = this.parsedMidi.ticksPerBeat / 4; // 1 step = 1/16th note

        for (const track of this.parsedMidi.tracks) {
            for (const note of track.notes) {
                const startStep = Math.round(note.startTicks / ticksPerStep);
                const durationSteps = Math.max(1, Math.round(note.durationTicks / ticksPerStep));

                allNotes.push({
                    pitch: note.pitch,
                    start: startStep,
                    duration: durationSteps,
                    velocity: note.velocity
                });
            }
        }

        // Find max end step to set clip length
        let maxEndStep = 0;
        for (const note of allNotes) {
            maxEndStep = Math.max(maxEndStep, note.start + note.duration);
        }

        // Round up to nearest bar (16 steps)
        const clipLength = Math.ceil(maxEndStep / 16) * 16;

        // Get current clip and add notes
        const scene = AppState.currentScene;
        const track = AppState.currentTrack;

        if (!AppState.clips[scene]) {
            AppState.clips[scene] = [];
        }
        if (!AppState.clips[scene][track]) {
            AppState.clips[scene][track] = { notes: [], length: 64 };
        }

        // Add notes (avoid duplicates by checking existing)
        const clip = AppState.clips[scene][track];
        clip.length = Math.max(clip.length, clipLength);

        for (const note of allNotes) {
            // Check for duplicate
            const isDuplicate = clip.notes.some(n =>
                n.pitch === note.pitch &&
                n.start === note.start &&
                n.duration === note.duration
            );
            if (!isDuplicate) {
                clip.notes.push(note);
            }
        }

        // Update current length
        AppState.currentLength = clip.length;

        console.log(`Imported ${allNotes.length} notes to track ${track + 1}`);
    },

    importSeparate: function() {
        // Import each MIDI track to a separate app track
        const ticksPerStep = this.parsedMidi.ticksPerBeat / 4;
        const scene = AppState.currentScene;
        let trackIndex = AppState.currentTrack;
        let importedTracks = 0;

        for (const midiTrack of this.parsedMidi.tracks) {
            if (midiTrack.notes.length === 0) continue;
            if (trackIndex >= AppState.numTracks) {
                console.warn('Not enough tracks to import all MIDI tracks');
                break;
            }

            // Convert notes
            const notes = [];
            let maxEndStep = 0;

            for (const note of midiTrack.notes) {
                const startStep = Math.round(note.startTicks / ticksPerStep);
                const durationSteps = Math.max(1, Math.round(note.durationTicks / ticksPerStep));

                notes.push({
                    pitch: note.pitch,
                    start: startStep,
                    duration: durationSteps,
                    velocity: note.velocity
                });

                maxEndStep = Math.max(maxEndStep, startStep + durationSteps);
            }

            // Round up to nearest bar
            const clipLength = Math.ceil(maxEndStep / 16) * 16;

            // Ensure clip exists
            if (!AppState.clips[scene]) {
                AppState.clips[scene] = [];
            }
            if (!AppState.clips[scene][trackIndex]) {
                AppState.clips[scene][trackIndex] = { notes: [], length: 64 };
            }

            const clip = AppState.clips[scene][trackIndex];
            clip.length = Math.max(clip.length, clipLength);

            // Add notes
            for (const note of notes) {
                const isDuplicate = clip.notes.some(n =>
                    n.pitch === note.pitch &&
                    n.start === note.start &&
                    n.duration === note.duration
                );
                if (!isDuplicate) {
                    clip.notes.push(note);
                }
            }

            console.log(`Imported ${notes.length} notes to track ${trackIndex + 1} (${midiTrack.name || 'unnamed'})`);
            trackIndex++;
            importedTracks++;
        }

        console.log(`Imported ${importedTracks} MIDI tracks`);
    },

    // Simple MIDI parser
    parseMidiFile: function(arrayBuffer) {
        const data = new DataView(arrayBuffer);
        let offset = 0;

        // Read header chunk
        const headerChunk = this.readString(data, offset, 4);
        if (headerChunk !== 'MThd') {
            throw new Error('Invalid MIDI file: missing MThd header');
        }
        offset += 4;

        const headerLength = data.getUint32(offset);
        offset += 4;

        const format = data.getUint16(offset);
        offset += 2;

        const numTracks = data.getUint16(offset);
        offset += 2;

        const timeDivision = data.getUint16(offset);
        offset += 2;

        // Check if SMPTE or ticks per beat
        let ticksPerBeat;
        if (timeDivision & 0x8000) {
            // SMPTE format - convert to approximate ticks per beat
            const fps = -(timeDivision >> 8);
            const ticksPerFrame = timeDivision & 0xFF;
            ticksPerBeat = fps * ticksPerFrame; // Approximate
        } else {
            ticksPerBeat = timeDivision;
        }

        // Skip to end of header chunk (MThd(4) + length(4) + headerData)
        offset = 8 + headerLength;

        // Read track chunks
        const tracks = [];
        for (let i = 0; i < numTracks; i++) {
            if (offset >= data.byteLength) break;

            const trackChunk = this.readString(data, offset, 4);
            if (trackChunk !== 'MTrk') {
                console.warn('Expected MTrk at offset', offset, 'got', trackChunk);
                break;
            }
            offset += 4;

            const trackLength = data.getUint32(offset);
            offset += 4;

            const trackData = this.parseTrack(data, offset, trackLength);
            tracks.push(trackData);

            offset += trackLength;
        }

        return {
            format,
            numTracks,
            ticksPerBeat,
            tracks
        };
    },

    parseTrack: function(data, startOffset, length) {
        let offset = startOffset;
        const endOffset = startOffset + length;
        let currentTick = 0;
        let runningStatus = 0;

        const notes = [];
        const activeNotes = new Map(); // pitch -> { startTicks, velocity }
        let trackName = '';

        while (offset < endOffset) {
            // Read delta time (variable length)
            const delta = this.readVariableLength(data, offset);
            currentTick += delta.value;
            offset = delta.nextOffset;

            if (offset >= endOffset) break;

            // Read event
            let eventByte = data.getUint8(offset);

            // Check for running status
            if (eventByte < 0x80) {
                // Running status - use previous status
                eventByte = runningStatus;
            } else {
                offset++;
                if (eventByte < 0xF0) {
                    runningStatus = eventByte;
                }
            }

            const eventType = eventByte & 0xF0;
            const channel = eventByte & 0x0F;

            if (eventType === 0x90) {
                // Note On
                const pitch = data.getUint8(offset++);
                const velocity = data.getUint8(offset++);

                if (velocity > 0) {
                    // Note on
                    activeNotes.set(pitch, { startTicks: currentTick, velocity });
                } else {
                    // Note off (velocity 0)
                    const active = activeNotes.get(pitch);
                    if (active) {
                        notes.push({
                            pitch,
                            startTicks: active.startTicks,
                            durationTicks: currentTick - active.startTicks,
                            velocity: active.velocity,
                            channel
                        });
                        activeNotes.delete(pitch);
                    }
                }
            } else if (eventType === 0x80) {
                // Note Off
                const pitch = data.getUint8(offset++);
                const velocity = data.getUint8(offset++);

                const active = activeNotes.get(pitch);
                if (active) {
                    notes.push({
                        pitch,
                        startTicks: active.startTicks,
                        durationTicks: currentTick - active.startTicks,
                        velocity: active.velocity,
                        channel
                    });
                    activeNotes.delete(pitch);
                }
            } else if (eventType === 0xA0) {
                // Polyphonic aftertouch
                offset += 2;
            } else if (eventType === 0xB0) {
                // Control change
                offset += 2;
            } else if (eventType === 0xC0) {
                // Program change
                offset += 1;
            } else if (eventType === 0xD0) {
                // Channel aftertouch
                offset += 1;
            } else if (eventType === 0xE0) {
                // Pitch bend
                offset += 2;
            } else if (eventByte === 0xFF) {
                // Meta event
                const metaType = data.getUint8(offset++);
                const metaLength = this.readVariableLength(data, offset);
                offset = metaLength.nextOffset;

                if (metaType === 0x03) {
                    // Track name
                    trackName = this.readString(data, offset, metaLength.value);
                }

                offset += metaLength.value;
            } else if (eventByte === 0xF0 || eventByte === 0xF7) {
                // SysEx event
                const sysexLength = this.readVariableLength(data, offset);
                offset = sysexLength.nextOffset + sysexLength.value;
            }
        }

        // Close any remaining active notes
        for (const [pitch, active] of activeNotes) {
            notes.push({
                pitch,
                startTicks: active.startTicks,
                durationTicks: currentTick - active.startTicks,
                velocity: active.velocity,
                channel: 0
            });
        }

        return { name: trackName, notes };
    },

    readVariableLength: function(data, offset) {
        let value = 0;
        let byte;
        do {
            byte = data.getUint8(offset++);
            value = (value << 7) | (byte & 0x7F);
        } while (byte & 0x80);
        return { value, nextOffset: offset };
    },

    readString: function(data, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            str += String.fromCharCode(data.getUint8(offset + i));
        }
        return str;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    MidiImporter.init();
});
