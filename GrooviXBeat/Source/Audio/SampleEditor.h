/*
    SampleEditor - High-level sample editing API with undo support

    Provides:
    - File loading and saving
    - All editing operations with automatic undo state management
    - Undo/redo functionality
    - Range-based editing (start time, end time in seconds)
*/

#pragma once

#include <JuceHeader.h>
#include "SampleBuffer.h"

class SampleEditor
{
public:
    SampleEditor();
    ~SampleEditor();

    //==============================================================================
    // File Operations

    /**
     * Load audio file into buffer. Returns true on success.
     * @param file The audio file to load
     * @param targetSampleRate If > 0, resample to this rate. If 0, keep original rate.
     */
    bool loadFromFile(const juce::File& file, double targetSampleRate = 0.0);

    /**
     * Load from a pre-existing audio buffer (e.g., from cache).
     * @param sourceBuffer The audio buffer to copy from
     * @param sampleRate The sample rate of the buffer
     */
    bool loadFromBuffer(const juce::AudioBuffer<float>& sourceBuffer, double sampleRate);

    /** Save current buffer to file. Returns true on success. */
    bool saveToFile(const juce::File& file);

    /** Check if sample is loaded */
    bool isLoaded() const;

    /** Get currently loaded file path */
    juce::String getFilePath() const { return currentFilePath; }

    /** Update the stored file path (e.g., after saving with a new extension) */
    void setFilePath(const juce::String& path) { currentFilePath = path; }

    /** Clear the loaded sample */
    void clear();

    //==============================================================================
    // Buffer Access

    /** Get the underlying sample buffer */
    SampleBuffer* getBuffer() { return buffer.get(); }
    const SampleBuffer* getBuffer() const { return buffer.get(); }

    /** Get sample rate */
    double getSampleRate() const;

    /** Get duration in seconds */
    double getDurationSeconds() const;

    /** Get number of samples */
    int getNumSamples() const;

    /** Get number of channels */
    int getNumChannels() const;

    //==============================================================================
    // Editing Operations (time-based, in seconds)

    /**
     * Time stretch the sample.
     * @param ratio Stretch ratio (2.0 = twice as long, 0.5 = half as long)
     * @param targetLengthSeconds If > 0, pad/trim to this length after stretching
     */
    void timeStretch(double ratio, double targetLengthSeconds = 0.0);

    /**
     * Apply warp to match sample BPM to target BPM.
     * @param sampleBPM The BPM of the sample (or 0 to auto-detect)
     * @param targetBPM The target BPM to match
     * @param targetLengthSeconds If > 0, pad/trim to this length after warping
     */
    void applyWarp(double sampleBPM, double targetBPM, double targetLengthSeconds = 0.0);

    /**
     * Detect BPM from sample.
     * @return Detected BPM (60-180 range)
     */
    double detectBPM();

    /**
     * Apply fade in over time range.
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void fadeIn(double startSeconds, double endSeconds);

    /**
     * Apply fade out over time range.
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void fadeOut(double startSeconds, double endSeconds);

    /**
     * Silence a time range.
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void silence(double startSeconds, double endSeconds);

    /**
     * Trim to time range (keep only this region).
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void trim(double startSeconds, double endSeconds);

    /**
     * Delete a time range (remove this region, opposite of trim).
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void deleteRange(double startSeconds, double endSeconds);

    /**
     * Copy a time range to the internal clipboard.
     * @param startSeconds Start time in seconds
     * @param endSeconds End time in seconds
     */
    void copyRange(double startSeconds, double endSeconds);

    /**
     * Insert clipboard contents at specified position.
     * @param positionSeconds Position to insert at (in seconds)
     */
    void insertClipboard(double positionSeconds);

    /** Check if clipboard has data */
    bool hasClipboardData() const;

    /** Clear the clipboard */
    void clearClipboard();

    //==============================================================================
    // Playback Offset

    /** Set playback offset in seconds (can be negative) */
    void setPlaybackOffset(double offsetSeconds);

    /** Get playback offset in seconds */
    double getPlaybackOffset() const;

    /** Adjust offset by delta */
    void offsetBy(double deltaSeconds);

    //==============================================================================
    // Non-Destructive Editing

    /** Reset to original (undo all edits since load) */
    void reset();

    //==============================================================================
    // Undo/Redo

    /** Push current state onto undo stack */
    void pushUndoState();

    /** Undo last operation */
    void undo();

    /** Redo previously undone operation */
    void redo();

    /** Check if undo is available */
    bool canUndo() const;

    /** Check if redo is available */
    bool canRedo() const;

    /** Clear undo history */
    void clearUndoHistory();

    //==============================================================================
    // Undo Settings

    /** Set maximum number of undo states (default 10) */
    void setMaxUndoStates(int maxStates);

    /** Get maximum undo states */
    int getMaxUndoStates() const { return maxUndoStates; }

private:
    std::unique_ptr<SampleBuffer> buffer;
    juce::String currentFilePath;

    // Clipboard for copy/paste operations
    juce::AudioBuffer<float> clipboard;
    double clipboardSampleRate = 0.0;

    // Undo/Redo system
    struct UndoState
    {
        juce::AudioBuffer<float> data;
        double sampleRate;
        double detectedBPM;
        double stretchFactor;
        double playbackOffset;
    };

    std::vector<UndoState> undoStack;
    std::vector<UndoState> redoStack;
    int maxUndoStates = 10;

    // Helpers
    int secondsToSamples(double seconds) const;
    UndoState captureState() const;
    void restoreState(const UndoState& state);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SampleEditor)
};
