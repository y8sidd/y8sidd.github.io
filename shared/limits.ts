export const LIMITS = {
  files: 250,
  nodes: 300,
  edges: 600,
  repositoryBytes: 10 * 1024 * 1024,
  treeResponseBytes: 512 * 1024,
  sourceBytes: 128 * 1024,
  sourceLines: 5000,
  cachedSources: 6,
  importsPerFile: 40,
  sessionIdleMs: 15 * 60 * 1000,
  sessionMaxMs: 60 * 60 * 1000,
  questionChars: 1500,
  questionsPerSession: 20,
  contextFiles: 3,
  contextChars: 18000,
  responseBytes: 128 * 1024,
} as const;
export const REPOSITORY_LIMIT_MESSAGE =
  "RepoMentor is designed for smaller public repositories: up to 250 files, 300 nodes and 10 MB of files. Please choose a smaller repository.";
