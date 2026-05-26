# Hosted Planner Privacy

The hosted planner exists to remove API-key setup from Simple Mode. It must not turn AgentBridge into a repo-upload product.

## Data Boundary

Local by default:

- Mission history.
- TaskSpec and HandoffCard records.
- Codex session refs.
- Verification logs and git diffs.
- Artifact files and staging directories.
- User approvals and policy decisions.

Eligible for hosted planner only when policy allows:

- Intent.
- Mission summary.
- TaskSpec.
- Verification summary.
- Short command-output excerpts.
- Approved artifact summaries.

Blocked by default:

- Repo trees.
- Source files.
- Secret-looking artifact files.
- Private keys and API keys.
- Full logs above policy limits.
- Arbitrary provider-requested uploads.

## Default Mitigations

- Payload minimization.
- Redaction before hosted planner calls.
- File upload approval.
- Command approval policy.
- Max iterations and planner-call budgets.
- Usage quotas.
- Worktree isolation for parallel loops.
- Honest delivery-mode reporting.

## High-Severity Blockers

The hosted planner call should pause or fail closed when AgentBridge detects:

- Private key material.
- API key or token-like secrets.
- Unknown shell command request.
- File write outside workspace.
- Provider request to upload a repo tree.
- Repeated failed autonomous loop.

## Retention

AgentBridge Cloud should not retain raw payloads by default. Usage records should contain route, model, status, token/cost metadata when available, payload size, user ID, and timestamp, but not prompt text or repo files.
