/*
  ==============================================================================

   This file is part of the JUCE framework.
   Copyright (c) Raw Material Software Limited

   JUCE is an open source framework subject to commercial or open source
   licensing.

   By downloading, installing, or using the JUCE framework, or combining the
   JUCE framework with any other source code, object code, content or any other
   copyrightable work, you agree to the terms of the JUCE End User Licence
   Agreement, and all incorporated terms including the JUCE Privacy Policy and
   the JUCE Website Terms of Service, as applicable, which will bind you. If you
   do not agree to the terms of these agreements, we will not license the JUCE
   framework to you, and you must discontinue the installation or download
   process and cease use of the JUCE framework.

   JUCE End User Licence Agreement: https://juce.com/legal/juce-8-licence/
   JUCE Privacy Policy: https://juce.com/juce-privacy-policy
   JUCE Website Terms of Service: https://juce.com/juce-website-terms-of-service/

   Or:

   You may also use this code under the terms of the AGPLv3:
   https://www.gnu.org/licenses/agpl-3.0.en.html

   THE JUCE FRAMEWORK IS PROVIDED "AS IS" WITHOUT ANY WARRANTY, AND ALL
   WARRANTIES, WHETHER EXPRESSED OR IMPLIED, INCLUDING WARRANTY OF
   MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE, ARE DISCLAIMED.

  ==============================================================================
*/

#pragma once

#include <JuceHeader.h>
#include <set>

#if JUCE_WINDOWS
class GroovixDropTarget;
#endif


class GraphDocumentComponent;
#include "../Sequencer/MidiBridge.h"
#include "../Sequencer/SamplePlayerManager.h"
#include "../Sequencer/SampleEditorBridge.h"
#include "../Sequencer/MidiTrackOutputManager.h"
#include "../Sequencer/SamplerInstrumentManager.h"
#include "../Sequencer/DrumKitManager.h"
#include "../Plugins/TrackMixerPlugin.h"

/**
 * Provides tempo/transport information to VST plugins via the JUCE AudioPlayHead API.
 * All fields are atomic so they can be written from the message thread and read
 * safely on the audio thread inside each plugin's processBlock().
 */
class GroovixPlayHead final : public juce::AudioPlayHead
{
public:
    Optional<PositionInfo> getPosition() const override
    {
        PositionInfo info;
        juce::AudioPlayHead::TimeSignature timeSig;
        timeSig.numerator   = 4;
        timeSig.denominator = 4;

        info.setBpm           (bpm.load (std::memory_order_relaxed));
        info.setIsPlaying     (playing.load (std::memory_order_relaxed));
        info.setIsRecording   (false);
        info.setTimeSignature (timeSig);
        info.setPpqPosition   (ppqPos.load (std::memory_order_relaxed));
        return info;
    }

    void setTempo      (double newBpm)  { bpm.store (newBpm,    std::memory_order_relaxed); }
    void setIsPlaying  (bool isPlaying) { playing.store (isPlaying, std::memory_order_relaxed); }
    void setPpqPosition(double ppq)     { ppqPos.store (ppq,    std::memory_order_relaxed); }

private:
    std::atomic<double> bpm    { 120.0 };
    std::atomic<bool>   playing{ false };
    std::atomic<double> ppqPos { 0.0 };
};

//==============================================================================
// SequencerComponent for embedding in tabs
class SequencerComponent final : public Component,
                                 private Timer,
                                 private juce::MidiInputCallback
{
public:
    SequencerComponent (GraphDocumentComponent& graphDoc, PluginGraph& graph);
    ~SequencerComponent() override;

    void resized() override;
    void timerCallback() override;

    void onPageLoaded();
    //void handleJuceCommand(const String& url);

    // Access to sample player manager for external use
    SamplePlayerManager& getSamplePlayerManager() { return samplePlayerManager; }

    // Access to sample editor bridge for external use
    SampleEditorBridge& getSampleEditorBridge() { return sampleEditorBridge; }

    // Test method to ping the sequencer via JavaScript
    void pingSequencer();
    void saveSequencerState();
    void loadSequencerState();
    void newProject();
    void openProject();

    // Get/set project folder path
    juce::File getProjectFolder() const { return projectFolder; }
    void setProjectFolder(const juce::File& folder) { projectFolder = folder; }

    // Persist project folder path to settings
    void saveProjectFolderPath();
    void loadProjectFolderPath();

private:


    class CustomWebBrowser : public WebBrowserComponent,
                             public FileDragAndDropTarget
    {
    public:
        CustomWebBrowser (SequencerComponent& parent);
        bool pageAboutToLoad (const String& newURL) override;
        void pageFinishedLoading (const String&) override;

        using Resource = juce::WebBrowserComponent::Resource;
        std::optional<Resource> getResource(const juce::String& url) const;

        // FileDragAndDropTarget — intercept OS file drops and pass paths to JS
        bool isInterestedInFileDrag (const StringArray& files) override;
        void filesDropped (const StringArray& files, int x, int y) override;

    private:
        SequencerComponent& parentComponent;
    };

    void evaluateJavaScript(const String& script);
    void evaluateJavaScript(const String& script, std::function<void(const String&)> callback);
    String evaluateJavaScriptSync(const String& script);
    //void processPendingJavaScriptCalls();
    //String getPluginListJson();
    //void sendMidiNoteOn(int note, int velocity, int channel);
    //void sendMidiNoteOff(int note, int channel);

    // JavaScript callback handlers
    void handleAudioBridgeMessage(const juce::var& message);
    void sendTimingUpdate(double position, bool isPlaying);
    void sendMeterUpdates();

    // Setup sample players for tracks
    void setupSamplePlayersForTracks(int numTracks);

    // Verify and ensure sample player connections exist
    void ensureSamplePlayerConnections();

    // Debug: print current graph connections
    void debugPrintGraphConnections();

    // Setup FX chain for a track
    void setupTrackFxChain(int trackIndex, const juce::var& plugins);

    // Setup instrument plugin for a MIDI track
    void setupTrackInstrument(int trackIndex, const juce::String& pluginId);

    // Send plugin parameters to JavaScript for automation UI
    void sendPluginParametersToJS(int trackIndex, juce::AudioProcessorGraph::Node* node);

    // Setup MIDI track outputs
    void setupMidiTrackOutputs(int numTracks);

    // Setup sampler instruments for tracks
    void setupSamplerInstrumentsForTracks(int numTracks);

    // Re-wire a single track to use its SamplerInstrumentPlugin (called when switching to sampled_instrument type)
    void setupSamplerTrack(int trackIndex);

    // Wire a track to its DrumKitPlugin (called when switching to drum_kit type)
    void setupDrumKitTrack(int trackIndex);

    // Re-wire a track back to its SamplePlayerPlugin (called when switching to sample type).
    // Removes any VST instrument / sampler / drum-kit node that was previously occupying
    // the audio slot, then restores SamplePlayer → Mixer → Master connections.
    void setupSamplePlayerTrack(int trackIndex);

    // Setup the master mixer node (inserted between all track mixers and the audio output)
    void setupMasterMixer();

    GroovixPlayHead groovixPlayHead;

    GraphDocumentComponent& graphDocument;
    PluginGraph& pluginGraph;
    std::unique_ptr<CustomWebBrowser> webBrowser;
    bool pageIsLoaded = false;
    StringArray pendingJavaScriptCalls;
    MidiBridge midiBridge;
    SamplePlayerManager samplePlayerManager;
    SampleEditorBridge sampleEditorBridge;
    MidiTrackOutputManager midiTrackOutputManager;
    SamplerInstrumentManager samplerInstrumentManager;
    DrumKitManager drumKitManager;

    // Track the sample player nodes in the graph
    std::map<int, juce::AudioProcessorGraph::NodeID> samplePlayerNodes;

    // Track the MIDI output nodes in the graph
    std::map<int, juce::AudioProcessorGraph::NodeID> midiTrackOutputNodes;

    // Track instrument plugin nodes per track (for MIDI routing)
    std::map<int, juce::AudioProcessorGraph::NodeID> trackInstrumentNodes;

    // Saved plugin states for restoring after load (track index -> binary state blob)
    std::map<int, juce::MemoryBlock> savedPluginStates;

    // Sampler instrument plugin nodes per track
    std::map<int, juce::AudioProcessorGraph::NodeID> samplerInstrumentNodes;

    // FX chain nodes per track (owned by graph, tracked for removal on re-apply)
    std::map<int, std::vector<juce::AudioProcessorGraph::NodeID>> trackFxChainNodes;

    // DrumKit plugin nodes per track
    std::map<int, juce::AudioProcessorGraph::NodeID> drumKitNodes;

    // Track mixer plugin nodes per track (for MIDI track volume/pan/mute/solo)
    std::map<int, juce::AudioProcessorGraph::NodeID> trackMixerNodes;
    std::map<int, TrackMixerPlugin*> trackMixerPlugins;  // Raw pointers to mixer plugins (owned by graph)

    // Master mixer node (sits between all track mixers and the audio output)
    juce::AudioProcessorGraph::NodeID masterMixerNodeId;
    TrackMixerPlugin* masterMixerPlugin = nullptr;
    bool masterMixerCreated = false;

    // Mixer state per track
    struct MixerState
    {
        float volume = 0.8f;
        float pan = 0.0f;
        bool mute = false;
        bool solo = false;
    };
    std::map<int, MixerState> trackMixerStates;

    // Retry counter for sample player setup (in case audio output node isn't ready yet)
    int samplePlayerSetupRetryCount = 0;

    // Current project folder path
    juce::File projectFolder;

    // Track indices currently loading sampler instruments
    std::set<int> pendingSamplerLoads;

    // Apply mixer state to a track's sample player
    void applyMixerStateToTrack(int trackIndex);

    // Update solo state across all tracks (when any track's solo changes)
    void updateSoloStates();

    // MIDI input routing: connect/disconnect an external device to a track
    void setMidiInputRoute(int trackIndex, const juce::String& deviceName, int channel, bool enabled);

    // MidiInputCallback: receives MIDI from an external device on the MIDI thread
    void handleIncomingMidiMessage(juce::MidiInput* source, const juce::MidiMessage& message) override;

    struct MidiInputRoute
    {
        juce::String deviceIdentifier;
        int  channel   = 0;     // 0 = all channels, 1-16 = specific
        bool anyDevice = false; // true = accept MIDI from every connected device
        std::map<int, int> activeMappedNotes; // original pitch → mapped pitch for note-off pairing
    };
    std::map<int, MidiInputRoute> midiInputRoutes;  // trackIndex -> route
    juce::CriticalSection midiInputRouteLock;

    /** Per-track C Major → target scale remapping config (written from message thread, read from MIDI thread under lock). */
    struct TrackMidiMapping
    {
        bool             useCMajorMapping = false;
        int              scaleRoot        = 0;
        std::vector<int> scaleIntervals;  // semitone offsets from root, e.g. [0,2,3,5,7,8,10]
    };
    std::map<int, TrackMidiMapping> trackMidiMappings; // trackIndex -> mapping config
    // Protected by midiInputRouteLock (same lock used by handleIncomingMidiMessage)

    /** Remap a MIDI pitch from C Major to the target scale described by mapping.
     *  Black keys are snapped to the nearest C Major note before mapping.
     *  Returns the original pitch if mapping is disabled or no scale is set. */
    static int remapCMajorPitch(int pitch, const TrackMidiMapping& mapping);

#if JUCE_WINDOWS
    friend class GroovixDropTarget;
    void installNativeDragDrop();
    void uninstallNativeDragDrop();
    juce::Array<void*> nativeDropHwnds;
    GroovixDropTarget* nativeDropTarget = nullptr;
#endif

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SequencerComponent)
};
