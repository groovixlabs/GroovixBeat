/*
    MidiTrackOutput - Plugin that outputs MIDI for a specific track
*/

#include "MidiTrackOutput.h"
#include "../Sequencer/MidiClipScheduler.h"

//==============================================================================
MidiTrackOutput::MidiTrackOutput()
    : AudioProcessor(BusesProperties()
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

MidiTrackOutput::~MidiTrackOutput()
{
}

//==============================================================================
void MidiTrackOutput::addMidiMessage(const juce::MidiMessage& message)
{
    juce::ScopedLock sl(midiLock);

    // Add message at sample position 0 (immediate playback)
    pendingMidiMessages.addEvent(message, 0);
}

void MidiTrackOutput::addMidiBuffer(const juce::MidiBuffer& buffer)
{
    juce::ScopedLock sl(midiLock);

    for (const auto metadata : buffer)
    {
        pendingMidiMessages.addEvent(metadata.getMessage(), metadata.samplePosition);
    }
}

void MidiTrackOutput::clearPendingMidi()
{
    juce::ScopedLock sl(midiLock);
    pendingMidiMessages.clear();
}

//==============================================================================
void MidiTrackOutput::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;

    // Sync counter with the scheduler's latest audio position to maintain
    // timing continuity across graph rebuilds (which call prepareToPlay on all nodes).
    // Without this, totalSamplesProcessed would reset to 0 while the scheduler's
    // playStartSample stays at the old value, causing a timing gap.
    if (clipScheduler != nullptr)
    {
        int64_t latestPos = clipScheduler->getLatestAudioPosition();
        if (latestPos > 0)
            totalSamplesProcessed = latestPos;
        else
            totalSamplesProcessed = 0;

        clipScheduler->prepareToPlay(sampleRate);
    }
    else
    {
        totalSamplesProcessed = 0;
    }
}

void MidiTrackOutput::releaseResources()
{
    juce::ScopedLock sl(midiLock);
    pendingMidiMessages.clear();
}

void MidiTrackOutput::processBlock(juce::AudioBuffer<float>& buffer,
                                    juce::MidiBuffer& midiMessages)
{
    // Clear audio output (we don't produce audio, only MIDI)
    buffer.clear();

    int numSamples = buffer.getNumSamples();

    // 1. Render sample-accurate sequenced notes from the clip scheduler
    std::vector<PendingVstParam> vstParams;
    if (clipScheduler != nullptr)
    {
        clipScheduler->renderTrackBlock(trackIndex, midiMessages,
                                         totalSamplesProcessed, numSamples,
                                         instrumentProcessor ? &vstParams : nullptr);
    }

    // 1b. Apply VST parameter automation to the instrument processor
    if (instrumentProcessor != nullptr && !vstParams.empty())
    {
        const auto& params = instrumentProcessor->getParameters();
        for (const auto& vp : vstParams)
        {
            if (vp.paramIndex >= 0 && vp.paramIndex < params.size())
            {
                params[vp.paramIndex]->setValueNotifyingHost(vp.normalizedValue);
            }
        }
    }

    // 2. Add any immediate/preview MIDI messages (note previews, manual triggers)
    {
        juce::ScopedLock sl(midiLock);

        if (!pendingMidiMessages.isEmpty())
        {
            midiMessages.addEvents(pendingMidiMessages, 0, numSamples, 0);
            pendingMidiMessages.clear();
        }
    }

    // Advance the sample counter
    totalSamplesProcessed += numSamples;
}

//==============================================================================
void MidiTrackOutput::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    stream.writeInt(trackIndex);
}

void MidiTrackOutput::setStateInformation(const void* data, int sizeInBytes)
{
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    trackIndex = stream.readInt();
}
