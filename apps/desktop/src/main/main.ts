import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  nativeImage,
  ipcMain,
  shell,
  type MessageBoxOptions,
  type OpenDialogOptions
} from "electron";
import { access, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopStore } from "../services/store.js";
import { SourceService } from "../services/source-service.js";
import { LinkService } from "../services/link-service.js";
import { TransformService } from "../services/transform-service.js";
import { CodexTargetService } from "../services/codex-target-service.js";
import { WindowsTargetService } from "../services/windows-target-service.js";
import { MissionService } from "../services/mission-service.js";
import { VerificationService } from "../services/verification-service.js";
import { SetupService } from "../services/setup-service.js";
import { HandoffCardDeliveryService } from "../services/handoff-card-delivery-service.js";
import { ComponentDiscoveryService } from "../services/component-discovery-service.js";
import { CodexAppServerClient } from "../services/codex-app-server-client.js";
import { CodexSessionService } from "../services/codex-session-service.js";
import { WorkflowLinkService, type CreateWorkflowLinkInput, type CreateTaskFromWorkflowLinkInput } from "../services/workflow-link-service.js";
import type {
  CodexDeliveryRequest,
  ConfigureNativeHostRequest,
  HandoffCardDeliveryRequest,
  PreviewRequest,
  VerificationRunRequest
} from "../services/bridge-contract.js";
import type { RepoCommandConfig } from "../services/repo-context-service.js";
import type { Link, WindowsDesktopWindowTarget } from "@agentbridge/core";
import { defaultAgentBridgeDataDir } from "@agentbridge/local-store";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#11181d"/>
  <path d="M8 22.5 14.5 7h3L24 22.5h-3.3l-1.2-3.2h-7l-1.2 3.2H8Zm5.5-6h5L16 9.8l-2.5 6.7Z" fill="#9ee493"/>
</svg>`;

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    center: true,
    title: "AgentBridge",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../../dist-renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  const store = createDesktopStore();
  const dataDir = defaultAgentBridgeDataDir();
  const nativeHostLogPath = join(dataDir, "native-host-dev-log.jsonl");
  const sourceService = new SourceService(store);
  const linkService = new LinkService(store);
  const transformService = new TransformService(store);
  const missionService = new MissionService(store);
  const verificationService = new VerificationService(store);
  const setupService = new SetupService(store, undefined, undefined, process.cwd(), {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {})
  });
  const windowsTargetService = new WindowsTargetService();
  const codexAppServerClient = new CodexAppServerClient(
    process.env.CODEX_APP_SERVER_URL ? { endpoint: process.env.CODEX_APP_SERVER_URL } : {}
  );
  const codexSessionService = new CodexSessionService(store, codexAppServerClient);
  const codexTargetService = new CodexTargetService(store, (url) => shell.openExternal(url), codexAppServerClient);
  const handoffCardDeliveryService = new HandoffCardDeliveryService(store, codexTargetService);
  const componentDiscoveryService = new ComponentDiscoveryService(store, windowsTargetService);
  const workflowLinkService = new WorkflowLinkService(store, transformService);

  ipcMain.handle("agentbridge:listSources", () => sourceService.listSources());
  ipcMain.handle("agentbridge:listCaptures", () => sourceService.listRecentCaptures());
  ipcMain.handle("agentbridge:bindMockBrowserSource", () => sourceService.bindMockBrowserSource());
  ipcMain.handle("agentbridge:listTargets", async () => {
    const stored = await store.listTargets();
    return stored.length > 0 ? stored : [];
  });
  ipcMain.handle("agentbridge:listLinks", () => linkService.listLinks());
  ipcMain.handle("agentbridge:listLinkableComponents", () => componentDiscoveryService.listComponents());
  ipcMain.handle("agentbridge:discoverLinkableComponents", () => componentDiscoveryService.discover());
  ipcMain.handle("agentbridge:listWorkflowLinks", () => workflowLinkService.listWorkflowLinks());
  ipcMain.handle("agentbridge:listCodexThreads", (_event, repoPath?: string) => codexSessionService.listCodexThreads(repoPath));
  ipcMain.handle("agentbridge:saveManualCodexThreadRef", (_event, input: { threadId: string; name?: string; repoPath?: string }) =>
    codexSessionService.saveManualThreadRef(input.threadId, input.name, input.repoPath)
  );
  ipcMain.handle("agentbridge:createWorkflowLink", (_event, input: CreateWorkflowLinkInput) =>
    workflowLinkService.createWorkflowLink(input)
  );
  ipcMain.handle("agentbridge:createTaskFromWorkflowLink", (_event, input: CreateTaskFromWorkflowLinkInput) =>
    workflowLinkService.createTaskFromWorkflowLink(input)
  );
  ipcMain.handle("agentbridge:listMissions", () => missionService.listMissions());
  ipcMain.handle("agentbridge:getMissionDetail", (_event, id: string) => missionService.getMissionDetail(id));
  ipcMain.handle("agentbridge:createLink", (_event, input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled">) =>
    linkService.createLink(input)
  );
  ipcMain.handle("agentbridge:previewHandoff", (_event, input: PreviewRequest) => transformService.previewHandoff(input));
  ipcMain.handle("agentbridge:revalidateTarget", (_event, target: WindowsDesktopWindowTarget) =>
    windowsTargetService.revalidate(target)
  );
  ipcMain.handle("agentbridge:configureCodexTarget", (_event, repoPath: string, commands?: RepoCommandConfig) =>
    codexTargetService.configureTarget(repoPath, commands)
  );
  ipcMain.handle("agentbridge:deliverToCodex", (_event, input: CodexDeliveryRequest) => codexTargetService.deliver(input));
  ipcMain.handle("agentbridge:deliverHandoffCardToCodex", (_event, input: HandoffCardDeliveryRequest) =>
    handoffCardDeliveryService.deliverToCodex(input)
  );
  ipcMain.handle("agentbridge:runVerification", (_event, input: VerificationRunRequest) =>
    verificationService.runVerification(input)
  );
  ipcMain.handle("agentbridge:getSetupStatus", () => setupService.getStatus());
  ipcMain.handle("agentbridge:configureNativeHost", (_event, input: ConfigureNativeHostRequest) =>
    setupService.configureNativeHost(input)
  );
  ipcMain.handle("agentbridge:selectRepoFolder", () => selectRepoFolder());
  ipcMain.handle("agentbridge:openDataFolder", () => openDataFolder(dataDir));
  ipcMain.handle("agentbridge:openNativeHostLog", () => openNativeHostLog(dataDir, nativeHostLogPath));
  ipcMain.handle("agentbridge:clearLocalData", () => clearLocalData(dataDir));
  ipcMain.handle("agentbridge:listAuditEvents", () => store.listAuditEvents());
  ipcMain.handle("agentbridge:clearAuditEvents", () => store.clearAuditEvents());

  registerAppMenu(dataDir, nativeHostLogPath);
  await createWindow();
  registerQuickActions();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  } else {
    showMainWindow();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

function registerQuickActions(): void {
  globalShortcut.register("CommandOrControl+Shift+A", () => showMainWindow("openStart"));
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString("base64")}`);
  tray = new Tray(icon);
  tray.setToolTip("AgentBridge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open AgentBridge", click: () => showMainWindow("openStart") },
      { label: "Create Task from latest capture", click: () => showMainWindow("createTaskFromLatestCapture") },
      { label: "Open latest task", click: () => showMainWindow("openTasks") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

function registerAppMenu(dataDir: string, nativeHostLogPath: string): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "AgentBridge",
        submenu: [
          { label: "About AgentBridge", click: () => showAboutDialog(dataDir) },
          { type: "separator" },
          { label: "Quit", accelerator: "CommandOrControl+Q", click: () => app.quit() }
        ]
      },
      {
        label: "File",
        submenu: [
          { label: "Open AgentBridge", accelerator: "CommandOrControl+Shift+A", click: () => showMainWindow("openStart") },
          { label: "Create Task from latest capture", click: () => showMainWindow("createTaskFromLatestCapture") },
          { label: "Open Data Folder", click: () => void openDataFolder(dataDir) },
          { label: "Open Native Host Log", click: () => void openNativeHostLog(dataDir, nativeHostLogPath) }
        ]
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" }
        ]
      },
      {
        label: "Help",
        submenu: [
          { label: "About", click: () => showAboutDialog(dataDir) }
        ]
      }
    ])
  );
}

function showAboutDialog(dataDir: string): void {
  const owner = mainWindow ?? BrowserWindow.getAllWindows()[0];
  const options: MessageBoxOptions = {
    type: "info",
    title: "About AgentBridge",
    message: "AgentBridge",
    detail: [
      `Version: ${app.getVersion()}`,
      "Capture tasks, send to agents, verify results.",
      "Local-first: task cards, artifacts, and settings stay on this machine by default.",
      `Data directory: ${dataDir}`
    ].join("\n")
  };
  if (owner) {
    void dialog.showMessageBox(owner, options);
    return;
  }
  void dialog.showMessageBox(options);
}

function showMainWindow(action?: "openStart" | "openConnect" | "openTasks" | "createTaskFromLatestCapture"): void {
  const window = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!window) {
    void createWindow().then(() => {
      if (action) {
        mainWindow?.webContents.send("agentbridge:quickAction", { type: action });
      }
    });
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
  if (action) {
    window.webContents.send("agentbridge:quickAction", { type: action });
  }
}

async function openDataFolder(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await shell.openPath(dataDir);
}

async function selectRepoFolder(): Promise<string | undefined> {
  const owner = mainWindow ?? BrowserWindow.getAllWindows()[0];
  const options: OpenDialogOptions = {
    title: "Choose repo folder",
    properties: ["openDirectory"]
  };
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

async function openNativeHostLog(dataDir: string, nativeHostLogPath: string): Promise<void> {
  try {
    await access(nativeHostLogPath);
    await shell.openPath(nativeHostLogPath);
  } catch {
    await openDataFolder(dataDir);
  }
}

async function clearLocalData(dataDir: string): Promise<void> {
  await rm(join(dataDir, "agentbridge-store.json"), { force: true });
}
