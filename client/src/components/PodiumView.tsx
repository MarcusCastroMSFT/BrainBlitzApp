import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

interface Props {
  podium: LeaderboardEntry[];
  highlightId?: string;
}

const RANK_CONFIG: Record<number, { height: string; bar: string; glow: string; emoji: string; label: string }> = {
  1: { height: "h-40", bar: "bg-gradient-to-b from-yellow-300 to-yellow-500", glow: "shadow-yellow-400/60", emoji: "🥇", label: "text-yellow-300" },
  2: { height: "h-28", bar: "bg-gradient-to-b from-slate-300 to-slate-400",  glow: "shadow-slate-300/40",  emoji: "🥈", label: "text-slate-300" },
  3: { height: "h-20", bar: "bg-gradient-to-b from-amber-600 to-amber-700",  glow: "shadow-amber-600/40",  emoji: "🥉", label: "text-amber-400" },
};

export default function PodiumView({ podium, highlightId }: Props) {
  const top3 = podium.slice(0, 3);
  // Visual order: 2nd left, 1st centre, 3rd right
  const display = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardEntry[];

  return (
    <div className="w-full max-w-lg">
      <h2 className="text-white text-3xl font-black text-center mb-10">🎉 Final Rankings</h2>

      {/* Visual podium */}
      <div className="flex items-end justify-center gap-3 mb-8">
        {display.map((entry, di) => {
          const cfg = RANK_CONFIG[entry.rank] ?? RANK_CONFIG[3];
          const isMe = entry.playerId === highlightId;
          return (
            <div
              key={entry.playerId}
              className="flex flex-col items-center gap-1 flex-1"
              style={{ animation: `podiumRise 0.5s ease-out ${di * 150}ms both` }}
            >
              {/* Crown for 1st */}
              {entry.rank === 1 && (
                <span className="text-2xl mb-0.5" style={{ animation: "bounce 1s infinite" }}>👑</span>
              )}
              <span className="text-3xl">{cfg.emoji}</span>
              <span className={cn(
                "text-xs font-bold text-center truncate px-1 max-w-full",
                isMe ? "text-purple-300 underline underline-offset-2" : cfg.label
              )}>
                {entry.name}{isMe ? " (you)" : ""}
              </span>
              <span className="text-white/70 text-xs tabular-nums font-medium">
                {entry.score.toLocaleString()} pts
              </span>
              <div className={cn(
                "w-full rounded-t-xl flex items-center justify-center shadow-lg",
                cfg.height, cfg.bar, cfg.glow,
                isMe && "ring-2 ring-white ring-offset-1 ring-offset-transparent"
              )}>
                <span className="text-2xl font-black text-white drop-shadow-md">{entry.rank}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rest of rankings */}
      {podium.length > 3 && (
        <div className="space-y-2">
          {podium.slice(3).map((entry) => (
            <div
              key={entry.playerId}
              className={cn(
                "flex items-center gap-4 px-5 py-3 rounded-xl border",
                entry.playerId === highlightId
                  ? "bg-purple-500/30 border-purple-400"
                  : "bg-white/5 border-white/10"
              )}
            >
              <span className="text-white/50 font-bold w-6 text-center">{entry.rank}</span>
              <span className="flex-1 text-white font-medium truncate">
                {entry.name}{entry.playerId === highlightId ? " (you)" : ""}
              </span>
              <span className="text-slate-400 tabular-nums">{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
