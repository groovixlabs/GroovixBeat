#include "DrumKitPlugin.h"

DrumKitPlugin::DrumKitPlugin()
    : AudioProcessor(BusesProperties()
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    formatManager.registerBasicFormats();
}

//==============================================================================
void DrumKitPlugin::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(sampleRate, samplesPerBlock);
    juce::ScopedLock lock(voiceLock);
    for (auto& v : voices)
        v.active = false;
}

void DrumKitPlugin::releaseResources()
{
    juce::ScopedLock lock(voiceLock);
    for (auto& v : voices)
        v.active = false;
}

//==============================================================================
bool DrumKitPlugin::loadSample(int noteNumber, const juce::File& audioFile)
{
    if (noteNumber < 0 || noteNumber >= MAX_NOTES) return false;
    if (!audioFile.existsAsFile())
    {
        DBG("DrumKitPlugin::loadSample - file not found: " + audioFile.getFullPathName());
        return false;
    }

    std::unique_ptr<juce::AudioFormatReader> reader(
        formatManager.createReaderFor(audioFile));

    if (reader == nullptr)
    {
        DBG("DrumKitPlugin::loadSample - unsupported format: " + audioFile.getFileName());
        return false;
    }

    auto& s = samples[noteNumber];

    // Decode into a float buffer
    s.buffer.setSize((int)reader->numChannels, (int)reader->lengthInSamples);
    reader->read(&s.buffer, 0, (int)reader->lengthInSamples, 0, true, true);

    // Ensure stereo (duplicate mono channel)
    if (s.buffer.getNumChannels() == 1)
    {
        s.buffer.setSize(2, s.buffer.getNumSamples(), /*keepExistingContent=*/true,
                         false, false);
        s.buffer.copyFrom(1, 0, s.buffer, 0, 0, s.buffer.getNumSamples());
    }

    s.filePath = audioFile.getFullPathName();
    s.loaded   = true;

    DBG("DrumKitPlugin: Loaded note " + juce::String(noteNumber) +
        " <- " + audioFile.getFileName() +
        " (" + juce::String(s.buffer.getNumSamples()) + " samples, " +
        juce::String(reader->numChannels) + " ch)");

    return true;
}

void DrumKitPlugin::clearSample(int noteNumber)
{
    if (noteNumber < 0 || noteNumber >= MAX_NOTES) return;
    auto& s   = samples[noteNumber];
    s.loaded  = false;
    s.filePath = {};
    s.buffer.setSize(0, 0);
}

juce::String DrumKitPlugin::getSamplePath(int noteNumber) const
{
    if (noteNumber < 0 || noteNumber >= MAX_NOTES) return {};
    return samples[noteNumber].filePath;
}

bool DrumKitPlugin::hasSample(int noteNumber) const
{
    if (noteNumber < 0 || noteNumber >= MAX_NOTES) return false;
    return samples[noteNumber].loaded;
}

//==============================================================================
void DrumKitPlugin::triggerNote(int noteNumber, float velocity)
{
    if (noteNumber < 0 || noteNumber >= MAX_NOTES) return;
    if (!samples[noteNumber].loaded) return;

    juce::ScopedLock lock(voiceLock);

    // Find a free voice first
    int slot = -1;
    for (int i = 0; i < MAX_VOICES; ++i)
    {
        if (!voices[i].active) { slot = i; break; }
    }

    // Steal the voice already playing this note (retrigger)
    if (slot < 0)
    {
        for (int i = 0; i < MAX_VOICES; ++i)
        {
            if (voices[i].noteNumber == noteNumber) { slot = i; break; }
        }
    }

    // Last resort: steal voice 0
    if (slot < 0) slot = 0;

    voices[slot] = { noteNumber, 0, velocity, true };
}

//==============================================================================
void DrumKitPlugin::processBlock(juce::AudioBuffer<float>& buffer,
                                 juce::MidiBuffer&         midiMessages)
{
    buffer.clear();

    // Trigger notes from incoming MIDI
    for (const auto& meta : midiMessages)
    {
        auto msg = meta.getMessage();
        if (msg.isNoteOn())
            triggerNote(msg.getNoteNumber(), msg.getVelocity() / 127.0f);
        // Note-off intentionally ignored: one-shot behaviour
    }

    // Mix all active voices into the output buffer
    {
        juce::ScopedLock lock(voiceLock);

        const int numOut  = buffer.getNumSamples();
        const int numCh   = buffer.getNumChannels();

        for (auto& v : voices)
        {
            if (!v.active) continue;

            auto& s = samples[v.noteNumber];
            if (!s.loaded) { v.active = false; continue; }

            const int total     = s.buffer.getNumSamples();
            const int remaining = total - v.position;
            const int toCopy    = std::min(numOut, remaining);

            for (int ch = 0; ch < numCh; ++ch)
            {
                const int srcCh = std::min(ch, s.buffer.getNumChannels() - 1);
                buffer.addFrom(ch, 0,
                               s.buffer, srcCh, v.position,
                               toCopy, v.velocity);
            }

            v.position += toCopy;
            if (v.position >= total)
                v.active = false;
        }
    }
}

//==============================================================================
void DrumKitPlugin::getStateInformation(juce::MemoryBlock& destData)
{
    juce::XmlElement xml("DrumKitState");
    xml.setAttribute("trackIndex", trackIndex);

    for (int i = 0; i < MAX_NOTES; ++i)
    {
        if (samples[i].loaded && samples[i].filePath.isNotEmpty())
        {
            auto* noteEl = xml.createNewChildElement("Note");
            noteEl->setAttribute("number", i);
            noteEl->setAttribute("path",   samples[i].filePath);
        }
    }

    copyXmlToBinary(xml, destData);
}

void DrumKitPlugin::setStateInformation(const void* data, int sizeInBytes)
{
    auto xml = getXmlFromBinary(data, sizeInBytes);
    if (xml == nullptr || xml->getTagName() != "DrumKitState") return;

    for (auto* noteEl : xml->getChildIterator())
    {
        int          n    = noteEl->getIntAttribute("number");
        juce::String path = noteEl->getStringAttribute("path");
        if (n >= 0 && n < MAX_NOTES && path.isNotEmpty())
            loadSample(n, juce::File(path));
    }
}
