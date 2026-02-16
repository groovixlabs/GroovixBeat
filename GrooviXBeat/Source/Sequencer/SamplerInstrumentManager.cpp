/*
    SamplerInstrumentManager - Manages SamplerInstrumentPlugin instances for all tracks
*/

#include "SamplerInstrumentManager.h"

//==============================================================================
SamplerInstrumentManager::SamplerInstrumentManager()
{
}

SamplerInstrumentManager::~SamplerInstrumentManager()
{
    // Note: We don't delete the plugins here as they are owned by PluginGraph
    trackInstruments.clear();
}

//==============================================================================
// Plugin Instance Management

SamplerInstrumentPlugin* SamplerInstrumentManager::createInstrumentForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto* plugin = new SamplerInstrumentPlugin();
    trackInstruments[trackIndex] = plugin;

    DBG("SamplerInstrumentManager: Created instrument for track " + juce::String(trackIndex));
    return plugin;
}

void SamplerInstrumentManager::registerInstrumentForTrack(int trackIndex, SamplerInstrumentPlugin* plugin)
{
    juce::ScopedLock sl(lock);

    if (plugin != nullptr)
    {
        trackInstruments[trackIndex] = plugin;
        DBG("SamplerInstrumentManager: Registered instrument for track " + juce::String(trackIndex));
    }
}

void SamplerInstrumentManager::unregisterInstrumentForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto it = trackInstruments.find(trackIndex);
    if (it != trackInstruments.end())
    {
        trackInstruments.erase(it);
        DBG("SamplerInstrumentManager: Unregistered instrument for track " + juce::String(trackIndex));
    }
}

SamplerInstrumentPlugin* SamplerInstrumentManager::getInstrumentForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto it = trackInstruments.find(trackIndex);
    if (it != trackInstruments.end())
        return it->second;

    return nullptr;
}

int SamplerInstrumentManager::getNumInstruments() const
{
    juce::ScopedLock sl(lock);
    return static_cast<int>(trackInstruments.size());
}

//==============================================================================
// Instrument Control

bool SamplerInstrumentManager::setTrackInstrument(int trackIndex, const juce::String& instrumentName,
                                                   const juce::File& baseDir)
{
    SamplerInstrumentPlugin* plugin = nullptr;

    {
        juce::ScopedLock sl(lock);

        auto pluginIt = trackInstruments.find(trackIndex);
        if (pluginIt == trackInstruments.end() || pluginIt->second == nullptr)
        {
            DBG("SamplerInstrumentManager: No instrument plugin for track " + juce::String(trackIndex));
            return false;
        }
        plugin = pluginIt->second;

        // Skip if the same instrument is already loaded or currently loading
        auto nameIt = requestedInstrumentNames.find(trackIndex);
        if (nameIt != requestedInstrumentNames.end() && nameIt->second == instrumentName
            && (plugin->isLoaded() || plugin->isLoading()))
        {
            DBG("SamplerInstrumentManager: Instrument '" + instrumentName +
                "' already loaded on track " + juce::String(trackIndex) + ", skipping");
            return false;
        }

        requestedInstrumentNames[trackIndex] = instrumentName;
    }

    auto instrumentDir = baseDir.getChildFile(instrumentName);
    if (!instrumentDir.isDirectory())
    {
        DBG("SamplerInstrumentManager: Instrument directory not found: " + instrumentDir.getFullPathName());
        return false;
    }

    DBG("SamplerInstrumentManager: Loading instrument '" + instrumentName +
        "' for track " + juce::String(trackIndex) +
        " from " + instrumentDir.getFullPathName());

    plugin->loadInstrument(instrumentDir);
    return true;
}

juce::String SamplerInstrumentManager::getTrackInstrumentName(int trackIndex)
{
    auto* plugin = getInstrumentForTrack(trackIndex);
    if (plugin != nullptr)
        return plugin->getInstrumentName();

    return {};
}

//==============================================================================
// State Queries

std::vector<int> SamplerInstrumentManager::getTrackIndices() const
{
    juce::ScopedLock sl(lock);

    std::vector<int> indices;
    indices.reserve(trackInstruments.size());

    for (const auto& pair : trackInstruments)
    {
        indices.push_back(pair.first);
    }

    return indices;
}
