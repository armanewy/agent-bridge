# UI Model

The desktop app now exposes Missions as the durable user-facing task surface.

## Views

- Home: source/target setup, transform preview, Codex delivery.
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
- TaskSpec sections
- artifacts attached to the mission
- delivery attempts associated with the mission or its handoff cards

The existing HandoffPreview remains the approval surface. Previewing a handoff now creates a Mission and HandoffCard behind the scenes.
