import { Chrome } from "lucide-react";
import type { Capture, SourceEndpoint } from "@agentbridge/core";

interface CaptureInboxProps {
  captures: Capture[];
  sources: SourceEndpoint[];
  selectedCaptureId?: string | undefined;
  onSelectCapture(id: string): void;
}

export function CaptureInbox({
  captures,
  sources,
  selectedCaptureId,
  onSelectCapture
}: CaptureInboxProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Capture Inbox</h2>
          <p>{captures.length} recent capture(s)</p>
        </div>
        <Chrome size={20} />
      </div>
      <div className="selection-list">
        {captures.length === 0 ? (
          <p className="empty-copy">No captures yet. Use the extension to capture selected browser text.</p>
        ) : (
          captures.map((capture) => {
            const source = sources.find((item) => item.id === capture.sourceId);
            return (
              <button
                type="button"
                className={capture.id === selectedCaptureId ? "selection-row selected" : "selection-row"}
                key={capture.id}
                onClick={() => onSelectCapture(capture.id)}
              >
                <strong>{source?.kind === "browserTab" ? source.title : "Browser capture"}</strong>
                <span>{source?.kind === "browserTab" ? source.url : capture.sourceId}</span>
                <small>
                  {capture.captureType} - {capture.createdAt}
                </small>
                <p>{capture.text.slice(0, 220)}</p>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
