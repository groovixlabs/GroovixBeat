/*
    SamplePlayerPlugin - Internal audio processor for sample playback
*/

#include "SamplePlayerPlugin.h"

//==============================================================================
// Static helper: encode an AudioBuffer as 32-bit float WAV into destBlock,
// then return a reader backed by that block. Caller must ensure destBlock
// outlives the returned reader. Returns nullptr on failure.
juce::AudioFormatReader* SamplePlayerPlugin::createWavReaderFromBuffer(
    const juce::AudioBuffer<float>& buffer,
    double sampleRate,
    juce::MemoryBlock& destBlock)
{
    destBlock.reset();

    juce::WavAudioFormat wavFormat;

    // AudioFormatWriter takes ownership of the stream and calls delete on it in its
    // destructor, so we must heap-allocate it (NOT pass a stack-local address).
    auto* mos = new juce::MemoryOutputStream(destBlock, false);
    auto writer = std::unique_ptr<juce::AudioFormatWriter>(
        wavFormat.createWriterFor(mos,
                                  sampleRate,
                                  static_cast<unsigned int>(buffer.getNumChannels()),
                                  32,   // 32-bit float — lossless
                                  {},
                                  0));
    if (writer == nullptr)
    {
        delete mos;
        return nullptr;
    }

    writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples());
    writer.reset(); // flush/close WAV; also deletes mos → destBlock is populated

    // Create a reader from the encoded WAV data.
    // MemoryInputStream does NOT copy — destBlock must stay alive.
    auto* mis = new juce::MemoryInputStream(destBlock.getData(), destBlock.getSize(), false);
    auto* reader = wavFormat.createReaderFor(mis, true); // reader takes ownership of mis
    if (reader == nullptr)
        delete mis;

    return reader;
}

//==============================================================================
SamplePlayerPlugin::SamplePlayerPlugin()
    : AudioProcessor(BusesProperties()
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    // Register common audio formats
    formatManager.registerBasicFormats();

    // Initialize sample editor
    sampleEditor = std::make_unique<SampleEditor>();
}

SamplePlayerPlugin::~SamplePlayerPlugin()
{
    transportSource.setSource(nullptr);
    readerSource.reset();
    pendingReaderSource.reset();
    sampleEditor.reset();
}

//==============================================================================
bool SamplePlayerPlugin::loadFile(const juce::String& filePath)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerPlugin::loadFile CALLED with path: '" + filePath + "'");
    DBG("SamplePlayerPlugin::loadFile - Previous currentFilePath: '" + currentFilePath + "'");

    // Stop current playback and release reader before clearing memory block
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();
    cachedMemoryBlock.reset();   // safe to clear now that reader is gone

    juce::File file(filePath);
    DBG("SamplePlayerPlugin::loadFile - File object path: '" + file.getFullPathName() + "'");
    DBG("SamplePlayerPlugin::loadFile - File exists: " + juce::String(file.existsAsFile() ? "YES" : "NO"));

    if (!file.existsAsFile())
    {
        DBG("SamplePlayerPlugin: File not found: " + filePath);
        currentFilePath = {};
        return false;
    }

    auto* reader = formatManager.createReaderFor(file);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Could not create reader for: " + filePath);
        currentFilePath = {};
        return false;
    }

    // Store file info
    fileSampleRate = reader->sampleRate;
    fileLengthSamples = reader->lengthInSamples;

    // Create reader source with ownership of reader
    readerSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    readerSource->setLooping(loopEnabled && !useBeatsForLoop);

    // Connect to transport source
    transportSource.setSource(readerSource.get(), 0, nullptr,
                              reader->sampleRate, reader->numChannels);

    // Prepare if we're already prepared
    if (currentSampleRate > 0)
    {
        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);
    }

    currentFilePath = filePath;
    DBG("SamplePlayerPlugin: Loaded " + filePath +
        " (duration: " + juce::String(getLengthInSeconds(), 2) + "s)");
    DBG("SamplePlayerPlugin::loadFile - SUCCESS, currentFilePath is now: '" + currentFilePath + "'");

    return true;
}

bool SamplePlayerPlugin::loadFromCachedBuffer(const juce::String& filePath,
                                               const juce::AudioBuffer<float>& cachedBuffer,
                                               double bufferSampleRate)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerPlugin::loadFromCachedBuffer - path: " + filePath +
        " samples: " + juce::String(cachedBuffer.getNumSamples()) +
        " sampleRate: " + juce::String(bufferSampleRate));

    if (cachedBuffer.getNumSamples() == 0 || bufferSampleRate <= 0)
    {
        DBG("SamplePlayerPlugin: Invalid cached buffer for: " + filePath);
        return false;
    }

    // Stop current playback and release existing source before touching cachedMemoryBlock
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();
    cachedMemoryBlock.reset();   // safe to clear now that reader is gone

    // Encode the cached buffer as 32-bit float WAV into cachedMemoryBlock
    auto* reader = createWavReaderFromBuffer(cachedBuffer, bufferSampleRate, cachedMemoryBlock);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Failed to encode cached buffer as WAV: " + filePath);
        return false;
    }

    fileSampleRate = reader->sampleRate;
    fileLengthSamples = reader->lengthInSamples;

    readerSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    readerSource->setLooping(loopEnabled && !useBeatsForLoop);

    transportSource.setSource(readerSource.get(), 0, nullptr,
                              reader->sampleRate, reader->numChannels);

    if (currentSampleRate > 0)
        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);

    currentFilePath = filePath;

    DBG("SamplePlayerPlugin: Loaded from cache (WAV-in-memory) " + filePath +
        " (duration: " + juce::String(getLengthInSeconds(), 2) + "s)");
    return true;
}

//==============================================================================
void SamplePlayerPlugin::play(double offsetSeconds)
{
    juce::ScopedLock sl(lock);

    if (readerSource == nullptr)
        return;

    // Stop any existing playback first to ensure clean restart
    if (playing || transportSource.isPlaying())
    {
        transportSource.stop();
    }

    startOffset = offsetSeconds;
    transportSource.setPosition(offsetSeconds);
    transportSource.start();
    playing = true;

    // Reset sample counter for loop tracking
    samplesPlayedSinceStart = 0;

    // Clear any queued state
    queuedToPlay = false;
    queuedToStop = false;

    // Mark that we need to initialize sampleStartBeat in syncToTransport
    needsStartBeatInit = true;

    DBG("SamplePlayerPlugin: Playing from " + juce::String(offsetSeconds, 3) + "s, loopLengthBeats=" + juce::String(loopLengthBeats));
}

void SamplePlayerPlugin::stop()
{
    juce::ScopedLock sl(lock);

    if (readerSource != nullptr)
    {
        transportSource.stop();
        transportSource.setPosition(0.0);
    }

    playing = false;
    queuedToPlay = false;
    queuedToStop = false;

    DBG("SamplePlayerPlugin: Stopped");
}

void SamplePlayerPlugin::setLooping(bool shouldLoop)
{
    juce::ScopedLock sl(lock);

    loopEnabled = shouldLoop;

    // Only set native looping if not using beat-based looping
    if (readerSource != nullptr && !useBeatsForLoop)
        readerSource->setLooping(shouldLoop);
}

//==============================================================================
// Live Mode API

void SamplePlayerPlugin::queuePlay(double offsetSeconds)
{
    juce::ScopedLock sl(lock);

    queuedToPlay = true;
    queuedToStop = false;
    queuedOffset = offsetSeconds;

    DBG("SamplePlayerPlugin: Queued to play (offset: " + juce::String(offsetSeconds, 3) + "s)");
}

bool SamplePlayerPlugin::loadFileForPendingPlay(const juce::String& filePath, double offsetSeconds)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerPlugin::loadFileForPendingPlay - path: " + filePath);

    juce::File file(filePath);
    if (!file.existsAsFile())
    {
        DBG("SamplePlayerPlugin: Pending file not found: " + filePath);
        return false;
    }

    auto* reader = formatManager.createReaderFor(file);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Could not create reader for pending file: " + filePath);
        return false;
    }

    // Store pending file info
    pendingFileSampleRate = reader->sampleRate;
    pendingFileLengthSamples = reader->lengthInSamples;

    // Create pending reader source
    pendingReaderSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    pendingReaderSource->setLooping(loopEnabled && !useBeatsForLoop);

    pendingFilePath = filePath;
    hasPendingFile = true;
    queuedToPlay = true;
    queuedToStop = false;
    queuedOffset = offsetSeconds;
    // Do NOT set needsImmediateStart — let crossedBoundary detection fire at the quantize boundary

    DBG("SamplePlayerPlugin: Prepared pending file for seamless transition: " + filePath);
    return true;
}

bool SamplePlayerPlugin::loadCachedBufferForPendingPlay(const juce::String& filePath,
                                                         const juce::AudioBuffer<float>& cachedBuffer,
                                                         double bufferSampleRate,
                                                         double offsetSeconds)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerPlugin::loadCachedBufferForPendingPlay - path: " + filePath +
        " samples: " + juce::String(cachedBuffer.getNumSamples()));

    if (cachedBuffer.getNumSamples() == 0 || bufferSampleRate <= 0)
    {
        DBG("SamplePlayerPlugin: Invalid cached buffer for pending play");
        return false;
    }

    // Release any existing pending source before touching pendingMemoryBlock
    pendingReaderSource.reset();
    pendingMemoryBlock.reset();

    // Encode the cached buffer as 32-bit float WAV into pendingMemoryBlock
    auto* reader = createWavReaderFromBuffer(cachedBuffer, bufferSampleRate, pendingMemoryBlock);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Failed to encode pending cached buffer as WAV: " + filePath);
        return false;
    }

    pendingFileSampleRate = reader->sampleRate;
    pendingFileLengthSamples = reader->lengthInSamples;
    pendingFilePath = filePath;
    pendingReaderSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    pendingReaderSource->setLooping(loopEnabled && !useBeatsForLoop);

    hasPendingFile = true;
    queuedToPlay = true;
    queuedToStop = false;
    queuedOffset = offsetSeconds;
    // Do NOT set needsImmediateStart — let crossedBoundary detection fire at the quantize boundary

    DBG("SamplePlayerPlugin: Prepared pending cached buffer (WAV-in-memory) for: " + filePath);
    return true;
}

void SamplePlayerPlugin::queueStop()
{
    juce::ScopedLock sl(lock);

    queuedToStop = true;
    queuedToPlay = false;

    DBG("SamplePlayerPlugin: Queued to stop");
}

void SamplePlayerPlugin::cancelQueue()
{
    juce::ScopedLock sl(lock);

    queuedToPlay = false;
    queuedToStop = false;
}

void SamplePlayerPlugin::setLoopLengthBeats(double beats)
{
    juce::ScopedLock sl(lock);

    loopLengthBeats = beats;
    useBeatsForLoop = true;

    // Disable native looping when using beat-based looping
    if (readerSource != nullptr)
        readerSource->setLooping(false);
}

void SamplePlayerPlugin::setLoopLengthSeconds(double seconds)
{
    juce::ScopedLock sl(lock);

    // Convert seconds to beats at current BPM
    double beatsPerSecond = currentBpm / 60.0;
    loopLengthBeats = seconds * beatsPerSecond;
    useBeatsForLoop = false;

    // Use native looping for time-based loops
    if (readerSource != nullptr)
        readerSource->setLooping(loopEnabled);
}

void SamplePlayerPlugin::syncToTransport(double transportPositionBeats,
                                          double bpm,
                                          int quantizeSteps,
                                          bool transportPlaying)
{
    juce::ScopedLock sl(lock);

    // Keep BPM in sync for loop-length calculations in processBlock.
    currentBpm = bpm;

    // Stop sample when transport stops.
    if (!transportPlaying)
    {
        if (playing)
        {
            transportSource.stop();
            playing = false;
            DBG("SamplePlayerPlugin: Stopped (transport stopped)");
        }
        lastTransportBeat = transportPositionBeats;
        return;
    }

    // --- Legacy boundary detection for SCENE MODE (queueSampleFile path) ---
    // Live-mode clips use targetStartSample / targetStopSample set from MidiBridge
    // and are triggered sample-accurately in processBlock().  We only run the
    // boundary check here when those atomics are NOT armed, so scene-mode clips
    // (which don't set targetStartSample) still work correctly.

    double beatsPerQuantize = quantizeSteps / 4.0;
    int prevQuantize = (int)(lastTransportBeat / beatsPerQuantize);
    int currQuantize = (int)(transportPositionBeats / beatsPerQuantize);
    bool crossedBoundary = currQuantize > prevQuantize;

    if (crossedBoundary || needsImmediateStart)
    {
        // Live-mode path: audio thread handles it — don't steal the trigger.
        bool livePathArmed = (targetStartSample.load(std::memory_order_relaxed) >= 0);

        if (!livePathArmed)
        {
            // Seamless pending-file switch (scene mode / non-live fallback).
            if (queuedToPlay && hasPendingFile && pendingReaderSource != nullptr)
            {
                transportSource.stop();
                transportSource.setSource(nullptr);
                readerSource.reset();
                cachedMemoryBlock.reset();

                cachedMemoryBlock = std::move(pendingMemoryBlock);
                readerSource      = std::move(pendingReaderSource);
                currentFilePath   = pendingFilePath;
                fileSampleRate    = pendingFileSampleRate;
                fileLengthSamples = pendingFileLengthSamples;

                hasPendingFile        = false;
                pendingFilePath       = {};
                pendingFileSampleRate = 0.0;
                pendingFileLengthSamples = 0;

                if (auto* reader = readerSource->getAudioFormatReader())
                {
                    transportSource.setSource(readerSource.get(), 0, nullptr,
                                              reader->sampleRate, reader->numChannels);
                    if (currentSampleRate > 0)
                        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);
                }

                sampleStartBeat = currQuantize * beatsPerQuantize;
                transportSource.setPosition(queuedOffset);
                transportSource.start();
                playing = true;
                samplesPlayedSinceStart = 0;
                queuedToPlay = false;
                needsImmediateStart = false;

                DBG("SamplePlayerPlugin: Seamless switch (scene) at beat " +
                    juce::String(sampleStartBeat, 2));
            }
            else if (queuedToPlay && readerSource != nullptr)
            {
                sampleStartBeat = currQuantize * beatsPerQuantize;
                transportSource.setPosition(queuedOffset);
                transportSource.start();
                playing = true;
                queuedToPlay = false;
                needsImmediateStart = false;

                DBG("SamplePlayerPlugin: Started (scene) at beat " +
                    juce::String(sampleStartBeat, 2));
            }
        }

        // Queued stop: also skip if live-mode stop path is armed.
        bool liveStopArmed = (targetStopSample.load(std::memory_order_relaxed) >= 0);
        if (queuedToStop && !liveStopArmed)
        {
            if (playing)
            {
                transportSource.stop();
                transportSource.setPosition(0.0);
                playing = false;
            }
            queuedToStop = false;
            needsImmediateStart = false;

            DBG("SamplePlayerPlugin: Stopped (scene) at beat " +
                juce::String(transportPositionBeats, 2));
        }

        if (needsImmediateStart && !queuedToPlay && !queuedToStop)
            needsImmediateStart = false;
    }

    lastTransportBeat = transportPositionBeats;
}

//==============================================================================
// State Queries

double SamplePlayerPlugin::getLengthInSeconds() const
{
    if (fileSampleRate > 0 && fileLengthSamples > 0)
        return (double)fileLengthSamples / fileSampleRate;
    return 0.0;
}

bool SamplePlayerPlugin::hasValidSource() const
{
    return readerSource != nullptr;
}

void SamplePlayerPlugin::resetForLiveMode()
{
    juce::ScopedLock sl(lock);

    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();
    cachedMemoryBlock.reset();

    currentFilePath = {};
    fileSampleRate = 0.0;
    fileLengthSamples = 0;

    queuedToPlay = false;
    queuedToStop = false;
    needsImmediateStart = false;

    hasPendingFile = false;
    pendingReaderSource.reset();
    pendingMemoryBlock.reset();
    pendingFilePath = {};
    pendingFileSampleRate = 0.0;
    pendingFileLengthSamples = 0;

    lastTransportBeat = 0.0;
    sampleStartBeat = 0.0;
    samplesPlayedSinceStart = 0;

    // Clear audio-thread trigger targets.
    // cumulativeSamplePosition is NOT reset here; it is set externally via
    // setCumulativePosition() to match the MidiClipScheduler's counter.
    targetStartSample.store(-1, std::memory_order_relaxed);
    targetStopSample.store(-1,  std::memory_order_relaxed);

    DBG("SamplePlayerPlugin: Reset for Live Mode");
}

double SamplePlayerPlugin::getPositionSeconds() const
{
    return transportSource.getCurrentPosition();
}

void SamplePlayerPlugin::setPositionSeconds(double position)
{
    juce::ScopedLock sl(lock);
    transportSource.setPosition(position);
}

//==============================================================================
// Audio-thread quantize triggering

void SamplePlayerPlugin::setCumulativePosition(int64_t pos)
{
    juce::ScopedLock sl(lock);
    cumulativeSamplePosition = pos;
}

void SamplePlayerPlugin::setTargetStartSample(int64_t samplePos)
{
    targetStartSample.store(samplePos, std::memory_order_relaxed);
}

void SamplePlayerPlugin::setTargetStopSample(int64_t samplePos)
{
    targetStopSample.store(samplePos, std::memory_order_relaxed);
}

//==============================================================================
// AudioProcessor Implementation

void SamplePlayerPlugin::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ScopedLock sl(lock);

    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;

    transportSource.prepareToPlay(samplesPerBlock, sampleRate);

    // Reset the position counter.  All nodes in the graph get prepareToPlay
    // simultaneously, so starting at 0 keeps them synchronised.
    cumulativeSamplePosition = 0;
}

void SamplePlayerPlugin::releaseResources()
{
    juce::ScopedLock sl(lock);
    transportSource.releaseResources();
}

void SamplePlayerPlugin::processBlock(juce::AudioBuffer<float>& buffer,
                                       juce::MidiBuffer& /*midiMessages*/)
{
    // Snapshot the cumulative position BEFORE acquiring the lock so the
    // atomic target comparisons use the same value that we use below.
    const int64_t blockStart = cumulativeSamplePosition;

    juce::ScopedLock sl(lock);

    buffer.clear();

    const int numSamples = buffer.getNumSamples();

    // =========================================================================
    // Audio-thread quantize STOP
    // =========================================================================
    {
        int64_t tStop = targetStopSample.load(std::memory_order_relaxed);
        if (tStop >= 0 && playing)
        {
            // Is the stop boundary in this block (or already past)?
            if (tStop <= blockStart + numSamples)
            {
                // How many samples of audio do we still owe before the stop?
                int stopOffset = (int)std::max(int64_t(0), tStop - blockStart);
                stopOffset = std::min(stopOffset, numSamples);

                if (stopOffset > 0 && readerSource != nullptr)
                {
                    juce::AudioSourceChannelInfo info(&buffer, 0, stopOffset);
                    transportSource.getNextAudioBlock(info);
                    samplesPlayedSinceStart += stopOffset;
                }

                transportSource.stop();
                transportSource.setPosition(0.0);
                playing     = false;
                queuedToStop = false;
                targetStopSample.store(-1, std::memory_order_relaxed);

                // Buffer already cleared; samples 0..stopOffset filled,
                // stopOffset..numSamples are silent.
                cumulativeSamplePosition += numSamples;
                return;
            }
        }
    }

    // =========================================================================
    // Audio-thread quantize START  (Live Mode seamless triggering)
    // =========================================================================
    {
        int64_t tStart = targetStartSample.load(std::memory_order_relaxed);
        if (tStart >= 0 && tStart <= blockStart + numSamples)
        {
            // The boundary falls in this block (or is already past — catch-up).
            int triggerOffset = (int)std::max(int64_t(0), tStart - blockStart);
            triggerOffset = std::min(triggerOffset, numSamples - 1);

            // --- Seamless switch: if we have a pending reader, play the old
            //     source up to the trigger point then atomically switch. ---
            if (hasPendingFile && pendingReaderSource != nullptr)
            {
                // Fill pre-trigger samples from the currently-playing source.
                if (triggerOffset > 0 && playing && readerSource != nullptr)
                {
                    juce::AudioSourceChannelInfo oldInfo(&buffer, 0, triggerOffset);
                    transportSource.getNextAudioBlock(oldInfo);
                    samplesPlayedSinceStart += triggerOffset;
                }

                // Release old reader before touching cachedMemoryBlock.
                transportSource.stop();
                transportSource.setSource(nullptr);
                readerSource.reset();
                cachedMemoryBlock.reset();

                // Promote pending source.
                cachedMemoryBlock      = std::move(pendingMemoryBlock);
                readerSource           = std::move(pendingReaderSource);
                currentFilePath        = pendingFilePath;
                fileSampleRate         = pendingFileSampleRate;
                fileLengthSamples      = pendingFileLengthSamples;

                hasPendingFile         = false;
                pendingFilePath        = {};
                pendingFileSampleRate  = 0.0;
                pendingFileLengthSamples = 0;

                if (auto* reader = readerSource->getAudioFormatReader())
                {
                    transportSource.setSource(readerSource.get(), 0, nullptr,
                                              reader->sampleRate, reader->numChannels);
                    if (currentSampleRate > 0)
                        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);
                }
            }
            else if (triggerOffset > 0 && playing && readerSource != nullptr)
            {
                // Same file re-trigger: fill pre-trigger samples from old position.
                juce::AudioSourceChannelInfo oldInfo(&buffer, 0, triggerOffset);
                transportSource.getNextAudioBlock(oldInfo);
            }

            // Start the new (or re-started) source at the trigger offset.
            if (readerSource != nullptr)
            {
                transportSource.setPosition(queuedOffset);
                transportSource.start();
                playing              = true;
                samplesPlayedSinceStart = 0;
                queuedToPlay         = false;
                needsImmediateStart  = false;

                // Fill post-trigger samples from the new source.
                int postSamples = numSamples - triggerOffset;
                if (postSamples > 0)
                {
                    juce::AudioSourceChannelInfo newInfo(&buffer, triggerOffset, postSamples);
                    transportSource.getNextAudioBlock(newInfo);
                    samplesPlayedSinceStart += postSamples;
                }
            }

            targetStartSample.store(-1, std::memory_order_relaxed);
            cumulativeSamplePosition += numSamples;
            return;
        }
    }

    // =========================================================================
    // Normal playback (scene mode / already-running clips)
    // =========================================================================

    if (!playing || readerSource == nullptr)
    {
        cumulativeSamplePosition += numSamples;
        return;
    }

    // Calculate loop length in samples if using beat-based looping.
    if (loopEnabled && useBeatsForLoop && currentBpm > 0 && currentSampleRate > 0)
    {
        double secondsPerBeat = 60.0 / currentBpm;
        double loopLengthSeconds = loopLengthBeats * secondsPerBeat;
        loopLengthSamples = static_cast<juce::int64>(loopLengthSeconds * currentSampleRate);
    }

    // Sample-accurate looping.
    if (loopEnabled && useBeatsForLoop && loopLengthSamples > 0)
    {
        juce::int64 samplesRemainingInLoop = loopLengthSamples - samplesPlayedSinceStart;

        if (samplesRemainingInLoop <= 0)
        {
            transportSource.setPosition(startOffset);
            if (!transportSource.isPlaying())
                transportSource.start();
            samplesPlayedSinceStart = 0;
            DBG("SamplePlayerPlugin: Sample-accurate loop triggered");
        }
        else if (samplesRemainingInLoop < numSamples)
        {
            int samplesToPlay = static_cast<int>(samplesRemainingInLoop);

            juce::AudioSourceChannelInfo partialInfo(&buffer, 0, samplesToPlay);
            transportSource.getNextAudioBlock(partialInfo);

            transportSource.setPosition(startOffset);
            if (!transportSource.isPlaying())
                transportSource.start();

            int remainingSamples = numSamples - samplesToPlay;
            if (remainingSamples > 0)
            {
                juce::AudioSourceChannelInfo remainingInfo(&buffer, samplesToPlay, remainingSamples);
                transportSource.getNextAudioBlock(remainingInfo);
            }

            samplesPlayedSinceStart = remainingSamples;
            cumulativeSamplePosition += numSamples;
            DBG("SamplePlayerPlugin: Sample-accurate loop (partial buffer)");
            return;
        }
    }

    juce::AudioSourceChannelInfo info(&buffer, 0, numSamples);
    transportSource.getNextAudioBlock(info);
    samplesPlayedSinceStart += numSamples;

    if (!loopEnabled && !transportSource.isPlaying())
    {
        playing = false;
        DBG("SamplePlayerPlugin: Playback ended naturally");
    }

    cumulativeSamplePosition += numSamples;
}

//==============================================================================
void SamplePlayerPlugin::getStateInformation(juce::MemoryBlock& destData)
{
    // Save current file path and settings
    juce::MemoryOutputStream stream(destData, true);
    stream.writeString(currentFilePath);
    stream.writeDouble(loopLengthBeats);
    stream.writeBool(loopEnabled);
    stream.writeBool(useBeatsForLoop);
}

void SamplePlayerPlugin::setStateInformation(const void* data, int sizeInBytes)
{
    // Restore settings
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);

    juce::String filePath = stream.readString();
    loopLengthBeats = stream.readDouble();
    loopEnabled = stream.readBool();
    useBeatsForLoop = stream.readBool();

    // Reload file if valid
    if (filePath.isNotEmpty())
        loadFile(filePath);
}

//==============================================================================
// Sample Editing API

bool SamplePlayerPlugin::loadFileForEditing(const juce::String& filePath)
{
    juce::ScopedLock sl(lock);

    if (!sampleEditor)
        sampleEditor = std::make_unique<SampleEditor>();

    juce::File file(filePath);

    // Resample to device sample rate for consistent playback timing
    double targetRate = currentSampleRate > 0 ? currentSampleRate : 48000.0;

    bool success = sampleEditor->loadFromFile(file, targetRate);

    if (success)
    {
        DBG("SamplePlayerPlugin: Loaded for editing (resampled to " +
            juce::String(targetRate) + " Hz): " + filePath);
    }
    else
    {
        DBG("SamplePlayerPlugin: Failed to load for editing: " + filePath);
    }

    // Also load the file for playback via transportSource.
    // Playback is always file-based; edits flush to disk then reload.
    loadFile(filePath);

    return success;
}

void SamplePlayerPlugin::discardEdits()
{
    juce::ScopedLock sl(lock);

    if (sampleEditor)
        sampleEditor->clear();

    // Reload from file if we have one
    if (currentFilePath.isNotEmpty())
    {
        juce::File file(currentFilePath);
        if (file.existsAsFile())
        {
            loadFile(currentFilePath);
        }
    }

    DBG("SamplePlayerPlugin: Discarded edits");
}

void SamplePlayerPlugin::releaseFileHandle()
{
    juce::ScopedLock sl(lock);

    // Stop playback and release the file reader so the file can be overwritten.
    // Does NOT touch sampleEditor — the in-memory buffer is preserved.
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();
    cachedMemoryBlock.reset();

    DBG("SamplePlayerPlugin: Released file handle");
}

