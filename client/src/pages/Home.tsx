import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Trash2, Brain, Zap } from "lucide-react";
import type { Quiz } from "@/types";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function Home() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/quizzes")
      .then((r) => r.json())
      .then(setQuizzes)
      .catch(console.error);
  }, []);

  const confirmDeleteQuiz = async () => {
    if (!pendingDelete) return;
    const { id, title } = pendingDelete;
    setPendingDelete(null);
    try {
      await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
      toast("Quiz deleted", { description: `"${title}" has been removed.`, type: "info" });
    } catch {
      toast("Failed to delete quiz", { type: "error" });
    }
  };

  const themeColors: Record<string, string> = {
    classic: "bg-purple-600",
    ocean: "bg-cyan-600",
    volcano: "bg-orange-600",
    forest: "bg-green-600",
    galaxy: "bg-indigo-600",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-extrabold text-white tracking-tight">
              Brain<span className="text-purple-400">Blitz</span>
            </span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => navigate("/play")}
            >
              <Play className="w-4 h-4 mr-2" /> Join a Game
            </Button>
            <Button
              className="bg-purple-500 hover:bg-purple-400"
              onClick={() => navigate("/create")}
            >
              <Plus className="w-4 h-4 mr-2" /> Create Quiz
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 rounded-full px-4 py-1.5 text-purple-300 text-sm mb-6">
            <Zap className="w-4 h-4" /> Real-time multiplayer quiz battles
          </div>
          <h1 className="text-6xl font-black text-white mb-4">
            Make learning <span className="text-purple-400">epic</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto">
            Create quizzes, share a code, and compete live with friends.
          </p>
        </div>

        {/* Quizzes */}
        {quizzes.length === 0 ? (
          <div className="text-center py-24 border border-white/10 rounded-2xl">
            <Brain className="w-16 h-16 text-purple-400 mx-auto mb-4 opacity-50" />
            <p className="text-slate-400 text-lg">No quizzes yet.</p>
            <Button className="mt-4 bg-purple-500 hover:bg-purple-400" onClick={() => navigate("/create")}>
              <Plus className="w-4 h-4 mr-2" /> Create your first quiz
            </Button>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-white mb-6">Your Quizzes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {quizzes.map((quiz) => (
                <Card
                  key={quiz.id}
                  className="bg-white/5 border-white/10 hover:border-purple-500/50 transition-all group"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <Badge className={`${themeColors[quiz.theme] ?? "bg-purple-600"} text-white border-0 mb-2`}>
                        {quiz.theme}
                      </Badge>
                    </div>
                    <CardTitle className="text-white text-lg">{quiz.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-400 text-sm mb-4">
                      {new Date(quiz.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-purple-500 hover:bg-purple-400"
                        size="sm"
                        onClick={() => navigate(`/host/${quiz.id}`)}
                      >
                        <Play className="w-3 h-3 mr-1" /> Host
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-white/20 text-white hover:bg-white/10"
                        onClick={() => navigate(`/edit/${quiz.id}`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => setPendingDelete({ id: quiz.id, title: quiz.title })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.title}"?`}
        description="This will permanently remove the quiz and all its questions. This cannot be undone."
        confirmLabel="Delete Quiz"
        onConfirm={confirmDeleteQuiz}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
