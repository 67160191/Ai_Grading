import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import db from "../db/database.js";
import { logActivity } from "../middleware/logger.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");

// Rate limiters for registration and login endpoints to prevent abuse and brute-force attacks
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "สมัครสมาชิกบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Max 20 failed attempts per username+IP in 15 minutes
  skipSuccessfulRequests: true, // Crucial: legitimate student logins never count against the limit
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "ip";
    const user = req.body?.username ? String(req.body.username).trim().toLowerCase() : "";
    return user ? `${ip}_${user}` : ip;
  },
  message: { error: "เข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register
router.post("/register", registerLimiter, (req, res) => {
  const { name, username, password, role, website } = req.body;

  if (website) {
    return res.status(400).json({ error: "Invalid request" });
  }

  if (!name || !username || !password || !role) {
    return res
      .status(400)
      .json({ error: "name, username, password, role are required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
  }

  if (role !== "teacher") {
    return res
      .status(403)
      .json({ error: "การสมัครสมาชิกรองรับเฉพาะอาจารย์เท่านั้น" });
  }

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      "INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)",
    )
    .run(name, username, hashed, role);

  const token = jwt.sign(
    { id: result.lastInsertRowid, role, name },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    },
  );

  logActivity({
    userId: result.lastInsertRowid,
    action: "register",
    entity: "user",
    entityId: result.lastInsertRowid,
    detail: { username, role },
    ip: req.ip,
  });

  res.status(201).json({
    token,
    user: { id: result.lastInsertRowid, name, username, role },
  });
});

// POST /api/auth/login
router.post("/login", loginLimiter, (req, res) => {
  const { username, password, website } = req.body;

  if (website) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "username and password are required" });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    },
  );

  logActivity({
    userId: user.id,
    action: "login",
    entity: "user",
    entityId: user.id,
    ip: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    },
  });
});

// PATCH /api/auth/change-password
router.patch("/change-password", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  let payload;
  try {
    payload = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "currentPassword and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, user.id);
  logActivity({
    userId: user.id,
    action: "change_password",
    entity: "user",
    entityId: user.id,
    ip: req.ip,
  });

  res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = db
      .prepare("SELECT id, name, username, role FROM users WHERE id = ?")
      .get(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
