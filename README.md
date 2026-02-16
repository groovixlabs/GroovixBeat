This is Source code for the GroovixBeat Groove box (BETA) . This was written in the JUCE framework with a lot of help from AI.

It uses a similar workflow to Korg Gadget IPad App. You create clips with Samples, Midi + VSTs or Midi + Sampled Instruments and sequence them into scenes and songs. There is also a live perfromance mode to trigger clips. The UI is in HTML CSS and JS and the time critical tasks like Sequencing and audio processing is done in the JUCE backend.

This was an app I wanted personally, and wanted to test the limits of AI assisted coding. It took about a Month and over 450 interactive Prompts over dozens of sessions. It also involved manual coding and debugging when it got stuck in loops and to get it working exactly as I wanted, but all in all happy with the outcome. 

![Songs Screen](https://groovixlabs.com/groovixlabs/images/GroovixBeat_01.png)
![Clip Editor Screen](https://groovixlabs.com/groovixlabs/images/GroovixBeat_02.png)

GroovixBeat.zip file has the Window binary if you want to quickly give it a test run.


GroovixBeatJS folder contains the HTML+CSS+JS Ui for the app.
GrooviXBeat has the Juice C++ App.


You need Juce framework to build this.
Open the GrooviXBeat.jucer in Projucer and create the Visual Studio Code Project open it build and run.

For Debug and Testing Edit \GrooviXBeat\Source\UI\SequencerComponent.cpp
to point to the place where you have the HTML UI GroovixBeatJS Files.

#define LOCAL_WWW_ROOT  "D:/Ganesh/GrooviXBeat/GroovixBeatJS/"


For Release Builds 
You can zip up the GroovixBeatJS and use PROJUCER to create the binary CPP to be directly included in the EXE.


Acknowledgements.

https://juce.com/
https://docs.abcjs.net/


Licence: 
The Non JUCE (HTML JS etc.) code here is MIT Licenced.
Please refer to JUCE Licence for their Licence terms https://juce.com/get-juce/

