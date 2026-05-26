import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultAgentBridgeDataDir, type LocalStore } from "@agentbridge/local-store";
import type { ConfigureNativeHostRequest, SetupCheck, SetupStatus } from "./bridge-contract.js";

const execFileAsync = promisify(execFile);
const HOST_NAME = "com.agentbridge.native_host";
const EXTENSION_ID_SETTING = "setup:chromeExtensionId";
const REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;

export interface NativeHostRegistry {
  readManifestPath(): Promise<string | undefined>;
  writeManifestPath(path: string): Promise<void>;
}

export class SetupService {
  constructor(
    private readonly store: LocalStore,
    private readonly registry: NativeHostRegistry = new WindowsNativeHostRegistry(),
    private readonly dataDir = defaultAgentBridgeDataDir(),
    private readonly repoRoot = process.cwd()
  ) {}

  async getStatus(): Promise<SetupStatus> {
    const extensionId = await this.store.getSetting<string>(EXTENSION_ID_SETTING);
    const manifestPath = await this.registry.readManifestPath();
    const manifestInfo = manifestPath ? await readManifestInfo(manifestPath) : undefined;
    const storeWritable = await isStoreWritable(this.dataDir);
    const codexTargetConfigured = (await this.store.listTargets()).some((target) => target.kind === "codexDeepLink");

    return {
      checks: [
        check("storeWritable", "Local store writable", storeWritable, this.dataDir),
        check("extensionId", "Chrome extension ID configured", Boolean(extensionId), extensionId ?? "No extension ID saved."),
        check(
          "nativeHostManifest",
          "Native host manifest registered",
          Boolean(manifestPath && manifestInfo?.manifestExists),
          manifestPath ?? "No registry entry found."
        ),
        check(
          "nativeHostPath",
          "Native host launcher path valid",
          Boolean(manifestInfo?.hostPathExists),
          manifestInfo?.hostPath ?? "No launcher path found."
        ),
        check(
          "allowedOrigin",
          "Manifest allows extension",
          Boolean(extensionId && manifestInfo?.allowedOrigins.includes(`chrome-extension://${extensionId}/`)),
          extensionId ? `chrome-extension://${extensionId}/` : "No extension ID to validate."
        ),
        {
          id: "extensionHealth",
          label: "Extension health check",
          status: "warning",
          details: "Run Health check from the extension popup after registration."
        },
        check(
          "codexTarget",
          "Codex target configured",
          codexTargetConfigured,
          codexTargetConfigured ? "At least one Codex target is saved." : "Configure a Codex repo path in Targets."
        )
      ],
      ...(extensionId ? { extensionId } : {}),
      ...(manifestPath ? { nativeHostManifestPath: manifestPath } : {}),
      ...(manifestInfo?.hostPath ? { nativeHostLauncherPath: manifestInfo.hostPath } : {}),
      storePath: this.dataDir
    };
  }

  async configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus> {
    const extensionId = input.extensionId.trim();
    if (!/^[a-p]{32}$/.test(extensionId)) {
      throw new Error("Chrome extension ID must be 32 lowercase letters from a-p.");
    }

    await mkdir(this.dataDir, { recursive: true });
    const launcherPath = join(this.dataDir, "agentbridge-native-host.cmd");
    const manifestPath = join(this.dataDir, `${HOST_NAME}.json`);
    const hostScriptPath = resolve(this.repoRoot, "apps/native-host/dist/src/index.js");
    await writeFile(launcherPath, renderLauncher(hostScriptPath), "utf8");
    await writeFile(manifestPath, renderManifest(launcherPath, extensionId), "utf8");
    await this.registry.writeManifestPath(manifestPath);
    await this.store.saveSetting(EXTENSION_ID_SETTING, extensionId);
    return this.getStatus();
  }
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

function renderLauncher(hostScriptPath: string): string {
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
