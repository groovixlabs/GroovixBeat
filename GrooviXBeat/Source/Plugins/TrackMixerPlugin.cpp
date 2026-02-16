/*
    TrackMixerPlugin - Internal audio processor for track mixing
*/

#include "TrackMixerPlugin.h"

//==============================================================================
TrackMixerPlugin::TrackMixerPlugin()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

//==============================================================================
void TrackMixerPlugin::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;
}

void TrackMixerPlugin::releaseResources()
{
    // Nothing to release
}

void TrackMixerPlugin::processBlock(juce::AudioBuffer<float>& buffer,
                                     juce::MidiBuffer& /*midiMessages*/)
{
    // Check mute/solo logic
    // If muted, output silence
    // If another track is soloed and this track is not soloed, output silence
    if (muted || (otherTrackSoloed && !solo))
    {
        buffer.clear();
        // Decay level meters when muted
        levelL.store(levelL.load() * levelDecay);
        levelR.store(levelR.load() * levelDecay);
        return;
    }

    // Apply volume and pan
    const int numChannels = buffer.getNumChannels();
    const int numSamples = buffer.getNumSamples();

    if (numChannels >= 2)
    {
        // Calculate left/right gains based on pan (-1 to 1)
        // Using constant power panning
        const float panAngle = (pan + 1.0f) * 0.25f * juce::MathConstants<float>::pi; // 0 to pi/2
        const float leftGain = volume * std::cos(panAngle);
        const float rightGain = volume * std::sin(panAngle);

        buffer.applyGain(0, 0, numSamples, leftGain);
        buffer.applyGain(1, 0, numSamples, rightGain);

        // Calculate peak levels for metering
        float peakL = 0.0f;
        float peakR = 0.0f;

        const float* dataL = buffer.getReadPointer(0);
        const float* dataR = buffer.getReadPointer(1);

        for (int i = 0; i < numSamples; ++i)
        {
            peakL = std::max(peakL, std::abs(dataL[i]));
            peakR = std::max(peakR, std::abs(dataR[i]));
        }

        // Update level meters with peak hold and decay
        float currentL = levelL.load();
        float currentR = levelR.load();

        // Use peak if higher, otherwise decay
        levelL.store(peakL > currentL ? peakL : currentL * levelDecay);
        levelR.store(peakR > currentR ? peakR : currentR * levelDecay);
    }
    else if (numChannels == 1)
    {
        // Mono: just apply volume
        buffer.applyGain(volume);

        // Calculate peak level for metering
        float peak = 0.0f;
        const float* data = buffer.getReadPointer(0);

        for (int i = 0; i < numSamples; ++i)
        {
            peak = std::max(peak, std::abs(data[i]));
        }

        // Update both meters with same value for mono
        float current = levelL.load();
        float newLevel = peak > current ? peak : current * levelDecay;
        levelL.store(newLevel);
        levelR.store(newLevel);
    }
}

//==============================================================================
void TrackMixerPlugin::getStateInformation(juce::MemoryBlock& destData)
{
    // Save mixer settings
    juce::MemoryOutputStream stream(destData, true);
    stream.writeFloat(volume);
    stream.writeFloat(pan);
    stream.writeBool(muted);
    stream.writeBool(solo);
}

void TrackMixerPlugin::setStateInformation(const void* data, int sizeInBytes)
{
    // Restore settings
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    volume = stream.readFloat();
    pan = stream.readFloat();
    muted = stream.readBool();
    solo = stream.readBool();
}
