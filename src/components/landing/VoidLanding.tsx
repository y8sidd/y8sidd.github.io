import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Github, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { parseGitHubUrl } from "../../lib/githubUrl";
import { demoGraph } from "../../data/demoRepository";
import { sphericalLayout } from "../../lib/sphericalLayout";
import { BrandMark } from "../shared/Brand";
type InputPhase =
  "idle" | "editing" | "parsed" | "invalid" | "submitting" | "demo-transition";
export default function VoidLanding() {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<InputPhase>("idle");
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const parsed = parseGitHubUrl(value);
  const departing = phase === "submitting" || phase === "demo-transition";
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const submit = () => {
    if (!parsed) {
      setPhase("invalid");
      input.current?.focus();
      return;
    }
    setPhase("submitting");
    input.current?.blur();
    timer.current = setTimeout(
      () => navigate(`/explore/${parsed.owner}/${parsed.repo}`),
      reduced ? 0 : 1300,
    );
  };
  return (
    <main className="void-page">
      {phase === "demo-transition" && !reduced && <TransitionConstellation />}
      <div className="void-wordmark">
        <BrandMark size={25} />
        <span>
          REPOMENTOR <span className="subtle">AI</span>
        </span>
      </div>
      <motion.section
        className="void-center"
        animate={
          departing
            ? { opacity: 0, y: -16, filter: "blur(6px)" }
            : { opacity: 1, y: 0, filter: "blur(0px)" }
        }
        transition={{
          delay:
            phase === "demo-transition"
              ? 0.05
              : phase === "submitting"
                ? 0.65
                : 0,
          duration: 0.6,
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="landing-mark"
        >
          <BrandMark size={46} />
        </motion.div>
        <h1>Enter a repository.</h1>
        <p className="landing-subtitle">A different way to understand code.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="repo-form"
        >
          <div
            className={`repository-input glass ${phase === "invalid" ? "invalid" : ""} ${phase === "submitting" ? "confirmed" : ""}`}
          >
            <Github size={20} className="github-icon" />
            <input
              ref={input}
              aria-label="GitHub repository URL"
              aria-describedby="url-status"
              aria-invalid={phase === "invalid"}
              value={value}
              placeholder="Paste a GitHub repository link..."
              autoComplete="off"
              spellCheck={false}
              disabled={phase === "submitting"}
              style={{
                opacity: phase === "parsed" || phase === "submitting" ? 0 : 1,
              }}
              onFocus={() => setPhase("editing")}
              onBlur={() => {
                setPhase((current) =>
                  current === "submitting"
                    ? current
                    : parsed
                      ? "parsed"
                      : value
                        ? "invalid"
                        : "idle",
                );
              }}
              onChange={(e) => {
                setValue(e.target.value);
                setPhase("editing");
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (parseGitHubUrl(pasted)) {
                  e.preventDefault();
                  setValue(pasted.trim());
                  setPhase("parsed");
                }
              }}
            />
            <AnimatePresence>
              {parsed && (phase === "parsed" || phase === "submitting") && (
                <motion.div
                  className="parsed-identity"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  onClick={() => {
                    setPhase("editing");
                    input.current?.focus();
                  }}
                >
                  <span>{parsed.owner}</span>
                  <i>/</i>
                  <strong>{parsed.repo}</strong>
                </motion.div>
              )}
            </AnimatePresence>
            {parsed && (
              <button
                className="input-submit"
                type="submit"
                aria-label="Open repository"
                disabled={phase === "submitting"}
              >
                {phase === "submitting" ? (
                  <Check size={19} />
                ) : (
                  <ArrowRight size={19} />
                )}
              </button>
            )}
          </div>
          <div id="url-status" className="input-note" role="status">
            {phase === "invalid"
              ? "Enter a valid https://github.com/owner/repository URL."
              : parsed
                ? "URL recognized · Repository existence not yet verified"
                : "Paste a link, then press Enter"}
            <kbd>↵</kbd>
          </div>
        </form>
        <button
          className="demo-link"
          disabled={departing}
          onClick={() => {
            setPhase("demo-transition");
            timer.current = setTimeout(
              () => navigate("/explore/demo"),
              reduced ? 0 : 600,
            );
          }}
        >
          Explore interactive demo <span>↗</span>
        </button>
      </motion.section>
      <footer className="void-footer">
        <span>TEAM CODE BLOODED</span>
        <span>VIT CODE APEX 3.0</span>
      </footer>
    </main>
  );
}

function TransitionConstellation() {
  const positions = sphericalLayout(demoGraph.nodes);
  return (
    <motion.svg
      className="transition-stars"
      viewBox="0 0 1000 800"
      aria-hidden="true"
      initial={{ opacity: 0, scale: 0.04 }}
      animate={{ opacity: 0.6, scale: 1 }}
      transition={{ duration: 1.2, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {demoGraph.edges.map((e) => {
        const a = positions.get(e.source)!;
        const b = positions.get(e.target)!;
        return (
          <line
            key={e.id}
            x1={500 + a[0] * 70}
            y1={400 - a[1] * 70}
            x2={500 + b[0] * 70}
            y2={400 - b[1] * 70}
            stroke="white"
            strokeOpacity=".13"
            strokeWidth=".6"
          />
        );
      })}
      {demoGraph.nodes.map((n) => {
        const p = positions.get(n.id)!;
        return (
          <circle
            key={n.id}
            cx={500 + p[0] * 70}
            cy={400 - p[1] * 70}
            r={n.type === "module" ? 2 : 1}
            fill="white"
          />
        );
      })}
    </motion.svg>
  );
}
