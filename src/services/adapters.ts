import { mockRepositoryAdapter } from "./mockRepositoryAdapter";
import { liveRepositoryAdapter } from "./liveRepositoryAdapter";
import type { RepositoryGraph } from "../types/repository";
export const isDemo = (graph: RepositoryGraph) =>
  graph.repository.analysisStatus === "preview";
export const adapterFor = (graph: RepositoryGraph) =>
  isDemo(graph) ? mockRepositoryAdapter : liveRepositoryAdapter;
