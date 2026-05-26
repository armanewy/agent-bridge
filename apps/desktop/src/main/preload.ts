import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentBridgeApi,
  CodexDeliveryRequest,
  ConfigureNativeHostRequest,
  HandoffCardDeliveryRequest,
  PreviewRequest,
  VerificationRunRequest
} from "../services/bridge-contract.js";
import type { RepoCommandConfig } from "../services/repo-context-service.js";
import type { Link, WindowsDesktopWindowTarget } from "@agentbridge/core";

const api: AgentBridgeApi = {
  listSources: () => ipcRenderer.invoke("agentbridge:listSources"),
  listTargets: () => ipcRenderer.invoke("agentbridge:listTargets"),
  listLinks: () => ipcRenderer.invoke("agentbridge:listLinks"),
  listLinkableComponents: () => ipcRenderer.invoke("agentbridge:listLinkableComponents"),
  discoverLinkableComponents: () => ipcRenderer.invoke("agentbridge:discoverLinkableComponents"),
  listWorkflowLinks: () => ipcRenderer.invoke("agentbridge:listWorkflowLinks"),
  listCodexThreads: (repoPath?: string) => ipcRenderer.invoke("agentbridge:listCodexThreads", repoPath),
  saveManualCodexThreadRef: (input) => ipcRenderer.invoke("agentbridge:saveManualCodexThreadRef", input),
  listProviders: () => ipcRenderer.invoke("agentbridge:listProviders"),
  getProviderStatus: (providerId: string) => ipcRenderer.invoke("agentbridge:getProviderStatus", providerId),
  createAgentSession: (providerId, input) => ipcRenderer.invoke("agentbridge:createAgentSession", providerId, input),
  resumeAgentSession: (providerId, sessionRefId) => ipcRenderer.invoke("agentbridge:resumeAgentSession", providerId, sessionRefId),
  sendProviderMessage: (providerId, sessionRefId, message, context) =>
    ipcRenderer.invoke("agentbridge:sendProviderMessage", providerId, sessionRefId, message, context),
  listAgentSessions: (providerId?: string) => ipcRenderer.invoke("agentbridge:listAgentSessions", providerId),
  listAgentTurns: (sessionRefId: string) => ipcRenderer.invoke("agentbridge:listAgentTurns", sessionRefId),
  listAgentEvents: (filter) => ipcRenderer.invoke("agentbridge:listAgentEvents", filter),
  createWorkbenchMission: (input) => ipcRenderer.invoke("agentbridge:createWorkbenchMission", input),
  sendUserMessageToPlanner: (missionId, text) => ipcRenderer.invoke("agentbridge:sendUserMessageToPlanner", missionId, text),
  createTaskSpecFromLatestPlannerTurn: (missionId) => ipcRenderer.invoke("agentbridge:createTaskSpecFromLatestPlannerTurn", missionId),
  sendTaskSpecToExecutor: (missionId, executorProviderId, sessionRefId) =>
    ipcRenderer.invoke("agentbridge:sendTaskSpecToExecutor", missionId, executorProviderId, sessionRefId),
  runMissionWorkbenchVerification: (missionId, input) =>
    ipcRenderer.invoke("agentbridge:runMissionWorkbenchVerification", missionId, input),
  sendVerificationToPlannerForReview: (missionId) => ipcRenderer.invoke("agentbridge:sendVerificationToPlannerForReview", missionId),
  createFollowUpFromPlannerReview: (missionId) => ipcRenderer.invoke("agentbridge:createFollowUpFromPlannerReview", missionId),
  sendFollowUpToExecutor: (missionId, sessionRefId) => ipcRenderer.invoke("agentbridge:sendFollowUpToExecutor", missionId, sessionRefId),
  createWorkflowLink: (input) => ipcRenderer.invoke("agentbridge:createWorkflowLink", input),
  createTaskFromWorkflowLink: (input) => ipcRenderer.invoke("agentbridge:createTaskFromWorkflowLink", input),
  listCaptures: () => ipcRenderer.invoke("agentbridge:listCaptures"),
  listMissions: () => ipcRenderer.invoke("agentbridge:listMissions"),
  getMissionDetail: (id: string) => ipcRenderer.invoke("agentbridge:getMissionDetail", id),
  createLink: (input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled"> & { name: string }) =>
    ipcRenderer.invoke("agentbridge:createLink", input),
  previewHandoff: (input: PreviewRequest) => ipcRenderer.invoke("agentbridge:previewHandoff", input),
  revalidateTarget: (target: WindowsDesktopWindowTarget) => ipcRenderer.invoke("agentbridge:revalidateTarget", target),
  configureCodexTarget: (repoPath: string, commands?: RepoCommandConfig) =>
    ipcRenderer.invoke("agentbridge:configureCodexTarget", repoPath, commands),
  deliverToCodex: (input: CodexDeliveryRequest) => ipcRenderer.invoke("agentbridge:deliverToCodex", input),
  deliverHandoffCardToCodex: (input: HandoffCardDeliveryRequest) => ipcRenderer.invoke("agentbridge:deliverHandoffCardToCodex", input),
  runVerification: (input: VerificationRunRequest) => ipcRenderer.invoke("agentbridge:runVerification", input),
  getSetupStatus: () => ipcRenderer.invoke("agentbridge:getSetupStatus"),
  getCodexAppServerStatus: () => ipcRenderer.invoke("agentbridge:getCodexAppServerStatus"),
  configureNativeHost: (input: ConfigureNativeHostRequest) => ipcRenderer.invoke("agentbridge:configureNativeHost", input),
  connectChrome: (input?: ConfigureNativeHostRequest) => ipcRenderer.invoke("agentbridge:connectChrome", input),
  openChromeExtensionInstall: () => ipcRenderer.invoke("agentbridge:openChromeExtensionInstall"),
  openChromeExtensionsPage: () => ipcRenderer.invoke("agentbridge:openChromeExtensionsPage"),
  openChromeExtensionFolder: () => ipcRenderer.invoke("agentbridge:openChromeExtensionFolder"),
  openEmbeddedChatGpt: (input?: { url?: string }) => ipcRenderer.invoke("agentbridge:openEmbeddedChatGpt", input),
  captureEmbeddedChatGptSelection: () => ipcRenderer.invoke("agentbridge:captureEmbeddedChatGptSelection"),
  selectRepoFolder: () => ipcRenderer.invoke("agentbridge:selectRepoFolder"),
  openDataFolder: () => ipcRenderer.invoke("agentbridge:openDataFolder"),
  openNativeHostLog: () => ipcRenderer.invoke("agentbridge:openNativeHostLog"),
  clearLocalData: () => ipcRenderer.invoke("agentbridge:clearLocalData"),
  bindMockBrowserSource: () => ipcRenderer.invoke("agentbridge:bindMockBrowserSource"),
  listAuditEvents: () => ipcRenderer.invoke("agentbridge:listAuditEvents"),
  clearAuditEvents: () => ipcRenderer.invoke("agentbridge:clearAuditEvents")
};

contextBridge.exposeInMainWorld("agentBridge", api);

ipcRenderer.on("agentbridge:quickAction", (_event, action: { type?: string }) => {
  window.dispatchEvent(new CustomEvent("agentbridge:quickAction", { detail: action }));
});
