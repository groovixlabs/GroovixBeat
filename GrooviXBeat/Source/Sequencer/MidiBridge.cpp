/*
    MidiBridge - Handles MIDI message routing between the webview sequencer and plugin host
*/

#include "MidiBridge.h"

//==============================================================================
MidiBridge::MidiBridge (juce::MidiMessageCollector& collector)
    : midiCollector (collector)
{
    // Start timer for processing scheduled events (1ms resolution)
    startTimer (1);
}

MidiBridge::~MidiBridge()
{
    stopTimer();
}

//==============================================================================
//==============================================================================
void MidiBridge::setMidiTrackOutputManager(MidiTrackOutputManager* manager)
{
    midiTrackOutputManager = manager;
    clipScheduler.setMidiTrackOutputManager(manager);
}

//==============================================================================
void MidiBridge::handleNoteOn (int channel, int pitch, float velocity, int trackIndex)
{
    auto message = juce::MidiMessage::noteOn (channel, pitch, velocity);
    message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);

    // Route to track-specific output if trackIndex is valid and manager exists
    if (trackIndex >= 0 && midiTrackOutputManager != nullptr)
    {
        midiTrackOutputManager->sendNoteOn(trackIndex, channel, pitch, velocity);
    }
    else
    {
        // Fallback to global MIDI collector
        midiCollector.addMessageToQueue (message);
    }
}

void MidiBridge::handleNoteOff (int channel, int pitch, int trackIndex)
{
    auto message = juce::MidiMessage::noteOff (channel, pitch);
    message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);

    // Route to track-specific output if trackIndex is valid and manager exists
    if (trackIndex >= 0 && midiTrackOutputManager != nullptr)
    {
        midiTrackOutputManager->sendNoteOff(trackIndex, channel, pitch);
    }
    else
    {
        // Fallback to global MIDI collector
        midiCollector.addMessageToQueue (message);
    }
}

void MidiBridge::handleControlChange (int channel, int controller, int value)
{
    auto message = juce::MidiMessage::controllerEvent (channel, controller, value);
    message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    midiCollector.addMessageToQueue (message);
}

void MidiBridge::handleProgramChange (int channel, int program)
{
    auto message = juce::MidiMessage::programChange (channel, program);
    message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    midiCollector.addMessageToQueue (message);
}

void MidiBridge::handlePitchBend (int channel, int value)
{
    auto message = juce::MidiMessage::pitchWheel (channel, value);
    message.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    midiCollector.addMessageToQueue (message);
}

//==============================================================================
void MidiBridge::scheduleNoteOn (double timeFromNow, int channel, int pitch, float velocity, int trackIndex)
{
    juce::ScopedLock sl (eventLock);

    ScheduledEvent event;
    event.time = getCurrentTime() + timeFromNow;
    event.message = juce::MidiMessage::noteOn (channel, pitch, velocity);
    event.trackIndex = trackIndex;

    scheduledEvents.push_back (event);
    std::sort (scheduledEvents.begin(), scheduledEvents.end());
}

void MidiBridge::scheduleNoteOff (double timeFromNow, int channel, int pitch, int trackIndex)
{
    juce::ScopedLock sl (eventLock);

    ScheduledEvent event;
    event.time = getCurrentTime() + timeFromNow;
    event.message = juce::MidiMessage::noteOff (channel, pitch);
    event.trackIndex = trackIndex;

    scheduledEvents.push_back (event);
    std::sort (scheduledEvents.begin(), scheduledEvents.end());
}

//==============================================================================
void MidiBridge::scheduleClip(int trackIndex, const juce::var& notes, double loopLengthSteps, int program, bool isDrum, bool loop)
{
    DBG("MidiBridge::scheduleClip - track: " + juce::String(trackIndex) +
        " notes: " + juce::String(notes.isArray() ? notes.size() : 0) +
        " loopLength: " + juce::String(loopLengthSteps) +
        " program: " + juce::String(program) +
        " isDrum: " + juce::String(isDrum ? "true" : "false") +
        " loop: " + juce::String(loop ? "true" : "false"));

    clipScheduler.setClipFromVar(trackIndex, notes, loopLengthSteps, program, isDrum, loop);
}

void MidiBridge::updateClip(int trackIndex, const juce::var& notes)
{
    DBG("MidiBridge::updateClip - track: " + juce::String(trackIndex) +
        " notes: " + juce::String(notes.isArray() ? notes.size() : 0));

    clipScheduler.updateClipNotesFromVar(trackIndex, notes);
}

void MidiBridge::clearClip(int trackIndex)
{
    clipScheduler.clearClip(trackIndex);
}

void MidiBridge::clearAllClips()
{
    clipScheduler.clearAllClips();
}

//==============================================================================
void MidiBridge::setTempo (double bpm)
{
    tempo = juce::jlimit (20.0, 300.0, bpm);
    clipScheduler.setTempo(tempo);
}

void MidiBridge::play()
{
    if (! playing)
    {
        playStartTime = getCurrentTime() - pausedPosition;
        playing = true;

        // Start clip scheduler
        clipScheduler.play();
    }
}

void MidiBridge::stop()
{
    playing = false;
    pausedPosition = 0.0;

    // Stop clip scheduler
    clipScheduler.stop();

    // Clear scheduled events
    juce::ScopedLock sl (eventLock);
    scheduledEvents.clear();

    // Send all notes off to global MIDI collector
    auto timestamp = juce::Time::getMillisecondCounterHiRes() * 0.001;
    for (int ch = 1; ch <= 16; ++ch)
    {
        auto message = juce::MidiMessage::allNotesOff (ch);
        message.setTimeStamp (timestamp);
        midiCollector.addMessageToQueue (message);
    }

    // Send all notes off to track outputs
    if (midiTrackOutputManager != nullptr)
    {
        midiTrackOutputManager->sendAllNotesOffAllTracks();
    }

    // Stop all sample playback
    stopAllSamples();
}

void MidiBridge::pause()
{
    if (playing)
    {
        pausedPosition = getPlayheadPosition();
        playing = false;

        // Pause clip scheduler
        clipScheduler.pause();
    }
}

//==============================================================================
void MidiBridge::setQuantizeSteps(int steps)
{
    quantizeSteps = juce::jlimit(1, 64, steps);

    if (samplePlayerManager != nullptr)
        samplePlayerManager->setQuantizeSteps(quantizeSteps);

    // Also propagate to MIDI clip scheduler for boundary detection
    clipScheduler.setQuantizeSteps(quantizeSteps);
}

//==============================================================================
void MidiBridge::timerCallback()
{
    double currentTime = getCurrentTime();

    // NOTE: Clip scheduler is now driven by the audio thread via MidiTrackOutput::processBlock.
    // No need to call clipScheduler.processEvents() here.

    // Only process legacy scheduled events and sample sync when global playing is active
    if (playing)
    {
        juce::ScopedLock sl (eventLock);

        auto timestamp = juce::Time::getMillisecondCounterHiRes() * 0.001;

        // Process all events that should have played by now (legacy scheduled events)
        while (! scheduledEvents.empty() && scheduledEvents.front().time <= currentTime)
        {
            auto& event = scheduledEvents.front();
            auto message = event.message;
            message.setTimeStamp (timestamp);

            // Route to track-specific output if trackIndex is valid
            if (event.trackIndex >= 0 && midiTrackOutputManager != nullptr)
            {
                midiTrackOutputManager->sendMidiToTrack(event.trackIndex, message);
            }
            else
            {
                // Fallback to global MIDI collector
                midiCollector.addMessageToQueue (message);
            }

            scheduledEvents.erase (scheduledEvents.begin());
        }

        // Sync sample players with transport
        if (samplePlayerManager != nullptr)
        {
            double positionBeats = getPlayheadPositionBeats();
            samplePlayerManager->processTransportSync(positionBeats, tempo, quantizeSteps, playing);
        }
    }
}

//==============================================================================
double MidiBridge::getPlayheadPosition() const
{
    // Delegate to the clip scheduler for sample-accurate position
    return clipScheduler.getPlayheadPositionSteps();
}

double MidiBridge::getPlayheadPositionBeats() const
{
    return clipScheduler.getPlayheadPositionBeats();
}

double MidiBridge::getCurrentTime() const
{
    return juce::Time::getMillisecondCounterHiRes() / 1000.0;
}

int64_t MidiBridge::getNextQuantizeBoundarySample() const
{
    return clipScheduler.computeNextQuantizeBoundarySample();
}

int64_t MidiBridge::getLatestAudioPosition() const
{
    return clipScheduler.getLatestAudioPosition();
}

//==============================================================================
// Sample file playback - Direct (immediate)

void MidiBridge::playSampleFile(int trackIndex, const juce::String& filePath, double offset, bool loop, double loopLengthBeats)
{
    DBG("MidiBridge::playSampleFile - track: " + juce::String(trackIndex) +
        " file: " + filePath + " offset: " + juce::String(offset) +
        " loop: " + juce::String(loop ? "true" : "false") +
        " loopLengthBeats: " + juce::String(loopLengthBeats));

    auto* manager = samplePlayerManager;

    if (manager != nullptr)
    {
        manager->playSampleFile(trackIndex, filePath, offset, loop, loopLengthBeats);
        DBG("MidiBridge::playSampleFile - completed");
    }
    else
    {
        DBG("MidiBridge::playSampleFile - No SamplePlayerManager set!");
    }
}

void MidiBridge::stopSampleFile(int trackIndex)
{
    DBG("MidiBridge::stopSampleFile - track: " + juce::String(trackIndex));
    DBG("MidiBridge::stopSampleFile - this ptr: " + juce::String((juce::int64)this));

    // Check if samplePlayerManager pointer is valid before dereferencing
    DBG("MidiBridge::stopSampleFile - about to check samplePlayerManager");

    auto* manager = samplePlayerManager;  // Copy to local var first
    DBG("MidiBridge::stopSampleFile - manager ptr: " + juce::String((juce::int64)manager));

    if (manager != nullptr)
    {
        DBG("MidiBridge::stopSampleFile - manager is valid, calling stopSampleFile");
        manager->stopSampleFile(trackIndex);
        DBG("MidiBridge::stopSampleFile - completed");
    }
    else
    {
        DBG("MidiBridge::stopSampleFile - samplePlayerManager is null!");
    }
}

void MidiBridge::stopAllSamples()
{
    DBG("MidiBridge::stopAllSamples");

    if (samplePlayerManager != nullptr)
    {
        samplePlayerManager->stopAllSamples();
    }
}

//==============================================================================
// Sample file playback - Live Mode (quantized)

void MidiBridge::queueSampleFile(int trackIndex, const juce::String& filePath, double offset)
{
    DBG("MidiBridge::queueSampleFile - track: " + juce::String(trackIndex) +
        " file: " + filePath + " offset: " + juce::String(offset));

    if (samplePlayerManager != nullptr)
    {
        samplePlayerManager->queueSampleFile(trackIndex, filePath, offset);
    }
    else
    {
        DBG("MidiBridge::queueSampleFile - No SamplePlayerManager set!");
    }
}

void MidiBridge::queueSampleFileSeamless(int trackIndex, const juce::String& filePath,
                                          double offset, bool loop, double loopLengthBeats)
{
    DBG("MidiBridge::queueSampleFileSeamless - track: " + juce::String(trackIndex) +
        " file: " + filePath + " offset: " + juce::String(offset) +
        " loop: " + juce::String(loop ? "true" : "false") +
        " loopLengthBeats: " + juce::String(loopLengthBeats));

    if (samplePlayerManager != nullptr)
    {
        // Compute the exact quantize boundary sample so the audio thread can fire
        // at the same sample position as MIDI clips.  Falls back to "next block"
        // when no anchor is established yet (first clip in a session).
        int64_t targetSample = getNextQuantizeBoundarySample();
        if (targetSample < 0)
            targetSample = getLatestAudioPosition(); // Fire at start of next audio block

        DBG("MidiBridge::queueSampleFileSeamless - targetSample: " + juce::String(targetSample));

        samplePlayerManager->queueSampleFileSeamless(trackIndex, filePath, offset, loop,
                                                      loopLengthBeats, targetSample);
    }
    else
    {
        DBG("MidiBridge::queueSampleFileSeamless - No SamplePlayerManager set!");
    }
}

void MidiBridge::queueStopSample(int trackIndex)
{
    DBG("MidiBridge::queueStopSample - track: " + juce::String(trackIndex));

    if (samplePlayerManager != nullptr)
    {
        int64_t targetSample = getNextQuantizeBoundarySample();
        if (targetSample < 0)
            targetSample = getLatestAudioPosition();

        samplePlayerManager->queueStopSample(trackIndex, targetSample);
    }
}

void MidiBridge::triggerSampleScene(int sceneIndex, const juce::var& clipsArray)
{
    DBG("MidiBridge::triggerSampleScene - scene: " + juce::String(sceneIndex));

    if (samplePlayerManager == nullptr)
    {
        DBG("MidiBridge::triggerSampleScene - No SamplePlayerManager set!");
        return;
    }

    // Parse the clips array from JSON
    std::vector<SamplePlayerManager::SceneClipInfo> clips;

    if (clipsArray.isArray())
    {
        for (int i = 0; i < clipsArray.size(); ++i)
        {
            const auto& clipVar = clipsArray[i];

            SamplePlayerManager::SceneClipInfo clip;
            clip.trackIndex = clipVar.getProperty("trackIndex", 0);
            clip.filePath = clipVar.getProperty("filePath", "").toString();
            clip.loopLengthBeats = clipVar.getProperty("loopLengthBeats", 16.0);
            clip.offset = clipVar.getProperty("offset", 0.0);

            if (clip.filePath.isNotEmpty())
            {
                clips.push_back(clip);
                DBG("  - Track " + juce::String(clip.trackIndex) + ": " + clip.filePath);
            }
        }
    }

    samplePlayerManager->triggerScene(sceneIndex, clips);
}

//==============================================================================
// MIDI Clip Live Mode - Per-track playback control

void MidiBridge::playLiveClip(int trackIndex)
{
    DBG("MidiBridge::playLiveClip - track: " + juce::String(trackIndex));
    clipScheduler.playTrack(trackIndex);
}

void MidiBridge::stopLiveClip(int trackIndex)
{
    DBG("MidiBridge::stopLiveClip - track: " + juce::String(trackIndex));
    clipScheduler.stopTrack(trackIndex);
}

bool MidiBridge::isLiveClipPlaying(int trackIndex) const
{
    return clipScheduler.isTrackPlaying(trackIndex);
}

void MidiBridge::queueLiveMidiPlay(int trackIndex)
{
    DBG("MidiBridge::queueLiveMidiPlay - track: " + juce::String(trackIndex));
    clipScheduler.queueTrackPlay(trackIndex);
}

void MidiBridge::queueLiveMidiStop(int trackIndex)
{
    DBG("MidiBridge::queueLiveMidiStop - track: " + juce::String(trackIndex));
    // Queue the stop — the audio thread fires it at the quantize boundary
    // and clears the clip notes at that point (see MidiClipScheduler::renderTrackBlock).
    clipScheduler.queueTrackStop(trackIndex);
}

void MidiBridge::setLiveMode(bool enabled)
{
    DBG("MidiBridge::setLiveMode - " + juce::String(enabled ? "ON" : "OFF"));
    clipScheduler.setLiveMode(enabled);
}
