/*
    SampleBuffer - Thread-safe container for editable audio data

    Provides:
    - In-memory audio buffer for editing
    - Original buffer preservation for non-destructive editing
    - Thread-safe access between audio and UI threads
    - Sample-level editing operations
*/

#pragma once

#include <JuceHeader.h>
#include <vector>
#include <utility>

class SampleBuffer
{
public:
    SampleBuffer();
    ~SampleBuffer();

    //==============================================================================
    // Loading and Saving

    /**
     * Load audio data from a file. Returns true on success.
     * @param file The audio file to load
     * @param targetSampleRate If > 0, resample to this rate. If 0, keep original rate.
     */
    bool loadFromFile(const juce::File& file, double targetSampleRate = 0.0);

    /** Save current buffer to a WAV file. Returns true on success. */
    bool saveToFile(const juce::File& file) const;

    /** Load from an existing AudioBuffer (makes a copy) */
    void loadFromBuffer(const juce::AudioBuffer<float>& source, double sourceSampleRate);

    /** Check if buffer has data loaded */
    bool hasData() const;

    /** Clear all data */
    void clear();

    //==============================================================================
    // Buffer Access (for playback)

    /** Get read pointer to channel data. Thread-safe via lock. */
    const float* getReadPointer(int channel) const;

    /** Copy samples to destination buffer for playback */
    void copyToBuffer(juce::AudioBuffer<float>& dest, int destStartSample,
                      int sourceStartSample, int numSamples) const;

    /** Get number of samples */
    int getNumSamples() const;

    /** Get number of channels */
    int getNumChannels() const;

    /** Get sample rate */
    double getSampleRate() const { return sampleRate; }

    /** Get duration in seconds */
    double getDurationSeconds() const;

    //==============================================================================
    // Waveform Data for UI Display

    /**
     * Get waveform peaks for display.
     * @param numPoints Number of points to return (typically canvas width)
     * @return Vector of min/max pairs for each point
     */
    std::vector<std::pair<float, float>> getWaveformPeaks(int numPoints) const;

    //==============================================================================
    // Edit Operations (modify current buffer)

    /** Apply fade in over specified sample range */
    void fadeIn(int startSample, int numSamples);

    /** Apply fade out over specified sample range */
    void fadeOut(int startSample, int numSamples);

    /** Silence specified sample range */
    void silence(int startSample, int numSamples);

    /** Trim buffer to specified range */
    void trim(int startSample, int numSamples);

    /** Delete a range from the buffer (opposite of trim - removes the selection) */
    void deleteRange(int startSample, int numSamples);

    /** Copy a range from the buffer to a new buffer */
    juce::AudioBuffer<float> copyRange(int startSample, int numSamples) const;

    /** Insert another buffer at a specified position */
    void insertBuffer(const juce::AudioBuffer<float>& source, int insertPosition);

    /** Time stretch the buffer by a ratio (e.g., 2.0 = twice as long)
     *  @param ratio Stretch ratio
     *  @param targetLengthSeconds If > 0, pad/trim to this length after stretching
     */
    void timeStretch(double ratio, double targetLengthSeconds = 0.0);

    /** Apply warp to match target BPM (uses detected or stored BPM)
     *  @param targetBPM Target BPM to match
     *  @param targetLengthSeconds If > 0, pad/trim to this length after warping
     */
    void applyWarp(double targetBPM, double targetLengthSeconds = 0.0);

    /** Pad or trim buffer to exact length
     *  @param targetLengthSeconds Target length in seconds
     */
    void padOrTrimToLength(double targetLengthSeconds);

    //==============================================================================
    // BPM Detection and Storage

    /** Detect BPM from buffer content */
    double detectBPM();

    /** Get stored/detected BPM */
    double getDetectedBPM() const { return detectedBPM; }

    /** Set BPM manually (for user override) */
    void setDetectedBPM(double bpm) { detectedBPM = bpm; }

    //==============================================================================
    // Transient Detection

    /** Detect transients in the buffer */
    void detectTransients();

    /** Get detected transient positions in seconds */
    const std::vector<double>& getTransients() const { return transients; }

    /** Clear transient data */
    void clearTransients() { transients.clear(); }

    //==============================================================================
    // Non-Destructive Editing Support

    /** Store current state as original (for reset) */
    void storeAsOriginal();

    /** Check if original buffer is stored */
    bool hasOriginal() const;

    /** Reset to original buffer */
    void reset();

    /** Get current stretch factor (1.0 = no stretch) */
    double getStretchFactor() const { return stretchFactor; }

    //==============================================================================
    // Playback Offset

    /** Set playback offset in seconds (can be negative) */
    void setPlaybackOffset(double offsetSeconds) { playbackOffset = offsetSeconds; }

    /** Get playback offset in seconds */
    double getPlaybackOffset() const { return playbackOffset; }

    //==============================================================================
    // Thread Safety

    /** Get lock for external synchronization if needed */
    juce::CriticalSection& getLock() { return lock; }

private:
    juce::AudioBuffer<float> data;          // Main editable buffer
    juce::AudioBuffer<float> originalData;  // Original for non-destructive operations
    double sampleRate = 44100.0;
    double detectedBPM = 0.0;
    double stretchFactor = 1.0;
    double playbackOffset = 0.0;
    std::vector<double> transients;         // Detected transient positions in seconds

    juce::AudioFormatManager formatManager;
    mutable juce::CriticalSection lock;

    // Internal helper for time stretching
    void timeStretchInternal(const juce::AudioBuffer<float>& source,
                            juce::AudioBuffer<float>& dest,
                            double ratio);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SampleBuffer)
};
