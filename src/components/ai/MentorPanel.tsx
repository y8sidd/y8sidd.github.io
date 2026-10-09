import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { Panel } from "../shared/Panel";
import { SourceCitation } from "../code/SourceCitation";
import { mockRepositoryAdapter } from "../../services/mockRepositoryAdapter";
import type { MentorResponse, RepositoryGraph } from "../../types/repository";
import { useExperience } from "../../stores/experienceStore";
type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: MentorResponse };
export default function MentorPanel({ graph }: { graph: RepositoryGraph }) {
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
    if (!text.trim() || state === "loading") return;
    last.current = text;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text }]);
    setState("loading");
    request.current = new AbortController();
    try {
      const response = await mockRepositoryAdapter.askMentor(
        graph.repository.id,
        text,
        selected ?? undefined,
        request.current.signal,
      );
      setMessages((m) => [...m, { role: "assistant", response }]);
      setState("idle");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setState("error");
    }
  };
  return (
    <Panel
      title="AI Mentor"
      subtitle="PREVIEW · PREWRITTEN DEMONSTRATIONS"
      className="mentor-panel"
    >
      <div className="mentor-context">
        <span className="evidence-dot" />
        <span>{node ? node.path : "demo / constellation-app"}</span>
      </div>
      <div className="mentor-messages" aria-live="polite">
        {!messages.length && (
          <div className="mentor-welcome">
            <MessageCircle size={26} strokeWidth={1} />
            <h3>Follow your curiosity.</h3>
            <p>
              Explore the local sample with evidence-linked demonstration
              answers.
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
              {message.role === "user" ? "YOU" : "MENTOR · DEMO"}
            </span>
            <p>
              {message.role === "user" ? message.text : message.response.answer}
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
            Loading demo response…
          </div>
        )}
        {state === "error" && (
          <div className="mentor-error" role="alert">
            <p>The demo response could not be loaded.</p>
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
          aria-label="Ask about the demo"
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
        Local demo only. No LLM requests are sent.
      </p>
    </Panel>
  );
}
