# Adapter Development

AgentBridge adapters are registered by capability rather than provider-specific assumptions.

## Adapter Kinds

- `source`: captures content after a user action.
- `target`: delivers approved handoffs.
- `transform`: converts captures into structured handoffs.
- `redaction`: detects and optionally redacts sensitive content.

## Capabilities

- `canCaptureSelectedText`
- `canCaptureLatestMessage`
- `canDeliverText`
- `canOpenDeepLink`
- `requiresApproval`
- `supportsDryRun`

## Adding A Browser Source

1. Keep capture user-triggered.
2. Prefer `activeTab`.
3. Add a page adapter under `apps/extension/src/page-adapters`.
4. Return `unsupportedPageAdapter` when selectors fail.
5. Add fixture tests for extraction.

## Adding A Desktop Target

1. Prefer official APIs, SDKs, or deep links.
2. For Windows apps, use UI Automation before clipboard fallback.
3. Revalidate target metadata before delivery.
4. Expose dry-run behavior.
5. Record audit and delivery attempts.

## Adding A Transform Recipe

1. Add a deterministic recipe in `packages/core/src/transform.ts`.
2. Include acceptance criteria and verification steps in the prompt.
3. Run redaction detection before preview.
4. Add unit tests.
