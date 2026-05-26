# UI Model

The desktop app defaults to an intent-first Workbench. Internal Mission, HandoffCard, Source, Target, Link, Component, and Audit models still exist, but the default user language is Intent, Mission, Planner, Codex, Verify, Review, Follow-up, and Artifacts.

## Simple Mode

- Workbench: state intent once, let AgentBridge plan, send to Codex, verify, review, and retry.
- Tasks: inspect task history, generated prompts, delivery attempts, artifacts, verification results, and follow-up drafts.
- Settings: sign in, inspect hosted Planner/Codex status, configure workspace defaults, and set optional verification commands.

The user-facing hierarchy is:

```text
Intent -> Mission -> TaskSpec -> Codex -> Verification -> Planner Review
```

The Workbench must not require Chrome, ChatGPT Desktop, copy/paste, OpenAI API keys, or a mandatory repo picker in Simple Mode. Repo/workspace is shown as a chip: inferred, selected, not needed, or required for the next action.

## Lazy-User Acceptance

- No OpenAI API key in Simple Mode.
- No Chrome extension in Simple Mode.
- No ChatGPT Desktop probe in Simple Mode.
- No mandatory repo picker before intent.
- No copy/paste required.
- One intent can start a mission.

## Advanced Mode

Advanced groups the operator views that should not be required for daily use:

- Sources: captured browser sources.
- Targets: Codex and Windows targets.
- Components: detected browser tabs, repos, desktop windows, and agent targets.
- Captures: raw capture inbox.
- Links: saved source-to-target routing definitions.
- Audit: local provenance events.
- Demo tools: development-only mock capture actions.
- Legacy Link Center: external browser/source routing experiments.

## Task Card Preview

The preview is the approval surface. It prioritizes task title, goal, repo, target agent, acceptance criteria, verification commands, and what happens next. Raw generated prompt, raw source capture, and redaction details are preserved under Advanced details.

Previewing a capture creates a Mission and HandoffCard behind the scenes so the draft is durable before delivery.

## Task Detail

Task detail answers "what happened?":

- task title, goal, and status summary
- repo path and branch when available
- timeline: captured, task created, sent to Codex, verification run, follow-up drafted
- next action: send, verify, inspect failure artifacts, or review history
- all HandoffCards in the Mission, including failed-verification follow-up drafts
- dry-run and send actions for HandoffCard prompts
- artifacts attached to the task
- inline artifact viewer for prompt, diff, command output, and follow-up draft artifacts
- delivery attempts associated with the task or its handoff cards
