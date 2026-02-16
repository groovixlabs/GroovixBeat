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
#include "MainHostWindow.h"
#include "../Plugins/InternalPlugins.h"

constexpr const char* scanModeKey = "pluginScanMode";

//==============================================================================
class Superprocess final : private ChildProcessCoordinator
{
public:
    Superprocess()
    {
        launchWorkerProcess (File::getSpecialLocation (File::currentExecutableFile), processUID, 0, 0);
    }

    enum class State
    {
        timeout,
        gotResult,
        connectionLost,
    };

    struct Response
    {
        State state;
        std::unique_ptr<XmlElement> xml;
    };

    Response getResponse()
    {
        std::unique_lock<std::mutex> lock { mutex };

        if (! condvar.wait_for (lock, std::chrono::milliseconds { 50 }, [&] { return gotResult || connectionLost; }))
            return { State::timeout, nullptr };

        const auto state = connectionLost ? State::connectionLost : State::gotResult;
        connectionLost = false;
        gotResult = false;

        return { state, std::move (pluginDescription) };
    }

    using ChildProcessCoordinator::sendMessageToWorker;

private:
    void handleMessageFromWorker (const MemoryBlock& mb) override
    {
        const std::lock_guard<std::mutex> lock { mutex };
        pluginDescription = parseXML (mb.toString());
        gotResult = true;
        condvar.notify_one();
    }

    void handleConnectionLost() override
    {
        const std::lock_guard<std::mutex> lock { mutex };
        connectionLost = true;
        condvar.notify_one();
    }

    std::mutex mutex;
    std::condition_variable condvar;

    std::unique_ptr<XmlElement> pluginDescription;
    bool connectionLost = false;
    bool gotResult = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Superprocess)
};

//==============================================================================
class CustomPluginScanner final : public KnownPluginList::CustomScanner,
                                  private ChangeListener
{
public:
    CustomPluginScanner()
    {
        if (auto* file = getAppProperties().getUserSettings())
            file->addChangeListener (this);

        handleChange();
    }

    ~CustomPluginScanner() override
    {
        if (auto* file = getAppProperties().getUserSettings())
            file->removeChangeListener (this);
    }

    bool findPluginTypesFor (AudioPluginFormat& format,
                             OwnedArray<PluginDescription>& result,
                             const String& fileOrIdentifier) override
    {
        if (scanInProcess)
        {
            superprocess = nullptr;
            format.findAllTypesForFile (result, fileOrIdentifier);
            return true;
        }

        if (addPluginDescriptions (format.getName(), fileOrIdentifier, result))
            return true;

        superprocess = nullptr;
        return false;
    }

    void scanFinished() override
    {
        superprocess = nullptr;
    }

private:
    /*  Scans for a plugin with format 'formatName' and ID 'fileOrIdentifier' using a subprocess,
        and adds discovered plugin descriptions to 'result'.

        Returns true on success.

        Failure indicates that the subprocess is unrecoverable and should be terminated.
    */
    bool addPluginDescriptions (const String& formatName,
                                const String& fileOrIdentifier,
                                OwnedArray<PluginDescription>& result)
    {
        if (superprocess == nullptr)
            superprocess = std::make_unique<Superprocess>();

        MemoryBlock block;
        MemoryOutputStream stream { block, true };
        stream.writeString (formatName);
        stream.writeString (fileOrIdentifier);

        if (! superprocess->sendMessageToWorker (block))
            return false;

        for (;;)
        {
            if (shouldExit())
                return true;

            const auto response = superprocess->getResponse();

            if (response.state == Superprocess::State::timeout)
                continue;

            if (response.xml != nullptr)
            {
                for (const auto* item : response.xml->getChildIterator())
                {
                    auto desc = std::make_unique<PluginDescription>();

                    if (desc->loadFromXml (*item))
                        result.add (std::move (desc));
                }
            }

            return (response.state == Superprocess::State::gotResult);
        }
    }

    void handleChange()
    {
        if (auto* file = getAppProperties().getUserSettings())
            scanInProcess = (file->getIntValue (scanModeKey) == 0);
    }

    void changeListenerCallback (ChangeBroadcaster*) override
    {
        handleChange();
    }

    std::unique_ptr<Superprocess> superprocess;

    std::atomic<bool> scanInProcess { true };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (CustomPluginScanner)
};

//==============================================================================
class CustomPluginListComponent final : public PluginListComponent
{
public:
    CustomPluginListComponent (AudioPluginFormatManager& manager,
                               KnownPluginList& listToRepresent,
                               const File& pedal,
                               PropertiesFile* props,
                               bool async)
        : PluginListComponent (manager, listToRepresent, pedal, props, async)
    {
        addAndMakeVisible (validationModeLabel);
        addAndMakeVisible (validationModeBox);

        validationModeLabel.attachToComponent (&validationModeBox, true);
        validationModeLabel.setJustificationType (Justification::right);
        validationModeLabel.setSize (100, 30);

        auto unusedId = 1;

        for (const auto mode : { "In-process", "Out-of-process" })
            validationModeBox.addItem (mode, unusedId++);

        validationModeBox.setSelectedItemIndex (getAppProperties().getUserSettings()->getIntValue (scanModeKey));

        validationModeBox.onChange = [this]
        {
            getAppProperties().getUserSettings()->setValue (scanModeKey, validationModeBox.getSelectedItemIndex());
        };

        handleResize();
    }

    void resized() override
    {
        handleResize();
    }

private:
    void handleResize()
    {
        PluginListComponent::resized();

        const auto& buttonBounds = getOptionsButton().getBounds();
        validationModeBox.setBounds (buttonBounds.withWidth (130).withRightX (getWidth() - buttonBounds.getX()));
    }


    Label validationModeLabel { {}, "Scan mode" };
    ComboBox validationModeBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (CustomPluginListComponent)
};

//==============================================================================
class MainHostWindow::PluginListWindow final : public DocumentWindow
{
public:
    PluginListWindow (MainHostWindow& mw, AudioPluginFormatManager& pluginFormatManager)
        : DocumentWindow ("Available Plugins",
                          LookAndFeel::getDefaultLookAndFeel().findColour (ResizableWindow::backgroundColourId),
                          DocumentWindow::minimiseButton | DocumentWindow::closeButton),
          owner (mw)
    {
        auto deadMansPedalFile = getAppProperties().getUserSettings()
                                   ->getFile().getSiblingFile ("RecentlyCrashedPluginsList");

        setContentOwned (new CustomPluginListComponent (pluginFormatManager,
                                                        owner.knownPluginList,
                                                        deadMansPedalFile,
                                                        getAppProperties().getUserSettings(),
                                                        true), true);

        setResizable (true, false);
        setResizeLimits (300, 400, 800, 1500);
        setTopLeftPosition (60, 60);

        restoreWindowStateFromString (getAppProperties().getUserSettings()->getValue ("listWindowPos"));
        setVisible (true);
    }

    ~PluginListWindow() override
    {
        getAppProperties().getUserSettings()->setValue ("listWindowPos", getWindowStateAsString());
        clearContentComponent();
    }

    void closeButtonPressed() override
    {
        owner.pluginListWindow = nullptr;
    }

private:
    MainHostWindow& owner;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginListWindow)
};

//==============================================================================
MainHostWindow::MainHostWindow()
    : DocumentWindow (JUCEApplication::getInstance()->getApplicationName(),
                      Colour (0xff1a1a1a),
                      DocumentWindow::allButtons)
{
    // Set the background colour for the look and feel
    getLookAndFeel().setColour (ResizableWindow::backgroundColourId, Colour (0xff242424));

    // PopupMenu colours (match JS theme background #242424)
    getLookAndFeel().setColour (PopupMenu::backgroundColourId,            Colour (0xff242424));
    getLookAndFeel().setColour (PopupMenu::textColourId,                  Colour (0xffe0e0e0));
    getLookAndFeel().setColour (PopupMenu::highlightedBackgroundColourId, Colour (0xffd5a865));
    getLookAndFeel().setColour (PopupMenu::highlightedTextColourId,       Colour (0xff1a1a1a));
    getLookAndFeel().setColour (PopupMenu::headerTextColourId,            Colour (0xffd5a865));

    // ComboBox colours
    getLookAndFeel().setColour (ComboBox::backgroundColourId,  Colour (0xff242424));
    getLookAndFeel().setColour (ComboBox::textColourId,        Colour (0xffe0e0e0));
    getLookAndFeel().setColour (ComboBox::outlineColourId,     Colour (0xff3a3a3a));
    getLookAndFeel().setColour (ComboBox::arrowColourId,       Colour (0xffd5a865));

    // AlertWindow / DialogWindow colours
    getLookAndFeel().setColour (AlertWindow::backgroundColourId, Colour (0xff242424));
    getLookAndFeel().setColour (AlertWindow::textColourId,       Colour (0xffe0e0e0));
    getLookAndFeel().setColour (AlertWindow::outlineColourId,    Colour (0xff3a3a3a));

    // TextButton colours (used for AlertWindow buttons)
    getLookAndFeel().setColour (TextButton::buttonColourId,  Colour (0xff3a3a3a));
    getLookAndFeel().setColour (TextButton::textColourOffId, Colour (0xffd5a865));

    // ListBox colours (PluginListWindow, etc.)
    getLookAndFeel().setColour (ListBox::backgroundColourId, Colour (0xff242424));
    getLookAndFeel().setColour (ListBox::textColourId,       Colour (0xffe0e0e0));
    getLookAndFeel().setColour (ListBox::outlineColourId,    Colour (0xff3a3a3a));

    // Label colours
    getLookAndFeel().setColour (Label::textColourId,          Colour (0xffe0e0e0));
    getLookAndFeel().setColour (Label::backgroundColourId,    Colour (0x00000000));

    // TextEditor colours (search boxes, text fields)
    getLookAndFeel().setColour (TextEditor::backgroundColourId,   Colour (0xff1a1a1a));
    getLookAndFeel().setColour (TextEditor::textColourId,         Colour (0xffe0e0e0));
    getLookAndFeel().setColour (TextEditor::outlineColourId,      Colour (0xff3a3a3a));
    getLookAndFeel().setColour (TextEditor::focusedOutlineColourId, Colour (0xffd5a865));
    getLookAndFeel().setColour (TextEditor::highlightColourId,    Colour (0xffd5a865));
    getLookAndFeel().setColour (TextEditor::highlightedTextColourId, Colour (0xff1a1a1a));

    // ScrollBar colours
    getLookAndFeel().setColour (ScrollBar::thumbColourId,      Colour (0xff555555));
    getLookAndFeel().setColour (ScrollBar::trackColourId,      Colour (0xff1a1a1a));
    getLookAndFeel().setColour (ScrollBar::backgroundColourId, Colour (0xff1a1a1a));

    // DirectoryContentsDisplayComponent (file browser lists)
    getLookAndFeel().setColour (DirectoryContentsDisplayComponent::textColourId,      Colour (0xffe0e0e0));
    getLookAndFeel().setColour (DirectoryContentsDisplayComponent::highlightColourId, Colour (0xffd5a865));

    addDefaultFormatsToManager (formatManager);
    formatManager.addFormat (std::make_unique<InternalPluginFormat>());

    auto safeThis = SafePointer<MainHostWindow> (this);
    RuntimePermissions::request (RuntimePermissions::recordAudio,
                                 [safeThis] (bool granted) mutable
                                 {
                                     auto savedState = getAppProperties().getUserSettings()->getXmlValue ("audioDeviceState");
                                     safeThis->deviceManager.initialise (granted ? 256 : 0, 256, savedState.get(), true);
                                 });

   #if JUCE_IOS || JUCE_ANDROID
    setFullScreen (true);
   #else
    setResizable (true, false);
    setResizeLimits (500, 400, 10000, 10000);
    centreWithSize (800, 600);
   #endif

    knownPluginList.setCustomScanner (std::make_unique<CustomPluginScanner>());

    graphHolder.reset (new GraphDocumentComponent (formatManager, deviceManager, knownPluginList));

    setContentNonOwned (graphHolder.get(), false);

    setUsingNativeTitleBar (true);

    restoreWindowStateFromString (getAppProperties().getUserSettings()->getValue ("mainWindowPos"));

    setVisible (true);

    InternalPluginFormat internalFormat;
    internalTypes = internalFormat.getAllTypes();

    if (auto savedPluginList = getAppProperties().getUserSettings()->getXmlValue ("pluginList"))
        knownPluginList.recreateFromXml (*savedPluginList);

    for (auto& t : internalTypes)
        knownPluginList.addType (t);

    pluginSortMethod = (KnownPluginList::SortMethod) getAppProperties().getUserSettings()
                            ->getIntValue ("pluginSortMethod", KnownPluginList::sortByManufacturer);

    knownPluginList.addChangeListener (this);

    if (auto* g = graphHolder->graph.get())
        g->addChangeListener (this);

    addKeyListener (getCommandManager().getKeyMappings());

    Process::setPriority (Process::HighPriority);

  #if JUCE_IOS || JUCE_ANDROID
    graphHolder->burgerMenu.setModel (this);
  #else
   #if JUCE_MAC
    setMacMainMenu (this);
   #else
    setMenuBar (this);
   #endif
  #endif

    getCommandManager().setFirstCommandTarget (this);
}

MainHostWindow::~MainHostWindow()
{
    pluginListWindow = nullptr;
    knownPluginList.removeChangeListener (this);

    if (auto* g = graphHolder->graph.get())
        g->removeChangeListener (this);

    getAppProperties().getUserSettings()->setValue ("mainWindowPos", getWindowStateAsString());
    clearContentComponent();

  #if ! (JUCE_ANDROID || JUCE_IOS)
   #if JUCE_MAC
    setMacMainMenu (nullptr);
   #else
    setMenuBar (nullptr);
   #endif
  #endif

    graphHolder = nullptr;
}

void MainHostWindow::closeButtonPressed()
{
    tryToQuitApplication();
}

struct AsyncQuitRetrier final : private Timer
{
    AsyncQuitRetrier()   { startTimer (500); }

    void timerCallback() override
    {
        stopTimer();
        delete this;

        if (auto app = JUCEApplicationBase::getInstance())
            app->systemRequestedQuit();
    }
};

void MainHostWindow::tryToQuitApplication()
{
    if (graphHolder->closeAnyOpenPluginWindows())
    {
        // Really important thing to note here: if the last call just deleted any plugin windows,
        // we won't exit immediately - instead we'll use our AsyncQuitRetrier to let the message
        // loop run for another brief moment, then try again. This will give any plugins a chance
        // to flush any GUI events that may have been in transit before the app forces them to
        // be unloaded
        new AsyncQuitRetrier();
        return;
    }

    if (ModalComponentManager::getInstance()->cancelAllModalComponents())
    {
        new AsyncQuitRetrier();
        return;
    }

    if (graphHolder != nullptr)
    {
        auto releaseAndQuit = [this]
        {
            // Some plug-ins do not want [NSApp stop] to be called
            // before the plug-ins are not deallocated.
            graphHolder->releaseGraph();

            JUCEApplication::quit();
        };

       #if JUCE_ANDROID || JUCE_IOS
        if (graphHolder->graph->saveDocument (PluginGraph::getDefaultGraphDocumentOnMobile()))
            releaseAndQuit();
       #else
        SafePointer<MainHostWindow> parent { this };

        graphHolder->saveSequencerState();

        // This saves the current filtergraph.
        /*
            graphHolder->graph->saveIfNeededAndUserAgreesAsync ([parent, releaseAndQuit] (FileBasedDocument::SaveResult r)
            {
                if (parent == nullptr)
                    return;

                if (r == FileBasedDocument::savedOk)
                    releaseAndQuit();
            });
        */

        releaseAndQuit();
       #endif

        return;
    }

    JUCEApplication::quit();
}

void MainHostWindow::changeListenerCallback (ChangeBroadcaster* changed)
{
    if (changed == &knownPluginList)
    {
        menuItemsChanged();

        // save the plugin list every time it gets changed, so that if we're scanning
        // and it crashes, we've still saved the previous ones
        if (auto savedPluginList = std::unique_ptr<XmlElement> (knownPluginList.createXml()))
        {
            getAppProperties().getUserSettings()->setValue ("pluginList", savedPluginList.get());
            getAppProperties().saveIfNeeded();
        }
    }
    else if (graphHolder != nullptr && changed == graphHolder->graph.get())
    {
        auto title = JUCEApplication::getInstance()->getApplicationName();
        auto f = graphHolder->graph->getFile();

        if (f.existsAsFile())
            title = f.getFileName() + " - " + title;

        setName (title);
    }
}

StringArray MainHostWindow::getMenuBarNames()
{
    StringArray names;
    names.add ("File");
    names.add ("Plugins");
    names.add ("Options");
    names.add ("Windows");
    return names;
}

PopupMenu MainHostWindow::getMenuForIndex (int topLevelMenuIndex, const String& /*menuName*/)
{
    PopupMenu menu;

    if (topLevelMenuIndex == 0)
    {
        // "File" menu
       #if ! (JUCE_IOS || JUCE_ANDROID)
        //menu.addCommandItem (&getCommandManager(), CommandIDs::newFile);
        //menu.addCommandItem (&getCommandManager(), CommandIDs::open);
       #endif

        /*
        RecentlyOpenedFilesList recentFiles;
        recentFiles.restoreFromString (getAppProperties().getUserSettings()
                                            ->getValue ("recentFilterGraphFiles"));

        PopupMenu recentFilesMenu;
        recentFiles.createPopupMenuItems (recentFilesMenu, 100, true, true);
        menu.addSubMenu ("Open recent file", recentFilesMenu);
        */

       #if ! (JUCE_IOS || JUCE_ANDROID)
        //menu.addCommandItem (&getCommandManager(), CommandIDs::save);
        //menu.addCommandItem (&getCommandManager(), CommandIDs::saveAs);
       #endif

        //menu.addSeparator();

        menu.addCommandItem(&getCommandManager(), CommandIDs::newProject);
        menu.addCommandItem(&getCommandManager(), CommandIDs::openProject);

        menu.addCommandItem(&getCommandManager(), CommandIDs::saveSequencerState);
        //menu.addSeparator();
        //menu.addCommandItem(&getCommandManager(), CommandIDs::loadSequencerState);

        menu.addSeparator();
        menu.addCommandItem (&getCommandManager(), StandardApplicationCommandIDs::quit);
    }
    else if (topLevelMenuIndex == 1)
    {
        // "Plugins" menu
        PopupMenu pluginsMenu;
        addPluginsToMenu (pluginsMenu);
        //menu.addSubMenu ("Create Plug-in", pluginsMenu);
        //menu.addSeparator();
        menu.addCommandItem (&getCommandManager(), CommandIDs::showGraph);
        //menu.addCommandItem (&getCommandManager(), CommandIDs::pingSequencer);
        //menu.addSeparator();
        //menu.addItem (250, "Delete All Plug-ins");
    }
    else if (topLevelMenuIndex == 2)
    {
        // "Options" menu

        menu.addCommandItem (&getCommandManager(), CommandIDs::showPluginListEditor);

        /*
        PopupMenu sortTypeMenu;
        sortTypeMenu.addItem (200, "List Plug-ins in Default Order",      true, pluginSortMethod == KnownPluginList::defaultOrder);
        sortTypeMenu.addItem (201, "List Plug-ins in Alphabetical Order", true, pluginSortMethod == KnownPluginList::sortAlphabetically);
        sortTypeMenu.addItem (202, "List Plug-ins by Category",           true, pluginSortMethod == KnownPluginList::sortByCategory);
        sortTypeMenu.addItem (203, "List Plug-ins by Manufacturer",       true, pluginSortMethod == KnownPluginList::sortByManufacturer);
        sortTypeMenu.addItem (204, "List Plug-ins Based on the Directory Structure", true, pluginSortMethod == KnownPluginList::sortByFileSystemLocation);
        menu.addSubMenu ("Plug-in Menu Type", sortTypeMenu);

        menu.addSeparator();
        */

        menu.addCommandItem (&getCommandManager(), CommandIDs::showAudioSettings);
        menu.addCommandItem (&getCommandManager(), CommandIDs::toggleDoublePrecision);

        if (autoScaleOptionAvailable)
            menu.addCommandItem (&getCommandManager(), CommandIDs::autoScalePluginWindows);

        //menu.addSeparator();
        //menu.addCommandItem (&getCommandManager(), CommandIDs::toggleMidiKeyboard);

        menu.addSeparator();
        menu.addCommandItem (&getCommandManager(), CommandIDs::showSettings);
        menu.addSeparator();
        menu.addCommandItem (&getCommandManager(), CommandIDs::aboutBox);
    }
    else if (topLevelMenuIndex == 3)
    {
        menu.addCommandItem (&getCommandManager(), CommandIDs::allWindowsForward);
    }

    return menu;
}

void MainHostWindow::menuItemSelected (int menuItemID, int /*topLevelMenuIndex*/)
{
    if (menuItemID == 250)
    {
        if (graphHolder != nullptr)
            if (auto* graph = graphHolder->graph.get())
                graph->clear();
    }
   #if ! (JUCE_ANDROID || JUCE_IOS)
    else if (menuItemID >= 100 && menuItemID < 200)
    {
        RecentlyOpenedFilesList recentFiles;
        recentFiles.restoreFromString (getAppProperties().getUserSettings()
                                            ->getValue ("recentFilterGraphFiles"));

        if (graphHolder != nullptr)
        {
            if (auto* graph = graphHolder->graph.get())
            {
                SafePointer<MainHostWindow> parent { this };
                graph->saveIfNeededAndUserAgreesAsync ([parent, recentFiles, menuItemID] (FileBasedDocument::SaveResult r)
                {
                    if (parent == nullptr)
                        return;

                    if (r == FileBasedDocument::savedOk)
                        parent->graphHolder->graph->loadFrom (recentFiles.getFile (menuItemID - 100), true);
                });
            }
        }
    }
   #endif
    else if (menuItemID >= 200 && menuItemID < 210)
    {
             if (menuItemID == 200)     pluginSortMethod = KnownPluginList::defaultOrder;
        else if (menuItemID == 201)     pluginSortMethod = KnownPluginList::sortAlphabetically;
        else if (menuItemID == 202)     pluginSortMethod = KnownPluginList::sortByCategory;
        else if (menuItemID == 203)     pluginSortMethod = KnownPluginList::sortByManufacturer;
        else if (menuItemID == 204)     pluginSortMethod = KnownPluginList::sortByFileSystemLocation;

        getAppProperties().getUserSettings()->setValue ("pluginSortMethod", (int) pluginSortMethod);

        menuItemsChanged();
    }
    else
    {
        if (const auto chosen = getChosenType (menuItemID))
            createPlugin (*chosen, { proportionOfWidth  (0.3f + Random::getSystemRandom().nextFloat() * 0.6f),
                                     proportionOfHeight (0.3f + Random::getSystemRandom().nextFloat() * 0.6f) });
    }
}

void MainHostWindow::menuBarActivated (bool isActivated)
{
    if (isActivated && graphHolder != nullptr)
        Component::unfocusAllComponents();
}

void MainHostWindow::createPlugin (const PluginDescriptionAndPreference& desc, Point<int> pos)
{
    if (graphHolder != nullptr)
        graphHolder->createNewPlugin (desc, pos);
}

static bool containsDuplicateNames (const Array<PluginDescription>& plugins, const String& name)
{
    int matches = 0;

    for (auto& p : plugins)
        if (p.name == name && ++matches > 1)
            return true;

    return false;
}

static constexpr int menuIDBase = 0x324503f4;

static void addToMenu (const KnownPluginList::PluginTree& tree,
                       PopupMenu& m,
                       const Array<PluginDescription>& allPlugins,
                       Array<PluginDescriptionAndPreference>& addedPlugins)
{
    for (auto* sub : tree.subFolders)
    {
        PopupMenu subMenu;
        addToMenu (*sub, subMenu, allPlugins, addedPlugins);

        m.addSubMenu (sub->folder, subMenu, true, nullptr, false, 0);
    }

    auto addPlugin = [&] (const auto& descriptionAndPreference, const auto& pluginName)
    {
        addedPlugins.add (descriptionAndPreference);
        const auto menuID = addedPlugins.size() - 1 + menuIDBase;
        m.addItem (menuID, pluginName, true, false);
    };

    for (auto& plugin : tree.plugins)
    {
        auto name = plugin.name;

        if (containsDuplicateNames (tree.plugins, name))
            name << " (" << plugin.pluginFormatName << ')';

        addPlugin (PluginDescriptionAndPreference { plugin, PluginDescriptionAndPreference::UseARA::no }, name);

       #if JUCE_PLUGINHOST_ARA && (JUCE_MAC || JUCE_WINDOWS || JUCE_LINUX)
        if (plugin.hasARAExtension)
        {
            name << " (ARA)";
            addPlugin (PluginDescriptionAndPreference { plugin }, name);
        }
       #endif
    }
}

void MainHostWindow::addPluginsToMenu (PopupMenu& m)
{
    if (graphHolder != nullptr)
    {
        int i = 0;

        for (auto& t : internalTypes)
            m.addItem (++i, t.name + " (" + t.pluginFormatName + ")");
    }

    m.addSeparator();

    auto pluginDescriptions = knownPluginList.getTypes();

    // This avoids showing the internal types again later on in the list
    pluginDescriptions.removeIf ([] (PluginDescription& desc)
    {
        return desc.pluginFormatName == InternalPluginFormat::getIdentifier();
    });

    auto tree = KnownPluginList::createTree (pluginDescriptions, pluginSortMethod);
    pluginDescriptionsAndPreference = {};
    addToMenu (*tree, m, pluginDescriptions, pluginDescriptionsAndPreference);
}

std::optional<PluginDescriptionAndPreference> MainHostWindow::getChosenType (const int menuID) const
{
    const auto internalIndex = menuID - 1;

    if (isPositiveAndBelow (internalIndex, internalTypes.size()))
        return PluginDescriptionAndPreference { internalTypes[(size_t) internalIndex] };

    const auto externalIndex = menuID - menuIDBase;

    if (isPositiveAndBelow (externalIndex, pluginDescriptionsAndPreference.size()))
        return pluginDescriptionsAndPreference[externalIndex];

    return {};
}

//==============================================================================
ApplicationCommandTarget* MainHostWindow::getNextCommandTarget()
{
    return findFirstTargetParentComponent();
}

void MainHostWindow::getAllCommands (Array<CommandID>& commands)
{
    // this returns the set of all commands that this target can perform..
    const CommandID ids[] = {
                             #if ! (JUCE_IOS || JUCE_ANDROID)
                              CommandIDs::newFile,
                              CommandIDs::open,
                              CommandIDs::save,
                              CommandIDs::saveAs,
                             #endif
                              CommandIDs::showPluginListEditor,
                              CommandIDs::showAudioSettings,
                              CommandIDs::toggleDoublePrecision,
                              CommandIDs::aboutBox,
                              CommandIDs::allWindowsForward,
                              CommandIDs::autoScalePluginWindows,
                              CommandIDs::showGraph,
                              CommandIDs::toggleMidiKeyboard,
                              CommandIDs::pingSequencer,
                              CommandIDs::saveSequencerState,
                              CommandIDs::loadSequencerState,
                              CommandIDs::newProject,
                              CommandIDs::openProject,
                              CommandIDs::showSettings
                            };

    commands.addArray (ids, numElementsInArray (ids));
}

void MainHostWindow::getCommandInfo (const CommandID commandID, ApplicationCommandInfo& result)
{
    const String category ("General");

    switch (commandID)
    {
   #if ! (JUCE_IOS || JUCE_ANDROID)
    case CommandIDs::newFile:
        result.setInfo ("New", "Creates a new filter graph file", category, 0);
        result.defaultKeypresses.add (KeyPress ('n', ModifierKeys::commandModifier, 0));
        break;

    case CommandIDs::open:
        result.setInfo ("Open...", "Opens a filter graph file", category, 0);
        result.defaultKeypresses.add (KeyPress ('o', ModifierKeys::commandModifier, 0));
        break;

    case CommandIDs::save:
        result.setInfo ("Save", "Saves the current graph to a file", category, 0);
        result.defaultKeypresses.add (KeyPress ('s', ModifierKeys::commandModifier, 0));
        break;

    case CommandIDs::saveAs:
        result.setInfo ("Save As...",
                        "Saves a copy of the current graph to a file",
                        category, 0);
        result.defaultKeypresses.add (KeyPress ('s', ModifierKeys::shiftModifier | ModifierKeys::commandModifier, 0));
        break;
   #endif

    case CommandIDs::showPluginListEditor:
        result.setInfo ("Edit the List of Available Plug-ins...", {}, category, 0);
        result.addDefaultKeypress ('p', ModifierKeys::commandModifier);
        break;

    case CommandIDs::showAudioSettings:
        result.setInfo ("Change the Audio Device Settings", {}, category, 0);
        result.addDefaultKeypress ('a', ModifierKeys::commandModifier);
        break;

    case CommandIDs::toggleDoublePrecision:
        updatePrecisionMenuItem (result);
        break;

    case CommandIDs::aboutBox:
        result.setInfo ("About...", {}, category, 0);
        break;

    case CommandIDs::allWindowsForward:
        result.setInfo ("All Windows Forward", "Bring all plug-in windows forward", category, 0);
        result.addDefaultKeypress ('w', ModifierKeys::commandModifier);
        break;

    case CommandIDs::autoScalePluginWindows:
        updateAutoScaleMenuItem (result);
        break;

    case CommandIDs::showGraph:
        result.setInfo ("Show Graph Editor", "Show or hide the plugin graph editor", category, 0);
        result.setTicked (graphHolder != nullptr && graphHolder->isGraphPanelVisible());
        break;

    case CommandIDs::toggleMidiKeyboard:
        result.setInfo ("Show MIDI Keyboard", "Show or hide the MIDI keyboard", category, 0);
        result.setTicked (graphHolder != nullptr && graphHolder->isMidiKeyboardVisible());
        break;

    case CommandIDs::pingSequencer:
        result.setInfo ("Ping Sequencer", "Test JavaScript communication with sequencer", category, 0);
        break;

    case CommandIDs::saveSequencerState:
        result.setInfo("Save Project", "Save the Project", category, 0);
        break;

    case CommandIDs::loadSequencerState:
        result.setInfo("Load SequencerState", "Test JavaScript communication with sequencer", category, 0);
        break;

    case CommandIDs::newProject:
        result.setInfo("New Project...", "Create a new project folder", category, 0);
        result.addDefaultKeypress('n', ModifierKeys::commandModifier | ModifierKeys::shiftModifier);
        break;

    case CommandIDs::openProject:
        result.setInfo("Open Project...", "Open an existing project folder", category, 0);
        result.addDefaultKeypress('o', ModifierKeys::commandModifier | ModifierKeys::shiftModifier);
        break;

    case CommandIDs::showSettings:
        result.setInfo("Settings...", "Application settings", category, 0);
        break;

    default:
        break;
    }
}

bool MainHostWindow::perform (const InvocationInfo& info)
{
    switch (info.commandID)
    {
   #if ! (JUCE_IOS || JUCE_ANDROID)
    case CommandIDs::newFile:
        if (graphHolder != nullptr && graphHolder->graph != nullptr)
        {
            SafePointer<MainHostWindow> parent { this };
            graphHolder->graph->saveIfNeededAndUserAgreesAsync ([parent] (FileBasedDocument::SaveResult r)
            {
                if (parent == nullptr)
                    return;

                if (r == FileBasedDocument::savedOk)
                    parent->graphHolder->graph->newDocument();
            });
        }
        break;

    case CommandIDs::open:
         if (graphHolder != nullptr && graphHolder->graph != nullptr)
         {
             SafePointer<MainHostWindow> parent { this };
             graphHolder->graph->saveIfNeededAndUserAgreesAsync ([parent] (FileBasedDocument::SaveResult r)
             {
                 if (parent == nullptr)
                     return;

                 if (r == FileBasedDocument::savedOk)
                     parent->graphHolder->graph->loadFromUserSpecifiedFileAsync (true, [] (Result) {});
             });
         }
        break;

    case CommandIDs::save:
        if (graphHolder != nullptr && graphHolder->graph != nullptr)
            graphHolder->graph->saveAsync (true, true, nullptr);
        break;

    case CommandIDs::saveAs:
        if (graphHolder != nullptr && graphHolder->graph != nullptr)
            graphHolder->graph->saveAsAsync ({}, true, true, true, nullptr);
        break;
   #endif

    case CommandIDs::showPluginListEditor:
        if (pluginListWindow == nullptr)
            pluginListWindow.reset (new PluginListWindow (*this, formatManager));

        pluginListWindow->toFront (true);
        break;

    case CommandIDs::showAudioSettings:
        showAudioSettings();
        break;

    case CommandIDs::toggleDoublePrecision:
        if (auto* props = getAppProperties().getUserSettings())
        {
            auto newIsDoublePrecision = ! isDoublePrecisionProcessingEnabled();
            props->setValue ("doublePrecisionProcessing", var (newIsDoublePrecision));

            ApplicationCommandInfo cmdInfo (info.commandID);
            updatePrecisionMenuItem (cmdInfo);
            menuItemsChanged();

            if (graphHolder != nullptr)
                graphHolder->setDoublePrecision (newIsDoublePrecision);
        }
        break;

    case CommandIDs::autoScalePluginWindows:
        if (auto* props = getAppProperties().getUserSettings())
        {
            auto newAutoScale = ! isAutoScalePluginWindowsEnabled();
            props->setValue ("autoScalePluginWindows", var (newAutoScale));

            ApplicationCommandInfo cmdInfo (info.commandID);
            updateAutoScaleMenuItem (cmdInfo);
            menuItemsChanged();
        }
        break;

    case CommandIDs::aboutBox:
        AlertWindow::showMessageBoxAsync(MessageBoxIconType::InfoIcon,
                                         "About",
                                         "GrooviXBeat (BETA) V 1.0 " __DATE__ " " __TIME__);
        break;

    case CommandIDs::allWindowsForward:
    {
        auto& desktop = Desktop::getInstance();

        for (int i = 0; i < desktop.getNumComponents(); ++i)
            desktop.getComponent (i)->toBehind (this);

        break;
    }

    case CommandIDs::showGraph:
        if (graphHolder != nullptr)
        {
            graphHolder->toggleGraphPanel();
            menuItemsChanged();
        }
        break;

    case CommandIDs::toggleMidiKeyboard:
        if (graphHolder != nullptr)
        {
            graphHolder->toggleMidiKeyboard();
            menuItemsChanged();
        }
        break;

    case CommandIDs::pingSequencer:
        if (graphHolder != nullptr)
            graphHolder->pingSequencer();
        break;

    case CommandIDs::saveSequencerState:
        if (graphHolder != nullptr)
            graphHolder->saveSequencerState();
        break;

    case CommandIDs::loadSequencerState:
        if (graphHolder != nullptr)
            graphHolder->loadSequencerState();
        break;

    case CommandIDs::newProject:
        if (graphHolder != nullptr)
            graphHolder->newProject();
        break;

    case CommandIDs::openProject:
        if (graphHolder != nullptr)
            graphHolder->openProject();
        break;

    case CommandIDs::showSettings:
        showSettingsDialog();
        break;

    default:
        return false;
    }

    return true;
}

// Custom component: TextEditor + "..." browse button side by side (for settings dialog)
class SettingsFolderBrowseComponent : public Component
{
public:
    SettingsFolderBrowseComponent (const String& labelText, const String& initialPath)
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
            "Select samples folder", startDir, "", true);

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

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SettingsFolderBrowseComponent)
};

void MainHostWindow::showSettingsDialog()
{
    // Read current values from settings
    String currentSamplesPath;
    String currentSoundFontPath;
    String currentProjectsPath;
    if (auto* props = getAppProperties().getUserSettings())
    {
        currentSamplesPath = props->getValue("samplesPath", "");
        currentSoundFontPath = props->getValue("soundFontPath", "");
        currentProjectsPath = props->getValue("projectsFolder", "");
    }

    auto projectsBrowse = std::make_shared<SettingsFolderBrowseComponent>("Projects Folder:", currentProjectsPath);
    auto samplesBrowse = std::make_shared<SettingsFolderBrowseComponent>("Samples Folder:", currentSamplesPath);
    auto soundFontBrowse = std::make_shared<SettingsFolderBrowseComponent>("SoundFont Folder:", currentSoundFontPath);

    auto* alertWindow = new AlertWindow(
        "Settings",
        "Configure application settings:",
        AlertWindow::NoIcon
    );

    alertWindow->addCustomComponent(projectsBrowse.get());
    alertWindow->addCustomComponent(samplesBrowse.get());
    alertWindow->addCustomComponent(soundFontBrowse.get());
    alertWindow->addButton("Save", 1, KeyPress(KeyPress::returnKey));
    alertWindow->addButton("Cancel", 0, KeyPress(KeyPress::escapeKey));

    alertWindow->enterModalState(true, ModalCallbackFunction::create(
        [this, alertWindow, projectsBrowse, samplesBrowse, soundFontBrowse](int result)
        {
            if (result == 1)
            {
                String projectsPath = projectsBrowse->getText().trim();
                String samplesPath = samplesBrowse->getText().trim();
                String soundFontPath = soundFontBrowse->getText().trim();

                if (auto* props = getAppProperties().getUserSettings())
                {
                    props->setValue("projectsFolder", projectsPath);
                    props->setValue("samplesPath", samplesPath);
                    props->setValue("soundFontPath", soundFontPath);
                    props->saveIfNeeded();
                }
            }

            delete alertWindow;
        }
    ), true);
}

void MainHostWindow::showAudioSettings()
{
    auto* audioSettingsComp = new AudioDeviceSelectorComponent (deviceManager,
                                                                0, 256,
                                                                0, 256,
                                                                true, true,
                                                                true, false);

    audioSettingsComp->setSize (500, 450);

    DialogWindow::LaunchOptions o;
    o.content.setOwned (audioSettingsComp);
    o.dialogTitle                   = "Audio Settings";
    o.componentToCentreAround       = this;
    o.dialogBackgroundColour        = getLookAndFeel().findColour (ResizableWindow::backgroundColourId);
    o.escapeKeyTriggersCloseButton  = true;
    o.useNativeTitleBar             = false;
    o.resizable                     = false;

     auto* w = o.create();
     auto safeThis = SafePointer<MainHostWindow> (this);

     w->enterModalState (true,
                         ModalCallbackFunction::create
                         ([safeThis] (int)
                         {
                             auto audioState = safeThis->deviceManager.createStateXml();

                             getAppProperties().getUserSettings()->setValue ("audioDeviceState", audioState.get());
                             getAppProperties().getUserSettings()->saveIfNeeded();

                             if (safeThis->graphHolder != nullptr)
                                 if (safeThis->graphHolder->graph != nullptr)
                                     safeThis->graphHolder->graph->graph.removeIllegalConnections();
                         }), true);
}

bool MainHostWindow::isInterestedInFileDrag (const StringArray&)
{
    return true;
}

void MainHostWindow::fileDragEnter (const StringArray&, int, int)
{
}

void MainHostWindow::fileDragMove (const StringArray&, int, int)
{
}

void MainHostWindow::fileDragExit (const StringArray&)
{
}

void MainHostWindow::filesDropped (const StringArray& files, int x, int y)
{
    if (graphHolder != nullptr)
    {
       #if ! (JUCE_ANDROID || JUCE_IOS)
        File firstFile { files[0] };

        if (files.size() == 1 && firstFile.hasFileExtension (PluginGraph::getFilenameSuffix()))
        {
            if (auto* g = graphHolder->graph.get())
            {
                SafePointer<MainHostWindow> parent;
                g->saveIfNeededAndUserAgreesAsync ([parent, g, firstFile] (FileBasedDocument::SaveResult r)
                {
                    if (parent == nullptr)
                        return;

                    if (r == FileBasedDocument::savedOk)
                        g->loadFrom (firstFile, true);
                });
            }
        }
        else
       #endif
        {
            OwnedArray<PluginDescription> typesFound;
            knownPluginList.scanAndAddDragAndDroppedFiles (formatManager, files, typesFound);

            auto pos = graphHolder->getLocalPoint (this, Point<int> (x, y));

            for (int i = 0; i < jmin (5, typesFound.size()); ++i)
                if (auto* desc = typesFound.getUnchecked (i))
                    createPlugin (PluginDescriptionAndPreference { *desc }, pos);
        }
    }
}

bool MainHostWindow::isDoublePrecisionProcessingEnabled()
{
    if (auto* props = getAppProperties().getUserSettings())
        return props->getBoolValue ("doublePrecisionProcessing", false);

    return false;
}

bool MainHostWindow::isAutoScalePluginWindowsEnabled()
{
    if (auto* props = getAppProperties().getUserSettings())
        return props->getBoolValue ("autoScalePluginWindows", false);

    return false;
}

void MainHostWindow::updatePrecisionMenuItem (ApplicationCommandInfo& info)
{
    info.setInfo ("Double Floating-Point Precision Rendering", {}, "General", 0);
    info.setTicked (isDoublePrecisionProcessingEnabled());
}

void MainHostWindow::updateAutoScaleMenuItem (ApplicationCommandInfo& info)
{
    info.setInfo ("Auto-Scale Plug-in Windows", {}, "General", 0);
    info.setTicked (isAutoScalePluginWindowsEnabled());
}
