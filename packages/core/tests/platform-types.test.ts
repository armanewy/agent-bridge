import { describe, expect, it } from "vitest";
import { PlatformCapabilitiesSchema, PlatformKindSchema, type PlatformCapabilities } from "../src/types.js";

describe("platform schemas", () => {
  it("parses supported platform kinds", () => {
    expect(PlatformKindSchema.parse("windows")).toBe("windows");
    expect(PlatformKindSchema.parse("macos")).toBe("macos");
    expect(PlatformKindSchema.parse("linux")).toBe("linux");
  });

  it("parses platform capabilities", () => {
    const capabilities: PlatformCapabilities = {
      platform: "macos",
      canPackageDesktopApp: true,
      canRunShellCommands: true,
      canOpenExternalLinks: true,
      canUseCodexAppServer: true,
      canUseDesktopAutomation: false,
      canUseWindowsUia: false,
      canUseMacAccessibility: false,
      canUseAppleEvents: false,
      canUseGlobalShortcuts: true,
      canUseTray: true,
      canUseFilePicker: true,
      canUseUserSelectedRepoAccess: true
    };

    expect(PlatformCapabilitiesSchema.parse(capabilities).platform).toBe("macos");
  });
});
