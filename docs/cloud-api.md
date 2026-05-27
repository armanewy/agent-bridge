# AgentBridge Cloud API

AgentBridge Cloud is currently a minimal local auth scaffold for desktop development. It no longer hosts planner routes or model calls.

## Configuration

- `AGENTBRIDGE_CLOUD_PORT`: local development port, default `8787`.
- `AGENTBRIDGE_CLOUD_MAX_REQUEST_BYTES`: default `65536`.
- `AGENTBRIDGE_CLOUD_ALLOW_DEV_LOGIN`: enables the local development login route.

`pnpm dev:local` loads gitignored `.env.local` for convenience, starts this local auth scaffold on a free port, and opens the Electron desktop with `AGENTBRIDGE_CLOUD_URL` configured.

## Routes

```text
GET  /health
POST /v1/auth/session/dev-login
POST /v1/auth/session/logout
GET  /v1/me
GET  /v1/usage/me
```

`/v1/me` and `/v1/usage/me` require a bearer token. The development login route returns a local token only when explicitly enabled.

## Privacy

The service logs request id, route, user id, status, and timestamp. It does not log raw request bodies.
