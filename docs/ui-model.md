# UI Model

The desktop app defaults to a Connect-first Simple Mode. Internal Mission, HandoffCard, Source, Target, Link, and Audit models still exist, but the default user language is Component, Link, Task, Repo, Agent, Send, Verify, Result, and History.

## Simple Mode

- Connect: detect linkable browser tabs, repos, desktop windows, and agent targets; select one source, one workspace, and one target; create a reusable Workflow Link.
- Tasks: inspect task history, generated prompts, delivery attempts, artifacts, verification results, and follow-up drafts.
- Settings: connect Chrome, choose a repo, configure Codex delivery, and set optional verification commands.

The user-facing hierarchy is:

```text
Components -> Links -> Tasks
```

Capture Inbox is secondary to the selected browser source. A Task Card is created from a Workflow Link after a capture exists for that source.

## Advanced Mode

Advanced groups the operator views that should not be required for daily use:

- Sources: captured browser sources.
- Targets: Codex and Windows targets.
- Links: saved source-to-target routing definitions.
- Audit: local provenance events.

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
