# Wave 24 Adversarial Critic Gate

## Verdict Table

| Question | Score | Notes |
| --- | --- | --- |
| Did core types preserve existing APIs? | PASS | New schemas are additive; existing provider/Mission/TaskSpec types remain exported. |
| Does cloud scaffold avoid raw prompt logging? | PASS | Request logs store request id, route, user id, status, and timestamp only. |
| Does desktop auth avoid storing OpenAI keys? | PASS | AuthService stores only AgentBridge cloud token/user in an explicit dev storage abstraction; OpenAI keys are not handled. |
| Does WorkspaceResolver avoid repo reads? | PASS | It uses Codex refs, targets, prior missions, and text hints only. No git or file reads. |
| Is repo inference confidence-scored? | PASS | WorkspaceCandidate carries confidence, evidence, and confirmation requirement. |
| Are Simple Mode friction goals preserved? | WARN | Contracts are ready, but UI still needs Wave 26 to remove repo-first friction in runtime. |
| Are tests adequate? | PASS | Core schemas, cloud routes, auth service, and workspace resolver have focused tests. |
| Are Windows/macOS assumptions avoided? | PASS | New services use URL/text/store evidence; no registry/UIA/shell assumptions were added. |

## Top Risks

1. Cloud planner routes are mocked; Wave 25 must wire real model calls and response validation.
2. Auth token storage is an explicit development fallback, not production secure storage.
3. ProviderRegistry still defaults to the BYOK planner until Wave 25 integration.
4. Workspace inference is not yet integrated into Workbench/Autopilot decisions.
5. WorkspaceResolver confirmation is in-memory and will need durable selection state if the UI uses it across app restarts.

## Required Fixes Before Wave 25

- None blocking. Wave 24 established the scaffolds needed for Wave 25.

## Required Fixes In Upcoming Waves

- Wave 25 must make hosted planner the active default provider and keep BYOK under Advanced.
- Wave 25 cloud implementation must keep raw payload retention off by default.
- Wave 26 must integrate WorkspaceResolver so intent can start without repo selection.
- Production auth must replace the memory/dev token store before external beta.
