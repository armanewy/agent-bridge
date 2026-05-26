import { Bot, CheckCircle2, FileText, GitBranch, Play, Send, Square, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  Artifact,
  ArtifactFile,
  CodexDeepLinkTarget,
  CodexThreadRef,
  HandoffCard,
  Mission
} from "@agentbridge/core";
import type { AutopilotStatus, CodexAppServerStatus, MissionDetail } from "../../services/bridge-contract.js";

interface WorkbenchPageProps {
  missions: Mission[];
  missionDetail?: MissionDetail | undefined;
  selectedMissionId?: string | undefined;
  codexTarget?: CodexDeepLinkTarget | undefined;
  codexThreads: CodexThreadRef[];
  agentSessions: AgentSessionRef[];
  providerProfiles: AgentProviderProfile[];
  codexAppServerStatus?: CodexAppServerStatus | undefined;
  autopilotStatus?: AutopilotStatus | undefined;
  error?: string | undefined;
  onChooseRepo(): void;
  onSelectMission(id: string): void;
  onCreateMission(): void;
  onAskPlanner(text: string): void;
  onGenerateTaskSpec(): void;
  onSendToCodex(sessionRefId?: string): void;
  onRunVerification(): void;
  onAskPlannerToReview(): void;
  onCreateFollowUp(): void;
  onSendFollowUp(sessionRefId?: string): void;
  onStartMission(intent: string, mode: "manual" | "supervised" | "autonomous"): void;
  onStopAutopilot(runId: string): void;
  onContinueAutopilot(runId: string): void;
  onSteerAutopilot(runId: string, text: string): void;
  onResolvePendingDecision(decisionId: string, selectedOption: string): void;
}

export function WorkbenchPage({
  missions,
  missionDetail,
  selectedMissionId,
  codexTarget,
  codexThreads,
  agentSessions,
  providerProfiles,
  codexAppServerStatus,
  autopilotStatus,
  error,
  onChooseRepo,
  onSelectMission,
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
  onResolvePendingDecision
}: WorkbenchPageProps): JSX.Element {
  const [plannerText, setPlannerText] = useState("");
  const [intentText, setIntentText] = useState("");
  const [steeringText, setSteeringText] = useState("");
  const [autopilotMode, setAutopilotMode] = useState<"manual" | "supervised" | "autonomous">("supervised");
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const planner = providerProfiles.find((profile) => profile.id === "openai-planner");
  const codex = providerProfiles.find((profile) => profile.id === "codex");
  const taskCard = missionDetail?.handoffCards.find((card) => card.recipe !== "debuggingRequest");
  const followUpCard = missionDetail?.handoffCards.find((card) => card.recipe === "debuggingRequest");
  const verification = missionDetail?.verificationResults[0];
  const plannerResponses = missionDetail?.artifacts.filter((artifact) => artifact.kind === "modelResponse") ?? [];
  const selectedSession = agentSessions.find((session) => session.id === selectedSessionId);
  const latestProviderEvent = missionDetail?.agentEvents?.[0];
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
  const canSend = Boolean(selectedMissionId && taskCard);
  const canVerify = Boolean(selectedMissionId && missionDetail?.mission.repoContext);
  const canReview = Boolean(selectedMissionId && taskCard && verification && planner?.status === "available");
  const canSendFollowUp = Boolean(selectedMissionId && followUpCard);
  const canStartMission = Boolean(codexTarget && intentText.trim());
  const activeRun = autopilotStatus?.run;

  return (
    <div className="workbench-layout">
      <section className="panel intent-panel">
        <div className="panel-heading compact-heading">
          <div>
            <span className="eyebrow">Mission</span>
            <h2>What do you want done?</h2>
            <p>Choose a repo, describe the outcome once, then let AgentBridge plan, send, verify, and review.</p>
          </div>
          <StatusPill status={activeRun?.status ?? missionDetail?.mission.status} />
        </div>
        <textarea
          className="planner-input intent-input"
          value={intentText}
          onChange={(event) => setIntentText(event.target.value)}
          placeholder="Example: Simplify the Workbench UI and remove irrelevant panels."
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
          <button type="button" className="primary-button" disabled={!canStartMission} onClick={() => onStartMission(intentText, autopilotMode)}>
            <Play size={16} />
            Start Mission
          </button>
          {activeRun && activeRun.status !== "cancelled" && activeRun.status !== "passed" && activeRun.status !== "failed" ? (
            <button type="button" className="secondary-button" onClick={() => onStopAutopilot(activeRun.id)}>
              <Square size={16} />
              Stop
            </button>
          ) : null}
        </div>
        <MissionTimeline status={autopilotStatus} />
        {latestProviderEvent ? (
          <p className="latest-provider-event">
            Latest provider event: <strong>{latestProviderEvent.type}</strong>
          </p>
        ) : null}
        {autopilotStatus?.pendingDecision ? (
          <div className="pending-decision">
            <strong>{autopilotStatus.pendingDecision.prompt}</strong>
            <div className="button-row">
              {autopilotStatus.pendingDecision.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === "Approve" ? "primary-button" : "secondary-button"}
                  onClick={() => onResolvePendingDecision(autopilotStatus.pendingDecision?.id ?? "", option)}
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
              placeholder="Steer this mission..."
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!steeringText.trim()}
              onClick={() => {
                onSteerAutopilot(activeRun.id, steeringText);
                setSteeringText("");
              }}
            >
              Steer
            </button>
            {activeRun.status === "blocked" ? (
              <button type="button" className="secondary-button" onClick={() => onContinueAutopilot(activeRun.id)}>
                Continue
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel workbench-repo-strip">
        <div>
          <span className="eyebrow">Repo</span>
          <h2>{codexTarget ? repoName(codexTarget.repoPath) : "Choose a repo"}</h2>
          <p>{codexTarget ? codexTarget.repoPath : "Pick the local repository Codex should work in."}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onChooseRepo}>
          Choose repo
        </button>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <details className="workbench-details">
        <summary>Show planner, Codex, and task details</summary>
      <div className="workbench-grid">
        <section className="panel workbench-pane">
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">Planner</span>
              <h2>OpenAI Planner</h2>
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
            <button type="button" className="primary-button" onClick={() => onAskPlanner(plannerText)} disabled={!canAskPlanner}>
              <Bot size={16} />
              Ask Planner
            </button>
            <button type="button" className="secondary-button" onClick={onCreateMission} disabled={!codexTarget}>
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
            <StatusPill status={codex?.status} />
          </div>
          <div className="session-list">
            <button
              type="button"
              className={!selectedSessionId ? "session-row selected" : "session-row"}
              onClick={() => setSelectedSessionId(undefined)}
            >
              <strong>New Codex thread</strong>
              <span>Delivery mode: codex:// new thread</span>
            </button>
            {codexSessionRows.map((session) => (
              <button
                key={session.id}
                type="button"
                className={selectedSessionId === session.id ? "session-row selected" : "session-row"}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <strong>{session.title ?? shortId(session.externalSessionId)}</strong>
                <span>{sessionModeCopy(session)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="primary-button" onClick={() => onSendToCodex(selectedSession?.id)} disabled={!canSend}>
            <Send size={16} />
            Send TaskSpec to Codex
          </button>
        </section>
      </div>

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
          <button type="button" className="secondary-button" onClick={onGenerateTaskSpec} disabled={!canGenerateTaskSpec}>
            <FileText size={16} />
            Generate TaskSpec
          </button>
          <button type="button" className="secondary-button" onClick={onRunVerification} disabled={!canVerify}>
            <Play size={16} />
            Run Verification
          </button>
          <button type="button" className="secondary-button" onClick={onAskPlannerToReview} disabled={!canReview}>
            <CheckCircle2 size={16} />
            Ask Planner to Review
          </button>
          <button type="button" className="secondary-button" onClick={onCreateFollowUp} disabled={!selectedMissionId || !plannerResponses.length}>
            <Wrench size={16} />
            Draft Follow-up
          </button>
          <button type="button" className="secondary-button" onClick={() => onSendFollowUp(selectedSession?.id)} disabled={!canSendFollowUp}>
            <Send size={16} />
            Send Follow-up
          </button>
        </div>
        {taskCard ? <TaskSpecSummary card={taskCard} /> : null}
        {verification ? <pre className="compact-output">{verification.summary}</pre> : null}
      </section>
      <ArtifactTray artifacts={missionDetail?.artifacts ?? []} files={missionDetail?.artifactFiles ?? []} />
      </details>

      {missions.length > 0 ? (
        <section className="panel recent-workbench-tasks">
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">Recent</span>
              <h2>Tasks</h2>
            </div>
          </div>
          <div className="compact-list">
            {missions.slice(0, 6).map((mission) => (
              <button
                key={mission.id}
                type="button"
                className={mission.id === selectedMissionId ? "compact-row selected" : "compact-row"}
                onClick={() => onSelectMission(mission.id)}
              >
                <GitBranch size={15} />
                <span>{mission.title}</span>
                <em>{mission.status}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ArtifactTray({ artifacts, files }: { artifacts: Artifact[]; files: ArtifactFile[] }): JSX.Element {
  const fileByArtifact = new Map(files.map((file) => [file.artifactId, file]));
  const rows = artifacts.slice(0, 10);
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
            return (
              <div key={artifact.id} className="artifact-tray-row">
                <div>
                  <strong>{artifact.title}</strong>
                  <span>{artifact.kind} · {artifact.metadata.providerId ? String(artifact.metadata.providerId) : "local"} · {file ? formatBytes(file.sizeBytes) : "text"}</span>
                </div>
                <em>{artifactTransferStatus(artifact, file)}</em>
                <div className="artifact-actions">
                  <button type="button" className="secondary-button" disabled={!artifact.content} onClick={() => void navigator.clipboard?.writeText(artifact.content ?? "")}>
                    Copy
                  </button>
                  <button type="button" className="secondary-button" disabled>
                    Reveal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
        {card.taskSpec.acceptanceCriteria.slice(0, 4).map((item) => (
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
    return "Set OPENAI_API_KEY or AGENTBRIDGE_OPENAI_API_KEY to enable planning.";
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
  return "Choose a repo to enable Codex deep-link delivery.";
}

function sessionModeCopy(session: AgentSessionRef): string {
  const mode = session.metadata.integrationMode === "appServer" ? "Existing thread via App Server" : "Existing thread open-only fallback";
  return `${mode} · ${shortId(session.externalSessionId)}`;
}

function taskStateCopy(mission: Mission | undefined, card: HandoffCard | undefined): string {
  if (!mission) {
    return "Choose a repo, create a task, then ask the planner.";
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

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
