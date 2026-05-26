import { describe, expect, it } from "vitest";
import type { WindowsDesktopWindowTarget } from "../src/types.js";
import { scoreWindowsTargetVerification } from "../src/safety.js";

const target: WindowsDesktopWindowTarget = {
  id: "target_1",
  kind: "windowsDesktopWindow",
  hwnd: "0x123",
  processId: 42,
  title: "Notepad",
  executablePath: "C:\\Windows\\notepad.exe",
  boundAt: "2026-01-01T00:00:00.000Z"
};

describe("target verification scoring", () => {
  it("passes matching targets", () => {
    expect(scoreWindowsTargetVerification(target, target)).toMatchObject({ status: "pass" });
  });

  it("blocks clear mismatches", () => {
    expect(scoreWindowsTargetVerification(target, { ...target, hwnd: "0x999", processId: 99, title: "Terminal" })).toMatchObject({
      status: "block"
    });
  });
});
