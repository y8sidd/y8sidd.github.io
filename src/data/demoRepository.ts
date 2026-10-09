import type {
  GraphNode,
  RepositoryGraph,
  SourceCitation,
} from "../types/repository";
const rawSources = import.meta.glob("../../demo-source/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
export const DEMO_SHA = "d3e0c0de1234567890abcdef1234567890abcdef12";
const groups: [string, string, string[]][] = [
  ["app", "Application", ["main.tsx", "App.tsx", "router.tsx", "config.ts"]],
  [
    "components",
    "Components",
    [
      "Header.tsx",
      "TaskList.tsx",
      "TaskItem.tsx",
      "EmptyState.tsx",
      "Button.tsx",
      "Footer.tsx",
    ],
  ],
  [
    "hooks",
    "Hooks",
    ["useTasks.ts", "useStorage.ts", "useTheme.ts", "useKeyboard.ts"],
  ],
  [
    "services",
    "Services",
    ["taskService.ts", "storage.ts", "client.ts", "index.ts"],
  ],
  ["utils", "Utilities", ["format.ts", "validate.ts", "id.ts", "sort.ts"]],
  ["types", "Types", ["task.ts", "theme.ts", "api.ts", "index.ts"]],
  ["data", "Data", ["tasks.ts", "defaults.ts", "fixtures.ts", "index.ts"]],
  [
    "styles",
    "Styles",
    ["globals.css", "tokens.css", "reset.css", "animations.css"],
  ],
];
const nodes: GraphNode[] = [
  {
    id: "root",
    label: "constellation-app",
    type: "repository",
    path: "/",
    parentId: null,
    summary:
      "A small task app designed to demonstrate repository exploration. All structure and source evidence belong to this local preview.",
    evidenceRefs: [],
    importance: 1,
    technology: "React · TypeScript",
  },
];
groups.forEach(([id, label, files]) => {
  nodes.push({
    id,
    label,
    type: "module",
    path: id === "app" ? "src" : `src/${id}`,
    parentId: "root",
    summary: `The ${label.toLowerCase()} region of the demo repository. Select a connected file to inspect its role.`,
    evidenceRefs: [],
    importance: 0.8,
    technology: id === "styles" ? "CSS" : "TypeScript",
  });
  files.forEach((file) => {
    const path = id === "app" ? `src/${file}` : `src/${id}/${file}`;
    nodes.push({
      id: path,
      label: file,
      type: file === "main.tsx" ? "entry" : "file",
      path,
      parentId: id,
      summary: description(path),
      evidenceRefs: rawSources[`../../demo-source/${path}`]
        ? [`source:${path}`]
        : [],
      importance: file === "main.tsx" ? 0.9 : file === "App.tsx" ? 0.75 : 0.25,
      technology: file.endsWith(".css")
        ? "CSS"
        : file.endsWith(".tsx")
          ? "React · TypeScript"
          : "TypeScript",
    });
  });
});
function description(path: string) {
  const summaries: Record<string, string> = {
    "src/main.tsx":
      "The application entry point. Locates the root element and mounts the React application.",
    "src/App.tsx":
      "Composes the header and task list. Connects task state from useTasks to the view.",
    "src/hooks/useTasks.ts":
      "Owns in-memory task state. Exposes a toggle function that immutably updates one task.",
    "src/components/Header.tsx":
      "Renders the application title as a semantic page heading.",
    "src/components/TaskList.tsx":
      "Renders tasks as a list of buttons and forwards toggle interactions.",
    "src/data/tasks.ts":
      "Three initial task records for the local demo application.",
    "src/types/task.ts":
      "Defines the Task interface shared by state and components.",
  };
  return (
    summaries[path] ??
    "Structural preview node. Source and semantic analysis for this file are not included in the local demo."
  );
}
const edges = nodes
  .filter((n) => n.parentId)
  .map((n) => ({
    id: `contains:${n.id}`,
    source: n.parentId!,
    target: n.id,
    type: "contains" as const,
    evidenceRefs: [],
    verification: "demo" as const,
  }));
const imports: [string, string][] = [
  ["src/main.tsx", "src/App.tsx"],
  ["src/App.tsx", "src/components/Header.tsx"],
  ["src/App.tsx", "src/components/TaskList.tsx"],
  ["src/App.tsx", "src/hooks/useTasks.ts"],
  ["src/hooks/useTasks.ts", "src/data/tasks.ts"],
  ["src/components/TaskList.tsx", "src/types/task.ts"],
  ["src/data/tasks.ts", "src/types/task.ts"],
];
export const demoGraph: RepositoryGraph = {
  repository: {
    id: "demo/constellation-app",
    owner: "demo",
    name: "constellation-app",
    githubUrl: null,
    commitSha: DEMO_SHA,
    description: "Local demonstration repository",
    analysisStatus: "preview",
  },
  nodes,
  edges: [
    ...edges,
    ...imports.map(([source, target]) => ({
      id: `imports:${source}:${target}`,
      source,
      target,
      type: "imports" as const,
      evidenceRefs: [`source:${source}`],
      verification: "demo" as const,
    })),
  ],
  sources: Object.entries(rawSources).map(([path, content]) => ({
    path: path.replace("../../demo-source/", ""),
    language: "typescript",
    content,
    lineCount: content.trimEnd().split("\n").length,
    commitSha: DEMO_SHA,
  })),
};
export function citation(
  filePath: string,
  startLine: number,
  endLine: number,
): SourceCitation {
  return {
    repositoryId: demoGraph.repository.id,
    commitSha: DEMO_SHA,
    filePath,
    startLine,
    endLine,
    evidenceId: `source:${filePath}`,
  };
}
