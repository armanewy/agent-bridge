# ChatGPT Desktop Adapter

## Goal

AgentBridge can link a ChatGPT Desktop conversation candidate into the same durable workflow used for Chrome ChatGPT tabs:

```text
ChatGPT Desktop conversation -> repo -> Codex existing or new thread
```

This is intentionally a capability-probed source, not a generic copy/paste path. Clipboard capture is not a production source route because it loses source identity, URL/title/session metadata, and durable provenance.

## Current Capability

The Windows UIA helper exposes probe commands:

- `listChatGptWindows`
- `inspectChatGptWindow`
- `captureChatGptSelectedText`
- `captureChatGptVisibleMessages`
- `getChatGptActiveConversationCandidate`

The probe reports:

- whether a ChatGPT Desktop window was detected
- whether UIA exposes selected text
- whether UIA exposes visible message text
- whether session listing is available
- confidence: `high`, `medium`, or `low`
- a small raw UIA excerpt for diagnostics

The desktop component discovery service maps detected ChatGPT Desktop windows to `LinkableComponent` records with provider `chatgptDesktop`. The Start page can switch between `Chrome ChatGPT` and `ChatGPT Desktop` source modes.

## Feasibility Matrix

| Grade | Meaning | Product behavior |
| --- | --- | --- |
| A | UIA exposes session list, current conversation, selected text, and visible messages | Enable desktop session source normally |
| B | UIA exposes current visible conversation plus selected text or visible messages | Enable current conversation candidate with medium confidence |
| C | UIA detects only the window, with no reliable text | Show detected but unsupported |
| D | ChatGPT Desktop is not visible through UIA | Do not offer as source |

The current implementation is a B/C probe. It does not promise enumeration of all internal ChatGPT Desktop conversations or tabs.

## Safety Rules

- Do not scrape continuously.
- Do not use clipboard as the simple-mode source path.
- Do not claim internal ChatGPT tabs are available unless UIA exposes them.
- Capture still requires user action.
- Store the source fingerprint, hwnd/process metadata, capability report, and confidence with the component.

## Codex Pairing

The Codex side should target sessions/threads, not generic desktop UI tabs:

- Existing thread with App Server: `thread/resume` then `turn/start`.
- Existing thread fallback: open `codex://threads/<thread-id>` and keep the prompt staged in AgentBridge.
- New thread fallback: `codex://threads/new?prompt=...&path=...`.

Codex desktop window detection remains a readiness signal; delivery should prefer App Server or deep links.
