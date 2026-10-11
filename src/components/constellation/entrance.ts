import type { GraphNode, GraphEdge } from "../../types/repository";

// Core-outward formation: 1.9x playback finishes the demo in about 9.3 seconds.
// All durations use the shared animation clock, including typed labels.
export const entrance = {
  playbackRate: 1.9,
  nodeBloom: 2.9,
  tierPause: 2.2,
  branchStagger: 0.48,
  fileStagger: 0.21,
  edgeDraw: 2,
  labelStart: 0.55,
  labelTyping: 1.6,
};
export function easeReveal(time: number, start: number, duration: number) {
  const t = Math.max(0, Math.min(1, (time - start) / duration));
  return t * t * (3 - 2 * t);
}

/** Breadth-first reveal: parents, structural siblings, then their contents.
 * Importance breaks ties within each tier, independent of the layout's order.
 */
export function nodeEntranceDelays(nodes: GraphNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  const depthOf = (node: GraphNode, visiting = new Set<string>()): number => {
    const known = depths.get(node.id);
    if (known !== undefined) return known;
    if (visiting.has(node.id)) return 0;
    visiting.add(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const depth = parent ? depthOf(parent, visiting) + 1 : 0;
    depths.set(node.id, depth);
    return depth;
  };
  // Resolve in a stable order, including malformed/cyclic input.
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((node) => depthOf(node));
  const priority = {
    repository: 0,
    module: 1,
    directory: 1,
    entry: 2,
    file: 3,
    symbol: 4,
  };
  sorted.sort(
    (a, b) =>
      depths.get(a.id)! - depths.get(b.id)! ||
      priority[a.type] - priority[b.type] ||
      (b.importance ?? 0) - (a.importance ?? 0) ||
      a.id.localeCompare(b.id),
  );
  let previousDepth = 0;
  let delay = 0;
  const delays = sorted.map((node, index) => {
    const depth = depths.get(node.id)!;
    if (index > 0) {
      delay +=
        depth > previousDepth
          ? entrance.tierPause
          : node.type === "module" ||
              node.type === "directory" ||
              node.type === "repository"
            ? entrance.branchStagger
            : entrance.fileStagger;
    }
    previousDepth = depth;
    return [node.id, delay] as const;
  });
  return new Map(delays);
}

/** Draw visually from the earlier/higher-priority node without changing the
 * underlying relationship direction used by the inspector and repository data.
 */
export function edgeEntrance(edge: GraphEdge, delays: Map<string, number>) {
  const sourceDelay = delays.get(edge.source) ?? 0;
  const targetDelay = delays.get(edge.target) ?? 0;
  const reverse = sourceDelay > targetDelay;
  return {
    from: reverse ? edge.target : edge.source,
    to: reverse ? edge.source : edge.target,
    start:
      Math.max(sourceDelay, targetDelay) +
      (edge.type === "contains" ? 0.45 : 1),
  };
}
export function entranceDuration(delays: Map<string, number>) {
  // Includes the final bloom and the last cross-file connection.
  return (
    Math.max(0, ...delays.values()) +
    Math.max(entrance.nodeBloom, 1 + entrance.edgeDraw)
  );
}

// Quintic easing has zero velocity AND acceleration at both ends.
function smoothBloom(t: number) {
  const p = Math.max(0, Math.min(1, t));
  return p * p * p * (p * (p * 6 - 15) + 10);
}
export function starBloom(time: number, delay: number) {
  const age = time - delay;
  const grow = smoothBloom(age / 2);
  const settle = smoothBloom((age - 2) / (entrance.nodeBloom - 2));
  const shimmer = smoothBloom(age / 1.5) * (1 - settle);
  const coreScale = Math.max(0.001, grow * (1.12 - 0.12 * settle));
  return {
    coreScale,
    // A close rim follows the star's size; no independently expanding halo.
    haloScale: coreScale * 1.65,
    light: smoothBloom(age / 1.6),
    haloLight: smoothBloom(age / 1.8) * (0.7 + shimmer * 0.4),
  };
}
export type EntranceTimeline = { current: number };
