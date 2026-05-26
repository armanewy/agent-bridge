import { Bot, CheckCircle2, FileText, GitBranch, Play, Send, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  CodexDeepLinkTarget,
  CodexThreadRef,
  HandoffCard,
  Mission
} from "@agentbridge/core";
import type { CodexAppServerStatus, MissionDetail } from "../../services/bridge-contract.js";

interface WorkbenchPageProps {
  missions: Mission[];
  missionDetail?: MissionDetail | undefined;
  selectedMissionId?: string | undefined;
  codexTarget?: CodexDeepLinkTarget | undefined;
  codexThreads: CodexThreadRef[];
  agentSessions: AgentSessionRef[];
  providerProfiles: AgentProviderProfile[];
  codexAppServerStatus?: CodexAppServerStatus | undefined;
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
  onSendFollowUp
}: WorkbenchPageProps): JSX.Element {
  const [plannerText, setPlannerText] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const planner = providerProfiles.find((profile) => profile.id === "openai-planner");
  const codex = providerProfiles.find((profile) => profile.id === "codex");
  const taskCard = missionDetail?.handoffCards.find((card) => card.recipe !== "debuggingRequest");
  const followUpCard = missionDetail?.handoffCards.find((card) => card.recipe === "debuggingRequest");
  const verification = missionDetail?.verificationResults[0];
  const plannerResponses = missionDetail?.artifacts.filter((artifact) => artifact.kind === "modelResponse") ?? [];
  const selectedSession = agentSessions.find((session) => session.id === selectedSessionId);
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

  return (
    <div className="workbench-layout">
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
