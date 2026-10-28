import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSubmission,
  getGrades,
  getJobStatus,
  getAppeal,
  submitAppeal,
  getSubmissionHistory,
} from "../../api/grading";
import SubmissionImage from "../../components/SubmissionImage";

export default function StudentResultPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [appealReason, setAppealReason] = useState("");
  const [showAppealForm, setShowAppealForm] = useState(false);

  const { data: subData, error: subError } = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () => getSubmission(submissionId),
    retry: false,
  });

  useEffect(() => {
    if (subError) navigate("/student/courses", { replace: true });
  }, [subError]);

  const { data: gradesData } = useQuery({
    queryKey: ["grades", submissionId],
    queryFn: () => getGrades(submissionId),
    refetchInterval: (data) =>
      data?.status === "graded" || data?.status === "approved" ? false : 4000,
  });

  const jobId = subData?.latest_job?.id;
  const { data: jobData } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatus(jobId),
    enabled: !!jobId,
    refetchInterval: (data) =>
      data?.status === "done" || data?.status === "failed" ? false : 3000,
  });

  const { data: appealData } = useQuery({
    queryKey: ["appeal", submissionId],
    queryFn: () => getAppeal(submissionId),
    enabled: !!submissionId,
  });

  const { data: historyData } = useQuery({
    queryKey: ["submission-history", submissionId],
    queryFn: () => getSubmissionHistory(submissionId),
    enabled: !!submissionId,
  });

  const appealMutation = useMutation({
    mutationFn: () => submitAppeal(submissionId, appealReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appeal", submissionId] });
      setShowAppealForm(false);
      setAppealReason("");
    },
  });

  const submission = subData?.submission;
  const grades = gradesData?.grades || [];
  const isGraded = ["graded", "approved"].includes(gradesData?.status);
  const isApproved = gradesData?.approved;
  const appeal = appealData?.appeal;
  const history = historyData?.history || [];

  const LEVEL_CLS = {
    4: "bg-green-100 text-green-700",
    3: "bg-blue-100 text-blue-700",
    2: "bg-yellow-100 text-yellow-700",
    1: "bg-red-100 text-red-700",
  };
  const levelBadgeCls = (level, maxScore) => {
    if (!maxScore || maxScore <= 0) return "bg-gray-100 text-gray-700";
    const ratio = level / maxScore;
    if (ratio >= 0.85) return "bg-green-100 text-green-700";
    if (ratio >= 0.65) return "bg-blue-100 text-blue-700";
    if (ratio >= 0.4) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };
  const displayLevel =
    isApproved && gradesData?.final_level != null
      ? gradesData.final_level
      : gradesData?.avg_level;

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/student/courses"
          className="text-sm text-indigo-500 hover:underline"
        >
          ← วิชาของฉัน
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">ผลการตรวจ</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {submission?.assignment_title} · ครั้งที่ {submission?.attempt}
        </p>
      </div>

      {/* Submission status (ก่อน graded / approved) */}
      {!isGraded && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-6 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ✓
          </div>
          <h2 className="text-lg font-bold text-gray-800">ส่งงานเรียบร้อยแล้ว</h2>
          <p className="text-sm text-gray-500">
            ระบบได้รับไฟล์/เนื้อหางานของคุณแล้ว สถานะ: รออาจารย์ตรวจงานและประกาศผลคะแนน
          </p>
          <div className="inline-block bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-600">
            ส่งเมื่อ:{" "}
            {submission?.submitted_at
              ? new Date(submission.submitted_at).toLocaleString("th-TH")
              : "-"}
          </div>
          {jobData?.status === "failed" && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              ❌ ตรวจไม่สำเร็จ: {jobData.error} (กรุณาติดต่ออาจารย์)
            </div>
          )}
        </div>
      )}

      {isGraded && (
        <div className="grid grid-cols-2 gap-6 items-start">
          {/* ซ้าย: Summary + Level bar + ประวัติ + resubmit */}
          <div className="space-y-4">
            {/* Summary card */}
            <div
              className={`rounded-xl p-6 text-center ${
                isApproved
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200"
              }`}
            >
              <p
                className={`text-5xl font-bold ${isApproved ? "text-white" : "text-indigo-600"}`}
              >
                {displayLevel != null ? displayLevel.toFixed(2) : "—"}
              </p>
              <p
                className={`text-sm mt-1 ${isApproved ? "text-indigo-100" : "text-gray-400"}`}
              >
                คะแนนเฉลี่ย (avg)
              </p>
              <div className="mt-3">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${
                    isApproved
                      ? "bg-white/20 text-white"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {isApproved ? "✓ อาจารย์อนุมัติแล้ว" : "⏳ รออาจารย์อนุมัติ"}
                </span>
              </div>
              {!isApproved && (
                <p className="text-xs text-yellow-600 mt-2">
                  ผลนี้ยังไม่ final — รออาจารย์ตรวจสอบและอนุมัติก่อน
                </p>
              )}
            </div>

            {/* Level bar + class average */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>ระดับรวม</span>
                <span>
                  {displayLevel != null
                    ? `${displayLevel.toFixed(2)} / ${(gradesData.max_level ?? 4).toFixed(2)}`
                    : "—"}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${displayLevel != null ? (displayLevel / (gradesData.max_level ?? 4)) * 100 : 0}%`,
                  }}
                />
              </div>
              {gradesData.class_avg_level != null && (
                <div className="border-t border-gray-100 pt-3 mt-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="text-orange-500 font-medium">
                      ค่าเฉลี่ยชั้นเรียน
                    </span>
                    <span className="text-orange-500">
                      {gradesData.class_avg_level.toFixed(2)} / {(gradesData.max_level ?? 4).toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{
                        width: `${(gradesData.class_avg_level / (gradesData.max_level ?? 4)) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {displayLevel > gradesData.class_avg_level
                      ? "📈 ระดับของคุณสูงกว่าค่าเฉลี่ย"
                      : displayLevel === gradesData.class_avg_level
                        ? "➡️ ระดับของคุณเท่ากับค่าเฉลี่ย"
                        : "📉 ระดับของคุณต่ำกว่าค่าเฉลี่ย"}
                  </p>
                </div>
              )}
            </div>

            {/* ประวัติการส่งงาน + resubmit (ย้ายมาซ้าย) */}
            {history.length > 1 && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-3">
                  ประวัติการส่งงาน ({history.length} ครั้ง)
                </h2>
                <div className="space-y-2">
                  {history.map((h) => {
                    const histLevel =
                      h.final_level != null ? h.final_level : h.avg_level;
                    const isCurrent = h.id === Number(submissionId);
                    return (
                      <Link
                        key={h.id}
                        to={`/student/submissions/${h.id}`}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                          isCurrent
                            ? "bg-indigo-50 border-indigo-200"
                            : "bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm"
                        }`}
                      >
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">ครั้งที่ {h.attempt}</span>
                          <span className="text-gray-400 ml-2">
                            {new Date(h.submitted_at).toLocaleString("th-TH")}
                          </span>
                          {isCurrent && (
                            <span className="ml-2 text-xs text-indigo-500">(กำลังดู)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {histLevel != null && (
                            <span className="font-semibold text-gray-700">
                              {Number(histLevel).toFixed(2)}/{(h.max_level ?? 4).toFixed(2)}
                            </span>
                          )}
                          <span className="text-gray-300">→</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-center">
              <Link
                to={`/student/assignments/${submission?.assignment_id}`}
                className="text-sm text-indigo-500 hover:underline"
              >
                ส่งงานใหม่ (resubmit) →
              </Link>
            </div>
          </div>

          {/* ขวา: งานที่ส่ง + รายละเอียดแต่ละเกณฑ์ + Appeal */}
          <div className="space-y-4">
            {/* งานที่ส่ง */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="font-semibold text-gray-700 mb-3">งานที่ส่ง</h2>
              {submission?.submission_type === "image" ? (
                <SubmissionImage
                  submissionId={submission.id}
                  className="max-w-full rounded-lg border border-gray-200"
                />
              ) : submission?.content_text ? (
                <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                  {submission.content_text}
                </pre>
              ) : submission?.file_path ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  <span>📎</span>
                  <span className="font-mono">{submission.file_path.split("/").pop()}</span>
                  <span className="text-gray-400">(ไฟล์แนบ)</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">เนื้อหาถูกลบแล้ว</p>
              )}
            </div>

            {/* Per-criteria */}
            <div>
              <h2 className="font-semibold text-gray-700 mb-3">
                รายละเอียดแต่ละเกณฑ์
              </h2>
              <div className="space-y-4">
                {grades.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-medium text-gray-800">
                        {g.criteria_name}
                      </p>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700`}
                      >
                        {g.level}
                        {g.level_label ? ` — ${g.level_label}` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full"
                        style={{ width: `${(g.level / (g.max_score ?? 4)) * 100}%` }}
                      />
                    </div>
                    {g.reasoning && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          เหตุผล
                        </p>
                        <p className="text-sm text-gray-600">{g.reasoning}</p>
                      </div>
                    )}
                    {g.feedback && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-500 mb-1">
                          💡 คำแนะนำ
                        </p>
                        <p className="text-sm text-blue-700">{g.feedback}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Appeal section */}
            <div>
              {appeal && !showAppealForm ? (
                <div
                  className={`rounded-xl p-4 border ${
                    appeal.status === "resolved"
                      ? "bg-green-50 border-green-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    {appeal.status === "pending" && "⏳ Appeal รอการพิจารณา"}
                    {appeal.status === "resolved" && "✅ Appeal เสร็จสิ้น"}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    เหตุผล: {appeal.reason}
                  </p>
                  {appeal.teacher_response && (
                    <div className="bg-white rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        ความเห็นอาจารย์
                      </p>
                      <p className="text-sm text-gray-700">
                        {appeal.teacher_response}
                      </p>
                    </div>
                  )}
                  {appeal.status === "resolved" && isApproved && (
                    <div className="text-center mt-2">
                      <button
                        onClick={() => setShowAppealForm(true)}
                        className="text-sm text-orange-500 hover:underline"
                      >
                        ยังไม่เห็นด้วย? ส่ง Appeal ใหม่ →
                      </button>
                    </div>
                  )}
                </div>
              ) : isApproved && !showAppealForm ? (
                <div className="text-center">
                  <button
                    onClick={() => setShowAppealForm(true)}
                    className="text-sm text-orange-500 hover:underline"
                  >
                    ไม่เห็นด้วยกับคะแนน? ขอ Appeal →
                  </button>
                </div>
              ) : showAppealForm ? (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    ขอ Appeal คะแนน
                  </p>
                  <textarea
                    rows={3}
                    placeholder="ระบุเหตุผลที่ไม่เห็นด้วยกับคะแนน..."
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => appealMutation.mutate()}
                      disabled={
                        !appealReason.trim() || appealMutation.isPending
                      }
                      className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
                    >
                      {appealMutation.isPending ? "กำลังส่ง..." : "ส่ง Appeal"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAppealForm(false);
                        setAppealReason("");
                      }}
                      className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      ยกเลิก
                    </button>
                  </div>
                  {appealMutation.isError && (
                    <p className="text-red-500 text-xs mt-2">
                      {appealMutation.error?.response?.data?.error ||
                        "เกิดข้อผิดพลาด"}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
