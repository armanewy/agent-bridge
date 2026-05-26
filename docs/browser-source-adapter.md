# Browser Source Adapter Spec

## Extension Architecture

- Chrome Manifest V3 extension.
- Service worker owns command routing, active tab lookup, native messaging, and error handling.
- Content script handles explicit selected-text reads and page-adapter extraction when invoked.
- Popup/action UI exposes user-triggered commands:
  - bind current tab as source
  - capture selected text
  - capture latest message where a page adapter supports it
- Native messaging client sends structured events to the local AgentBridge host over Chrome native messaging.

## Permission Strategy

- Use `activeTab` for user-invoked access to the current tab.
- Use `scripting` only when needed to inject/read selection on explicit actions.
- Use `nativeMessaging` for local companion communication.
- Do not request broad host permissions by default.
- Request host permissions only for specific supported AI/web apps and only when a page adapter needs them.

## Source Binding Behavior

- On "Bind current tab as source", query the active tab and create a `BrowserTabSource` with title, URL, tab/window IDs, browser, and timestamp.
- Send source metadata to the native host for local persistence.
- Do not register broad all-page content scripts for MVP capture; inject capture code with `chrome.scripting.executeScript` only after a user action.
- Treat tab reload, URL change, or tab close as status changes rather than automatic capture triggers.
- Rebinding is explicit and updates the stored source metadata.

## Capture Behavior

Priority:

1. Selected text from the active tab.
2. Page-specific extractor for a supported domain and user-triggered action.
3. Visible text or screenshot capture only as a later extension.

No background polling, repeated harvesting, or silent extraction is allowed.

## Initial Page Adapters

- Generic selected text adapter for all pages reachable through `activeTab`.
- ChatGPT web best-effort latest assistant message adapter, user-triggered only, planned after selected-text capture is stable.
- Claude and Gemini placeholders only; no implementation in early waves.

## Message Protocol

### `bindSource`

```json
{
  "type": "bindSource",
  "source": {
    "kind": "browserTab",
    "browser": "chrome",
    "tabId": 123,
    "windowId": 45,
    "title": "Example",
    "url": "https://example.com"
  }
}
```

### `captureSelection`

```json
{
  "type": "capture",
  "captureType": "selectedText",
  "source": { "kind": "browserTab", "title": "Example", "url": "https://example.com" },
  "text": "selected content",
  "userTriggered": true
}
```

### `captureLatestMessage`

```json
{
  "type": "capture",
  "captureType": "latestMessage",
  "adapter": "chatgpt",
  "source": { "kind": "browserTab", "title": "ChatGPT", "url": "https://chatgpt.com/..." },
  "text": "assistant message",
  "userTriggered": true
}
```

### `getSourceStatus`

```json
{
  "type": "getSourceStatus",
  "sourceId": "src_..."
}
```

## Failure Modes

- No active tab: show "No active tab available".
- No permission: prompt the user to invoke the action again or grant the narrow permission.
- No selected text: show "Select text first or use a supported page capture action".
- Unsupported page: fall back to selected-text capture guidance.
- Native host unavailable: show native host setup guidance and keep the captured text visible locally in the popup.

## Test Plan

- Unit-test message builders and response handling.
- Fixture-test content script selection extraction.
- Manual-load unpacked extension and verify permission prompts are narrow.
- Verify no capture occurs on page load, tab update, or timer.
- Verify native host unavailable surfaces a user-visible error.
