# Chrome Extension Production Path

AgentBridge Simple Mode uses the Chrome extension as the production capture path. Clipboard, manual, and mock capture are development/debug tools only because they lose browser-tab identity, URL/title metadata, and durable source provenance.

## Required Identity

Chrome native messaging requires the native-host manifest to allow an exact extension origin:

```text
chrome-extension://<extension-id>/
```

Production builds must provide:

```text
AGENTBRIDGE_CHROME_EXTENSION_ID=<32-letter chrome extension id>
AGENTBRIDGE_CHROME_WEB_STORE_URL=<published listing url>
```

The desktop app uses these values to register or repair the native host without asking the user to paste an extension ID.

## Pre-Production Stable ID

For dogfooding before Web Store publication:

1. Upload the extension ZIP to the Chrome Developer Dashboard without publishing.
2. Copy the extension public key.
3. Add that key to the extension manifest `key` field for the dogfood build.
4. Configure the desktop app with the resulting stable extension ID.
5. Keep manual extension ID entry only in Advanced diagnostics for unpacked development builds.

`AGENTBRIDGE_CHROME_EXTENSION_PUBLIC_KEY` is tracked by setup status so dogfood builds can be distinguished from fully manual development.

## User Flow

1. User opens AgentBridge.
2. Start page shows `No ChatGPT tabs found`.
3. User clicks `Connect Chrome`.
4. AgentBridge registers or repairs `com.agentbridge.native_host`.
5. AgentBridge opens the Chrome Web Store listing when configured.
6. User installs the extension.
7. Extension popup shows desktop connection status.
8. User opens ChatGPT and clicks `Sync this ChatGPT tab`.
9. Desktop app lists the existing ChatGPT tab for linking.

## Extension Popup

Production actions are:

- `Sync this ChatGPT tab`
- `Capture selected text`
- `Capture latest answer`
- `Show all ChatGPT tabs`
- `Check desktop connection`

Diagnostics expose native-host response details, extension ID, version, and permission mode. No page content is read during tab sync; capture remains user-triggered.
