# Autopilot Model

Autopilot is the durable execution layer for hands-off missions. It is not the default UI yet, but the store now has the records needed for a supervised runner.

## Records

- `AutopilotPolicy`: permission and stop-condition settings for a run.
- `AutopilotRun`: one attempt to drive a mission until passed, blocked, failed, or cancelled.
- `AutopilotStep`: an auditable action inside a run, such as planning, sending to Codex, verification, review, follow-up, steering, or approval.
- `UserDecision`: a pending/resolved approval or ambiguity decision.

## Policy Boundary

The default policy should remain conservative:

- Planner turns can be automatic.
- Verification may run only configured commands.
- Codex turns require policy approval unless supervised/autonomous mode allows them.
- Provider file upload and staged-file repo import are controlled separately:
  - `allowProviderFileUpload`
  - `maxProviderUploadBytes`
  - `allowStagedFilesToRepo`
  - `allowedFileExtensions`
  - `blockedFilePatterns`
  - `redactBeforeUpload`
  - `requireApprovalForBinaryFiles`

## Stop Conditions

An autopilot run stops when verification passes, the iteration budget is reached, a provider fails, a risk boundary requires approval, or the user cancels.

The Workbench still owns `Mission`, `TaskSpec`, `Artifact`, `VerificationResult`, and provider turn history. Autopilot only coordinates the sequence.
