import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSubmission,
  getGrades,
  gradeSubmission,
  approveSubmission,
  getJobStatus,
  getAppeal,
  respondAppeal,
  getSubmissionContent,
  getSubmissionNeighbors,
  getSubmissionHistory,
  getSubmissionAudit,
  getPreviewPrompt,
} from "../../api/grading";
import { getAssignmentRubricOverride } from "../../api/assignments";
import SubmissionImage from "../../components/SubmissionImage";

export default function SubmissionReviewPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const LEVEL_CLS = {
    4: "bg-green-100 text-green-700",
    3: "bg-blue-100 text-blue-700",
    2: "bg-yellow-100 text-yellow-700",
    1: "bg-red-100 text-red-700",
  };

  const [approveForm, setApproveForm] = useState({
    action: "approved",
    note: "",
    final_level: "",
  });
  const [showApprove, setShowApprove] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const { data: subData, error: subError } = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () => getSubmission(submissionId),
    retry: false,
  });

  useEffect(() => {
    if (subError) navigate("/teacher/courses", { replace: true });
  }, [subError]);

  const { data: gradesData, isLoading: gradesLoading } = useQuery({
    queryKey: ["grades", submissionId],
    queryFn: () => getGrades(submissionId),
    refetchInterval: (data) => {
      // หยุด poll เมื่อ graded แล้ว
      return data?.status === "graded" || data?.status === "approved"
        ? false
        : 4000;
    },
  });

  const jobId = subData?.latest_job?.id;
  const { data: jobData } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatus(jobId),
    enabled: !!jobId,
    refetchInterval: (data) =>
      data?.status === "done" || data?.status === "failed" ? false : 3000,
  });

  const [gradeError, setGradeError] = useState("");
  const [appealForm, setAppealForm] = useState({ teacher_response: "" });
  const [showAppealForm, setShowAppealForm] = useState(false);

  const { data: appealData } = useQuery({
    queryKey: ["appeal", submissionId],
    queryFn: () => getAppeal(submissionId),
    enabled: !!submissionId,
  });

  const { data: neighbors } = useQuery({
    queryKey: ["submission-neighbors", submissionId],
    queryFn: () => getSubmissionNeighbors(submissionId),
    enabled: !!submissionId,
  });

  const { data: historyData } = useQuery({
    queryKey: ["submission-history", submissionId],
    queryFn: () => getSubmissionHistory(submissionId),
    enabled: !!submissionId,
  });
  const history = historyData?.history || [];

  const { data: auditData } = useQuery({
    queryKey: ["submission-audit", submissionId],
    queryFn: () => getSubmissionAudit(submissionId),
    enabled: !!submissionId,
  });
  const audit = auditData?.audit || [];

  const { data: promptData, isFetching: promptLoading } = useQuery({
    queryKey: ["submission-prompt", submissionId],
    queryFn: () => getPreviewPrompt(submissionId),
    enabled: showPrompt,
  });

  const appealMutation = useMutation({
    mutationFn: (data) => respondAppeal(appealData?.appeal?.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appeal", submissionId] });
      setShowAppealForm(false);
    },
  });

  const appeal = appealData?.appeal;

  const gradeMutation = useMutation({
    mutationFn: () => gradeSubmission(submissionId),
    onSuccess: () => {
      setGradeError("");
      qc.invalidateQueries({ queryKey: ["submission", submissionId] });
      qc.invalidateQueries({ queryKey: ["grades", submissionId] });
    },
    onError: (err) =>
      setGradeError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const approveMutation = useMutation({
    mutationFn: (data) => approveSubmission(submissionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grades", submissionId] });
      qc.invalidateQueries({ queryKey: ["teacher-summary"] });
      setShowApprove(false);
    },
  });

  const submission = subData?.submission;

  const { data: overrideData } = useQuery({
    queryKey: ["assignment-override", submission?.assignment_id],
    queryFn: () => getAssignmentRubricOverride(submission.assignment_id),
    enabled: !!submission?.assignment_id,
  });

  const { data: contentData, isError: contentError } = useQuery({
    queryKey: ["submission-content", submissionId],
    queryFn: () => getSubmissionContent(submissionId),
    enabled: !!submissionId,
    retry: false,
  });

  const grades = gradesData?.grades || [];
  const isGraded = ["graded", "approved"].includes(gradesData?.status);
  const isApproved = gradesData?.approved;
  const hasRubricOrOverride =
    !!submission?.rubric_id || !!overrideData?.override;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Link
            to={`/teacher/assignments/${submission?.assignment_id}`}
            className="text-sm text-indigo-500 hover:underline"
          >
            ← กลับไปงาน
          </Link>
          {neighbors && (
            <div className="flex items-center gap-2 text-sm">
              {neighbors.prev ? (
                <Link
                  to={`/teacher/submissions/${neighbors.prev.id}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-300 hover:text-indigo-600 transition-all text-gray-600"
                >
                  ← {neighbors.prev.student_name}
                </Link>
              ) : (
                <span className="px-3 py-1.5 rounded-lg border border-gray-100 text-gray-300 cursor-not-allowed">
                  ←
                </span>
              )}
              <span className="text-xs text-gray-400">
                {neighbors.current_index}/{neighbors.total}
              </span>
              {neighbors.next ? (
                <Link
                  to={`/teacher/submissions/${neighbors.next.id}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-300 hover:text-indigo-600 transition-all text-gray-600"
                >
                  {neighbors.next.student_name} →
                </Link>
              ) : (
                <span className="px-3 py-1.5 rounded-lg border border-gray-100 text-gray-300 cursor-not-allowed">
                  →
                </span>
              )}
            </div>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">
          ตรวจงาน: {submission?.student_name}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {submission?.assignment_title} · ครั้งที่ {submission?.attempt}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: submission content */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h2 className="font-semibold text-gray-700 mb-3">งานที่ส่งมา</h2>
            {contentData?.type === "image" ? (
              <SubmissionImage
                submissionId={submissionId}
                className="max-w-full rounded-lg border border-gray-200"
              />
            ) : contentData?.type === "text" ? (
              <>
                {contentData.ext && (
                  <p className="text-xs text-gray-400 mb-2">
                    ไฟล์: {submission?.file_path} · แสดงข้อความที่ extract ได้
                  </p>
                )}
                <pre className="bg-gray-50 rounded-lg p-4 text-xs font-mono text-gray-700 overflow-auto max-h-80 whitespace-pre-wrap">
                  {contentData.content}
                </pre>
              </>
            ) : contentData?.type === "unsupported" ? (
              <p className="text-sm text-gray-500">
                ไฟล์: {submission?.file_path} (ไม่รองรับการแสดงผล)
              </p>
            ) : contentData?.type === "empty" ? (
              <p className="text-sm text-gray-400">ไม่พบเนื้อหา</p>
            ) : contentError ? (
              <p className="text-sm text-red-500">โหลดเนื้อหาไม่สำเร็จ</p>
            ) : (
              <p className="text-sm text-gray-400">กำลังโหลด...</p>
            )}
          </div>

          {/* Job status */}
          {jobData && jobData.status !== "done" && (
            <div
              className={`rounded-xl px-4 py-3 text-sm mb-4 ${
                jobData.status === "failed"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : jobData.status === "running"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-yellow-50 text-yellow-700 border border-yellow-200"
              }`}
            >
              {jobData.status === "running" && "⏳ LLM กำลังตรวจงานอยู่..."}
              {jobData.status === "pending" && "⏳ รอตรวจ..."}
              {jobData.status === "failed" &&
                `❌ ตรวจไม่สำเร็จ: ${jobData.error}`}
            </div>
          )}

          {/* Actions */}
          {!hasRubricOrOverride && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-3 text-sm text-yellow-700">
              ⚠️ งานนี้ยังไม่มี Rubric หรือ Custom Override —
              ไปที่หน้างานเพื่อกำหนด Rubric หรือ Override ก่อน
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                const msg = isGraded
                  ? "ตรวจซ้ำจะลบผลการตรวจเดิมทั้งหมด ยืนยันหรือไม่?"
                  : "ยืนยันการสั่งตรวจด้วย AI?";
                if (window.confirm(msg)) gradeMutation.mutate();
              }}
              disabled={
                gradeMutation.isPending ||
                jobData?.status === "running" ||
                !hasRubricOrOverride
              }
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {gradeMutation.isPending
                ? "กำลังส่งคำสั่ง..."
                : "🤖 สั่งตรวจด้วย AI"}
            </button>
            <button
              onClick={() => setShowPrompt((v) => !v)}
              disabled={!hasRubricOrOverride}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {showPrompt ? "ซ่อน Prompt" : "ดู Prompt"}
            </button>

            {gradeError && (
              <p className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {gradeError}
              </p>
            )}
            {showPrompt && (
              <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 mt-2">
                {promptLoading ? (
                  <p className="text-gray-400 text-sm text-center">
                    กำลังโหลด prompt...
                  </p>
                ) : promptData ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-gray-500">
                        Prompt ที่จะส่งให้ AI
                        {promptData.calibration_count > 0
                          ? ` · ${promptData.calibration_count} ตัวอย่าง`
                          : ""}
                        {promptData.correction_count > 0
                          ? ` · ${promptData.correction_count} correction`
                          : ""}
                        {` · ${promptData.prompt.length} chars`}
                      </p>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(promptData.prompt)
                        }
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        คัดลอก
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {promptData.prompt
                        .split(/\n(?=## )/)
                        .map((section, i) => {
                          const firstLine = section.split("\n")[0];
                          const body = section.slice(firstLine.length).trim();
                          const sectionStyle = {
                            "## Rubric Criteria": {
                              bg: "bg-indigo-50",
                              border: "border-indigo-200",
                              title: "text-indigo-700",
                            },
                            "## Calibration Examples": {
                              bg: "bg-emerald-50",
                              border: "border-emerald-200",
                              title: "text-emerald-700",
                            },
                            "## Recent Correction Examples": {
                              bg: "bg-amber-50",
                              border: "border-amber-200",
                              title: "text-amber-700",
                            },
                            "## Student Submission": {
                              bg: "bg-gray-50",
                              border: "border-gray-200",
                              title: "text-gray-600",
                            },
                            "## Instructions": {
                              bg: "bg-blue-50",
                              border: "border-blue-200",
                              title: "text-blue-700",
                            },
                            "## Required JSON Output": {
                              bg: "bg-slate-100",
                              border: "border-slate-300",
                              title: "text-slate-700",
                            },
                          }[firstLine.trim()] ?? {
                            bg: "bg-white",
                            border: "border-gray-200",
                            title: "text-gray-700",
                          };
                          return (
                            <div
                              key={i}
                              className={`rounded-lg border px-3 py-2 ${sectionStyle.bg} ${sectionStyle.border}`}
                            >
                              {firstLine.startsWith("##") && (
                                <p
                                  className={`text-xs font-bold mb-1 ${sectionStyle.title}`}
                                >
                                  {firstLine.replace("## ", "")}
                                </p>
                              )}
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                                {body || firstLine}
                              </pre>
                            </div>
                          );
                        })}
                    </div>
                  </>
                ) : (
                  <p className="text-red-500 text-sm">โหลด prompt ไม่สำเร็จ</p>
                )}
              </div>
            )}
            {isGraded && (
              <button
                onClick={() => setShowApprove(!showApprove)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  isApproved
                    ? "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {isApproved ? "✏️ แก้ไขคะแนน" : "✓ อนุมัติคะแนน"}
              </button>
            )}
          </div>

          {/* Approve form */}
          {showApprove && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                approveMutation.mutate({
                  ...approveForm,
                  final_level: approveForm.final_level
                    ? Number(approveForm.final_level)
                    : undefined,
                });
              }}
              className="bg-white border border-gray-200 rounded-xl p-4 mt-4 space-y-3"
            >
              <h3 className="font-semibold text-gray-700">
                อนุมัติ / แก้ไขคะแนน
              </h3>
              <div className="flex gap-2">
                {[
                  ["approved", "✓ อนุมัติ"],
                  ["edited", "✏️ แก้คะแนน"],
                  ["rejected", "✗ ปฏิเสธ"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setApproveForm((f) => ({ ...f, action: v }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      approveForm.action === v
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {approveForm.action === "edited" && (
                <div>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    step="1"
                    placeholder="ระดับสุดท้าย (1.00 - 4.00)"
                    value={approveForm.final_level}
                    onChange={(e) =>
                      setApproveForm((f) => ({
                        ...f,
                        final_level: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              )}
              <div>
                <textarea
                  placeholder="เหตุผล (optional)"
                  value={approveForm.note}
                  rows={3}
                  onChange={(e) =>
                    setApproveForm((f) => ({ ...f, note: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {approveForm.action === "edited" && (
                  <p className="text-xs text-indigo-500 mt-1">
                    💡 ระบบจะนำเหตุผลนี้ไปสอน AI ว่าทำไมคะแนนควรเป็นเท่านี้ —
                    ช่วยให้การตรวจครั้งถัดไปแม่นยำขึ้น
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={approveMutation.isPending}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </form>
          )}
        </div>

        {/* Right: grades + appeal */}
        <div>
          {gradesLoading ? (
            <p className="text-gray-400 text-center py-8">
              กำลังโหลดผลการตรวจ...
            </p>
          ) : isGraded ? (
            <div>
              {/* Summary */}
              <div
                className={`rounded-xl p-5 mb-4 ${isApproved ? "bg-indigo-50 border border-indigo-200" : "bg-white border border-gray-200"}`}
              >
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold text-indigo-600">
                    {(isApproved && gradesData.final_level != null
                      ? gradesData.final_level
                      : gradesData.avg_level
                    )?.toFixed(2) ?? "—"}
                  </p>
                  <p className="text-gray-400 text-sm">จาก {(gradesData.max_level ?? 4).toFixed(2)}</p>
                  {gradesData.avg_level != null && (
                    <span
                      className={`mt-2 inline-block text-xs px-2 py-0.5 rounded font-semibold bg-gray-100 text-gray-700`}
                    >
                      avg {gradesData.avg_level.toFixed(2)}
                    </span>
                  )}
                  <span
                    className={`mt-2 ml-2 inline-block text-xs px-2.5 py-1 rounded-full font-medium ${isApproved ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"}`}
                  >
                    {isApproved ? "✓ อนุมัติแล้ว" : "รออนุมัติ"}
                  </span>
                </div>

                {/* Class average comparison */}
                {gradesData.class_avg_level != null &&
                  gradesData.avg_level != null && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>นิสิตคนนี้</span>
                          <span className="font-medium text-indigo-600">
                            {gradesData.avg_level.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{
                              width: `${(gradesData.avg_level / (gradesData.max_level ?? 4)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>เฉลี่ยทั้งชั้น</span>
                          <span className="font-medium text-gray-600">
                            {gradesData.class_avg_level.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-400 rounded-full transition-all"
                            style={{
                              width: `${(gradesData.class_avg_level / (gradesData.max_level ?? 4)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-center text-gray-400 pt-0.5">
                        {gradesData.avg_level > gradesData.class_avg_level
                          ? `สูงกว่าเฉลี่ย +${(gradesData.avg_level - gradesData.class_avg_level).toFixed(2)}`
                          : gradesData.avg_level < gradesData.class_avg_level
                            ? `ต่ำกว่าเฉลี่ย ${(gradesData.avg_level - gradesData.class_avg_level).toFixed(2)}`
                            : "เท่ากับค่าเฉลี่ย"}
                      </p>
                    </div>
                  )}
              </div>

              {/* Per-criteria grades */}
              <div className="space-y-3">
                {grades.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-gray-800 text-sm">
                        {g.criteria_name}
                      </p>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700`}
                      >
                        {g.level}
                        {g.level_label ? ` — ${g.level_label}` : ""}
                      </span>
                    </div>
                    {g.reasoning && (
                      <p className="text-xs text-gray-500 mb-2 bg-gray-50 rounded p-2">
                        {g.reasoning}
                      </p>
                    )}
                    {g.feedback && (
                      <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">
                        💡 {g.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400">
              <p className="text-lg mb-1">ยังไม่มีผลการตรวจ</p>
              <p className="text-sm">กดปุ่ม "สั่งตรวจด้วย AI" เพื่อเริ่มตรวจ</p>
            </div>
          )}
        </div>
      </div>

      {/* Appeal section */}
      {appeal && (
        <div
          className={`mt-6 rounded-xl p-5 border ${
            appeal.status === "resolved"
              ? "bg-green-50 border-green-200"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">
              {appeal.status === "pending" && "⚠️ นิสิตส่ง Appeal"}
              {appeal.status === "resolved" && "✅ Appeal เสร็จสิ้น"}
            </h3>
            {appeal.status !== "resolved" && !showAppealForm && (
              <button
                onClick={() => setShowAppealForm(true)}
                className="text-xs bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                ตอบกลับ
              </button>
            )}
          </div>
          <div className="bg-white rounded-lg p-3 mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1">
              เหตุผลของนิสิต
            </p>
            <p className="text-sm text-gray-700">{appeal.reason}</p>
          </div>
          {appeal.teacher_response && (
            <div className="bg-white rounded-lg p-3 mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1">
                ความเห็นของอาจารย์
              </p>
              <p className="text-sm text-gray-700">{appeal.teacher_response}</p>
            </div>
          )}
          {showAppealForm && (
            <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-3">
              <textarea
                rows={3}
                placeholder="ตอบกลับนิสิต..."
                value={appealForm.teacher_response}
                onChange={(e) =>
                  setAppealForm((f) => ({
                    ...f,
                    teacher_response: e.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    appealMutation.mutate({
                      status: "resolved",
                      teacher_response: appealForm.teacher_response,
                    })
                  }
                  disabled={
                    !appealForm.teacher_response?.trim() ||
                    appealMutation.isPending
                  }
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {appealMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => setShowAppealForm(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  ยกเลิก
                </button>
              </div>
              {appealMutation.isError && (
                <p className="text-red-500 text-xs">
                  {appealMutation.error?.response?.data?.error ||
                    "เกิดข้อผิดพลาด"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {audit.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-700 mb-3">Audit Trail</h2>
          <div className="space-y-2">
            {audit.map((a) => {
              const actionStyle =
                {
                  approved: "bg-green-50 border-green-200 text-green-700",
                  rejected: "bg-red-50 border-red-200 text-red-700",
                  edited: "bg-amber-50 border-amber-200 text-amber-700",
                }[a.action] ?? "bg-gray-50 border-gray-200 text-gray-600";
              const actionLabel =
                {
                  approved: "✓ อนุมัติ",
                  rejected: "✗ ปฏิเสธ",
                  edited: "✎ แก้คะแนน",
                }[a.action] ?? a.action;
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border px-4 py-3 text-sm ${actionStyle}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{actionLabel}</span>
                    <span className="text-xs opacity-70">
                      {new Date(a.approved_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <p className="text-xs opacity-70 mt-0.5">{a.teacher_name}</p>
                  {a.final_level != null && (
                    <p className="text-xs mt-1">
                      ระดับที่แก้: {Number(a.final_level).toFixed(2)}/{(gradesData.max_level ?? 4).toFixed(2)}
                    </p>
                  )}
                  {a.note && <p className="text-xs mt-1 italic">"{a.note}"</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-700 mb-3">
            ประวัติการส่งงาน ({history.length} ครั้ง)
          </h2>
          <div className="space-y-2">
            {history.map((h) => {
              const histLevel =
                h.final_level != null ? h.final_level : h.avg_level;
              const isCurrent = h.id === Number(submissionId);

              const statusMap = {
                pending: {
                  label: "รอตรวจ",
                  cls: "bg-yellow-100 text-yellow-700",
                },
                grading: {
                  label: "กำลังตรวจ",
                  cls: "bg-blue-100 text-blue-700",
                },
                graded: {
                  label: "ตรวจแล้ว",
                  cls: "bg-indigo-100 text-indigo-700",
                },
                approved: {
                  label: "อนุมัติแล้ว",
                  cls: "bg-green-100 text-green-700",
                },
                rejected: { label: "ปฏิเสธ", cls: "bg-red-100 text-red-700" },
              };
              const st = statusMap[h.status] ?? {
                label: h.status,
                cls: "bg-gray-100 text-gray-600",
              };

              return (
                <Link
                  key={h.id}
                  to={`/teacher/submissions/${h.id}`}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                    isCurrent
                      ? "bg-indigo-50 border-indigo-200"
                      : "bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-sm font-medium text-gray-700 min-w-fit">
                      ครั้งที่ {h.attempt}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(h.submitted_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    {histLevel != null && (
                      <span
                        className={`text-sm font-semibold px-2 py-1 rounded-lg ${
                          histLevel >= 3.5
                            ? "bg-green-100 text-green-700"
                            : histLevel >= 2.5
                              ? "bg-yellow-100 text-yellow-700"
                              : histLevel >= 1.5
                                ? "bg-orange-100 text-orange-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {Number(histLevel).toFixed(2)}/{Number(h.max_level ?? 4).toFixed(2)}
                      </span>
                    )}
                    <span className="text-xs text-indigo-500 font-medium">
                      ดูผล →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
