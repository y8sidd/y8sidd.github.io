import { Panel } from "../shared/Panel";
import { useExperience } from "../../stores/experienceStore";
import type { GraphFilter } from "../../lib/graphUtils";
export function HelpPanel() {
  return (
    <Panel
      title="A few ways to explore"
      subtitle="Find a starting point. Follow the connections."
      className="utility-panel"
    >
      <div className="help-rows">
        {[
          ["Rotate the constellation", "Drag"],
          ["Move closer or further", "Scroll / pinch"],
          ["Inspect a file or module", "Select a star"],
          ["Find a file or command", "⌘ / Ctrl + K"],
          ["Open AI Mentor", "M"],
          ["Return to the graph", "Esc"],
        ].map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <kbd>{b}</kbd>
          </div>
        ))}
      </div>
      <p className="utility-note">
        Prefer a keyboard? The node navigator offers searchable access to every
        node. Imports in this demo are backed by local sample files; containment
        describes the preview hierarchy.
      </p>
    </Panel>
  );
}
export function SettingsPanel() {
  const auto = useExperience((s) => s.autoRotate);
  const detail = useExperience((s) => s.reducedDetail);
  return (
    <Panel
      title="Your space"
      subtitle="Preferences apply to this session."
      className="utility-panel"
    >
      <label className="setting-row">
        <span>
          <strong>Slow orbit</strong>
          <small>Stops while you interact or inspect a node.</small>
        </span>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) =>
            useExperience.getState().setAutoRotate(e.target.checked)
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>Reduced detail</strong>
          <small>Lower resolution for lighter rendering.</small>
        </span>
        <input
          type="checkbox"
          checked={detail}
          onChange={(e) =>
            useExperience.getState().setReducedDetail(e.target.checked)
          }
        />
      </label>
      <p className="utility-note">
        Your system’s reduced-motion preference is respected. On smaller
        screens, rendering detail is reduced automatically.
      </p>
    </Panel>
  );
}
export function FilterPanel() {
  const filter = useExperience((s) => s.filter);
  const set = useExperience((s) => s.setFilter);
  return (
    <Panel
      title="Shape the constellation"
      subtitle="Show the relationships you want to follow."
      className="utility-panel"
    >
      <label className="select-label">
        Nodes
        <select
          aria-label="Node type filter"
          value={filter.nodes}
          onChange={(e) => {
            set({ nodes: e.target.value as GraphFilter["nodes"] });
            useExperience.getState().select(null);
          }}
        >
          <option value="all">All nodes</option>
          <option value="structure">Modules and repository</option>
          <option value="source">Files with source evidence</option>
        </select>
      </label>
      <label className="select-label">
        Relationships
        <select
          aria-label="Relationship filter"
          value={filter.edges}
          onChange={(e) =>
            set({ edges: e.target.value as GraphFilter["edges"] })
          }
        >
          <option value="all">All relationships</option>
          <option value="contains">Contains</option>
          <option value="imports">Imports</option>
        </select>
      </label>
      <button
        className="text-button"
        onClick={() => set({ nodes: "all", edges: "all" })}
      >
        Reset filters
      </button>
      <p className="utility-note">
        Only relationships with both endpoints visible are drawn. All data
        belongs to the local preview.
      </p>
    </Panel>
  );
}
