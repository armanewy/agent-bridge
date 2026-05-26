# Security, Privacy, And Terms-Risk Model

## Threat Model

- Malicious extension compromise: extension could attempt to over-capture page data or send it to a malicious native host.
- Wrong-target delivery: transformed prompt could be sent to the wrong window or repository.
- Secret leakage: captures may include credentials, tokens, private keys, or internal data.
- Prompt injection in captured content: captured text can ask the target agent to ignore constraints or perform unsafe actions.
- Unintended command execution: terminal-like targets could execute text if delivery includes newlines or send-key behavior.
- Target app spoofing: a malicious or unrelated window could mimic the expected title.
- Local audit log exposure: persisted handoffs may contain sensitive content.

## Required MVP Mitigations

- User-triggered capture only.
- Explicit approval preview before delivery.
- Local-only storage by default.
- Minimal Chrome permissions.
- Target revalidation before send.
- Secret detection and redaction warnings before approval.
- No silent terminal execution.
- No automatic repeated scraping.
- Clear display of source, target, strategy, and prompt before send.

## Permission Model

### Browser Source

- `activeTab` for current tab access after explicit user gesture.
- `nativeMessaging` for local host communication.
- `scripting` only for explicit selection extraction.
- No broad host permissions in the MVP.

### Native Host

- Registered locally by the user/developer.
- Accepts only structured native messaging commands.
- Validates message type and payload shape.
- Does not send data over the network.

### Windows UI Automation

- Uses normal user-session UI Automation access.
- Cannot reliably access all elevated or protected windows.
- Must revalidate the selected window before delivery.
- Clipboard fallback is separate and approval-gated.

## Audit Model

Log:

- what source was bound
- what target was bound
- capture metadata and redacted capture text where appropriate
- transform recipe and handoff summary
- approval decision
- delivery strategy and result

Support local deletion:

- delete one handoff
- clear audit log
- delete persisted settings

Avoid storing unnecessary secrets. If high-severity redaction findings exist, store redacted text by default unless the user explicitly chooses full local storage.

## Policy Recommendations

- Avoid consumer AI UI automation where an official API, SDK, deep link, or selected-text workflow exists.
- Do not implement silent background scraping of ChatGPT or other AI web output.
- Prefer user-selected text and user-invoked latest-message capture with visible confirmation.
- Treat Codex as a privileged adapter with documented deep links first and SDK/app-server integration as a later spike.
- Clearly warn when fallback delivery uses clipboard or keystroke injection.

## MVP Acceptance Checklist

- Capture is impossible without an explicit user action.
- Extension permissions remain narrow.
- Preview is shown before every delivery.
- Target metadata is displayed and revalidated.
- Clipboard fallback cannot run unless explicitly approved for that handoff.
- Redaction findings are shown before approval.
- Audit data is local and deletable.
- Codex uses deep links instead of UI automation for MVP delivery.
