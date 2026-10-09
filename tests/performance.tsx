import { createRoot } from "react-dom/client";
import { useEffect, useMemo } from "react";
import ConstellationCanvas from "../src/components/constellation/ConstellationCanvas";
import { useExperience } from "../src/stores/experienceStore";
import type { GraphNode, GraphEdge } from "../src/types/repository";
import "../src/styles/globals.css";
const count = Math.min(
  600,
  Math.max(30, Number(new URLSearchParams(location.search).get("count")) || 30),
);
function Harness() {
  const nodes = useMemo<GraphNode[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: `fixture-${i}`,
        label: `Fixture ${i}`,
        path: `/synthetic/${i}`,
        type: i === 0 ? "repository" : i < 9 ? "module" : "file",
        parentId:
          i === 0 ? null : i < 9 ? "fixture-0" : `fixture-${(i % 8) + 1}`,
        summary: "Synthetic rendering fixture. Not repository data.",
        evidenceRefs: [],
      })),
    [],
  );
  const edges = useMemo<GraphEdge[]>(
    () =>
      nodes
        .filter((n) => n.parentId)
        .map((n) => ({
          id: `edge-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: "contains",
          evidenceRefs: [],
          verification: "demo",
        })),
    [nodes],
  );
  useEffect(() => {
    document.body.dataset.nodeCount = String(count);
    useExperience.getState().setAutoRotate(false);
  }, []);
  return (
    <main className="explore-page">
      <ConstellationCanvas nodes={nodes} edges={edges} />
      <p style={{ position: "absolute", top: 10, left: 10, fontSize: 12 }}>
        Synthetic test fixture · {count} nodes
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
