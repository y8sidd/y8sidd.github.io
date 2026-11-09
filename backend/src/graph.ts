import { LIMITS, REPOSITORY_LIMIT_MESSAGE } from "../../shared/limits";
import type {
  GraphEdge,
  GraphNode,
  RepositoryGraph,
} from "../../src/types/repository";
import { ApiError } from "./http";
import { parse } from "@babel/parser";
export interface FileEntry {
  path: string;
  sha: string;
  size: number;
  mode: string;
  type: string;
}
export function checkRepositoryName(owner: string, repo: string) {
  if (
    typeof owner !== "string" ||
    typeof repo !== "string" ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner) ||
    owner.includes("--") ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) ||
    /^\.+$/.test(repo)
  )
    throw new ApiError(
      400,
      "INVALID_REPOSITORY",
      "Enter a valid GitHub link or username/repository.",
    );
}
const languages: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  css: "css",
  html: "html",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  sh: "shell",
  txt: "text",
  sql: "sql",
  vue: "vue",
  svelte: "svelte",
  rb: "ruby",
  php: "php",
  xml: "xml",
};
export function language(path: string) {
  return languages[path.split(".").pop()!.toLowerCase()] ?? "text";
}
export function readable(file: FileEntry) {
  const name = file.path.split("/").pop()!;
  return (
    ["100644", "100755"].includes(file.mode) &&
    file.size <= LIMITS.sourceBytes &&
    Boolean(
      Object.hasOwn(languages, name.split(".").pop()!.toLowerCase()) ||
      ["Dockerfile", "Makefile", ".gitignore"].includes(name),
    ) &&
    !/(^|\/)(\.env(?:\..*)?|.*\.(pem|key))$/.test(file.path)
  );
}
export function makeGraph(
  owner: string,
  name: string,
  sha: string,
  description: string,
  entries: FileEntry[],
  truncated: boolean,
): RepositoryGraph {
  const files = entries.filter(
    (e) => e && (e.type === "blob" || e.type === "commit"),
  );
  if (
    truncated ||
    files.length > LIMITS.files ||
    files.reduce((n, f) => n + (f.size ?? 0), 0) > LIMITS.repositoryBytes ||
    entries.length + 1 > LIMITS.nodes
  )
    throw new ApiError(413, "REPOSITORY_TOO_LARGE", REPOSITORY_LIMIT_MESSAGE);
  if (
    entries.some(
      (e) =>
        !e ||
        typeof e.path !== "string" ||
        !["tree", "blob", "commit"].includes(e.type) ||
        !/^[a-f0-9]{40}$/.test(e.sha) ||
        (e.type === "blob" && (!Number.isSafeInteger(e.size) || e.size < 0)) ||
        !e.path ||
        e.path.length > 512 ||
        e.path.split("/").length > 12 ||
        e.path.split("/").some((s) => !s || s === ".." || s === ".") ||
        /[\x00-\x1f]/.test(e.path),
    )
  )
    throw new ApiError(413, "REPOSITORY_TOO_LARGE", REPOSITORY_LIMIT_MESSAGE);
  const nodes: GraphNode[] = [
    {
      id: "/",
      label: name,
      type: "repository",
      path: "/",
      parentId: null,
      summary: description || `Public repository ${owner}/${name}.`,
      evidenceRefs: [],
      importance: 1,
      technology: "GitHub",
    },
  ];
  for (const e of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const folder = e.type === "tree";
    const source = readable(e) && e.type === "blob";
    const parent = e.path.includes("/")
      ? e.path.slice(0, e.path.lastIndexOf("/"))
      : "/";
    nodes.push({
      id: e.path,
      label: e.path.split("/").pop()!,
      type: folder
        ? "module"
        : /^(?:src\/)?(?:main|index)\.[jt]sx?$/.test(e.path)
          ? "entry"
          : "file",
      path: e.path,
      parentId: parent,
      summary: folder
        ? `Folder in ${owner}/${name}. Select its connected files to explore.`
        : source
          ? `${language(e.path)} file. Load its code or analyze its imports on request.`
          : e.size > LIMITS.sourceBytes
            ? "This file exceeds the 128 KB source-viewing limit. View it on GitHub."
            : "Binary, sensitive, linked or unsupported file. Its contents are not downloaded.",
      evidenceRefs: source ? [`source:${e.path}`] : [],
      importance: folder ? 0.8 : 0.25,
      technology: folder ? "Directory" : language(e.path),
      byteSize: e.size ?? 0,
      sourceAvailable: source,
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  if (
    ids.size !== nodes.length ||
    nodes.some(
      (n) =>
        n.parentId &&
        (!ids.has(n.parentId) ||
          (n.parentId !== "/" &&
            !entries.some((e) => e.path === n.parentId && e.type === "tree"))),
    )
  )
    throw new ApiError(
      502,
      "INVALID_TREE",
      "GitHub returned an incomplete file tree.",
    );
  return {
    repository: {
      id: `${owner}/${name}`,
      owner,
      name,
      githubUrl: `https://github.com/${owner}/${name}`,
      commitSha: sha,
      description: description || "Public GitHub repository",
      analysisStatus: "ready",
    },
    nodes,
    edges: nodes
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `contains:${n.id}`,
        source: n.parentId!,
        target: n.id,
        type: "contains",
        evidenceRefs: [],
        verification: "verified",
      })),
    sources: [],
  };
}
export function importEdges(
  path: string,
  content: string,
  files: FileEntry[],
): GraphEdge[] {
  if (!/\.[cm]?[jt]sx?$/.test(path))
    throw new ApiError(
      422,
      "ANALYSIS_UNSUPPORTED",
      "Import analysis currently supports JavaScript and TypeScript files. Other files can still be viewed and discussed with Mentor.",
    );
  let ast;
  try {
    ast = parse(content, {
      sourceType: "unambiguous",
      plugins: [
        ...(/\.[cm]?tsx?$/.test(path) ? ["typescript" as const] : []),
        "jsx",
      ],
      errorRecovery: false,
    });
  } catch {
    throw new ApiError(
      422,
      "PARSE_FAILED",
      "This file could not be parsed safely. You can still read its source.",
    );
  }
  const known = new Set(
    files.filter((f) => f.type === "blob").map((f) => f.path),
  );
  const refs = new Set<string>();
  const requireRefs = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as Record<string, any>;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(n.type) &&
      n.source?.value
    )
      refs.add(n.source.value);
    if (n.type === "ImportExpression" && n.source?.type === "StringLiteral")
      refs.add(n.source.value);
    if (
      n.type === "CallExpression" &&
      (n.callee?.type === "Import" || n.callee?.name === "require") &&
      n.arguments?.[0]?.type === "StringLiteral"
    )
      refs.add(n.arguments[0].value);
    if (
      n.type === "CallExpression" &&
      n.callee?.name === "require" &&
      n.arguments?.[0]?.type === "StringLiteral"
    )
      requireRefs.add(n.arguments[0].value);
    for (const [key, value] of Object.entries(n))
      if (
        ![
          "loc",
          "start",
          "end",
          "extra",
          "comments",
          "tokens",
          "errors",
        ].includes(key)
      )
        visit(value);
  };
  visit(ast.program);
  const edges: GraphEdge[] = [];
  for (const spec of refs) {
    if (!spec.startsWith(".")) continue;
    const parts = path.split("/").slice(0, -1);
    let invalid = false;
    for (const part of spec.split("/")) {
      if (part === "..") {
        if (!parts.length) {
          invalid = true;
          break;
        }
        parts.pop();
      } else if (part && part !== ".") parts.push(part);
    }
    if (invalid) continue;
    const base = parts.join("/");
    const target = [
      base,
      ...[
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mts",
        ".cts",
        ".mjs",
        ".cjs",
        ".json",
        ".css",
        "/index.ts",
        "/index.tsx",
        "/index.js",
        "/index.jsx",
      ].map((ext) => base + ext),
    ].find((p) => known.has(p));
    if (target && target !== path && !edges.some((e) => e.target === target))
      edges.push({
        id: `imports:${path}:${target}`,
        source: path,
        target,
        type: "imports",
        evidenceRefs: [`source:${path}`],
        verification: requireRefs.has(spec) ? "unverified" : "verified",
      });
  }
  if (edges.length > LIMITS.importsPerFile)
    throw new ApiError(
      413,
      "TOO_MANY_IMPORTS",
      "This file has too many local imports to display clearly. Inspect a smaller file.",
    );
  return edges;
}
