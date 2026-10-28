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
  batchAiGrade,
  getExamSimilarity,
  testCaseGrade,
  batchTestCaseGrade,
} from "../../api/exams";
import CodeEditor from "../../components/CodeEditor";

export default function ExamGradingPage() {
  const { examId } = useParams();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [selectedSubId, setSelectedSubId] = useState(null);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);
  const [isBatchGrading, setIsBatchGrading] = useState(false);
  const [isBatchTcGrading, setIsBatchTcGrading] = useState(false);

  const [gradeForm, setGradeForm] = useState({
    answers: [],
    overall_feedback: "",
  });
  const [loadingAiQId, setLoadingAiQId] = useState(null);
  const [loadingTcQId, setLoadingTcQId] = useState(null);
  const [tcResultsMap, setTcResultsMap] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ["exam-submissions", examId],
    queryFn: () => getExamSubmissions(examId),
  });

  const { data: subDetailData, isLoading: subDetailLoading } = useQuery({
    queryKey: ["exam-submission-detail", selectedSubId],
    queryFn: () => getExamSubmission(selectedSubId),
    enabled: !!selectedSubId,
  });

  const { data: similarityData, isLoading: similarityLoading, refetch: refetchSimilarity } = useQuery({
    queryKey: ["exam-similarity", examId],
    queryFn: () => getExamSimilarity(examId),
    enabled: showSimilarityModal,
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

  const batchMut = useMutation({
    mutationFn: () => batchAiGrade(examId),
    onMutate: () => setIsBatchGrading(true),
    onSuccess: (res) => {
      setIsBatchGrading(false);
      showToast(res.message, "success");
      qc.invalidateQueries({ queryKey: ["exam-submissions", examId] });
    },
    onError: (err) => {
      setIsBatchGrading(false);
      showToast(err.response?.data?.error || "เกิดข้อผิดพลาดในการตรวจอัตโนมัติ", "error");
    },
  });

  const batchTcMut = useMutation({
    mutationFn: () => batchTestCaseGrade(examId),
    onMutate: () => setIsBatchTcGrading(true),
    onSuccess: (res) => {
      setIsBatchTcGrading(false);
      showToast(res.message, "success");
      qc.invalidateQueries({ queryKey: ["exam-submissions", examId] });
    },
    onError: (err) => {
      setIsBatchTcGrading(false);
      showToast(err.response?.data?.error || "เกิดข้อผิดพลาดในการตรวจด้วย Test Cases", "error");
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

  const handleTestCaseGrade = async (qId) => {
    setLoadingTcQId(qId);
    try {
      const result = await testCaseGrade(selectedSubId, qId);
      if (result.score !== undefined) {
        handleScoreChange(qId, result.score);
      }
      if (result.feedback) {
        handleFeedbackChange(qId, result.feedback);
      }
      setTcResultsMap((prev) => ({ ...prev, [qId]: result.results }));
      if (result.allPassed) {
        showToast("🎉 ผ่านทุก Test Cases (คะแนนเต็ม)", "success");
      } else {
        showToast(result.feedback, "info");
      }
    } catch (err) {
      showToast(err.response?.data?.error || "ตรวจ Test Cases ไม่สำเร็จ", "error");
    } finally {
      setLoadingTcQId(null);
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

  // Score distribution statistics
  const scoredStudents = (students || []).filter((s) => s.score != null);
  const scoresList = scoredStudents.map((s) => s.score).sort((a, b) => a - b);
  const minScore = scoresList.length ? scoresList[0] : null;
  const maxScore = scoresList.length ? scoresList[scoresList.length - 1] : null;
  const medianScore = scoresList.length
    ? scoresList.length % 2 === 0
      ? ((scoresList[scoresList.length / 2 - 1] + scoresList[scoresList.length / 2]) / 2).toFixed(1)
      : scoresList[Math.floor(scoresList.length / 2)].toFixed(1)
    : null;
  const passCount = scoredStudents.filter((s) => s.score >= (s.max_score || 0) * 0.5).length;
  const passRate = scoredStudents.length ? Math.round((passCount / scoredStudents.length) * 100) : null;

  // 5 bins histogram: 0-20%, 21-40%, 41-60%, 61-80%, 81-100%
  const bins = [
    { label: "0-20%", count: 0, color: "bg-rose-400" },
    { label: "21-40%", count: 0, color: "bg-orange-400" },
    { label: "41-60%", count: 0, color: "bg-amber-400" },
    { label: "61-80%", count: 0, color: "bg-sky-400" },
    { label: "81-100%", count: 0, color: "bg-emerald-500" },
  ];
  scoredStudents.forEach((s) => {
    const pct = s.max_score ? (s.score / s.max_score) * 100 : 0;
    if (pct <= 20) bins[0].count++;
    else if (pct <= 40) bins[1].count++;
    else if (pct <= 60) bins[2].count++;
    else if (pct <= 80) bins[3].count++;
    else bins[4].count++;
  });
  const maxBinCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
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
              {exam?.allow_paste === 0 && (
                <span className="bg-rose-100 text-rose-700 text-[11px] px-2 py-0.5 rounded font-medium">
                  ห้าม Paste โค้ด
                </span>
              )}
              {exam?.require_fullscreen === 1 && (
                <span className="bg-purple-100 text-purple-700 text-[11px] px-2 py-0.5 rounded font-medium">
                  บังคับเต็มจอ
                </span>
              )}
              {exam?.shuffle_questions === 1 && (
                <span className="bg-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5 rounded font-medium">
                  สลับลำดับข้อ
                </span>
              )}
              {exam?.shuffle_options === 1 && (
                <span className="bg-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5 rounded font-medium">
                  สลับช้อยส์
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{exam?.title}</h1>
            {exam?.description && (
              <p className="text-sm text-gray-500 mt-0.5">{exam.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch AI Grading Button */}
            <button
              onClick={() => {
                if (confirm("ต้องการให้ AI ช่วยตรวจข้อสอบทั้งหมดของนิสิตที่ส่งแล้วใช่หรือไม่?")) {
                  batchMut.mutate();
                }
              }}
              disabled={isBatchGrading}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {isBatchGrading ? (
                <>
                  <span className="animate-spin inline-block">⏳</span>
                  <span>AI กำลังตรวจทั้งห้อง...</span>
                </>
              ) : (
                <>
                  <span>🤖</span>
                  <span>ตรวจด้วย AI ทั้งห้อง</span>
                </>
              )}
            </button>

            {/* Batch Test Cases Grading Button */}
            <button
              onClick={() => {
                if (confirm("ต้องการรันตรวจข้อเขียนโค้ดด้วย Test Cases ทั้งห้องสำหรับนิสิตทุกคนที่ส่งแล้วใช่หรือไม่?")) {
                  batchTcMut.mutate();
                }
              }}
              disabled={isBatchTcGrading}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {isBatchTcGrading ? (
                <>
                  <span className="animate-spin inline-block">⏳</span>
                  <span>กำลังรัน Test Cases...</span>
                </>
              ) : (
                <>
                  <span>🧪</span>
                  <span>ตรวจด้วย Test Cases ทั้งห้อง</span>
                </>
              )}
            </button>

            {/* Plagiarism Similarity Button */}
            <button
              onClick={() => {
                setShowSimilarityModal(true);
                refetchSimilarity();
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-purple-300 text-purple-700 bg-white hover:bg-purple-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              🔍 ตรวจการลอกโค้ด
            </button>

            {/* Export Buttons */}
            <button
              onClick={() =>
                exportExamResults(examId, `${exam?.title}_results.xls`, "xls")
              }
              className="px-3 py-2 rounded-lg text-sm font-medium border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              📊 Export Excel
            </button>
            <button
              onClick={() =>
                exportExamResults(examId, `${exam?.title}_results.csv`, "csv")
              }
              className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              📄 Export CSV
            </button>

            {/* Publish Scores */}
            <button
              onClick={() => publishMut.mutate(!exam?.is_published)}
              disabled={publishMut.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                exam?.is_published
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {exam?.is_published ? "✓ ประกาศคะแนนแล้ว" : "📢 ประกาศผลคะแนน"}
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
          <p className="text-xs text-gray-500">คะแนนเฉลี่ย (Mean)</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {stats?.avg_score != null ? `${stats.avg_score} คะแนน` : "-"}
          </p>
        </div>
      </div>

      {/* Score Analytics & Distribution Section */}
      {scoredStudents.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
              <span>📈</span>
              <span>สถิติและการกระจายตัวของคะแนน (Score Analytics)</span>
            </h3>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>ต่ำสุด: <strong className="text-rose-600">{minScore ?? "-"}</strong></span>
              <span>สูงสุด: <strong className="text-emerald-600">{maxScore ?? "-"}</strong></span>
              <span>มัธยฐาน (Median): <strong className="text-indigo-600">{medianScore ?? "-"}</strong></span>
              <span>ผ่านเกณฑ์ (≥50%): <strong className="text-green-700">{passRate != null ? `${passRate}% (${passCount} คน)` : "-"}</strong></span>
            </div>
          </div>

          {/* Histogram Bars */}
          <div className="space-y-2 pt-1">
            <p className="text-xs text-gray-500 font-medium">การกระจายตัวของคะแนน (% จากคะแนนเต็ม):</p>
            <div className="grid grid-cols-5 gap-3 pt-2">
              {bins.map((b, idx) => {
                const heightPct = Math.round((b.count / maxBinCount) * 100);
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-700">{b.count} คน</span>
                    <div className="w-full bg-gray-100 h-20 rounded-lg flex items-end p-1">
                      <div
                        className={`w-full ${b.color} rounded transition-all duration-500`}
                        style={{ height: `${Math.max(heightPct, 6)}%` }}
                      ></div>
                    </div>
                    <span className="text-[11px] text-gray-500 font-medium">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                <th className="px-5 py-3">สลับแท็บ / ความปลอดภัย</th>
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
                          <div className="space-y-0.5">
                            {s.tab_switch_count > 0 ? (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-xs px-2 py-0.5 rounded-md font-medium">
                                ⚠️ สลับแท็บ {s.tab_switch_count} ครั้ง
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-600 font-medium">✓ ปกติ (0 ครั้ง)</span>
                            )}
                            {s.ip_address && (
                              <p className="text-[10px] text-gray-400 font-mono">IP: {s.ip_address}</p>
                            )}
                          </div>
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

      {/* Grade Individual Student Modal */}
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
              {/* Anti-cheat banner inside modal */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span>🌐</span>
                  <span>IP Address: </span>
                  <strong className="font-mono">{subDetailData?.submission?.ip_address || "ไม่ระบุ"}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span>🖥️</span>
                  <span>สลับหน้าจอ/แท็บ: </span>
                  <strong className={subDetailData?.submission?.tab_switch_count > 0 ? "text-rose-600" : "text-emerald-600"}>
                    {subDetailData?.submission?.tab_switch_count || 0} ครั้ง
                  </strong>
                </div>
              </div>

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
                            <CodeEditor
                              readOnly={true}
                              value={q.student_answer || "(ไม่ได้เขียนโค้ด)"}
                              minHeight="200px"
                            />

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

                            {/* Test Cases Results Breakdown if available */}
                            {(tcResultsMap[q.id] || q.test_case_results) && (
                              <div className="bg-slate-900 text-slate-100 p-3 rounded-xl space-y-2 text-xs">
                                <div className="font-semibold text-slate-300 flex items-center justify-between border-b border-slate-800 pb-1.5">
                                  <span>🧪 ผลการทดสอบ Test Cases:</span>
                                  <span className="text-[11px] text-slate-400">
                                    {(tcResultsMap[q.id] || JSON.parse(q.test_case_results || "[]")).filter((t) => t.passed).length}/
                                    {(tcResultsMap[q.id] || JSON.parse(q.test_case_results || "[]")).length} Passed
                                  </span>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {(tcResultsMap[q.id] || JSON.parse(q.test_case_results || "[]")).map((tc, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className={`p-2 rounded flex items-center justify-between text-[11px] font-mono ${
                                        tc.passed ? "bg-slate-800/80 border border-emerald-500/30" : "bg-slate-800/80 border border-rose-500/30"
                                      }`}
                                    >
                                      <div>
                                        <span className="font-semibold text-slate-200">{tc.name || `Case ${tIdx + 1}`}</span>
                                        {tc.is_hidden && (
                                          <span className="ml-1.5 text-[10px] text-purple-400 bg-purple-900/40 px-1 rounded">ลับ</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {tc.execution_time_ms != null && (
                                          <span className="text-slate-400">{tc.execution_time_ms}ms</span>
                                        )}
                                        <span
                                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                            tc.passed ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                                          }`}
                                        >
                                          {tc.passed ? "PASS" : "FAIL"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action Buttons: Test Cases & AI Helper */}
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleTestCaseGrade(q.id)}
                                disabled={loadingTcQId === q.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                              >
                                {loadingTcQId === q.id ? (
                                  <>
                                    <span className="animate-spin inline-block">⏳</span>
                                    <span>กำลังรัน Test Cases...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🧪</span>
                                    <span>รันตรวจ Test Cases</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAiGrade(q.id)}
                                disabled={loadingAiQId === q.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                              >
                                {loadingAiQId === q.id ? (
                                  <>
                                    <span className="animate-spin inline-block">⏳</span>
                                    <span>AI กำลังตรวจ...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🤖</span>
                                    <span>ให้ AI ช่วยตรวจ Java</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-800 whitespace-pre-wrap">
                            {q.student_answer || "(ไม่ได้ระบุ)"}
                          </div>
                        )}
                      </div>

                      {/* Score Input & Feedback */}
                      <div className="pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            คะแนนที่ได้ (เต็ม {q.points}):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={q.points}
                            value={currentAnsState?.manual_score ?? 0}
                            onChange={(e) =>
                              handleScoreChange(q.id, parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-sm font-bold border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            ข้อเสนอแนะรายข้อ (Feedback):
                          </label>
                          <textarea
                            rows={2}
                            value={currentAnsState?.feedback ?? ""}
                            onChange={(e) => handleFeedbackChange(q.id, e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="เน้นตรวจความถูกต้องของ Logic ไม่หักคะแนนเรื่องรูปแบบหรือความสวยงาม"
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
                  placeholder="เขียนสรุปภาพรวมการทำข้อสอบของนิสิตคนนี้ เช่น ทำได้ดีมาก หรือควรทบทวนเรื่อง Array..."
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

      {/* Plagiarism Similarity Modal */}
      {showSimilarityModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full my-8 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <span>🔍</span>
                  <span>รายงานการตรวจจับความคล้ายกันของโค้ด (Code Plagiarism Matrix)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  ระบบเปรียบเทียบ N-gram Token Similarity ขจัดช่องว่างและการตั้งชื่อตัวแปร เพื่อตรวจจับโค้ดที่คล้ายกัน
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSimilarityModal(false);
                  setSelectedPair(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {similarityLoading ? (
                <div className="text-center py-16 text-gray-400">
                  <span className="animate-spin text-3xl inline-block mb-3">⏳</span>
                  <p>กำลังคำนวณความคล้ายกันของโค้ดทุกคู่ในห้องสอบ...</p>
                </div>
              ) : !similarityData?.pairs || similarityData.pairs.length === 0 ? (
                <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <span className="text-4xl mb-2 inline-block">✅</span>
                  <h4 className="font-bold text-base text-gray-700">ไม่พบคู่โค้ดที่มีความเสี่ยงลอกเลียนแบบ</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    โค้ดของนิสิตแต่ละคนมีความแตกต่างกันอย่างชัดเจนตามเกณฑ์มาตรฐาน
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Pair Selector Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs text-gray-600">
                      <thead className="bg-gray-50 uppercase text-gray-500 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">โจทย์ข้อที่</th>
                          <th className="px-4 py-3">นิสิตคนที่ 1</th>
                          <th className="px-4 py-3">นิสิตคนที่ 2</th>
                          <th className="px-4 py-3 text-center">ระดับความคล้ายกัน</th>
                          <th className="px-4 py-3 text-right">การตรวจสอบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {similarityData.pairs.map((p, idx) => {
                          const isHigh = p.similarity >= 80;
                          const isMed = p.similarity >= 60;
                          const isSelected = selectedPair === p;

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-indigo-50/50 cursor-pointer transition-colors ${
                                isSelected ? "bg-indigo-50 font-medium" : ""
                              }`}
                              onClick={() => setSelectedPair(p)}
                            >
                              <td className="px-4 py-3 font-semibold text-gray-800">
                                ข้อ {p.question_order}
                              </td>
                              <td className="px-4 py-3">
                                {p.student1.name} ({p.student1.username})
                              </td>
                              <td className="px-4 py-3">
                                {p.student2.name} ({p.student2.username})
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                    isHigh
                                      ? "bg-rose-100 text-rose-700 border border-rose-200 animate-pulse"
                                      : isMed
                                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                                      : "bg-sky-100 text-sky-700 border border-sky-200"
                                  }`}
                                >
                                  {p.similarity}% {isHigh ? "🔥 เสี่ยงสูงมาก" : isMed ? "⚠️ ปานกลาง" : "คล้ายบางส่วน"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPair(p);
                                  }}
                                  className="text-indigo-600 hover:underline font-semibold"
                                >
                                  ดูเทียบโค้ด ➔
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Side-by-side Code Comparison */}
                  {selectedPair && (
                    <div className="border border-indigo-200 rounded-2xl bg-indigo-50/30 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                        <h4 className="font-bold text-sm text-gray-900">
                          เปรียบเทียบโค้ดข้อ {selectedPair.question_order} (ความเหมือน {selectedPair.similarity}%)
                        </h4>
                        <span className="text-xs text-indigo-700">
                          {selectedPair.question_prompt}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Student 1 */}
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-800">
                            👤 {selectedPair.student1.name} ({selectedPair.student1.username})
                          </p>
                          <CodeEditor
                            readOnly={true}
                            value={selectedPair.student1.code}
                            minHeight="240px"
                          />
                        </div>

                        {/* Student 2 */}
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-800">
                            👤 {selectedPair.student2.name} ({selectedPair.student2.username})
                          </p>
                          <CodeEditor
                            readOnly={true}
                            value={selectedPair.student2.code}
                            minHeight="240px"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setShowSimilarityModal(false);
                  setSelectedPair(null);
                }}
                className="px-5 py-2 text-sm font-semibold bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
