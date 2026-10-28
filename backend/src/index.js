import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "./db/database.js";
import authRoutes from "./routes/auth.js";
import courseRoutes from "./routes/courses.js";
import rubricRoutes from "./routes/rubrics.js";
import assignmentRoutes from "./routes/assignments.js";
import gradingRoutes from "./routes/grading.js";
import appealRoutes from "./routes/appeals.js";
import settingsRoutes from "./routes/settings.js";
import logsRoutes from "./routes/logs.js";
import adminRoutes from "./routes/admin.js";
import examRoutes from "./routes/exams.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

mkdirSync(join(__dirname, "../data"), { recursive: true });
mkdirSync(join(__dirname, "uploads"), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

const corsOrigin = process.env.FRONTEND_URL ?? "http://localhost:5173";
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version, timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/rubrics", rubricRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api", gradingRoutes);
app.use("/api", appealRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", examRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
