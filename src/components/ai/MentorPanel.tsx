import type { AICredentials } from "../../../shared/ai";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { Panel } from "../shared/Panel";
import { SourceCitation } from "../code/SourceCitation";
import { adapterFor, isDemo } from "../../services/adapters";
import { LIMITS } from "../../../shared/limits";
import type { MentorResponse, RepositoryGraph } from "../../types/repository";
import { useExperience } from "../../stores/experienceStore";
type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: MentorResponse };
export default function MentorPanel({ graph }: { graph: RepositoryGraph }) {
  const [credentials, setCredentials] = useState<AICredentials | null>(null);
  const [provider, setProvider] = useState<AICredentials["provider"]>("gemini");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const demo = isDemo(graph);
  const [error, setError] = useState("");
  const selected = useExperience((s) => s.selected);
  const node = graph.nodes.find((n) => n.id === selected);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const last = useRef("");
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, state]);
  const ask = async (text: string) => {
    if (
      (!demo && !credentials) ||
      !text.trim() ||
      text.length > LIMITS.questionChars ||
      state === "loading"
    )
      return;
    last.current = text;
    setQuestion("");
    setMessages((m) => [...m.slice(-19), { role: "user", text }]);
    setState("loading");
    request.current = new AbortController();
    try {
      const response = await adapterFor(graph).askMentor(
        graph.repository.id,
        text,
        selected ?? undefined,
        request.current.signal,
        credentials ?? undefined,
      );
      setMessages((m) => [...m.slice(-19), { role: "assistant", response }]);
      setState("idle");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setError((error as Error).message);
        if (
          (error as { code?: string }).code === "AI_KEY_INVALID" ||
          (error as { code?: string }).code === "AI_KEY_REQUIRED"
        )
          setCredentials(null);
        setState("error");
      }
    }
  };
  return (
    <Panel
      title="AI Mentor"
      subtitle={
        demo ? "PREVIEW · PREWRITTEN DEMONSTRATIONS" : "SOURCE-BASED ANSWERS"
      }
      className="mentor-panel"
    >
      <div className="mentor-context">
        <span className="evidence-dot" />
        <span>
          {node
            ? node.path
            : `${graph.repository.owner} / ${graph.repository.name}`}
        </span>
      </div>
      {!demo && !credentials ? (
        <form
          className="mentor-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !/^[!-~]{16,512}$/.test(apiKey.trim()) ||
              !/^[a-zA-Z0-9._-]{1,100}$/.test(model.trim())
            ) {
              setError("Enter a valid API key and model ID.");
              return;
            }
            setCredentials({
              provider,
              model: model.trim(),
              apiKey: apiKey.trim(),
            });
            setApiKey("");
            setError("");
            setState("idle");
          }}
        >
          <h3>Use your own AI account</h3>
          <p>
            AI requests use your provider account and its quota or billing. Your
            key is sent securely through RepoMentor’s backend to your provider
            for each question. It is not saved to our database or browser
            storage, and is cleared when you close this panel.
          </p>
          <label>
            Provider
            <select
              aria-label="AI provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as AICredentials["provider"]);
                setApiKey("");
                setModel("");
              }}
            >
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label>
            Model ID
            <input
              aria-label="AI model ID"
              placeholder="Exact model ID from your provider"
              value={model}
              maxLength={100}
              onChange={(e) => setModel(e.target.value)}
              required
            />
          </label>
          <label>
            API key
            <input
              aria-label="Your AI API key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              value={apiKey}
              maxLength={512}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Use my key
          </button>
          {error && <p role="alert">{error}</p>}
          <a
            href={
              provider === "gemini"
                ? "https://aistudio.google.com/apikey"
                : "https://platform.openai.com/api-keys"
            }
            target="_blank"
            rel="noreferrer"
          >
            Get a {provider === "gemini" ? "Gemini" : "OpenAI"} API key ↗
          </a>
        </form>
      ) : (
        <>
          {!demo && credentials && (
            <div className="mentor-key-status">
              <span>
                {credentials.provider === "gemini" ? "Gemini" : "OpenAI"} · Your
                account
              </span>
              <button
                className="text-button"
                onClick={() => {
                  request.current?.abort();
                  setCredentials(null);
                  setApiKey("");
                  setMessages([]);
                  setError("");
                  setState("idle");
                }}
              >
                Change / remove key
              </button>
            </div>
          )}
          <div className="mentor-messages" aria-live="polite">
            {!messages.length && (
              <div className="mentor-welcome">
                <MessageCircle size={26} strokeWidth={1} />
                <h3>Follow your curiosity.</h3>
                <p>
                  {demo
                    ? "Explore the local sample with evidence-linked demonstration answers."
                    : "Select a file for focused answers. Each question sends up to three short source excerpts to the AI provider."}
                </p>
                <div className="suggestions">
                  {[
                    "What is the entry point?",
                    "How are these files connected?",
                    "What does this function do?",
                    "What should I explore first?",
                  ].map((q) => (
                    <button key={q} onClick={() => void ask(q)}>
                      {q}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, i) => (
              <div key={i} className={`mentor-message ${message.role}`}>
                <span className="eyebrow">
                  {message.role === "user"
                    ? "YOU"
                    : demo
                      ? "MENTOR · DEMO"
                      : "MENTOR"}
                </span>
                <p>
                  {message.role === "user"
                    ? message.text
                    : message.response.answer}
                </p>
                {message.role === "assistant" && (
                  <>
                    <div className="citations">
                      {message.response.citations.map((c) => (
                        <SourceCitation key={c.evidenceId} citation={c} />
                      ))}
                    </div>
                    {message.response.uncertain && (
                      <small className="muted">
                        No supporting evidence for this question.
                      </small>
                    )}
                  </>
                )}
              </div>
            ))}
            {state === "loading" && (
              <div className="mentor-loading">
                <LoaderCircle size={14} className="spin" />
                {demo
                  ? "Loading demo response…"
                  : "Reading selected source and preparing an answer…"}
              </div>
            )}
            {state === "error" && (
              <div className="mentor-error" role="alert">
                <p>{demo ? "The demo response could not be loaded." : error}</p>
                <button onClick={() => void ask(last.current)}>
                  <RotateCcw size={13} />
                  Try again
                </button>
              </div>
            )}
            <div ref={end} />
          </div>
          <form
            className="mentor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              aria-label={
                demo ? "Ask about the demo" : "Ask about the repository"
              }
              maxLength={LIMITS.questionChars}
              placeholder="Ask about this code…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={state === "loading"}
            />
            <button
              aria-label="Send question"
              disabled={!question.trim() || state === "loading"}
            >
              <ArrowUp size={17} />
            </button>
          </form>
          <p className="mentor-disclaimer">
            {demo
              ? "Local demo only. No LLM requests are sent."
              : "AI can make mistakes. Verify the cited lines. Chat history is cleared when this panel closes."}
          </p>
        </>
      )}
    </Panel>
  );
}
