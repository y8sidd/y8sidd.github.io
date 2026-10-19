import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AppErrorBoundary } from "./shared/AppErrorBoundary";
import { Panel } from "./shared/Panel";
import CodeExplorer from "./code/CodeExplorer";
import { demoGraph, citation } from "../data/demoRepository";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("offers recovery when a screen cannot render", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("Failed to fetch dynamically imported module");
  }
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("couldn’t load");
  expect(screen.getByRole("button", { name: "Reload preview" })).toBeVisible();
});

it.each([
  [9, 2],
  [1.5, 3],
  [1, 999],
  [999, 1],
  [NaN, 2],
])("ignores invalid citation range %s–%s without crashing", (start, end) => {
  render(
    <CodeExplorer
      graph={demoGraph}
      path="src/main.tsx"
      citation={citation("src/main.tsx", start, end)}
    />,
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(document.querySelectorAll(".cm-citation")).toHaveLength(0);
});

it("uses actual source lines instead of stale line-count metadata", () => {
  const graph = {
    ...demoGraph,
    sources: demoGraph.sources.map((source) =>
      source.path === "src/main.tsx"
        ? { ...source, content: "one line", lineCount: 100 }
        : source,
    ),
  };
  render(
    <CodeExplorer
      graph={graph}
      path="src/main.tsx"
      citation={citation("src/main.tsx", 2, 50)}
    />,
  );
  expect(document.querySelectorAll(".cm-citation")).toHaveLength(0);
});

it("keeps modal Tab navigation out of arrow-key-only options", () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  render(
    <Panel title="Search">
      <input aria-label="Search" />
      <button tabIndex={-1}>Arrow-only result</button>
    </Panel>,
  );
  const input = screen.getByRole("textbox");
  input.focus();
  fireEvent.keyDown(input, { key: "Tab" });
  expect(screen.getByRole("button", { name: "Close Search" })).toHaveFocus();
});

it("preserves trailing source lines referenced by citations", () => {
  const graph = {
    ...demoGraph,
    sources: demoGraph.sources.map((source) =>
      source.path === "src/main.tsx"
        ? { ...source, content: "line\n\n", lineCount: 3 }
        : source,
    ),
  };
  render(
    <CodeExplorer
      graph={graph}
      path="src/main.tsx"
      citation={citation("src/main.tsx", 3, 3)}
    />,
  );
  expect(document.querySelectorAll(".cm-citation")).toHaveLength(1);
});
