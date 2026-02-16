/*
    MidiTrackOutputManager - Manages MidiTrackOutput instances for all tracks

    Routes MIDI from the sequencer to the appropriate track output plugins,
    which can then be connected to instrument plugins in the graph.
*/

#pragma once

#include <JuceHeader.h>
#include "../Plugins/MidiTrackOutput.h"

class MidiTrackOutputManager
{
public:
    MidiTrackOutputManager();
    ~MidiTrackOutputManager();

    //==============================================================================
    // Plugin Instance Management

    /**
     * Create a MidiTrackOutput for a track.
     * Returns raw pointer - ownership is transferred to caller (typically PluginGraph).
     */
    MidiTrackOutput* createOutputForTrack(int trackIndex);

    /**
     * Register an existing plugin instance for a track.
     */
    void registerOutputForTrack(int trackIndex, MidiTrackOutput* output);

    /**
     * Unregister a plugin (e.g., when removing from graph).
     */
    void unregisterOutputForTrack(int trackIndex);

    /** Get the output for a track, or nullptr if not found */
    MidiTrackOutput* getOutputForTrack(int trackIndex);

    /** Get number of registered outputs */
    int getNumOutputs() const;

    //==============================================================================
    // MIDI Routing (called from MidiBridge)

    /** Send a MIDI message to a specific track */
    void sendMidiToTrack(int trackIndex, const juce::MidiMessage& message);

    /** Send note on to a track */
    void sendNoteOn(int trackIndex, int channel, int pitch, float velocity);

    /** Send note off to a track */
    void sendNoteOff(int trackIndex, int channel, int pitch);

    /** Send control change to a track */
    void sendControlChange(int trackIndex, int channel, int controller, int value);

    /** Send program change to a track */
    void sendProgramChange(int trackIndex, int channel, int program);

    /** Send all notes off to a track */
    void sendAllNotesOff(int trackIndex, int channel);

    /** Send all notes off to all tracks */
    void sendAllNotesOffAllTracks();

    //==============================================================================
    // State Queries

    /** Get list of all track indices with registered outputs */
    std::vector<int> getTrackIndices() const;

private:
    std::map<int, MidiTrackOutput*> trackOutputs;
    mutable juce::CriticalSection lock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTrackOutputManager)
};
