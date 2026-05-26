# Windows Desktop Target Adapter Spec

## Windows Helper Architecture

- C#/.NET console helper process.
- Desktop companion invokes the helper as a child process.
- Helper communicates over line-delimited JSON on stdin/stdout for simple request/response operation.
- Each command returns structured JSON with `success`, `errors`, metadata, warnings, and command-specific payload.

## Window Discovery

The helper should expose:

- `listTopLevelWindows`
- `getForegroundWindow`
- `inspectWindow`

Window metadata should include:

- `hwnd`
- `processId`
- `title`
- `executablePath` where available
- `className`
- visibility/minimized state where available

## Target Binding

- User selects a window or binds the foreground window.
- Desktop stores a `WindowsDesktopWindowTarget` with stable metadata.
- Before delivery, the helper revalidates the target using hwnd, process ID, executable path, class name, and title.
- Changed targets require explicit user acknowledgement or rebind.

## Input Control Discovery

The helper should expose `findEditableTargets { hwnd }`.

Candidate controls should include:

- UIA control type
- automation ID
- name
- bounding rectangle where available
- supported patterns:
  - `ValuePattern`
  - `TextPattern`
  - `TextPattern2`
  - invoke/selection/focus patterns when useful
- enabled/focusable state

Discovery priority:

1. Focused editable control inside target window.
2. Likely composer/textbox controls.
3. Other controls exposing safe settable text patterns.

## Delivery Strategy Priority

1. `ValuePattern.SetValue` if supported and safe.
2. Text-related UIA pattern if it supports insertion in the target control.
3. Focus plus approved paste fallback.
4. Send-keys fallback only with explicit user warning.

Clipboard and send-key strategies must never be the default.

## Wrong-Target Prevention

- Show window title, process, path, and class before delivery.
- Revalidate hwnd/process/title before delivery.
- Require approval when target metadata changed.
- Block delivery when the target cannot be found or clearly resolves to a different process/window.

## Test Targets

- Notepad.
- Windows Terminal or PowerShell.
- VS Code or another Electron app if available.
- Codex app if installed, but Codex deep links remain the preferred Codex path.

## Risks

- Custom controls may not expose useful UIA patterns.
- Electron and WebView applications vary in accessibility tree quality.
- Terminal controls may not support safe text insertion through UIA.
- Tabs inside native apps may not be visible as top-level UIA targets.
- Clipboard fallback can leak sensitive text if not approved and restored carefully.
