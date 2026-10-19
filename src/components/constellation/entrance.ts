import type { GraphNode, GraphEdge } from "../../types/repository";

// A pulse travels first, then ignites equal-priority destinations in close waves.
// All durations use the shared animation clock, including typed labels.
export const entrance = {
  playbackRate: 1.9,
  nodeBloom: 2.9,
  childBloom: 1.35,
  nodeIgnition: 1.12,
  edgeDraw: 2.1,
  pulseFade: 0.22,
  labelStart: 0.55,
  labelTyping: 1.6,
  childLabelStart: 0.1,
  childLabelTyping: 0.8,
};
// Send the next pulse once the core reaches full size, while its soft rim settles.
// This removes the idle beat without accelerating the incoming travel or bloom.
export function starReadyTime(isRoot: boolean, bloom = entrance.childBloom) {
  return 2 * (isRoot ? 1 : bloom / entrance.nodeBloom);
}

// Stable noise: hovering, filtering, or a React render must never reroll motion.
function variation(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function nodeMotion(id: string) {
  return {
    bloom: 1.14 + variation(`${id}:bloom`) * 0.22,
    lead: 1.05 + variation(`${id}:lead`) * 0.15,
    launchOffset: variation(`${id}:launch`) * 0.1,
    swell: 0.07 + variation(`${id}:swell`) * 0.08,
    rim: 0.26 + variation(`${id}:rim`) * 0.16,
  };
}
type NodeMotion = ReturnType<typeof nodeMotion>;

export function easeReveal(time: number, start: number, duration: number) {
  const t = Math.max(0, Math.min(1, (time - start) / duration));
  return t * t * (3 - 2 * t);
}

/** Breadth-first waves, shared across folders. Peers stay within a 132ms band,
 * with small organic differences instead of serializing individual branches.
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
  let previousPriority = "";
  let launch = 0;
  let ready = 0;
  const delays = sorted.map((node, index) => {
    const wave = `${depths.get(node.id)}:${priority[node.type]}:${node.importance ?? 0}`;
    // Hand off as the preceding cores finish growing, without waiting for their
    // settling animation. Destinations still ignite just past the midpoint.
    if (index > 0 && wave !== previousPriority) {
      launch = ready;
    }
    previousPriority = wave;
    const motion = nodeMotion(node.id);
    const isRoot = !node.parentId;
    const delay = isRoot ? launch : launch + motion.launchOffset + motion.lead;
    ready = Math.max(ready, delay + starReadyTime(isRoot, motion.bloom));
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
  const to = reverse ? edge.source : edge.target;
  const motion = nodeMotion(to);
  const contains = edge.type === "contains";
  return {
    from: reverse ? edge.target : edge.source,
    to,
    start: Math.max(
      0,
      Math.max(sourceDelay, targetDelay) +
        (contains
          ? -motion.lead
          : starReadyTime(false, motion.bloom) +
            variation(`${edge.id}:wait`) * 0.16),
    ),
    // The pulse and its destination share timing, so changing speed cannot leave
    // a completed line waiting for its star to appear.
    duration: contains
      ? motion.lead + starReadyTime(false, motion.bloom) + 0.04
      : 1.6 + variation(`${edge.id}:travel`) * 0.45,
    strength: 0.65 + variation(`${edge.id}:light`) * 0.3,
    tail: 0.08 + variation(`${edge.id}:tail`) * 0.08,
  };
}
export function entranceDuration(delays: Map<string, number>) {
  // Includes the final bloom and the last cross-file connection.
  return (
    Math.max(0, ...delays.values()) +
    Math.max(
      entrance.nodeBloom,
      starReadyTime(false, 1.36) + 0.16 + 2.05 + entrance.pulseFade,
    )
  );
}

// Quintic easing has zero velocity AND acceleration at both ends.
function smoothBloom(t: number) {
  const p = Math.max(0, Math.min(1, t));
  return p * p * p * (p * (p * 6 - 15) + 10);
}
export function starBloom(
  time: number,
  delay: number,
  isRoot = true,
  motion?: NodeMotion,
) {
  const age =
    (time - delay) *
    (isRoot ? 1 : entrance.nodeBloom / (motion?.bloom ?? entrance.childBloom));
  const grow = smoothBloom(age / 2);
  const settle = smoothBloom((age - 2) / (entrance.nodeBloom - 2));
  const shimmer = smoothBloom(age / 1.5) * (1 - settle);
  const swell = isRoot ? 0.12 : (motion?.swell ?? 0.12);
  const coreScale = Math.max(0.001, grow * (1 + swell * (1 - settle)));
  return {
    coreScale,
    // A close rim follows the star's size; no independently expanding halo.
    haloScale: coreScale * 1.65,
    light: smoothBloom(age / 1.6),
    haloLight:
      smoothBloom(age / 1.8) *
      (0.7 + shimmer * (isRoot ? 0.4 : (motion?.rim ?? 0.4))),
  };
}
export function connectionPulse(
  time: number,
  start: number,
  duration = entrance.edgeDraw,
) {
  return {
    progress: easeReveal(time, start, duration),
    light:
      easeReveal(time, start, 0.12) *
      (1 - easeReveal(time, start + duration, entrance.pulseFade)),
  };
}

/** Sparse, irregular meteor passes after formation. Two lanes cap the amount of
 * activity even on large repositories; each pass gets a new path and speed.
 */
export function ambientPulses(time: number, edgeCount: number) {
  if (time < 0 || edgeCount === 0) return [];
  const pulses = [];
  for (let lane = 0; lane < 2; lane++) {
    const local = time - lane * 2.3;
    if (local < 0) continue;
    const cycle = Math.floor(local / 4.6);
    const key = `ambient:${lane}:${cycle}`;
    const start = cycle * 4.6 + variation(`${key}:wait`) * 0.65;
    const duration = 1.5 + variation(`${key}:speed`) * 0.9;
    const pulse = connectionPulse(local, start, duration);
    if (pulse.light <= 0) continue;
    pulses.push({
      index: Math.floor(variation(`${key}:edge`) * edgeCount),
      progress: pulse.progress,
      light: pulse.light * (0.3 + variation(`${key}:light`) * 0.2),
      reverse: variation(`${key}:direction`) > 0.5,
    });
  }
  return pulses;
}
export type EntranceTimeline = { current: number };
