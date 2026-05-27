# Platform Support

AgentBridge treats Windows and macOS as first-class desktop targets. The default Workbench path is OS-neutral:

```text
ChatGPT handoff -> Codex Executor Provider -> repo verification -> local artifacts
```

The core path does not require browser extensions, clipboard capture, Windows UI Automation, macOS Accessibility, or generic desktop automation.

## Platform Service

Desktop services that touch OS behavior should go through `PlatformService`:

- app data, artifact, staging, and log directories
- bundled resource resolution
- external links and local file/folder opening
- repo folder picker
- default verification shell
- platform capability checks

Current capability gating:

| Capability | Windows | macOS | Notes |
| --- | --- | --- | --- |
| Electron desktop app | yes | yes | Packaged app target on both platforms. |
| Codex App Server Executor | yes | yes | Preferred executor surface. |
| Codex deep-link fallback | yes | yes | Used only when platform reports support. |
| Verification commands | yes | yes | Runs configured commands only. |
| Chrome native messaging import | optional | optional | Advanced import adapter. |
| Windows UIA helper | advanced | no | Hidden from default Workbench. |
| macOS Accessibility helper | no | future | Not part of MVP. |

## Data Paths

The app uses Electron `app.getPath("userData")` in desktop mode. `AGENTBRIDGE_STORE_DIR` overrides storage for tests and development.

Default non-Electron fallback paths:

- Windows: `%LOCALAPPDATA%\AgentBridge`
- macOS: `~/Library/Application Support/AgentBridge`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/AgentBridge`

Artifacts, staging, and logs live under that root.

## Native Host Import

Chrome extension import is optional and Advanced-only. Native messaging setup is platform-specific:

- Windows uses the Chrome native messaging registry key.
- macOS uses `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`.

The default Workbench flow must remain functional without this adapter.
