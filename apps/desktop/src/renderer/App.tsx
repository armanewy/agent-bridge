import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chrome,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Inbox,
  RefreshCw,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import type {
  Capture,
  CodexDeepLinkTarget,
  Link,
  AuditEvent,
  Mission,
  SourceEndpoint,
  TargetEndpoint,
  Transform
} from "@agentbridge/core";
import type { CodexDeliveryResult, DeliveryPreview, SetupStatus } from "../services/bridge-contract.js";
import type { MissionDetail } from "../services/bridge-contract.js";
import { getAgentBridgeApi } from "./client.js";
import { CaptureInbox } from "../components/capture/CaptureInbox.js";
import { CodexTargetPanel } from "../components/codex-target/CodexTargetPanel.js";
import { HandoffPreview } from "../components/handoff-preview/HandoffPreview.js";
import { LinkManager } from "../components/link-manager/LinkManager.js";
import { MissionPanel } from "../components/mission/MissionPanel.js";
import { SetupPanel } from "../components/setup/SetupPanel.js";
import { TargetSelector } from "../components/target-selector/TargetSelector.js";

type View = "inbox" | "tasks" | "settings" | "advanced";
type AdvancedView = "sources" | "targets" | "links" | "audit";

const api = getAgentBridgeApi();

export function App(): JSX.Element {
  const [view, setView] = useState<View>("inbox");
  const [advancedView, setAdvancedView] = useState<AdvancedView>("sources");
  const [sources, setSources] = useState<SourceEndpoint[]>([]);
  const [targets, setTargets] = useState<TargetEndpoint[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
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
  const [extensionId, setExtensionId] = useState("");
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | undefined>();
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [preview, setPreview] = useState<DeliveryPreview | undefined>();
  const [deliveryResult, setDeliveryResult] = useState<CodexDeliveryResult | undefined>();

  const codexTarget = useMemo(
    () => targets.find((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink"),
    [targets]
  );
  const selectedCapture = captures.find((item) => item.id === selectedCaptureId);
  const selectedTarget = targets.find((item) => item.id === selectedTargetId);

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
      if (action?.type === "openTasks") {
        setView("tasks");
        return;
      }
      if (action?.type === "createTaskFromLatestCapture") {
        const capture = captures[0];
        const target = targets.find((item) => item.kind === "codexDeepLink") ?? targets[0];
        setView("inbox");
        if (capture?.id) {
          setSelectedCaptureId(capture.id);
        }
        if (target?.id) {
          setSelectedTargetId(target.id);
        }
        if (capture?.id && target?.id) {
          void createPreview(capture.id, target.id);
        }
        return;
      }
      setView("inbox");
    };
    window.addEventListener("agentbridge:quickAction", handleQuickAction);
    return () => window.removeEventListener("agentbridge:quickAction", handleQuickAction);
  }, [captures, targets, recipe]);

  async function refresh(): Promise<void> {
    const [nextSources, nextTargets, nextLinks, nextCaptures, nextAuditEvents, nextMissions, nextSetupStatus] = await Promise.all([
      api.listSources(),
      api.listTargets(),
      api.listLinks(),
      api.listCaptures(),
      api.listAuditEvents(),
      api.listMissions(),
      api.getSetupStatus()
    ]);
    setSources(nextSources);
    setTargets(nextTargets);
    setLinks(nextLinks);
    setCaptures(nextCaptures);
    setAuditEvents(nextAuditEvents);
    setMissions(nextMissions);
    setSetupStatus(nextSetupStatus);
    setExtensionId((current) => current || nextSetupStatus.extensionId || "");
    setSelectedCaptureId((current) => current ?? nextCaptures[0]?.id);
    setSelectedTargetId((current) => current ?? nextTargets.find((target) => target.kind === "codexDeepLink")?.id ?? nextTargets[0]?.id);
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
    await refresh();
  }

  async function createCodexTarget(): Promise<void> {
    setTargetError(undefined);
    try {
      await api.configureCodexTarget(repoPath.trim(), {
        ...(testCommand.trim() ? { testCommand: testCommand.trim() } : {}),
        ...(lintCommand.trim() ? { lintCommand: lintCommand.trim() } : {}),
        ...(typecheckCommand.trim() ? { typecheckCommand: typecheckCommand.trim() } : {})
      });
      await refresh();
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createLink(): Promise<void> {
    const source = sources[0];
    const target = targets[0];
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

  async function createPreview(captureId = selectedCaptureId, targetId = selectedTargetId): Promise<void> {
    const capture = captures.find((item) => item.id === captureId);
    const target = targets.find((item) => item.id === targetId);
    if (!capture || !target) {
      return;
    }

    setDeliveryResult(undefined);
    const nextPreview = await api.previewHandoff({ captureId: capture.id, targetId: target.id, recipe });
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
        handoffId: preview.handoff.id
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
        handoffId: preview.handoff.id
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
      const nextStatus = await api.configureNativeHost({ extensionId });
      setSetupStatus(nextStatus);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearAudit(): Promise<void> {
    await api.clearAuditEvents();
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
          <NavButton icon={<Inbox size={18} />} label="Inbox" active={view === "inbox"} onClick={() => setView("inbox")} />
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

        {view === "inbox" ? (
          <div className="home-grid">
            <section className="panel start-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Simple Mode</span>
                  <h2>Ready to create a task.</h2>
                  <p>Select browser text, choose the repo agent should work in, then create a Task Card.</p>
                </div>
                <Gauge size={22} />
              </div>
              <div className="ready-grid">
                <ReadyBlock
                  label="Latest capture"
                  value={selectedCapture ? `${selectedCapture.text.length} characters` : "No capture selected"}
                  detail={selectedCapture ? selectedCapture.text.slice(0, 120) : "Select text in Chrome and click AgentBridge capture."}
                />
                <ReadyBlock
                  label="Repo and agent"
                  value={selectedTarget?.kind === "codexDeepLink" ? "Codex" : selectedTarget?.kind ?? "No target selected"}
                  detail={selectedTarget?.kind === "codexDeepLink" ? selectedTarget.repoPath : "Configure a Codex repo target in Settings."}
                />
                <ReadyBlock
                  label="Recent tasks"
                  value={String(missions.length)}
                  detail={missions[0] ? `${missions[0].title} - ${missions[0].status}` : "No task cards yet."}
                />
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => void bindMockSource()}>
                  <Chrome size={16} />
                  Use demo capture
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void createPreview()}
                  disabled={!selectedCaptureId || !selectedTargetId}
                >
                  <ClipboardCheck size={16} />
                  Create Task Card
                </button>
                {!selectedTargetId ? (
                  <button type="button" className="secondary-button" onClick={() => setView("settings")}>
                    <Settings size={16} />
                    Choose repo
                  </button>
                ) : null}
              </div>
            </section>
            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent tasks</h2>
                  <p>Open a task to see what was asked, sent, verified, and what is next.</p>
                </div>
              </div>
              <div className="item-list">
                {missions.length === 0 ? (
                  <p className="empty-copy">Task Cards will appear here after you create one from a capture.</p>
                ) : (
                  missions.slice(0, 4).map((mission) => (
                    <button
                      type="button"
                      className="list-card selectable"
                      key={mission.id}
                      onClick={() => {
                        void selectMission(mission.id);
                        setView("tasks");
                      }}
                    >
                      <strong>{mission.title}</strong>
                      <span>{mission.status}</span>
                      <small>{mission.updatedAt}</small>
                    </button>
                  ))
                )}
              </div>
            </section>
            <CaptureInbox
              captures={captures}
              sources={sources}
              selectedCaptureId={selectedCaptureId}
              onSelectCapture={setSelectedCaptureId}
              onCreateDemoCapture={() => void bindMockSource()}
            />
            <TargetSelector targets={targets} selectedTargetId={selectedTargetId} onSelectTarget={setSelectedTargetId} />
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
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="settings-layout">
            <SetupPanel
              status={setupStatus}
              extensionId={extensionId}
              setupError={setupError}
              onExtensionIdChange={setExtensionId}
              onConfigureNativeHost={() => void configureNativeHost()}
              onRefresh={() => void refresh()}
              onGoToInbox={() => setView("inbox")}
            />
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
                <button type="button" className={advancedView === "sources" ? "selected" : ""} onClick={() => setAdvancedView("sources")}>
                  Sources
                </button>
                <button type="button" className={advancedView === "targets" ? "selected" : ""} onClick={() => setAdvancedView("targets")}>
                  Targets
                </button>
                <button type="button" className={advancedView === "links" ? "selected" : ""} onClick={() => setAdvancedView("links")}>
                  Links
                </button>
                <button type="button" className={advancedView === "audit" ? "selected" : ""} onClick={() => setAdvancedView("audit")}>
                  Audit
                </button>
              </div>
            </section>
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
                onRecipeChange={setRecipe}
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

function ReadyBlock({ label, value, detail }: { label: string; value: string; detail: string }): JSX.Element {
  return (
    <div className="ready-block">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
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

function describeSource(source: SourceEndpoint): { title: string; subtitle: string; detail?: string } {
  if (source.kind === "browserTab") {
    return { title: source.title || "Browser tab", subtitle: source.url, detail: source.boundAt };
  }
  return { title: source.kind, subtitle: source.id };
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
    inbox: "Inbox",
    tasks: "Tasks",
    settings: "Settings",
    advanced: "Advanced"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    inbox: "Turn selected browser text into a scoped, repo-aware Task Card.",
    tasks: "Task history, verification results, artifacts, and follow-up drafts.",
    settings: "Connect Chrome, choose a repo, and configure Codex delivery.",
    advanced: "Operator views for sources, targets, links, and audit."
  }[view];
}
