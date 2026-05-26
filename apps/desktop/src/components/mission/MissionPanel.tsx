import { ClipboardList, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { Mission } from "@agentbridge/core";
import type { MissionDetail } from "../../services/bridge-contract.js";
import { ArtifactViewer } from "./ArtifactViewer.js";
import { VerificationPanel } from "../verification/VerificationPanel.js";

interface MissionPanelProps {
  missions: Mission[];
  selectedMissionId?: string | undefined;
  detail?: MissionDetail | undefined;
  onSelectMission(id: string): void;
  onRunVerification(id: string): void;
  onDeliverHandoffCard(missionId: string, handoffCardId: string, dryRun: boolean): void;
}

export function MissionPanel({
  missions,
  selectedMissionId,
  detail,
  onSelectMission,
  onRunVerification,
  onDeliverHandoffCard
}: MissionPanelProps): JSX.Element {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>();
  const selectedArtifact = detail?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? detail?.artifacts[0];
  const nextAction = detail ? nextActionFor(detail) : undefined;
  const timeline = detail ? timelineFor(detail) : [];

  useEffect(() => {
    setSelectedArtifactId(detail?.artifacts[0]?.id);
  }, [detail?.mission.id, detail?.artifacts[0]?.id]);

  return (
    <div className="mission-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Task Cards</h2>
            <p>{missions.length} tracked task(s)</p>
          </div>
          <ClipboardList size={20} />
        </div>
        <div className="item-list">
          {missions.length === 0 ? (
            <p className="empty-copy">Create a Task Card from a capture to start tracking agent work.</p>
          ) : (
            missions.map((mission) => (
              <button
                type="button"
                className={mission.id === selectedMissionId ? "mission-row selected" : "mission-row"}
                key={mission.id}
                onClick={() => onSelectMission(mission.id)}
              >
                <strong>{mission.title}</strong>
                <span>{mission.status}</span>
                <small>{mission.updatedAt}</small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        {detail ? (
          <>
            <div className="panel-heading">
              <div>
                <h2>{detail.mission.title}</h2>
                <p>{detail.mission.goal}</p>
              </div>
              <span className="status-pill">{detail.mission.status}</span>
            </div>

            <div className="task-status-summary">
              <span className="eyebrow">Status</span>
              <strong>{summaryFor(detail)}</strong>
              <p>{detail.verificationResults[0]?.summary ?? "AgentBridge is tracking capture, prompt, delivery, and verification state for this task."}</p>
            </div>

            <div className="mission-detail-grid">
              <DetailBlock label="Repo" value={detail.mission.repoContext?.repoPath ?? "No repo context"} />
              <DetailBlock label="Branch" value={detail.mission.repoContext?.currentBranch ?? "Unknown"} />
              <DetailBlock label="Verification" value={detail.verificationResults[0]?.status ?? "not_run"} />
              <DetailBlock label="Captures" value={String(detail.captures.length)} />
              <DetailBlock label="Artifacts" value={String(detail.artifacts.length)} />
              <DetailBlock label="Deliveries" value={String(detail.deliveryAttempts.length)} />
            </div>

            <div className="timeline">
              <span className="eyebrow">Timeline</span>
              {timeline.map((item) => (
                <div className={`timeline-item ${item.done ? "done" : ""}`} key={item.label}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {nextAction ? (
              <div className="next-action">
                <div>
                  <span className="eyebrow">Next action</span>
                  <strong>{nextAction.title}</strong>
                  <p>{nextAction.description}</p>
                </div>
                {nextAction.kind === "send" ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onDeliverHandoffCard(detail.mission.id, nextAction.handoffCardId, false)}
                  >
                    {nextAction.label}
                  </button>
                ) : null}
                {nextAction.kind === "verify" ? (
                  <button type="button" className="primary-button" onClick={() => onRunVerification(detail.mission.id)}>
                    Run verification
                  </button>
                ) : null}
              </div>
            ) : null}

            {detail.captures[0] ? (
              <div className="capture-excerpt">
                <span className="eyebrow">Source Capture</span>
                <pre>{detail.captures[0].text.slice(0, 600)}</pre>
              </div>
            ) : null}

            {detail.handoffCards.length > 0 ? (
              <div className="mission-task">
                <span className="eyebrow">Task dispatches</span>
                {detail.handoffCards.map((card, index) => (
                  <article className="handoff-card-panel" key={card.id}>
                    <div className="panel-heading compact">
                      <div>
                        <h3>{card.taskSpec.title}</h3>
                        <p>
                          {index === 0 ? "initial" : "follow-up"} / {card.recipe}
                        </p>
                      </div>
                      <span className="status-pill">{card.deliveryAttemptIds.length > 0 ? "sent" : "draft"}</span>
                    </div>
                    <p>{card.taskSpec.background}</p>
                    <div className="task-spec-grid">
                      <MiniList title="Requirements" items={card.taskSpec.requirements} />
                      <MiniList title="Acceptance Criteria" items={card.taskSpec.acceptanceCriteria} />
                      <MiniList title="Verification Steps" items={card.taskSpec.verificationSteps} />
                    </div>
                    <div className="prompt-preview">
                      <span className="eyebrow">Generated Prompt</span>
                      <pre>{card.generatedPrompt}</pre>
                    </div>
                    <div className="button-row">
                      <button type="button" className="secondary-button" onClick={() => onDeliverHandoffCard(detail.mission.id, card.id, true)}>
                        Dry run Codex
                      </button>
                      <button type="button" className="primary-button" onClick={() => onDeliverHandoffCard(detail.mission.id, card.id, false)}>
                        Send to Codex
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <VerificationPanel detail={detail} onRunVerification={onRunVerification} />

            <div className="artifact-list">
              <span className="eyebrow">Artifacts</span>
              {detail.artifacts.length === 0 ? (
                <p className="empty-copy">No artifacts saved.</p>
              ) : (
                detail.artifacts.map((artifact) => (
                  <button
                    type="button"
                    className={artifact.id === selectedArtifact?.id ? "list-card selectable selected" : "list-card selectable"}
                    key={artifact.id}
                    onClick={() => setSelectedArtifactId(artifact.id)}
                  >
                    <strong>
                      <FileText size={14} />
                      {artifact.title}
                    </strong>
                    <span>{artifact.kind}</span>
                  </button>
                ))
              )}
            </div>
            <ArtifactViewer artifact={selectedArtifact} />

            <div className="artifact-list">
              <span className="eyebrow">Delivery Attempts</span>
              {detail.deliveryAttempts.length === 0 ? (
                <p className="empty-copy">No delivery attempts yet.</p>
              ) : (
                detail.deliveryAttempts.map((attempt) => (
                  <article className="list-card" key={attempt.id}>
                    <strong>{attempt.strategy}</strong>
                    <span>{attempt.success ? "succeeded" : "failed"} - {attempt.attemptedAt}</span>
                  </article>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <h2>Task Detail</h2>
            <p>Select a task to see what was captured, sent, verified, and what should happen next.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function summaryFor(detail: MissionDetail): string {
  const latestVerification = detail.verificationResults[0]?.status;
  if (latestVerification === "passed") {
    return "Verification passed";
  }
  if (latestVerification === "failed") {
    return "Verification failed";
  }
  if (latestVerification === "needs_review" || latestVerification === "warning") {
    return "Needs review";
  }
  if (detail.deliveryAttempts.some((attempt) => attempt.success)) {
    return "Sent to Codex";
  }
  return "Draft";
}

function nextActionFor(detail: MissionDetail):
  | { kind: "send"; title: string; description: string; label: string; handoffCardId: string }
  | { kind: "verify"; title: string; description: string }
  | { kind: "done"; title: string; description: string }
  | undefined {
  const unsentCard = detail.handoffCards.find((card) => card.deliveryAttemptIds.length === 0);
  if (unsentCard) {
    const isFollowUp = detail.handoffCards.indexOf(unsentCard) > 0;
    return {
      kind: "send",
      title: isFollowUp ? "Follow-up ready" : "Ready to send",
      description: isFollowUp ? "Verification created a follow-up prompt. Review it below, then send it to Codex." : "Send the Task Card to Codex when the prompt looks right.",
      label: isFollowUp ? "Send follow-up to Codex" : "Send to Codex",
      handoffCardId: unsentCard.id
    };
  }
  if (detail.deliveryAttempts.some((attempt) => attempt.success) && detail.verificationResults.length === 0) {
    return {
      kind: "verify",
      title: "Verify the result",
      description: "After Codex changes files, run the configured local checks and capture artifacts."
    };
  }
  if (detail.verificationResults[0]?.status === "failed") {
    return {
      kind: "done",
      title: "Inspect failure artifacts",
      description: "Open the command output and follow-up draft before deciding what to send next."
    };
  }
  return {
    kind: "done",
    title: "No immediate action",
    description: "Open artifacts or delivery attempts if you need to review the task history."
  };
}

function timelineFor(detail: MissionDetail): Array<{ label: string; detail: string; done: boolean }> {
  return [
    {
      label: "Captured",
      detail: detail.captures[0]?.createdAt ?? "No capture attached",
      done: detail.captures.length > 0
    },
    {
      label: "Task created",
      detail: detail.mission.createdAt,
      done: true
    },
    {
      label: "Sent to Codex",
      detail: detail.deliveryAttempts[0]?.attemptedAt ?? "Not sent yet",
      done: detail.deliveryAttempts.length > 0
    },
    {
      label: "Verification run",
      detail: detail.runs[0]?.completedAt ?? detail.runs[0]?.startedAt ?? "Not run yet",
      done: detail.runs.length > 0
    },
    {
      label: "Follow-up drafted",
      detail: detail.handoffCards.length > 1 ? detail.handoffCards[1]?.createdAt ?? "Draft available" : "No follow-up draft",
      done: detail.handoffCards.length > 1
    }
  ];
}

function DetailBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="detail-block">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div className="spec-section">
      <span className="eyebrow">{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
