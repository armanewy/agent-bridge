# Provider Refactor Plan

## Purpose

AgentBridge is moving from a source/target/link dashboard toward a provider-based local AI workbench. The first complete integration should be narrow:

```text
OpenAI Planner Provider -> Codex Executor Provider -> Verification -> Planner Review
```

The durable product object remains the AgentBridge task/work thread. Providers execute planning, coding, review, or verification work, but AgentBridge owns task history, artifacts, verification, delivery provenance, and follow-up state.

Baseline before this plan:

- `pnpm test` passed on May 26, 2026 across `packages/core`, `packages/local-store`, `apps/extension`, `apps/native-host`, and `apps/desktop`.

## Existing Models To Reuse

The repo already has the durable task backbone needed for the provider workbench:

- `Mission`: durable user task and status owner.
- `TaskSpec`: structured agent-ready task.
- `HandoffCard`: one dispatch to an executor target.
- `RepoContextPack`: repo path, branch/status, changed files, and verification commands.
- `Artifact`: captured context, TaskSpec, prompt, delivery result, git diff, command output, review notes, and file references.
- `VerificationPlan` and `VerificationResult`: verification commands, checklist, command results, and status.
- `Run` and `RunStep`: step-by-step execution history for a mission.
- `DeliveryAttempt`: Codex/deep-link/App Server delivery provenance.
- `CodexThreadRef`: existing/new Codex thread identity.
- `LinkableComponent` and `WorkflowLink`: useful for legacy tab/window/component experiments, but not the future Simple Mode foundation.
- `SourceEndpoint`, `TargetEndpoint`, and `Capture`: still needed for advanced capture adapters and backward compatibility.

These should not be replaced. The provider refactor should add a provider/session/turn layer underneath the workbench and map provider activity back into these existing mission artifacts.

## Legacy UX To Move Under Advanced

The following code is still useful but should stop defining the default product surface:

- `apps/desktop/src/components/start/StartPage.tsx`
  - Current Start flow exposes ChatGPT Web vs ChatGPT Desktop, source components, WorkflowLink creation, Codex session chooser, and capture/task preview coupling.
  - Move this to `Advanced -> Legacy Link Center` or keep its pieces under `Advanced -> Components / Links`.
- `apps/desktop/src/components/connect/ConnectCenter.tsx`
  - Good for raw LinkableComponent inspection and experiments.
  - Keep as Advanced-only.
- `apps/desktop/src/components/capture/CaptureInbox.tsx`
  - Keep as Advanced capture/provenance surface.
- `apps/desktop/src/components/link-manager/LinkManager.tsx`
  - Keep for old `Link` records only.
- `apps/desktop/src/renderer/App.tsx`
  - Currently wires Simple Mode around source/target/link state. It should become Workbench-first and keep legacy state for Advanced only.
- `apps/extension/**`, `apps/native-host/**`, and ChatGPT Desktop UIA probes
  - Keep as optional import/capture adapters. Do not require them in Simple Workbench.

## Provider Interfaces Needed

Wave 1 should add provider-neutral primitives in `packages/core`:

- `AgentProviderProfile`
  - Identity, kind, capabilities, auth mode, status, metadata.
- `AgentSessionRef`
  - Provider-owned session/thread/conversation reference.
- `AgentTurn`
  - Provider message/turn lifecycle and artifact refs.
- `AgentEvent`
  - Provider event log for future streaming and observation.
- `PlannerRequest` / `PlannerResponse`
  - User asks for planning; planner returns direction and optionally TaskSpec-like structure.
- `ExecutorTaskRequest` / `ExecutorTaskResult`
  - Executor receives a TaskSpec/prompt/repo context and returns delivery/session/turn info.
- `ReviewRequest` / `ReviewResult`
  - Planner/reviewer evaluates verification output and proposes pass/follow-up/needs-review.
- Interfaces:
  - `PlannerProvider`
  - `ExecutorProvider`
  - `ReviewerProvider`
  - `ProviderRegistry`

Design rule: providers own execution and external session details; AgentBridge owns Mission, TaskSpec, Artifact, VerificationResult, and durable workflow state.

## Workbench Mapping

The target workbench loop maps onto existing models like this:

| Workbench step | Provider object | Existing AgentBridge object |
| --- | --- | --- |
| User asks Planner | `AgentTurn` user message | `Artifact(kind: modelResponse or reviewNote)` for stored planner prompt |
| Planner answers | `AgentTurn` assistant message | `Artifact(kind: modelResponse)` |
| Generate TaskSpec | `PlannerResponse` | `TaskSpec`, `Artifact(kind: taskSpec)` |
| Send to Codex | `ExecutorTaskRequest` | `HandoffCard`, `Artifact(kind: generatedPrompt)`, `DeliveryAttempt` |
| Codex delivery result | `ExecutorTaskResult` | `Artifact(kind: deliveryResult)`, Mission status update |
| Run verification | verifier/local command runner | `Run`, `RunStep`, `VerificationResult`, git/test/lint/typecheck artifacts |
| Ask Planner to review | `ReviewRequest` / `AgentTurn` | `Artifact(kind: reviewNote)` |
| Planner follow-up | `ReviewResult` | follow-up `TaskSpec` and draft `HandoffCard` |

The new workbench flow should not require `WorkflowLink`. `WorkflowLink` remains a reusable route object for experimental adapters and Advanced workflows.

## Potential Breaking Changes

These areas need care:

- Store version migration:
  - `packages/local-store` should move from version 4 to 5 without resetting v4 stores.
  - Existing `workflowLinks`, `codexThreadRefs`, missions, artifacts, and captures must remain readable.
- `ArtifactKind`:
  - Current artifact kinds are broad enough for planner responses and reviews (`modelResponse`, `reviewNote`), so avoid adding kinds unless required.
- `MissionStatus`:
  - Existing statuses cover most planned states. If a new `planned` state is needed, add it carefully and update existing tests.
- `RunStep.kind`:
  - Current kinds do not include `planning` or `review`; Wave 6 may need to add them or encode provider steps as `transform`/`followUp`. Prefer adding explicit `planning` and `review` only when orchestration requires it.
- `DeliveryAttempt.strategy`:
  - Already has Codex-specific delivery strategies. Reuse for Codex Executor Provider.
- Renderer API:
  - New provider APIs should be additive. Do not remove existing `AgentBridgeApi` methods until the legacy flow is fully Advanced-only.

## Wave Implementation Plan

### Wave 1: Provider Core Interfaces

Files:

- `packages/core/src/types.ts`
  - Add provider profile/session/turn/event schemas and provider request/response types.
  - Add provider TypeScript interfaces.
- `packages/core/src/index.ts`
  - Export the new provider types.
- `packages/core/tests/provider-types.test.ts`
  - Add parser coverage for provider profile, session ref, turn, event, and request/response shapes.
- `docs/provider-interfaces.md`
  - Document provider responsibilities and boundaries.

Keep all existing Mission/HandoffCard exports intact.

### Wave 2: Provider Local Persistence

Files:

- `packages/local-store/src/index.ts`
  - Increment `CURRENT_STORE_VERSION` to 5.
  - Add store sections for `providerProfiles`, `agentSessions`, `agentTurns`, and `agentEvents`.
  - Add LocalStore APIs for save/get/list/append.
- `packages/local-store/tests/json-file-store.test.ts`
  - Add v4 migration and roundtrip coverage.
- `docs/local-store.md`
  - Update store version and provider sections.

Migration must be additive.

### Wave 3: Desktop Provider Registry

Files:

- `apps/desktop/src/services/provider-registry-service.ts`
  - Add registry service with placeholder OpenAI Planner and Codex Executor profiles.
- `apps/desktop/src/services/bridge-contract.ts`
  - Add provider/session/turn API methods.
- `apps/desktop/src/main/main.ts`
  - Register provider IPC handlers.
- `apps/desktop/src/main/preload.ts`
  - Expose provider API methods.
- `apps/desktop/src/renderer/client.ts`
  - Add browser fallback/mock implementations if needed.
- `apps/desktop/tests/provider-registry-service.test.ts`
  - Cover listing, profile persistence, and unavailable/needsAuth status.

Do not change Start UI in this wave.

### Wave 4: OpenAI Planner Provider

Files:

- `apps/desktop/src/services/providers/openai-planner-provider.ts`
  - Implement `PlannerProvider` using the OpenAI Responses API.
  - Read API key from `AGENTBRIDGE_OPENAI_API_KEY` or `OPENAI_API_KEY`.
  - Do not store raw API key in JSON store.
- `apps/desktop/src/services/provider-registry-service.ts`
  - Register real planner provider when available.
- `apps/desktop/src/services/bridge-contract.ts`, `main.ts`, `preload.ts`, `renderer/client.ts`
  - Add planner message/review API methods only as needed.
- `apps/desktop/tests/openai-planner-provider.test.ts`
  - Mock transport; no live API call in tests.
- `docs/provider-openai-planner.md`
  - Document setup, environment variables, and no consumer ChatGPT scraping.

Official-doc constraint:

- Use OpenAI API-native planning. Do not scrape consumer ChatGPT sessions.

### Wave 5: Codex Executor Provider

Files:

- `apps/desktop/src/services/providers/codex-executor-provider.ts`
  - Wrap `CodexAppServerClient`, `CodexSessionService`, and existing deep-link delivery.
- `apps/desktop/src/services/provider-registry-service.ts`
  - Register real executor provider.
- `apps/desktop/src/services/codex-target-service.ts`
  - Make only minimal changes if provider wrapping exposes a missing result field.
- `apps/desktop/tests/codex-executor-provider.test.ts`
  - Cover new thread, app-server existing thread, and open-only fallback.
- `docs/provider-codex-executor.md`
  - Document delivery modes and limitations.

Preserve `CodexTargetService` behavior.

### Wave 6: Workbench Orchestration Service

Files:

- `apps/desktop/src/services/workbench-service.ts`
  - Coordinate create mission, planner message, TaskSpec creation, executor send, verification, planner review, follow-up creation/send.
- `apps/desktop/src/services/bridge-contract.ts`
  - Add Workbench API request/response types.
- `apps/desktop/src/main/main.ts`, `preload.ts`, `renderer/client.ts`
  - Add IPC/API methods.
- `apps/desktop/tests/workbench-service.test.ts`
  - Use mocked providers and command runner.

This wave should remove Simple Mode dependency on `WorkflowLink` for the new flow.

### Wave 7: Simple Workbench UI

Files:

- `apps/desktop/src/components/workbench/**`
  - New Workbench UI: repo strip, Planner panel, Codex panel, Task state panel.
- `apps/desktop/src/renderer/App.tsx`
  - Default nav becomes `Workbench`, `Tasks`, `Settings`, `Advanced`.
  - Old `StartPage` moves to Advanced legacy area.
- `apps/desktop/src/components/handoff-preview/HandoffPreview.tsx`
  - Keep as optional detail; do not make it the default user flow.
- `apps/desktop/src/renderer/styles.css`
  - Keep compact 760x940 layout; no wide dashboard assumptions.

Simple Workbench must not show Chrome extension, ChatGPT Desktop probe, LinkableComponents, WorkflowLinks, or captures by default.

### Wave 8: Provider Settings and Auth UX

Files:

- `apps/desktop/src/components/settings/**` or existing settings components
  - Add OpenAI Planner and Codex Executor provider status.
- `apps/desktop/src/components/setup/**`
  - Keep technical setup details behind advanced diagnostics.
- `apps/desktop/src/services/provider-registry-service.ts`
  - Expose connection/status checks.
- `docs/provider-openai-planner.md`, `docs/provider-codex-executor.md`
  - Update setup guidance.

Settings should be environment-variable-first and avoid storing secrets in local JSON.

## Later Waves

After the first integration works:

- Verification-to-Planner review loop polish.
- Simple Mode cleanup and README acceptance update.
- End-to-end smoke test and dogfood checklist.
- Provider development guide and mock provider contract tests.

Do not add new real providers until the OpenAI Planner -> Codex Executor loop works end to end.
