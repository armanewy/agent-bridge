# Mission-First Design Delta

AgentBridge keeps the existing capture to preview to delivery path, but promotes the durable product object from a transient handoff to a mission.

## Previous Flow

```text
Source -> Capture -> Handoff -> Approval -> Delivery -> Audit
```

## Implemented Flow

```text
Mission
  -> Capture artifact
  -> TaskSpec
  -> HandoffCard
  -> Approval
  -> DeliveryAttempt
  -> VerificationPlan / VerificationResult
  -> Follow-up draft
```

## New Durable Objects

- `Mission`: the user-visible work item.
- `TaskSpec`: structured agent-ready task instructions.
- `HandoffCard`: one dispatch from a mission to a target.
- `RepoContextPack`: local repository context attached to tasks.
- `Artifact`: prompt, output, diff, log, screenshot, or file evidence.
- `Run` and `RunStep`: execution history for a mission.
- `VerificationPlan` and `VerificationResult`: explicit, user-approved validation state.

Existing `Handoff` remains parse-compatible and gains optional `missionId` and `handoffCardId` fields for migration.

## Current Delta

The model layer is now sufficient for daily dogfooding. The next product risk is not schema coverage; it is closed-loop reliability:

- exact delivery provenance
- explicit capture and target selection
- verification preflight and inspectable artifacts
- visible follow-up HandoffCards
- low-friction setup
- eventual Codex app-server observation
