import { Router } from "express";
import db from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { generateRubric } from "../services/rubricGen.js";

const router = Router();

// POST /api/rubrics/generate — ร่าง rubric จากคำอธิบายงาน (ไม่บันทึก)
router.post("/generate", authenticate, requireRole("teacher"), async (req, res) => {
  const taskText = String(req.body?.task || "").trim();
  const count = req.body?.count;
  if (taskText.length < 10) {
    return res.status(400).json({ error: "กรุณาใส่คำอธิบายงานอย่างน้อย 10 ตัวอักษร" });
  }
  try {
    const rubric = await generateRubric(
      taskText.slice(0, 4000),
      req.user.id,
      count,
    );
    if (!rubric.criteria.length) {
      return res.status(502).json({ error: "AI ไม่สามารถสร้างเกณฑ์ได้ ลองใหม่อีกครั้ง" });
    }
    res.json({ rubric });
  } catch (e) {
    console.error("[rubricGen]", e.message);
    res.status(502).json({ error: "เรียก AI ไม่สำเร็จ — ตรวจสอบว่า Ollama ทำงานอยู่" });
  }
});

export function getRubricWithCriteria(rubricId) {
  const rubric = db
    .prepare("SELECT * FROM rubric_templates WHERE id = ?")
    .get(rubricId);
  if (!rubric) return null;

  const criteria = db
    .prepare(
      "SELECT id, rubric_id, name, description, order_index, min_score, max_score FROM rubric_criteria WHERE rubric_id = ? ORDER BY order_index",
    )
    .all(rubricId);

  rubric.criteria = criteria.map((c) => {
    const levels = db
      .prepare(
        "SELECT score, label, description FROM rubric_levels WHERE rubric_criteria_id = ? ORDER BY score DESC",
      )
      .all(c.id);
    return { ...c, levels };
  });

  return rubric;
}

export function insertLevels(criteriaId, levels) {
  if (!levels?.length) return;
  const insert = db.prepare(
    "INSERT INTO rubric_levels (rubric_criteria_id, score, label, description) VALUES (?, ?, ?, ?)",
  );
  for (const lv of levels) {
    const score = Number(lv.score);
    if (!Number.isInteger(score)) continue;
    insert.run(criteriaId, score, lv.label || "", lv.description || "");
  }
}

// GET /api/rubrics/:id
// teacher: ต้องเป็นเจ้าของ rubric (via course)
// student: ต้อง enroll ในวิชาที่ rubric นั้นอยู่
router.get("/:id", authenticate, (req, res) => {
  if (req.user.role === "teacher") {
    const rubric = db
      .prepare(
        `SELECT rt.* FROM rubric_templates rt
         JOIN courses c ON c.id = rt.course_id
         WHERE rt.id = ? AND c.teacher_id = ?`,
      )
      .get(req.params.id, req.user.id);
    if (!rubric) return res.status(404).json({ error: "Rubric not found" });
    return res.json({ rubric: getRubricWithCriteria(rubric.id) });
  }

  if (req.user.role === "student") {
    // ตรวจสอบว่า student enroll ในวิชาที่ rubric ใช้งานอยู่
    const rubric = db
      .prepare(
        `SELECT rt.* FROM rubric_templates rt
         JOIN courses c ON c.id = rt.course_id
         JOIN enrollments e ON e.course_id = c.id
         WHERE rt.id = ? AND e.student_id = ?`,
      )
      .get(req.params.id, req.user.id);
    if (!rubric) return res.status(404).json({ error: "Rubric not found" });
    return res.json({ rubric: getRubricWithCriteria(rubric.id) });
  }

  return res.status(403).json({ error: "Forbidden" });
});

// PUT /api/rubrics/:id
router.put("/:id", authenticate, requireRole("teacher"), (req, res) => {
  const rubric = db
    .prepare(
      `
    SELECT rt.* FROM rubric_templates rt
    JOIN courses c ON c.id = rt.course_id
    WHERE rt.id = ? AND c.teacher_id = ?
  `,
    )
    .get(req.params.id, req.user.id);
  if (!rubric) return res.status(404).json({ error: "Rubric not found" });

  const { name, description, criteria } = req.body;

  db.transaction(() => {
    db.prepare(
      "UPDATE rubric_templates SET name = ?, description = ? WHERE id = ?",
    ).run(name ?? rubric.name, description ?? rubric.description, rubric.id);

    if (criteria?.length) {
      // ลบ criteria เก่า (levels จะถูกลบ cascade)
      db.prepare("DELETE FROM rubric_criteria WHERE rubric_id = ?").run(
        rubric.id,
      );
      const insertCriteria = db.prepare(
        "INSERT INTO rubric_criteria (rubric_id, name, description, order_index, min_score, max_score) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const [i, c] of criteria.entries()) {
        const minScore = Number.isInteger(Number(c.min_score))
          ? Number(c.min_score)
          : 1;
        const maxScore = Number.isInteger(Number(c.max_score))
          ? Number(c.max_score)
          : 4;
        const result = insertCriteria.run(
          rubric.id,
          c.name,
          c.description || null,
          i,
          minScore,
          maxScore,
        );
        insertLevels(result.lastInsertRowid, c.levels);
      }
    }
  })();

  res.json({ rubric: getRubricWithCriteria(rubric.id) });
});

// DELETE /api/rubrics/:id
router.delete("/:id", authenticate, requireRole("teacher"), (req, res) => {
  const rubric = db
    .prepare(
      `
    SELECT rt.* FROM rubric_templates rt
    JOIN courses c ON c.id = rt.course_id
    WHERE rt.id = ? AND c.teacher_id = ?
  `,
    )
    .get(req.params.id, req.user.id);
  if (!rubric) return res.status(404).json({ error: "Rubric not found" });

  db.prepare("DELETE FROM rubric_templates WHERE id = ?").run(rubric.id);
  res.json({ message: "Rubric deleted" });
});

export default router;
