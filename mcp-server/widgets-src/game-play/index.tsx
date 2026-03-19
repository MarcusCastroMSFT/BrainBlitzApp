import React, { useEffect, useReducer, useRef, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

// ── Domain types ─────────────────────────────────────────────────────────────

interface Answer    { id: string; text: string }
interface Question  { text: string; answers: Answer[]; questionIndex: number; totalQuestions: number; timeLimit: number; imageUrl?: string }
interface RevealPayload { correctAnswerId: string; playerResults: Record<string, { correct: boolean; points: number; totalScore: number }> }
interface LBEntry    { playerId: string; name: string; rank: number; score: number }
interface PodiumEntry { playerId: string; name: string; rank: number; score: number }

// ── Game state ────────────────────────────────────────────────────────────────

type Phase =
  | { kind: "connecting" }
  | { kind: "lobby";       playerCount: number; quizTitle: string }
  | { kind: "question";    q: Question; timeLeft: number; answerId: string | null; startedAt: number }
  | { kind: "answered";    q: Question; answerId: string; answerTimeMs: number }
  | { kind: "reveal";      q: Question; correctId: string; result: { correct: boolean; points: number; total: number } | null; tooSlow: boolean }
  | { kind: "leaderboard"; entries: LBEntry[] }
  | { kind: "finished";    podium: PodiumEntry[]; myRank: number | null; myScore: number | null; myPlace: string }
  | { kind: "error";       message: string };

type Action =
  | { type: "CONNECTING" }
  | { type: "LOBBY";       playerCount: number; quizTitle: string }
  | { type: "QUESTION";    q: Question }
  | { type: "TICK" }
  | { type: "ANSWER";      answerId: string }
  | { type: "REVEAL";      payload: RevealPayload; myPlayerId: string; prevQuestion: Question | null; prevAnswerId: string | null }
  | { type: "LEADERBOARD"; entries: LBEntry[] }
  | { type: "FINISHED";    podium: PodiumEntry[]; myPlayerId: string }
  | { type: "ERROR";       message: string };

function reducer(state: Phase, action: Action): Phase {
  switch (action.type) {
    case "CONNECTING":
      return { kind: "connecting" };
    case "LOBBY":
      return { kind: "lobby", playerCount: action.playerCount, quizTitle: action.quizTitle };
    case "QUESTION":
      return { kind: "question", q: action.q, timeLeft: action.q.timeLimit, answerId: null, startedAt: Date.now() };
    case "TICK":
      if (state.kind !== "question") return state;
      return { ...state, timeLeft: Math.max(0, state.timeLeft - 1) };
    case "ANSWER":
      if (state.kind !== "question") return state;
      return { kind: "answered", q: state.q, answerId: action.answerId, answerTimeMs: Date.now() - state.startedAt };
    case "REVEAL": {
      const myR = action.payload.playerResults[action.myPlayerId];
      const prevQ = action.prevQuestion
        ?? (state.kind === "question" ? state.q : null)
        ?? (state.kind === "answered" ? state.q : null)
        ?? { text: "", answers: [], questionIndex: 0, totalQuestions: 0, timeLimit: 10 };
      return {
        kind: "reveal",
        q: prevQ,
        correctId: action.payload.correctAnswerId,
        result: myR ? { correct: myR.correct, points: myR.points, total: myR.totalScore } : null,
        tooSlow: !action.prevAnswerId && !myR,
      };
    }
    case "LEADERBOARD":
      return { kind: "leaderboard", entries: action.entries };
    case "FINISHED": {
      const me = action.podium.find((e) => e.playerId === action.myPlayerId);
      return {
        kind: "finished",
        podium: action.podium.slice(0, 3),
        myRank: me?.rank ?? null,
        myScore: me?.score ?? null,
        myPlace: me ? `#${me.rank} · ${me.score} pts` : "",
      };
    }
    case "ERROR":
      return { kind: "error", message: action.message };
    default:
      return state;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const COLORS = ["bg-[#e21b3c]", "bg-[#1368ce]", "bg-[#d89e00]", "bg-[#26890c]"];
const ANSWER_ICONS = ["▲", "●", "■", "★"];

type ThemeName = "classic" | "ocean" | "volcano" | "forest" | "galaxy";
const THEME_BG: Record<ThemeName, string> = {
  classic: "#1e1040",
  ocean:   "#0a2e44",
  volcano: "#2c1006",
  forest:  "#0a2916",
  galaxy:  "#1e1b4b",
};
const THEME_ACCENT: Record<ThemeName, string> = {
  classic: "#a855f7",
  ocean:   "#06b6d4",
  volcano: "#f97316",
  forest:  "#84cc16",
  galaxy:  "#a78bfa",
};

function App() {
  const [phase, dispatch] = useReducer(reducer, { kind: "connecting" });
  const [theme, setTheme] = useState<ThemeName>("classic");
  const socketRef    = useRef<SocketIO.Socket | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const myPlayerRef  = useRef("");
  const prevQRef     = useRef<Question | null>(null);
  const prevAnsRef   = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const codeRef      = useRef("");  // persists the PIN for answer submissions
  const gameServerUrlRef = useRef("http://localhost:3001");
  const dataRef      = useRef<{ code: string; name: string; url: string } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Core connect logic — called from form submit OR auto-triggered by toolOutput.
  const connect = useCallback((code: string, name: string, gameServerUrl: string) => {
    if (connectedRef.current || socketRef.current) return;
    dataRef.current = { code, name, url: gameServerUrl };
    if (typeof window.io === "undefined") {
      dispatch({ type: "ERROR", message: "Socket.io CDN failed to load — check your connection." });
      return;
    }
    connectedRef.current = true;
    codeRef.current = code;
    dispatch({ type: "CONNECTING" });

    const url = gameServerUrl.replace(/\/$/, "");
    let socket: SocketIO.Socket;
    try {
      // Use polling-only: Copilot's widget CSP allows https:// but blocks wss://
      socket = window.io!(url, { transports: ["polling"], reconnection: false, timeout: 8000 });
    } catch (e) {
      dispatch({ type: "ERROR", message: `Connection failed: ${String(e)}` });
      connectedRef.current = false;
      return;
    }
    socketRef.current = socket;

    const connTimeout = setTimeout(() => {
      dispatch({ type: "ERROR", message: "Timed out — could not reach game server." });
      socket.disconnect();
    }, 10_000);

    socket.once("connect", () => {
      clearTimeout(connTimeout);
      socket.emit("player_join", { code, name }, (res: { success: boolean; playerId?: string; error?: string }) => {
        if (res?.success) {
          myPlayerRef.current = res.playerId ?? "";
          setupListeners(socket);
          dispatch({ type: "LOBBY", playerCount: 0, quizTitle: "Waiting for host…" });
        } else {
          dispatch({ type: "ERROR", message: res?.error ?? "Could not join — check the PIN." });
          socket.disconnect();
          connectedRef.current = false;
          socketRef.current = null;
        }
      });
    });

    socket.on("connect_error", (err: Error) => {
      clearTimeout(connTimeout);
      dispatch({ type: "ERROR", message: err?.message ?? "Connection error." });
      connectedRef.current = false;
      socketRef.current = null;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 1: seed form fields + auto-connect when toolOutput already has code+name.
  useEffect(() => {
    const out = (window.openai?.toolOutput ?? {}) as Record<string, unknown>;
    const code    = typeof out.code    === "string" ? out.code    : "";
    const name    = typeof out.name    === "string" ? out.name    : "";
    const gameUrl = typeof out.gameServerUrl === "string" ? out.gameServerUrl : "http://localhost:3001";
    if (gameUrl) gameServerUrlRef.current = gameUrl;
    if (code && name) {
      connect(code, name, gameUrl);
    }
    // If data arrives via set_globals / postMessage later, Effect 2 handles it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: listen for deferred toolOutput delivery.
  // openai:set_globals — host pushes new window.openai values after mount.
  // ui/notifications/tool-result — MCP Apps bridge postMessage notification.
  useEffect(() => {
    function tryFromData(raw: Record<string, unknown>) {
      const code    = typeof raw.code    === "string" ? raw.code    : "";
      const name    = typeof raw.name    === "string" ? raw.name    : "";
      const gameUrl = typeof raw.gameServerUrl === "string" ? raw.gameServerUrl : gameServerUrlRef.current;
      if (gameUrl) gameServerUrlRef.current = gameUrl;
      if (code && name) connect(code, name, gameUrl);
    }
    function handleGlobals(event: Event) {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: Record<string, unknown> } }>).detail;
      if (detail?.globals?.toolOutput) tryFromData(detail.globals.toolOutput);
    }
    function handleMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0") return;
      if (msg.method === "ui/notifications/tool-result") {
        const sc = msg.params?.structuredContent as Record<string, unknown> | undefined;
        if (sc) tryFromData(sc);
      }
    }
    window.addEventListener("openai:set_globals", handleGlobals as EventListener, { passive: true });
    window.addEventListener("message", handleMessage, { passive: true });
    return () => {
      window.removeEventListener("openai:set_globals", handleGlobals as EventListener);
      window.removeEventListener("message", handleMessage);
      clearTimer();
      socketRef.current?.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRetry() {
    connectedRef.current = false;
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (dataRef.current) {
      connect(dataRef.current.code, dataRef.current.name, dataRef.current.url);
    } else {
      dispatch({ type: "ERROR", message: "No game data \u2014 go back and try again." });
    }
  }

  function setupListeners(socket: SocketIO.Socket) {
    socket.on("game_state", (state: { playerCount: number; quizTitle?: string; theme?: string }) => {
      if (state.theme && state.theme in THEME_BG) setTheme(state.theme as ThemeName);
      dispatch({ type: "LOBBY", playerCount: state.playerCount, quizTitle: state.quizTitle ?? "Waiting for host…" });
    });

    socket.on("question_start", (q: Question) => {
      clearTimer();
      prevQRef.current  = q;
      prevAnsRef.current = null;
      dispatch({ type: "QUESTION", q });
      // Countdown tick
      timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
    });

    socket.on("answer_reveal", (payload: RevealPayload) => {
      clearTimer();
      dispatch({ type: "REVEAL", payload, myPlayerId: myPlayerRef.current, prevQuestion: prevQRef.current, prevAnswerId: prevAnsRef.current });
    });

    socket.on("leaderboard", (payload: { entries: LBEntry[] }) => {
      dispatch({ type: "LEADERBOARD", entries: payload.entries });
    });

    socket.on("game_finished", (payload: { podium: PodiumEntry[] }) => {
      clearTimer();
      dispatch({ type: "FINISHED", podium: payload.podium, myPlayerId: myPlayerRef.current });
    });
  }

  function submitAnswer(answerId: string) {
    if (phase.kind !== "question" || phase.answerId) return;
    prevAnsRef.current = answerId;
    dispatch({ type: "ANSWER", answerId });
    clearTimer();
    socketRef.current?.emit("player_answer", {
      code: codeRef.current,
      answerId,
    });
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  return (
    <div className="antialiased flex min-h-[380px] flex-col text-white" style={{ backgroundColor: THEME_BG[theme] }}>
      {phase.kind === "connecting" && <StatusScreen icon="\uD83D\uDD04" title="Connecting\u2026" sub="Joining the game\u2026" pulse />}

      {phase.kind === "lobby" && (
        <StatusScreen
          icon="🎮"
          title={phase.quizTitle}
          sub="Waiting for host to start…"
          pulse
          badge={phase.playerCount > 0 ? `${phase.playerCount} player${phase.playerCount !== 1 ? "s" : ""}` : undefined}
        />
      )}

      {phase.kind === "error" && <StatusScreen icon="❌" title="Error" sub={phase.message} onRetry={handleRetry} />}

      {phase.kind === "question" && (
        <QuestionScreen phase={phase} onAnswer={submitAnswer} />
      )}

      {phase.kind === "answered" && <AnsweredScreen phase={phase} />}

      {phase.kind === "reveal" && <RevealScreen phase={phase} />}

      {phase.kind === "leaderboard" && (
        <LeaderboardScreen entries={phase.entries} myId={myPlayerRef.current} accent={THEME_ACCENT[theme]} />
      )}

      {phase.kind === "finished" && (
        <FinishedScreen podium={phase.podium} myRank={phase.myRank} myScore={phase.myScore} myPlace={phase.myPlace} accent={THEME_ACCENT[theme]} />
      )}
    </div>
  );
}

// ── StatusScreen ──────────────────────────────────────────────────────────────

function StatusScreen({ icon, title, sub, pulse, badge, onRetry }: {
  icon: string; title: string; sub: string; pulse?: boolean; badge?: string; onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-4 py-8 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="text-lg font-bold">{title}</div>
      {sub && <div className={`text-sm text-white/60 ${pulse ? "animate-pulse" : ""}`}>{sub}</div>}
      {badge && (
        <div className="mt-1 rounded-xl bg-white/10 px-4 py-1.5 text-sm font-semibold">{badge}</div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ── QuestionScreen ────────────────────────────────────────────────────────────

function QuestionScreen({
  phase,
  onAnswer,
}: {
  phase: Extract<Phase, { kind: "question" }>;
  onAnswer: (id: string) => void;
}) {
  const urgent = phase.timeLeft <= 5;
  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-white/50">
          Q{phase.q.questionIndex + 1}/{phase.q.totalQuestions}
        </span>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full border-3 text-lg font-extrabold transition-colors ${
            urgent ? "border-red-500 text-red-400" : "border-violet-500 text-white"
          }`}
        >
          {phase.timeLeft}
        </div>
      </div>

      {/* Question image */}
      {phase.q.imageUrl && (
        <div className="mb-3 flex justify-center">
          <img src={phase.q.imageUrl} alt="" className="max-h-28 rounded-xl object-contain" />
        </div>
      )}

      {/* Question text */}
      <div className="mb-3 text-center text-[15px] font-bold leading-snug">
        {phase.q.text}
      </div>

      {/* Answers grid */}
      <div className="grid flex-1 grid-cols-2 gap-2.5">
        {phase.q.answers.map((ans, i) => (
          <button
            key={ans.id}
            disabled={phase.answerId !== null}
            onClick={() => onAnswer(ans.id)}
            className={`${COLORS[i]} flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-b-4 border-black/30 px-2 py-3 text-center transition-all hover:brightness-110 active:scale-95 disabled:cursor-default ${
              phase.answerId === ans.id ? "outline outline-4 outline-white" : ""
            } ${phase.answerId !== null && phase.answerId !== ans.id ? "opacity-40" : ""}`}
          >
            <span className="text-xl text-white/90">{ANSWER_ICONS[i]}</span>
            <span className="text-xs font-bold leading-snug">{ans.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── RevealScreen ──────────────────────────────────────────────────────────────

function RevealScreen({ phase }: { phase: Extract<Phase, { kind: "reveal" }> }) {
  const { q, correctId, result, tooSlow } = phase;
  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-white/50">Results</span>
        <span className="text-xl">{result?.correct ? "🎯" : tooSlow ? "⏱" : "❌"}</span>
      </div>
      {q.imageUrl && (
        <div className="mb-3 flex justify-center">
          <img src={q.imageUrl} alt="" className="max-h-24 rounded-xl object-contain opacity-60" />
        </div>
      )}
      <div className="mb-3 text-center text-[15px] font-bold leading-snug">
        {q.text}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2.5">
        {q.answers.map((ans, i) => {
          const isCorrect = ans.id === correctId;
          return (
            <button
              key={ans.id}
              disabled
              className={`${COLORS[i]} flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-b-4 border-black/30 px-2 py-3 ${
                isCorrect ? "outline outline-4 outline-white brightness-110" : "opacity-30"
              }`}
            >
              <span className="text-xl text-white/90">{ANSWER_ICONS[i]}</span>
              <span className="text-xs font-bold leading-snug">{ans.text}</span>
            </button>
          );
        })}
      </div>
      {/* Result badge */}
      <div className="mt-3 text-center">
        {result ? (
          <>
            <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-bold ${result.correct ? "bg-green-500" : "bg-red-500"}`}>
              {result.correct ? "✓ Correct!" : "✗ Wrong"}
            </span>
            <div className="mt-2 text-2xl font-extrabold">+{result.points} pts</div>
            <div className="text-xs text-white/50">Total: {result.total} pts</div>
          </>
        ) : tooSlow ? (
          <>
            <span className="inline-block rounded-full bg-red-500 px-4 py-1.5 text-sm font-bold">⏱ Too slow!</span>
            <div className="mt-2 text-2xl font-extrabold">+0 pts</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── LeaderboardScreen ─────────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

function LeaderboardScreen({ entries, myId }: { entries: LBEntry[]; myId: string }) {
  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-3 text-center text-lg font-extrabold">🏆 Leaderboard</div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {entries.map((e) => (
          <div
            key={e.playerId}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
              e.playerId === myId ? "bg-violet-700/50 outline outline-1 outline-violet-500" : "bg-white/[0.08]"
            }`}
          >
            <div className="w-7 flex-shrink-0 text-center text-base font-extrabold">
              {MEDALS[e.rank - 1] ?? `#${e.rank}`}
            </div>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">
              {e.name}{e.playerId === myId ? " (you)" : ""}
            </div>
            <div className="flex-shrink-0 text-sm font-bold text-violet-300">{e.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AnsweredScreen ────────────────────────────────────────────────────────────

const SPEED_TIERS: { maxPct: number; label: string; emoji: string }[] = [
  { maxPct: 0.15, label: "Lightning!",    emoji: "⚡" },
  { maxPct: 0.30, label: "Blazing fast!", emoji: "🔥" },
  { maxPct: 0.50, label: "Quick!",        emoji: "✅" },
  { maxPct: 0.70, label: "Steady",        emoji: "👍" },
  { maxPct: 0.90, label: "A bit slow",    emoji: "🐢" },
  { maxPct: Infinity, label: "Just in time!", emoji: "⏱" },
];

function AnsweredScreen({ phase }: { phase: Extract<Phase, { kind: "answered" }> }) {
  const secs = phase.answerTimeMs / 1000;
  const pct = secs / phase.q.timeLimit;
  const speed = SPEED_TIERS.find((s) => pct < s.maxPct) ?? SPEED_TIERS[SPEED_TIERS.length - 1];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
      <div className="text-5xl animate-bounce">{speed.emoji}</div>
      <div className="text-lg font-extrabold">{speed.label}</div>
      <div className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/80">
        {secs.toFixed(2)}s
      </div>
      <div className="mt-1 text-xs text-white/40 animate-pulse">Waiting for reveal…</div>
    </div>
  );
}

// ── FinishedScreen ────────────────────────────────────────────────────────────

const POD_HEIGHTS: Record<number, string> = { 0: "h-[50px]", 1: "h-[70px]", 2: "h-[34px]" };
const POD_COLORS:  Record<number, string> = { 0: "bg-violet-700", 1: "bg-violet-500", 2: "bg-violet-900" };
// Podium visual order: 2nd | 1st | 3rd
const POD_ORDER = [1, 0, 2];

const CONFETTI_COLORS = ["#a855f7", "#f59e0b", "#ec4899", "#22d3ee", "#ffffff"];
const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 3,
  duration: 2 + Math.random() * 2,
  color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  size: 4 + Math.random() * 6,
  rotation: Math.random() * 360,
}));

function Confetti() {
  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 50 }}>
        {confettiPieces.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: -10,
              width: p.size,
              height: p.size * 1.5,
              backgroundColor: p.color,
              borderRadius: 2,
              transform: `rotate(${p.rotation}deg)`,
              animation: `confettiFall ${p.duration}s ease-in ${p.delay}s both`,
            }}
          />
        ))}
      </div>
    </>
  );
}

function FinishedScreen({ podium, myRank, myScore, myPlace }: { podium: PodiumEntry[]; myRank: number | null; myScore: number | null; myPlace: string }) {
  const isWinner = myRank === 1;
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      {isWinner && <Confetti />}

      <div className="text-2xl font-extrabold">
        {isWinner ? "👑 You won!" : "🎉 Game Over!"}
      </div>

      {/* Podium */}
      <div className="mt-2 flex items-end justify-center gap-2">
        {POD_ORDER.map((idx, vi) => {
          const e = podium[idx];
          if (!e) return null;
          return (
            <div key={e.playerId} className="flex flex-col items-center gap-1">
              <div className="text-2xl">{MEDALS[e.rank - 1] ?? MEDALS[vi]}</div>
              <div className="max-w-[80px] truncate text-xs font-bold">{e.name}</div>
              <div className="text-[11px] text-white/50">{e.score} pts</div>
              <div className={`${POD_HEIGHTS[vi]} ${POD_COLORS[vi]} w-16 rounded-t-lg`} />
            </div>
          );
        })}
      </div>

      {myPlace && (
        <div className="mt-2 text-sm text-white/60">You finished {myPlace}</div>
      )}
    </div>
  );
}

// ── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("game-play-root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
