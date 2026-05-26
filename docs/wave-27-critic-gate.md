# Wave 27 Adversarial Critic Gate

| Check | Score | Notes |
| --- | --- | --- |
| Payload builder prevents repo over-sharing | PASS | Default hosted Planner payloads include repo identity by name, not full local paths, and exclude repo/file artifacts by default. |
| Secrets are blocked | PASS | Payload text is redacted before send; high-severity findings block hosted Planner calls and create a payload summary artifact. |
| Duplicate context is avoided | PASS | Duplicate artifact ids are deduped, and payload summaries track included/excluded artifacts. |
| Cloud validates size and policy | PASS | Cloud rejects oversized payloads and raw file payload fields unless file upload is explicitly enabled. |
| UI transparency without clutter | PASS | Workbench shows a collapsed `What will be sent to Planner` panel and auto-opens it for redaction findings. |
| File artifacts are controlled | PASS | Unapproved file artifacts are excluded by default and recorded with exclusion reasons. |
| Tests are adequate | PASS | Builder, hosted provider, and cloud validation tests cover path omission, truncation, redaction, file exclusion, high-severity blocking, oversized payloads, and file payload rejection. |

## Top Risks

1. Redaction currently scans serialized text fields, not full binary file contents, because file upload is still disabled by default.
2. The UI shows the minimized payload preview from the latest summary artifact; a richer approval workflow is still needed for future file uploads.
3. Cloud file-payload detection is conservative pattern matching and should become schema-based once file upload is implemented.
4. High-severity findings block all hosted calls; users need a later safe remediation flow that does not encourage unsafe bypass.
5. Token usage/cost controls are still Wave 30, so payload minimization is present before full quota enforcement.

## Required Fixes Before Wave 28

- None blocking.

## Optional Improvements

- Add a first-class payload preview API instead of deriving the UI panel from artifact content.
- Add per-artifact approval toggles connected directly to `approvedForPlanner` metadata.
