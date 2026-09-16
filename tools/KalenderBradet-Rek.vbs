' Dold startare: KalenderBradet-Rek - kor "node tools/daglig-rek.js" utan konsolfonster.
Option Explicit
Dim sh, rc
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("""C:\Program Files\nodejs\node.exe"" ""E:\CHAT-RTX\CLAUDECODE GENERAL BRAIN\APP ideas\kalender-bradet\tools\daglig-rek.js""", 0, True)
WScript.Quit rc
