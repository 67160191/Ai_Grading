import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { getExam, startExam, submitExam, autosaveExam, runExamCode } from "../../api/exams";
import CodeEditor from "../../components/CodeEditor";

export default function StudentExamTakePage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [answers, setAnswers] = useState({}); // { [question_id]: answer_text }
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSwitchWarning, setShowSwitchWarning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsPrompt, setShowFsPrompt] = useState(false);

  // Code runner states per question
  const [runningCode, setRunningCode] = useState({});
  const [runResults, setRunResults] = useState({});
  const [customInputs, setCustomInputs] = useState({});
  const [showCustomInput, setShowCustomInput] = useState({});

  const timerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const switchEventsRef = useRef([]);

  const storageKey = `exam_draft_${examId}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-exam-take", examId],
    queryFn: () => getExam(examId),
    retry: false,
  });

  // Start exam mutation
  const startMut = useMutation({
    mutationFn: () => startExam(examId),
    onError: (err) => {
      showToast(err.response?.data?.error || "ไม่สามารถเริ่มสอบได้", "error");
    },
  });

  // Submit exam mutation
  const submitMut = useMutation({
    mutationFn: (payload) => submitExam(examId, payload),
    onSuccess: () => {
      localStorage.removeItem(storageKey);
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
        return;
      }

      // Restore switch count if exists
      if (data.submission?.tab_switch_count) {
        setTabSwitchCount(data.submission.tab_switch_count);
      }

      // Check Fullscreen requirement
      if (data.exam.require_fullscreen && !document.fullscreenElement) {
        setShowFsPrompt(true);
      }

      // Initialize default answers
      const initial = {};
      data.questions.forEach((q) => {
        if (q.question_type === "coding" && q.starter_code) {
          initial[q.id] = q.starter_code;
        } else {
          initial[q.id] = "";
        }
      });

      // Overlay server existing answers
      if (data.existingAnswers) {
        Object.assign(initial, data.existingAnswers);
      }

      // Overlay localStorage draft if exists
      try {
        const local = localStorage.getItem(storageKey);
        if (local) {
          const parsed = JSON.parse(local);
          Object.assign(initial, parsed);
        }
      } catch {
        // ignore
      }

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

  // Periodic Auto-Save (Every 20 seconds)
  useEffect(() => {
    if (!data?.exam || data?.submission?.status !== "in_progress") return;

    autoSaveTimerRef.current = setInterval(() => {
      runAutoSave();
    }, 20000);

    return () => clearInterval(autoSaveTimerRef.current);
  }, [data, answers, tabSwitchCount]);

  // Save to localStorage whenever answers change
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(answers));
      } catch {
        // ignore
      }
    }
  }, [answers]);

  const runAutoSave = async () => {
    if (submitMut.isPending || Object.keys(answers).length === 0) return;
    try {
      setIsSaving(true);
      const formatted = Object.entries(answers).map(([qId, ans]) => ({
        question_id: parseInt(qId),
        answer: ans,
      }));
      await autosaveExam(examId, {
        answers: formatted,
        tab_switch_count: tabSwitchCount,
        switch_events: switchEventsRef.current,
      });
      setLastSavedAt(new Date().toLocaleTimeString("th-TH"));
    } catch (err) {
      console.warn("Auto-save warning:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Anti-Cheat: Tab-switch & Window blur listener
  useEffect(() => {
    const handleBlur = () => {
      const ev = { time: new Date().toISOString(), type: "blur" };
      switchEventsRef.current.push(ev);
      setTabSwitchCount((c) => {
        const next = c + 1;
        setShowSwitchWarning(true);
        return next;
      });
    };

    window.addEventListener("blur", handleBlur);
    const handleVisChange = () => {
      if (document.hidden) handleBlur();
    };
    document.addEventListener("visibilitychange", handleVisChange);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisChange);
    };
  }, []);

  // Anti-Cheat: Fullscreen Change Listener
  useEffect(() => {
    const handleFsChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (!inFs && data?.exam?.require_fullscreen) {
        const ev = { time: new Date().toISOString(), type: "fullscreen_exit" };
        switchEventsRef.current.push(ev);
        setTabSwitchCount((c) => c + 1);
        setShowSwitchWarning(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, [data]);

  const enterFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
        setShowFsPrompt(false);
      }).catch((err) => {
        showToast("เบราว์เซอร์ไม่อนุญาตให้เปิดโหมดเต็มจออัตโนมัติ: " + err.message, "error");
      });
    }
  };

  const handleAutoSubmit = () => {
    showToast("หมดเวลาสอบแล้ว ระบบกำลังส่งข้อสอบอัตโนมัติ...", "info");
    doSubmit();
  };

  const handleAnswerChange = (qId, val) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  const handleRunSampleTests = async (questionId) => {
    setRunningCode((prev) => ({ ...prev, [questionId]: true }));
    try {
      const code = answers[questionId] || "";
      const res = await runExamCode({
        question_id: questionId,
        code,
      });
      setRunResults((prev) => ({ ...prev, [questionId]: res }));
      if (res.allPassed) {
        showToast("🎉 ยอดเยี่ยม! ผ่านทุกตัวอย่างกรณีทดสอบ", "success");
      } else if (res.status === "Compilation Error") {
        showToast("คอมไพล์ไม่ผ่าน กรุณาตรวจสอบ Syntax ของโค้ด", "error");
      } else {
        showToast(`ผลการทดสอบ: ผ่าน ${res.passed}/${res.total} เคส`, "info");
      }
    } catch (err) {
      showToast(err.response?.data?.error || "ไม่สามารถรันโค้ดได้", "error");
    } finally {
      setRunningCode((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleRunCustomInput = async (questionId) => {
    setRunningCode((prev) => ({ ...prev, [questionId]: true }));
    try {
      const code = answers[questionId] || "";
      const input = customInputs[questionId] || "";
      const res = await runExamCode({
        question_id: questionId,
        code,
        custom_input: input,
      });
      setRunResults((prev) => ({ ...prev, [questionId]: res }));
      showToast("รันโค้ดสำเร็จ", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "ไม่สามารถรันโค้ดได้", "error");
    } finally {
      setRunningCode((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleClearRunResult = (questionId) => {
    setRunResults((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
  };

  const doSubmit = () => {
    if (submitMut.isPending) return;
    const formatted = Object.entries(answers).map(([qId, ans]) => ({
      question_id: parseInt(qId),
      answer: ans,
    }));
    submitMut.mutate({
      answers: formatted,
      tab_switch_count: tabSwitchCount,
      switch_events: switchEventsRef.current,
    });
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
      {/* Fullscreen Prompt Modal */}
      {showFsPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto">
              🖥️
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              ข้อสอบนี้กำหนดให้ทำในโหมดเต็มจอ
            </h3>
            <p className="text-sm text-gray-600">
              เพื่อความโปร่งใส ระบบจะตรวจสอบว่าคุณอยู่ในโหมดเต็มจอตลอดเวลาการสอบ หากออกจากโหมดเต็มจอจะถูกบันทึกเป็นการสลับหน้าต่าง
            </p>
            <button
              onClick={enterFullscreen}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md"
            >
              เข้าสู่โหมดเต็มจอและเริ่มทำข้อสอบ
            </button>
          </div>
        </div>
      )}

      {/* Sticky Top Timer Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm py-3 px-4 -mx-4 sm:-mx-6 sm:px-6 flex items-center justify-between">
        <div>
          <span className="text-xs text-indigo-600 font-medium">{course?.name}</span>
          <h2 className="text-base font-bold text-gray-900 truncate max-w-xs sm:max-w-md">
            {exam?.title}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {/* Auto-save Status Badge */}
          <div className="hidden sm:block text-right">
            {isSaving ? (
              <span className="text-xs text-indigo-500 animate-pulse font-medium">
                💾 กำลังบันทึกร่าง...
              </span>
            ) : lastSavedAt ? (
              <span className="text-xs text-emerald-600 font-medium">
                ✓ บันทึกร่างแล้ว ({lastSavedAt})
              </span>
            ) : null}
          </div>

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
            className="text-amber-600 hover:text-amber-800 font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Progress & Info Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-500">
        <div>
          <span>ตอบแล้ว </span>
          <span className="font-bold text-indigo-600 text-sm">{answeredCount}</span>
          <span> จากทั้งหมด {questions?.length} ข้อ</span>
        </div>
        <div className="flex items-center gap-3">
          {exam?.allow_paste === 0 && (
            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-medium">
              🚫 ไม่อนุญาตให้คัดลอก/วางโค้ด
            </span>
          )}
          {exam?.require_fullscreen === 1 && (
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-medium">
              🖥️ โหมดเต็มจอ
            </span>
          )}
          <button
            type="button"
            onClick={runAutoSave}
            disabled={isSaving}
            className="text-indigo-600 hover:underline font-medium"
          >
            {isSaving ? "กำลังบันทึก..." : "💾 กดบันทึกร่างทันที"}
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {questions?.map((q, idx) => {
          const isMcq = q.question_type === "mcq";
          const isCoding = q.question_type === "coding";
          const isShort = q.question_type === "short_answer";
          const currentVal = answers[q.id] || "";

          return (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm hover:border-gray-300 transition-colors"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    {isMcq ? "ปรนัย (เลือกตอบ)" : isCoding ? "เขียนโค้ด Java" : "อัตนัย (ตอบสั้น)"}
                  </span>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2.5 py-1 rounded-full">
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
                    <span className="font-mono text-indigo-600 font-semibold">
                      ☕ Java Code Editor (มีเลขบรรทัด &amp; ย่อหน้าอัตโนมัติ)
                    </span>
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

                  <CodeEditor
                    value={currentVal}
                    onChange={(val) => handleAnswerChange(q.id, val)}
                    allowPaste={exam?.allow_paste !== 0}
                    placeholder="// เขียนโค้ด Java ที่นี่... (กด Tab เพื่อย่อหน้าได้)"
                    minHeight="260px"
                  />

                  {/* Code Runner & Test Cases Sandbox */}
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRunSampleTests(q.id)}
                          disabled={runningCode[q.id]}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                        >
                          {runningCode[q.id] ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              <span>กำลังคอมไพล์ &amp; รัน...</span>
                            </>
                          ) : (
                            <>
                              <span>▶️</span>
                              <span>ทดสอบรันโค้ด (Run Tests)</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setShowCustomInput((prev) => ({
                              ...prev,
                              [q.id]: !prev[q.id],
                            }))
                          }
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                            showCustomInput[q.id]
                              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          ⌨️ ป้อน Input เอง
                        </button>
                      </div>

                      {q.test_cases && q.test_cases.length > 0 && (
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>
                            มี {q.test_cases.filter((tc) => !tc.is_hidden).length} ตัวอย่างโจทย์
                            {q.test_cases.some((tc) => tc.is_hidden) &&
                              ` (+ ${q.test_cases.filter((tc) => tc.is_hidden).length} เคสลับตรวจตอนส่ง)`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Custom Input Drawer */}
                    {showCustomInput[q.id] && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                        <label className="font-semibold text-gray-700 block">
                          Standard Input (stdin):
                        </label>
                        <textarea
                          rows={2}
                          value={customInputs[q.id] || ""}
                          onChange={(e) =>
                            setCustomInputs((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          placeholder="พิมพ์ข้อความหรือตัวเลขที่ต้องการส่งเข้า Scanner..."
                          className="w-full font-mono text-xs border border-gray-300 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRunCustomInput(q.id)}
                          disabled={runningCode[q.id]}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-xs"
                        >
                          รันด้วย Input นี้
                        </button>
                      </div>
                    )}

                    {/* Execution & Test Cases Results Display */}
                    {runResults[q.id] && (
                      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-xs bg-slate-900 text-slate-100 text-xs">
                        {/* Header bar */}
                        <div className="px-3.5 py-2.5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-300">
                              💻 Execution Console:
                            </span>
                            {runResults[q.id].allPassed ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                                ✅ ผ่านทุกตัวอย่าง ({runResults[q.id].passed}/{runResults[q.id].total})
                              </span>
                            ) : runResults[q.id].status === "Compilation Error" ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                                ❌ Compilation Error
                              </span>
                            ) : runResults[q.id].status === "Time Limit Exceeded (TLE)" ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                                ⏱️ Time Limit Exceeded (&gt;4s)
                              </span>
                            ) : runResults[q.id].mode === "test_cases" ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                                ⚠️ ผ่าน {runResults[q.id].passed}/{runResults[q.id].total} เคส
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">
                                {runResults[q.id].result?.status || "Completed"}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearRunResult(q.id)}
                            className="text-slate-400 hover:text-white"
                            title="ปิดผลลัพธ์"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Test Cases Results List */}
                        {runResults[q.id].mode === "test_cases" && (
                          <div className="p-3 space-y-2.5 max-h-72 overflow-y-auto">
                            {runResults[q.id].results?.map((tc, tcIdx) => (
                              <div
                                key={tcIdx}
                                className={`p-2.5 rounded-lg border ${
                                  tc.passed
                                    ? "bg-slate-800/60 border-emerald-500/30"
                                    : "bg-slate-800/60 border-rose-500/30"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-semibold text-slate-200">
                                    {tc.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {tc.execution_time_ms != null && (
                                      <span className="text-slate-400 font-mono text-[11px]">
                                        {tc.execution_time_ms} ms
                                      </span>
                                    )}
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                        tc.passed
                                          ? "bg-emerald-600 text-white"
                                          : "bg-rose-600 text-white"
                                      }`}
                                    >
                                      {tc.passed ? "PASSED" : tc.status || "FAILED"}
                                    </span>
                                  </div>
                                </div>

                                {tc.error && (
                                  <pre className="font-mono text-rose-300 text-[11px] bg-black/40 p-2 rounded mb-2 overflow-x-auto whitespace-pre-wrap">
                                    {tc.error}
                                  </pre>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                                  <div className="bg-black/30 p-2 rounded">
                                    <span className="text-slate-400 block text-[10px]">Input:</span>
                                    <span className="text-slate-200 whitespace-pre-wrap">{tc.input || "(empty)"}</span>
                                  </div>
                                  <div className="bg-black/30 p-2 rounded">
                                    <span className="text-slate-400 block text-[10px]">Expected:</span>
                                    <span className="text-emerald-300 whitespace-pre-wrap">{tc.expected_output || "(empty)"}</span>
                                  </div>
                                  <div className="bg-black/30 p-2 rounded">
                                    <span className="text-slate-400 block text-[10px]">Your Output:</span>
                                    <span
                                      className={`whitespace-pre-wrap ${
                                        tc.passed ? "text-emerald-300" : "text-rose-300 font-bold"
                                      }`}
                                    >
                                      {tc.actual_output || "(no output)"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Custom / Simple Output */}
                        {(runResults[q.id].mode === "custom" || runResults[q.id].mode === "simple") && (
                          <div className="p-3 space-y-2">
                            {runResults[q.id].result?.executionTimeMs != null && (
                              <div className="text-[11px] text-slate-400 font-mono">
                                เวลาประมวลผล: {runResults[q.id].result.executionTimeMs} ms
                              </div>
                            )}
                            {runResults[q.id].result?.error && (
                              <pre className="font-mono text-rose-300 text-[11px] bg-black/40 p-2.5 rounded overflow-x-auto whitespace-pre-wrap">
                                {runResults[q.id].result.error}
                              </pre>
                            )}
                            <div className="bg-black/50 p-2.5 rounded font-mono text-[11px]">
                              <span className="text-slate-400 block text-[10px] mb-1">Standard Output:</span>
                              <pre className="text-emerald-400 whitespace-pre-wrap">
                                {runResults[q.id].result?.output || "(ไม่มีผลลัพธ์ที่พิมพ์ออกมา)"}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={runAutoSave}
            disabled={isSaving}
            className="flex-1 sm:flex-none px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            {isSaving ? "กำลังบันทึก..." : "💾 บันทึกร่าง"}
          </button>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-md transition-colors"
          >
            ส่งข้อสอบทันที
          </button>
        </div>
      </div>

      {/* Confirm Submission Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900">ยืนยันการส่งข้อสอบ?</h3>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
              <p>
                • ตอบแล้ว: <span className="font-bold text-gray-900">{answeredCount}</span> จาก{" "}
                {questions?.length} ข้อ
              </p>
              {answeredCount < (questions?.length || 0) && (
                <p className="text-rose-600 font-semibold">
                  ⚠️ ยังมีข้อที่ยังไม่ได้ตอบอีก {(questions?.length || 0) - answeredCount} ข้อ
                </p>
              )}
              {tabSwitchCount > 0 && (
                <p className="text-amber-700">
                  • จำนวนการสลับหน้าต่าง: <span className="font-bold">{tabSwitchCount} ครั้ง</span>
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                กลับไปทำต่อ
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  doSubmit();
                }}
                disabled={submitMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-md"
              >
                {submitMut.isPending ? "กำลังส่ง..." : "ยืนยันส่ง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
