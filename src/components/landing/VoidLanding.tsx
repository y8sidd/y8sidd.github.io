import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { ArrowRight, Search, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { parseGitHubUrl } from "../../lib/githubUrl";

type InputPhase =
  "idle" | "editing" | "parsed" | "invalid" | "submitting" | "demo-transition";

export default function VoidLanding() {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<InputPhase>("idle");
  const [pasteSequence, setPasteSequence] = useState(0);
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const parsed = parseGitHubUrl(value);
  const departing = phase === "submitting" || phase === "demo-transition";
  const lightX = useSpring(50, { stiffness: 110, damping: 24 });
  const lightY = useSpring(0, { stiffness: 110, damping: 24 });
  const reflection = useMotionTemplate`radial-gradient(ellipse at ${lightX}% ${lightY}%, #ffffff24, transparent 65%)`;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const depart = (destination: string, nextPhase: InputPhase) => {
    if (departing || timer.current) return;
    // Warm the scene while the glass dissolves so navigation stays continuous.
    void import("../../app/Explore");
    void import("../constellation/ConstellationCanvas");
    setPhase(nextPhase);
    input.current?.blur();
    timer.current = setTimeout(() => navigate(destination), reduced ? 0 : 950);
  };
  const submit = () => {
    if (departing) return;
    if (!parsed) {
      input.current?.focus();
      setPhase("invalid");
      return;
    }
    depart(`/explore/${parsed.owner}/${parsed.repo}`, "submitting");
  };

  return (
    <main className="void-page">
      <motion.section
        className="void-center"
        aria-label="Open a repository"
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={
          departing
            ? {
                opacity: 0,
                y: reduced ? 0 : -8,
                scale: reduced ? 1 : 0.97,
                filter: reduced ? "none" : "blur(8px)",
              }
            : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
        }
        transition={{
          duration: reduced ? 0 : 0.7,
          delay: departing && !reduced ? 0.25 : 0,
        }}
      >
        <h1 className="sr-only">Enter a repository.</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="repo-form"
        >
          <motion.div
            className={`repository-input ${phase === "invalid" ? "invalid" : ""} ${phase === "submitting" ? "confirmed" : ""}`}
            whileHover={reduced || departing ? undefined : { scale: 1.008 }}
            whileTap={reduced || departing ? undefined : { scale: 0.996 }}
            transition={{ type: "spring", stiffness: 250, damping: 25 }}
            onPointerMove={(event) => {
              if (reduced || departing) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              lightX.set(((event.clientX - bounds.left) / bounds.width) * 100);
              lightY.set(((event.clientY - bounds.top) / bounds.height) * 100);
            }}
            onPointerLeave={() => {
              lightX.set(50);
              lightY.set(0);
            }}
          >
            <motion.span
              className="glass-reflection"
              style={{ background: reflection }}
              aria-hidden="true"
            />
            <AnimatePresence>
              {pasteSequence > 0 && !reduced && (
                <motion.span
                  key={pasteSequence}
                  className="glass-ripple"
                  aria-hidden="true"
                  initial={{ opacity: 0, x: "-100%" }}
                  animate={{ opacity: [0, 0.65, 0], x: "100%" }}
                  transition={{ duration: 1.15, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>
            <Search
              size={23}
              strokeWidth={1.5}
              className="repository-search-icon"
              aria-hidden="true"
            />
            <input
              ref={input}
              aria-label="GitHub repository URL"
              aria-describedby="url-status"
              aria-invalid={phase === "invalid"}
              value={value}
              placeholder="Paste a GitHub repository link..."
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={departing}
              style={{
                opacity: phase === "parsed" || phase === "submitting" ? 0 : 1,
              }}
              onFocus={() => {
                if (!departing) setPhase("editing");
              }}
              onBlur={() => {
                setPhase((current) =>
                  current === "submitting" || current === "demo-transition"
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
              onKeyDown={(event) => {
                if (
                  phase === "parsed" &&
                  event.key !== "Enter" &&
                  event.key !== "Tab"
                )
                  setPhase("editing");
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (parseGitHubUrl(pasted)) {
                  e.preventDefault();
                  setValue(pasted.trim());
                  setPhase("parsed");
                  setPasteSequence((sequence) => sequence + 1);
                }
              }}
            />
            <AnimatePresence>
              {parsed && (phase === "parsed" || phase === "submitting") && (
                <motion.div
                  className="parsed-identity"
                  initial={{
                    opacity: 0,
                    x: reduced ? 0 : 12,
                    filter: reduced ? "none" : "blur(4px)",
                  }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: reduced ? 0 : -8 }}
                  transition={{ duration: reduced ? 0 : 0.35 }}
                  onClick={() => {
                    if (departing) return;
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
            <AnimatePresence>
              {parsed && (
                <motion.button
                  className="input-submit"
                  type="submit"
                  aria-label="Open repository"
                  disabled={departing}
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {phase === "submitting" ? (
                    <Check size={19} />
                  ) : (
                    <ArrowRight size={19} />
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
          <div
            id="url-status"
            className={`input-note ${phase === "invalid" ? "input-error" : ""}`}
            role="status"
          >
            {phase === "invalid"
              ? "Enter a valid https://github.com/owner/repository URL."
              : parsed
                ? "Press Enter to explore · Demo preview"
                : "Paste a link, then press Enter"}
          </div>
        </form>
        <button
          className="demo-link"
          disabled={departing}
          onClick={() => depart("/explore/demo", "demo-transition")}
        >
          Explore interactive demo <span>↗</span>
        </button>
      </motion.section>
    </main>
  );
}
