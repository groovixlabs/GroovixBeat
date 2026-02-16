/*
    TrackMixerPlugin - Internal audio processor for track mixing

    Features:
    - Volume control with constant-power panning
    - Pan control (stereo)
    - Mute and Solo functionality
    - Inserted between instrument plugin and audio output for MIDI tracks
*/

#pragma once

#include <JuceHeader.h>

class TrackMixerPlugin : public juce::AudioProcessor
{
public:
    TrackMixerPlugin();
    ~TrackMixerPlugin() override = default;

    //==============================================================================
    // Track assignment
    void setTrackIndex(int index) { trackIndex = index; }
    int getTrackIndex() const { return trackIndex; }

    //==============================================================================
    // Level Metering
    float getLevelL() const { return levelL.load(); }
    float getLevelR() const { return levelR.load(); }

    //==============================================================================
    // Mixer Control
    void setVolume(float newVolume) { volume = juce::jlimit(0.0f, 1.0f, newVolume); }
    float getVolume() const { return volume; }

    void setPan(float newPan) { pan = juce::jlimit(-1.0f, 1.0f, newPan); }
    float getPan() const { return pan; }

    void setMuted(bool shouldMute) { muted = shouldMute; }
    bool isMuted() const { return muted; }

    void setSolo(bool shouldSolo) { solo = shouldSolo; }
    bool isSolo() const { return solo; }

    void setOtherTrackSoloed(bool otherSoloed) { otherTrackSoloed = otherSoloed; }
    bool isOtherTrackSoloed() const { return otherTrackSoloed; }

    //==============================================================================
    // AudioProcessor Implementation

    const juce::String getName() const override { return "Track Mixer " + juce::String(trackIndex + 1); }

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    double getTailLengthSeconds() const override { return 0.0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }

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
    int trackIndex = 0;

    // Mixer state
    float volume = 0.8f;           // 0.0 to 1.0
    float pan = 0.0f;              // -1.0 (left) to 1.0 (right)
    bool muted = false;
    bool solo = false;
    bool otherTrackSoloed = false; // True if another track has solo enabled

    // Prepared state
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;

    // Level metering (atomic for thread safety)
    std::atomic<float> levelL { 0.0f };
    std::atomic<float> levelR { 0.0f };
    float levelDecay = 0.95f; // Decay rate for level meters

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackMixerPlugin)
};
