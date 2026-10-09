import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, LoaderCircle, X } from "lucide-react";
import { BrandMark } from "../components/shared/Brand";
import { IconButton } from "../components/shared/IconButton";
import {
  TopControls,
  GraphControls,
} from "../components/constellation/GraphControls";
import {
  FilterPanel,
  HelpPanel,
  SettingsPanel,
} from "../components/constellation/UtilityPanels";
import { useExperience } from "../stores/experienceStore";
import { filterGraph } from "../lib/graphUtils";
import { mockRepositoryAdapter } from "../services/mockRepositoryAdapter";
import type { RepositoryGraph } from "../types/repository";
const ConstellationCanvas = lazy(
  () => import("../components/constellation/ConstellationCanvas"),
);
const NodeInspector = lazy(
  () => import("../components/inspector/NodeInspector"),
);
const CommandPalette = lazy(
  () => import("../components/search/CommandPalette"),
);
const MentorPanel = lazy(() => import("../components/ai/MentorPanel"));
const CodeExplorer = lazy(() => import("../components/code/CodeExplorer"));
type LoadState =
  | { status: "loading" }
  | { status: "ready"; graph: RepositoryGraph }
  | { status: "error"; message: string };
export default function Explore() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const selected = useExperience((s) => s.selected);
  const overlay = useExperience((s) => s.overlay);
  const filter = useExperience((s) => s.filter);
  const interacted = useExperience((s) => s.interacted);
  const open = useExperience((s) => s.open);
  const close = useExperience((s) => s.close);
  useEffect(() => {
    useExperience.getState().reset();
    const controller = new AbortController();
    setLoad({ status: "loading" });
    mockRepositoryAdapter
      .getGraph("demo/constellation-app", controller.signal)
      .then((graph) => setLoad({ status: "ready", graph }))
      .catch((error) => {
        if (error.name !== "AbortError")
          setLoad({ status: "error", message: error.message });
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement)?.matches(
        'input,textarea,select,[contenteditable="true"]',
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open({ kind: "search" });
      } else if (
        !editing &&
        e.key.toLowerCase() === "m" &&
        !e.metaKey &&
        !e.ctrlKey
      )
        open({ kind: "mentor" });
      else if (e.key === "Escape" && overlay.kind === "none") {
        useExperience.getState().select(null);
        document
          .querySelector<HTMLButtonElement>('[aria-label="Node navigator"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, overlay.kind]);
  const visible = useMemo(
    () =>
      load.status === "ready"
        ? filterGraph(load.graph, filter, selected)
        : { nodes: [], edges: [] },
    [load, filter, selected],
  );
  useEffect(() => {
    if (load.status !== "ready") return;
    type Context = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "select_demo_node",
            description:
              "Select a node in the local RepoMentor demo and open its inspector.",
            inputSchema: {
              type: "object",
              properties: { nodeId: { type: "string" } },
              required: ["nodeId"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                !("nodeId" in input) ||
                typeof input.nodeId !== "string" ||
                !load.graph.nodes.some((n) => n.id === input.nodeId)
              )
                throw new Error("Unknown demo node ID");
              useExperience.getState().setFilter({ nodes: "all" });
              useExperience.getState().select(input.nodeId);
              useExperience.getState().close();
              return { selected: input.nodeId, mode: "demo" };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, [load]);
  return (
    <main className={`explore-page ${selected ? "has-selection" : ""}`}>
      <motion.div
        className="scene-reveal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      >
        {load.status === "ready" ? (
          <Suspense
            fallback={
              <div className="scene-loading">
                <LoaderCircle className="spin" size={18} />
                Preparing the preview
              </div>
            }
          >
            <ConstellationCanvas
              nodes={visible.nodes}
              edges={visible.edges}
              layoutNodes={load.graph.nodes}
            />
          </Suspense>
        ) : (
          <div className="scene-loading">
            {load.status === "error" ? (
              <>
                <p>{load.message}</p>
                <button
                  className="primary-button"
                  onClick={() => setRetry((r) => r + 1)}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <LoaderCircle className="spin" size={18} />
                Opening local preview
              </>
            )}
          </div>
        )}
      </motion.div>
      <header className="explore-identity">
        <Link className="back-link" to="/" aria-label="Return to the void">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="explore-brand">
            <BrandMark size={25} />
            <span>
              RepoMentor <small>AI</small>
            </span>
          </div>
          <p>
            <span>demo</span>
            <i>/</i>constellation-app
          </p>
        </div>
      </header>
      <TopControls />
      <div className="preview-badge">
        <span />
        INTERACTIVE PREVIEW
      </div>
      {load.status === "ready" && (
        <>
          <div className="graph-meta">
            <p>
              <strong>
                {visible.nodes.length.toString().padStart(2, "0")}
              </strong>{" "}
              nodes <span>·</span>
              <strong>
                {visible.edges.length.toString().padStart(2, "0")}
              </strong>{" "}
              relationships
            </p>
            <small>
              {filter.nodes === "all"
                ? "ALL NODES"
                : filter.nodes === "source"
                  ? "SOURCE FILES"
                  : "STRUCTURE"}{" "}
              <span>/</span>{" "}
              {filter.edges === "all"
                ? "ALL RELATIONSHIPS"
                : filter.edges.toUpperCase()}
            </small>
          </div>
          <GraphControls />
          {!interacted && (
            <div className="onboarding-hint">
              <span>
                Drag to explore <i>·</i> Scroll to zoom <i>·</i> Select a star
                to inspect
              </span>
              <IconButton
                label="Dismiss exploration hint"
                onClick={() => useExperience.getState().interact()}
              >
                <X size={12} />
              </IconButton>
            </div>
          )}
          <Suspense fallback={null}>
            <AnimatePresence>
              {selected && overlay.kind === "none" && (
                <NodeInspector key="inspector" graph={load.graph} />
              )}
            </AnimatePresence>
            {overlay.kind !== "none" && (
              <div
                className={`overlay-layer ${["search", "list", "help", "settings", "filters"].includes(overlay.kind) ? "central-overlay" : ""}`}
              >
                <button
                  tabIndex={-1}
                  className="overlay-scrim"
                  aria-label="Dismiss overlay"
                  onClick={close}
                />
                <AnimatePresence mode="wait">
                  {(overlay.kind === "search" || overlay.kind === "list") && (
                    <CommandPalette
                      key="search"
                      graph={load.graph}
                      list={overlay.kind === "list"}
                    />
                  )}{" "}
                  {overlay.kind === "code" && (
                    <CodeExplorer
                      key={overlay.path}
                      graph={load.graph}
                      path={overlay.path}
                      citation={overlay.citation}
                    />
                  )}{" "}
                  {overlay.kind === "mentor" && (
                    <MentorPanel key="mentor" graph={load.graph} />
                  )}{" "}
                  {overlay.kind === "help" && <HelpPanel key="help" />}{" "}
                  {overlay.kind === "settings" && (
                    <SettingsPanel key="settings" />
                  )}{" "}
                  {overlay.kind === "filters" && <FilterPanel key="filters" />}
                </AnimatePresence>
              </div>
            )}
          </Suspense>
        </>
      )}
    </main>
  );
}
