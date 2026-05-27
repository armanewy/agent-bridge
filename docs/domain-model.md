# AgentBridge Domain Model

## Core Entities

Mission-first objects now sit above the original handoff router model:

- `LinkableComponent`: user-visible thing AgentBridge can connect, such as a browser tab, repo, desktop window, or agent target.
- `WorkflowLink`: reusable route between components, such as ChatGPT tab -> repo -> Codex.
- `Mission`: durable user task.
- `HandoffCard`: one target-agent dispatch inside a mission.
- `TaskSpec`: structured agent-ready task generated from a capture.
- `RepoContextPack`: branch/status/files/command context for repository-aware handoffs.
- `Artifact`: durable evidence such as captures, generated prompts, diffs, logs, and results.
- `VerificationPlan` / `VerificationResult`: explicit validation plan and outcome.

`Handoff` is the provider-neutral delivery record used by the current local pipeline.

### LinkableComponent

```ts
interface LinkableComponent {
  id: string;
  kind: "browserTab" | "desktopWindow" | "repo" | "agentTarget" | "terminal" | "ide" | "unknown";
  label: string;
  subtitle: string;
  provider: "chatgpt" | "claude" | "gemini" | "github" | "codex" | "vscode" | "cursor" | "terminal" | "repo" | "browser" | "unknown";
  roleCapabilities: {
    canBeSource: boolean;
    canBeTarget: boolean;
    canBeWorkspace: boolean;
    canCapture: boolean;
    canDeliver: boolean;
    canVerify: boolean;
    canObserve: boolean;
  };
  riskLevel: "low" | "medium" | "high";
  status: "available" | "permission_needed" | "unsupported" | "unavailable";
  fitScore: number;
  backingRef: {
    sourceId?: string;
    targetId?: string;
    repoPath?: string;
    hwnd?: string;
    tabId?: number;
    windowId?: number;
  };
  metadata: Record<string, unknown>;
  discoveredAt: string;
  updatedAt: string;
}
```

### WorkflowLink

A user-facing reusable route. Task Cards are created from workflow links after an explicit capture exists.

```ts
interface WorkflowLink {
  id: string;
  name: string;
  sourceComponentId: string;
  workspaceComponentId?: string;
  targetComponentId: string;
  recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
  verificationCommandDefaults: VerificationCommand[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Link

Saved route from one source endpoint to one target endpoint with a selected transform and delivery policy.

```ts
interface Link {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  transformId: string;
  deliveryMode: "codexDeepLink" | "windowsUia" | "clipboardFallbackApproved" | "dryRun";
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}
```

### SourceEndpoint

```ts
type SourceEndpoint = BrowserTabSource;

interface BrowserTabSource {
  id: string;
  kind: "browserTab";
  browser: "chrome";
  tabId?: number;
  windowId?: number;
  title: string;
  url: string;
  favIconUrl?: string;
  boundAt: string;
}
```

### TargetEndpoint

```ts
type TargetEndpoint =
  | WindowsDesktopWindowTarget
  | CodexDeepLinkTarget
  | ClipboardFallbackTarget;

interface WindowsDesktopWindowTarget {
  id: string;
  kind: "windowsDesktopWindow";
  hwnd: string;
  processId?: number;
  title: string;
  executablePath?: string;
  className?: string;
  boundAt: string;
}

interface CodexDeepLinkTarget {
  id: string;
  kind: "codexDeepLink";
  repoPath: string;
  originUrl?: string;
  existingThreadId?: string;
  openMode: "newThread";
  boundAt: string;
}

interface ClipboardFallbackTarget {
  id: string;
  kind: "clipboardFallback";
  parentTargetId: string;
  requiresExplicitApproval: true;
}
```

### Capture

```ts
interface Capture {
  id: string;
  sourceId: string;
  captureType: "selectedText" | "latestMessage" | "pageTextSummary";
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  userTriggered: true;
}
```

### Handoff

```ts
interface Handoff {
  id: string;
  captureId: string;
  sourceId: string;
  targetId: string;
  transformId: string;
  prompt: string;
  structured: {
    goal: string;
    context: string;
    constraints: string[];
    acceptanceCriteria: string[];
    suggestedFiles: string[];
    verificationSteps: string[];
    originalCaptureRef: string;
  };
  redactionFindings: RedactionFinding[];
  createdAt: string;
}
```

### Transform

```ts
interface Transform {
  id: string;
  recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
  inputCaptureId: string;
  outputHandoffId: string;
  createdAt: string;
}
```

### Approval

```ts
interface Approval {
  id: string;
  handoffId: string;
  decision: "approved" | "cancelled" | "edited";
  editedPrompt?: string;
  approvedFallbackStrategies: string[];
  approvedAt?: string;
  cancelledAt?: string;
}
```

### DeliveryAttempt

```ts
interface DeliveryAttempt {
  id: string;
  handoffId: string;
  targetId: string;
  strategy: "codexDeepLink" | "autoUiaOnly" | "valuePattern" | "clipboardPasteApproved" | "dryRun";
  success: boolean;
  warnings: string[];
  error?: string;
  targetMetadata: Record<string, unknown>;
  attemptedAt: string;
}
```

### AuditEvent

```ts
interface AuditEvent {
  id: string;
  type:
    | "sourceBound"
    | "targetBound"
    | "captureCreated"
    | "transformCreated"
    | "approvalGranted"
    | "approvalCancelled"
    | "deliveryAttempted"
    | "deliverySucceeded"
    | "deliveryFailed"
    | "redactionWarningShown";
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}
```

### RedactionFinding

```ts
interface RedactionFinding {
  id: string;
  kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
  severity: "high" | "medium" | "low";
  start: number;
  end: number;
  preview: string;
  recommendation: "redact" | "warn";
}
```

## Adapter Interfaces

```ts
interface SourceAdapter {
  kind: string;
  bind(): Promise<SourceEndpoint>;
  capture(source: SourceEndpoint, mode: string): Promise<Capture>;
  getStatus(source: SourceEndpoint): Promise<AdapterStatus>;
}

interface TargetAdapter {
  kind: string;
  bind(input?: unknown): Promise<TargetEndpoint>;
  validate(target: TargetEndpoint): Promise<TargetValidation>;
  deliver(target: TargetEndpoint, handoff: Handoff, approval: Approval): Promise<DeliveryAttempt>;
}

interface TransformAdapter {
  id: string;
  transform(capture: Capture, recipe: Transform["recipe"]): Promise<Handoff>;
}

interface RedactionAdapter {
  scan(text: string): Promise<RedactionFinding[]>;
  redact(text: string, findings: RedactionFinding[]): Promise<string>;
}

interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}
```

## First Concrete Adapter Types

- `BrowserTabSource`: Chrome active tab binding and explicit selected text capture.
- `WindowsDesktopWindowTarget`: Windows top-level window target with UI Automation metadata.
- `CodexDeepLinkTarget`: documented `codex://threads/new` path with repo path and encoded prompt.
- `ClipboardFallbackTarget`: explicit fallback wrapper that can only be used after approval.

## Lifecycle

1. Bind source through explicit extension action.
2. Bind target by selecting a resolved Codex path or Windows desktop window.
3. Capture selected/latest source content through a user action.
4. Transform capture into a structured handoff.
5. Preview source, target, prompt, redaction findings, and delivery strategy.
6. Approve, edit, or cancel.
7. Deliver through the target adapter.
8. Audit each meaningful step locally.

## Safety Invariants

- No silent scraping.
- No hidden sending.
- No destructive action without explicit approval.
- Always show the resolved target before send.
- Never send suspected secrets without warning and a redaction option.
- Clipboard and send-key fallbacks require explicit, per-send approval.
- Captured content is local by default.
