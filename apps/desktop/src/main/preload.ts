import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentBridgeApi,
  VerificationRunRequest
} from "../services/bridge-contract.js";
import type { WindowsDesktopWindowTarget } from "@agentbridge/core";

const api: AgentBridgeApi = {
  listTargets: () => ipcRenderer.invoke("agentbridge:listTargets"),
  listLinkableComponents: () => ipcRenderer.invoke("agentbridge:listLinkableComponents"),
  discoverLinkableComponents: () => ipcRenderer.invoke("agentbridge:discoverLinkableComponents"),
  listCodexThreads: (repoPath?: string) => ipcRenderer.invoke("agentbridge:listCodexThreads", repoPath),
  listProviders: () => ipcRenderer.invoke("agentbridge:listProviders"),
  getProviderStatus: (providerId: string) => ipcRenderer.invoke("agentbridge:getProviderStatus", providerId),
  createAgentSession: (providerId, input) => ipcRenderer.invoke("agentbridge:createAgentSession", providerId, input),
  resumeAgentSession: (providerId, sessionRefId) => ipcRenderer.invoke("agentbridge:resumeAgentSession", providerId, sessionRefId),
  listAgentSessions: (providerId?: string) => ipcRenderer.invoke("agentbridge:listAgentSessions", providerId),
  getAgentBridgeAuthStatus: () => ipcRenderer.invoke("agentbridge:getAgentBridgeAuthStatus"),
  signInAgentBridgeDevMode: () => ipcRenderer.invoke("agentbridge:signInAgentBridgeDevMode"),
  signOutAgentBridge: () => ipcRenderer.invoke("agentbridge:signOutAgentBridge"),
  getAgentBridgeCurrentUser: () => ipcRenderer.invoke("agentbridge:getAgentBridgeCurrentUser"),
  setAgentBridgeCloudBaseUrl: (url: string) => ipcRenderer.invoke("agentbridge:setAgentBridgeCloudBaseUrl", url),
  inferWorkspaceForMission: (missionId: string) => ipcRenderer.invoke("agentbridge:inferWorkspaceForMission", missionId),
  confirmWorkspaceCandidate: (candidateId: string) => ipcRenderer.invoke("agentbridge:confirmWorkspaceCandidate", candidateId),
  attachWorkspaceToMission: (missionId, input) => ipcRenderer.invoke("agentbridge:attachWorkspaceToMission", missionId, input),
  createWorkbenchMission: (input) => ipcRenderer.invoke("agentbridge:createWorkbenchMission", input),
  createTaskSpecFromLatestPlannerTurn: (missionId) => ipcRenderer.invoke("agentbridge:createTaskSpecFromLatestPlannerTurn", missionId),
  sendTaskSpecToExecutor: (missionId, executorProviderId, sessionRefId) =>
    ipcRenderer.invoke("agentbridge:sendTaskSpecToExecutor", missionId, executorProviderId, sessionRefId),
  runMissionWorkbenchVerification: (missionId, input) =>
    ipcRenderer.invoke("agentbridge:runMissionWorkbenchVerification", missionId, input),
  createFollowUpFromPlannerReview: (missionId) => ipcRenderer.invoke("agentbridge:createFollowUpFromPlannerReview", missionId),
  sendFollowUpToExecutor: (missionId, sessionRefId) => ipcRenderer.invoke("agentbridge:sendFollowUpToExecutor", missionId, sessionRefId),
  startAutopilot: (missionId, policyId) => ipcRenderer.invoke("agentbridge:startAutopilot", missionId, policyId),
  stopAutopilot: (autopilotRunId) => ipcRenderer.invoke("agentbridge:stopAutopilot", autopilotRunId),
  continueAutopilot: (autopilotRunId) => ipcRenderer.invoke("agentbridge:continueAutopilot", autopilotRunId),
  steerAutopilot: (autopilotRunId, text) => ipcRenderer.invoke("agentbridge:steerAutopilot", autopilotRunId, text),
  getAutopilotStatus: (missionId) => ipcRenderer.invoke("agentbridge:getAutopilotStatus", missionId),
  resolvePendingDecision: (decisionId, selectedOption) =>
    ipcRenderer.invoke("agentbridge:resolvePendingDecision", decisionId, selectedOption),
  listMissions: () => ipcRenderer.invoke("agentbridge:listMissions"),
  getMissionDetail: (id: string) => ipcRenderer.invoke("agentbridge:getMissionDetail", id),
  revalidateTarget: (target: WindowsDesktopWindowTarget) => ipcRenderer.invoke("agentbridge:revalidateTarget", target),
  runVerification: (input: VerificationRunRequest) => ipcRenderer.invoke("agentbridge:runVerification", input),
  getPlatformStatus: () => ipcRenderer.invoke("agentbridge:getPlatformStatus"),
  getCodexAppServerStatus: () => ipcRenderer.invoke("agentbridge:getCodexAppServerStatus"),
  openEmbeddedChatGpt: (input?: { url?: string }) => ipcRenderer.invoke("agentbridge:openEmbeddedChatGpt", input),
  importEmbeddedChatGptSelection: () => ipcRenderer.invoke("agentbridge:importEmbeddedChatGptSelection"),
  selectRepoFolder: () => ipcRenderer.invoke("agentbridge:selectRepoFolder"),
  openDataFolder: () => ipcRenderer.invoke("agentbridge:openDataFolder"),
  revealArtifactFile: (fileId: string) => ipcRenderer.invoke("agentbridge:revealArtifactFile", fileId),
  clearLocalData: () => ipcRenderer.invoke("agentbridge:clearLocalData"),
  listAuditEvents: () => ipcRenderer.invoke("agentbridge:listAuditEvents"),
  clearAuditEvents: () => ipcRenderer.invoke("agentbridge:clearAuditEvents")
};

contextBridge.exposeInMainWorld("agentBridge", api);

ipcRenderer.on("agentbridge:quickAction", (_event, action: { type?: string }) => {
  window.dispatchEvent(new CustomEvent("agentbridge:quickAction", { detail: action }));
});
