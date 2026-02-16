/*
    MidiTrackOutput - Plugin that outputs MIDI for a specific track

    This plugin acts as a MIDI source for a track in the sequencer.
    It receives MIDI from the MidiBridge and outputs it to connected
    instrument plugins (synths, samplers, etc.)

    In processBlock, it queries the MidiClipScheduler for sample-accurate
    MIDI events, providing tight timing for sequenced notes.
*/

#pragma once

#include <JuceHeader.h>

// Forward declaration to avoid circular includes
class MidiClipScheduler;

class MidiTrackOutput : public juce::AudioProcessor
{
public:
    MidiTrackOutput();
    ~MidiTrackOutput() override;

    //==============================================================================
    // Track assignment
    void setTrackIndex(int index) { trackIndex = index; }
    int getTrackIndex() const { return trackIndex; }

    //==============================================================================
    // Clip scheduler - set after construction for audio-thread driven scheduling
    void setClipScheduler(MidiClipScheduler* scheduler) { clipScheduler = scheduler; }

    //==============================================================================
    // Instrument processor - for applying VST parameter automation
    void setInstrumentProcessor(juce::AudioProcessor* proc) { instrumentProcessor = proc; }

    //==============================================================================
    // MIDI input from sequencer (called by MidiTrackOutputManager)
    // Used for immediate/preview notes (not sequenced playback)
    void addMidiMessage(const juce::MidiMessage& message);
    void addMidiBuffer(const juce::MidiBuffer& buffer);
    void clearPendingMidi();

    //==============================================================================
    // AudioProcessor Implementation

    const juce::String getName() const override { return "MIDI Track " + juce::String(trackIndex + 1); }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    double getTailLengthSeconds() const override { return 0.0; }

    // This plugin outputs MIDI
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

private:
    int trackIndex = 0;
    MidiClipScheduler* clipScheduler = nullptr;
    juce::AudioProcessor* instrumentProcessor = nullptr;

    // Cumulative sample position for this track (audio thread only)
    int64_t totalSamplesProcessed = 0;

    // MIDI buffer for immediate/preview messages (not sequenced)
    juce::MidiBuffer pendingMidiMessages;
    juce::CriticalSection midiLock;

    // Current sample rate for timestamp conversion
    double currentSampleRate = 44100.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiTrackOutput)
};
