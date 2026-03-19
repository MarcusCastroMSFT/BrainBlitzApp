import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

interface Props {
  entries: LeaderboardEntry[];
  highlightId?: string;
}

const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];

export default function LeaderboardView({ entries, highlightId }: Props) {
  return (
    <div className="w-full max-w-md">
      <h2 className="text-white text-2xl font-black text-center mb-6">🏆 Top Players</h2>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div
            key={entry.playerId}
            className={cn(
              "flex items-center gap-4 px-5 py-3 rounded-xl border transition-all animate-slide-up",
              entry.playerId === highlightId
                ? "bg-purple-500/30 border-purple-400 scale-105"
                : "bg-white/5 border-white/10"
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className={cn("text-xl font-black w-8 text-center", RANK_COLORS[i] ?? "text-white")}>
              {entry.rank}
            </span>
            <span className="flex-1 text-white font-semibold truncate">{entry.name}</span>
            <span className="text-purple-300 font-bold tabular-nums">{entry.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
