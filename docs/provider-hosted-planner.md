# AgentBridge Hosted Planner Provider

The default planner provider is `agentbridge-hosted-planner`.

Simple Mode uses AgentBridge Cloud auth and does not ask the desktop user for an OpenAI API key. The desktop sends a minimized planning payload to AgentBridge Cloud; the hosted service calls the model provider from the server environment and returns planner text, TaskSpecs, or review results.

## Data Boundary

By default, hosted planner requests include:

- user intent
- compact mission summary
- TaskSpec JSON
- verification summary and short command excerpts
- approved artifact summaries
- repo name and branch when available

By default, hosted planner requests do not include:

- raw repo files
- full local repo paths
- unapproved artifact file contents
- raw OpenAI API keys

## Modes

- `hostedAgentBridge`: default production mode.
- `userOpenAiApiKey`: Advanced BYOK mode using desktop environment variables.
- `codexLocalPlanner`: future no-cloud dogfood mode.
- `localModelPlaceholder`: future local model mode.

## Development

Development sign-in uses `POST /v1/auth/session/dev-login`. This is only a local/dev skeleton until production auth is wired.
