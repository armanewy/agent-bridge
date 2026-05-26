# Local Store

AgentBridge MVP persistence is local-only. Wave 2 uses a JSON-file store because it keeps the Windows developer setup simple and avoids native SQLite dependencies before the product needs relational querying.

## Default Data Location

The store implementation accepts an explicit directory. Desktop integration should use an application data directory such as:

```text
%APPDATA%\AgentBridge
```

Tests use temporary directories.

## Stored Records

- links
- source and target endpoint records through links and handoffs
- handoffs
- approval records
- audit events
- settings

## Deletion

The store exposes record-level deletion for links and handoffs, and a clear-audit operation for audit logs. Users should also be able to delete the local data directory when the desktop UI is implemented.

## Secret Storage Policy

If high-severity redaction findings are present, downstream callers should store redacted text by default unless the user explicitly chooses full local storage.
