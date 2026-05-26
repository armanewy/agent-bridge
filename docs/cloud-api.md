# AgentBridge Cloud API

AgentBridge Cloud hosts the default Planner provider. The desktop authenticates with AgentBridge Cloud, sends minimized planner payloads, and receives planner turns, TaskSpecs, and review results. The OpenAI API key lives only in the cloud environment.

## Configuration

- `AGENTBRIDGE_CLOUD_PORT`: local development port, default `8787`.
- `OPENAI_API_KEY`: server-side model key. Never sent to desktop.
- `AGENTBRIDGE_CLOUD_OPENAI_MODEL`: hosted planner model, default `gpt-4.1-mini`.
- `LOG_RAW_PAYLOADS`: default `false`; raw request bodies should not be logged.
- `MAX_PLANNER_PAYLOAD_BYTES`: default `65536`.

## Routes

```text
GET  /health
POST /v1/auth/session/dev-login
POST /v1/auth/session/logout
GET  /v1/me
POST /v1/planner/sessions
POST /v1/planner/sessions/:sessionId/messages
POST /v1/planner/task-spec
POST /v1/planner/review
GET  /v1/usage/me
```

Planner routes require a bearer token. The development login route returns a mock token for local desktop integration.

`POST /v1/planner/task-spec` validates strict TaskSpec JSON and retries once with a repair prompt if the model returns invalid JSON. `POST /v1/planner/review` validates `reviewSummary`, `statusSuggestion`, and optional `followUpTaskSpec`.

## Privacy

The service logs request id, route, user id, status, and timestamp. It does not log raw planner payloads. Usage records store route/model/status/token metadata and payload byte counts, not prompt text.

If `OPENAI_API_KEY` is missing and no test transport is injected, planner routes return unavailable instead of asking the desktop for a key.
