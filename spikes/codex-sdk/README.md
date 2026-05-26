# Codex SDK Spike

This spike did not add runtime dependencies to the MVP. It records the intended next experiment.

## Goal

Determine whether the Codex SDK should replace or supplement `codex://` deep links for approved AgentBridge handoffs.

## Proposed TypeScript Experiment

```ts
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run("Summarize this handoff and propose a plan.");
console.log(result);
```

Follow-up experiment:

```ts
const thread = codex.resumeThread("<thread-id>");
const result = await thread.run("Continue with the approved handoff.");
console.log(result);
```

## Evaluation

- Reliability: likely better than deep links for programmatic control.
- Continue existing thread: supported by SDK resume API.
- Observe result: SDK returns results from `run()`.
- Stream events: investigate SDK surface; app-server clearly exposes status and turn events.
- Setup complexity: higher than deep links.
- Auth complexity: needs hands-on validation in a packaged desktop context.

## Recommendation

Keep deep links for MVP. Promote this spike once the selected-text to Codex flow is stable.
