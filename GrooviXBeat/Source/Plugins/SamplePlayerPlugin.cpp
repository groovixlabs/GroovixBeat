/*
    SamplePlayerPlugin - Internal audio processor for sample playback
*/

#include "SamplePlayerPlugin.h"

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
    DBG("SamplePlayerPlugin::loadFile - useEditableBuffer was: " + juce::String(useEditableBuffer ? "true" : "false"));

    // Stop current playback
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();

    // IMPORTANT: Reset editable buffer mode so we use transportSource for playback
    useEditableBuffer = false;

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

    // Stop current playback
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();

    // Load the cached buffer into sampleEditor for in-memory playback
    if (!sampleEditor)
        sampleEditor = std::make_unique<SampleEditor>();

    // Load directly from the cached buffer
    bool success = sampleEditor->loadFromBuffer(cachedBuffer, bufferSampleRate);

    if (success)
    {
        currentFilePath = filePath;
        fileSampleRate = bufferSampleRate;
        fileLengthSamples = static_cast<juce::int64>(cachedBuffer.getNumSamples());
        useEditableBuffer = true;
        editablePlayPosition = 0;

        DBG("SamplePlayerPlugin: Loaded from cache " + filePath +
            " (duration: " + juce::String(getLengthInSeconds(), 2) + "s)");
    }
    else
    {
        DBG("SamplePlayerPlugin: Failed to load from cache: " + filePath);
    }

    return success;
}

//==============================================================================
void SamplePlayerPlugin::play(double offsetSeconds)
{
    juce::ScopedLock sl(lock);

    // Check if we're using editable buffer mode
    if (useEditableBuffer && sampleEditor && sampleEditor->isLoaded())
    {
        // For editable buffer, just set the play position and playing flag
        double sampleRate = sampleEditor->getSampleRate();
        editablePlayPosition = static_cast<juce::int64>(offsetSeconds * sampleRate);
        startOffset = offsetSeconds;
        playing = true;
        samplesPlayedSinceStart = 0;
        queuedToPlay = false;
        queuedToStop = false;
        needsStartBeatInit = true;

        DBG("SamplePlayerPlugin: Playing from editable buffer at " + juce::String(offsetSeconds, 3) + "s");
        return;
    }

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
    DBG("SamplePlayerPlugin::stop() - entering");

    juce::ScopedLock sl(lock);

    DBG("SamplePlayerPlugin::stop() - acquired lock");

    // Handle editable buffer mode
    if (useEditableBuffer)
    {
        editablePlayPosition = 0;
        playing = false;
        queuedToPlay = false;
        queuedToStop = false;
        DBG("SamplePlayerPlugin: Stopped (editable buffer)");
        return;
    }

    // Only interact with transport if we have a valid source
    if (readerSource != nullptr)
    {
        DBG("SamplePlayerPlugin::stop() - stopping transport");
        transportSource.stop();
        DBG("SamplePlayerPlugin::stop() - setting position");
        transportSource.setPosition(0.0);
    }

    playing = false;

    // Clear any queued state
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
    hasPendingCachedBuffer = false;
    queuedToPlay = true;
    queuedToStop = false;
    queuedOffset = offsetSeconds;
    needsImmediateStart = true;  // Force immediate start on next sync

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

    // Copy the cached buffer
    int numChannels = cachedBuffer.getNumChannels();
    int numSamples = cachedBuffer.getNumSamples();
    pendingCachedBuffer.setSize(numChannels, numSamples);
    for (int ch = 0; ch < numChannels; ++ch)
    {
        pendingCachedBuffer.copyFrom(ch, 0, cachedBuffer, ch, 0, numSamples);
    }

    // Store pending info
    pendingFileSampleRate = bufferSampleRate;
    pendingFileLengthSamples = numSamples;
    pendingFilePath = filePath;
    pendingReaderSource.reset();  // Clear file-based pending source
    hasPendingFile = false;
    hasPendingCachedBuffer = true;
    queuedToPlay = true;
    queuedToStop = false;
    queuedOffset = offsetSeconds;
    needsImmediateStart = true;  // Force immediate start on next sync

    DBG("SamplePlayerPlugin: Prepared pending cached buffer for seamless transition: " + filePath);
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

    currentBpm = bpm;

    // Initialize sampleStartBeat if needed (after play() was called)
    if (needsStartBeatInit && playing)
    {
        sampleStartBeat = transportPositionBeats;
        needsStartBeatInit = false;
        DBG("SamplePlayerPlugin: Initialized sampleStartBeat to " + juce::String(sampleStartBeat, 2));
    }

    // If transport stopped, stop sample too
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

    // Calculate quantization boundary
    // quantizeSteps is in 1/16th notes, convert to beats (quarter notes)
    double beatsPerQuantize = quantizeSteps / 4.0;

    // Check if we've crossed a quantization boundary
    int prevQuantize = (int)(lastTransportBeat / beatsPerQuantize);
    int currQuantize = (int)(transportPositionBeats / beatsPerQuantize);
    bool crossedBoundary = currQuantize > prevQuantize;

    // Handle queued actions at quantization boundaries OR if immediate start is needed
    // needsImmediateStart is set when first clip is queued in Live Mode
    if (crossedBoundary || needsImmediateStart)
    {
        DBG("SamplePlayerPlugin::syncToTransport - Triggering queued action: crossedBoundary=" +
            juce::String(crossedBoundary ? "true" : "false") +
            " needsImmediateStart=" + juce::String(needsImmediateStart ? "true" : "false") +
            " queuedToPlay=" + juce::String(queuedToPlay ? "true" : "false") +
            " hasPendingCachedBuffer=" + juce::String(hasPendingCachedBuffer ? "true" : "false") +
            " hasPendingFile=" + juce::String(hasPendingFile ? "true" : "false") +
            " readerSource=" + juce::String(readerSource != nullptr ? "valid" : "null"));
        // Handle pending cached buffer switch for seamless Live Mode transitions (from cache)
        if (queuedToPlay && hasPendingCachedBuffer && pendingCachedBuffer.getNumSamples() > 0)
        {
            // Stop current playback
            transportSource.stop();
            transportSource.setSource(nullptr);
            readerSource.reset();

            // Load cached buffer into sample editor for in-memory playback
            if (!sampleEditor)
                sampleEditor = std::make_unique<SampleEditor>();

            sampleEditor->loadFromBuffer(pendingCachedBuffer, pendingFileSampleRate);

            // Update state
            currentFilePath = pendingFilePath;
            fileSampleRate = pendingFileSampleRate;
            fileLengthSamples = pendingFileLengthSamples;
            useEditableBuffer = true;
            editablePlayPosition = static_cast<juce::int64>(queuedOffset * pendingFileSampleRate);

            // Clear pending state
            hasPendingCachedBuffer = false;
            pendingCachedBuffer.setSize(0, 0);
            pendingFilePath = {};
            pendingFileSampleRate = 0.0;
            pendingFileLengthSamples = 0;

            // Start playback at the quantization boundary
            sampleStartBeat = currQuantize * beatsPerQuantize;
            startOffset = queuedOffset;
            playing = true;
            samplesPlayedSinceStart = 0;
            queuedToPlay = false;
            needsImmediateStart = false;

            DBG("SamplePlayerPlugin: Seamless switch to cached buffer at beat " + juce::String(sampleStartBeat, 2));
        }
        // Handle pending file switch for seamless Live Mode transitions (from disk)
        else if (queuedToPlay && hasPendingFile && pendingReaderSource != nullptr)
        {
            // Stop current playback but keep audio flowing until switch
            transportSource.stop();
            transportSource.setSource(nullptr);
            readerSource.reset();

            // Switch to pending file
            readerSource = std::move(pendingReaderSource);
            currentFilePath = pendingFilePath;
            fileSampleRate = pendingFileSampleRate;
            fileLengthSamples = pendingFileLengthSamples;
            useEditableBuffer = false;

            // Connect to transport source
            if (auto* reader = readerSource->getAudioFormatReader())
            {
                transportSource.setSource(readerSource.get(), 0, nullptr,
                                          reader->sampleRate, reader->numChannels);

                if (currentSampleRate > 0)
                {
                    transportSource.prepareToPlay(currentBlockSize, currentSampleRate);
                }
            }

            // Clear pending state
            hasPendingFile = false;
            pendingFilePath = {};
            pendingFileSampleRate = 0.0;
            pendingFileLengthSamples = 0;

            // Start playback at the quantization boundary
            sampleStartBeat = currQuantize * beatsPerQuantize;
            transportSource.setPosition(queuedOffset);
            transportSource.start();
            playing = true;
            samplesPlayedSinceStart = 0;
            queuedToPlay = false;
            needsImmediateStart = false;

            DBG("SamplePlayerPlugin: Seamless switch to new file at beat " + juce::String(sampleStartBeat, 2));
        }
        else if (queuedToPlay && readerSource != nullptr)
        {
            // Normal queuedPlay without file switch
            sampleStartBeat = currQuantize * beatsPerQuantize;  // Exact boundary position
            transportSource.setPosition(queuedOffset);
            transportSource.start();
            playing = true;
            queuedToPlay = false;
            needsImmediateStart = false;

            DBG("SamplePlayerPlugin: Started at beat " + juce::String(sampleStartBeat, 2) +
                " (quantize boundary " + juce::String(currQuantize) + ")");
        }

        if (queuedToStop && playing)
        {
            transportSource.stop();
            transportSource.setPosition(0.0);
            playing = false;
            queuedToStop = false;
            needsImmediateStart = false;

            DBG("SamplePlayerPlugin: Stopped at beat " + juce::String(transportPositionBeats, 2));
        }

        // Reset immediate start flag if it was set but no action was taken
        // (e.g., if queuedToPlay was true but no buffer/file was ready)
        if (needsImmediateStart && !queuedToPlay && !queuedToStop)
        {
            needsImmediateStart = false;
        }
    }

    // NOTE: Beat-synced looping removed from syncToTransport.
    // All looping is now handled exclusively in processBlock/processFromEditableBuffer
    // for sample-accurate timing. Having dual looping logic caused samplesPlayedSinceStart
    // counter corruption (syncToTransport resetting it while processBlock was tracking it).

    lastTransportBeat = transportPositionBeats;
}

//==============================================================================
// State Queries

double SamplePlayerPlugin::getLengthInSeconds() const
{
    // Check editable buffer first
    if (useEditableBuffer && sampleEditor && sampleEditor->isLoaded())
    {
        return sampleEditor->getDurationSeconds();
    }

    if (fileSampleRate > 0 && fileLengthSamples > 0)
        return (double)fileLengthSamples / fileSampleRate;
    return 0.0;
}

bool SamplePlayerPlugin::hasValidSource() const
{
    // Check if we have a valid editable buffer
    if (useEditableBuffer && sampleEditor && sampleEditor->isLoaded())
    {
        return true;
    }

    // Check if we have a valid reader source
    if (readerSource != nullptr)
    {
        return true;
    }

    return false;
}

void SamplePlayerPlugin::resetForLiveMode()
{
    juce::ScopedLock sl(lock);

    // Stop any current playback
    playing = false;
    transportSource.stop();
    transportSource.setSource(nullptr);
    readerSource.reset();

    // Clear editable buffer mode
    useEditableBuffer = false;
    editablePlayPosition = 0;

    // Reset file info so that the next play will load fresh
    currentFilePath = {};
    fileSampleRate = 0.0;
    fileLengthSamples = 0;

    // Clear any queued state
    queuedToPlay = false;
    queuedToStop = false;
    needsImmediateStart = false;

    // Clear pending state
    hasPendingFile = false;
    hasPendingCachedBuffer = false;
    pendingReaderSource.reset();
    pendingCachedBuffer.setSize(0, 0);
    pendingFilePath = {};
    pendingFileSampleRate = 0.0;
    pendingFileLengthSamples = 0;

    // Reset transport tracking
    lastTransportBeat = 0.0;
    sampleStartBeat = 0.0;
    samplesPlayedSinceStart = 0;

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
// AudioProcessor Implementation

void SamplePlayerPlugin::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ScopedLock sl(lock);

    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;

    transportSource.prepareToPlay(samplesPerBlock, sampleRate);
}

void SamplePlayerPlugin::releaseResources()
{
    juce::ScopedLock sl(lock);
    transportSource.releaseResources();
}

void SamplePlayerPlugin::processBlock(juce::AudioBuffer<float>& buffer,
                                       juce::MidiBuffer& /*midiMessages*/)
{
    juce::ScopedLock sl(lock);

    // Clear buffer first
    buffer.clear();

    if (!playing)
        return;

    // Use editable buffer if active
    if (useEditableBuffer && sampleEditor && sampleEditor->isLoaded())
    {
        processFromEditableBuffer(buffer, buffer.getNumSamples());
        return;
    }

    if (readerSource == nullptr)
        return;

    int numSamples = buffer.getNumSamples();

    // Calculate loop length in samples if using beat-based looping
    if (loopEnabled && useBeatsForLoop && currentBpm > 0 && currentSampleRate > 0)
    {
        double secondsPerBeat = 60.0 / currentBpm;
        double loopLengthSeconds = loopLengthBeats * secondsPerBeat;
        loopLengthSamples = static_cast<juce::int64>(loopLengthSeconds * currentSampleRate);
    }

    // Check if we need to loop based on samples played (sample-accurate looping)
    if (loopEnabled && useBeatsForLoop && loopLengthSamples > 0)
    {
        juce::int64 samplesRemainingInLoop = loopLengthSamples - samplesPlayedSinceStart;

        if (samplesRemainingInLoop <= 0)
        {
            // Time to loop - reset position
            transportSource.setPosition(startOffset);
            if (!transportSource.isPlaying())
                transportSource.start();
            samplesPlayedSinceStart = 0;
            DBG("SamplePlayerPlugin: Sample-accurate loop triggered");
        }
        else if (samplesRemainingInLoop < numSamples)
        {
            // Loop point is within this buffer - need to handle partial playback
            // Play remaining samples, then loop
            int samplesToPlay = static_cast<int>(samplesRemainingInLoop);

            // Get audio up to loop point
            juce::AudioSourceChannelInfo partialInfo(&buffer, 0, samplesToPlay);
            transportSource.getNextAudioBlock(partialInfo);

            // Reset for loop
            transportSource.setPosition(startOffset);
            if (!transportSource.isPlaying())
                transportSource.start();

            // Get remaining audio from start of sample
            int remainingSamples = numSamples - samplesToPlay;
            if (remainingSamples > 0)
            {
                juce::AudioSourceChannelInfo remainingInfo(&buffer, samplesToPlay, remainingSamples);
                transportSource.getNextAudioBlock(remainingInfo);
            }

            samplesPlayedSinceStart = remainingSamples;
            DBG("SamplePlayerPlugin: Sample-accurate loop (partial buffer)");
            return;
        }
    }

    // Get audio from transport source
    // Note: Mixer controls (volume, pan, mute, solo) are handled by TrackMixerPlugin
    juce::AudioSourceChannelInfo info(&buffer, 0, numSamples);
    transportSource.getNextAudioBlock(info);

    // Track samples played for loop timing
    samplesPlayedSinceStart += numSamples;

    // Check if playback has naturally ended (for non-looping mode)
    if (!loopEnabled && !transportSource.isPlaying())
    {
        playing = false;
        DBG("SamplePlayerPlugin: Playback ended naturally");
    }
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
    // currentSampleRate is set in prepareToPlay()
    double targetRate = currentSampleRate > 0 ? currentSampleRate : 48000.0;

    bool success = sampleEditor->loadFromFile(file, targetRate);

    if (success)
    {
        currentFilePath = filePath;
        fileSampleRate = sampleEditor->getSampleRate();  // Will now be targetRate
        fileLengthSamples = static_cast<juce::int64>(sampleEditor->getNumSamples());
        useEditableBuffer = true;
        editablePlayPosition = 0;

        DBG("SamplePlayerPlugin: Loaded for editing (resampled to " +
            juce::String(fileSampleRate) + " Hz): " + filePath);
    }
    else
    {
        DBG("SamplePlayerPlugin: Failed to load for editing: " + filePath);
    }

    return success;
}

void SamplePlayerPlugin::applyEdits()
{
    juce::ScopedLock sl(lock);

    if (!sampleEditor || !sampleEditor->isLoaded())
        return;

    useEditableBuffer = true;

    // Update file info from edited buffer
    fileSampleRate = sampleEditor->getSampleRate();
    fileLengthSamples = static_cast<juce::int64>(sampleEditor->getNumSamples());

    DBG("SamplePlayerPlugin: Applied edits, using editable buffer");
}

void SamplePlayerPlugin::discardEdits()
{
    juce::ScopedLock sl(lock);

    useEditableBuffer = false;
    editablePlayPosition = 0;

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

void SamplePlayerPlugin::reloadFromEditedBuffer()
{
    juce::ScopedLock sl(lock);

    if (!sampleEditor || !sampleEditor->isLoaded())
        return;

    // Update file info from edited buffer
    fileSampleRate = sampleEditor->getSampleRate();
    fileLengthSamples = static_cast<juce::int64>(sampleEditor->getNumSamples());

    DBG("SamplePlayerPlugin: Reloaded from edited buffer");
}

//==============================================================================
// Process audio from editable buffer

void SamplePlayerPlugin::processFromEditableBuffer(juce::AudioBuffer<float>& buffer, int numSamples)
{
    if (!sampleEditor || !sampleEditor->isLoaded())
        return;

    SampleBuffer* sampleBuffer = sampleEditor->getBuffer();
    if (!sampleBuffer)
        return;

    int totalSamples = sampleBuffer->getNumSamples();
    if (totalSamples == 0)
        return;

    // Get the sample buffer's sample rate (may differ from device rate)
    double bufferSampleRate = sampleBuffer->getSampleRate();
    if (bufferSampleRate <= 0)
        bufferSampleRate = currentSampleRate;

    // Calculate loop length in samples if using beat-based looping
    // Use the DEVICE sample rate, because samplesPlayedSinceStart advances at device rate
    // (each processBlock call increments by numSamples which is in device-rate samples)
    if (loopEnabled && useBeatsForLoop && currentBpm > 0 && currentSampleRate > 0)
    {
        double secondsPerBeat = 60.0 / currentBpm;
        double loopLengthSeconds = loopLengthBeats * secondsPerBeat;
        loopLengthSamples = static_cast<juce::int64>(loopLengthSeconds * currentSampleRate);
    }

    // Handle playback offset
    double playbackOffset = sampleBuffer->getPlaybackOffset();
    juce::int64 offsetSamples = static_cast<juce::int64>(playbackOffset * bufferSampleRate);

    int samplesRemaining = numSamples;
    int destOffset = 0;

    while (samplesRemaining > 0)
    {
        // Calculate effective position with offset
        juce::int64 effectivePos = editablePlayPosition - offsetSamples;

        // Check for loop point
        if (loopEnabled && useBeatsForLoop && loopLengthSamples > 0)
        {
            juce::int64 samplesRemainingInLoop = loopLengthSamples - samplesPlayedSinceStart;

            if (samplesRemainingInLoop <= 0)
            {
                // Reset for loop
                editablePlayPosition = static_cast<juce::int64>(startOffset * bufferSampleRate);
                samplesPlayedSinceStart = 0;
                effectivePos = editablePlayPosition - offsetSamples;
            }
            else if (samplesRemainingInLoop < samplesRemaining)
            {
                // Partial loop - copy what we can, then loop
                int samplesToCopy = static_cast<int>(samplesRemainingInLoop);

                if (effectivePos >= 0 && effectivePos < totalSamples)
                {
                    int available = juce::jmin(samplesToCopy, totalSamples - static_cast<int>(effectivePos));
                    sampleBuffer->copyToBuffer(buffer, destOffset, static_cast<int>(effectivePos), available);
                }

                editablePlayPosition += samplesToCopy;
                samplesPlayedSinceStart += samplesToCopy;
                destOffset += samplesToCopy;
                samplesRemaining -= samplesToCopy;

                // Reset for loop
                editablePlayPosition = static_cast<juce::int64>(startOffset * bufferSampleRate);
                samplesPlayedSinceStart = 0;
                continue;
            }
        }

        // Copy samples from buffer
        if (effectivePos >= 0 && effectivePos < totalSamples)
        {
            int available = juce::jmin(samplesRemaining, totalSamples - static_cast<int>(effectivePos));
            sampleBuffer->copyToBuffer(buffer, destOffset, static_cast<int>(effectivePos), available);
            destOffset += available;
            editablePlayPosition += available;
            samplesPlayedSinceStart += available;
            samplesRemaining -= available;

            // If we've reached the end and not looping, stop
            if (effectivePos + available >= totalSamples && !loopEnabled)
            {
                playing = false;
                break;
            }
        }
        else if (effectivePos < 0)
        {
            // Before sample start - output silence and advance
            int silenceSamples = juce::jmin(samplesRemaining, static_cast<int>(-effectivePos));
            destOffset += silenceSamples;
            editablePlayPosition += silenceSamples;
            samplesPlayedSinceStart += silenceSamples;
            samplesRemaining -= silenceSamples;
        }
        else
        {
            // Past sample end
            if (loopEnabled && useBeatsForLoop && loopLengthSamples > 0)
            {
                // Beat-based loop: pad with silence until loop point
                juce::int64 samplesUntilLoop = loopLengthSamples - samplesPlayedSinceStart;
                if (samplesUntilLoop > 0)
                {
                    // Output silence and advance counters
                    int silenceSamples = juce::jmin(samplesRemaining, static_cast<int>(samplesUntilLoop));
                    destOffset += silenceSamples;
                    editablePlayPosition += silenceSamples;
                    samplesPlayedSinceStart += silenceSamples;
                    samplesRemaining -= silenceSamples;
                }
                else
                {
                    // Loop point reached, reset to start
                    editablePlayPosition = static_cast<juce::int64>(startOffset * bufferSampleRate);
                    samplesPlayedSinceStart = 0;
                }
            }
            else if (loopEnabled)
            {
                // Time-based loop: restart immediately (original behavior)
                editablePlayPosition = static_cast<juce::int64>(startOffset * bufferSampleRate);
                samplesPlayedSinceStart = 0;
            }
            else
            {
                playing = false;
                break;
            }
        }
    }
}
