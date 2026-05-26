# AgentBridge on macOS

macOS support targets the provider Workbench path first:

```text
choose repo -> ask OpenAI Planner -> send TaskSpec to Codex -> verify -> planner review
```

## Install

Use the packaged `.dmg` or `.zip` once built:

```sh
pnpm desktop:package:mac
```

Code signing and notarization are future production requirements.

## Configure

Set provider configuration before launching AgentBridge:

```sh
export OPENAI_API_KEY="..."
export CODEX_APP_SERVER_URL="http://127.0.0.1:..."
```

`CODEX_APP_SERVER_URL` is optional. Without it, new Codex thread deep links can still work if Codex has registered the `codex://` protocol, but existing-thread prompt injection requires the Codex App Server.

## Use

1. Open AgentBridge.
2. Choose a repo.
3. Ask the Planner what should be done.
4. Generate a TaskSpec.
5. Send the TaskSpec to Codex.
6. Run configured verification commands.
7. Ask the Planner to review verification output.

## Optional Browser Import

Chrome extension/native-host import is not required for the default Workbench. If enabled later, the macOS native host manifest lives under:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
```

The extension ID must still match the manifest `allowed_origins` exactly.
