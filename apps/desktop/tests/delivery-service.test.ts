import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { Handoff, WindowsDesktopWindowTarget } from "@agentbridge/core";
import { DeliveryService } from "../src/services/delivery-service.js";
import type { WindowsTargetService } from "../src/services/windows-target-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-delivery-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("DeliveryService", () => {
  it("blocks clipboard fallback without explicit approval", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new DeliveryService(store, fakeWindowsTargetService());
    const attempt = await service.deliverToWindows({
      target: windowsTarget,
      handoff,
      strategy: "clipboardPasteApproved"
    });

    expect(attempt.success).toBe(false);
    expect(attempt.error).toContain("explicit approval");
  });
});

const windowsTarget: WindowsDesktopWindowTarget = {
  id: "target_windows_1",
  kind: "windowsDesktopWindow",
  hwnd: "0x123",
  processId: 42,
  title: "Notepad",
  boundAt: "2026-01-01T00:00:00.000Z"
};

const handoff: Handoff = {
  id: "handoff_1",
  captureId: "cap_1",
  sourceId: "src_1",
  targetId: windowsTarget.id,
  transformId: "rawRelay",
  prompt: "Hello",
  structured: {
    goal: "Send",
    context: "Hello",
    constraints: [],
    acceptanceCriteria: [],
    suggestedFiles: [],
    verificationSteps: [],
    originalCaptureRef: "cap_1"
  },
  redactionFindings: [],
  createdAt: "2026-01-01T00:00:00.000Z"
};

function fakeWindowsTargetService(): WindowsTargetService {
  return {
    revalidate: async () => ({ status: "available", warnings: [], current: windowsTarget }),
    deliverText: async () => ({ success: true })
  } as unknown as WindowsTargetService;
}
