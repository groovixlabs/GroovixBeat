/*
    SampleBuffer - Thread-safe container for editable audio data
*/

#include "SampleBuffer.h"
#include "SampleDSP.h"

//==============================================================================
SampleBuffer::SampleBuffer()
{
    formatManager.registerBasicFormats();
}

SampleBuffer::~SampleBuffer()
{
}

//==============================================================================
// Loading and Saving

bool SampleBuffer::loadFromFile(const juce::File& file, double targetSampleRate)
{
    juce::ScopedLock sl(lock);

    if (!file.existsAsFile())
    {
        DBG("SampleBuffer: File not found: " + file.getFullPathName());
        return false;
    }

    std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
    if (reader == nullptr)
    {
        DBG("SampleBuffer: Could not create reader for: " + file.getFullPathName());
        return false;
    }

    // Allocate temporary buffer for reading
    int numChannels = static_cast<int>(reader->numChannels);
    int numSamples = static_cast<int>(reader->lengthInSamples);
    double fileSampleRate = reader->sampleRate;

    juce::AudioBuffer<float> tempBuffer(numChannels, numSamples);

    // Read the entire file into memory
    reader->read(&tempBuffer, 0, numSamples, 0, true, true);

    // Resample if needed
    if (targetSampleRate > 0.0 && std::abs(fileSampleRate - targetSampleRate) > 0.01)
    {
        DBG("SampleBuffer: Resampling from " + juce::String(fileSampleRate) +
            " Hz to " + juce::String(targetSampleRate) + " Hz");

        SampleDSP::resample(tempBuffer, data, fileSampleRate, targetSampleRate);
        sampleRate = targetSampleRate;
    }
    else
    {
        // No resampling needed - use the data directly
        data = std::move(tempBuffer);
        sampleRate = fileSampleRate;
    }

    detectedBPM = 0.0;  // Reset BPM - can be detected later
    stretchFactor = 1.0;
    playbackOffset = 0.0;

    // Clear original buffer (fresh load)
    originalData.setSize(0, 0);

    // Detect transients after loading
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Loaded " + file.getFullPathName() +
        " (" + juce::String(data.getNumSamples()) + " samples, " +
        juce::String(sampleRate) + " Hz, " +
        juce::String(numChannels) + " channels, " +
        juce::String(static_cast<int>(transients.size())) + " transients)");

    return true;
}

bool SampleBuffer::saveToFile(const juce::File& file) const
{
    juce::ScopedLock sl(lock);

    if (data.getNumSamples() == 0)
    {
        DBG("SampleBuffer: No data to save");
        return false;
    }

    // Delete existing file first to avoid stale data.
    // On Windows, File::createOutputStream() does NOT truncate — it opens at
    // byte 0 but leaves old data beyond what's written, which corrupts the WAV
    // if the new file is shorter than the old one.
    if (file.existsAsFile())
        file.deleteFile();

    // Create WAV writer
    juce::WavAudioFormat wavFormat;
    std::unique_ptr<juce::AudioFormatWriter> writer;

    auto outputStream = file.createOutputStream();
    if (outputStream == nullptr)
    {
        DBG("SampleBuffer: Could not create output stream for: " + file.getFullPathName());
        return false;
    }

    // Release the unique_ptr - the writer takes ownership
    writer.reset(wavFormat.createWriterFor(outputStream.release(), sampleRate,
                                            static_cast<unsigned int>(data.getNumChannels()),
                                            16, {}, 0));

    if (writer == nullptr)
    {
        DBG("SampleBuffer: Could not create WAV writer");
        return false;
    }

    // Write the buffer
    bool success = writer->writeFromAudioSampleBuffer(data, 0, data.getNumSamples());

    // Flush writer to ensure all data is on disk before anyone reads the file
    writer.reset();

    if (success)
    {
        DBG("SampleBuffer: Saved " + juce::String(data.getNumSamples()) + " samples (" +
            juce::String(data.getNumChannels()) + "ch, " + juce::String(sampleRate) +
            " Hz) to " + file.getFullPathName());
    }
    else
    {
        DBG("SampleBuffer: Failed to write data to " + file.getFullPathName());
    }

    return success;
}

void SampleBuffer::loadFromBuffer(const juce::AudioBuffer<float>& source, double sourceSampleRate)
{
    juce::ScopedLock sl(lock);

    data.makeCopyOf(source);
    sampleRate = sourceSampleRate;
    detectedBPM = 0.0;
    stretchFactor = 1.0;
    playbackOffset = 0.0;
    originalData.setSize(0, 0);
}

bool SampleBuffer::hasData() const
{
    juce::ScopedLock sl(lock);
    return data.getNumSamples() > 0;
}

void SampleBuffer::clear()
{
    juce::ScopedLock sl(lock);

    data.setSize(0, 0);
    originalData.setSize(0, 0);
    detectedBPM = 0.0;
    stretchFactor = 1.0;
    playbackOffset = 0.0;
}

//==============================================================================
// Buffer Access

const float* SampleBuffer::getReadPointer(int channel) const
{
    juce::ScopedLock sl(lock);

    if (channel >= 0 && channel < data.getNumChannels())
        return data.getReadPointer(channel);

    return nullptr;
}

void SampleBuffer::copyToBuffer(juce::AudioBuffer<float>& dest, int destStartSample,
                                 int sourceStartSample, int numSamples) const
{
    juce::ScopedLock sl(lock);

    int availableSamples = data.getNumSamples() - sourceStartSample;
    int samplesToCopy = juce::jmin(numSamples, availableSamples);

    if (samplesToCopy <= 0)
        return;

    int channelsToCopy = juce::jmin(dest.getNumChannels(), data.getNumChannels());

    for (int ch = 0; ch < channelsToCopy; ++ch)
    {
        dest.copyFrom(ch, destStartSample, data, ch, sourceStartSample, samplesToCopy);
    }
}

int SampleBuffer::getNumSamples() const
{
    juce::ScopedLock sl(lock);
    return data.getNumSamples();
}

int SampleBuffer::getNumChannels() const
{
    juce::ScopedLock sl(lock);
    return data.getNumChannels();
}

double SampleBuffer::getDurationSeconds() const
{
    juce::ScopedLock sl(lock);

    if (sampleRate > 0 && data.getNumSamples() > 0)
        return static_cast<double>(data.getNumSamples()) / sampleRate;

    return 0.0;
}

//==============================================================================
// Waveform Data for UI Display

std::vector<std::pair<float, float>> SampleBuffer::getWaveformPeaks(int numPoints) const
{
    juce::ScopedLock sl(lock);

    std::vector<std::pair<float, float>> peaks;

    if (numPoints <= 0 || data.getNumSamples() == 0)
        return peaks;

    peaks.reserve(numPoints);

    const float* channelData = data.getReadPointer(0);  // Use first channel
    int numSamples = data.getNumSamples();
    double samplesPerPoint = static_cast<double>(numSamples) / static_cast<double>(numPoints);

    for (int i = 0; i < numPoints; ++i)
    {
        int startSample = static_cast<int>(i * samplesPerPoint);
        int endSample = static_cast<int>((i + 1) * samplesPerPoint);
        endSample = juce::jmin(endSample, numSamples);

        float minVal = 0.0f;
        float maxVal = 0.0f;

        for (int s = startSample; s < endSample; ++s)
        {
            float sample = channelData[s];
            if (sample < minVal) minVal = sample;
            if (sample > maxVal) maxVal = sample;
        }

        peaks.push_back({ minVal, maxVal });
    }

    return peaks;
}

//==============================================================================
// Edit Operations

void SampleBuffer::fadeIn(int startSample, int numSamples)
{
    juce::ScopedLock sl(lock);
    SampleDSP::fadeIn(data, startSample, numSamples);
    // Recalculate transients after fade
    transients = SampleDSP::detectTransients(data, sampleRate);
}

void SampleBuffer::fadeOut(int startSample, int numSamples)
{
    juce::ScopedLock sl(lock);
    SampleDSP::fadeOut(data, startSample, numSamples);
    // Recalculate transients after fade
    transients = SampleDSP::detectTransients(data, sampleRate);
}

void SampleBuffer::silence(int startSample, int numSamples)
{
    juce::ScopedLock sl(lock);
    SampleDSP::silence(data, startSample, numSamples);
    // Recalculate transients after silence
    transients = SampleDSP::detectTransients(data, sampleRate);
}

void SampleBuffer::trim(int startSample, int numSamples)
{
    juce::ScopedLock sl(lock);

    // Validate range
    int maxStart = data.getNumSamples();
    startSample = juce::jlimit(0, maxStart, startSample);
    numSamples = juce::jlimit(0, maxStart - startSample, numSamples);

    if (numSamples <= 0)
        return;

    // Create new buffer with trimmed data
    juce::AudioBuffer<float> trimmed(data.getNumChannels(), numSamples);

    for (int ch = 0; ch < data.getNumChannels(); ++ch)
    {
        trimmed.copyFrom(ch, 0, data, ch, startSample, numSamples);
    }

    data = std::move(trimmed);

    // Recalculate transients on trimmed buffer
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Trimmed to " + juce::String(numSamples) + " samples (" +
        juce::String(static_cast<int>(transients.size())) + " transients)");
}

void SampleBuffer::deleteRange(int startSample, int numSamples)
{
    juce::ScopedLock sl(lock);

    // Validate range
    int maxStart = data.getNumSamples();
    startSample = juce::jlimit(0, maxStart, startSample);
    numSamples = juce::jlimit(0, maxStart - startSample, numSamples);

    if (numSamples <= 0 || numSamples >= data.getNumSamples())
        return;

    int newLength = data.getNumSamples() - numSamples;
    juce::AudioBuffer<float> newBuffer(data.getNumChannels(), newLength);

    for (int ch = 0; ch < data.getNumChannels(); ++ch)
    {
        // Copy before deleted range
        if (startSample > 0)
            newBuffer.copyFrom(ch, 0, data, ch, 0, startSample);

        // Copy after deleted range
        int afterStart = startSample + numSamples;
        int afterLength = data.getNumSamples() - afterStart;
        if (afterLength > 0)
            newBuffer.copyFrom(ch, startSample, data, ch, afterStart, afterLength);
    }

    data = std::move(newBuffer);

    // Recalculate transients
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Deleted range, new length " + juce::String(data.getNumSamples()) + " samples");
}

juce::AudioBuffer<float> SampleBuffer::copyRange(int startSample, int numSamples) const
{
    juce::ScopedLock sl(lock);

    // Validate range
    int maxStart = data.getNumSamples();
    startSample = juce::jlimit(0, maxStart, startSample);
    numSamples = juce::jlimit(0, maxStart - startSample, numSamples);

    juce::AudioBuffer<float> result(data.getNumChannels(), numSamples);

    if (numSamples > 0)
    {
        for (int ch = 0; ch < data.getNumChannels(); ++ch)
        {
            result.copyFrom(ch, 0, data, ch, startSample, numSamples);
        }
    }

    DBG("SampleBuffer: Copied " + juce::String(numSamples) + " samples");
    return result;
}

void SampleBuffer::insertBuffer(const juce::AudioBuffer<float>& source, int insertPosition)
{
    juce::ScopedLock sl(lock);

    if (source.getNumSamples() == 0)
        return;

    // Validate insert position
    insertPosition = juce::jlimit(0, data.getNumSamples(), insertPosition);

    int numChannels = juce::jmin(data.getNumChannels(), source.getNumChannels());
    int newLength = data.getNumSamples() + source.getNumSamples();

    juce::AudioBuffer<float> newBuffer(numChannels, newLength);

    for (int ch = 0; ch < numChannels; ++ch)
    {
        // Copy before insert point
        if (insertPosition > 0)
            newBuffer.copyFrom(ch, 0, data, ch, 0, insertPosition);

        // Copy inserted data
        newBuffer.copyFrom(ch, insertPosition, source, ch, 0, source.getNumSamples());

        // Copy after insert point
        int afterLength = data.getNumSamples() - insertPosition;
        if (afterLength > 0)
            newBuffer.copyFrom(ch, insertPosition + source.getNumSamples(), data, ch, insertPosition, afterLength);
    }

    data = std::move(newBuffer);

    // Recalculate transients
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Inserted " + juce::String(source.getNumSamples()) + " samples at position " +
        juce::String(insertPosition) + ", new length " + juce::String(data.getNumSamples()));
}

void SampleBuffer::timeStretch(double ratio, double targetLengthSeconds)
{
    juce::ScopedLock sl(lock);

    if (ratio <= 0.0)
        return;

    // Store original if not already stored
    if (originalData.getNumSamples() == 0)
    {
        originalData.makeCopyOf(data);
    }

    // Only do actual time stretching if ratio is not 1.0
    if (ratio != 1.0)
    {
        juce::AudioBuffer<float> stretched;
        SampleDSP::timeStretch(data, stretched, ratio);

        data = std::move(stretched);
        stretchFactor *= ratio;
    }

    // Pad or trim to target length if specified (even if ratio is 1.0)
    if (targetLengthSeconds > 0.0)
    {
        padOrTrimToLength(targetLengthSeconds);
    }

    // Recalculate transients on the buffer
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Time stretched by " + juce::String(ratio, 3) +
        " (total factor: " + juce::String(stretchFactor, 3) +
        ", " + juce::String(static_cast<int>(transients.size())) + " transients)");
}

void SampleBuffer::applyWarp(double targetBPM, double targetLengthSeconds)
{
    juce::ScopedLock sl(lock);

    // Need detected BPM to warp
    if (detectedBPM <= 0.0)
    {
        detectedBPM = SampleDSP::detectBPM(originalData.getNumSamples() > 0 ? originalData : data,
                                           sampleRate);
    }

    if (detectedBPM <= 0.0 || targetBPM <= 0.0)
    {
        DBG("SampleBuffer: Cannot warp - invalid BPM");
        return;
    }

    // Calculate stretch ratio: if sample is 140 BPM and target is 120 BPM,
    // we need to stretch by 140/120 = 1.167 (make it longer/slower)
    double ratio = detectedBPM / targetBPM;

    // Store original if not stored
    if (originalData.getNumSamples() == 0)
    {
        originalData.makeCopyOf(data);
    }

    // Only do actual time stretching if ratio is not 1.0 (BPMs don't match)
    if (std::abs(ratio - 1.0) > 0.001)
    {
        // Apply stretch to original (not current) for consistent warping
        juce::AudioBuffer<float> stretched;
        SampleDSP::timeStretch(originalData, stretched, ratio);

        data = std::move(stretched);
        stretchFactor = ratio;
    }
    else
    {
        // BPMs match - just restore from original if we have it
        if (originalData.getNumSamples() > 0)
        {
            data.makeCopyOf(originalData);
        }
        stretchFactor = 1.0;
    }

    // Pad or trim to target length if specified
    if (targetLengthSeconds > 0.0)
    {
        padOrTrimToLength(targetLengthSeconds);
    }

    // Recalculate transients on the warped buffer
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Warped from " + juce::String(detectedBPM, 1) + " BPM to " +
        juce::String(targetBPM, 1) + " BPM (ratio: " + juce::String(ratio, 3) +
        ", " + juce::String(static_cast<int>(transients.size())) + " transients)");
}

void SampleBuffer::padOrTrimToLength(double targetLengthSeconds)
{
    // Note: Assumes lock is already held by caller
    if (targetLengthSeconds <= 0.0 || sampleRate <= 0.0)
        return;

    int targetSamples = static_cast<int>(targetLengthSeconds * sampleRate);
    int currentSamples = data.getNumSamples();
    int numChannels = data.getNumChannels();

    if (targetSamples == currentSamples)
        return;

    if (targetSamples > currentSamples)
    {
        // Pad with silence: create larger buffer, copy existing data, zero the rest
        juce::AudioBuffer<float> padded(numChannels, targetSamples);
        padded.clear();  // Fill with zeros (silence)

        // Copy existing audio data to the beginning
        for (int ch = 0; ch < numChannels; ++ch)
        {
            padded.copyFrom(ch, 0, data, ch, 0, currentSamples);
        }

        data = std::move(padded);

        DBG("SampleBuffer: Padded from " + juce::String(currentSamples) +
            " to " + juce::String(targetSamples) + " samples (added " +
            juce::String(targetSamples - currentSamples) + " samples of silence)");
    }
    else
    {
        // Trim: keep only the first targetSamples
        juce::AudioBuffer<float> trimmed(numChannels, targetSamples);

        for (int ch = 0; ch < numChannels; ++ch)
        {
            trimmed.copyFrom(ch, 0, data, ch, 0, targetSamples);
        }

        data = std::move(trimmed);

        DBG("SampleBuffer: Trimmed from " + juce::String(currentSamples) +
            " to " + juce::String(targetSamples) + " samples");
    }
}

//==============================================================================
// BPM Detection

double SampleBuffer::detectBPM()
{
    juce::ScopedLock sl(lock);

    // Use original buffer if available, otherwise current
    const juce::AudioBuffer<float>& sourceBuffer =
        originalData.getNumSamples() > 0 ? originalData : data;

    detectedBPM = SampleDSP::detectBPM(sourceBuffer, sampleRate);

    DBG("SampleBuffer: Detected BPM = " + juce::String(detectedBPM, 1));

    return detectedBPM;
}

//==============================================================================
// Transient Detection

void SampleBuffer::detectTransients()
{
    juce::ScopedLock sl(lock);

    // Always detect transients on current data buffer (which may be stretched/edited)
    transients = SampleDSP::detectTransients(data, sampleRate);

    DBG("SampleBuffer: Detected " + juce::String(static_cast<int>(transients.size())) + " transients");
}

//==============================================================================
// Non-Destructive Editing Support

void SampleBuffer::storeAsOriginal()
{
    juce::ScopedLock sl(lock);
    originalData.makeCopyOf(data);
}

bool SampleBuffer::hasOriginal() const
{
    juce::ScopedLock sl(lock);
    return originalData.getNumSamples() > 0;
}

void SampleBuffer::reset()
{
    juce::ScopedLock sl(lock);

    if (originalData.getNumSamples() > 0)
    {
        data.makeCopyOf(originalData);
        stretchFactor = 1.0;
        playbackOffset = 0.0;

        // Recalculate transients on the original buffer
        transients = SampleDSP::detectTransients(data, sampleRate);

        DBG("SampleBuffer: Reset to original (" +
            juce::String(static_cast<int>(transients.size())) + " transients)");
    }
}

//==============================================================================
// Internal Helpers

void SampleBuffer::timeStretchInternal(const juce::AudioBuffer<float>& source,
                                        juce::AudioBuffer<float>& dest,
                                        double ratio)
{
    SampleDSP::timeStretch(source, dest, ratio);
}
