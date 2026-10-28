import { readFileSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mammoth from "mammoth";
import db from "../db/database.js";
import { logActivity } from "../middleware/logger.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || "http://10.80.39.41:11941";

export function getGradingSettings(teacherId = null, assignmentId = null) {
  // Global defaults (teacher_id = NULL)
  const globalRows = db
    .prepare("SELECT key, value FROM grading_settings WHERE teacher_id IS NULL ORDER BY id")
    .all();
  const g = Object.fromEntries(globalRows.map((r) => [r.key, r.value]));

  // Per-teacher overrides (ถ้ามี teacherId)
  const t = {};
  if (teacherId) {
    const teacherRows = db
      .prepare("SELECT key, value FROM grading_settings WHERE teacher_id = ? ORDER BY id")
      .all(teacherId);
    for (const r of teacherRows) t[r.key] = r.value;
  }

  // Per-assignment overrides (ถ้ามี assignmentId) — check assignment override → teacher override → global
  const a = {};
  if (assignmentId) {
    const assignmentRow = db
      .prepare(
        "SELECT * FROM assignment_grading_settings WHERE assignment_id = ?",
      )
      .get(assignmentId);
    if (assignmentRow) {
      if (assignmentRow.ollama_temperature !== null)
        a.ollama_temperature = assignmentRow.ollama_temperature;
      if (assignmentRow.ollama_top_p !== null)
        a.ollama_top_p = assignmentRow.ollama_top_p;
      if (assignmentRow.ollama_repeat_penalty !== null)
        a.ollama_repeat_penalty = assignmentRow.ollama_repeat_penalty;
      if (assignmentRow.ollama_num_predict !== null)
        a.ollama_num_predict = assignmentRow.ollama_num_predict;
      if (assignmentRow.ollama_seed !== null)
        a.ollama_seed = assignmentRow.ollama_seed;
    }
  }

  // model ดึงจาก global เสมอ (ไม่ per-teacher, ไม่ per-assignment)
  return {
    url: t.ollama_url ?? g.ollama_url ?? DEFAULT_OLLAMA_URL,
    // URL หลักของระบบ (global) แยกไว้ต่างหาก — ใช้เป็น fallback ลำดับ 2
    // กรณีอาจารย์ตั้ง url เองแต่ล่ม ก่อนจะลองตัวสำรองของระบบ
    urlGlobalPrimary: g.ollama_url || DEFAULT_OLLAMA_URL,
    urlBackup: g.ollama_url_backup || null,
    model: g.ollama_model || process.env.OLLAMA_MODEL || "qwen3-coder:30b",
    vision_model:
      g.ollama_vision_model ||
      process.env.OLLAMA_VISION_MODEL ||
      "qwen3.6:35b",
    temperature: parseFloat(
      a.ollama_temperature ??
        t.ollama_temperature ??
        g.ollama_temperature ??
        "0.2",
    ),
    top_p: parseFloat(
      a.ollama_top_p ?? t.ollama_top_p ?? g.ollama_top_p ?? "0.9",
    ),
    repeat_penalty: parseFloat(
      a.ollama_repeat_penalty ??
        t.ollama_repeat_penalty ??
        g.ollama_repeat_penalty ??
        "1.1",
    ),
    num_predict: parseInt(
      a.ollama_num_predict ??
        t.ollama_num_predict ??
        g.ollama_num_predict ??
        "2048",
    ),
    seed:
      (a.ollama_seed ?? t.ollama_seed ?? g.ollama_seed)
        ? parseInt(a.ollama_seed ?? t.ollama_seed ?? g.ollama_seed)
        : undefined,
  };
}

// ─── อ่านเนื้อหางานจาก submission ───────────────────────────────────────────

export async function extractSubmissionText(submission) {
  if (submission.content_text) return submission.content_text;

  if (submission.file_path) {
    const filePath = join(__dirname, "../uploads", submission.file_path);
    if (!existsSync(filePath)) throw new Error("Submission file not found");

    const ext = extname(submission.file_path).toLowerCase();
    if (ext === ".txt") {
      return readFileSync(filePath, "utf-8");
    }
    if (ext === ".pdf") {
      const buffer = readFileSync(filePath);
      const data = await pdfParse(buffer);
      if (!data.text?.trim())
        throw new Error("PDF ไม่มีข้อความ (อาจเป็น scanned image)");
      return data.text;
    }
    if (ext === ".docx") {
      const buffer = readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      if (!result.value?.trim()) throw new Error("DOCX ไม่มีข้อความ");
      return result.value;
    }
    throw new Error(`ไม่รองรับไฟล์ประเภท ${ext}`);
  }

  throw new Error("No submission content found");
}

// ─── อ่านภาพจาก submission (สำหรับ vision grading) ──────────────────────────

export function readSubmissionImage(submission) {
  if (!submission.file_path) throw new Error("No submission file found");

  const filePath = join(__dirname, "../uploads", submission.file_path);
  if (!existsSync(filePath)) throw new Error("Submission file not found");

  return { base64: readFileSync(filePath).toString("base64") };
}

// ─── สร้าง prompt สำหรับ LLM ─────────────────────────────────────────────────

function buildPrompt(
  submissionText,
  criteria,
  calibrationExamples = [],
  correctionExamples = [],
  { isImage = false } = {},
) {
  const criteriaList = criteria
    .map((c, i) => {
      const minScore = c.min_score ?? 1;
      const maxScore = c.max_score ?? 4;
      let text = `${i + 1}. **${c.name}**: ${c.description || "No description"}`;
      if (c.levels?.length) {
        const levelLines = c.levels
          .map((lv) => {
            const labelPart = lv.label ? ` — ${lv.label}` : "";
            return `   - Level ${lv.score}${labelPart}: ${lv.description || "(no description)"}`;
          })
          .join("\n");
        text += `\n${levelLines}`;
      } else {
        text += `\n   - Score range: ${minScore} (lowest) to ${maxScore} (highest)`;
      }
      return text;
    })
    .join("\n");

  const outputFormat = criteria.map((c) => ({
    criteria_id: c.id,
    criteria_name: c.name,
    level: `<integer ${c.min_score ?? 1}-${c.max_score ?? 4}>`,
    reasoning: "<why this level was assigned>",
    feedback: "<specific actionable suggestion for improvement>",
  }));

  // ── Few-shot calibration examples (ระดับ 1 — อาจารย์เขียนเอง) ──────────────
  const calibrationBlock =
    calibrationExamples.length > 0
      ? `\n## Calibration Examples\nThe following are examples of how this instructor grades:\n\n` +
        calibrationExamples
          .map(
            (ex, i) =>
              `Example ${i + 1}:\nStudent Work: "${String(ex.submission_text || "")}"\nInstructor level: ${ex.level}\nInstructor's reasoning: ${ex.reasoning || "(none)"}`,
          )
          .join("\n\n")
      : "";

  // ── Auto few-shot จาก correction history (ระดับ 2 — อัตโนมัติ) ──────────────
  const correctionBlock =
    correctionExamples.length > 0
      ? `\n## Recent Correction Examples\nThe following show cases where the instructor adjusted AI scores for this assignment:\n\n` +
        correctionExamples
          .map(
            (ex, i) =>
              `Correction ${i + 1}:\nStudent Work: "${String(ex.submission_text || "")}"\nAI Level: ${ex.original_score} → Instructor corrected to: ${ex.final_level}` +
              (ex.note ? `\nInstructor note: "${ex.note}"` : ""),
          )
          .join("\n\n")
      : "";

  // Build per-criteria level constraint string for instructions
  const levelConstraints = criteria
    .map(
      (c) => `  - ${c.name}: integer ${c.min_score ?? 1}–${c.max_score ?? 4}`,
    )
    .join("\n");

  const submissionBlock = isImage
    ? `## Student Submission\nThe student's submission is attached as an image. Read any handwritten text, equations, or diagrams in the image and evaluate it based on the rubric criteria below.`
    : `## Student Submission\n\`\`\`\n${submissionText}\n\`\`\``;

  return `You are an experienced professor grading a student assignment. Evaluate the submission below based on the given rubric criteria.

## Rubric Criteria
${criteriaList}
${calibrationBlock}
${correctionBlock}
${submissionBlock}

## Instructions
- Grade strictly on FUNCTIONAL CORRECTNESS and whether the program logic works correctly to produce expected results
- Do NOT evaluate or penalize code style, formatting, aesthetics, variable naming choices, indentation, or lack of comments
- If the program runs correctly and produces correct outputs according to the problem requirements, award full points without deducting for style
- Grade each criterion objectively based on the submission content
- Provide specific reasoning tied to actual logic and functionality in the submission
- Give actionable feedback the student can act on
- Level MUST be an integer within the allowed range for each criterion:
${levelConstraints}
- If a criterion has defined levels, match the level description that best fits the submission
- Respond ONLY with valid JSON, no extra text, no markdown

## Required JSON Output
${JSON.stringify(outputFormat, null, 2)}`;
}

// ─── เรียก Ollama API ─────────────────────────────────────────────────────────

// query VRAM จาก gpu_monitor_server.py ที่รันบน Ollama host (port 11436)
async function getGpuVramMB(ollamaUrl) {
  try {
    const monitorUrl = new URL(ollamaUrl);
    monitorUrl.port = "11436";
    monitorUrl.pathname = "/";
    const res = await fetch(monitorUrl.toString(), {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.used_mb === "number") return data;
    }
  } catch {
    // monitor server ไม่พร้อม — ไม่ block การ grade
  }
  return null;
}

async function isOllamaUp(url) {
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ลำดับ fallback: URL ของอาจารย์ (settings.url) → URL หลักของระบบ (ถ้าอาจารย์ตั้งเองแยกจาก global)
// → URL สำรองของระบบ — เช็คใหม่ทุกครั้ง ไม่มี state ค้าง จึง fail back อัตโนมัติเมื่อตัวที่ล่มกลับมา
async function resolveOllamaUrl(settings) {
  if (await isOllamaUp(settings.url)) return settings.url;

  const candidates = [];
  if (settings.urlGlobalPrimary && settings.urlGlobalPrimary !== settings.url) {
    candidates.push(settings.urlGlobalPrimary);
  }
  if (settings.urlBackup && settings.urlBackup !== settings.url) {
    candidates.push(settings.urlBackup);
  }

  for (const candidate of candidates) {
    if (await isOllamaUp(candidate)) {
      console.warn(
        `[Grading] ⚠️  Ollama หลัก (${settings.url}) ไม่ตอบสนอง — สลับไปใช้ (${candidate})`,
      );
      logActivity({
        action: "ollama_failover",
        entity: "settings",
        detail: { primary: settings.url, using: candidate },
      });
      return candidate;
    }
  }

  return settings.url;
}

async function callOllama(
  prompt,
  teacherId = null,
  assignmentId = null,
  images = undefined,
) {
  prompt += "\n\n[End of prompt. Respond in formal Thai and JSON only.]";
  const settings = getGradingSettings(teacherId, assignmentId);
  settings.url = await resolveOllamaUrl(settings);
  const model = images ? settings.vision_model : settings.model;
  console.log(
    "[Grading] Calling Ollama model:",
    model,
    "at",
    settings.url,
  );

  const memBefore = process.memoryUsage();
  const wallStart = Date.now();
  const vramBefore = await getGpuVramMB(settings.url);

  const response = await fetch(`${settings.url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(images && { images }),
      // vision model (qwen3.6) เป็น thinking model — บางภาพที่กำกวมทำให้มัน
      // วนคิดยาวจน token หมดก่อนตอบจริง (done_reason:"length", response ว่าง)
      // ปิด thinking mode เพื่อให้ตอบตรงๆ แทน ไม่กระทบ text model ที่ไม่ thinking อยู่แล้ว
      ...(images && { think: false }),
      options: {
        temperature: settings.temperature,
        top_p: settings.top_p,
        repeat_penalty: settings.repeat_penalty,
        num_predict: settings.num_predict,
        ...(settings.seed !== undefined && { seed: settings.seed }),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const wallMs = Date.now() - wallStart;
  const memAfter = process.memoryUsage();
  const vramAfter = await getGpuVramMB(settings.url);

  // ── timing จาก Ollama (หน่วย nanoseconds → แปลงเป็น ms/s) ──────────────────
  const totalMs = data.total_duration ? data.total_duration / 1e6 : null;
  const loadMs = data.load_duration ? data.load_duration / 1e6 : null;
  const promptMs = data.prompt_eval_duration
    ? data.prompt_eval_duration / 1e6
    : null;
  const genMs = data.eval_duration ? data.eval_duration / 1e6 : null;
  const genTokens = data.eval_count ?? null;
  const promptTokens = data.prompt_eval_count ?? null;
  const tokPerSec =
    genMs && genTokens ? ((genTokens / genMs) * 1000).toFixed(1) : null;

  // ── ประมาณ KV cache ที่ Ollama ใช้สำหรับ prompt นี้ ─────────────────────────
  // สูตร: KV cache ≈ prompt_tokens × bytes_per_token_kv
  // bytes_per_token_kv ขึ้นกับ model — ค่า default ใช้ 512 bytes/token (Q4 30B model ≈ 0.5 KB/token)
  // ปรับได้ผ่าน env OLLAMA_BYTES_PER_TOKEN_KV
  const bytesPerToken = parseInt(
    process.env.OLLAMA_BYTES_PER_TOKEN_KV || "512",
  );
  const kvCacheEstMB =
    promptTokens !== null
      ? ((promptTokens * bytesPerToken) / 1024 / 1024).toFixed(1)
      : null;

  console.log(
    `[Ollama] ⏱  wall=${wallMs} ms` +
      (totalMs !== null ? ` | total=${totalMs.toFixed(0)} ms` : "") +
      (loadMs !== null ? ` | load=${loadMs.toFixed(0)} ms` : "") +
      (promptMs !== null ? ` | prompt=${promptMs.toFixed(0)} ms` : "") +
      (genMs !== null ? ` | gen=${genMs.toFixed(0)} ms` : "") +
      (tokPerSec !== null
        ? ` | ${tokPerSec} tok/s (out=${genTokens} tok)`
        : ""),
  );
  console.log(
    `[Ollama] 📝 prompt tokens=${promptTokens ?? "N/A"}` +
      (kvCacheEstMB !== null
        ? ` | KV cache est.≈${kvCacheEstMB} MB (${bytesPerToken} B/tok — adjust OLLAMA_BYTES_PER_TOKEN_KV for exact model)`
        : ""),
  );

  // ── GPU VRAM จริง จาก gpu_monitor_server (before/after delta) ────────────────
  if (vramBefore && vramAfter) {
    const delta = vramAfter.used_mb - vramBefore.used_mb;
    console.log(
      `[Ollama] 🖥  VRAM before=${vramBefore.used_mb} MB` +
        ` | after=${vramAfter.used_mb} MB` +
        ` | Δ${delta >= 0 ? "+" : ""}${delta} MB (prompt KV cache)` +
        ` | free=${vramAfter.free_mb} MB / total=${vramAfter.total_mb} MB`,
    );
  } else if (!vramBefore && !vramAfter) {
    console.log(
      `[Ollama] 🖥  VRAM=N/A (gpu_monitor_server ไม่ตอบสนองที่ port 11436)`,
    );
  }

  // ── GPU VRAM จาก Ollama /api/ps ──────────────────────────────────────────────
  try {
    const psRes = await fetch(`${settings.url}/api/ps`);
    if (psRes.ok) {
      const psData = await psRes.json();
      const modelEntry = (psData.models || []).find(
        (m) => m.name === model || m.model === model,
      );
      if (modelEntry) {
        const gbVram = modelEntry.size_vram
          ? (modelEntry.size_vram / 1024 ** 3).toFixed(2) + " GB"
          : "0 GB (CPU only)";
        const gbTotal = modelEntry.size
          ? (modelEntry.size / 1024 ** 3).toFixed(2) + " GB"
          : "N/A";
        console.log(
          `[Ollama] 🖥  GPU VRAM=${gbVram} | model size=${gbTotal} | expires=${modelEntry.expires_at ?? "N/A"}`,
        );
      } else {
        console.log(`[Ollama] 🖥  GPU VRAM=N/A (model not found in /api/ps)`);
      }
    }
  } catch {
    // ไม่ block การ grade ถ้า /api/ps ล้มเหลว
  }

  // ── Node.js process memory ────────────────────────────────────────────────────
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";
  const heapDelta = memAfter.heapUsed - memBefore.heapUsed;
  const rssDelta = memAfter.rss - memBefore.rss;
  console.log(
    `[Ollama] 💾 Node heap after=${mb(memAfter.heapUsed)} (Δ${heapDelta >= 0 ? "+" : ""}${mb(heapDelta)})` +
      ` | RSS after=${mb(memAfter.rss)} (Δ${rssDelta >= 0 ? "+" : ""}${mb(rssDelta)})`,
  );

  return data.response;
}

// ─── Parse JSON output จาก LLM ───────────────────────────────────────────────

function parseGradingOutput(rawText, criteria) {
  // ตัด <think>...</think> ออก (qwen3 มี thinking mode)
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // ดึง JSON array ออกจาก text (กรณี LLM ใส่ text นำหน้า)
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in LLM response");

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Invalid JSON from LLM: ${jsonMatch[0].slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) throw new Error("LLM output is not an array");

  // Validate และ clamp level ตาม min/max ของแต่ละ criteria
  return parsed.map((item, i) => {
    // ถ้า LLM ส่ง criteria_id มา ให้ใช้ find เท่านั้น
    // ถ้า LLM ไม่ส่ง criteria_id (นุย null/undefined) จึง fallback เป็น criteria[i]
    const criterion =
      item.criteria_id != null
        ? criteria.find((c) => c.id === item.criteria_id)
        : criteria[i];
    if (!criterion)
      throw new Error(
        `Cannot match criterion for item ${i} (criteria_id=${item.criteria_id})`,
      );

    const minScore = criterion.min_score ?? 1;
    const maxScore = criterion.max_score ?? 4;
    const midScore = Math.round((minScore + maxScore) / 2);
    const rawLevel = Number(item.level);
    const level = Math.min(
      Math.max(Math.round(Number.isFinite(rawLevel) ? rawLevel : midScore), minScore),
      maxScore,
    );

    // หา label จาก levels ที่ครูกำหนดไว้ (snapshot เพื่อเก็บลง grades)
    const matchedLevel = criterion.levels?.find((lv) => lv.score === level);
    const levelLabel = matchedLevel?.label || null;

    return {
      criteria_id: criterion.id,
      name: criterion.name,
      level_label: levelLabel,
      _isOverride: !!criterion._isOverride,
      level,
      reasoning: String(item.reasoning || ""),
      feedback: String(item.feedback || ""),
    };
  });
}

// ─── ดึง correction examples จาก grade_approvals (ระดับ 2) ──────────────────

function getCorrectionExamples(assignmentId) {
  return db
    .prepare(
      `
    SELECT original_score, final_level, note, submission_text
    FROM correction_examples
    WHERE assignment_id = ?
    ORDER BY id DESC
    LIMIT 5
  `,
    )
    .all(assignmentId);
}

// ─── Build preview prompt (ใช้กับ endpoint preview) ─────────────────────────

export async function buildPreviewPrompt(submissionId, teacherId = null) {
  const submission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(submissionId);
  if (!submission) throw new Error("Submission not found");

  const assignment = db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(submission.assignment_id);
  const override = db
    .prepare(
      "SELECT * FROM assignment_rubric_overrides WHERE assignment_id = ?",
    )
    .get(submission.assignment_id);

  let criteria;
  if (override) {
    criteria = db
      .prepare(
        "SELECT id, override_id, name, description, order_index, min_score, max_score FROM assignment_override_criteria WHERE override_id = ? ORDER BY order_index",
      )
      .all(override.id);
    for (const c of criteria) {
      c.levels = db
        .prepare(
          "SELECT score, label, description FROM assignment_override_levels WHERE override_criteria_id = ? ORDER BY score DESC",
        )
        .all(c.id);
    }
  } else {
    criteria = db
      .prepare(
        "SELECT id, rubric_id, name, description, order_index, min_score, max_score FROM rubric_criteria WHERE rubric_id = ? ORDER BY order_index",
      )
      .all(assignment.rubric_id);
    for (const c of criteria) {
      c.levels = db
        .prepare(
          "SELECT score, label, description FROM rubric_levels WHERE rubric_criteria_id = ? ORDER BY score DESC",
        )
        .all(c.id);
    }
  }

  const settings = getGradingSettings(teacherId, submission.assignment_id);
  const isImage = submission.submission_type === "image";
  const submissionText = isImage ? null : await extractSubmissionText(submission);

  const calibrationExamples = assignment.calibration_examples
    ? JSON.parse(assignment.calibration_examples)
    : [];
  const correctionExamples = getCorrectionExamples(submission.assignment_id);

  const prompt = buildPrompt(
    submissionText,
    criteria,
    calibrationExamples,
    correctionExamples,
    { isImage },
  );
  return {
    prompt,
    model: isImage ? settings.vision_model : settings.model,
    criteria_count: criteria.length,
    calibration_count: calibrationExamples.length,
    correction_count: correctionExamples.length,
  };
}

// ─── Concurrency control ───────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
let activeJobs = 0;

// Startup recovery handled in database.js (sets pending/running → failed)

export function processNextPending() {
  if (activeJobs >= MAX_CONCURRENT) return;
  const next = db
    .prepare(
      `SELECT gj.id, c.teacher_id
     FROM grading_jobs gj
     JOIN submissions s ON s.id = gj.submission_id
     JOIN assignments a ON a.id = s.assignment_id
     JOIN courses c ON c.id = a.course_id
     WHERE gj.status = 'pending'
     ORDER BY gj.id ASC
     LIMIT 1`,
    )
    .get();
  if (next) setImmediate(() => runGradingJob(next.id, next.teacher_id));
}

// ─── Main grading function (รัน background) ───────────────────────────────────

export async function runGradingJob(jobId, teacherId = null) {
  if (activeJobs >= MAX_CONCURRENT) return;
  activeJobs++;
  const updateJob = (status, error = null) => {
    db.prepare(
      `
      UPDATE grading_jobs SET status = ?, error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `,
    ).run(status, error, jobId);
  };

  try {
    updateJob("running");

    // ดึงข้อมูล job → submission → assignment → rubric → criteria
    const job = db
      .prepare("SELECT * FROM grading_jobs WHERE id = ?")
      .get(jobId);
    if (!job) throw new Error(`Grading job ${jobId} not found`);
    const submission = db
      .prepare("SELECT * FROM submissions WHERE id = ?")
      .get(job.submission_id);
    if (!submission)
      throw new Error(`Submission ${job.submission_id} not found`);
    const assignment = db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(submission.assignment_id);
    if (!assignment)
      throw new Error(`Assignment ${submission.assignment_id} not found`);

    // ตรวจ Custom Override ก่อน — ถ้ามีให้ใช้แทน template
    const override = db
      .prepare(
        "SELECT * FROM assignment_rubric_overrides WHERE assignment_id = ?",
      )
      .get(submission.assignment_id);

    let criteria;

    if (override) {
      criteria = db
        .prepare(
          "SELECT id, override_id, name, description, order_index, min_score, max_score FROM assignment_override_criteria WHERE override_id = ? ORDER BY order_index",
        )
        .all(override.id);
      if (!criteria.length) throw new Error("Override has no criteria");
      // แนบ levels จาก assignment_override_levels
      for (const c of criteria) {
        c.levels = db
          .prepare(
            "SELECT score, label, description FROM assignment_override_levels WHERE override_criteria_id = ? ORDER BY score DESC",
          )
          .all(c.id);
        c._isOverride = true; // flag สำหรับ insert grades
      }
    } else {
      if (!assignment.rubric_id) {
        throw new Error("Assignment has no rubric assigned");
      }
      criteria = db
        .prepare(
          "SELECT id, rubric_id, name, description, order_index, min_score, max_score FROM rubric_criteria WHERE rubric_id = ? ORDER BY order_index",
        )
        .all(assignment.rubric_id);
      if (!criteria.length) throw new Error("Rubric has no criteria");
      // แนบ levels จาก rubric_levels
      for (const c of criteria) {
        c.levels = db
          .prepare(
            "SELECT score, label, description FROM rubric_levels WHERE rubric_criteria_id = ? ORDER BY score DESC",
          )
          .all(c.id);
      }
    }

    // อัปเดต submission status
    db.prepare("UPDATE submissions SET status = 'grading' WHERE id = ?").run(
      submission.id,
    );

    // Extract content — แตกแขนงตาม submission_type (text/image เป็น path แยกขนาน)
    const isImage = submission.submission_type === "image";
    let submissionText = null;
    let images;
    if (isImage) {
      images = [readSubmissionImage(submission).base64];
    } else {
      submissionText = await extractSubmissionText(submission);
    }

    // Build prompt และเรียก LLM
    const calibrationExamples = assignment.calibration_examples
      ? JSON.parse(assignment.calibration_examples)
      : [];
    const correctionExamples = getCorrectionExamples(submission.assignment_id);
    const prompt = buildPrompt(
      submissionText,
      criteria,
      calibrationExamples,
      correctionExamples,
      { isImage },
    );
    const rawOutput = await callOllama(
      prompt,
      teacherId,
      submission.assignment_id,
      images,
    );

    // Parse output
    const gradingResults = parseGradingOutput(rawOutput, criteria);
    if (gradingResults.length === 0) {
      throw new Error("LLM returned no grading results");
    }

    // บันทึก grades ลง DB
    const insertGradeTemplate = db.prepare(`
      INSERT INTO grades (submission_id, rubric_criteria_id, override_criteria_id, criteria_name, level, level_label, reasoning, feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      // ลบ grades เก่า (กรณี re-grade)
      // ไม่ลบ grade_approvals เพื่อเก็บ correction history ไว้สอน AI
      db.prepare("DELETE FROM grades WHERE submission_id = ?").run(
        submission.id,
      );

      for (const g of gradingResults) {
        const isOverride = g._isOverride;
        insertGradeTemplate.run(
          submission.id,
          isOverride ? null : g.criteria_id,
          isOverride ? g.criteria_id : null,
          g.name,
          g.level,
          g.level_label,
          g.reasoning,
          g.feedback,
        );
      }

      // คำนวณ avg level (1.0 - 4.0)
      const avgLevel =
        gradingResults.reduce((s, g) => s + g.level, 0) / gradingResults.length;

      // Auto-approve ถ้าตั้ง threshold ไว้และ avg level ถึงเกณฑ์
      const threshold = assignment.auto_approve_threshold;
      if (threshold != null && avgLevel >= threshold) {
        const course = db
          .prepare("SELECT teacher_id FROM courses WHERE id = ?")
          .get(assignment.course_id);
        db.prepare(
          `
          INSERT INTO grade_approvals (submission_id, teacher_id, action, note, final_level)
          VALUES (?, ?, 'approved', ?, ?)
        `,
        ).run(
          submission.id,
          course.teacher_id,
          `Auto-approved (avg ${avgLevel.toFixed(2)} ≥ ${threshold})`,
          null,
        );
        db.prepare(
          "UPDATE submissions SET status = 'approved' WHERE id = ?",
        ).run(submission.id);
      } else {
        db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").run(
          submission.id,
        );
      }
    })();

    updateJob("done");
    logActivity({
      action: "grading_done",
      entity: "submission",
      entityId: submission.id,
      detail: { job_id: jobId, assignment_id: assignment.id },
    });
    console.log(
      `[Grading] Job ${jobId} completed — submission ${submission.id}`,
    );
  } catch (err) {
    console.error(`[Grading] Job ${jobId} failed:`, err.message);
    updateJob("failed", err.message);

    // อัปเดต submission กลับเป็น pending
    const job = db
      .prepare("SELECT * FROM grading_jobs WHERE id = ?")
      .get(jobId);
    if (job) {
      db.prepare("UPDATE submissions SET status = 'pending' WHERE id = ?").run(
        job.submission_id,
      );
    }
  } finally {
    activeJobs--;
    processNextPending();
  }
}
