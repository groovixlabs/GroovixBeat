// Instrument Selector - Select instrument plugin for MIDI tracks
// Communicates with JUCE to get plugin list and assign instruments to tracks
// UI is rendered inline within the Track Settings modal

const InstrumentSelector = {
    // State
    currentTrack: 0,
    availableInstruments: [],
    trackInstruments: {}, // { trackIndex: { id, name, manufacturer } }
    inlineContainer: null,
    inlineSearchEl: null,

    // Get default/demo instruments when JUCE is not available
    getDefaultInstruments: function() {
        return [
            { id: 'internal-piano', name: 'Piano', category: 'Instrument', manufacturer: 'Internal', isInstrument: true },
            { id: 'internal-synth', name: 'Synthesizer', category: 'Synth', manufacturer: 'Internal', isInstrument: true },
            { id: 'internal-drums', name: 'Drum Machine', category: 'Sampler', manufacturer: 'Internal', isInstrument: true },
        ];
    },

    // Get instrument for a track
    getTrackInstrument: function(trackIndex) {
        return this.trackInstruments[trackIndex] || null;
    },

    // Set instrument for a track
    setTrackInstrument: function(trackIndex, instrument) {
        if (instrument) {
            this.trackInstruments[trackIndex] = instrument;
        } else {
            delete this.trackInstruments[trackIndex];
        }
    },

    // Load instruments and render inline into a provided container (for track settings modal)
    loadAndRenderInline: async function(trackIndex, containerEl, searchEl) {
        this.currentTrack = trackIndex;
        this.inlineContainer = containerEl;
        this.inlineSearchEl = searchEl;

        // Load instruments if not already loaded
        if (this.availableInstruments.length === 0) {
            try {
                const response = await fetch('/api/pluginList.json');
                if (response.ok) {
                    const data = await response.json();
                    console.log("'/api/pluginList.json'",data)
                    this.availableInstruments = (data.plugins || []).filter(p =>
                        p.isInstrument === true
                    );
                } else {
                    this.availableInstruments = this.getDefaultInstruments();
                }
            } catch (error) {
                this.availableInstruments = this.getDefaultInstruments();
            }
        }

        // Render into the inline container
        this.renderInstrumentList(containerEl, '');

        // Wire search input
        if (searchEl) {
            searchEl.value = '';
            // Remove old listener by replacing the element (to avoid duplicate listeners)
            const newSearchEl = searchEl.cloneNode(true);
            searchEl.parentNode.replaceChild(newSearchEl, searchEl);
            this.inlineSearchEl = newSearchEl;
            newSearchEl.addEventListener('input', (e) => {
                this.renderInstrumentList(this.inlineContainer, e.target.value);
            });
        }
    },

    // Render instrument list into a container element
    renderInstrumentList: function(containerEl, filter) {
        if (!containerEl) return;

        const currentInstr = this.trackInstruments[this.currentTrack];
        const currentId = currentInstr ? currentInstr.id : null;

        const filterLower = (filter || '').toLowerCase();
        const filtered = this.availableInstruments.filter(plugin => {
            return !filter ||
                plugin.name.toLowerCase().includes(filterLower) ||
                (plugin.category && plugin.category.toLowerCase().includes(filterLower)) ||
                (plugin.manufacturer && plugin.manufacturer.toLowerCase().includes(filterLower));
        });

        // Build HTML with "No Instrument" option at top
        let html = `
            <div class="instr-item instr-item-none ${!currentId ? 'instr-item-active' : ''}" data-plugin-id="">
                <div class="instr-item-name">No Instrument</div>
                <div class="instr-item-info">
                    <span class="instr-item-manufacturer">Clear assignment</span>
                </div>
            </div>
        `;

        if (filtered.length === 0 && filter) {
            html += '<div class="instr-empty">No instruments found</div>';
        } else {
            // Group by manufacturer
            const groups = {};
            filtered.forEach(plugin => {
                const manufacturer = plugin.manufacturer || 'Other';
                if (!groups[manufacturer]) {
                    groups[manufacturer] = [];
                }
                groups[manufacturer].push(plugin);
            });

            const sortedManufacturers = Object.keys(groups).sort((a, b) => a.localeCompare(b));

            sortedManufacturers.forEach(manufacturer => {
                html += `<div class="instr-group-header">${manufacturer}</div>`;
                html += groups[manufacturer].map(plugin => {
                    const pluginId = plugin.name;
                    const isActive = pluginId === currentId;
                    return `
                        <div class="instr-item ${isActive ? 'instr-item-active' : ''}" data-plugin-id="${pluginId}">
                            <div class="instr-item-name">${plugin.name}</div>
                            <div class="instr-item-info">
                                <span class="instr-item-category">${plugin.category || 'Instrument'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            });
        }

        containerEl.innerHTML = html;

        // Add click handlers - applies immediately
        containerEl.querySelectorAll('.instr-item').forEach(item => {
            item.addEventListener('click', () => {
                const pluginId = item.dataset.pluginId;
                this.applyInstrument(pluginId);
            });
        });
    },

    // Apply instrument (called on click from inline list)
    applyInstrument: function(pluginId) {
        if (pluginId === null || pluginId === '') {
            delete this.trackInstruments[this.currentTrack];

            if (typeof AudioBridge !== 'undefined') {
                AudioBridge.send('setTrackInstrument', {
                    trackIndex: this.currentTrack,
                    pluginId: ''
                });
            }
        } else {
            const instrument = this.availableInstruments.find(p => p.name === pluginId);

            if (!instrument) return;

            this.trackInstruments[this.currentTrack] = {
                id: instrument.name,
                name: instrument.name,
                category: instrument.category,
                manufacturer: instrument.manufacturer
            };

            if (typeof AudioBridge !== 'undefined') {
                AudioBridge.send('setTrackInstrument', {
                    trackIndex: this.currentTrack,
                    pluginId: instrument.name
                });
            }
        }

        // Re-render inline list to update active state
        if (this.inlineContainer) {
            const searchVal = this.inlineSearchEl ? this.inlineSearchEl.value : '';
            this.renderInstrumentList(this.inlineContainer, searchVal);
        }

        // Update editor info
        if (typeof ClipEditor !== 'undefined' && ClipEditor.updateEditorInfo) {
            ClipEditor.updateEditorInfo();
        }
    },

    // Called when JUCE sends plugin list update
    updatePluginList: function(plugins) {
        this.availableInstruments = plugins.filter(p =>
            p.isInstrument === true
        );

        // Re-render inline list if active
        if (this.inlineContainer) {
            const searchVal = this.inlineSearchEl ? this.inlineSearchEl.value : '';
            this.renderInstrumentList(this.inlineContainer, searchVal);
        }
    },

    // Show VST plugin UI for the current track's instrument
    showVstUI: function() {
        const trackIndex = AppState.currentTrack;
        const instrument = this.trackInstruments[trackIndex];

        if (!instrument || !instrument.id) {
            console.log('[InstrumentSelector] No instrument assigned to track', trackIndex);
            return;
        }

        console.log('[InstrumentSelector] Opening VST UI for track', trackIndex, ':', instrument.name);

        if (typeof AudioBridge !== 'undefined') {
            AudioBridge.send('showPluginUI', {
                trackIndex: trackIndex,
                pluginId: instrument.id
            });
        }
    }
};
