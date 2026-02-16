/*
    SamplerInstrumentPlugin - Sample-based instrument that plays MP3 samples

    Receives MIDI input, plays back velocity-layered decoded samples.
    Samples organized by pitch and velocity layer from instrument directories.
    32-voice polyphony with voice stealing, release envelope, background loading.
*/

#pragma once

#include <JuceHeader.h>

class SamplerInstrumentPlugin : public juce::AudioProcessor
{
public:
    SamplerInstrumentPlugin();
    ~SamplerInstrumentPlugin() override;

    //==============================================================================
    // Instrument Loading

    /** Load instrument samples from a directory containing instrument.json and MP3 files.
        Loading happens on a background thread. */
    void loadInstrument(const juce::File& instrumentDir);

    /** Get the name of the currently loaded instrument */
    juce::String getInstrumentName() const;

    /** Check if instrument samples are currently loading */
    bool isLoading() const;

    /** Check if instrument is loaded and ready to play */
    bool isLoaded() const;

    //==============================================================================
    // AudioProcessor Implementation

    const juce::String getName() const override { return "Sampler Instrument"; }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    double getTailLengthSeconds() const override { return 2.0; }

    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }

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
    //==============================================================================
    // Instrument configuration parsed from instrument.json
    struct InstrumentConfig
    {
        juce::String name;
        int minPitch = 21;
        int maxPitch = 108;
        double durationSeconds = 3.0;
        double releaseSeconds = 1.0;
        bool percussive = false;
        std::vector<int> velocities;  // e.g., {15, 31, 47, 63, 79, 95, 111, 127}
    };

    // A single decoded sample
    struct SamplerSample
    {
        juce::AudioBuffer<float> buffer;
        double sampleRate = 0.0;
    };

    // Voice state for polyphony
    struct Voice
    {
        bool active = false;
        bool releasing = false;
        int pitch = -1;
        int velocityLayer = 0;
        double samplePosition = 0.0;   // Fractional position in sample buffer
        double pitchRatio = 1.0;       // sourceSR / deviceSR for sample-rate conversion
        float releaseGain = 1.0f;      // Current gain during release envelope
        float releaseDecrement = 0.0f; // Per-sample gain decrement during release
        uint64_t age = 0;              // Monotonic counter for voice-stealing priority
    };

    //==============================================================================
    // Background loading thread
    class SamplerLoadThread : public juce::Thread
    {
    public:
        SamplerLoadThread(SamplerInstrumentPlugin& owner);
        void run() override;

        juce::File directoryToLoad;

    private:
        SamplerInstrumentPlugin& plugin;
    };

    //==============================================================================
    // Voice management helpers
    int findFreeVoice();
    int stealVoice();
    void startVoice(int voiceIndex, int pitch, int velocity);
    void stopVoice(int voiceIndex);
    void releaseVoice(int voiceIndex);
    void renderVoices(juce::AudioBuffer<float>& buffer, int startSample, int numSamples);

    // Velocity layer lookup: find index into velocities[] for a given MIDI velocity
    int getVelocityLayerIndex(int midiVelocity) const;

    //==============================================================================
    // Sample data - protected by dataLock
    // Indexed as samples[pitch - config.minPitch][velocityLayerIndex]
    std::vector<std::vector<SamplerSample>> samples;
    InstrumentConfig config;
    bool loaded = false;
    juce::CriticalSection dataLock;

    // Loading state
    std::unique_ptr<SamplerLoadThread> loadThread;
    std::atomic<bool> loading { false };

    // Voices
    static constexpr int maxVoices = 32;
    Voice voices[maxVoices];
    uint64_t voiceAgeCounter = 0;

    // Audio format manager for decoding MP3
    juce::AudioFormatManager formatManager;

    // Current device sample rate
    double deviceSampleRate = 44100.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SamplerInstrumentPlugin)
};
