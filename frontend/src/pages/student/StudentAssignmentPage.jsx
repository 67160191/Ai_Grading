import { useState } from "react";
import { useParams, Link, useNavigate, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getAssignment,
  submitAssignment,
  getMySubmissions,
  getAssignmentRubricOverride,
} from "../../api/assignments";
import { getRubric } from "../../api/grading";
import DrawingCanvas from "../../components/DrawingCanvas";

export default function StudentAssignmentPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [drawBlob, setDrawBlob] = useState(null);
  const [mode, setMode] = useState("text"); // 'text' | 'file' | 'draw'
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [rubricExpanded, setRubricExpanded] = useState(false);

  const { data: assignData, error: assignError } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => getAssignment(assignmentId),
    retry: false,
  });

  const assignment = assignData?.assignment;
  const pasteAllowed = assignment?.allow_paste !== 0;
  const blockPaste = (e) => {
    if (!pasteAllowed) e.preventDefault();
  };

  const { data: rubricData } = useQuery({
    queryKey: ["rubric", assignment?.rubric_id],
    queryFn: () => getRubric(assignment.rubric_id),
    enabled: !!assignment?.rubric_id,
  });

  const { data: overrideData } = useQuery({
    queryKey: ["rubric-override", assignmentId],
    queryFn: () => getAssignmentRubricOverride(assignmentId),
    enabled: !!assignmentId,
  });

  const { data: mySubsData, refetch: refetchMySubmissions } = useQuery({
    queryKey: ["my-submissions", assignmentId],
    queryFn: () => getMySubmissions(assignmentId),
  });
  const mySubmissions = mySubsData?.submissions ?? [];

  const submitMutation = useMutation({
    mutationFn: (formData) => submitAssignment(assignmentId, formData),
    onSuccess: () => {
      refetchMySubmissions();
      setText("");
      setFile(null);
      setExtractedText("");
      setDrawBlob(null);
    },
    onError: (err) => setError(err.response?.data?.error || "เกิดข้อผิดพลาด"),
  });

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setExtracting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/assignments/extract-text", {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "ไม่สามารถอ่านไฟล์");
      }

      const data = await response.json();
      setExtractedText(data.text);
    } catch (err) {
      setError(err.message);
      setFile(null);
      setExtractedText("");
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const formData = new FormData();
    if (mode === "text") {
      formData.append("content_text", text.trim());
    } else if (mode === "file" && extractedText) {
      formData.append("content_text", extractedText.trim());
    } else if (mode === "draw" && drawBlob) {
      formData.append("submission_type", "image");
      formData.append("file", drawBlob, "drawing.png");
    }
    submitMutation.mutate(formData);
  };

  const deadlineBadge = (() => {
    if (!assignment?.deadline) return null;
    const now = new Date();
    const dl = new Date(assignment.deadline);
    const diffMs = dl - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));
    let badge = null;
    if (diffMs < 0) {
      badge = (
        <span className="ml-2 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
          เลยกำหนดแล้ว
        </span>
      );
    } else if (diffHours < 1) {
      badge = (
        <span className="ml-2 bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-medium">
          เหลือ {diffMins} นาที
        </span>
      );
    } else if (diffDays < 1) {
      badge = (
        <span className="ml-2 bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-medium">
          เหลือ {diffHours} ชั่วโมง
        </span>
      );
    } else if (diffDays <= 3) {
      badge = (
        <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">
          เหลือ {diffDays} วัน
        </span>
      );
    }
    return (
      <p className="text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-1">
        กำหนดส่ง: {dl.toLocaleString("th-TH")}
        {badge}
      </p>
    );
  })();

  const isOverride = !!overrideData?.override;
  const rubricName = isOverride
    ? "เกณฑ์การตรวจ (กำหนดพิเศษ)"
    : rubricData?.rubric
      ? `เกณฑ์การตรวจ: ${rubricData.rubric.name}`
      : null;
  const criteria = isOverride
    ? overrideData.override.criteria
    : rubricData?.rubric?.criteria;

  const statusMap = {
    pending: { label: "รอตรวจ", cls: "bg-yellow-100 text-yellow-700" },
    grading: { label: "กำลังตรวจ", cls: "bg-blue-100 text-blue-700" },
    graded: { label: "ตรวจแล้ว", cls: "bg-indigo-100 text-indigo-700" },
    approved: { label: "อนุมัติแล้ว", cls: "bg-green-100 text-green-700" },
    rejected: { label: "ส่งคืน", cls: "bg-red-100 text-red-700" },
  };

  if (assignError) {
    if (assignError.response?.status === 404) {
      return (
        <div>
          <div className="mb-4">
            <Link
              to="/student/courses"
              className="text-sm text-indigo-500 hover:underline"
            >
              ← วิชาของฉัน
            </Link>
          </div>
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-4">🔒</p>
            <p className="text-lg font-medium text-gray-600">
              งานนี้ยังไม่เปิดรับ
            </p>
            <p className="text-sm mt-1">อาจารย์ยังไม่เปิดรับการส่งงานนี้</p>
          </div>
        </div>
      );
    }
    return <Navigate to="/student/courses" replace />;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/student/courses"
          className="text-sm text-indigo-500 hover:underline"
        >
          ← วิชาของฉัน
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* ซ้าย: โจทย์ + Rubric */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {assignment?.title}
            </h1>
            {deadlineBadge}
          </div>

          {assignment?.description && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">โจทย์</p>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">
                {assignment.description}
              </p>
            </div>
          )}

          {/* Rubric */}
          {!rubricName && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-400">ไม่มีเกณฑ์การตรวจ</p>
            </div>
          )}
          {rubricName && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <button
                type="button"
                onClick={() => setRubricExpanded((v) => !v)}
                className="w-full flex justify-between items-center"
              >
                <p className="text-sm font-semibold text-indigo-700">
                  {rubricName}
                </p>
                <span className="text-xs text-indigo-500">
                  {rubricExpanded ? "− ซ่อน" : "+ แสดง"}
                </span>
              </button>
              {rubricExpanded && (
                <div className="space-y-3 mt-3">
                  {criteria?.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white rounded-lg p-3 border border-indigo-100"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-800">
                          {c.name}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-gray-500 mb-2">
                          {c.description}
                        </p>
                      )}
                      {c.levels?.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-2">
                          {c.levels.map((lv) => (
                            <div
                              key={lv.score ?? lv.id}
                              className="rounded border px-2 py-1.5 text-xs bg-gray-50 border-gray-200 text-gray-600"
                            >
                              <span className="font-medium">
                                {lv.score}
                                {lv.label ? ` — ${lv.label}` : ""}
                              </span>
                              {lv.description && (
                                <span className="ml-1 font-normal text-gray-900">
                                  {lv.description}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ขวา: ฟอร์มส่งงาน + ประวัติ */}
        <div className="space-y-4">
          <form
            onSubmit={handleSubmit}
            className={
              isExpanded
                ? "fixed inset-0 z-50 bg-white p-5 overflow-y-auto"
                : "bg-white border border-gray-200 rounded-xl p-5"
            }
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">ส่งงาน</h2>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                title={isExpanded ? "ย่อกลับ" : "ขยายเต็มจอ"}
              >
                {isExpanded ? "⤡ ย่อกลับ" : "⤢ ขยายเต็มจอ"}
              </button>
            </div>

            {!pasteAllowed && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                งานนี้อาจารย์กำหนดให้พิมพ์คำตอบเองเท่านั้น ห้ามวาง (paste)
                ข้อความและไม่รองรับการอัปโหลดไฟล์
              </p>
            )}
            {pasteAllowed && (
              <div className="flex rounded-lg bg-gray-100 p-1 mb-4 w-fit">
                {[
                  ["text", "พิมพ์ข้อความ"],
                  ["draw", "วาด/เขียน"],
                  ["file", "อัปโหลดไฟล์"],
                ].map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                      mode === m
                        ? "bg-white shadow text-gray-800"
                        : "text-gray-500"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {mode === "text" || !pasteAllowed ? (
              <div>
                <textarea
                  required
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={blockPaste}
                  onDrop={blockPaste}
                  placeholder="พิมพ์คำตอบหรือโค้ดที่นี่..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-xs mt-1 text-right text-gray-400">
                  {text.length.toLocaleString()} ตัวอักษร
                </p>
              </div>
            ) : mode === "draw" ? (
              <DrawingCanvas onChange={setDrawBlob} />
            ) : (
              <div className="space-y-3">
                {!extractedText ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                      disabled={extracting}
                    />
                    <label
                      htmlFor="file-upload"
                      className={`${extracting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <p className="text-gray-500 text-sm">
                        {extracting
                          ? "กำลังอ่านไฟล์..."
                          : "คลิกเพื่อเลือกไฟล์ (PDF, DOCX, TXT)"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        ขนาดไฟล์สูงสุด 20MB
                      </p>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-700 font-medium mb-1">
                        ✓ อ่านไฟล์เสร็จแล้ว: {file?.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setExtractedText("");
                        }}
                        className="text-xs text-green-600 hover:text-green-700 underline"
                      >
                        เลือกไฟล์อื่น
                      </button>
                    </div>
                    <textarea
                      required
                      rows={12}
                      value={extractedText}
                      onChange={(e) => setExtractedText(e.target.value)}
                      placeholder="ข้อความที่อ่านจากไฟล์ (สามารถแก้ไขได้)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-xs text-gray-400">
                      {extractedText.length.toLocaleString()} ตัวอักษร
                    </p>
                  </div>
                )}
              </div>
            )}

            {submitMutation.isSuccess && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium text-center">
                ✓ ส่งงานสำเร็จเรียบร้อยแล้ว
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

            <button
              type="submit"
              disabled={
                submitMutation.isPending ||
                (mode === "text" && !text.trim()) ||
                (mode === "file" && !extractedText.trim()) ||
                (mode === "draw" && !drawBlob)
              }
              className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitMutation.isPending ? "กำลังส่งงาน..." : "ส่งงาน"}
            </button>
          </form>

          {mySubmissions.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-700 mb-3">
                ประวัติการส่งงาน
              </h2>
              <div className="space-y-2">
                {mySubmissions.map((sub) => {
                  const st = statusMap[sub.status] ?? {
                    label: sub.status,
                    cls: "bg-gray-100 text-gray-600",
                  };
                  const hasScore = sub.avg_level != null;
                  return (
                    <Link
                      key={sub.id}
                      to={`/student/submissions/${sub.id}`}
                      className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-gray-700 shrink-0">
                          ครั้งที่ {sub.attempt}
                        </span>
                        <span className="text-xs text-gray-400 truncate">
                          {new Date(sub.submitted_at).toLocaleString("th-TH")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        {hasScore && (
                          <span
                            className={`text-sm font-semibold px-2 py-1 rounded-lg ${
                              sub.avg_level >= 3.5
                                ? "bg-green-100 text-green-700"
                                : sub.avg_level >= 2.5
                                  ? "bg-yellow-100 text-yellow-700"
                                  : sub.avg_level >= 1.5
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-red-100 text-red-700"
                            }`}
                          >
                            {Number(sub.avg_level).toFixed(2)}/{Number(sub.max_level ?? 4).toFixed(2)}
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
      </div>
    </div>
  );
}
