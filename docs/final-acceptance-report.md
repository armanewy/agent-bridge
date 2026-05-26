# Final Acceptance Report

## Supported Production Flow

AgentBridge defaults to an intent-first Workbench:

```text
intent -> workflow template -> hosted Planner -> CompletionContract -> Codex -> verification -> Planner review -> follow-up
```

The user does not need an OpenAI API key, browser extension, clipboard fallback, or mandatory repo picker in Simple Mode.

## Supported Providers

- AgentBridge Hosted Planner: default Simple Mode planner/reviewer.
- Codex Executor: first executor, with App Server preferred and deep links as fallback.
- Codex Local Planner: Advanced/no-cloud dogfood mode using a separate Codex planning thread.

## Advanced Modes

- BYOK OpenAI planner.
- Codex-only local planner.
- Chrome/browser import.
- ChatGPT Desktop probe.
- Legacy link center and capture surfaces.

## Unsupported

- Real Claude/Cursor providers.
- Generic desktop RPA.
- Consumer ChatGPT scraping as default workflow.
- Automatic full repo upload.
- LLM-only autonomous completion.

## Privacy/Data Boundaries

- Artifacts are local by default.
- Hosted planner payloads are summarized and redacted.
- Repo files are excluded unless explicitly approved by policy.
- Usage records must not store raw prompts.

## Repo/Workspace Behavior

- Repo/workspace is optional until Codex new-thread creation, verification, or repo file staging requires it.
- Workspace inference can use Codex thread cwd/history without reading source files.
- Parallel missions should use branch/worktree isolation.

## Completion Behavior

- CompletionContract defines done criteria, evidence, verifiers, stop conditions, and human-review triggers.
- Human-review-only criteria can be valid for supervised work, but cannot autonomously pass.
- Missing objective evidence produces `needs_review` or blocked, not `passed`.

## Autopilot Behavior

- Autopilot can plan, create TaskSpec, send to Codex, monitor, verify, review, and draft follow-up.
- Stop logic covers max iterations, repeated failures, repeated diffs, no-change loops, policy warnings, and missing evidence.
- User can steer or stop a run.

## Parallel Mission Behavior

- Mission queue and file conflict services provide the foundation for multiple active missions.
- WorktreeManagerService creates branches/worktrees and detects changed files.
- Full UI enforcement remains a dogfood hardening item.

## Dogfood Checklist

- Start a mission from one intent with no repo selected.
- Generate a TaskSpec and CompletionContract.
- Send to Codex with delivery mode shown.
- Run verification and confirm completion evidence status.
- Trigger a missing-evidence task and confirm it does not pass.
- Start two queue items and confirm isolation/conflict warnings are visible in service tests.

## Remaining Risks

- Production hosted auth and billing are still immature.
- Worktree isolation is not yet fully enforced through every UI/autopilot path.
- Visual verification is modeled but not fully automated.
- Codex Local Planner is useful for no-cloud dogfood but reduces cross-agent diversity.
