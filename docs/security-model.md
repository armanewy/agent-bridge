# Security Model

AgentBridge is local-first. Mission artifacts, staged files, prompts, verification logs, and provider records are stored under the local AgentBridge data directory by default.

## Default Threat Model

Threats:

- Secret transfer through artifacts or logs.
- Unwanted repo reads during workspace inference.
- Unwanted file writes from autonomous follow-up.
- Autonomous command execution beyond configured verification.
- Provider hallucination loops.
- Parallel mission conflicts in the same repo.

Default mitigations:

- Keep repo files local by default.
- Require approval for file transfer.
- Run only configured verification commands by default.
- Enforce max iterations and repeated-failure/no-change stop rules.
- Require worktree/branch isolation for serious parallel loops.
- Report Codex App Server delivery, monitoring, and steering state truthfully.
- Treat ChatGPT planning as a user-mediated text handoff, not an automatic remote provider call.

High-severity blockers:

- Private key detected.
- API key/token detected.
- Unknown shell command.
- File write outside workspace.
- Provider request to upload a repo tree.
- Repeated failed autonomous loop.

## File Transfer Policy

Autopilot policies can restrict provider file upload and staged-file import:

- `allowProviderFileUpload`: `never`, `askEachTime`, `belowSizeLimit`, or `always`
- `maxProviderUploadBytes`
- `allowStagedFilesToRepo`: `never`, `askEachTime`, `safeExtensionsOnly`, or `always`
- `allowedFileExtensions`
- `blockedFilePatterns`
- `redactBeforeUpload`
- `requireApprovalForBinaryFiles`

The default direction is conservative: store files locally, summarize where possible, and require explicit policy before uploading files to providers or writing staged files into a repo.

## Risk Scanner

The artifact broker includes a local risk scanner for:

- private key blocks
- `.env`-style secrets
- high-entropy token-like text
- binary or unknown files
- blocked extensions and patterns
- executable/script-like files
- path traversal outside the AgentBridge artifact root

Risk findings should pause autonomous flows through a `UserDecision` before provider upload or repo import.
