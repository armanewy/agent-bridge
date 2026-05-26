# Local Store

AgentBridge MVP persistence is local-only. Wave 2 uses a JSON-file store because it keeps the Windows developer setup simple and avoids native SQLite dependencies before the product needs relational querying.

## Default Data Location

The store implementation accepts an explicit directory. Desktop integration should use an application data directory such as:

```text
%LOCALAPPDATA%\AgentBridge
```

Set `AGENTBRIDGE_STORE_DIR` to override this during development or tests.

Tests use temporary directories.

## Stored Records

- links
- linkable components
- workflow links
- provider profiles
- agent sessions
- agent turns
- agent events
- Codex thread references
- extension heartbeat
- source and target endpoint records through links and handoffs
- captures
- handoffs
- delivery attempts
- missions
- handoff cards
- artifacts
- runs and run steps
- verification results
- approval records
- audit events
- settings

## Deletion

The store exposes record-level deletion for links, workflow links, handoffs, missions, and a clear-audit operation for audit logs. Users can also clear the local data directory from the desktop app.

Store version 5 is non-destructive. Older JSON stores without mission-first, link-center, extension heartbeat, Codex session, or provider sections load with empty records for missing sections.

## Provider Records

Provider data is intentionally split from Mission data:

- `providerProfiles` are safe-to-store provider status/capability records.
- `agentSessions` are external provider session/thread references.
- `agentTurns` are provider message/turn records linked to artifacts.
- `agentEvents` are provider lifecycle/status events for future streaming and observation.

Provider records must not contain raw API keys or session secrets.

## Secret Storage Policy

If high-severity redaction findings are present, downstream callers should store redacted text by default unless the user explicitly chooses full local storage.
