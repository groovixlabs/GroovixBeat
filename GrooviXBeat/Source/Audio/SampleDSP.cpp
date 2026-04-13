/*
    SampleDSP - Static DSP algorithms for sample editing
*/

#include "SampleDSP.h"
#include <algorithm>
#include <cmath>
#include <vector>

//==============================================================================
// Time Stretching

void SampleDSP::timeStretch(const juce::AudioBuffer<float>& source,
                             juce::AudioBuffer<float>& dest,
                             double ratio)
{
    if (source.getNumSamples() == 0 || ratio <= 0.0)
        return;

    const int numChannels = source.getNumChannels();
    const int srcLen      = source.getNumSamples();
    const int dstLen      = static_cast<int>(std::round(srcLen * ratio));

    if (dstLen <= 0) return;

    dest.setSize(numChannels, dstLen);
    dest.clear();

    // -----------------------------------------------------------------------
    // WSOLA — Waveform Similarity Overlap-Add (pitch-preserving time stretch)
    //
    // The old linear-interpolation approach was simple resampling, which
    // changes pitch proportionally to tempo (tape-speed effect).  WSOLA
    // avoids this by:
    //   1. Stepping through the SOURCE at the *original* sample rate (so
    //      each frame is taken verbatim — no pitch shift).
    //   2. Placing those frames in the OUTPUT at a *different* rate
    //      (synthesisHop = analysisHop * ratio).
    //   3. Before placing each frame, cross-correlating the candidate frame
    //      against the tail of what's already been written, and shifting by
    //      ±searchRadius to find the position that minimises the discontinuity
    //      (waveform similarity step that gives WSOLA its name).
    //   4. Overlap-adding with a Hann window and normalising.
    // -----------------------------------------------------------------------

    // Parameters — 2048-sample (~46 ms at 44.1 kHz) frame with 50 % overlap
    const int frameSize    = 2048;
    const int halfFrame    = frameSize / 2;
    const int synthesisHop = halfFrame;          // fixed output step
    const int searchRadius = 128;                // ±samples to search
    const int corrLen      = 256;                // samples used for cross-corr

    // Hann window
    std::vector<float> hann(frameSize);
    const double twoPiOverNm1 = 2.0 * juce::MathConstants<double>::pi / (frameSize - 1);
    for (int i = 0; i < frameSize; ++i)
        hann[i] = static_cast<float>(0.5 * (1.0 - std::cos(twoPiOverNm1 * i)));

    // Use ch0 to determine the optimal frame positions via cross-correlation;
    // the same positions are then applied to all channels so stereo imaging
    // is preserved (L and R are never shifted relative to each other).
    const float* ch0src = source.getReadPointer(0);

    const int bufLen = dstLen + frameSize;   // headroom to avoid per-sample bounds checks
    std::vector<float> ch0acc(bufLen, 0.0f); // accumulated ch0 output for cross-correlation
    std::vector<float> normAcc(bufLen, 0.0f);
    std::vector<int>   frameStarts;

    for (int synthPos = 0; synthPos < dstLen; synthPos += synthesisHop)
    {
        // Nominal frame start in source for this synthesis position.
        // Using round(synthPos/ratio) directly as frameStart means the analysis
        // hop equals synthesisHop/ratio, which is correct for any ratio.
        // (The earlier nomSrc-halfFrame formula was off by halfFrame, causing
        // consecutive frames to overlap incorrectly in the identity case.)
        const int nomFrameStart = static_cast<int>(std::round(synthPos / ratio));

        // WSOLA: cross-correlate the recent output tail against candidate frames
        // near nomFrameStart to find the shift that yields the smoothest join
        int bestDelta = 0;
        if (synthPos >= corrLen)
        {
            double bestCorr  = -1e30;
            const int tailStart = synthPos - corrLen;

            for (int delta = -searchRadius; delta <= searchRadius; ++delta)
            {
                const int candStart = nomFrameStart + delta;
                if (candStart < 0 || candStart + corrLen > srcLen)
                    continue;

                double corr = 0.0;
                for (int i = 0; i < corrLen; ++i)
                    corr += ch0acc[tailStart + i] * ch0src[candStart + i];

                if (corr > bestCorr)
                {
                    bestCorr  = corr;
                    bestDelta = delta;
                }
            }
        }

        int frameStart = nomFrameStart + bestDelta;
        frameStart = juce::jmax(0, juce::jmin(frameStart, srcLen - frameSize));
        frameStarts.push_back(frameStart);

        // Accumulate into ch0 buffer so the next frame can correlate against it.
        // normAcc accumulates hann[i] (not hann[i]²) so that dividing by it in
        // the final step exactly cancels the windowing: output = Σ(src·w) / Σ(w).
        // Using w² here would give output = src·w/w² = src/w → huge amplification
        // near the window edges where w ≈ 0.
        const int writeEnd = std::min(synthPos + frameSize, bufLen);
        for (int i = 0; i < writeEnd - synthPos; ++i)
        {
            ch0acc [synthPos + i] += ch0src[frameStart + i] * hann[i];
            normAcc[synthPos + i] += hann[i];   // NOT hann[i]*hann[i]
        }
    }

    // Apply the computed frame positions to every channel
    for (int ch = 0; ch < numChannels; ++ch)
    {
        const float* src = source.getReadPointer(ch);
        float* dst = dest.getWritePointer(ch);

        int synthPos = 0;
        for (const int frameStart : frameStarts)
        {
            const int writeEnd = std::min(synthPos + frameSize, dstLen);
            for (int i = 0; i < writeEnd - synthPos; ++i)
                dst[synthPos + i] += src[frameStart + i] * hann[i];
            synthPos += synthesisHop;
        }

        // Normalise: dividing by Σhann cancels the window, giving unity gain
        for (int i = 0; i < dstLen; ++i)
            if (normAcc[i] > 1e-6f)
                dst[i] /= normAcc[i];
    }
}

//==============================================================================
// BPM Detection

double SampleDSP::detectBPM(const juce::AudioBuffer<float>& buffer, double sampleRate)
{
    if (buffer.getNumSamples() == 0 || sampleRate <= 0.0)
        return 0.0;

    const int numChannels = buffer.getNumChannels();
    const int numSamples  = buffer.getNumSamples();

    // --- 1. Compute RMS energy in overlapping frames ---
    // frameSize ~23 ms gives stable energy estimates.
    // hopSize must give fps > BPM²/60 ≈ 540 so that integer lag quantisation
    // error stays below 0.5 BPM across the full 60-180 range, making rounding
    // always land on the correct integer.  fps ≈ 700 → max error 0.23 BPM.
    const int frameSize = static_cast<int>(sampleRate * 0.023);
    const int hopSize   = std::max(1, static_cast<int>(sampleRate / 700.0));

    std::vector<float> energy;
    energy.reserve(numSamples / hopSize + 1);

    for (int start = 0; start + frameSize <= numSamples; start += hopSize)
    {
        double rms = 0.0;
        for (int ch = 0; ch < numChannels; ++ch)
        {
            const float* data = buffer.getReadPointer(ch);
            for (int i = 0; i < frameSize; ++i)
                rms += static_cast<double>(data[start + i]) * data[start + i];
        }
        energy.push_back(static_cast<float>(std::sqrt(rms / (frameSize * numChannels))));
    }

    if (energy.size() < 8)
        return 0.0;

    // --- 2. Onset strength: half-wave rectified first difference in dB ---
    std::vector<float> onset;
    onset.reserve(energy.size());
    onset.push_back(0.0f);

    for (size_t i = 1; i < energy.size(); ++i)
    {
        float prev = std::max(energy[i - 1], 1e-6f);
        float curr = std::max(energy[i],     1e-6f);
        float db   = 20.0f * std::log10(curr / prev);
        onset.push_back(std::max(0.0f, db));   // half-wave rectify
    }

    // --- 3. Autocorrelation of onset envelope in the 60–180 BPM lag range ---
    const double framesPerSecond = sampleRate / static_cast<double>(hopSize);

    // Lags corresponding to 60 BPM (long) and 180 BPM (short)
    const int maxLag = std::min(static_cast<int>(framesPerSecond * 60.0 / 60.0),
                                static_cast<int>(onset.size()) - 1);
    const int minLag = static_cast<int>(framesPerSecond * 60.0 / 180.0);

    if (minLag >= maxLag)
        return 0.0;

    double bestCorr = -1.0;
    int    bestLag  = minLag;
    const int N     = static_cast<int>(onset.size());

    for (int lag = minLag; lag <= maxLag; ++lag)
    {
        double corr = 0.0;
        int    cnt  = 0;
        for (int i = 0; i + lag < N; ++i)
        {
            corr += onset[i] * onset[i + lag];
            ++cnt;
        }
        if (cnt > 0) corr /= cnt;

        if (corr > bestCorr)
        {
            bestCorr = corr;
            bestLag  = lag;
        }
    }

    if (bestCorr <= 0.0)
        return 0.0;

    // --- 4. Parabolic interpolation to find the true sub-frame lag ---
    // The autocorrelation operates on integer lags, but the true beat period
    // rarely falls exactly on one. Fitting a parabola through the three samples
    // around the peak gives a fractional correction that eliminates the
    // systematic ~0.7 BPM offset caused by discrete quantisation.
    double trueLag = static_cast<double>(bestLag);
    if (bestLag > minLag && bestLag < maxLag)
    {
        // Recompute neighbours (already computed in the loop above; recalc is cheap)
        auto corrAt = [&](int lag) -> double {
            double c = 0.0; int cnt = 0;
            for (int i = 0; i + lag < N; ++i) { c += onset[i] * onset[i + lag]; ++cnt; }
            return cnt > 0 ? c / cnt : 0.0;
        };
        double y0 = corrAt(bestLag - 1);
        double y1 = bestCorr;
        double y2 = corrAt(bestLag + 1);
        double denom = y0 - 2.0 * y1 + y2;
        if (std::abs(denom) > 1e-10)
            trueLag += 0.5 * (y0 - y2) / denom;
    }

    // --- 5. Convert fractional lag to BPM and normalise to 60–180 ---
    double bpm = 60.0 * framesPerSecond / trueLag;

    while (bpm < 60.0)  bpm *= 2.0;
    while (bpm > 180.0) bpm /= 2.0;

    return std::round(bpm);   // BPM is always an integer in practice
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
