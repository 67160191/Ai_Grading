import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCourse, getCourseAssignments } from "../../api/courses";
import { getCourseExams } from "../../api/exams";

const statusLabel = {
  pending: { text: "รอตรวจ", cls: "bg-yellow-100 text-yellow-700" },
  grading: { text: "กำลังตรวจ", cls: "bg-blue-100 text-blue-700" },
  graded: { text: "ตรวจแล้ว", cls: "bg-indigo-100 text-indigo-700" },
  approved: { text: "อนุมัติแล้ว", cls: "bg-green-100 text-green-700" },
  rejected: { text: "ปฏิเสธ", cls: "bg-red-100 text-red-700" },
};

export default function StudentCourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("assignments");

  const { data: courseData, error: courseError } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => getCourse(courseId),
    retry: false,
  });

  const { data: assignData, isLoading } = useQuery({
    queryKey: ["student-assignments", courseId],
    queryFn: () => getCourseAssignments(courseId),
    refetchInterval: (data) =>
      data?.assignments?.some((a) =>
        ["pending", "grading"].includes(a.latest_status),
      )
        ? 5000
        : false,
    retry: false,
  });

  const { data: examsData, isLoading: examsLoading } = useQuery({
    queryKey: ["student-exams", courseId],
    queryFn: () => getCourseExams(courseId),
    enabled: activeTab === "exams",
    retry: false,
  });

  useEffect(() => {
    if (courseError) navigate("/student/courses", { replace: true });
  }, [courseError]);

  const course = courseData?.course;
  const assignments = assignData?.assignments || [];

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/student/courses"
          className="text-sm text-indigo-500 hover:underline"
        >
          ← วิชาของฉัน
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">
          {course?.name || "..."}
        </h1>
        {course?.description && (
          <p className="text-sm text-gray-500 mt-0.5">{course.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {[
          ["assignments", "งาน (Assignments)"],
          ["exams", "ห้องสอบ (Exams)"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ASSIGNMENTS TAB */}
      {activeTab === "assignments" && (
        <>
          {isLoading ? (
            <p className="text-gray-400 text-center py-10">กำลังโหลด...</p>
          ) : assignments.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">ยังไม่มีงานในวิชานี้</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => {
                const hasSubmission = !!a.latest_submission_id;
                const st = statusLabel[a.latest_status];
                const isGraded = ["graded", "approved"].includes(a.latest_status);
                const avgLevel =
                  isGraded && a.latest_avg_level != null
                    ? Number(a.latest_avg_level).toFixed(2)
                    : null;

                return (
                  <Link
                    key={a.id}
                    to={`/student/assignments/${a.id}`}
                    className="block bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-800">{a.title}</p>
                          {a.assignment_type && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {a.assignment_type === "essay"
                                ? "Essay"
                                : a.assignment_type === "problem_set"
                                  ? "Problem Set"
                                  : a.assignment_type === "code_review"
                                    ? "Code Review"
                                    : "Other"}
                            </span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                            {a.description}
                          </p>
                        )}
                        {a.deadline && (
                          <p className="text-xs text-red-400 mt-1">
                            กำหนดส่ง:{" "}
                            {new Date(a.deadline).toLocaleDateString("th-TH", {
                              dateStyle: "medium",
                            })}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {hasSubmission ? (
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.cls}`}
                            >
                              {st?.text}
                            </span>
                            {isGraded && avgLevel != null && (
                              <span className="text-sm font-bold text-indigo-600">
                                {avgLevel}
                                <span className="text-xs font-normal text-gray-400">
                                  /{Number(a.latest_max_level ?? 4).toFixed(2)}
                                </span>
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              ครั้งที่ {a.latest_attempt} ·{" "}
                              {new Date(a.latest_submitted_at).toLocaleDateString(
                                "th-TH",
                                { dateStyle: "short" },
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-indigo-500">ส่งงาน →</span>
                        )}
                      </div>
                    </div>

                    {isGraded && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{
                              width: `${avgLevel != null ? (Number(avgLevel) / Number(a.latest_max_level ?? 4)) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* EXAMS TAB */}
      {activeTab === "exams" && (
        <>
          {examsLoading ? (
            <p className="text-gray-400 text-center py-10">กำลังโหลดห้องสอบ...</p>
          ) : examsData?.exams?.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
              <p className="text-lg">ยังไม่มีห้องสอบในวิชานี้</p>
            </div>
          ) : (
            <div className="space-y-3">
              {examsData?.exams?.map((e) => {
                const isSubmitted = ["submitted", "graded"].includes(e.submission_status);
                const isGraded = e.submission_status === "graded";
                const isPublished = e.is_published === 1 && isGraded;
                const inProgress = e.submission_status === "in_progress";

                let targetUrl = `/student/exams/${e.id}`;
                if (isSubmitted) {
                  targetUrl = `/student/exams/${e.id}/result`;
                }

                return (
                  <div
                    key={e.id}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 transition-all shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800 text-base">
                            {e.title}
                          </span>
                          <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                            ⏱️ {e.duration_minutes} นาที
                          </span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {e.question_count} ข้อ ({e.total_points} คะแนน)
                          </span>
                        </div>

                        {e.description && (
                          <p className="text-xs text-gray-500 mt-1">{e.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isPublished ? (
                          <div className="text-right">
                            <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-bold block mb-1">
                              ✓ ประกาศคะแนนแล้ว
                            </span>
                            <span className="text-sm font-bold text-indigo-600">
                              ได้ {e.score} / {e.total_points} คะแนน
                            </span>
                          </div>
                        ) : isSubmitted ? (
                          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-medium">
                            ส่งแล้ว (รอตรวจ/ประกาศคะแนน)
                          </span>
                        ) : inProgress ? (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-medium animate-pulse">
                            กำลังทำข้อสอบอยู่...
                          </span>
                        ) : null}

                        <Link
                          to={targetUrl}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isSubmitted
                              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              : inProgress
                                ? "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                          }`}
                        >
                          {isPublished
                            ? "ดูผลคะแนนและเฉลย →"
                            : isSubmitted
                              ? "ดูสถานะการส่ง →"
                              : inProgress
                                ? "ทำข้อสอบต่อ →"
                                : "เข้าสู่ห้องสอบ →"}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
