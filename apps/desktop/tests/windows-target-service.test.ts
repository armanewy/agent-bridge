import { describe, expect, it } from "vitest";
import { scoreTargetMatch, toWindowsTarget } from "../src/services/windows-target-service.js";

describe("windows target service", () => {
  it("converts helper window metadata into a target", () => {
    const target = toWindowsTarget({
      hwnd: "0x123",
      processId: 42,
      title: "Notepad",
      executablePath: "C:\\Windows\\notepad.exe",
      className: "Notepad"
    });

    expect(target.kind).toBe("windowsDesktopWindow");
    expect(target.hwnd).toBe("0x123");
    expect(target.processId).toBe(42);
  });

  it("marks changed targets when title differs", () => {
    const original = toWindowsTarget({ hwnd: "0x123", processId: 42, title: "Notepad" });
    const current = { ...original, title: "PowerShell" };

    expect(scoreTargetMatch(original, current)).toMatchObject({
      status: "changed",
      warnings: ["Window title changed."]
    });
  });
});
