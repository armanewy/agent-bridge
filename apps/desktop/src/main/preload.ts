import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentBridgeApi,
  CodexDeliveryRequest,
  PreviewRequest
} from "../services/bridge-contract.js";
import type { Link, WindowsDesktopWindowTarget } from "@agentbridge/core";

const api: AgentBridgeApi = {
  listSources: () => ipcRenderer.invoke("agentbridge:listSources"),
  listTargets: () => ipcRenderer.invoke("agentbridge:listTargets"),
  listLinks: () => ipcRenderer.invoke("agentbridge:listLinks"),
  listCaptures: () => ipcRenderer.invoke("agentbridge:listCaptures"),
  createLink: (input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled"> & { name: string }) =>
    ipcRenderer.invoke("agentbridge:createLink", input),
  previewHandoff: (input: PreviewRequest) => ipcRenderer.invoke("agentbridge:previewHandoff", input),
  revalidateTarget: (target: WindowsDesktopWindowTarget) => ipcRenderer.invoke("agentbridge:revalidateTarget", target),
  configureCodexTarget: (repoPath: string) => ipcRenderer.invoke("agentbridge:configureCodexTarget", repoPath),
  deliverToCodex: (input: CodexDeliveryRequest) => ipcRenderer.invoke("agentbridge:deliverToCodex", input),
  bindMockBrowserSource: () => ipcRenderer.invoke("agentbridge:bindMockBrowserSource"),
  listAuditEvents: () => ipcRenderer.invoke("agentbridge:listAuditEvents"),
  clearAuditEvents: () => ipcRenderer.invoke("agentbridge:clearAuditEvents")
};

contextBridge.exposeInMainWorld("agentBridge", api);
