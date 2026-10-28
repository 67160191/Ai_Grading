import { Router } from "express";
import db from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// default URL ของ Ollama server (internal network — ไม่ใช่ public facing)
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || "http://10.80.39.41:11941";

// keys ที่อาจารย์แต่ละคนแก้ได้เอง (per-teacher)
const PER_TEACHER_KEYS = [
  "ollama_url",
  "ollama_temperature",
  "ollama_top_p",
  "ollama_repeat_penalty",
  "ollama_seed",
  "ollama_num_predict",
];

function getGlobalSettings() {
  const globalRows = db
    .prepare("SELECT key, value FROM grading_settings WHERE teacher_id IS NULL ORDER BY id")
    .all();
  return Object.fromEntries(globalRows.map((r) => [r.key, r.value]));
}

function getEffectiveSettings(teacherId) {
  const g = getGlobalSettings();
  const teacherRows = db
    .prepare("SELECT key, value FROM grading_settings WHERE teacher_id = ? ORDER BY id")
    .all(teacherId);
  const t = Object.fromEntries(teacherRows.map((r) => [r.key, r.value]));
  // merge: teacher override ก่อน, fallback global
  return { ...g, ...t };
}

// GET /api/settings/grading — ดึง effective settings ของอาจารย์คนนี้
router.get("/grading", authenticate, requireRole("teacher"), (req, res) => {
  const settings = getEffectiveSettings(req.user.id);
  const teacherRows = db
    .prepare("SELECT key FROM grading_settings WHERE teacher_id = ?")
    .all(req.user.id);
  // teacher_overrides: key ที่อาจารย์คนนี้ตั้งเอง (ไม่รวมค่าที่ fallback มาจาก global)
  // ให้ frontend แยกได้ว่าช่องไหน "ว่าง = ใช้ global" กับ "ตั้งเองจริง"
  const teacherOverrides = teacherRows.map((r) => r.key);
  // model เป็น global-only — ส่งไปให้ frontend แสดง read-only
  res.json({ settings, teacher_overrides: teacherOverrides, global_keys: ["ollama_model"] });
});

// PUT /api/settings/grading — บันทึก per-teacher settings
router.put("/grading", authenticate, requireRole("teacher"), (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({ error: "settings object is required" });
  }

  const upsert = db.prepare(`
    INSERT INTO grading_settings (teacher_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(teacher_id, key) DO UPDATE SET value = excluded.value
  `);
  const del = db.prepare(
    "DELETE FROM grading_settings WHERE teacher_id = ? AND key = ?",
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      if (!PER_TEACHER_KEYS.includes(key)) continue;
      // ค่าว่าง = เคลียร์ override ของอาจารย์ ให้ fallback ไปใช้ global แทน
      if (value === "" || value == null) {
        del.run(req.user.id, key);
      } else {
        upsert.run(req.user.id, key, String(value));
      }
    }
  })();

  const updated = getEffectiveSettings(req.user.id);
  const teacherOverrides = db
    .prepare("SELECT key FROM grading_settings WHERE teacher_id = ?")
    .all(req.user.id)
    .map((r) => r.key);
  res.json({ settings: updated, teacher_overrides: teacherOverrides, global_keys: ["ollama_model"] });
});

const pingOllama = async (url) => {
  try {
    const resp = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
};

// GET /api/settings/ollama-status — ตรวจสอบการเชื่อมต่อ Ollama + model ที่ใช้
router.get(
  "/ollama-status",
  authenticate,
  requireRole("teacher", "admin", "student"),
  async (req, res) => {
    const s = getEffectiveSettings(req.user.id);
    const model =
      s.ollama_model || process.env.OLLAMA_MODEL || "qwen3-coder:30b";

    // นิสิต: เช็คทุกอาจารย์ที่ตัวเองลงทะเบียนเรียนด้วย (แต่ละคนอาจตั้ง ollama_url เอง) —
    // ถือว่า "พร้อมใช้งาน" ถ้ามีอย่างน้อย 1 อาจารย์ที่ grade ได้ ไม่ผูกกับ global เพียงอย่างเดียว
    if (req.user.role === "student") {
      const teacherIds = db
        .prepare(
          `SELECT DISTINCT c.teacher_id FROM enrollments e
           JOIN courses c ON c.id = e.course_id
           WHERE e.student_id = ?`,
        )
        .all(req.user.id)
        .map((r) => r.teacher_id);

      const globalPrimary = s.ollama_url || DEFAULT_OLLAMA_URL;
      const globalBackup = s.ollama_url_backup || null;

      // ของแต่ละอาจารย์ (หรือ global primary ถ้าไม่ได้ตั้งเอง) ก่อน
      // แล้วค่อย global primary / global backup เป็น fallback ลำดับถัดไป
      const urlsToCheck = teacherIds.length
        ? teacherIds.map((tid) => getEffectiveSettings(tid).ollama_url || globalPrimary)
        : [globalPrimary];
      urlsToCheck.push(globalPrimary);
      if (globalBackup) urlsToCheck.push(globalBackup);

      for (const url of [...new Set(urlsToCheck)]) {
        if (await pingOllama(url)) {
          return res.json({ connected: true, url, model });
        }
      }
      return res.json({ connected: false, model });
    }

    // ลำดับ fallback: URL ของตัวเอง (ของอาจารย์ หรือ global ถ้าไม่ได้ตั้ง) →
    // URL หลักของระบบ (เฉพาะถ้าต่างจาก URL ของตัวเอง) → URL สำรองของระบบ
    const g = getGlobalSettings();
    const primaryUrl = s.ollama_url || DEFAULT_OLLAMA_URL;
    const globalPrimaryUrl = g.ollama_url || DEFAULT_OLLAMA_URL;
    const backupUrl = s.ollama_url_backup || null;

    if (await pingOllama(primaryUrl)) {
      return res.json({ connected: true, url: primaryUrl, model, using: "primary" });
    }
    if (globalPrimaryUrl !== primaryUrl && (await pingOllama(globalPrimaryUrl))) {
      return res.json({ connected: true, url: globalPrimaryUrl, model, using: "backup" });
    }
    if (backupUrl && backupUrl !== primaryUrl && (await pingOllama(backupUrl))) {
      return res.json({ connected: true, url: backupUrl, model, using: "backup" });
    }
    res.json({ connected: false, url: primaryUrl, model, using: "primary" });
  },
);

export default router;
