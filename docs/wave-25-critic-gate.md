# Wave 25 Adversarial Critic Gate

## Verdict

Wave 25 is a PASS with implementation caveats.

| Check | Score | Notes |
| --- | --- | --- |
| Hosted planner avoids API-key friction | PASS | Simple Mode now defaults to `agentbridge-hosted-planner` with `agentBridgeCloud` auth. BYOK remains Advanced. |
| Cloud avoids raw payload retention | PASS | Request logs and usage records store route/status/model/byte/token metadata, not raw prompts. |
| Desktop avoids storing OpenAI keys | PASS | Desktop hosted provider uses AgentBridge Cloud token only. OpenAI keys remain cloud-side or Advanced environment BYOK. |
| Planner modes clear and honest | PASS | Registry exposes hosted/BYOK/Codex-local/local-model modes; unimplemented modes are unsupported. |
| Simple Mode remains simple | PASS | Settings now shows AgentBridge sign-in and hosted planner status first. API key setup is in Advanced planner modes. |
| Hosted planner failure handled | WARN | Missing cloud `OPENAI_API_KEY` returns unavailable. The desktop surfaces cloud HTTP failures, but retry/backoff and offline copy are later work. |
| Repo data excluded by default | PASS | Hosted desktop provider sends repo identity only and strips file IDs/full paths from default payloads. |
| Tests sufficient | PASS | Cloud planner, hosted desktop provider, and planner registry tests cover auth, payload shape, TaskSpec repair, and no raw prompt usage logging. |

## Top Risks

1. Production auth is still dev-login only.
2. Hosted planner cloud storage is in-memory and not production-persistent.
3. Payload minimization is currently provider-local; Wave 27 must centralize this in `PlannerPayloadBuilder`.
4. Workbench still assumes a planner call can proceed only after sign-in; offline/local planner modes are placeholders.
5. Quotas/cost controls are not implemented until Wave 30.

## Required Fixes Before Wave 26

- None blocking.

## Optional Improvements

- Add retry/backoff for transient cloud failures.
- Add a “cloud unavailable” Workbench banner.
- Persist planner mode setting beyond process lifetime.
