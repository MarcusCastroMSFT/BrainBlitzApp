import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import CreatePage from "./pages/CreatePage";
import EditQuizPage from "./pages/EditQuizPage";
import HostPage from "./pages/HostPage";
import PlayPage from "./pages/PlayPage";
import { Toaster } from "./components/ui/toaster";

export default function App() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/edit/:id" element={<EditQuizPage />} />
        <Route path="/host/:id" element={<HostPage />} />
        <Route path="/play" element={<PlayPage />} />
      </Routes>
      <Toaster />
    </div>
  );
}
