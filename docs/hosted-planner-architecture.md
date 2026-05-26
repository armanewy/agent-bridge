# Hosted Planner Architecture

## Decision

AgentBridge's default production planner mode is `hostedAgentBridge`.

Normal users should not need an OpenAI API key, should not configure model credentials, and should not see provider plumbing in Simple Mode. AgentBridge Cloud owns planner model calls, prompt/model versioning, usage metering, quota enforcement, and abuse controls. The desktop app owns mission state, Codex execution, verification, artifacts, approvals, and local privacy controls.

## PlannerProviderMode

```text
hostedAgentBridge
  Default production mode.
  Desktop signs in to AgentBridge Cloud and sends minimized planner payloads.

userOpenAiApiKey
  Advanced/BYOK mode.
  Power users can run planner calls directly from the desktop using their own key.

codexLocalPlanner
  Advanced/no-cloud dogfood mode.
  Uses a separate Codex session for planning/review when App Server support exists.

localModelPlaceholder
  Future local model mode.
  Not implemented and not shown as a primary option.
```

## Default Hosted Flow

```text
Desktop Workbench
  -> AgentBridge Cloud Planner API
  -> model provider
  -> AgentBridge Cloud
  -> Desktop Workbench
```

Cloud responsibilities:

- User authentication.
- Planner and reviewer model calls.
- Prompt and model versioning.
- Usage metering and quota enforcement.
- Abuse controls.
- No raw payload retention by default.

Desktop responsibilities:

- Mission state and task history.
- Codex execution and session references.
- Verification command execution.
- Local artifacts and staged files.
- Provider/session refs.
- User approvals and stop conditions.
- Privacy controls and payload minimization.

## Production Setup Flow

1. Install AgentBridge desktop.
2. Sign in to AgentBridge.
3. Connect Codex or allow deep-link fallback.
4. State intent.
5. AgentBridge creates a hosted Planner session and starts a mission.

No OpenAI API key is required in Simple Mode.

## Advanced Setup Flow

Advanced users may choose:

- `userOpenAiApiKey` for BYOK planning.
- `codexLocalPlanner` for no-cloud dogfood planning.
- Optional browser/ChatGPT imports for external context.

These modes remain under Settings/Advanced and should not be required to start the default Workbench loop.

## Privacy Boundaries

Hosted planner does not mean repo upload.

By default, the desktop sends only policy-allowed mission payloads:

- User intent.
- Compact mission summary.
- TaskSpec.
- Verification summary or log excerpts.
- Approved artifact summaries.

Repo files stay local unless explicitly approved by policy and user action. Full local paths should be avoided unless needed for local-only execution context.

## Migration Notes

The existing `OpenAIPlannerProvider` remains valuable as `userOpenAiApiKey` mode. It should move out of the default Simple Mode path and become Advanced/BYOK. The hosted planner provider becomes the active planner in production once AgentBridge Cloud auth is available.
