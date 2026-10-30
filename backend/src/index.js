import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

// Trust reverse proxy (Nginx) so req.ip and X-Forwarded-For reflect true client IP
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Enhanced Helmet headers
app.use(helmet());

// Global rate limiter to protect against DDoS or crawling (1,200 requests/min per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่" },
});
app.use("/api", globalLimiter);

// Robust CORS supporting local development and campus LAN IPs
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:8800",
  "http://localhost:5173",
  "http://127.0.0.1:8800",
  "http://127.0.0.1:5173",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as same-origin proxies, curl, mobile)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "5mb" }));

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
