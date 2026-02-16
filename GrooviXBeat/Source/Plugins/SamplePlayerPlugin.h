/*
    SamplePlayerPlugin - Internal audio processor for sample playback

    Features:
    - Load and play audio files (wav, mp3, aiff, flac, ogg)
    - Immediate or quantized (queued) playback for Live Mode
    - Transport-synced looping
    - Per-track instance allows individual effects chains
    - In-memory editable buffer support for sample editing
*/

#pragma once

#include <JuceHeader.h>
#include "../Audio/SampleEditor.h"

class SamplePlayerPlugin : public juce::AudioProcessor
{
public:
    SamplePlayerPlugin();
    ~SamplePlayerPlugin() override;

    //==============================================================================
    // Sample Control API (called from SamplePlayerManager)

    /** Load an audio file. Returns true on success. */
    bool loadFile(const juce::String& filePath);

    /**
     * Load from a pre-cached audio buffer (for Live Mode instant playback).
     * The buffer is copied, so the original can be safely modified.
     */
    bool loadFromCachedBuffer(const juce::String& filePath,
                              const juce::AudioBuffer<float>& cachedBuffer,
                              double sampleRate);

    /** Start playback immediately */
    void play(double offsetSeconds = 0.0);

    /** Stop playback immediately */
    void stop();

    /** Set whether the sample should loop */
    void setLooping(bool shouldLoop);

    //==============================================================================
    // Live Mode API

    /** Queue playback to start at next quantization boundary */
    void queuePlay(double offsetSeconds = 0.0);

    /**
     * Load a file for pending playback in Live Mode.
     * The file is prepared but not activated until the next quantize boundary.
     * This allows seamless transitions where the old sample keeps playing
     * until the exact moment the new sample starts.
     */
    bool loadFileForPendingPlay(const juce::String& filePath, double offsetSeconds = 0.0);

    /**
     * Load from a cached buffer for pending playback in Live Mode.
     * Same as loadFileForPendingPlay but uses pre-loaded buffer instead of reading from disk.
     */
    bool loadCachedBufferForPendingPlay(const juce::String& filePath,
                                         const juce::AudioBuffer<float>& cachedBuffer,
                                         double sampleRate,
                                         double offsetSeconds = 0.0);

    /** Queue stop at next quantization boundary */
    void queueStop();

    /** Cancel any queued action */
    void cancelQueue();

    /** Set loop length in beats (e.g., 16 = 4 bars in 4/4) */
    void setLoopLengthBeats(double beats);

    /** Set loop length in seconds */
    void setLoopLengthSeconds(double seconds);

    /**
     * Sync with transport - call from audio thread
     * @param transportPositionBeats Current transport position in quarter notes
     * @param bpm Current tempo
     * @param quantizeSteps Quantization in 1/16th notes (e.g., 16 = 1 bar)
     * @param transportPlaying Whether transport is playing
     */
    void syncToTransport(double transportPositionBeats,
                         double bpm,
                         int quantizeSteps,
                         bool transportPlaying);

    //==============================================================================
    // State Queries

    bool isCurrentlyPlaying() const { return playing; }
    bool isQueued() const { return queuedToPlay || queuedToStop; }
    bool isQueuedToPlay() const { return queuedToPlay; }
    bool isQueuedToStop() const { return queuedToStop; }
    juce::String getCurrentFilePath() const { return currentFilePath; }
    double getLengthInSeconds() const;

    /** Check if player has a valid source ready for playback */
    bool hasValidSource() const;

    /** Reset player state (call when entering Live Mode to ensure clean state) */
    void resetForLiveMode();
    double getPositionSeconds() const;
    void setPositionSeconds(double position);

    //==============================================================================
    // Sample Editing API

    /**
     * Load a file for editing (into memory buffer).
     * After editing, call applyEdits() to use the edited version.
     */
    bool loadFileForEditing(const juce::String& filePath);

    /** Get the sample editor for this player (nullptr if not in edit mode) */
    SampleEditor* getSampleEditor() { return sampleEditor.get(); }
    const SampleEditor* getSampleEditor() const { return sampleEditor.get(); }

    /** Check if using editable buffer */
    bool isUsingEditableBuffer() const { return useEditableBuffer; }

    /** Apply edits and switch to using the edited buffer for playback */
    void applyEdits();

    /** Discard edits and return to file-based playback */
    void discardEdits();

    /** Reload from edited buffer after external modifications */
    void reloadFromEditedBuffer();

    //==============================================================================
    // Track assignment
    void setTrackIndex(int index) { trackIndex = index; }
    int getTrackIndex() const { return trackIndex; }

    //==============================================================================
    // AudioProcessor Implementation

    const juce::String getName() const override { return "Sample Track " + juce::String(trackIndex + 1); }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

private:
    //==============================================================================
    int trackIndex = 0;

    juce::AudioFormatManager formatManager;
    std::unique_ptr<juce::AudioFormatReaderSource> readerSource;
    juce::AudioTransportSource transportSource;

    // File info
    juce::String currentFilePath;
    double fileSampleRate = 44100.0;
    juce::int64 fileLengthSamples = 0;

    // Editable buffer support
    std::unique_ptr<SampleEditor> sampleEditor;
    bool useEditableBuffer = false;
    juce::int64 editablePlayPosition = 0;  // Current play position in editable buffer

    // Playback state
    bool playing = false;
    bool loopEnabled = true;
    double startOffset = 0.0;

    // Live Mode state
    bool queuedToPlay = false;
    bool queuedToStop = false;
    double queuedOffset = 0.0;

    // Pending file for seamless Live Mode transitions
    std::unique_ptr<juce::AudioFormatReaderSource> pendingReaderSource;
    juce::String pendingFilePath;
    double pendingFileSampleRate = 0.0;
    juce::int64 pendingFileLengthSamples = 0;
    bool hasPendingFile = false;

    // Pending cached buffer for seamless Live Mode transitions (from cache)
    juce::AudioBuffer<float> pendingCachedBuffer;
    bool hasPendingCachedBuffer = false;

    // Flag to force immediate start on next sync (for first clip in Live Mode)
    bool needsImmediateStart = false;

    // Loop settings (in beats, where 1 beat = 1 quarter note)
    double loopLengthBeats = 16.0;  // Default 4 bars in 4/4
    bool useBeatsForLoop = true;    // If false, use sample's natural length

    // Sample-accurate loop tracking
    juce::int64 samplesPlayedSinceStart = 0;
    juce::int64 loopLengthSamples = 0;  // Calculated from loopLengthBeats and BPM

    // Transport tracking for Live Mode
    double lastTransportBeat = 0.0;
    double sampleStartBeat = 0.0;   // Transport beat when sample started
    double currentBpm = 120.0;
    bool needsStartBeatInit = false; // Set when play() called, cleared when syncToTransport initializes sampleStartBeat

    // Prepared state
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;

    juce::CriticalSection lock;

    //==============================================================================
    void updatePlayingState();

    // Process audio from editable buffer
    void processFromEditableBuffer(juce::AudioBuffer<float>& buffer, int numSamples);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SamplePlayerPlugin)
};
