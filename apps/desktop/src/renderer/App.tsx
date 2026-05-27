import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Network,
  RefreshCw,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  AuditEvent,
  CodexThreadRef,
  LinkableComponent,
  Mission,
  WorkspaceCandidate
} from "@agentbridge/core";
import type {
  AgentBridgeAuthStatus,
  AutopilotStatus,
  CodexAppServerStatus,
  PlatformStatus
} from "../services/bridge-contract.js";
import type { MissionDetail } from "../services/bridge-contract.js";
import { getAgentBridgeApi } from "./client.js";
import { MissionPanel } from "../components/mission/MissionPanel.js";
import { WorkbenchPage } from "../components/workbench/WorkbenchPage.js";
import { extractTaskSpecJson } from "../shared/task-spec-import.js";

type View = "workbench" | "tasks" | "settings" | "advanced";
type AdvancedView = "components" | "audit";

const api = getAgentBridgeApi();

export function App(): JSX.Element {
  const [view, setView] = useState<View>(() => initialViewFromUrl());
  const [advancedView, setAdvancedView] = useState<AdvancedView>(() => initialAdvancedViewFromUrl());
  const [components, setComponents] = useState<LinkableComponent[]>([]);
  const [codexThreads, setCodexThreads] = useState<CodexThreadRef[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<AgentProviderProfile[]>([]);
  const [authStatus, setAuthStatus] = useState<AgentBridgeAuthStatus | undefined>();
  const [agentSessions, setAgentSessions] = useState<AgentSessionRef[]>([]);
  const [workspaceCandidates, setWorkspaceCandidates] = useState<WorkspaceCandidate[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | undefined>();
  const selectedMissionIdRef = useRef<string | undefined>();
  const [missionDetail, setMissionDetail] = useState<MissionDetail | undefined>();
  const [repoPath, setRepoPath] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [lintCommand, setLintCommand] = useState("");
  const [typecheckCommand, setTypecheckCommand] = useState("");
  const [setupError, setSetupError] = useState<string | undefined>();
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus | undefined>();
  const [codexAppServerStatus, setCodexAppServerStatus] = useState<CodexAppServerStatus | undefined>();
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatus | undefined>();
  const [workbenchError, setWorkbenchError] = useState<string | undefined>();
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleQuickAction = (event: Event): void => {
      const action = (event as CustomEvent<{ type?: string }>).detail;
      setView(action?.type === "openTasks" ? "tasks" : "workbench");
    };
    window.addEventListener("agentbridge:quickAction", handleQuickAction);
    return () => window.removeEventListener("agentbridge:quickAction", handleQuickAction);
  }, []);

  async function refresh(): Promise<void> {
    const [
      nextComponents,
      nextAuditEvents,
      nextMissions,
      nextPlatformStatus,
      nextCodexAppServerStatus,
      nextProviderProfiles,
      nextAuthStatus,
      nextAgentSessions
    ] = await Promise.all([
      api.listLinkableComponents(),
      api.listAuditEvents(),
      api.listMissions(),
      api.getPlatformStatus(),
      api.getCodexAppServerStatus(),
      api.listProviders(),
      api.getAgentBridgeAuthStatus(),
      api.listAgentSessions("codex")
    ]);
    const nextCodexThreads = await api.listCodexThreads();
    setComponents(nextComponents);
    setCodexThreads(nextCodexThreads);
    setAuditEvents(nextAuditEvents);
    setMissions(nextMissions);
    setPlatformStatus(nextPlatformStatus);
    setCodexAppServerStatus(nextCodexAppServerStatus);
    setProviderProfiles(nextProviderProfiles);
    setAuthStatus(nextAuthStatus);
    setAgentSessions(nextAgentSessions);
    const nextSelectedMissionId = selectedMissionIdRef.current ?? nextMissions[0]?.id;
    selectedMissionIdRef.current = nextSelectedMissionId;
    setSelectedMissionId(nextSelectedMissionId);
    const [nextMissionDetail, nextAutopilotStatus, nextWorkspaceCandidates] = nextSelectedMissionId
      ? await Promise.all([
          api.getMissionDetail(nextSelectedMissionId),
          api.getAutopilotStatus(nextSelectedMissionId),
          api.inferWorkspaceForMission(nextSelectedMissionId)
        ])
      : [undefined, undefined, []];
    setMissionDetail(nextMissionDetail);
    setAutopilotStatus(nextAutopilotStatus);
    setWorkspaceCandidates(nextWorkspaceCandidates);
  }

  async function selectMission(id: string): Promise<void> {
    selectedMissionIdRef.current = id;
    setSelectedMissionId(id);
    const [nextMissionDetail, nextAutopilotStatus, nextWorkspaceCandidates] = await Promise.all([
      api.getMissionDetail(id),
      api.getAutopilotStatus(id),
      api.inferWorkspaceForMission(id)
    ]);
    setMissionDetail(nextMissionDetail);
    setAutopilotStatus(nextAutopilotStatus);
    setWorkspaceCandidates(nextWorkspaceCandidates);
  }

  async function discoverComponents(): Promise<void> {
    const result = await api.discoverLinkableComponents();
    setComponents(result.components);
    setDiscoveryWarnings(result.warnings);
  }

  async function chooseRepoFolder(): Promise<void> {
    try {
      const selectedPath = await api.selectRepoFolder();
      if (!selectedPath) {
        return;
      }
      setRepoPath(selectedPath);
      if (selectedMissionIdRef.current) {
        await api.attachWorkspaceToMission(selectedMissionIdRef.current, {
          repoPath: selectedPath,
          repoName: selectedPath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? selectedPath,
          source: "userSelected"
        });
      }
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runVerification(missionId: string): Promise<void> {
    await api.runVerification({ missionId });
    await refreshMission(missionId);
  }

  async function createWorkbenchMission(): Promise<void> {
    setWorkbenchError(undefined);
    try {
      const mission = await api.createWorkbenchMission({
        ...(repoPath.trim()
          ? {
              repoContext: {
                repoPath: repoPath.trim(),
                ...(testCommand.trim() ? { testCommand: testCommand.trim() } : {}),
                ...(lintCommand.trim() ? { lintCommand: lintCommand.trim() } : {}),
                ...(typecheckCommand.trim() ? { typecheckCommand: typecheckCommand.trim() } : {})
              }
            }
          : {})
      });
      selectedMissionIdRef.current = mission.id;
      setSelectedMissionId(mission.id);
      await refreshMission(mission.id);
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function startAutopilotMission(
    intent: string,
    mode: "manual" | "supervised" | "autonomous",
    plannerResponse?: string
  ): Promise<void> {
    setWorkbenchError(undefined);
    try {
      const importedPlannerResponse = plannerResponse?.trim() || extractTaskSpecJson(intent);
      if (!importedPlannerResponse) {
        throw new Error("Plan with ChatGPT first, then use the selected plan to start the mission.");
      }
      const repoContext = repoPath.trim()
        ? {
            repoPath: repoPath.trim(),
            ...(testCommand.trim() ? { testCommand: testCommand.trim() } : {}),
            ...(lintCommand.trim() ? { lintCommand: lintCommand.trim() } : {}),
            ...(typecheckCommand.trim() ? { typecheckCommand: typecheckCommand.trim() } : {})
          }
        : undefined;
      const mission = await api.createWorkbenchMission({
        title: intent.trim().split(/\r?\n/)[0]?.slice(0, 80) || "Workbench mission",
        goal: intent.trim(),
        ...(repoContext ? { repoContext } : {}),
        importedPlannerResponse
      });
      selectedMissionIdRef.current = mission.id;
      setSelectedMissionId(mission.id);
      const nextStatus = await api.startAutopilot(mission.id, `policy_${mode}_default`);
      setAutopilotStatus(nextStatus);
      await refreshMission(mission.id);
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openChatGptPlanner(): Promise<void> {
    setWorkbenchError(undefined);
    try {
      await api.openEmbeddedChatGpt();
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function useSelectedChatGptPlan(intent: string, mode: "manual" | "supervised" | "autonomous"): Promise<void> {
    setWorkbenchError(undefined);
    try {
      const selection = await api.importEmbeddedChatGptSelection();
      await startAutopilotMission(intent, mode, selection.text);
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopAutopilot(runId: string): Promise<void> {
    setAutopilotStatus(await api.stopAutopilot(runId));
    if (selectedMissionIdRef.current) {
      await refreshMission(selectedMissionIdRef.current);
    }
  }

  async function continueAutopilot(runId: string): Promise<void> {
    setAutopilotStatus(await api.continueAutopilot(runId));
    if (selectedMissionIdRef.current) {
      await refreshMission(selectedMissionIdRef.current);
    }
  }

  async function steerAutopilot(runId: string, text: string): Promise<void> {
    setAutopilotStatus(await api.steerAutopilot(runId, text));
    if (selectedMissionIdRef.current) {
      await refreshMission(selectedMissionIdRef.current);
    }
  }

  async function resolvePendingDecision(decisionId: string, selectedOption: string): Promise<void> {
    setAutopilotStatus(await api.resolvePendingDecision(decisionId, selectedOption));
    if (selectedMissionIdRef.current) {
      await refreshMission(selectedMissionIdRef.current);
    }
  }

  async function generateWorkbenchTaskSpec(): Promise<void> {
    await runWorkbenchStep((missionId) => api.createTaskSpecFromLatestPlannerTurn(missionId));
  }

  async function sendWorkbenchTaskSpec(sessionRefId?: string): Promise<void> {
    await runWorkbenchStep((missionId) => api.sendTaskSpecToExecutor(missionId, "codex", sessionRefId));
  }

  async function runWorkbenchVerification(): Promise<void> {
    await runWorkbenchStep((missionId) => api.runMissionWorkbenchVerification(missionId));
  }

  async function createWorkbenchFollowUp(): Promise<void> {
    await runWorkbenchStep((missionId) => api.createFollowUpFromPlannerReview(missionId));
  }

  async function sendWorkbenchFollowUp(sessionRefId?: string): Promise<void> {
    await runWorkbenchStep((missionId) => api.sendFollowUpToExecutor(missionId, sessionRefId));
  }

  async function runWorkbenchStep(action: (missionId: string) => Promise<unknown>): Promise<void> {
    setWorkbenchError(undefined);
    try {
      const missionId = selectedMissionIdRef.current ?? selectedMissionId;
      if (!missionId) {
        throw new Error("Create a workbench task first.");
      }
      await action(missionId);
      await refreshMission(missionId);
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function signInAgentBridge(): Promise<void> {
    setSetupError(undefined);
    try {
      setAuthStatus(await api.signInAgentBridgeDevMode());
      await refresh();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  }

  async function signOutAgentBridge(): Promise<void> {
    setSetupError(undefined);
    try {
      setAuthStatus(await api.signOutAgentBridge());
      await refresh();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  }

  async function useWorkspaceCandidate(candidate: WorkspaceCandidate): Promise<void> {
    if (!selectedMissionIdRef.current || !candidate.repoPath) {
      return;
    }
    setWorkbenchError(undefined);
    try {
      await api.confirmWorkspaceCandidate(candidate.id);
      await api.attachWorkspaceToMission(selectedMissionIdRef.current, {
        repoPath: candidate.repoPath,
        ...(candidate.repoName ? { repoName: candidate.repoName } : {}),
        ...(candidate.branch ? { branch: candidate.branch } : {}),
        source: candidate.source
      });
      await refreshMission(selectedMissionIdRef.current);
      setWorkspaceCandidates(await api.inferWorkspaceForMission(selectedMissionIdRef.current));
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshMission(missionId: string): Promise<void> {
    const [nextMissions, nextMissionDetail, nextSessions, nextAutopilotStatus, nextWorkspaceCandidates] = await Promise.all([
      api.listMissions(),
      api.getMissionDetail(missionId),
      api.listAgentSessions("codex"),
      api.getAutopilotStatus(missionId),
      api.inferWorkspaceForMission(missionId)
    ]);
    setMissions(nextMissions);
    setAgentSessions(nextSessions);
    selectedMissionIdRef.current = missionId;
    setSelectedMissionId(missionId);
    setMissionDetail(nextMissionDetail);
    setAutopilotStatus(nextAutopilotStatus);
    setWorkspaceCandidates(nextWorkspaceCandidates);
  }

  async function clearAudit(): Promise<void> {
    await api.clearAuditEvents();
    await refresh();
  }

  async function clearLocalData(): Promise<void> {
    const confirmed = window.confirm("Clear local AgentBridge data on this machine? This removes saved tasks, artifacts, provider sessions, and settings.");
    if (!confirmed) {
      return;
    }
    await api.clearLocalData();
    selectedMissionIdRef.current = undefined;
    await refresh();
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      <aside className="sidebar" data-testid="sidebar">
        <div className="brand">
          <span className="brand-mark">AB</span>
          <div>
            <strong>AgentBridge</strong>
            <small>Plan with ChatGPT. Execute with Codex. Verify locally.</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <NavButton icon={<Network size={18} />} label="Workbench" active={view === "workbench"} onClick={() => setView("workbench")} />
          <NavButton icon={<ClipboardList size={18} />} label="Tasks" active={view === "tasks"} onClick={() => setView("tasks")} />
          <NavButton icon={<Settings size={18} />} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
          <NavButton icon={<SlidersHorizontal size={18} />} label="Advanced" active={view === "advanced"} onClick={() => setView("advanced")} />
        </nav>
      </aside>

      <main className="workspace" data-testid="workspace">
        <header className="topbar" data-testid="topbar">
          <div>
            <h1>{titleForView(view)}</h1>
            {subtitleForView(view) ? <p>{subtitleForView(view)}</p> : null}
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        {view === "workbench" ? (
          <WorkbenchPage
            missionDetail={missionDetail}
            selectedMissionId={selectedMissionId}
            codexThreads={codexThreads}
            agentSessions={agentSessions}
            workspaceCandidates={workspaceCandidates}
            providerProfiles={providerProfiles}
            codexAppServerStatus={codexAppServerStatus}
            autopilotStatus={autopilotStatus}
            error={workbenchError}
            onChooseRepo={() => chooseRepoFolder()}
            onUseWorkspaceCandidate={(candidate) => useWorkspaceCandidate(candidate)}
            onCreateMission={() => createWorkbenchMission()}
            onGenerateTaskSpec={() => generateWorkbenchTaskSpec()}
            onSendToCodex={(sessionRefId) => sendWorkbenchTaskSpec(sessionRefId)}
            onRunVerification={() => runWorkbenchVerification()}
            onCreateFollowUp={() => createWorkbenchFollowUp()}
            onSendFollowUp={(sessionRefId) => sendWorkbenchFollowUp(sessionRefId)}
            onStartMission={(intent, mode) => startAutopilotMission(intent, mode)}
            onOpenChatGptPlanner={() => openChatGptPlanner()}
            onUseSelectedChatGptPlan={(intent, mode) => useSelectedChatGptPlan(intent, mode)}
            onStopAutopilot={(runId) => stopAutopilot(runId)}
            onContinueAutopilot={(runId) => continueAutopilot(runId)}
            onSteerAutopilot={(runId, text) => steerAutopilot(runId, text)}
            onResolvePendingDecision={(decisionId, selectedOption) => resolvePendingDecision(decisionId, selectedOption)}
            onRevealArtifactFile={(fileId) => void api.revealArtifactFile(fileId)}
          />
        ) : null}

        {view === "settings" ? (
          <div className="settings-layout" data-testid="settings-view">
            <ProviderSettingsPanel
              profiles={providerProfiles}
              authStatus={authStatus}
              platformStatus={platformStatus}
              codexAppServerStatus={codexAppServerStatus}
              setupError={setupError}
              onSignIn={() => void signInAgentBridge()}
              onSignOut={() => void signOutAgentBridge()}
              onRefresh={() => void refresh()}
            />
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Desktop app</h2>
                  <p>AgentBridge runs as a local desktop app. Development mode uses Vite; packaged mode loads built files inside Electron.</p>
                </div>
              </div>
              <div className="desktop-action-grid">
                <button type="button" className="secondary-button" onClick={() => void api.openDataFolder()}>
                  Open data folder
                </button>
                <button type="button" className="secondary-button danger" onClick={() => void clearLocalData()}>
                  Clear local data
                </button>
              </div>
            </section>
            <CodexAppServerPanel status={codexAppServerStatus} onRefresh={() => void refresh()} />
          </div>
        ) : null}

        {view === "tasks" ? (
          <MissionPanel
            missions={missions}
            selectedMissionId={selectedMissionId}
            detail={missionDetail}
            onSelectMission={(id) => void selectMission(id)}
            onRunVerification={(id) => void runVerification(id)}
          />
        ) : null}

        {view === "advanced" ? (
          <div className="advanced-layout" data-testid="advanced-view">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Advanced</h2>
                  <p>Raw components and provenance for debugging the current ChatGPT to Codex pipeline.</p>
                </div>
              </div>
              <div className="segmented-control advanced-tabs">
                <button type="button" className={advancedView === "components" ? "selected" : ""} onClick={() => setAdvancedView("components")}>
                  Components
                </button>
                <button type="button" className={advancedView === "audit" ? "selected" : ""} onClick={() => setAdvancedView("audit")}>
                  Audit
                </button>
              </div>
            </section>
            {advancedView === "components" ? (
              <EntityPanel title="Components" items={components.map((component) => describeComponent(component))} empty="No components discovered yet." />
            ) : null}
            {advancedView === "components" && discoveryWarnings.length > 0 ? (
              <section className="panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Discovery Warnings</h2>
                    <p>{discoveryWarnings.length} warning(s)</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => void discoverComponents()}>
                    Refresh components
                  </button>
                </div>
                <div className="item-list">
                  {discoveryWarnings.map((warning) => (
                    <article className="list-card" key={warning}>
                      <strong>Warning</strong>
                      <span>{warning}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {advancedView === "audit" ? (
              <div className="advanced-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Audit Events</h2>
                    <p>{auditEvents.length} local event(s)</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => void clearAudit()}>
                    Clear Audit
                  </button>
                </div>
                <div className="item-list">
                  {auditEvents.length === 0 ? (
                    <p className="empty-copy">No local audit events yet.</p>
                  ) : (
                    auditEvents.map((event) => (
                      <article className="list-card" key={event.id}>
                        <strong>{event.type}</strong>
                        <span>{event.entityId ?? "No entity"}</span>
                        <small>{event.createdAt}</small>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: JSX.Element;
  label: string;
  active: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} data-testid={`nav-${label.toLowerCase()}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function initialViewFromUrl(): View {
  if (typeof window === "undefined") {
    return "workbench";
  }
  const value = new URLSearchParams(window.location.search).get("view");
  return value === "tasks" || value === "settings" || value === "advanced" ? value : "workbench";
}

function initialAdvancedViewFromUrl(): AdvancedView {
  if (typeof window === "undefined") {
    return "components";
  }
  const value = new URLSearchParams(window.location.search).get("advancedView");
  return value === "audit" ? "audit" : "components";
}

function EntityPanel({
  title,
  items,
  empty
}: {
  title: string;
  items: Array<{ title: string; subtitle: string; detail?: string }>;
  empty: string;
}): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{items.length} saved item(s)</p>
        </div>
      </div>
      <div className="item-list">
        {items.length === 0 ? (
          <p className="empty-copy">{empty}</p>
        ) : (
          items.map((item) => (
            <article className="list-card" key={`${item.title}-${item.subtitle}`}>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              {item.detail ? <small>{item.detail}</small> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CodexAppServerPanel({
  status,
  onRefresh
}: {
  status?: CodexAppServerStatus | undefined;
  onRefresh(): void;
}): JSX.Element {
  const label = status?.available
    ? "Connected"
    : status?.configured
      ? "Not connected"
      : "Not configured";
  const detail = status?.available
    ? "AgentBridge can send prompts into selected existing Codex threads."
    : status?.configured
      ? status.message ?? "Endpoint configured, but the server did not respond."
      : "Set CODEX_APP_SERVER_URL before launching AgentBridge to enable existing-thread continuation.";

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <h2>Codex App Server</h2>
          <p>{detail}</p>
        </div>
        <span className={status?.available ? "status-pill" : "status-pill muted"}>{label}</span>
      </div>
      <div className="setup-checks">
        <article className={status?.available ? "setup-check ready" : "setup-check warning"}>
          <strong>Existing Codex sessions</strong>
          <span>{status?.canSendIntoExistingThreads ? "Can send" : "Unavailable"}</span>
          <small>{status?.endpoint ?? "No endpoint configured"}</small>
        </article>
      </div>
      <div className="setup-actions">
        <button type="button" className="secondary-button" onClick={onRefresh}>
          Check App Server
        </button>
      </div>
    </section>
  );
}

function ProviderSettingsPanel({
  profiles,
  authStatus,
  platformStatus,
  codexAppServerStatus,
  setupError,
  onSignIn,
  onSignOut,
  onRefresh
}: {
  profiles: AgentProviderProfile[];
  authStatus?: AgentBridgeAuthStatus | undefined;
  platformStatus?: PlatformStatus | undefined;
  codexAppServerStatus?: CodexAppServerStatus | undefined;
  setupError?: string | undefined;
  onSignIn(): void;
  onSignOut(): void;
  onRefresh(): void;
}): JSX.Element {
  const codex = profiles.find((profile) => profile.id === "codex");
  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <h2>Provider connections</h2>
          <p>Workbench uses ChatGPT planning handoff and Codex for local repo execution.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onRefresh}>
          Check connections
        </button>
      </div>
      <div className="provider-settings-grid">
        <article className={authStatus?.signedIn ? "setup-check ready" : "setup-check warning"}>
          <strong>AgentBridge account</strong>
          <span>{authStatus?.signedIn ? "Signed in" : "Not signed in"}</span>
          <small>{authStatus?.user?.email ?? authStatus?.cloudBaseUrl ?? "AgentBridge Cloud"}</small>
          <div className="setup-actions inline">
            {authStatus?.signedIn ? (
              <button type="button" className="secondary-button" onClick={onSignOut}>
                Sign out
              </button>
            ) : (
              <button type="button" className="primary-button compact" onClick={onSignIn}>
                Sign in to AgentBridge
              </button>
            )}
          </div>
          {setupError ? <small className="error-text">{setupError}</small> : null}
        </article>
        <article className="setup-check ready">
          <strong>Planner: ChatGPT handoff</strong>
          <span>Manual</span>
          <small>AgentBridge copies a planning prompt, imports the selected ChatGPT plan, and parses it locally.</small>
          <small>No API key or remote planning call is used by Workbench.</small>
        </article>
        <article className="setup-check">
          <strong>Executor Provider: Codex</strong>
          <span>{codex?.status ?? "unknown"}</span>
          <small>
            App Server: {codexAppServerStatus?.available ? "connected" : codexAppServerStatus?.configured ? "not connected" : "not configured"}
          </small>
        </article>
        <article className="setup-check">
          <strong>Platform</strong>
          <span>{platformStatus?.capabilities.platform ?? "unknown"}</span>
          <small>Shell: {platformStatus?.defaultShell ?? "unknown"}</small>
        </article>
        <article className="setup-check">
          <strong>File exchange policy</strong>
          <span>Local-first</span>
          <small>The ChatGPT planner prompt contains the mission text you choose to send.</small>
          <small>Staged files are not written into the repo automatically.</small>
        </article>
      </div>
      {!codexAppServerStatus?.available ? (
        <div className="warning-callout">
          Codex execution requires Codex App Server. Start AgentBridge from an environment where the Codex app server is available.
        </div>
      ) : null}
    </section>
  );
}

function describeComponent(component: LinkableComponent): { title: string; subtitle: string; detail?: string } {
  return {
    title: component.label,
    subtitle: `${component.provider} / ${component.status}`,
    detail: component.subtitle
  };
}

function titleForView(view: View): string {
  return {
    workbench: "Workbench",
    tasks: "Tasks",
    settings: "Settings",
    advanced: "Advanced"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    workbench: "",
    tasks: "Task history, verification results, artifacts, and follow-up drafts.",
    settings: "Configure ChatGPT handoff, Codex Executor, repo, and local diagnostics.",
    advanced: "Current pipeline components and audit events."
  }[view];
}
