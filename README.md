This is Source code for the GroovixBeat Groove box. This was written in JUCE framework.

This was an app I wanted personally so developed it with a lot of help with AI. I would not call it "Vibe Coding"
since it took about a Month and over 450 interactive Prompts in dozens of sessions and a couple of hundreed dollars in claude code costs.
It also involved mannual coding and debugging when it got stuck in loops and to get it working exactly as I wanted.

![Songs Screen](https://groovixlabs.com/groovixlabs/images/GroovixBeat_01.png)
![Clip Editor Screen](https://groovixlabs.com/groovixlabs/images/GroovixBeat_02.png)

GroovixBeat.zip file has the Window binary if you want to quickly give it a test run.


GroovixBeatJS folder contains the HTML+CSS+JS Ui for the app.
GrooviXBeat has the Juce C++ App.


You need Juce framework to build this.
Open the GrooviXBeat.jucer in Projucer and create the Visual Studio Code Project open it build and run.

For Debug and Testing Edit \GrooviXBeat\Source\UI\SequencerComponent.cpp
to point to the place where you have the HTML UI GroovixBeatJS Files.

#define LOCAL_WWW_ROOT  "D:/Ganesh/GrooviXBeat/GroovixBeatJS/"


For Release Builds 
You can zip up the GroovixBeatJS and use projucer to create the binary CPP to be directly included in the EXE.


Acknowledgements.

https://juce.com/
https://docs.abcjs.net/


Licence: 
The Non JUCE code here is MIT Licenced.
Please refer to JUCE Licence for their Licence terms https://juce.com/get-juce/
