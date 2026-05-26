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

- `id`: stable provider ID, for example `openai-planner` or `codex`.
- `kind`: `planner`, `executor`, `reviewer`, `verifier`, `browser`, `repository`, or `unknown`.
- `displayName`: user-facing name.
- `capabilities`: list of supported actions.
- `authMode`: `apiKey`, `localApp`, `appServer`, `cli`, `none`, or `unknown`.
- `status`: `available`, `needsAuth`, `unavailable`, or `unsupported`.
- `metadata`: provider-specific diagnostics.

Profiles are safe to persist. They must not contain raw API keys or session secrets.

## Sessions And Turns

`AgentSessionRef` is the provider-neutral reference to an external conversation, thread, or app session.

Examples:

- OpenAI Planner conversation.
- Codex existing thread.
- Synthetic Codex new-thread target.

`AgentTurn` stores a provider message/turn record and links to AgentBridge artifacts. A provider turn can be a user prompt, assistant response, tool result, or future event-backed status.

## Provider Types

### PlannerProvider

Used for planning and review loops.

Required responsibilities:

- Report profile and status.
- Create/resume sessions.
- Send user messages.
- Produce `PlannerResponse`.
- Produce `ReviewResult`.

The first implementation is `openai-planner` using the OpenAI Responses API. It must use API-native state and must not scrape consumer ChatGPT sessions.

### ExecutorProvider

Used for coding-agent execution.

Required responsibilities:

- Report profile and status.
- List/create/resume sessions when supported.
- Accept `ExecutorTaskRequest`.
- Return `ExecutorTaskResult` with explicit delivery mode and warnings.

The first implementation is `codex`, wrapping Codex App Server and deep-link fallback.

### ReviewerProvider

Used when review is not the same provider as planning. For the first integration, OpenAI Planner can also implement reviewer capability.

## Request/Response Contracts

### PlannerRequest / PlannerResponse

The planner receives user direction plus optional repo context and artifact references. It returns natural-language direction and may include a structured `TaskSpec`.

### ExecutorTaskRequest / ExecutorTaskResult

The executor receives a `TaskSpec`, optional generated prompt, repo context, target session, and dry-run flag. It returns success/failure metadata, session/turn information, delivery mode, warnings, and artifact refs.

### ReviewRequest / ReviewResult

The reviewer receives the original `TaskSpec`, verification output, and artifact references. It returns a status suggestion and optional follow-up `TaskSpec`.

## Status And Safety Rules

- Missing API keys are `needsAuth`, not generic failure.
- App Server unavailable is `unavailable`, with deep-link fallback surfaced by the Codex provider.
- Existing Codex thread deep-link fallback is `openOnlyFallback`; it must not claim the prompt was injected.
- Providers must not store raw secrets in JSON local store.
- Provider-generated commands are never executed automatically. Verification commands remain user-configured and user-triggered.
