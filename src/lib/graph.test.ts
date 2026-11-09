import { describe, it, expect } from "vitest";
import { demoGraph } from "../data/demoRepository";
import { sphericalLayout } from "./sphericalLayout";
import { filterGraph, defaultFilter, searchNodes } from "./graphUtils";
import type { GraphNode } from "../types/repository";
import { mockRepositoryAdapter } from "../services/mockRepositoryAdapter";
describe("Preview data and graph", () => {
  it("has meaningful edges with valid endpoints", () => {
    const ids = new Set(demoGraph.nodes.map((n) => n.id));
    expect(ids.size).toBe(demoGraph.nodes.length);
    expect(ids.size).toBeGreaterThanOrEqual(30);
    for (const e of demoGraph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      if (e.type === "imports")
        expect(demoGraph.sources.some((s) => s.path === e.source)).toBe(true);
    }
  });
  it("is stable even when input order changes", () => {
    const first = sphericalLayout(demoGraph.nodes);
    const second = sphericalLayout([...demoGraph.nodes].reverse());
    for (const [id, point] of first) expect(second.get(id)).toEqual(point);
  });
  it.each([30, 100, 300, 600])(
    "positions %i nodes with finite deterministic coordinates",
    (count) => {
      const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        label: `File ${i}`,
        type: i === 0 ? "repository" : i < 9 ? "module" : "file",
        path: `/${i}`,
        parentId: i === 0 ? null : i < 9 ? "n0" : `n${(i % 8) + 1}`,
        summary: "Synthetic performance fixture",
        evidenceRefs: [],
      }));
      const start = performance.now();
      const layout = sphericalLayout(nodes);
      expect(layout.size).toBe(count);
      expect([...layout.values()].flat().every(Number.isFinite)).toBe(true);
      expect([...layout]).toEqual([...sphericalLayout(nodes)]);
      expect(performance.now() - start).toBeLessThan(250);
    },
  );
  it("filters endpoints along with node and relationship types", () => {
    const filtered = filterGraph(demoGraph, {
      ...defaultFilter,
      nodes: "source",
      edges: "imports",
    });
    expect(filtered.nodes).toHaveLength(7);
    expect(filtered.edges).toHaveLength(7);
    expect(
      filtered.edges.every(
        (e) =>
          filtered.nodes.some((n) => n.id === e.source) &&
          filtered.nodes.some((n) => n.id === e.target),
      ),
    ).toBe(true);
  });
  it("searches names and paths and handles empty results", () => {
    expect(searchNodes(demoGraph.nodes, "USEtasks")[0].path).toBe(
      "src/hooks/useTasks.ts",
    );
    expect(searchNodes(demoGraph.nodes, "does-not-exist")).toEqual([]);
  });
  it("has valid citations into actual local source", async () => {
    for (const question of [
      "What is the entry point?",
      "How are these files connected?",
      "What does this function do?",
    ]) {
      const answer = await mockRepositoryAdapter.askMentor(
        demoGraph.repository.id,
        question,
      );
      expect(answer.status).toBe("demo");
      for (const c of answer.citations) {
        const file = demoGraph.sources.find((s) => s.path === c.filePath)!;
        expect(file).toBeDefined();
        expect(c.startLine).toBeGreaterThan(0);
        expect(c.endLine).toBeLessThanOrEqual(file.lineCount);
        expect(c.commitSha).toBe(file.commitSha);
      }
    }
  });
  it("does not invent real repository data", async () => {
    await expect(
      mockRepositoryAdapter.getGraph("facebook/react"),
    ).rejects.toThrow("not connected");
    const response = await mockRepositoryAdapter.askMentor(
      demoGraph.repository.id,
      "Who invented quantum gravity?",
    );
    expect(response.uncertain).toBe(true);
    expect(response.citations).toHaveLength(0);
  });
  it("cancels pending work", async () => {
    const controller = new AbortController();
    const promise = mockRepositoryAdapter.getGraph(
      demoGraph.repository.id,
      controller.signal,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("keeps deeply nested and orphaned nodes stable when data order changes", () => {
  const nodes: GraphNode[] = Array.from({ length: 6 }, (_, i) => ({
    id: `deep-${i}`,
    label: `Level ${i}`,
    path: `/level/${i}`,
    type: "directory",
    parentId: i === 0 ? null : `deep-${i - 1}`,
    summary: "",
    evidenceRefs: [],
  }));
  nodes.push({ ...nodes[0], id: "orphan", parentId: "missing" });
  const first = sphericalLayout(nodes);
  const reversed = sphericalLayout([...nodes].reverse());
  for (const [id, point] of first) expect(reversed.get(id)).toEqual(point);
});
