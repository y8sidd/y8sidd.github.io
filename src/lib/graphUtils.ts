import type {
  GraphNode,
  RepositoryGraph,
  Relationship,
} from "../types/repository";
export type GraphFilter = {
  nodes: "all" | "structure" | "source";
  edges: "all" | Relationship;
  query: string;
};
export const defaultFilter: GraphFilter = {
  nodes: "all",
  edges: "all",
  query: "",
};
export function filterGraph(
  graph: RepositoryGraph,
  filter: GraphFilter,
  expandedId?: string | null,
) {
  const eligible = graph.nodes.filter(
    (n) =>
      filter.nodes === "all" ||
      (filter.nodes === "structure"
        ? ["repository", "module", "directory"].includes(n.type)
        : n.evidenceRefs.length > 0),
  );
  const parent = graph.nodes.find((n) => n.id === expandedId)?.parentId;
  const nodes =
    eligible.length > 300
      ? eligible.filter(
          (n) =>
            ["repository", "module", "directory", "entry"].includes(n.type) ||
            n.id === expandedId ||
            n.parentId === expandedId ||
            n.parentId === parent,
        )
      : eligible;
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: graph.edges.filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        (filter.edges === "all" || e.type === filter.edges),
    ),
  };
}
export function searchNodes(nodes: GraphNode[], query: string) {
  const q = query.toLowerCase().trim();
  return nodes.filter((n) => `${n.label} ${n.path}`.toLowerCase().includes(q));
}
export function connectedIds(
  graph: Pick<RepositoryGraph, "edges">,
  id: string | null,
) {
  const ids = new Set<string>();
  if (id) {
    ids.add(id);
    graph.edges.forEach((e) => {
      if (e.source === id) ids.add(e.target);
      if (e.target === id) ids.add(e.source);
    });
  }
  return ids;
}
