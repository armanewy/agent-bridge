import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Chrome,
  ClipboardCheck,
  ClipboardList,
  History,
  Link2,
  Monitor,
  RefreshCw,
  Settings,
  ShieldAlert
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
import { CodexTargetPanel } from "../components/codex-target/CodexTargetPanel.js";
import { HandoffPreview } from "../components/handoff-preview/HandoffPreview.js";
import { LinkManager } from "../components/link-manager/LinkManager.js";
import { MissionPanel } from "../components/mission/MissionPanel.js";
import { SetupPanel } from "../components/setup/SetupPanel.js";

type View = "home" | "setup" | "missions" | "sources" | "targets" | "links" | "audit";

const api = getAgentBridgeApi();

export function App(): JSX.Element {
  const [view, setView] = useState<View>("home");
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

  async function createPreview(): Promise<void> {
    const capture = captures[0];
    const target = targets[0];
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
            <small>Local handoff router</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <NavButton icon={<ClipboardCheck size={18} />} label="Home" active={view === "home"} onClick={() => setView("home")} />
          <NavButton icon={<Settings size={18} />} label="Setup" active={view === "setup"} onClick={() => setView("setup")} />
          <NavButton
            icon={<ClipboardList size={18} />}
            label="Missions"
            active={view === "missions"}
            onClick={() => setView("missions")}
          />
          <NavButton icon={<Chrome size={18} />} label="Sources" active={view === "sources"} onClick={() => setView("sources")} />
          <NavButton icon={<Monitor size={18} />} label="Targets" active={view === "targets"} onClick={() => setView("targets")} />
          <NavButton icon={<Link2 size={18} />} label="Links" active={view === "links"} onClick={() => setView("links")} />
          <NavButton icon={<History size={18} />} label="Audit" active={view === "audit"} onClick={() => setView("audit")} />
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

        {view === "home" ? (
          <div className="home-grid">
            <section className="panel metrics-panel">
              <Metric icon={<Chrome size={20} />} label="Sources" value={sources.length} />
              <Metric icon={<Monitor size={20} />} label="Targets" value={targets.length} />
              <Metric icon={<Link2 size={20} />} label="Links" value={links.length} />
              <Metric icon={<ShieldAlert size={20} />} label="Warnings" value={preview?.handoff.redactionFindings.length ?? 0} />
            </section>
            <section className="panel workflow-panel">
              <div className="panel-heading">
                <div>
                  <h2>Handoff Workflow</h2>
                  <p>Capture selected browser text with the extension, then turn the latest capture into a Mission.</p>
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => void bindMockSource()}>
                  <Chrome size={16} />
                  Bind Mock Source
                </button>
                <button type="button" className="secondary-button" onClick={() => void createPreview()} disabled={!captures[0] || !targets[0]}>
                  <ClipboardCheck size={16} />
                  Create Mission from latest capture
                </button>
              </div>
            </section>
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
            <HandoffPreview
              preview={preview}
              deliveryResult={deliveryResult}
              onApproveDryRun={() => void dryRunCodex()}
              onApproveSend={() => void sendCodex()}
              onCancel={() => {
                setPreview(undefined);
                setDeliveryResult(undefined);
              }}
            />
          </div>
        ) : null}

        {view === "sources" ? (
          <EntityPanel title="Sources" items={sources.map((source) => describeSource(source))} empty="No sources saved yet." />
        ) : null}

        {view === "setup" ? (
          <SetupPanel
            status={setupStatus}
            extensionId={extensionId}
            setupError={setupError}
            onExtensionIdChange={setExtensionId}
            onConfigureNativeHost={() => void configureNativeHost()}
            onRefresh={() => void refresh()}
          />
        ) : null}

        {view === "missions" ? (
          <MissionPanel
            missions={missions}
            selectedMissionId={selectedMissionId}
            detail={missionDetail}
            onSelectMission={(id) => void selectMission(id)}
            onRunVerification={(id) => void runVerification(id)}
          />
        ) : null}

        {view === "targets" ? (
          <div className="two-column">
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
            <EntityPanel title="Saved Targets" items={targets.map((target) => describeTarget(target))} empty="No targets saved yet." />
          </div>
        ) : null}

        {view === "links" ? (
          <LinkManager
            sources={sources}
            targets={targets}
            links={links}
            recipe={recipe}
            onRecipeChange={setRecipe}
            onCreateLink={() => void createLink()}
          />
        ) : null}

        {view === "audit" ? (
          <section className="panel">
            <div className="panel-heading">
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
          </section>
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

function Metric({ icon, label, value }: { icon: JSX.Element; label: string; value: number }): JSX.Element {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
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
    home: "Dashboard",
    setup: "Setup",
    missions: "Missions",
    sources: "Sources",
    targets: "Targets",
    links: "Links",
    audit: "Audit"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    home: "Bind, transform, preview, and deliver local handoffs.",
    setup: "Native host registration, extension health, and local readiness.",
    missions: "Durable task cards, artifacts, repo context, and verification state.",
    sources: "Browser tab sources captured through explicit user actions.",
    targets: "Codex deep links and Windows desktop windows.",
    links: "Saved source-to-target routing definitions.",
    audit: "Local provenance for previewed handoffs."
  }[view];
}
