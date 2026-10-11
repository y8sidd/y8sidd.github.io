import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { FileCode2, Box, X, Code2, MessageCircle, Link2 } from "lucide-react";
import type { RepositoryGraph } from "../../types/repository";
import { useExperience } from "../../stores/experienceStore";
import { IconButton } from "../shared/IconButton";
export default function NodeInspector({ graph }: { graph: RepositoryGraph }) {
  const id = useExperience((s) => s.selected);
  const select = useExperience((s) => s.select);
  const open = useExperience((s) => s.open);
  const heading = useRef<HTMLHeadingElement>(null);
  const node = graph.nodes.find((n) => n.id === id);
  useEffect(() => {
    heading.current?.focus();
  }, [id]);
  if (!node) return null;
  const connections = graph.edges.filter(
    (e) => e.source === id || e.target === id,
  );
  return (
    <motion.aside
      className="inspector glass"
      aria-label="Node inspector"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
    >
      <div className="inspector-top">
        <span className="eyebrow">
          {node.type === "file" || node.type === "entry" ? (
            <FileCode2 size={15} />
          ) : (
            <Box size={15} />
          )}{" "}
          {node.type.toUpperCase()}
        </span>
        <IconButton
          label="Close inspector"
          onClick={() => {
            select(null);
            document
              .querySelector<HTMLButtonElement>('[aria-label="Node navigator"]')
              ?.focus();
          }}
        >
          <X size={16} />
        </IconButton>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {node.label}
      </h2>
      <p className="node-path">{node.path}</p>
      <div className="inspector-divider" />
      <span className="eyebrow">OVERVIEW</span>
      <p className="node-summary">{node.summary}</p>
      <div className="node-tags">
        <span>{node.technology}</span>
        <span>Demo content</span>
      </div>
      <div className="evidence-line">
        <span className="evidence-dot" />
        {node.evidenceRefs.length
          ? "Local source evidence available"
          : "Structure only · source not included"}
      </div>
      <div className="inspector-actions">
        <button
          className="primary-button"
          onClick={() => open({ kind: "code", path: node.path })}
        >
          <Code2 size={15} />
          View code
        </button>
        <button
          className="primary-button"
          onClick={() => open({ kind: "mentor" })}
        >
          <MessageCircle size={15} />
          Ask AI
        </button>
      </div>
      <div className="connections-header">
        <span className="eyebrow">CONNECTIONS</span>
        <span>{connections.length.toString().padStart(2, "0")}</span>
      </div>
      <div className="connections-list">
        {connections.map((edge) => {
          const out = edge.source === id;
          const target = graph.nodes.find(
            (n) => n.id === (out ? edge.target : edge.source),
          )!;
          const label =
            edge.type === "contains"
              ? out
                ? "Contains"
                : "Contained in"
              : edge.type === "imports"
                ? out
                  ? "Imports"
                  : "Imported by"
                : edge.type;
          return (
            <button
              key={edge.id}
              className="connection"
              onClick={() => select(target.id)}
            >
              <Link2 size={13} />
              <span>
                <small>{label}</small>
                <strong>{target.label}</strong>
              </span>
              <span className="connection-type">{target.type}</span>
            </button>
          );
        })}
      </div>
      <footer className="inspector-foot">
        LOCAL PREVIEW <span>·</span> {graph.repository.commitSha.slice(0, 7)}
      </footer>
    </motion.aside>
  );
}
