# Artifact Broker

`ArtifactBrokerService` stores files produced or imported during a mission without writing them directly into the user repo.

## Storage

Files live under:

```text
<AgentBridge user data>/artifacts/<missionId>/<fileId>/<fileName>
```

Later waves can use staging under:

```text
<AgentBridge user data>/staging/<missionId>/
```

Provider-generated files should remain local artifacts unless a later explicit policy approves copying them into a repo.

## Metadata

Each stored file records:

- mission and artifact IDs
- local path
- size
- SHA-256
- MIME type
- classification such as source code, diff, log, screenshot, document, archive, or unknown
- provider/turn provenance when known

Bundles group artifacts/files for a purpose such as planner input, executor input, verification input, review input, user download, or archive.

## Safety

The broker blocks path traversal, sanitizes file names, and enforces that reads stay inside the AgentBridge artifact root. Secret scanning and provider-upload approval are policy layers above the broker. The default hosted planner policy sends summaries and approved artifacts only; repo files are not uploaded by default.

High-severity findings such as private keys, API keys, repo-tree upload requests, and file writes outside workspace should pause Autopilot through a `UserDecision`.
