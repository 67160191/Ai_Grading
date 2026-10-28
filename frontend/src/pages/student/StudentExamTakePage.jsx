import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { getExam, startExam, submitExam } from "../../api/exams";

export default function StudentExamTakePage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [answers, setAnswers] = useState({}); // { [question_id]: answer_text }
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSwitchWarning, setShowSwitchWarning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(null);
  const timerRef = useRef(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-exam-take", examId],
    queryFn: () => getExam(examId),
    retry: false,
  });

  // Start exam mutation
  const startMut = useMutation({
    mutationFn: () => startExam(examId),
    onSuccess: (res) => {
      // initialized
    },
    onError: (err) => {
      showToast(err.response?.data?.error || "ไม่สามารถเริ่มสอบได้", "error");
    },
  });

  // Submit exam mutation
  const submitMut = useMutation({
    mutationFn: (payload) => submitExam(examId, payload),
    onSuccess: () => {
      showToast("ส่งข้อสอบเรียบร้อยแล้ว", "success");
      navigate(`/student/exams/${examId}/result`, { replace: true });
    },
    onError: (err) => {
      showToast(err.response?.data?.error || "เกิดข้อผิดพลาดในการส่งข้อสอบ", "error");
    },
  });

  // Initialize exam session
  useEffect(() => {
    if (data?.exam) {
      if (!data.submission) {
        startMut.mutate();
      } else if (data.submission.status !== "in_progress") {
        navigate(`/student/exams/${examId}/result`, { replace: true });
      }

      // Initialize default answers with starter_code for coding questions
      const initial = {};
      data.questions.forEach((q) => {
        if (q.question_type === "coding" && q.starter_code) {
          initial[q.id] = q.starter_code;
        } else {
          initial[q.id] = "";
        }
      });
      setAnswers((prev) => ({ ...initial, ...prev }));

      if (data.remainingSeconds != null) {
        setRemainingSecs(data.remainingSeconds);
      } else if (data.exam.duration_minutes) {
        setRemainingSecs(data.exam.duration_minutes * 60);
      }
    }
  }, [data]);

  // Timer countdown
  useEffect(() => {
    if (remainingSecs === null || remainingSecs <= 0) return;

    timerRef.current = setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [remainingSecs]);

  // Tab-switch and window blur listener (Anti-Cheat)
  useEffect(() => {
    const handleBlur = () => {
      setTabSwitchCount((c) => {
        const next = c + 1;
        setShowSwitchWarning(true);
        return next;
      });
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) handleBlur();
    });

    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const handleAutoSubmit = () => {
    showToast("หมดเวลาสอบแล้ว ระบบกำลังส่งข้อสอบอัตโนมัติ...", "info");
    doSubmit();
  };

  const handleAnswerChange = (qId, val) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  // Support Tab key in code editor textarea
  const handleCodeKeyDown = (e, qId) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const nextVal = val.substring(0, start) + "    " + val.substring(end);
      handleAnswerChange(qId, nextVal);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const doSubmit = () => {
    if (submitMut.isPending) return;
    const formatted = Object.entries(answers).map(([qId, ans]) => ({
      question_id: parseInt(qId),
      answer: ans,
    }));
    submitMut.mutate({ answers: formatted, tab_switch_count: tabSwitchCount });
  };

  const formatTime = (secs) => {
    if (secs == null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-500">กำลังโหลดข้อสอบ...</div>;
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <p className="text-red-500 font-semibold mb-4">
          {error.response?.data?.error || "ไม่สามารถเข้าสู่ห้องสอบได้"}
        </p>
        <button
          onClick={() => navigate("/student/courses")}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          กลับหน้ารายวิชา
        </button>
      </div>
    );
  }

  const { exam, course, questions } = data || {};
  const answeredCount = Object.values(answers).filter((a) => a && a.trim().length > 0).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Sticky Top Timer Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm py-3 px-4 -mx-4 sm:-mx-6 sm:px-6 flex items-center justify-between">
        <div>
          <span className="text-xs text-indigo-600 font-medium">{course?.name}</span>
          <h2 className="text-base font-bold text-gray-900 truncate max-w-xs sm:max-w-md">
            {exam?.title}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] text-gray-400 block">เวลาที่เหลือ</span>
            <span
              className={`font-mono text-lg font-bold ${
                remainingSecs != null && remainingSecs < 300
                  ? "text-rose-600 animate-pulse"
                  : "text-gray-800"
              }`}
            >
              ⏳ {formatTime(remainingSecs)}
            </span>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
          >
            ส่งข้อสอบ
          </button>
        </div>
      </div>

      {/* Tab Switch Alert Banner */}
      {showSwitchWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3 text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-bold">ระบบตรวจพบการสลับหน้าต่าง/แท็บ ({tabSwitchCount} ครั้ง)</p>
              <p className="text-amber-700 mt-0.5">
                ประวัติการสลับหน้าต่างจะถูกบันทึกและส่งรายงานไปยังอาจารย์ผู้สอน กรุณาทำข้อสอบในหน้านี้
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSwitchWarning(false)}
            className="text-amber-600 hover:text-amber-900 font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Progress Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between text-xs text-gray-500 shadow-sm">
        <span>
          ตอบแล้ว <strong className="text-indigo-600">{answeredCount}</strong> จาก{" "}
          <strong>{questions?.length || 0}</strong> ข้อ
        </span>
        <span>เวลารวม {exam?.duration_minutes} นาที</span>
      </div>

      {/* Questions List (Google Form Style) */}
      <div className="space-y-6">
        {questions?.map((q, idx) => {
          const isMcq = q.question_type === "mcq";
          const isCoding = q.question_type === "coding";
          const isShort = q.question_type === "short_answer";
          const currentVal = answers[q.id] || "";

          return (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 uppercase">
                    {isCoding ? "Java Programming" : isMcq ? "ช้อยส์ / ปรนัย" : "ข้อเขียน"}
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                  {q.points} คะแนน
                </span>
              </div>

              {/* Prompt */}
              <div className="text-gray-900 text-sm font-medium whitespace-pre-wrap leading-relaxed">
                {q.prompt}
              </div>

              {/* Multiple Choice Options */}
              {isMcq && (
                <div className="space-y-2 pt-2">
                  {q.options?.map((opt, oIdx) => {
                    const optVal = typeof opt === "string" ? opt : opt.text;
                    const optId = typeof opt === "string" ? String(oIdx + 1) : opt.id || String(oIdx + 1);
                    const isSelected = currentVal === optId || currentVal === optVal;

                    return (
                      <label
                        key={oIdx}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-400 text-indigo-900 shadow-sm"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question_${q.id}`}
                          value={optId}
                          checked={isSelected}
                          onChange={() => handleAnswerChange(q.id, optId)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm">{optVal}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Java Code Editor */}
              {isCoding && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-mono text-indigo-600">☕ Java Code Editor</span>
                    {q.starter_code && (
                      <button
                        type="button"
                        onClick={() => handleAnswerChange(q.id, q.starter_code)}
                        className="text-xs text-gray-400 hover:text-indigo-600 underline"
                      >
                        คืนค่าโค้ดตั้งต้น
                      </button>
                    )}
                  </div>

                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-inner">
                    <textarea
                      rows={12}
                      value={currentVal}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(e, q.id)}
                      placeholder="// เขียนโค้ด Java ที่นี่... (กด Tab เพื่อย่อหน้าได้)"
                      className="w-full bg-slate-900 text-slate-100 font-mono text-xs p-4 focus:outline-none resize-y leading-relaxed"
                      spellCheck="false"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    💡 ทิป: สามารถกดปุ่ม <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 border">Tab</kbd> เพื่อย่อหน้าโค้ดได้ 4 ช่องว่าง
                  </p>
                </div>
              )}

              {/* Short Answer Textarea */}
              {isShort && (
                <div className="pt-2">
                  <textarea
                    rows={4}
                    value={currentVal}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="พิมพ์คำตอบของคุณที่นี่..."
                    className="w-full text-sm border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Submit Action */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">ตรวจสอบความเรียบร้อยก่อนส่ง</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            เมื่อกดส่งข้อสอบแล้ว จะไม่สามารถกลับมาแก้ไขคำตอบได้อีก
          </p>
        </div>
        <button
          onClick={() => setShowConfirmModal(true)}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
        >
          ส่งข้อสอบ ({answeredCount}/{questions?.length || 0})
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-gray-900">ยืนยันการส่งข้อสอบ?</h3>
            <p className="text-sm text-gray-600">
              คุณได้ตอบข้อสอบไปแล้ว <strong>{answeredCount}</strong> จาก{" "}
              <strong>{questions?.length || 0}</strong> ข้อ
            </p>

            {answeredCount < (questions?.length || 0) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                ⚠️ คุณยังมีข้อที่ยังไม่ได้ตอบอีก{" "}
                <strong>{(questions?.length || 0) - answeredCount} ข้อ</strong> แน่ใจหรือไม่ว่าจะส่งข้อสอบตอนนี้?
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                กลับไปทำต่อ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  doSubmit();
                }}
                disabled={submitMut.isPending}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitMut.isPending ? "กำลังส่งข้อสอบ..." : "ยืนยันส่งข้อสอบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

