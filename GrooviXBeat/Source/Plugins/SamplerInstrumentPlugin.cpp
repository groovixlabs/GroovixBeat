/*
    SamplerInstrumentPlugin - Sample-based instrument that plays MP3 samples
*/

#include "SamplerInstrumentPlugin.h"

//==============================================================================
SamplerInstrumentPlugin::SamplerInstrumentPlugin()
    : AudioProcessor(BusesProperties()
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    formatManager.registerBasicFormats();  // Registers WAV, AIFF, MP3, etc.
}

SamplerInstrumentPlugin::~SamplerInstrumentPlugin()
{
    // Stop and wait for loading thread before destroying data
    if (loadThread != nullptr)
    {
        loadThread->stopThread(5000);
        loadThread.reset();
    }
}

//==============================================================================
// Instrument Loading

void SamplerInstrumentPlugin::loadInstrument(const juce::File& instrumentDir)
{
    // Stop any in-progress loading
    if (loadThread != nullptr)
    {
        loadThread->stopThread(5000);
        loadThread.reset();
    }

    loading = true;

    loadThread = std::make_unique<SamplerLoadThread>(*this);
    loadThread->directoryToLoad = instrumentDir;
    loadThread->startThread();
}

juce::String SamplerInstrumentPlugin::getInstrumentName() const
{
    juce::ScopedLock sl(dataLock);
    return config.name;
}

bool SamplerInstrumentPlugin::isLoading() const
{
    return loading.load();
}

bool SamplerInstrumentPlugin::isLoaded() const
{
    juce::ScopedLock sl(dataLock);
    return loaded;
}

//==============================================================================
// Background Loading Thread

SamplerInstrumentPlugin::SamplerLoadThread::SamplerLoadThread(SamplerInstrumentPlugin& owner)
    : Thread("SamplerLoadThread"), plugin(owner)
{
}

void SamplerInstrumentPlugin::SamplerLoadThread::run()
{
    DBG("SamplerLoadThread: Starting to load instrument from " + directoryToLoad.getFullPathName());

    // Parse instrument.json
    auto jsonFile = directoryToLoad.getChildFile("instrument.json");
    if (!jsonFile.existsAsFile())
    {
        DBG("SamplerLoadThread: instrument.json not found!");
        plugin.loading = false;
        return;
    }

    auto jsonText = jsonFile.loadFileAsString();
    auto parsed = juce::JSON::parse(jsonText);

    if (!parsed.isObject())
    {
        DBG("SamplerLoadThread: Failed to parse instrument.json");
        plugin.loading = false;
        return;
    }

    InstrumentConfig newConfig;
    newConfig.name = parsed.getProperty("name", "").toString();
    newConfig.minPitch = (int)parsed.getProperty("minPitch", 21);
    newConfig.maxPitch = (int)parsed.getProperty("maxPitch", 108);
    newConfig.durationSeconds = (double)parsed.getProperty("durationSeconds", 3.0);
    newConfig.releaseSeconds = (double)parsed.getProperty("releaseSeconds", 1.0);
    newConfig.percussive = (bool)parsed.getProperty("percussive", false);

    auto velArray = parsed.getProperty("velocities", juce::var());
    if (velArray.isArray())
    {
        for (int i = 0; i < velArray.size(); ++i)
            newConfig.velocities.push_back((int)velArray[i]);
    }

    if (newConfig.velocities.empty())
    {
        DBG("SamplerLoadThread: No velocity layers defined!");
        plugin.loading = false;
        return;
    }

    int numPitches = newConfig.maxPitch - newConfig.minPitch + 1;
    int numVelocities = (int)newConfig.velocities.size();

    DBG("SamplerLoadThread: Loading " + newConfig.name +
        " pitches=" + juce::String(numPitches) +
        " velocities=" + juce::String(numVelocities));

    // Create temporary sample storage
    std::vector<std::vector<SamplerSample>> newSamples;
    newSamples.resize(numPitches);
    for (auto& pitchSamples : newSamples)
        pitchSamples.resize(numVelocities);

    // A local format manager for the background thread
    juce::AudioFormatManager bgFormatManager;
    bgFormatManager.registerBasicFormats();

    int loadedCount = 0;
    int totalFiles = numPitches * numVelocities;

    for (int p = 0; p < numPitches; ++p)
    {
        if (threadShouldExit())
        {
            DBG("SamplerLoadThread: Cancelled during loading");
            plugin.loading = false;
            return;
        }

        int pitch = newConfig.minPitch + p;

        for (int v = 0; v < numVelocities; ++v)
        {
            int velocity = newConfig.velocities[v];

            // Build filename: p60_v63.mp3
            juce::String filename = "p" + juce::String(pitch)
                                  + "_v" + juce::String(velocity)
                                  + ".mp3";

            auto sampleFile = directoryToLoad.getChildFile(filename);

            if (!sampleFile.existsAsFile())
                continue;

            // Decode the MP3 file
            std::unique_ptr<juce::AudioFormatReader> reader(
                bgFormatManager.createReaderFor(sampleFile));

            if (reader == nullptr)
                continue;

            auto& sample = newSamples[p][v];
            int numChannels = (int)reader->numChannels;
            int numFrames = (int)reader->lengthInSamples;

            // Limit to stereo
            if (numChannels > 2)
                numChannels = 2;

            sample.buffer.setSize(numChannels, numFrames);
            reader->read(&sample.buffer, 0, numFrames, 0, true, numChannels > 1);
            sample.sampleRate = reader->sampleRate;

            loadedCount++;

            // Log progress periodically
            if (loadedCount % 100 == 0)
            {
                DBG("SamplerLoadThread: Loaded " + juce::String(loadedCount) +
                    "/" + juce::String(totalFiles) + " samples");
            }
        }
    }

    if (threadShouldExit())
    {
        DBG("SamplerLoadThread: Cancelled after loading");
        plugin.loading = false;
        return;
    }

    // Swap data under lock
    {
        juce::ScopedLock sl(plugin.dataLock);
        plugin.samples = std::move(newSamples);
        plugin.config = newConfig;
        plugin.loaded = true;

        // Kill all active voices since we changed the sample data
        for (int i = 0; i < maxVoices; ++i)
            plugin.voices[i].active = false;
    }

    plugin.loading = false;

    DBG("SamplerLoadThread: Finished loading " + newConfig.name +
        " - " + juce::String(loadedCount) + " samples decoded");
}

//==============================================================================
// AudioProcessor Implementation

void SamplerInstrumentPlugin::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    deviceSampleRate = sampleRate;
}

void SamplerInstrumentPlugin::releaseResources()
{
    // Kill all voices
    for (int i = 0; i < maxVoices; ++i)
        voices[i].active = false;
}

void SamplerInstrumentPlugin::processBlock(juce::AudioBuffer<float>& buffer,
                                            juce::MidiBuffer& midiMessages)
{
    buffer.clear();

    juce::ScopedLock sl(dataLock);

    if (!loaded || samples.empty())
    {
        midiMessages.clear();
        return;
    }

    // Sample-accurate MIDI processing: render audio up to each MIDI event,
    // then handle the event, then continue rendering
    int currentSample = 0;

    for (const auto metadata : midiMessages)
    {
        auto message = metadata.getMessage();
        int eventPos = metadata.samplePosition;

        // Clamp to buffer bounds
        if (eventPos < currentSample)
            eventPos = currentSample;
        if (eventPos > buffer.getNumSamples())
            eventPos = buffer.getNumSamples();

        // Render voices up to this event position
        if (eventPos > currentSample)
        {
            renderVoices(buffer, currentSample, eventPos - currentSample);
            currentSample = eventPos;
        }

        // Handle the MIDI event
        if (message.isNoteOn())
        {
            startVoice(findFreeVoice(), message.getNoteNumber(),
                       message.getVelocity());
        }
        else if (message.isNoteOff())
        {
            // Find voice(s) playing this pitch and trigger release
            int pitch = message.getNoteNumber();
            for (int i = 0; i < maxVoices; ++i)
            {
                if (voices[i].active && !voices[i].releasing && voices[i].pitch == pitch)
                {
                    if (config.percussive)
                    {
                        // Percussive: ignore note-off, let sample play out
                    }
                    else
                    {
                        releaseVoice(i);
                    }
                }
            }
        }
        else if (message.isAllNotesOff() || message.isAllSoundOff())
        {
            for (int i = 0; i < maxVoices; ++i)
                voices[i].active = false;
        }
    }

    // Render remaining samples after last MIDI event
    if (currentSample < buffer.getNumSamples())
    {
        renderVoices(buffer, currentSample, buffer.getNumSamples() - currentSample);
    }

    midiMessages.clear();
}

//==============================================================================
// Voice Management

int SamplerInstrumentPlugin::findFreeVoice()
{
    // First try to find an inactive voice
    for (int i = 0; i < maxVoices; ++i)
    {
        if (!voices[i].active)
            return i;
    }

    // No free voices - steal one
    return stealVoice();
}

int SamplerInstrumentPlugin::stealVoice()
{
    // Steal priority: oldest releasing voice first, then oldest held voice
    int oldestReleasingIdx = -1;
    uint64_t oldestReleasingAge = UINT64_MAX;

    int oldestHeldIdx = -1;
    uint64_t oldestHeldAge = UINT64_MAX;

    for (int i = 0; i < maxVoices; ++i)
    {
        if (!voices[i].active) continue;

        if (voices[i].releasing)
        {
            if (voices[i].age < oldestReleasingAge)
            {
                oldestReleasingAge = voices[i].age;
                oldestReleasingIdx = i;
            }
        }
        else
        {
            if (voices[i].age < oldestHeldAge)
            {
                oldestHeldAge = voices[i].age;
                oldestHeldIdx = i;
            }
        }
    }

    if (oldestReleasingIdx >= 0)
        return oldestReleasingIdx;

    if (oldestHeldIdx >= 0)
        return oldestHeldIdx;

    return 0;  // Fallback
}

void SamplerInstrumentPlugin::startVoice(int voiceIndex, int pitch, int velocity)
{
    if (voiceIndex < 0 || voiceIndex >= maxVoices)
        return;

    int pitchIndex = pitch - config.minPitch;
    if (pitchIndex < 0 || pitchIndex >= (int)samples.size())
        return;

    int velLayer = getVelocityLayerIndex(velocity);
    if (velLayer < 0 || velLayer >= (int)samples[pitchIndex].size())
        return;

    auto& sample = samples[pitchIndex][velLayer];
    if (sample.buffer.getNumSamples() == 0)
        return;

    auto& voice = voices[voiceIndex];
    voice.active = true;
    voice.releasing = false;
    voice.pitch = pitch;
    voice.velocityLayer = velLayer;
    voice.samplePosition = 0.0;
    voice.pitchRatio = (sample.sampleRate > 0.0) ? (sample.sampleRate / deviceSampleRate) : 1.0;
    voice.releaseGain = 1.0f;
    voice.releaseDecrement = 0.0f;
    voice.age = voiceAgeCounter++;
}

void SamplerInstrumentPlugin::stopVoice(int voiceIndex)
{
    if (voiceIndex >= 0 && voiceIndex < maxVoices)
        voices[voiceIndex].active = false;
}

void SamplerInstrumentPlugin::releaseVoice(int voiceIndex)
{
    if (voiceIndex < 0 || voiceIndex >= maxVoices)
        return;

    auto& voice = voices[voiceIndex];
    if (!voice.active)
        return;

    voice.releasing = true;
    voice.releaseGain = 1.0f;

    // Calculate per-sample decrement for linear release envelope
    double releaseSamples = config.releaseSeconds * deviceSampleRate;
    if (releaseSamples > 0.0)
        voice.releaseDecrement = (float)(1.0 / releaseSamples);
    else
        voice.active = false;  // Zero release = instant off
}

void SamplerInstrumentPlugin::renderVoices(juce::AudioBuffer<float>& buffer,
                                            int startSample, int numSamples)
{
    for (int v = 0; v < maxVoices; ++v)
    {
        auto& voice = voices[v];
        if (!voice.active)
            continue;

        int pitchIndex = voice.pitch - config.minPitch;
        if (pitchIndex < 0 || pitchIndex >= (int)samples.size())
        {
            voice.active = false;
            continue;
        }

        if (voice.velocityLayer < 0 || voice.velocityLayer >= (int)samples[pitchIndex].size())
        {
            voice.active = false;
            continue;
        }

        auto& sample = samples[pitchIndex][voice.velocityLayer];
        if (sample.buffer.getNumSamples() == 0)
        {
            voice.active = false;
            continue;
        }

        int sampleNumFrames = sample.buffer.getNumSamples();
        int sampleNumChannels = sample.buffer.getNumChannels();
        int outputChannels = buffer.getNumChannels();

        for (int i = 0; i < numSamples; ++i)
        {
            int outIdx = startSample + i;

            // Check if sample has finished
            int pos0 = (int)voice.samplePosition;
            if (pos0 >= sampleNumFrames - 1)
            {
                voice.active = false;
                break;
            }

            // Linear interpolation
            double frac = voice.samplePosition - (double)pos0;
            int pos1 = pos0 + 1;

            float gain = voice.releaseGain;

            for (int ch = 0; ch < outputChannels; ++ch)
            {
                // Use the last available channel if sample has fewer channels
                int srcCh = juce::jmin(ch, sampleNumChannels - 1);

                float s0 = sample.buffer.getSample(srcCh, pos0);
                float s1 = sample.buffer.getSample(srcCh, pos1);
                float interpolated = (float)(s0 + (s1 - s0) * frac);

                buffer.addSample(ch, outIdx, interpolated * gain);
            }

            // Advance sample position by pitch ratio (sample-rate conversion)
            voice.samplePosition += voice.pitchRatio;

            // Apply release envelope
            if (voice.releasing)
            {
                voice.releaseGain -= voice.releaseDecrement;
                if (voice.releaseGain <= 0.0f)
                {
                    voice.releaseGain = 0.0f;
                    voice.active = false;
                    break;
                }
            }
        }
    }
}

int SamplerInstrumentPlugin::getVelocityLayerIndex(int midiVelocity) const
{
    // Find first velocity layer where midiVelocity <= velocities[i]
    for (int i = 0; i < (int)config.velocities.size(); ++i)
    {
        if (midiVelocity <= config.velocities[i])
            return i;
    }

    // If velocity exceeds all layers, use the highest
    return (int)config.velocities.size() - 1;
}

//==============================================================================
void SamplerInstrumentPlugin::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    juce::ScopedLock sl(dataLock);
    stream.writeString(config.name);
}

void SamplerInstrumentPlugin::setStateInformation(const void* data, int sizeInBytes)
{
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    // We don't reload from state - the instrument must be set via loadInstrument()
    juce::ignoreUnused(stream);
}
