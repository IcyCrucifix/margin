from __future__ import annotations

import subprocess


PICKER_SCRIPT = r'''
use framework "AppKit"
use scripting additions

set applicationObject to current application's NSApplication's sharedApplication()
applicationObject's setActivationPolicy:1
set panel to current application's NSOpenPanel's openPanel()
panel's setTitle:"Choose a lecture file or folder"
panel's setPrompt:"Open"
panel's setCanChooseFiles:true
panel's setCanChooseDirectories:true
panel's setAllowsMultipleSelection:false
panel's setResolvesAliases:true
panel's setAllowedFileTypes:{"pdf", "pptx"}
applicationObject's activateIgnoringOtherApps:true
set response to panel's runModal()
if response is not current application's NSModalResponseOK then error number -128
return (panel's URL()'s |path|()) as text
'''


class SourcePickerCancelled(RuntimeError):
    pass


def choose_source_path() -> str:
    process = subprocess.run(
        ["/usr/bin/osascript", "-e", PICKER_SCRIPT],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if process.returncode:
        message = (process.stderr or process.stdout).strip()
        if "-128" in message or "User canceled" in message:
            raise SourcePickerCancelled("Source selection was canceled.")
        raise RuntimeError("Margin could not open the file and folder chooser.")
    selected = process.stdout.strip()
    if not selected:
        raise SourcePickerCancelled("Source selection was canceled.")
    return selected
