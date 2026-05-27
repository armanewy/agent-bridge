import { Bot, CheckCircle2, FileText, Play, Send, Square, Wrench } from "lucide-react";
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
  | "askPlanner"
  | "newTask"
  | "taskSpec"
  | "sendCodex"
  | "verify"
  | "review"
  | "followUp"
  | "sendFollowUp"
  | "workspace"
  | "decision";

export function WorkbenchPage({
  missionDetail,
  selectedMissionId,
  codexTarget,
  codexThreads,
  agentSessions,
  workspaceCandidates,
  providerProfiles,
  codexAppServerStatus,
  autopilotStatus,
  error,
  onChooseRepo,
  onUseWorkspaceCandidate,
  onCreateMission,
  onAskPlanner,
  onGenerateTaskSpec,
  onSendToCodex,
  onRunVerification,
  onAskPlannerToReview,
  onCreateFollowUp,
  onSendFollowUp,
  onStartMission,
  onStopAutopilot,
  onContinueAutopilot,
  onSteerAutopilot,
  onResolvePendingDecision,
  onRevealArtifactFile
}: WorkbenchPageProps): JSX.Element {
  const [plannerText, setPlannerText] = useState("");
  const [intentText, setIntentText] = useState("");
  const [steeringText, setSteeringText] = useState("");
  const [autopilotMode, setAutopilotMode] = useState<"manual" | "supervised" | "autonomous">("supervised");
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [pendingOperation, setPendingOperation] = useState<WorkbenchOperation | undefined>();
  const planner = providerProfiles.find((profile) => profile.id === "agentbridge-hosted-planner") ?? providerProfiles.find((profile) => profile.kind === "planner");
  const codex = providerProfiles.find((profile) => profile.id === "codex");
  const taskCard = missionDetail?.handoffCards.find((card) => card.recipe !== "debuggingRequest");
  const followUpCard = missionDetail?.handoffCards.find((card) => card.recipe === "debuggingRequest");
  const verification = missionDetail?.verificationResults[0];
  const completionContract = missionDetail?.completionContracts?.[0];
  const missionWorkspaceRef = missionDetail?.missionWorkspaces?.[0];
  const ownedFiles = missionDetail?.fileOwnership ?? [];
  const plannerResponses = missionDetail?.artifacts.filter((artifact) => artifact.kind === "modelResponse") ?? [];
  const latestDelivery = parseLatestExecutorDelivery(missionDetail?.artifacts ?? []);
  const selectedSession = agentSessions.find((session) => session.id === selectedSessionId);
  const codexReady = codex?.status === "available" || codexAppServerStatus?.available === true;
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
  const canAskPlanner = Boolean(selectedMissionId && plannerText.trim() && planner?.status === "available");
  const canGenerateTaskSpec = Boolean(selectedMissionId && plannerResponses.length > 0);
  const canSend = Boolean(selectedMissionId && taskCard && codexReady);
  const canVerify = Boolean(selectedMissionId && missionDetail?.mission.repoContext);
  const canReview = Boolean(selectedMissionId && taskCard && verification && planner?.status === "available");
  const canSendFollowUp = Boolean(selectedMissionId && followUpCard && codexReady);
  const canStartMission = Boolean(intentText.trim() && planner?.status === "available" && codexReady);
  const activeRun = autopilotStatus?.run;
  const missionWorkspace = missionDetail?.mission.repoContext;
  const bestWorkspaceCandidate = workspaceCandidates.find((candidate) => candidate.repoPath);
  const needsWorkspaceForNewCodexThread = Boolean(selectedMissionId && taskCard && !selectedSession && !missionWorkspace);
  const shouldShowWorkspaceSurface = needsWorkspaceForNewCodexThread;
  const blockers = [
    planner?.status !== "available" ? "Sign in to start." : undefined,
    !codexReady ? "Codex is not ready." : undefined
  ].filter((item): item is string => Boolean(item));
  const latestPayloadSummary = parsePlannerPayloadSummary(
    missionDetail?.artifacts.find((artifact) => artifact.metadata.source === "hostedPlannerPayloadSummary")
  );
  const [payloadPanelOpen, setPayloadPanelOpen] = useState(false);
  const isBusy = Boolean(pendingOperation);
  const pendingLabel = pendingOperation ? operationLabel(pendingOperation) : undefined;
  const newThreadCopy = codexAppServerStatus?.available
    ? "Starts a Codex thread and sends the task."
    : "Opens a new Codex draft.";

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
    <div className="workbench-layout">
      <section className="panel intent-panel">
        <div className="panel-heading compact-heading">
          <div>
            <h2>What do you want done?</h2>
          </div>
          {activeRun || missionDetail ? <StatusPill status={activeRun?.status ?? missionDetail?.mission.status} /> : null}
        </div>
        {blockers.length ? <div className="inline-blocker">{blockers.join(" ")}</div> : null}
        {pendingLabel ? (
          <div className="progress-banner" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            {pendingLabel}
          </div>
        ) : null}
        <textarea
          className="planner-input intent-input"
          value={intentText}
          onChange={(event) => setIntentText(event.target.value)}
          placeholder="Describe the task..."
        />
        <div className="intent-actions">
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
            className="primary-button"
            disabled={!canStartMission || isBusy}
            onClick={() => void runOperation("startMission", () => onStartMission(intentText, autopilotMode))}
          >
            {pendingOperation === "startMission" ? <span className="spinner light" aria-hidden="true" /> : <Play size={16} />}
            {pendingOperation === "startMission" ? "Starting..." : "Start Mission"}
          </button>
          {activeRun && activeRun.status !== "cancelled" && activeRun.status !== "passed" && activeRun.status !== "failed" ? (
            <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void runOperation("stop", () => onStopAutopilot(activeRun.id))}>
              <Square size={16} />
              Stop
            </button>
          ) : null}
        </div>
        <MissionTimeline status={autopilotStatus} />
        {autopilotStatus?.pendingDecision ? (
          <div className="pending-decision">
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
        {activeRun ? (
          <div className="steering-row">
            <input
              value={steeringText}
              onChange={(event) => setSteeringText(event.target.value)}
              placeholder="Steer..."
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!steeringText.trim() || isBusy}
              onClick={() => {
                void runOperation("steer", () => onSteerAutopilot(activeRun.id, steeringText));
                setSteeringText("");
              }}
            >
              Steer
            </button>
            {activeRun.status === "blocked" ? (
              <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void runOperation("continue", () => onContinueAutopilot(activeRun.id))}>
                {pendingOperation === "continue" ? "Continuing..." : "Continue"}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {shouldShowWorkspaceSurface ? (
        <section className="panel workbench-repo-strip">
          <div>
            <h2>Workspace required</h2>
            <p>
              {bestWorkspaceCandidate
                  ? `${bestWorkspaceCandidate.repoName ?? repoName(bestWorkspaceCandidate.repoPath ?? "")} · inferred from ${bestWorkspaceCandidate.source} · ${bestWorkspaceCandidate.confidence}% confidence`
                  : "Choose a workspace to create a new Codex thread."}
            </p>
          </div>
          <div className="button-row">
            {!missionWorkspace && bestWorkspaceCandidate?.repoPath ? (
              <button
                type="button"
                className="primary-button compact"
                disabled={isBusy}
                onClick={() => void runOperation("workspace", () => onUseWorkspaceCandidate(bestWorkspaceCandidate))}
              >
                Use inferred workspace
              </button>
            ) : null}
            <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void runOperation("workspace", onChooseRepo)}>
              Choose workspace
            </button>
          </div>
        </section>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <details className="workbench-details">
        <summary>Details</summary>
      <section className="panel workbench-task-panel">
        <div className="panel-heading compact-heading">
          <div>
            <span className="eyebrow">Task</span>
            <h2>{missionDetail?.mission.title ?? "No task yet"}</h2>
            <p>{taskStateCopy(missionDetail?.mission, taskCard)}</p>
          </div>
          <StatusPill status={missionDetail?.mission.status} />
        </div>
        <div className="task-action-grid">
          <button type="button" className="secondary-button" onClick={() => void runOperation("taskSpec", onGenerateTaskSpec)} disabled={!canGenerateTaskSpec || isBusy}>
            {pendingOperation === "taskSpec" ? <span className="spinner" aria-hidden="true" /> : <FileText size={16} />}
            {pendingOperation === "taskSpec" ? "Generating..." : "Generate TaskSpec"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void runOperation("verify", onRunVerification)} disabled={!canVerify || isBusy}>
            {pendingOperation === "verify" ? <span className="spinner" aria-hidden="true" /> : <Play size={16} />}
            {pendingOperation === "verify" ? "Verifying..." : "Run Verification"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void runOperation("review", onAskPlannerToReview)} disabled={!canReview || isBusy}>
            {pendingOperation === "review" ? <span className="spinner" aria-hidden="true" /> : <CheckCircle2 size={16} />}
            {pendingOperation === "review" ? "Reviewing..." : "Ask Planner to Review"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void runOperation("followUp", onCreateFollowUp)} disabled={!selectedMissionId || !plannerResponses.length || isBusy}>
            {pendingOperation === "followUp" ? <span className="spinner" aria-hidden="true" /> : <Wrench size={16} />}
            {pendingOperation === "followUp" ? "Drafting..." : "Draft Follow-up"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void runOperation("sendFollowUp", () => onSendFollowUp(selectedSession?.id))} disabled={!canSendFollowUp || isBusy}>
            {pendingOperation === "sendFollowUp" ? <span className="spinner" aria-hidden="true" /> : <Send size={16} />}
            {pendingOperation === "sendFollowUp" ? "Sending..." : "Send Follow-up"}
          </button>
        </div>
        <DoneMeansPanel contract={completionContract} evidenceCount={missionDetail?.completionEvidence?.length ?? 0} />
        {missionWorkspaceRef ? <WorkspaceIsolationPanel workspace={missionWorkspaceRef} fileCount={ownedFiles.length} /> : null}
        {taskCard ? <TaskSpecSummary card={taskCard} /> : null}
        {verification ? <pre className="compact-output">{verification.summary}</pre> : null}
      </section>
      <div className="workbench-grid">
        <section className="panel workbench-pane">
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">Planner</span>
              <h2>Planner</h2>
              <p>{plannerCopy(planner)}</p>
            </div>
            <StatusPill status={planner?.status} />
          </div>
          <textarea
            className="planner-input"
            value={plannerText}
            onChange={(event) => setPlannerText(event.target.value)}
            placeholder="Ask the planner what Codex should do..."
          />
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void runOperation("askPlanner", () => onAskPlanner(plannerText))} disabled={!canAskPlanner || isBusy}>
              {pendingOperation === "askPlanner" ? <span className="spinner light" aria-hidden="true" /> : <Bot size={16} />}
              {pendingOperation === "askPlanner" ? "Asking..." : "Ask Planner"}
            </button>
            <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void runOperation("newTask", onCreateMission)}>
              New task
            </button>
          </div>
          <ArtifactList title="Planner notes" items={plannerResponses.map((artifact) => artifact.content ?? "")} />
        </section>

        <section className="panel workbench-pane">
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">Codex</span>
              <h2>Executor</h2>
              <p>{codexCopy(codex, codexAppServerStatus)}</p>
            </div>
            <StatusPill status={codexReady ? "available" : codex?.status} />
          </div>
          <div className="session-list">
            <button
              type="button"
              className={!selectedSessionId ? "session-row selected" : "session-row"}
              onClick={() => setSelectedSessionId(undefined)}
              disabled={isBusy}
            >
              <strong>New Codex thread</strong>
              <span>{newThreadCopy}</span>
            </button>
            {codexSessionRows.map((session) => (
              <button
                key={session.id}
                type="button"
                className={selectedSessionId === session.id ? "session-row selected" : "session-row"}
                onClick={() => setSelectedSessionId(session.id)}
                disabled={isBusy}
              >
                <strong>{session.title ?? shortId(session.externalSessionId)}</strong>
                <span>{sessionModeCopy(session)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="primary-button" onClick={() => void runOperation("sendCodex", () => onSendToCodex(selectedSession?.id))} disabled={!canSend || isBusy}>
            {pendingOperation === "sendCodex" ? <span className="spinner light" aria-hidden="true" /> : <Send size={16} />}
            {pendingOperation === "sendCodex" ? "Sending..." : "Send TaskSpec"}
          </button>
          {latestDelivery ? (
            <div className={latestDelivery.success ? "delivery-status" : "delivery-status warning"}>
              <strong>{latestDelivery.label}</strong>
              {latestDelivery.detail ? <span>{latestDelivery.detail}</span> : null}
            </div>
          ) : null}
          {needsWorkspaceForNewCodexThread ? (
            <p className="empty-copy">Choose a workspace to create a new Codex thread, or select an existing Codex session.</p>
          ) : null}
        </section>
      </div>
      <PlannerPayloadPanel summary={latestPayloadSummary} open={payloadPanelOpen} onToggle={() => setPayloadPanelOpen((current) => !current)} />
      <ArtifactTray artifacts={missionDetail?.artifacts ?? []} files={missionDetail?.artifactFiles ?? []} onRevealFile={onRevealArtifactFile} />
      </details>
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
        <strong>Workspace isolation</strong>
        <span>{workspace.status}</span>
      </div>
      <p>{workspace.strategy === "gitWorktree" ? "Git worktree" : workspace.strategy === "branch" ? "Branch" : "No isolation"}</p>
      <p>{workspace.branchName ?? workspace.worktreeName ?? workspace.workingPath}</p>
      <p>{fileCount} changed/claimed file{fileCount === 1 ? "" : "s"} tracked.</p>
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
        <p>Generate a TaskSpec to create objective acceptance criteria.</p>
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
      <ul>
        {contract.acceptanceCriteria.slice(0, 3).map((criterion) => (
          <li key={criterion.id}>
            {criterion.statement}
            <em>{criterion.verifierKind}</em>
          </li>
        ))}
      </ul>
      {contract.acceptanceCriteria.length > 3 ? <p>{contract.acceptanceCriteria.length - 3} more criteria.</p> : null}
      <p>{evidenceCount} evidence item{evidenceCount === 1 ? "" : "s"} recorded.</p>
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
}): JSX.Element | null {
  if (!summary) {
    return null;
  }
  const payload = summary.payload;
  const repoIdentity = isRecord(payload.repoIdentity) ? payload.repoIdentity : undefined;
  const taskSpec = isRecord(payload.taskSpec) ? payload.taskSpec : undefined;
  return (
    <section className={summary.redactionFindings.length ? "panel planner-payload-panel warning" : "panel planner-payload-panel"}>
      <button type="button" className="payload-toggle" onClick={onToggle}>
        <span>What will be sent to Planner</span>
        <em>{summary.estimatedBytes} bytes</em>
      </button>
      {open ? (
        <div className="payload-summary-grid">
          <div>
            <strong>Intent</strong>
            <p>{String(payload.intent ?? "Not included")}</p>
          </div>
          <div>
            <strong>Task summary</strong>
            <p>{taskSpec ? String(taskSpec.title ?? "TaskSpec included") : "No TaskSpec in this payload"}</p>
          </div>
          <div>
            <strong>Repo identity</strong>
            <p>{repoIdentity ? JSON.stringify(repoIdentity) : "Not included"}</p>
          </div>
          <div>
            <strong>Artifacts</strong>
            <p>{summary.includedArtifactIds.length} included · {summary.excludedArtifactIds.length} excluded</p>
          </div>
          {summary.excludedArtifactIds.length ? (
            <div>
              <strong>Excluded</strong>
              <ul>
                {summary.excludedArtifactIds.slice(0, 4).map((id) => (
                  <li key={id}>{summary.excludedReasons[id] ?? id}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.redactionFindings.length ? (
            <div>
              <strong>Redaction findings</strong>
              <ul>
                {summary.redactionFindings.map((finding, index) => (
                  <li key={`${finding.kind}-${index}`}>{finding.severity}: {finding.kind} ({finding.preview})</li>
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
  const [transferSelections, setTransferSelections] = useState<Record<string, "planner" | "codex" | "excluded" | undefined>>({});
  const fileByArtifact = new Map(files.map((file) => [file.artifactId, file]));
  const rows = artifacts.slice(0, 10);
  const transferHistory = rows
    .map((artifact) => ({ artifact, transfer: transferSelections[artifact.id] }))
    .filter((item): item is { artifact: Artifact; transfer: "planner" | "codex" | "excluded" } => Boolean(item.transfer));
  return (
    <section className="panel artifact-tray">
      <div className="panel-heading compact-heading">
        <div>
          <span className="eyebrow">Artifacts</span>
          <h2>Mission files and records</h2>
          <p>Prompts, diffs, logs, generated files, and provider messages stay local unless policy allows sending them.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p>No artifacts yet.</p>
      ) : (
        <div className="artifact-tray-list">
          {rows.map((artifact) => {
            const file = fileByArtifact.get(artifact.id);
            const transfer = transferSelections[artifact.id];
            return (
              <div key={artifact.id} className="artifact-tray-row">
                <div>
                  <strong>{artifact.title}</strong>
                  <span>{artifact.kind} · {artifact.metadata.providerId ? String(artifact.metadata.providerId) : "local"} · {file ? formatBytes(file.sizeBytes) : "text"}</span>
                </div>
                <em>{transfer ? transferStatusCopy(transfer) : artifactTransferStatus(artifact, file)}</em>
                <div className="artifact-actions">
                  <button type="button" className="secondary-button" disabled={!artifact.content} onClick={() => void navigator.clipboard?.writeText(artifact.content ?? "")}>
                    Copy
                  </button>
                  <button type="button" className="secondary-button" disabled={!file} onClick={() => file && onRevealFile(file.id)}>
                    Reveal
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setTransferSelections((current) => ({ ...current, [artifact.id]: "planner" }))}>
                    Planner
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setTransferSelections((current) => ({ ...current, [artifact.id]: "codex" }))}>
                    Codex
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setTransferSelections((current) => ({ ...current, [artifact.id]: "excluded" }))}>
                    Exclude
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {transferHistory.length ? (
        <div className="artifact-transfer-history">
          <strong>Transfer history</strong>
          {transferHistory.map(({ artifact, transfer }) => (
            <span key={`${artifact.id}-${transfer}`}>{artifact.title}: {transferStatusCopy(transfer)}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MissionTimeline({ status }: { status?: AutopilotStatus | undefined }): JSX.Element {
  const steps = status?.steps ?? [];
  const labels = ["Planning", "TaskSpec", "Codex execution", "Verification", "Planner review", "Follow-up", "Done"];
  return (
    <div className="mission-timeline">
      {labels.map((label, index) => (
        <span key={label} className={index <= steps.length ? "timeline-step active" : "timeline-step"}>
          {label}
        </span>
      ))}
    </div>
  );
}

function TaskSpecSummary({ card }: { card: HandoffCard }): JSX.Element {
  return (
    <div className="taskspec-summary">
      <strong>{card.taskSpec.title}</strong>
      <p>{card.taskSpec.goal}</p>
      <ul>
        {card.taskSpec.acceptanceCriteria.slice(0, 3).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ArtifactList({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div className="artifact-snippets">
      <strong>{title}</strong>
      {items.length === 0 ? <p>No planner turns yet.</p> : items.slice(0, 2).map((item, index) => <pre key={index}>{item.slice(0, 700)}</pre>)}
    </div>
  );
}

function StatusPill({ status }: { status?: string | undefined }): JSX.Element {
  return <span className={status === "available" || status === "passed" || status === "delivered" ? "status-pill" : "status-pill muted"}>{status ?? "unknown"}</span>;
}

function plannerCopy(profile?: AgentProviderProfile): string {
  if (!profile) {
    return "Planner provider has not reported status yet.";
  }
  if (profile.status === "needsAuth") {
    return "Sign in to AgentBridge to enable hosted planning. No OpenAI API key is needed here.";
  }
  return "Ask for scoped implementation direction, acceptance criteria, and review feedback.";
}

function codexCopy(profile?: AgentProviderProfile, appServer?: CodexAppServerStatus): string {
  if (appServer?.available) {
    return "App Server connected. Existing Codex sessions can receive turns.";
  }
  if (profile?.status === "available") {
    return "Deep-link delivery is available. Existing sessions may be open-only fallback.";
  }
  return "Codex is not connected yet. Planning can still start; execution will wait for Codex.";
}

function sessionModeCopy(session: AgentSessionRef): string {
  const mode = session.metadata.integrationMode === "appServer" ? "Sends to this Codex thread" : "Opens this thread only";
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
    case "askPlanner":
      return "Asking planner...";
    case "newTask":
      return "Creating task...";
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
  }
}

function taskStateCopy(mission: Mission | undefined, card: HandoffCard | undefined): string {
  if (!mission) {
    return "Create a task, then ask the planner. Workspace can wait.";
  }
  if (!card) {
    return "Ask the planner, then generate a TaskSpec.";
  }
  return `${mission.status} · ${card.taskSpec.acceptanceCriteria.length} acceptance criteria`;
}

function repoName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function artifactTransferStatus(artifact: Artifact, file?: ArtifactFile): string {
  if (artifact.metadata.uploadedToProvider) {
    return "uploaded";
  }
  if (artifact.metadata.stagedForPlanner) {
    return "staged for planner";
  }
  if (artifact.metadata.stagedForCodex || file?.localPath.includes("staging")) {
    return "staged for codex";
  }
  return "local only";
}

function transferStatusCopy(value: "planner" | "codex" | "excluded"): string {
  if (value === "planner") {
    return "staged for planner";
  }
  if (value === "codex") {
    return "staged for codex";
  }
  return "excluded";
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
