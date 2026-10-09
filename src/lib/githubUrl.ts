export interface ParsedRepository {
  owner: string;
  repo: string;
  url: string;
}
export function parseGitHubUrl(value: string): ParsedRepository | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const segments = url.pathname.replace(/\/$/, "").split("/").slice(1);
    if (segments.length !== 2) return null;
    const [owner, rawRepo] = segments;
    const repo = rawRepo.replace(/\.git$/, "");
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) ||
      owner.includes("--")
    )
      return null;
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || /^\.+$/.test(repo))
      return null;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
}
