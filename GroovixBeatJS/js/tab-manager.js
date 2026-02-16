// Tab Manager - Handles switching between Song, Editor, and Mixer tabs

const TabManager = {
    currentTab: 'song',
    clipEditorMoved: false,
    hasClipSelected: false,

    init: function() {
        // Set up tab click handlers
        document.querySelectorAll('.main-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Move clip editor into editor tab on first use
        this.setupClipEditorForTabs();
    },

    switchTab: function(tabName) {
        // Allow switching to same tab to refresh
        const isSameTab = this.currentTab === tabName;

        // Update tab button states
        document.querySelectorAll('.main-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content visibility
        document.querySelectorAll('.main-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });

        this.currentTab = tabName;

        // Handle tab-specific logic
        if (tabName === 'editor') {
            this.showEditor();
        } else if (tabName === 'mixer') {
            this.showMixer();
        } else if (tabName === 'song') {
            this.showSong();
        }
    },

    setupClipEditorForTabs: function() {
        // Get the clip editor element
        const clipEditor = document.querySelector('.clip-editor');
        const editorTabContent = document.getElementById('editorTabContent');
        const overlay = document.getElementById('clipEditorOverlay');

        if (clipEditor && editorTabContent && overlay) {
            // Create placeholder for when no clip is selected
            const placeholder = document.createElement('div');
            placeholder.id = 'editorPlaceholder';
            placeholder.className = 'editor-placeholder';
            placeholder.innerHTML = '<p style="color: #666; text-align: center; padding: 60px; font-size: 14px;">Select a clip from the Song tab to edit</p>';
            editorTabContent.appendChild(placeholder);

            // Move clip editor from overlay to tab content
            editorTabContent.appendChild(clipEditor);

            // Initially hide the editor, show placeholder
            clipEditor.style.display = 'none';

            // Hide the empty overlay
            overlay.style.display = 'none';

            this.clipEditorMoved = true;
        }
    },

    showEditor: function() {
        const clipEditor = document.querySelector('#editorTabContent .clip-editor');
        const placeholder = document.getElementById('editorPlaceholder');

        if (typeof ClipEditor !== 'undefined' && this.hasClipSelected) {
            // Show editor, hide placeholder
            if (clipEditor) clipEditor.style.display = 'flex';
            if (placeholder) placeholder.style.display = 'none';

            // Update mode selector to show/hide SampleEditor based on track mode
            ClipEditor.updateModeSelector();

            // Render the editor for current clip
            ClipEditor.initializeEditor();
            ClipEditor.renderTrackButtons();

            // Only render piano roll if not in sample mode
            const mode = ClipEditor.getTrackMode(AppState.currentTrack);
            if (mode !== 'sample') {
                ClipEditor.renderPianoKeys();
                ClipEditor.renderPianoGrid();
            }
        } else {
            // Show placeholder, hide editor
            if (clipEditor) clipEditor.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    },

    showMixer: function() {
        // Ensure mixer is rendered
        if (typeof SongScreen !== 'undefined' && SongScreen.renderSongMixer) {
            SongScreen.renderSongMixer();
        }
    },

    showSong: function() {
        // Update clip visuals when returning to song view
        if (typeof SongScreen !== 'undefined' && this.hasClipSelected) {
            for (let t = 0; t < AppState.numTracks; t++) {
                SongScreen.updateClipVisual(AppState.currentScene, t);
            }
        }
    },

    // Mark that a clip has been selected (called from ClipEditor.open)
    setClipSelected: function(selected) {
        this.hasClipSelected = selected;
    },

    // Get current tab
    getCurrentTab: function() {
        return this.currentTab;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TabManager.init();
});
