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
    void triggerSampleScene(int sceneIndex, const juce::var& clipsArray);

    //==============================================================================
    // MIDI Clip Live Mode - Per-track playback control
    void playLiveClip(int trackIndex);
    void stopLiveClip(int trackIndex);
    bool isLiveClipPlaying(int trackIndex) const;

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

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiBridge)
};
