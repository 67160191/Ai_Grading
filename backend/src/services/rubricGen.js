import { getGradingSettings } from "./grading.js";

// สร้างร่าง rubric จากคำอธิบายงานที่อาจารย์พิมพ์ — draft only, อาจารย์แก้ + บันทึกเอง
export async function generateRubric(taskText, teacherId = null, count = 4) {
  const settings = getGradingSettings(teacherId);
  const n = Math.min(Math.max(parseInt(count) || 4, 1), 8);

  const prompt = `You are helping a teacher design a grading rubric for a student assignment.

Assignment description (may be Thai or English):
"""
${taskText}
"""

This rubric will be given to an AI grader that reads a student's submission and assigns each criterion a score of 1-4 by matching it to the level descriptions. So each level description must be an OBSERVABLE, checkable standard — something the grader can verify directly in the submission (e.g. "handles empty input and invalid file paths without crashing", not "good error handling"). Make adjacent levels clearly distinguishable so borderline work lands on one level, not between two.

Produce a rubric with EXACTLY ${n} criteria. Each criterion has 4 score levels (4=best, 1=weakest). Reply with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "name": "<short rubric name>",
  "description": "<one sentence>",
  "criteria": [
    {
      "name": "<criterion name>",
      "description": "<what this criterion assesses>",
      "levels": [
        { "score": 4, "description": "<what a level-4 answer looks like>" },
        { "score": 3, "description": "<level 3>" },
        { "score": 2, "description": "<level 2>" },
        { "score": 1, "description": "<level 1>" }
      ]
    }
  ]
}

Rules:
- Exactly ${n} criteria, each with exactly 4 levels (scores 4,3,2,1).
- ALL text (name, description, level descriptions) must be in Thai, regardless of the assignment description's language.
- Level descriptions state what IS present/absent in the work at that level, in concrete terms the AI grader can check — not vague quality words.`;

  const res = await fetch(`${settings.url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      prompt,
      stream: false,
      think: false,
      options: {
        temperature: settings.temperature,
        top_p: settings.top_p,
        num_predict: settings.num_predict,
        ...(settings.seed !== undefined && { seed: settings.seed }),
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const raw = String(data.response || "");
  // ดึง JSON block แรก เผื่อโมเดลใส่ข้อความนำ/ตาม
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");

  return _sanitize(JSON.parse(match[0]), n);
}

const STD_LABELS = { 4: "ดีมาก", 3: "ดี", 2: "พอใช้", 1: "ต้องปรับปรุง" };

// แปลง JSON ดิบจาก LLM → rubric draft ที่ฟอร์มใช้ได้ (บังคับ 4 ระดับ, min/max 1-4)
export function _sanitize(parsed, n = 4) {
  const criteria = Array.isArray(parsed?.criteria) ? parsed.criteria : [];
  return {
    name: String(parsed?.name || "").slice(0, 200),
    description: String(parsed?.description || "").slice(0, 500),
    criteria: criteria
      .filter((c) => c && c.name)
      .slice(0, n)
      .map((c) => {
        const byScore = {};
        for (const lv of Array.isArray(c.levels) ? c.levels : []) {
          const s = Number(lv.score);
          if (s >= 1 && s <= 4)
            byScore[s] = String(lv.description || "").slice(0, 500);
        }
        return {
          name: String(c.name).slice(0, 200),
          description: String(c.description || "").slice(0, 500),
          min_score: 1,
          max_score: 4,
          levels: [4, 3, 2, 1].map((s) => ({
            score: s,
            label: STD_LABELS[s],
            description: byScore[s] || "",
          })),
        };
      }),
  };
}
