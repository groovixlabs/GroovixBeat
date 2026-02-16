/*
    MidiTrackOutputManager - Manages MidiTrackOutput instances for all tracks
*/

#include "MidiTrackOutputManager.h"

//==============================================================================
MidiTrackOutputManager::MidiTrackOutputManager()
{
}

MidiTrackOutputManager::~MidiTrackOutputManager()
{
    // Note: We don't delete the plugins here as they are owned by PluginGraph
    trackOutputs.clear();
}

//==============================================================================
// Plugin Instance Management

MidiTrackOutput* MidiTrackOutputManager::createOutputForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto* output = new MidiTrackOutput();
    output->setTrackIndex(trackIndex);
    trackOutputs[trackIndex] = output;

    DBG("MidiTrackOutputManager: Created output for track " + juce::String(trackIndex));
    return output;
}

void MidiTrackOutputManager::registerOutputForTrack(int trackIndex, MidiTrackOutput* output)
{
    juce::ScopedLock sl(lock);

    if (output != nullptr)
    {
        output->setTrackIndex(trackIndex);
        trackOutputs[trackIndex] = output;
        DBG("MidiTrackOutputManager: Registered output for track " + juce::String(trackIndex));
    }
}

void MidiTrackOutputManager::unregisterOutputForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto it = trackOutputs.find(trackIndex);
    if (it != trackOutputs.end())
    {
        trackOutputs.erase(it);
        DBG("MidiTrackOutputManager: Unregistered output for track " + juce::String(trackIndex));
    }
}

MidiTrackOutput* MidiTrackOutputManager::getOutputForTrack(int trackIndex)
{
    juce::ScopedLock sl(lock);

    auto it = trackOutputs.find(trackIndex);
    if (it != trackOutputs.end())
        return it->second;

    return nullptr;
}

int MidiTrackOutputManager::getNumOutputs() const
{
    juce::ScopedLock sl(lock);
    return static_cast<int>(trackOutputs.size());
}

//==============================================================================
// MIDI Routing

void MidiTrackOutputManager::sendMidiToTrack(int trackIndex, const juce::MidiMessage& message)
{
    auto* output = getOutputForTrack(trackIndex);
    if (output != nullptr)
    {
        output->addMidiMessage(message);
    }
}

void MidiTrackOutputManager::sendNoteOn(int trackIndex, int channel, int pitch, float velocity)
{
    auto message = juce::MidiMessage::noteOn(channel, pitch, velocity);
    sendMidiToTrack(trackIndex, message);
}

void MidiTrackOutputManager::sendNoteOff(int trackIndex, int channel, int pitch)
{
    auto message = juce::MidiMessage::noteOff(channel, pitch);
    sendMidiToTrack(trackIndex, message);
}

void MidiTrackOutputManager::sendControlChange(int trackIndex, int channel, int controller, int value)
{
    auto message = juce::MidiMessage::controllerEvent(channel, controller, value);
    sendMidiToTrack(trackIndex, message);
}

void MidiTrackOutputManager::sendProgramChange(int trackIndex, int channel, int program)
{
    auto message = juce::MidiMessage::programChange(channel, program);
    sendMidiToTrack(trackIndex, message);
}

void MidiTrackOutputManager::sendAllNotesOff(int trackIndex, int channel)
{
    auto message = juce::MidiMessage::allNotesOff(channel);
    sendMidiToTrack(trackIndex, message);
}

void MidiTrackOutputManager::sendAllNotesOffAllTracks()
{
    juce::ScopedLock sl(lock);

    for (auto& pair : trackOutputs)
    {
        if (pair.second != nullptr)
        {
            // Send all notes off on all channels
            for (int ch = 1; ch <= 16; ++ch)
            {
                auto message = juce::MidiMessage::allNotesOff(ch);
                pair.second->addMidiMessage(message);
            }
        }
    }

    DBG("MidiTrackOutputManager: Sent all notes off to all tracks");
}

//==============================================================================
// State Queries

std::vector<int> MidiTrackOutputManager::getTrackIndices() const
{
    juce::ScopedLock sl(lock);

    std::vector<int> indices;
    indices.reserve(trackOutputs.size());

    for (const auto& pair : trackOutputs)
    {
        indices.push_back(pair.first);
    }

    return indices;
}
