import type {
  AgentBridgeApi,
  CodexDeliveryRequest,
  CodexDeliveryResult,
  DeliveryPreview,
  MissionDetail,
  PreviewRequest,
  VerificationRunRequest,
  VerificationRunResponse,
  WindowRevalidation
} from "../services/bridge-contract.js";
import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  Link,
  AuditEvent,
  Mission,
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
let mockAuditEvents: AuditEvent[] = [];
let mockMissions: Mission[] = [];
let mockMissionDetails = new Map<string, MissionDetail>();

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
    async listMissions() {
      return mockMissions;
    },
    async getMissionDetail(id: string) {
      return mockMissionDetails.get(id);
    },
    async bindMockBrowserSource() {
      mockSources = [mockSource];
      mockCaptures = [mockCapture];
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "sourceBound",
          entityId: mockSource.id,
          details: { mode: "mock" },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
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
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "targetBound",
          entityId: link.targetId,
          details: { linkId: link.id },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return link;
    },
    async previewHandoff(input: PreviewRequest): Promise<DeliveryPreview> {
      const capture = mockCaptures.find((item) => item.id === input.captureId) ?? mockCapture;
      const target = mockTargets.find((item) => item.id === input.targetId);
      const prompt = buildMockPrompt(capture.text, input.recipe);
      const mission = {
        id: "mission_mock",
        title: "Build AgentBridge MVP flow",
        goal: "Compile a browser capture into a Codex-ready task.",
        status: "draft" as const,
        sourceIds: [capture.sourceId],
        captureIds: [capture.id],
        handoffCardIds: ["card_mock"],
        artifactIds: ["artifact_prompt_mock"],
        runIds: [],
        createdAt: now(),
        updatedAt: now()
      };
      const taskSpec = {
        title: "Build AgentBridge MVP flow",
        goal: "Compile a browser capture into a Codex-ready task.",
        background: capture.text,
        instructions: ["Inspect the repository before editing.", "Preserve existing patterns."],
        requirements: ["Keep capture user-triggered.", "Show approval preview before delivery."],
        constraints: ["Do not broaden scope.", "Do not add providers."],
        nonGoals: ["No autonomous routing."],
        acceptanceCriteria: ["Codex receives the approved generated prompt."],
        suggestedFiles: [],
        verificationSteps: ["Run relevant tests."],
        expectedSummaryFormat: "Summary, verification, risks."
      };
      const handoffCard = {
        id: "card_mock",
        missionId: mission.id,
        sourceId: capture.sourceId,
        captureId: capture.id,
        targetId: input.targetId,
        recipe: input.recipe,
        taskSpec,
        generatedPrompt: prompt,
        redactionFindings: [],
        deliveryAttemptIds: [],
        artifactIds: ["artifact_prompt_mock"],
        createdAt: now(),
        updatedAt: now()
      };
      const artifacts = [
        {
          id: "artifact_prompt_mock",
          missionId: mission.id,
          handoffCardId: handoffCard.id,
          kind: "generatedPrompt" as const,
          title: "Generated prompt",
          content: prompt,
          metadata: {},
          createdAt: now()
        }
      ];
      mockMissions = [mission, ...mockMissions.filter((item) => item.id !== mission.id)];
      mockMissionDetails.set(mission.id, {
        mission,
        handoffCards: [handoffCard],
        artifacts,
        deliveryAttempts: [],
        runs: [],
        verificationResults: []
      });
      const source = mockSources.find((item) => item.id === capture.sourceId);
      return {
        handoff: {
          id: "handoff_mock",
          missionId: mission.id,
          handoffCardId: handoffCard.id,
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
        mission,
        handoffCard,
        taskSpec,
        artifacts,
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
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "targetBound",
          entityId: target.id,
          details: { kind: "codexDeepLink", repoPath },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return target;
    },
    async deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult> {
      const params = new URLSearchParams();
      params.set("prompt", input.prompt);
      params.set("path", input.target.repoPath);
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: input.dryRun ? "deliveryAttempted" : "deliverySucceeded",
          ...(input.handoffId ? { entityId: input.handoffId } : {}),
          details: { targetId: input.target.id, dryRun: input.dryRun },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return {
        success: true,
        deepLink: `codex://threads/new?${params.toString()}`,
        promptLength: input.prompt.length,
        repoPath: input.target.repoPath,
        ...(input.dryRun ? {} : { openedAt: now() })
      };
    },
    async runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse> {
      const detail = mockMissionDetails.get(input.missionId);
      if (!detail) {
        throw new Error("Mission not found.");
      }
      const artifact = {
        id: `artifact_verification_${Date.now()}`,
        missionId: input.missionId,
        kind: "gitDiff" as const,
        title: "Git diff summary",
        content: "Mock verification captured a git diff summary.",
        metadata: {},
        createdAt: now()
      };
      const run = {
        id: `run_${Date.now()}`,
        missionId: input.missionId,
        status: "needs_review" as const,
        stepIds: [],
        artifactIds: [artifact.id],
        startedAt: now(),
        completedAt: now(),
        createdAt: now(),
        updatedAt: now()
      };
      const result = {
        id: `verification_${Date.now()}`,
        missionId: input.missionId,
        runId: run.id,
        status: "needs_review" as const,
        commandResults: [],
        summary: "Mock verification needs review.",
        artifactIds: [artifact.id],
        createdAt: now()
      };
      mockMissionDetails.set(input.missionId, {
        ...detail,
        mission: {
          ...detail.mission,
          status: "needs_review",
          runIds: [...detail.mission.runIds, run.id],
          artifactIds: [...detail.mission.artifactIds, artifact.id],
          updatedAt: now()
        },
        artifacts: [artifact, ...detail.artifacts],
        runs: [run, ...detail.runs],
        verificationResults: [result, ...detail.verificationResults]
      });
      mockMissions = mockMissions.map((mission) =>
        mission.id === input.missionId ? mockMissionDetails.get(input.missionId)?.mission ?? mission : mission
      );
      return { run, result, artifacts: [artifact] };
    },
    async listAuditEvents() {
      return mockAuditEvents;
    },
    async clearAuditEvents() {
      mockAuditEvents = [];
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
