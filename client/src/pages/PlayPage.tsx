import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, CheckCircle2, XCircle, Zap, Flame, Clock, Turtle, Timer } from "lucide-react";
import type {
  GameStatus,
  QuestionPayload,
  AnswerRevealPayload,
  LeaderboardPayload,
  PodiumPayload,
} from "@/types";
import CountdownTimer from "@/components/CountdownTimer";
import LeaderboardView from "@/components/LeaderboardView";
import PodiumView from "@/components/PodiumView";

const ANSWER_COLORS = [
  "bg-red-500 hover:bg-red-400 border-red-700",
  "bg-blue-500 hover:bg-blue-400 border-blue-700",
  "bg-yellow-400 hover:bg-yellow-300 border-yellow-600 text-gray-900",
  "bg-green-500 hover:bg-green-400 border-green-700",
];
const ANSWER_ICONS = ["▲", "●", "■", "★"];

type Theme = "classic" | "ocean" | "volcano" | "forest" | "galaxy";

const THEME_GRADIENTS: Record<Theme, string> = {
  classic: "from-purple-950 via-slate-900 to-indigo-950",
  ocean:   "from-sky-950 via-slate-900 to-cyan-950",
  volcano: "from-orange-950 via-slate-900 to-red-950",
  forest:  "from-green-950 via-slate-900 to-emerald-950",
  galaxy:  "from-indigo-950 via-slate-900 to-violet-950",
};

const THEME_ACCENT: Record<Theme, { btn: string; text: string }> = {
  classic: { btn: "bg-purple-500 hover:bg-purple-400", text: "text-purple-400" },
  ocean:   { btn: "bg-cyan-500 hover:bg-cyan-400",     text: "text-cyan-400"   },
  volcano: { btn: "bg-orange-500 hover:bg-orange-400",  text: "text-orange-400" },
  forest:  { btn: "bg-green-500 hover:bg-green-400",    text: "text-green-400"  },
  galaxy:  { btn: "bg-violet-500 hover:bg-violet-400",  text: "text-violet-400" },
};

type Phase = "enter" | "lobby" | "question" | "answered" | "reveal" | "leaderboard" | "finished";

export default function PlayPage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("enter");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("classic");
  const [quizTitle, setQuizTitle] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [reveal, setReveal] = useState<AnswerRevealPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [podium, setPodium] = useState<PodiumPayload | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [answerTime, setAnswerTime] = useState<number>(0); // ms elapsed when answered
  const myCode = useRef(code);
  const myPlayerId = useRef(playerId);

  useEffect(() => { myCode.current = code; }, [code]);
  useEffect(() => { myPlayerId.current = playerId; }, [playerId]);

  const grad = `min-h-screen bg-gradient-to-br ${THEME_GRADIENTS[theme]}`;
  const accent = THEME_ACCENT[theme];

  useEffect(() => {
    socket.connect();

    socket.on("player_joined", () => {
      setPlayerCount((p) => p + 1);
    });

    socket.on("game_state", (state) => {
      setQuizTitle(state.quizTitle);
      setPlayerCount(state.playerCount);
      if (state.theme) setTheme(state.theme as Theme);
    });

    socket.on("question_start", (q) => {
      setQuestion({ ...q, startTime: Date.now() });
      setSelectedAnswer(null);
      setReveal(null);
      setPhase("question");
    });

    socket.on("answer_reveal", (r) => {
      setReveal(r);
      setPhase("reveal");
      if (myPlayerId.current && r.playerResults[myPlayerId.current]) {
        setPointsEarned(r.playerResults[myPlayerId.current].points);
        setTotalScore(r.playerResults[myPlayerId.current].totalScore);
      }
    });

    socket.on("leaderboard", (lb) => {
      setLeaderboard(lb);
      setPhase("leaderboard");
    });

    socket.on("game_finished", (p) => {
      setPodium(p);
      setPhase("finished");
    });

    return () => {
      socket.off("player_joined");
      socket.off("game_state");
      socket.off("question_start");
      socket.off("answer_reveal");
      socket.off("leaderboard");
      socket.off("game_finished");
      socket.disconnect();
    };
  }, []);

  // Fire confetti from both sides when the current player wins
  useEffect(() => {
    if (phase !== "finished" || !podium || !playerId) return;
    const myEntry = podium.podium.find((e) => e.playerId === playerId);
    if (myEntry?.rank !== 1) return;
    const duration = 4500;
    const end = Date.now() + duration;
    const colors = ["#a855f7", "#f59e0b", "#ec4899", "#22d3ee", "#ffffff"];
    const frame = () => {
      confetti({ particleCount: 8, angle: 60, spread: 80, origin: { x: 0, y: 0.6 }, colors });
      confetti({ particleCount: 8, angle: 120, spread: 80, origin: { x: 1, y: 0.6 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [phase, podium, playerId]);

  const joinGame = () => {
    if (!code.trim() || !name.trim()) { setError("Enter your PIN and name"); return; }
    socket.emit("player_join", { code: code.trim(), name: name.trim() }, (res: { success: boolean; playerId?: string; error?: string }) => {
      if (!res.success) { setError(res.error ?? "Failed to join"); return; }
      setPlayerId(res.playerId ?? null);
      setPhase("lobby");
    });
  };

  const submitAnswer = (answerId: string) => {
    if (selectedAnswer || !question) return;
    const elapsed = Date.now() - question.startTime;
    setAnswerTime(elapsed);
    setSelectedAnswer(answerId);
    setPhase("answered");
    socket.emit("player_answer", { code: myCode.current, answerId });
  };

  // Finished
  if (phase === "finished" && podium) {
    const myRank = playerId ? podium.podium.find((e) => e.playerId === playerId) : null;
    const isWinner = myRank?.rank === 1;

    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6 gap-6 overflow-hidden`}>
        {myRank && (
          <div className="text-center mb-2">
            {isWinner ? (
              <>
                <div className="text-6xl mb-3" style={{ animation: "bounce 1s infinite" }}>🎉</div>
                <p className="text-4xl font-black text-yellow-300 drop-shadow-lg">You Won!</p>
                <p className="text-white/70 mt-1 text-lg">{myRank.score.toLocaleString()} points</p>
              </>
            ) : (
              <>
                <p className="text-2xl text-white font-bold">You finished #{myRank.rank}</p>
                <p className={`${accent.text} text-lg`}>{myRank.score.toLocaleString()} points</p>
              </>
            )}
          </div>
        )}
        <PodiumView podium={podium.podium} highlightId={playerId ?? undefined} />
        <Button className={`mt-2 ${accent.btn} h-12 px-8 text-base font-bold`} onClick={() => window.location.reload()}>
          Play Again
        </Button>
      </div>
    );
  }

  // Leaderboard
  if (phase === "leaderboard" && leaderboard) {
    const myEntry = playerId ? leaderboard.entries.find((e) => e.playerId === playerId) : null;
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6`}>
        {myEntry && (
          <div className="text-center mb-6">
            <p className="text-white text-xl font-bold">Your rank: #{myEntry.rank}</p>
            <p className={accent.text}>{myEntry.score} points</p>
          </div>
        )}
        <LeaderboardView entries={leaderboard.entries} highlightId={playerId ?? undefined} />
        <p className="text-slate-400 mt-6 text-sm animate-pulse">Waiting for host…</p>
      </div>
    );
  }

  // Reveal
  if (phase === "reveal" && question && reveal) {
    const corrId = reveal.correctAnswerId;
    const myResult = playerId ? reveal.playerResults[playerId] : null;
    const isCorrect = myResult?.correct ?? false;
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6 gap-6`}>
        <div className={`text-center animate-bounce-in`}>
          {isCorrect ? (
            <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-3" />
          ) : (
            <XCircle className="w-20 h-20 text-red-400 mx-auto mb-3" />
          )}
          <h2 className="text-white text-2xl font-bold">{isCorrect ? "Correct!" : "Wrong!"}</h2>
          {isCorrect && (
            <p className="text-yellow-300 text-xl font-bold mt-1">+{pointsEarned} pts</p>
          )}
          <p className="text-slate-400 mt-1">Total: {totalScore} pts</p>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {question.answers.map((a, i) => (
            <div
              key={a.id}
              className={`p-4 rounded-xl text-white font-semibold flex items-center gap-2 text-sm border-b-4 border-black/30 transition-all ${
                a.id === corrId
                  ? ANSWER_COLORS[i] + " ring-2 ring-white"
                  : ANSWER_COLORS[i] + " opacity-40"
              }`}
            >
              <span>{ANSWER_ICONS[i]}</span>
              {a.text}
            </div>
          ))}
        </div>
        <p className="text-slate-400 text-sm animate-pulse">Waiting for host…</p>
      </div>
    );
  }

  // Answered - waiting for reveal
  if (phase === "answered" && question) {
    const secs = answerTime / 1000;
    const pct = secs / question.timeLimit; // 0..1 ratio of time used
    const speedConfig =
      pct < 0.15 ? { label: "Lightning!",    icon: <Zap    className="w-4 h-4" />, color: "text-yellow-300 bg-yellow-400/20 border-yellow-400/40" } :
      pct < 0.30 ? { label: "Blazing fast!", icon: <Flame  className="w-4 h-4" />, color: "text-orange-300 bg-orange-400/20 border-orange-400/40" } :
      pct < 0.50 ? { label: "Quick!",        icon: <Timer  className="w-4 h-4" />, color: "text-green-300 bg-green-400/20 border-green-400/40" } :
      pct < 0.70 ? { label: "Steady",        icon: <CheckCircle2 className="w-4 h-4" />, color: "text-blue-300 bg-blue-400/20 border-blue-400/40" } :
      pct < 0.90 ? { label: "A bit slow",    icon: <Clock  className="w-4 h-4" />, color: "text-slate-300 bg-white/10 border-white/20" } :
                   { label: "Just in time!", icon: <Turtle className="w-4 h-4" />, color: "text-red-300 bg-red-400/20 border-red-400/40" };
    return (
      <div className={`${grad} flex flex-col`}>
        {/* Top bar */}
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <span className="text-white/60 text-sm">Q {question.questionIndex + 1} / {question.totalQuestions}</span>
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold ${speedConfig.color}`}>
            {speedConfig.icon} {secs.toFixed(2)}s — {speedConfig.label}
          </span>
          <span className="text-white/60 text-sm">Score: {totalScore}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-5">
          {/* Submitted badge */}
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
            <CheckCircle2 className={`w-5 h-5 ${accent.text}`} />
            <span className="text-white font-semibold text-sm">Answer locked in!</span>
          </div>

          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-36 rounded-xl object-contain opacity-60" />
          )}
          <h2 className="text-white text-xl font-bold text-center max-w-lg">{question.text}</h2>

          {/* Answer grid — selected highlighted, others dimmed */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {question.answers.map((a, i) => {
              const isSelected = a.id === selectedAnswer;
              const baseColor = ANSWER_COLORS[i];
              return (
                <div
                  key={a.id}
                  className={`p-5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 border-b-4 border-black/30 transition-all ${
                    isSelected
                      ? `${baseColor} ring-4 ring-white scale-105 shadow-lg`
                      : `${baseColor} opacity-30 grayscale`
                  }`}
                >
                  <span className={`text-2xl ${
                    i === 2 ? (isSelected ? "text-gray-900" : "text-gray-900") : "text-white"
                  }`}>{ANSWER_ICONS[i]}</span>
                  <span className={`text-xs text-center ${
                    i === 2 ? "text-gray-900" : "text-white"
                  }`}>{a.text}</span>
                  {isSelected && (
                    <span className={`text-xs font-black mt-0.5 ${
                      i === 2 ? "text-gray-900" : "text-white"
                    }`}>YOUR PICK</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-slate-400 text-sm animate-pulse mt-2">Waiting for other players…</p>
        </div>
      </div>
    );
  }

  // Active question
  if (phase === "question" && question) {
    return (
      <div className={`${grad} flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <span className="text-white/60 text-sm">Q {question.questionIndex + 1} / {question.totalQuestions}</span>
          <CountdownTimer duration={question.timeLimit} startTime={question.startTime} />
          <span className="text-white/60 text-sm">Score: {totalScore}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-5">
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-36 rounded-xl object-contain" />
          )}
          <h2 className="text-white text-xl font-bold text-center max-w-lg">{question.text}</h2>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {question.answers.map((a, i) => (
              <button
                key={a.id}
                onClick={() => submitAnswer(a.id)}
                className={`p-5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 text-white border-b-4 border-black/30 transition-transform active:scale-95 ${ANSWER_COLORS[i]}`}
              >
                <span className="text-3xl">{ANSWER_ICONS[i]}</span>
                <span className="text-xs text-center">{a.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Lobby - waiting for game to start
  if (phase === "lobby") {
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6`}>
        <div className="text-center space-y-4">
          <Brain className={`w-16 h-16 ${accent.text} mx-auto animate-pulse`} />
          <h1 className="text-white text-3xl font-black">You're in!</h1>
          <p className={`${accent.text} text-lg font-semibold`}>{name}</p>
          <p className="text-slate-400">{quizTitle}</p>
          <div className="bg-white/10 rounded-xl p-4 mt-4">
            <p className="text-slate-400 text-sm">{playerCount} players joined</p>
            <p className="text-slate-500 text-xs mt-1 animate-pulse">Waiting for host to start…</p>
          </div>
        </div>
      </div>
    );
  }

  // Enter code + name
  return (
    <div className={`${grad} flex flex-col items-center justify-center p-6`}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Brain className={`w-14 h-14 ${accent.text} mx-auto mb-3`} />
          <h1 className="text-white text-4xl font-black">
            Brain<span className={accent.text}>Blitz</span>
          </h1>
          <p className="text-slate-400 mt-2">Enter the game PIN to join</p>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-5 space-y-4">
            <Input
              placeholder="Game PIN"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 text-center text-3xl font-black tracking-widest h-16"
              maxLength={6}
            />
            <Input
              placeholder="Your name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
              onKeyDown={(e) => e.key === "Enter" && joinGame()}
              maxLength={20}
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <Button
              className={`w-full ${accent.btn} h-12 text-base font-bold`}
              onClick={joinGame}
            >
              Join Game
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
