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

When the existing-thread fallback is open-only, UI must still warn clearly that AgentBridge opened the Codex thread but did not inject the prompt.
