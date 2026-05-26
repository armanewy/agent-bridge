# AgentBridge Cloud API

Wave 24 adds a mocked hosted planner API. Later waves replace the planner internals with provider-backed calls while preserving the route contract.

## Configuration

- `AGENTBRIDGE_CLOUD_PORT`: local development port, default `8787`.
- `OPENAI_API_KEY`: server-side model key placeholder. Never sent to desktop.
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

## Privacy

The scaffold logs request id, route, user id, status, and timestamp. It does not log raw planner payloads.
