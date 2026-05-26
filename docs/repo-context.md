# Repo Context

Repo context makes a Codex handoff repository-aware without reading arbitrary source files into the prompt.

## Captured Fields

- `repoPath`
- `repoName`
- `worktreePath`
- `currentBranch`
- `gitStatusSummary`
- `changedFiles`
- `testCommand`
- `lintCommand`
- `typecheckCommand`

## Prompt Policy

AgentBridge includes branch/status/file names and configured commands in the generated prompt. It does not include source file contents by default.

## Command Configuration

The desktop Codex target panel accepts optional test, lint, and typecheck commands. They are stored locally as settings for the repo path and attached to future `RepoContextPack` objects.

Commands are metadata at this stage. Verification execution remains a later, explicit user-approved step.
