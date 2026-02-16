/*
    SampleDSP - Static DSP algorithms for sample editing

    Provides:
    - Time stretching (linear interpolation)
    - BPM detection (onset-based)
    - Fade in/out operations
    - Silence operation

    All methods are static and operate on AudioBuffer references.
*/

#pragma once

#include <JuceHeader.h>
#include <vector>

class SampleDSP
{
public:
    //==============================================================================
    // Time Stretching

    /**
     * Time stretch using linear interpolation.
     * @param source Input buffer
     * @param dest Output buffer (will be resized)
     * @param ratio Stretch ratio (2.0 = twice as long, 0.5 = half as long)
     */
    static void timeStretch(const juce::AudioBuffer<float>& source,
                            juce::AudioBuffer<float>& dest,
                            double ratio);

    //==============================================================================
    // BPM Detection

    /**
     * Detect BPM using onset detection and interval analysis.
     * @param buffer Audio buffer to analyze
     * @param sampleRate Sample rate of the audio
     * @return Detected BPM (normalized to 60-180 range), or 0 if detection fails
     */
    static double detectBPM(const juce::AudioBuffer<float>& buffer, double sampleRate);

    //==============================================================================
    // Fade Operations

    /**
     * Apply linear fade in.
     * @param buffer Buffer to modify (in-place)
     * @param startSample Starting sample index
     * @param numSamples Number of samples to fade
     */
    static void fadeIn(juce::AudioBuffer<float>& buffer, int startSample, int numSamples);

    /**
     * Apply linear fade out.
     * @param buffer Buffer to modify (in-place)
     * @param startSample Starting sample index
     * @param numSamples Number of samples to fade
     */
    static void fadeOut(juce::AudioBuffer<float>& buffer, int startSample, int numSamples);

    //==============================================================================
    // Silence

    /**
     * Zero out a region of the buffer.
     * @param buffer Buffer to modify (in-place)
     * @param startSample Starting sample index
     * @param numSamples Number of samples to silence
     */
    static void silence(juce::AudioBuffer<float>& buffer, int startSample, int numSamples);

    //==============================================================================
    // Transient Detection

    /**
     * Detect transient positions in the audio buffer.
     * Uses onset detection to find sudden amplitude increases (attacks).
     * @param buffer Audio buffer to analyze
     * @param sampleRate Sample rate of the audio
     * @return Vector of transient positions in seconds
     */
    static std::vector<double> detectTransients(const juce::AudioBuffer<float>& buffer, double sampleRate);

    //==============================================================================
    // Resampling

    /**
     * Resample audio to a different sample rate using high-quality interpolation.
     * @param source Input buffer
     * @param dest Output buffer (will be resized)
     * @param sourceSampleRate Original sample rate
     * @param targetSampleRate Desired sample rate
     */
    static void resample(const juce::AudioBuffer<float>& source,
                         juce::AudioBuffer<float>& dest,
                         double sourceSampleRate,
                         double targetSampleRate);

    //==============================================================================
    // Utility

    /**
     * Normalize buffer to peak amplitude.
     * @param buffer Buffer to modify (in-place)
     * @param targetPeak Target peak level (default 1.0)
     */
    static void normalize(juce::AudioBuffer<float>& buffer, float targetPeak = 1.0f);

    /**
     * Calculate RMS level of buffer.
     * @param buffer Buffer to analyze
     * @return RMS level (0.0 to 1.0)
     */
    static float calculateRMS(const juce::AudioBuffer<float>& buffer);

private:
    // Helper for BPM detection - calculate adaptive threshold
    static float calculateThreshold(const std::vector<float>& data);

    // Helper for BPM detection - find peaks in envelope
    static std::vector<int> findPeaks(const std::vector<float>& envelope,
                                       float threshold,
                                       int minPeakDistance);

    // Helper for BPM detection - find most common interval
    static int findMostCommonInterval(const std::vector<int>& peaks);

    SampleDSP() = delete;  // Static class, no instantiation
};
