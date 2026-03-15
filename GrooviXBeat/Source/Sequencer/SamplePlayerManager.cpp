/*
    SamplePlayerManager - Manages SamplePlayerPlugin instances for all tracks
*/

#include "SamplePlayerManager.h"

//==============================================================================
SamplePlayerManager::SamplePlayerManager()
{
    // Initialize format manager for cache loading
    cacheFormatManager.registerBasicFormats();
}

SamplePlayerManager::~SamplePlayerManager()
{
    // Note: We don't delete the plugins here as they are owned by PluginGraph
    trackPlayers.clear();

    // Clear the sample cache
    clearSampleCache();
}

//==============================================================================
// Plugin Instance Management

SamplePlayerPlugin* SamplePlayerManager::createPlayerForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto* player = new SamplePlayerPlugin();
    player->setTrackIndex(trackIndex);
    trackPlayers[trackIndex] = player;

    DBG("SamplePlayerManager: Created player for track " + juce::String(trackIndex));
    return player;
}

void SamplePlayerManager::registerPlayerForTrack(int trackIndex, SamplePlayerPlugin* player)
{
    juce::ScopedLock sl(lock);

    if (player != nullptr)
    {
        player->setTrackIndex(trackIndex);
        trackPlayers[trackIndex] = player;
        DBG("SamplePlayerManager: Registered player for track " + juce::String(trackIndex));
    }
}

void SamplePlayerManager::unregisterPlayerForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto it = trackPlayers.find(trackIndex);
    if (it != trackPlayers.end())
    {
        trackPlayers.erase(it);
        DBG("SamplePlayerManager: Unregistered player for track " + juce::String(trackIndex));
    }
}

SamplePlayerPlugin* SamplePlayerManager::getPlayerForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerManager::getPlayerForTrack(" + juce::String(trackIndex) +
        ") - trackPlayers.size() = " + juce::String((int)trackPlayers.size()));

    auto it = trackPlayers.find(trackIndex);
    if (it != trackPlayers.end())
    {
        DBG("SamplePlayerManager::getPlayerForTrack - found player at " +
            juce::String((juce::int64)it->second));
        return it->second;
    }

    DBG("SamplePlayerManager::getPlayerForTrack - player not found!");
    return nullptr;
}

int SamplePlayerManager::getNumPlayers() const
{
    juce::ScopedLock sl(lock);
    return static_cast<int>(trackPlayers.size());
}

//==============================================================================
// Direct Playback Control

void SamplePlayerManager::playSampleFile(int trackIndex,
                                          const juce::String& filePath,
                                          double offset,
                                          bool loop,
                                          double loopLengthBeats)
{
    DBG("SamplePlayerManager::playSampleFile - track " + juce::String(trackIndex) +
        ", file: " + filePath + ", loop: " + juce::String(loop ? "true" : "false") +
        ", loopLengthBeats: " + juce::String(loopLengthBeats));

    auto* player = getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SamplePlayerManager: No player for track " + juce::String(trackIndex));
        return;
    }

    DBG("SamplePlayerManager::playSampleFile - got player, loading file...");

    // Load file if different from current
    juce::String currentPath = player->getCurrentFilePath();
    DBG("SamplePlayerManager::playSampleFile - currentFilePath: '" + currentPath + "'");
    DBG("SamplePlayerManager::playSampleFile - requestedPath: '" + filePath + "'");
    DBG("SamplePlayerManager::playSampleFile - paths equal: " + juce::String(currentPath == filePath ? "YES" : "NO"));

    if (currentPath != filePath)
    {
        bool loaded = false;

        // Check cache first for instant loading.
        // Copy the raw pointer under cacheLock, then fit/load outside (same message thread,
        // so the pointer stays valid between releasing cacheLock and using it).
        const juce::AudioBuffer<float>* rawBuf    = nullptr;
        double                          rawSampleRate = 0.0;
        {
            juce::ScopedLock sl(cacheLock);
            auto it = sampleCache.find(filePath);
            if (it != sampleCache.end() && it->second != nullptr)
            {
                rawBuf       = &it->second->buffer;
                rawSampleRate = it->second->sampleRate;
            }
        }
        if (rawBuf != nullptr)
        {
            DBG("SamplePlayerManager::playSampleFile - LOADING FROM CACHE");
            auto fitted = fitBufferToLoopLength(*rawBuf, rawSampleRate, loopLengthBeats, currentBpm);
            loaded = player->loadFromCachedBuffer(filePath, fitted, rawSampleRate);
            if (loaded)
                DBG("SamplePlayerManager::playSampleFile - Loaded from cache successfully");
        }

        // Fall back to file loading if not in cache
        if (!loaded)
        {
            DBG("SamplePlayerManager::playSampleFile - LOADING FROM FILE");
            if (!player->loadFile(filePath))
            {
                DBG("SamplePlayerManager: Failed to load file: " + filePath);
                return;
            }
            DBG("SamplePlayerManager::playSampleFile - File loaded successfully");
        }
    }
    else
    {
        DBG("SamplePlayerManager::playSampleFile - SKIPPING LOAD (same file)");
    }

    // Set looping mode and loop length
    player->setLooping(loop);
    if (loop && loopLengthBeats > 0)
    {
        player->setLoopLengthBeats(loopLengthBeats);
        DBG("SamplePlayerManager: Set loop length to " + juce::String(loopLengthBeats) + " beats");
    }

    DBG("SamplePlayerManager::playSampleFile - calling play()");
    player->play(offset);
    DBG("SamplePlayerManager: Playing track " + juce::String(trackIndex) +
        " - " + filePath + " (loop: " + juce::String(loop ? "true" : "false") + ")");
}

void SamplePlayerManager::reloadSampleFile(int trackIndex, const juce::String& filePath)
{
    DBG("SamplePlayerManager::reloadSampleFile - track " + juce::String(trackIndex) + ", file: " + filePath);

    auto* player = getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SamplePlayerManager: No player for track " + juce::String(trackIndex));
        return;
    }

    // Force reload the file (even if path is the same)
    if (!player->loadFile(filePath))
    {
        DBG("SamplePlayerManager: Failed to reload file: " + filePath);
        return;
    }

    DBG("SamplePlayerManager: Reloaded file for track " + juce::String(trackIndex));
}

void SamplePlayerManager::stopSampleFile(int trackIndex)
{
    DBG("SamplePlayerManager::stopSampleFile - getting player for track " + juce::String(trackIndex));

    auto* player = getPlayerForTrack(trackIndex);

    DBG("SamplePlayerManager::stopSampleFile - player pointer: " + juce::String((juce::int64)player));

    if (player != nullptr)
    {
        DBG("SamplePlayerManager::stopSampleFile - calling player->stop()");
        player->stop();
        DBG("SamplePlayerManager: Stopped track " + juce::String(trackIndex));
    }
    else
    {
        DBG("SamplePlayerManager: No player found for track " + juce::String(trackIndex));
    }
}

void SamplePlayerManager::stopAllSamples()
{
    // Collect player pointers under lock, then call stop() outside the lock.
    // SamplePlayerPlugin::stop() calls transportSource.stop() which blocks until
    // the audio callback acks the stop.  Holding the manager lock here would
    // prevent any concurrent getPlayerForTrack() calls from returning, which in
    // pathological cases could cause priority inversion on the audio thread.
    std::vector<SamplePlayerPlugin*> players;
    {
        juce::ScopedLock sl(lock);
        DBG("SamplePlayerManager::stopAllSamples - " + juce::String((int)trackPlayers.size()) + " players");
        players.reserve(trackPlayers.size());
        for (auto& pair : trackPlayers)
            if (pair.second != nullptr)
                players.push_back(pair.second);
    }

    for (auto* player : players)
    {
        DBG("SamplePlayerManager::stopAllSamples - stopping track " + juce::String(player->getTrackIndex()));
        player->stop();
    }

    DBG("SamplePlayerManager: Stopped all samples");
}

//==============================================================================
// Live Mode API

void SamplePlayerManager::queueSampleFile(int trackIndex,
                                           const juce::String& filePath,
                                           double offset)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SamplePlayerManager: No player for track " + juce::String(trackIndex));
        return;
    }

    // Load file if different from current
    if (player->getCurrentFilePath() != filePath)
    {
        if (!player->loadFile(filePath))
        {
            DBG("SamplePlayerManager: Failed to load file: " + filePath);
            return;
        }
    }

    player->queuePlay(offset);
    DBG("SamplePlayerManager: Queued track " + juce::String(trackIndex) +
        " - " + filePath);
}

void SamplePlayerManager::queueSampleFileSeamless(int trackIndex,
                                                   const juce::String& filePath,
                                                   double offset,
                                                   bool loop,
                                                   double loopLengthBeats,
                                                   int64_t targetStartSample)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SamplePlayerManager: No player for track " + juce::String(trackIndex));
        return;
    }

    // Set looping mode before loading
    player->setLooping(loop);
    if (loop && loopLengthBeats > 0)
    {
        player->setLoopLengthBeats(loopLengthBeats);
    }

    // If file is same as current AND player has a valid source, just queue play
    // (no need for seamless switch). But if the source isn't valid, we need to load it.
    if (player->getCurrentFilePath() == filePath && player->hasValidSource())
    {
        player->setTargetStartSample(targetStartSample);
        player->queuePlay(offset);
        DBG("SamplePlayerManager: Queued same file for track " + juce::String(trackIndex));
        return;
    }

    // Load into a buffer (from cache or disk), resize to exact loop length, then
    // hand to the player as a pending cached buffer.  This guarantees that the
    // audio delivered to the player is sample-accurate: longer files are truncated
    // at the loop boundary; shorter files are zero-padded so the loop wraps cleanly.
    juce::AudioBuffer<float> workBuffer;
    double workSampleRate = 0.0;
    bool   loaded         = false;

    {
        // Hold cacheLock only long enough to copy the raw buffer pointer and metadata.
        // fitBufferToLoopLength() does a large allocation + copy — doing it inside
        // cacheLock would block other cache accesses for tens of milliseconds.
        const juce::AudioBuffer<float>* rawBuf = nullptr;
        double rawSampleRate = 0.0;
        {
            juce::ScopedLock sl(cacheLock);
            auto it = sampleCache.find(filePath);
            if (it != sampleCache.end() && it->second != nullptr)
            {
                rawBuf       = &it->second->buffer;
                rawSampleRate = it->second->sampleRate;
            }
        }
        if (rawBuf != nullptr)
        {
            DBG("SamplePlayerManager::queueSampleFileSeamless - USING CACHED BUFFER");
            workBuffer     = fitBufferToLoopLength(*rawBuf, rawSampleRate, loopLengthBeats, currentBpm);
            workSampleRate = rawSampleRate;
            loaded         = true;
        }
    }

    if (!loaded)
    {
        // Not in cache — read the file directly into a buffer, then resize.
        DBG("SamplePlayerManager::queueSampleFileSeamless - LOADING FROM FILE");
        juce::File file(filePath);
        if (!file.existsAsFile())
        {
            DBG("SamplePlayerManager: File not found: " + filePath);
            return;
        }
        std::unique_ptr<juce::AudioFormatReader> reader(cacheFormatManager.createReaderFor(file));
        if (reader == nullptr)
        {
            DBG("SamplePlayerManager: Could not create reader for: " + filePath);
            return;
        }
        juce::AudioBuffer<float> fileBuffer((int)reader->numChannels, (int)reader->lengthInSamples);
        reader->read(&fileBuffer, 0, (int)reader->lengthInSamples, 0, true, true);
        workSampleRate = reader->sampleRate;
        workBuffer     = fitBufferToLoopLength(fileBuffer, workSampleRate, loopLengthBeats, currentBpm);
        loaded         = true;
    }

    if (!loaded || workBuffer.getNumSamples() == 0)
    {
        DBG("SamplePlayerManager: Empty buffer for track " + juce::String(trackIndex));
        return;
    }

    bool queued = player->loadCachedBufferForPendingPlay(filePath, workBuffer, workSampleRate, offset);
    if (!queued)
    {
        DBG("SamplePlayerManager: Failed to load pending buffer for track " + juce::String(trackIndex));
        return;
    }

    DBG("SamplePlayerManager: Queued seamless transition for track " + juce::String(trackIndex) +
        " - " + filePath);

    // Set the audio-thread target so processBlock fires at the exact boundary sample.
    // This must be done AFTER loading the pending buffer so the player is ready.
    player->setTargetStartSample(targetStartSample);
}

void SamplePlayerManager::queueStopSample(int trackIndex, int64_t targetStopSample)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player != nullptr)
    {
        player->setTargetStopSample(targetStopSample);
        player->queueStop();
        DBG("[SPM] queueStopSample T" + juce::String(trackIndex)
            + " targetStop=" + juce::String(targetStopSample));

        // Snapshot all other players so we can see if they are affected.
        juce::ScopedLock sl(lock);
        for (auto& pair : trackPlayers)
        {
            if (pair.second == nullptr) continue;
            const int t = pair.first;
            if (t == trackIndex) continue; // already logged above
            DBG("[SPM]   peer T" + juce::String(t)
                + " playing=" + juce::String(pair.second->isCurrentlyPlaying() ? 1 : 0)
                + " queuedStop=" + juce::String(pair.second->isQueuedToStop() ? 1 : 0)
                + " queuedPlay=" + juce::String(pair.second->isQueuedToPlay() ? 1 : 0));
        }
    }
}

void SamplePlayerManager::cancelQueuedSample(int trackIndex)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player != nullptr)
    {
        player->cancelQueue();
    }
}

void SamplePlayerManager::queueMuteSample(int trackIndex, int64_t targetSample)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player != nullptr)
    {
        player->setTargetMuteSample(targetSample);
        DBG("[SPM] queueMuteSample T" + juce::String(trackIndex)
            + " target=" + juce::String(targetSample));
    }
}

void SamplePlayerManager::queueUnmuteSample(int trackIndex, int64_t targetSample)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player != nullptr)
    {
        player->setTargetUnmuteSample(targetSample);
        DBG("[SPM] queueUnmuteSample T" + juce::String(trackIndex)
            + " target=" + juce::String(targetSample));
    }
}

void SamplePlayerManager::setTrackLoopLengthBeats(int trackIndex, double beats)
{
    auto* player = getPlayerForTrack(trackIndex);
    if (player != nullptr)
    {
        player->setLoopLengthBeats(beats);
    }
}

void SamplePlayerManager::setTrackLoopLengthBars(int trackIndex, double bars)
{
    // Convert bars to beats (assuming 4/4 time: 4 beats per bar)
    setTrackLoopLengthBeats(trackIndex, bars * 4.0);
}

//==============================================================================
// Scene Triggering

void SamplePlayerManager::triggerScene(int sceneIndex,
                                        const std::vector<SceneClipInfo>& clips)
{
    juce::ScopedLock sl(lock);
    juce::ignoreUnused(sceneIndex);

    DBG("SamplePlayerManager: Triggering scene " + juce::String(sceneIndex) +
        " with " + juce::String(clips.size()) + " clips");

    // First, queue stop for all currently playing/queued samples
    for (auto& pair : trackPlayers)
    {
        if (pair.second != nullptr)
        {
            // Only queue stop if playing or queued to play
            if (pair.second->isCurrentlyPlaying() || pair.second->isQueuedToPlay())
            {
                pair.second->queueStop();
            }
        }
    }

    // Then queue all clips in the scene
    for (const auto& clip : clips)
    {
        auto* player = getPlayerForTrack(clip.trackIndex);
        if (player == nullptr)
            continue;

        // Load file if different
        if (player->getCurrentFilePath() != clip.filePath)
        {
            if (!player->loadFile(clip.filePath))
            {
                DBG("SamplePlayerManager: Failed to load " + clip.filePath +
                    " for track " + juce::String(clip.trackIndex));
                continue;
            }
        }

        // Set loop length
        player->setLoopLengthBeats(clip.loopLengthBeats);

        // Queue playback
        player->queuePlay(clip.offset);
    }
}

void SamplePlayerManager::stopScene()
{
    juce::ScopedLock sl(lock);

    for (auto& pair : trackPlayers)
    {
        if (pair.second != nullptr && pair.second->isCurrentlyPlaying())
        {
            pair.second->queueStop();
        }
    }

    DBG("SamplePlayerManager: Queued stop for all playing samples");
}

//==============================================================================
// Transport Sync

juce::AudioBuffer<float> SamplePlayerManager::fitBufferToLoopLength(const juce::AudioBuffer<float>& src,
                                                                       double srcSampleRate,
                                                                       double loopLengthBeats,
                                                                       double bpm)
{
    const int numChannels = src.getNumChannels();
    const int srcSamples  = src.getNumSamples();

    if (loopLengthBeats <= 0.0 || bpm <= 0.0 || srcSampleRate <= 0.0 || numChannels == 0)
    {
        // No valid loop spec — return a copy of the original buffer unchanged.
        juce::AudioBuffer<float> copy(numChannels, srcSamples);
        for (int ch = 0; ch < numChannels; ++ch)
            copy.copyFrom(ch, 0, src, ch, 0, srcSamples);
        return copy;
    }

    const int targetSamples = (int)std::round(loopLengthBeats * (60.0 / bpm) * srcSampleRate);

    if (targetSamples == srcSamples)
    {
        juce::AudioBuffer<float> copy(numChannels, srcSamples);
        for (int ch = 0; ch < numChannels; ++ch)
            copy.copyFrom(ch, 0, src, ch, 0, srcSamples);
        return copy;
    }

    juce::AudioBuffer<float> result(numChannels, targetSamples);
    result.clear();  // zero-fill (handles padding automatically)

    const int copyCount = std::min(srcSamples, targetSamples);
    for (int ch = 0; ch < numChannels; ++ch)
        result.copyFrom(ch, 0, src, ch, 0, copyCount);

    DBG("[SPM] fitBufferToLoopLength: src=" + juce::String(srcSamples)
        + " target=" + juce::String(targetSamples)
        + " (" + juce::String(targetSamples < srcSamples ? "truncated" : "padded") + ")"
        + " loopBeats=" + juce::String(loopLengthBeats, 2)
        + " bpm=" + juce::String(bpm, 1));

    return result;
}

void SamplePlayerManager::processTransportSync(double transportPositionBeats,
                                                double bpm,
                                                int quantizeSteps,
                                                bool transportPlaying)
{
    currentBpm = bpm;

    juce::ScopedLock sl(lock);

    currentQuantizeSteps = quantizeSteps;

    for (auto& pair : trackPlayers)
    {
        if (pair.second != nullptr)
        {
            pair.second->syncToTransport(transportPositionBeats, bpm,
                                          quantizeSteps, transportPlaying);
        }
    }
}

//==============================================================================
// State Queries

bool SamplePlayerManager::isAnySamplePlaying() const
{
    juce::ScopedLock sl(lock);

    for (const auto& pair : trackPlayers)
    {
        if (pair.second != nullptr && pair.second->isCurrentlyPlaying())
            return true;
    }

    return false;
}

bool SamplePlayerManager::isAnySampleQueued() const
{
    juce::ScopedLock sl(lock);

    for (const auto& pair : trackPlayers)
    {
        if (pair.second != nullptr && pair.second->isQueued())
            return true;
    }

    return false;
}

std::vector<int> SamplePlayerManager::getTrackIndices() const
{
    juce::ScopedLock sl(lock);

    std::vector<int> indices;
    indices.reserve(trackPlayers.size());

    for (const auto& pair : trackPlayers)
    {
        indices.push_back(pair.first);
    }

    return indices;
}

//==============================================================================
// Sample Caching for Live Mode

void SamplePlayerManager::preloadSamplesForLiveMode(const juce::StringArray& samplePaths)
{
    juce::ScopedLock sl(cacheLock);

    DBG("SamplePlayerManager: Preloading " + juce::String(samplePaths.size()) + " samples for Live Mode");

    int loadedCount = 0;
    int skippedCount = 0;
    int failedCount = 0;

    for (const auto& filePath : samplePaths)
    {
        // Skip if already cached
        if (sampleCache.find(filePath) != sampleCache.end())
        {
            skippedCount++;
            continue;
        }

        juce::File file(filePath);
        if (!file.existsAsFile())
        {
            DBG("SamplePlayerManager: Cache - File not found: " + filePath);
            failedCount++;
            continue;
        }

        // Create reader for the file
        std::unique_ptr<juce::AudioFormatReader> reader(cacheFormatManager.createReaderFor(file));
        if (reader == nullptr)
        {
            DBG("SamplePlayerManager: Cache - Could not create reader for: " + filePath);
            failedCount++;
            continue;
        }

        // Create cached sample entry
        auto cached = std::make_unique<CachedSample>();
        cached->filePath = filePath;
        cached->sampleRate = reader->sampleRate;

        // Allocate buffer and read entire file
        int numSamples = static_cast<int>(reader->lengthInSamples);
        int numChannels = static_cast<int>(reader->numChannels);
        cached->buffer.setSize(numChannels, numSamples);

        reader->read(&cached->buffer, 0, numSamples, 0, true, true);

        // Store in cache
        sampleCache[filePath] = std::move(cached);
        loadedCount++;

        DBG("SamplePlayerManager: Cached " + filePath +
            " (" + juce::String(numSamples) + " samples, " +
            juce::String(numChannels) + " channels)");
    }

    DBG("SamplePlayerManager: Cache complete - loaded: " + juce::String(loadedCount) +
        ", skipped (already cached): " + juce::String(skippedCount) +
        ", failed: " + juce::String(failedCount));
}

void SamplePlayerManager::clearSampleCache()
{
    juce::ScopedLock sl(cacheLock);

    int count = static_cast<int>(sampleCache.size());
    juce::ignoreUnused(count);
    sampleCache.clear();

    DBG("SamplePlayerManager: Cleared sample cache (" + juce::String(count) + " samples)");
}

juce::AudioBuffer<float>* SamplePlayerManager::getCachedSample(const juce::String& filePath)
{
    juce::ScopedLock sl(cacheLock);

    auto it = sampleCache.find(filePath);
    if (it != sampleCache.end() && it->second != nullptr)
    {
        return &(it->second->buffer);
    }

    return nullptr;
}

bool SamplePlayerManager::isSampleCached(const juce::String& filePath) const
{
    juce::ScopedLock sl(cacheLock);
    return sampleCache.find(filePath) != sampleCache.end();
}

void SamplePlayerManager::consumeLiveEvents(const std::function<void(int, bool)>& callback)
{
    // No lock needed: we only read/clear atomics; the map itself is only modified on the message thread.
    for (auto& pair : trackPlayers)
    {
        if (pair.second == nullptr) continue;
        if (pair.second->consumeStartNotification())
            callback(pair.first, true);
        if (pair.second->consumeStopNotification())
            callback(pair.first, false);
    }
}

void SamplePlayerManager::consumeMuteEvents(const std::function<void(int, bool)>& callback)
{
    for (auto& pair : trackPlayers)
    {
        if (pair.second == nullptr) continue;
        if (pair.second->consumeMuteNotification())
            callback(pair.first, true);   // true = muted
        if (pair.second->consumeUnmuteNotification())
            callback(pair.first, false);  // false = unmuted
    }
}

void SamplePlayerManager::resetAllPlayersForLiveMode(int64_t currentAudioPosition)
{
    juce::ScopedLock sl(lock);

    DBG("SamplePlayerManager: Resetting all players for Live Mode (audioPos=" +
        juce::String(currentAudioPosition) + ")");

    for (auto& pair : trackPlayers)
    {
        if (pair.second != nullptr)
        {
            pair.second->resetForLiveMode();
            // Sync the player's cumulative position counter to the current audio
            // position so targetStartSample comparisons in processBlock are correct.
            pair.second->setCumulativePosition(currentAudioPosition);
        }
    }
}
