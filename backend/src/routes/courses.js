import { Router } from "express";
import { unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import db from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getRubricWithCriteria, insertLevels } from "./rubrics.js";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { logActivity } from "../middleware/logger.js";
import { formatExportResponse } from "../utils/export.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code.slice(0, 3) + "-" + code.slice(3);
}

const router = Router();

// GET /api/courses?archived=0|1
router.get("/", authenticate, (req, res) => {
  const archived = req.query.archived === "1" ? 1 : 0;
  let courses;
  if (req.user.role === "teacher") {
    courses = db
      .prepare(
        `
      SELECT c.*, COUNT(e.student_id) AS student_count
      FROM courses c
      LEFT JOIN enrollments e ON e.course_id = c.id
      WHERE c.teacher_id = ? AND c.archived = ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `,
      )
      .all(req.user.id, archived);
  } else {
    courses = db
      .prepare(
        `
      SELECT c.*
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      WHERE e.student_id = ? AND c.archived = ?
      ORDER BY c.created_at DESC
    `,
      )
      .all(req.user.id, archived);
  }
  res.json({ courses });
});

// GET /api/courses/:id
router.get("/:id", authenticate, (req, res) => {
  const course = db
    .prepare("SELECT * FROM courses WHERE id = ?")
    .get(req.params.id);
  if (!course) return res.status(404).json({ error: "Course not found" });
  if (
    req.user.role === "teacher" &&
    Number(course.teacher_id) !== Number(req.user.id)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (req.user.role === "student") {
    const enrolled = db
      .prepare(
        "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(Number(req.user.id), course.id);
    if (!enrolled) return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ course });
});

// POST /api/courses
router.post("/", authenticate, requireRole("teacher"), (req, res) => {
  const { name, description, color, semester } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const VALID_COLORS = [
    "indigo",
    "pink",
    "emerald",
    "amber",
    "sky",
    "violet",
    "rose",
    "orange",
    "fuchsia",
    "white",
  ];
  const courseColor = VALID_COLORS.includes(color) ? color : "indigo";

  let joinCode;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateJoinCode();
    const exists = db
      .prepare("SELECT id FROM courses WHERE join_code = ?")
      .get(candidate);
    if (!exists) {
      joinCode = candidate;
      break;
    }
  }
  if (!joinCode)
    return res
      .status(500)
      .json({ error: "Could not generate unique join code" });

  const result = db
    .prepare(
      "INSERT INTO courses (name, description, teacher_id, join_code, color, semester) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      name,
      description || null,
      req.user.id,
      joinCode,
      courseColor,
      semester || null,
    );

  const course = db
    .prepare("SELECT * FROM courses WHERE id = ?")
    .get(result.lastInsertRowid);
  logActivity({
    userId: req.user.id,
    action: "course_create",
    entity: "course",
    entityId: result.lastInsertRowid,
    detail: { name },
    ip: req.ip,
  });
  res.status(201).json({ course });
});

// PUT /api/courses/:id
router.put("/:id", authenticate, requireRole("teacher"), (req, res) => {
  const course = db
    .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
    .get(req.params.id, req.user.id);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const { name, description, color, enrollment_open, semester } = req.body;
  const VALID_COLORS = [
    "indigo",
    "pink",
    "emerald",
    "amber",
    "sky",
    "violet",
    "rose",
    "orange",
    "fuchsia",
    "white",
  ];
  const courseColor = VALID_COLORS.includes(color)
    ? color
    : course.color || "indigo";
  const enrollOpen =
    enrollment_open !== undefined
      ? enrollment_open
        ? 1
        : 0
      : course.enrollment_open;
  db.prepare(
    "UPDATE courses SET name = ?, description = ?, color = ?, enrollment_open = ?, semester = ? WHERE id = ?",
  ).run(
    name ?? course.name,
    description ?? course.description,
    courseColor,
    enrollOpen,
    semester !== undefined ? semester || null : course.semester,
    course.id,
  );

  res.json({
    course: db.prepare("SELECT * FROM courses WHERE id = ?").get(course.id),
  });
});

// PATCH /api/courses/:id/archive
router.patch(
  "/:id/archive",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });
    const newArchived = course.archived ? 0 : 1;
    db.prepare("UPDATE courses SET archived = ? WHERE id = ?").run(
      newArchived,
      course.id,
    );
    res.json({
      course: db.prepare("SELECT * FROM courses WHERE id = ?").get(course.id),
    });
  },
);

// DELETE /api/courses/:id
router.delete(
  "/:id",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const filePaths = db
      .prepare(
        `
    SELECT s.file_path FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ?
  `,
      )
      .all(course.id)
      .map((s) => s.file_path);

    db.prepare("DELETE FROM courses WHERE id = ?").run(course.id);
    logActivity({
      userId: req.user.id,
      action: "course_delete",
      entity: "course",
      entityId: course.id,
      detail: { name: course.name },
      ip: req.ip,
    });
    await deleteUploadedFiles(filePaths);
    res.json({ message: "Course deleted" });
  },
);

// POST /api/courses/enroll  (enroll by join_code)
router.post("/enroll", authenticate, requireRole("student"), (req, res) => {
  const { join_code } = req.body;
  if (!join_code)
    return res.status(400).json({ error: "join_code is required" });
  const course = db
    .prepare("SELECT * FROM courses WHERE join_code = ?")
    .get(join_code.toUpperCase().trim());
  if (!course)
    return res
      .status(404)
      .json({ error: "ไม่พบวิชา กรุณาตรวจสอบโค้ดอีกครั้ง" });

  if (!course.enrollment_open)
    return res.status(403).json({ error: "วิชานี้ปิดรับนักเรียนแล้ว" });

  const existing = db
    .prepare("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?")
    .get(req.user.id, course.id);
  if (existing) return res.status(409).json({ error: "เข้าร่วมวิชานี้แล้ว" });

  db.prepare(
    "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
  ).run(req.user.id, course.id);
  res.status(201).json({ message: "Enrolled successfully", course });
});

// GET /api/courses/:id/students
router.get(
  "/:id/students",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const students = db
      .prepare(
        `
    SELECT u.id, u.name, u.username, e.group_no, e.enrolled_at
    FROM users u
    JOIN enrollments e ON e.student_id = u.id
    WHERE e.course_id = ?
    ORDER BY e.group_no, u.username
  `,
      )
      .all(course.id);

    res.json({ students });
  },
);

// PUT /api/courses/:id/students/:studentId/reset-password
router.put(
  "/:id/students/:studentId/reset-password",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const enrolled = db
      .prepare(
        "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(req.params.studentId, req.params.id);
    if (!enrolled)
      return res
        .status(404)
        .json({ error: "Student not found in this course" });

    const student = db
      .prepare("SELECT * FROM users WHERE id = ? AND role = ?")
      .get(req.params.studentId, "student");
    if (!student) return res.status(404).json({ error: "Student not found" });

    const hash = bcrypt.hashSync(student.username, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hash,
      student.id,
    );
    logActivity({
      userId: req.user.id,
      action: "reset_password",
      entity: "user",
      entityId: student.id,
      detail: { student_username: student.username, course_id: course.id },
      ip: req.ip,
    });
    res.json({ message: "Password reset to username" });
  },
);

// POST /api/courses/:id/duplicate
router.post(
  "/:id/duplicate",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const { semester } = req.body;

    let joinCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateJoinCode();
      const exists = db
        .prepare("SELECT id FROM courses WHERE join_code = ?")
        .get(candidate);
      if (!exists) {
        joinCode = candidate;
        break;
      }
    }
    if (!joinCode)
      return res
        .status(500)
        .json({ error: "Could not generate unique join code" });

    const ALL_COLORS = [
      "indigo",
      "pink",
      "emerald",
      "amber",
      "sky",
      "violet",
      "rose",
      "orange",
      "fuchsia",
      "white",
    ];
    const otherColors = ALL_COLORS.filter((c) => c !== course.color);
    const newColor =
      otherColors[Math.floor(Math.random() * otherColors.length)];

    const newCourse = db.transaction(() => {
      const r = db
        .prepare(
          "INSERT INTO courses (name, description, teacher_id, join_code, color, semester) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          course.name,
          course.description,
          req.user.id,
          joinCode,
          newColor,
          semester || null,
        );
      const newCourseId = r.lastInsertRowid;

      // copy rubrics
      const rubrics = db
        .prepare("SELECT * FROM rubric_templates WHERE course_id = ?")
        .all(course.id);
      for (const rubric of rubrics) {
        const rr = db
          .prepare(
            "INSERT INTO rubric_templates (course_id, name, description) VALUES (?, ?, ?)",
          )
          .run(newCourseId, rubric.name, rubric.description);
        const newRubricId = rr.lastInsertRowid;

        const criteria = db
          .prepare("SELECT * FROM rubric_criteria WHERE rubric_id = ?")
          .all(rubric.id);
        for (const c of criteria) {
          const cr = db
            .prepare(
              "INSERT INTO rubric_criteria (rubric_id, name, description, order_index, min_score, max_score) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(
              newRubricId,
              c.name,
              c.description,
              c.order_index,
              c.min_score ?? 1,
              c.max_score ?? 4,
            );
          const levels = db
            .prepare("SELECT * FROM rubric_levels WHERE rubric_criteria_id = ?")
            .all(c.id);
          for (const l of levels) {
            db.prepare(
              "INSERT INTO rubric_levels (rubric_criteria_id, score, label, description) VALUES (?, ?, ?, ?)",
            ).run(
              cr.lastInsertRowid,
              l.score,
              l.label ?? "",
              l.description ?? "",
            );
          }
        }
      }

      // copy assignments (ไม่ copy submissions)
      const assignments = db
        .prepare("SELECT * FROM assignments WHERE course_id = ?")
        .all(course.id);
      for (const a of assignments) {
        const ar = db
          .prepare(
            "INSERT INTO assignments (course_id, title, description, deadline, assignment_type, calibration_examples) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            newCourseId,
            a.title,
            a.description,
            a.deadline,
            a.assignment_type,
            a.calibration_examples || null,
          );
        const newAssignmentId = ar.lastInsertRowid;

        // copy correction examples
        const corrections = db
          .prepare(
            `SELECT submission_text, original_score, final_level, note FROM correction_examples WHERE assignment_id = ? ORDER BY id DESC LIMIT 5`,
          )
          .all(a.id);
        for (const corr of corrections) {
          db.prepare(
            `INSERT INTO correction_examples (assignment_id, submission_text, original_score, final_level, note) VALUES (?, ?, ?, ?, ?)`,
          ).run(
            newAssignmentId,
            corr.submission_text,
            corr.original_score,
            corr.final_level,
            corr.note,
          );
        }

        // copy rubric override
        const override = db
          .prepare(
            "SELECT * FROM assignment_rubric_overrides WHERE assignment_id = ?",
          )
          .get(a.id);
        if (override) {
          const or = db
            .prepare(
              "INSERT INTO assignment_rubric_overrides (assignment_id) VALUES (?)",
            )
            .run(newAssignmentId);
          const newOverrideId = or.lastInsertRowid;

          const criteria = db
            .prepare(
              "SELECT * FROM assignment_override_criteria WHERE override_id = ? ORDER BY order_index",
            )
            .all(override.id);
          for (const c of criteria) {
            const cr = db
              .prepare(
                "INSERT INTO assignment_override_criteria (override_id, name, description, order_index, min_score, max_score) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .run(
                newOverrideId,
                c.name,
                c.description,
                c.order_index,
                c.min_score ?? 1,
                c.max_score ?? 4,
              );

            const levels = db
              .prepare(
                "SELECT * FROM assignment_override_levels WHERE override_criteria_id = ?",
              )
              .all(c.id);
            for (const l of levels) {
              db.prepare(
                "INSERT INTO assignment_override_levels (override_criteria_id, score, label, description) VALUES (?, ?, ?, ?)",
              ).run(
                cr.lastInsertRowid,
                l.score,
                l.label || "",
                l.description || "",
              );
            }
          }
        }
      }

      return db.prepare("SELECT * FROM courses WHERE id = ?").get(newCourseId);
    })();

    res.status(201).json({ course: newCourse });
  },
);

// PUT /api/courses/:id/students/:studentId — แก้ไข group_no
router.put(
  "/:id/students/:studentId",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const { group_no } = req.body;
    db.prepare(
      "UPDATE enrollments SET group_no = ? WHERE student_id = ? AND course_id = ?",
    ).run(group_no || null, req.params.studentId, course.id);
    res.json({ message: "Updated" });
  },
);

// DELETE /api/courses/:id/students/:studentId
router.delete(
  "/:id/students/:studentId",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const studentId = req.params.studentId;
    const filePaths = db
      .prepare(
        `
    SELECT s.file_path FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ? AND s.student_id = ?
  `,
      )
      .all(course.id, studentId)
      .map((s) => s.file_path);

    db.transaction(() => {
      // ลบ submissions ทุกงานในวิชานี้ของนักเรียนคนนี้
      const assignments = db
        .prepare("SELECT id FROM assignments WHERE course_id = ?")
        .all(course.id);
      for (const a of assignments) {
        db.prepare(
          "DELETE FROM submissions WHERE assignment_id = ? AND student_id = ?",
        ).run(a.id, studentId);
      }
      db.prepare(
        "DELETE FROM enrollments WHERE student_id = ? AND course_id = ?",
      ).run(studentId, course.id);
    })();
    await deleteUploadedFiles(filePaths);
    res.json({ message: "Student removed" });
  },
);

// DELETE /api/courses/:id/students — ลบนักเรียนทั้งหมดออกจากวิชา
router.delete(
  "/:id/students",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const filePaths = db
      .prepare(
        `
    SELECT s.file_path FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ?
  `,
      )
      .all(course.id)
      .map((s) => s.file_path);

    db.transaction(() => {
      // ลบ submissions ทุกงานในวิชานี้
      const assignments = db
        .prepare("SELECT id FROM assignments WHERE course_id = ?")
        .all(course.id);
      for (const a of assignments) {
        db.prepare("DELETE FROM submissions WHERE assignment_id = ?").run(a.id);
      }
      db.prepare("DELETE FROM enrollments WHERE course_id = ?").run(course.id);
    })();
    await deleteUploadedFiles(filePaths);
    res.json({ message: "All students removed" });
  },
);

// GET /api/courses/:id/students/export
router.get(
  "/:id/students/export",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const students = db
      .prepare(
        `
    SELECT e.group_no, u.username, u.name, e.enrolled_at
    FROM users u
    JOIN enrollments e ON e.student_id = u.id
    WHERE e.course_id = ?
    ORDER BY e.group_no, u.username
  `,
      )
      .all(course.id);

    const format = req.query.format || "csv";
    const headers = ["กลุ่ม", "รหัสนิสิต", "ชื่อนามสกุล", "วันที่เข้าร่วม"];
    const rows = students.map((s) => [
      s.group_no || "",
      s.username,
      s.name,
      s.enrolled_at ? s.enrolled_at.slice(0, 10) : "",
    ]);

    return formatExportResponse(res, {
      filename: `students-${course.id}`,
      headers,
      rows,
      format,
    });
  },
);

// GET /api/courses/:id/grades/export?mode=latest|best
router.get(
  "/:id/grades/export",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const mode = req.query.mode === "best" ? "best" : "latest";

    const assignments = db
      .prepare(
        "SELECT id, title FROM assignments WHERE course_id = ? ORDER BY created_at",
      )
      .all(course.id);
    const students = db
      .prepare(
        `
    SELECT u.id, u.name, u.username, e.group_no
    FROM users u
    JOIN enrollments e ON e.student_id = u.id
    WHERE e.course_id = ?
    ORDER BY e.group_no, u.username
  `,
      )
      .all(course.id);

    const getScore = (assignmentId, studentId) => {
      if (mode === "best") {
        // คะแนนมากที่สุดจากทุก submission
        const subs = db
          .prepare(
            `
        SELECT s.id FROM submissions s
        WHERE s.assignment_id = ? AND s.student_id = ?
      `,
          )
          .all(assignmentId, studentId);
        if (!subs.length) return "";
        let best = "";
        for (const sub of subs) {
          const approval = db
            .prepare(
              "SELECT final_level FROM grade_approvals WHERE submission_id = ? ORDER BY approved_at DESC LIMIT 1",
            )
            .get(sub.id);
          const total =
            db
              .prepare(
                "SELECT ROUND(AVG(level), 2) as t FROM grades WHERE submission_id = ?",
              )
              .get(sub.id)?.t ?? null;
          const score = approval?.final_level ?? total ?? null;
          if (score !== null && (best === "" || Number(score) > Number(best)))
            best = score;
        }
        return best;
      } else {
        // คะแนนล่าสุด (attempt สูงสุด)
        const sub = db
          .prepare(
            `
        SELECT s.id FROM submissions s
        WHERE s.assignment_id = ? AND s.student_id = ?
        ORDER BY s.attempt DESC LIMIT 1
      `,
          )
          .get(assignmentId, studentId);
        if (!sub) return "";
        const approval = db
          .prepare(
            "SELECT final_level FROM grade_approvals WHERE submission_id = ? ORDER BY approved_at DESC LIMIT 1",
          )
          .get(sub.id);
        const total =
          db
            .prepare(
              "SELECT ROUND(AVG(level), 2) as t FROM grades WHERE submission_id = ?",
            )
            .get(sub.id)?.t ?? "";
        return approval?.final_level ?? total ?? "";
      }
    };

    const format = req.query.format || "csv";
    const headers = [
      "กลุ่ม",
      "รหัสนิสิต",
      "ชื่อนามสกุล",
      ...assignments.map((a) => a.title),
      "รวม",
    ];
    const rows = students.map((s) => {
      const scores = assignments.map((a) => getScore(a.id, s.id));
      const numericScores = scores.filter((v) => v !== "");
      const sum = numericScores.length
        ? numericScores.reduce((a, b) => a + Number(b), 0)
        : "";
      return [s.group_no || "", s.username, s.name, ...scores, sum];
    });

    return formatExportResponse(res, {
      filename: `grades-${mode}-${course.id}`,
      headers,
      rows,
      format,
    });
  },
);

// ─── Rubric nested routes ──────────────────────────────────────────────────

// GET /api/courses/:id/rubrics
router.get("/:id/rubrics", authenticate, requireRole("teacher"), (req, res) => {
  const course = db
    .prepare("SELECT id FROM courses WHERE id = ? AND teacher_id = ?")
    .get(req.params.id, Number(req.user.id));
  if (!course) return res.status(403).json({ error: "Forbidden" });

  const rubrics = db
    .prepare(
      `
    SELECT rt.*, COUNT(rc.id) AS criteria_count
    FROM rubric_templates rt
    LEFT JOIN rubric_criteria rc ON rc.rubric_id = rt.id
    WHERE rt.course_id = ?
    GROUP BY rt.id
    ORDER BY rt.created_at DESC
  `,
    )
    .all(req.params.id);
  res.json({ rubrics });
});

// POST /api/courses/:id/rubrics
router.post(
  "/:id/rubrics",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const { name, description, criteria } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!criteria?.length)
      return res.status(400).json({ error: "criteria array is required" });

    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const insertRubric = db.prepare(
      "INSERT INTO rubric_templates (course_id, name, description) VALUES (?, ?, ?)",
    );
    const insertCriteria = db.prepare(
      "INSERT INTO rubric_criteria (rubric_id, name, description, order_index, min_score, max_score) VALUES (?, ?, ?, ?, ?, ?)",
    );

    const rubricId = db.transaction(() => {
      const r = insertRubric.run(course.id, name, description || null);
      criteria.forEach((c, i) => {
        const minScore = Number.isInteger(Number(c.min_score))
          ? Number(c.min_score)
          : 1;
        const maxScore = Number.isInteger(Number(c.max_score))
          ? Number(c.max_score)
          : 4;
        const cr = insertCriteria.run(
          r.lastInsertRowid,
          c.name,
          c.description || null,
          i,
          minScore,
          maxScore,
        );
        insertLevels(cr.lastInsertRowid, c.levels);
      });
      return r.lastInsertRowid;
    })();

    res.status(201).json({ rubric: getRubricWithCriteria(rubricId) });
  },
);

// GET /api/courses/:id/stats — Teacher Dashboard stats
router.get("/:id/stats", authenticate, requireRole("teacher"), (req, res) => {
  const course = db
    .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
    .get(req.params.id, req.user.id);
  if (!course) return res.status(404).json({ error: "Course not found" });

  // ภาพรวมวิชา
  const overview = db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT a.id)                                          AS total_assignments,
      COUNT(DISTINCT s.id)                                          AS total_submissions,
      COUNT(DISTINCT CASE WHEN s.status IN ('graded','approved') THEN s.id END) AS graded_count,
      COUNT(DISTINCT CASE WHEN s.status = 'approved' THEN s.id END) AS approved_count,
      COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.id END)  AS pending_count,
      ROUND(AVG(CASE WHEN s.status IN ('graded','approved')
        THEN (SELECT AVG(g.level) FROM grades g WHERE g.submission_id = s.id) END), 2) AS avg_level,
      (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
       FROM grades g
       LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
       LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
       JOIN submissions s2 ON s2.id = g.submission_id
       JOIN assignments a2 ON a2.id = s2.assignment_id
       WHERE a2.course_id = ?) AS max_level
    FROM assignments a
    LEFT JOIN submissions s ON s.assignment_id = a.id
    WHERE a.course_id = ?
  `,
    )
    .get(req.params.id, req.params.id);

  // Grade distribution (คำนวณจาก avg_level 1-4)
  const submissions = db
    .prepare(
      `
    SELECT s.id,
      (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ? AND s.status IN ('graded','approved')
  `,
    )
    .all(req.params.id);

  const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of submissions) {
    if (s.avg_level == null) continue;
    if (s.avg_level >= 3.2)
      dist.A++; // ≥80%
    else if (s.avg_level >= 2.8)
      dist.B++; // 70–79%
    else if (s.avg_level >= 2.4)
      dist.C++; // 60–69%
    else if (s.avg_level >= 2.0)
      dist.D++; // 50–59%
    else dist.F++; // <50%
  }

  // Per-assignment breakdown
  const assignments = db
    .prepare(
      `
    SELECT a.id, a.title, a.deadline,
      COUNT(s.id) AS submission_count,
      COUNT(CASE WHEN s.status IN ('graded','approved') THEN 1 END) AS graded_count,
      COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_count,
      COUNT(CASE WHEN s.status = 'pending' THEN 1 END) AS pending_count,
      ROUND(AVG(CASE WHEN s.status IN ('graded','approved')
        THEN (SELECT AVG(g.level) FROM grades g WHERE g.submission_id = s.id) END), 2) AS avg_level,
      (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
       FROM grades g
       LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
       LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
       JOIN submissions s2 ON s2.id = g.submission_id
       WHERE s2.assignment_id = a.id) AS max_level
    FROM assignments a
    LEFT JOIN submissions s ON s.assignment_id = a.id
    WHERE a.course_id = ?
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `,
    )
    .all(req.params.id);

  res.json({ overview, distribution: dist, assignments });
});

// ─── Assignment nested routes ──────────────────────────────────────────────

// GET /api/courses/:id/assignments
router.get("/:id/assignments", authenticate, (req, res) => {
  // ตรวจสอบสิทธิ์: teacher ต้องเป็นเจ้าของ, student ต้อง enroll
  if (req.user.role === "teacher") {
    const owns = db
      .prepare("SELECT id FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, Number(req.user.id));
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  } else if (req.user.role === "student") {
    const enrolled = db
      .prepare(
        "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?",
      )
      .get(Number(req.user.id), req.params.id);
    if (!enrolled) return res.status(403).json({ error: "Forbidden" });
  }

  const studentId = req.user.role === "student" ? Number(req.user.id) : null;

  const assignments = db
    .prepare(
      `
    SELECT a.*, rt.name AS rubric_name,
      s.id        AS latest_submission_id,
      s.status    AS latest_status,
      s.attempt   AS latest_attempt,
      s.submitted_at AS latest_submitted_at,
      (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS latest_avg_level,
      (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
       FROM grades g
       LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
       LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
       WHERE g.submission_id = s.id) AS latest_max_level,
      EXISTS(SELECT 1 FROM assignment_rubric_overrides WHERE assignment_id = a.id) AS has_override
    FROM assignments a
    LEFT JOIN rubric_templates rt ON rt.id = a.rubric_id
    LEFT JOIN submissions s ON s.id = (
      SELECT id FROM submissions
      WHERE assignment_id = a.id AND student_id = ?
      ORDER BY attempt DESC LIMIT 1
    )
    WHERE a.course_id = ? AND (? = 1 OR a.is_open = 1)
    ORDER BY a.created_at DESC
  `,
    )
    .all(studentId, req.params.id, req.user.role === "teacher" ? 1 : 0);
  res.json({ assignments });
});

// POST /api/courses/:id/assignments
router.post(
  "/:id/assignments",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const {
      title,
      description,
      deadline,
      rubric_id,
      assignment_type,
      auto_approve_threshold,
      allow_paste,
    } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (rubric_id) {
      const rubric = db
        .prepare(
          "SELECT * FROM rubric_templates WHERE id = ? AND course_id = ?",
        )
        .get(rubric_id, course.id);
      if (!rubric)
        return res
          .status(400)
          .json({ error: "Rubric not found in this course" });
    }

    const result = db
      .prepare(
        "INSERT INTO assignments (course_id, rubric_id, title, description, deadline, assignment_type, auto_approve_threshold, is_open, allow_paste) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
      )
      .run(
        course.id,
        rubric_id || null,
        title,
        description || null,
        deadline || null,
        assignment_type || null,
        auto_approve_threshold ?? null,
        allow_paste === false ? 0 : 1,
      );

    const assignment = db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(result.lastInsertRowid);
    logActivity({
      userId: req.user.id,
      action: "assignment_create",
      entity: "assignment",
      entityId: result.lastInsertRowid,
      detail: { title, course_id: course.id },
      ip: req.ip,
    });
    res.status(201).json({ assignment });
  },
);

// POST /api/courses/:id/import-students
router.post(
  "/:id/import-students",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const course = db
      .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
      .get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const { csv } = req.body;
    if (!csv || typeof csv !== "string")
      return res.status(400).json({ error: "csv text is required" });

    const lines = csv
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // ข้ามแถว header ถ้ามี
    const dataLines =
      lines[0]?.toLowerCase().includes("รหัส") ||
      lines[0]?.toLowerCase().includes("กลุ่ม")
        ? lines.slice(1)
        : lines;

    const results = { created: 0, enrolled: 0, skipped: 0, errors: [] };

    const importTx = db.transaction(() => {
      for (const line of dataLines) {
        // parse CSV โดย handle quoted values (เช่น "Doe, John")
        const parts = [];
        let cur = "",
          inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuote = !inQuote;
          } else if (ch === "," && !inQuote) {
            parts.push(cur.trim());
            cur = "";
          } else {
            cur += ch;
          }
        }
        parts.push(cur.trim());
        if (parts.length < 3) {
          results.errors.push({
            line,
            reason:
              "ข้อมูลไม่ครบ (ต้องการ 3 คอลัมน์: กลุ่ม,รหัสนิสิต,ชื่อนามสกุล)",
          });
          continue;
        }
        const [groupNo, username, name] = parts;
        if (!username || !name) {
          results.errors.push({ line, reason: "ข้อมูลไม่ครบ" });
          continue;
        }

        const trimmedUsername = username.trim();
        const trimmedName = name.trim();

        // หา user หรือสร้างใหม่ (username = รหัสนิสิต, password = รหัสนิสิต)
        let user = db
          .prepare("SELECT * FROM users WHERE username = ?")
          .get(trimmedUsername);
        if (!user) {
          const hash = bcrypt.hashSync(trimmedUsername, 10);
          const r = db
            .prepare(
              "INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)",
            )
            .run(trimmedName, trimmedUsername, hash, "student");
          user = db
            .prepare("SELECT * FROM users WHERE id = ?")
            .get(r.lastInsertRowid);
          results.created++;
        }

        // Enroll
        const existing = db
          .prepare(
            "SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?",
          )
          .get(user.id, course.id);
        if (existing) {
          results.skipped++;
        } else {
          db.prepare(
            "INSERT INTO enrollments (student_id, course_id, group_no) VALUES (?, ?, ?)",
          ).run(user.id, course.id, groupNo?.trim() || null);
          results.enrolled++;
        }
      }
    });

    importTx();
    logActivity({
      userId: req.user.id,
      action: "import_students",
      entity: "course",
      entityId: course.id,
      detail: {
        created: results.created,
        enrolled: results.enrolled,
        skipped: results.skipped,
      },
      ip: req.ip,
    });
    res.json({ ...results, total: dataLines.length });
  },
);

// GET /api/courses/my-data — นิสิต export ข้อมูลทั้งหมดของตัวเอง (PDPA Data Subject Right)
router.get("/my-data", authenticate, requireRole("student"), (req, res) => {
  const studentId = req.user.id;

  const profile = db
    .prepare(
      "SELECT id, username, name, role, created_at FROM users WHERE id = ?",
    )
    .get(studentId);

  const enrollments = db
    .prepare(
      `
    SELECT c.id AS course_id, c.name AS course_name, c.semester, e.group_no, e.enrolled_at
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = ?
  `,
    )
    .all(studentId);

  const submissions = db
    .prepare(
      `
    SELECT s.id, s.attempt, s.status, s.submitted_at,
           a.title AS assignment_title, c.name AS course_name,
           CASE WHEN s.content_text IS NOT NULL OR s.file_path IS NOT NULL THEN true ELSE false END AS has_content
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.student_id = ?
    ORDER BY s.submitted_at DESC
  `,
    )
    .all(studentId);

  const grades = db
    .prepare(
      `
    SELECT g.submission_id, g.criteria_name, g.level, g.reasoning, g.feedback,
           ga.action, ga.approved_at, ga.note
    FROM grades g
    JOIN submissions s ON s.id = g.submission_id
    LEFT JOIN grade_approvals ga ON ga.submission_id = g.submission_id
    WHERE s.student_id = ?
    ORDER BY ga.approved_at DESC
  `,
    )
    .all(studentId);

  const appeals = db
    .prepare(
      `
    SELECT ap.submission_id, ap.reason, ap.status, ap.teacher_note, ap.created_at, ap.resolved_at
    FROM appeals ap
    JOIN submissions s ON s.id = ap.submission_id
    WHERE s.student_id = ?
    ORDER BY ap.created_at DESC
  `,
    )
    .all(studentId);

  res.json({
    exported_at: new Date().toISOString(),
    profile,
    enrollments,
    submissions,
    grades,
    appeals,
  });
});

export default router;
