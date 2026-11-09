import { LIMITS, REPOSITORY_LIMIT_MESSAGE } from "../../shared/limits";
import { ApiError, boundedText } from "./http";
import {
  checkRepositoryName,
  makeGraph,
  readable,
  language,
  type FileEntry,
} from "./graph";
import type { SourceFile } from "../../src/types/repository";
export class GitHub {
  constructor(
    private token?: string,
    private transport: typeof fetch = fetch,
  ) {}
  async request(
    path: string,
    maxBytes: number = LIMITS.treeResponseBytes,
  ): Promise<any> {
    let response: Response;
    try {
      response = await this.transport.call(
        globalThis,
        "https://api.github.com" + path,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "RepoMentor",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch {
      throw new ApiError(
        503,
        "GITHUB_UNAVAILABLE",
        "GitHub could not be reached. Please try again.",
      );
    }
    if (response.status === 404 || response.status === 409)
      throw new ApiError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository not found, private or empty. Enter an existing public repository.",
      );
    if (response.status === 403 || response.status === 429)
      throw new ApiError(
        429,
        "GITHUB_RATE_LIMIT",
        "GitHub is limiting requests. Please try again later.",
      );
    if (!response.ok)
      throw new ApiError(
        502,
        "GITHUB_UNAVAILABLE",
        "GitHub could not complete this request.",
      );
    try {
      return JSON.parse(await boundedText(response, maxBytes));
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        502,
        "GITHUB_RESPONSE",
        "GitHub returned an invalid response.",
      );
    }
  }
  async repository(owner: string, name: string) {
    checkRepositoryName(owner, name);
    const metadata = await this.request(`/repos/${owner}/${name}`, 32768);
    if (metadata.private || metadata.disabled)
      throw new ApiError(
        400,
        "PUBLIC_ONLY",
        "Only public repositories are supported.",
      );
    owner = metadata.owner?.login;
    name = metadata.name;
    checkRepositoryName(owner, name);
    if (
      typeof metadata.default_branch !== "string" ||
      metadata.default_branch.length > 256
    )
      throw new ApiError(
        502,
        "GITHUB_RESPONSE",
        "The default branch could not be resolved.",
      );
    const ref = await this.request(
      `/repos/${owner}/${name}/git/ref/heads/${metadata.default_branch.split("/").map(encodeURIComponent).join("/")}`,
      32768,
    );
    if (!/^[a-f0-9]{40}$/.test(ref.object?.sha))
      throw new ApiError(
        502,
        "GITHUB_RESPONSE",
        "The repository revision could not be resolved.",
      );
    const commit = await this.request(
      `/repos/${owner}/${name}/git/commits/${ref.object.sha}`,
      32768,
    );
    if (
      commit.sha !== ref.object.sha ||
      !/^[a-f0-9]{40}$/.test(commit.tree?.sha)
    )
      throw new ApiError(
        502,
        "GITHUB_RESPONSE",
        "The repository revision could not be resolved.",
      );
    let tree;
    try {
      tree = await this.request(
        `/repos/${owner}/${name}/git/trees/${commit.tree.sha}?recursive=1`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 413)
        throw new ApiError(
          413,
          "REPOSITORY_TOO_LARGE",
          REPOSITORY_LIMIT_MESSAGE,
        );
      throw e;
    }
    if (!Array.isArray(tree.tree))
      throw new ApiError(
        502,
        "GITHUB_RESPONSE",
        "The repository file tree could not be read.",
      );
    const files: FileEntry[] = tree.tree;
    return {
      graph: makeGraph(
        owner,
        name,
        commit.sha,
        String(metadata.description ?? "").slice(0, 500),
        files,
        Boolean(tree.truncated),
      ),
      files,
    };
  }
  async source(
    owner: string,
    name: string,
    commitSha: string,
    file: FileEntry,
  ): Promise<SourceFile> {
    if (!readable(file) || file.type !== "blob")
      throw new ApiError(
        413,
        "SOURCE_UNAVAILABLE",
        "This file is binary, unsupported or larger than 128 KB. View it on GitHub instead.",
      );
    const blob = await this.request(
      `/repos/${owner}/${name}/git/blobs/${file.sha}`,
      LIMITS.sourceBytes * 2,
    );
    if (
      blob.encoding !== "base64" ||
      typeof blob.content !== "string" ||
      blob.size > LIMITS.sourceBytes
    )
      throw new ApiError(
        413,
        "SOURCE_UNAVAILABLE",
        "This file cannot be displayed within the source limit.",
      );
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), (c) =>
        c.charCodeAt(0),
      );
    } catch {
      throw new ApiError(
        502,
        "INVALID_SOURCE",
        "GitHub returned invalid file content.",
      );
    }
    if (bytes.byteLength > LIMITS.sourceBytes || bytes.includes(0))
      throw new ApiError(
        413,
        "SOURCE_UNAVAILABLE",
        "This file is too large or binary. View it on GitHub instead.",
      );
    let content: string;
    try {
      content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: false,
      }).decode(bytes);
    } catch {
      throw new ApiError(
        422,
        "SOURCE_UNAVAILABLE",
        "Only UTF-8 text files are supported.",
      );
    }
    const lineCount = content.split(/\r\n?|\n/).length;
    if (
      lineCount > LIMITS.sourceLines ||
      content.startsWith("version https://git-lfs.github.com/spec/")
    )
      throw new ApiError(
        413,
        "SOURCE_UNAVAILABLE",
        "This file exceeds the viewing limit or is stored in Git LFS. View it on GitHub.",
      );
    return {
      path: file.path,
      language: language(file.path),
      content,
      lineCount,
      commitSha,
    };
  }
}
