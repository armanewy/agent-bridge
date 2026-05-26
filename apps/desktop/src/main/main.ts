import { app, BrowserWindow, ipcMain, shell } from "electron";
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
import type { CodexDeliveryRequest, PreviewRequest, VerificationRunRequest } from "../services/bridge-contract.js";
import type { RepoCommandConfig } from "../services/repo-context-service.js";
import type { Link, WindowsDesktopWindowTarget } from "@agentbridge/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
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
  const sourceService = new SourceService(store);
  const linkService = new LinkService(store);
  const transformService = new TransformService(store);
  const missionService = new MissionService(store);
  const verificationService = new VerificationService(store);
  const windowsTargetService = new WindowsTargetService();
  const codexTargetService = new CodexTargetService(store, (url) => shell.openExternal(url));

  ipcMain.handle("agentbridge:listSources", () => sourceService.listSources());
  ipcMain.handle("agentbridge:listCaptures", () => sourceService.listRecentCaptures());
  ipcMain.handle("agentbridge:bindMockBrowserSource", () => sourceService.bindMockBrowserSource());
  ipcMain.handle("agentbridge:listTargets", async () => {
    const stored = await store.listTargets();
    return stored.length > 0 ? stored : [];
  });
  ipcMain.handle("agentbridge:listLinks", () => linkService.listLinks());
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
  ipcMain.handle("agentbridge:runVerification", (_event, input: VerificationRunRequest) =>
    verificationService.runVerification(input)
  );
  ipcMain.handle("agentbridge:listAuditEvents", () => store.listAuditEvents());
  ipcMain.handle("agentbridge:clearAuditEvents", () => store.clearAuditEvents());

  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
