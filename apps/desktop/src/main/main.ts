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
import { access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopStore } from "../services/store.js";
import { SourceService } from "../services/source-service.js";
import { LinkService } from "../services/link-service.js";
import { TransformService } from "../services/transform-service.js";
import { CodexTargetService } from "../services/codex-target-service.js";
import { WindowsTargetService } from "../services/windows-target-service.js";
import { MissionService } from "../services/mission-service.js";
import { PlatformCommandRunner, VerificationService } from "../services/verification-service.js";
import { SetupService } from "../services/setup-service.js";
import { HandoffCardDeliveryService } from "../services/handoff-card-delivery-service.js";
import { ComponentDiscoveryService } from "../services/component-discovery-service.js";
import { CodexAppServerClient } from "../services/codex-app-server-client.js";
import { CodexSessionService } from "../services/codex-session-service.js";
import { WorkflowLinkService, type CreateWorkflowLinkInput, type CreateTaskFromWorkflowLinkInput } from "../services/workflow-link-service.js";
import { ActivePlannerProvider, ProviderRegistryService } from "../services/provider-registry-service.js";
import { AgentBridgeHostedPlannerProvider } from "../services/providers/agentbridge-hosted-planner-provider.js";
import { OpenAIPlannerProvider } from "../services/providers/openai-planner-provider.js";
import { CodexLocalPlannerProvider } from "../services/providers/codex-local-planner-provider.js";
import { CodexExecutorProvider } from "../services/providers/codex-executor-provider.js";
import { WorkbenchService, type CreateWorkbenchMissionInput } from "../services/workbench-service.js";
import { PlatformService } from "../services/platform-service.js";
import { ArtifactBrokerService } from "../services/artifact-broker-service.js";
import { AutopilotService } from "../services/autopilot-service.js";
import { AuthService, FetchAuthTransport, FileAuthStorage } from "../services/auth-service.js";
import { WorkspaceResolverService } from "../services/workspace-resolver-service.js";
import { CompletionContractService } from "../services/completion-contract-service.js";
import { WorkflowTemplateService } from "../services/workflow-template-service.js";
import { WorktreeManagerService } from "../services/worktree-manager-service.js";
import type {
  CodexDeliveryRequest,
  ConfigureNativeHostRequest,
  HandoffCardDeliveryRequest,
  PreviewRequest,
  VerificationRunRequest
} from "../services/bridge-contract.js";
import type { RepoCommandConfig } from "../services/repo-context-service.js";
import type { Link, PlannerRequest, WindowsDesktopWindowTarget } from "@agentbridge/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#11181d"/>
  <path d="M8 22.5 14.5 7h3L24 22.5h-3.3l-1.2-3.2h-7l-1.2 3.2H8Zm5.5-6h5L16 9.8l-2.5 6.7Z" fill="#9ee493"/>
</svg>`;
const CHATGPT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

let mainWindow: BrowserWindow | undefined;
let chatGptWindow: BrowserWindow | undefined;
let tray: Tray | undefined;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 940,
    minWidth: 680,
    minHeight: 760,
    center: true,
    title: "AgentBridge",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
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
  const platformService = new PlatformService({
    platform: process.platform,
    userDataDir: app.getPath("userData"),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    openExternal: (url) => shell.openExternal(url),
    openFolder: async (folderPath) => {
      const result = await shell.openPath(folderPath);
      if (result) {
        throw new Error(result);
      }
    },
    selectFolder: () => selectRepoFolder()
  });
  const platformCapabilities = platformService.getCapabilities();
  const dataDir = platformService.getUserDataDir();
  const store = createDesktopStore(dataDir);
  const artifactBrokerService = new ArtifactBrokerService(store, platformService);
  const cloudBaseUrl = process.env.AGENTBRIDGE_CLOUD_URL ?? "http://127.0.0.1:8787";
  const authService = new AuthService(
    new FileAuthStorage(join(dataDir, "agentbridge-auth.json")),
    cloudBaseUrl,
    app.isPackaged ? "production" : "development",
    new FetchAuthTransport(cloudBaseUrl)
  );
  const workspaceResolverService = new WorkspaceResolverService(store);
  const workflowTemplateService = new WorkflowTemplateService(store);
  await workflowTemplateService.ensureDefaultTemplate();
  const worktreeManagerService = new WorktreeManagerService(store, join(dataDir, "worktrees"));
  const nativeHostLogPath = join(dataDir, "native-host-dev-log.jsonl");
  const sourceService = new SourceService(store);
  const linkService = new LinkService(store);
  const transformService = new TransformService(store);
  const missionService = new MissionService(store);
  const completionContractService = new CompletionContractService(store);
  const verificationService = new VerificationService(store, new PlatformCommandRunner(platformService).run);
  const setupService = new SetupService(store, undefined, undefined, process.cwd(), {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    ...(process.env.AGENTBRIDGE_CHROME_EXTENSION_ID ? { extensionId: process.env.AGENTBRIDGE_CHROME_EXTENSION_ID } : {}),
    ...(process.env.AGENTBRIDGE_CHROME_WEB_STORE_URL ? { webStoreUrl: process.env.AGENTBRIDGE_CHROME_WEB_STORE_URL } : {}),
    ...(process.env.AGENTBRIDGE_CHROME_EXTENSION_PUBLIC_KEY ? { extensionPublicKey: process.env.AGENTBRIDGE_CHROME_EXTENSION_PUBLIC_KEY } : {}),
    ...(process.env.VITE_DEV_SERVER_URL ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {})
  });
  const windowsTargetService = new WindowsTargetService();
  const codexAppServerEndpoint = process.env.CODEX_APP_SERVER_URL;
  const codexAppServerClient = new CodexAppServerClient(
    codexAppServerEndpoint ? { endpoint: codexAppServerEndpoint } : {}
  );
  const codexSessionService = new CodexSessionService(store, codexAppServerClient);
  const codexTargetService = new CodexTargetService(store, (url) => platformService.openExternal(url), codexAppServerClient, {
    canUseCodexDeepLinks: platformCapabilities.canUseCodexDeepLinks,
    platform: platformCapabilities.platform
  });
  const handoffCardDeliveryService = new HandoffCardDeliveryService(store, codexTargetService);
  const componentDiscoveryService = new ComponentDiscoveryService(store, windowsTargetService);
  const workflowLinkService = new WorkflowLinkService(store, transformService);
  const providerRegistryService = new ProviderRegistryService(store);
  const hostedPlannerProvider = new AgentBridgeHostedPlannerProvider(store, authService);
  const openAiPlannerProvider = new OpenAIPlannerProvider(store, { artifactBroker: artifactBrokerService });
  const codexLocalPlannerProvider = new CodexLocalPlannerProvider(store, codexAppServerClient);
  const codexExecutorProvider = new CodexExecutorProvider(store, codexSessionService, codexTargetService, codexAppServerClient, undefined, {
    platform: platformCapabilities.platform,
    canUseCodexDeepLinks: platformCapabilities.canUseCodexDeepLinks
  }, artifactBrokerService);
  providerRegistryService.registerProvider(hostedPlannerProvider);
  providerRegistryService.registerProvider(openAiPlannerProvider);
  providerRegistryService.registerProvider(codexLocalPlannerProvider);
  providerRegistryService.registerProvider(codexExecutorProvider);
  const activePlannerProvider = new ActivePlannerProvider(providerRegistryService);
  const workbenchService = new WorkbenchService(
    store,
    activePlannerProvider,
    codexExecutorProvider,
    verificationService,
    undefined,
    workspaceResolverService,
    completionContractService
  );
  const autopilotService = new AutopilotService(store, workbenchService, artifactBrokerService, undefined, worktreeManagerService);

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
  ipcMain.handle("agentbridge:listProviders", () => providerRegistryService.listProviderProfiles());
  ipcMain.handle("agentbridge:getProviderStatus", (_event, providerId: string) => providerRegistryService.getProviderStatus(providerId));
  ipcMain.handle(
    "agentbridge:createAgentSession",
    (_event, providerId: string, input?: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }) =>
      providerRegistryService.createSession(providerId, input)
  );
  ipcMain.handle("agentbridge:resumeAgentSession", (_event, providerId: string, sessionRefId: string) =>
    providerRegistryService.resumeSession(providerId, sessionRefId)
  );
  ipcMain.handle("agentbridge:sendProviderMessage", (_event, providerId: string, sessionRefId: string, message: string, context?: PlannerRequest) =>
    providerRegistryService.sendMessage(providerId, sessionRefId, message, context)
  );
  ipcMain.handle("agentbridge:listAgentSessions", (_event, providerId?: string) => providerRegistryService.listSessions(providerId));
  ipcMain.handle("agentbridge:listAgentTurns", (_event, sessionRefId: string) => providerRegistryService.listTurns(sessionRefId));
  ipcMain.handle("agentbridge:listAgentEvents", (_event, filter?: { providerId?: string; sessionRefId?: string; turnId?: string; type?: string }) =>
    providerRegistryService.listEvents(filter)
  );
  ipcMain.handle("agentbridge:getPlannerMode", () => providerRegistryService.getPlannerMode());
  ipcMain.handle("agentbridge:setPlannerMode", (_event, mode) => providerRegistryService.setPlannerMode(mode));
  ipcMain.handle("agentbridge:listPlannerModes", () => providerRegistryService.listPlannerModes());
  ipcMain.handle("agentbridge:getActivePlannerProvider", () => providerRegistryService.getActivePlannerProvider());
  ipcMain.handle("agentbridge:getAgentBridgeAuthStatus", () => authService.getAuthStatus());
  ipcMain.handle("agentbridge:signInAgentBridgeDevMode", () => authService.signInDevMode());
  ipcMain.handle("agentbridge:signOutAgentBridge", () => authService.signOut());
  ipcMain.handle("agentbridge:getAgentBridgeCurrentUser", () => authService.getCurrentUser());
  ipcMain.handle("agentbridge:setAgentBridgeCloudBaseUrl", (_event, url: string) => authService.setCloudBaseUrl(url));
  ipcMain.handle("agentbridge:inferWorkspaceForMission", (_event, missionId: string) => workspaceResolverService.inferForMission(missionId));
  ipcMain.handle("agentbridge:confirmWorkspaceCandidate", (_event, candidateId: string) => workspaceResolverService.confirmWorkspace(candidateId));
  ipcMain.handle("agentbridge:attachWorkspaceToMission", (_event, missionId: string, input) =>
    workbenchService.attachWorkspaceToMission(missionId, input)
  );
  ipcMain.handle("agentbridge:createWorkbenchMission", (_event, input?: CreateWorkbenchMissionInput) =>
    workbenchService.createWorkbenchMission(input)
  );
  ipcMain.handle("agentbridge:sendUserMessageToPlanner", (_event, missionId: string, text: string) =>
    workbenchService.sendUserMessageToPlanner(missionId, text)
  );
  ipcMain.handle("agentbridge:createTaskSpecFromLatestPlannerTurn", (_event, missionId: string) =>
    workbenchService.createTaskSpecFromLatestPlannerTurn(missionId)
  );
  ipcMain.handle("agentbridge:sendTaskSpecToExecutor", (_event, missionId: string, executorProviderId?: string, sessionRefId?: string) =>
    workbenchService.sendTaskSpecToExecutor(missionId, executorProviderId, sessionRefId)
  );
  ipcMain.handle("agentbridge:runMissionWorkbenchVerification", (_event, missionId: string, input?: Omit<VerificationRunRequest, "missionId">) =>
    workbenchService.runMissionVerification(missionId, input)
  );
  ipcMain.handle("agentbridge:sendVerificationToPlannerForReview", (_event, missionId: string) =>
    workbenchService.sendVerificationToPlannerForReview(missionId)
  );
  ipcMain.handle("agentbridge:createFollowUpFromPlannerReview", (_event, missionId: string) =>
    workbenchService.createFollowUpFromPlannerReview(missionId)
  );
  ipcMain.handle("agentbridge:sendFollowUpToExecutor", (_event, missionId: string, sessionRefId?: string) =>
    workbenchService.sendFollowUpToExecutor(missionId, sessionRefId)
  );
  ipcMain.handle("agentbridge:startAutopilot", (_event, missionId: string, policyId?: string) =>
    autopilotService.startAutopilot(missionId, policyId)
  );
  ipcMain.handle("agentbridge:stopAutopilot", (_event, autopilotRunId: string) => autopilotService.stopAutopilot(autopilotRunId));
  ipcMain.handle("agentbridge:continueAutopilot", (_event, autopilotRunId: string) => autopilotService.continueAutopilot(autopilotRunId));
  ipcMain.handle("agentbridge:steerAutopilot", (_event, autopilotRunId: string, text: string) =>
    autopilotService.steerAutopilot(autopilotRunId, text)
  );
  ipcMain.handle("agentbridge:getAutopilotStatus", (_event, missionId: string) => autopilotService.getAutopilotStatus(missionId));
  ipcMain.handle("agentbridge:resolvePendingDecision", (_event, decisionId: string, selectedOption: string) =>
    autopilotService.resolvePendingDecision(decisionId, selectedOption)
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
  ipcMain.handle("agentbridge:getPlatformStatus", () => ({
    capabilities: platformService.getCapabilities(),
    userDataDir: platformService.getUserDataDir(),
    artifactRoot: platformService.getArtifactRoot(),
    stagingRoot: platformService.getStagingRoot(),
    logsDir: platformService.getLogsDir(),
    defaultShell: platformService.getDefaultShell()
  }));
  ipcMain.handle("agentbridge:getCodexAppServerStatus", async () => {
    const health = await codexAppServerClient.healthCheck();
    return {
      configured: Boolean(codexAppServerEndpoint),
      ...(codexAppServerEndpoint ? { endpoint: codexAppServerEndpoint } : {}),
      available: health.available,
      canSendIntoExistingThreads: health.available,
      ...(health.message ? { message: health.message } : {}),
      checkedAt: new Date().toISOString()
    };
  });
  ipcMain.handle("agentbridge:configureNativeHost", (_event, input: ConfigureNativeHostRequest) =>
    setupService.configureNativeHost(input ?? {})
  );
  ipcMain.handle("agentbridge:connectChrome", async (_event, input?: ConfigureNativeHostRequest) => {
    const status = await setupService.configureNativeHost(input ?? {});
    if (status.webStoreUrl) {
      await platformService.openExternal(status.webStoreUrl);
    }
    return status;
  });
  ipcMain.handle("agentbridge:openChromeExtensionInstall", async () => {
    const status = await setupService.getStatus();
    if (!status.webStoreUrl) {
      throw new Error("Chrome Web Store URL is not configured.");
    }
    await platformService.openExternal(status.webStoreUrl);
  });
  ipcMain.handle("agentbridge:openChromeExtensionsPage", () => openChromeExtensionsPage());
  ipcMain.handle("agentbridge:openChromeExtensionFolder", () => openChromeExtensionFolder());
  ipcMain.handle("agentbridge:openEmbeddedChatGpt", async (_event, input?: { url?: string }) => {
    const window = await showEmbeddedChatGptWindow(input?.url);
    const targetUrl = normalizeChatGptUrl(input?.url);
    return sourceService.bindEmbeddedChatGptSource({
      title: window.getTitle() || "ChatGPT in AgentBridge",
      url: window.webContents.getURL() || targetUrl
    });
  });
  ipcMain.handle("agentbridge:captureEmbeddedChatGptSelection", async () => {
    if (!chatGptWindow || chatGptWindow.isDestroyed()) {
      throw new Error("Open ChatGPT in AgentBridge first.");
    }
    const text = await chatGptWindow.webContents.executeJavaScript(
      "window.getSelection ? window.getSelection().toString() : ''",
      true
    ) as string;
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Select text in the AgentBridge ChatGPT window first.");
    }
    return sourceService.saveEmbeddedChatGptCapture({
      text: trimmed,
      title: chatGptWindow.getTitle() || "ChatGPT in AgentBridge",
      url: chatGptWindow.webContents.getURL() || "https://chatgpt.com/"
    });
  });
  ipcMain.handle("agentbridge:selectRepoFolder", () => platformService.selectRepoFolder());
  ipcMain.handle("agentbridge:openDataFolder", () => platformService.openFolder(dataDir));
  ipcMain.handle("agentbridge:revealArtifactFile", async (_event, fileId: string) => {
    const file = await store.getArtifactFile(fileId);
    if (!file) {
      throw new Error(`Artifact file ${fileId} was not found.`);
    }
    await platformService.openFolder(dirname(file.localPath));
  });
  ipcMain.handle("agentbridge:openNativeHostLog", () => openNativeHostLog(platformService, dataDir, nativeHostLogPath));
  ipcMain.handle("agentbridge:clearLocalData", () => clearLocalData(dataDir));
  ipcMain.handle("agentbridge:listAuditEvents", () => store.listAuditEvents());
  ipcMain.handle("agentbridge:clearAuditEvents", () => store.clearAuditEvents());

  registerAppMenu(platformService, dataDir, nativeHostLogPath);
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

function registerAppMenu(platformService: PlatformService, dataDir: string, nativeHostLogPath: string): void {
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
          { label: "Open Data Folder", click: () => void platformService.openFolder(dataDir) },
          { label: "Open Native Host Log", click: () => void openNativeHostLog(platformService, dataDir, nativeHostLogPath) }
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

async function showEmbeddedChatGptWindow(rawUrl?: string): Promise<BrowserWindow> {
  const targetUrl = normalizeChatGptUrl(rawUrl);
  if (!chatGptWindow || chatGptWindow.isDestroyed()) {
    chatGptWindow = new BrowserWindow({
      width: 1120,
      height: 860,
      minWidth: 760,
      minHeight: 640,
      title: "ChatGPT - AgentBridge",
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:agentbridge-chatgpt"
      }
    });
    chatGptWindow.webContents.setUserAgent(CHATGPT_USER_AGENT);
    chatGptWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedChatGptNavigation(url)) {
        chatGptWindow?.loadURL(url).catch((error: unknown) => console.error("Failed to open ChatGPT popup URL", error));
        return { action: "deny" };
      }
      shell.openExternal(url).catch((error: unknown) => console.error("Failed to open external URL", error));
      return { action: "deny" };
    });
    chatGptWindow.on("closed", () => {
      chatGptWindow = undefined;
    });
    void chatGptWindow.loadURL(targetUrl).catch((error: unknown) => {
      console.error("Failed to load ChatGPT in AgentBridge window", error);
    });
  } else if (rawUrl?.trim() && chatGptWindow.webContents.getURL() !== targetUrl) {
    void chatGptWindow.loadURL(targetUrl).catch((error: unknown) => {
      console.error("Failed to load ChatGPT conversation in AgentBridge window", error);
    });
  }

  if (chatGptWindow.isMinimized()) {
    chatGptWindow.restore();
  }
  chatGptWindow.show();
  chatGptWindow.focus();
  chatGptWindow.moveTop();
  chatGptWindow.setAlwaysOnTop(true, "pop-up-menu");
  setTimeout(() => {
    if (chatGptWindow && !chatGptWindow.isDestroyed()) {
      chatGptWindow.setAlwaysOnTop(false);
    }
  }, 750);
  return chatGptWindow;
}

function isAllowedChatGptNavigation(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && (
      parsed.hostname === "chatgpt.com" ||
      parsed.hostname === "chat.openai.com" ||
      parsed.hostname.endsWith(".openai.com") ||
      parsed.hostname.endsWith(".auth0.com")
    );
  } catch {
    return false;
  }
}

function normalizeChatGptUrl(rawUrl?: string): string {
  const fallback = "https://chatgpt.com/";
  if (!rawUrl?.trim()) {
    return fallback;
  }

  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== "https:") {
    throw new Error("ChatGPT URL must start with https://.");
  }
  if (parsed.hostname !== "chatgpt.com" && parsed.hostname !== "chat.openai.com") {
    throw new Error("Paste a ChatGPT conversation URL from chatgpt.com.");
  }
  return parsed.toString();
}

async function openChromeExtensionsPage(): Promise<void> {
  await shell.openExternal("chrome://extensions");
}

async function openChromeExtensionFolder(): Promise<void> {
  const extensionPath = await findChromeExtensionFolder();
  const result = await shell.openPath(extensionPath);
  if (result) {
    throw new Error(result);
  }
}

async function findChromeExtensionFolder(): Promise<string> {
  const candidates = [
    process.env.AGENTBRIDGE_EXTENSION_DIR,
    join(process.cwd(), "apps", "extension"),
    join(process.cwd(), "..", "..", "..", "extension"),
    join(app.getAppPath(), "apps", "extension"),
    join(app.getAppPath(), "..", "..", "..", "extension")
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await fileExists(join(candidate, "manifest.json"))) {
      return candidate;
    }
  }

  return join(process.cwd(), "apps", "extension");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function openNativeHostLog(platformService: PlatformService, dataDir: string, nativeHostLogPath: string): Promise<void> {
  try {
    await access(nativeHostLogPath);
    await platformService.openPath(nativeHostLogPath);
  } catch {
    await platformService.openFolder(dataDir);
  }
}

async function clearLocalData(dataDir: string): Promise<void> {
  await rm(join(dataDir, "agentbridge-store.json"), { force: true });
}
