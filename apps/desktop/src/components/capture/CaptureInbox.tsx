import { Chrome } from "lucide-react";
import type { Capture, SourceEndpoint } from "@agentbridge/core";

interface CaptureInboxProps {
  captures: Capture[];
  sources: SourceEndpoint[];
  selectedCaptureId?: string | undefined;
  onSelectCapture(id: string): void;
  onCreateDemoCapture?(): void;
}

export function CaptureInbox({
  captures,
  sources,
  selectedCaptureId,
  onSelectCapture,
  onCreateDemoCapture
}: CaptureInboxProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Capture Inbox</h2>
          <p>{captures.length} actionable capture(s)</p>
        </div>
        <Chrome size={20} />
      </div>
      <div className="selection-list">
        {captures.length === 0 ? (
          <div className="empty-state">
            <p className="empty-copy">Select text in Chrome and click AgentBridge capture.</p>
            <p className="empty-copy">Or use a mock capture for a demo-only task card.</p>
            {onCreateDemoCapture ? (
              <button type="button" className="secondary-button" onClick={onCreateDemoCapture}>
                Use mock capture for demo
              </button>
            ) : null}
          </div>
        ) : (
          captures.map((capture) => {
            const source = sources.find((item) => item.id === capture.sourceId);
            const sourceTitle = source?.kind === "browserTab" ? source.title || "Browser tab" : "Browser capture";
            const sourceUrl = source?.kind === "browserTab" ? source.url : capture.sourceId;
            const sourceDomain = source?.kind === "browserTab" ? domainForUrl(source.url) : "unknown source";
            const isDemo = capture.metadata["mode"] === "mock";
            return (
              <button
                type="button"
                className={capture.id === selectedCaptureId ? "selection-row selected" : "selection-row"}
                key={capture.id}
                onClick={() => onSelectCapture(capture.id)}
              >
                <strong>{sourceTitle}</strong>
                <span>{sourceDomain} - {sourceUrl}</span>
                <small>
                  {capture.captureType} - {capture.text.length} characters - {capture.createdAt}
                </small>
                {isDemo ? <span className="demo-badge">Demo-only capture</span> : null}
                <p>{capture.text.slice(0, 220)}</p>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function domainForUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}
