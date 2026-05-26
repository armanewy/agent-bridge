# AgentBridge Chrome Extension

This is the Wave 2 Manifest V3 skeleton for explicit browser source binding and selected-text capture.

## Development

```powershell
pnpm --filter @agentbridge/extension build
```

Then load `apps/extension` as an unpacked extension in Chrome.

## Permissions

- `activeTab`: access the user-invoked active tab.
- `scripting`: read selected text when the user clicks capture.
- `nativeMessaging`: send local events to the AgentBridge native host.

No broad host permissions are requested in this skeleton.

## Manual Test Checklist

1. Build the extension.
2. Load `apps/extension` unpacked in Chrome.
3. Register the native host using the development manifest.
4. Open a page and click "Bind current tab as source".
5. Select text on the page and click "Capture selected text".
6. Verify the popup shows a clear error when the native host is not registered.

The extension does not implement ChatGPT DOM-specific extraction yet. It only captures selected text after a user action.
