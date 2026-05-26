# Wave 23 Adversarial Critic Gate

## Verdict Table

| Question | Score | Notes |
| --- | --- | --- |
| Avoids API-key friction in Simple Mode | PASS | Hosted AgentBridge Planner is documented as the default; BYOK is Advanced. |
| Avoids mandatory repo selection | PASS | Bridge/Workspace/Verification/Artifact modes define when repo is and is not required. |
| Prevents repo upload by default | PASS | Docs state repo files stay local unless explicitly approved. |
| Preserves local-first artifact and verification boundaries | PASS | Desktop owns artifacts, Codex execution, verification, approvals, and local privacy controls. |
| Defines clear stop/approval conditions | PASS | Security docs identify blockers and default mitigations. |
| Supports intent -> plan -> execute -> verify -> review -> retry | PASS | MVP acceptance and UI model now center the hosted Workbench loop. |
| Avoids dashboard/link-center drift | PASS | UI model moves legacy Link Center and imports under Advanced. |
| Defines dogfood metrics | PASS | Dogfood report includes intervention count, time to Codex turn, cost, parallel missions, and copy/paste usage. |
| Protects against platform-specific fragility | WARN | Platform-specific adapters remain Advanced, but later implementation must keep this true in code. |
| Identifies commercial/cost risks | WARN | Cost is named as a dogfood metric, but quotas/billing are not implemented until Wave 30. |

## Top 5 Risks

1. Hosted planner is documented but not implemented yet, so Simple Mode still depends on the existing BYOK provider until Wave 25.
2. Repo-minimal behavior is documented but not enforced in Workbench/Autopilot until Wave 26.
3. Payload minimization is documented but not implemented until Wave 27.
4. Cost controls are only a contract until Wave 30.
5. Parallel loop safety still depends on future worktree isolation in Wave 28 and mission queue controls in Wave 31.

## Required Fixes Before Wave 24

- None for Wave 23 scope. The docs now provide enough contract surface for Wave 24 types/scaffolds.

## Required Fixes In Upcoming Waves

- Wave 24 must add typed planner modes, auth status, workspace candidates, and payload policy primitives.
- Wave 24 cloud scaffold must avoid raw request-body logging from day one.
- Wave 24 desktop auth must avoid storing OpenAI keys or cloud tokens in mission artifacts.
- Wave 24 workspace resolver must not read repo files.

## Optional Improvements

- Add a concise architecture diagram image later if docs become user-facing.
- Add explicit retention-period configuration once cloud storage exists.
- Add UI copy examples to the Settings mock once hosted planner UI is implemented.
