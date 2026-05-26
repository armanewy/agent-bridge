# UI Model

The desktop app now exposes Missions as the durable user-facing task surface.

## Views

- Home: source/target setup, transform preview, Codex delivery.
- Capture Inbox: explicit recent-capture selection before Mission creation.
- Target Selector: explicit target selection before Mission creation.
- Missions: durable task list and detail view.
- Sources: captured browser sources.
- Targets: Codex and Windows targets.
- Links: saved route definitions.
- Audit: local provenance events.

## Mission Detail

Mission detail shows:

- mission title, goal, and status
- repo path and branch when available
- verification status placeholder
- user-triggered verification panel with repo path, commands, and local execution warning
- verification preflight confirmation before commands run
- TaskSpec sections
- all HandoffCards in the Mission, including failed-verification follow-up drafts
- dry-run and send actions for HandoffCard prompts
- artifacts attached to the mission
- inline artifact viewer for prompt, diff, command output, and follow-up draft artifacts
- delivery attempts associated with the mission or its handoff cards

The existing HandoffPreview remains the approval surface. Previewing a handoff now creates a Mission and HandoffCard behind the scenes.
