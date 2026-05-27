import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { createDefaultChatGptCodexWorkflowTemplate } from "@agentbridge/core";
import { WorkflowTemplateService } from "../src/services/workflow-template-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-workflow-template-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorkflowTemplateService", () => {
  it("ensures the default template", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorkflowTemplateService(store);

    const template = await service.ensureDefaultTemplate();

    expect(template.id).toBe("workflow_default_chatgpt_codex");
    expect(await store.listWorkflowTemplates()).toEqual([template]);
  });

  it("validates role provider capabilities", () => {
    const service = new WorkflowTemplateService(new JsonFileStore(tempDir));
    const template = createDefaultChatGptCodexWorkflowTemplate();

    const issues = service.validateTemplateProviders(template, [
      {
        id: "codex",
        kind: "executor",
        displayName: "Codex",
        capabilities: ["canExecuteCode", "canUseRepo"],
        authMode: "appServer",
        status: "available",
        metadata: {}
      }
    ]);

    expect(issues).toContain("executor provider codex lacks canSendMessage.");
  });
});
