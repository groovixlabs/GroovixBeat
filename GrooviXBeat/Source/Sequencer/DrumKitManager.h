#pragma once
#include <JuceHeader.h>
#include "../Plugins/DrumKitPlugin.h"

/**
 * Manages one DrumKitPlugin per track.
 * Ownership of plugins is held by the AudioProcessorGraph;
 * this class stores raw (non-owning) pointers for fast lookup.
 */
class DrumKitManager
{
public:
    DrumKitManager()  = default;
    ~DrumKitManager() = default;

    /** Create a new DrumKitPlugin for the given track.
     *  Ownership is transferred to the caller (usually the plugin graph). */
    DrumKitPlugin* createForTrack(int trackIndex);

    /** Register a plugin that was already added to the graph. */
    void registerForTrack(int trackIndex, DrumKitPlugin* plugin);

    /** Remove the registration without deleting the plugin. */
    void unregisterForTrack(int trackIndex);

    /** Look up the plugin for a track (may return nullptr). */
    DrumKitPlugin* getForTrack(int trackIndex) const;

    /** Convenience: load one sample into the right plugin. */
    bool loadSample(int trackIndex, int noteNumber, const juce::File& audioFile);

    int getNumKits() const { return (int)trackPlugins.size(); }

private:
    std::map<int, DrumKitPlugin*> trackPlugins;  // raw, non-owning pointers

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DrumKitManager)
};
