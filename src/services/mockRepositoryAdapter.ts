import { demoGraph, citation } from "../data/demoRepository";
import type { RepositoryAdapter } from "./repositoryAdapter";
const wait = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, 420);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
function assertDemo(id: string) {
  if (id !== demoGraph.repository.id)
    throw new Error(
      "Live repository analysis is not connected. Open the interactive demo.",
    );
}
export const mockRepositoryAdapter: RepositoryAdapter = {
  async getGraph(id, signal) {
    assertDemo(id);
    await wait(signal);
    return demoGraph;
  },
  async getSource(id, path, signal) {
    assertDemo(id);
    await wait(signal);
    return demoGraph.sources.find((f) => f.path === path) ?? null;
  },
  async getAnalysisStatus(id) {
    return {
      jobId: id,
      stage: "backend-pending",
      status: "pending",
      filesProcessed: 0,
    };
  },
  async askMentor(id, question, nodeId, signal) {
    assertDemo(id);
    await wait(signal);
    const q = question.toLowerCase();
    const entry = /entry|first|start/.test(q);
    const connections = /connect|related|import/.test(q);
    const toggle =
      /function|toggle|state/.test(q) || nodeId === "src/hooks/useTasks.ts";
    const contextual = nodeId === "src/App.tsx" || /module|app/.test(q);
    const supported = entry || connections || toggle || contextual;
    const citations = entry
      ? [citation("src/main.tsx", 1, 7)]
      : connections || contextual
        ? [citation("src/App.tsx", 1, 10)]
        : toggle
          ? [citation("src/hooks/useTasks.ts", 4, 11)]
          : [];
    const answer = entry
      ? "Start with src/main.tsx. It finds the root element, guards against a missing container, and mounts App. From there, follow App.tsx into the task list and its state hook."
      : connections || contextual
        ? "App.tsx brings the pieces together: it imports Header, TaskList, and useTasks. The hook provides tasks and toggleTask; App passes both into TaskList. These import connections are supported by the local sample source."
        : toggle
          ? "useTasks keeps tasks in React state. toggleTask maps over the current array, flips the matching task’s done flag, and preserves every other task. It returns the state and toggle function to its caller."
          : "This preview has a small set of prewritten answers. I don’t have evidence to answer that question. Try “What is the entry point?” or “How are these files connected?”";
    return {
      id: crypto.randomUUID(),
      answer,
      evidenceIds: citations.map((c) => c.evidenceId),
      citations,
      uncertain: !supported,
      status: "demo",
    };
  },
};
