/*
    MidiBridge - Handles MIDI message routing between the webview sequencer and plugin host
*/

#pragma once

#include <JuceHeader.h>
#include "../Plugins/PluginGraph.h"
#include "SamplePlayerManager.h"
#include "MidiTrackOutputManager.h"
#include "MidiClipScheduler.h"

// Forward declarations
class SamplePlayerManager;
class MidiTrackOutputManager;
class MidiClipScheduler;

//==============================================================================
class MidiBridge : public juce::Timer
{
public:
    MidiBridge (juce::MidiMessageCollector& collector);
    ~MidiBridge() override;

    //==============================================================================
    // Sample Player Manager - set this after construction
    void setSamplePlayerManager(SamplePlayerManager* manager) { samplePlayerManager = manager; }
    SamplePlayerManager* getSamplePlayerManager() { return samplePlayerManager; }

    //==============================================================================
    // MIDI Track Output Manager - set this after construction
    void setMidiTrackOutputManager(MidiTrackOutputManager* manager);
    MidiTrackOutputManager* getMidiTrackOutputManager() { return midiTrackOutputManager; }

    //==============================================================================
    // MIDI Clip Scheduler - for looping clips natively in JUCE
    MidiClipScheduler& getClipScheduler() { return clipScheduler; }

    //==============================================================================
    // Called from JavaScript via the webview bridge
    void handleNoteOn (int channel, int pitch, float velocity, int trackIndex = -1);
    void handleNoteOff (int channel, int pitch, int trackIndex = -1);
    void handleControlChange (int channel, int controller, int value);
    void handleProgramChange (int channel, int program);
    void handlePitchBend (int channel, int value);

    //==============================================================================
    // Schedule notes for future playback (for sequencer timing)
    void scheduleNoteOn (double timeFromNow, int channel, int pitch, float velocity, int trackIndex = -1);
    void scheduleNoteOff (double timeFromNow, int channel, int pitch, int trackIndex = -1);

    //==============================================================================
    // Clip scheduling (JUCE handles looping internally)
    void scheduleClip(int trackIndex, const juce::var& notes, double loopLengthSteps, int program, bool isDrum, bool loop = true);
    void updateClip(int trackIndex, const juce::var& notes);
    void clearClip(int trackIndex);
    void clearAllClips();

    //==============================================================================
    // Transport
    void setTempo (double bpm);
    double getTempo() const { return tempo; }

    void play();
    void stop();
    void pause();
    bool isPlaying() const { return playing; }

    //==============================================================================
    // Sample file playback - Direct (immediate)
    void playSampleFile(int trackIndex, const juce::String& filePath, double offset = 0.0, bool loop = false, double loopLengthBeats = 0.0);
    void stopSampleFile(int trackIndex);
    void stopAllSamples();

    //==============================================================================
    // Sample file playback - Live Mode (quantized)
    void queueSampleFile(int trackIndex, const juce::String& filePath, double offset = 0.0);
    void queueSampleFileSeamless(int trackIndex, const juce::String& filePath, double offset, bool loop, double loopLengthBeats);
    void queueStopSample(int trackIndex);
    void cancelQueuedSample(int trackIndex);
    void triggerSampleScene(int sceneIndex, const juce::var& clipsArray);

    /** Mute/unmute a sample track at the next quantize boundary without stopping the transport. */
    void queueMuteSample(int trackIndex);
    void queueUnmuteSample(int trackIndex);

    //==============================================================================
    // MIDI Clip Live Mode - Per-track playback control
    void playLiveClip(int trackIndex);
    void stopLiveClip(int trackIndex);
    bool isLiveClipPlaying(int trackIndex) const;

    /** Queue a MIDI live clip to start at the next quantize boundary. */
    void queueLiveMidiPlay(int trackIndex);

    /** Queue a MIDI live clip to stop at the next quantize boundary. */
    void queueLiveMidiStop(int trackIndex);

    /** Enter or exit live mode. In live mode, global transport does not trigger MIDI rendering. */
    void setLiveMode(bool enabled);

    //==============================================================================
    // Song Mode - C++ drives scene transitions; JS only supplies data and updates UI

    /**
     * Tell the clip scheduler how long the current scene lasts (in beats).
     * The audio thread detects the boundary and signals the message-thread timer,
     * which calls advanceSongScene() to swap clip data for the next scene.
     */
    void setSongSceneDuration(double beats);

    /**
     * Pre-queue the NEXT scene's data so advanceSongScene() can load it instantly.
     * midiClipsArray: [{trackIndex, notes[], loopLength, program, isDrum, loop}]
     * sampleFilesArray: [{trackIndex, filePath, offset, loop, loopLengthBeats}]
     */
    void preQueueSongScene(int sceneIndex,
                           const juce::var& midiClipsArray,
                           const juce::var& sampleFilesArray,
                           double durationBeats);

    /** Stop song-mode scene tracking (call when song playback stops). */
    void stopSongMode();

    /**
     * C++-driven song playback: JS hands ALL scene data at once.
     * C++ starts scene 0, sequences all transitions internally, and fires
     * songSceneChangedCallback for each scene change (JS updates UI only).
     * scenesArray: [{sceneIndex, midiClips[], sampleFiles[], durationBeats}]
     */
    void startSong(const juce::var& scenesArray);

    /**
     * Register a callback that fires on the message thread when a scene advance
     * completes.  sceneIndex = new scene index, or -1 when the song ends.
     */
    void setSongSceneChangedCallback(std::function<void(int)> callback);

    /** Register a callback invoked on the message thread when a live-mode sample clip
     *  starts or stops at its audio-accurate quantize boundary.
     *  callback(trackIndex, isStart) */
    void setLiveClipEventCallback(std::function<void(int, bool)> cb) { liveClipEventCallback = std::move(cb); }

    /** Register a callback for mute/unmute events fired at quantize boundaries.
     *  callback(trackIndex, isMuted) */
    void setLiveClipMuteCallback(std::function<void(int, bool)> cb) { liveClipMuteCallback = std::move(cb); }

    /** Register a callback invoked on the message thread when a live-mode MIDI clip
     *  starts or stops at its quantize boundary.
     *  callback(trackIndex, isStart) */
    void setLiveMidiClipEventCallback(std::function<void(int, bool)> cb) { liveMidiClipEventCallback = std::move(cb); }

    //==============================================================================
    // Quantization settings
    void setQuantizeSteps(int steps);
    int getQuantizeSteps() const { return quantizeSteps; }

    //==============================================================================
    // Timer callback for scheduled events
    void timerCallback() override;

    //==============================================================================
    // Get current playhead position in steps (1/16th notes)
    double getPlayheadPosition() const;

    // Get current playhead position in beats (quarter notes)
    double getPlayheadPositionBeats() const;

    /**
     * Returns the absolute sample position of the next quantize boundary.
     * Used by SamplePlayerPlugin to align sample starts with MIDI clip starts.
     * Returns -1 if no timing reference is established (caller should use
     * getLatestAudioPosition() as a "start immediately" fallback).
     */
    int64_t getNextQuantizeBoundarySample() const;

    /** Returns the end-of-last-audio-block sample position (audio thread counter). */
    int64_t getLatestAudioPosition() const;

private:
    juce::MidiMessageCollector& midiCollector;
    SamplePlayerManager* samplePlayerManager = nullptr;
    MidiTrackOutputManager* midiTrackOutputManager = nullptr;
    MidiClipScheduler clipScheduler;

    double tempo = 120.0;
    bool playing = false;
    double playStartTime = 0.0;
    double pausedPosition = 0.0;
    int quantizeSteps = 16;  // Default: 1 bar (in 1/16th notes)

    // Scheduled MIDI events
    struct ScheduledEvent
    {
        double time;
        juce::MidiMessage message;
        int trackIndex = -1;  // -1 means use global MIDI collector

        bool operator< (const ScheduledEvent& other) const { return time < other.time; }
    };

    std::vector<ScheduledEvent> scheduledEvents;
    juce::CriticalSection eventLock;

    double getCurrentTime() const;

    // Song Mode helpers
    void advanceSongScene();

    // Song Mode state
    bool inSongMode = false;
    double currentSongSceneDurationBeats = 0.0;
    double songSceneStartTime = 0.0;   // wall-clock time when current scene started
    int songNextSceneIndex = -1;
    double songNextSceneDurationBeats = 0.0;
    bool songHasNextScene = false;

    std::function<void(int)> songSceneChangedCallback;
    std::function<void(int, bool)> liveClipEventCallback;
    std::function<void(int, bool)> liveClipMuteCallback;
    std::function<void(int, bool)> liveMidiClipEventCallback;

    struct SongSampleClip
    {
        int trackIndex;
        juce::String filePath;
        double offset;
        bool loop;
        double loopLengthBeats;
    };

    std::vector<SongSampleClip> nextSceneSamples;
    juce::var nextSceneMidiClipsVar;

    // ---- C++-driven song sequencing ----------------------------------------
    // When JS calls startSong() it hands all scene data at once.  C++ then owns
    // scene transitions entirely — no JS round-trip is needed per transition.
    struct SongSceneData
    {
        int sceneIndex = 0;
        juce::var midiClipsVar;
        std::vector<SongSampleClip> sampleClips;
        double durationBeats = 4.0;
    };

    std::vector<SongSceneData> songSceneQueue;
    int currentSongQueueIndex = -1;

    void loadNextSceneFromQueue();   // populate nextScene* and preload files from queue

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiBridge)
};
