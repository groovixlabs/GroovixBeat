#pragma once
#include <JuceHeader.h>

/**
 * DrumKitPlugin - a polyphonic, per-note one-shot sample player.
 *
 * Each MIDI note number (0-127) can have an audio file assigned to it.
 * When a note-on arrives the sample plays from the beginning to its end
 * regardless of the subsequent note-off (true one-shot behaviour).
 * Up to MAX_VOICES samples can play simultaneously.
 *
 * Signal flow:
 *   MidiTrackOutput --MIDI--> DrumKitPlugin --audio--> TrackMixer --> MasterMixer --> Output
 */
class DrumKitPlugin : public juce::AudioProcessor
{
public:
    static constexpr int MAX_NOTES  = 128;
    static constexpr int MAX_VOICES = 32;   // simultaneous one-shot voices

    DrumKitPlugin();
    ~DrumKitPlugin() override = default;

    //==========================================================================
    // AudioProcessor interface
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    bool acceptsMidi()  const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int  getNumPrograms()                           override { return 1; }
    int  getCurrentProgram()                        override { return 0; }
    void setCurrentProgram(int)                     override {}
    const juce::String getProgramName(int)          override { return "Default"; }
    void changeProgramName(int, const juce::String&)override {}

    bool hasEditor() const override { return false; }
    juce::AudioProcessorEditor* createEditor()      override { return nullptr; }

    void getStateInformation(juce::MemoryBlock& destData)          override;
    void setStateInformation(const void* data, int sizeInBytes)    override;

    const juce::String getName() const override
    {
        return "DrumKit:" + juce::String(trackIndex + 1);
    }

    //==========================================================================
    // Sample management (call from message thread only)
    bool         loadSample(int noteNumber, const juce::File& audioFile);
    void         clearSample(int noteNumber);
    juce::String getSamplePath(int noteNumber) const;
    bool         hasSample(int noteNumber) const;

    //==========================================================================
    // Track identity
    void setTrackIndex(int index) { trackIndex = index; }
    int  getTrackIndex() const    { return trackIndex; }

private:
    struct DrumSample
    {
        juce::AudioBuffer<float> buffer;
        juce::String             filePath;
        bool                     loaded = false;
    };

    struct DrumVoice
    {
        int   noteNumber = -1;
        int   position   = 0;
        float velocity   = 1.0f;
        bool  active     = false;
    };

    std::array<DrumSample, MAX_NOTES>  samples;
    std::array<DrumVoice,  MAX_VOICES> voices;
    juce::CriticalSection              voiceLock;
    juce::AudioFormatManager           formatManager;
    int                                trackIndex = -1;

    void triggerNote(int noteNumber, float velocity);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DrumKitPlugin)
};
