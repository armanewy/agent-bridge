# AgentBridge Chrome Extension

This is the Wave 2 Manifest V3 skeleton for explicit browser source binding and selected-text capture.

## Development

```powershell
pnpm --filter @agentbridge/extension build
```

Then load `apps/extension` as an unpacked extension in Chrome.

## Permissions

- `activeTab`: access the user-invoked active tab.
- `scripting`: inject a small capture function only after the user clicks a popup action.
- `nativeMessaging`: send local events to the AgentBridge native host.

No broad host permissions are requested. The extension does not register all-page content scripts; selected text and ChatGPT latest-message capture run through explicit `chrome.scripting.executeScript` calls after user action.

## Manual Test Checklist

1. Build the extension.
2. Load `apps/extension` unpacked in Chrome.
3. Register the native host using the development manifest.
4. Open a page and click "Bind current tab as source".
5. Select text on the page and click "Capture selected text".
6. Verify the popup shows a clear error when the native host is not registered.

The extension includes a cautious ChatGPT latest assistant message adapter. It runs only when the user clicks the popup action. If selectors fail, use selected-text capture instead.
