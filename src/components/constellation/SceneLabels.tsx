import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { GraphNode, Position } from "../../types/repository";
import { useExperience } from "../../stores/experienceStore";
export function SceneLabels({
  nodes,
  positions,
}: {
  nodes: GraphNode[];
  positions: Map<string, Position>;
}) {
  const labelNodes = useMemo(
    () =>
      nodes.filter((n) => ["module", "repository", "entry"].includes(n.type)),
    [nodes],
  );
  const { size } = useThree();
  const vector = useRef(new Vector3());
  useFrame(({ camera }) => {
    const state = useExperience.getState();
    const placed: { x: number; y: number; width: number }[] = [];
    for (const node of labelNodes) {
      const el = document.getElementById(`label-${node.id}`);
      if (!el) continue;
      const p = positions.get(node.id);
      if (!p) continue;
      vector.current.set(...p).project(camera);
      el.style.transform = `translate(-50%, 18px) translate(${(vector.current.x * 0.5 + 0.5) * size.width}px,${(-vector.current.y * 0.5 + 0.5) * size.height}px)`;
      const x = (vector.current.x * 0.5 + 0.5) * size.width;
      const y = (-vector.current.y * 0.5 + 0.5) * size.height;
      const width = node.label.length * 6;
      const overlaps = placed.some(
        (other) =>
          Math.abs(x - other.x) < (width + other.width) / 2 + 6 &&
          Math.abs(y - other.y) < 20,
      );
      el.style.visibility =
        vector.current.z > 1 || overlaps ? "hidden" : "visible";
      if (!overlaps) placed.push({ x, y, width });
      el.style.opacity =
        state.selected && state.selected !== node.id ? ".35" : "1";
    }
    const tooltip = document.getElementById("node-hover-label");
    const p = state.hovered ? positions.get(state.hovered) : undefined;
    if (tooltip && p) {
      vector.current.set(...p).project(camera);
      tooltip.style.transform = `translate(-50%, -100%) translate(${(vector.current.x * 0.5 + 0.5) * size.width}px,${(-vector.current.y * 0.5 + 0.5) * size.height - 22}px)`;
    }
  });
  return null;
}
