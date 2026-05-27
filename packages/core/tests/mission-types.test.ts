import { describe, expect, it } from "vitest";
import {
  HandoffCardSchema,
  HandoffSchema,
  LinkableComponentSchema,
  MissionSchema,
  TaskSpecSchema,
  WorkflowLinkSchema,
  CodexThreadRefSchema,
  DesktopAppSessionSchema,
  SourceEndpointSchema,
  type Handoff,
  type HandoffCard,
  type Mission,
  type TaskSpec,
  type WorkflowLink,
  type CodexThreadRef,
  type DesktopAppSession
} from "../src/types.js";
import { browserTabComponent, chatGptDesktopSessionComponent, codexThreadComponent, componentStatusLabel, desktopWindowComponent } from "../src/components.js";

const now = "2026-01-01T00:00:00.000Z";

const taskSpec: TaskSpec = {
  title: "Implement mission model",
  goal: "Promote handoffs into durable task cards.",
  background: "Captured product direction asks for mission-first task memory.",
  instructions: ["Add schemas", "Keep the model focused"],
  requirements: ["Mission parses", "HandoffCard parses"],
  constraints: ["Keep the change scoped"],
  nonGoals: ["Do not add providers"],
  acceptanceCriteria: ["Tests pass"],
  suggestedFiles: ["packages/core/src/types.ts"],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};

describe("mission-first schemas", () => {
  it("parses Mission", () => {
    const mission: Mission = {
      id: "mission_1",
      title: "Mission model",
      goal: "Create durable task memory.",
      status: "draft",
      sourceIds: ["src_1"],
      captureIds: ["cap_1"],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      createdAt: now,
      updatedAt: now
    };

    expect(MissionSchema.parse(mission).id).toBe("mission_1");
  });

  it("parses TaskSpec", () => {
    expect(TaskSpecSchema.parse(taskSpec).title).toBe("Implement mission model");
  });

  it("parses HandoffCard", () => {
    const card: HandoffCard = {
      id: "card_1",
      missionId: "mission_1",
      sourceId: "src_1",
      captureId: "cap_1",
      targetId: "target_1",
      recipe: "implementationBrief",
      taskSpec,
      generatedPrompt: "Goal:\nPromote handoffs.",
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: [],
      createdAt: now,
      updatedAt: now
    };

    expect(HandoffCardSchema.parse(card).taskSpec.goal).toContain("task cards");
  });

  it("parses Handoff", () => {
    const handoff: Handoff = {
      id: "handoff_1",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Do the thing",
      structured: {
        goal: "Relay",
        context: "Do the thing",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };

    expect(HandoffSchema.parse(handoff).id).toBe("handoff_1");
  });

  it("parses LinkableComponent and classifies browser tabs", () => {
    const component = browserTabComponent({
      id: "src_1",
      kind: "browserTab",
      browser: "chrome",
      tabId: 12,
      title: "ChatGPT - AgentBridge",
      url: "https://chatgpt.com/c/123",
      boundAt: now
    });

    expect(LinkableComponentSchema.parse(component).provider).toBe("chatgpt");
    expect(componentStatusLabel(component)).toBe("Capture ready");
  });

  it("parses WorkflowLink", () => {
    const link: WorkflowLink = {
      id: "workflow_1",
      name: "ChatGPT to Codex",
      sourceComponentId: "component_source_1",
      workspaceComponentId: "component_repo_1",
      targetComponentId: "component_target_1",
      recipe: "implementationBrief",
      verificationCommandDefaults: [{ kind: "test", command: "pnpm test" }],
      codexThreadId: "thread_123",
      codexOpenMode: "existingThread",
      codexIntegrationMode: "deepLink",
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    expect(WorkflowLinkSchema.parse(link).verificationCommandDefaults).toHaveLength(1);
  });

  it("parses CodexThreadRef", () => {
    const ref: CodexThreadRef = {
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Refactor flow",
      repoPath: "C:/repo",
      status: "idle",
      source: "manual",
      lastSeenAt: now,
      metadata: {}
    };

    expect(CodexThreadRefSchema.parse(ref).threadId).toBe("thread_123");
  });

  it("parses ChatGPT desktop sessions and exposes them as source components", () => {
    const session: DesktopAppSession = {
      id: "desktop_session_1",
      provider: "chatgpt",
      appKind: "desktopApp",
      processId: 123,
      hwnd: "0x123",
      executablePath: "C:/Users/example/AppData/Local/Programs/ChatGPT/ChatGPT.exe",
      windowTitle: "ChatGPT",
      sessionTitle: "AgentBridge planning",
      fingerprint: "session_fingerprint",
      capabilities: {
        canReadSelectedText: true,
        canReadLatestMessage: true,
        canListSessions: false,
        canSendTurn: false
      },
      confidence: "medium",
      discoveredAt: now,
      updatedAt: now
    };
    const source = {
      ...session,
      kind: "chatgptDesktop" as const,
      provider: "chatgpt" as const,
      boundAt: now
    };

    expect(DesktopAppSessionSchema.parse(session).fingerprint).toBe("session_fingerprint");
    expect(SourceEndpointSchema.parse(source).kind).toBe("chatgptDesktop");
    const component = chatGptDesktopSessionComponent(session);
    expect(component.provider).toBe("chatgptDesktop");
    expect(component.roleCapabilities.canBeSource).toBe(true);
    expect(component.roleCapabilities.canReadSelectedText).toBe(true);
  });

  it("exposes Codex thread refs as session targets", () => {
    const component = codexThreadComponent({
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Existing work",
      repoPath: "C:/repo",
      status: "idle",
      source: "appServer",
      lastSeenAt: now,
      metadata: {}
    }, { targetId: "target_1" });

    expect(component.kind).toBe("codexThread");
    expect(component.backingRef.codexThreadId).toBe("thread_123");
    expect(component.roleCapabilities.canStartTurn).toBe(true);
  });

  it("marks detected desktop windows as inspectable until a safe target route exists", () => {
    const terminal = desktopWindowComponent({
      id: "target_windows_1",
      kind: "windowsDesktopWindow",
      hwnd: "123",
      title: "Windows Terminal",
      executablePath: "C:/Windows/System32/WindowsTerminal.exe",
      boundAt: now
    });

    expect(terminal.provider).toBe("terminal");
    expect(terminal.riskLevel).toBe("high");
    expect(terminal.roleCapabilities.canBeTarget).toBe(false);
    expect(componentStatusLabel(terminal)).toBe("High risk");
  });
});
