import { describe, expect, it } from "vitest";
import { PlatformService, platformKindFromNodePlatform } from "../src/services/platform-service.js";

describe("PlatformService", () => {
  it("maps Node platforms to AgentBridge platform kinds", () => {
    expect(platformKindFromNodePlatform("win32")).toBe("windows");
    expect(platformKindFromNodePlatform("darwin")).toBe("macos");
    expect(platformKindFromNodePlatform("linux")).toBe("linux");
    expect(platformKindFromNodePlatform("freebsd")).toBe("unknown");
  });

  it("reports Windows capabilities", () => {
    const service = new PlatformService({ platform: "win32", userDataDir: "C:\\Users\\me\\AppData\\Local\\AgentBridge" });

    expect(service.getCapabilities()).toMatchObject({
      platform: "windows",
      canUseWindowsUia: true,
      canUseMacAccessibility: false,
      canUseCodexAppServer: true
    });
    expect(service.getArtifactRoot()).toBe("C:\\Users\\me\\AppData\\Local\\AgentBridge\\artifacts");
  });

  it("reports macOS capabilities without Windows UIA", () => {
    const service = new PlatformService({ platform: "darwin", userDataDir: "/Users/me/Library/Application Support/AgentBridge" });

    expect(service.getCapabilities()).toMatchObject({
      platform: "macos",
      canUseWindowsUia: false,
      canUseDesktopAutomation: false,
      canUseCodexDeepLinks: true
    });
    expect(service.getDefaultShell()).toBe("/bin/zsh");
  });

  it("normalizes and compares paths using platform rules", () => {
    const windows = new PlatformService({ platform: "win32" });
    const macos = new PlatformService({ platform: "darwin" });

    expect(windows.pathEquals("C:\\Repo\\AgentBridge\\", "c:/repo/agentbridge")).toBe(true);
    expect(macos.pathEquals("/Users/me/Repo", "/Users/me/repo")).toBe(false);
  });
});
