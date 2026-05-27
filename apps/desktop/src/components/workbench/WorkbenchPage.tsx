import { CheckCircle2, FileText, MessageSquare, Play, Send, Square, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  Artifact,
  ArtifactFile,
  CodexDeepLinkTarget,
  CodexThreadRef,
  HandoffCard,
  Mission,
  WorkspaceCandidate
} from "@agentbridge/core";
import type { AutopilotStatus, CodexAppServerStatus, MissionDetail } from "../../services/bridge-contract.js";
import { buildAutopilotProgressView, buildChatGptPlannerPrompt } from "../../shared/autopilot-progress.js";
import type { AutopilotProgressView } from "../../shared/autopilot-progress.js";
import { extractTaskSpecJson } from "../../shared/task-spec-import.js";

interface WorkbenchPageProps {
  missionDetail?: MissionDetail | undefined;
  selectedMissionId?: string | undefined;
  codexTarget?: CodexDeepLinkTarget | undefined;
  codexThreads: CodexThreadRef[];
  agentSessions: AgentSessionRef[];
  workspaceCandidates: WorkspaceCandidate[];
  providerProfiles: AgentProviderProfile[];
  codexAppServerStatus?: CodexAppServerStatus | undefined;
  autopilotStatus?: AutopilotStatus | undefined;
  error?: string | undefined;
  onChooseRepo(): void | Promise<void>;
  onUseWorkspaceCandidate(candidate: WorkspaceCandidate): void | Promise<void>;
  onCreateMission(): void | Promise<void>;
  onAskPlanner(text: string): void | Promise<void>;
  onGenerateTaskSpec(): void | Promise<void>;
  onSendToCodex(sessionRefId?: string): void | Promise<void>;
  onRunVerification(): void | Promise<void>;
  onAskPlannerToReview(): void | Promise<void>;
  onCreateFollowUp(): void | Promise<void>;
  onSendFollowUp(sessionRefId?: string): void | Promise<void>;
  onStartMission(intent: string, mode: "manual" | "supervised" | "autonomous"): void | Promise<void>;
  onOpenChatGptPlanner(intent: string): void | Promise<void>;
  onUseSelectedChatGptPlan(intent: string, mode: "manual" | "supervised" | "autonomous"): void | Promise<void>;
  onStopAutopilot(runId: string): void | Promise<void>;
  onContinueAutopilot(runId: string): void | Promise<void>;
  onSteerAutopilot(runId: string, text: string): void | Promise<void>;
  onResolvePendingDecision(decisionId: string, selectedOption: string): void | Promise<void>;
  onRevealArtifactFile(fileId: string): void;
}

type WorkbenchOperation =
  | "startMission"
  | "stop"
  | "continue"
  | "steer"
  | "taskSpec"
  | "sendCodex"
  | "verify"
  | "review"
  | "followUp"
  | "sendFollowUp"
  | "workspace"
  | "decision"
  | "chatGptPlanner"
  | "chatGptCapture";

type WorkbenchTab = "task" | "codex" | "verify" | "review" | "artifacts";

export function WorkbenchPage({
  missionDetail,
  selectedMissionId,
  codexThreads,
  agentSessions,
  workspaceCandidates,
  providerProfiles,
  codexAppServerStatus,
  autopilotStatus,
  error,
  onChooseRepo,
  onUseWorkspaceCandidate,
  onGenerateTaskSpec,
  onSendToCodex,
  onRunVerification,
  onAskPlannerToReview,
  onCreateFollowUp,
  onSendFollowUp,
  onStartMission,
  onOpenChatGptPlanner,
  onUseSelectedChatGptPlan,
  onStopAutopilot,
  onContinueAutopilot,
  onSteerAutopilot,
  onResolvePendingDecision,
  onRevealArtifactFile
}: WorkbenchPageProps): JSX.Element {
  const [intentText, setIntentText] = useState("");
  const [steeringText, setSteeringText] = useState("");
  const [autopilotMode, setAutopilotMode] = useState<"manual" | "supervised" | "autonomous">("supervised");
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [pendingOperation, setPendingOperation] = useState<WorkbenchOperation | undefined>();
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("task");
  const [payloadPanelOpen, setPayloadPanelOpen] = useState(false);
  const [chatGptPlannerNotice, setChatGptPlannerNotice] = useState<string | undefined>();

  const planner = providerProfiles.find((profile) => profile.id === "agentbridge-hosted-planner") ?? providerProfiles.find((profile) => profile.kind === "planner");
  const intentContainsTaskSpec = Boolean(extractTaskSpecJson(intentText));
  const codex = providerProfiles.find((profile) => profile.id === "codex");
  const taskCard = missionDetail?.handoffCards.find((card) => card.recipe !== "debuggingRequest");
  const followUpCard = missionDetail?.handoffCards.find((card) => card.recipe === "debuggingRequest");
  const verification = missionDetail?.verificationResults[0];
  const completionContract = missionDetail?.completionContracts?.[0];
  const missionWorkspaceRef = missionDetail?.missionWorkspaces?.[0];
  const ownedFiles = missionDetail?.fileOwnership ?? [];
  const latestDelivery = parseLatestExecutorDelivery(missionDetail?.artifacts ?? []);
  const selectedSession = agentSessions.find((session) => session.id === selectedSessionId);
  const codexReady = codex?.status === "available" || codexAppServerStatus?.available === true;
  const activeRun = autopilotStatus?.run;
  const progressView = buildAutopilotProgressView(autopilotStatus);
  const bestWorkspaceCandidate = workspaceCandidates.find((candidate) => candidate.repoPath);
  const latestPayloadSummary = parsePlannerPayloadSummary(
    missionDetail?.artifacts.find((artifact) => artifact.metadata.source === "hostedPlannerPayloadSummary")
  );

  const codexSessionRows = useMemo(() => {
    const fromThreads: AgentSessionRef[] = codexThreads.map((thread) => ({
      id: `codex_session_${thread.threadId}`,
      providerId: "codex",
      providerKind: "executor",
      externalSessionId: thread.threadId,
      ...(thread.name ? { title: thread.name } : {}),
      ...(thread.repoPath ? { repoPath: thread.repoPath } : {}),
      status: thread.status === "systemError" ? "unavailable" : thread.status ?? "unknown",
      lastSeenAt: thread.lastSeenAt,
      metadata: {
        openMode: "existingThread",
        integrationMode: thread.source === "appServer" ? "appServer" : "deepLink"
      }
    }));
    const byId = new Map<string, AgentSessionRef>();
    for (const session of [...agentSessions, ...fromThreads]) {
      byId.set(session.id, session);
    }
    return [...byId.values()];
  }, [agentSessions, codexThreads]);

  const canGenerateTaskSpec = Boolean(selectedMissionId && missionDetail?.artifacts.some((artifact) => artifact.kind === "modelResponse"));
  const canSend = Boolean(selectedMissionId && taskCard && codexReady);
  const canVerify = Boolean(selectedMissionId && missionDetail?.mission.repoContext);
  const canReview = Boolean(selectedMissionId && taskCard && verification && planner?.status === "available");
  const canSendFollowUp = Boolean(selectedMissionId && followUpCard && codexReady);
  const canStartMission = Boolean(intentText.trim() && codexReady && (planner?.status === "available" || intentContainsTaskSpec));
  const canUseChatGptPlanner = Boolean(intentText.trim() && codexReady);
  const showChatGptPlanner = Boolean(intentText.trim() && planner?.status !== "available" && !intentContainsTaskSpec);
  const isBusy = Boolean(pendingOperation);
  const canStopRun = Boolean(activeRun && !["cancelled", "passed", "failed"].includes(activeRun.status));
  const pendingLabel = pendingOperation ? operationLabel(pendingOperation) : undefined;
  const blockers = [
    planner?.status !== "available" && !intentContainsTaskSpec ? "Sign in or use ChatGPT Planner to start." : undefined,
    !codexReady ? "Codex is not ready." : undefined
  ].filter((item): item is string => Boolean(item));

  async function openChatGptPlannerRequest(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(buildChatGptPlannerPrompt(intentText));
      setChatGptPlannerNotice("Planner request copied. Paste it into ChatGPT, then select ChatGPT's plan and use it here.");
    } catch {
      setChatGptPlannerNotice("ChatGPT is open. Copy the mission into ChatGPT, then select ChatGPT's plan and use it here.");
    }
    await onOpenChatGptPlanner(intentText);
  }

  async function runOperation(operation: WorkbenchOperation, action: () => void | Promise<void>): Promise<void> {
    if (pendingOperation) {
      return;
    }
    setPendingOperation(operation);
    try {
      await action();
    } finally {
      setPendingOperation(undefined);
    }
  }

  useEffect(() => {
    if (latestPayloadSummary?.redactionFindings.length) {
      setPayloadPanelOpen(true);
    }
  }, [latestPayloadSummary?.artifactId, latestPayloadSummary?.redactionFindings.length]);

  return (
    <div className="workbench-layout" data-testid="workbench-view">
      <section className="panel workbench-shell">
        <div className="workbench-title-row">
          <div>
            <h2>What do you want done?</h2>
          </div>
          <StatusPill status={activeRun?.status ?? missionDetail?.mission.status} />
        </div>

        {blockers.length ? <div className="inline-blocker">{blockers.join(" ")}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}
        {pendingLabel ? (
          <div className="progress-banner" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            {pendingLabel}
          </div>
        ) : null}
        {chatGptPlannerNotice ? <div className="progress-banner">{chatGptPlannerNotice}</div> : null}

        <div className="workbench-intent-grid">
          <textarea
            className="planner-input intent-input"
            value={intentText}
            onChange={(event) => setIntentText(event.target.value)}
            placeholder="Describe the task..."
          />
          <div className="workbench-controls">
            <label className="field-label">
              Mode
              <select value={autopilotMode} onChange={(event) => setAutopilotMode(event.target.value as typeof autopilotMode)}>
                <option value="manual">Manual</option>
                <option value="supervised">Supervised</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
            <button
              type="button"
              className={canStopRun ? "danger-button run-control-button" : "primary-button run-control-button"}
              disabled={canStopRun ? isBusy : !canStartMission || isBusy}
              onClick={() => {
                if (canStopRun && activeRun) {
                  void runOperation("stop", () => onStopAutopilot(activeRun.id));
                  return;
                }
                void runOperation("startMission", () => onStartMission(intentText, autopilotMode));
              }}
            >
              {pendingOperation === "startMission" || pendingOperation === "stop" ? (
                <span className="spinner light" aria-hidden="true" />
              ) : canStopRun ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Play size={16} />
              )}
              {pendingOperation === "startMission" ? "Starting..." : pendingOperation === "stop" ? "Stopping..." : canStopRun ? "Stop" : "Start"}
            </button>
          </div>
        </div>

        {showChatGptPlanner ? (
          <ChatGptPlannerPanel
            disabled={!canUseChatGptPlanner || isBusy}
            pendingOperation={pendingOperation}
            onOpen={() => void runOperation("chatGptPlanner", openChatGptPlannerRequest)}
            onUseSelected={() => void runOperation("chatGptCapture", () => onUseSelectedChatGptPlan(intentText, autopilotMode))}
          />
        ) : null}

        {autopilotStatus?.pendingDecision ? (
          <div className="pending-decision compact-decision">
            <strong>{autopilotStatus.pendingDecision.prompt}</strong>
            <div className="button-row">
              {autopilotStatus.pendingDecision.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === "Approve" ? "primary-button" : "secondary-button"}
                  disabled={isBusy}
                  onClick={() => void runOperation("decision", () => onResolvePendingDecision(autopilotStatus.pendingDecision?.id ?? "", option))}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {progressView ? <AutopilotProgressPanel view={progressView} /> : null}

        <ProgressTabs
          activeTab={activeTab}
          onSelect={setActiveTab}
          hasTask={Boolean(taskCard)}
          sent={latestDelivery?.success === true}
          verified={Boolean(verification)}
          reviewed={Boolean(followUpCard)}
        />

        <div className="workbench-tab-panel">
          {activeTab === "task" ? (
            <TaskTab
              mission={missionDetail?.mission}
              card={taskCard}
              contract={completionContract}
              evidenceCount={missionDetail?.completionEvidence?.length ?? 0}
              workspace={missionWorkspaceRef}
              fileCount={ownedFiles.length}
              canGenerateTaskSpec={canGenerateTaskSpec}
              isBusy={isBusy}
              pendingOperation={pendingOperation}
              onGenerateTaskSpec={() => void runOperation("taskSpec", onGenerateTaskSpec)}
              onChooseWorkspace={() => void runOperation("workspace", onChooseRepo)}
              workspaceCandidate={bestWorkspaceCandidate}
              onUseWorkspaceCandidate={(candidate) => void runOperation("workspace", () => onUseWorkspaceCandidate(candidate))}
            />
          ) : null}

          {activeTab === "codex" ? (
            <CodexTab
              sessions={codexSessionRows}
              selectedSessionId={selectedSessionId}
              onSelectSession={setSelectedSessionId}
              selectedSession={selectedSession}
              appServerAvailable={codexAppServerStatus?.available === true}
              latestDelivery={latestDelivery}
              canSend={canSend}
              isBusy={isBusy}
              pendingOperation={pendingOperation}
              onSend={() => void runOperation("sendCodex", () => onSendToCodex(selectedSession?.id))}
            />
          ) : null}

          {activeTab === "verify" ? (
            <VerifyTab
              verification={verification}
              canVerify={canVerify}
              isBusy={isBusy}
              pendingOperation={pendingOperation}
              onVerify={() => void runOperation("verify", onRunVerification)}
              payloadSummary={latestPayloadSummary}
              payloadOpen={payloadPanelOpen}
              onTogglePayload={() => setPayloadPanelOpen((current) => !current)}
            />
          ) : null}

          {activeTab === "review" ? (
            <ReviewTab
              activeRun={activeRun}
              steeringText={steeringText}
              setSteeringText={setSteeringText}
              canReview={canReview}
              canSendFollowUp={canSendFollowUp}
              hasPlannerOutput={Boolean(missionDetail?.artifacts.some((artifact) => artifact.kind === "modelResponse"))}
              isBusy={isBusy}
              pendingOperation={pendingOperation}
              onReview={() => void runOperation("review", onAskPlannerToReview)}
              onDraftFollowUp={() => void runOperation("followUp", onCreateFollowUp)}
              onSendFollowUp={() => void runOperation("sendFollowUp", () => onSendFollowUp(selectedSession?.id))}
              onContinue={(runId) => void runOperation("continue", () => onContinueAutopilot(runId))}
              onSteer={(runId, text) => void runOperation("steer", () => onSteerAutopilot(runId, text))}
            />
          ) : null}

          {activeTab === "artifacts" ? (
            <ArtifactTray artifacts={missionDetail?.artifacts ?? []} files={missionDetail?.artifactFiles ?? []} onRevealFile={onRevealArtifactFile} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ProgressTabs({
  activeTab,
  onSelect,
  hasTask,
  sent,
  verified,
  reviewed
}: {
  activeTab: WorkbenchTab;
  onSelect(tab: WorkbenchTab): void;
  hasTask: boolean;
  sent: boolean;
  verified: boolean;
  reviewed: boolean;
}): JSX.Element {
  const items: Array<{ tab: WorkbenchTab; label: string; complete: boolean }> = [
    { tab: "task", label: "Task", complete: hasTask },
    { tab: "codex", label: "Codex", complete: sent },
    { tab: "verify", label: "Verify", complete: verified },
    { tab: "review", label: "Review", complete: reviewed },
    { tab: "artifacts", label: "Artifacts", complete: false }
  ];
  return (
    <div className="workbench-step-tabs" role="tablist" aria-label="Mission steps">
      {items.map((item, index) => (
        <button
          key={item.tab}
          type="button"
          data-testid={`workbench-tab-${item.tab}`}
          className={[
            "step-tab",
            activeTab === item.tab ? "active" : "",
            item.complete ? "complete" : ""
          ].filter(Boolean).join(" ")}
          onClick={() => onSelect(item.tab)}
        >
          <span>{index + 1}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ChatGptPlannerPanel({
  disabled,
  pendingOperation,
  onOpen,
  onUseSelected
}: {
  disabled: boolean;
  pendingOperation?: WorkbenchOperation | undefined;
  onOpen(): void;
  onUseSelected(): void;
}): JSX.Element {
  return (
    <div className="chatgpt-planner-panel">
      <div>
        <strong>Plan with ChatGPT</strong>
        <p>Use ChatGPT for the planning step, then bring the selected plan back here.</p>
      </div>
      <div className="button-row">
        <button type="button" className="secondary-button" disabled={disabled} onClick={onOpen}>
          {pendingOperation === "chatGptPlanner" ? <span className="spinner" aria-hidden="true" /> : <MessageSquare size={16} />}
          {pendingOperation === "chatGptPlanner" ? "Opening..." : "Open ChatGPT"}
        </button>
        <button type="button" className="primary-button" disabled={disabled} onClick={onUseSelected}>
          {pendingOperation === "chatGptCapture" ? <span className="spinner light" aria-hidden="true" /> : <CheckCircle2 size={16} />}
          {pendingOperation === "chatGptCapture" ? "Using plan..." : "Use selected plan"}
        </button>
      </div>
    </div>
  );
}

function AutopilotProgressPanel({ view }: { view: AutopilotProgressView }): JSX.Element {
  return (
    <section className={`autopilot-progress-panel ${view.severity}`} aria-live="polite">
      <div className="autopilot-progress-heading">
        <div>
          <span className="eyebrow">Mission progress</span>
          <strong>{view.title}</strong>
        </div>
        <StatusPill status={view.severity} />
      </div>
      {view.detail ? <p className="autopilot-progress-detail">{view.detail}</p> : null}
      <p className="autopilot-next-action">{view.nextAction}</p>
      {view.steps.length ? (
        <ol className="autopilot-step-list">
          {view.steps.map((step) => (
            <li key={step.id} className={`autopilot-step ${step.status}`}>
              <span>{step.status}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail ?? step.kind}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function TaskTab({
  mission,
  card,
  contract,
  evidenceCount,
  workspace,
  fileCount,
  canGenerateTaskSpec,
  isBusy,
  pendingOperation,
  onGenerateTaskSpec,
  workspaceCandidate,
  onChooseWorkspace,
  onUseWorkspaceCandidate
}: {
  mission?: Mission | undefined;
  card?: HandoffCard | undefined;
  contract: NonNullable<MissionDetail["completionContracts"]>[number] | undefined;
  evidenceCount: number;
  workspace: NonNullable<MissionDetail["missionWorkspaces"]>[number] | undefined;
  fileCount: number;
  canGenerateTaskSpec: boolean;
  isBusy: boolean;
  pendingOperation?: WorkbenchOperation | undefined;
  onGenerateTaskSpec(): void;
  workspaceCandidate?: WorkspaceCandidate | undefined;
  onChooseWorkspace(): void;
  onUseWorkspaceCandidate(candidate: WorkspaceCandidate): void;
}): JSX.Element {
  return (
    <div className="tab-grid">
      <section className="tab-card primary-tab-card">
        <div className="tab-card-heading">
          <div>
            <span className="eyebrow">Task</span>
            <h3>{mission?.title ?? "No task yet"}</h3>
            <p>{taskStateCopy(mission, card)}</p>
          </div>
          <StatusPill status={mission?.status} />
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={onGenerateTaskSpec} disabled={!canGenerateTaskSpec || isBusy}>
            {pendingOperation === "taskSpec" ? <span className="spinner light" aria-hidden="true" /> : <FileText size={16} />}
            {pendingOperation === "taskSpec" ? "Generating..." : "Generate TaskSpec"}
          </button>
          {!workspace && workspaceCandidate?.repoPath ? (
            <button type="button" className="secondary-button" disabled={isBusy} onClick={() => onUseWorkspaceCandidate(workspaceCandidate)}>
              Use workspace
            </button>
          ) : null}
          {!workspace && !workspaceCandidate?.repoPath ? (
            <button type="button" className="secondary-button" disabled={isBusy} onClick={onChooseWorkspace}>
              Choose workspace
            </button>
          ) : null}
        </div>
        {card ? <TaskSpecSummary card={card} /> : <p className="empty-copy">The task summary appears here after planning.</p>}
      </section>
      <div className="tab-side-stack">
        <DoneMeansPanel contract={contract} evidenceCount={evidenceCount} />
        {workspace ? <WorkspaceIsolationPanel workspace={workspace} fileCount={fileCount} /> : null}
      </div>
    </div>
  );
}

function CodexTab({
  sessions,
  selectedSessionId,
  selectedSession,
  onSelectSession,
  appServerAvailable,
  latestDelivery,
  canSend,
  isBusy,
  pendingOperation,
  onSend
}: {
  sessions: AgentSessionRef[];
  selectedSessionId?: string | undefined;
  selectedSession?: AgentSessionRef | undefined;
  onSelectSession(value: string | undefined): void;
  appServerAvailable: boolean;
  latestDelivery?: { success: boolean; label: string; detail?: string } | undefined;
  canSend: boolean;
  isBusy: boolean;
  pendingOperation?: WorkbenchOperation | undefined;
  onSend(): void;
}): JSX.Element {
  return (
    <div className="tab-grid">
      <section className="tab-card primary-tab-card">
        <div className="tab-card-heading">
          <div>
            <span className="eyebrow">Codex</span>
            <h3>{selectedSession?.title ?? "New Codex thread"}</h3>
            <p>{selectedSession ? sessionModeCopy(selectedSession) : appServerAvailable ? "Starts a Codex thread and sends the task." : "Opens a new Codex draft."}</p>
          </div>
          <StatusPill status={appServerAvailable ? "available" : "fallback"} />
        </div>
        <label className="field-label">
          Session
          <select value={selectedSessionId ?? ""} onChange={(event) => onSelectSession(event.target.value || undefined)}>
            <option value="">New Codex thread</option>
            {sessions.slice(0, 40).map((session) => (
              <option key={session.id} value={session.id}>
                {session.title ?? shortId(session.externalSessionId)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary-button full-width-button" onClick={onSend} disabled={!canSend || isBusy}>
          {pendingOperation === "sendCodex" ? <span className="spinner light" aria-hidden="true" /> : <Send size={16} />}
          {pendingOperation === "sendCodex" ? "Sending..." : "Send to Codex"}
        </button>
      </section>
      <section className="tab-card">
        <span className="eyebrow">Delivery</span>
        {latestDelivery ? (
          <div className={latestDelivery.success ? "delivery-status" : "delivery-status warning"}>
            <strong>{latestDelivery.label}</strong>
            {latestDelivery.detail ? <span>{latestDelivery.detail}</span> : null}
          </div>
        ) : (
          <p className="empty-copy">No delivery yet.</p>
        )}
      </section>
    </div>
  );
}

function VerifyTab({
  verification,
  canVerify,
  isBusy,
  pendingOperation,
  onVerify,
  payloadSummary,
  payloadOpen,
  onTogglePayload
}: {
  verification?: NonNullable<MissionDetail["verificationResults"]>[number] | undefined;
  canVerify: boolean;
  isBusy: boolean;
  pendingOperation?: WorkbenchOperation | undefined;
  onVerify(): void;
  payloadSummary?: PlannerPayloadSummary | undefined;
  payloadOpen: boolean;
  onTogglePayload(): void;
}): JSX.Element {
  return (
    <div className="tab-grid">
      <section className="tab-card primary-tab-card">
        <div className="tab-card-heading">
          <div>
            <span className="eyebrow">Verify</span>
            <h3>{verification?.status ?? "Not run"}</h3>
            <p>{verification ? verification.summary : "Run checks when the task has been sent."}</p>
          </div>
          <StatusPill status={verification?.status} />
        </div>
        <button type="button" className="primary-button" onClick={onVerify} disabled={!canVerify || isBusy}>
          {pendingOperation === "verify" ? <span className="spinner light" aria-hidden="true" /> : <Play size={16} />}
          {pendingOperation === "verify" ? "Verifying..." : "Run Verification"}
        </button>
      </section>
      <PlannerPayloadPanel summary={payloadSummary} open={payloadOpen} onToggle={onTogglePayload} />
    </div>
  );
}

function ReviewTab({
  activeRun,
  steeringText,
  setSteeringText,
  canReview,
  canSendFollowUp,
  hasPlannerOutput,
  isBusy,
  pendingOperation,
  onReview,
  onDraftFollowUp,
  onSendFollowUp,
  onContinue,
  onSteer
}: {
  activeRun?: AutopilotStatus["run"] | undefined;
  steeringText: string;
  setSteeringText(value: string): void;
  canReview: boolean;
  canSendFollowUp: boolean;
  hasPlannerOutput: boolean;
  isBusy: boolean;
  pendingOperation?: WorkbenchOperation | undefined;
  onReview(): void;
  onDraftFollowUp(): void;
  onSendFollowUp(): void;
  onContinue(runId: string): void;
  onSteer(runId: string, text: string): void;
}): JSX.Element {
  return (
    <div className="tab-grid">
      <section className="tab-card primary-tab-card">
        <span className="eyebrow">Review</span>
        <h3>Next decision</h3>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onReview} disabled={!canReview || isBusy}>
            {pendingOperation === "review" ? <span className="spinner" aria-hidden="true" /> : <CheckCircle2 size={16} />}
            {pendingOperation === "review" ? "Reviewing..." : "Ask Planner"}
          </button>
          <button type="button" className="secondary-button" onClick={onDraftFollowUp} disabled={!hasPlannerOutput || isBusy}>
            {pendingOperation === "followUp" ? <span className="spinner" aria-hidden="true" /> : <Wrench size={16} />}
            {pendingOperation === "followUp" ? "Drafting..." : "Draft Follow-up"}
          </button>
          <button type="button" className="primary-button" onClick={onSendFollowUp} disabled={!canSendFollowUp || isBusy}>
            {pendingOperation === "sendFollowUp" ? <span className="spinner light" aria-hidden="true" /> : <Send size={16} />}
            {pendingOperation === "sendFollowUp" ? "Sending..." : "Send Follow-up"}
          </button>
        </div>
      </section>
      <section className="tab-card">
        <span className="eyebrow">Steer</span>
        {activeRun ? (
          <div className="steering-row compact-steering-row">
            <input value={steeringText} onChange={(event) => setSteeringText(event.target.value)} placeholder="Steer..." />
            <button
              type="button"
              className="secondary-button"
              disabled={!steeringText.trim() || isBusy}
              onClick={() => {
                onSteer(activeRun.id, steeringText);
                setSteeringText("");
              }}
            >
              Steer
            </button>
            {activeRun.status === "blocked" ? (
              <button type="button" className="secondary-button" disabled={isBusy} onClick={() => onContinue(activeRun.id)}>
                {pendingOperation === "continue" ? "Continuing..." : "Continue"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="empty-copy">No active run.</p>
        )}
      </section>
    </div>
  );
}

function WorkspaceIsolationPanel({
  workspace,
  fileCount
}: {
  workspace: NonNullable<MissionDetail["missionWorkspaces"]>[number] | undefined;
  fileCount: number;
}): JSX.Element | null {
  if (!workspace) {
    return null;
  }
  return (
    <div className={workspace.strategy === "none" ? "workspace-isolation-panel warning" : "workspace-isolation-panel"}>
      <div className="done-means-heading">
        <strong>Workspace</strong>
        <span>{workspace.status}</span>
      </div>
      <p>{workspace.branchName ?? workspace.worktreeName ?? workspace.workingPath}</p>
      <p>{fileCount} file{fileCount === 1 ? "" : "s"} tracked.</p>
    </div>
  );
}

function DoneMeansPanel({
  contract,
  evidenceCount
}: {
  contract: NonNullable<MissionDetail["completionContracts"]>[number] | undefined;
  evidenceCount: number;
}): JSX.Element {
  if (!contract) {
    return (
      <div className="done-means-panel muted">
        <strong>Done means</strong>
        <p>Task criteria appear here after planning.</p>
      </div>
    );
  }
  const objectiveCriteria = contract.acceptanceCriteria.filter((criterion) => criterion.verifierKind !== "humanReview");
  const canPassAutonomously = contract.status === "valid" && objectiveCriteria.length > 0;
  return (
    <div className={canPassAutonomously ? "done-means-panel" : "done-means-panel warning"}>
      <div className="done-means-heading">
        <strong>Done means</strong>
        <span>{contract.status}</span>
      </div>
      {!canPassAutonomously ? <p>This task cannot autonomously pass yet.</p> : null}
      <p>{contract.acceptanceCriteria.length} criteria · {evidenceCount} evidence item{evidenceCount === 1 ? "" : "s"}.</p>
    </div>
  );
}

interface PlannerPayloadSummary {
  artifactId: string;
  purpose: string;
  estimatedBytes: number;
  includedArtifactIds: string[];
  excludedArtifactIds: string[];
  excludedReasons: Record<string, string>;
  redactionFindings: Array<{ kind: string; severity: string; preview: string }>;
  payload: Record<string, unknown>;
}

function PlannerPayloadPanel({
  summary,
  open,
  onToggle
}: {
  summary?: PlannerPayloadSummary | undefined;
  open: boolean;
  onToggle(): void;
}): JSX.Element {
  if (!summary) {
    return (
      <section className="tab-card">
        <span className="eyebrow">Planner payload</span>
        <p className="empty-copy">No planner payload yet.</p>
      </section>
    );
  }
  const payload = summary.payload;
  return (
    <section className={summary.redactionFindings.length ? "tab-card planner-payload-panel warning" : "tab-card planner-payload-panel"}>
      <button type="button" className="payload-toggle" onClick={onToggle}>
        <span>Planner payload</span>
        <em>{summary.estimatedBytes} bytes</em>
      </button>
      {open ? (
        <div className="payload-summary-grid">
          <div>
            <strong>Intent</strong>
            <p>{String(payload.intent ?? "Not included")}</p>
          </div>
          <div>
            <strong>Artifacts</strong>
            <p>{summary.includedArtifactIds.length} included · {summary.excludedArtifactIds.length} excluded</p>
          </div>
          {summary.redactionFindings.length ? (
            <div>
              <strong>Redaction</strong>
              <ul>
                {summary.redactionFindings.slice(0, 4).map((finding, index) => (
                  <li key={`${finding.kind}-${index}`}>{finding.severity}: {finding.kind}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ArtifactTray({ artifacts, files, onRevealFile }: { artifacts: Artifact[]; files: ArtifactFile[]; onRevealFile(fileId: string): void }): JSX.Element {
  const fileByArtifact = new Map(files.map((file) => [file.artifactId, file]));
  const rows = artifacts.slice(0, 12);
  return (
    <section className="tab-card artifact-tray compact-artifact-tray">
      <span className="eyebrow">Artifacts</span>
      {rows.length === 0 ? (
        <p className="empty-copy">No artifacts yet.</p>
      ) : (
        <div className="artifact-tray-list">
          {rows.map((artifact) => {
            const file = fileByArtifact.get(artifact.id);
            return (
              <div key={artifact.id} className="artifact-tray-row compact-artifact-row">
                <div>
                  <strong>{artifact.title}</strong>
                  <span>{artifact.kind} · {file ? formatBytes(file.sizeBytes) : "text"}</span>
                </div>
                <button type="button" className="secondary-button" disabled={!file} onClick={() => file && onRevealFile(file.id)}>
                  Reveal
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TaskSpecSummary({ card }: { card: HandoffCard }): JSX.Element {
  return (
    <div className="taskspec-summary">
      <strong>{card.taskSpec.title}</strong>
      <p>{card.taskSpec.acceptanceCriteria.length} acceptance criteria · {card.taskSpec.verificationSteps.length} checks</p>
    </div>
  );
}

function StatusPill({ status }: { status?: string | undefined }): JSX.Element {
  return <span className={status === "available" || status === "passed" || status === "delivered" ? "status-pill" : "status-pill muted"}>{status ?? "idle"}</span>;
}

function sessionModeCopy(session: AgentSessionRef): string {
  const mode = session.metadata.integrationMode === "appServer" ? "Sends to this thread" : "Opens this thread only";
  return `${mode} · ${shortId(session.externalSessionId)}`;
}

function parseLatestExecutorDelivery(artifacts: Artifact[]): { success: boolean; label: string; detail?: string } | undefined {
  const artifact = [...artifacts].reverse().find((item) => item.kind === "deliveryResult" && item.title === "Executor delivery result");
  if (!artifact?.content) {
    return undefined;
  }
  try {
    const result = JSON.parse(artifact.content) as Record<string, unknown>;
    const success = result.success === true;
    const mode = typeof result.deliveryMode === "string" ? result.deliveryMode : "";
    const turnId = typeof result.turnId === "string" ? result.turnId : undefined;
    const warnings = Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === "string") : [];
    if (success && mode !== "openOnlyFallback") {
      return {
        success: true,
        label: "Sent to Codex.",
        ...(turnId ? { detail: `Turn ${shortId(turnId)}` } : {})
      };
    }
    if (mode === "openOnlyFallback") {
      return {
        success: false,
        label: "Opened in Codex only.",
        detail: "The task was not sent as a turn."
      };
    }
    return {
      success: false,
      label: "Codex did not accept the task.",
      ...(warnings.length ? { detail: warnings.join(" ") } : {})
    };
  } catch {
    return undefined;
  }
}

function operationLabel(operation: WorkbenchOperation): string {
  switch (operation) {
    case "startMission":
      return "Starting mission...";
    case "stop":
      return "Stopping...";
    case "continue":
      return "Continuing...";
    case "steer":
      return "Sending steering...";
    case "taskSpec":
      return "Generating TaskSpec...";
    case "sendCodex":
      return "Sending to Codex...";
    case "verify":
      return "Running verification...";
    case "review":
      return "Asking planner to review...";
    case "followUp":
      return "Drafting follow-up...";
    case "sendFollowUp":
      return "Sending follow-up...";
    case "workspace":
      return "Updating workspace...";
    case "decision":
      return "Applying decision...";
    case "chatGptPlanner":
      return "Opening ChatGPT...";
    case "chatGptCapture":
      return "Using ChatGPT plan...";
  }
}

function taskStateCopy(mission: Mission | undefined, card: HandoffCard | undefined): string {
  if (!mission) {
    return "Start a mission to create a task.";
  }
  if (!card) {
    return "Planning is ready to create a TaskSpec.";
  }
  return `${mission.status} · ${card.taskSpec.acceptanceCriteria.length} acceptance criteria`;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parsePlannerPayloadSummary(artifact?: Artifact | undefined): PlannerPayloadSummary | undefined {
  if (!artifact?.content) {
    return undefined;
  }
  try {
    const record = JSON.parse(artifact.content) as unknown;
    if (!isRecord(record)) {
      return undefined;
    }
    const payload = isRecord(record.payload) ? record.payload : {};
    return {
      artifactId: artifact.id,
      purpose: typeof record.purpose === "string" ? record.purpose : "planner",
      estimatedBytes: typeof record.estimatedBytes === "number" ? record.estimatedBytes : 0,
      includedArtifactIds: stringArray(record.includedArtifactIds),
      excludedArtifactIds: stringArray(record.excludedArtifactIds),
      excludedReasons: isRecord(record.excludedReasons) ? Object.fromEntries(Object.entries(record.excludedReasons).map(([key, value]) => [key, String(value)])) : {},
      redactionFindings: Array.isArray(record.redactionFindings)
        ? record.redactionFindings.flatMap((finding) => {
            if (!isRecord(finding)) {
              return [];
            }
            return [{
              kind: String(finding.kind ?? "unknown"),
              severity: String(finding.severity ?? "unknown"),
              preview: String(finding.preview ?? "")
            }];
          })
        : [],
      payload
    };
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
