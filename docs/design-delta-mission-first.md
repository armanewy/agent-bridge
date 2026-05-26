# Mission-First Design Delta

AgentBridge keeps the existing capture to preview to delivery path, but promotes the durable product object from a transient handoff to a mission.

## Current Flow

```text
Source -> Capture -> Handoff -> Approval -> Delivery -> Audit
```

## Target Flow

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
