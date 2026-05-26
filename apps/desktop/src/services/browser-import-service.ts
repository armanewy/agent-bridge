import { join, posix, win32 } from "node:path";
import { homedir } from "node:os";
import type { PlatformKind } from "@agentbridge/core";
import { PlatformService } from "./platform-service.js";

export const NATIVE_HOST_NAME = "com.agentbridge.native_host";

export interface BrowserImportStatus {
  platform: PlatformKind;
  available: boolean;
  nativeHostManifestPath?: string;
  diagnostics: string[];
}

export class BrowserImportService {
  constructor(private readonly platformService = new PlatformService()) {}

  getStatus(): BrowserImportStatus {
    const capabilities = this.platformService.getCapabilities();
    const manifestPath = capabilities.canUseChromeNativeMessaging
      ? nativeHostManifestPathForPlatform(capabilities.platform)
      : undefined;
    return {
      platform: capabilities.platform,
      available: capabilities.canUseChromeNativeMessaging,
      ...(manifestPath ? { nativeHostManifestPath: manifestPath } : {}),
      diagnostics: capabilities.canUseChromeNativeMessaging
        ? ["Chrome native messaging is available as an optional import adapter."]
        : ["Chrome native messaging is not available on this platform."]
    };
  }

  async configureNativeHost(): Promise<BrowserImportStatus> {
    return this.getStatus();
  }

  async openExtensionInstall(): Promise<void> {
    throw new Error("Browser extension install is managed by Settings or platform-specific setup.");
  }

  async listImportedTabs(): Promise<unknown[]> {
    return [];
  }

  async importCapture(): Promise<unknown> {
    throw new Error("Browser capture import is optional and not part of the default Workbench flow.");
  }
}

export function nativeHostManifestPathForPlatform(platform: PlatformKind, homeDir = homedir()): string | undefined {
  if (platform === "windows") {
    return win32.join(process.env.LOCALAPPDATA ?? win32.join(homeDir, "AppData", "Local"), "AgentBridge", `${NATIVE_HOST_NAME}.json`);
  }
  if (platform === "macos") {
    return posix.join(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
  }
  if (platform === "linux") {
    return posix.join(homeDir, ".config", "google-chrome", "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
  }
  return undefined;
}

export function nativeHostLauncherPathForPlatform(platform: PlatformKind, userDataDir: string): string {
  if (platform === "windows") {
    return win32.join(userDataDir, "agentbridge-native-host.cmd");
  }
  return join(userDataDir, "agentbridge-native-host");
}
