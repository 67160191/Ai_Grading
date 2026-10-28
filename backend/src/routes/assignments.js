import { Router } from "express";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import { unlink } from "fs/promises";
import { openSync, readSync, closeSync, unlinkSync } from "fs";
import db, { nowUTC } from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { runGradingJob, extractSubmissionText } from "../services/grading.js";
import { generateRubric } from "../services/rubricGen.js";
import { formatExportResponse } from "../utils/export.js";

async function deleteUploadedFiles(filePaths) {
  for (const fp of filePaths) {
    if (!fp) continue;
    try {
      await unlink(join(__dirname, "../uploads", fp));
    } catch {
      /* ไฟล์ถูกลบแล้วหรือไม่มี */
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Magic bytes validation — ป้องกันไฟล์ที่เปลี่ยนนามสกุลหลอก
function checkMagicBytes(filePath, ext) {
  const buf = Buffer.alloc(4);
  const fd = openSync(filePath, "r");
  readSync(fd, buf, 0, 4, 0);
  closeSync(fd);
  if (ext === ".pdf") {
    return (
      buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
    ); // %PDF
  }
  if (ext === ".docx") {
    return buf[0] === 0x50 && buf[1] === 0x4b; // PK (ZIP)
  }
  if (ext === ".png") {
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    ); // \x89PNG
  }
  return true; // .txt — ไม่มี magic bytes
}

const storage = multer.diskStorage({
  destination: join(__dirname, "../uploads"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB ?? "20") * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".png"];
    if (allowed.includes(extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, TXT files are allowed"));
    }
  },
});

// GET /api/assignments/:id
router.get("/:id", authenticate, (req, res) => {
  const assignment = db
    .prepare(
      `
    SELECT a.*, rt.name AS rubric_name
    FROM assignments a
    LEFT JOIN rubric_templates rt ON rt.id = a.rubric_id
    WHERE a.id = ?
  `,
    )
    .get(req.params.id);
  if (!assignment)
    return res.status(404).json({ error: "Assignment not found" });
  if (req.user.role === "teacher") {
    const owns = db
      .prepare("SELECT id FROM courses WHERE id = ? AND teacher_id = ?")
      .get(assignment.course_id, req.user.id);
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }
  if (req.user.role === "student") {
    const enrolled = db
      .prepare(
        "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(req.user.id, assignment.course_id);
    if (!enrolled) return res.status(403).json({ error: "Forbidden" });
    if (!assignment.is_open)
      return res.status(404).json({ error: "Assignment not found" });
  }
  res.json({ assignment });
});

// PATCH /api/assignments/:id/open — toggle is_open
router.patch("/:id/open", authenticate, requireRole("teacher"), (req, res) => {
  const assignment = db
    .prepare(
      `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
    )
    .get(req.params.id, req.user.id);
  if (!assignment)
    return res.status(404).json({ error: "Assignment not found" });

  // ถ้าจะเปิด ต้องมี rubric (template หรือ override)
  if (!assignment.is_open) {
    const hasRubric =
      assignment.rubric_id ||
      db
        .prepare(
          "SELECT 1 FROM assignment_rubric_overrides WHERE assignment_id = ?",
        )
        .get(assignment.id);
    if (!hasRubric)
      return res.status(400).json({ error: "กรุณากำหนด Rubric ก่อนเปิดงาน" });
  }

  const newState = assignment.is_open ? 0 : 1;
  db.prepare("UPDATE assignments SET is_open = ? WHERE id = ?").run(
    newState,
    assignment.id,
  );
  res.json({ is_open: newState });
});

// PUT /api/assignments/:id
router.put("/:id", authenticate, requireRole("teacher"), (req, res) => {
  const assignment = db
    .prepare(
      `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
    )
    .get(req.params.id, req.user.id);
  if (!assignment)
    return res.status(404).json({ error: "Assignment not found" });

  const {
    title,
    description,
    deadline,
    rubric_id,
    auto_approve_threshold,
    assignment_type,
    allow_paste,
  } = req.body;
  const newRubricId =
    rubric_id !== undefined ? rubric_id || null : assignment.rubric_id;

  // ถ้าเอา rubric ออก ให้ตรวจว่ายังมี override อยู่ไหม ถ้าไม่มีให้ปิดงาน
  let newIsOpen = assignment.is_open;
  if (!newRubricId) {
    const hasOverride = db
      .prepare(
        "SELECT 1 FROM assignment_rubric_overrides WHERE assignment_id = ?",
      )
      .get(assignment.id);
    if (!hasOverride) newIsOpen = 0;
  }

  db.prepare(
    `
    UPDATE assignments SET title = ?, description = ?, deadline = ?, rubric_id = ?, auto_approve_threshold = ?, assignment_type = ?, is_open = ?, allow_paste = ? WHERE id = ?
  `,
  ).run(
    title ?? assignment.title,
    description ?? assignment.description,
    deadline ?? assignment.deadline,
    newRubricId,
    auto_approve_threshold !== undefined
      ? (auto_approve_threshold ?? null)
      : assignment.auto_approve_threshold,
    assignment_type !== undefined
      ? assignment_type || null
      : assignment.assignment_type,
    newIsOpen,
    allow_paste !== undefined ? (allow_paste === false ? 0 : 1) : assignment.allow_paste,
    assignment.id,
  );

  res.json({
    assignment: db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(assignment.id),
  });
});

// DELETE /api/assignments/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const filePaths = db
      .prepare("SELECT file_path FROM submissions WHERE assignment_id = ?")
      .all(assignment.id)
      .map((s) => s.file_path);

    db.prepare("DELETE FROM assignments WHERE id = ?").run(assignment.id);
    await deleteUploadedFiles(filePaths);
    res.json({ message: "Assignment deleted" });
  },
);

// ─── Rubric Override helpers ───────────────────────────────────────────────────

function getOverrideWithCriteria(assignmentId) {
  const override = db
    .prepare(
      "SELECT * FROM assignment_rubric_overrides WHERE assignment_id = ?",
    )
    .get(assignmentId);
  if (!override) return null;

  const criteria = db
    .prepare(
      "SELECT id, override_id, name, description, order_index, min_score, max_score FROM assignment_override_criteria WHERE override_id = ? ORDER BY order_index",
    )
    .all(override.id);

  override.criteria = criteria.map((c) => {
    const levels = db
      .prepare(
        "SELECT score, label, description FROM assignment_override_levels WHERE override_criteria_id = ? ORDER BY score DESC",
      )
      .all(c.id);
    return { ...c, levels };
  });

  return override;
}

// POST /api/assignments/:id/rubric-override/generate — ร่าง criteria จากคำอธิบายงาน (ไม่บันทึก)
router.post(
  "/:id/rubric-override/generate",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const assignment = db
      .prepare(
        `SELECT a.* FROM assignments a
         JOIN courses c ON c.id = a.course_id
         WHERE a.id = ? AND c.teacher_id = ?`,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const taskText = String(req.body?.task || "").trim();
    if (taskText.length < 10) {
      return res
        .status(400)
        .json({ error: "กรุณาใส่คำอธิบายงานอย่างน้อย 10 ตัวอักษร" });
    }
    try {
      const rubric = await generateRubric(
        taskText.slice(0, 4000),
        req.user.id,
        req.body?.count,
      );
      if (!rubric.criteria.length) {
        return res
          .status(502)
          .json({ error: "AI ไม่สามารถสร้างเกณฑ์ได้ ลองใหม่อีกครั้ง" });
      }
      res.json({ criteria: rubric.criteria });
    } catch (e) {
      console.error("[rubricGen:override]", e.message);
      res
        .status(502)
        .json({ error: "เรียก AI ไม่สำเร็จ — ตรวจสอบว่า Ollama ทำงานอยู่" });
    }
  },
);

// GET /api/assignments/:id/rubric-override
router.get("/:id/rubric-override", authenticate, (req, res) => {
  const assignment = db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(req.params.id);
  if (!assignment)
    return res.status(404).json({ error: "Assignment not found" });

  const override = getOverrideWithCriteria(req.params.id);
  res.json({ override });
});

// PUT /api/assignments/:id/rubric-override
// body: { criteria: [{ name, description, levels: [...] }] }
// ส่ง criteria: null หรือ [] เพื่อลบ override
router.put(
  "/:id/rubric-override",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const { criteria } = req.body;

    db.transaction(() => {
      // ลบ override เก่าออกก่อน (cascade ลบ criteria + levels)
      db.prepare(
        "DELETE FROM assignment_rubric_overrides WHERE assignment_id = ?",
      ).run(assignment.id);

      if (!criteria?.length) {
        // ถ้าไม่มี rubric template ด้วย ให้ปิดงาน
        if (!assignment.rubric_id) {
          db.prepare("UPDATE assignments SET is_open = 0 WHERE id = ?").run(
            assignment.id,
          );
        }
        return;
      }

      const overrideId = db
        .prepare(
          "INSERT INTO assignment_rubric_overrides (assignment_id) VALUES (?)",
        )
        .run(assignment.id).lastInsertRowid;

      const insertCriteria = db.prepare(
        "INSERT INTO assignment_override_criteria (override_id, name, description, order_index, min_score, max_score) VALUES (?, ?, ?, ?, ?, ?)",
      );
      const insertLevel = db.prepare(
        "INSERT INTO assignment_override_levels (override_criteria_id, score, label, description) VALUES (?, ?, ?, ?)",
      );

      for (const [i, c] of criteria.entries()) {
        const minScore = Number.isInteger(Number(c.min_score))
          ? Number(c.min_score)
          : 1;
        const maxScore = Number.isInteger(Number(c.max_score))
          ? Number(c.max_score)
          : 4;
        const criteriaId = insertCriteria.run(
          overrideId,
          c.name,
          c.description || null,
          i,
          minScore,
          maxScore,
        ).lastInsertRowid;
        if (c.levels?.length) {
          for (const lv of c.levels) {
            const score = Number(lv.score);
            if (!Number.isInteger(score)) continue;
            insertLevel.run(
              criteriaId,
              score,
              lv.label || "",
              lv.description || "",
            );
          }
        }
      }
    })();

    res.json({ override: getOverrideWithCriteria(assignment.id) });
  },
);

// GET /api/assignments/:id/my-submissions — ประวัติการส่งงานของ student ที่ login
router.get(
  "/:id/my-submissions",
  authenticate,
  requireRole("student"),
  (req, res) => {
    const assignment = db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(req.params.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const enrolled = db
      .prepare(
        "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(req.user.id, assignment.course_id);
    if (!enrolled) return res.status(403).json({ error: "Forbidden" });

    const submissions = db
      .prepare(
        `
    SELECT
      s.id, s.attempt, s.status, s.submitted_at, s.content_text,
      (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level,
      (SELECT gj.status FROM grading_jobs gj WHERE gj.submission_id = s.id ORDER BY gj.id DESC LIMIT 1) AS job_status
    FROM submissions s
    WHERE s.assignment_id = ? AND s.student_id = ?
    ORDER BY s.attempt DESC
  `,
      )
      .all(req.params.id, req.user.id);

    res.json({ submissions });
  },
);

// POST /api/assignments/:id/submit — student submit งาน
router.post(
  "/:id/submit",
  authenticate,
  requireRole("student"),
  upload.single("file"),
  (req, res) => {
    const assignment = db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(req.params.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const enrolled = db
      .prepare(
        "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(req.user.id, assignment.course_id);
    if (!enrolled)
      return res.status(403).json({ error: "Not enrolled in this course" });

    const filePath = req.file ? req.file.filename : null;
    const contentText = req.body.content_text || null;
    const submissionType =
      req.body.submission_type === "image" ? "image" : "text";

    if (!filePath && !contentText) {
      return res
        .status(400)
        .json({ error: "Either file or content_text is required" });
    }

    if (filePath && !assignment.allow_paste) {
      unlinkSync(join(__dirname, "../uploads", req.file.filename));
      return res
        .status(400)
        .json({ error: "งานนี้ต้องพิมพ์คำตอบเอง ไม่รองรับการอัปโหลดไฟล์" });
    }

    if (req.file) {
      const fullPath = join(__dirname, "../uploads", req.file.filename);
      const ext = extname(req.file.originalname).toLowerCase();
      if (!checkMagicBytes(fullPath, ext)) {
        unlinkSync(fullPath);
        return res
          .status(400)
          .json({
            error: "File content does not match the declared file type",
          });
      }
    }

    const lastAttempt = db
      .prepare(
        `
    SELECT MAX(attempt) AS max_attempt FROM submissions
    WHERE assignment_id = ? AND student_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    const attempt = (lastAttempt?.max_attempt || 0) + 1;

    const hasOverride = !!db
      .prepare(
        "SELECT id FROM assignment_rubric_overrides WHERE assignment_id = ?",
      )
      .get(assignment.id);

    let submission;
    db.transaction(() => {
      const result = db
        .prepare(
          `
      INSERT INTO submissions (assignment_id, student_id, file_path, content_text, attempt, submitted_at, submission_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .run(
          assignment.id,
          req.user.id,
          filePath,
          contentText,
          attempt,
          nowUTC(),
          submissionType,
        );
      submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(result.lastInsertRowid);
    })();

    res.status(201).json({ submission });
  },
);

// GET /api/assignments/:id/consistency — Consistency Checking (teacher only)
router.get(
  "/:id/consistency",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    // ดึง scores ทุก submission ที่ graded/approved แยกตาม criteria
    const rows = db
      .prepare(
        `
    SELECT
      s.id AS submission_id,
      u.name AS student_name,
      g.level,
      COALESCE(g.criteria_name, rc.name, oc.name) AS criteria_name,
      COALESCE(rc.id, oc.id) AS criteria_id,
      COALESCE(rc.order_index, oc.order_index) AS order_index
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN grades g ON g.submission_id = s.id
    LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
    LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
    WHERE s.assignment_id = ? AND s.status IN ('graded', 'approved')
    ORDER BY COALESCE(rc.order_index, oc.order_index), s.id
  `,
      )
      .all(req.params.id);

    if (!rows.length) {
      return res.json({
        criteria_stats: [],
        submission_flags: [],
        total_graded: 0,
      });
    }

    // จัดกลุ่มตาม criteria
    const criteriaMap = {};
    for (const row of rows) {
      const key = `${row.criteria_id}_${row.criteria_name}`;
      if (!criteriaMap[key]) {
        criteriaMap[key] = {
          criteria_name: row.criteria_name,
          order_index: row.order_index,
          entries: [],
        };
      }
      criteriaMap[key].entries.push({
        submission_id: row.submission_id,
        student_name: row.student_name,
        score: row.level,
      });
    }

    // คำนวณ stats ต่อ criteria
    const criteria_stats = Object.values(criteriaMap)
      .sort((a, b) => a.order_index - b.order_index)
      .map((c) => {
        const scores = c.entries.map((e) => e.score);
        const n = scores.length;
        const mean = scores.reduce((s, v) => s + v, 0) / n;
        const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
        const std = Math.sqrt(variance);
        // outliers = submissions ที่ level ห่างจาก mean เกิน 1.5 SD
        const outliers = c.entries
          .filter((e) => Math.abs(e.score - mean) > 1.5 * std && std > 0)
          .map((e) => ({
            submission_id: e.submission_id,
            student_name: e.student_name,
            score: e.score,
            deviation: +(e.score - mean).toFixed(2),
          }));

        return {
          criteria_name: c.criteria_name,
          count: n,
          mean: +mean.toFixed(2),
          std: +std.toFixed(2),
          min: Math.min(...scores),
          max: Math.max(...scores),
          high_variance: std > 0.8, // flag: SD > 0.8 บน scale 1-4
          outliers,
        };
      });

    // สรุป outlier submissions (union จากทุก criteria)
    const flagMap = {};
    for (const cs of criteria_stats) {
      for (const o of cs.outliers) {
        if (!flagMap[o.submission_id]) {
          flagMap[o.submission_id] = {
            submission_id: o.submission_id,
            student_name: o.student_name,
            flagged_criteria: [],
          };
        }
        flagMap[o.submission_id].flagged_criteria.push({
          criteria_name: cs.criteria_name,
          score: o.score,
          mean: cs.mean,
          deviation: o.deviation,
        });
      }
    }

    const total_graded = new Set(rows.map((r) => r.submission_id)).size;

    res.json({
      total_graded,
      criteria_stats,
      submission_flags: Object.values(flagMap),
    });
  },
);

// GET /api/assignments/:id/export หรือ /export/csv — Export คะแนนทั้งหมดเป็น CSV หรือ XLS (teacher only)
router.get(
  ["/:id/export", "/:id/export/csv"],
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.*, c.name AS course_name FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    // ดึง submissions พร้อมคะแนนรวม
    const submissions = db
      .prepare(
        `
    SELECT
      s.id AS submission_id,
      u.name AS student_name,
      u.username AS student_username,
      s.attempt,
      s.status,
      s.submitted_at,
      (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    WHERE s.assignment_id = ?
    ORDER BY u.name, s.attempt
  `,
      )
      .all(req.params.id);

    // ดึง criteria scores แยกต่อ submission
    const grades = db
      .prepare(
        `
    SELECT
      g.submission_id,
      COALESCE(g.criteria_name, rc.name, oc.name) AS criteria_name,
      g.level
    FROM grades g
    LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
    LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
    WHERE g.submission_id IN (
      SELECT id FROM submissions WHERE assignment_id = ?
    )
    ORDER BY COALESCE(rc.order_index, oc.order_index)
  `,
      )
      .all(req.params.id);

    // รวม criteria names ทั้งหมด (unique, ตามลำดับที่เจอ)
    const criteriaNames = [];
    for (const g of grades) {
      if (!criteriaNames.includes(g.criteria_name))
        criteriaNames.push(g.criteria_name);
    }

    // จัด grades ต่อ submission_id
    const gradeMap = {};
    for (const g of grades) {
      if (!gradeMap[g.submission_id]) gradeMap[g.submission_id] = {};
      gradeMap[g.submission_id][g.criteria_name] = { level: g.level };
    }

    const format = req.query.format || (req.path.endsWith("/csv") ? "csv" : "csv");

    const headers = [
      "ชื่อ",
      "รหัสนิสิต",
      "ครั้งที่",
      "สถานะ",
      "วันที่ส่ง",
      "avg_level (/4)",
      ...criteriaNames,
    ];

    const rows = submissions.map((s) => {
      const criteriaLevels = criteriaNames.map((n) => {
        const g = gradeMap[s.submission_id]?.[n];
        return g?.level ?? "";
      });
      return [
        s.student_name,
        s.student_username,
        s.attempt,
        s.status,
        s.submitted_at
          ? new Date(s.submitted_at).toLocaleString("th-TH")
          : "",
        s.avg_level ?? "",
        ...criteriaLevels,
      ];
    });

    const filename = `${assignment.title.replace(/[^a-zA-Z0-9ก-๙]/g, "_")}_scores`;
    return formatExportResponse(res, {
      filename,
      headers,
      rows,
      format,
    });
  },
);

// GET /api/assignments/:id/calibration-examples — ดู calibration examples (teacher only)
router.get(
  "/:id/calibration-examples",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const examples = assignment.calibration_examples
      ? JSON.parse(assignment.calibration_examples)
      : [];
    res.json({ examples });
  },
);

// PUT /api/assignments/:id/calibration-examples — บันทึก calibration examples (teacher only)
router.put(
  "/:id/calibration-examples",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const { examples } = req.body;
    if (!Array.isArray(examples))
      return res.status(400).json({ error: "examples must be an array" });
    if (examples.length > 3)
      return res.status(400).json({ error: "Maximum 3 examples allowed" });

    for (const ex of examples) {
      if (!ex.submission_text?.trim())
        return res
          .status(400)
          .json({ error: "Each example must have submission_text" });
      if (typeof ex.level !== "number" || ex.level < 1 || ex.level > 4)
        return res
          .status(400)
          .json({ error: "Each example must have a numeric level (1-4)" });
    }

    db.prepare(
      "UPDATE assignments SET calibration_examples = ? WHERE id = ?",
    ).run(examples.length > 0 ? JSON.stringify(examples) : null, req.params.id);
    res.json({ examples });
  },
);

// ─── Extract text from uploaded file ──────────────────────────────────────────

router.post(
  "/extract-text",
  authenticate,
  requireRole("student"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const fullPath = join(__dirname, "../uploads", req.file.filename);
      const ext = extname(req.file.originalname).toLowerCase();
      if (!checkMagicBytes(fullPath, ext)) {
        unlinkSync(fullPath);
        return res
          .status(400)
          .json({
            error: "File content does not match the declared file type",
          });
      }

      // Create temp submission object for extractSubmissionText
      const tempSubmission = {
        content_text: null,
        file_path: req.file.filename,
      };

      const extractedText = await extractSubmissionText(tempSubmission);
      res.json({ text: extractedText });
    } catch (err) {
      console.error("[Extract] Error:", err.message);
      res.status(400).json({ error: err.message });
    }
  },
);

export default router;
