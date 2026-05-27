# AgentBridge on macOS

macOS support targets the Workbench path first:

```text
choose repo -> import ChatGPT plan -> send TaskSpec to Codex -> verify -> review evidence
```

## Install

Use the packaged `.dmg` or `.zip` once built:

```sh
pnpm desktop:package:mac
```

Code signing and notarization are future production requirements.

## Configure

`CODEX_APP_SERVER_URL` is optional. Without it, new Codex thread deep links can still work if Codex has registered the `codex://` protocol, but existing-thread prompt injection requires the Codex App Server.

```sh
export CODEX_APP_SERVER_URL="http://127.0.0.1:..."
```

## Use

1. Open AgentBridge.
2. Choose a repo if Codex new-thread delivery or verification needs it.
3. Enter the mission.
4. Use the ChatGPT planner handoff and capture the selected plan.
5. Generate a TaskSpec.
6. Send the TaskSpec to Codex.
7. Run configured verification commands.
8. Review the evidence.

## Optional Browser Import

Chrome extension/native-host import is not required for the default Workbench. If enabled later, the macOS native host manifest lives under:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
```

The extension ID must still match the manifest `allowed_origins` exactly.
