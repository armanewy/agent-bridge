import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path, { normalize, posix, win32 } from "node:path";
import type { PlatformCapabilities, PlatformKind } from "@agentbridge/core";

export interface PlatformServiceOptions {
  platform?: NodeJS.Platform | PlatformKind | string;
  userDataDir?: string;
  appPath?: string;
  resourcesPath?: string;
  isPackaged?: boolean;
  openExternal?: (url: string) => Promise<void>;
  openFolder?: (folderPath: string) => Promise<void>;
  selectFolder?: () => Promise<string | undefined>;
}

export class PlatformService {
  private readonly platform: PlatformKind;

  constructor(private readonly options: PlatformServiceOptions = {}) {
    this.platform = platformKindFromNodePlatform(options.platform ?? process.platform);
  }

  getPlatform(): PlatformKind {
    return this.platform;
  }

  getCapabilities(): PlatformCapabilities {
    const isDesktopPlatform = this.platform === "windows" || this.platform === "macos" || this.platform === "linux";
    return {
      platform: this.platform,
      canPackageDesktopApp: isDesktopPlatform,
      canRunShellCommands: isDesktopPlatform,
      canOpenExternalLinks: isDesktopPlatform,
      canUseCodexAppServer: isDesktopPlatform,
      canUseDesktopAutomation: this.platform === "windows",
      canUseWindowsUia: this.platform === "windows",
      canUseMacAccessibility: false,
      canUseAppleEvents: false,
      canUseGlobalShortcuts: isDesktopPlatform,
      canUseTray: isDesktopPlatform,
      canUseFilePicker: isDesktopPlatform,
      canUseUserSelectedRepoAccess: isDesktopPlatform
    };
  }

  getUserDataDir(): string {
    if (process.env.AGENTBRIDGE_STORE_DIR) {
      return process.env.AGENTBRIDGE_STORE_DIR;
    }
    if (this.options.userDataDir) {
      return this.options.userDataDir;
    }

    if (this.platform === "windows") {
      return win32.join(process.env.LOCALAPPDATA ?? win32.join(homedir(), "AppData", "Local"), "AgentBridge");
    }
    if (this.platform === "macos") {
      return posix.join(homedir(), "Library", "Application Support", "AgentBridge");
    }
    return posix.join(process.env.XDG_CONFIG_HOME ?? posix.join(homedir(), ".config"), "AgentBridge");
  }

  getArtifactRoot(): string {
    return this.joinPath(this.getUserDataDir(), "artifacts");
  }

  getStagingRoot(): string {
    return this.joinPath(this.getUserDataDir(), "staging");
  }

  getLogsDir(): string {
    return this.joinPath(this.getUserDataDir(), "logs");
  }

  resolveBundledResource(relativePath: string): string {
    const base = this.options.isPackaged && this.options.resourcesPath
      ? this.options.resourcesPath
      : this.options.appPath ?? process.cwd();
    return this.joinPath(base, relativePath);
  }

  async openExternal(url: string): Promise<void> {
    if (!this.options.openExternal) {
      throw new Error("No platform opener is configured.");
    }
    assertAllowedExternalUrl(url);
    await this.options.openExternal(url);
  }

  async openFolder(folderPath: string): Promise<void> {
    await mkdir(folderPath, { recursive: true });
    await this.openPath(folderPath);
  }

  async openPath(targetPath: string): Promise<void> {
    if (!this.options.openFolder) {
      throw new Error("No platform folder opener is configured.");
    }
    await this.options.openFolder(targetPath);
  }

  async selectRepoFolder(): Promise<string | undefined> {
    if (!this.options.selectFolder) {
      throw new Error("No platform file picker is configured.");
    }
    return this.options.selectFolder();
  }

  getDefaultShell(): string {
    if (this.platform === "windows") {
      return process.env.ComSpec || "cmd.exe";
    }
    if (this.platform === "macos") {
      return "/bin/zsh";
    }
    return process.env.SHELL || "/bin/bash";
  }

  normalizePath(value: string): string {
    const normalized = this.pathModuleFor(value).normalize(value);
    return this.platform === "windows"
      ? normalized.replace(/\//g, "\\")
      : normalized.replace(/\\/g, "/");
  }

  pathEquals(a: string, b: string): boolean {
    const left = stripTrailingSeparator(this.normalizePath(a));
    const right = stripTrailingSeparator(this.normalizePath(b));
    return this.platform === "windows" ? left.toLowerCase() === right.toLowerCase() : left === right;
  }

  toDisplayPath(value: string): string {
    return this.normalizePath(value);
  }

  private pathModuleFor(value: string): typeof win32 | typeof posix | typeof path {
    if (this.platform === "windows" || /^[a-zA-Z]:[\\/]/.test(value) || value.includes("\\")) {
      return win32;
    }
    if (this.platform === "macos" || this.platform === "linux" || value.startsWith("/")) {
      return posix;
    }
    return path;
  }

  private joinPath(base: string, ...segments: string[]): string {
    return this.pathModuleFor(base).join(base, ...segments);
  }
}

export function assertAllowedExternalUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("External URL must be absolute.");
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`External URL protocol is not allowed: ${parsed.protocol}`);
  }
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function platformKindFromNodePlatform(platform: NodeJS.Platform | PlatformKind | string): PlatformKind {
  if (platform === "win32" || platform === "windows") {
    return "windows";
  }
  if (platform === "darwin" || platform === "macos") {
    return "macos";
  }
  if (platform === "linux") {
    return "linux";
  }
  return "unknown";
}

function stripTrailingSeparator(value: string): string {
  return normalize(value).replace(/[\\/]+$/, "");
}
