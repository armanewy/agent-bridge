# Provider Interfaces

## Boundary

AgentBridge owns durable work state:

- Mission
- TaskSpec
- HandoffCard
- RepoContextPack
- Artifact
- VerificationResult
- Run / RunStep

Providers own external execution state:

- Provider profile and capabilities
- External session/thread IDs
- Turns/messages sent to or received from the provider
- Provider events such as status updates or future stream chunks

The provider layer must not replace the mission/task-card model. It adapts provider-specific behavior into AgentBridge work records.

## Provider Profiles

`AgentProviderProfile` describes a provider in a way the UI can render without knowing implementation details:

- `id`: stable provider ID, for example `codex`.
- `kind`: `executor`, `verifier`, `repository`, or `unknown`.
- `displayName`: user-facing name.
- `capabilities`: list of supported actions.
- `authMode`: `agentBridgeCloud`, `apiKey`, `localApp`, `appServer`, `cli`, `none`, or `unknown`.
- `status`: `available`, `needsAuth`, `unavailable`, or `unsupported`.
- `artifactCapabilities`: what the provider can accept and return through the artifact broker.
- `metadata`: provider-specific diagnostics.

Profiles are safe to persist. They must not contain raw API keys or session secrets.

## Current Planner Boundary

Planning is a ChatGPT handoff, not a registered remote provider. The user writes mission intent in AgentBridge, asks ChatGPT for a structured plan, selects the answer, and AgentBridge parses that selected text locally into a TaskSpec.

This keeps the product loop usable without a separate model API account and avoids registering planner providers in production code.

## ExecutorProvider

Used for coding-agent execution.

Required responsibilities:

- Report profile and status.
- List/create/resume sessions when supported.
- Accept `ExecutorTaskRequest`.
- Return `ExecutorTaskResult` with explicit delivery mode and warnings.

The first implementation is `codex`, wrapping Codex App Server.

## Artifact Capabilities

`ProviderArtifactCapabilities` is intentionally conservative. It lets the UI and orchestration layer decide whether a provider can accept raw text artifacts, local files, file paths, staged bundles, or only summaries.

The active executor accepts text prompts and returns text delivery artifacts. File inputs, staged file paths, diffs, logs, and provider-returned files are disabled until the artifact exchange waves explicitly wire them.

## Request/Response Contracts

`ExecutorTaskRequest` carries a `TaskSpec`, optional generated prompt, repo context, target session, and dry-run flag. `ExecutorTaskResult` returns success/failure metadata, session/turn information, delivery mode, warnings, and artifact refs.

## Status And Safety Rules

- App Server unavailable is `unavailable`; AgentBridge does not use an open-only Codex route in production.
- Providers must not store raw secrets in JSON local store.
- Provider-generated commands are never executed automatically. Verification commands remain user-configured and user-triggered.
