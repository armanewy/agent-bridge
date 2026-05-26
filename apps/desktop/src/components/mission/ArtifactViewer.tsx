import { Clipboard, FileText } from "lucide-react";
import type { Artifact } from "@agentbridge/core";

interface ArtifactViewerProps {
  artifact?: Artifact | undefined;
}

export function ArtifactViewer({ artifact }: ArtifactViewerProps): JSX.Element {
  if (!artifact) {
    return (
      <div className="artifact-viewer empty">
        <FileText size={18} />
        <p>Select an artifact to inspect its contents.</p>
      </div>
    );
  }

  return (
    <div className="artifact-viewer">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">{artifact.kind}</span>
          <h3>{artifact.title}</h3>
          <p>{artifact.createdAt}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={!artifact.content}
          onClick={() => {
            if (artifact.content) {
              void navigator.clipboard?.writeText(artifact.content);
            }
          }}
        >
          <Clipboard size={15} />
          Copy
        </button>
      </div>
      <div className="artifact-metadata">
        <span className="eyebrow">Metadata</span>
        <pre>{JSON.stringify(artifact.metadata, null, 2)}</pre>
      </div>
      <div>
        <span className="eyebrow">Content</span>
        <pre>{artifact.content ?? artifact.filePath ?? "No inline content stored."}</pre>
      </div>
    </div>
  );
}
