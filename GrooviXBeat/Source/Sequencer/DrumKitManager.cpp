#include "DrumKitManager.h"

DrumKitPlugin* DrumKitManager::createForTrack(int trackIndex)
{
    auto* plugin = new DrumKitPlugin();
    plugin->setTrackIndex(trackIndex);
    trackPlugins[trackIndex] = plugin;
    DBG("DrumKitManager: created plugin for track " + juce::String(trackIndex));
    return plugin;
}

void DrumKitManager::registerForTrack(int trackIndex, DrumKitPlugin* plugin)
{
    if (plugin != nullptr)
    {
        plugin->setTrackIndex(trackIndex);
        trackPlugins[trackIndex] = plugin;
    }
}

void DrumKitManager::unregisterForTrack(int trackIndex)
{
    trackPlugins.erase(trackIndex);
}

DrumKitPlugin* DrumKitManager::getForTrack(int trackIndex) const
{
    auto it = trackPlugins.find(trackIndex);
    return (it != trackPlugins.end()) ? it->second : nullptr;
}

bool DrumKitManager::loadSample(int trackIndex, int noteNumber,
                                const juce::File& audioFile)
{
    auto* plugin = getForTrack(trackIndex);
    if (plugin == nullptr)
    {
        DBG("DrumKitManager::loadSample - no plugin for track " + juce::String(trackIndex));
        return false;
    }
    return plugin->loadSample(noteNumber, audioFile);
}
