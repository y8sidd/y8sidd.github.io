import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "./githubUrl";
describe("GitHub URL parser", () => {
  it.each([
    "https://github.com/facebook/react",
    "https://github.com/facebook/react/",
    "https://github.com/facebook/react.git",
    " https://github.com/facebook/react.git/ ",
    "facebook/react",
    " facebook/react.git/ ",
  ])("extracts and normalizes %s", (url) =>
    expect(parseGitHubUrl(url)).toEqual({
      owner: "facebook",
      repo: "react",
      url: "https://github.com/facebook/react",
    }),
  );
  it.each([
    "",
    "not a url",
    "facebook",
    "facebook/react/tree/main",
    "facebook/react?x=1",
    "facebook/..",
    "-facebook/react",
    "http://github.com/a/b",
    "https://github.com.evil.example/a/b",
    "https://evil.example/github.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/tree/main",
    "https://github.com/a--b/repo",
    "https://github.com/-a/b",
    "https://github.com/a/..",
    "https://user@github.com/a/b",
    "https://github.com/a/b?x=1",
    "https://github.com/a/b#readme",
    "https://github.com:8443/a/b",
    "https://github.com/a/b%20c",
  ])("rejects %s", (url) => expect(parseGitHubUrl(url)).toBeNull());
  it("supports valid punctuation", () =>
    expect(
      parseGitHubUrl("https://github.com/team-code/a_b.c-d"),
    ).toMatchObject({ owner: "team-code", repo: "a_b.c-d" }));
});
