import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "joining" | "error";

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [code, setCode] = useState("");
  const [name, setName]  = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Effect 1: pre-fill PIN from toolOutput at mount
  useEffect(() => {
    const out = window.openai?.toolOutput as Record<string, unknown> | undefined;
    if (typeof out?.code === "string") setCode(out.code);
  }, []);

  // Effect 2: live update listeners — react when the host delivers toolOutput
  // after the iframe has already mounted (openai:set_globals or MCP Apps bridge).
  useEffect(() => {
    function handleGlobals(event: Event) {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: { code?: string } } }>).detail;
      const c = detail?.globals?.toolOutput?.code;
      if (typeof c === "string") setCode(c);
    }
    function handleMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0") return;
      if (msg.method === "ui/notifications/tool-result") {
        const sc = msg.params?.structuredContent as { code?: string } | undefined;
        if (typeof sc?.code === "string") setCode(sc.code);
      }
    }
    window.addEventListener("openai:set_globals", handleGlobals as EventListener, { passive: true });
    window.addEventListener("message", handleMessage, { passive: true });
    return () => {
      window.removeEventListener("openai:set_globals", handleGlobals as EventListener);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  async function submit() {
    const trimCode = code.trim();
    const trimName = name.trim();
    if (!trimCode) { setErrorMsg("Please enter the game PIN."); return; }
    if (!trimName) { setErrorMsg("Please enter your name."); return; }

    setErrorMsg("");
    setPhase("joining");

    try {
      if (window.openai?.sendFollowUpMessage) {
        // Use sendFollowUpMessage so the MODEL calls start_playing.
        // The model's tool call has outputTemplate → swaps to the game-play widget.
        // callTool from within a widget does NOT swap widgets — it returns data
        // to the same widget. Only the model invoking a tool can trigger a swap.
        window.openai.sendFollowUpMessage({
          prompt: `Please call the start_playing tool with code "${trimCode}" and name "${trimName}" to launch my Brain Blitz game.`,
        });
        return;
      }
      throw new Error("window.openai is not available in this environment.");
    } catch (e) {
      setPhase("error");
      setErrorMsg(`Could not join: ${String(e instanceof Error ? e.message : e)}`);
    }
  }

  const isJoining = phase === "joining";

  return (
    <div className="antialiased flex min-h-[320px] items-center justify-center bg-[#1e1b4b] px-4 py-5">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">⚡ Brain Blitz</h1>
          <p className="mt-1 text-sm text-white/60">Join a live game</p>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-2.5">
          <Field label="Game PIN">
            <input
              className="w-full rounded-xl bg-white/[0.13] px-3 py-2.5 text-base text-white placeholder-white/30 outline-none transition focus:bg-white/20"
              type="text"
              placeholder="e.g. 223559"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nameRef.current?.focus()}
              disabled={isJoining}
              autoFocus
            />
          </Field>

          <Field label="Your name">
            <input
              ref={nameRef}
              className="w-full rounded-xl bg-white/[0.13] px-3 py-2.5 text-base text-white placeholder-white/30 outline-none transition focus:bg-white/20"
              type="text"
              placeholder="Your nickname"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={isJoining}
            />
          </Field>

          <button
            onClick={submit}
            disabled={isJoining}
            className="mt-1 w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-bold text-white transition hover:bg-violet-700 disabled:cursor-default disabled:opacity-55"
          >
            {isJoining ? "Joining…" : "Join Game"}
          </button>

          {errorMsg && (
            <p className="text-center text-xs text-red-400">{errorMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
        {label}
      </div>
      {children}
    </div>
  );
}

// ── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("game-enter-root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
