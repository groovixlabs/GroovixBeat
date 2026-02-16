/*
    MidiClipScheduler - Sample-accurate MIDI clip scheduling
*/

#include "MidiClipScheduler.h"

//==============================================================================
MidiClipScheduler::MidiClipScheduler()
{
}

MidiClipScheduler::~MidiClipScheduler()
{
    stop();
}

//==============================================================================
// Clip Management (message thread)

void MidiClipScheduler::setClip(int trackIndex, const std::vector<MidiNote>& notes,
                                 double loopLengthSteps, int program, bool isDrum, bool loop)
{
    juce::SpinLock::ScopedLockType sl(lock);

    MidiClipData& clip = trackClips[trackIndex];
    clip.notes = notes;
    clip.loopLengthSteps = loopLengthSteps;
    clip.program = program;
    clip.isDrum = isDrum;
    clip.loop = loop;
    clip.channel = isDrum ? 10 : 1;

    // Pre-allocate the play state entry (avoids map insertion on audio thread)
    auto& state = trackPlayStates[trackIndex];
    state.oneshotFinished = false;

    DBG("MidiClipScheduler::setClip - track " + juce::String(trackIndex) +
        " notes: " + juce::String((int)notes.size()) +
        " loopLength: " + juce::String(loopLengthSteps) +
        " program: " + juce::String(program) +
        " isDrum: " + juce::String(isDrum ? "true" : "false"));
}

void MidiClipScheduler::setClipFromVar(int trackIndex, const juce::var& notesArray,
                                        double loopLengthSteps, int program, bool isDrum, bool loop)
{
    std::vector<MidiNote> notes;

    if (notesArray.isArray())
    {
        for (int i = 0; i < notesArray.size(); ++i)
        {
            const auto& noteVar = notesArray[i];

            MidiNote note;
            note.pitch = noteVar.getProperty("pitch", 60);
            note.start = noteVar.getProperty("start", 0.0);
            note.duration = noteVar.getProperty("duration", 1.0);

            double vel = noteVar.getProperty("velocity", 100.0);
            if (vel > 1.0)
                vel = vel / 127.0;
            note.velocity = static_cast<float>(juce::jlimit(0.0, 1.0, vel));

            // Extract automation values (-1 = not set / use default)
            note.pitchBend = noteVar.getProperty("pitchBend", -1);
            note.modulation = noteVar.getProperty("modulation", -1);
            note.pan = noteVar.getProperty("pan", -1);

            // Extract VST parameter automation (vst_0, vst_1, etc.)
            if (auto* obj = noteVar.getDynamicObject())
            {
                for (const auto& prop : obj->getProperties())
                {
                    juce::String key = prop.name.toString();
                    if (key.startsWith("vst_"))
                    {
                        int paramIndex = key.substring(4).getIntValue();
                        // UI stores 0-127, normalize to 0.0-1.0 for VST
                        float normalized = static_cast<float>(
                            juce::jlimit(0.0, 1.0, (double)prop.value / 127.0));
                        note.vstParams.push_back({ paramIndex, normalized });
                    }
                }
            }

            notes.push_back(note);
        }
    }

    setClip(trackIndex, notes, loopLengthSteps, program, isDrum, loop);
}

void MidiClipScheduler::updateClipNotes(int trackIndex, const std::vector<MidiNote>& notes)
{
    juce::SpinLock::ScopedLockType sl(lock);

    auto clipIt = trackClips.find(trackIndex);
    if (clipIt == trackClips.end())
    {
        DBG("MidiClipScheduler::updateClipNotes - no clip for track " + juce::String(trackIndex) + ", ignoring");
        return;
    }

    // Replace notes only — keep loopLength, program, isDrum, loop, channel
    clipIt->second.notes = notes;

    // Mark track for all-notes-off so currently playing notes stop cleanly
    auto& state = trackPlayStates[trackIndex];
    state.needsAllNotesOff = true;

    DBG("MidiClipScheduler::updateClipNotes - track " + juce::String(trackIndex) +
        " updated with " + juce::String((int)notes.size()) + " notes");
}

void MidiClipScheduler::updateClipNotesFromVar(int trackIndex, const juce::var& notesArray)
{
    std::vector<MidiNote> notes;

    if (notesArray.isArray())
    {
        for (int i = 0; i < notesArray.size(); ++i)
        {
            const auto& noteVar = notesArray[i];

            MidiNote note;
            note.pitch = noteVar.getProperty("pitch", 60);
            note.start = noteVar.getProperty("start", 0.0);
            note.duration = noteVar.getProperty("duration", 1.0);

            double vel = noteVar.getProperty("velocity", 100.0);
            if (vel > 1.0)
                vel = vel / 127.0;
            note.velocity = static_cast<float>(juce::jlimit(0.0, 1.0, vel));

            // Extract automation values (-1 = not set / use default)
            note.pitchBend = noteVar.getProperty("pitchBend", -1);
            note.modulation = noteVar.getProperty("modulation", -1);
            note.pan = noteVar.getProperty("pan", -1);

            // Extract VST parameter automation (vst_0, vst_1, etc.)
            if (auto* obj = noteVar.getDynamicObject())
            {
                for (const auto& prop : obj->getProperties())
                {
                    juce::String key = prop.name.toString();
                    if (key.startsWith("vst_"))
                    {
                        int paramIndex = key.substring(4).getIntValue();
                        float normalized = static_cast<float>(
                            juce::jlimit(0.0, 1.0, (double)prop.value / 127.0));
                        note.vstParams.push_back({ paramIndex, normalized });
                    }
                }
            }

            notes.push_back(note);
        }
    }

    updateClipNotes(trackIndex, notes);
}

void MidiClipScheduler::clearClip(int trackIndex)
{
    juce::SpinLock::ScopedLockType sl(lock);

    auto it = trackClips.find(trackIndex);
    if (it != trackClips.end())
    {
        trackPlayStates[trackIndex].needsAllNotesOff = true;
        trackClips.erase(it);
    }

    trackPlayStates.erase(trackIndex);
}

void MidiClipScheduler::clearAllClips()
{
    juce::SpinLock::ScopedLockType sl(lock);

    for (auto& pair : trackPlayStates)
        pair.second.needsAllNotesOff = true;

    trackClips.clear();
    trackPlayStates.clear();
}

bool MidiClipScheduler::hasClip(int trackIndex) const
{
    juce::SpinLock::ScopedLockType sl(lock);
    auto it = trackClips.find(trackIndex);
    return it != trackClips.end() && it->second.hasNotes();
}

//==============================================================================
// Transport Control (message thread)

void MidiClipScheduler::play()
{
    juce::SpinLock::ScopedLockType sl(lock);

    if (!playing)
    {
        playing = true;
        playStartSample = -1; // Sentinel: resolved by first audio block

        // Reset per-track oneshot state
        for (auto& pair : trackPlayStates)
            pair.second.oneshotFinished = false;

        DBG("MidiClipScheduler: Play requested (will start at next audio block)");
    }
}

void MidiClipScheduler::stop()
{
    juce::SpinLock::ScopedLockType sl(lock);

    playing = false;
    pausedPositionSteps = 0.0;

    // Mark all tracks for all-notes-off
    for (auto& pair : trackPlayStates)
    {
        pair.second.needsAllNotesOff = true;
        pair.second.oneshotFinished = false;
    }

    // Also send immediate all-notes-off via MidiTrackOutputManager
    // (for the case where the audio thread hasn't rendered yet)
    if (midiTrackOutputManager != nullptr)
    {
        for (auto& pair : trackClips)
            midiTrackOutputManager->sendAllNotesOff(pair.first, pair.second.channel);
    }

    DBG("MidiClipScheduler: Stopped");
}

void MidiClipScheduler::pause()
{
    juce::SpinLock::ScopedLockType sl(lock);

    if (playing)
    {
        // Capture current position before stopping
        pausedPositionSteps = getPlayheadPositionSteps();
        playing = false;

        // Send all notes off
        for (auto& pair : trackPlayStates)
            pair.second.needsAllNotesOff = true;

        if (midiTrackOutputManager != nullptr)
        {
            for (auto& pair : trackClips)
                midiTrackOutputManager->sendAllNotesOff(pair.first, pair.second.channel);
        }

        DBG("MidiClipScheduler: Paused at step " + juce::String(pausedPositionSteps));
    }
}

void MidiClipScheduler::resume()
{
    if (!playing && pausedPositionSteps > 0)
    {
        play(); // play() sets playStartSample = -1, renderTrackBlock will offset for paused position
    }
}

void MidiClipScheduler::setTempo(double bpm)
{
    juce::SpinLock::ScopedLockType sl(lock);

    double newTempo = juce::jlimit(20.0, 300.0, bpm);

    // If playing, adjust playStartSample so current playhead position stays the same
    if (playing && playStartSample >= 0)
    {
        int64_t currentAudioPos = latestAudioPosition.load(std::memory_order_relaxed);
        double oldSamplesPerStep = sampleRate * 60.0 / (tempo * 4.0);
        double currentStep = (currentAudioPos - playStartSample) / oldSamplesPerStep;

        tempo = newTempo;
        double newSamplesPerStep = sampleRate * 60.0 / (tempo * 4.0);
        playStartSample = currentAudioPos - static_cast<int64_t>(currentStep * newSamplesPerStep);
    }
    else
    {
        tempo = newTempo;
    }
}

//==============================================================================
// Live Mode

void MidiClipScheduler::playTrack(int trackIndex)
{
    juce::SpinLock::ScopedLockType sl(lock);

    auto clipIt = trackClips.find(trackIndex);
    if (clipIt == trackClips.end() || !clipIt->second.hasNotes())
        return;

    auto& state = trackPlayStates[trackIndex];
    if (state.isPlaying)
        return;

    state.isPlaying = true;
    state.trackPlayStartSample = -1; // Resolved by first audio block
    state.oneshotFinished = false;

    DBG("MidiClipScheduler::playTrack - started track " + juce::String(trackIndex));
}

void MidiClipScheduler::stopTrack(int trackIndex)
{
    juce::SpinLock::ScopedLockType sl(lock);

    auto& state = trackPlayStates[trackIndex];
    state.isPlaying = false;
    state.needsAllNotesOff = true;

    // Immediate all-notes-off
    auto clipIt = trackClips.find(trackIndex);
    if (clipIt != trackClips.end() && midiTrackOutputManager != nullptr)
        midiTrackOutputManager->sendAllNotesOff(trackIndex, clipIt->second.channel);

    DBG("MidiClipScheduler::stopTrack - stopped track " + juce::String(trackIndex));
}

bool MidiClipScheduler::isTrackPlaying(int trackIndex) const
{
    juce::SpinLock::ScopedLockType sl(lock);
    auto it = trackPlayStates.find(trackIndex);
    return it != trackPlayStates.end() && it->second.isPlaying;
}

//==============================================================================
// Audio thread API

void MidiClipScheduler::prepareToPlay(double newSampleRate)
{
    juce::SpinLock::ScopedLockType sl(lock);
    sampleRate = newSampleRate;
    DBG("MidiClipScheduler::prepareToPlay - sampleRate: " + juce::String(sampleRate));
}

void MidiClipScheduler::renderTrackBlock(int trackIndex, juce::MidiBuffer& output,
                                          int64_t blockStartSample, int numSamples,
                                          std::vector<PendingVstParam>* vstParamOutput)
{
    juce::SpinLock::ScopedTryLockType sl(lock);
    if (!sl.isLocked())
        return; // Skip if message thread is modifying clip data

    // Update latest audio position (all tracks report same value, no conflict)
    latestAudioPosition.store(blockStartSample + numSamples, std::memory_order_relaxed);

    // Ensure trackPlayStates has an entry (should be pre-allocated by setClip)
    auto stateIt = trackPlayStates.find(trackIndex);
    if (stateIt == trackPlayStates.end())
        return; // No state = no clip was ever set for this track

    auto& state = stateIt->second;

    // Handle pending all-notes-off
    if (state.needsAllNotesOff)
    {
        state.needsAllNotesOff = false;

        auto clipIt = trackClips.find(trackIndex);
        int channel = (clipIt != trackClips.end()) ? clipIt->second.channel : 1;

        for (int pitch = 0; pitch < 128; ++pitch)
        {
            if (state.activeNotes.test(pitch))
                output.addEvent(juce::MidiMessage::noteOff(channel, pitch), 0);
        }

        state.clearActiveNotes();
    }

    // Determine if this track should be rendering
    bool globalPlay = playing;
    bool livePlay = state.isPlaying;

    if (!globalPlay && !livePlay)
        return;

    // Find clip data
    auto clipIt = trackClips.find(trackIndex);
    if (clipIt == trackClips.end() || !clipIt->second.hasNotes())
        return;

    if (state.oneshotFinished)
        return;

    const auto& clip = clipIt->second;
    double samplesPerStep = getSamplesPerStep();

    if (samplesPerStep <= 0.0)
        return;

    // Determine the reference start sample for this track
    int64_t refStartSample;

    if (livePlay && !globalPlay)
    {
        // Per-track live mode
        if (state.trackPlayStartSample < 0)
            state.trackPlayStartSample = blockStartSample;

        refStartSample = state.trackPlayStartSample;
    }
    else
    {
        // Global playback
        if (playStartSample < 0)
        {
            // Resolve pending play: playback starts at this block
            // If resuming from pause, offset so we continue from pausedPositionSteps
            playStartSample = blockStartSample - static_cast<int64_t>(pausedPositionSteps * samplesPerStep);
        }

        refStartSample = playStartSample;
    }

    // Calculate step positions for this block
    double blockStartStep = static_cast<double>(blockStartSample - refStartSample) / samplesPerStep;
    double blockEndStep = static_cast<double>(blockStartSample + numSamples - refStartSample) / samplesPerStep;

    // Don't render before the play start
    if (blockEndStep <= 0.0)
        return;

    if (blockStartStep < 0.0)
        blockStartStep = 0.0;

    double loopLen = clip.loopLengthSteps;

    // For one-shot clips, check if we've passed the end
    if (!clip.loop && blockStartStep >= loopLen)
    {
        state.oneshotFinished = true;
        // Send note-offs for any active notes
        for (int pitch = 0; pitch < 128; ++pitch)
        {
            if (state.activeNotes.test(pitch))
                output.addEvent(juce::MidiMessage::noteOff(clip.channel, pitch), 0);
        }
        state.clearActiveNotes();
        return;
    }

    // Determine which loop iterations overlap with this block
    int startIter = std::max(0, static_cast<int>(std::floor(blockStartStep / loopLen)));
    int endIter = static_cast<int>(std::floor(blockEndStep / loopLen));

    // For one-shot, only iteration 0
    if (!clip.loop)
    {
        startIter = 0;
        endIter = 0;
    }

    // Iterate over each note in each relevant loop iteration
    for (int iter = startIter; iter <= endIter; ++iter)
    {
        double iterOffsetSteps = iter * loopLen;

        for (const auto& note : clip.notes)
        {
            double noteOnStep  = iterOffsetSteps + note.start;
            double noteOffStep = noteOnStep + note.duration;

            // Note-on within this block?
            if (noteOnStep >= blockStartStep && noteOnStep < blockEndStep)
            {
                // Compute sample offset directly from sample positions (avoids floating-point error)
                // sampleOffset = noteOnStep * samplesPerStep - (blockStartSample - refStartSample)
                // but expressed relative to block start:
                int sampleOffset = static_cast<int>(std::round(
                    noteOnStep * samplesPerStep - static_cast<double>(blockStartSample - refStartSample)));
                sampleOffset = juce::jlimit(0, numSamples - 1, sampleOffset);

                // Send automation CC/pitch-bend messages BEFORE the note-on
                // so instruments receive the parameter state before the note triggers
                if (note.pitchBend >= 0)
                {
                    // Map 0-127 to MIDI pitch wheel range 0-16383 (64 -> 8192 = center)
                    int pbValue = juce::jlimit(0, 16383, note.pitchBend * 128 + 64);
                    output.addEvent(juce::MidiMessage::pitchWheel(clip.channel, pbValue), sampleOffset);
                }
                if (note.modulation >= 0)
                {
                    // CC#1 = Modulation Wheel
                    output.addEvent(juce::MidiMessage::controllerEvent(clip.channel, 1,
                        juce::jlimit(0, 127, note.modulation)), sampleOffset);
                }
                if (note.pan >= 0)
                {
                    // CC#10 = Pan
                    output.addEvent(juce::MidiMessage::controllerEvent(clip.channel, 10,
                        juce::jlimit(0, 127, note.pan)), sampleOffset);
                }

                // Queue VST parameter changes for the instrument processor
                if (vstParamOutput != nullptr && !note.vstParams.empty())
                {
                    for (const auto& vp : note.vstParams)
                    {
                        vstParamOutput->push_back({ vp.paramIndex, vp.normalizedValue, sampleOffset });
                    }
                }

                output.addEvent(juce::MidiMessage::noteOn(clip.channel, note.pitch, note.velocity), sampleOffset);
                state.activeNotes.set(note.pitch);
            }

            // Note-off within this block?
            if (noteOffStep >= blockStartStep && noteOffStep < blockEndStep)
            {
                int sampleOffset = static_cast<int>(std::round(
                    noteOffStep * samplesPerStep - static_cast<double>(blockStartSample - refStartSample)));
                sampleOffset = juce::jlimit(0, numSamples - 1, sampleOffset);

                output.addEvent(juce::MidiMessage::noteOff(clip.channel, note.pitch), sampleOffset);
                state.activeNotes.reset(note.pitch);
            }
        }
    }
}

//==============================================================================
// Timing queries

double MidiClipScheduler::getPlayheadPositionSteps() const
{
    if (!playing)
        return pausedPositionSteps;

    if (playStartSample < 0)
        return pausedPositionSteps; // Play is pending, not yet resolved

    int64_t currentAudioPos = latestAudioPosition.load(std::memory_order_relaxed);
    double samplesPerStep = getSamplesPerStep();

    if (samplesPerStep <= 0.0)
        return 0.0;

    int64_t elapsed = currentAudioPos - playStartSample;
    return static_cast<double>(elapsed) / samplesPerStep;
}

double MidiClipScheduler::getPlayheadPositionBeats() const
{
    return getPlayheadPositionSteps() / 4.0;
}

//==============================================================================
// Internal helpers

double MidiClipScheduler::getSamplesPerStep() const
{
    // 1 step = 1/16th note = 1/4 beat
    // samplesPerBeat = sampleRate * 60.0 / tempo
    // samplesPerStep = samplesPerBeat / 4.0
    return sampleRate * 60.0 / (tempo * 4.0);
}
