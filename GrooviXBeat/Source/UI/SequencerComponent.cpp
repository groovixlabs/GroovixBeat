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

#include <JuceHeader.h>
#include "SequencerComponent.h"
#include "GraphEditorPanel.h"
#include "MainHostWindow.h"


#ifdef DEBUG

#else
    #define USE_ZIP_BUNDLE_RESOURCE 
#endif


#if JUCE_WINDOWS
    #include <windows.h>
#endif

#define LOCAL_DEV_SERVER_ADDRESS "http://localhost:3033"




#ifdef USE_ZIP_BUNDLE_RESOURCE

#define ZIPPED_FILES_PREFIX "GroovixBeatJS/"
#define LOCAL_SAMPLES_PATH "./samples"
#define LOCAL_SOUND_FONTS_PATH "./SoundFonts/sgm_plus"

#define LOCAL_WWW_ROOT  "./"

#else

#define LOCAL_WWW_ROOT  "D:/Ganesh/GrooviXBeat/GroovixBeatJS/"
#define LOCAL_SAMPLES_PATH "D:/Ganesh/GrooviXBeat/GroovixBeatJS/samples"
#define LOCAL_SOUND_FONTS_PATH "E:/SunRays_VST_MIDI_PATCH/SoundFonts/sgm_plus"

#endif

std::vector<std::byte> streamToVector(juce::InputStream& stream) {
    using namespace juce;
    const auto sizeInBytes = static_cast<size_t>(stream.getTotalLength());
    std::vector<std::byte> result(sizeInBytes);
    stream.setPosition(0);
    [[maybe_unused]] const auto bytesRead =
        stream.read(result.data(), result.size());
    jassert(bytesRead == static_cast<ssize_t>(sizeInBytes));
    return result;
}

static const char* getMimeForExtension(const juce::String& extension) {
    static const std::unordered_map<juce::String, const char*> mimeMap = {
        {{"htm"}, "text/html"},
        {{"html"}, "text/html"},
        {{"txt"}, "text/plain"},
        {{"jpg"}, "image/jpeg"},
        {{"jpeg"}, "image/jpeg"},
        {{"svg"}, "image/svg+xml"},
        {{"ico"}, "image/vnd.microsoft.icon"},
        {{"json"}, "application/json"},
        {{"png"}, "image/png"},
        {{"css"}, "text/css"},
        {{"map"}, "application/json"},
        {{"js"}, "text/javascript"},
        {{"woff2"}, "font/woff2"} };

    if (const auto it = mimeMap.find(extension.toLowerCase());
        it != mimeMap.end())
        return it->second;

    jassertfalse;
    return "";
}



#ifdef USE_ZIP_BUNDLE_RESOURCE
std::vector<std::byte> getWebViewZipFileAsBytes(const juce::String& filepath) {
    juce::MemoryInputStream zipStream{ BinaryData::GroovixBeatJS_zip,
                                      BinaryData::GroovixBeatJS_zipSize,
                                      false };
    juce::ZipFile zipFile{ zipStream };

    if (auto* zipEntry = zipFile.getEntry(ZIPPED_FILES_PREFIX + filepath)) {
        const std::unique_ptr<juce::InputStream> entryStream{
            zipFile.createStreamForEntry(*zipEntry) };

        if (entryStream == nullptr) {
            jassertfalse;
            return {};
        }

        return streamToVector(*entryStream);
    }

    return {};
}
#endif



std::vector<std::byte> getWebViewFileAsBytes(const juce::String& filepath)
{
    juce::File file(LOCAL_WWW_ROOT+filepath);

    if (!file.existsAsFile())
    {
        //jassertfalse;
        return {};
    }

    std::unique_ptr<juce::FileInputStream> fileStream(
        file.createInputStream());

    if (fileStream == nullptr || !fileStream->openedOk())
    {
        //jassertfalse;
        return {};
    }

    return streamToVector(*fileStream);
}

auto SequencerComponent::CustomWebBrowser::getResource(const juce::String& url) const
-> std::optional<Resource> {
    std::cout << "ResourceProvider called with " << url << std::endl;

    const auto resourceToRetrieve =
        url == "/" ? "index.html" : url.fromFirstOccurrenceOf("/", false, false);

    if (resourceToRetrieve == "outputLevel.json") {

        /*juce::DynamicObject::Ptr levelData{new juce::DynamicObject{}};
        levelData->setProperty("left", processorRef.outputLevelLeft.load());
        const auto jsonString = juce::JSON::toString(levelData.get());
        */

        const auto jsonString = juce::JSON::toString("Testing");
        juce::MemoryInputStream stream{ jsonString.getCharPointer(),
                                       jsonString.getNumBytesAsUTF8(), false };
        return juce::WebBrowserComponent::Resource{
            streamToVector(stream), juce::String{"application/json"} };
    }

    // Handle plugin list request for FX Chain
    if (resourceToRetrieve == "api/pluginList.json") {
        auto& knownPlugins = parentComponent.graphDocument.getPluginList();

        juce::DynamicObject::Ptr result{ new juce::DynamicObject{} };
        juce::Array<juce::var> pluginsArray;

        // Get all known plugin descriptions
        for (const auto& desc : knownPlugins.getTypes()) {
            juce::DynamicObject::Ptr pluginObj{ new juce::DynamicObject{} };
            pluginObj->setProperty("name", desc.name);
            pluginObj->setProperty("id", desc.uniqueId);
            pluginObj->setProperty("category", desc.category);
            pluginObj->setProperty("manufacturer", desc.manufacturerName);
            pluginObj->setProperty("fileOrIdentifier", desc.fileOrIdentifier);
            pluginObj->setProperty("pluginFormatName", desc.pluginFormatName);
            pluginObj->setProperty("isInstrument", desc.isInstrument);
            pluginsArray.add(juce::var(pluginObj.get()));
        }

        // Also add internal plugins (Reverb, etc.)
        juce::DynamicObject::Ptr reverbObj{ new juce::DynamicObject{} };
        reverbObj->setProperty("name", "Reverb");
        reverbObj->setProperty("id", "internal-reverb");
        reverbObj->setProperty("category", "Effect");
        reverbObj->setProperty("manufacturer", "JUCE");
        reverbObj->setProperty("fileOrIdentifier", "Reverb");
        reverbObj->setProperty("pluginFormatName", "Internal");
        reverbObj->setProperty("isInstrument", false);
        pluginsArray.add(juce::var(reverbObj.get()));

        result->setProperty("plugins", pluginsArray);

        const auto jsonString = juce::JSON::toString(result.get());
        juce::MemoryInputStream stream{ jsonString.getCharPointer(),
                                       jsonString.getNumBytesAsUTF8(), false };
        return juce::WebBrowserComponent::Resource{
            streamToVector(stream), juce::String{"application/json"} };
    }

    // Handle sampler instrument list request
    if (resourceToRetrieve == "api/samplerInstrumentList.json") {
        // Use user-configured soundfont path from settings, fall back to hardcoded default
        juce::String soundFontSetting;
        if (auto* props = getAppProperties().getUserSettings())
            soundFontSetting = props->getValue("soundFontPath", "");
        juce::File baseDir(soundFontSetting.isNotEmpty() ? soundFontSetting : LOCAL_SOUND_FONTS_PATH);

        juce::DynamicObject::Ptr result{ new juce::DynamicObject{} };
        juce::Array<juce::var> instrumentsArray;

        if (baseDir.isDirectory()) {
            juce::Array<juce::File> subdirs;
            baseDir.findChildFiles(subdirs, juce::File::findDirectories, false);

            subdirs.sort();

            for (const auto& dir : subdirs) {
                instrumentsArray.add(juce::var(dir.getFileName()));
            }
        }

        result->setProperty("instruments", instrumentsArray);

        const auto jsonString = juce::JSON::toString(result.get());
        juce::MemoryInputStream stream{ jsonString.getCharPointer(),
                                       jsonString.getNumBytesAsUTF8(), false };
        return juce::WebBrowserComponent::Resource{
            streamToVector(stream), juce::String{"application/json"} };
    }

    // Handle sample file list request
    if (resourceToRetrieve == "api/sampleFileList.json") {
        // Use user-configured samples path from settings, fall back to compiled default
        juce::String samplesPathSetting;
        if (auto* props = getAppProperties().getUserSettings())
            samplesPathSetting = props->getValue("samplesPath", "");
        juce::File samplesDir(samplesPathSetting.isNotEmpty() ? samplesPathSetting : LOCAL_SAMPLES_PATH);

        juce::DynamicObject::Ptr result{ new juce::DynamicObject{} };
        result->setProperty("basePath", samplesDir.getFullPathName());

        juce::Array<juce::var> filesArray;

        // Recursively find all audio files
        juce::Array<juce::File> audioFiles;
        samplesDir.findChildFiles(audioFiles, juce::File::findFiles, true, "*.wav;*.mp3;*.aiff;*.flac;*.ogg");

        for (const auto& file : audioFiles) {
            juce::DynamicObject::Ptr fileObj{ new juce::DynamicObject{} };
            fileObj->setProperty("name", file.getFileName());
            fileObj->setProperty("fullPath", file.getFullPathName());
            fileObj->setProperty("relativePath", file.getRelativePathFrom(samplesDir));
            filesArray.add(juce::var(fileObj.get()));
        }

        result->setProperty("files", filesArray);

        const auto jsonString = juce::JSON::toString(result.get());
        juce::MemoryInputStream stream{ jsonString.getCharPointer(),
                                       jsonString.getNumBytesAsUTF8(), false };
        return juce::WebBrowserComponent::Resource{
            streamToVector(stream), juce::String{"application/json"} };
    }

    // Handle sample file load request
    if (resourceToRetrieve.startsWith("api/loadSample")) {
        // Extract path parameter from URL
        juce::String pathParam = resourceToRetrieve.fromFirstOccurrenceOf("path=", false, false);

        // URL decode the path
        juce::String filePath = juce::URL::removeEscapeChars(pathParam);

        std::cout << "Loading sample file: " << filePath << std::endl;

        juce::File sampleFile(filePath);
        if (sampleFile.existsAsFile()) {
            std::unique_ptr<juce::FileInputStream> fileStream(sampleFile.createInputStream());

            if (fileStream != nullptr && fileStream->openedOk()) {
                auto data = streamToVector(*fileStream);

                // Determine MIME type based on extension
                juce::String extension = sampleFile.getFileExtension().toLowerCase();
                juce::String mimeType = "application/octet-stream";

                if (extension == ".wav")
                    mimeType = "audio/wav";
                else if (extension == ".mp3")
                    mimeType = "audio/mpeg";
                else if (extension == ".aiff" || extension == ".aif")
                    mimeType = "audio/aiff";
                else if (extension == ".flac")
                    mimeType = "audio/flac";
                else if (extension == ".ogg")
                    mimeType = "audio/ogg";

                return juce::WebBrowserComponent::Resource{ std::move(data), mimeType };
            }
        }

        // Return 404-like empty response if file not found
        std::cout << "Sample file not found: " << filePath << std::endl;
        return std::nullopt;
    }


#ifdef USE_ZIP_BUNDLE_RESOURCE
    const auto resource = getWebViewZipFileAsBytes(resourceToRetrieve);
    if (!resource.empty()) {
        const auto extension =
            resourceToRetrieve.fromLastOccurrenceOf(".", false, false);
        return Resource{ std::move(resource), getMimeForExtension(extension) };
    }

#else
    
    const auto resource = getWebViewFileAsBytes(resourceToRetrieve);
    if (!resource.empty()) {
        const auto extension =
            resourceToRetrieve.fromLastOccurrenceOf(".", false, false);
        return Resource{ std::move(resource), getMimeForExtension(extension) };
    }

#endif
    

    return std::nullopt;
}



//==============================================================================
SequencerComponent::CustomWebBrowser::CustomWebBrowser (SequencerComponent& parent)
    : WebBrowserComponent (WebBrowserComponent::Options{}
       #if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
        .withBackend (WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options (WebBrowserComponent::Options::WinWebView2{}
            .withUserDataFolder (File::getSpecialLocation (File::tempDirectory)
                                 .getChildFile ("AudioPluginHost_WebView2"))
            .withStatusBarDisabled()
            .withBackgroundColour (Colours::transparentBlack))
        .withNativeIntegrationEnabled()
        .withResourceProvider(
            [this](const auto& url) { return getResource(url); },
            // allowedOriginIn parameter is necessary to
            // retrieve resources from the C++ backend even if
            // on live server
            juce::URL{ LOCAL_DEV_SERVER_ADDRESS }.getOrigin())
        .withInitialisationData("vendor","GrooviXGrid")
        .withUserScript(R"(
            // This runs before page content loads
            console.log('C++ backend: Native functions initializing...');

            // Mark that we're in JUCE environment
            window.__JUCE_HOST__ = true;

            // Wait for page load and then connect
            window.addEventListener('DOMContentLoaded', function() {
                console.log('DOMContentLoaded - checking for audioBridgeCommand...');
                // Give a small delay for native functions to be fully registered
                setTimeout(function() {
                    if (typeof window.connectToJUCE === 'function') {
                        console.log('Calling connectToJUCE...');
                        console.log('audioBridgeCommand type:', typeof window.audioBridgeCommand);
                        window.connectToJUCE();
                    } else {
                        console.error('connectToJUCE not found!');
                    }
                }, 100);
            });
        )")
        .withEventListener("audioBridgeEvent",
            [this](juce::var eventDetail) {
                DBG("[AudioBridge Event] Received message");


                // The eventDetail should be our message object
                if (eventDetail.isObject())
                {
                    parentComponent.handleAudioBridgeMessage(eventDetail);
                }
                else if (eventDetail.isArray())
                {
                    for (int i = 0; i < eventDetail.size(); ++i)
                        parentComponent.handleAudioBridgeMessage(eventDetail[i]);
                }
            })
        
        .withNativeFunction(juce::Identifier{"audioBridgeCommand"},
            [this] (const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion completion)
            {
                // Expect a single argument: the message object or array
                if (args.size() > 0)
                {
                    auto message = args[0];

                    if (message.isArray())
                    {
                        // Handle array of messages (batched)
                        for (int i = 0; i < message.size(); ++i)
                            parentComponent.handleAudioBridgeMessage (message[i]);
                    }
                    else if (message.isObject())
                    {
                        // Handle single message
                        parentComponent.handleAudioBridgeMessage (message);
                    }
                }

                // Complete the callback (no return value needed)
                if (completion)
                    completion (juce::var());
            })
       #endif
        .withKeepPageLoadedWhenBrowserIsHidden()),
      parentComponent (parent)
{
   #if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
    // Enable remote debugging for WebView2
    auto env = getenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    if (env == nullptr)
    {
        _putenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222");
    }
   #endif
}

bool SequencerComponent::CustomWebBrowser::pageAboutToLoad (const String& url)
{
    juce::ignoreUnused(url);
    // Allow all page navigations (custom communication now handled by withNativeFunction)
    return true;
}


void SequencerComponent::onPageLoaded()
{
    pageIsLoaded = true;

    // Setup sample players now that the component is fully initialized
    // and the audio graph should be ready
    if (samplePlayerNodes.empty())
    {
        DBG("SequencerComponent::onPageLoaded - setting up sample players");
        setupSamplePlayersForTracks(8);
    }

    // Setup MIDI track outputs
    if (midiTrackOutputNodes.empty())
    {
        DBG("SequencerComponent::onPageLoaded - setting up MIDI track outputs");
        setupMidiTrackOutputs(8);
    }

    // Setup sampler instruments for all tracks
    if (samplerInstrumentNodes.empty())
    {
        DBG("SequencerComponent::onPageLoaded - setting up sampler instruments");
        setupSamplerInstrumentsForTracks(8);
    }

    /*
    // Inject a bridge function that triggers a custom event
    // C++ can listen to this event via withEventListener
    String bridgeScript = R"(
        console.log("___________ GrooviXBeat Page Loaded _______________");

        // Check if native function exists
        if (typeof window.audioBridgeCommand !== 'function') {
            console.log('[JUCE] Native function not found, using event-based bridge...');

            // Create bridge that dispatches events
            window.audioBridgeCommand = function(msg) {
                console.log('[JUCE Bridge] Sending message via event:', msg);

                // Dispatch custom event with the message as detail
                var event = new CustomEvent('audioBridgeEvent', {
                    detail: msg
                });
                document.dispatchEvent(event);
            };

            console.log('[JUCE] Event-based bridge created');
        } else {
            console.log('[JUCE] Native function found!');
        }

        // Try to connect
        if (typeof window.connectToJUCE === 'function') {
            window.connectToJUCE();
        }
    )";
    evaluateJavaScript(bridgeScript);
    */

    String bridgeScript = R"(
        console.log("___________ GrooviXBeat Page Loaded _______________");
    )";
    evaluateJavaScript(bridgeScript);

    loadSequencerState();
}

void SequencerComponent::pingSequencer()
{
    DBG("SequencerComponent::pingSequencer called");

    // Example of Async Version.
    evaluateJavaScript(R"(
        /*
        console.log('=== PING FROM JUCE SequencerComponent ===');
        console.log('Window location:', window.location.href);
        console.log('AudioBridge available:', typeof AudioBridge !== 'undefined');
        if (typeof AudioBridge !== 'undefined') {
            console.log('AudioBridge mode:', AudioBridge.mode);
        }
        */
        if (typeof JSFunctionForCallingFromJUCE =='function')
        {
            JSFunctionForCallingFromJUCE("GetAppState");
        }
    )", [this](const String& result) {
            juce::ignoreUnused(result);
            // This is called when JS execution completes
            DBG("CallBack : " + result);
        });
}

void SequencerComponent::saveEditedSamples()
{
    // Determine save folder for edited samples
    juce::File samplesFolder;
    if (projectFolder.exists())
        samplesFolder = projectFolder.getChildFile("EditedSamples");
    else
        samplesFolder = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("EditedSamples");

    auto trackIndices = samplePlayerManager.getTrackIndices();

    for (int trackIndex : trackIndices)
    {
        auto* player = samplePlayerManager.getPlayerForTrack(trackIndex);
        if (player == nullptr) continue;

        auto* editor = player->getSampleEditor();
        if (editor == nullptr || !editor->isLoaded()) continue;

        // Only save if the sample has been edited (undo stack is non-empty)
        if (!editor->canUndo()) continue;

        // Build output filename from original path
        juce::String originalPath = editor->getFilePath();
        juce::String baseName;
        if (originalPath.isNotEmpty())
            baseName = juce::File(originalPath).getFileNameWithoutExtension();
        else
            baseName = "track_" + juce::String(trackIndex);

        samplesFolder.createDirectory();
        juce::File outputFile = samplesFolder.getChildFile(baseName + "_edited.wav");

        // Avoid overwriting by adding a number suffix
        int suffix = 1;
        while (outputFile.existsAsFile())
        {
            outputFile = samplesFolder.getChildFile(baseName + "_edited_" + juce::String(suffix++) + ".wav");
        }

        if (editor->saveToFile(outputFile))
        {
            DBG("Saved edited sample for track " + juce::String(trackIndex) + " to: " + outputFile.getFullPathName());

            // Update JS with the new file path so it gets serialized correctly
            // Use sync evaluation to ensure paths are updated before serialize runs
            // Only update clips whose filePath matches the original source file
            juce::String escapedPath = outputFile.getFullPathName().replace("\\", "\\\\");
            juce::String escapedOriginal = originalPath.replace("\\", "\\\\");
            juce::String js = R"(
                if (typeof SampleEditor !== 'undefined') {
                    const origPath = ')" + escapedOriginal + R"(';
                    // Update only clips on this track that reference the original file
                    for (const [key, sample] of Object.entries(SampleEditor.clipSamples || {})) {
                        const parts = key.split('_');
                        if (parts.length === 2 && parseInt(parts[1]) === )" + juce::String(trackIndex) + R"() {
                            if (sample.filePath === origPath || sample.fullPath === origPath) {
                                sample.filePath = ')" + escapedPath + R"(';
                                sample.fullPath = ')" + escapedPath + R"(';
                            }
                        }
                    }
                    // Update current track sample only if it matches
                    const ts = SampleEditor.getTrackSample()" + juce::String(trackIndex) + R"();
                    if (ts && (ts.filePath === origPath || ts.fullPath === origPath)) {
                        ts.filePath = ')" + escapedPath + R"(';
                        ts.fullPath = ')" + escapedPath + R"(';
                    }
                }
            )";
            evaluateJavaScriptSync(js);
        }
        else
        {
            DBG("Failed to save edited sample for track " + juce::String(trackIndex));
        }
    }
}

void SequencerComponent::saveSequencerState()
{
    DBG("SequencerComponent::saveSequencerState called");

    // Save any edited samples to disk first, and update JS paths
    saveEditedSamples();

    // Get app state from JavaScript
    String appState = evaluateJavaScriptSync(R"(
        if (typeof JSFunctionForCallingFromJUCE == 'function')
        {
            JSFunctionForCallingFromJUCE("GetAppState");
        }
    )");

    // Save to file
    if (appState.isNotEmpty())
    {
        // Inject plugin states into the JSON
        auto parsedJson = juce::JSON::parse(appState);

        if (parsedJson.isObject())
        {
            auto* jsonObj = parsedJson.getDynamicObject();

            // Build pluginStates object
            auto pluginStatesObj = new juce::DynamicObject();

            for (const auto& [trackIndex, nodeId] : trackInstrumentNodes)
            {
                auto* node = pluginGraph.graph.getNodeForId(nodeId);
                if (node == nullptr || node->getProcessor() == nullptr)
                    continue;

                auto* processor = node->getProcessor();

                // Get plugin state as binary blob
                juce::MemoryBlock stateData;
                processor->getStateInformation(stateData);

                if (stateData.getSize() == 0)
                    continue;

                // Base64 encode
                juce::String base64State = stateData.toBase64Encoding();

                // Get plugin description for identification
                juce::String pluginId, pluginName;
                if (auto* pluginInstance = dynamic_cast<juce::AudioPluginInstance*>(processor))
                {
                    auto desc = pluginInstance->getPluginDescription();
                    pluginId = desc.fileOrIdentifier;
                    pluginName = desc.name;
                }

                // Create per-track entry
                auto trackStateObj = new juce::DynamicObject();
                trackStateObj->setProperty("pluginId", pluginId);
                trackStateObj->setProperty("pluginName", pluginName);
                trackStateObj->setProperty("state", base64State);

                pluginStatesObj->setProperty(juce::String(trackIndex), juce::var(trackStateObj));

                DBG("saveSequencerState: Saved plugin state for track " + juce::String(trackIndex) +
                    " (" + pluginName + "), " + juce::String((int)stateData.getSize()) + " bytes");
            }

            jsonObj->setProperty("pluginStates", juce::var(pluginStatesObj));

            // Re-serialize
            appState = juce::JSON::toString(parsedJson);
        }

        // Use project folder if set, otherwise use Documents folder
        File saveFile;
        if (projectFolder.exists())
        {
            saveFile = projectFolder.getChildFile("GrooviXBeat.json");
        }
        else
        {
            saveFile = File::getSpecialLocation(File::userDocumentsDirectory).getChildFile("GrooviXBeat.json");
        }

        if (saveFile.replaceWithText(appState))
        {
            DBG("Saved sequencer state to: " + saveFile.getFullPathName());
        }
        else
        {
            DBG("Failed to save sequencer state to: " + saveFile.getFullPathName());
        }
    }
    else
    {
        DBG("No app state received from JavaScript");
    }
}

void SequencerComponent::loadSequencerState()
{
    DBG("SequencerComponent::loadSequencerState called");

    // Use project folder if set, otherwise use Documents folder
    File loadFile;
    if (projectFolder.exists())
    {
        loadFile = projectFolder.getChildFile("GrooviXBeat.json");
    }
    else
    {
        loadFile = File::getSpecialLocation(File::userDocumentsDirectory).getChildFile("GrooviXBeat.json");
    }

    String fileContents;

    if (loadFile.existsAsFile())
    {
        fileContents = loadFile.loadFileAsString();
        DBG("Loaded sequencer state from: " + loadFile.getFullPathName());
    }
    else
    {
        DBG("File not found: " + loadFile.getFullPathName());
        return;
    }

    // Extract pluginStates from JSON before passing to JS
    savedPluginStates.clear();

    auto parsedJson = juce::JSON::parse(fileContents);
    if (parsedJson.isObject())
    {
        auto pluginStatesVar = parsedJson.getProperty("pluginStates", juce::var());
        if (auto* pluginStatesObj = pluginStatesVar.getDynamicObject())
        {
            for (const auto& prop : pluginStatesObj->getProperties())
            {
                int trackIndex = prop.name.toString().getIntValue();
                auto trackState = prop.value;

                if (auto* trackStateObj = trackState.getDynamicObject())
                {
                    juce::String base64State = trackStateObj->getProperty("state").toString();
                    juce::String pluginName = trackStateObj->getProperty("pluginName").toString();

                    if (base64State.isNotEmpty())
                    {
                        juce::MemoryBlock stateData;
                        if (stateData.fromBase64Encoding(base64State))
                        {
                            savedPluginStates[trackIndex] = stateData;
                            DBG("loadSequencerState: Loaded plugin state for track " + juce::String(trackIndex) +
                                " (" + pluginName + "), " + juce::String((int)stateData.getSize()) + " bytes");
                        }
                    }
                }
            }
        }
    }

    // Escape backticks and backslashes in the JSON for template literal
    fileContents = fileContents.replace("\\", "\\\\").replace("`", "\\`").replace("$", "\\$");

    String JS = "if (typeof JSFunctionForCallingFromJUCE == 'function') { JSFunctionForCallingFromJUCE('SetAppState', `";
    JS += fileContents;
    JS += "`); } else {console.log(`JSFunctionForCallingFromJUCE  NOT FOUND`);} ";

    evaluateJavaScript(JS);
}

void SequencerComponent::saveProjectFolderPath()
{
    if (auto* props = getAppProperties().getUserSettings())
    {
        props->setValue("lastProjectFolder", projectFolder.getFullPathName());
        props->saveIfNeeded();
        DBG("Saved project folder path: " + projectFolder.getFullPathName());
    }
}

void SequencerComponent::loadProjectFolderPath()
{
    if (auto* props = getAppProperties().getUserSettings())
    {
        String savedPath = props->getValue("lastProjectFolder", "");
        if (savedPath.isNotEmpty())
        {
            File savedFolder(savedPath);
            if (savedFolder.exists() && savedFolder.isDirectory())
            {
                projectFolder = savedFolder;
                DBG("Restored project folder path: " + projectFolder.getFullPathName());
            }
            else
            {
                DBG("Saved project folder no longer exists: " + savedPath);
            }
        }
    }
}

// Custom component: TextEditor + "..." browse button side by side
class FolderBrowseComponent : public Component
{
public:
    FolderBrowseComponent (const String& labelText, const String& initialPath)
    {
        label.setText (labelText, dontSendNotification);
        label.setFont (FontOptions (14.0f));
        label.setColour (Label::textColourId, Colours::white);
        addAndMakeVisible (label);

        editor.setText (initialPath);
        addAndMakeVisible (editor);

        browseButton.setButtonText ("...");
        browseButton.onClick = [this]() { browseForFolder(); };
        addAndMakeVisible (browseButton);

        setSize (400, 52);
    }

    void resized() override
    {
        auto bounds = getLocalBounds();
        label.setBounds (bounds.removeFromTop (22));
        browseButton.setBounds (bounds.removeFromRight (36));
        bounds.removeFromRight (4);
        editor.setBounds (bounds);
    }

    String getText() const { return editor.getText(); }

private:
    void browseForFolder()
    {
        auto startDir = File (editor.getText().trim());
        if (! startDir.exists())
            startDir = File::getSpecialLocation (File::userDocumentsDirectory);

        folderChooser = std::make_shared<FileChooser> (
            "Select folder for new project", startDir, "", true);

        folderChooser->launchAsync (
            FileBrowserComponent::openMode | FileBrowserComponent::canSelectDirectories,
            [this] (const FileChooser& chooser)
            {
                auto result = chooser.getResult();
                if (result != File())
                    editor.setText (result.getFullPathName());
            });
    }

    Label label;
    TextEditor editor;
    TextButton browseButton;
    std::shared_ptr<FileChooser> folderChooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FolderBrowseComponent)
};

void SequencerComponent::newProject()
{
    DBG("SequencerComponent::newProject called");

    // Default to last project folder's parent, or configured projects folder, or Documents
    String defaultFolder;
    if (projectFolder.exists())
        defaultFolder = projectFolder.getParentDirectory().getFullPathName();
    else if (auto* props = getAppProperties().getUserSettings())
    {
        String projectsPath = props->getValue("projectsFolder", "");
        if (projectsPath.isNotEmpty() && File(projectsPath).exists())
            defaultFolder = projectsPath;
        else
            defaultFolder = File::getSpecialLocation(File::userDocumentsDirectory).getFullPathName();
    }
    else
        defaultFolder = File::getSpecialLocation(File::userDocumentsDirectory).getFullPathName();

    // Folder browse component (TextEditor + "..." button) kept alive via shared_ptr
    auto folderBrowse = std::make_shared<FolderBrowseComponent>("Project Folder:", defaultFolder);

    // Single dialog: folder browse component, then project name, Create/Cancel
    auto* alertWindow = new AlertWindow(
        "New Project",
        "Choose a location and name for your new project:",
        AlertWindow::NoIcon
    );

    alertWindow->addCustomComponent(folderBrowse.get());
    alertWindow->addTextEditor("projectName", "", "Project Name:");
    alertWindow->addButton("Create", 1, KeyPress(KeyPress::returnKey));
    alertWindow->addButton("Cancel", 0, KeyPress(KeyPress::escapeKey));

    alertWindow->enterModalState(true, ModalCallbackFunction::create(
        [this, alertWindow, folderBrowse](int result)
        {
            if (result == 1)
            {
                String folderPath = folderBrowse->getText().trim();
                String projectName = alertWindow->getTextEditorContents("projectName").trim();

                if (projectName.isEmpty())
                {
                    delete alertWindow;
                    AlertWindow::showMessageBoxAsync(
                        AlertWindow::WarningIcon,
                        "Error",
                        "Please enter a project name"
                    );
                    return;
                }

                File selectedFolder(folderPath);
                if (!selectedFolder.exists())
                {
                    delete alertWindow;
                    AlertWindow::showMessageBoxAsync(
                        AlertWindow::WarningIcon,
                        "Error",
                        "The selected folder does not exist"
                    );
                    return;
                }

                // Create the project folder
                File newProjectFolder = selectedFolder.getChildFile(projectName);

                if (newProjectFolder.createDirectory())
                {
                    projectFolder = newProjectFolder;
                    DBG("Created new project folder: " + projectFolder.getFullPathName());

                    // Create samples subfolder
                    File samplesFolder = projectFolder.getChildFile("samples");
                    if (samplesFolder.createDirectory())
                    {
                        DBG("Created samples folder: " + samplesFolder.getFullPathName());
                    }

                    // Reset the sequencer state to a new empty state
                    evaluateJavaScript(R"(
                        if (typeof JSFunctionForCallingFromJUCE == 'function') {
                            JSFunctionForCallingFromJUCE('NewProject');
                        }
                    )");

                    // Save project folder path to settings
                    saveProjectFolderPath();

                    // Save initial empty state to the new project folder
                    saveSequencerState();

                    AlertWindow::showMessageBoxAsync(
                        AlertWindow::InfoIcon,
                        "Project Created",
                        "New project created at:\n" + projectFolder.getFullPathName()
                    );
                }
                else
                {
                    AlertWindow::showMessageBoxAsync(
                        AlertWindow::WarningIcon,
                        "Error",
                        "Failed to create project folder"
                    );
                }
            }

            delete alertWindow;
        }
    ), true);
}

void SequencerComponent::openProject()
{
    DBG("SequencerComponent::openProject called");

    // Default browse location: last project folder, or configured projects folder, or Documents
    File startLocation;
    if (projectFolder.exists())
        startLocation = projectFolder;
    else if (auto* props = getAppProperties().getUserSettings())
    {
        String projectsPath = props->getValue("projectsFolder", "");
        if (projectsPath.isNotEmpty() && File(projectsPath).exists())
            startLocation = File(projectsPath);
        else
            startLocation = File::getSpecialLocation(File::userDocumentsDirectory);
    }
    else
        startLocation = File::getSpecialLocation(File::userDocumentsDirectory);

    // File picker filtered to GrooviXBeat.json / .json files
    auto fileChooser = std::make_shared<FileChooser>(
        "Open GrooviXBeat Project",
        startLocation,
        "*.json",
        true
    );

    fileChooser->launchAsync(
        FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this, fileChooser](const FileChooser& chooser)
        {
            File selectedFile = chooser.getResult();

            if (selectedFile == File())
            {
                DBG("No file selected");
                return;
            }

            if (!selectedFile.existsAsFile())
            {
                AlertWindow::showMessageBoxAsync(
                    AlertWindow::WarningIcon,
                    "Error",
                    "Selected file does not exist."
                );
                return;
            }

            // Use the file's parent directory as the project folder
            projectFolder = selectedFile.getParentDirectory();
            DBG("Opening project from: " + projectFolder.getFullPathName());

            // Save project folder path to settings
            saveProjectFolderPath();

            // Load the project state
            loadSequencerState();

            AlertWindow::showMessageBoxAsync(
                AlertWindow::InfoIcon,
                "Project Opened",
                "Loaded project from:\n" + projectFolder.getFullPathName()
            );
        }
    );
}

void SequencerComponent::CustomWebBrowser::pageFinishedLoading (const String&)
{
    parentComponent.onPageLoaded();
}

//==============================================================================
SequencerComponent::SequencerComponent (GraphDocumentComponent& graphDoc, PluginGraph& graph)
    : graphDocument (graphDoc),
      pluginGraph (graph),
      midiBridge(graphDoc.getMidiMessageCollector()),
      sampleEditorBridge(samplePlayerManager)
{
    DBG("SequencerComponent::SequencerComponent - starting");

    // Restore last project folder from settings
    loadProjectFolderPath();

    // Connect SamplePlayerManager to MidiBridge
    midiBridge.setSamplePlayerManager(&samplePlayerManager);
    DBG("SequencerComponent - setSamplePlayerManager done, ptr: " +
        juce::String((juce::int64)&samplePlayerManager));

    // Connect MidiTrackOutputManager to MidiBridge
    midiBridge.setMidiTrackOutputManager(&midiTrackOutputManager);
    DBG("SequencerComponent - setMidiTrackOutputManager done, ptr: " +
        juce::String((juce::int64)&midiTrackOutputManager));

    // NOTE: Don't setup sample players here - the graph might not be ready yet.
    // We'll set them up when the page is loaded or on first use.

    webBrowser = std::make_unique<CustomWebBrowser>(*this);
    addAndMakeVisible (webBrowser.get());

    webBrowser->goToURL(juce::WebBrowserComponent::getResourceProviderRoot());

    DBG("SequencerComponent::SequencerComponent - completed");


    // Load the HTML file
    /*
    File htmlFile = File::getSpecialLocation(File::currentExecutableFile)
                        .getParentDirectory()
                        .getChildFile("sequencer.html");
                        */
    
    //File htmlFile = "D:\\Ganesh\\GrooviXBeat\\GroovixBeatJS\\index.html";

    // Fallback: try to find it relative to source
    /*
    if (!htmlFile.existsAsFile())
    {
        htmlFile = File(__FILE__).getParentDirectory().getChildFile("sequencer.html");
    }
    

    if (htmlFile.existsAsFile())
    {
        webBrowser->goToURL(htmlFile.getFullPathName());
    }
    else
    {
        // Load inline HTML with error message
        webBrowser->goToURL("data:text/html," + URL::addEscapeChars(R"(
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body style="font-family: sans-serif; padding: 20px; background: #1e3c72; color: white;">
                <h1>Sequencer HTML File Not Found</h1>
                <p>Could not locate sequencer.html at:</p>
                <p><code>)" + htmlFile.getFullPathName() + R"(</code></p>
                <p>Please ensure the HTML file is in the correct location.</p>
            </body>
            </html>
        )", false));
    }
    */

    // Start timer to handle JavaScript bridge
    startTimer(100);

    // Start timer for timing updates (60fps)
    //startTimerHz(60); - TOO FAST
}

SequencerComponent::~SequencerComponent()
{
    DBG("SequencerComponent::~SequencerComponent - starting");

    stopTimer();

    // Stop MidiBridge timer and disconnect from midiTrackOutputManager - the timer
    // accesses midiTrackOutputManager via raw pointer on a 1ms callback, and must be
    // stopped before midiTrackOutputManager is destroyed during member destruction
    midiBridge.stopTimer();
    midiBridge.setMidiTrackOutputManager(nullptr);

    // Stop all sample playback (safe even if no players exist)
    samplePlayerManager.stopAllSamples();

    // Stop all MIDI notes
    midiTrackOutputManager.sendAllNotesOffAllTracks();

    // Remove MIDI track output nodes from the graph
    if (!midiTrackOutputNodes.empty())
    {
        DBG("SequencerComponent::~SequencerComponent - removing " +
            juce::String((int)midiTrackOutputNodes.size()) + " MIDI track output nodes");

        for (const auto& pair : midiTrackOutputNodes)
        {
            midiTrackOutputManager.unregisterOutputForTrack(pair.first);
            pluginGraph.graph.removeNode(pair.second);
        }
        midiTrackOutputNodes.clear();
    }

    // Remove mixer nodes from the graph
    if (!trackMixerNodes.empty())
    {
        DBG("SequencerComponent::~SequencerComponent - removing " +
            juce::String((int)trackMixerNodes.size()) + " track mixer nodes");

        for (const auto& pair : trackMixerNodes)
        {
            pluginGraph.graph.removeNode(pair.second);
        }
        trackMixerNodes.clear();
        trackMixerPlugins.clear();
    }

    // Remove instrument nodes from the graph
    if (!trackInstrumentNodes.empty())
    {
        DBG("SequencerComponent::~SequencerComponent - removing " +
            juce::String((int)trackInstrumentNodes.size()) + " instrument nodes");

        for (const auto& pair : trackInstrumentNodes)
        {
            pluginGraph.graph.removeNode(pair.second);
        }
        trackInstrumentNodes.clear();
    }

    // Remove sample player nodes from the graph (if any were created)
    if (!samplePlayerNodes.empty())
    {
        DBG("SequencerComponent::~SequencerComponent - removing " +
            juce::String((int)samplePlayerNodes.size()) + " sample player nodes");

        for (const auto& pair : samplePlayerNodes)
        {
            // Unregister from manager (doesn't delete, as graph owns it)
            samplePlayerManager.unregisterPlayerForTrack(pair.first);

            // Remove node from graph (this deletes the processor)
            pluginGraph.graph.removeNode(pair.second);
        }
        samplePlayerNodes.clear();
    }

    webBrowser = nullptr;

    DBG("SequencerComponent::~SequencerComponent - completed");
}

void SequencerComponent::resized()
{
    if (webBrowser != nullptr)
        webBrowser->setBounds(getLocalBounds());
}

void SequencerComponent::timerCallback()
{
    // Process any pending JavaScript calls
    //processPendingJavaScriptCalls();

    if (isVisible())
    {
        double position = midiBridge.getPlayheadPosition();
        bool isPlaying = midiBridge.isPlaying();

        //if (isPlaying)
        {
            sendTimingUpdate(position, isPlaying);
        }

        // Send meter updates for level visualization
        sendMeterUpdates();

        // Poll pending sampler loads for completion
        if (!pendingSamplerLoads.empty())
        {
            std::vector<int> completed;
            for (int trackIndex : pendingSamplerLoads)
            {
                auto* plugin = samplerInstrumentManager.getInstrumentForTrack(trackIndex);
                if (plugin == nullptr || !plugin->isLoading())
                    completed.push_back(trackIndex);
            }
            for (int trackIndex : completed)
            {
                pendingSamplerLoads.erase(trackIndex);
                if (webBrowser) webBrowser->emitEventIfBrowserIsVisible("juceBridgeEvents", "{"
                    "\"type\": \"samplerLoadState\", "
                    "\"trackIndex\": " + juce::String(trackIndex) + ", "
                    "\"loading\": false}");
            }

            // When all pending loads are done, notify JS so it can auto-play
            if (pendingSamplerLoads.empty() && !completed.empty())
            {
                if (webBrowser) webBrowser->emitEventIfBrowserIsVisible("juceBridgeEvents", "{"
                    "\"type\": \"allSamplersReady\"}");
            }
        }
    }
}



String SequencerComponent::evaluateJavaScriptSync(const String& script)
{
    if (webBrowser == nullptr || !pageIsLoaded)
        return "";

#if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
    // Synchronous evaluation using message pumping
    String resultString;
    bool completed = false;

    webBrowser->evaluateJavascript(script, [&resultString, &completed](WebBrowserComponent::EvaluationResult result) {
        if (auto* resultValue = result.getResult())
        {
            resultString = resultValue->toString();
            DBG("JavaScript result: " + resultString);
        }
        else if (auto* error = result.getError())
        {
            DBG("JavaScript error: " + error->message);
        }
        completed = true;
    });

    // Pump messages while waiting for the callback (with timeout)
    const uint32 timeoutMs = 5000;
    const auto startTime = Time::getMillisecondCounter();

    while (!completed)
    {
        // Check for timeout
        if (Time::getMillisecondCounter() - startTime > timeoutMs)
        {
            DBG("evaluateJavaScriptSync timed out!");
            break;
        }

        // Process pending Windows messages to allow the WebView2 callback to be delivered
        MSG msg;
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        else
        {
            Thread::sleep(1); // Small sleep if no messages pending
        }
    }

    return resultString;
#else
    // Fallback: try to inject via URL (no return value possible)
    auto encodedScript = "javascript:" + URL::addEscapeChars(script, false);
    webBrowser->goToURL(encodedScript);
    return "";
#endif
}

void SequencerComponent::evaluateJavaScript(const String& script)
{
    if (webBrowser == nullptr || !pageIsLoaded)
        return;

#if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
    // Async evaluation - fire and forget (no waiting)
    webBrowser->evaluateJavascript(script, [](WebBrowserComponent::EvaluationResult result) {
        if (auto* resultValue = result.getResult())
        {
            DBG("JavaScript result: " + resultValue->toString());
        }
        else if (auto* error = result.getError())
        {
            DBG("JavaScript error: " + error->message);
        }
    });
#else
    // Fallback: try to inject via URL
    auto encodedScript = "javascript:" + URL::addEscapeChars(script, false);
    webBrowser->goToURL(encodedScript);
#endif
}

void SequencerComponent::evaluateJavaScript(const String& script, std::function<void(const String&)> callback)
{
    if (webBrowser == nullptr || !pageIsLoaded)
    {
        if (callback)
            callback("");
        return;
    }

#if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
    // Async evaluation with callback
    webBrowser->evaluateJavascript(script, [callback](WebBrowserComponent::EvaluationResult result) {
        if (auto* resultValue = result.getResult())
        {
            String resultStr = resultValue->toString();
            DBG("JavaScript result: " + resultStr);
            if (callback)
                callback(resultStr);
        }
        else if (auto* error = result.getError())
        {
            DBG("JavaScript error: " + error->message);
            if (callback)
                callback("");
        }
    });
#else
    // Fallback: try to inject via URL (no return value possible)
    auto encodedScript = "javascript:" + URL::addEscapeChars(script, false);
    webBrowser->goToURL(encodedScript);
    if (callback)
        callback("");
#endif
}

void SequencerComponent::handleAudioBridgeMessage(const juce::var& message)
{
    if (!message.isObject())
        return;

    
    auto command = message.getProperty("command", juce::var()).toString();
    auto payload = message.getProperty("payload", juce::var());

    DBG("AudioBridge command: " + command);

    if (command == "playNote")
    {
        // Track index determines MIDI channel (1-16)
        int trackIndex = payload.getProperty("trackIndex", 0);
        int channel = juce::jlimit(1, 16, trackIndex + 1);
        int pitch = payload.getProperty("pitch", 60);
        float velocity = (float)payload.getProperty("velocity", 0.8);
        double startTime = payload.getProperty("startTime", 0.0);
        double duration = payload.getProperty("duration", 0.5);

        if (startTime > 0.0)
        {
            midiBridge.scheduleNoteOn(startTime, channel, pitch, velocity, trackIndex);
            midiBridge.scheduleNoteOff(startTime + duration, channel, pitch, trackIndex);
        }
        else
        {
            midiBridge.handleNoteOn(channel, pitch, velocity, trackIndex);
        }
    }
    else if (command == "previewNote")
    {
        int pitch = payload.getProperty("pitch", 60);
        midiBridge.handleNoteOn(1, pitch, 0.7f);

        // Schedule note off after preview duration (use global MIDI, -1)
        midiBridge.scheduleNoteOff(0.5, 1, pitch, -1);
    }
    else if (command == "stopNote" || command == "noteOff")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        int channel = juce::jlimit(1, 16, trackIndex + 1);
        int pitch = payload.getProperty("pitch", 60);
        midiBridge.handleNoteOff(channel, pitch, trackIndex);
    }
    else if (command == "scheduleClip")
    {
        // Schedule clip with JUCE-side looping (or one-shot)
        // The MidiClipScheduler handles looping internally for better timing
        auto notes = payload.getProperty("notes", juce::var());
        int trackIndex = payload.getProperty("trackIndex", 0);
        double loopLengthSteps = payload.getProperty("loopLength", 64.0);
        int program = payload.getProperty("program", 0);
        bool isDrum = payload.getProperty("isDrum", false);
        bool loop = payload.getProperty("loop", true);

        DBG("SequencerComponent: scheduleClip - track " + juce::String(trackIndex) +
            " notes: " + juce::String(notes.isArray() ? notes.size() : 0) +
            " loopLength: " + juce::String(loopLengthSteps) +
            " loop: " + juce::String(loop ? "true" : "false"));

        // Pass to MidiBridge's clip scheduler
        midiBridge.scheduleClip(trackIndex, notes, loopLengthSteps, program, isDrum, loop);
    }
    else if (command == "updateClip")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        auto notes = payload.getProperty("notes", juce::var());

        DBG("SequencerComponent: updateClip - track " + juce::String(trackIndex) +
            " notes: " + juce::String(notes.isArray() ? notes.size() : 0));

        midiBridge.updateClip(trackIndex, notes);
    }
    else if (command == "clearClip")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        midiBridge.clearClip(trackIndex);
    }
    else if (command == "clearAllClips")
    {
        midiBridge.clearAllClips();
    }
    else if (command == "setTempo")
    {
        double bpm = payload.getProperty("bpm", 120.0);
        midiBridge.setTempo(bpm);
    }
    else if (command == "playClip" || command == "playScene" || command == "playSong" ||
        command == "play" || command == "transportPlay")
    {
        midiBridge.play();
    }
    else if (command == "stopClip" || command == "stopScene" || command == "stopSong" ||
        command == "stop" || command == "transportStop" || command == "stopAll")
    {
        midiBridge.stop();
    }
    else if (command == "pauseClip" || command == "pauseScene" || command == "pauseSong" ||
        command == "pause")
    {
        midiBridge.pause();
    }
    else if (command == "toggleClip" || command == "toggleScene" || command == "toggleSong")
    {
        if (midiBridge.isPlaying())
            midiBridge.pause();
        else
            midiBridge.play();
    }
    else if (command == "resumeClip" || command == "resumeScene" || command == "resumeSong")
    {
        midiBridge.play();
    }
    else if (command == "playSceneByIndex")
    {
        // For now, just play - advanced scene management can be added later
        int sceneIndex = payload.getProperty("sceneIndex", 0);
        juce::ignoreUnused(sceneIndex);
        DBG("Playing scene index: " + juce::String(sceneIndex));
        midiBridge.play();
    }
    else if (command == "queueLiveClip")
    {
        // Live mode clip queuing - for now just log it
        int sceneIndex = payload.getProperty("sceneIndex", 0);
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::ignoreUnused(sceneIndex, trackIndex);
        DBG("Queue live clip: scene=" + juce::String(sceneIndex) + " track=" + juce::String(trackIndex));
        // TODO: Implement live mode scheduling
    }
    else if (command == "startLiveMode" || command == "stopLiveMode" || command == "toggleLiveMode")
    {
        // Live mode state is managed by JavaScript, JUCE just handles playback
        DBG("Live mode command: " + command);
    }
    else if (command == "playLiveClip")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        DBG("Play live clip: track=" + juce::String(trackIndex));
        midiBridge.playLiveClip(trackIndex);
    }
    else if (command == "stopLiveClip")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        DBG("Stop live clip: track=" + juce::String(trackIndex));
        midiBridge.stopLiveClip(trackIndex);
    }
    else if (command == "controlChange")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        int channel = juce::jlimit(1, 16, trackIndex + 1);
        int controller = payload.getProperty("controller", 0);
        int value = payload.getProperty("value", 0);
        midiBridge.handleControlChange(channel, controller, value);
    }
    else if (command == "programChange" || command == "setTrackProgram")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        int channel = juce::jlimit(1, 16, trackIndex + 1);
        int program = payload.getProperty("program", 0);
        midiBridge.handleProgramChange(channel, program);
    }
    else if (command == "setTrackVolume")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        float volume = (float)payload.getProperty("volume", 1.0);
        juce::ignoreUnused(trackIndex, volume);
        DBG("Set track " + juce::String(trackIndex) + " volume: " + juce::String(volume));
        // TODO: Implement per-track volume control in PluginGraph
    }
    else if (command == "setTrackMute")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        bool muted = payload.getProperty("muted", false);
        juce::ignoreUnused(trackIndex, muted);
        DBG("Set track " + juce::String(trackIndex) + " mute: " + juce::String(muted ? "ON" : "OFF"));
        // TODO: Implement per-track mute in PluginGraph
    }
    else if (command == "setTrackSolo")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        bool solo = payload.getProperty("solo", false);
        juce::ignoreUnused(trackIndex, solo);
        DBG("Set track " + juce::String(trackIndex) + " solo: " + juce::String(solo ? "ON" : "OFF"));
        // TODO: Implement per-track solo in PluginGraph
    }
    else if (command == "setTrackPan")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        float pan = (float)payload.getProperty("pan", 0.0);
        juce::ignoreUnused(trackIndex, pan);
        DBG("Set track " + juce::String(trackIndex) + " pan: " + juce::String(pan));
        // TODO: Implement per-track panning in PluginGraph
    }
    else if (command == "playSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::ignoreUnused(trackIndex);
        DBG(command + " for track " + juce::String(trackIndex));
        // Note: playSample without file path is handled by JS side
    }
    else if (command == "stopSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        DBG("stopSample for track " + juce::String(trackIndex));
        midiBridge.stopSampleFile(trackIndex);
    }
    else if (command == "playSampleFile")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String filePath = payload.getProperty("filePath", "").toString();
        double offset = payload.getProperty("offset", 0.0);
        bool loop = payload.getProperty("loop", false);
        bool seamless = payload.getProperty("seamless", false);
        // loopLengthSteps is in 1/16th notes, convert to beats (quarter notes)
        double loopLengthSteps = payload.getProperty("loopLengthSteps", 0.0);
        double loopLengthBeats = loopLengthSteps / 4.0;  // 4 steps = 1 beat

        DBG("playSampleFile: track=" + juce::String(trackIndex) + " file=" + filePath +
            " offset=" + juce::String(offset) + " loop=" + juce::String(loop ? "true" : "false") +
            " seamless=" + juce::String(seamless ? "true" : "false") +
            " loopLengthBeats=" + juce::String(loopLengthBeats));

        // Ensure sample players are set up
        if (samplePlayerNodes.empty())
        {
            DBG("playSampleFile: Setting up sample players on first use");
            setupSamplePlayersForTracks(8);
        }

        // Verify connections are in place before playing
        ensureSamplePlayerConnections();

        if (seamless)
        {
            // Live Mode: use seamless transition (keeps old sample playing until quantize boundary)
            midiBridge.queueSampleFileSeamless(trackIndex, filePath, offset, loop, loopLengthBeats);
        }
        else
        {
            // Normal mode: load and play immediately
            midiBridge.playSampleFile(trackIndex, filePath, offset, loop, loopLengthBeats);
        }

        // Only start transport if it's truly not playing (first play, not loop restart)
        if (!midiBridge.isPlaying())
        {
            DBG("playSampleFile: Starting transport (was stopped)");
            midiBridge.play();
        }
    }
    else if (command == "stopSampleFile")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        DBG("stopSampleFile: track=" + juce::String(trackIndex));

        // Check if we have players set up
        if (samplePlayerNodes.empty())
        {
            DBG("stopSampleFile: No sample players set up yet, ignoring");
            return;
        }

        midiBridge.stopSampleFile(trackIndex);
    }
    else if (command == "copySampleToProject")
    {
        juce::String sourcePath = payload.getProperty("sourcePath", "").toString();
        int trackIndex = payload.getProperty("trackIndex", 0);
        int requestId = payload.getProperty("requestId", -1);

        DBG("copySampleToProject: source=" + sourcePath + " track=" + juce::String(trackIndex) + " requestId=" + juce::String(requestId));

        // Helper lambda to build the JS callback with optional requestId
        auto buildCallback = [trackIndex, requestId](const juce::String& path) {
            juce::String escapedPath = path.replace("\\", "\\\\").replace("`", "\\`");
            juce::String js = "if (typeof handleSampleCopyResult === 'function') { handleSampleCopyResult(" +
                              juce::String(trackIndex) + ", `" + escapedPath + "`";
            if (requestId >= 0)
                js += ", " + juce::String(requestId);
            js += "); }";
            return js;
        };

        if (sourcePath.isEmpty())
        {
            DBG("copySampleToProject: Empty source path");
            return;
        }

        juce::File sourceFile(sourcePath);
        if (!sourceFile.existsAsFile())
        {
            DBG("copySampleToProject: Source file does not exist: " + sourcePath);
            // Still send callback so JS doesn't hang waiting
            evaluateJavaScript(buildCallback(sourcePath));
            return;
        }

        // Check if we have a project folder set
        if (!projectFolder.exists())
        {
            DBG("copySampleToProject: No project folder set, using original file");
            // Send back the original path
            evaluateJavaScript(buildCallback(sourcePath));
            return;
        }

        // Create samples subfolder if it doesn't exist
        juce::File samplesFolder = projectFolder.getChildFile("samples");
        if (!samplesFolder.exists())
        {
            samplesFolder.createDirectory();
        }

        // Generate destination file path
        juce::File destFile = samplesFolder.getChildFile(sourceFile.getFileName());

        // If file already exists with same name, check if it's the same file
        if (destFile.existsAsFile())
        {
            // Check if source and dest are the same file (already in project folder)
            if (sourceFile.getFullPathName() == destFile.getFullPathName())
            {
                DBG("copySampleToProject: File already in project folder");
                evaluateJavaScript(buildCallback(destFile.getFullPathName()));
                return;
            }

            // Check if files are identical (same size) - if so, use existing file
            // This prevents creating duplicates like _1, _2 when reloading the same sample
            if (sourceFile.getSize() == destFile.getSize())
            {
                DBG("copySampleToProject: File with same name and size exists, using existing: " + destFile.getFullPathName());
                evaluateJavaScript(buildCallback(destFile.getFullPathName()));
                return;
            }

            // Files have same name but different size - generate unique filename
            int counter = 1;
            juce::String baseName = destFile.getFileNameWithoutExtension();
            juce::String extension = destFile.getFileExtension();
            while (destFile.existsAsFile())
            {
                destFile = samplesFolder.getChildFile(baseName + "_" + juce::String(counter) + extension);
                counter++;
            }
        }

        // Copy the file
        if (sourceFile.copyFileTo(destFile))
        {
            DBG("copySampleToProject: Copied to " + destFile.getFullPathName());
            evaluateJavaScript(buildCallback(destFile.getFullPathName()));
        }
        else
        {
            DBG("copySampleToProject: Failed to copy file");
            // Send back original path as fallback
            evaluateJavaScript(buildCallback(sourcePath));
        }
    }
    else if (command == "saveEditedSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        int sceneIndex = payload.getProperty("sceneIndex", -1);
        int requestId = payload.getProperty("requestId", -1);
        juce::String filePath = payload.getProperty("filePath", "").toString();
        juce::String wavDataBase64 = payload.getProperty("wavData", "").toString();

        DBG("saveEditedSample: track=" + juce::String(trackIndex) + " scene=" + juce::String(sceneIndex) + " requestId=" + juce::String(requestId) + " filePath=" + filePath);

        // Helper lambda to build the JS callback with optional requestId and sceneIndex
        auto buildCallback = [trackIndex, sceneIndex, requestId](const juce::String& path, bool success) {
            juce::String escapedPath = path.replace("\\", "\\\\").replace("`", "\\`");
            juce::String js = "if (typeof handleEditedSampleSaved === 'function') { handleEditedSampleSaved(" +
                              juce::String(trackIndex) + ", `" + escapedPath + "`, " + (success ? "true" : "false");
            if (requestId >= 0)
                js += ", " + juce::String(requestId);
            else
                js += ", undefined";
            if (sceneIndex >= 0)
                js += ", " + juce::String(sceneIndex);
            js += "); }";
            return js;
        };

        if (wavDataBase64.isEmpty())
        {
            DBG("saveEditedSample: No WAV data received");
            evaluateJavaScript(buildCallback("", false));
            return;
        }

        if (filePath.isEmpty())
        {
            DBG("saveEditedSample: No file path provided");
            evaluateJavaScript(buildCallback("", false));
            return;
        }

        // Decode base64 WAV data
        juce::MemoryOutputStream wavStream;
        if (!juce::Base64::convertFromBase64(wavStream, wavDataBase64))
        {
            DBG("saveEditedSample: Failed to decode base64 data");
            evaluateJavaScript(buildCallback("", false));
            return;
        }
        const juce::MemoryBlock& wavData = wavStream.getMemoryBlock();

        // Use the provided file path directly - overwrite the existing file
        juce::File destFile(filePath);

        // Write WAV data to file (overwriting existing)
        if (destFile.replaceWithData(wavData.getData(), wavData.getSize()))
        {
            DBG("saveEditedSample: Saved to " + destFile.getFullPathName());

            // Force the sample player to reload the file from disk
            samplePlayerManager.reloadSampleFile(trackIndex, destFile.getFullPathName());

            evaluateJavaScript(buildCallback(destFile.getFullPathName(), true));
        }
        else
        {
            DBG("saveEditedSample: Failed to write file");
            evaluateJavaScript(buildCallback("", false));
        }
    }
    // Live Mode - Quantized sample playback
    else if (command == "queueSampleFile")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String filePath = payload.getProperty("filePath", "").toString();
        double offset = payload.getProperty("offset", 0.0);

        DBG("queueSampleFile: track=" + juce::String(trackIndex) + " file=" + filePath);

        midiBridge.queueSampleFile(trackIndex, filePath, offset);
    }
    else if (command == "queueStopSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        DBG("queueStopSample: track=" + juce::String(trackIndex));

        midiBridge.queueStopSample(trackIndex);
    }
    else if (command == "triggerSampleScene")
    {
        int sceneIndex = payload.getProperty("sceneIndex", 0);
        juce::var clips = payload.getProperty("clips", juce::var());

        DBG("triggerSampleScene: scene=" + juce::String(sceneIndex));

        midiBridge.triggerSampleScene(sceneIndex, clips);
    }
    else if (command == "setQuantizeSteps")
    {
        int steps = payload.getProperty("steps", 16);
        DBG("setQuantizeSteps: " + juce::String(steps));

        midiBridge.setQuantizeSteps(steps);
    }
    else if (command == "stopAllSamples")
    {
        DBG("stopAllSamples");
        midiBridge.stopAllSamples();
    }
    else if (command == "preloadSamplesForLiveMode")
    {
        // Preload samples into memory cache for instant Live Mode playback
        auto samplePathsVar = payload.getProperty("samplePaths", juce::var());

        if (samplePathsVar.isArray())
        {
            juce::StringArray samplePaths;
            for (int i = 0; i < samplePathsVar.size(); ++i)
            {
                juce::String path = samplePathsVar[i].toString();
                if (path.isNotEmpty())
                {
                    samplePaths.add(path);
                }
            }

            DBG("preloadSamplesForLiveMode: " + juce::String(samplePaths.size()) + " samples");

            // Ensure sample players are set up
            if (samplePlayerNodes.empty())
            {
                setupSamplePlayersForTracks(8);
            }

            if (auto* manager = midiBridge.getSamplePlayerManager())
            {
                // Reset all players first to clear stale file paths and sources
                manager->resetAllPlayersForLiveMode();

                // Then preload samples into cache
                manager->preloadSamplesForLiveMode(samplePaths);
            }

            // Notify JavaScript that preloading is complete
            evaluateJavaScript("if (typeof SongScreen !== 'undefined' && SongScreen.onSamplesPreloaded) { SongScreen.onSamplesPreloaded(); }");
        }
    }
    else if (command == "clearSampleCache")
    {
        // Clear sample cache (when exiting Live Mode or to free memory)
        DBG("clearSampleCache");
        if (auto* manager = midiBridge.getSamplePlayerManager())
        {
            manager->clearSampleCache();
        }
    }
    else if (command == "syncProjectState")
    {
        // Receive initial project state from sequencer
        double tempo = payload.getProperty("tempo", 120.0);
        midiBridge.setTempo(tempo);
        DBG("Synced project state: tempo = " + juce::String(tempo));

        // Process mixer states
        juce::var mixerStates = payload.getProperty("mixerStates", juce::var());
        if (mixerStates.isArray())
        {
            for (int t = 0; t < mixerStates.size(); ++t)
            {
                juce::var state = mixerStates[t];
                if (state.isObject())
                {
                    trackMixerStates[t].volume = static_cast<float>(state.getProperty("volume", 0.8));
                    trackMixerStates[t].pan = static_cast<float>(state.getProperty("pan", 0.0));
                    trackMixerStates[t].mute = static_cast<bool>(state.getProperty("mute", false));
                    trackMixerStates[t].solo = static_cast<bool>(state.getProperty("solo", false));

                    applyMixerStateToTrack(t);
                }
            }
            updateSoloStates();
            DBG("Synced mixer states for " + juce::String(mixerStates.size()) + " tracks");
        }
    }
    else if (command == "setTrackMixerState")
    {
        // Update mixer state for a single track (real-time changes)
        int trackIndex = payload.getProperty("trackIndex", 0);
        trackMixerStates[trackIndex].volume = static_cast<float>(payload.getProperty("volume", 0.8));
        trackMixerStates[trackIndex].pan = static_cast<float>(payload.getProperty("pan", 0.0));
        trackMixerStates[trackIndex].mute = static_cast<bool>(payload.getProperty("mute", false));
        trackMixerStates[trackIndex].solo = static_cast<bool>(payload.getProperty("solo", false));

        applyMixerStateToTrack(trackIndex);
        updateSoloStates();

        DBG("setTrackMixerState: track=" + juce::String(trackIndex) +
            " vol=" + juce::String(trackMixerStates[trackIndex].volume) +
            " pan=" + juce::String(trackMixerStates[trackIndex].pan) +
            " mute=" + juce::String(trackMixerStates[trackIndex].mute ? 1 : 0) +
            " solo=" + juce::String(trackMixerStates[trackIndex].solo ? 1 : 0));
    }
    else if (command == "debugLog")
    {
        // Forward JavaScript console messages to JUCE debug output
        auto logMessage = payload.getProperty("message", juce::var()).toString();
        DBG("[JS] " + logMessage);
    }
    else if (command == "setTrackFxChain")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::var plugins = payload.getProperty("plugins", juce::var());

        DBG("setTrackFxChain: track=" + juce::String(trackIndex) +
            " plugins count=" + juce::String(plugins.isArray() ? plugins.size() : 0));

        if (plugins.isArray())
        {
            setupTrackFxChain(trackIndex, plugins);
        }
    }
    else if (command == "setTrackInstrument")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String pluginId = payload.getProperty("pluginId", "").toString();

        DBG("setTrackInstrument: track=" + juce::String(trackIndex) +
            " pluginId=" + pluginId);

        setupTrackInstrument(trackIndex, pluginId);
    }
    else if (command == "setSamplerInstrument")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String instrumentName = payload.getProperty("instrumentName", "").toString();

        DBG("setSamplerInstrument: track=" + juce::String(trackIndex) +
            " instrumentName=" + instrumentName);

        // Use user-configured soundfont path from settings, fall back to hardcoded default
        juce::String soundFontSetting;
        if (auto* props = getAppProperties().getUserSettings())
            soundFontSetting = props->getValue("soundFontPath", "");
        juce::File baseDir(soundFontSetting.isNotEmpty() ? soundFontSetting : LOCAL_SOUND_FONTS_PATH);
        bool loadTriggered = samplerInstrumentManager.setTrackInstrument(trackIndex, instrumentName, baseDir);

        // Only track and notify if loading was actually triggered (not already loaded)
        if (loadTriggered)
        {
            pendingSamplerLoads.insert(trackIndex);
            if (webBrowser) webBrowser->emitEventIfBrowserIsVisible("juceBridgeEvents", "{"
                "\"type\": \"samplerLoadState\", "
                "\"trackIndex\": " + juce::String(trackIndex) + ", "
                "\"loading\": true}");
        }
    }
    else if (command == "showPluginUI")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("showPluginUI: track=" + juce::String(trackIndex));

        // Find the instrument node for this track
        auto instrNodeIt = trackInstrumentNodes.find(trackIndex);
        if (instrNodeIt != trackInstrumentNodes.end())
        {
            auto nodeId = instrNodeIt->second;
            if (auto* node = pluginGraph.graph.getNodeForId(nodeId))
            {
                // Open the plugin editor window
                if (auto* w = pluginGraph.getOrCreateWindowFor(node, PluginWindow::Type::normal))
                {
                    w->toFront(true);
                    DBG("showPluginUI: Opened plugin window for track " + juce::String(trackIndex));
                }
            }
            else
            {
                DBG("showPluginUI: Node not found for track " + juce::String(trackIndex));
            }
        }
        else
        {
            DBG("showPluginUI: No instrument assigned to track " + juce::String(trackIndex));
        }
    }
    else if (command == "getPluginParameters")
    {
        // Request plugin parameters for a track (for automation UI)
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("getPluginParameters: track=" + juce::String(trackIndex));

        auto instrNodeIt = trackInstrumentNodes.find(trackIndex);
        if (instrNodeIt != trackInstrumentNodes.end())
        {
            auto nodeId = instrNodeIt->second;
            if (auto* node = pluginGraph.graph.getNodeForId(nodeId))
            {
                sendPluginParametersToJS(trackIndex, node);
            }
            else
            {
                DBG("getPluginParameters: Node not found for track " + juce::String(trackIndex));
            }
        }
        else
        {
            DBG("getPluginParameters: No instrument assigned to track " + juce::String(trackIndex));
        }
    }
    else if (command == "getGraphState")
    {
        // Serialize the entire plugin graph to XML and send to JavaScript
        DBG("getGraphState: Serializing plugin graph...");

        auto xml = pluginGraph.createXml();
        if (xml != nullptr)
        {
            juce::String xmlString = xml->toString();

            // Build track instrument node mappings as JSON object string
            juce::String instrumentMappingsJson = "{";
            bool first = true;
            for (const auto& pair : trackInstrumentNodes)
            {
                if (!first) instrumentMappingsJson += ", ";
                instrumentMappingsJson += "\"" + juce::String(pair.first) + "\": " + juce::String((int)pair.second.uid);
                first = false;
            }
            instrumentMappingsJson += "}";

            // Escape the XML string for JSON (replace quotes and backslashes, handle newlines)
            juce::String escapedXml = xmlString
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");

            // Send back to JavaScript via event
            juce::String jsonResponse = "{"
                "\"type\": \"graphStateResponse\", "
                "\"graphXml\": \"" + escapedXml + "\", "
                "\"trackInstrumentNodes\": " + instrumentMappingsJson +
                "}";

            DBG("getGraphState: Sending graph state (" + juce::String(xmlString.length()) + " chars)");

            // Defer the event emission to avoid deadlock when called from native function callback
            auto* browser = webBrowser.get();
            if (browser != nullptr)
            {
                juce::MessageManager::callAsync([browser, jsonResponse]()
                {
                    if (browser != nullptr)
                        browser->emitEventIfBrowserIsVisible("juceBridgeEvents", jsonResponse);
                });
            }
        }
        else
        {
            DBG("getGraphState: Failed to create XML");
        }
    }
    else if (command == "setGraphState")
    {
        // Restore plugin states from saved graph data
        // NOTE: We don't use full restoreFromXml as it clears the graph including infrastructure nodes
        juce::String xmlString = payload.getProperty("graphXml", "").toString();
        bool fullRestore = payload.getProperty("fullRestore", false);

        DBG("setGraphState: Processing graph state (" + juce::String(xmlString.length()) + " chars)");

        if (xmlString.isNotEmpty())
        {
            auto xml = juce::XmlDocument::parse(xmlString);
            if (xml != nullptr)
            {
                if (fullRestore)
                {
                    // Full restore - clears everything and restores from XML
                    // WARNING: This removes infrastructure nodes (sample players, mixers, etc.)
                    DBG("setGraphState: Performing FULL graph restore");
                    trackInstrumentNodes.clear();
                    pluginGraph.restoreFromXml(*xml);
                }
                else
                {
                    // Selective restore - only restore plugin states for existing nodes
                    // This preserves infrastructure while updating plugin parameters
                    DBG("setGraphState: Performing selective state restore");

                    // Build a map of saved node states by UID
                    std::map<juce::uint32, const juce::XmlElement*> savedNodes;
                    for (auto* filterXml : xml->getChildWithTagNameIterator("FILTER"))
                    {
                        juce::uint32 uid = (juce::uint32)filterXml->getIntAttribute("uid");
                        savedNodes[uid] = filterXml;
                    }

                    // Update state for existing nodes that match saved UIDs
                    for (auto* node : pluginGraph.graph.getNodes())
                    {
                        auto it = savedNodes.find(node->nodeID.uid);
                        if (it != savedNodes.end())
                        {
                            const auto* filterXml = it->second;
                            if (auto* stateXml = filterXml->getChildByName("STATE"))
                            {
                                juce::MemoryBlock m;
                                m.fromBase64Encoding(stateXml->getAllSubText());
                                node->getProcessor()->setStateInformation(m.getData(), (int)m.getSize());
                                DBG("setGraphState: Restored state for node " + juce::String(node->nodeID.uid));
                            }
                        }
                    }
                }

                // Restore track instrument node mappings if provided
                auto mappings = payload.getProperty("trackInstrumentNodes", juce::var());
                if (mappings.isObject())
                {
                    if (auto* obj = mappings.getDynamicObject())
                    {
                        for (const auto& prop : obj->getProperties())
                        {
                            int trackIndex = prop.name.toString().getIntValue();
                            int nodeUid = (int)prop.value;
                            trackInstrumentNodes[trackIndex] = juce::AudioProcessorGraph::NodeID((juce::uint32)nodeUid);
                            DBG("setGraphState: Restored instrument node mapping track " +
                                juce::String(trackIndex) + " -> node " + juce::String(nodeUid));
                        }
                    }
                }

                // Re-wire instrument processors to MidiTrackOutput instances
                // so VST parameter automation works after loading a project
                for (const auto& pair : trackInstrumentNodes)
                {
                    int trackIndex = pair.first;
                    auto nodeId = pair.second;

                    if (auto* node = pluginGraph.graph.getNodeForId(nodeId))
                    {
                        if (auto* trackOutput = midiTrackOutputManager.getOutputForTrack(trackIndex))
                        {
                            trackOutput->setInstrumentProcessor(node->getProcessor());
                            DBG("setGraphState: Wired instrument processor for VST automation on track " + juce::String(trackIndex));
                        }
                    }
                }

                DBG("setGraphState: Graph state processing completed");
            }
            else
            {
                DBG("setGraphState: Failed to parse XML");
            }
        }
        else
        {
            DBG("setGraphState: Empty XML string");
        }
    }
    //==============================================================================
    // Sample Editing Commands (C++ DSP operations)

    else if (command == "cppLoadForEditing")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String filePath = payload.getProperty("filePath", "").toString();

        DBG("cppLoadForEditing: track=" + juce::String(trackIndex) + " file=" + filePath);

        bool success = sampleEditorBridge.loadForEditing(trackIndex, filePath);

        // Send result back to JS
        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", " +
                          juce::String(success ? "true" : "false") + "); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppTimeStretch")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double ratio = payload.getProperty("ratio", 1.0);
        double targetLengthSeconds = payload.getProperty("targetLengthSeconds", 0.0);

        DBG("cppTimeStretch: track=" + juce::String(trackIndex) +
            " ratio=" + juce::String(ratio) +
            " targetLength=" + juce::String(targetLengthSeconds) + "s");

        sampleEditorBridge.timeStretch(trackIndex, ratio, targetLengthSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppApplyWarp")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double sampleBPM = payload.getProperty("sampleBPM", 0.0);
        double targetBPM = payload.getProperty("targetBPM", 120.0);
        double targetLengthSeconds = payload.getProperty("targetLengthSeconds", 0.0);

        DBG("cppApplyWarp: track=" + juce::String(trackIndex) +
            " sampleBPM=" + juce::String(sampleBPM) +
            " targetBPM=" + juce::String(targetBPM) +
            " targetLength=" + juce::String(targetLengthSeconds) + "s");

        sampleEditorBridge.applyWarp(trackIndex, sampleBPM, targetBPM, targetLengthSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppDetectBPM")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppDetectBPM: track=" + juce::String(trackIndex));

        double detectedBPM = sampleEditorBridge.detectBPM(trackIndex);

        juce::String js = "if (typeof handleCppBPMResult === 'function') { handleCppBPMResult(" +
                          juce::String(trackIndex) + ", " + juce::String(detectedBPM, 1) + "); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppGetTransients")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppGetTransients: track=" + juce::String(trackIndex));

        std::vector<double> transients = sampleEditorBridge.getTransients(trackIndex);

        // Build JSON array of transient positions
        juce::String transientArray = "[";
        for (size_t i = 0; i < transients.size(); ++i)
        {
            if (i > 0) transientArray += ",";
            transientArray += juce::String(transients[i], 6);
        }
        transientArray += "]";

        juce::String js = "if (typeof handleCppTransientsResult === 'function') { handleCppTransientsResult(" +
                          juce::String(trackIndex) + ", " + transientArray + "); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppDetectTransients")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppDetectTransients: track=" + juce::String(trackIndex));

        std::vector<double> transients = sampleEditorBridge.detectTransients(trackIndex);

        // Build JSON array of transient positions
        juce::String transientArray = "[";
        for (size_t i = 0; i < transients.size(); ++i)
        {
            if (i > 0) transientArray += ",";
            transientArray += juce::String(transients[i], 6);
        }
        transientArray += "]";

        juce::String js = "if (typeof handleCppTransientsResult === 'function') { handleCppTransientsResult(" +
                          juce::String(trackIndex) + ", " + transientArray + "); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppGetWaveform")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        int numPoints = payload.getProperty("numPoints", 800);

        DBG("cppGetWaveform: track=" + juce::String(trackIndex) + " points=" + juce::String(numPoints));

        auto peaks = sampleEditorBridge.getWaveformPeaks(trackIndex, numPoints);
        double duration = sampleEditorBridge.getDuration(trackIndex);
        auto transients = sampleEditorBridge.getTransients(trackIndex);

        // Build JSON array of peaks: [[min, max], [min, max], ...]
        juce::String peaksArray = "[";
        for (size_t i = 0; i < peaks.size(); ++i)
        {
            if (i > 0) peaksArray += ",";
            peaksArray += "[" + juce::String(peaks[i].first, 4) + "," + juce::String(peaks[i].second, 4) + "]";
        }
        peaksArray += "]";

        // Build transients array
        juce::String transientArray = "[";
        for (size_t i = 0; i < transients.size(); ++i)
        {
            if (i > 0) transientArray += ",";
            transientArray += juce::String(transients[i], 6);
        }
        transientArray += "]";

        juce::String js = "if (typeof handleCppWaveformResult === 'function') { handleCppWaveformResult(" +
                          juce::String(trackIndex) + ", " + peaksArray + ", " +
                          juce::String(duration, 6) + ", " + transientArray + "); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppOffsetSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double deltaSeconds = payload.getProperty("deltaSeconds", 0.0);

        DBG("cppOffsetSample: track=" + juce::String(trackIndex) +
            " delta=" + juce::String(deltaSeconds));

        sampleEditorBridge.offsetSample(trackIndex, deltaSeconds);
    }
    else if (command == "cppSetPlaybackOffset")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double offsetSeconds = payload.getProperty("offsetSeconds", 0.0);

        DBG("cppSetPlaybackOffset: track=" + juce::String(trackIndex) +
            " offset=" + juce::String(offsetSeconds));

        sampleEditorBridge.setPlaybackOffset(trackIndex, offsetSeconds);
    }
    else if (command == "cppFadeIn")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppFadeIn: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.fadeIn(trackIndex, startSeconds, endSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppFadeOut")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppFadeOut: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.fadeOut(trackIndex, startSeconds, endSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppSilence")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppSilence: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.silence(trackIndex, startSeconds, endSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppTrim")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppTrim: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.trim(trackIndex, startSeconds, endSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppCopy")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppCopy: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.copyRange(trackIndex, startSeconds, endSeconds);

        // Copy doesn't modify the waveform, so no need to request waveform update
        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppCut")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double startSeconds = payload.getProperty("startSeconds", 0.0);
        double endSeconds = payload.getProperty("endSeconds", 0.0);

        DBG("cppCut: track=" + juce::String(trackIndex) +
            " range=" + juce::String(startSeconds) + "-" + juce::String(endSeconds));

        sampleEditorBridge.cutRange(trackIndex, startSeconds, endSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppPaste")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        double positionSeconds = payload.getProperty("positionSeconds", 0.0);

        DBG("cppPaste: track=" + juce::String(trackIndex) +
            " position=" + juce::String(positionSeconds));

        sampleEditorBridge.paste(trackIndex, positionSeconds);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppReset")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppReset: track=" + juce::String(trackIndex));

        sampleEditorBridge.reset(trackIndex);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppUndo")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppUndo: track=" + juce::String(trackIndex));

        sampleEditorBridge.undo(trackIndex);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppRedo")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);

        DBG("cppRedo: track=" + juce::String(trackIndex));

        sampleEditorBridge.redo(trackIndex);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", true); }";
        evaluateJavaScript(js);
    }
    else if (command == "cppSaveEditedSample")
    {
        int trackIndex = payload.getProperty("trackIndex", 0);
        juce::String filePath = payload.getProperty("filePath", "").toString();

        DBG("cppSaveEditedSample: track=" + juce::String(trackIndex) + " file=" + filePath);

        bool success = sampleEditorBridge.saveToFile(trackIndex, filePath);

        juce::String js = "if (typeof handleCppEditResult === 'function') { handleCppEditResult('" +
                          command + "', " + juce::String(trackIndex) + ", " +
                          juce::String(success ? "true" : "false") + "); }";
        evaluateJavaScript(js);
    }
    else
    {
        DBG("Unhandled AudioBridge command: " + command);
    }

}

void SequencerComponent::setupSamplePlayersForTracks(int numTracks)
{
    DBG("Setting up sample players for " + juce::String(numTracks) + " tracks");
    DBG("Graph sample rate: " + juce::String(pluginGraph.graph.getSampleRate()));
    DBG("Graph block size: " + juce::String(pluginGraph.graph.getBlockSize()));

    // Find the audio output node first
    juce::AudioProcessorGraph::NodeID outputNodeId;
    bool foundOutputNode = false;
    for (auto* graphNode : pluginGraph.graph.getNodes())
    {
        if (auto* ioProc = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(graphNode->getProcessor()))
        {
            if (ioProc->getType() == juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
            {
                outputNodeId = graphNode->nodeID;
                foundOutputNode = true;
                DBG("Found audio output node with ID: " + juce::String((int)outputNodeId.uid));
                break;
            }
        }
    }

    if (!foundOutputNode)
    {
        DBG("Audio output node not found yet. Graph has " + juce::String(pluginGraph.graph.getNumNodes()) + " nodes");

        // Schedule a retry - the graph might still be initializing
        if (samplePlayerSetupRetryCount < 10)  // Max 10 retries
        {
            samplePlayerSetupRetryCount++;
            DBG("Scheduling retry " + juce::String(samplePlayerSetupRetryCount) + " for sample player setup...");
            juce::MessageManager::callAsync([this, numTracks]() {
                setupSamplePlayersForTracks(numTracks);
            });
        }
        else
        {
            DBG("ERROR: Audio output node not found after 10 retries! Sample players cannot be connected.");
            samplePlayerSetupRetryCount = 0;  // Reset for potential future attempts
        }
        return;
    }

    // Reset retry counter on success
    samplePlayerSetupRetryCount = 0;

    for (int track = 0; track < numTracks; ++track)
    {
        DBG("Creating player for track " + juce::String(track));

        // Create a sample player plugin for this track
        auto* player = samplePlayerManager.createPlayerForTrack(track);

        DBG("createPlayerForTrack returned: " + juce::String((juce::int64)player));

        if (player != nullptr)
        {
            // Add the player to the audio graph
            // The graph takes ownership via unique_ptr
            DBG("Adding player to graph...");
            auto node = pluginGraph.graph.addNode(
                std::unique_ptr<juce::AudioProcessor>(player));

            if (node != nullptr)
            {
                // Store the node ID for later reference (connecting to mixer, etc.)
                samplePlayerNodes[track] = node->nodeID;

                // Set node position in the graph UI (avoid overlap)
                // Sample players in column 1, each track on a different row
                double xPos = 0.08;  // Left side
                double yPos = 0.15 + (track * 0.10);  // Staggered vertically with more spacing
                pluginGraph.setNodePosition(node->nodeID, { xPos, yPos });

                // Verify the processor pointer is still the same
                auto* nodeProcessor = node->getProcessor();
                DBG("Node processor: " + juce::String((juce::int64)nodeProcessor) +
                    ", original player: " + juce::String((juce::int64)player));

                if (nodeProcessor != player)
                {
                    DBG("WARNING: Node processor differs from original player! Updating manager...");
                    // The graph might have wrapped our processor - update the manager
                    // This shouldn't happen normally, but let's be safe
                }

                DBG("Created SamplePlayerPlugin for track " + juce::String(track) +
                    " with node ID " + juce::String((int)node->nodeID.uid));

                // Set initial sample rate and buffer size from the graph
                double sampleRate = pluginGraph.graph.getSampleRate();
                int blockSize = pluginGraph.graph.getBlockSize();

                if (sampleRate > 0 && blockSize > 0)
                {
                    DBG("Preparing player with sampleRate=" + juce::String(sampleRate) +
                        ", blockSize=" + juce::String(blockSize));
                    player->setRateAndBufferSizeDetails(sampleRate, blockSize);
                    player->prepareToPlay(sampleRate, blockSize);
                }
                else
                {
                    DBG("Graph not yet prepared (sampleRate=" + juce::String(sampleRate) +
                        ", blockSize=" + juce::String(blockSize) + ")");
                }

                // Create a TrackMixerPlugin for this track
                auto* mixerPlugin = new TrackMixerPlugin();
                mixerPlugin->setTrackIndex(track);

                auto mixerNode = pluginGraph.graph.addNode(
                    std::unique_ptr<juce::AudioProcessor>(mixerPlugin));

                if (mixerNode != nullptr)
                {
                    trackMixerNodes[track] = mixerNode->nodeID;
                    trackMixerPlugins[track] = mixerPlugin;

                    // Set mixer node position (to the right of sample player)
                    double mixerXPos = 0.22;  // Second column
                    double mixerYPos = 0.15 + (track * 0.10);  // Same row as sample player
                    pluginGraph.setNodePosition(mixerNode->nodeID, { mixerXPos, mixerYPos });

                    // Prepare the mixer plugin
                    if (sampleRate > 0 && blockSize > 0)
                    {
                        mixerPlugin->setRateAndBufferSizeDetails(sampleRate, blockSize);
                        mixerPlugin->prepareToPlay(sampleRate, blockSize);
                    }

                    // Apply initial mixer state if available
                    if (trackMixerStates.count(track) > 0)
                    {
                        const auto& state = trackMixerStates[track];
                        mixerPlugin->setVolume(state.volume);
                        mixerPlugin->setPan(state.pan);
                        mixerPlugin->setMuted(state.mute);
                        mixerPlugin->setSolo(state.solo);
                    }

                    DBG("Created TrackMixerPlugin for track " + juce::String(track) +
                        " with node ID " + juce::String((int)mixerNode->nodeID.uid));

                    // Connect: SamplePlayer -> Mixer -> Audio Output
                    // SamplePlayer -> Mixer
                    bool conn1 = pluginGraph.graph.addConnection({
                        { node->nodeID, 0 },  // Left channel
                        { mixerNode->nodeID, 0 }
                    });
                    bool conn2 = pluginGraph.graph.addConnection({
                        { node->nodeID, 1 },  // Right channel
                        { mixerNode->nodeID, 1 }
                    });

                    // Mixer -> Audio Output
                    bool conn3 = pluginGraph.graph.addConnection({
                        { mixerNode->nodeID, 0 },
                        { outputNodeId, 0 }
                    });
                    bool conn4 = pluginGraph.graph.addConnection({
                        { mixerNode->nodeID, 1 },
                        { outputNodeId, 1 }
                    });

                    DBG("Track " + juce::String(track) + " connections: Player->Mixer L:" +
                        juce::String(conn1 ? "OK" : "FAIL") + " R:" + juce::String(conn2 ? "OK" : "FAIL") +
                        " Mixer->Output L:" + juce::String(conn3 ? "OK" : "FAIL") + " R:" + juce::String(conn4 ? "OK" : "FAIL"));

                    if (!conn1 || !conn2 || !conn3 || !conn4)
                    {
                        DBG("WARNING: Some connections failed for track " + juce::String(track) + "!");
                    }
                }
                else
                {
                    // Mixer creation failed, fall back to direct connection
                    DBG("Failed to create mixer for track " + juce::String(track) + ", connecting directly");

                    pluginGraph.graph.addConnection({
                        { node->nodeID, 0 },
                        { outputNodeId, 0 }
                    });
                    pluginGraph.graph.addConnection({
                        { node->nodeID, 1 },
                        { outputNodeId, 1 }
                    });
                }
            }
            else
            {
                // Node creation failed - the unique_ptr deleted the player already!
                // We need to unregister from manager as the pointer is now dangling
                DBG("addNode returned nullptr - player was deleted by unique_ptr!");
                samplePlayerManager.unregisterPlayerForTrack(track);
                DBG("Failed to add SamplePlayerPlugin to graph for track " + juce::String(track));
            }
        }
    }

    DBG("Finished setting up sample players. Manager has " +
        juce::String(samplePlayerManager.getNumPlayers()) + " players registered.");

    // Verify connections were made
    debugPrintGraphConnections();
}

void SequencerComponent::ensureSamplePlayerConnections()
{
    DBG("ensureSamplePlayerConnections: Verifying and establishing connections...");

    // Find the audio output node
    juce::AudioProcessorGraph::NodeID outputNodeId;
    bool foundOutputNode = false;
    for (auto* node : pluginGraph.graph.getNodes())
    {
        if (auto* ioProc = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(node->getProcessor()))
        {
            if (ioProc->getType() == juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
            {
                outputNodeId = node->nodeID;
                foundOutputNode = true;
                break;
            }
        }
    }

    if (!foundOutputNode)
    {
        DBG("ensureSamplePlayerConnections: Audio output node not found!");
        return;
    }

    // For each sample player, ensure it's connected to its mixer, and mixer to output
    for (const auto& [trackIndex, sampleNodeId] : samplePlayerNodes)
    {
        auto mixerIt = trackMixerNodes.find(trackIndex);
        if (mixerIt == trackMixerNodes.end())
        {
            DBG("Track " + juce::String(trackIndex) + ": No mixer node found!");
            continue;
        }

        auto mixerNodeId = mixerIt->second;

        // Check if SamplePlayer -> Mixer connections exist
        bool hasPlayerToMixerL = false;
        bool hasPlayerToMixerR = false;
        bool hasMixerToOutputL = false;
        bool hasMixerToOutputR = false;

        for (const auto& conn : pluginGraph.graph.getConnections())
        {
            if (conn.source.nodeID == sampleNodeId && conn.destination.nodeID == mixerNodeId)
            {
                if (conn.source.channelIndex == 0 && conn.destination.channelIndex == 0)
                    hasPlayerToMixerL = true;
                if (conn.source.channelIndex == 1 && conn.destination.channelIndex == 1)
                    hasPlayerToMixerR = true;
            }
            if (conn.source.nodeID == mixerNodeId && conn.destination.nodeID == outputNodeId)
            {
                if (conn.source.channelIndex == 0 && conn.destination.channelIndex == 0)
                    hasMixerToOutputL = true;
                if (conn.source.channelIndex == 1 && conn.destination.channelIndex == 1)
                    hasMixerToOutputR = true;
            }
        }

        // Add missing connections
        if (!hasPlayerToMixerL)
        {
            DBG("Track " + juce::String(trackIndex) + ": Adding missing Player->Mixer L connection");
            pluginGraph.graph.addConnection({{ sampleNodeId, 0 }, { mixerNodeId, 0 }});
        }
        if (!hasPlayerToMixerR)
        {
            DBG("Track " + juce::String(trackIndex) + ": Adding missing Player->Mixer R connection");
            pluginGraph.graph.addConnection({{ sampleNodeId, 1 }, { mixerNodeId, 1 }});
        }
        if (!hasMixerToOutputL)
        {
            DBG("Track " + juce::String(trackIndex) + ": Adding missing Mixer->Output L connection");
            pluginGraph.graph.addConnection({{ mixerNodeId, 0 }, { outputNodeId, 0 }});
        }
        if (!hasMixerToOutputR)
        {
            DBG("Track " + juce::String(trackIndex) + ": Adding missing Mixer->Output R connection");
            pluginGraph.graph.addConnection({{ mixerNodeId, 1 }, { outputNodeId, 1 }});
        }

        if (hasPlayerToMixerL && hasPlayerToMixerR && hasMixerToOutputL && hasMixerToOutputR)
        {
            DBG("Track " + juce::String(trackIndex) + ": All connections OK");
        }
    }
}

void SequencerComponent::debugPrintGraphConnections()
{
    DBG("=== GRAPH CONNECTIONS ===");
    DBG("Total nodes: " + juce::String(pluginGraph.graph.getNumNodes()));

    // Print all nodes
    for (auto* node : pluginGraph.graph.getNodes())
    {
        juce::String nodeName = "Unknown";
        if (auto* proc = node->getProcessor())
            nodeName = proc->getName();
        DBG("  Node " + juce::String((int)node->nodeID.uid) + ": " + nodeName);
    }

    // Print all connections
    DBG("Total connections: " + juce::String(pluginGraph.graph.getConnections().size()));
    for (const auto& conn : pluginGraph.graph.getConnections())
    {
        juce::ignoreUnused(conn);
        DBG("  " + juce::String((int)conn.source.nodeID.uid) + ":" + juce::String(conn.source.channelIndex) +
            " -> " + juce::String((int)conn.destination.nodeID.uid) + ":" + juce::String(conn.destination.channelIndex));
    }
    DBG("=========================");
}

void SequencerComponent::setupTrackFxChain(int trackIndex, const juce::var& plugins)
{
    DBG("setupTrackFxChain: Setting up FX chain for track " + juce::String(trackIndex));

    // Get the sample player node for this track
    auto sampleNodeIt = samplePlayerNodes.find(trackIndex);
    if (sampleNodeIt == samplePlayerNodes.end())
    {
        DBG("setupTrackFxChain: No sample player found for track " + juce::String(trackIndex));
        return;
    }

    auto sampleNodeId = sampleNodeIt->second;

    // Find the audio output node
    juce::AudioProcessorGraph::NodeID outputNodeId;
    bool foundOutputNode = false;
    for (auto* node : pluginGraph.graph.getNodes())
    {
        if (auto* ioProc = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(node->getProcessor()))
        {
            if (ioProc->getType() == juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
            {
                outputNodeId = node->nodeID;
                foundOutputNode = true;
                break;
            }
        }
    }

    if (!foundOutputNode)
    {
        DBG("setupTrackFxChain: Audio output node not found!");
        return;
    }

    // Remove existing connections from sample player to output
    // (There might be direct connections or connections through effects)
    auto connections = pluginGraph.graph.getConnections();
    for (const auto& conn : connections)
    {
        if (conn.source.nodeID == sampleNodeId)
        {
            pluginGraph.graph.removeConnection(conn);
        }
    }

    // TODO: Remove old effect nodes that were added for this track
    // For now, we'll just add new effects and connect them

    // If no plugins, connect sample player directly to output
    if (!plugins.isArray() || plugins.size() == 0)
    {
        DBG("setupTrackFxChain: No effects, connecting directly to output");
        pluginGraph.graph.addConnection({{ sampleNodeId, 0 }, { outputNodeId, 0 }});
        pluginGraph.graph.addConnection({{ sampleNodeId, 1 }, { outputNodeId, 1 }});
        return;
    }

    // Create and connect effects in chain
    std::vector<juce::AudioProcessorGraph::NodeID> fxNodeIds;
    auto& knownPlugins = graphDocument.getPluginList();

    for (int i = 0; i < plugins.size(); ++i)
    {
        auto pluginVar = plugins[i];
        juce::String pluginName = pluginVar.getProperty("name", "").toString();
        juce::String fileOrIdentifier = pluginVar.getProperty("fileOrIdentifier", pluginName).toString();

        DBG("setupTrackFxChain: Adding effect " + juce::String(i + 1) + ": " + pluginName);

        // Find plugin description
        juce::PluginDescription desc;
        bool found = false;

        // Check internal plugins first
        if (pluginName == "Reverb" || fileOrIdentifier == "Reverb")
        {
            desc.name = "Reverb";
            desc.pluginFormatName = "Internal";
            desc.fileOrIdentifier = "Reverb";
            found = true;
        }
        else
        {
            // Look in known plugins
            for (const auto& knownDesc : knownPlugins.getTypes())
            {
                if (knownDesc.name == pluginName || knownDesc.fileOrIdentifier == fileOrIdentifier)
                {
                    desc = knownDesc;
                    found = true;
                    break;
                }
            }
        }

        if (!found)
        {
            DBG("setupTrackFxChain: Plugin not found: " + pluginName);
            continue;
        }

        // Create and add the plugin to the graph
        // Use async creation for external plugins, sync for internal
        if (desc.pluginFormatName == "Internal")
        {
            // For internal plugins, we can create synchronously
            juce::AudioProcessorGraph::Node::Ptr node = pluginGraph.getNodeForName(desc.name);
            if (node)
            {
                fxNodeIds.push_back(node->nodeID);
            }
            else
            {
                // Need to add the internal plugin
                pluginGraph.addPlugin(PluginDescriptionAndPreference(desc),
                                      juce::Point<double>(0.5, 0.3 + i * 0.1));
                // Note: This is async, so we can't get the node ID immediately
                // For a proper implementation, we'd need a callback mechanism
                DBG("setupTrackFxChain: Added internal plugin (async) - " + desc.name);
            }
        }
        else
        {
            // External plugins - add async
            pluginGraph.addPlugin(PluginDescriptionAndPreference(desc),
                                  juce::Point<double>(0.5, 0.3 + i * 0.1));
            DBG("setupTrackFxChain: Added external plugin (async) - " + desc.name);
        }
    }

    // For now, just connect sample player directly to output
    // A full implementation would wait for plugins to be created and then connect them
    // This is a simplified version that demonstrates the concept

    if (fxNodeIds.empty())
    {
        // No immediate FX nodes available, connect directly
        pluginGraph.graph.addConnection({{ sampleNodeId, 0 }, { outputNodeId, 0 }});
        pluginGraph.graph.addConnection({{ sampleNodeId, 1 }, { outputNodeId, 1 }});
        DBG("setupTrackFxChain: Connected sample player directly (FX plugins added async)");
    }
    else
    {
        // Connect: SamplePlayer -> FX1 -> FX2 -> ... -> Output
        auto prevNodeId = sampleNodeId;

        for (size_t i = 0; i < fxNodeIds.size(); ++i)
        {
            pluginGraph.graph.addConnection({{ prevNodeId, 0 }, { fxNodeIds[i], 0 }});
            pluginGraph.graph.addConnection({{ prevNodeId, 1 }, { fxNodeIds[i], 1 }});
            prevNodeId = fxNodeIds[i];
        }

        // Connect last FX to output
        pluginGraph.graph.addConnection({{ prevNodeId, 0 }, { outputNodeId, 0 }});
        pluginGraph.graph.addConnection({{ prevNodeId, 1 }, { outputNodeId, 1 }});

        DBG("setupTrackFxChain: Connected chain with " + juce::String(fxNodeIds.size()) + " effects");
    }
}

void SequencerComponent::sendTimingUpdate(double position, bool isPlaying)
{
    // Send timing update as proper JSON (numbers and booleans, not strings)
    if (webBrowser) webBrowser->emitEventIfBrowserIsVisible("juceBridgeEvents", "{"
        "\"type\": \"timingUpdate\", "
        "\"position\": " + juce::String(position) + ", "
        "\"isPlaying\": " + (isPlaying ? "true" : "false") +
        "}");
}

void SequencerComponent::sendMeterUpdates()
{
    // Send level meter updates for all tracks with active mixer plugins
    for (const auto& [trackIndex, mixerPlugin] : trackMixerPlugins)
    {
        if (mixerPlugin != nullptr)
        {
            float levelL = mixerPlugin->getLevelL();
            float levelR = mixerPlugin->getLevelR();

            // Only send updates if there's meaningful audio level (optimization)
            if (levelL > 0.001f || levelR > 0.001f)
            {
                if (webBrowser) webBrowser->emitEventIfBrowserIsVisible("juceBridgeEvents", "{"
                    "\"type\": \"meterUpdate\", "
                    "\"trackIndex\": " + juce::String(trackIndex) + ", "
                    "\"levelL\": " + juce::String(levelL, 3) + ", "
                    "\"levelR\": " + juce::String(levelR, 3) +
                    "}");
            }
        }
    }
}

void SequencerComponent::setupMidiTrackOutputs(int numTracks)
{
    DBG("Setting up MIDI track outputs for " + juce::String(numTracks) + " tracks");

    for (int track = 0; track < numTracks; ++track)
    {
        DBG("Creating MIDI track output for track " + juce::String(track));

        // Create a MIDI track output plugin for this track
        auto* output = midiTrackOutputManager.createOutputForTrack(track);

        if (output != nullptr)
        {
            // Wire the clip scheduler so processBlock can render sample-accurate MIDI
            output->setClipScheduler(&midiBridge.getClipScheduler());

            // Add the output to the audio graph
            auto node = pluginGraph.graph.addNode(
                std::unique_ptr<juce::AudioProcessor>(output));

            if (node != nullptr)
            {
                midiTrackOutputNodes[track] = node->nodeID;

                // Set node position in the graph UI (avoid overlap)
                // MIDI track outputs in column 3, each track on a different row
                double xPos = 0.45;  // Right side of sample players
                double yPos = 0.15 + (track * 0.10);  // Staggered vertically
                pluginGraph.setNodePosition(node->nodeID, { xPos, yPos });

                DBG("Created MidiTrackOutput for track " + juce::String(track) +
                    " with node ID " + juce::String((int)node->nodeID.uid));

                // Set initial sample rate and buffer size from the graph
                double sampleRate = pluginGraph.graph.getSampleRate();
                int blockSize = pluginGraph.graph.getBlockSize();

                if (sampleRate > 0 && blockSize > 0)
                {
                    output->setRateAndBufferSizeDetails(sampleRate, blockSize);
                    output->prepareToPlay(sampleRate, blockSize);
                }
            }
            else
            {
                midiTrackOutputManager.unregisterOutputForTrack(track);
                DBG("Failed to add MidiTrackOutput to graph for track " + juce::String(track));
            }
        }
    }

    DBG("Finished setting up MIDI track outputs. Manager has " +
        juce::String(midiTrackOutputManager.getNumOutputs()) + " outputs registered.");
}

void SequencerComponent::setupSamplerInstrumentsForTracks(int numTracks)
{
    DBG("Setting up sampler instruments for " + juce::String(numTracks) + " tracks");

    // Find the audio output node
    juce::AudioProcessorGraph::NodeID outputNodeId;
    bool foundOutputNode = false;
    for (auto* node : pluginGraph.graph.getNodes())
    {
        if (auto* ioProc = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(node->getProcessor()))
        {
            if (ioProc->getType() == juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
            {
                outputNodeId = node->nodeID;
                foundOutputNode = true;
                break;
            }
        }
    }

    if (!foundOutputNode)
    {
        DBG("setupSamplerInstrumentsForTracks: Audio output node not found!");
        return;
    }

    for (int track = 0; track < numTracks; ++track)
    {
        // Need MIDI track output node to exist for this track
        auto midiNodeIt = midiTrackOutputNodes.find(track);
        if (midiNodeIt == midiTrackOutputNodes.end())
        {
            DBG("setupSamplerInstrumentsForTracks: No MIDI track output for track " + juce::String(track));
            continue;
        }

        auto midiNodeId = midiNodeIt->second;

        // Create sampler instrument plugin
        auto* samplerPlugin = samplerInstrumentManager.createInstrumentForTrack(track);
        if (samplerPlugin == nullptr)
            continue;

        // Add to graph
        auto samplerNode = pluginGraph.graph.addNode(
            std::unique_ptr<juce::AudioProcessor>(samplerPlugin));

        if (samplerNode == nullptr)
        {
            samplerInstrumentManager.unregisterInstrumentForTrack(track);
            DBG("setupSamplerInstrumentsForTracks: Failed to add sampler to graph for track " + juce::String(track));
            continue;
        }

        samplerInstrumentNodes[track] = samplerNode->nodeID;

        // Position in graph UI
        double xPos = 0.55;
        double yPos = 0.15 + (track * 0.10);
        pluginGraph.setNodePosition(samplerNode->nodeID, { xPos, yPos });

        // Set initial sample rate and buffer size
        double sampleRate = pluginGraph.graph.getSampleRate();
        int blockSize = pluginGraph.graph.getBlockSize();

        if (sampleRate > 0 && blockSize > 0)
        {
            samplerPlugin->setRateAndBufferSizeDetails(sampleRate, blockSize);
            samplerPlugin->prepareToPlay(sampleRate, blockSize);
        }

        // Connect MIDI: MidiTrackOutput -> SamplerInstrument (MIDI channel)
        bool midiConnected = pluginGraph.graph.addConnection({
            { midiNodeId, juce::AudioProcessorGraph::midiChannelIndex },
            { samplerNode->nodeID, juce::AudioProcessorGraph::midiChannelIndex }
        });
        juce::ignoreUnused(midiConnected);

        DBG("setupSamplerInstrumentsForTracks: Track " + juce::String(track) +
            " MIDI connected: " + juce::String(midiConnected ? "yes" : "no"));

        // Create or reuse track mixer for this track
        juce::AudioProcessorGraph::NodeID mixerNodeId;
        TrackMixerPlugin* mixerPlugin = nullptr;

        auto mixerNodeIt = trackMixerNodes.find(track);
        if (mixerNodeIt == trackMixerNodes.end())
        {
            // Create a new mixer plugin for this track
            mixerPlugin = new TrackMixerPlugin();
            mixerPlugin->setTrackIndex(track);

            auto mixerNode = pluginGraph.graph.addNode(
                std::unique_ptr<juce::AudioProcessor>(mixerPlugin));

            if (mixerNode != nullptr)
            {
                trackMixerNodes[track] = mixerNode->nodeID;
                trackMixerPlugins[track] = mixerPlugin;
                mixerNodeId = mixerNode->nodeID;

                double mixerXPos = 0.78;
                double mixerYPos = 0.15 + (track * 0.10);
                pluginGraph.setNodePosition(mixerNode->nodeID, { mixerXPos, mixerYPos });

                if (sampleRate > 0 && blockSize > 0)
                {
                    mixerPlugin->setRateAndBufferSizeDetails(sampleRate, blockSize);
                    mixerPlugin->prepareToPlay(sampleRate, blockSize);
                }

                if (trackMixerStates.count(track) > 0)
                {
                    const auto& state = trackMixerStates[track];
                    mixerPlugin->setVolume(state.volume);
                    mixerPlugin->setPan(state.pan);
                    mixerPlugin->setMuted(state.mute);
                    mixerPlugin->setSolo(state.solo);
                }

                DBG("setupSamplerInstrumentsForTracks: Created mixer node for track " + juce::String(track));
            }
            else
            {
                mixerPlugin = nullptr;
            }
        }
        else
        {
            mixerNodeId = mixerNodeIt->second;
            mixerPlugin = trackMixerPlugins[track];
        }

        // Connect audio: Sampler -> Mixer -> Audio Output (stereo)
        if (mixerPlugin != nullptr)
        {
            pluginGraph.graph.addConnection({
                { samplerNode->nodeID, 0 }, { mixerNodeId, 0 }
            });
            pluginGraph.graph.addConnection({
                { samplerNode->nodeID, 1 }, { mixerNodeId, 1 }
            });
            pluginGraph.graph.addConnection({
                { mixerNodeId, 0 }, { outputNodeId, 0 }
            });
            pluginGraph.graph.addConnection({
                { mixerNodeId, 1 }, { outputNodeId, 1 }
            });
        }
        else
        {
            // Fallback: connect sampler directly to output
            pluginGraph.graph.addConnection({
                { samplerNode->nodeID, 0 }, { outputNodeId, 0 }
            });
            pluginGraph.graph.addConnection({
                { samplerNode->nodeID, 1 }, { outputNodeId, 1 }
            });
        }

        DBG("setupSamplerInstrumentsForTracks: Completed setup for track " + juce::String(track));
    }

    DBG("Finished setting up sampler instruments. Manager has " +
        juce::String(samplerInstrumentManager.getNumInstruments()) + " instruments registered.");
}

void SequencerComponent::setupTrackInstrument(int trackIndex, const juce::String& pluginId)
{
    DBG("setupTrackInstrument: Setting up instrument for track " + juce::String(trackIndex) +
        " with plugin: " + pluginId);

    // Get the MIDI track output node for this track
    auto midiNodeIt = midiTrackOutputNodes.find(trackIndex);
    if (midiNodeIt == midiTrackOutputNodes.end())
    {
        DBG("setupTrackInstrument: No MIDI track output found for track " + juce::String(trackIndex));
        return;
    }

    auto midiNodeId = midiNodeIt->second;

    // Find the audio output node
    juce::AudioProcessorGraph::NodeID outputNodeId;
    bool foundOutputNode = false;
    for (auto* node : pluginGraph.graph.getNodes())
    {
        if (auto* ioProc = dynamic_cast<juce::AudioProcessorGraph::AudioGraphIOProcessor*>(node->getProcessor()))
        {
            if (ioProc->getType() == juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
            {
                outputNodeId = node->nodeID;
                foundOutputNode = true;
                break;
            }
        }
    }

    if (!foundOutputNode)
    {
        DBG("setupMidiTrackInstrument: Audio output node not found!");
        return;
    }

    // Remove existing connections from MIDI track output (both MIDI and audio)
    auto connections = pluginGraph.graph.getConnections();
    for (const auto& conn : connections)
    {
        if (conn.source.nodeID == midiNodeId)
        {
            pluginGraph.graph.removeConnection(conn);
        }
    }

    // Remove old instrument node if exists (also remove its connections)
    auto instrNodeIt = trackInstrumentNodes.find(trackIndex);
    if (instrNodeIt != trackInstrumentNodes.end())
    {
        // Remove connections from the old instrument
        auto oldInstrConnections = pluginGraph.graph.getConnections();
        for (const auto& conn : oldInstrConnections)
        {
            if (conn.source.nodeID == instrNodeIt->second || conn.destination.nodeID == instrNodeIt->second)
            {
                pluginGraph.graph.removeConnection(conn);
            }
        }

        pluginGraph.graph.removeNode(instrNodeIt->second);
        trackInstrumentNodes.erase(instrNodeIt);
        DBG("Removed old instrument node for track " + juce::String(trackIndex));
    }

    // Remove old mixer node connections if exists (but keep the mixer node)
    auto mixerNodeIt = trackMixerNodes.find(trackIndex);
    if (mixerNodeIt != trackMixerNodes.end())
    {
        auto oldMixerConnections = pluginGraph.graph.getConnections();
        for (const auto& conn : oldMixerConnections)
        {
            if (conn.source.nodeID == mixerNodeIt->second || conn.destination.nodeID == mixerNodeIt->second)
            {
                pluginGraph.graph.removeConnection(conn);
            }
        }
    }

    // If no plugin specified, just leave unconnected
    if (pluginId.isEmpty())
    {
        DBG("setupTrackInstrument: No plugin specified, leaving MIDI track output unconnected");
        return;
    }

    // Find plugin description - prefer name match, then uniqueId, then fileOrIdentifier
    // When matching by fileOrIdentifier, prefer instruments (VST3 bundles can contain
    // both instrument and effect components sharing the same file path)
    auto& knownPlugins = graphDocument.getPluginList();
    juce::PluginDescription desc;
    bool found = false;

    // First pass: exact name or uniqueId match (most reliable)
    for (const auto& knownDesc : knownPlugins.getTypes())
    {
        if (knownDesc.name == pluginId ||
            juce::String(knownDesc.uniqueId) == pluginId)
        {
            desc = knownDesc;
            found = true;
            break;
        }
    }

    // Second pass: fileOrIdentifier match, preferring instruments
    if (!found)
    {
        juce::PluginDescription fallbackDesc;
        bool hasFallback = false;

        for (const auto& knownDesc : knownPlugins.getTypes())
        {
            if (knownDesc.fileOrIdentifier == pluginId)
            {
                if (knownDesc.isInstrument)
                {
                    desc = knownDesc;
                    found = true;
                    break;
                }
                else if (!hasFallback)
                {
                    fallbackDesc = knownDesc;
                    hasFallback = true;
                }
            }
        }

        if (!found && hasFallback)
        {
            desc = fallbackDesc;
            found = true;
        }
    }

    if (!found)
    {
        DBG("setupTrackInstrument: Plugin not found: " + pluginId);
        return;
    }

    // Create the instrument plugin synchronously
    DBG("setupTrackInstrument: Found plugin, adding to graph: " + desc.name);

    // Position instrument plugin to the right of MIDI output
    auto instrumentNode = pluginGraph.addPluginSync(
        PluginDescriptionAndPreference(desc),
        juce::Point<double>(0.60, 0.15 + trackIndex * 0.10));

    if (instrumentNode == nullptr)
    {
        DBG("setupTrackInstrument: Failed to create instrument plugin");
        return;
    }

    // Store the instrument node ID
    trackInstrumentNodes[trackIndex] = instrumentNode->nodeID;
    DBG("setupTrackInstrument: Created instrument node " + juce::String((int)instrumentNode->nodeID.uid));

    // Wire instrument processor to MidiTrackOutput for VST parameter automation
    if (auto* trackOutput = midiTrackOutputManager.getOutputForTrack(trackIndex))
    {
        trackOutput->setInstrumentProcessor(instrumentNode->getProcessor());
        DBG("setupTrackInstrument: Wired instrument processor for VST automation on track " + juce::String(trackIndex));
    }

    // Connect MIDI: MidiTrackOutput -> Instrument (MIDI channel)
    // MIDI connections use the special midiChannelIndex
    bool midiConnected = pluginGraph.graph.addConnection({
        { midiNodeId, juce::AudioProcessorGraph::midiChannelIndex },
        { instrumentNode->nodeID, juce::AudioProcessorGraph::midiChannelIndex }
    });

    if (midiConnected)
    {
        DBG("setupTrackInstrument: Connected MIDI from track output to instrument");
    }
    else
    {
        DBG("setupTrackInstrument: WARNING - Failed to connect MIDI");
    }

    // Create or get the track mixer plugin for this track
    juce::AudioProcessorGraph::NodeID mixerNodeId;
    TrackMixerPlugin* mixerPlugin = nullptr;

    if (mixerNodeIt == trackMixerNodes.end())
    {
        // Create a new mixer plugin for this track
        mixerPlugin = new TrackMixerPlugin();
        mixerPlugin->setTrackIndex(trackIndex);

        auto mixerNode = pluginGraph.graph.addNode(
            std::unique_ptr<juce::AudioProcessor>(mixerPlugin));

        if (mixerNode != nullptr)
        {
            trackMixerNodes[trackIndex] = mixerNode->nodeID;
            trackMixerPlugins[trackIndex] = mixerPlugin;
            mixerNodeId = mixerNode->nodeID;

            // Set mixer node position (to the right of instrument)
            // MIDI track mixers in column 5, each track on a different row
            double mixerXPos = 0.78;  // Right side
            double mixerYPos = 0.15 + (trackIndex * 0.10);  // Same row as MIDI output
            pluginGraph.setNodePosition(mixerNode->nodeID, { mixerXPos, mixerYPos });

            // Set initial sample rate and buffer size from the graph
            double sampleRate = pluginGraph.graph.getSampleRate();
            int blockSize = pluginGraph.graph.getBlockSize();

            if (sampleRate > 0 && blockSize > 0)
            {
                mixerPlugin->setRateAndBufferSizeDetails(sampleRate, blockSize);
                mixerPlugin->prepareToPlay(sampleRate, blockSize);
            }

            // Apply current mixer state
            if (trackMixerStates.count(trackIndex) > 0)
            {
                const auto& state = trackMixerStates[trackIndex];
                mixerPlugin->setVolume(state.volume);
                mixerPlugin->setPan(state.pan);
                mixerPlugin->setMuted(state.mute);
                mixerPlugin->setSolo(state.solo);
            }

            DBG("setupTrackInstrument: Created mixer node " + juce::String((int)mixerNodeId.uid) +
                " for track " + juce::String(trackIndex));
        }
        else
        {
            DBG("setupTrackInstrument: Failed to create mixer plugin for track " + juce::String(trackIndex));
            // Fall back to direct connection
            mixerPlugin = nullptr;
        }
    }
    else
    {
        mixerNodeId = mixerNodeIt->second;
        mixerPlugin = trackMixerPlugins[trackIndex];
        DBG("setupTrackInstrument: Reusing existing mixer node " + juce::String((int)mixerNodeId.uid));
    }

    // Connect Audio: Instrument -> Mixer -> Audio Output (stereo)
    auto* processor = instrumentNode->getProcessor();
    int numOutputChannels = processor->getTotalNumOutputChannels();

    DBG("setupTrackInstrument: Instrument has " + juce::String(numOutputChannels) + " output channels");

    if (mixerPlugin != nullptr)
    {
        // Connect Instrument -> Mixer
        if (numOutputChannels >= 1)
        {
            bool leftConnected = pluginGraph.graph.addConnection({
                { instrumentNode->nodeID, 0 },
                { mixerNodeId, 0 }
            });
            juce::ignoreUnused(leftConnected);
            DBG("setupTrackInstrument: Instrument->Mixer left connected: " + juce::String(leftConnected ? "yes" : "no"));
        }
        if (numOutputChannels >= 2)
        {
            bool rightConnected = pluginGraph.graph.addConnection({
                { instrumentNode->nodeID, 1 },
                { mixerNodeId, 1 }
            });
            juce::ignoreUnused(rightConnected);
            DBG("setupTrackInstrument: Instrument->Mixer right connected: " + juce::String(rightConnected ? "yes" : "no"));
        }

        // Connect Mixer -> Audio Output
        bool mixerOutLeft = pluginGraph.graph.addConnection({
            { mixerNodeId, 0 },
            { outputNodeId, 0 }
        });
        bool mixerOutRight = pluginGraph.graph.addConnection({
            { mixerNodeId, 1 },
            { outputNodeId, 1 }
        });
        juce::ignoreUnused(mixerOutLeft, mixerOutRight);
        DBG("setupTrackInstrument: Mixer->Output connected: left=" + juce::String(mixerOutLeft ? "yes" : "no") +
            " right=" + juce::String(mixerOutRight ? "yes" : "no"));
    }
    else
    {
        // Fallback: Connect Instrument directly to Audio Output
        if (numOutputChannels >= 1)
        {
            bool leftConnected = pluginGraph.graph.addConnection({
                { instrumentNode->nodeID, 0 },
                { outputNodeId, 0 }
            });
            juce::ignoreUnused(leftConnected);
            DBG("setupTrackInstrument: Left audio channel connected: " + juce::String(leftConnected ? "yes" : "no"));
        }
        if (numOutputChannels >= 2)
        {
            bool rightConnected = pluginGraph.graph.addConnection({
                { instrumentNode->nodeID, 1 },
                { outputNodeId, 1 }
            });
            juce::ignoreUnused(rightConnected);
            DBG("setupTrackInstrument: Right audio channel connected: " + juce::String(rightConnected ? "yes" : "no"));
        }
    }

    // Restore saved plugin state if available (from project load)
    auto savedStateIt = savedPluginStates.find(trackIndex);
    if (savedStateIt != savedPluginStates.end())
    {
        auto* proc = instrumentNode->getProcessor();
        if (proc != nullptr && savedStateIt->second.getSize() > 0)
        {
            proc->setStateInformation(savedStateIt->second.getData(),
                                      (int)savedStateIt->second.getSize());
            DBG("setupTrackInstrument: Restored saved plugin state for track " +
                juce::String(trackIndex) + " (" + juce::String((int)savedStateIt->second.getSize()) + " bytes)");
        }
        savedPluginStates.erase(savedStateIt);
    }

    DBG("setupTrackInstrument: Completed setup for track " + juce::String(trackIndex));

    // Send plugin parameters to JavaScript for automation
    sendPluginParametersToJS(trackIndex, instrumentNode);
}

void SequencerComponent::sendPluginParametersToJS(int trackIndex, juce::AudioProcessorGraph::Node* node)
{
    if (node == nullptr || node->getProcessor() == nullptr)
        return;

    auto* processor = node->getProcessor();
    const auto& params = processor->getParameters();

    if (params.isEmpty())
    {
        DBG("sendPluginParametersToJS: No parameters for track " + juce::String(trackIndex));
        return;
    }

    // Build JSON array of parameters (limit to first 128 to avoid huge payloads)
    juce::String paramsJson = "[";
    bool first = true;
    int paramCount = 0;
    const int maxParams = 128;

    for (auto* param : params)
    {
        if (paramCount >= maxParams) break;

        if (!first) paramsJson += ",";
        first = false;

        // Escape the parameter name for JSON
        juce::String paramName = param->getName(100);
        paramName = paramName.replace("\\", "\\\\").replace("\"", "\\\"");

        // Get parameter label (unit)
        juce::String paramLabel = param->getLabel();
        paramLabel = paramLabel.replace("\\", "\\\\").replace("\"", "\\\"");

        paramsJson += "{";
        paramsJson += "\"index\":" + juce::String(param->getParameterIndex()) + ",";
        paramsJson += "\"name\":\"" + paramName + "\",";
        paramsJson += "\"label\":\"" + paramLabel + "\",";
        paramsJson += "\"value\":" + juce::String(param->getValue(), 6) + ",";
        paramsJson += "\"defaultValue\":" + juce::String(param->getDefaultValue(), 6) + ",";
        paramsJson += "\"isDiscrete\":" + juce::String(param->isDiscrete() ? "true" : "false") + ",";
        paramsJson += "\"numSteps\":" + juce::String(param->getNumSteps());
        paramsJson += "}";

        paramCount++;
    }

    paramsJson += "]";

    // Get plugin name
    juce::String pluginName = processor->getName();
    pluginName = pluginName.replace("\\", "\\\\").replace("\"", "\\\"");

    // Build the JSON response
    juce::String jsonResponse = "{"
        "\"type\": \"pluginParameters\", "
        "\"trackIndex\": " + juce::String(trackIndex) + ", "
        "\"pluginName\": \"" + pluginName + "\", "
        "\"nodeId\": " + juce::String((int)node->nodeID.uid) + ", "
        "\"parameters\": " + paramsJson +
        "}";

    DBG("sendPluginParametersToJS: Sending " + juce::String(paramCount) + " parameters for track " + juce::String(trackIndex));

    // Defer the event emission to avoid deadlock when called from native function callback
    auto* browser = webBrowser.get();
    if (browser != nullptr)
    {
        juce::MessageManager::callAsync([browser, jsonResponse]()
        {
            if (browser != nullptr)
                browser->emitEventIfBrowserIsVisible("juceBridgeEvents", jsonResponse);
        });
    }
}

void SequencerComponent::applyMixerStateToTrack(int trackIndex)
{
    const auto& state = trackMixerStates[trackIndex];

    // Apply to track mixer plugin (used for both sample and MIDI tracks)
    auto mixerIt = trackMixerPlugins.find(trackIndex);
    if (mixerIt != trackMixerPlugins.end() && mixerIt->second != nullptr)
    {
        mixerIt->second->setVolume(state.volume);
        mixerIt->second->setPan(state.pan);
        mixerIt->second->setMuted(state.mute);
        mixerIt->second->setSolo(state.solo);
    }
}

void SequencerComponent::updateSoloStates()
{
    // Check if any track has solo enabled
    bool anySoloed = false;
    for (const auto& [trackIndex, state] : trackMixerStates)
    {
        if (state.solo)
        {
            anySoloed = true;
            break;
        }
    }

    // Update all tracks with the "other track soloed" state
    for (const auto& [trackIndex, state] : trackMixerStates)
    {
        // A track is affected by "other soloed" if:
        // - Some track has solo enabled AND
        // - This track is NOT the one that's soloed
        bool otherSoloed = anySoloed && !state.solo;

        // Update track mixer plugin (used for both sample and MIDI tracks)
        auto mixerIt = trackMixerPlugins.find(trackIndex);
        if (mixerIt != trackMixerPlugins.end() && mixerIt->second != nullptr)
        {
            mixerIt->second->setOtherTrackSoloed(otherSoloed);
        }
    }
}