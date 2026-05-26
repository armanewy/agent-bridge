import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_NAME,
  nativeHostLauncherPathForPlatform,
  nativeHostManifestPathForPlatform
} from "../src/services/browser-import-service.js";

describe("BrowserImportService platform paths", () => {
  it("uses the Windows AgentBridge manifest path", () => {
    expect(nativeHostManifestPathForPlatform("windows", "C:\\Users\\me")).toContain(`${NATIVE_HOST_NAME}.json`);
    expect(nativeHostLauncherPathForPlatform("windows", "C:\\Users\\me\\AppData\\Local\\AgentBridge")).toBe(
      "C:\\Users\\me\\AppData\\Local\\AgentBridge\\agentbridge-native-host.cmd"
    );
  });

  it("uses the macOS Chrome NativeMessagingHosts path", () => {
    expect(nativeHostManifestPathForPlatform("macos", "/Users/me")).toBe(
      `/Users/me/Library/Application Support/Google/Chrome/NativeMessagingHosts/${NATIVE_HOST_NAME}.json`
    );
  });

  it("rejects unknown platforms", () => {
    expect(nativeHostManifestPathForPlatform("unknown", "/Users/me")).toBeUndefined();
  });
});
