import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Brain } from "lucide-react";
import type { Theme } from "@/types";
import { toast } from "@/lib/toast";

const THEMES: { value: Theme; label: string; emoji: string }[] = [
  { value: "classic", label: "Classic", emoji: "⚡" },
  { value: "ocean", label: "Ocean", emoji: "🌊" },
  { value: "volcano", label: "Volcano", emoji: "🌋" },
  { value: "forest", label: "Forest", emoji: "🌿" },
  { value: "galaxy", label: "Galaxy", emoji: "🌌" },
];

export default function CreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState<Theme>("classic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) { setError("Quiz title is required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), theme }),
      });
      const quiz = await res.json();
      toast("Quiz created!", { description: `"${title.trim()}" is ready. Add your questions below.` });
      navigate(`/edit/${quiz.id}`);
    } catch {
      setError("Failed to create quiz");
      toast("Failed to create quiz", { type: "error" });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          className="text-slate-400 hover:text-white mb-6"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-extrabold text-white">New Quiz</span>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Quiz details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Quiz Title</label>
              <Input
                placeholder="e.g. World Geography 101"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(""); }}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Theme</label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  {THEMES.map((t) => (
                    <SelectItem
                      key={t.value}
                      value={t.value}
                      className="text-white focus:bg-white/10"
                    >
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              className="w-full bg-purple-500 hover:bg-purple-400"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? "Creating…" : "Create & Add Questions →"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
