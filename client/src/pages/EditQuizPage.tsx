import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Image, Check, X, Play, Clock, Star } from "lucide-react";
import type { Quiz, Question, Answer, Theme } from "@/types";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const THEMES: { value: Theme; label: string; emoji: string }[] = [
  { value: "classic", label: "Classic", emoji: "⚡" },
  { value: "ocean", label: "Ocean", emoji: "🌊" },
  { value: "volcano", label: "Volcano", emoji: "🌋" },
  { value: "forest", label: "Forest", emoji: "🌿" },
  { value: "galaxy", label: "Galaxy", emoji: "🌌" },
];

const THEME_GRADIENTS: Record<Theme, string> = {
  classic: "from-purple-950 via-slate-900 to-indigo-950",
  ocean:   "from-sky-950 via-slate-900 to-cyan-950",
  volcano: "from-orange-950 via-slate-900 to-red-950",
  forest:  "from-green-950 via-slate-900 to-emerald-950",
  galaxy:  "from-indigo-950 via-slate-900 to-violet-950",
};

const THEME_ACCENT: Record<Theme, { btn: string; text: string; border: string; hoverText: string }> = {
  classic: { btn: "bg-purple-500 hover:bg-purple-400", text: "text-purple-400", border: "hover:border-purple-400 hover:text-purple-400", hoverText: "text-slate-400 hover:text-purple-400" },
  ocean:   { btn: "bg-cyan-500 hover:bg-cyan-400",     text: "text-cyan-400",   border: "hover:border-cyan-400 hover:text-cyan-400",     hoverText: "text-slate-400 hover:text-cyan-400" },
  volcano: { btn: "bg-orange-500 hover:bg-orange-400",  text: "text-orange-400", border: "hover:border-orange-400 hover:text-orange-400",  hoverText: "text-slate-400 hover:text-orange-400" },
  forest:  { btn: "bg-green-500 hover:bg-green-400",    text: "text-green-400",  border: "hover:border-green-400 hover:text-green-400",   hoverText: "text-slate-400 hover:text-green-400" },
  galaxy:  { btn: "bg-violet-500 hover:bg-violet-400",  text: "text-violet-400", border: "hover:border-violet-400 hover:text-violet-400", hoverText: "text-slate-400 hover:text-violet-400" },
};

const ANSWER_COLORS = ["answer-red", "answer-blue", "answer-yellow", "answer-green"];
const ANSWER_ICONS = ["▲", "●", "■", "★"];

function AnswerEditor({
  answer,
  colorClass,
  icon,
  onChange,
  onToggleCorrect,
  onDelete,
}: {
  answer: Answer;
  colorClass: string;
  icon: string;
  onChange: (text: string) => void;
  onToggleCorrect: () => void;
  onDelete: () => void;
}) {
  const isYellow = colorClass === "answer-yellow";
  const textClass = isYellow ? "text-gray-900" : "text-white";
  const placeholderClass = isYellow ? "placeholder:text-gray-600" : "placeholder:text-white/60";
  const mutedTextClass = isYellow ? "text-gray-700 hover:text-gray-900" : "text-white/60 hover:text-white";
  const correctBtnClass = answer.isCorrect
    ? "bg-white text-green-600"
    : isYellow
    ? "bg-gray-900/20 text-gray-900 hover:bg-gray-900/40"
    : "bg-white/20 text-white hover:bg-white/40";

  return (
    <div className={`relative flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${colorClass} ${answer.isCorrect ? "ring-2 ring-white ring-offset-1" : ""}`}>
      <span className={`font-bold text-lg w-6 text-center select-none ${textClass}`}>{icon}</span>
      <input
        className={`flex-1 bg-transparent font-medium text-sm outline-none ${textClass} ${placeholderClass}`}
        placeholder="Answer text…"
        value={answer.text}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        onClick={onToggleCorrect}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${correctBtnClass}`}
        title="Mark as correct"
      >
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onDelete} className={mutedTextClass}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  onSave,
  onDelete,
  accent,
}: {
  question: Question;
  index: number;
  onSave: (q: Question) => void;
  onDelete: () => void;
  accent: { btn: string; text: string; border: string; hoverText: string };
}) {
  const [q, setQ] = useState<Question>(() => ({ ...question, timeLimit: question.timeLimit ?? 10 }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setAnswer = (idx: number, text: string) => {
    const answers = [...q.answers];
    answers[idx] = { ...answers[idx], text };
    setQ({ ...q, answers });
  };

  const toggleCorrect = (idx: number) => {
    const answers = q.answers.map((a, i) => ({ ...a, isCorrect: i === idx }));
    setQ({ ...q, answers });
  };

  const addAnswer = () => {
    if (q.answers.length >= 4) return;
    setQ({ ...q, answers: [...q.answers, { id: crypto.randomUUID(), text: "", isCorrect: false }] });
  };

  const removeAnswer = (idx: number) => {
    const answers = q.answers.filter((_, i) => i !== idx);
    setQ({ ...q, answers });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/quizzes/${q.quizId}/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          imageUrl: q.imageUrl,
          answers: q.answers,
          order: q.order,
        }),
      });
      onSave(q);
      toast("Question saved", { description: q.text ? `"${q.text.slice(0, 40)}" updated.` : "Question updated." });
    } catch {
      toast("Failed to save question", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`/api/quizzes/${q.quizId}/questions/${q.id}/image`, {
      method: "POST",
      body: form,
    });
    const { imageUrl } = await res.json();
    setQ((prev) => ({ ...prev, imageUrl }));
    setUploading(false);
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`${accent.text} font-bold text-sm`}>Question {index + 1}</span>
          <button onClick={onDelete} className="text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <Input
          placeholder="Question text…"
          value={q.text}
          onChange={(e) => setQ({ ...q, text: e.target.value })}
          className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 text-base font-medium"
        />

        {/* Image */}
        <div>
          {q.imageUrl ? (
            <div className="relative group">
              <img src={q.imageUrl} alt="" className="w-full h-40 object-cover rounded-lg" />
              <button
                className="absolute top-2 right-2 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setQ({ ...q, imageUrl: undefined })}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className={`w-full h-24 border-2 border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center text-slate-400 ${accent.border} transition-colors`}
            >
              <Image className="w-6 h-6 mb-1" />
              <span className="text-xs">{uploading ? "Uploading…" : "Add image"}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
          />
        </div>

        {/* Answers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.answers.map((a, i) => (
            <AnswerEditor
              key={a.id}
              answer={a}
              colorClass={ANSWER_COLORS[i] ?? "answer-red"}
              icon={ANSWER_ICONS[i] ?? "●"}
              onChange={(text) => setAnswer(i, text)}
              onToggleCorrect={() => toggleCorrect(i)}
              onDelete={() => removeAnswer(i)}
            />
          ))}
          {q.answers.length < 4 && (
            <button
              onClick={addAnswer}
              className={`h-14 border-2 border-dashed border-white/20 rounded-lg text-slate-400 ${accent.border} transition-colors flex items-center justify-center gap-2 text-sm`}
            >
              <Plus className="w-4 h-4" /> Add answer
            </button>
          )}
        </div>

        {/* Settings */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Clock className={`w-4 h-4 ${accent.text}`} />
            <Select value={String(q.timeLimit)} onValueChange={(v) => setQ({ ...q, timeLimit: Number(v) })}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white h-8 text-sm w-[85px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {[5, 10, 20, 30, 45, 60, 90, 120].map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-white focus:bg-white/10">{s}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Star className="w-4 h-4 text-yellow-400" />
            <Select value={String(q.points)} onValueChange={(v) => setQ({ ...q, points: Number(v) })}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white h-8 text-sm w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {[500, 1000, 2000].map((p) => (
                  <SelectItem key={p} value={String(p)} className="text-white focus:bg-white/10">{p} pts</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Button size="sm" className={accent.btn} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EditQuizPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteQ, setPendingDeleteQ] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/quizzes/${id}`)
      .then((r) => r.json())
      .then((data) => { setQuiz(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const addQuestion = async () => {
    if (!quiz) return;
    const newQ = {
      text: "",
      timeLimit: 10,
      points: 1000,
      order: quiz.questions.length,
      answers: [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ],
    };
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newQ),
      });
      if (!res.ok) throw new Error("Server error");
      const { id: qId } = await res.json();
      const fullQ: Question = {
        id: qId,
        quizId: quiz.id,
        text: "",
        timeLimit: 10,
        points: 1000,
        order: quiz.questions.length,
        answers: newQ.answers.map((a) => ({ ...a, id: crypto.randomUUID() })),
      };
      setQuiz({ ...quiz, questions: [...quiz.questions, fullQ] });
      toast("Question added", { description: "Fill in the question text and answers, then save." });
    } catch {
      toast("Failed to add question", { type: "error" });
    }
  };

  const deleteQuestion = (qId: string) => {
    if (!quiz) return;
    setPendingDeleteQ(qId);
  };

  const confirmDeleteQuestion = async () => {
    if (!quiz || !pendingDeleteQ) return;
    const qId = pendingDeleteQ;
    setPendingDeleteQ(null);
    try {
      await fetch(`/api/quizzes/${quiz.id}/questions/${qId}`, { method: "DELETE" });
      setQuiz({ ...quiz, questions: quiz.questions.filter((q) => q.id !== qId) });
      toast("Question deleted", { type: "info" });
    } catch {
      toast("Failed to delete question", { type: "error" });
    }
  };

  const theme = quiz?.theme ?? "classic";
  const grad = `min-h-screen bg-gradient-to-br ${THEME_GRADIENTS[theme]}`;
  const accent = THEME_ACCENT[theme];

  if (loading) return (
    <div className={`${grad} flex items-center justify-center`}>
      <div className="text-white text-lg animate-pulse">Loading quiz…</div>
    </div>
  );

  if (!quiz) return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex items-center justify-center">
      <div className="text-red-400">Quiz not found.</div>
    </div>
  );

  return (
    <div className={grad}>
      {/* Top bar */}
      <header className="border-b border-white/10 bg-black/20 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-slate-400 hover:text-white p-2" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-white font-bold text-lg">{quiz.title}</h1>
            <span className="text-slate-400 text-sm">· {quiz.questions.length} questions</span>
            <Select
              value={quiz.theme}
              onValueChange={async (v) => {
                const newTheme = v as Theme;
                try {
                  await fetch(`/api/quizzes/${quiz.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ theme: newTheme }),
                  });
                  setQuiz({ ...quiz, theme: newTheme });
                  toast("Theme updated", { description: `Switched to ${newTheme}.` });
                } catch {
                  toast("Failed to update theme", { type: "error" });
                }
              }}
            >
              <SelectTrigger className="bg-white/10 border-white/20 text-white h-8 text-sm w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {THEMES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-white focus:bg-white/10">
                    {t.emoji} {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className={accent.btn}
            onClick={() => navigate(`/host/${quiz.id}`)}
            disabled={quiz.questions.length === 0}
          >
            <Play className="w-4 h-4 mr-2" /> Host Game
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {quiz.questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            question={q}
            index={i}
            accent={accent}
            onSave={(updated) => {
              setQuiz({
                ...quiz,
                questions: quiz.questions.map((x) => (x.id === updated.id ? updated : x)),
              });
            }}
            onDelete={() => deleteQuestion(q.id)}
          />
        ))}

        <button
          onClick={addQuestion}
          className={`w-full py-6 border-2 border-dashed border-white/20 rounded-xl text-slate-400 ${accent.border} transition-colors flex items-center justify-center gap-2 text-base font-medium`}
        >
          <Plus className="w-5 h-5" /> Add Question
        </button>
      </main>

      <ConfirmDialog
        open={!!pendingDeleteQ}
        title="Delete question?"
        description="This will permanently remove the question and all its answers. This cannot be undone."
        confirmLabel="Delete Question"
        onConfirm={confirmDeleteQuestion}
        onCancel={() => setPendingDeleteQ(null)}
      />
    </div>
  );
}
