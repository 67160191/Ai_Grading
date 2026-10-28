import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import {
  getExamSubmissions,
  getExamSubmission,
  gradeExamSubmission,
  publishExam,
  aiGradeJava,
  exportExamResults,
} from "../../api/exams";

export default function ExamGradingPage() {
  const { examId } = useParams();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [selectedSubId, setSelectedSubId] = useState(null);
  const [gradeForm, setGradeForm] = useState({
    answers: [],
    overall_feedback: "",
  });
  const [loadingAiQId, setLoadingAiQId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["exam-submissions", examId],
    queryFn: () => getExamSubmissions(examId),
  });

  const { data: subDetailData, isLoading: subDetailLoading } = useQuery({
    queryKey: ["exam-submission-detail", selectedSubId],
    queryFn: () => getExamSubmission(selectedSubId),
    enabled: !!selectedSubId,
  });

  const gradeMut = useMutation({
    mutationFn: (payload) => gradeExamSubmission(selectedSubId, payload),
    onSuccess: () => {
      showToast("บันทึกผลการตรวจเรียบร้อยแล้ว", "success");
      qc.invalidateQueries({ queryKey: ["exam-submissions", examId] });
      qc.invalidateQueries({ queryKey: ["exam-submission-detail", selectedSubId] });
      setSelectedSubId(null);
    },
    onError: (err) => {
      showToast(err.response?.data?.error || "เกิดข้อผิดพลาดในการบันทึก", "error");
    },
  });

  const publishMut = useMutation({
    mutationFn: (isPub) => publishExam(examId, isPub),
    onSuccess: (res) => {
      showToast(res.message, "success");
      qc.invalidateQueries({ queryKey: ["exam-submissions", examId] });
    },
    onError: (err) => {
      showToast(err.response?.data?.error || "ไม่สามารถเปลี่ยนสถานะประกาศคะแนนได้", "error");
    },
  });

  const handleOpenGradeModal = (subId) => {
    setSelectedSubId(subId);
  };

  // Sync subDetailData into local gradeForm when modal opens
  const syncGradeForm = () => {
    if (!subDetailData) return;
    const initialAnswers = subDetailData.questions.map((q) => ({
      question_id: q.id,
      manual_score: q.manual_score != null ? q.manual_score : q.auto_score,
      feedback: q.feedback || "",
    }));
    setGradeForm({
      answers: initialAnswers,
      overall_feedback: subDetailData.submission.overall_feedback || "",
    });
  };

  const handleScoreChange = (qId, val) => {
    setGradeForm((prev) => ({
      ...prev,
      answers: prev.answers.map((a) =>
        a.question_id === qId ? { ...a, manual_score: val } : a,
      ),
    }));
  };

  const handleFeedbackChange = (qId, val) => {
    setGradeForm((prev) => ({
      ...prev,
      answers: prev.answers.map((a) =>
        a.question_id === qId ? { ...a, feedback: val } : a,
      ),
    }));
  };

  const handleAiGrade = async (qId) => {
    setLoadingAiQId(qId);
    try {
      const result = await aiGradeJava(selectedSubId, qId);
      if (result.suggested_score !== undefined) {
        handleScoreChange(qId, result.suggested_score);
      }
      if (result.feedback) {
        const fullFb = result.compilation_status
          ? `[สถานะ: ${result.compilation_status}]\n${result.feedback}`
          : result.feedback;
        handleFeedbackChange(qId, fullFb);
      }
      showToast("AI ประเมินโค้ด Java และกรอกคะแนนแนะนำให้แล้ว", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "AI ตรวจไม่สำเร็จ", "error");
    } finally {
      setLoadingAiQId(null);
    }
  };

  const handleSaveGrade = (e) => {
    e.preventDefault();
    gradeMut.mutate(gradeForm);
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-500">กำลังโหลดข้อมูลห้องสอบ...</div>;
  }

  const { exam, course, students, stats } = data || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          to={`/teacher/courses/${exam?.course_id}`}
          className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mb-2"
        >
          ← กลับไปยังวิชา {course?.name}
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                ห้องสอบ Programming
              </span>
              <span className="text-xs text-gray-500">
                เวลาสอบ {exam?.duration_minutes} นาที
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{exam?.title}</h1>
            {exam?.description && (
              <p className="text-sm text-gray-500 mt-0.5">{exam.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                exportExamResults(
                  examId,
                  `${exam?.title}_results.xls`,
                  "xls",
                )
              }
              className="px-3 py-2 rounded-lg text-sm font-medium border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              📊 Export Excel
            </button>
            <button
              onClick={() =>
                exportExamResults(
                  examId,
                  `${exam?.title}_results.csv`,
                  "csv",
                )
              }
              className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              📄 Export CSV
            </button>
            <button
              onClick={() => publishMut.mutate(!exam?.is_published)}
              disabled={publishMut.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                exam?.is_published
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {exam?.is_published ? "✓ ประกาศคะแนนแล้ว (คลิกเพื่อปิด)" : "📢 ประกาศผลคะแนนให้นิสิต"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">นิสิตทั้งหมด</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{stats?.total_students || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">ส่งข้อสอบแล้ว</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{stats?.submitted_count || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">ตรวจเสร็จแล้ว</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats?.graded_count || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">คะแนนเฉลี่ย</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {stats?.avg_score != null ? `${stats.avg_score} คะแนน` : "-"}
          </p>
        </div>
      </div>

      {/* Students Submissions Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">รายชื่อนิสิตและสถานะการสอบ</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3">กลุ่ม</th>
                <th className="px-5 py-3">รหัสนิสิต</th>
                <th className="px-5 py-3">ชื่อ-นามสกุล</th>
                <th className="px-5 py-3">สถานะ</th>
                <th className="px-5 py-3">สลับแท็บ / หน้าจอ</th>
                <th className="px-5 py-3">คะแนน</th>
                <th className="px-5 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                    ยังไม่มีนิสิตลงทะเบียนในวิชานี้
                  </td>
                </tr>
              ) : (
                students?.map((s) => {
                  const hasSub = !!s.submission_id;
                  const isGraded = s.status === "graded";
                  const isSubmitted = s.status === "submitted";
                  const inProgress = s.status === "in_progress";

                  return (
                    <tr key={s.student_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-700">
                        {s.group_no || "-"}
                      </td>
                      <td className="px-5 py-3 font-mono">{s.student_username}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">{s.student_name}</td>
                      <td className="px-5 py-3">
                        {!hasSub ? (
                          <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full">
                            ยังไม่เข้าสอบ
                          </span>
                        ) : inProgress ? (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full animate-pulse">
                            กำลังทำข้อสอบ...
                          </span>
                        ) : isSubmitted ? (
                          <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium">
                            ส่งแล้ว (รอตรวจ)
                          </span>
                        ) : isGraded ? (
                          <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">
                            ✓ ตรวจแล้ว
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        {hasSub ? (
                          s.tab_switch_count > 0 ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs px-2 py-0.5 rounded-md font-medium">
                              ⚠️ สลับแท็บ {s.tab_switch_count} ครั้ง
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">ปกติ (0 ครั้ง)</span>
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold">
                        {s.score != null ? (
                          <span className="text-indigo-600">
                            {s.score} <span className="text-xs text-gray-400">/ {s.max_score}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {hasSub && !inProgress ? (
                          <button
                            onClick={() => handleOpenGradeModal(s.submission_id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            {isGraded ? "ดู / แก้ไขผลตรวจ" : "📝 ตรวจข้อสอบ"}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grade Modal */}
      {selectedSubId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full my-8 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  ตรวจข้อสอบ: {subDetailData?.submission?.student_name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  รหัส: {subDetailData?.submission?.student_username} | กลุ่ม:{" "}
                  {subDetailData?.submission?.group_no || "-"} | ส่งเมื่อ:{" "}
                  {subDetailData?.submission?.submitted_at
                    ? new Date(subDetailData.submission.submitted_at).toLocaleString("th-TH")
                    : "-"}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubId(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div
              className="p-6 overflow-y-auto space-y-6 flex-1"
              ref={() => {
                if (subDetailData && gradeForm.answers.length === 0) {
                  syncGradeForm();
                }
              }}
            >
              {subDetailLoading ? (
                <p className="text-center py-10 text-gray-400">กำลังโหลดคำตอบ...</p>
              ) : (
                subDetailData?.questions?.map((q, idx) => {
                  const currentAnsState = gradeForm.answers.find(
                    (a) => a.question_id === q.id,
                  );
                  const isMcq = q.question_type === "mcq";
                  const isCoding = q.question_type === "coding";

                  return (
                    <div
                      key={q.id}
                      className="border border-gray-200 rounded-xl p-5 bg-white space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-600 uppercase">
                            {isCoding ? "Java Coding" : isMcq ? "Multiple Choice" : "Short Answer"}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-500">
                          เต็ม {q.points} คะแนน
                        </span>
                      </div>

                      {/* Prompt */}
                      <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">
                        {q.prompt}
                      </p>

                      {/* Student's Answer */}
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-500 mb-1">คำตอบของนิสิต:</p>

                        {isMcq ? (
                          <div className="space-y-1.5">
                            {q.options?.map((opt, oIdx) => {
                              const optVal = typeof opt === "string" ? opt : opt.text;
                              const optId = typeof opt === "string" ? String(oIdx + 1) : opt.id || String(oIdx + 1);
                              const isSelected = q.student_answer === optId || q.student_answer === optVal;
                              const isCorrect = q.correct_option === optId || q.correct_option === optVal;

                              let bgClass = "bg-gray-50 border-gray-200 text-gray-700";
                              if (isSelected && isCorrect) {
                                bgClass = "bg-green-50 border-green-300 text-green-800 font-medium";
                              } else if (isSelected && !isCorrect) {
                                bgClass = "bg-red-50 border-red-300 text-red-800 font-medium";
                              } else if (!isSelected && isCorrect) {
                                bgClass = "bg-green-50/50 border-green-200 text-green-700 border-dashed";
                              }

                              return (
                                <div
                                  key={oIdx}
                                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${bgClass}`}
                                >
                                  <span>{optVal}</span>
                                  {isSelected && (
                                    <span className="text-xs font-bold">
                                      {isCorrect ? "✓ นิสิตเลือก (ถูกต้อง)" : "✗ นิสิตเลือก (ผิด)"}
                                    </span>
                                  )}
                                  {!isSelected && isCorrect && (
                                    <span className="text-xs text-green-600 font-medium">
                                      ★ คำตอบที่ถูกต้อง
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : isCoding ? (
                          <div className="space-y-2">
                            <div className="rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100 overflow-x-auto border border-slate-700">
                              <pre className="whitespace-pre">
                                {q.student_answer || "(ไม่ได้เขียนโค้ด)"}
                              </pre>
                            </div>

                            {q.solution_guide && (
                              <details className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded border border-gray-200">
                                <summary className="cursor-pointer font-medium text-indigo-600">
                                  ดูเฉลย / คำแนะนำการตรวจสำหรับข้อนี้
                                </summary>
                                <p className="mt-2 whitespace-pre-wrap text-gray-700">
                                  {q.solution_guide}
                                </p>
                              </details>
                            )}

                            {/* AI Helper Button */}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleAiGrade(q.id)}
                                disabled={loadingAiQId === q.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                              >
                                {loadingAiQId === q.id ? (
                                  <>
                                    <span className="animate-spin">🌀</span> AI กำลังวิเคราะห์โค้ด Java...
                                  </>
                                ) : (
                                  <>
                                    <span>🤖</span> ให้ AI ตรวจ Java เบื้องต้น
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-800 whitespace-pre-wrap">
                            {q.student_answer || "(ไม่มีคำตอบ)"}
                          </div>
                        )}
                      </div>

                      {/* Teacher Grading Inputs for this question */}
                      <div className="pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            คะแนนที่ให้ (เต็ม {q.points}):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={q.points}
                            value={currentAnsState?.manual_score ?? ""}
                            onChange={(e) => handleScoreChange(q.id, e.target.value)}
                            className="w-full text-sm font-semibold border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Feedback / ข้อเสนอแนะในข้อนี้:
                          </label>
                          <textarea
                            rows={2}
                            value={currentAnsState?.feedback || ""}
                            onChange={(e) => handleFeedbackChange(q.id, e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="เน้นตรวจความถูกต้องของ Logic / การทำงานของโค้ด ไม่หักคะแนนเรื่องรูปแบบหรือความสวยงาม"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Overall Feedback */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-2">
                <label className="block text-sm font-bold text-gray-800">
                  ข้อเสนอแนะภาพรวม (Overall Feedback ให้นิสิต):
                </label>
                <textarea
                  rows={3}
                  value={gradeForm.overall_feedback}
                  onChange={(e) =>
                    setGradeForm((prev) => ({ ...prev, overall_feedback: e.target.value }))
                  }
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  placeholder="เขียนสรุปภาพรวมการทำข้อสอบของนิสิตคนนี้ เช่น ทำได้ดีมาก หรือควรทบทวนเรื่อง Array และ OOP..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setSelectedSubId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveGrade}
                disabled={gradeMut.isPending}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {gradeMut.isPending ? "กำลังบันทึก..." : "✓ บันทึกผลการตรวจ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

