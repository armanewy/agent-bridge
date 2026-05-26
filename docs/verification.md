# Verification

Mission verification is explicit and local. AgentBridge does not run commands automatically after delivery.

## Flow

1. A Mission must have repo context, usually from a Codex target.
2. The Mission detail view shows the repo path, branch, configured commands, and a local execution warning.
3. The user clicks Run verification.
4. AgentBridge captures a git diff summary and runs configured commands.
5. Outputs are saved as local Artifacts.
6. A VerificationResult is saved on the Mission.
7. If verification fails, AgentBridge drafts a follow-up HandoffCard but does not send it.

## Command Sources

Commands may come from:

- repo context settings
- the Mission verification plan
- explicit UI input in later versions

AgentBridge must not run commands suggested by a model response unless the user explicitly configures or enters them.

## Result Status

- `passed`: at least one configured command ran and all commands exited with code 0.
- `failed`: one or more configured commands failed.
- `needs_review`: no commands were configured; AgentBridge captured available repo state only.

## Artifacts

Verification can create:

- `gitDiff`
- `testOutput`
- `lintOutput`
- `typecheckOutput`
- `terminalLog` for custom commands
- `reviewNote` for the deterministic verification summary
- `generatedPrompt` for a failed-verification follow-up draft

## Follow-Up Drafts

When a configured command fails, AgentBridge creates a `debuggingRequest` HandoffCard using the same mission, source, capture, target, constraints, and non-goals as the original card. The generated prompt includes failed commands and output excerpts. The user must approve and send it manually.
