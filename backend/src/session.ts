import type { Env } from "./env";
import type { RepositoryGraph, SourceFile } from "../../src/types/repository";
import { GitHub } from "./github";
import { importEdges, readable, type FileEntry } from "./graph";
import { askAI, excerpt, readCredentials } from "./ai";
import { ApiError, body, failure, json, textField } from "./http";
import { LIMITS } from "../../shared/limits";
interface RecordState {
  created: number;
  expires: number;
  graph?: RepositoryGraph;
  files: FileEntry[];
  cached: string[];
  analyzed: string[];
  questions: number;
}
export class RepositorySession {
  private busy = false;
  private closed = false;
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  async alarm() {
    const record = await this.state.storage.get<RecordState>("record");
    if (!record || record.expires <= Date.now()) {
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
    } else await this.state.storage.setAlarm(record.expires);
  }
  async alive() {
    if (this.closed)
      throw new ApiError(
        410,
        "SESSION_EXPIRED",
        "This temporary session has closed. Reload the repository to continue.",
      );
    const record = await this.state.storage.get<RecordState>("record");
    if (!record || record.expires <= Date.now()) {
      await this.state.storage.deleteAll();
      throw new ApiError(
        410,
        "SESSION_EXPIRED",
        "This temporary session expired. Reload the repository to continue.",
      );
    }
    return record;
  }
  async save(record: RecordState, source?: SourceFile) {
    await this.state.storage.transaction(async (tx) => {
      const current = await tx.get<RecordState>("record");
      if (this.closed || !current || current.expires <= Date.now())
        throw new ApiError(
          410,
          "SESSION_EXPIRED",
          "This temporary session expired. Reload the repository to continue.",
        );
      record.cached = [...current.cached];
      if (source) {
        if (!record.cached.includes(source.path))
          record.cached.push(source.path);
        while (record.cached.length > LIMITS.cachedSources)
          await tx.delete("source:" + record.cached.shift()!);
        await tx.put("source:" + source.path, source);
      }
      record.expires = Math.min(
        record.created + LIMITS.sessionMaxMs,
        Date.now() + LIMITS.sessionIdleMs,
      );
      await tx.put("record", record);
      await tx.setAlarm(record.expires);
    });
  }
  async source(record: RecordState, path: string) {
    const file = record.files.find((f) => f.path === path);
    if (!file)
      throw new ApiError(
        404,
        "FILE_NOT_FOUND",
        "This file is not part of the repository snapshot.",
      );
    const cached = await this.state.storage.get<SourceFile>("source:" + path);
    if (cached) return cached;
    const repo = record.graph!.repository;
    const source = await new GitHub(this.env.GITHUB_TOKEN).source(
      repo.owner,
      repo.name,
      repo.commitSha,
      file,
    );
    await this.save(record, source);
    return source;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/close" && request.method === "POST") {
        this.closed = true;
        await this.state.storage.deleteAll();
        await this.state.storage.deleteAlarm();
        return json({ closed: true });
      }
      if (this.busy)
        throw new ApiError(
          429,
          "SESSION_BUSY",
          "Another request is still running. Please wait a moment.",
        );
      this.busy = true;
      try {
        if (url.pathname === "/create" && request.method === "POST") {
          if (this.closed)
            throw new ApiError(
              410,
              "SESSION_EXPIRED",
              "This session has closed.",
            );
          if (await this.state.storage.get("record"))
            throw new ApiError(
              409,
              "SESSION_EXISTS",
              "The session already exists.",
            );
          const input = await body(request);
          const created = Date.now();
          const record: RecordState = {
            created,
            expires: created + LIMITS.sessionIdleMs,
            files: [],
            cached: [],
            analyzed: [],
            questions: 0,
          };
          await this.state.storage.put("record", record);
          await this.state.storage.setAlarm(record.expires);
          try {
            const result = await new GitHub(this.env.GITHUB_TOKEN).repository(
              textField(input.owner, 39),
              textField(input.repo, 100),
            );
            record.graph = result.graph;
            record.files = result.files;
            await this.save(record);
            return json(
              { graph: record.graph, expiresAt: record.expires },
              201,
            );
          } catch (e) {
            await this.state.storage.deleteAll();
            await this.state.storage.deleteAlarm();
            throw e;
          }
        }
        const record = await this.alive();
        if (!record.graph)
          throw new ApiError(
            409,
            "SESSION_PENDING",
            "The repository is still opening.",
          );
        if (url.pathname === "/graph" && request.method === "GET") {
          await this.save(record);
          return json({ graph: record.graph, expiresAt: record.expires });
        }
        if (url.pathname === "/source" && request.method === "GET") {
          const source = await this.source(
            record,
            textField(url.searchParams.get("path")),
          );
          await this.save(record);
          return json(source);
        }
        if (url.pathname === "/imports" && request.method === "POST") {
          const input = await body(request);
          const path = textField(input.path);
          if (!record.analyzed.includes(path)) {
            const source = await this.source(record, path);
            const edges = importEdges(path, source.content, record.files);
            const existing = new Set(record.graph.edges.map((e) => e.id));
            const added = edges.filter((e) => !existing.has(e.id));
            if (record.graph.edges.length + added.length > LIMITS.edges)
              throw new ApiError(
                413,
                "GRAPH_LIMIT",
                "The connection limit has been reached. The existing map remains available.",
              );
            record.graph.edges.push(...added);
            record.analyzed.push(path);
          }
          await this.save(record);
          return json({
            edges: record.graph.edges.filter(
              (e) => e.type === "imports" && e.source === path,
            ),
            analyzed: true,
          });
        }
        if (url.pathname === "/mentor" && request.method === "POST") {
          const input = await body(request);
          const question = textField(
            input.question,
            LIMITS.questionChars,
          ).trim();
          if (!question)
            throw new ApiError(400, "EMPTY_QUESTION", "Enter a question.");
          if (record.questions >= LIMITS.questionsPerSession)
            throw new ApiError(
              429,
              "SESSION_AI_LIMIT",
              "This session has reached its 20-question limit.",
            );
          const selected = typeof input.nodeId === "string" ? input.nodeId : "";
          if (selected && !record.graph.nodes.some((n) => n.id === selected))
            throw new ApiError(
              400,
              "UNKNOWN_NODE",
              "Select a node in the current repository.",
            );
          const selectedNode = record.graph.nodes.find(
            (n) => n.id === selected,
          );
          if (
            selectedNode &&
            ["file", "entry"].includes(selectedNode.type) &&
            !selectedNode.sourceAvailable
          ) {
            throw new ApiError(
              422,
              "SOURCE_UNAVAILABLE",
              "This file is outside the supported source limits. Select a smaller text file for Mentor.",
            );
          }
          const terms =
            question.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? [];
          const related = new Set(
            record.graph.edges
              .filter((e) => e.source === selected && e.type === "imports")
              .map((e) => e.target),
          );
          const candidates = record.files
            .filter((f) => readable(f) && f.type === "blob")
            .map((f) => ({
              file: f,
              score:
                (f.path === selected ? 100 : 0) +
                (selected && f.path.startsWith(selected + "/") ? 50 : 0) +
                (related.has(f.path) ? 30 : 0) +
                terms.filter((t) => f.path.toLowerCase().includes(t)).length *
                  8 +
                (/(?:^|\/)(?:main|index|App)\.[jt]sx?$/.test(f.path) ? 4 : 0) +
                (/^readme\.md$/i.test(f.path) ? 3 : 0),
            }))
            .sort(
              (a, b) =>
                b.score - a.score || a.file.path.localeCompare(b.file.path),
            );
          if (!candidates.length)
            throw new ApiError(
              422,
              "NO_SOURCE",
              "This repository has no supported text files for Mentor.",
            );
          // Request-local only: credentials must never enter RecordState/storage.
          const credentials = readCredentials(input.credentials);
          record.questions++;
          await this.save(record);
          const excerpts = [];
          for (const { file } of candidates.slice(0, LIMITS.contextFiles)) {
            try {
              const source = await this.source(record, file.path);
              const selectedExcerpt = excerpt(source, question);
              if (selectedExcerpt.endLine >= selectedExcerpt.startLine)
                excerpts.push(selectedExcerpt);
              else if (file.path === selected)
                throw new ApiError(
                  422,
                  "SOURCE_UNAVAILABLE",
                  "This selected file has no usable short excerpt. Choose an unminified source file for Mentor.",
                );
            } catch (e) {
              if (
                e instanceof ApiError &&
                e.code === "SOURCE_UNAVAILABLE" &&
                file.path !== selected
              )
                continue;
              throw e;
            }
          }
          if (!excerpts.length)
            throw new ApiError(
              422,
              "NO_SOURCE",
              "No usable source excerpts were found for this question.",
            );
          const answer = await askAI(
            credentials,
            record.graph,
            question,
            excerpts,
          );
          await this.save(record);
          return json(answer);
        }
        throw new ApiError(404, "NOT_FOUND", "Unknown API endpoint.");
      } finally {
        this.busy = false;
      }
    } catch (e) {
      return failure(e);
    }
  }
}
