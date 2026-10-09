import type { GraphNode, Position } from "../types/repository";
function sphere(index: number, total: number, radius: number): Position {
  const y = 1 - ((index + 0.5) / total) * 2;
  const r = Math.sqrt(1 - y * y);
  const a = index * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius];
}
export function sphericalLayout(nodes: GraphNode[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  const roots = nodes.filter((n) => !n.parentId);
  roots.forEach((n) => positions.set(n.id, [0, 0, 0]));
  const groups = nodes
    .filter((n) => roots.some((r) => r.id === n.parentId))
    .sort((a, b) => a.id.localeCompare(b.id));
  groups.forEach((group, i) => {
    const center = sphere(i, groups.length, 3.05);
    positions.set(group.id, center);
    const children = nodes
      .filter((n) => n.parentId === group.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    children.forEach((n, j) => {
      const offset = sphere(j, children.length, 1.1);
      positions.set(n.id, [
        center[0] + offset[0],
        center[1] + offset[1],
        center[2] + offset[2],
      ]);
    });
  });
  nodes.forEach((n, i) => {
    if (!positions.has(n.id)) positions.set(n.id, sphere(i, nodes.length, 4));
  });
  return positions;
}
