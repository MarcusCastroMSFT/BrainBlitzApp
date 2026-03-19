import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Play, Pencil, HelpCircle, Zap } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Quiz {
  id: string;
  title: string;
  theme: string;
  questionCount: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

// APP_BASE is read from toolOutput.appBaseUrl (set by the MCP server from env).
// Falls back to localhost for local dev only.
let APP_BASE = "http://localhost:5173";
try {
  const out = (window as any).openai?.toolOutput as Record<string, unknown> | undefined;
  if (typeof out?.appBaseUrl === "string" && out.appBaseUrl) {
    APP_BASE = out.appBaseUrl.replace(/\/$/, "");
  }
} catch { /* ignore */ }

const THEME_CFG: Record<string, { icon: string; bg: string; accent: string }> = {
  classic: { icon: "🧠", bg: "bg-violet-50",  accent: "text-violet-600" },
  space:   { icon: "🚀", bg: "bg-blue-50",    accent: "text-blue-600" },
  ocean:   { icon: "🌊", bg: "bg-cyan-50",    accent: "text-cyan-600" },
  forest:  { icon: "🌳", bg: "bg-green-50",   accent: "text-green-600" },
  neon:    { icon: "⚡", bg: "bg-fuchsia-50",  accent: "text-fuchsia-600" },
};
const DEFAULT_CFG = { icon: "🎮", bg: "bg-violet-50", accent: "text-violet-600" };

// ── Helpers ──────────────────────────────────────────────────────────────────

function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (window.openai?.callTool) {
    return window.openai.callTool(name, args);
  }
  return new Promise((resolve, reject) => {
    const id = "r" + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => reject(new Error("timeout")), 12_000);
    function onMessage(event: MessageEvent) {
      const msg = event.data;
      if (msg?.jsonrpc !== "2.0" || msg.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      msg.error ? reject(msg.error) : resolve(msg.result);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
      "*"
    );
  });
}

function openNav(url: string) {
  if (window.openai?.openExternal) {
    window.openai.openExternal({ href: url });
    return;
  }
  if (window.openai?.sendFollowUpMessage) {
    window.openai.sendFollowUpMessage({ prompt: `Please open this URL: ${url}` });
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const out = window.openai?.toolOutput as Record<string, unknown> | undefined;
    if (out?.quizzes) { setQuizzes(out.quizzes as Quiz[]); return; }

    const state = window.openai?.widgetState as Record<string, unknown> | undefined;
    if (state?.quizzes) { setQuizzes(state.quizzes as Quiz[]); return; }

    callTool("show_quizzes", {})
      .then((result) => {
        const sc = (result as { structuredContent?: { quizzes?: Quiz[] } })?.structuredContent;
        setQuizzes(sc?.quizzes ?? []);
        window.openai?.setWidgetState?.({ quizzes: sc?.quizzes ?? [] });
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    function handleGlobals(event: Event) {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: { quizzes?: Quiz[] } } }>).detail;
      const qs = detail?.globals?.toolOutput?.quizzes;
      if (qs) setQuizzes(qs);
    }
    function handleMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0") return;
      if (msg.method === "ui/notifications/tool-result") {
        const sc = msg.params?.structuredContent as { quizzes?: Quiz[] } | undefined;
        if (sc?.quizzes) setQuizzes(sc.quizzes);
      }
    }
    window.addEventListener("openai:set_globals", handleGlobals as EventListener, { passive: true });
    window.addEventListener("message", handleMessage, { passive: true });
    return () => {
      window.removeEventListener("openai:set_globals", handleGlobals as EventListener);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="antialiased w-full text-black px-4 pb-2 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="py-8 text-center text-sm text-black/50">
          Failed to load quizzes: {error}
        </div>
      </div>
    );
  }

  if (quizzes === null) {
    return (
      <div className="antialiased w-full text-black px-4 pb-2 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="py-8 flex flex-col items-center gap-2">
          <Spinner />
          <div className="text-sm text-black/40">Loading…</div>
        </div>
      </div>
    );
  }

  if (quizzes.length === 0) {
    return (
      <div className="antialiased w-full text-black px-4 pb-2 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="py-8 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <div className="text-sm text-black/50">No quizzes yet — ask me to create one!</div>
        </div>
      </div>
    );
  }

  const totalQuestions = quizzes.reduce((s, q) => s + q.questionCount, 0);

  return (
    <div className="antialiased w-full text-black px-4 pb-2 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
      <div className="max-w-full">
        {/* ── Header ── */}
        <div className="flex flex-row items-center gap-4 border-b border-black/5 py-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm">
            <Zap className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base sm:text-lg font-semibold">Brain Blitz</div>
            <div className="text-sm text-black/50">
              {quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""} · {totalQuestions} question{totalQuestions !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* ── Quiz list ── */}
        <div className="min-w-full text-sm flex flex-col">
          {quizzes.map((quiz, i) => (
            <QuizRow
              key={quiz.id}
              quiz={quiz}
              isLast={i === quizzes.length - 1}
              onHost={() => openNav(`${APP_BASE}/host/${quiz.id}`)}
              onEdit={() => openNav(`${APP_BASE}/edit/${quiz.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── QuizRow ──────────────────────────────────────────────────────────────────

function QuizRow({
  quiz,
  isLast,
  onHost,
  onEdit,
}: {
  quiz: Quiz;
  isLast: boolean;
  onHost: () => void;
  onEdit: () => void;
}) {
  const cfg = THEME_CFG[quiz.theme] ?? DEFAULT_CFG;
  const sub = `${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"}`;

  return (
    <div className="px-1 -mx-1 rounded-2xl hover:bg-black/[0.03] transition-colors">
      <div
        style={{
          borderBottom: isLast ? "none" : "1px solid rgba(0, 0, 0, 0.05)",
        }}
        className="flex w-full items-center hover:border-black/0! gap-2"
      >
        {/* Icon + info */}
        <div className="py-3 pr-2 min-w-0 w-full sm:w-3/5">
          <div className="flex items-center gap-3">
            <div
              className={`${cfg.bg} flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg ring-1 ring-black/5`}
            >
              {cfg.icon}
            </div>
            <div className="min-w-0 flex flex-col items-start">
              <div className="font-medium text-sm sm:text-[15px] truncate max-w-[40ch]">
                {quiz.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-black/50 text-xs">
                <div className="flex items-center gap-1">
                  <HelpCircle strokeWidth={1.5} className="h-3 w-3 text-black/40" />
                  <span>{sub}</span>
                </div>
                <span className={`capitalize text-xs ${cfg.accent}`}>{quiz.theme}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="py-2 whitespace-nowrap flex justify-end gap-1.5">
          <Button color="primary" variant="solid" size="sm" onClick={onHost}>
            <Play strokeWidth={2} className="h-3.5 w-3.5 mr-1 -ml-0.5" aria-hidden="true" />
            Host
          </Button>
          <Button color="secondary" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil strokeWidth={1.5} className="h-3.5 w-3.5 mr-1 -ml-0.5" aria-hidden="true" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-violet-500" />
  );
}

// ── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("quiz-browser-root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
