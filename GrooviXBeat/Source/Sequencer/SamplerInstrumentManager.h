/*
    SamplerInstrumentManager - Manages SamplerInstrumentPlugin instances for all tracks

    Routes instrument loading commands to the appropriate track sampler plugins.
    Follows the same pattern as MidiTrackOutputManager / SamplePlayerManager.
*/

#pragma once

#include <JuceHeader.h>
#include "../Plugins/SamplerInstrumentPlugin.h"

class SamplerInstrumentManager
{
public:
    SamplerInstrumentManager();
    ~SamplerInstrumentManager();

    //==============================================================================
    // Plugin Instance Management

    /**
     * Create a SamplerInstrumentPlugin for a track.
     * Returns raw pointer - ownership is transferred to caller (typically PluginGraph).
     */
    SamplerInstrumentPlugin* createInstrumentForTrack(int trackIndex);

    /**
     * Register an existing plugin instance for a track.
     */
    void registerInstrumentForTrack(int trackIndex, SamplerInstrumentPlugin* plugin);

    /**
     * Unregister a plugin (e.g., when removing from graph).
     * Does NOT delete the plugin.
     */
    void unregisterInstrumentForTrack(int trackIndex);

    /** Get the plugin for a track, or nullptr if not found */
    SamplerInstrumentPlugin* getInstrumentForTrack(int trackIndex);

    /** Get number of registered instruments */
    int getNumInstruments() const;

    //==============================================================================
    // Instrument Control

    /** Set the instrument for a track by name and base directory.
        Resolves the instrument directory and tells the plugin to load.
        Returns true if loading was triggered, false if already loaded/skipped. */
    bool setTrackInstrument(int trackIndex, const juce::String& instrumentName,
                            const juce::File& baseDir);

    /** Get the currently loaded instrument name for a track */
    juce::String getTrackInstrumentName(int trackIndex);

    //==============================================================================
    // State Queries

    /** Get list of all track indices with registered instruments */
    std::vector<int> getTrackIndices() const;

private:
    std::map<int, SamplerInstrumentPlugin*> trackInstruments;
    std::map<int, juce::String> requestedInstrumentNames; // tracks what was requested per track
    mutable juce::CriticalSection lock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SamplerInstrumentManager)
};
