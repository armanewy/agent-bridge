# OpenAI Planner Provider

AgentBridge uses the OpenAI Planner provider as the first planner/reviewer adapter in the provider workbench path.

## Role

The provider owns planning and review turns. AgentBridge still owns durable mission state:

```text
User planning question
→ OpenAI Planner response
→ TaskSpec artifact
→ Codex executor task
→ Verification result
→ Planner review
```

The provider does not replace `Mission`, `HandoffCard`, `TaskSpec`, `Artifact`, `Run`, or `VerificationResult`.

## Configuration

The desktop app reads the planner API key from environment variables:

```text
AGENTBRIDGE_OPENAI_API_KEY
OPENAI_API_KEY
```

`AGENTBRIDGE_OPENAI_API_KEY` wins when both are set. The raw key is never written to the local JSON store.

The model defaults to `gpt-4.1-mini` and can be overridden with:

```text
AGENTBRIDGE_OPENAI_PLANNER_MODEL
```

## Provider Profile

```text
id: openai-planner
kind: planner
authMode: apiKey
capabilities:
- canPlan
- canReview
- canCreateSession
- canResumeSession
- canSendMessage
- canReadResult
```

When no API key is configured, status is `needsAuth`. With an API key or injected test transport, status is `available`.

## Stored Records

For each planner message, AgentBridge stores:

- `AgentSessionRef` for the planner thread
- `AgentTurn` for the user message
- `AgentTurn` for the assistant response
- `Artifact` for the planner user prompt when `missionId` is present
- `Artifact` for the planner response when `missionId` is present
- `AgentEvent` for session and turn lifecycle events

Planner artifacts use existing artifact kinds:

```text
reviewNote      planner user message
modelResponse   planner response
```

## Structured Output

Planner responses are stored as plain text first. If the response is a JSON object, or a fenced JSON block, matching the existing `TaskSpec` schema, AgentBridge also attaches the parsed `TaskSpec` to the `PlannerResponse`.

The workbench orchestration layer will decide when to turn a planner response into a TaskSpec for Codex.

## Artifact Inputs

The planner provider can accept mission artifact references without requiring a browser or clipboard source.

Current behavior:

- Small text/code/document files are included inline in the planner prompt.
- Larger supported files can be uploaded through the provider transport when file upload is explicitly enabled.
- Uploaded file refs are persisted as `OpenAIUploadedFileRef` records keyed by local artifact file ID and SHA-256.
- Unsupported or binary files are summarized by metadata only.

Automatic provider file upload is disabled by default. Later autopilot policy work controls when uploads are allowed; until then, the default path keeps file content local unless a caller explicitly enables upload support on the provider.

## Planner-Generated Files

If the planner response contains fenced file blocks, AgentBridge can store them as local artifact files when an `ArtifactBrokerService` is available:

````text
```file:notes.md
content
```
````

Generated files are stored under the local AgentBridge artifact root. They are not written into the selected repository automatically.
