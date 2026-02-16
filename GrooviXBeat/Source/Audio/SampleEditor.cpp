/*
    SampleEditor - High-level sample editing API with undo support
*/

#include "SampleEditor.h"

//==============================================================================
SampleEditor::SampleEditor()
    : buffer(std::make_unique<SampleBuffer>())
{
}

SampleEditor::~SampleEditor()
{
}

//==============================================================================
// File Operations

bool SampleEditor::loadFromFile(const juce::File& file, double targetSampleRate)
{
    bool success = buffer->loadFromFile(file, targetSampleRate);

    if (success)
    {
        currentFilePath = file.getFullPathName();
        clearUndoHistory();
    }

    return success;
}

bool SampleEditor::loadFromBuffer(const juce::AudioBuffer<float>& sourceBuffer, double sampleRate)
{
    if (sourceBuffer.getNumSamples() == 0 || sampleRate <= 0)
        return false;

    buffer->loadFromBuffer(sourceBuffer, sampleRate);
    currentFilePath = {};  // No file path for cached buffers
    clearUndoHistory();

    return buffer->hasData();
}

bool SampleEditor::saveToFile(const juce::File& file)
{
    return buffer->saveToFile(file);
}

bool SampleEditor::isLoaded() const
{
    return buffer->hasData();
}

void SampleEditor::clear()
{
    buffer->clear();
    currentFilePath = {};
    clearUndoHistory();
}

//==============================================================================
// Buffer Access

double SampleEditor::getSampleRate() const
{
    return buffer->getSampleRate();
}

double SampleEditor::getDurationSeconds() const
{
    return buffer->getDurationSeconds();
}

int SampleEditor::getNumSamples() const
{
    return buffer->getNumSamples();
}

int SampleEditor::getNumChannels() const
{
    return buffer->getNumChannels();
}

//==============================================================================
// Editing Operations

void SampleEditor::timeStretch(double ratio, double targetLengthSeconds)
{
    if (!isLoaded() || ratio <= 0.0 || ratio == 1.0)
        return;

    pushUndoState();
    buffer->timeStretch(ratio, targetLengthSeconds);
}

void SampleEditor::applyWarp(double sampleBPM, double targetBPM, double targetLengthSeconds)
{
    if (!isLoaded() || targetBPM <= 0.0)
        return;

    pushUndoState();

    // If sample BPM provided, set it; otherwise detect
    if (sampleBPM > 0.0)
    {
        buffer->setDetectedBPM(sampleBPM);
    }
    else if (buffer->getDetectedBPM() <= 0.0)
    {
        buffer->detectBPM();
    }

    buffer->applyWarp(targetBPM, targetLengthSeconds);
}

double SampleEditor::detectBPM()
{
    if (!isLoaded())
        return 0.0;

    return buffer->detectBPM();
}

void SampleEditor::fadeIn(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    pushUndoState();
    buffer->fadeIn(startSample, numSamples);
}

void SampleEditor::fadeOut(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    pushUndoState();
    buffer->fadeOut(startSample, numSamples);
}

void SampleEditor::silence(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    pushUndoState();
    buffer->silence(startSample, numSamples);
}

void SampleEditor::trim(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    pushUndoState();
    buffer->trim(startSample, numSamples);
}

void SampleEditor::deleteRange(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    pushUndoState();
    buffer->deleteRange(startSample, numSamples);
}

void SampleEditor::copyRange(double startSeconds, double endSeconds)
{
    if (!isLoaded())
        return;

    int startSample = secondsToSamples(startSeconds);
    int endSample = secondsToSamples(endSeconds);
    int numSamples = endSample - startSample;

    if (numSamples <= 0)
        return;

    clipboard = buffer->copyRange(startSample, numSamples);
    clipboardSampleRate = buffer->getSampleRate();

    DBG("SampleEditor: Copied " + juce::String(numSamples) + " samples to clipboard");
}

void SampleEditor::insertClipboard(double positionSeconds)
{
    if (!isLoaded() || clipboard.getNumSamples() == 0)
        return;

    int insertPosition = secondsToSamples(positionSeconds);

    pushUndoState();
    buffer->insertBuffer(clipboard, insertPosition);

    DBG("SampleEditor: Inserted clipboard at " + juce::String(positionSeconds, 3) + "s");
}

bool SampleEditor::hasClipboardData() const
{
    return clipboard.getNumSamples() > 0;
}

void SampleEditor::clearClipboard()
{
    clipboard.setSize(0, 0);
    clipboardSampleRate = 0.0;
}

//==============================================================================
// Playback Offset

void SampleEditor::setPlaybackOffset(double offsetSeconds)
{
    if (buffer)
        buffer->setPlaybackOffset(offsetSeconds);
}

double SampleEditor::getPlaybackOffset() const
{
    return buffer ? buffer->getPlaybackOffset() : 0.0;
}

void SampleEditor::offsetBy(double deltaSeconds)
{
    if (buffer)
    {
        double currentOffset = buffer->getPlaybackOffset();
        buffer->setPlaybackOffset(currentOffset + deltaSeconds);
    }
}

//==============================================================================
// Non-Destructive Editing

void SampleEditor::reset()
{
    if (!isLoaded())
        return;

    pushUndoState();
    buffer->reset();
}

//==============================================================================
// Undo/Redo

void SampleEditor::pushUndoState()
{
    if (!isLoaded())
        return;

    // Capture current state
    UndoState state = captureState();

    // Push to undo stack
    undoStack.push_back(std::move(state));

    // Limit undo stack size
    while (static_cast<int>(undoStack.size()) > maxUndoStates)
    {
        undoStack.erase(undoStack.begin());
    }

    // Clear redo stack (new action invalidates redo history)
    redoStack.clear();
}

void SampleEditor::undo()
{
    if (!canUndo())
        return;

    // Save current state to redo stack
    redoStack.push_back(captureState());

    // Restore from undo stack
    UndoState& state = undoStack.back();
    restoreState(state);
    undoStack.pop_back();
}

void SampleEditor::redo()
{
    if (!canRedo())
        return;

    // Save current state to undo stack
    undoStack.push_back(captureState());

    // Restore from redo stack
    UndoState& state = redoStack.back();
    restoreState(state);
    redoStack.pop_back();
}

bool SampleEditor::canUndo() const
{
    return !undoStack.empty();
}

bool SampleEditor::canRedo() const
{
    return !redoStack.empty();
}

void SampleEditor::clearUndoHistory()
{
    undoStack.clear();
    redoStack.clear();
}

void SampleEditor::setMaxUndoStates(int maxStates)
{
    maxUndoStates = juce::jmax(1, maxStates);

    // Trim undo stack if necessary
    while (static_cast<int>(undoStack.size()) > maxUndoStates)
    {
        undoStack.erase(undoStack.begin());
    }
}

//==============================================================================
// Helpers

int SampleEditor::secondsToSamples(double seconds) const
{
    if (!buffer || buffer->getSampleRate() <= 0)
        return 0;

    return static_cast<int>(seconds * buffer->getSampleRate());
}

SampleEditor::UndoState SampleEditor::captureState() const
{
    UndoState state;

    if (buffer)
    {
        juce::ScopedLock sl(buffer->getLock());

        // Copy buffer data
        int numChannels = buffer->getNumChannels();
        int numSamples = buffer->getNumSamples();

        state.data.setSize(numChannels, numSamples);
        for (int ch = 0; ch < numChannels; ++ch)
        {
            const float* src = buffer->getReadPointer(ch);
            if (src)
            {
                std::memcpy(state.data.getWritePointer(ch), src,
                           sizeof(float) * static_cast<size_t>(numSamples));
            }
        }

        state.sampleRate = buffer->getSampleRate();
        state.detectedBPM = buffer->getDetectedBPM();
        state.stretchFactor = buffer->getStretchFactor();
        state.playbackOffset = buffer->getPlaybackOffset();
    }

    return state;
}

void SampleEditor::restoreState(const UndoState& state)
{
    if (!buffer)
        return;

    buffer->loadFromBuffer(state.data, state.sampleRate);
    buffer->setDetectedBPM(state.detectedBPM);
    buffer->setPlaybackOffset(state.playbackOffset);
}
