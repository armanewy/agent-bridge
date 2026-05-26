import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Network,
  RefreshCw,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import type {
  Capture,
  CodexDeepLinkTarget,
  CodexThreadRef,
  Link,
  LinkableComponent,
  AuditEvent,
  Mission,
  SourceEndpoint,
  TargetEndpoint,
  Transform,
  WorkflowLink
} from "@agentbridge/core";
import type { CodexAppServerStatus, CodexDeliveryResult, DeliveryPreview, SetupStatus } from "../services/bridge-contract.js";
import type { MissionDetail } from "../services/bridge-contract.js";
import { getAgentBridgeApi } from "./client.js";
import { CodexTargetPanel } from "../components/codex-target/CodexTargetPanel.js";
import { ConnectCenter } from "../components/connect/ConnectCenter.js";
import { CaptureInbox } from "../components/capture/CaptureInbox.js";
import { HandoffPreview } from "../components/handoff-preview/HandoffPreview.js";
import { LinkManager } from "../components/link-manager/LinkManager.js";
import { MissionPanel } from "../components/mission/MissionPanel.js";
import { SetupPanel } from "../components/setup/SetupPanel.js";
import { StartPage } from "../components/start/StartPage.js";

type View = "start" | "tasks" | "settings" | "advanced";
type AdvancedView = "components" | "captures" | "links" | "sources" | "targets" | "audit" | "demo";
type ChatGptSourceMode = "chrome" | "desktop";

const api = getAgentBridgeApi();

export function App(): JSX.Element {
  const [view, setView] = useState<View>("start");
  const [advancedView, setAdvancedView] = useState<AdvancedView>("components");
  const [sources, setSources] = useState<SourceEndpoint[]>([]);
  const [targets, setTargets] = useState<TargetEndpoint[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [components, setComponents] = useState<LinkableComponent[]>([]);
  const [workflowLinks, setWorkflowLinks] = useState<WorkflowLink[]>([]);
  const [codexThreads, setCodexThreads] = useState<CodexThreadRef[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | undefined>();
  const selectedMissionIdRef = useRef<string | undefined>();
  const [missionDetail, setMissionDetail] = useState<MissionDetail | undefined>();
  const [recipe, setRecipe] = useState<Transform["recipe"]>("implementationBrief");
  const [repoPath, setRepoPath] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [lintCommand, setLintCommand] = useState("");
  const [typecheckCommand, setTypecheckCommand] = useState("");
  const [targetError, setTargetError] = useState<string | undefined>();
  const [setupError, setSetupError] = useState<string | undefined>();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>();
  const [codexAppServerStatus, setCodexAppServerStatus] = useState<CodexAppServerStatus | undefined>();
  const [extensionId, setExtensionId] = useState("");
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | undefined>();
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>();
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [selectedSourceComponentId, setSelectedSourceComponentId] = useState<string | undefined>();
  const [selectedWorkspaceComponentId, setSelectedWorkspaceComponentId] = useState<string | undefined>();
  const [selectedTargetComponentId, setSelectedTargetComponentId] = useState<string | undefined>();
  const [selectedCodexThreadId, setSelectedCodexThreadId] = useState<string | undefined>();
  const [manualCodexThreadId, setManualCodexThreadId] = useState("");
  const [chatGptSourceMode, setChatGptSourceMode] = useState<ChatGptSourceMode>("chrome");
  const [linkError, setLinkError] = useState<string | undefined>();
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<DeliveryPreview | undefined>();
  const [deliveryResult, setDeliveryResult] = useState<CodexDeliveryResult | undefined>();

  const codexTarget = useMemo(
    () => targets.find((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink"),
    [targets]
  );

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
    setSelectedSourceComponentId((current) => {
      const currentComponent = components.find((component) => component.id === current);
      if (currentComponent?.roleCapabilities.canBeSource && isSourceForMode(currentComponent, chatGptSourceMode) && !isDemoSourceComponent(currentComponent)) {
        return current;
      }
      return components.find((component) => component.roleCapabilities.canBeSource && isSourceForMode(component, chatGptSourceMode) && !isDemoSourceComponent(component))?.id;
    });
  }, [chatGptSourceMode, components]);

  useEffect(() => {
    const handleQuickAction = (event: Event): void => {
      const action = (event as CustomEvent<{ type?: string }>).detail;
      if (action?.type === "openTasks") {
        setView("tasks");
        return;
      }
      if (action?.type === "createTaskFromLatestCapture") {
        const capture = captures[0];
        setView("start");
        if (capture?.id) {
          setSelectedCaptureId(capture.id);
        }
        const workflowLink = workflowLinks.find((item) => item.enabled);
        if (workflowLink) {
          void createTaskFromWorkflowLink(workflowLink.id);
          return;
        }
        setLinkError("Create a Workflow Link before using the tray shortcut to create a task.");
        return;
      }
      setView("start");
    };
    window.addEventListener("agentbridge:quickAction", handleQuickAction);
    return () => window.removeEventListener("agentbridge:quickAction", handleQuickAction);
  }, [captures, workflowLinks, recipe]);

  async function refresh(): Promise<void> {
    const [
      nextSources,
      nextTargets,
      nextLinks,
      nextComponents,
      nextWorkflowLinks,
      nextCaptures,
      nextAuditEvents,
      nextMissions,
      nextSetupStatus,
      nextCodexAppServerStatus
    ] = await Promise.all([
      api.listSources(),
      api.listTargets(),
      api.listLinks(),
      api.listLinkableComponents(),
      api.listWorkflowLinks(),
      api.listCaptures(),
      api.listAuditEvents(),
      api.listMissions(),
      api.getSetupStatus(),
      api.getCodexAppServerStatus()
    ]);
    const nextCodexTarget = nextTargets.find((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink");
    const nextCodexThreads = await api.listCodexThreads(nextCodexTarget?.repoPath);
    setSources(nextSources);
    setTargets(nextTargets);
    setLinks(nextLinks);
    setComponents(nextComponents);
    setWorkflowLinks(nextWorkflowLinks);
    setCodexThreads(nextCodexThreads);
    setCaptures(nextCaptures);
    setAuditEvents(nextAuditEvents);
    setMissions(nextMissions);
    setSetupStatus(nextSetupStatus);
    setCodexAppServerStatus(nextCodexAppServerStatus);
    setExtensionId((current) => current || nextSetupStatus.extensionId || "");
    setSelectedCaptureId((current) => current ?? nextCaptures[0]?.id);
    setSelectedSourceId((current) => current ?? nextSources[0]?.id);
    setSelectedTargetId((current) => current ?? nextTargets.find((target) => target.kind === "codexDeepLink")?.id ?? nextTargets[0]?.id);
    setSelectedCodexThreadId((current) =>
      current && nextCodexThreads.some((thread) => thread.threadId === current) ? current : undefined
    );
    setSelectedSourceComponentId((current) => {
      const currentComponent = nextComponents.find((component) => component.id === current);
      if (currentComponent?.roleCapabilities.canBeSource && isSourceForMode(currentComponent, chatGptSourceMode) && !isDemoSourceComponent(currentComponent)) {
        return current;
      }
      return nextComponents.find((component) => component.roleCapabilities.canBeSource && isSourceForMode(component, chatGptSourceMode) && !isDemoSourceComponent(component))?.id;
    });
    setSelectedWorkspaceComponentId((current) => {
      const currentComponent = nextComponents.find((component) => component.id === current);
      return currentComponent?.roleCapabilities.canBeWorkspace
        ? current
        : nextComponents.find((component) => component.roleCapabilities.canBeWorkspace)?.id;
    });
    setSelectedTargetComponentId((current) => {
      const currentComponent = nextComponents.find((component) => component.id === current);
      if (currentComponent?.roleCapabilities.canBeTarget) {
        return current;
      }
      return nextComponents.find((component) => component.provider === "codex")?.id ?? nextComponents.find((component) => component.roleCapabilities.canBeTarget)?.id;
    });
    const nextSelectedMissionId = selectedMissionIdRef.current ?? nextMissions[0]?.id;
    selectedMissionIdRef.current = nextSelectedMissionId;
    setSelectedMissionId(nextSelectedMissionId);
    setMissionDetail(nextSelectedMissionId ? await api.getMissionDetail(nextSelectedMissionId) : undefined);
  }

  async function selectMission(id: string): Promise<void> {
    selectedMissionIdRef.current = id;
    setSelectedMissionId(id);
    setMissionDetail(await api.getMissionDetail(id));
  }

  async function bindMockSource(): Promise<void> {
    await api.bindMockBrowserSource();
    await discoverComponents();
    await refresh();
  }

  async function discoverComponents(): Promise<void> {
    const result = await api.discoverLinkableComponents();
    setComponents(result.components);
    setDiscoveryWarnings(result.warnings);
    setSelectedSourceComponentId((current) => {
      const currentComponent = result.components.find((component) => component.id === current);
      if (currentComponent?.roleCapabilities.canBeSource && isSourceForMode(currentComponent, chatGptSourceMode) && !isDemoSourceComponent(currentComponent)) {
        return current;
      }
      return result.components.find((component) => component.roleCapabilities.canBeSource && isSourceForMode(component, chatGptSourceMode) && !isDemoSourceComponent(component))?.id;
    });
    setSelectedWorkspaceComponentId((current) => {
      const currentComponent = result.components.find((component) => component.id === current);
      return currentComponent?.roleCapabilities.canBeWorkspace
        ? current
        : result.components.find((component) => component.roleCapabilities.canBeWorkspace)?.id;
    });
    setSelectedTargetComponentId((current) => {
      const currentComponent = result.components.find((component) => component.id === current);
      if (currentComponent?.roleCapabilities.canBeTarget) {
        return current;
      }
      return result.components.find((component) => component.provider === "codex")?.id ?? result.components.find((component) => component.roleCapabilities.canBeTarget)?.id;
    });
  }

  async function createCodexTarget(): Promise<void> {
    setTargetError(undefined);
    try {
      await configureCodexTargetForPath(repoPath.trim());
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : String(error));
    }
  }

  async function configureCodexTargetForPath(path: string): Promise<void> {
    if (!path) {
      throw new Error("Choose a repo folder first.");
    }
    await api.configureCodexTarget(path, {
      ...(testCommand.trim() ? { testCommand: testCommand.trim() } : {}),
      ...(lintCommand.trim() ? { lintCommand: lintCommand.trim() } : {}),
      ...(typecheckCommand.trim() ? { typecheckCommand: typecheckCommand.trim() } : {})
    });
    await discoverComponents();
    await refresh();
  }

  async function chooseRepoFolder(): Promise<void> {
    setTargetError(undefined);
    try {
      const selectedPath = await api.selectRepoFolder();
      if (!selectedPath) {
        return;
      }
      setRepoPath(selectedPath);
      await configureCodexTargetForPath(selectedPath);
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createLink(): Promise<void> {
    const source = sources.find((item) => item.id === selectedSourceId);
    const target = targets.find((item) => item.id === selectedTargetId);
    if (!source || !target) {
      return;
    }

    await api.createLink({
      name: `${source.kind} to ${target.kind}`,
      sourceId: source.id,
      targetId: target.id,
      transformId: recipe,
      deliveryMode: target.kind === "codexDeepLink" ? "codexDeepLink" : "dryRun"
    });
    await refresh();
  }

  async function createWorkflowLink(): Promise<void> {
    setLinkError(undefined);
    const source = components.find((component) => component.id === selectedSourceComponentId);
    const workspace =
      components.find((component) => component.id === selectedWorkspaceComponentId) ??
      components.find((component) => component.roleCapabilities.canBeWorkspace && component.backingRef.repoPath === codexTarget?.repoPath);
    const target =
      components.find((component) => component.id === selectedTargetComponentId) ??
      components.find((component) => component.provider === "codex" && component.backingRef.targetId === codexTarget?.id);

    if (!source || !target) {
      setLinkError("Select a source and target first.");
      return;
    }
    if (isCodexTargetComponent(target) && !workspace) {
      setLinkError("Select a repo workspace for Codex links.");
      return;
    }

    try {
      const selectedCodexThread = codexThreads.find((thread) => thread.threadId === selectedCodexThreadId);
      await api.createWorkflowLink({
        name: `${source.label} → ${workspace ? `${workspace.label} → ` : ""}${target.label}`,
        sourceComponentId: source.id,
        ...(workspace ? { workspaceComponentId: workspace.id } : {}),
        targetComponentId: target.id,
        recipe,
        verificationCommandDefaults: verificationCommandsFromComponent(workspace),
        ...(selectedCodexThread
          ? {
              codexThreadId: selectedCodexThread.threadId,
              ...(selectedCodexThread.name ? { codexThreadName: selectedCodexThread.name } : {}),
              codexOpenMode: "existingThread" as const,
              codexIntegrationMode: selectedCodexThread.source === "appServer" ? ("appServer" as const) : ("deepLink" as const)
            }
          : {
              codexOpenMode: "newThread" as const,
              codexIntegrationMode: "deepLink" as const
            })
      });
      const [nextComponents, nextWorkflowLinks] = await Promise.all([
        api.listLinkableComponents(),
        api.listWorkflowLinks()
      ]);
      setComponents(nextComponents);
      setWorkflowLinks(nextWorkflowLinks);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createTaskFromWorkflowLink(workflowLinkId: string): Promise<void> {
    setLinkError(undefined);
    setDeliveryResult(undefined);
    try {
      const nextPreview = await api.createTaskFromWorkflowLink({ workflowLinkId });
      const [nextMissions, nextMissionDetail] = await Promise.all([
        api.listMissions(),
        api.getMissionDetail(nextPreview.mission.id)
      ]);
      setPreview(nextPreview);
      setMissions(nextMissions);
      selectedMissionIdRef.current = nextPreview.mission.id;
      setSelectedMissionId(nextPreview.mission.id);
      setMissionDetail(nextMissionDetail);
      setView("start");
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveManualCodexThread(): Promise<void> {
    setLinkError(undefined);
    const threadId = manualCodexThreadId.trim();
    if (!threadId) {
      setLinkError("Paste a Codex thread ID first.");
      return;
    }

    try {
      const ref = await api.saveManualCodexThreadRef({
        threadId,
        ...(codexTarget?.repoPath ? { repoPath: codexTarget.repoPath } : {})
      });
      setSelectedCodexThreadId(ref.threadId);
      setManualCodexThreadId("");
      setCodexThreads(await api.listCodexThreads(codexTarget?.repoPath));
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createPreview(captureId = selectedCaptureId, targetId = selectedTargetId): Promise<void> {
    const capture = captures.find((item) => item.id === captureId);
    const target = targets.find((item) => item.id === targetId);
    if (!capture || !target) {
      return;
    }

    setDeliveryResult(undefined);
    const selectedCodexThread = codexThreads.find((thread) => thread.threadId === selectedCodexThreadId);
    const nextPreview = await api.previewHandoff({
      captureId: capture.id,
      targetId: target.id,
      recipe,
      ...(selectedCodexThread
        ? {
            codexThreadId: selectedCodexThread.threadId,
            ...(selectedCodexThread.name ? { codexThreadName: selectedCodexThread.name } : {}),
            codexOpenMode: "existingThread" as const,
            codexIntegrationMode: selectedCodexThread.source === "appServer" ? ("appServer" as const) : ("deepLink" as const)
          }
        : {})
    });
    const [nextMissions, nextMissionDetail] = await Promise.all([
      api.listMissions(),
      api.getMissionDetail(nextPreview.mission.id)
    ]);
    setPreview(nextPreview);
    setMissions(nextMissions);
    selectedMissionIdRef.current = nextPreview.mission.id;
    setSelectedMissionId(nextPreview.mission.id);
    setMissionDetail(nextMissionDetail);
  }

  async function dryRunCodex(): Promise<void> {
    if (!preview || preview.target?.kind !== "codexDeepLink") {
      return;
    }

    setDeliveryResult(
      await api.deliverToCodex({
        target: preview.target,
        prompt: preview.handoffCard.generatedPrompt,
        dryRun: true,
        missionId: preview.mission.id,
        handoffCardId: preview.handoffCard.id,
        handoffId: preview.handoff.id,
        ...(preview.handoffCard.codexThreadId ? { codexThreadId: preview.handoffCard.codexThreadId } : {}),
        ...(preview.handoffCard.codexThreadName ? { codexThreadName: preview.handoffCard.codexThreadName } : {}),
        ...(preview.handoffCard.codexDeliveryMode ? { codexOpenMode: preview.handoffCard.codexDeliveryMode } : {}),
        ...(preview.handoffCard.codexIntegrationMode ? { codexIntegrationMode: preview.handoffCard.codexIntegrationMode } : {})
      })
    );
    await refresh();
  }

  async function sendCodex(): Promise<void> {
    if (!preview || preview.target?.kind !== "codexDeepLink") {
      return;
    }

    setDeliveryResult(
      await api.deliverToCodex({
        target: preview.target,
        prompt: preview.handoffCard.generatedPrompt,
        dryRun: false,
        missionId: preview.mission.id,
        handoffCardId: preview.handoffCard.id,
        handoffId: preview.handoff.id,
        ...(preview.handoffCard.codexThreadId ? { codexThreadId: preview.handoffCard.codexThreadId } : {}),
        ...(preview.handoffCard.codexThreadName ? { codexThreadName: preview.handoffCard.codexThreadName } : {}),
        ...(preview.handoffCard.codexDeliveryMode ? { codexOpenMode: preview.handoffCard.codexDeliveryMode } : {}),
        ...(preview.handoffCard.codexIntegrationMode ? { codexIntegrationMode: preview.handoffCard.codexIntegrationMode } : {})
      })
    );
    await refresh();
  }

  async function runVerification(missionId: string): Promise<void> {
    await api.runVerification({ missionId });
    const [nextMissions, nextMissionDetail] = await Promise.all([
      api.listMissions(),
      api.getMissionDetail(missionId)
    ]);
    setMissions(nextMissions);
    selectedMissionIdRef.current = missionId;
    setSelectedMissionId(missionId);
    setMissionDetail(nextMissionDetail);
  }

  async function deliverHandoffCard(missionId: string, handoffCardId: string, dryRun: boolean): Promise<void> {
    setDeliveryResult(await api.deliverHandoffCardToCodex({ missionId, handoffCardId, dryRun }));
    const [nextMissions, nextMissionDetail] = await Promise.all([
      api.listMissions(),
      api.getMissionDetail(missionId)
    ]);
    setMissions(nextMissions);
    selectedMissionIdRef.current = missionId;
    setSelectedMissionId(missionId);
    setMissionDetail(nextMissionDetail);
  }

  async function configureNativeHost(): Promise<void> {
    setSetupError(undefined);
    try {
      const nextStatus = await api.configureNativeHost({ ...(extensionId.trim() ? { extensionId } : {}) });
      setSetupStatus(nextStatus);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  }

  async function connectChrome(): Promise<void> {
    setSetupError(undefined);
    try {
      const nextStatus = await api.connectChrome();
      setSetupStatus(nextStatus);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSetupError(message);
      setLinkError(message);
    }
  }

  async function openChromeExtensionInstall(): Promise<void> {
    setSetupError(undefined);
    try {
      await api.openChromeExtensionInstall();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearAudit(): Promise<void> {
    await api.clearAuditEvents();
    await refresh();
  }

  async function clearLocalData(): Promise<void> {
    const confirmed = window.confirm("Clear local AgentBridge data on this machine? This removes saved task cards, captures, targets, artifacts, and settings.");
    if (!confirmed) {
      return;
    }
    await api.clearLocalData();
    setPreview(undefined);
    setDeliveryResult(undefined);
    selectedMissionIdRef.current = undefined;
    await refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">AB</span>
          <div>
            <strong>AgentBridge</strong>
            <small>Capture tasks. Send to agents. Verify results.</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <NavButton icon={<Network size={18} />} label="Start" active={view === "start"} onClick={() => setView("start")} />
          <NavButton icon={<ClipboardList size={18} />} label="Tasks" active={view === "tasks"} onClick={() => setView("tasks")} />
          <NavButton icon={<Settings size={18} />} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
          <NavButton
            icon={<SlidersHorizontal size={18} />}
            label="Advanced"
            active={view === "advanced"}
            onClick={() => setView("advanced")}
          />
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{titleForView(view)}</h1>
            <p>{subtitleForView(view)}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        {view === "start" ? (
          <div className="start-screen">
            <StartPage
              components={components}
              workflowLinks={workflowLinks}
              captures={captures}
              targets={targets}
              codexThreads={codexThreads}
              missions={missions}
              setupStatus={setupStatus}
              selectedSourceComponentId={selectedSourceComponentId}
              selectedWorkspaceComponentId={selectedWorkspaceComponentId}
              selectedTargetComponentId={selectedTargetComponentId}
              selectedCodexThreadId={selectedCodexThreadId}
              manualCodexThreadId={manualCodexThreadId}
              chatGptSourceMode={chatGptSourceMode}
              linkError={linkError}
              targetError={targetError}
              onSelectCodexThread={setSelectedCodexThreadId}
              onManualCodexThreadIdChange={setManualCodexThreadId}
              onChatGptSourceModeChange={(mode) => {
                setChatGptSourceMode(mode);
                const nextSource = components.find((component) => component.roleCapabilities.canBeSource && isSourceForMode(component, mode) && !isDemoSourceComponent(component));
                setSelectedSourceComponentId(nextSource?.id);
              }}
              onSaveManualCodexThread={() => void saveManualCodexThread()}
              onChooseRepo={() => void chooseRepoFolder()}
              onCreateWorkflowLink={() => void createWorkflowLink()}
              onCreateTaskFromWorkflowLink={(id) => void createTaskFromWorkflowLink(id)}
              onOpenTasks={() => setView("tasks")}
              onOpenAdvanced={() => setView("advanced")}
              onOpenSettings={() => setView("settings")}
              onProbeDesktopApps={() => void discoverComponents()}
              onConnectChrome={() => void connectChrome()}
              onCheckChromeConnection={() => void refresh()}
            />
            {preview ? (
              <HandoffPreview
                preview={preview}
                deliveryResult={deliveryResult}
                onApproveDryRun={() => void dryRunCodex()}
                onApproveSend={() => void sendCodex()}
                onSaveDraft={() => {
                  setPreview(undefined);
                  setDeliveryResult(undefined);
                  setView("tasks");
                }}
                onCancel={() => {
                  setPreview(undefined);
                  setDeliveryResult(undefined);
                }}
              />
            ) : null}
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="settings-layout">
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
                <button type="button" className="secondary-button" onClick={() => void api.openNativeHostLog()}>
                  Open logs
                </button>
                <button type="button" className="secondary-button danger" onClick={() => void clearLocalData()}>
                  Clear local data
                </button>
              </div>
            </section>
            <SetupPanel
              status={setupStatus}
              extensionId={extensionId}
              setupError={setupError}
              onExtensionIdChange={setExtensionId}
              onConfigureNativeHost={() => void configureNativeHost()}
              onConnectChrome={() => void connectChrome()}
              onOpenChromeExtensionInstall={() => void openChromeExtensionInstall()}
              onRefresh={() => void refresh()}
              onGoToConnect={() => setView("start")}
            />
            <CodexAppServerPanel status={codexAppServerStatus} onRefresh={() => void refresh()} />
            <CodexTargetPanel
              repoPath={repoPath}
              onRepoPathChange={setRepoPath}
              testCommand={testCommand}
              lintCommand={lintCommand}
              typecheckCommand={typecheckCommand}
              onTestCommandChange={setTestCommand}
              onLintCommandChange={setLintCommand}
              onTypecheckCommandChange={setTypecheckCommand}
              onCreate={() => void createCodexTarget()}
              latestTarget={codexTarget}
              error={targetError}
            />
          </div>
        ) : null}

        {view === "tasks" ? (
          <MissionPanel
            missions={missions}
            selectedMissionId={selectedMissionId}
            detail={missionDetail}
            onSelectMission={(id) => void selectMission(id)}
            onRunVerification={(id) => void runVerification(id)}
            onDeliverHandoffCard={(missionId, handoffCardId, dryRun) => void deliverHandoffCard(missionId, handoffCardId, dryRun)}
          />
        ) : null}

        {view === "advanced" ? (
          <div className="advanced-layout">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Advanced</h2>
                  <p>Raw sources, targets, links, and provenance for debugging the local pipeline.</p>
                </div>
              </div>
              <div className="segmented-control advanced-tabs">
                <button type="button" className={advancedView === "components" ? "selected" : ""} onClick={() => setAdvancedView("components")}>
                  Components
                </button>
                <button type="button" className={advancedView === "captures" ? "selected" : ""} onClick={() => setAdvancedView("captures")}>
                  Captures
                </button>
                <button type="button" className={advancedView === "links" ? "selected" : ""} onClick={() => setAdvancedView("links")}>
                  Links
                </button>
                <button type="button" className={advancedView === "sources" ? "selected" : ""} onClick={() => setAdvancedView("sources")}>
                  Sources
                </button>
                <button type="button" className={advancedView === "targets" ? "selected" : ""} onClick={() => setAdvancedView("targets")}>
                  Targets
                </button>
                <button type="button" className={advancedView === "audit" ? "selected" : ""} onClick={() => setAdvancedView("audit")}>
                  Audit
                </button>
                <button type="button" className={advancedView === "demo" ? "selected" : ""} onClick={() => setAdvancedView("demo")}>
                  Demo tools
                </button>
              </div>
            </section>
            {advancedView === "components" ? (
              <ConnectCenter
                components={components}
                workflowLinks={workflowLinks}
                captures={captures}
                sources={sources}
                selectedSourceComponentId={selectedSourceComponentId}
                selectedWorkspaceComponentId={selectedWorkspaceComponentId}
                selectedTargetComponentId={selectedTargetComponentId}
                selectedCaptureId={selectedCaptureId}
                linkError={linkError}
                discoveryWarnings={discoveryWarnings}
                onSelectSource={setSelectedSourceComponentId}
                onSelectWorkspace={setSelectedWorkspaceComponentId}
                onSelectTarget={setSelectedTargetComponentId}
                onSelectCapture={setSelectedCaptureId}
                onDiscover={() => void discoverComponents()}
                onCreateWorkflowLink={() => void createWorkflowLink()}
                onCreateTaskFromWorkflowLink={(id) => void createTaskFromWorkflowLink(id)}
              />
            ) : null}
            {advancedView === "captures" ? (
              <CaptureInbox
                captures={captures}
                sources={sources}
                selectedCaptureId={selectedCaptureId}
                onSelectCapture={setSelectedCaptureId}
              />
            ) : null}
            {advancedView === "sources" ? (
              <EntityPanel title="Sources" items={sources.map((source) => describeSource(source))} empty="No sources saved yet." />
            ) : null}
            {advancedView === "targets" ? (
              <EntityPanel title="Saved Targets" items={targets.map((target) => describeTarget(target))} empty="No targets saved yet." />
            ) : null}
            {advancedView === "links" ? (
              <LinkManager
                sources={sources}
                targets={targets}
                links={links}
                recipe={recipe}
                selectedSourceId={selectedSourceId}
                selectedTargetId={selectedTargetId}
                onRecipeChange={setRecipe}
                onSourceChange={setSelectedSourceId}
                onTargetChange={setSelectedTargetId}
                onCreateLink={() => void createLink()}
              />
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
            {advancedView === "demo" ? (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Demo tools</h2>
                    <p>Development-only seed data for trying Task Cards without a real Chrome capture.</p>
                  </div>
                </div>
                <button type="button" className="secondary-button" onClick={() => void bindMockSource()}>
                  Use demo capture
                </button>
              </section>
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
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
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
          <span>{status?.canSendIntoExistingThreads ? "Can send" : "Open-only fallback"}</span>
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

function verificationCommandsFromComponent(component?: LinkableComponent): Array<{ kind: "test" | "lint" | "typecheck"; command: string }> {
  const metadata = component?.metadata as { testCommand?: unknown; lintCommand?: unknown; typecheckCommand?: unknown } | undefined;
  return [
    typeof metadata?.testCommand === "string" && metadata.testCommand ? { kind: "test" as const, command: metadata.testCommand } : undefined,
    typeof metadata?.lintCommand === "string" && metadata.lintCommand ? { kind: "lint" as const, command: metadata.lintCommand } : undefined,
    typeof metadata?.typecheckCommand === "string" && metadata.typecheckCommand
      ? { kind: "typecheck" as const, command: metadata.typecheckCommand }
      : undefined
  ].filter(Boolean) as Array<{ kind: "test" | "lint" | "typecheck"; command: string }>;
}

function isDemoSourceComponent(component: LinkableComponent): boolean {
  return typeof component.backingRef.sourceId === "string" && component.backingRef.sourceId.includes("mock");
}

function isSourceForMode(component: LinkableComponent, mode: ChatGptSourceMode): boolean {
  if (mode === "desktop") {
    return component.provider === "chatgptDesktop" || component.kind === "chatgptDesktop";
  }
  return component.provider === "chatgpt" && component.kind === "browserTab";
}

function isCodexTargetComponent(component: LinkableComponent): boolean {
  return component.provider === "codex" || component.provider === "codexThread";
}

function describeSource(source: SourceEndpoint): { title: string; subtitle: string; detail?: string } {
  if (source.kind === "browserTab") {
    return { title: source.title || "Browser tab", subtitle: source.url, detail: source.boundAt };
  }
  if (source.kind === "chatgptDesktop") {
    return { title: source.sessionTitle ?? source.windowTitle ?? "ChatGPT Desktop", subtitle: source.executablePath ?? source.hwnd ?? source.fingerprint, detail: source.boundAt };
  }
  const fallback = source as SourceEndpoint & { kind: string; id: string };
  return { title: fallback.kind, subtitle: fallback.id };
}

function describeTarget(target: TargetEndpoint): { title: string; subtitle: string; detail?: string } {
  if (target.kind === "codexDeepLink") {
    return { title: "Codex", subtitle: target.repoPath, detail: target.boundAt };
  }
  if (target.kind === "windowsDesktopWindow") {
    return { title: target.title, subtitle: target.executablePath ?? target.hwnd, detail: target.boundAt };
  }
  return { title: "Clipboard fallback", subtitle: target.parentTargetId };
}

function titleForView(view: View): string {
  return {
    start: "Start",
    tasks: "Tasks",
    settings: "Settings",
    advanced: "Advanced"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    start: "Link one ChatGPT conversation to one repo and Codex.",
    tasks: "Task history, verification results, artifacts, and follow-up drafts.",
    settings: "Connect Chrome, choose a repo, and configure Codex delivery.",
    advanced: "Components, captures, links, sources, targets, audit, and demo tools."
  }[view];
}
