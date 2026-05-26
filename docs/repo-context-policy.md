# Repo Context Policy

AgentBridge should coordinate work without forcing repo access too early.

## Repo Modes

```text
Bridge mode
  No repo required.
  Planner messages, TaskSpec creation, hosted review, and existing Codex-session coordination can proceed.

Workspace mode
  Repo path is useful for Codex cwd, branch naming, and context chips.
  AgentBridge does not read source files by default.

Verification mode
  Repo path is required.
  Verification runs configured commands and captures git diff/output artifacts.

Artifact/file mode
  Explicit approval or policy is required.
  Repo files are not uploaded or copied by default.
```

## Product Rules

- AgentBridge does not need repo access to coordinate Planner <-> Codex messages.
- If a Codex session already has cwd/workspace metadata, AgentBridge should infer and reuse it.
- The user should not be asked to choose a repo unless the requested action requires one.
- AgentBridge should not read repo files during workspace inference.
- AgentBridge should not upload repo files by default.

## Workspace Inference Sources

Use evidence in this order:

1. Codex App Server thread `cwd` or `gitInfo`.
2. `CodexDeepLinkTarget.repoPath`.
3. Prior AgentBridge mission/session mapping.
4. GitHub URL in intent/context.
5. Provider self-report.
6. Window/title hints.
7. User selection.

## Confidence Policy

```text
90-100
  Use silently and show a workspace chip.

70-89
  Use with confirmation chip.

0-69
  Do not block Bridge mode.
  Ask only if the next action requires a repo.
```

## User-Facing Copy

- `Workspace inferred from Codex.`
- `Workspace not needed for this mission yet.`
- `Choose workspace to run verification.`
- `Choose workspace to create a new Codex thread.`

## Non-Goals

- Reading repo files during inference.
- Uploading repo contents to the hosted planner by default.
- Making repo selection a first-run requirement.
