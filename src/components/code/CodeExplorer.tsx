import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  Decoration,
} from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Copy, Check, FileCode2 } from "lucide-react";
import type { RepositoryGraph, SourceCitation } from "../../types/repository";
import { Panel } from "../shared/Panel";
import { IconButton } from "../shared/IconButton";
const monochrome = HighlightStyle.define([
  { tag: tags.keyword, color: "#c8c8c8" },
  { tag: tags.string, color: "#a4aca7" },
  { tag: tags.comment, color: "#676767", fontStyle: "italic" },
  { tag: tags.function(tags.variableName), color: "#f3f3f3" },
  { tag: tags.typeName, color: "#bbb" },
  { tag: tags.number, color: "#d5d5d5" },
  { tag: tags.tagName, color: "#ddd" },
]);
export default function CodeExplorer({
  graph,
  path,
  citation,
}: {
  graph: RepositoryGraph;
  path: string;
  citation?: SourceCitation;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const source = graph.sources.find((f) => f.path === path);
  const validCitation =
    citation &&
    citation.repositoryId === graph.repository.id &&
    citation.commitSha === source?.commitSha &&
    citation.filePath === path &&
    citation.startLine >= 1 &&
    citation.endLine <= source.lineCount
      ? citation
      : undefined;
  useEffect(() => {
    if (!ref.current || !source) return;
    const state = EditorState.create({
      doc: source.content.trimEnd(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        javascript({ jsx: true, typescript: true }),
        syntaxHighlighting(monochrome),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({
          "aria-label": `Source code for ${path}`,
        }),
        EditorView.theme(
          {
            "&": {
              fontSize: "13px",
              backgroundColor: "transparent",
              color: "#c8c8c8",
            },
            ".cm-scroller": {
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: "1.9",
              overflow: "auto",
            },
            ".cm-content": { padding: "22px 0" },
            ".cm-gutters": {
              backgroundColor: "transparent",
              border: "none",
              color: "#555",
              padding: "22px 8px 0 14px",
            },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
            ".cm-line": { padding: "0 24px 0 8px" },
            ".cm-citation": {
              backgroundColor: "#ffffff0d",
              borderLeft: "2px solid #ddd",
            },
            "&.cm-focused": { outline: "none" },
          },
          { dark: true },
        ),
      ],
    });
    const decorations = validCitation
      ? Decoration.set(
          Array.from(
            { length: validCitation.endLine - validCitation.startLine + 1 },
            (_, i) =>
              Decoration.line({ class: "cm-citation" }).range(
                state.doc.line(validCitation.startLine + i).from,
              ),
          ),
        )
      : Decoration.none;
    const view = new EditorView({ state, parent: ref.current });
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.decorations.of(decorations),
      ),
    });
    if (validCitation)
      view.dispatch({
        effects: EditorView.scrollIntoView(
          view.state.doc.line(validCitation.startLine).from,
          { y: "center" },
        ),
      });
    return () => view.destroy();
  }, [source, path, validCitation?.startLine, validCitation?.endLine]);
  const copy = async (what: "path" | "code") => {
    try {
      await navigator.clipboard.writeText(
        what === "path" ? path : (source?.content ?? ""),
      );
      setCopied(what);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <Panel
      title={path.split("/").at(-1) ?? "Source explorer"}
      subtitle="Read-only · local demo source"
      className="code-panel"
    >
      <div className="code-toolbar">
        <span>
          <FileCode2 size={14} />
          {path}
        </span>
        <div>
          <IconButton label="Copy file path" onClick={() => void copy("path")}>
            {copied === "path" ? <Check size={15} /> : <Copy size={15} />}
          </IconButton>
          <button
            disabled={!source}
            className="small-button"
            onClick={() => void copy("code")}
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>
      </div>
      {copyError && (
        <p role="status" className="copy-feedback">
          Clipboard unavailable. Select the source text to copy it.
        </p>
      )}
      {validCitation && (
        <div className="citation-banner">
          Source evidence · lines {validCitation.startLine}–
          {validCitation.endLine}
        </div>
      )}
      {source ? (
        <div className="code-content" ref={ref} />
      ) : (
        <div className="empty-state">
          <FileCode2 size={28} />
          <h3>Source not included</h3>
          <p>
            This is a structural preview node. Source retrieval will be
            available through the repository adapter.
          </p>
        </div>
      )}
      <footer className="code-footer">
        <span>
          {source?.language ?? "No source"}
          {source ? ` · ${source.lineCount} lines` : ""}
        </span>
        <span>
          demo / constellation-app · {graph.repository.commitSha.slice(0, 7)}
        </span>
      </footer>
    </Panel>
  );
}
import { StateEffect } from "@codemirror/state";
