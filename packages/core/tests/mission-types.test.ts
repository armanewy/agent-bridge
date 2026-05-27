import { describe, expect, it } from "vitest";
import {
  HandoffCardSchema,
  LinkableComponentSchema,
  MissionSchema,
  TaskSpecSchema,
  CodexThreadRefSchema,
  type HandoffCard,
  type Mission,
  type TaskSpec,
  type CodexThreadRef
} from "../src/types.js";
import { codexThreadComponent, componentStatusLabel, desktopWindowComponent } from "../src/components.js";

const now = "2026-01-01T00:00:00.000Z";

const taskSpec: TaskSpec = {
  title: "Implement mission model",
  goal: "Promote handoffs into durable task cards.",
  background: "Imported product direction asks for mission-first task memory.",
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
      inputArtifactId: "artifact_1",
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

  it("parses LinkableComponent for the ChatGPT planner", () => {
    const component = {
      id: "component_planner_chatgpt",
      kind: "desktopWindow" as const,
      label: "ChatGPT planner",
      subtitle: "chatgpt.com",
      provider: "chatgpt" as const,
      roleCapabilities: {
        canBeTarget: false,
        canBeWorkspace: false,
        canDeliver: false,
        canVerify: false,
        canObserve: false
      },
      riskLevel: "low" as const,
      status: "available" as const,
      fitScore: 90,
      backingRef: {},
      metadata: { url: "https://chatgpt.com/" },
      discoveredAt: now,
      updatedAt: now
    };

    expect(LinkableComponentSchema.parse(component).provider).toBe("chatgpt");
    expect(componentStatusLabel(component)).toBe("Detected");
  });

  it("parses CodexThreadRef", () => {
    const ref: CodexThreadRef = {
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Refactor flow",
      repoPath: "C:/repo",
      status: "idle",
      source: "appServer",
      lastSeenAt: now,
      metadata: {}
    };

    expect(CodexThreadRefSchema.parse(ref).threadId).toBe("thread_123");
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
