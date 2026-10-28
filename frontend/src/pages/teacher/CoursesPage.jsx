import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  duplicateCourse,
  archiveCourse,
  getTeacherSummary,
} from "../../api/courses";

export default function CoursesPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editCourse, setEditCourse] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const COLORS = [
    {
      key: "indigo",
      bg: "bg-indigo-100",
      ring: "ring-indigo-400",
      dot: "bg-indigo-400",
    },
    {
      key: "pink",
      bg: "bg-pink-100",
      ring: "ring-pink-400",
      dot: "bg-pink-400",
    },
    {
      key: "emerald",
      bg: "bg-emerald-100",
      ring: "ring-emerald-400",
      dot: "bg-emerald-400",
    },
    {
      key: "amber",
      bg: "bg-amber-100",
      ring: "ring-amber-400",
      dot: "bg-amber-400",
    },
    { key: "sky", bg: "bg-sky-100", ring: "ring-sky-400", dot: "bg-sky-400" },
    {
      key: "violet",
      bg: "bg-violet-100",
      ring: "ring-violet-400",
      dot: "bg-violet-400",
    },
    {
      key: "rose",
      bg: "bg-rose-100",
      ring: "ring-rose-400",
      dot: "bg-rose-400",
    },
    {
      key: "orange",
      bg: "bg-orange-100",
      ring: "ring-orange-400",
      dot: "bg-orange-400",
    },
    {
      key: "fuchsia",
      bg: "bg-fuchsia-100",
      ring: "ring-fuchsia-400",
      dot: "bg-fuchsia-400",
    },
    {
      key: "white",
      bg: "bg-gray-100",
      ring: "ring-gray-400",
      dot: "bg-white border border-gray-300",
    },
  ];
  const CARD_STYLES = {
    indigo: {
      card: "bg-indigo-50  border-indigo-200  hover:border-indigo-400",
      badge: "bg-indigo-100 text-indigo-700",
    },
    pink: {
      card: "bg-pink-50    border-pink-200    hover:border-pink-400",
      badge: "bg-pink-100   text-pink-700",
    },
    emerald: {
      card: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
      badge: "bg-emerald-100 text-emerald-700",
    },
    amber: {
      card: "bg-amber-50   border-amber-200   hover:border-amber-400",
      badge: "bg-amber-100  text-amber-700",
    },
    sky: {
      card: "bg-sky-50     border-sky-200     hover:border-sky-400",
      badge: "bg-sky-100    text-sky-700",
    },
    violet: {
      card: "bg-violet-50  border-violet-200  hover:border-violet-400",
      badge: "bg-violet-100 text-violet-700",
    },
    rose: {
      card: "bg-rose-50    border-rose-200    hover:border-rose-400",
      badge: "bg-rose-100   text-rose-700",
    },
    orange: {
      card: "bg-orange-50  border-orange-200  hover:border-orange-400",
      badge: "bg-orange-100 text-orange-700",
    },
    fuchsia: {
      card: "bg-fuchsia-50 border-fuchsia-200 hover:border-fuchsia-400",
      badge: "bg-fuchsia-100 text-fuchsia-700",
    },
    white: {
      card: "bg-white      border-gray-200    hover:border-gray-400",
      badge: "bg-gray-100   text-gray-700",
    },
  };

  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "indigo",
    semester: "",
  });
  const [error, setError] = useState("");
  const [duplicateModal, setDuplicateModal] = useState(null); // { course }
  const [duplicateSemester, setDuplicateSemester] = useState("");
  const [filterSemester, setFilterSemester] = useState(
    () => localStorage.getItem("teacher_semester_filter") || "",
  );

  const setFilterSemesterPersist = (s) => {
    setFilterSemester(s);
    localStorage.setItem("teacher_semester_filter", s);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["courses", showArchived],
    queryFn: () => getCourses(showArchived),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["teacher-summary"],
    queryFn: getTeacherSummary,
    enabled: !showArchived,
  });

  const createMutation = useMutation({
    mutationFn: createCourse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      resetForm();
    },
    onError: (err) => setError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCourse(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      resetForm();
    },
    onError: (err) => setError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, semester }) => duplicateCourse(id, semester),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      setDuplicateModal(null);
      setDuplicateSemester("");
    },
    onError: (err) =>
      showToast(err.response?.data?.error || "Duplicate ไม่สำเร็จ"),
  });

  const enrollToggleMutation = useMutation({
    mutationFn: ({ id, open }) => updateCourse(id, { enrollment_open: open }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
    onError: (err) => showToast(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveCourse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
    onError: (err) => showToast(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const resetForm = () => {
    setForm({ name: "", description: "", color: "indigo", semester: "" });
    setShowForm(false);
    setEditCourse(null);
    setError("");
  };

  const openCreate = () => {
    setEditCourse(null);
    setForm({ name: "", description: "", color: "indigo", semester: "" });
    setError("");
    setShowForm(true);
  };

  const openEdit = (course) => {
    setEditCourse(course);
    setForm({
      name: course.name,
      description: course.description || "",
      color: course.color || "indigo",
      semester: course.semester || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (editCourse) {
      updateMutation.mutate({ id: editCourse.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (course) => {
    if (
      !confirm(
        `ลบวิชา "${course.name}" ? \n\nการลบจะลบงานและข้อมูลทั้งหมดในวิชานี้`,
      )
    )
      return;
    deleteMutation.mutate(course.id);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading)
    return <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">วิชาของฉัน</h1>
      </div>
      {!showArchived && summaryData && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">
              {summaryData.pending_grading}
            </p>
            <p className="text-xs text-yellow-600 mt-1">รอตรวจ</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-indigo-700">
              {summaryData.pending_approval}
            </p>
            <p className="text-xs text-indigo-600 mt-1">รออนุมัติ</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">
              {summaryData.pending_appeals}
            </p>
            <p className="text-xs text-orange-600 mt-1">รอ Appeal</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${!showArchived ? "bg-white shadow text-gray-800" : "text-gray-500"}`}
          >
            วิชาปัจจุบัน
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${showArchived ? "bg-white shadow text-gray-800" : "text-gray-500"}`}
          >
            วิชาที่จบแล้ว
          </button>
        </div>
        {!showArchived && (
          <button
            onClick={openCreate}
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            + สร้างวิชาใหม่
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl space-y-3"
          >
            <h2 className="font-semibold text-gray-700">
              {editCourse ? `แก้ไขวิชา: ${editCourse.name}` : "สร้างวิชาใหม่"}
            </h2>
            <input
              required
              placeholder="ชื่อวิชา"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              placeholder="ภาคเรียน เช่น 1/2568 (optional)"
              value={form.semester}
              onChange={(e) =>
                setForm((f) => ({ ...f, semester: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <textarea
              placeholder="คำอธิบาย (optional)"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={5}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div>
              <p className="text-xs text-gray-500 mb-2">สีการ์ด</p>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c.key }))}
                    className={`w-7 h-7 rounded-full ${c.dot} ${form.color === c.key ? `ring-2 ring-offset-2 ${c.ring}` : ""} transition-all`}
                  />
                ))}
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {isPending
                  ? "กำลังบันทึก..."
                  : editCourse
                    ? "บันทึก"
                    : "สร้างวิชา"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {duplicateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-3">
            <h2 className="font-semibold text-gray-700">Duplicate วิชา</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">
                {duplicateModal.name}
              </span>
              {duplicateModal.semester && (
                <span className="ml-1 text-gray-400">
                  ({duplicateModal.semester})
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400">
              จะสร้างวิชาใหม่พร้อม Rubric, Assignment, Calibration Examples และ
              Rubric Override ทั้งหมด (ไม่รวมนิสิตและงานที่ส่ง)
            </p>
            <input
              placeholder="ภาคเรียนใหม่ เช่น 1/2569 (optional)"
              value={duplicateSemester}
              onChange={(e) => setDuplicateSemester(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() =>
                  duplicateMutation.mutate({
                    id: duplicateModal.id,
                    semester: duplicateSemester,
                  })
                }
                disabled={duplicateMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {duplicateMutation.isPending
                  ? "กำลัง Duplicate..."
                  : "Duplicate"}
              </button>
              <button
                onClick={() => setDuplicateModal(null)}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {!showArchived &&
        (() => {
          const semesters = [
            ...new Set(
              (data?.courses || []).map((c) => c.semester).filter(Boolean),
            ),
          ].sort();
          return semesters.length > 0 ? (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500">ภาคเรียน:</span>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setFilterSemesterPersist("")}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterSemester === "" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-indigo-400"}`}
                >
                  ทั้งหมด
                </button>
                {semesters.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setFilterSemesterPersist(s === filterSemester ? "" : s)
                    }
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterSemester === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-indigo-400"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null;
        })()}

      {data?.courses?.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-base">ยังไม่มีวิชา</p>
          <p className="text-sm mt-1">กดปุ่ม "สร้างวิชาใหม่" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(filterSemester
            ? data?.courses?.filter((c) => c.semester === filterSemester)
            : data?.courses
          )?.map((course) => {
            const style = CARD_STYLES[course.color] || CARD_STYLES.indigo;
            return (
              <div
                key={course.id}
                className={`border rounded-xl p-5 hover:shadow-md transition-all ${style.card}`}
              >
                <Link
                  to={`/teacher/courses/${course.id}`}
                  className="block mb-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h2 className="font-semibold text-gray-800">
                      {course.name}
                    </h2>
                    {course.semester && (
                      <span className="shrink-0 text-xs bg-white/70 border border-black/10 text-gray-500 px-2 py-0.5 rounded-full">
                        {course.semester}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {course.description || "—"}
                  </p>
                </Link>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${style.badge}`}
                  >
                    {course.student_count || 0} นิสิต
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(course)}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => {
                        setDuplicateModal(course);
                        setDuplicateSemester("");
                      }}
                      disabled={duplicateMutation.isPending}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => {
                        if (
                          !confirm(
                            course.archived
                              ? `นำวิชา "${course.name}" กลับมาแสดง?`
                              : `Archive วิชา "${course.name}"?\n\nวิชาจะหายจากหน้าหลัก แต่ยังเข้าดูข้อมูลได้`,
                          )
                        )
                          return;
                        archiveMutation.mutate(course.id);
                      }}
                      disabled={archiveMutation.isPending}
                      className="text-xs text-gray-500 hover:text-amber-600 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
                    >
                      {course.archived ? "ยกเลิก Archive" : "Archive"}
                    </button>
                    <button
                      onClick={() => handleDelete(course)}
                      disabled={deleteMutation.isPending}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(course.join_code);
                    }}
                    className="flex items-center gap-1.5 text-xs font-mono tracking-widest bg-black/5 hover:bg-black/10 text-gray-600 px-2 py-1 rounded-full transition-colors"
                    title="คัดลอกรหัสเข้าร่วม"
                  >
                    {course.join_code}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      enrollToggleMutation.mutate({
                        id: course.id,
                        open: !course.enrollment_open,
                      });
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${course.enrollment_open ? "bg-indigo-500" : "bg-gray-300"}`}
                    title={
                      course.enrollment_open
                        ? "เปิดรับนิสิต — คลิกเพื่อปิด"
                        : "ปิดรับนิสิต — คลิกเพื่อเปิด"
                    }
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${course.enrollment_open ? "translate-x-5" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
