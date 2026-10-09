import type {
  AnalysisStatus,
  MentorResponse,
  RepositoryGraph,
  SourceFile,
} from "../types/repository";
export interface RepositoryAdapter {
  getGraph(
    repositoryId: string,
    signal?: AbortSignal,
  ): Promise<RepositoryGraph>;
  getSource(
    repositoryId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<SourceFile | null>;
  askMentor(
    repositoryId: string,
    question: string,
    nodeId?: string,
    signal?: AbortSignal,
  ): Promise<MentorResponse>;
  getAnalysisStatus(
    repositoryId: string,
    signal?: AbortSignal,
  ): Promise<AnalysisStatus>;
}
// A REST adapter can implement this contract without changing the graph or panels.
// Future streaming transports may expose this additional interface.
export interface StreamingMentorAdapter {
  streamAnswer(
    repositoryId: string,
    question: string,
    signal?: AbortSignal,
  ): AsyncIterable<Partial<MentorResponse>>;
}
