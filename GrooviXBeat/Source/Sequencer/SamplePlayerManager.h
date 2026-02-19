/*
    SamplePlayerManager - Manages SamplePlayerPlugin instances for all tracks

    Provides:
    - Track-to-plugin mapping
    - High-level API for sample playback control
    - Live Mode scene triggering
    - Transport synchronization
*/

#pragma once

#include <JuceHeader.h>
#include "../Plugins/SamplePlayerPlugin.h"

class SamplePlayerManager
{
public:
    SamplePlayerManager();
    ~SamplePlayerManager();

    //==============================================================================
    // Plugin Instance Management

    /**
     * Create a SamplePlayerPlugin for a track.
     * Returns raw pointer - ownership is transferred to caller (typically PluginGraph).
     */
    SamplePlayerPlugin* createPlayerForTrack(int trackIndex);

    /**
     * Register an existing plugin instance for a track.
     * Use this if the plugin is created elsewhere (e.g., by PluginGraph).
     */
    void registerPlayerForTrack(int trackIndex, SamplePlayerPlugin* player);

    /**
     * Unregister a plugin (e.g., when removing from graph).
     * Does NOT delete the plugin.
     */
    void unregisterPlayerForTrack(int trackIndex);

    /** Get the plugin for a track, or nullptr if not found */
    SamplePlayerPlugin* getPlayerForTrack(int trackIndex);

    /** Get number of registered players */
    int getNumPlayers() const;

    //==============================================================================
    // Direct Playback Control (immediate, no quantization)

    /** Load and immediately play a sample file */
    void playSampleFile(int trackIndex, const juce::String& filePath, double offset = 0.0, bool loop = false, double loopLengthBeats = 0.0);

    /** Reload a sample file from disk (force refresh after file was modified) */
    void reloadSampleFile(int trackIndex, const juce::String& filePath);

    /** Stop sample on a track immediately */
    void stopSampleFile(int trackIndex);

    /** Stop all samples immediately */
    void stopAllSamples();

    //==============================================================================
    // Live Mode API (quantized playback)

    /** Queue a sample to play at next quantization boundary */
    void queueSampleFile(int trackIndex, const juce::String& filePath, double offset = 0.0);

    /**
     * Queue a sample for seamless Live Mode transition.
     * Unlike queueSampleFile, this keeps the current sample playing until
     * the quantize boundary, then atomically switches to the new sample.
     * This eliminates gaps between clips in Live Mode.
     *
     * @param targetStartSample  Absolute audio-thread sample position at which to
     *                           start playback.  The SamplePlayerPlugin checks this
     *                           in its processBlock() for sample-accurate triggering.
     *                           Pass -1 to fall back to the syncToTransport path.
     */
    void queueSampleFileSeamless(int trackIndex, const juce::String& filePath,
                                  double offset, bool loop, double loopLengthBeats,
                                  int64_t targetStartSample = -1);

    /**
     * Queue stop at next quantization boundary.
     *
     * @param targetStopSample  Absolute audio-thread sample position at which to
     *                          stop playback.  Pass -1 to use syncToTransport path.
     */
    void queueStopSample(int trackIndex, int64_t targetStopSample = -1);

    /** Cancel queued action for a track */
    void cancelQueuedSample(int trackIndex);

    /** Set loop length for a track in beats */
    void setTrackLoopLengthBeats(int trackIndex, double beats);

    /** Set loop length for a track in bars (assumes 4/4 time) */
    void setTrackLoopLengthBars(int trackIndex, double bars);

    //==============================================================================
    // Scene Triggering

    /** Info about a clip in a scene */
    struct SceneClipInfo
    {
        int trackIndex;
        juce::String filePath;
        double loopLengthBeats;     // Loop length in beats (quarter notes)
        double offset;              // Start offset in seconds

        SceneClipInfo() : trackIndex(0), loopLengthBeats(16.0), offset(0.0) {}
        SceneClipInfo(int track, const juce::String& path, double loopBeats = 16.0, double off = 0.0)
            : trackIndex(track), filePath(path), loopLengthBeats(loopBeats), offset(off) {}
    };

    /**
     * Trigger an entire scene - stops current samples and queues all clips in the scene.
     * @param sceneIndex Scene number (for logging)
     * @param clips Vector of clip info for each track in the scene
     */
    void triggerScene(int sceneIndex, const std::vector<SceneClipInfo>& clips);

    /** Stop all samples in a scene (queue stop at next boundary) */
    void stopScene();

    //==============================================================================
    // Transport Sync (call from audio thread)

    /**
     * Sync all players with the transport.
     * Should be called from the audio thread's processBlock.
     *
     * @param transportPositionBeats Current position in quarter notes (ppq)
     * @param bpm Current tempo
     * @param quantizeSteps Quantization in 1/16th notes (4 = 1 beat, 16 = 1 bar)
     * @param transportPlaying Whether transport is currently playing
     */
    void processTransportSync(double transportPositionBeats,
                              double bpm,
                              int quantizeSteps,
                              bool transportPlaying);

    /** Get current quantize setting */
    int getQuantizeSteps() const { return currentQuantizeSteps; }

    /** Set quantize steps (1/16th notes: 4 = 1 beat, 16 = 1 bar, 64 = 4 bars) */
    void setQuantizeSteps(int steps) { currentQuantizeSteps = steps; }

    //==============================================================================
    // State Queries

    /** Check if any sample is currently playing */
    bool isAnySamplePlaying() const;

    /** Check if any sample is queued */
    bool isAnySampleQueued() const;

    /** Get list of all track indices with registered players */
    std::vector<int> getTrackIndices() const;

    //==============================================================================
    // Sample Caching for Live Mode

    /**
     * Preload samples into memory cache for instant Live Mode playback.
     * Called when entering Live Mode to eliminate disk I/O delays.
     */
    void preloadSamplesForLiveMode(const juce::StringArray& samplePaths);

    /** Clear the sample cache (called when exiting Live Mode or to free memory) */
    void clearSampleCache();

    /**
     * Reset all players for Live Mode (clears stale file paths and sources).
     * Also synchronises each player's internal sample-position counter to
     * currentAudioPosition so it matches the MidiClipScheduler's counter and
     * targetStartSample comparisons work correctly.
     */
    void resetAllPlayersForLiveMode(int64_t currentAudioPosition = 0);

    /** Get a cached sample buffer, or nullptr if not cached */
    juce::AudioBuffer<float>* getCachedSample(const juce::String& filePath);

    /** Check if a sample is in the cache */
    bool isSampleCached(const juce::String& filePath) const;

private:
    std::map<int, SamplePlayerPlugin*> trackPlayers;
    mutable juce::CriticalSection lock;

    int currentQuantizeSteps = 16;  // Default: 1 bar

    // Sample cache for Live Mode - stores audio buffers keyed by file path
    struct CachedSample
    {
        juce::AudioBuffer<float> buffer;
        double sampleRate = 0.0;
        juce::String filePath;
    };
    std::map<juce::String, std::unique_ptr<CachedSample>> sampleCache;
    mutable juce::CriticalSection cacheLock;
    juce::AudioFormatManager cacheFormatManager;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SamplePlayerManager)
};
