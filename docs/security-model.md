# Security Model

AgentBridge is local-first. Mission artifacts, staged files, prompts, verification logs, and provider records are stored under the local AgentBridge data directory by default.

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
