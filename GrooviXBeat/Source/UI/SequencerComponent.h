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

class GraphDocumentComponent;
#include "../Sequencer/MidiBridge.h"
#include "../Sequencer/SamplePlayerManager.h"
#include "../Sequencer/SampleEditorBridge.h"
#include "../Sequencer/MidiTrackOutputManager.h"
#include "../Sequencer/SamplerInstrumentManager.h"
#include "../Plugins/TrackMixerPlugin.h"

//==============================================================================
// SequencerComponent for embedding in tabs
class SequencerComponent final : public Component,
                                 private Timer
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


    class CustomWebBrowser : public WebBrowserComponent
    {
    public:
        CustomWebBrowser (SequencerComponent& parent);
        bool pageAboutToLoad (const String& newURL) override;
        void pageFinishedLoading (const String&) override;

        using Resource = juce::WebBrowserComponent::Resource;
        std::optional<Resource> getResource(const juce::String& url) const;

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

    // Track mixer plugin nodes per track (for MIDI track volume/pan/mute/solo)
    std::map<int, juce::AudioProcessorGraph::NodeID> trackMixerNodes;
    std::map<int, TrackMixerPlugin*> trackMixerPlugins;  // Raw pointers to mixer plugins (owned by graph)

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

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SequencerComponent)
};
