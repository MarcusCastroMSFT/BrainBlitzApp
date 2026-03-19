import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronRight, Brain, Copy, Check } from "lucide-react";
import type {
  GameStatus,
  QuestionPayload,
  AnswerRevealPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  PodiumPayload,
} from "@/types";
import CountdownTimer from "@/components/CountdownTimer";
import LeaderboardView from "@/components/LeaderboardView";
import PodiumView from "@/components/PodiumView";

const ANSWER_COLORS = ["bg-red-500", "bg-blue-500", "bg-yellow-400 text-gray-900", "bg-green-500"];
const ANSWER_ICONS = ["▲", "●", "■", "★"];

type Theme = "classic" | "ocean" | "volcano" | "forest" | "galaxy";

const THEME_GRADIENTS: Record<Theme, string> = {
  classic: "from-purple-950 via-slate-900 to-indigo-950",
  ocean:   "from-sky-950 via-slate-900 to-cyan-950",
  volcano: "from-orange-950 via-slate-900 to-red-950",
  forest:  "from-green-950 via-slate-900 to-emerald-950",
  galaxy:  "from-indigo-950 via-slate-900 to-violet-950",
};

const THEME_ACCENT: Record<Theme, { btn: string; text: string; badge: string }> = {
  classic: { btn: "bg-purple-500 hover:bg-purple-400", text: "text-purple-400", badge: "bg-purple-500/20 border-purple-500/30 text-purple-300" },
  ocean:   { btn: "bg-cyan-500 hover:bg-cyan-400",     text: "text-cyan-400",   badge: "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" },
  volcano: { btn: "bg-orange-500 hover:bg-orange-400",  text: "text-orange-400", badge: "bg-orange-500/20 border-orange-500/30 text-orange-300" },
  forest:  { btn: "bg-green-500 hover:bg-green-400",    text: "text-green-400",  badge: "bg-green-500/20 border-green-500/30 text-green-300" },
  galaxy:  { btn: "bg-violet-500 hover:bg-violet-400",  text: "text-violet-400", badge: "bg-violet-500/20 border-violet-500/30 text-violet-300" },
};

export default function HostPage() {
  const { id: quizId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [gameCode, setGameCode] = useState<string | null>(null);
  const [status, setStatus] = useState<GameStatus>("lobby");
  const [theme, setTheme] = useState<Theme>("classic");
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<AnswerRevealPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [podium, setPodium] = useState<PodiumPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [error, setError] = useState("");

  const grad = `min-h-screen bg-gradient-to-br ${THEME_GRADIENTS[theme]}`;
  const accent = THEME_ACCENT[theme];

  useEffect(() => {
    if (!quizId) return;
    socket.connect();

    socket.emit("host_create_session", quizId, (code: string) => {
      if (code === "ERROR") { setError("Failed to create game session."); return; }
      setGameCode(code);
    });

    socket.on("player_joined", (player) => {
      setPlayers((prev) => [...prev, player]);
    });

    socket.on("game_state", (state) => {
      setQuizTitle(state.quizTitle);
      setStatus(state.status);
      if (state.theme) setTheme(state.theme as Theme);
    });

    socket.on("question_start", (q) => {
      setQuestion({ ...q, startTime: Date.now() });
      setReveal(null);
      setLeaderboard(null);
      setStatus("question");
    });

    socket.on("answer_reveal", (r) => {
      setReveal(r);
      setStatus("answer_reveal");
    });

    socket.on("leaderboard", (lb) => {
      setLeaderboard(lb);
      setStatus("leaderboard");
    });

    socket.on("game_finished", (p) => {
      setPodium(p);
      setStatus("finished");
    });

    // Fire confetti when game finishes (host always sees it)
    socket.on("game_finished", () => {
      const duration = 4500;
      const end = Date.now() + duration;
      const colors = ["#a855f7", "#f59e0b", "#ec4899", "#22d3ee", "#ffffff"];
      const frame = () => {
        confetti({ particleCount: 8, angle: 60, spread: 80, origin: { x: 0, y: 0.6 }, colors });
        confetti({ particleCount: 8, angle: 120, spread: 80, origin: { x: 1, y: 0.6 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    });

    // Get quiz title and theme
    fetch(`/api/quizzes/${quizId}`)
      .then((r) => r.json())
      .then((q) => { setQuizTitle(q.title); if (q.theme) setTheme(q.theme); })
      .catch(() => {});

    return () => {
      socket.off("player_joined");
      socket.off("game_state");
      socket.off("question_start");
      socket.off("answer_reveal");
      socket.off("leaderboard");
      socket.off("game_finished");
      socket.disconnect();
    };
  }, [quizId]);

  const copyCode = () => {
    if (!gameCode) return;
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = () => {
    if (!gameCode) return;
    socket.emit("host_start_game", gameCode);
  };

  const nextQuestion = useCallback(() => {
    if (!gameCode) return;
    socket.emit("host_next_question", gameCode);
  }, [gameCode]);

  if (error) return (
    <div className={`${grad} flex items-center justify-center`}>
      <div className="text-red-400 text-center">
        <p className="text-xl mb-4">{error}</p>
        <Button onClick={() => navigate("/")} variant="outline" className="border-white/20 text-white">Go Home</Button>
      </div>
    </div>
  );

  if (!gameCode) return (
    <div className={`${grad} flex items-center justify-center`}>
      <div className="text-white text-lg animate-pulse flex items-center gap-2">
        <Brain className={`w-6 h-6 ${accent.text}`} /> Creating session…
      </div>
    </div>
  );

  // Finished
  if (status === "finished" && podium) {
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6`}>
        <PodiumView podium={podium.podium} />
        <Button className={`mt-8 ${accent.btn}`} onClick={() => navigate("/")}>
          Back to Home
        </Button>
      </div>
    );
  }

  // Leaderboard
  if (status === "leaderboard" && leaderboard) {
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6`}>
        <LeaderboardView entries={leaderboard.entries} />
        <Button className={`mt-8 ${accent.btn} text-lg px-8 py-6`} onClick={nextQuestion}>
          {leaderboard.isLastQuestion ? "See Final Results" : "Next Question"} <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    );
  }

  // Answer reveal
  if (status === "answer_reveal" && question && reveal) {
    const correctIdx = question.answers.findIndex((a) => a.id === reveal.correctAnswerId);
    const correctCount = Object.values(reveal.playerResults).filter((r) => r.correct).length;
    return (
      <div className={`${grad} flex flex-col items-center justify-center p-6 gap-6`}>
        <div className="text-center">
          <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-base mb-3">
            ✓ {correctCount} / {Object.keys(reveal.playerResults).length} correct
          </Badge>
          <h2 className="text-white text-2xl font-bold mb-6 max-w-2xl">{question.text}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
          {question.answers.map((a, i) => (
            <div
              key={a.id}
              className={`p-4 rounded-xl text-white font-semibold flex items-center gap-3 transition-all ${
                i === correctIdx
                  ? ANSWER_COLORS[i] + " ring-4 ring-white scale-105"
                  : ANSWER_COLORS[i] + " opacity-40"
              }`}
            >
              <span className="text-xl">{ANSWER_ICONS[i]}</span>
              {a.text}
            </div>
          ))}
        </div>
        <p className="text-slate-400 text-sm mt-2">Auto-advance in a moment…</p>
      </div>
    );
  }

  // Active question
  if (status === "question" && question) {
    return (
      <div className={`${grad} flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <span className="text-white/60 text-sm">Q {question.questionIndex + 1} / {question.totalQuestions}</span>
          <CountdownTimer duration={question.timeLimit} startTime={question.startTime} />
          <span className="text-white/60 text-sm">{players.length} players</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-52 rounded-xl object-contain" />
          )}
          <h2 className="text-white text-3xl font-bold text-center max-w-2xl">{question.text}</h2>
          <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
            {question.answers.map((a, i) => (
              <div
                key={a.id}
                className={`p-5 rounded-xl text-white font-bold flex items-center gap-3 text-lg border-b-4 ${ANSWER_COLORS[i]} border-black/30`}
              >
                <span className="text-2xl">{ANSWER_ICONS[i]}</span>
                {a.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Lobby
  return (
    <div className={`${grad} flex flex-col items-center justify-center p-6`}>
      <div className="w-full max-w-lg space-y-6">
        {/* Game code */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Brain className={`w-8 h-8 ${accent.text}`} />
            <span className="text-white font-black text-2xl">BrainBlitz</span>
          </div>
          <p className="text-slate-400 mb-6">{quizTitle}</p>
          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 mb-2">
            <p className="text-slate-400 text-sm mb-2">Game PIN</p>
            <div className="flex items-center justify-center gap-4">
              <span className="text-white text-6xl font-black tracking-widest">{gameCode}</span>
              <button onClick={copyCode} className="text-slate-400 hover:text-purple-400 transition-colors">
                {copied ? <Check className="w-6 h-6 text-green-400" /> : <Copy className="w-6 h-6" />}
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-3">Go to brainblitz.app and enter this PIN</p>
          </div>
        </div>

        {/* Players */}
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 text-slate-300">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">{players.length} players joined</span>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[48px]">
              {players.length === 0 ? (
                <p className="text-slate-500 text-sm animate-pulse">Waiting for players…</p>
              ) : (
                players.map((p) => (
                  <span
                    key={p.id}
                    className={`${accent.badge} rounded-full px-3 py-1 text-sm font-medium animate-bounce-in border`}
                  >
                    {p.name}
                  </span>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Button
          className={`w-full ${accent.btn} h-14 text-lg font-bold`}
          onClick={startGame}
          disabled={players.length === 0}
        >
          {players.length === 0 ? "Waiting for players…" : "Start Game!"}
        </Button>
      </div>
    </div>
  );
}
