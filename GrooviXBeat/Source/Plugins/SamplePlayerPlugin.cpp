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
    DBG("SamplePlayerPlugin::loadFile CALLED with path: '" + filePath + "'");

    // Step 1: Stop transport BEFORE acquiring the lock.
    // transportSource.stop() blocks until the audio thread finishes its current callback.
    // Holding 'lock' here would deadlock: audio-thread processBlock holds 'lock' →
    // can't ack stop → message thread waits 1 s per call → audio graph stalls.
    transportSource.stop();
    transportSource.setSource(nullptr);

    // Step 2: File I/O outside lock (can be slow for large files).
    juce::File file(filePath);
    if (!file.existsAsFile())
    {
        DBG("SamplePlayerPlugin: File not found: " + filePath);
        juce::ScopedLock sl(lock);
        playing = false;
        readerSource.reset();
        cachedMemoryBlock.reset();
        currentFilePath = {};
        return false;
    }

    auto* reader = formatManager.createReaderFor(file);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Could not create reader for: " + filePath);
        juce::ScopedLock sl(lock);
        playing = false;
        readerSource.reset();
        cachedMemoryBlock.reset();
        currentFilePath = {};
        return false;
    }

    double newSampleRate     = reader->sampleRate;
    int64_t newLengthSamples = reader->lengthInSamples;
    int newNumChannels       = reader->numChannels;
    auto newReaderSource     = std::make_unique<juce::AudioFormatReaderSource>(reader, true);

    // Step 3: Commit state under brief lock — only plain-variable writes, no AudioTransportSource calls.
    {
        juce::ScopedLock sl(lock);
        playing = false;
        readerSource.reset();
        cachedMemoryBlock.reset();
        readerSource = std::move(newReaderSource);
        readerSource->setLooping(loopEnabled && !useBeatsForLoop);
        fileSampleRate    = newSampleRate;
        fileLengthSamples = newLengthSamples;
        currentFilePath   = filePath;
    }

    // Step 4: Connect transport source outside lock (AudioTransportSource has its own thread safety).
    transportSource.setSource(readerSource.get(), 0, nullptr, newSampleRate, newNumChannels);
    if (currentSampleRate > 0)
        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);

    DBG("SamplePlayerPlugin: Loaded " + filePath +
        " (duration: " + juce::String(getLengthInSeconds(), 2) + "s)");
    return true;
}

bool SamplePlayerPlugin::loadFromCachedBuffer(const juce::String& filePath,
                                               const juce::AudioBuffer<float>& cachedBuffer,
                                               double bufferSampleRate)
{
    DBG("SamplePlayerPlugin::loadFromCachedBuffer - path: " + filePath +
        " samples: " + juce::String(cachedBuffer.getNumSamples()) +
        " sampleRate: " + juce::String(bufferSampleRate));

    if (cachedBuffer.getNumSamples() == 0 || bufferSampleRate <= 0)
    {
        DBG("SamplePlayerPlugin: Invalid cached buffer for: " + filePath);
        return false;
    }

    // Step 1: Stop transport BEFORE the lock (same deadlock-prevention as loadFile).
    transportSource.stop();
    transportSource.setSource(nullptr);

    // Step 2: WAV encoding outside the lock — can be hundreds of ms for large buffers.
    juce::MemoryBlock newMemoryBlock;
    auto* reader = createWavReaderFromBuffer(cachedBuffer, bufferSampleRate, newMemoryBlock);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Failed to encode cached buffer as WAV: " + filePath);
        return false;
    }

    double newSampleRate     = reader->sampleRate;
    int64_t newLengthSamples = reader->lengthInSamples;
    int newNumChannels       = reader->numChannels;
    auto newReaderSource     = std::make_unique<juce::AudioFormatReaderSource>(reader, true);

    // Step 3: Commit state under brief lock — plain-variable writes only.
    {
        juce::ScopedLock sl(lock);
        playing = false;
        readerSource.reset();
        cachedMemoryBlock.reset();
        cachedMemoryBlock = std::move(newMemoryBlock);
        readerSource = std::move(newReaderSource);
        readerSource->setLooping(loopEnabled && !useBeatsForLoop);
        fileSampleRate    = newSampleRate;
        fileLengthSamples = newLengthSamples;
        currentFilePath   = filePath;
    }

    // Step 4: Connect transport source outside lock.
    transportSource.setSource(readerSource.get(), 0, nullptr, newSampleRate, newNumChannels);
    if (currentSampleRate > 0)
        transportSource.prepareToPlay(currentBlockSize, currentSampleRate);

    DBG("SamplePlayerPlugin: Loaded from cache (WAV-in-memory) " + filePath +
        " (duration: " + juce::String(getLengthInSeconds(), 2) + "s)");
    return true;
}

//==============================================================================
void SamplePlayerPlugin::play(double offsetSeconds)
{
    // Stop BEFORE acquiring the lock to avoid deadlock with processBlock.
    transportSource.stop();

    {
        juce::ScopedLock sl(lock);
        if (readerSource == nullptr)
            return;
        startOffset = offsetSeconds;
        playing = false;  // will be set true after transportSource.start()
    }

    transportSource.setPosition(offsetSeconds);
    transportSource.start();

    {
        juce::ScopedLock sl(lock);
        playing = true;
        samplesPlayedSinceStart = 0;
        queuedToPlay = false;
        queuedToStop = false;
        needsStartBeatInit = true;
    }

    DBG("SamplePlayerPlugin: Playing from " + juce::String(offsetSeconds, 3) + "s, loopLengthBeats=" + juce::String(loopLengthBeats));
}

void SamplePlayerPlugin::stop()
{
    // Call transportSource.stop() BEFORE acquiring the lock.
    // transportSource.stop() blocks until the audio thread acknowledges the stop.
    // The audio thread's processBlock() holds 'lock' while running, so if we
    // acquire 'lock' first and then call transportSource.stop(), we deadlock:
    // message thread holds lock → audio thread can't enter processBlock → never
    // acknowledges stop → message thread waits 1 s per player before timing out.
    if (readerSource != nullptr)
        transportSource.stop();

    {
        juce::ScopedLock sl(lock);

        if (readerSource != nullptr)
            transportSource.setPosition(0.0);

        playing = false;
        queuedToPlay = false;
        queuedToStop = false;

        // Clear mute state so the track plays normally next time it is started.
        // If a live-mode mute fired but the track was stopped before unmute, the
        // muted flag would persist and silence all subsequent scene/track playback.
        muted = false;
        targetMuteSample.store(-1,   std::memory_order_relaxed);
        targetUnmuteSample.store(-1, std::memory_order_relaxed);
        pendingMuteNotification.store(false,   std::memory_order_relaxed);
        pendingUnmuteNotification.store(false, std::memory_order_relaxed);
    }

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
    targetStopSample.store(-1, std::memory_order_relaxed);  // cancel any stale stop

    DBG("SamplePlayerPlugin: Queued to play (offset: " + juce::String(offsetSeconds, 3) + "s)");
}

bool SamplePlayerPlugin::loadFileForPendingPlay(const juce::String& filePath, double offsetSeconds)
{
    DBG("SamplePlayerPlugin::loadFileForPendingPlay - path: " + filePath);

    // Step 1: Perform disk I/O WITHOUT holding the player lock so we don't
    // stall the audio thread (which acquires the same lock in processBlock).
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

    double newFileSampleRate     = reader->sampleRate;
    int64_t newFileLengthSamples = reader->lengthInSamples;

    auto newReaderSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    newReaderSource->setLooping(loopEnabled && !useBeatsForLoop);

    // Step 2: Acquire the player lock briefly to commit the pending state.
    {
        juce::ScopedLock sl(lock);

        pendingReaderSource      = std::move(newReaderSource);
        pendingFileSampleRate    = newFileSampleRate;
        pendingFileLengthSamples = newFileLengthSamples;
        pendingFilePath          = filePath;

        hasPendingFile = true;
        queuedToPlay   = true;
        queuedToStop   = false;
        queuedOffset   = offsetSeconds;
        // Do NOT set needsImmediateStart — let crossedBoundary detection fire at the quantize boundary
    }

    DBG("SamplePlayerPlugin: Prepared pending file for seamless transition: " + filePath);
    return true;
}

bool SamplePlayerPlugin::loadCachedBufferForPendingPlay(const juce::String& filePath,
                                                         const juce::AudioBuffer<float>& cachedBuffer,
                                                         double bufferSampleRate,
                                                         double offsetSeconds)
{
    DBG("SamplePlayerPlugin::loadCachedBufferForPendingPlay - path: " + filePath +
        " samples: " + juce::String(cachedBuffer.getNumSamples()));

    if (cachedBuffer.getNumSamples() == 0 || bufferSampleRate <= 0)
    {
        DBG("SamplePlayerPlugin: Invalid cached buffer for pending play");
        return false;
    }

    // ----------------------------------------------------------------
    // Step 1: Encode the WAV WITHOUT holding the player lock.
    // The audio thread's processBlock() also acquires this lock, so holding
    // it during potentially-slow encoding (tens to hundreds of milliseconds
    // for large buffers) blocks the entire audio callback and causes a
    // dropout across ALL sample players until encoding finishes.
    // ----------------------------------------------------------------
    juce::MemoryBlock newMemoryBlock;
    auto* reader = createWavReaderFromBuffer(cachedBuffer, bufferSampleRate, newMemoryBlock);
    if (reader == nullptr)
    {
        DBG("SamplePlayerPlugin: Failed to encode pending cached buffer as WAV: " + filePath);
        return false;
    }

    double newFileSampleRate     = reader->sampleRate;
    int64_t newFileLengthSamples = reader->lengthInSamples;

    // loopEnabled / useBeatsForLoop are only written from the message thread
    // (same thread as this function), so reading them outside the lock is safe.
    auto newReaderSource = std::make_unique<juce::AudioFormatReaderSource>(reader, true);
    newReaderSource->setLooping(loopEnabled && !useBeatsForLoop);

    // ----------------------------------------------------------------
    // Step 2: Acquire the player lock briefly to commit the pending state.
    // All state mutations that the audio thread reads are done here.
    // ----------------------------------------------------------------
    {
        juce::ScopedLock sl(lock);

        pendingReaderSource.reset();
        pendingMemoryBlock.reset();

        pendingMemoryBlock       = std::move(newMemoryBlock);
        pendingReaderSource      = std::move(newReaderSource);
        pendingFileSampleRate    = newFileSampleRate;
        pendingFileLengthSamples = newFileLengthSamples;
        pendingFilePath          = filePath;

        hasPendingFile = true;
        queuedToPlay   = true;
        queuedToStop   = false;
        queuedOffset   = offsetSeconds;
        // Do NOT set needsImmediateStart — let crossedBoundary detection fire at the quantize boundary
    }

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

    // Also disarm audio-thread targets so pending file/mute never fires
    targetStartSample.store(-1,  std::memory_order_relaxed);
    targetStopSample.store(-1,   std::memory_order_relaxed);
    targetMuteSample.store(-1,   std::memory_order_relaxed);
    targetUnmuteSample.store(-1, std::memory_order_relaxed);
    hasPendingFile = false;
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
    // =========================================================================
    // Phase 1: Check transport-stopped case under brief lock.
    // transportSource.stop() must be called OUTSIDE the lock to avoid deadlock
    // (audio thread's processBlock() also holds 'lock').
    // =========================================================================
    bool needsTransportStop = false;
    {
        juce::ScopedLock sl(lock);
        currentBpm = bpm;
        if (!transportPlaying)
        {
            lastTransportBeat = transportPositionBeats;
            if (playing)
            {
                playing = false;
                needsTransportStop = true;
            }
        }
    }

    if (!transportPlaying)
    {
        if (needsTransportStop)
        {
            transportSource.stop();
            DBG("[SPP T" + juce::String(trackIndex) + "] STOPPED by transport (transportPlaying=false)"
                + " at beat=" + juce::String(transportPositionBeats, 2));
        }
        return;
    }

    // =========================================================================
    // Phase 2: Detect boundary actions under lock — collect what needs doing
    // WITHOUT calling any AudioTransportSource methods (they can block/deadlock).
    //
    // For the seamless-switch case we move the pending reader OUT of the player
    // state into a local variable so we can safely destroy the old reader after
    // releasing the lock (once transportSource.setSource(nullptr) has been
    // called and the transport no longer holds a raw pointer to the old reader).
    // =========================================================================

    enum class SceneAction { None, SeamlessSwitch, DirectStart, Stop };
    SceneAction action = SceneAction::None;

    // Captured for SeamlessSwitch:
    std::unique_ptr<juce::AudioFormatReaderSource> newReaderSource;
    juce::MemoryBlock                              newMemoryBlock;
    juce::String                                   newFilePath;
    double                                         newFileSampleRate    = 0.0;
    int64_t                                        newFileLengthSamples = 0;
    double                                         newSampleStartBeat   = 0.0;
    double                                         newStartPos          = 0.0;

    {
        juce::ScopedLock sl(lock);

        double beatsPerQuantize = quantizeSteps / 4.0;
        int prevQuantize = (int)(lastTransportBeat / beatsPerQuantize);
        int currQuantize = (int)(transportPositionBeats / beatsPerQuantize);
        bool crossedBoundary = currQuantize > prevQuantize;

        if (crossedBoundary || needsImmediateStart)
        {
            // Live-mode clips are handled sample-accurately in processBlock() —
            // skip scene-mode boundary logic when the audio-thread path is armed.
            bool livePathArmed = (targetStartSample.load(std::memory_order_relaxed) >= 0);

            if (!livePathArmed)
            {
                if (queuedToPlay && hasPendingFile && pendingReaderSource != nullptr)
                {
                    // Move pending reader to locals — do NOT touch readerSource yet
                    // (transport still holds a raw pointer to the current reader;
                    // we must call setSource(nullptr) first, outside the lock).
                    newReaderSource      = std::move(pendingReaderSource);
                    newMemoryBlock       = std::move(pendingMemoryBlock);
                    newFilePath          = pendingFilePath;
                    newFileSampleRate    = pendingFileSampleRate;
                    newFileLengthSamples = pendingFileLengthSamples;
                    newSampleStartBeat   = currQuantize * beatsPerQuantize;
                    newStartPos          = queuedOffset;

                    hasPendingFile           = false;
                    pendingFilePath          = {};
                    pendingFileSampleRate    = 0.0;
                    pendingFileLengthSamples = 0;
                    queuedToPlay             = false;
                    needsImmediateStart      = false;
                    playing                  = false;  // set true again after transport ops
                    action = SceneAction::SeamlessSwitch;
                }
                else if (queuedToPlay && readerSource != nullptr)
                {
                    newSampleStartBeat = currQuantize * beatsPerQuantize;
                    newStartPos        = queuedOffset;
                    queuedToPlay       = false;
                    needsImmediateStart = false;
                    action = SceneAction::DirectStart;
                }
            }

            bool liveStopArmed = (targetStopSample.load(std::memory_order_relaxed) >= 0);
            if (queuedToStop && !liveStopArmed && action == SceneAction::None)
            {
                if (playing)
                {
                    playing = false;
                    action = SceneAction::Stop;
                }
                queuedToStop        = false;
                needsImmediateStart = false;
            }

            if (needsImmediateStart && action == SceneAction::None)
                needsImmediateStart = false;
        }

        lastTransportBeat = transportPositionBeats;
    }

    // =========================================================================
    // Phase 3: Execute transport operations OUTSIDE the lock.
    // AudioTransportSource calls are safe here: no lock is held, so the audio
    // thread can freely enter processBlock() and ack any stop requests.
    // =========================================================================

    if (action == SceneAction::SeamlessSwitch)
    {
        // 1. Stop the transport — transport releases its hold on the old reader.
        transportSource.stop();
        transportSource.setSource(nullptr);

        // 2. Now safe to swap old reader for new one (transport no longer holds it).
        {
            juce::ScopedLock sl(lock);
            readerSource.reset();          // destroy old reader
            cachedMemoryBlock.reset();
            cachedMemoryBlock = std::move(newMemoryBlock);
            readerSource      = std::move(newReaderSource);
            currentFilePath   = newFilePath;
            fileSampleRate    = newFileSampleRate;
            fileLengthSamples = newFileLengthSamples;
        }

        // 3. Connect and start new reader.
        // Note: setSource() calls source->prepareToPlay() internally when the
        // transport is already prepared — no need for an explicit prepareToPlay().
        if (readerSource != nullptr)
        {
            if (auto* reader = readerSource->getAudioFormatReader())
                transportSource.setSource(readerSource.get(), 0, nullptr,
                                          reader->sampleRate, reader->numChannels);
        }

        transportSource.setPosition(newStartPos);
        transportSource.start();

        {
            juce::ScopedLock sl(lock);
            sampleStartBeat         = newSampleStartBeat;
            playing                 = true;
            samplesPlayedSinceStart = 0;
        }

        DBG("SamplePlayerPlugin: Seamless switch (scene) at beat " + juce::String(newSampleStartBeat, 2));
    }
    else if (action == SceneAction::DirectStart)
    {
        transportSource.setPosition(newStartPos);
        transportSource.start();

        {
            juce::ScopedLock sl(lock);
            sampleStartBeat = newSampleStartBeat;
            playing         = true;
        }

        DBG("SamplePlayerPlugin: Started (scene) at beat " + juce::String(newSampleStartBeat, 2));
    }
    else if (action == SceneAction::Stop)
    {
        transportSource.stop();
        transportSource.setPosition(0.0);
        DBG("SamplePlayerPlugin: Stopped (scene) at beat " + juce::String(transportPositionBeats, 2));
    }
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
    // Stop transport before the lock (same deadlock-prevention pattern).
    transportSource.stop();
    transportSource.setSource(nullptr);

    juce::ScopedLock sl(lock);

    playing = false;
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
    // Arming a new START cancels any previously queued STOP.  Without this, a
    // stale targetStopSample left over from a scene transition (queued when this
    // track was not yet playing) fires immediately after the new START triggers,
    // silencing the sample before it outputs any audio.
    targetStopSample.store(-1, std::memory_order_relaxed);
    targetStartSample.store(samplePos, std::memory_order_relaxed);
}

void SamplePlayerPlugin::setTargetStopSample(int64_t samplePos)
{
    targetStopSample.store(samplePos, std::memory_order_relaxed);
}

void SamplePlayerPlugin::setTargetMuteSample(int64_t samplePos)
{
    targetMuteSample.store(samplePos, std::memory_order_relaxed);
}

void SamplePlayerPlugin::setTargetUnmuteSample(int64_t samplePos)
{
    targetUnmuteSample.store(samplePos, std::memory_order_relaxed);
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
    // releaseResources is called from the audio thread, so it's safe to call
    // transportSource.releaseResources() directly without the message-thread lock.
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

    // Periodic state dump — once every ~200 blocks per track to reveal ongoing state.
    const int64_t blockIndex = (currentSampleRate > 0 && currentBlockSize > 0)
                                   ? blockStart / currentBlockSize
                                   : 0;
    if (blockIndex % 200 == 0)
    {
        /*
        DBG("[SPP T" + juce::String(trackIndex) + "] STATE"
            + " playing=" + juce::String(playing ? 1 : 0)
            + " queuedPlay=" + juce::String(queuedToPlay ? 1 : 0)
            + " queuedStop=" + juce::String(queuedToStop ? 1 : 0)
            + " hasPending=" + juce::String(hasPendingFile ? 1 : 0)
            + " sps=" + juce::String(samplesPlayedSinceStart)
            + " loopSamples=" + juce::String(loopLengthSamples)
            + " bpm=" + juce::String(currentBpm, 1)
            + " tStart=" + juce::String(targetStartSample.load(std::memory_order_relaxed))
            + " tStop=" + juce::String(targetStopSample.load(std::memory_order_relaxed))
            + " cumPos=" + juce::String(blockStart));
            */
    }

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

                DBG("[SPP T" + juce::String(trackIndex) + "] STOP FIRED"
                    + " tStop=" + juce::String(tStop)
                    + " blockStart=" + juce::String(blockStart)
                    + " stopOffset=" + juce::String(stopOffset)
                    + " sps=" + juce::String(samplesPlayedSinceStart));

                if (stopOffset > 0 && readerSource != nullptr)
                {
                    juce::AudioSourceChannelInfo info(&buffer, 0, stopOffset);
                    transportSource.getNextAudioBlock(info);
                    samplesPlayedSinceStart += stopOffset;
                }

                // Do NOT call transportSource.stop() here — it spin-waits up to 1 second
                // on the audio thread waiting for stopped=true (which only getNextAudioBlock
                // sets), stalling the entire audio graph.  Setting plugin playing=false is
                // sufficient: future blocks return early without calling getNextAudioBlock.
                // The transport's internal playing flag stays true but is harmless since we
                // never call getNextAudioBlock again until the next START FIRED.
                playing      = false;
                queuedToStop = false;
                targetStopSample.store(-1, std::memory_order_relaxed);
                pendingStopNotification.store(true, std::memory_order_relaxed);

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

            DBG("[SPP T" + juce::String(trackIndex) + "] START FIRED"
                + " tStart=" + juce::String(tStart)
                + " blockStart=" + juce::String(blockStart)
                + " triggerOffset=" + juce::String(triggerOffset)
                + " hasPending=" + juce::String(hasPendingFile ? 1 : 0)
                + " wasPlaying=" + juce::String(playing ? 1 : 0));

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
                // Do NOT call transportSource.stop() here — spin-wait on audio thread.
                // setSource(nullptr) internally sets playing=false under callbackLock
                // without any spin-wait, which is sufficient to stop the transport.
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
                    // setSource() calls source->prepareToPlay() internally when the
                    // transport is already prepared — no heap allocation on the audio thread.
                    transportSource.setSource(readerSource.get(), 0, nullptr,
                                              reader->sampleRate, reader->numChannels);
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
            else
            {
                DBG("[SPP T" + juce::String(trackIndex) + "] START FIRED but readerSource is null — no audio!");
            }

            targetStartSample.store(-1, std::memory_order_relaxed);
            pendingStartNotification.store(true, std::memory_order_relaxed);
            cumulativeSamplePosition += numSamples;
            return;
        }
    }

    // =========================================================================
    // Audio-thread quantize MUTE / UNMUTE  (Live Mode mute toggle)
    // =========================================================================
    // Muting keeps the transport running so loop position is preserved.
    // When unmuted the audio resumes from exactly where it would be in the loop
    // without any seeking or file reloading.
    {
        int64_t tMute = targetMuteSample.load(std::memory_order_relaxed);
        if (tMute >= 0 && playing && !muted && tMute <= blockStart + numSamples)
        {
            DBG("[SPP T" + juce::String(trackIndex) + "] MUTE FIRED at cumPos=" + juce::String(blockStart));
            muted = true;
            targetMuteSample.store(-1, std::memory_order_relaxed);
            pendingMuteNotification.store(true, std::memory_order_relaxed);
        }

        int64_t tUnmute = targetUnmuteSample.load(std::memory_order_relaxed);
        if (tUnmute >= 0 && playing && muted && tUnmute <= blockStart + numSamples)
        {
            // Sample-accurate restart: advance the transport silently up to the
            // trigger point (output is zeros anyway — muted), then start fresh audio
            // from the trigger offset onwards.  Without this the full block would
            // render from startOffset even if the trigger is mid-block.
            int triggerOffset = (int)std::max(int64_t(0), tUnmute - blockStart);
            triggerOffset = std::min(triggerOffset, numSamples);

            DBG("[SPP T" + juce::String(trackIndex) + "] UNMUTE FIRED at cumPos=" + juce::String(blockStart)
                + " triggerOffset=" + juce::String(triggerOffset) + " - restarting from beginning");

            // Advance transport (discarded — buffer was cleared at block start; muted = zeros).
            if (triggerOffset > 0 && readerSource != nullptr)
            {
                juce::AudioSourceChannelInfo silentInfo(&buffer, 0, triggerOffset);
                transportSource.getNextAudioBlock(silentInfo);
            }

            // Restart from the beginning of the clip.
            // Do NOT call transportSource.stop() — it spin-waits on the audio thread.
            // The transport is already playing (mute keeps it running); setPosition()
            // seeks to startOffset and the next getNextAudioBlock renders from there.
            // Do NOT call transportSource.start() — already playing, start() is a no-op
            // when internal playing=true, and the seek via setPosition is sufficient.
            transportSource.setPosition(startOffset);
            samplesPlayedSinceStart = 0;
            muted = false;
            targetUnmuteSample.store(-1, std::memory_order_relaxed);
            pendingUnmuteNotification.store(true, std::memory_order_relaxed);

            // Fill post-trigger audio from the restarted source.
            int postSamples = numSamples - triggerOffset;
            if (postSamples > 0 && readerSource != nullptr)
            {
                juce::AudioSourceChannelInfo newInfo(&buffer, triggerOffset, postSamples);
                transportSource.getNextAudioBlock(newInfo);
                samplesPlayedSinceStart += postSamples;
            }

            cumulativeSamplePosition += numSamples;
            return;
        }
    }

    // =========================================================================
    // Normal playback (scene mode / already-running clips)
    // =========================================================================

    if (!playing || readerSource == nullptr)
    {
        // Log the first few times this track is silently not-playing, to catch
        // unexpected stops. Rate-limited to avoid flooding.
        if (blockIndex % 150 == 0)
        {
            /*
            DBG("[SPP T" + juce::String(trackIndex) + "] SILENT"
                + " playing=" + juce::String(playing ? 1 : 0)
                + " hasSource=" + juce::String(readerSource != nullptr ? 1 : 0)
                + " hasPending=" + juce::String(hasPendingFile ? 1 : 0)
                + " queuedPlay=" + juce::String(queuedToPlay ? 1 : 0)
                + " tStart=" + juce::String(targetStartSample.load(std::memory_order_relaxed))
                + " cumPos=" + juce::String(blockStart));
              */  
        }
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
            DBG("[SPP T" + juce::String(trackIndex) + "] LOOP WRAP (overrun)"
                + " sps=" + juce::String(samplesPlayedSinceStart)
                + " loopSamples=" + juce::String(loopLengthSamples)
                + " bpm=" + juce::String(currentBpm, 1)
                + " cumPos=" + juce::String(blockStart));
            // Seek back to loop start. Do NOT call transportSource.stop() — it
            // spin-waits up to 1 second on the audio thread, stalling all tracks.
            // setPosition() seeks safely while playing; if the transport internally
            // stopped at EOF, start() will re-arm it without any spin-wait.
            transportSource.setPosition(startOffset);
            if (!transportSource.isPlaying())
                transportSource.start();
            samplesPlayedSinceStart = 0;
        }
        else if (samplesRemainingInLoop < numSamples)
        {
            DBG("[SPP T" + juce::String(trackIndex) + "] LOOP WRAP (partial)"
                + " sps=" + juce::String(samplesPlayedSinceStart)
                + " remaining=" + juce::String(samplesRemainingInLoop)
                + " loopSamples=" + juce::String(loopLengthSamples)
                + " bpm=" + juce::String(currentBpm, 1)
                + " cumPos=" + juce::String(blockStart));

            int samplesToPlay = static_cast<int>(samplesRemainingInLoop);

            juce::AudioSourceChannelInfo partialInfo(&buffer, 0, samplesToPlay);
            transportSource.getNextAudioBlock(partialInfo);

            // Seek back to loop start — same as the overrun path above.
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
            if (muted) buffer.clear();
            cumulativeSamplePosition += numSamples;
            return;
        }
    }

    juce::AudioSourceChannelInfo info(&buffer, 0, numSamples);
    transportSource.getNextAudioBlock(info);
    samplesPlayedSinceStart += numSamples;

    if (!loopEnabled && !transportSource.isPlaying())
    {
        playing = false;
        DBG("[SPP T" + juce::String(trackIndex) + "] Playback ended naturally (non-looping)");
    }

    // If muted, silence the output — the transport has still advanced so the loop
    // position is correct and unmuting will resume audio seamlessly.
    if (muted)
        buffer.clear();

    // Spot-check: log when a playing, non-muted track outputs all-zero audio.
    if (!muted && blockIndex % 20 == 0)
    {
        float rms = 0.0f;
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            rms += buffer.getRMSLevel(ch, 0, numSamples);
        rms /= juce::jmax(1, buffer.getNumChannels());
        if (rms < 0.0001f)
        {
            DBG("[SPP T" + juce::String(trackIndex) + "] OUTPUT SILENT (rms~0 but playing=1)"
                + " sps=" + juce::String(samplesPlayedSinceStart)
                + " loopSamples=" + juce::String(loopLengthSamples)
                + " tsPlaying=" + juce::String(transportSource.isPlaying() ? 1 : 0)
                + " cumPos=" + juce::String(blockStart));
        }
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
    // Read currentFilePath under lock, then call loadFile() outside lock.
    // loadFile() calls transportSource.stop() which must not be inside a lock.
    juce::String pathToReload;
    {
        juce::ScopedLock sl(lock);
        if (sampleEditor)
            sampleEditor->clear();
        pathToReload = currentFilePath;
    }

    if (pathToReload.isNotEmpty())
    {
        juce::File file(pathToReload);
        if (file.existsAsFile())
            loadFile(pathToReload);
    }

    DBG("SamplePlayerPlugin: Discarded edits");
}

void SamplePlayerPlugin::releaseFileHandle()
{
    // Stop transport BEFORE the lock (same deadlock-prevention pattern as stop/loadFile).
    transportSource.stop();
    transportSource.setSource(nullptr);

    {
        juce::ScopedLock sl(lock);
        // Stop playback and release the file reader so the file can be overwritten.
        // Does NOT touch sampleEditor — the in-memory buffer is preserved.
        playing = false;
        readerSource.reset();
        cachedMemoryBlock.reset();
    }

    DBG("SamplePlayerPlugin: Released file handle");
}

