# Quick Actions

AgentBridge should be usable from normal developer flow without living in the dashboard.

## Implemented

- Chrome extension command: `Ctrl+Shift+Y` captures selected text from the active tab through explicit `chrome.scripting.executeScript`.
- Desktop shortcut: `Ctrl+Shift+A` focuses AgentBridge and opens the Inbox.
- Tray menu:
  - Open AgentBridge
  - Create Task from latest capture
  - Open latest task
  - Quit

## Behavior

Quick actions route into the same safe flow as the visible UI:

```text
latest capture
-> Inbox
-> Task Card Preview
-> Send to Codex or save draft
```

The extension never scrapes in the background. Browser capture remains user-triggered by popup click or shortcut. Desktop quick actions do not run verification automatically; they open the task surface where the user must confirm local command execution.

## Manual Test

1. Build the extension and desktop app.
2. Load the extension unpacked in Chrome.
3. Register the native host from Settings.
4. Select text in a browser tab.
5. Press `Ctrl+Shift+Y`.
6. Open or focus AgentBridge with `Ctrl+Shift+A`.
7. Confirm the capture appears in Inbox.
8. Use the tray menu item "Create Task from latest capture" and confirm the Task Card Preview opens.
