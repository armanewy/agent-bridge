# UI Model

The desktop app defaults to a Start-first Simple Mode. Internal Mission, HandoffCard, Source, Target, Link, Component, and Audit models still exist, but the default user language is Browser tab, Repo, Codex, Link, Task Card, Send, Verify, Result, and History.

## Simple Mode

- Start: build and use one active route, `ChatGPT/browser tab -> repo -> Codex`.
- Tasks: inspect task history, generated prompts, delivery attempts, artifacts, verification results, and follow-up drafts.
- Settings: connect Chrome, choose a repo, configure Codex delivery, and set optional verification commands.

The user-facing hierarchy is:

```text
Browser tab -> Repo -> Codex -> Task Card
```

The Start page hides empty Task Card previews and demo data. It shows the active link, latest real capture if available, and the primary action: Create Task Card.

## Advanced Mode

Advanced groups the operator views that should not be required for daily use:

- Sources: captured browser sources.
- Targets: Codex and Windows targets.
- Components: detected browser tabs, repos, desktop windows, and agent targets.
- Captures: raw capture inbox.
- Links: saved source-to-target routing definitions.
- Audit: local provenance events.
- Demo tools: development-only mock capture actions.

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
