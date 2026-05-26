# Wave 26 Adversarial Critic Gate

| Check | Score | Notes |
| --- | --- | --- |
| Repo inference reduces friction | PASS | Workbench mission creation, planner turns, and TaskSpec generation no longer require a repo. High-confidence Codex workspace evidence can attach automatically. |
| Wrong repo risk is controlled | WARN | Confidence scoring and confirmation chips reduce risk, but workspace inference still needs more real Codex App Server dogfood data. |
| Bridge mode proceeds without repo | PASS | Planner work starts without `repoPath`; repo-bound actions gate themselves later. |
| Verification correctly requires repo | PASS | Verification now stops with explicit workspace-required copy. |
| No repo reads during inference | PASS | WorkspaceResolver uses stored Codex refs, targets, mission history, and text/URL hints only. |
| Hosted planner avoids full path/source leakage by default | PASS | Bridge mode does not add repo context unless workspace is attached; payload minimization remains the default policy. |
| UI remains simpler | PASS | Workbench uses status chips and a workspace chip instead of a mandatory repo-first form. |
| Low-confidence tests | WARN | Unit tests cover high-confidence Codex workspace evidence and no-repo gates; broader low-confidence UI smoke coverage remains pending. |

## Top Risks

1. Autopilot can still reach Codex delivery before the user has selected an executor session, so no-repo missions may pause at the new-thread workspace gate.
2. Workspace inference from prior missions can be convenient but may be wrong in multi-repo dogfood.
3. Existing Codex sessions without cwd are still valid executor sessions, but they cannot provide verification or new-thread workspace context.
4. UI smoke tests for the workspace confirmation chip are still lighter than the service coverage.
5. Real App Server thread metadata shape may vary; mapping should be revisited after dogfood.

## Required Fixes Before Wave 27

- None blocking. Keep the new repo-minimal gates and add payload-builder tests in Wave 27 that verify full local paths are omitted by default.

## Optional Improvements

- Add a persistent "ignore this workspace candidate" action instead of a visual-only "Ignore for now" label.
- Show workspace evidence lines in an expandable details panel for inferred candidates.
