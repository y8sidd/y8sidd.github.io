import { useEffect, useMemo, useState } from "react";
import {
  Search,
  FileCode2,
  Box,
  CornerDownLeft,
  MessageCircle,
  RotateCcw,
  Home,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { RepositoryGraph } from "../../types/repository";
import { searchNodes } from "../../lib/graphUtils";
import { useExperience } from "../../stores/experienceStore";
import { Panel } from "../shared/Panel";
export default function CommandPalette({
  graph,
  list = false,
}: {
  graph: RepositoryGraph;
  list?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const select = useExperience((s) => s.select);
  const close = useExperience((s) => s.close);
  const open = useExperience((s) => s.open);
  const setFilter = useExperience((s) => s.setFilter);
  const navigate = useNavigate();
  const results = useMemo(
    () => searchNodes(graph.nodes, query),
    [graph.nodes, query],
  );
  const commands = [
    {
      label: "Open AI Mentor",
      icon: MessageCircle,
      action: () => open({ kind: "mentor" }),
    },
    {
      label: "Reset graph",
      icon: RotateCcw,
      action: () => {
        useExperience.getState().moveCamera("reset");
        close();
      },
    },
    { label: "Return to the void", icon: Home, action: () => navigate("/") },
  ].filter(
    (c) => !query || c.label.toLowerCase().includes(query.toLowerCase()),
  );
  const count = results.length + commands.length;
  useEffect(() => {
    setFilter({ query });
    return () => setFilter({ query: "" });
  }, [query, setFilter]);
  useEffect(() => {
    document
      .getElementById(`search-result-${index}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const choose = (i: number) => {
    if (i < results.length) {
      useExperience.getState().setFilter({ nodes: "all" });
      select(results[i].id);
      close();
    } else commands[i - results.length]?.action();
  };
  return (
    <Panel
      title={list ? "Node navigator" : "Find your way"}
      subtitle={`${graph.nodes.length} nodes in demo / constellation-app`}
      className="search-panel"
    >
      <div className="search-input">
        <Search size={17} />
        <input
          autoFocus
          aria-label="Search nodes and commands"
          placeholder="Search files, paths, or commands…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={count ? `search-result-${index}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + Math.max(count, 1)) %
                  Math.max(count, 1),
              );
            }
            if (e.key === "Enter" && count) {
              e.preventDefault();
              choose(index);
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div
        className="search-results"
        id="search-results"
        role="listbox"
        aria-label="Files and commands"
      >
        {results.length > 0 && (
          <p className="result-heading">REPOSITORY NODES</p>
        )}
        {results.map((n, i) => (
          <button
            tabIndex={-1}
            role="option"
            aria-selected={index === i}
            id={`search-result-${i}`}
            key={n.id}
            onClick={() => choose(i)}
            className={`search-result ${index === i ? "active" : ""}`}
          >
            {n.type === "file" || n.type === "entry" ? (
              <FileCode2 size={16} />
            ) : (
              <Box size={16} />
            )}
            <span>
              <strong>{n.label}</strong>
              <small>{n.path}</small>
            </span>
            <span className="result-type">{n.type}</span>
          </button>
        ))}
        {commands.length > 0 && <p className="result-heading">COMMANDS</p>}
        {commands.map((c, i) => (
          <button
            tabIndex={-1}
            role="option"
            aria-selected={index === i + results.length}
            id={`search-result-${i + results.length}`}
            key={c.label}
            className={`search-result ${index === i + results.length ? "active" : ""}`}
            onClick={c.action}
          >
            <c.icon size={16} />
            <span>{c.label}</span>
          </button>
        ))}
        {!count && (
          <div className="empty-state">
            <Search size={24} />
            <h3>No matching nodes</h3>
            <p>Try a filename such as App.tsx or a folder such as hooks.</p>
          </div>
        )}
      </div>
      <footer className="search-footer">
        <span>↑ ↓ navigate</span>
        <span>
          <CornerDownLeft size={12} /> select
        </span>
        <span>esc close</span>
      </footer>
    </Panel>
  );
}
