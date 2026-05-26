# Codex Executor Provider

The Codex Executor provider is the first executor adapter in the provider workbench path. It wraps the existing Codex services rather than replacing them.

## Role

```text
TaskSpec
→ Codex executor prompt
→ new Codex thread or existing Codex thread
→ DeliveryAttempt / AgentTurn / Artifact
```

AgentBridge owns mission history, artifacts, verification, and review. Codex owns code execution.

## Provider Profile

```text
id: codex
kind: executor
authMode: appServer
capabilities:
- canExecuteCode
- canUseRepo
- canListSessions
- canCreateSession
- canResumeSession
- canSendMessage
- canStreamEvents
```

Status is `available` when AgentBridge has at least one Codex deep-link target or the Codex App Server health check succeeds.

## Delivery Modes

The provider preserves the existing delivery truth table:

```text
New thread
  codex://threads/new?prompt=...&path=...

Existing thread + App Server
  thread/resume
  turn/start

Existing thread + deep link only
  codex://threads/<thread-id>
  prompt is not injected
```

The provider maps those to provider-level result modes:

```text
newDeepLink             → newSession
appServerTurnStart      → existingSession
existingDeepLinkOpen    → openOnlyFallback
dryRun                  → dryRun
```

## Sessions

Existing Codex threads are mapped from `CodexThreadRef` into `AgentSessionRef`:

```text
externalSessionId = Codex thread ID
metadata.openMode = existingThread
metadata.integrationMode = appServer | sdk | deepLink
```

New Codex thread delivery uses a synthetic local session with:

```text
metadata.openMode = newThread
metadata.integrationMode = deepLink
```

## Artifacts

Each executor send stores a `generatedPrompt` artifact titled `Codex executor prompt`.

When task requests include artifact bundles or file IDs, Codex Executor can stage those local artifact files under the AgentBridge staging root and append a manifest to the Codex prompt:

```text
AgentBridge staged artifacts:
- notes.md
  stagedPath: ...
  sha256: ...
```

The staged files remain outside the repository by default. Codex receives the repo `cwd` plus a manifest instructing it to inspect staged files before deciding whether anything should be copied or modified. AgentBridge does not pre-write staged files into the repo.

When the existing-thread fallback is open-only, UI must still warn clearly that AgentBridge opened the Codex thread but did not inject the prompt.

## Events And Steering

Codex Executor writes provider events into the local store for:

```text
turn.started
turn.completed
turn.failed
turn.error
turn.steer
```

These events are mission-scoped when the request includes a mission ID, so the Workbench can show the latest provider event without exposing raw App Server messages by default.

When an existing Codex session uses the App Server integration, steering uses:

```text
turn/steer
```

The steering text is also stored as a mission artifact. If the selected Codex session is deep-link only, steering remains a local artifact/follow-up path rather than pretending the message was injected.
