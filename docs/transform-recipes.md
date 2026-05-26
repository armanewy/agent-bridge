# Transform Recipes

AgentBridge transforms are now TaskSpec compilers. Each recipe turns a user-triggered capture into structured task memory before rendering a target-specific prompt.

## Recipes

- `rawRelay`: preserve the capture while wrapping it in minimal TaskSpec fields.
- `implementationBrief`: convert the capture into an implementation task with requirements, constraints, non-goals, acceptance criteria, and verification steps.
- `codeReviewRequest`: frame the capture as a review task with findings-first output.
- `debuggingRequest`: frame the capture as a root-cause and verification task.

## Rendered Codex Prompt

Codex prompts are rendered from TaskSpec sections:

- Goal
- Background
- Repo context when available
- Instructions
- Requirements
- Constraints
- Non-goals
- Acceptance criteria
- Suggested files
- Verification steps
- Expected final response format

The generated prompt is stored as an Artifact and attached to the HandoffCard before delivery.
