export type NodeType =
  "repository" | "directory" | "file" | "module" | "entry" | "symbol";
export type Relationship =
  "contains" | "imports" | "depends-on" | "calls" | "configuration";
export interface RepositoryIdentity {
  id: string;
  owner: string;
  name: string;
  githubUrl: string | null;
  commitSha: string;
  description: string;
  analysisStatus: "preview" | "pending" | "ready" | "error";
}
export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  path: string;
  parentId: string | null;
  summary: string;
  evidenceRefs: string[];
  importance?: number;
  technology?: string;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: Relationship;
  evidenceRefs: string[];
  verification: "demo" | "verified" | "unverified";
  confidence?: number;
}
export interface SourceFile {
  path: string;
  language: string;
  content: string;
  lineCount: number;
  commitSha: string;
}
export interface SourceCitation {
  repositoryId: string;
  commitSha: string;
  filePath: string;
  startLine: number;
  endLine: number;
  evidenceId: string;
}
export interface MentorResponse {
  id: string;
  answer: string;
  evidenceIds: string[];
  citations: SourceCitation[];
  uncertain: boolean;
  status: "demo" | "streaming" | "complete" | "error";
}
export interface AnalysisStatus {
  jobId: string;
  stage: string;
  status: "pending" | "running" | "complete" | "error";
  filesProcessed: number;
  totalFiles?: number;
  error?: { code: string; message: string };
}
export interface RepositoryGraph {
  repository: RepositoryIdentity;
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: SourceFile[];
}
export type Position = [number, number, number];
