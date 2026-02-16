/*
    SampleDSP - Static DSP algorithms for sample editing
*/

#include "SampleDSP.h"
#include <algorithm>
#include <cmath>
#include <map>
#include <vector>

//==============================================================================
// Time Stretching

void SampleDSP::timeStretch(const juce::AudioBuffer<float>& source,
                             juce::AudioBuffer<float>& dest,
                             double ratio)
{
    if (source.getNumSamples() == 0 || ratio <= 0.0)
        return;

    int numChannels = source.getNumChannels();
    int oldLength = source.getNumSamples();
    int newLength = static_cast<int>(std::round(oldLength * ratio));

    if (newLength <= 0)
        return;

    dest.setSize(numChannels, newLength);

    // Linear interpolation time stretching
    for (int ch = 0; ch < numChannels; ++ch)
    {
        const float* srcData = source.getReadPointer(ch);
        float* dstData = dest.getWritePointer(ch);

        for (int i = 0; i < newLength; ++i)
        {
            double srcIndex = static_cast<double>(i) / ratio;
            int idx0 = static_cast<int>(srcIndex);
            int idx1 = juce::jmin(idx0 + 1, oldLength - 1);
            double frac = srcIndex - static_cast<double>(idx0);

            // Linear interpolation between adjacent samples
            dstData[i] = static_cast<float>(
                srcData[idx0] * (1.0 - frac) + srcData[idx1] * frac
            );
        }
    }
}

//==============================================================================
// BPM Detection

double SampleDSP::detectBPM(const juce::AudioBuffer<float>& buffer, double sampleRate)
{
    if (buffer.getNumSamples() == 0 || sampleRate <= 0.0)
        return 0.0;

    // Use first channel for analysis
    const float* channelData = buffer.getReadPointer(0);
    int numSamples = buffer.getNumSamples();

    // Downsample by factor of 4 for faster processing
    const int downsampleFactor = 4;
    std::vector<float> downsampled;
    downsampled.reserve(numSamples / downsampleFactor + 1);

    for (int i = 0; i < numSamples; i += downsampleFactor)
    {
        float sum = 0.0f;
        int count = 0;
        for (int j = 0; j < downsampleFactor && (i + j) < numSamples; ++j)
        {
            sum += std::abs(channelData[i + j]);
            ++count;
        }
        downsampled.push_back(sum / static_cast<float>(count));
    }

    double downsampledRate = sampleRate / static_cast<double>(downsampleFactor);

    // Calculate threshold for peak detection
    float threshold = calculateThreshold(downsampled);

    // Minimum distance between peaks (100ms = 600 BPM max)
    int minPeakDistance = static_cast<int>(downsampledRate * 0.1);

    // Find peaks (onset detection)
    std::vector<int> peaks = findPeaks(downsampled, threshold, minPeakDistance);

    if (peaks.size() < 2)
    {
        // Fallback: estimate from duration assuming 4 bars
        double duration = static_cast<double>(numSamples) / sampleRate;
        const int assumedBars = 4;
        const int beatsPerBar = 4;
        return std::round((assumedBars * beatsPerBar * 60.0) / duration);
    }

    // Find most common interval between peaks
    int mostCommonInterval = findMostCommonInterval(peaks);

    if (mostCommonInterval <= 0)
        return 0.0;

    // Convert interval to BPM
    double secondsPerBeat = static_cast<double>(mostCommonInterval) / downsampledRate;
    double bpm = 60.0 / secondsPerBeat;

    // Normalize to reasonable BPM range (60-180)
    while (bpm < 60.0) bpm *= 2.0;
    while (bpm > 180.0) bpm /= 2.0;

    return std::round(bpm);
}

float SampleDSP::calculateThreshold(const std::vector<float>& data)
{
    if (data.empty())
        return 0.0f;

    // Calculate mean
    double sum = 0.0;
    for (float sample : data)
    {
        sum += sample;
    }
    float mean = static_cast<float>(sum / static_cast<double>(data.size()));

    // Threshold is 1.5x the mean (same as JS implementation)
    return mean * 1.5f;
}

std::vector<int> SampleDSP::findPeaks(const std::vector<float>& envelope,
                                       float threshold,
                                       int minPeakDistance)
{
    std::vector<int> peaks;
    int lastPeakIndex = -minPeakDistance;

    for (int i = 1; i < static_cast<int>(envelope.size()) - 1; ++i)
    {
        // Check if this is a peak (local maximum above threshold)
        if (envelope[i] > threshold &&
            envelope[i] > envelope[i - 1] &&
            envelope[i] > envelope[i + 1] &&
            (i - lastPeakIndex) >= minPeakDistance)
        {
            peaks.push_back(i);
            lastPeakIndex = i;
        }
    }

    return peaks;
}

int SampleDSP::findMostCommonInterval(const std::vector<int>& peaks)
{
    if (peaks.size() < 2)
        return 0;

    // Calculate intervals between consecutive peaks
    std::vector<int> intervals;
    intervals.reserve(peaks.size() - 1);

    for (size_t i = 1; i < peaks.size(); ++i)
    {
        intervals.push_back(peaks[i] - peaks[i - 1]);
    }

    // Group similar intervals (within 5%) and count occurrences
    std::map<int, int> intervalCounts;

    for (int interval : intervals)
    {
        // Round to nearest 10 for grouping
        int rounded = (interval / 10) * 10;
        intervalCounts[rounded]++;
    }

    // Find most common interval
    int mostCommonInterval = intervals[0];
    int maxCount = 0;

    for (const auto& pair : intervalCounts)
    {
        if (pair.second > maxCount)
        {
            maxCount = pair.second;
            mostCommonInterval = pair.first;
        }
    }

    return mostCommonInterval;
}

//==============================================================================
// Fade Operations

void SampleDSP::fadeIn(juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    int bufferLength = buffer.getNumSamples();

    // Validate range
    startSample = juce::jmax(0, startSample);
    numSamples = juce::jmin(numSamples, bufferLength - startSample);

    if (numSamples <= 0)
        return;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        float* data = buffer.getWritePointer(ch);

        for (int i = 0; i < numSamples; ++i)
        {
            float gain = static_cast<float>(i) / static_cast<float>(numSamples);
            data[startSample + i] *= gain;
        }
    }
}

void SampleDSP::fadeOut(juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    int bufferLength = buffer.getNumSamples();

    // Validate range
    startSample = juce::jmax(0, startSample);
    numSamples = juce::jmin(numSamples, bufferLength - startSample);

    if (numSamples <= 0)
        return;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        float* data = buffer.getWritePointer(ch);

        for (int i = 0; i < numSamples; ++i)
        {
            float gain = 1.0f - (static_cast<float>(i) / static_cast<float>(numSamples));
            data[startSample + i] *= gain;
        }
    }
}

//==============================================================================
// Silence

void SampleDSP::silence(juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    int bufferLength = buffer.getNumSamples();

    // Validate range
    startSample = juce::jmax(0, startSample);
    numSamples = juce::jmin(numSamples, bufferLength - startSample);

    if (numSamples <= 0)
        return;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        buffer.clear(ch, startSample, numSamples);
    }
}

//==============================================================================
// Transient Detection

std::vector<double> SampleDSP::detectTransients(const juce::AudioBuffer<float>& buffer, double sampleRate)
{
    std::vector<double> transients;

    if (buffer.getNumSamples() == 0 || sampleRate <= 0.0)
        return transients;

    // Use first channel for analysis
    const float* channelData = buffer.getReadPointer(0);
    int numSamples = buffer.getNumSamples();

    // Parameters for transient detection
    const int windowSize = static_cast<int>(sampleRate * 0.01);  // 10ms window
    const int hopSize = windowSize / 2;  // 50% overlap
    const double minTimeBetweenTransients = 0.05;  // 50ms minimum between transients
    const int minSamplesBetween = static_cast<int>(minTimeBetweenTransients * sampleRate);

    // Calculate onset detection function (spectral flux approximation using amplitude difference)
    std::vector<float> onsetFunction;
    onsetFunction.reserve(numSamples / hopSize);

    float prevEnergy = 0.0f;

    for (int i = 0; i < numSamples - windowSize; i += hopSize)
    {
        // Calculate RMS energy in this window
        float energy = 0.0f;
        for (int j = 0; j < windowSize; ++j)
        {
            float sample = channelData[i + j];
            energy += sample * sample;
        }
        energy = std::sqrt(energy / static_cast<float>(windowSize));

        // Onset function is the positive difference (half-wave rectified)
        float onset = std::max(0.0f, energy - prevEnergy);
        onsetFunction.push_back(onset);

        prevEnergy = energy;
    }

    if (onsetFunction.empty())
        return transients;

    // Calculate adaptive threshold (mean + 1.5 * standard deviation)
    double sum = 0.0;
    for (float val : onsetFunction)
        sum += val;
    float mean = static_cast<float>(sum / static_cast<double>(onsetFunction.size()));

    double sqSum = 0.0;
    for (float val : onsetFunction)
    {
        float diff = val - mean;
        sqSum += diff * diff;
    }
    float stdDev = static_cast<float>(std::sqrt(sqSum / static_cast<double>(onsetFunction.size())));

    float threshold = mean + 1.5f * stdDev;

    // Ensure minimum threshold
    threshold = std::max(threshold, mean * 2.0f);

    // Peak picking with local maximum check
    int lastTransientSample = -minSamplesBetween;

    for (size_t i = 2; i < onsetFunction.size() - 2; ++i)
    {
        // Check if this is a local maximum above threshold
        if (onsetFunction[i] > threshold &&
            onsetFunction[i] > onsetFunction[i - 1] &&
            onsetFunction[i] > onsetFunction[i - 2] &&
            onsetFunction[i] >= onsetFunction[i + 1] &&
            onsetFunction[i] >= onsetFunction[i + 2])
        {
            int samplePosition = static_cast<int>(i) * hopSize;

            // Check minimum time between transients
            if (samplePosition - lastTransientSample >= minSamplesBetween)
            {
                double timeInSeconds = static_cast<double>(samplePosition) / sampleRate;
                transients.push_back(timeInSeconds);
                lastTransientSample = samplePosition;
            }
        }
    }

    DBG("SampleDSP: Detected " + juce::String(static_cast<int>(transients.size())) + " transients");

    return transients;
}

//==============================================================================
// Resampling

void SampleDSP::resample(const juce::AudioBuffer<float>& source,
                          juce::AudioBuffer<float>& dest,
                          double sourceSampleRate,
                          double targetSampleRate)
{
    if (source.getNumSamples() == 0 || sourceSampleRate <= 0.0 || targetSampleRate <= 0.0)
        return;

    // If sample rates match, just copy
    if (std::abs(sourceSampleRate - targetSampleRate) < 0.01)
    {
        dest.makeCopyOf(source);
        return;
    }

    int numChannels = source.getNumChannels();
    int sourceLength = source.getNumSamples();

    // Calculate output length
    double ratio = targetSampleRate / sourceSampleRate;
    int destLength = static_cast<int>(std::ceil(sourceLength * ratio));

    dest.setSize(numChannels, destLength);

    // Use JUCE's LagrangeInterpolator for high-quality resampling
    for (int ch = 0; ch < numChannels; ++ch)
    {
        juce::LagrangeInterpolator interpolator;
        interpolator.reset();

        const float* srcData = source.getReadPointer(ch);
        float* dstData = dest.getWritePointer(ch);

        // speedRatio = source rate / target rate
        // e.g., 44100 -> 48000: speedRatio = 44100/48000 = 0.91875
        double speedRatio = sourceSampleRate / targetSampleRate;

        int samplesUsed = interpolator.process(speedRatio, srcData, dstData, destLength);

        // If we didn't use all samples (shouldn't happen normally), that's ok
        juce::ignoreUnused(samplesUsed);
    }

    DBG("SampleDSP: Resampled from " + juce::String(sourceSampleRate) + " Hz to " +
        juce::String(targetSampleRate) + " Hz (" + juce::String(sourceLength) +
        " -> " + juce::String(destLength) + " samples)");
}

//==============================================================================
// Utility

void SampleDSP::normalize(juce::AudioBuffer<float>& buffer, float targetPeak)
{
    if (buffer.getNumSamples() == 0)
        return;

    // Find current peak
    float currentPeak = 0.0f;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        for (int i = 0; i < buffer.getNumSamples(); ++i)
        {
            float sample = std::abs(buffer.getSample(ch, i));
            if (sample > currentPeak)
                currentPeak = sample;
        }
    }

    if (currentPeak <= 0.0f)
        return;

    // Calculate and apply gain
    float gain = targetPeak / currentPeak;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        buffer.applyGain(ch, 0, buffer.getNumSamples(), gain);
    }
}

float SampleDSP::calculateRMS(const juce::AudioBuffer<float>& buffer)
{
    if (buffer.getNumSamples() == 0)
        return 0.0f;

    double sumSquares = 0.0;
    int totalSamples = 0;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
        {
            sumSquares += static_cast<double>(data[i]) * static_cast<double>(data[i]);
            ++totalSamples;
        }
    }

    if (totalSamples == 0)
        return 0.0f;

    return static_cast<float>(std::sqrt(sumSquares / static_cast<double>(totalSamples)));
}
