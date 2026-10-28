import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import {
  getAssignment,
  getAssignmentSubmissions,
  getAssignmentRubricOverride,
  saveAssignmentRubricOverride,
  generateOverrideDraft,
  getAssignmentConsistency,
  exportAssignment,
  exportAssignmentCSV,
  getCalibrationExamples,
  saveCalibrationExamples,
} from "../../api/assignments";
import {
  getAssignmentPendingAppeals,
  bulkApprove,
  getAssignmentGradingSettings,
  updateAssignmentGradingSettings,
  deleteAssignmentGradingSettings,
} from "../../api/grading";

const statusLabel = {
  pending: { text: "รอตรวจ", cls: "bg-yellow-100 text-yellow-700" },
  grading: { text: "กำลังตรวจ", cls: "bg-blue-100 text-blue-700" },
  graded: { text: "ตรวจแล้ว", cls: "bg-indigo-100 text-indigo-700" },
  approved: { text: "อนุมัติแล้ว", cls: "bg-green-100 text-green-700" },
  rejected: { text: "ปฏิเสธ", cls: "bg-red-100 text-red-700" },
  not_submitted: { text: "ยังไม่ส่ง", cls: "bg-gray-100 text-gray-500" },
};

const LEVEL_LABELS = {
  excellent: "ดีเยี่ยม",
  good: "ดี",
  fair: "พอใช้",
  poor: "ต้องปรับปรุง",
};
const LEVEL_CLS = {
  excellent: "bg-green-100 text-green-700",
  good: "bg-blue-100 text-blue-700",
  fair: "bg-yellow-100 text-yellow-700",
  poor: "bg-red-100 text-red-700",
};

const emptyLevelsByRange = (minScore, maxScore) => {
  const levels = [];
  for (let s = maxScore; s >= minScore; s--) {
    levels.push({ score: s, label: "", description: "" });
  }
  return levels;
};
function emptyCriteria() {
  return { name: "", description: "", min_score: 1, max_score: 4, levels: [] };
}

// ─── Override Editor Component ────────────────────────────────────────────────
function OverrideEditor({ assignmentId, override, onClose }) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const initCriteria = () =>
    override?.criteria?.length
      ? override.criteria.map((c) => ({
          name: c.name,
          description: c.description || "",
          min_score: c.min_score ?? 1,
          max_score: c.max_score ?? 4,
          levels: c.levels?.length
            ? c.levels.map((lv) => ({
                score: lv.score,
                label: lv.label || "",
                description: lv.description || "",
              }))
            : [],
        }))
      : [emptyCriteria()];

  const initShowLevels = () => {
    const init = {};
    const crits = override?.criteria || [];
    crits.forEach((c, i) => {
      if (c.levels?.length) init[i] = true;
    });
    return init;
  };

  const [criteria, setCriteria] = useState(initCriteria);
  const [showLevels, setShowLevels] = useState(initShowLevels);

  const saveMutation = useMutation({
    mutationFn: (data) => saveAssignmentRubricOverride(assignmentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignment-override", assignmentId] });
      onClose();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => saveAssignmentRubricOverride(assignmentId, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignment-override", assignmentId] });
      onClose();
    },
  });

  const [aiTask, setAiTask] = useState("");
  const [aiCount, setAiCount] = useState(4);
  const genMutation = useMutation({
    mutationFn: ({ task, count }) =>
      generateOverrideDraft(assignmentId, task, count),
    onSuccess: ({ criteria: gen }) => {
      const next = gen.length ? gen : [emptyCriteria()];
      setCriteria(next);
      setShowLevels(Object.fromEntries(next.map((_, i) => [i, true])));
    },
    onError: (err) => showToast(err.response?.data?.error || "ร่างไม่สำเร็จ"),
  });

  const addCriteria = () => setCriteria((prev) => [...prev, emptyCriteria()]);
  const removeCriteria = (i) => {
    setCriteria((prev) => prev.filter((_, idx) => idx !== i));
    setShowLevels((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      });
      return next;
    });
  };
  const updateField = (i, field, val) =>
    setCriteria((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        return { ...c, [field]: val };
      }),
    );
  const toggleLevels = (i) =>
    setShowLevels((prev) => ({ ...prev, [i]: !prev[i] }));

  const STD_LABELS = { 4: "ดีมาก", 3: "ดี", 2: "พอใช้", 1: "ต้องปรับปรุง" };
  const fillStandardLevels = () => {
    setCriteria((prev) =>
      prev.map((c) => {
        if (c.levels?.some((lv) => lv.label?.trim())) return c;
        return {
          ...c,
          levels: emptyLevelsByRange(c.min_score ?? 1, c.max_score ?? 4).map(
            (lv) => ({ ...lv, label: STD_LABELS[lv.score] || "" }),
          ),
        };
      }),
    );
    setShowLevels(Object.fromEntries(criteria.map((_, i) => [i, true])));
  };
  const updateLevel = (ci, score, field, val) =>
    setCriteria((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? {
              ...c,
              levels: c.levels.map((lv) =>
                lv.score === score ? { ...lv, [field]: val } : lv,
              ),
            }
          : c,
      ),
    );
  const addLevel = (ci) =>
    setCriteria((prev) =>
      prev.map((c, idx) => {
        if (idx !== ci) return c;
        const nextScore = Math.max(0, ...c.levels.map((lv) => lv.score)) + 1;
        return {
          ...c,
          levels: [
            { score: nextScore, label: "", description: "" },
            ...c.levels,
          ],
        };
      }),
    );
  const removeLevel = (ci, score) =>
    setCriteria((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, levels: c.levels.filter((lv) => lv.score !== score) }
          : c,
      ),
    );

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(criteria);
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-5 mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-violet-800">
            Custom Rubric Override
          </h3>
          <p className="text-xs text-violet-600 mt-0.5">
            กำหนด criteria พิเศษสำหรับงานนี้ — จะใช้แทน rubric template เมื่อ AI
            ตรวจ
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {!override && (
          <div className="bg-violet-100/60 border border-violet-200 rounded-lg p-3 space-y-2">
            <label className="text-xs font-medium text-violet-800">
              ร่างเกณฑ์ด้วย AI — พิมพ์โจทย์/คำอธิบายงาน แล้วกดร่าง
            </label>
            <textarea
              rows={2}
              value={aiTask}
              onChange={(e) => setAiTask(e.target.value)}
              placeholder="เช่น: เขียนโปรแกรม Python คำนวณเกรดเฉลี่ยจากไฟล์ CSV พร้อม handle error"
              className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-violet-800">จำนวนเกณฑ์</label>
              <input
                type="number"
                min={1}
                max={8}
                value={aiCount}
                onChange={(e) =>
                  setAiCount(
                    Math.min(8, Math.max(1, parseInt(e.target.value) || 1)),
                  )
                }
                className="w-14 border border-violet-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                type="button"
                disabled={genMutation.isPending || aiTask.trim().length < 10}
                onClick={() =>
                  genMutation.mutate({ task: aiTask.trim(), count: aiCount })
                }
                className="bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-violet-700 disabled:opacity-50"
              >
                {genMutation.isPending ? "กำลังร่าง..." : "ร่างด้วย AI"}
              </button>
              <span className="text-xs text-violet-400">
                ได้ร่างแล้วแก้ต่อได้ตามปกติ
              </span>
            </div>
          </div>
        )}
        {criteria.length > 0 && (
          <button
            type="button"
            onClick={fillStandardLevels}
            className="text-xs text-violet-600 hover:underline"
          >
            เติมระดับมาตรฐาน (ดีมาก/ดี/พอใช้/ต้องปรับปรุง) ทุกเกณฑ์
          </button>
        )}
        {criteria.map((c, i) => (
          <div
            key={i}
            className="bg-white border border-violet-200 rounded-lg p-3 space-y-2"
          >
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <input
                  required
                  placeholder={`เกณฑ์ที่ ${i + 1}`}
                  value={c.name}
                  onChange={(e) => updateField(i, "name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <input
                  placeholder="คำอธิบาย"
                  value={c.description}
                  onChange={(e) =>
                    updateField(i, "description", e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray-500">คะแนนต่ำสุด</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={c.min_score ?? 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) updateField(i, "min_score", val);
                    }}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <label className="text-xs text-gray-500">คะแนนสูงสุด</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={c.max_score ?? 4}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) updateField(i, "max_score", val);
                    }}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
              </div>
              {criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCriteria(i)}
                  className="text-red-400 hover:text-red-600 mt-1.5 text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => toggleLevels(i)}
                className="text-xs text-violet-600 hover:underline"
              >
                {showLevels[i]
                  ? "− ซ่อนคำอธิบายระดับ"
                  : "+ กำหนดคำอธิบายแต่ละระดับ (ไม่บังคับ)"}
              </button>
              {showLevels[i] && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-gray-400">
                    ไม่กรอกก็ได้ — AI จะให้คะแนนตามช่วง {c.min_score ?? 1}–
                    {c.max_score ?? 4} และคำอธิบายเกณฑ์
                  </p>
                  {c.levels.map((lv) => (
                    <div key={lv.score} className="flex gap-2 items-center">
                      <span className="text-xs font-semibold w-8 shrink-0 text-center bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                        {lv.score}
                      </span>
                      <input
                        placeholder="ชื่อระดับ"
                        value={lv.label}
                        onChange={(e) =>
                          updateLevel(i, lv.score, "label", e.target.value)
                        }
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      <input
                        placeholder="คำอธิบายระดับนี้"
                        value={lv.description}
                        onChange={(e) =>
                          updateLevel(
                            i,
                            lv.score,
                            "description",
                            e.target.value,
                          )
                        }
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => removeLevel(i, lv.score)}
                        className="text-red-300 hover:text-red-500 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addLevel(i)}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    + เพิ่มระดับ
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addCriteria}
          className="text-xs text-violet-600 hover:underline"
        >
          + เพิ่มเกณฑ์
        </button>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก Override"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            ยกเลิก
          </button>
          {override && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm("ลบ Override นี้? จะกลับไปใช้ rubric template เดิม")
                )
                  deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="text-red-500 hover:text-red-700 text-sm px-3 py-2 rounded-lg hover:bg-red-50"
            >
              ลบ Override
            </button>
          )}
        </div>
        {saveMutation.isError && (
          <p className="text-red-500 text-xs">
            {saveMutation.error?.response?.data?.error || "เกิดข้อผิดพลาด"}
          </p>
        )}
      </form>
    </div>
  );
}

// ─── Calibration Editor Component ─────────────────────────────────────────────
function CalibrationEditor({ assignmentId, examples, onClose }) {
  const qc = useQueryClient();
  const [items, setItems] = useState(
    examples?.length
      ? examples.map((e) => ({ ...e }))
      : [{ submission_text: "", level: "", reasoning: "" }],
  );

  const saveMutation = useMutation({
    mutationFn: (data) => saveCalibrationExamples(assignmentId, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["calibration-examples", assignmentId],
      });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => saveCalibrationExamples(assignmentId, []),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["calibration-examples", assignmentId],
      });
      onClose();
    },
  });

  const updateItem = (i, field, val) =>
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)),
    );
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { submission_text: "", level: "", reasoning: "" },
    ]);
  const removeItem = (i) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const cleaned = items
      .map((it) => ({
        submission_text: it.submission_text.trim(),
        level: Number(it.level),
        reasoning: it.reasoning.trim(),
      }))
      .filter((it) => it.submission_text);
    saveMutation.mutate(cleaned);
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
      <h3 className="font-semibold text-emerald-800 mb-3">ตัวอย่างสำหรับ AI</h3>
      <p className="text-xs text-emerald-600 mb-4">
        ใส่ตัวอย่างงานนิสิตพร้อมคะแนนที่ควรได้ — AI จะ calibrate
        ตามมาตรฐานของคุณ (สูงสุด 3 ตัวอย่าง)
      </p>
      <div className="space-y-4">
        {items.map((item, i) => (
          <div
            key={i}
            className="bg-white border border-emerald-200 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-emerald-700">
                ตัวอย่างที่ {i + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  ลบ
                </button>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  snippet งานนิสิต
                </label>
                <textarea
                  rows={7}
                  value={item.submission_text}
                  onChange={(e) =>
                    updateItem(i, "submission_text", e.target.value)
                  }
                  placeholder="วางตัวอย่างงานนิสิต (ไม่ต้องทั้งหมด)..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <div className="w-32">
                  <label className="text-xs text-gray-500 block mb-1">
                    Level ที่ควรได้ (1–4)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    step={1}
                    value={item.level}
                    onChange={(e) => updateItem(i, "level", e.target.value)}
                    placeholder="1–4"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  เหตุผล (อธิบายให้ AI)
                </label>
                <textarea
                  rows={2}
                  value={item.reasoning}
                  onChange={(e) => updateItem(i, "reasoning", e.target.value)}
                  placeholder="เหตุผลที่ให้คะแนนนั้น เช่น 'อธิบาย concept ถูกแต่ขาด implementation'..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= 3}
          className="text-sm text-emerald-600 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + เพิ่มตัวอย่าง
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {examples?.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("ลบตัวอย่างทั้งหมด?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50"
          >
            ลบทั้งหมด
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกตัวอย่าง"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
        >
          ยกเลิก
        </button>
      </div>
      {saveMutation.isError && (
        <p className="text-red-500 text-xs mt-2">
          {saveMutation.error?.response?.data?.error || "เกิดข้อผิดพลาด"}
        </p>
      )}
    </div>
  );
}

// ─── Grading Settings Editor Component ────────────────────────────────────────
function GradingSettingsEditor({ assignmentId, settings, onClose }) {
  const qc = useQueryClient();
  const [temperature, setTemperature] = useState(
    settings?.ollama_temperature ?? 0.2,
  );
  const [topP, setTopP] = useState(settings?.ollama_top_p ?? 0.9);
  const [repeatPenalty, setRepeatPenalty] = useState(
    settings?.ollama_repeat_penalty ?? 1.1,
  );
  const [numPredict, setNumPredict] = useState(
    settings?.ollama_num_predict ?? 2048,
  );
  const [seed, setSeed] = useState(settings?.ollama_seed ?? null);

  const saveMutation = useMutation({
    mutationFn: (data) => updateAssignmentGradingSettings(assignmentId, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["assignment-grading-settings", assignmentId],
      });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAssignmentGradingSettings(assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["assignment-grading-settings", assignmentId],
      });
      onClose();
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      ollama_temperature: temperature,
      ollama_top_p: topP,
      ollama_repeat_penalty: repeatPenalty,
      ollama_num_predict: numPredict,
      ollama_seed: seed || null,
    });
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          LLM Parameters
        </h2>

        {/* Temperature */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Temperature
            </label>
            <span className="text-sm font-semibold text-indigo-600">
              {temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>0</span>
            <span>1</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ความสร้างสรรค์ของคำตอบ — ต่ำ = สม่ำเสมอ, สูง = หลากหลาย แนะนำ
            0.1–0.3
          </p>
        </div>

        {/* Top P */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Top P</label>
            <span className="text-sm font-semibold text-indigo-600">
              {topP.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={topP}
            onChange={(e) => setTopP(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>0</span>
            <span>1</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ความหลากหลายของคำตอบ — ต่ำ = เจาะจง, สูง = หลากหลาย แนะนำ 0.8–0.95
          </p>
        </div>

        {/* Repeat Penalty */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Repeat Penalty
            </label>
            <span className="text-sm font-semibold text-indigo-600">
              {repeatPenalty.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="2"
            step="0.05"
            value={repeatPenalty}
            onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>1.0</span>
            <span>2.0</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ลดการเขียนซ้ำๆ ช่วยให้คำตอบกระชับขึ้น แนะนำ 1.1–1.3
          </p>
        </div>

        {/* Max tokens */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Tokens (Num Predict)
          </label>
          <input
            type="number"
            min="512"
            max="8192"
            step="256"
            value={numPredict}
            onChange={(e) => setNumPredict(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            ความยาวสูงสุดของคำตอบ (1 token ≈ 1-2 พยางค์) แนะนำ 2048
          </p>
        </div>

        {/* Seed */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seed
          </label>
          <input
            type="number"
            min="0"
            placeholder="ว่าง = สุ่มทุกครั้ง"
            value={seed === null ? "" : seed}
            onChange={(e) =>
              setSeed(e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            ใส่ตัวเลข เช่น 42 เพื่อให้ LLM ตอบเหมือนเดิมทุกครั้ง / ว่างไว้ =
            สุ่ม
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
        {settings && Object.values(settings).some((v) => v !== null) && (
          <button
            type="button"
            onClick={() => {
              if (confirm("ลบการตั้งค่าเฉพาะของงานนี้?"))
                deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50"
          >
            ลบการตั้งค่า
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-sm bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200"
        >
          ยกเลิก
        </button>
      </div>
      {saveMutation.isError && (
        <p className="text-red-500 text-xs">
          {saveMutation.error?.response?.data?.error ||
            "เกิดข้อผิดพลาดในการบันทึก"}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AssignmentDetailPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [showOverrideEditor, setShowOverrideEditor] = useState(false);
  const [showCalibrationEditor, setShowCalibrationEditor] = useState(false);
  const [showGradingSettingsEditor, setShowGradingSettingsEditor] =
    useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [activeTab, setActiveTab] = useState("submissions");

  const { data: assignData, error: assignError } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => getAssignment(assignmentId),
    retry: false,
  });

  useEffect(() => {
    if (assignError) navigate("/teacher/courses", { replace: true });
  }, [assignError]);

  const { data: subsData, isLoading } = useQuery({
    queryKey: ["submissions", assignmentId],
    queryFn: () => getAssignmentSubmissions(assignmentId),
    refetchInterval: 5000,
  });

  const { data: appealsData } = useQuery({
    queryKey: ["assignment-appeals", assignmentId],
    queryFn: () => getAssignmentPendingAppeals(assignmentId),
    refetchInterval: 30_000,
  });

  const { data: overrideData } = useQuery({
    queryKey: ["assignment-override", assignmentId],
    queryFn: () => getAssignmentRubricOverride(assignmentId),
  });

  const { data: calibrationData } = useQuery({
    queryKey: ["calibration-examples", assignmentId],
    queryFn: () => getCalibrationExamples(assignmentId),
  });

  const { data: consistencyData } = useQuery({
    queryKey: ["assignment-consistency", assignmentId],
    queryFn: () => getAssignmentConsistency(assignmentId),
    enabled: activeTab === "consistency",
  });

  const { data: gradingSettingsData } = useQuery({
    queryKey: ["assignment-grading-settings", assignmentId],
    queryFn: () => getAssignmentGradingSettings(assignmentId),
    enabled: activeTab === "settings",
  });

  const pendingAppealIds = new Set(appealsData?.pending_submission_ids || []);
  const assignment = assignData?.assignment;
  const allSubmissions = subsData?.submissions || [];

  // Filter
  const filtered =
    filterStatus === "all"
      ? allSubmissions
      : filterStatus === "appeal_pending"
        ? allSubmissions.filter((s) => s.appeal_status === "pending")
        : allSubmissions.filter((s) => s.status === filterStatus);

  // Sort
  const submissions = [...filtered].sort((a, b) => {
    if (sortBy === "date_desc")
      return new Date(b.submitted_at) - new Date(a.submitted_at);
    if (sortBy === "date_asc")
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    if (sortBy === "score_desc")
      return (b.avg_level ?? -1) - (a.avg_level ?? -1);
    if (sortBy === "score_asc")
      return (a.avg_level ?? -1) - (b.avg_level ?? -1);
    return 0;
  });

  const gradedCount = allSubmissions.filter((s) =>
    ["graded", "approved"].includes(s.status),
  ).length;
  const pendingGradedCount = allSubmissions.filter(
    (s) => s.status === "graded",
  ).length;
  const override = overrideData?.override;

  // เมื่อ AI ตรวจเสร็จ → pendingGradedCount เพิ่ม → อัปเดต navbar ทันที
  const prevPendingRef = useRef(null);
  useEffect(() => {
    if (
      prevPendingRef.current !== null &&
      pendingGradedCount > prevPendingRef.current
    ) {
      qc.invalidateQueries({ queryKey: ["teacher-summary"] });
    }
    prevPendingRef.current = pendingGradedCount;
  }, [pendingGradedCount]);

  const bulkApproveMutation = useMutation({
    mutationFn: () => bulkApprove(assignmentId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["submissions", assignmentId] });
      qc.invalidateQueries({ queryKey: ["teacher-summary"] });
      showToast(`อนุมัติแล้ว ${data.approved_count} submissions`, "success");
    },
  });

  return (
    <div>
      <div className="mb-6">
        <Link
          to={`/teacher/courses/${assignment?.course_id}`}
          className="text-sm text-indigo-500 hover:underline"
        >
          ← กลับไปวิชา
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">
          {assignment?.title}
        </h1>
        {assignment?.description && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="text-xs text-indigo-500 hover:underline"
            >
              {descExpanded ? "− ซ่อนโจทย์" : "+ แสดงโจทย์"}
            </button>
            {descExpanded && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-gray-600 text-sm whitespace-pre-wrap">
                  {assignment.description}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400 flex-wrap">
          {assignment?.rubric_name && (
            <span>Rubric: {assignment.rubric_name}</span>
          )}
          {assignment?.deadline && (
            <span className="text-red-400">
              กำหนดส่ง: {new Date(assignment.deadline).toLocaleString("th-TH")}
            </span>
          )}
        </div>
      </div>

      {/* Override Editor */}
      {showOverrideEditor ? (
        <OverrideEditor
          assignmentId={assignmentId}
          override={override}
          onClose={() => setShowOverrideEditor(false)}
        />
      ) : (
        <div className="mb-6">
          <button
            onClick={() => setShowOverrideEditor(true)}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              override
                ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100"
                : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {override
              ? "✦ แก้ไข Custom Rubric Override"
              : "+ กำหนด Custom Rubric Override"}
          </button>
          {override && (
            <p className="text-xs text-violet-600 mt-1.5 ml-0.5">
              Override มีผลกับงานที่ submit หลังจากนี้ — submissions
              ที่ตรวจไปแล้วไม่ได้รับผลกระทบ
            </p>
          )}
        </div>
      )}

      {/* Override preview (collapsed) */}
      {override && !showOverrideEditor && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs font-semibold text-violet-700 mb-2">
            Custom Criteria ที่ใช้ตรวจงานนี้:
          </p>
          <div className="space-y-1">
            {override.criteria?.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-violet-800"
              >
                <span className="font-medium">
                  {i + 1}. {c.name}
                </span>
                <span className="text-violet-500">({c.max_score} คะแนน)</span>
                {c.levels?.length > 0 && (
                  <span className="text-amber-400">
                    · {c.levels.length} levels
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration Examples */}
      {showCalibrationEditor ? (
        <CalibrationEditor
          assignmentId={assignmentId}
          examples={calibrationData?.examples}
          onClose={() => setShowCalibrationEditor(false)}
        />
      ) : (
        <div className="mb-6">
          <button
            onClick={() => setShowCalibrationEditor(true)}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              calibrationData?.examples?.length
                ? "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {calibrationData?.examples?.length
              ? `✦ แก้ไขตัวอย่างสำหรับ AI (${calibrationData.examples.length} ตัวอย่าง)`
              : "+ เพิ่มตัวอย่างสำหรับ AI"}
          </button>
          {calibrationData?.examples?.length > 0 && (
            <p className="text-xs text-emerald-600 mt-1.5 ml-0.5">
              AI จะใช้ตัวอย่างเหล่านี้เป็น reference ก่อนตรวจงาน
            </p>
          )}
          {!calibrationData?.examples?.length && (
            <p className="text-xs text-gray-400 mt-1.5 ml-0.5">
              ช่วยให้ AI ตรวจตามมาตรฐานของคุณแม่นยำขึ้น — ไม่ใส่ก็ได้
            </p>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-between mb-6 border-b border-gray-200">
        <div className="flex gap-1">
          {[
            { key: "submissions", label: "การส่งงาน" },
            { key: "consistency", label: "ความสอดคล้อง" },
            { key: "settings", label: "⚙️ ตั้งค่า AI" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() =>
              exportAssignment(
                assignmentId,
                `${assignment?.title}_scores.xls`,
                "xls",
              )
            }
            className="text-xs px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 font-medium flex items-center gap-1.5 shadow-sm transition-colors"
          >
            📊 Export Excel
          </button>
          <button
            onClick={() =>
              exportAssignment(
                assignmentId,
                `${assignment?.title}_scores.csv`,
                "csv",
              )
            }
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            📄 Export CSV
          </button>
        </div>
      </div>

      {activeTab === "consistency" && (
        <div>
          {!consistencyData ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : consistencyData.total_graded === 0 ? (
            <p className="text-gray-400 text-center py-8">
              ยังไม่มีงานที่ตรวจแล้ว — ต้องมีอย่างน้อย 1 submission ที่ graded
            </p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                คำนวณจาก {consistencyData.total_graded} submission(s)
                ที่ตรวจแล้ว
              </p>

              {/* Per-criteria stats */}
              <div className="space-y-4">
                {consistencyData.criteria_stats.map((cs, i) => (
                  <div
                    key={i}
                    className={`bg-white border rounded-xl p-4 ${cs.high_variance ? "border-orange-300" : "border-gray-200"}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-800">
                          {cs.criteria_name}
                        </p>
                        {cs.high_variance && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                            ⚠️ variance สูง
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">scale 1–4</p>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-center mb-3">
                      {[
                        {
                          label: "ค่าเฉลี่ย",
                          value: cs.mean,
                        },
                        { label: "SD", value: cs.std },
                        { label: "ต่ำสุด", value: cs.min },
                        { label: "สูงสุด", value: cs.max },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg py-2">
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* score range bar */}
                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div
                        className="absolute h-full bg-indigo-200 rounded-full"
                        style={{
                          left: `${((cs.min - 1) / 3) * 100}%`,
                          width: `${((cs.max - cs.min) / 3) * 100}%`,
                        }}
                      />
                      <div
                        className="absolute h-full w-1 bg-indigo-600 rounded-full"
                        style={{ left: `${((cs.mean - 1) / 3) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      แถบสีฟ้า = ช่วง level, เส้นเข้ม = ค่าเฉลี่ย (scale 1–4)
                    </p>

                    {cs.outliers.length > 0 && (
                      <div className="mt-3 border-t border-orange-100 pt-3">
                        <p className="text-xs font-medium text-orange-600 mb-2">
                          Outliers (ห่างจากค่าเฉลี่ยเกิน 1.5 SD):
                        </p>
                        <div className="space-y-1">
                          {cs.outliers.map((o, j) => (
                            <div
                              key={j}
                              className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-1.5"
                            >
                              <span className="text-gray-700">
                                {o.student_name}
                              </span>
                              <span
                                className={`font-medium ${o.deviation > 0 ? "text-green-600" : "text-red-500"}`}
                              >
                                {o.score} คะแนน ({o.deviation > 0 ? "+" : ""}
                                {o.deviation})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Flagged submissions */}
              {consistencyData.submission_flags.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">
                    Submissions ที่ควรตรวจสอบ
                  </h3>
                  <div className="space-y-2">
                    {consistencyData.submission_flags.map((f, i) => (
                      <div
                        key={i}
                        className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3"
                      >
                        <p className="text-sm font-medium text-gray-800 mb-1">
                          {f.student_name}
                        </p>
                        <div className="space-y-0.5">
                          {f.flagged_criteria.map((fc, j) => (
                            <p key={j} className="text-xs text-orange-700">
                              {fc.criteria_name}: ได้ {fc.score} คะแนน (เฉลี่ย{" "}
                              {fc.mean}, {fc.deviation > 0 ? "+" : ""}
                              {fc.deviation})
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {consistencyData.submission_flags.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-sm text-green-700">
                    ✓ ไม่พบ outliers — คะแนนมีความสม่ำเสมอดี
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "submissions" && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "ส่งงานแล้ว",
                value: allSubmissions.filter(
                  (s) => s.status !== "not_submitted",
                ).length,
              },
              {
                label: "ยังไม่ส่ง",
                value: allSubmissions.filter(
                  (s) => s.status === "not_submitted",
                ).length,
              },
              { label: "ตรวจแล้ว", value: gradedCount },
              {
                label: "รออนุมัติ",
                value: allSubmissions.filter((s) => s.status === "graded")
                  .length,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center"
              >
                <p className="text-2xl font-bold text-indigo-600">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Auto-approve info + Bulk Approve */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              {assignment?.auto_approve_threshold != null
                ? `Auto-approve เปิดอยู่ — งานที่ AI ให้ avg level ≥ ${assignment.auto_approve_threshold}/4 จะอนุมัติอัตโนมัติ`
                : "Auto-approve ปิดอยู่ — งานที่ตรวจแล้วทุกชิ้นรอให้อาจารย์อนุมัติ"}
            </p>
            {pendingGradedCount > 0 && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      `อนุมัติ ${pendingGradedCount} submissions ที่ตรวจแล้วทั้งหมด?`,
                    )
                  ) {
                    bulkApproveMutation.mutate();
                  }
                }}
                disabled={bulkApproveMutation.isPending}
                className="text-sm px-4 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {bulkApproveMutation.isPending
                  ? "กำลังอนุมัติ..."
                  : `✓ อนุมัติทั้งหมด (${pendingGradedCount})`}
              </button>
            )}
          </div>

          {/* Submissions list */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-gray-700">
              นิสิต ({filtered.length}/{allSubmissions.length})
            </h2>
            <div className="flex gap-2 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="not_submitted">ยังไม่ส่ง</option>
                <option value="pending">รอตรวจ</option>
                <option value="grading">กำลังตรวจ</option>
                <option value="graded">ตรวจแล้ว</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ปฏิเสธ</option>
                <option value="appeal_pending">มี Appeal รอ</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="date_desc">วันที่ส่ง (ใหม่สุด)</option>
                <option value="date_asc">วันที่ส่ง (เก่าสุด)</option>
                <option value="score_desc">คะแนน (มากสุด)</option>
                <option value="score_asc">คะแนน (น้อยสุด)</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : submissions.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              ยังไม่มีนิสิตในวิชานี้
            </p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s, idx) => {
                const st = statusLabel[s.status] || {
                  text: s.status,
                  cls: "bg-gray-100 text-gray-600",
                };
                const isNotSubmitted = s.status === "not_submitted";
                const rowCls = `flex items-center justify-between border rounded-xl px-5 py-4 transition-all ${
                  isNotSubmitted
                    ? "bg-gray-50 border-gray-200 opacity-70"
                    : "bg-white border-gray-200 hover:shadow-sm hover:border-indigo-200 cursor-pointer"
                }`;
                const inner = (
                  <>
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          <span className="text-gray-600 font-normal mr-1.5">
                            {idx + 1}.
                          </span>
                          {s.student_username && (
                            <span className="text-gray-600 font-normal mr-1.5">
                              {s.student_username}
                            </span>
                          )}
                          {s.student_name}
                          {s.group_no != null && (
                            <span className="text-gray-600 font-normal ml-1.5">
                              กลุ่ม {s.group_no}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {isNotSubmitted
                            ? "ยังไม่ได้ส่งงาน"
                            : `ครั้งที่ ${s.attempt} · ${new Date(s.submitted_at).toLocaleString("th-TH")}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.avg_level != null && (
                        <span className="text-sm font-semibold text-gray-700">
                          {Number(s.avg_level).toFixed(2)}/{Number(s.max_level ?? 4).toFixed(2)}
                        </span>
                      )}
                      {pendingAppealIds.has(s.id) && (
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-600">
                          ⚠️ Appeal
                        </span>
                      )}
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}
                      >
                        {st.text}
                      </span>
                      {!isNotSubmitted && (
                        <span className="text-gray-300 text-sm">→</span>
                      )}
                    </div>
                  </>
                );
                return isNotSubmitted ? (
                  <div key={s.student_id} className={rowCls}>
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={s.id}
                    to={`/teacher/submissions/${s.id}`}
                    className={rowCls}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div>
          {showGradingSettingsEditor ? (
            <GradingSettingsEditor
              assignmentId={assignmentId}
              settings={gradingSettingsData?.settings}
              onClose={() => setShowGradingSettingsEditor(false)}
            />
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    LLM PARAMETERS
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    การตั้งค่าเฉพาะสำหรับงานนี้ (ไม่กำหนด =
                    ใช้ค่าเริ่มต้นทั่วไป)
                  </p>
                </div>
                <button
                  onClick={() => setShowGradingSettingsEditor(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
                >
                  ⚙️ แก้ไขการตั้งค่า
                </button>
              </div>

              {gradingSettingsData?.settings &&
              Object.values(gradingSettingsData.settings).some(
                (v) => v !== null,
              ) ? (
                <div className="bg-white rounded-lg p-4 space-y-2 text-sm">
                  {gradingSettingsData.settings.ollama_temperature !== null && (
                    <p>
                      <span className="font-medium">Temperature:</span>{" "}
                      {gradingSettingsData.settings.ollama_temperature}
                    </p>
                  )}
                  {gradingSettingsData.settings.ollama_top_p !== null && (
                    <p>
                      <span className="font-medium">Top P:</span>{" "}
                      {gradingSettingsData.settings.ollama_top_p}
                    </p>
                  )}
                  {gradingSettingsData.settings.ollama_repeat_penalty !==
                    null && (
                    <p>
                      <span className="font-medium">Repeat Penalty:</span>{" "}
                      {gradingSettingsData.settings.ollama_repeat_penalty}
                    </p>
                  )}
                  {gradingSettingsData.settings.ollama_num_predict !== null && (
                    <p>
                      <span className="font-medium">Num Predict:</span>{" "}
                      {gradingSettingsData.settings.ollama_num_predict}
                    </p>
                  )}
                  {gradingSettingsData.settings.ollama_seed !== null && (
                    <p>
                      <span className="font-medium">Seed:</span>{" "}
                      {gradingSettingsData.settings.ollama_seed}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg p-4 text-sm text-gray-500">
                  ไม่มีการตั้งค่าเฉพาะ ใช้ค่าเริ่มต้นทั่วไป
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
