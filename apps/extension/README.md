# AgentBridge Chrome Extension

This Manifest V3 extension captures selected browser text only after an explicit popup action or keyboard command.

## Development

```powershell
pnpm --filter @agentbridge/extension build
```

Then load `apps/extension` as an unpacked extension in Chrome.

## Permissions

- `activeTab`: access the user-invoked active tab.
- `scripting`: inject a small capture function only after the user clicks a popup action.
- `nativeMessaging`: send local events to the AgentBridge native host.
- optional `tabs`: list open browser tabs for Link Center discovery only after the user opts in.

No broad host permissions are requested. The extension does not register all-page content scripts; selected text and ChatGPT latest-message capture run through explicit `chrome.scripting.executeScript` calls after user action.

All-tab discovery does not scrape page content. It only sends tab metadata such as title, URL, favicon, active state, and provider classification so the desktop app can show linkable browser components.

## Quick Capture

The extension registers a keyboard command:

```text
Ctrl+Shift+Y
```

Chrome may require the user to confirm or change this shortcut at `chrome://extensions/shortcuts`. The shortcut captures selected text from the active tab and sends it to the local native host. The popup remains the visible error surface for native-host setup issues.

## Manual Test Checklist

1. Build the extension.
2. Load `apps/extension` unpacked in Chrome.
3. Register the native host using the development manifest.
4. Open a page and click "Bind current tab as source".
5. Select text on the page and click "Capture selected text".
6. Select text and press the keyboard shortcut.
7. Click "Discover tabs" and approve the optional browser-tab permission when prompted.
8. Verify the popup shows a clear error when the native host is not registered.

The extension includes a cautious ChatGPT latest assistant message adapter. It runs only when the user clicks the popup action. If selectors fail, use selected-text capture instead.
