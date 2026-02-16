This is the x64 Binary of the GroovixBeat Groove box. This was written in JUCE framework.


GroovixBeatJS folder contains the HTML+CSS+JS Ui for the app.
GrooviXBeat has the Juce C++ App.

For Debug and Testing Edit \GrooviXBeat\Source\UI\SequencerComponent.cpp
to point to the place where you have the Juce File.

#define LOCAL_WWW_ROOT  "D:/Ganesh/GrooviXBeat/GroovixBeatJS/"

For Release Builds 
You can zip up the GroovixBeatJS and use projucer to create the binary CPP to be directly included in the EXE.



Acknowledgements.

https://juce.com/
https://docs.abcjs.net/
