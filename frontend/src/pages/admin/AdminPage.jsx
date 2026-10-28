import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import {
  getTeachers,
  createTeacher,
  resetTeacherPassword,
  deleteTeacher,
  getAdminStats,
  getAdminLogs,
  getAdminGradingSettings,
  updateAdminGradingSettings,
  downloadBackup,
  downloadUploadsBackup,
} from "../../api/admin";

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
const today = () =>
  new Date().toISOString().slice(0, 10).replace(/-/g, "");

const AI_DEFAULTS = {
  ollama_url: "http://10.80.39.41:11941",
  ollama_url_backup: "",
  ollama_model: "qwen3-coder:30b",
  ollama_vision_model: "qwen3.6:35b",
  ollama_temperature: "0.2",
  ollama_top_p: "0.9",
  ollama_repeat_penalty: "1.1",
  ollama_num_predict: "2048",
  ollama_seed: "42",
};

const settingsToForm = (s) => ({
  ollama_url: s.ollama_url || AI_DEFAULTS.ollama_url,
  ollama_url_backup: s.ollama_url_backup || AI_DEFAULTS.ollama_url_backup,
  ollama_model: s.ollama_model || AI_DEFAULTS.ollama_model,
  ollama_vision_model: s.ollama_vision_model || AI_DEFAULTS.ollama_vision_model,
  ollama_temperature: s.ollama_temperature || AI_DEFAULTS.ollama_temperature,
  ollama_top_p: s.ollama_top_p || AI_DEFAULTS.ollama_top_p,
  ollama_repeat_penalty:
    s.ollama_repeat_penalty || AI_DEFAULTS.ollama_repeat_penalty,
  ollama_num_predict: s.ollama_num_predict || AI_DEFAULTS.ollama_num_predict,
  ollama_seed: s.ollama_seed || AI_DEFAULTS.ollama_seed,
});

const ACTION_LABELS = {
  admin_create_teacher: "สร้างอาจารย์",
  admin_delete_teacher: "ลบอาจารย์",
  admin_reset_password: "Reset รหัสผ่าน",
  teacher_grade: "ตรวจงาน",
  teacher_approve: "อนุมัติ",
  teacher_reject: "ปฏิเสธ",
  teacher_appeal_resolve: "ตอบ Appeal",
  student_submit: "ส่งงาน",
  student_appeal: "ยื่น Appeal",
};

export default function AdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState("teachers"); // teachers | stats | logs | settings
  const [aiForm, setAiForm] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    username: "",
    password: "",
  });
  const [createError, setCreateError] = useState("");
  const [resetModal, setResetModal] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const { data: teacherData, isLoading: teachersLoading } = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: getTeachers,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getAdminStats,
    enabled: tab === "stats",
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: () => getAdminLogs(200),
    enabled: tab === "logs",
    refetchInterval: 30_000,
  });

  const { data: aiSettingsData } = useQuery({
    queryKey: ["admin-grading-settings"],
    queryFn: getAdminGradingSettings,
    enabled: tab === "settings",
  });

  const aiMutation = useMutation({
    mutationFn: updateAdminGradingSettings,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-grading-settings"] }),
  });

  useEffect(() => {
    if (aiSettingsData?.settings && !aiForm) {
      setAiForm(settingsToForm(aiSettingsData.settings));
    }
  }, [aiSettingsData]);

  const createMutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-teachers"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setShowCreate(false);
      setCreateForm({ name: "", username: "", password: "" });
      setCreateError("");
    },
    onError: (err) =>
      setCreateError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }) => resetTeacherPassword(id, password),
    onSuccess: () => {
      setResetModal(null);
      setResetPassword("");
      setResetError("");
    },
    onError: (err) =>
      setResetError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-teachers"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    setCreateError("");
    createMutation.mutate(createForm);
  };

  const handleDelete = (teacher) => {
    if (
      !confirm(
        `ลบ teacher "${teacher.name}" (${teacher.username})?\n\nจะลบวิชาและข้อมูลทั้งหมดของอาจารย์คนนี้`,
      )
    )
      return;
    deleteMutation.mutate(teacher.id);
  };

  const tabs = [
    { id: "teachers", label: "จัดการอาจารย์" },
    { id: "stats", label: "ภาพรวมระบบ" },
    { id: "logs", label: "Activity Log" },
    { id: "settings", label: "ตั้งค่า AI" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Admin Dashboard</h1>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? "bg-white border border-b-white border-gray-200 -mb-px text-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: จัดการอาจารย์ ── */}
      {tab === "teachers" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              อาจารย์ทั้งหมด {teacherData?.teachers?.length ?? "—"} คน
            </p>
            <button
              onClick={() => {
                setShowCreate(true);
                setCreateError("");
              }}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
            >
              + เพิ่มอาจารย์
            </button>
          </div>

          {teachersLoading ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : teacherData?.teachers?.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>ยังไม่มีอาจารย์ในระบบ</p>
              <p className="text-sm mt-1">
                กดปุ่ม "เพิ่มอาจารย์" เพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      ชื่อ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Username
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      วิชา
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      วันที่สร้าง
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teacherData.teachers.map((teacher) => (
                    <tr
                      key={teacher.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {teacher.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {teacher.username}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {teacher.course_count} วิชา
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(teacher.created_at).toLocaleDateString(
                          "th-TH",
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setResetModal(teacher);
                              setResetPassword("");
                              setResetError("");
                            }}
                            className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Reset pwd
                          </button>
                          <button
                            onClick={() => handleDelete(teacher)}
                            disabled={deleteMutation.isPending}
                            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: ภาพรวมระบบ ── */}
      {tab === "stats" && (
        <div>
          {statsLoading ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                {
                  label: "อาจารย์",
                  value: statsData?.teachers,
                  color: "bg-indigo-50 text-indigo-700",
                  icon: "👩‍🏫",
                },
                {
                  label: "นิสิต",
                  value: statsData?.students,
                  color: "bg-green-50 text-green-700",
                  icon: "🎓",
                },
                {
                  label: "วิชาที่เปิด",
                  value: statsData?.courses,
                  color: "bg-blue-50 text-blue-700",
                  icon: "📚",
                },
                {
                  label: "งานที่ส่งทั้งหมด",
                  value: statsData?.submissions,
                  color: "bg-gray-50 text-gray-700",
                  icon: "📄",
                },
                {
                  label: "รอตรวจ (AI)",
                  value: statsData?.pendingGrading,
                  color: "bg-yellow-50 text-yellow-700",
                  icon: "⏳",
                },
                {
                  label: "รออนุมัติ",
                  value: statsData?.pendingApproval,
                  color: "bg-orange-50 text-orange-700",
                  icon: "✅",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-xl border border-gray-200 p-5 ${stat.color}`}
                >
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-3xl font-bold">{stat.value ?? "—"}</div>
                  <div className="text-sm mt-1 font-medium opacity-80">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Backup */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">สำรองข้อมูล</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  try {
                    saveBlob(await downloadBackup(), `app_${today()}.db`);
                  } catch {
                    alert("ดาวน์โหลด Backup ไม่สำเร็จ");
                  }
                }}
                className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                ดาวน์โหลด Backup (SQLite เท่านั้น)
              </button>
              <button
                onClick={async () => {
                  try {
                    saveBlob(
                      await downloadUploadsBackup(),
                      `uploads_${today()}.tar.gz`,
                    );
                  } catch {
                    alert("ดาวน์โหลด Backup ไม่สำเร็จ");
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
              >
                ดาวน์โหลดไฟล์ที่นิสิตส่ง (.tar.gz)
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              ควรดาวน์โหลดทั้งสองไฟล์คู่กัน — SQLite เก็บแค่ชื่อไฟล์ ตัวไฟล์จริงอยู่ในชุด uploads
            </p>
          </div>
        </div>
      )}

      {/* ── Tab: Activity Log ── */}
      {tab === "logs" && (
        <div>
          <p className="text-sm text-gray-400 mb-3">
            แสดง 200 รายการล่าสุด · รีเฟรชทุก 30 วินาที
          </p>
          {logsLoading ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : logsData?.logs?.length === 0 ? (
            <p className="text-center py-8 text-gray-400">ยังไม่มีกิจกรรม</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      เวลา
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      ผู้ใช้
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      การกระทำ
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                      รายละเอียด
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logsData.logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Asia/Bangkok",
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-700">
                          {log.user_name || "—"}
                        </span>
                        <span
                          className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                            log.user_role === "admin"
                              ? "bg-slate-100 text-slate-600"
                              : log.user_role === "teacher"
                                ? "bg-orange-100 text-orange-600"
                                : "bg-green-100 text-green-600"
                          }`}
                        >
                          {log.user_role === "teacher"
                            ? "อาจารย์"
                            : log.user_role === "admin"
                              ? "Admin"
                              : "นิสิต"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {ACTION_LABELS[log.action] || log.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono hidden md:table-cell max-w-xs truncate">
                        {log.detail ? JSON.stringify(log.detail) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: ตั้งค่า AI ── */}
      {tab === "settings" && (
        <div className="max-w-lg">
          <p className="text-sm text-gray-400 mb-4">
            ค่าที่ตั้งที่นี่เป็น <strong>global default</strong> —
            อาจารย์ที่ไม่ได้ตั้งค่าเองจะใช้ค่าเหล่านี้
          </p>
          {!aiForm ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                aiMutation.mutate(aiForm);
              }}
              className="space-y-4"
            >
              {/* Section: การเชื่อมต่อ */}
              <div className="bg-white border border-orange-200 rounded-xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-orange-700 uppercase tracking-wide">
                  การเชื่อมต่อ
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ollama URL
                  </label>
                  <input
                    type="text"
                    value={aiForm.ollama_url}
                    onChange={(e) =>
                      setAiForm((f) => ({ ...f, ollama_url: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ollama URL (สำรอง)
                  </label>
                  <input
                    type="text"
                    placeholder="เว้นว่างได้ถ้าไม่มี"
                    value={aiForm.ollama_url_backup}
                    onChange={(e) =>
                      setAiForm((f) => ({
                        ...f,
                        ollama_url_backup: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    ระบบจะสลับไปใช้ URL นี้อัตโนมัติถ้าตัวหลักล่ม และสลับกลับเองเมื่อตัวหลักกลับมาใช้งานได้
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={aiForm.ollama_model}
                    onChange={(e) =>
                      setAiForm((f) => ({ ...f, ollama_model: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    อาจารย์ไม่สามารถเปลี่ยน model ได้
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vision Model
                  </label>
                  <input
                    type="text"
                    value={aiForm.ollama_vision_model}
                    onChange={(e) =>
                      setAiForm((f) => ({
                        ...f,
                        ollama_vision_model: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    ใช้ตรวจงานที่ส่งเป็นรูปภาพ (วาด/paste)
                  </p>
                </div>
              </div>

              {/* Section: LLM Parameters */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  LLM Parameters
                </h2>

                {[
                  {
                    key: "ollama_temperature",
                    label: "Temperature",
                    min: 0,
                    max: 1,
                    step: 0.05,
                    hint: "แนะนำ 0.1–0.3",
                  },
                  {
                    key: "ollama_top_p",
                    label: "Top P",
                    min: 0,
                    max: 1,
                    step: 0.05,
                    hint: "แนะนำ 0.8–0.95",
                  },
                  {
                    key: "ollama_repeat_penalty",
                    label: "Repeat Penalty",
                    min: 1,
                    max: 2,
                    step: 0.05,
                    hint: "แนะนำ 1.1–1.3",
                  },
                ].map(({ key, label, min, max, step, hint }) => (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">
                        {label}
                      </label>
                      <span className="text-sm font-semibold text-indigo-600">
                        {aiForm[key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={aiForm[key]}
                      onChange={(e) =>
                        setAiForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      className="w-full accent-indigo-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">{hint}</p>
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Tokens (num_predict)
                  </label>
                  <input
                    type="number"
                    min="512"
                    max="8192"
                    step="256"
                    value={aiForm.ollama_num_predict}
                    onChange={(e) =>
                      setAiForm((f) => ({
                        ...f,
                        ollama_num_predict: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seed
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="ว่าง = สุ่มทุกครั้ง"
                    value={aiForm.ollama_seed}
                    onChange={(e) =>
                      setAiForm((f) => ({ ...f, ollama_seed: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={aiMutation.isPending}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {aiMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  type="button"
                  onClick={() => setAiForm(AI_DEFAULTS)}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
                >
                  คืนค่าเริ่มต้น
                </button>
                {aiMutation.isSuccess && (
                  <span className="text-sm text-green-600">✓ บันทึกแล้ว</span>
                )}
                {aiMutation.isError && (
                  <span className="text-sm text-red-500">เกิดข้อผิดพลาด</span>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Create Teacher Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-3"
          >
            <h2 className="font-semibold text-gray-700">เพิ่มอาจารย์ใหม่</h2>
            <input
              required
              placeholder="ชื่อ-นามสกุล"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, name: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              required
              placeholder="Username"
              value={createForm.username}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              required
              type="password"
              placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, password: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {createError && (
              <p className="text-red-500 text-sm">{createError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "กำลังสร้าง..." : "สร้าง"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-3">
            <h2 className="font-semibold text-gray-700">Reset รหัสผ่าน</h2>
            <p className="text-sm text-gray-500">
              {resetModal.name}{" "}
              <span className="text-gray-400">({resetModal.username})</span>
            </p>
            <input
              type="password"
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            {resetError && <p className="text-red-500 text-sm">{resetError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setResetError("");
                  resetMutation.mutate({
                    id: resetModal.id,
                    password: resetPassword,
                  });
                }}
                disabled={resetMutation.isPending || !resetPassword}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {resetMutation.isPending ? "กำลังบันทึก..." : "Reset"}
              </button>
              <button
                onClick={() => {
                  setResetModal(null);
                  setResetPassword("");
                  setResetError("");
                }}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
