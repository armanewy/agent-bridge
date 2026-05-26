import { ClipboardList, FileText } from "lucide-react";
import type { Mission } from "@agentbridge/core";
import type { MissionDetail } from "../../services/bridge-contract.js";
import { VerificationPanel } from "../verification/VerificationPanel.js";

interface MissionPanelProps {
  missions: Mission[];
  selectedMissionId?: string | undefined;
  detail?: MissionDetail | undefined;
  onSelectMission(id: string): void;
  onRunVerification(id: string): void;
}

export function MissionPanel({
  missions,
  selectedMissionId,
  detail,
  onSelectMission,
  onRunVerification
}: MissionPanelProps): JSX.Element {
  return (
    <div className="mission-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Missions</h2>
            <p>{missions.length} durable task(s)</p>
          </div>
          <ClipboardList size={20} />
        </div>
        <div className="item-list">
          {missions.length === 0 ? (
            <p className="empty-copy">Preview a handoff to create the first Mission.</p>
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

            <div className="mission-detail-grid">
              <DetailBlock label="Repo" value={detail.mission.repoContext?.repoPath ?? "No repo context"} />
              <DetailBlock label="Branch" value={detail.mission.repoContext?.currentBranch ?? "Unknown"} />
              <DetailBlock label="Verification" value={detail.verificationResults[0]?.status ?? "not_run"} />
              <DetailBlock label="Captures" value={String(detail.captures.length)} />
              <DetailBlock label="Artifacts" value={String(detail.artifacts.length)} />
              <DetailBlock label="Deliveries" value={String(detail.deliveryAttempts.length)} />
            </div>

            {detail.captures[0] ? (
              <div className="capture-excerpt">
                <span className="eyebrow">Source Capture</span>
                <pre>{detail.captures[0].text.slice(0, 600)}</pre>
              </div>
            ) : null}

            {detail.handoffCards[0] ? (
              <div className="mission-task">
                <span className="eyebrow">TaskSpec</span>
                <h3>{detail.handoffCards[0].taskSpec.title}</h3>
                <p>{detail.handoffCards[0].taskSpec.background}</p>
                <div className="task-spec-grid">
                  <MiniList title="Requirements" items={detail.handoffCards[0].taskSpec.requirements} />
                  <MiniList title="Acceptance Criteria" items={detail.handoffCards[0].taskSpec.acceptanceCriteria} />
                  <MiniList title="Verification Steps" items={detail.handoffCards[0].taskSpec.verificationSteps} />
                </div>
              </div>
            ) : null}

            <VerificationPanel detail={detail} onRunVerification={onRunVerification} />

            <div className="artifact-list">
              <span className="eyebrow">Artifacts</span>
              {detail.artifacts.length === 0 ? (
                <p className="empty-copy">No artifacts saved.</p>
              ) : (
                detail.artifacts.map((artifact) => (
                  <article className="list-card" key={artifact.id}>
                    <strong>
                      <FileText size={14} />
                      {artifact.title}
                    </strong>
                    <span>{artifact.kind}</span>
                  </article>
                ))
              )}
            </div>

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
            <h2>Mission Detail</h2>
            <p>Select a mission to inspect its task spec, artifacts, repo context, and verification state.</p>
          </div>
        )}
      </section>
    </div>
  );
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
