/*
    SampleEditorBridge - Bridge between JavaScript UI and C++ sample editing
*/

#include "SampleEditorBridge.h"

//==============================================================================
SampleEditorBridge::SampleEditorBridge(SamplePlayerManager& manager)
    : samplePlayerManager(manager)
{
}

SampleEditorBridge::~SampleEditorBridge()
{
}

//==============================================================================
// Helper to get editor for a track

SampleEditor* SampleEditorBridge::getEditorForTrack(int trackIndex)
{
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SampleEditorBridge: No player for track " + juce::String(trackIndex));
        return nullptr;
    }

    return player->getSampleEditor();
}

//==============================================================================
// Load for Editing

bool SampleEditorBridge::loadForEditing(int trackIndex, const juce::String& filePath)
{
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player == nullptr)
    {
        DBG("SampleEditorBridge: No player for track " + juce::String(trackIndex));
        return false;
    }

    bool success = player->loadFileForEditing(filePath);

    if (success)
    {
        // Store file path for caching
        trackFilePaths[trackIndex] = filePath;

        DBG("SampleEditorBridge: Loaded for editing on track " + juce::String(trackIndex) +
            ": " + filePath);
    }

    return success;
}

//==============================================================================
// Time Stretch / Warp

void SampleEditorBridge::timeStretch(int trackIndex, double ratio, double targetLengthSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->timeStretch(ratio, targetLengthSeconds);

    // Update the player to use the edited buffer
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Time stretched track " + juce::String(trackIndex) +
        " by " + juce::String(ratio, 3) + " (target: " + juce::String(targetLengthSeconds, 3) + "s)");
}

void SampleEditorBridge::applyWarp(int trackIndex, double sampleBPM, double targetBPM, double targetLengthSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->applyWarp(sampleBPM, targetBPM, targetLengthSeconds);

    // Update the player to use the edited buffer
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Warped track " + juce::String(trackIndex) +
        " from " + juce::String(sampleBPM, 1) + " to " + juce::String(targetBPM, 1) + " BPM" +
        " (target: " + juce::String(targetLengthSeconds, 3) + "s)");
}

double SampleEditorBridge::detectBPM(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return 0.0;

    double bpm = editor->detectBPM();

    DBG("SampleEditorBridge: Detected BPM for track " + juce::String(trackIndex) +
        ": " + juce::String(bpm, 1));

    return bpm;
}

//==============================================================================
// Playback Offset

void SampleEditorBridge::setPlaybackOffset(int trackIndex, double offsetSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return;

    editor->setPlaybackOffset(offsetSeconds);

    DBG("SampleEditorBridge: Set offset for track " + juce::String(trackIndex) +
        " to " + juce::String(offsetSeconds, 3) + "s");
}

void SampleEditorBridge::offsetSample(int trackIndex, double deltaSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return;

    editor->offsetBy(deltaSeconds);

    DBG("SampleEditorBridge: Offset track " + juce::String(trackIndex) +
        " by " + juce::String(deltaSeconds, 3) + "s");
}

double SampleEditorBridge::getPlaybackOffset(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return 0.0;

    return editor->getPlaybackOffset();
}

//==============================================================================
// Fade Operations

void SampleEditorBridge::fadeIn(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->fadeIn(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Fade in on track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::fadeOut(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->fadeOut(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Fade out on track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

//==============================================================================
// Selection Operations

void SampleEditorBridge::silence(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->silence(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Silenced track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::trim(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->trim(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Trimmed track " + juce::String(trackIndex) +
        " to " + juce::String(startSeconds, 3) + "s - " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::deleteRange(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->deleteRange(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Deleted range from track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::copyRange(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->copyRange(startSeconds, endSeconds);

    DBG("SampleEditorBridge: Copied range from track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::cutRange(int trackIndex, double startSeconds, double endSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    // Copy first, then delete
    editor->copyRange(startSeconds, endSeconds);
    editor->deleteRange(startSeconds, endSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Cut range from track " + juce::String(trackIndex) +
        " from " + juce::String(startSeconds, 3) + "s to " + juce::String(endSeconds, 3) + "s");
}

void SampleEditorBridge::paste(int trackIndex, double positionSeconds)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    if (!editor->hasClipboardData())
    {
        DBG("SampleEditorBridge: No clipboard data to paste");
        return;
    }

    editor->insertClipboard(positionSeconds);

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Pasted at track " + juce::String(trackIndex) +
        " position " + juce::String(positionSeconds, 3) + "s");
}

bool SampleEditorBridge::hasClipboardData(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return false;

    return editor->hasClipboardData();
}

//==============================================================================
// Reset / Undo

void SampleEditorBridge::reset(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return;

    editor->reset();

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform was reset to original
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Reset track " + juce::String(trackIndex));
}

void SampleEditorBridge::undo(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return;

    editor->undo();

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Undo on track " + juce::String(trackIndex));
}

void SampleEditorBridge::redo(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return;

    editor->redo();

    // Update the player
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player)
        player->reloadFromEditedBuffer();

    // Invalidate peaks cache since waveform changed
    invalidatePeaksCache(trackIndex);

    DBG("SampleEditorBridge: Redo on track " + juce::String(trackIndex));
}

bool SampleEditorBridge::canUndo(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return false;

    return editor->canUndo();
}

bool SampleEditorBridge::canRedo(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr)
        return false;

    return editor->canRedo();
}

//==============================================================================
// Save

bool SampleEditorBridge::saveToFile(int trackIndex, const juce::String& filePath)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return false;

    juce::File file(filePath);
    bool success = editor->saveToFile(file);

    if (success)
    {
        DBG("SampleEditorBridge: Saved track " + juce::String(trackIndex) +
            " to " + filePath);
    }
    else
    {
        DBG("SampleEditorBridge: Failed to save track " + juce::String(trackIndex));
    }

    return success;
}

//==============================================================================
// Query

bool SampleEditorBridge::isLoadedForEditing(int trackIndex)
{
    SamplePlayerPlugin* player = samplePlayerManager.getPlayerForTrack(trackIndex);
    if (player == nullptr)
        return false;

    return player->isUsingEditableBuffer();
}

double SampleEditorBridge::getDuration(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return 0.0;

    return editor->getDurationSeconds();
}

double SampleEditorBridge::getStoredBPM(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return 0.0;

    SampleBuffer* buffer = editor->getBuffer();
    if (buffer == nullptr)
        return 0.0;

    return buffer->getDetectedBPM();
}

std::vector<double> SampleEditorBridge::getTransients(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return {};

    SampleBuffer* buffer = editor->getBuffer();
    if (buffer == nullptr)
        return {};

    return buffer->getTransients();
}

std::vector<double> SampleEditorBridge::detectTransients(int trackIndex)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return {};

    SampleBuffer* buffer = editor->getBuffer();
    if (buffer == nullptr)
        return {};

    // Detect transients
    buffer->detectTransients();

    DBG("SampleEditorBridge: Detected transients for track " + juce::String(trackIndex));

    return buffer->getTransients();
}

std::vector<std::pair<float, float>> SampleEditorBridge::getWaveformPeaks(int trackIndex, int numPoints)
{
    SampleEditor* editor = getEditorForTrack(trackIndex);
    if (editor == nullptr || !editor->isLoaded())
        return {};

    SampleBuffer* buffer = editor->getBuffer();
    if (buffer == nullptr)
        return {};

    // Check if we have a cached file path for this track
    juce::String filePath;
    auto it = trackFilePaths.find(trackIndex);
    if (it != trackFilePaths.end())
        filePath = it->second;

    // Try to load from cache first
    if (filePath.isNotEmpty())
    {
        std::vector<std::pair<float, float>> cachedPeaks;
        if (loadPeaksFromCache(filePath, cachedPeaks, numPoints))
        {
            DBG("SampleEditorBridge: Loaded peaks from cache for track " + juce::String(trackIndex));
            return cachedPeaks;
        }
    }

    // Generate peaks from buffer
    auto peaks = buffer->getWaveformPeaks(numPoints);

    // Save to cache if we have a file path
    if (filePath.isNotEmpty() && !peaks.empty())
    {
        if (savePeaksToCache(filePath, peaks))
        {
            DBG("SampleEditorBridge: Saved peaks to cache for track " + juce::String(trackIndex));
        }
    }

    return peaks;
}

void SampleEditorBridge::invalidatePeaksCache(int trackIndex)
{
    auto it = trackFilePaths.find(trackIndex);
    if (it != trackFilePaths.end())
    {
        deletePeaksCache(it->second);
        DBG("SampleEditorBridge: Invalidated peaks cache for track " + juce::String(trackIndex));
    }
}

juce::String SampleEditorBridge::getCurrentFilePath(int trackIndex)
{
    auto it = trackFilePaths.find(trackIndex);
    if (it != trackFilePaths.end())
        return it->second;
    return {};
}

//==============================================================================
// Peaks Cache Helpers

juce::File SampleEditorBridge::getPeaksCacheFile(const juce::String& sampleFilePath)
{
    return juce::File(sampleFilePath + ".peaks");
}

bool SampleEditorBridge::loadPeaksFromCache(const juce::String& sampleFilePath,
                                             std::vector<std::pair<float, float>>& peaks,
                                             int expectedNumPoints)
{
    juce::File cacheFile = getPeaksCacheFile(sampleFilePath);

    if (!cacheFile.existsAsFile())
        return false;

    // Check if cache is older than the sample file
    juce::File sampleFile(sampleFilePath);
    if (sampleFile.existsAsFile() &&
        cacheFile.getLastModificationTime() < sampleFile.getLastModificationTime())
    {
        DBG("SampleEditorBridge: Cache is older than sample, regenerating");
        return false;
    }

    try
    {
        // Read JSON cache file
        juce::String jsonContent = cacheFile.loadFileAsString();
        juce::var json = juce::JSON::parse(jsonContent);

        if (!json.isObject())
            return false;

        int version = json.getProperty("version", 0);
        if (version != 1)
            return false;

        int numPoints = json.getProperty("numPoints", 0);
        if (numPoints != expectedNumPoints)
        {
            DBG("SampleEditorBridge: Cache has different numPoints (" + juce::String(numPoints) +
                " vs " + juce::String(expectedNumPoints) + "), regenerating");
            return false;
        }

        juce::var peaksArray = json.getProperty("peaks", juce::var());
        if (!peaksArray.isArray())
            return false;

        peaks.clear();
        peaks.reserve(numPoints);

        for (int i = 0; i < peaksArray.size(); ++i)
        {
            juce::var peak = peaksArray[i];
            if (peak.isArray() && peak.size() >= 2)
            {
                float minVal = static_cast<float>(peak[0]);
                float maxVal = static_cast<float>(peak[1]);
                peaks.push_back({ minVal, maxVal });
            }
        }

        return peaks.size() == static_cast<size_t>(expectedNumPoints);
    }
    catch (...)
    {
        DBG("SampleEditorBridge: Error reading peaks cache");
        return false;
    }
}

bool SampleEditorBridge::savePeaksToCache(const juce::String& sampleFilePath,
                                           const std::vector<std::pair<float, float>>& peaks)
{
    juce::File cacheFile = getPeaksCacheFile(sampleFilePath);

    try
    {
        // Build JSON
        juce::DynamicObject::Ptr root = new juce::DynamicObject();
        root->setProperty("version", 1);
        root->setProperty("numPoints", static_cast<int>(peaks.size()));

        juce::Array<juce::var> peaksArray;
        for (const auto& peak : peaks)
        {
            juce::Array<juce::var> peakPair;
            peakPair.add(peak.first);
            peakPair.add(peak.second);
            peaksArray.add(juce::var(peakPair));
        }
        root->setProperty("peaks", peaksArray);

        juce::String jsonContent = juce::JSON::toString(juce::var(root.get()));

        return cacheFile.replaceWithText(jsonContent);
    }
    catch (...)
    {
        DBG("SampleEditorBridge: Error writing peaks cache");
        return false;
    }
}

void SampleEditorBridge::deletePeaksCache(const juce::String& sampleFilePath)
{
    juce::File cacheFile = getPeaksCacheFile(sampleFilePath);
    if (cacheFile.existsAsFile())
    {
        cacheFile.deleteFile();
    }
}
