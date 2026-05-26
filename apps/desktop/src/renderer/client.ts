import type {
  AgentBridgeApi,
  CodexDeliveryRequest,
  CodexDeliveryResult,
  DeliveryPreview,
  PreviewRequest,
  WindowRevalidation
} from "../services/bridge-contract.js";
import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  Link,
  SourceEndpoint,
  TargetEndpoint,
  WindowsDesktopWindowTarget
} from "@agentbridge/core";

const now = () => new Date().toISOString();

const mockSource: BrowserTabSource = {
  id: "src_mock_browser",
  kind: "browserTab",
  browser: "chrome",
  title: "ChatGPT - AgentBridge notes",
  url: "https://chatgpt.com/",
  boundAt: now()
};

const mockCapture: Capture = {
  id: "cap_mock_selection",
  sourceId: mockSource.id,
  captureType: "selectedText",
  text: "Build the AgentBridge MVP flow: capture selected browser text, transform it into an implementation brief, preview it, then send it to Codex with a codex:// deep link.",
  metadata: { mode: "mock" },
  createdAt: now(),
  userTriggered: true
};

let mockSources: SourceEndpoint[] = [mockSource];
let mockTargets: TargetEndpoint[] = [];
let mockLinks: Link[] = [];
let mockCaptures: Capture[] = [mockCapture];

export function getAgentBridgeApi(): AgentBridgeApi {
  return window.agentBridge ?? createMockAgentBridgeApi();
}

function createMockAgentBridgeApi(): AgentBridgeApi {
  return {
    async listSources() {
      return mockSources;
    },
    async listTargets() {
      return mockTargets;
    },
    async listLinks() {
      return mockLinks;
    },
    async listCaptures() {
      return mockCaptures;
    },
    async bindMockBrowserSource() {
      mockSources = [mockSource];
      mockCaptures = [mockCapture];
      return mockSource;
    },
    async createLink(input) {
      const link: Link = {
        id: `link_${mockLinks.length + 1}`,
        ...input,
        createdAt: now(),
        updatedAt: now(),
        enabled: true
      };
      mockLinks = [link, ...mockLinks];
      return link;
    },
    async previewHandoff(input: PreviewRequest): Promise<DeliveryPreview> {
      const capture = mockCaptures.find((item) => item.id === input.captureId) ?? mockCapture;
      const target = mockTargets.find((item) => item.id === input.targetId);
      const prompt = buildMockPrompt(capture.text, input.recipe);
      const source = mockSources.find((item) => item.id === capture.sourceId);
      return {
        handoff: {
          id: "handoff_mock",
          captureId: capture.id,
          sourceId: capture.sourceId,
          targetId: input.targetId,
          transformId: input.recipe,
          prompt,
          structured: {
            goal: "Deliver a structured handoff.",
            context: prompt,
            constraints: ["Keep data local until approval."],
            acceptanceCriteria: ["Preview is reviewed before delivery."],
            suggestedFiles: [],
            verificationSteps: ["Dry-run the target delivery."],
            originalCaptureRef: capture.id
          },
          redactionFindings: [],
          createdAt: now()
        },
        ...(source ? { source } : {}),
        ...(target ? { target } : {}),
        originalCaptureExcerpt: capture.text.slice(0, 320),
        deliveryStrategy: target?.kind === "codexDeepLink" ? "codexDeepLink" : "dryRun"
      };
    },
    async revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation> {
      return { status: "available", warnings: [], current: target };
    },
    async configureCodexTarget(repoPath: string) {
      const target: CodexDeepLinkTarget = {
        id: `target_codex_${mockTargets.length + 1}`,
        kind: "codexDeepLink",
        repoPath,
        openMode: "newThread",
        boundAt: now()
      };
      mockTargets = [target, ...mockTargets];
      return target;
    },
    async deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult> {
      const params = new URLSearchParams();
      params.set("prompt", input.prompt);
      params.set("path", input.target.repoPath);
      return {
        success: true,
        deepLink: `codex://threads/new?${params.toString()}`,
        promptLength: input.prompt.length,
        repoPath: input.target.repoPath,
        ...(input.dryRun ? {} : { openedAt: now() })
      };
    }
  };
}

function buildMockPrompt(text: string, recipe: string): string {
  if (recipe === "rawRelay") {
    return text;
  }

  return [
    "Goal:",
    "Implement the requested AgentBridge workflow.",
    "",
    "Context:",
    text,
    "",
    "Acceptance criteria:",
    "- Capture remains user-triggered.",
    "- Approval preview is shown before delivery.",
    "- Codex delivery uses a deep link."
  ].join("\n");
}
