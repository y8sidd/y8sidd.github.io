import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  useAnimationControls,
} from "motion/react";
import { Github, Search, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  LandingBrand,
  RepositoryName,
  handoffDuration,
  handoffEase,
} from "./TransitionIdentity";
import { parseGitHubUrl, type ParsedRepository } from "../../lib/githubUrl";
import { LandingConstellation } from "./LandingConstellation";

type InputPhase =
  | "idle"
  | "editing"
  | "parsed"
  | "invalid"
  | "checking"
  | "error"
  | "submitting";
const splitTransition = { duration: 1.05, ease: [0.22, 1, 0.36, 1] as const };

export default function VoidLanding({
  onTransitionStart,
  onTransitionComplete,
}: {
  onTransitionStart?: (repository: ParsedRepository) => void;
  onTransitionComplete?: () => void;
}) {
  const brand = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const [destination, setDestination] = useState({
    brandY: 0,
    formY: 0,
    width: 600,
    nameX: 0,
  });
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<InputPhase>("idle");
  const [pasteSequence, setPasteSequence] = useState(0);
  const [error, setError] = useState("");
  const shake = useAnimationControls();
  const request = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const reduced = !!useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const parsed = parseGitHubUrl(value);
  const departing = phase === "submitting";
  const checking = phase === "checking";
  const busy = checking || departing;
  const split = !!parsed && (phase === "parsed" || checking || departing);
  const lightX = useSpring(50, { stiffness: 110, damping: 24 });
  const lightY = useSpring(0, { stiffness: 110, damping: 24 });
  const reflection = useMotionTemplate`radial-gradient(ellipse at ${lightX}% ${lightY}%, #ffffff26, transparent 65%)`;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  // Let manual typing pause before recognizing the URL; pastes split immediately.
  useEffect(() => {
    if (!parseGitHubUrl(value)) return;
    const detect = setTimeout(
      () => setPhase((current) => (current === "editing" ? "parsed" : current)),
      650,
    );
    return () => clearTimeout(detect);
  }, [value]);

  useEffect(() => {
    if (phase === "invalid" || phase === "error") input.current?.focus();
  }, [phase]);

  const reject = (message: string, invalid = true) => {
    setError(message);
    setPhase(invalid ? "invalid" : "error");
    if (!reduced)
      void shake.start({
        x: [0, -6, 5, -4, 3, 0],
        transition: { duration: 0.42 },
      });
    input.current?.focus();
  };
  const submit = async () => {
    if (busy || timer.current || request.current) return;
    if (!parsed) {
      reject("Enter a valid GitHub link or username/repository.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPhase("checking");
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/vnd.github+json" },
          credentials: "omit",
        },
      );
      if (request.current !== controller) return;
      if (!response.ok) {
        if (response.status === 404)
          reject(
            "Repository not found or private. Enter a valid public GitHub link or username/repository.",
          );
        else if (response.status === 403 || response.status === 429)
          reject(
            "GitHub is limiting checks right now. Please try again shortly.",
            false,
          );
        else
          reject(
            "GitHub could not verify this repository. Please try again.",
            false,
          );
        return;
      }
      clearTimeout(timeout);
      try {
        await Promise.all([
          import("../../app/Explore"),
          import("../constellation/ConstellationCanvas"),
        ]);
      } catch {
        if (request.current === controller)
          reject("Could not prepare the preview. Please try again.", false);
        return;
      }
      if (request.current !== controller) return;
    } catch {
      if (request.current !== controller) return;
      reject(
        "Could not reach GitHub. Check your connection and try again.",
        false,
      );
      return;
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }

    const top = window.innerWidth <= 760 ? 20 : 32;
    const width = Math.min(420, window.innerWidth - 48);
    const height =
      window.innerHeight <= 540 ? 44 : window.innerWidth <= 760 ? 48 : 52;
    const bottom = window.innerHeight <= 540 ? 54 : 80;
    setDestination({
      brandY: top - (brand.current?.getBoundingClientRect().top ?? top),
      formY:
        window.innerHeight -
        bottom -
        height -
        (form.current?.getBoundingClientRect().top ?? 0),
      width,
      nameX: Math.max(
        0,
        (width - 48 - (name.current?.getBoundingClientRect().width ?? 0)) / 2,
      ),
    });
    setPhase("submitting");
    input.current?.blur();
    onTransitionStart?.(parsed);
    timer.current = setTimeout(
      () => {
        if (onTransitionComplete) onTransitionComplete();
        else navigate(`/explore/${parsed.owner}/${parsed.repo}`);
      },
      reduced ? 0 : handoffDuration * 1000,
    );
  };
  const edit = () => {
    if (departing) return;
    setPhase("editing");
    input.current?.focus();
    input.current?.select();
  };

  return (
    <main
      className={`gamma-landing ${departing ? "is-departing" : ""}`}
      style={
        { "--handoff-duration": `${handoffDuration}s` } as React.CSSProperties
      }
    >
      <div className="gamma-sky">
        <LandingConstellation departing={departing} />
      </div>
      <motion.section
        className="void-center gamma-hero"
        aria-label="Open a repository"
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          ref={brand}
          className="gamma-brand-group"
          animate={{ y: departing ? destination.brandY : 0 }}
          transition={{
            duration: reduced ? 0 : handoffDuration,
            ease: handoffEase,
          }}
        >
          <LandingBrand />
        </motion.div>
        <h1 aria-label="Every repository has a universe. Explore it.">
          <motion.span
            className="gamma-headline-line"
            animate={{
              x: departing && !reduced ? "85vw" : 0,
              opacity: departing ? 0 : 1,
            }}
            transition={{
              duration: reduced ? 0 : handoffDuration,
              ease: handoffEase,
            }}
          >
            Every repository has a
          </motion.span>
          <motion.span
            className="gamma-headline-line"
            animate={{
              x: departing && !reduced ? "-85vw" : 0,
              opacity: departing ? 0 : 1,
            }}
            transition={{
              duration: reduced ? 0 : handoffDuration,
              ease: handoffEase,
            }}
          >
            <span className="gamma-universe">universe.</span> Explore it.
          </motion.span>
        </h1>
        <motion.form
          ref={form}
          animate={
            departing
              ? { y: destination.formY, width: destination.width }
              : { y: 0 }
          }
          transition={{
            duration: reduced ? 0 : handoffDuration,
            ease: handoffEase,
          }}
          className={`gamma-repo-form ${split ? "is-split" : ""}`}
          aria-busy={checking}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <motion.div
            animate={shake}
            className={`gamma-glass repository-input ${phase === "invalid" ? "invalid" : ""}`}
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
              className="gamma-glass-reflection"
              style={{ background: reflection }}
              aria-hidden="true"
            />
            {(pasteSequence > 0 || departing) && !reduced && (
              <motion.span
                key={`${pasteSequence}-${departing}`}
                className="gamma-glass-ripple"
                aria-hidden="true"
                initial={{ opacity: 0, x: "-100%" }}
                animate={{ opacity: [0, 0.55, 0], x: "100%" }}
                transition={{
                  duration: departing ? handoffDuration : 1.25,
                  ease: "easeOut",
                }}
              />
            )}
            <motion.span
              className="gamma-input-icon"
              aria-hidden="true"
              animate={{ opacity: departing ? 0 : 1 }}
              transition={{ duration: reduced ? 0 : 0.5 }}
            >
              <motion.span
                animate={{ opacity: split ? 0 : 1, scale: split ? 0.8 : 1 }}
                transition={{ duration: reduced ? 0 : 0.35 }}
              >
                <Search size={22} strokeWidth={1.4} />
              </motion.span>
              <motion.span
                animate={{ opacity: split ? 1 : 0, scale: split ? 1 : 0.8 }}
                transition={{ duration: reduced ? 0 : 0.45 }}
              >
                <Github size={21} strokeWidth={1.4} />
              </motion.span>
            </motion.span>
            <input
              ref={input}
              aria-label="GitHub repository URL"
              aria-describedby="url-status"
              aria-invalid={phase === "invalid"}
              value={value}
              placeholder="GitHub link or username/repository"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              style={{ opacity: split ? 0 : 1 }}
              onFocus={() => {
                if (!departing)
                  setPhase((current) =>
                    current === "invalid" ||
                    current === "error" ||
                    current === "checking"
                      ? current
                      : "editing",
                  );
              }}
              onBlur={() =>
                setPhase((current) =>
                  current === "submitting" ||
                  current === "checking" ||
                  current === "invalid" ||
                  current === "error"
                    ? current
                    : parsed
                      ? "parsed"
                      : value
                        ? "invalid"
                        : "idle",
                )
              }
              onChange={(event) => {
                setError("");
                setValue(event.target.value);
                setPhase("editing");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                  return;
                }
                if (split && event.key !== "Enter" && event.key !== "Tab")
                  setPhase("editing");
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (!parseGitHubUrl(pasted)) return;
                event.preventDefault();
                setError("");
                setValue(pasted.trim());
                setPhase("parsed");
                setPasteSequence((sequence) => sequence + 1);
              }}
            />
            <AnimatePresence>
              {parsed && (
                <motion.button
                  className="parsed-identity"
                  type="button"
                  tabIndex={-1}
                  aria-label="Edit repository URL"
                  title={`${parsed.owner} / ${parsed.repo} — click to edit`}
                  disabled={busy}
                  initial={{
                    opacity: 0,
                    x: reduced ? 0 : 8,
                    filter: reduced ? "none" : "blur(4px)",
                  }}
                  animate={{
                    opacity: split ? 1 : 0,
                    x: 0,
                    filter: "blur(0px)",
                  }}
                  style={{ pointerEvents: split ? "auto" : "none" }}
                  exit={{ opacity: 0, x: reduced ? 0 : -6 }}
                  transition={{
                    duration: reduced ? 0 : 0.45,
                    delay: reduced ? 0 : 0.12,
                  }}
                  onClick={edit}
                >
                  <motion.span
                    ref={name}
                    className="gamma-repo-name"
                    animate={{ x: departing ? destination.nameX : 0 }}
                    transition={{
                      duration: reduced ? 0 : handoffDuration,
                      ease: handoffEase,
                    }}
                  >
                    <RepositoryName owner={parsed.owner} repo={parsed.repo} />
                  </motion.span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
          {/* Only the transient neck is distorted; input text remains sharp. */}
          <AnimatePresence>
            {split && !reduced && !departing && (
              <motion.svg
                className="gamma-liquid-neck"
                viewBox="0 0 60 76"
                preserveAspectRatio="none"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.7, 0.4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, times: [0, 0.12, 0.5, 1] }}
              >
                <motion.path
                  fill="#ffffff10"
                  stroke="#ffffff30"
                  strokeWidth="0.8"
                  initial={{
                    d: "M0 13 C20 20 40 20 60 13 L60 63 C40 56 20 56 0 63 Z",
                  }}
                  animate={{
                    d: [
                      "M0 13 C20 20 40 20 60 13 L60 63 C40 56 20 56 0 63 Z",
                      "M0 21 C20 39 40 39 60 21 L60 55 C40 37 20 37 0 55 Z",
                      "M0 33 C20 38 40 38 60 33 L60 43 C40 38 20 38 0 43 Z",
                    ],
                  }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
          <motion.button
            className="gamma-glass gamma-search-bubble"
            type="submit"
            aria-label="Open repository"
            disabled={!split || busy}
            tabIndex={split ? 0 : -1}
            initial={false}
            animate={{
              opacity: split && !departing ? 1 : 0,
              x: split ? 0 : -26,
              scale: split ? 1 : 0.72,
            }}
            transition={
              reduced
                ? { duration: 0 }
                : departing
                  ? { duration: 0.45 }
                  : splitTransition
            }
            whileHover={reduced || departing ? undefined : { scale: 1.055 }}
            whileTap={reduced || departing ? undefined : { scale: 0.96 }}
            style={{ pointerEvents: split ? "auto" : "none" }}
          >
            {checking ? (
              <LoaderCircle className="gamma-check-spinner" size={24} />
            ) : (
              <Search size={25} strokeWidth={1.5} />
            )}
          </motion.button>
          <p
            id="url-status"
            role="status"
            className={
              phase === "invalid" || phase === "error"
                ? "gamma-input-error"
                : "sr-only"
            }
          >
            {checking
              ? "Checking repository on GitHub…"
              : phase === "invalid" || phase === "error"
                ? error || "Enter a valid GitHub link or username/repository."
                : split && parsed
                  ? `${parsed.owner} / ${parsed.repo} recognized. Press Enter or Search to open the demo preview.`
                  : "Enter a GitHub link or username/repository, then press Enter."}
          </p>
        </motion.form>
      </motion.section>
    </main>
  );
}
