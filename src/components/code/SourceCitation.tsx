import { FileCode2 } from "lucide-react";
import type { SourceCitation as Citation } from "../../types/repository";
import { useExperience } from "../../stores/experienceStore";
export function SourceCitation({ citation }: { citation: Citation }) {
  return (
    <button
      className="citation-chip"
      onClick={() => {
        useExperience.getState().select(citation.filePath);
        useExperience
          .getState()
          .open({ kind: "code", path: citation.filePath, citation });
      }}
      title={`${citation.repositoryId} · ${citation.commitSha} · ${citation.evidenceId}`}
    >
      <FileCode2 size={12} />
      {citation.filePath.split("/").at(-1)}
      <span>
        L{citation.startLine}–{citation.endLine}
      </span>
    </button>
  );
}
