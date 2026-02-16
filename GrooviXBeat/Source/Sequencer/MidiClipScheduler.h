/*
    MidiClipScheduler - Sample-accurate MIDI clip scheduling

    Stores clip data per track and renders MIDI events with sample-accurate
    timing, driven by the audio thread via MidiTrackOutput::processBlock().
    Transport and clip management are called from the message thread.

    Audio-thread safety:
    - Uses juce::SpinLock (lightweight, no OS calls) for audio/message thread sync
    - Audio thread uses ScopedTryLock (non-blocking; skips block if contended)
    - No heap allocations on the audio thread (activeNotes uses a fixed bitset)
*/

#pragma once

#include <JuceHeader.h>
#include "MidiTrackOutputManager.h"
#include <bitset>

//==============================================================================
// VST parameter automation change (stored per-note, applied at note-on)
struct VstParamChange
{
    int paramIndex = 0;
    float normalizedValue = 0.0f;  // 0.0 to 1.0
};

struct MidiNote
{
    int pitch = 60;
    double start = 0.0;      // Start time in steps (1/16th notes)
    double duration = 1.0;   // Duration in steps
    float velocity = 0.8f;

    // Automation values (0-127 range, -1 = not set / use default)
    int pitchBend = -1;      // 64 = no bend (mapped to MIDI pitch wheel 0-16383)
    int modulation = -1;     // CC#1 (0-127)
    int pan = -1;            // CC#10 (0-127, 64 = center)

    // VST plugin parameter automation (applied at note-on time)
    // Pre-allocated during setClipFromVar, so no heap alloc on audio thread
    std::vector<VstParamChange> vstParams;
};

// Pending VST param change output from renderTrackBlock
struct PendingVstParam
{
    int paramIndex;
    float normalizedValue;
    int sampleOffset;
};

//==============================================================================
struct MidiClipData
{
    std::vector<MidiNote> notes;
    double loopLengthSteps = 64.0;  // Loop length in steps (1/16th notes)
    int program = 0;
    bool isDrum = false;
    bool loop = true;
    int channel = 1;

    bool hasNotes() const { return !notes.empty(); }
    void clear() { notes.clear(); loopLengthSteps = 64.0; program = 0; isDrum = false; loop = true; }
};

//==============================================================================
class MidiClipScheduler
{
public:
    MidiClipScheduler();
    ~MidiClipScheduler();

    //==============================================================================
    // MIDI Track Output Manager - for sending immediate all-notes-off on stop
    void setMidiTrackOutputManager(MidiTrackOutputManager* manager) { midiTrackOutputManager = manager; }

    //==============================================================================
    // Clip Management (message thread)

    void setClip(int trackIndex, const std::vector<MidiNote>& notes,
                 double loopLengthSteps, int program, bool isDrum, bool loop = true);

    void setClipFromVar(int trackIndex, const juce::var& notesArray,
                        double loopLengthSteps, int program, bool isDrum, bool loop = true);

    void updateClipNotes(int trackIndex, const std::vector<MidiNote>& notes);
    void updateClipNotesFromVar(int trackIndex, const juce::var& notesArray);

    void clearClip(int trackIndex);
    void clearAllClips();
    bool hasClip(int trackIndex) const;

    //==============================================================================
    // Transport Control (message thread - sets flags consumed by audio thread)

    void play();
    void stop();
    void pause();
    void resume();

    void setTempo(double bpm);
    double getTempo() const { return tempo; }
    bool isPlaying() const { return playing; }

    //==============================================================================
    // Live Mode - Per-track playback control (message thread)

    void playTrack(int trackIndex);
    void stopTrack(int trackIndex);
    bool isTrackPlaying(int trackIndex) const;

    //==============================================================================
    // Audio thread API

    /**
     * Called from MidiTrackOutput::prepareToPlay to set the sample rate.
     * Does NOT reset any counters - maintains timing continuity across graph rebuilds.
     */
    void prepareToPlay(double newSampleRate);

    /**
     * Render MIDI events for a single track into the output buffer.
     * Called from MidiTrackOutput::processBlock on the audio thread.
     * Events are placed at sample-accurate positions within the block.
     *
     * @param trackIndex      Which track to render
     * @param output          MidiBuffer to write events into
     * @param blockStartSample  The MidiTrackOutput's cumulative sample position
     * @param numSamples      Number of samples in this block
     */
    void renderTrackBlock(int trackIndex, juce::MidiBuffer& output,
                          int64_t blockStartSample, int numSamples,
                          std::vector<PendingVstParam>* vstParamOutput = nullptr);

    //==============================================================================
    // Timing queries (safe to call from any thread)

    double getPlayheadPositionSteps() const;
    double getPlayheadPositionBeats() const;

    /** Returns the latest audio position reported by any track's processBlock. */
    int64_t getLatestAudioPosition() const { return latestAudioPosition.load(std::memory_order_relaxed); }

    //==============================================================================
    // Legacy timer-driven API (no-op, kept for compatibility during transition)
    void processEvents(double /*currentTimeSeconds*/) {}
    void processEvents() {}

private:
    MidiTrackOutputManager* midiTrackOutputManager = nullptr;

    // Clip data per track (protected by lock)
    std::map<int, MidiClipData> trackClips;

    // Transport state
    double tempo = 120.0;
    bool playing = false;
    double sampleRate = 44100.0;

    // Sample-based transport position
    // Set to -1 when play is pending (resolved by first audio block)
    int64_t playStartSample = 0;
    double pausedPositionSteps = 0.0;

    // Latest audio position reported by any track (for playhead queries)
    std::atomic<int64_t> latestAudioPosition { 0 };

    // Per-track state - uses fixed-size bitset for activeNotes to avoid
    // heap allocation on the audio thread (128 bits covers MIDI range 0-127)
    struct TrackPlayState
    {
        std::bitset<128> activeNotes;    // Pitches currently sounding (no heap alloc)
        bool needsAllNotesOff = false;   // Flag to send all-notes-off in next block
        bool isPlaying = false;          // Per-track playing state (live mode)
        int64_t trackPlayStartSample = 0; // When per-track play started (for live mode)
        bool oneshotFinished = false;    // One-shot clip reached end

        void clearActiveNotes() { activeNotes.reset(); }
    };
    std::map<int, TrackPlayState> trackPlayStates;

    // SpinLock is lighter than CriticalSection for audio thread use
    // (no OS calls, just atomic compare-and-swap)
    // mutable because it's used in const query methods (hasClip, isTrackPlaying)
    mutable juce::SpinLock lock;

    //==============================================================================
    // Internal helpers

    double getSamplesPerStep() const;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiClipScheduler)
};
