/*
    SampleEditorBridge - Bridge between JavaScript UI and C++ sample editing

    Provides:
    - High-level API for sample editing operations called from JS
    - Track-based editing (routes operations to correct SamplePlayerPlugin)
    - BPM detection results
    - Editing state notifications
*/

#pragma once

#include <JuceHeader.h>
#include <vector>
#include <utility>
#include "SamplePlayerManager.h"
#include "../Plugins/SamplePlayerPlugin.h"

class SampleEditorBridge
{
public:
    SampleEditorBridge(SamplePlayerManager& manager);
    ~SampleEditorBridge();

    //==============================================================================
    // Load for Editing

    /**
     * Load a sample file for editing on a track.
     * This caches the file in memory for editing operations.
     * @param trackIndex Track to load for
     * @param filePath Path to audio file
     * @return true if load succeeded
     */
    bool loadForEditing(int trackIndex, const juce::String& filePath);

    //==============================================================================
    // Time Stretch / Warp

    /**
     * Apply time stretch to a track's sample.
     * @param trackIndex Track index
     * @param ratio Stretch ratio (2.0 = twice as long)
     * @param targetLengthSeconds If > 0, pad/trim to this length after stretching
     */
    void timeStretch(int trackIndex, double ratio, double targetLengthSeconds = 0.0);

    /**
     * Apply warp to match sample BPM to target BPM.
     * @param trackIndex Track index
     * @param sampleBPM Original BPM of sample (0 = auto-detect)
     * @param targetBPM Target BPM to match
     * @param targetLengthSeconds If > 0, pad/trim to this length after warping
     */
    void applyWarp(int trackIndex, double sampleBPM, double targetBPM, double targetLengthSeconds = 0.0);

    /**
     * Detect BPM of a track's sample.
     * @param trackIndex Track index
     * @return Detected BPM (60-180 range), or 0 if detection fails
     */
    double detectBPM(int trackIndex);

    //==============================================================================
    // Playback Offset

    /**
     * Set playback offset for a track.
     * @param trackIndex Track index
     * @param offsetSeconds Offset in seconds (can be negative)
     */
    void setPlaybackOffset(int trackIndex, double offsetSeconds);

    /**
     * Adjust offset by a delta amount.
     * @param trackIndex Track index
     * @param deltaSeconds Amount to adjust (positive or negative)
     */
    void offsetSample(int trackIndex, double deltaSeconds);

    /**
     * Get current playback offset.
     * @param trackIndex Track index
     * @return Offset in seconds
     */
    double getPlaybackOffset(int trackIndex);

    //==============================================================================
    // Fade Operations

    /**
     * Apply fade in to a time range.
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void fadeIn(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Apply fade out to a time range.
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void fadeOut(int trackIndex, double startSeconds, double endSeconds);

    //==============================================================================
    // Selection Operations

    /**
     * Silence a time range.
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void silence(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Trim to a time range (keep only this region).
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void trim(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Delete a time range (opposite of trim - remove this region).
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void deleteRange(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Copy a time range to internal clipboard.
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void copyRange(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Cut a time range (copy to clipboard and delete).
     * @param trackIndex Track index
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void cutRange(int trackIndex, double startSeconds, double endSeconds);

    /**
     * Paste clipboard contents at position.
     * @param trackIndex Track index
     * @param positionSeconds Position to insert at
     */
    void paste(int trackIndex, double positionSeconds);

    /**
     * Check if clipboard has data.
     * @param trackIndex Track index
     * @return true if clipboard has data
     */
    bool hasClipboardData(int trackIndex);

    //==============================================================================
    // Reset / Undo

    /**
     * Reset sample to original (undo all edits).
     * @param trackIndex Track index
     */
    void reset(int trackIndex);

    /**
     * Undo last operation.
     * @param trackIndex Track index
     */
    void undo(int trackIndex);

    /**
     * Redo previously undone operation.
     * @param trackIndex Track index
     */
    void redo(int trackIndex);

    /**
     * Check if undo is available.
     * @param trackIndex Track index
     * @return true if undo is possible
     */
    bool canUndo(int trackIndex);

    /**
     * Check if redo is available.
     * @param trackIndex Track index
     * @return true if redo is possible
     */
    bool canRedo(int trackIndex);

    //==============================================================================
    // Save

    /**
     * Save edited sample to file.
     * @param trackIndex Track index
     * @param filePath Path to save to
     * @return true if save succeeded
     */
    bool saveToFile(int trackIndex, const juce::String& filePath);

    /**
     * Flush all edited samples to disk.
     * For each track with an edited buffer, saves the buffer to its file path
     * and reloads the player from the file so all playback paths use the same data.
     * Call before Live Mode preload or project save.
     */
    void flushAllEditsToDisk();

    //==============================================================================
    // Query

    /**
     * Check if a track has a sample loaded for editing.
     * @param trackIndex Track index
     * @return true if sample is loaded
     */
    bool isLoadedForEditing(int trackIndex);

    /**
     * Get sample duration in seconds.
     * @param trackIndex Track index
     * @return Duration in seconds, or 0 if not loaded
     */
    double getDuration(int trackIndex);

    /**
     * Get detected/stored BPM.
     * @param trackIndex Track index
     * @return BPM value, or 0 if not detected
     */
    double getStoredBPM(int trackIndex);

    /**
     * Get detected transient positions.
     * @param trackIndex Track index
     * @return Vector of transient positions in seconds
     */
    std::vector<double> getTransients(int trackIndex);

    /**
     * Detect transients for a track's sample.
     * @param trackIndex Track index
     * @return Vector of transient positions in seconds
     */
    std::vector<double> detectTransients(int trackIndex);

    /**
     * Get waveform peaks for display.
     * Uses cached .peaks file if available, otherwise generates and caches.
     * @param trackIndex Track index
     * @param numPoints Number of points (typically canvas width)
     * @return Vector of min/max pairs
     */
    std::vector<std::pair<float, float>> getWaveformPeaks(int trackIndex, int numPoints);

    /**
     * Invalidate cached peaks for a track (call after editing).
     * @param trackIndex Track index
     */
    void invalidatePeaksCache(int trackIndex);

    /**
     * Get the current file path for a track's sample.
     * @param trackIndex Track index
     * @return File path, or empty string if not loaded
     */
    juce::String getCurrentFilePath(int trackIndex);

private:
    SamplePlayerManager& samplePlayerManager;

    // Track file paths for caching
    std::map<int, juce::String> trackFilePaths;

    // Get sample editor for a track (returns nullptr if not available)
    SampleEditor* getEditorForTrack(int trackIndex);

    // Flush a single track's editable buffer to disk and reload from file.
    // Returns the path saved to (may differ from original if extension changed), or empty on failure/no-op.
    juce::String flushTrackToDisk(int trackIndex);

    // Peaks cache helpers
    juce::File getPeaksCacheFile(const juce::String& sampleFilePath);
    bool loadPeaksFromCache(const juce::String& sampleFilePath, std::vector<std::pair<float, float>>& peaks, int expectedNumPoints);
    bool savePeaksToCache(const juce::String& sampleFilePath, const std::vector<std::pair<float, float>>& peaks);
    void deletePeaksCache(const juce::String& sampleFilePath);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SampleEditorBridge)
};
