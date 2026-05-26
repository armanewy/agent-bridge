import { access, chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultAgentBridgeDataDir, type LocalStore } from "@agentbridge/local-store";
import type { ConfigureNativeHostRequest, SetupCheck, SetupStatus } from "./bridge-contract.js";
import { nativeHostLauncherPathForPlatform, nativeHostManifestPathForPlatform } from "./browser-import-service.js";
import { platformKindFromNodePlatform } from "./platform-service.js";

const execFileAsync = promisify(execFile);
const HOST_NAME = "com.agentbridge.native_host";
const EXTENSION_ID_SETTING = "setup:chromeExtensionId";
const REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

export interface NativeHostRegistry {
  preferredManifestPath?(dataDir: string): string | undefined;
  readManifestPath(): Promise<string | undefined>;
  writeManifestPath(path: string): Promise<void>;
}

export interface HelperPathOptions {
  isPackaged?: boolean;
  resourcesPath?: string;
  appPath?: string;
  repoRoot?: string;
  devServerUrl?: string;
  extensionId?: string;
  webStoreUrl?: string;
  extensionPublicKey?: string;
}

export interface HelperPaths {
  mode: "development" | "packaged";
  appPath: string;
  resourcesPath?: string;
  nativeHostScriptPath: string;
  winUiaHelperPath: string;
  devServerUrl?: string;
}

export class SetupService {
  private readonly helperPaths: HelperPaths;
  private readonly configuredExtensionId: string | undefined;
  private readonly webStoreUrl: string | undefined;
  private readonly extensionPublicKey: string | undefined;

  constructor(
    private readonly store: LocalStore,
    private readonly registry: NativeHostRegistry = createDefaultNativeHostRegistry(),
    private readonly dataDir = defaultAgentBridgeDataDir(),
    private readonly repoRoot = process.cwd(),
    helperPathOptions: HelperPathOptions = {}
  ) {
    this.helperPaths = resolveHelperPaths({ ...helperPathOptions, repoRoot });
    this.configuredExtensionId = helperPathOptions.extensionId ?? process.env.AGENTBRIDGE_CHROME_EXTENSION_ID;
    this.webStoreUrl = helperPathOptions.webStoreUrl ?? process.env.AGENTBRIDGE_CHROME_WEB_STORE_URL;
    this.extensionPublicKey = helperPathOptions.extensionPublicKey ?? process.env.AGENTBRIDGE_CHROME_EXTENSION_PUBLIC_KEY;
  }

  async getStatus(): Promise<SetupStatus> {
    const manualExtensionId = await this.store.getSetting<string>(EXTENSION_ID_SETTING);
    const extensionId = this.resolveExtensionId(manualExtensionId);
    const extensionIdentityMode = this.resolveExtensionIdentityMode(manualExtensionId);
    const manifestPath = await this.registry.readManifestPath();
    const manifestInfo = manifestPath ? await readManifestInfo(manifestPath) : undefined;
    const storeWritable = await isStoreWritable(this.dataDir);
    const codexTargetConfigured = (await this.store.listTargets()).some((target) => target.kind === "codexDeepLink");
    const heartbeat = await this.store.getExtensionHeartbeat();
    const extensionConnected = Boolean(heartbeat && Date.now() - Date.parse(heartbeat.receivedAt) < HEARTBEAT_STALE_MS);
    const expectedOrigin = extensionId ? `chrome-extension://${extensionId}/` : undefined;
    const nativeHostRegistered = Boolean(manifestPath && manifestInfo?.manifestExists);
    const nativeHostPathValid = Boolean(manifestInfo?.hostPathExists);
    const allowedOriginMatches = Boolean(expectedOrigin && manifestInfo?.allowedOrigins.includes(expectedOrigin));
    const repairNeeded = Boolean(extensionId && (!nativeHostRegistered || !nativeHostPathValid || !allowedOriginMatches));
    const productionMissingExtensionId = this.helperPaths.mode === "packaged" && !extensionId;

    return {
      checks: [
        check("storeWritable", "Local store writable", storeWritable, this.dataDir),
        check(
          "extensionId",
          "Chrome extension ID configured",
          Boolean(extensionId),
          extensionId ?? "Production extension ID is missing. Configure AGENTBRIDGE_CHROME_EXTENSION_ID."
        ),
        check(
          "nativeHostManifest",
          "Native host manifest registered",
          nativeHostRegistered,
          manifestPath ?? "No registry entry found."
        ),
        check(
          "nativeHostPath",
          "Native host launcher path valid",
          nativeHostPathValid,
          manifestInfo?.hostPath ?? "No launcher path found."
        ),
        check(
          "allowedOrigin",
          "Manifest allows extension",
          allowedOriginMatches,
          expectedOrigin ?? "No extension ID to validate."
        ),
        {
          id: "extensionHealth",
          label: "Extension health check",
          status: extensionConnected ? "ready" : "warning",
          details: heartbeat
            ? `Last extension message: ${heartbeat.messageType} at ${heartbeat.receivedAt}.`
            : "Open the AgentBridge Chrome extension and check the desktop connection."
        },
        ...(productionMissingExtensionId
          ? [
              {
                id: "productionExtensionId",
                label: "Production extension ID",
                status: "missing" as const,
                details: "Production extension ID is missing. Configure AGENTBRIDGE_CHROME_EXTENSION_ID."
              }
            ]
          : []),
        check(
          "codexTarget",
          "Codex target configured",
          codexTargetConfigured,
          codexTargetConfigured ? "At least one Codex target is saved." : "Configure a Codex repo path in Settings."
        )
      ],
      extensionIdentityMode,
      extensionIdKnown: Boolean(extensionId),
      extensionConnected,
      ...(heartbeat?.receivedAt ? { lastExtensionHeartbeatAt: heartbeat.receivedAt } : {}),
      ...(heartbeat?.messageType ? { lastExtensionMessageType: heartbeat.messageType } : {}),
      ...(heartbeat?.extensionVersion ? { extensionVersion: heartbeat.extensionVersion } : {}),
      nativeHostRegistered,
      nativeHostPathValid,
      allowedOriginMatches,
      repairNeeded,
      ...(extensionId ? { extensionId } : {}),
      ...(this.webStoreUrl ? { webStoreUrl: this.webStoreUrl } : {}),
      ...(manifestPath ? { nativeHostManifestPath: manifestPath } : {}),
      ...(manifestInfo?.hostPath ? { nativeHostLauncherPath: manifestInfo.hostPath } : {}),
      nativeHostScriptPath: this.helperPaths.nativeHostScriptPath,
      winUiaHelperPath: this.helperPaths.winUiaHelperPath,
      mode: this.helperPaths.mode,
      ...(this.helperPaths.devServerUrl ? { devServerUrl: this.helperPaths.devServerUrl } : {}),
      storePath: this.dataDir
    };
  }

  async configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus> {
    const extensionId = this.resolveExtensionId(input.extensionId?.trim() || (await this.store.getSetting<string>(EXTENSION_ID_SETTING)));
    if (!extensionId && this.helperPaths.mode === "packaged") {
      throw new Error("Production extension ID is missing. Configure AGENTBRIDGE_CHROME_EXTENSION_ID.");
    }
    if (!extensionId) {
      throw new Error("Chrome extension ID is required in development. Configure it under Advanced diagnostics.");
    }
    if (!/^[a-p]{32}$/.test(extensionId)) {
      throw new Error("Chrome extension ID must be 32 lowercase letters from a-p.");
    }

    await mkdir(this.dataDir, { recursive: true });
    const platform = platformKindFromNodePlatform(process.platform);
    const launcherPath = nativeHostLauncherPathForPlatform(platform, this.dataDir);
    const manifestPath = this.registry.preferredManifestPath?.(this.dataDir) ?? join(this.dataDir, `${HOST_NAME}.json`);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(launcherPath, renderLauncher(this.helperPaths.nativeHostScriptPath, platform), "utf8");
    if (platform !== "windows") {
      await chmod(launcherPath, 0o755);
    }
    await writeFile(manifestPath, renderManifest(launcherPath, extensionId), "utf8");
    await this.registry.writeManifestPath(manifestPath);
    if (!this.configuredExtensionId) {
      await this.store.saveSetting(EXTENSION_ID_SETTING, extensionId);
    }
    return this.getStatus();
  }

  private resolveExtensionId(manualExtensionId?: string): string | undefined {
    return this.configuredExtensionId || manualExtensionId || undefined;
  }

  private resolveExtensionIdentityMode(manualExtensionId?: string): SetupStatus["extensionIdentityMode"] {
    if (this.configuredExtensionId) {
      return "production";
    }
    if (this.extensionPublicKey && manualExtensionId) {
      return "preproductionStableKey";
    }
    return "developmentManual";
  }
}

function createDefaultNativeHostRegistry(): NativeHostRegistry {
  if (process.platform === "win32") {
    return new WindowsNativeHostRegistry();
  }
  return new FileNativeHostRegistry(platformKindFromNodePlatform(process.platform));
}

export function resolveHelperPaths(options: HelperPathOptions = {}): HelperPaths {
  const isPackaged = options.isPackaged ?? false;
  const repoRoot = resolve(options.repoRoot ?? process.cwd());

  if (isPackaged) {
    const resourcesPath = options.resourcesPath ?? resolve(options.appPath ?? repoRoot, "..");
    return {
      mode: "packaged",
      appPath: options.appPath ?? repoRoot,
      resourcesPath,
      nativeHostScriptPath: join(resourcesPath, "native-host", "native-host.mjs"),
      winUiaHelperPath: join(resourcesPath, "win-uia-helper", "AgentBridge.WinUiaHelper.exe")
    };
  }

  return {
    mode: "development",
    appPath: repoRoot,
    nativeHostScriptPath: resolve(repoRoot, "apps/native-host/dist/src/index.js"),
    winUiaHelperPath: resolve(repoRoot, "apps/win-uia-helper/bin/Debug/net8.0-windows/AgentBridge.WinUiaHelper.exe"),
    ...(options.devServerUrl ? { devServerUrl: options.devServerUrl } : {})
  };
}

class WindowsNativeHostRegistry implements NativeHostRegistry {
  async readManifestPath(): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync("reg", ["query", REGISTRY_KEY, "/ve"], { windowsHide: true });
      const match = stdout.match(/REG_SZ\s+(.+)\r?$/m);
      return match?.[1]?.trim();
    } catch {
      return undefined;
    }
  }

  async writeManifestPath(path: string): Promise<void> {
    await execFileAsync("reg", ["add", REGISTRY_KEY, "/ve", "/t", "REG_SZ", "/d", path, "/f"], { windowsHide: true });
  }
}

class FileNativeHostRegistry implements NativeHostRegistry {
  constructor(private readonly platform: ReturnType<typeof platformKindFromNodePlatform>) {}

  preferredManifestPath(): string | undefined {
    return nativeHostManifestPathForPlatform(this.platform);
  }

  async readManifestPath(): Promise<string | undefined> {
    const manifestPath = this.preferredManifestPath();
    if (!manifestPath) {
      return undefined;
    }
    return await exists(manifestPath) ? manifestPath : undefined;
  }

  async writeManifestPath(_path: string): Promise<void> {
    return undefined;
  }
}

function check(id: string, label: string, isReady: boolean, details: string): SetupCheck {
  return {
    id,
    label,
    status: isReady ? "ready" : "missing",
    details
  };
}

async function readManifestInfo(manifestPath: string): Promise<{
  manifestExists: boolean;
  hostPath?: string;
  hostPathExists: boolean;
  allowedOrigins: string[];
}> {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      path?: string;
      allowed_origins?: string[];
    };
    const hostPath = manifest.path;
    return {
      manifestExists: true,
      ...(hostPath ? { hostPath } : {}),
      hostPathExists: hostPath ? await exists(hostPath) : false,
      allowedOrigins: manifest.allowed_origins ?? []
    };
  } catch {
    return { manifestExists: false, hostPathExists: false, allowedOrigins: [] };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isStoreWritable(path: string): Promise<boolean> {
  const probe = join(path, `.agentbridge-write-test-${Date.now()}`);
  try {
    await mkdir(dirname(probe), { recursive: true });
    await writeFile(probe, "ok", "utf8");
    await unlink(probe);
    return true;
  } catch {
    return false;
  }
}

function renderLauncher(hostScriptPath: string, platform = platformKindFromNodePlatform(process.platform)): string {
  if (platform !== "windows") {
    return [`#!/bin/sh`, `exec node "${hostScriptPath}"`].join("\n");
  }
  return [`@echo off`, `node "${hostScriptPath}"`].join("\r\n");
}

function renderManifest(launcherPath: string, extensionId: string): string {
  return `${JSON.stringify(
    {
      name: HOST_NAME,
      description: "AgentBridge local native messaging host",
      path: launcherPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`]
    },
    null,
    2
  )}\n`;
}
