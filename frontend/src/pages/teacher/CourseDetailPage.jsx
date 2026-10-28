import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import {
  getCourse,
  getCourseAssignments,
  getCourseRubrics,
  getCourseStudents,
  createAssignment,
  createRubric,
  getCourseStats,
  importStudents,
  removeStudent,
  removeAllStudents,
  exportStudents,
  exportGrades,
  resetStudentPassword,
  updateCourse,
  updateStudentGroup,
  getCourseAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from "../../api/courses";
import { downloadBackup } from "../../api/admin";
import {
  updateAssignment,
  deleteAssignment,
  toggleAssignmentOpen,
} from "../../api/assignments";
import {
  updateRubric,
  deleteRubric,
  getRubric,
  generateRubricDraft,
} from "../../api/grading";
import { triggerFileDownload } from "../../utils/download";
import {
  getCourseExams,
  createExam,
  updateExam,
  deleteExam,
  publishExam,
} from "../../api/exams";

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState("assignments");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState("latest");
  const [exportFormat, setExportFormat] = useState("xls");

  // Assignment state
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editAssign, setEditAssign] = useState(null);
  const [assignForm, setAssignForm] = useState({
    title: "",
    description: "",
    deadline: "",
    rubric_id: "",
    auto_approve_threshold: "",
    assignment_type: "",
    allow_paste: true,
  });

  // Import students state
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState("text"); // 'text' | 'file'
  const [importCsv, setImportCsv] = useState("");
  const [importResult, setImportResult] = useState(null);

  // Rubric state
  const [showRubricForm, setShowRubricForm] = useState(false);
  const [editRubric, setEditRubric] = useState(null);
  const [rubricForm, setRubricForm] = useState({
    name: "",
    description: "",
    criteria: [{ name: "", description: "", levels: [] }],
  });
  const [showLevels, setShowLevels] = useState({});

  const { data: courseData, error: courseError } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => getCourse(courseId),
    retry: false,
  });

  useEffect(() => {
    if (courseError) navigate("/teacher/courses", { replace: true });
  }, [courseError]);
  const { data: assignData } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => getCourseAssignments(courseId),
  });
  const { data: rubricData } = useQuery({
    queryKey: ["rubrics", courseId],
    queryFn: () => getCourseRubrics(courseId),
  });
  const { data: studentsData } = useQuery({
    queryKey: ["students", courseId],
    queryFn: () => getCourseStudents(courseId),
    enabled: tab === "students",
  });

  const { data: statsData } = useQuery({
    queryKey: ["course-stats", courseId],
    queryFn: () => getCourseStats(courseId),
    enabled: tab === "stats",
  });

  // Announcements state & mutations
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [announceForm, setAnnounceForm] = useState({ title: "", content: "" });

  const { data: annData } = useQuery({
    queryKey: ["announcements", courseId],
    queryFn: () => getCourseAnnouncements(courseId),
    enabled: tab === "announcements",
  });

  const createAnnMut = useMutation({
    mutationFn: (data) => createAnnouncement(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", courseId] });
      setShowAnnounceForm(false);
      setAnnounceForm({ title: "", content: "" });
      showToast("สร้างประกาศเรียบร้อยแล้ว", "success");
    },
    onError: (err) => showToast(err.response?.data?.error || "สร้างประกาศไม่สำเร็จ", "error"),
  });

  const deleteAnnMut = useMutation({
    mutationFn: (annId) => deleteAnnouncement(courseId, annId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", courseId] });
      showToast("ลบประกาศเรียบร้อยแล้ว", "success");
    },
    onError: (err) => showToast(err.response?.data?.error || "ลบประกาศไม่สำเร็จ", "error"),
  });

  const handleBackupDb = async () => {
    try {
      showToast("กำลังสร้างไฟล์สำรองฐานข้อมูล...", "info");
      const blob = await downloadBackup();
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerFileDownload(blob, `app_backup_${dateStr}.db`);
      showToast("ดาวน์โหลดไฟล์สำรองเรียบร้อยแล้ว", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "สำรองฐานข้อมูลไม่สำเร็จ", "error");
    }
  };

  // Exam state & mutations
  const [showExamModal, setShowExamModal] = useState(false);
  const [editExam, setEditExam] = useState(null);
  const [examForm, setExamForm] = useState({
    title: "",
    description: "",
    duration_minutes: 60,
    is_open: true,
    allow_paste: true,
    require_fullscreen: false,
    questions: [
      {
        question_type: "mcq",
        prompt: "",
        points: 1,
        options: ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3", "ตัวเลือก 4"],
        correct_option: "1",
        starter_code: "",
        solution_guide: "",
      },
    ],
  });

  const { data: examsData } = useQuery({
    queryKey: ["exams", courseId],
    queryFn: () => getCourseExams(courseId),
    enabled: tab === "exams",
  });

  const examCreateMutation = useMutation({
    mutationFn: (data) => createExam(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams", courseId] });
      setShowExamModal(false);
      showToast("สร้างห้องสอบเรียบร้อยแล้ว", "success");
    },
    onError: (err) =>
      showToast(err.response?.data?.error || "สร้างห้องสอบไม่สำเร็จ", "error"),
  });

  const examUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => updateExam(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams", courseId] });
      setShowExamModal(false);
      setEditExam(null);
      showToast("อัปเดตห้องสอบเรียบร้อยแล้ว", "success");
    },
    onError: (err) =>
      showToast(err.response?.data?.error || "อัปเดตห้องสอบไม่สำเร็จ", "error"),
  });

  const examDeleteMutation = useMutation({
    mutationFn: deleteExam,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams", courseId] });
      showToast("ลบห้องสอบเรียบร้อยแล้ว", "success");
    },
    onError: (err) =>
      showToast(err.response?.data?.error || "ลบห้องสอบไม่สำเร็จ", "error"),
  });

  const examPublishMutation = useMutation({
    mutationFn: ({ id, is_published }) => publishExam(id, is_published),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["exams", courseId] });
      showToast(res.message, "success");
    },
    onError: (err) =>
      showToast(
        err.response?.data?.error || "ไม่สามารถเปลี่ยนสถานะประกาศคะแนนได้",
        "error",
      ),
  });

  const openCreateExam = () => {
    setEditExam(null);
    setExamForm({
      title: "",
      description: "",
      duration_minutes: 60,
      is_open: true,
      allow_paste: true,
      require_fullscreen: false,
      questions: [
        {
          question_type: "mcq",
          prompt: "",
          points: 1,
          options: ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3", "ตัวเลือก 4"],
          correct_option: "1",
          starter_code: "",
          solution_guide: "",
        },
      ],
    });
    setShowExamModal(true);
  };

  const openEditExam = (exam) => {
    setEditExam(exam);
    setExamForm({
      title: exam.title,
      description: exam.description || "",
      duration_minutes: exam.duration_minutes || 60,
      is_open: !!exam.is_open,
      allow_paste: exam.allow_paste !== 0,
      require_fullscreen: !!exam.require_fullscreen,
      questions: [],
    });
    setShowExamModal(true);
  };

  const handleAddQuestion = (type) => {
    const newQ = {
      question_type: type,
      prompt: "",
      points: type === "coding" ? 5 : 1,
      options: type === "mcq" ? ["", "", "", ""] : [],
      correct_option: type === "mcq" ? "1" : "",
      starter_code:
        type === "coding"
          ? `public class Solution {\n    // เขียนโค้ด Java ตรงนี้\n}`
          : "",
      solution_guide: "",
    };
    setExamForm((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ],
    }));
  };

  const handleRemoveQuestion = (idx) => {
    setExamForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleUpdateQuestion = (idx, field, val) => {
    setExamForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === idx ? { ...q, [field]: val } : q,
      ),
    }));
  };

  const handleUpdateOption = (qIdx, optIdx, val) => {
    setExamForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIdx) return q;
        const newOpts = [...q.options];
        newOpts[optIdx] = val;
        return { ...q, options: newOpts };
      }),
    }));
  };

  // Assignment mutations
  const assignCreateMutation = useMutation({
    mutationFn: (data) => createAssignment(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
      resetAssignForm();
    },
  });
  const assignUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAssignment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments", courseId] });
      resetAssignForm();
    },
  });
  const assignDeleteMutation = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["assignments", courseId] }),
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });
  const assignToggleOpenMutation = useMutation({
    mutationFn: toggleAssignmentOpen,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["assignments", courseId] }),
  });

  // Group inline edit state
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupVal, setEditingGroupVal] = useState("");

  const groupMutation = useMutation({
    mutationFn: ({ studentId, group_no }) =>
      updateStudentGroup(courseId, studentId, group_no),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", courseId] }),
    onError: (err) => showToast(err.response?.data?.error || "บันทึกไม่สำเร็จ"),
  });

  const saveGroup = (studentId) => {
    groupMutation.mutate({ studentId, group_no: editingGroupVal });
    setEditingGroupId(null);
  };

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (studentId) => resetStudentPassword(courseId, studentId),
    onError: (err) => showToast(err.response?.data?.error || "รีเซ็ตไม่สำเร็จ"),
  });

  const handleResetPassword = (s) => {
    if (
      !confirm(`รีเซ็ต password ของ "${s.name}" เป็นรหัสนิสิต (${s.username})?`)
    )
      return;
    resetPasswordMutation.mutate(s.id);
  };

  // Enrollment toggle mutation
  const enrollToggleMutation = useMutation({
    mutationFn: (open) => updateCourse(courseId, { enrollment_open: open }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course", courseId] }),
  });

  // Rubric mutations
  const rubricCreateMutation = useMutation({
    mutationFn: (data) => createRubric(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics", courseId] });
      resetRubricForm();
    },
  });
  const rubricUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRubric(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rubrics", courseId] });
      resetRubricForm();
    },
  });
  const rubricDeleteMutation = useMutation({
    mutationFn: deleteRubric,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rubrics", courseId] }),
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });

  const [aiTask, setAiTask] = useState("");
  const [aiCount, setAiCount] = useState(4);
  const rubricGenMutation = useMutation({
    mutationFn: ({ task, count }) => generateRubricDraft(task, count),
    onSuccess: ({ rubric }) => {
      const criteria = rubric.criteria.length
        ? rubric.criteria
        : [emptyCriteria()];
      setRubricForm({
        name: rubric.name,
        description: rubric.description,
        criteria,
      });
      // เปิด levels ทุกเกณฑ์ เพราะ AI เติมคำอธิบายมาให้แล้ว
      setShowLevels(Object.fromEntries(criteria.map((_, i) => [i, true])));
    },
    onError: (err) => showToast(err.response?.data?.error || "ร่างไม่สำเร็จ"),
  });

  // Remove student mutation
  const removeStudentMutation = useMutation({
    mutationFn: (studentId) => removeStudent(courseId, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", courseId] }),
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });

  const handleRemoveStudent = (s) => {
    if (
      !confirm(
        `ลบ "${s.name}" ออกจากวิชานี้?\n\nงานที่ส่งทั้งหมดของนิสิตคนนี้ในวิชานี้จะถูกลบด้วย`,
      )
    )
      return;
    removeStudentMutation.mutate(s.id);
  };

  const removeAllMutation = useMutation({
    mutationFn: () => removeAllStudents(courseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", courseId] }),
    onError: (err) => showToast(err.response?.data?.error || "ลบไม่สำเร็จ"),
  });

  const handleRemoveAll = () => {
    const count = studentsData?.students?.length || 0;
    if (
      !confirm(
        `ลบนิสิตทั้งหมด ${count} คน ออกจากวิชานี้?\n\n` +
          `งานที่ส่งทั้งหมดของนิสิตทุกคนในวิชานี้จะถูกลบด้วย\n`,
      )
    )
      return;
    removeAllMutation.mutate();
  };

  const handleExportStudents = async (format = "xls") => {
    try {
      const blob = await exportStudents(courseId, format);
      triggerFileDownload(blob, `students-${courseId}.${format}`);
    } catch (err) {
      showToast(err.response?.data?.error || "Export รายชื่อไม่สำเร็จ", "error");
    }
  };

  const handleExportGrades = async () => {
    try {
      const blob = await exportGrades(courseId, exportMode, exportFormat);
      triggerFileDownload(blob, `grades-${exportMode}-${courseId}.${exportFormat}`);
      setShowExportModal(false);
    } catch (err) {
      showToast(err.response?.data?.error || "Export คะแนนไม่สำเร็จ", "error");
    }
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (csv) => importStudents(courseId, csv),
    onSuccess: (data) => {
      setImportResult(data);
      setImportCsv("");
      qc.invalidateQueries({ queryKey: ["students", courseId] });
    },
    onError: (err) =>
      showToast(err.response?.data?.error || "Import ไม่สำเร็จ"),
  });

  const handleImport = () => {
    if (!importCsv.trim()) return;
    importMutation.mutate(importCsv);
  };

  const closeImport = () => {
    setShowImport(false);
    setImportCsv("");
    setImportResult(null);
    setImportTab("text");
  };

  // Assignment form helpers
  const resetAssignForm = () => {
    setAssignForm({
      title: "",
      description: "",
      deadline: "",
      rubric_id: "",
      auto_approve_threshold: "",
      assignment_type: "",
      allow_paste: true,
    });
    setShowAssignForm(false);
    setEditAssign(null);
  };
  const openCreateAssign = () => {
    setEditAssign(null);
    setAssignForm({
      title: "",
      description: "",
      deadline: "",
      rubric_id: "",
      auto_approve_threshold: "",
      assignment_type: "",
      allow_paste: true,
    });
    setShowAssignForm(true);
  };
  const openEditAssign = (a) => {
    setEditAssign(a);
    setAssignForm({
      title: a.title,
      description: a.description || "",
      deadline: a.deadline ? a.deadline.slice(0, 16) : "",
      rubric_id: a.rubric_id || "",
      auto_approve_threshold: a.auto_approve_threshold ?? "",
      assignment_type: a.assignment_type || "",
      allow_paste: a.allow_paste !== 0,
    });
    setShowAssignForm(true);
  };
  const handleAssignSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...assignForm,
      rubric_id: assignForm.rubric_id || null,
      auto_approve_threshold:
        assignForm.auto_approve_threshold !== ""
          ? Number(assignForm.auto_approve_threshold)
          : null,
      assignment_type: assignForm.assignment_type || null,
    };
    if (editAssign) assignUpdateMutation.mutate({ id: editAssign.id, data });
    else assignCreateMutation.mutate(data);
  };
  const handleDeleteAssign = (a) => {
    if (!confirm(`ลบงาน "${a.title}" ? submissions ทั้งหมดจะถูกลบด้วย`)) return;
    assignDeleteMutation.mutate(a.id);
  };

  // เกณฑ์ Rubric form helpers — flexible levels
  const emptyLevelsByRange = (minScore, maxScore) => {
    const levels = [];
    for (let s = maxScore; s >= minScore; s--) {
      levels.push({ score: s, label: "", description: "" });
    }
    return levels;
  };
  const emptyCriteria = () => ({
    name: "",
    description: "",
    min_score: 1,
    max_score: 4,
    levels: [],
  });

  const resetRubricForm = () => {
    setRubricForm({ name: "", description: "", criteria: [emptyCriteria()] });
    setShowRubricForm(false);
    setEditRubric(null);
    setShowLevels({});
  };
  const openCreateRubric = () => {
    setEditRubric(null);
    setRubricForm({ name: "", description: "", criteria: [emptyCriteria()] });
    setShowLevels({});
    setShowRubricForm(true);
  };
  const openEditRubric = async (r) => {
    setEditRubric(r);
    setShowRubricForm(true);
    // ดึง rubric เต็ม (พร้อม criteria + levels) จาก GET /api/rubrics/:id
    const { rubric } = await getRubric(r.id);
    const criteria = rubric.criteria?.length
      ? rubric.criteria.map((c) => ({
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
    setRubricForm({
      name: rubric.name,
      description: rubric.description || "",
      criteria,
    });
    // เปิด showLevels สำหรับ criteria ที่มี levels อยู่แล้ว
    const initialShowLevels = {};
    criteria.forEach((c, i) => {
      if (c.levels?.length) initialShowLevels[i] = true;
    });
    setShowLevels(initialShowLevels);
  };
  const handleRubricSubmit = (e) => {
    e.preventDefault();
    if (editRubric)
      rubricUpdateMutation.mutate({ id: editRubric.id, data: rubricForm });
    else rubricCreateMutation.mutate(rubricForm);
  };
  const handleDeleteRubric = (r) => {
    if (!confirm(`ลบ Rubric "${r.name}" ?`)) return;
    rubricDeleteMutation.mutate(r.id);
  };

  const addCriteria = () =>
    setRubricForm((f) => ({
      ...f,
      criteria: [...f.criteria, emptyCriteria()],
    }));
  const removeCriteria = (i) =>
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.filter((_, idx) => idx !== i),
    }));
  const updateCriteriaField = (i, field, val) =>
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, idx) => {
        if (idx !== i) return c;
        return { ...c, [field]: val };
      }),
    }));
  const toggleLevels = (i) =>
    setShowLevels((prev) => ({ ...prev, [i]: !prev[i] }));

  // เติม label มาตรฐาน (ดีมาก/ดี/พอใช้/ต้องปรับปรุง) ให้ทุกเกณฑ์ที่ยังว่าง
  const STD_LABELS = {
    4: "ดีมาก",
    3: "ดี",
    2: "พอใช้",
    1: "ต้องปรับปรุง",
  };
  const fillStandardLevels = () => {
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.map((c) => {
        if (c.levels?.some((lv) => lv.label?.trim())) return c;
        const min = c.min_score ?? 1;
        const max = c.max_score ?? 4;
        return {
          ...c,
          levels: emptyLevelsByRange(min, max).map((lv) => ({
            ...lv,
            label: STD_LABELS[lv.score] || "",
          })),
        };
      }),
    }));
    setShowLevels(Object.fromEntries(rubricForm.criteria.map((_, i) => [i, true])));
  };
  const updateLevel = (ci, score, field, val) =>
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, idx) =>
        idx === ci
          ? {
              ...c,
              levels: c.levels.map((lv) =>
                lv.score === score ? { ...lv, [field]: val } : lv,
              ),
            }
          : c,
      ),
    }));
  const addLevel = (ci) =>
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, idx) => {
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
    }));
  const removeLevel = (ci, score) =>
    setRubricForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, idx) =>
        idx === ci
          ? { ...c, levels: c.levels.filter((lv) => lv.score !== score) }
          : c,
      ),
    }));

  const course = courseData?.course;
  const assignPending =
    assignCreateMutation.isPending || assignUpdateMutation.isPending;
  const rubricPending =
    rubricCreateMutation.isPending || rubricUpdateMutation.isPending;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link
            to="/teacher/courses"
            className="text-sm text-indigo-500 hover:underline"
          >
            ← วิชาของฉัน
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">
            {course?.name}
          </h1>
          {course?.description && (
            <p className="text-gray-500 text-sm mt-1">{course.description}</p>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={handleBackupDb}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            💾 สำรองฐานข้อมูล (Backup DB)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          ["assignments", "งาน"],
          ["exams", "ห้องสอบ (Exams)"],
          ["announcements", "📢 ประกาศ"],
          ["rubrics", "Rubric Templates"],
          ["students", "นิสิต"],
          ["stats", "สถิติ"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===== ASSIGNMENTS TAB ===== */}
      {tab === "assignments" && (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <button
              onClick={() => setShowExportModal(true)}
              className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-colors"
            >
              Export คะแนน
            </button>
            <button
              onClick={openCreateAssign}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
            >
              + สร้างงานใหม่
            </button>
          </div>
          {showAssignForm && (
            <form
              onSubmit={handleAssignSubmit}
              className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-3"
            >
              <h3 className="font-semibold text-gray-700">
                {editAssign ? `แก้ไขงาน: ${editAssign.title}` : "สร้างงานใหม่"}
              </h3>
              <input
                required
                placeholder="ชื่องาน"
                value={assignForm.title}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, title: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <textarea
                placeholder="คำอธิบาย"
                value={assignForm.description}
                rows={7}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, description: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    กำหนดส่ง
                  </label>
                  <input
                    type="datetime-local"
                    value={assignForm.deadline}
                    onChange={(e) =>
                      setAssignForm((f) => ({ ...f, deadline: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rubric
                  </label>
                  <select
                    value={assignForm.rubric_id}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        rubric_id: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="">ไม่ระบุ</option>
                    {rubricData?.rubrics?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ประเภทงาน
                  </label>
                  <select
                    value={assignForm.assignment_type}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        assignment_type: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="">ไม่ระบุ</option>
                    <option value="essay">Essay</option>
                    <option value="problem_set">Problem Set</option>
                    <option value="code_review">Code Review</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allow_paste"
                  checked={assignForm.allow_paste}
                  onChange={(e) =>
                    setAssignForm((f) => ({
                      ...f,
                      allow_paste: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                />
                <label htmlFor="allow_paste" className="text-sm text-gray-700">
                  อนุญาตให้วางข้อความ (paste) — ถ้าปิด นักเรียนต้องพิมพ์เอง และห้ามอัปโหลดไฟล์
                </label>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Auto-approve เมื่อ avg level ≥{" "}
                    <span className="text-gray-400">ไม่บังคับ</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    step="0.1"
                    placeholder="เช่น 3.0"
                    value={assignForm.auto_approve_threshold}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        auto_approve_threshold: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  ปล่อยว่างเพื่อให้อาจารย์อนุมัติเอง
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={assignPending}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {assignPending
                    ? "กำลังบันทึก..."
                    : editAssign
                      ? "บันทึก"
                      : "สร้างงาน"}
                </button>
                <button
                  type="button"
                  onClick={resetAssignForm}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {assignData?.assignments?.map((a) => (
              <div
                key={a.id}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 hover:shadow-sm hover:border-indigo-200 transition-all"
              >
                <div className="flex items-center justify-between">
                  <Link
                    to={`/teacher/assignments/${a.id}`}
                    className="flex-1 min-w-0"
                  >
                    <p className="font-medium text-gray-800">{a.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {a.assignment_type && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {a.assignment_type === "essay"
                            ? "Essay"
                            : a.assignment_type === "problem_set"
                              ? "Problem Set"
                              : a.assignment_type === "code_review"
                                ? "Code Review"
                                : "Other"}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                        {a.rubric_name || a.has_override ? (
                          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            {a.has_override
                              ? "กำหนด Rubric แล้ว (Custom)"
                              : "กำหนด Rubric แล้ว"}
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                            ยังไม่ได้กำหนด Rubric
                          </span>
                        )}
                        {a.deadline &&
                          `· กำหนดส่ง: ${new Date(a.deadline).toLocaleDateString("th-TH")}`}
                        {a.auto_approve_threshold != null &&
                          `· Auto-approve ≥ ${a.auto_approve_threshold}/4`}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-3">
                    <Link
                      to={`/teacher/assignments/${a.id}`}
                      className="text-indigo-400 text-sm"
                    >
                      ดูงาน →
                    </Link>
                    {(() => {
                      const hasRubric = a.rubric_name || a.has_override;
                      const canToggle = a.is_open || hasRubric;
                      return (
                        <button
                          onClick={() =>
                            canToggle && assignToggleOpenMutation.mutate(a.id)
                          }
                          disabled={
                            assignToggleOpenMutation.isPending || !canToggle
                          }
                          title={
                            !canToggle
                              ? "กำหนด Rubric ก่อนจึงจะเปิดงานได้"
                              : a.is_open
                                ? "คลิกเพื่อปิดงาน"
                                : "คลิกเพื่อเปิดงาน"
                          }
                          className={`flex items-center gap-1.5 ${!canToggle ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <div
                            className={`relative w-8 h-4 rounded-full transition-colors ${a.is_open ? "bg-green-500" : "bg-gray-300"}`}
                          >
                            <div
                              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${a.is_open ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </div>
                          <span
                            className={`text-xs ${a.is_open ? "text-green-600" : "text-gray-400"}`}
                          >
                            {a.is_open ? "เปิด" : "ปิด"}
                          </span>
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => openEditAssign(a)}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-gray-100"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => handleDeleteAssign(a)}
                      disabled={assignDeleteMutation.isPending}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {assignData?.assignments?.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">
                ยังไม่มีงาน
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== EXAMS TAB ===== */}
      {tab === "exams" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">ห้องสอบสำหรับวิชานี้</h2>
              <p className="text-xs text-gray-500">
                สร้างข้อสอบเขียนโค้ด Java และข้อสอบกากบาท พร้อมระบบตรวจและสรุปคะแนน
              </p>
            </div>
            <button
              onClick={openCreateExam}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              + สร้างห้องสอบใหม่
            </button>
          </div>

          <div className="space-y-3">
            {examsData?.exams?.map((e) => (
              <div
                key={e.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 transition-all shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-base">{e.title}</span>
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                        ⏱️ {e.duration_minutes} นาที
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {e.question_count} ข้อ (รวม {e.total_points} คะแนน)
                      </span>
                      {e.is_published ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          ✓ ประกาศคะแนนแล้ว
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          ยังไม่ประกาศคะแนน
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <p className="text-xs text-gray-500 mt-1">{e.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      ส่งข้อสอบแล้ว:{" "}
                      <strong className="text-gray-700">
                        {e.submission_count} / {e.student_count || 0}
                      </strong>{" "}
                      คน
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      to={`/teacher/exams/${e.id}/grade`}
                      className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
                    >
                      📝 ตรวจข้อสอบ & คะแนน →
                    </Link>

                    <button
                      onClick={() =>
                        examUpdateMutation.mutate({
                          id: e.id,
                          data: { is_open: !e.is_open },
                        })
                      }
                      title={e.is_open ? "คลิกเพื่อปิดห้องสอบ" : "คลิกเพื่อเปิดห้องสอบ"}
                      className="flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <div
                        className={`relative w-8 h-4 rounded-full transition-colors ${
                          e.is_open ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                            e.is_open ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </div>
                      <span className={e.is_open ? "text-green-600 font-medium" : "text-gray-400"}>
                        {e.is_open ? "เปิดสอบ" : "ปิดสอบ"}
                      </span>
                    </button>

                    <button
                      onClick={() => openEditExam(e)}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`แน่ใจหรือไม่ว่าจะลบห้องสอบ "${e.title}"?`)) {
                          examDeleteMutation.mutate(e.id);
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {examsData?.exams?.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                <p className="text-gray-400 text-sm">ยังไม่มีห้องสอบในวิชานี้</p>
                <button
                  onClick={openCreateExam}
                  className="mt-2 text-indigo-600 font-semibold text-xs hover:underline"
                >
                  คลิกที่นี่เพื่อสร้างห้องสอบแรก
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Create / Edit Exam */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full my-8 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  {editExam ? "แก้ไขห้องสอบ" : "สร้างห้องสอบใหม่"}
                </h3>
                <p className="text-xs text-gray-500">
                  กำหนดคำถาม ปรนัย (ช้อยส์) หรือ ข้อเขียนโค้ด Java
                </p>
              </div>
              <button
                onClick={() => setShowExamModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editExam) {
                  examUpdateMutation.mutate({
                    id: editExam.id,
                    data: {
                      title: examForm.title,
                      description: examForm.description,
                      duration_minutes: examForm.duration_minutes,
                      is_open: examForm.is_open,
                    },
                  });
                } else {
                  examCreateMutation.mutate(examForm);
                }
              }}
              className="flex-1 overflow-y-auto p-6 space-y-6"
            >
              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    ชื่อห้องสอบ *
                  </label>
                  <input
                    type="text"
                    required
                    value={examForm.title}
                    onChange={(e) =>
                      setExamForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="เช่น สอบกลางภาค: Java OOP & Data Structures"
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    เวลาในการสอบ (นาที) *
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    required
                    value={examForm.duration_minutes}
                    onChange={(e) =>
                      setExamForm((prev) => ({
                        ...prev,
                        duration_minutes: parseInt(e.target.value) || 60,
                      }))
                    }
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  คำอธิบายหรือคำชี้แจงการสอบ
                </label>
                <textarea
                  rows={2}
                  value={examForm.description}
                  onChange={(e) =>
                    setExamForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="เช่น ห้ามเปิดเอกสาร, เขียนโค้ดตามโจทย์ที่กำหนด..."
                  className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Anti-Cheat Settings */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2.5">
                <p className="text-xs font-bold text-gray-700">การตั้งค่าความปลอดภัย (Anti-Cheat Settings)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!examForm.allow_paste}
                      onChange={(e) =>
                        setExamForm((prev) => ({ ...prev, allow_paste: !e.target.checked }))
                      }
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700 font-medium">🚫 ไม่อนุญาตให้คัดลอก/วางโค้ด (Block Copy/Paste)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!examForm.require_fullscreen}
                      onChange={(e) =>
                        setExamForm((prev) => ({ ...prev, require_fullscreen: e.target.checked }))
                      }
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700 font-medium">🖥️ บังคับทำในโหมดเต็มจอ (Require Fullscreen)</span>
                  </label>
                </div>
              </div>

              {/* Questions Builder */}
              {!editExam && (
                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm">ข้อสอบทั้งหมด</h4>
                      <p className="text-xs text-gray-500">
                        รวม {examForm.questions.length} ข้อ | รวมคะแนนเต็ม{" "}
                        {examForm.questions.reduce((acc, q) => acc + (parseFloat(q.points) || 0), 0)}{" "}
                        คะแนน
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleAddQuestion("mcq")}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      >
                        + เพิ่มข้อช้อยส์ (MCQ)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuestion("coding")}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                      >
                        + เพิ่มข้อเขียนโค้ด Java ☕
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuestion("short_answer")}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      >
                        + เพิ่มข้อเขียนบรรยาย
                      </button>
                    </div>
                  </div>

                  {examForm.questions.map((q, idx) => (
                    <div
                      key={idx}
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white text-gray-700 border">
                            {q.question_type === "coding"
                              ? "☕ Java Coding"
                              : q.question_type === "mcq"
                                ? "Multiple Choice"
                                : "Short Answer"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">คะแนน:</span>
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={q.points}
                              onChange={(e) =>
                                handleUpdateQuestion(idx, "points", e.target.value)
                              }
                              className="w-16 text-xs border border-gray-300 rounded p-1 text-center bg-white"
                            />
                          </div>
                          {examForm.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(idx)}
                              className="text-xs text-red-500 hover:text-red-700 p-1"
                            >
                              ✕ ลบข้อนี้
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Question Prompt */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          คำถาม / โจทย์ *
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={q.prompt}
                          onChange={(e) =>
                            handleUpdateQuestion(idx, "prompt", e.target.value)
                          }
                          placeholder={
                            q.question_type === "coding"
                              ? "เช่น จงเขียนคลาส Student พร้อม getter/setter และเมธอด calculateGrade(int score)..."
                              : "พิมพ์คำถามที่นี่..."
                          }
                          className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Options for MCQ */}
                      {q.question_type === "mcq" && (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-semibold text-gray-600">
                            ตัวเลือก (คลิกวงกลมเพื่อระบุข้อที่ถูกต้อง):
                          </label>
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct_${idx}`}
                                checked={q.correct_option === String(oIdx + 1)}
                                onChange={() =>
                                  handleUpdateQuestion(idx, "correct_option", String(oIdx + 1))
                                }
                                title="เลือกข้อนี้เป็นคำตอบที่ถูกต้อง"
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <input
                                type="text"
                                required
                                value={opt}
                                onChange={(e) =>
                                  handleUpdateOption(idx, oIdx, e.target.value)
                                }
                                placeholder={`ตัวเลือกที่ ${oIdx + 1}`}
                                className="flex-1 text-xs border border-gray-300 rounded p-1.5 bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Starter Code for Java Coding */}
                      {q.question_type === "coding" && (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-semibold text-gray-600">
                            ☕ โค้ดตั้งต้นภาษา Java (Starter Code ให้นิสิต):
                          </label>
                          <textarea
                            rows={4}
                            value={q.starter_code}
                            onChange={(e) =>
                              handleUpdateQuestion(idx, "starter_code", e.target.value)
                            }
                            className="w-full font-mono text-xs bg-slate-900 text-slate-100 p-2.5 rounded-lg focus:outline-none"
                            placeholder="public class Solution {\n    // เขียนโค้ด Java ตรงนี้\n}"
                          />

                          <label className="block text-xs font-semibold text-gray-600">
                            เฉลย / คำแนะนำการตรวจสำหรับอาจารย์ (Solution Guide & Rubric):
                          </label>
                          <textarea
                            rows={2}
                            value={q.solution_guide}
                            onChange={(e) =>
                              handleUpdateQuestion(idx, "solution_guide", e.target.value)
                            }
                            placeholder="คำอธิบาย logic ที่ถูกต้อง (เน้นตรวจการทำงาน/ผลลัพธ์ของโค้ด ไม่หักคะแนนเรื่องรูปแบบหรือความสวยงาม)..."
                            className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
                          />
                        </div>
                      )}

                      {/* Guide for Short Answer */}
                      {q.question_type === "short_answer" && (
                        <div className="pt-1">
                          <label className="block text-xs font-semibold text-gray-600">
                            แนวคำตอบสำหรับอาจารย์ (Solution Guide):
                          </label>
                          <textarea
                            rows={2}
                            value={q.solution_guide}
                            onChange={(e) =>
                              handleUpdateQuestion(idx, "solution_guide", e.target.value)
                            }
                            placeholder="แนวคำตอบที่ถูกต้องสำหรับตรวจให้คะแนน..."
                            className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowExamModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={examCreateMutation.isPending || examUpdateMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {examCreateMutation.isPending || examUpdateMutation.isPending
                    ? "กำลังบันทึก..."
                    : editExam
                      ? "บันทึกการแก้ไข"
                      : "สร้างห้องสอบ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== ANNOUNCEMENTS TAB ===== */}
      {tab === "announcements" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">ประกาศประจำรายวิชา</h2>
              <p className="text-xs text-gray-500">
                แจ้งข่าวสาร กำหนดการสอบ หรือข้อมูลสำคัญให้นิสิตในวิชาทราบ
              </p>
            </div>
            <button
              onClick={() => setShowAnnounceForm(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              + สร้างประกาศใหม่
            </button>
          </div>

          {/* Announcement creation form modal */}
          {showAnnounceForm && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
                <h3 className="text-base font-bold text-gray-900">สร้างประกาศใหม่</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createAnnMut.mutate(announceForm);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      หัวข้อประกาศ *
                    </label>
                    <input
                      type="text"
                      required
                      value={announceForm.title}
                      onChange={(e) =>
                        setAnnounceForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="เช่น กำหนดการสอบกลางภาควิชา Java OOP"
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      เนื้อหาประกาศ *
                    </label>
                    <textarea
                      rows={5}
                      required
                      value={announceForm.content}
                      onChange={(e) =>
                        setAnnounceForm((prev) => ({ ...prev, content: e.target.value }))
                      }
                      placeholder="พิมพ์รายละเอียดประกาศ เช่น วันและเวลาสอบ ลิงก์ห้องสอบ กฎระเบียบ..."
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAnnounceForm(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={createAnnMut.isPending}
                      className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {createAnnMut.isPending ? "กำลังบันทึก..." : "โพสต์ประกาศ"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Announcements List */}
          <div className="space-y-3">
            {!annData?.announcements || annData.announcements.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                <span className="text-4xl block mb-2">📢</span>
                <p className="font-medium text-gray-600">ยังไม่มีประกาศในวิชานี้</p>
                <p className="text-xs text-gray-400 mt-1">กดปุ่ม "+ สร้างประกาศใหม่" ด้านบนเพื่อเริ่มแจ้งข่าวสารแก่นิสิต</p>
              </div>
            ) : (
              annData.announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{ann.title}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        โดย {ann.teacher_name} •{" "}
                        {new Date(ann.created_at).toLocaleString("th-TH")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("ต้องการลบประกาศนี้ใช่หรือไม่?")) {
                          deleteAnnMut.mutate(ann.id);
                        }
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                    >
                      ลบประกาศ
                    </button>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {ann.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== RUBRICS TAB ===== */}
      {tab === "rubrics" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={openCreateRubric}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
            >
              + สร้าง Rubric
            </button>
          </div>
          {showRubricForm && (
            <form
              onSubmit={handleRubricSubmit}
              className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4"
            >
              <h3 className="font-semibold text-gray-700">
                {editRubric
                  ? `แก้ไข Rubric: ${editRubric.name}`
                  : "สร้าง Rubric Template"}
              </h3>

              {!editRubric && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 space-y-2">
                  <label className="text-xs font-medium text-indigo-700">
                    ร่างเกณฑ์ด้วย AI — พิมพ์โจทย์/คำอธิบายงาน แล้วกดร่าง
                  </label>
                  <textarea
                    rows={2}
                    value={aiTask}
                    onChange={(e) => setAiTask(e.target.value)}
                    placeholder="เช่น: เขียนโปรแกรม Python คำนวณเกรดเฉลี่ยจากไฟล์ CSV พร้อม handle error"
                    className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-indigo-700">จำนวนเกณฑ์</label>
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
                      className="w-14 border border-indigo-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      disabled={
                        rubricGenMutation.isPending || aiTask.trim().length < 10
                      }
                      onClick={() =>
                        rubricGenMutation.mutate({
                          task: aiTask.trim(),
                          count: aiCount,
                        })
                      }
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {rubricGenMutation.isPending
                        ? "กำลังร่าง..."
                        : "ร่างด้วย AI"}
                    </button>
                    <span className="text-xs text-indigo-400">
                      ได้ร่างแล้วแก้ต่อได้ตามปกติ
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <input
                  required
                  placeholder="ชื่อ Rubric"
                  value={rubricForm.name}
                  onChange={(e) =>
                    setRubricForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <textarea
                  placeholder="คำอธิบาย"
                  value={rubricForm.description}
                  rows={1}
                  onChange={(e) =>
                    setRubricForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <label className="text-sm font-medium text-gray-600">
                    เกณฑ์การตรวจ
                  </label>
                  <button
                    type="button"
                    onClick={fillStandardLevels}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    เติมระดับมาตรฐาน (ดีมาก/ดี/พอใช้/ต้องปรับปรุง) ทุกเกณฑ์
                  </button>
                </div>
                {rubricForm.criteria.map((c, i) => (
                  <div
                    key={i}
                    className="border border-gray-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <input
                          required
                          placeholder={`เกณฑ์ที่ ${i + 1}`}
                          value={c.name}
                          onChange={(e) =>
                            updateCriteriaField(i, "name", e.target.value)
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <input
                          placeholder="คำอธิบาย"
                          value={c.description}
                          onChange={(e) =>
                            updateCriteriaField(
                              i,
                              "description",
                              e.target.value,
                            )
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <div className="flex gap-2 items-center">
                          <label className="text-xs text-gray-500">
                            คะแนนต่ำสุด
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={c.min_score ?? 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val))
                                updateCriteriaField(i, "min_score", val);
                            }}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <label className="text-xs text-gray-500">
                            คะแนนสูงสุด
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={c.max_score ?? 4}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val))
                                updateCriteriaField(i, "max_score", val);
                            }}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                      </div>
                      {rubricForm.criteria.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCriteria(i)}
                          className="text-red-400 hover:text-red-600 mt-1.5 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Levels toggle */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleLevels(i)}
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        {showLevels[i]
                          ? "− ซ่อนคำอธิบายระดับ"
                          : "+ กำหนดคำอธิบายแต่ละระดับ (ไม่บังคับ)"}
                      </button>
                      {showLevels[i] && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-gray-400">
                            ไม่กรอกก็ได้ — AI จะให้คะแนนตามช่วง{" "}
                            {c.min_score ?? 1}–{c.max_score ?? 4}{" "}
                            และคำอธิบายเกณฑ์
                          </p>
                          {c.levels?.map((lv) => (
                            <div
                              key={lv.score}
                              className="flex gap-2 items-center"
                            >
                              <span className="text-xs font-semibold w-8 shrink-0 text-center bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                {lv.score}
                              </span>
                              <input
                                placeholder="ชื่อระดับ"
                                value={lv.label}
                                onChange={(e) =>
                                  updateLevel(
                                    i,
                                    lv.score,
                                    "label",
                                    e.target.value,
                                  )
                                }
                                className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                  className="text-xs text-indigo-600 hover:underline text-left"
                >
                  + เพิ่มเกณฑ์
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={rubricPending}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {rubricPending
                    ? "กำลังบันทึก..."
                    : editRubric
                      ? "บันทึก"
                      : "สร้าง Rubric"}
                </button>
                <button
                  type="button"
                  onClick={resetRubricForm}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {rubricData?.rubrics?.map((r) => (
              <div
                key={r.id}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.criteria_count} เกณฑ์
                      {r.description && ` · ${r.description}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditRubric(r)}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-gray-100"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => handleDeleteRubric(r)}
                      disabled={rubricDeleteMutation.isPending}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {rubricData?.rubrics?.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">
                ยังไม่มี Rubric
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== STATS TAB ===== */}
      {tab === "stats" && (
        <div>
          {!statsData ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : (
            <div className="space-y-6">
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    label: "งานทั้งหมด",
                    value: statsData.overview.total_assignments,
                    color: "text-gray-700",
                  },
                  {
                    label: "ส่งงานแล้ว",
                    value: statsData.overview.total_submissions,
                    color: "text-indigo-600",
                  },
                  {
                    label: "ตรวจแล้ว",
                    value: statsData.overview.graded_count,
                    color: "text-blue-600",
                  },
                  {
                    label: "อนุมัติแล้ว",
                    value: statsData.overview.approved_count,
                    color: "text-green-600",
                  },
                  {
                    label: "รอตรวจ",
                    value: statsData.overview.pending_count,
                    color: "text-yellow-600",
                  },
                  {
                    label: "คะแนนเฉลี่ย",
                    value:
                      statsData.overview.avg_level != null
                        ? `${statsData.overview.avg_level}/${statsData.overview.max_level ?? 4}`
                        : "—",
                    color: "text-purple-600",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center"
                  >
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Grade Distribution */}
              {statsData.overview.graded_count > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-700 mb-4">
                    Grade Distribution
                  </h3>
                  <div className="space-y-2">
                    {[
                      { grade: "A", label: "A (≥80%)", color: "bg-green-500" },
                      { grade: "B", label: "B (70–79%)", color: "bg-blue-500" },
                      {
                        grade: "C",
                        label: "C (60–69%)",
                        color: "bg-yellow-500",
                      },
                      {
                        grade: "D",
                        label: "D (50–59%)",
                        color: "bg-orange-500",
                      },
                      { grade: "F", label: "F (<50%)", color: "bg-red-500" },
                    ].map(({ grade, label, color }) => {
                      const count = statsData.distribution[grade] || 0;
                      const total = statsData.overview.graded_count;
                      const pct =
                        total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={grade} className="flex items-center gap-3">
                          <span className="w-20 text-sm text-gray-600 shrink-0">
                            {label}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                            <div
                              className={`h-full ${color} rounded-full transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-16 text-xs text-gray-500 text-right">
                            {count} คน ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-assignment table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700">
                    รายละเอียดต่องาน
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-5 py-2.5 text-left">ชื่องาน</th>
                        <th className="px-4 py-2.5 text-center">ส่งแล้ว</th>
                        <th className="px-4 py-2.5 text-center">ตรวจแล้ว</th>
                        <th className="px-4 py-2.5 text-center">อนุมัติ</th>
                        <th className="px-4 py-2.5 text-center">รอตรวจ</th>
                        <th className="px-4 py-2.5 text-center">avg level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statsData.assignments.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <a
                              href={`/teacher/assignments/${a.id}`}
                              className="font-medium text-indigo-600 hover:underline"
                            >
                              {a.title}
                            </a>
                            {a.deadline && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                กำหนดส่ง:{" "}
                                {new Date(a.deadline).toLocaleDateString(
                                  "th-TH",
                                )}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {a.submission_count}
                          </td>
                          <td className="px-4 py-3 text-center text-blue-600">
                            {a.graded_count}
                          </td>
                          <td className="px-4 py-3 text-center text-green-600">
                            {a.approved_count}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {a.pending_count > 0 ? (
                              <span className="text-yellow-600 font-medium">
                                {a.pending_count}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-gray-700">
                            {a.avg_level != null ? `${a.avg_level}/${a.max_level ?? 4}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {statsData.assignments.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">
                      ยังไม่มีงาน
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== STUDENTS TAB ===== */}
      {tab === "students" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              นิสิตในวิชานี้ ({studentsData?.students?.length || 0} คน)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => handleExportStudents("xls")}
                className="text-sm border border-emerald-300 text-emerald-700 bg-white px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-1 font-medium shadow-sm"
              >
                📊 Export Excel
              </button>
              <button
                onClick={() => handleExportStudents("csv")}
                className="text-sm border border-gray-300 text-gray-600 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-colors flex items-center gap-1 shadow-sm"
              >
                📄 Export CSV
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                + Import นิสิต
              </button>
              {studentsData?.students?.length > 0 && (
                <button
                  onClick={handleRemoveAll}
                  disabled={removeAllMutation.isPending}
                  className="text-sm border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  ลบทั้งหมด
                </button>
              )}
            </div>
          </div>
          {!studentsData ? (
            <p className="text-gray-400 text-center py-8">กำลังโหลด...</p>
          ) : studentsData.students?.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-base">ยังไม่มีนิสิต</p>
              <p className="text-sm mt-1">
                แชร์รหัสวิชาด้านล่างให้นิสิตใช้เข้าร่วม
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[60px_120px_1fr_80px_80px_60px] px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>กลุ่ม</span>
                <span>รหัสนิสิต</span>
                <span>ชื่อ</span>
                <span>วันที่เข้าร่วม</span>
                <span></span>
                <span></span>
              </div>
              {studentsData.students.map((s, i) => (
                <div
                  key={s.id}
                  className={`grid grid-cols-[60px_120px_1fr_80px_80px_60px] px-5 py-1.5 items-center text-sm ${i !== 0 ? "border-t border-gray-100" : ""}`}
                >
                  {editingGroupId === s.id ? (
                    <input
                      autoFocus
                      value={editingGroupVal}
                      onChange={(e) => setEditingGroupVal(e.target.value)}
                      onBlur={() => saveGroup(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveGroup(s.id);
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      className="w-12 border border-indigo-300 rounded-lg px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <span
                      onClick={() => {
                        setEditingGroupId(s.id);
                        setEditingGroupVal(s.group_no || "");
                      }}
                      className="text-gray-500 cursor-pointer hover:text-indigo-600 hover:underline"
                      title="คลิกเพื่อแก้ไขกลุ่ม"
                    >
                      {s.group_no || "—"}
                    </span>
                  )}
                  <span className="text-gray-600 text-sm">{s.username}</span>
                  <span className="text-gray-800">{s.name}</span>
                  <span className="text-gray-400 text-xs">
                    {new Date(s.enrolled_at).toLocaleDateString("th-TH")}
                  </span>
                  <button
                    onClick={() => handleResetPassword(s)}
                    disabled={resetPasswordMutation.isPending}
                    className="text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    รีเซ็ต pwd
                  </button>
                  <button
                    onClick={() => handleRemoveStudent(s)}
                    disabled={removeStudentMutation.isPending}
                    className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3">
            <div>
              <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-0.5">
                รหัสเข้าร่วมวิชา
              </p>
              <p className="font-mono font-bold text-indigo-600 text-2xl tracking-widest">
                {courseData?.course?.join_code || "—"}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  courseData?.course?.join_code || "",
                );
              }}
              className="text-xs text-indigo-600 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
            >
              คัดลอก
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">รับนิสิตใหม่</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {courseData?.course?.enrollment_open
                  ? "เปิดรับ — นิสิตใช้รหัสวิชาเข้าร่วมได้"
                  : "ปิดรับ — นิสิตใหม่ไม่สามารถเข้าร่วมได้"}
              </p>
            </div>
            <button
              onClick={() =>
                enrollToggleMutation.mutate(
                  !courseData?.course?.enrollment_open,
                )
              }
              disabled={enrollToggleMutation.isPending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${courseData?.course?.enrollment_open ? "bg-indigo-600" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${courseData?.course?.enrollment_open ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>
        </div>
      )}

      {/* ===== IMPORT PANEL ===== */}
      {showImport && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30" onClick={closeImport} />
          {/* Panel */}
          <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Import นิสิต</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  กลุ่ม,รหัสนิสิต,ชื่อนามสกุล
                </p>
              </div>
              <button
                onClick={closeImport}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6 pt-3 gap-4">
              {[
                ["text", "วางข้อความ"],
                ["file", "อัปโหลดไฟล์"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setImportTab(key);
                    setImportCsv("");
                    setImportResult(null);
                  }}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${importTab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {!importResult ? (
                <>
                  {importTab === "text" ? (
                    <textarea
                      value={importCsv}
                      onChange={(e) => setImportCsv(e.target.value)}
                      placeholder={
                        "1,6701001,สมชาย ใจดี\n1,6701002,สมหญิง รักเรียน\n2,6701003,มานะ ขยัน"
                      }
                      rows={12}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                      <p className="text-sm text-gray-500 mb-3">
                        เลือกไฟล์ .csv
                      </p>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) =>
                            setImportCsv(ev.target.result);
                          reader.readAsText(file, "UTF-8");
                        }}
                        className="text-sm text-indigo-600"
                      />
                      {importCsv && (
                        <p className="text-xs text-green-600 mt-3">
                          โหลดไฟล์แล้ว (
                          {importCsv.split("\n").filter(Boolean).length} แถว)
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    Password default = รหัสนิสิต (นิสิตเปลี่ยนได้ภายหลัง)
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      [
                        "สร้างใหม่",
                        importResult.created,
                        "bg-green-50 text-green-700",
                      ],
                      [
                        "Enroll",
                        importResult.enrolled,
                        "bg-indigo-50 text-indigo-700",
                      ],
                      [
                        "ซ้ำ/ข้าม",
                        importResult.skipped,
                        "bg-gray-50 text-gray-600",
                      ],
                    ].map(([label, val, cls]) => (
                      <div
                        key={label}
                        className={`rounded-xl p-3 text-center ${cls}`}
                      >
                        <p className="text-2xl font-bold">{val}</p>
                        <p className="text-xs mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-red-600 mb-2">
                        Error ({importResult.errors.length} แถว)
                      </p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {importResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-500">
                            {e.line} — {e.reason}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setImportResult(null)}
                    className="w-full text-sm text-indigo-600 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50"
                  >
                    Import เพิ่มเติม
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {!importResult && (
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={handleImport}
                  disabled={!importCsv.trim() || importMutation.isPending}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {importMutation.isPending ? "กำลัง Import..." : "Import"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Grades Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Export คะแนน
            </h2>

            <div className="space-y-3 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                1. เลือกโหมดคะแนน
              </p>
              {[
                {
                  value: "latest",
                  label: "คะแนนล่าสุด",
                  desc: "ใช้คะแนนจากการส่งครั้งล่าสุด — เหมาะสำหรับ final submission",
                },
                {
                  value: "best",
                  label: "คะแนนมากที่สุด",
                  desc: "ใช้คะแนนสูงสุดจากทุกครั้งที่ส่ง",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${exportMode === opt.value ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value={opt.value}
                    checked={exportMode === opt.value}
                    onChange={() => setExportMode(opt.value)}
                    className="mt-0.5 accent-indigo-600 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                2. เลือกรูปแบบไฟล์
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat("xls")}
                  className={`p-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                    exportFormat === "xls"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>📊</span>
                  <span>Excel (.xls)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat("csv")}
                  className={`p-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                    exportFormat === "csv"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-200"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>📄</span>
                  <span>CSV (.csv)</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExportGrades}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Export
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-200"
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
