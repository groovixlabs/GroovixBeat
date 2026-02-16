// FX Chain Manager - Manages per-track effect chains
// Communicates with JUCE to get plugin list and set up effect routing

const FxChain = {
    // State
    isVisible: false,
    currentTrack: 0,
    availablePlugins: [],
    trackFxChains: {}, // { trackIndex: [{ id, name, category }, ...] }
    selectedAvailable: null,
    selectedChain: null,

    // Initialize FX Chain UI
    init: function() {
        this.bindEvents();
    },

    // Bind UI events
    bindEvents: function() {
        // FX button in toolbar
        const fxBtn = document.getElementById('trackFxBtn');
        if (fxBtn) {
            fxBtn.addEventListener('click', () => this.show());
        }

        // Close button
        const closeBtn = document.getElementById('fxChainCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // Cancel button
        const cancelBtn = document.getElementById('fxChainCancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hide());
        }

        // Apply button
        const applyBtn = document.getElementById('fxChainApplyBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.apply());
        }

        // Add/Remove buttons
        const addBtn = document.getElementById('fxAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addToChain());
        }

        const removeBtn = document.getElementById('fxRemoveBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.removeFromChain());
        }

        // Move up/down buttons
        const moveUpBtn = document.getElementById('fxMoveUpBtn');
        if (moveUpBtn) {
            moveUpBtn.addEventListener('click', () => this.moveUp());
        }

        const moveDownBtn = document.getElementById('fxMoveDownBtn');
        if (moveDownBtn) {
            moveDownBtn.addEventListener('click', () => this.moveDown());
        }

        // Search input
        const searchInput = document.getElementById('fxPluginSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterPlugins(e.target.value));
        }

        // Click outside to close
        const overlay = document.getElementById('fxChainModal');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hide();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.isVisible) return;

            if (e.key === 'Escape') {
                this.hide();
            }
        });
    },

    // Show FX Chain modal
    show: function() {
        this.currentTrack = AppState.currentTrack;
        this.isVisible = true;

        // Update title
        const titleSpan = document.getElementById('fxChainTrackName');
        if (titleSpan) {
            titleSpan.textContent = `Track ${this.currentTrack + 1}`;
        }

        // Load available plugins from JUCE
        this.loadAvailablePlugins();

        // Load current FX chain for this track
        this.loadTrackChain();

        // Show modal
        const modal = document.getElementById('fxChainModal');
        if (modal) {
            modal.style.display = 'flex';
        }

        // Clear search
        const searchInput = document.getElementById('fxPluginSearch');
        if (searchInput) {
            searchInput.value = '';
        }
    },

    // Hide FX Chain modal
    hide: function() {
        this.isVisible = false;
        const modal = document.getElementById('fxChainModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.selectedAvailable = null;
        this.selectedChain = null;
    },

    // Load available plugins from JUCE
    loadAvailablePlugins: async function() {
        console.log('[FxChain] Loading available plugins...');

        // Check if we're in JUCE mode
        if (window.__JUCE_HOST__ && typeof window.getPluginList === 'function') {
            try {
                const result = await new Promise((resolve, reject) => {
                    window.getPluginList([])
                        .then(resolve)
                        .catch(reject);
                });

                if (result && Array.isArray(result)) {
                    this.availablePlugins = result;
                    console.log('[FxChain] Loaded', result.length, 'plugins from JUCE');
                }
            } catch (error) {
                console.error('[FxChain] Error loading plugins:', error);
                this.availablePlugins = this.getDefaultPlugins();
            }
        } else {
            // Use fetch API for resource provider
            try {
                const response = await fetch('/api/pluginList.json');
                if (response.ok) {
                    const data = await response.json();
                    this.availablePlugins = data.plugins || [];
                    console.log('[FxChain] Loaded', this.availablePlugins.length, 'plugins via API');
                } else {
                    console.warn('[FxChain] Plugin list API not available, using defaults');
                    this.availablePlugins = this.getDefaultPlugins();
                }
            } catch (error) {
                console.warn('[FxChain] Error fetching plugins:', error);
                this.availablePlugins = this.getDefaultPlugins();
            }
        }

        this.renderAvailablePlugins();
    },

    // Get default/demo plugins when JUCE is not available
    getDefaultPlugins: function() {
        return [
            { id: 'internal-reverb', name: 'Reverb', category: 'Effect', manufacturer: 'JUCE' },
            { id: 'internal-chorus', name: 'Chorus', category: 'Effect', manufacturer: 'Internal' },
            { id: 'internal-delay', name: 'Delay', category: 'Effect', manufacturer: 'Internal' },
            { id: 'internal-gain', name: 'Gain', category: 'Utility', manufacturer: 'JUCE' },
            { id: 'internal-eq', name: 'EQ', category: 'Effect', manufacturer: 'Internal' },
            { id: 'internal-compressor', name: 'Compressor', category: 'Dynamics', manufacturer: 'Internal' },
        ];
    },

    // Load current FX chain for the track
    loadTrackChain: function() {
        if (!this.trackFxChains[this.currentTrack]) {
            this.trackFxChains[this.currentTrack] = [];
        }
        this.renderTrackChain();
    },

    // Get FX chain for a track
    getTrackChain: function(trackIndex) {
        return this.trackFxChains[trackIndex] || [];
    },

    // Set FX chain for a track
    setTrackChain: function(trackIndex, chain) {
        this.trackFxChains[trackIndex] = chain;
    },

    // Render available plugins list
    renderAvailablePlugins: function(filter = '') {
        const container = document.getElementById('fxAvailablePlugins');
        if (!container) return;

        const filterLower = filter.toLowerCase();
        const filtered = this.availablePlugins.filter(plugin => {
            // Only show effect plugins (not instruments/synths)
            const isEffect = plugin.category !== 'Synth' &&
                             plugin.category !== 'Instrument' &&
                             !plugin.isInstrument;

            const matchesFilter = !filter ||
                plugin.name.toLowerCase().includes(filterLower) ||
                (plugin.category && plugin.category.toLowerCase().includes(filterLower)) ||
                (plugin.manufacturer && plugin.manufacturer.toLowerCase().includes(filterLower));

            return isEffect && matchesFilter;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="fx-chain-empty">No plugins found</div>';
            return;
        }

        container.innerHTML = filtered.map((plugin, index) => `
            <div class="fx-chain-item" data-plugin-id="${plugin.id || plugin.name}" data-index="${index}">
                <div class="fx-chain-item-name">${plugin.name}</div>
                <div class="fx-chain-item-category">${plugin.category || 'Effect'}</div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.fx-chain-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectAvailable(item.dataset.pluginId);
            });
            item.addEventListener('dblclick', () => {
                this.selectAvailable(item.dataset.pluginId);
                this.addToChain();
            });
        });
    },

    // Render track FX chain
    renderTrackChain: function() {
        const container = document.getElementById('fxTrackChain');
        if (!container) return;

        const chain = this.trackFxChains[this.currentTrack] || [];

        if (chain.length === 0) {
            container.innerHTML = '<div class="fx-chain-empty">No effects added.<br>Select a plugin and click &rarr; to add.</div>';
            return;
        }

        container.innerHTML = chain.map((plugin, index) => `
            <div class="fx-chain-item" data-chain-index="${index}">
                <div class="fx-chain-item-index">${index + 1}</div>
                <div class="fx-chain-item-name">${plugin.name}</div>
                <div class="fx-chain-item-category">${plugin.category || 'Effect'}</div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.fx-chain-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectChain(parseInt(item.dataset.chainIndex));
            });
        });
    },

    // Select an available plugin
    selectAvailable: function(pluginId) {
        this.selectedAvailable = pluginId;

        // Update UI
        const container = document.getElementById('fxAvailablePlugins');
        if (container) {
            container.querySelectorAll('.fx-chain-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.pluginId === pluginId);
            });
        }
    },

    // Select a chain item
    selectChain: function(index) {
        this.selectedChain = index;

        // Update UI
        const container = document.getElementById('fxTrackChain');
        if (container) {
            container.querySelectorAll('.fx-chain-item').forEach(item => {
                item.classList.toggle('selected', parseInt(item.dataset.chainIndex) === index);
            });
        }
    },

    // Add selected plugin to chain
    addToChain: function() {
        if (this.selectedAvailable === null) return;

        const plugin = this.availablePlugins.find(p =>
            (p.id || p.name) === this.selectedAvailable
        );

        if (!plugin) return;

        if (!this.trackFxChains[this.currentTrack]) {
            this.trackFxChains[this.currentTrack] = [];
        }

        // Add a copy of the plugin to the chain
        this.trackFxChains[this.currentTrack].push({
            id: plugin.id || plugin.name,
            name: plugin.name,
            category: plugin.category,
            manufacturer: plugin.manufacturer,
            fileOrIdentifier: plugin.fileOrIdentifier || plugin.id || plugin.name
        });

        this.renderTrackChain();
        console.log('[FxChain] Added', plugin.name, 'to track', this.currentTrack);
    },

    // Remove selected plugin from chain
    removeFromChain: function() {
        if (this.selectedChain === null) return;

        const chain = this.trackFxChains[this.currentTrack];
        if (!chain || this.selectedChain >= chain.length) return;

        chain.splice(this.selectedChain, 1);
        this.selectedChain = null;
        this.renderTrackChain();
        console.log('[FxChain] Removed plugin from chain');
    },

    // Move selected chain item up
    moveUp: function() {
        if (this.selectedChain === null || this.selectedChain === 0) return;

        const chain = this.trackFxChains[this.currentTrack];
        if (!chain) return;

        const temp = chain[this.selectedChain];
        chain[this.selectedChain] = chain[this.selectedChain - 1];
        chain[this.selectedChain - 1] = temp;

        this.selectedChain--;
        this.renderTrackChain();
        this.selectChain(this.selectedChain);
    },

    // Move selected chain item down
    moveDown: function() {
        const chain = this.trackFxChains[this.currentTrack];
        if (!chain) return;
        if (this.selectedChain === null || this.selectedChain >= chain.length - 1) return;

        const temp = chain[this.selectedChain];
        chain[this.selectedChain] = chain[this.selectedChain + 1];
        chain[this.selectedChain + 1] = temp;

        this.selectedChain++;
        this.renderTrackChain();
        this.selectChain(this.selectedChain);
    },

    // Filter plugins by search term
    filterPlugins: function(filter) {
        this.renderAvailablePlugins(filter);
    },

    // Apply the FX chain to JUCE
    apply: function() {
        const chain = this.trackFxChains[this.currentTrack] || [];

        console.log('[FxChain] Applying FX chain for track', this.currentTrack, ':', chain);

        // Send to JUCE via AudioBridge
        if (typeof AudioBridge !== 'undefined') {
            AudioBridge.send('setTrackFxChain', {
                trackIndex: this.currentTrack,
                plugins: chain.map(p => ({
                    name: p.name,
                    id: p.id,
                    fileOrIdentifier: p.fileOrIdentifier || p.name
                }))
            });
        }

        this.hide();
    },

    // Called when JUCE sends plugin list update
    updatePluginList: function(plugins) {
        this.availablePlugins = plugins;
        if (this.isVisible) {
            this.renderAvailablePlugins();
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    FxChain.init();
});
