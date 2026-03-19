import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { Server } from "socket.io";
import { quizRouter } from "./routes/quizzes";
import { registerSocketHandlers } from "./socket";
import { ensureDatabase } from "./db";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";

const app = express();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/quizzes", quizRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve built client in production only
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

registerSocketHandlers(io);

const PORT = Number(process.env.PORT ?? 3001);

ensureDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`🧠 BrainBlitz server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Cosmos DB initialisation failed:", err);
  process.exit(1);
});
