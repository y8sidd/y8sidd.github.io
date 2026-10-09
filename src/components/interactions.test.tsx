import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import VoidLanding from "./landing/VoidLanding";
import NodeInspector from "./inspector/NodeInspector";
import CommandPalette from "./search/CommandPalette";
import { SourceCitation } from "./code/SourceCitation";
import { mockRepositoryAdapter } from "../services/mockRepositoryAdapter";
import MentorPanel from "./ai/MentorPanel";
import { demoGraph, citation } from "../data/demoRepository";
import { useExperience } from "../stores/experienceStore";
beforeEach(() => {
  useExperience.getState().reset();
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
describe("Repository input", () => {
  it("condenses a pasted URL and remains editable", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <VoidLanding />
      </MemoryRouter>,
    );
    const input = screen.getByRole("textbox", {
      name: "GitHub repository URL",
    });
    await user.click(input);
    await user.paste("https://github.com/facebook/react.git");
    await waitFor(() => expect(screen.getByText("facebook")).toBeVisible());
    expect(screen.getByText("react", { exact: true })).toBeVisible();
    await user.click(screen.getByText("react", { exact: true }));
    expect(input).toHaveValue("https://github.com/facebook/react.git");
    expect(input).toHaveStyle({ opacity: 1 });
    await user.clear(input);
    await waitFor(() =>
      expect(
        screen.queryByText("react", { exact: true }),
      ).not.toBeInTheDocument(),
    );
  });
  it("submits by keyboard and reaches the truthful pending route", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<VoidLanding />} />
          <Route
            path="/explore/:owner/:repo"
            element={<p>Backend pending</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(
      screen.getByRole("textbox"),
      "https://github.com/facebook/react",
    );
    await user.keyboard("{Enter}");
    await waitFor(
      () => expect(screen.getByText("Backend pending")).toBeVisible(),
      { timeout: 2500 },
    );
  });
  it("shows invalid input accessibly", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <VoidLanding />
      </MemoryRouter>,
    );
    await user.type(
      screen.getByRole("textbox"),
      "https://github.com.evil.example/a/b{Enter}",
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Enter a valid");
  });
});
describe("Graph navigation", () => {
  it("selects a node, opens an inspector, follows a connection and closes", async () => {
    useExperience.getState().select("src/App.tsx");
    render(<NodeInspector graph={demoGraph} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "App.tsx" })).toBeVisible(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Imports useTasks.ts/ }),
    );
    expect(screen.getByRole("heading", { name: "useTasks.ts" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(useExperience.getState().selected).toBeNull();
  });
  it("supports search keyboard selection and no-results state", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CommandPalette graph={demoGraph} />
      </MemoryRouter>,
    );
    const input = screen.getByRole("combobox");
    await user.type(input, "nonesuch");
    expect(screen.getByText("No matching nodes")).toBeVisible();
    await user.clear(input);
    await user.type(input, "useTasks");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(useExperience.getState().selected).toBe("src/hooks/useTasks.ts");
    expect(useExperience.getState().overlay.kind).toBe("none");
  });
  it("opens citations with the selected file and exact line range", () => {
    const c = citation("src/main.tsx", 1, 7);
    render(<SourceCitation citation={c} />);
    fireEvent.click(screen.getByRole("button"));
    expect(useExperience.getState().selected).toBe("src/main.tsx");
    expect(useExperience.getState().overlay).toEqual({
      kind: "code",
      path: "src/main.tsx",
      citation: c,
    });
  });
});

it("loads a labeled mentor response and citations", async () => {
  const user = userEvent.setup();
  render(<MentorPanel graph={demoGraph} />);
  await user.click(
    screen.getByRole("button", { name: /What is the entry point/ }),
  );
  await waitFor(() => expect(screen.getByText("MENTOR · DEMO")).toBeVisible());
  expect(screen.getByRole("button", { name: /main.tsx/ })).toBeVisible();
});

it("shows a recoverable mentor error", async () => {
  const spy = vi
    .spyOn(mockRepositoryAdapter, "askMentor")
    .mockRejectedValueOnce(new Error("Demo unavailable"));
  const user = userEvent.setup();
  render(<MentorPanel graph={demoGraph} />);
  await user.click(
    screen.getByRole("button", { name: /What is the entry point/ }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"),
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  spy.mockRestore();
});
