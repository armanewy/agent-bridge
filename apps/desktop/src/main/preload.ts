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
  configureNativeHost: (input: ConfigureNativeHostRequest) => ipcRenderer.invoke("agentbridge:configureNativeHost", input),
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
