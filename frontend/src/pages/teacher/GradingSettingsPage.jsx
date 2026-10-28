import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGradingSettings, updateGradingSettings } from "../../api/settings";

const DEFAULTS = {
  ollama_url: "",
  ollama_temperature: "0.2",
  ollama_top_p: "0.9",
  ollama_repeat_penalty: "1.1",
  ollama_seed: "",
  ollama_num_predict: "2048",
};

export default function GradingSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);

  const { data } = useQuery({
    queryKey: ["grading-settings"],
    queryFn: getGradingSettings,
  });

  useEffect(() => {
    if (data?.settings && !form) {
      const hasOwnUrl = data.teacher_overrides?.includes("ollama_url");
      setForm({
        ollama_url: hasOwnUrl ? data.settings.ollama_url : "",
        ollama_temperature: data.settings.ollama_temperature || "0.2",
        ollama_top_p: data.settings.ollama_top_p || "0.9",
        ollama_repeat_penalty: data.settings.ollama_repeat_penalty || "1.1",
        ollama_seed: data.settings.ollama_seed || "",
        ollama_num_predict: data.settings.ollama_num_predict || "2048",
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings) => updateGradingSettings(settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grading-settings"] }),
  });

  if (!form)
    return <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>;

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ตั้งค่า AI Grading</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          กำหนด Parameters สำหรับการตรวจงานของคุณ —
          ค่าเหล่านี้เป็นของคุณเท่านั้น ไม่กระทบอาจารย์คนอื่น
        </p>
      </div>

      {/* Model (global, read-only) */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              Model (กำหนดโดยระบบ)
            </p>
            <p className="text-sm font-mono text-gray-700">
              {data?.settings?.ollama_model || "qwen3-coder:30b"}
            </p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">
            read-only
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              Vision Model (กำหนดโดยระบบ)
            </p>
            <p className="text-sm font-mono text-gray-700">
              {data?.settings?.ollama_vision_model || "qwen3.6:35b"}
            </p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">
            read-only
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section: การเชื่อมต่อ */}
        <div className="bg-white border border-orange-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-orange-700 uppercase tracking-wide">
            การเชื่อมต่อ
          </h2>

          {/* Ollama URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ollama URL
            </label>
            <input
              type="text"
              placeholder="ว่าง = ใช้ค่าส่วนกลางของระบบ"
              value={form.ollama_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, ollama_url: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              ว่างไว้ = ใช้ของส่วนกลาง (มีสำรองอัตโนมัติ) ตั้งเฉพาะถ้ามี Ollama server ของตัวเอง
              — ถ้าตั้งแล้วล่ม ระบบจะสลับไปใช้ URL สำรองของส่วนกลางให้แทน
            </p>
          </div>
        </div>

        {/* Section: LLM Parameters */}
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
                {form.ollama_temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={form.ollama_temperature}
              onChange={(e) =>
                setForm((f) => ({ ...f, ollama_temperature: e.target.value }))
              }
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
                {form.ollama_top_p}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={form.ollama_top_p}
              onChange={(e) =>
                setForm((f) => ({ ...f, ollama_top_p: e.target.value }))
              }
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
                {form.ollama_repeat_penalty}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={form.ollama_repeat_penalty}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ollama_repeat_penalty: e.target.value,
                }))
              }
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
              Max Tokens (num_predict)
            </label>
            <input
              type="number"
              min="512"
              max="8192"
              step="256"
              value={form.ollama_num_predict}
              onChange={(e) =>
                setForm((f) => ({ ...f, ollama_num_predict: e.target.value }))
              }
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
              value={form.ollama_seed}
              onChange={(e) =>
                setForm((f) => ({ ...f, ollama_seed: e.target.value }))
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
            type="submit"
            disabled={mutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button
            type="button"
            onClick={() => setForm(DEFAULTS)}
            className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
          >
            คืนค่าเริ่มต้น
          </button>
          {mutation.isSuccess && (
            <span className="text-sm text-green-600">✓ บันทึกแล้ว</span>
          )}
          {mutation.isError && (
            <span className="text-sm text-red-500">เกิดข้อผิดพลาด</span>
          )}
        </div>
      </form>
    </div>
  );
}
