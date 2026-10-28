import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getExam, getExamSubmission } from "../../api/exams";

export default function StudentExamResultPage() {
  const { examId } = useParams();

  const { data: examData, isLoading: examLoading } = useQuery({
    queryKey: ["student-exam-meta", examId],
    queryFn: () => getExam(examId),
  });

  const submissionId = examData?.submission?.id;

  const { data: subDetail, isLoading: subLoading } = useQuery({
    queryKey: ["student-exam-sub-detail", submissionId],
    queryFn: () => getExamSubmission(submissionId),
    enabled: !!submissionId,
  });

  if (examLoading || (submissionId && subLoading)) {
    return <div className="text-center py-20 text-gray-500">กำลังโหลดผลคะแนน...</div>;
  }

  const { exam, course, submission } = examData || {};
  const isPublished = exam?.is_published === 1 && submission?.status === "graded";
  const { questions } = subDetail || {};

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div>
        <Link
          to={`/student/courses/${exam?.course_id}`}
          className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mb-2"
        >
          ← กลับไปยังวิชา {course?.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{exam?.title}</h1>
        {exam?.description && (
          <p className="text-sm text-gray-500 mt-0.5">{exam.description}</p>
        )}
      </div>

      {/* Main Status / Score Card */}
      {!isPublished ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto text-3xl">
            📝
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">ส่งข้อสอบเรียบร้อยแล้ว</h2>
            <p className="text-sm text-gray-500 mt-1">
              ระบบได้รับคำตอบของคุณแล้ว ขณะนี้อาจารย์กำลังดำเนินการตรวจข้อสอบ
            </p>
          </div>
          <div className="inline-block bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-600">
            ส่งเมื่อ:{" "}
            {submission?.submitted_at
              ? new Date(submission.submitted_at).toLocaleString("th-TH")
              : "-"}
          </div>
          <p className="text-xs text-gray-400">
            * ผลคะแนนและคำแนะนำจะแสดงในหน้านี้เมื่ออาจารย์กดประกาศคะแนน
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Score Hero Card */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl p-6 sm:p-8 shadow-md">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
              <div>
                <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full font-medium uppercase tracking-wider">
                  ผลการประเมินคะแนน
                </span>
                <h2 className="text-xl sm:text-2xl font-bold mt-2">
                  สรุปผลคะแนนสอบ
                </h2>
                <p className="text-indigo-100 text-xs mt-1">
                  ส่งเมื่อ:{" "}
                  {submission?.submitted_at
                    ? new Date(submission.submitted_at).toLocaleString("th-TH")
                    : "-"}
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-6 py-4 text-center">
                <p className="text-xs text-indigo-100 uppercase tracking-wider">คะแนนรวม</p>
                <div className="text-4xl sm:text-5xl font-extrabold mt-1">
                  {submission?.score ?? 0}{" "}
                  <span className="text-xl sm:text-2xl font-normal text-indigo-200">
                    / {submission?.max_score ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Overall Feedback */}
            {submission?.overall_feedback && (
              <div className="mt-6 pt-6 border-t border-white/20 bg-white/10 rounded-xl p-4 text-xs sm:text-sm leading-relaxed">
                <p className="font-semibold text-indigo-100 mb-1">
                  💬 ข้อเสนอแนะจากอาจารย์:
                </p>
                <p className="text-white whitespace-pre-wrap">
                  {submission.overall_feedback}
                </p>
              </div>
            )}
          </div>

          {/* Breakdown per Question */}
          <div className="space-y-4">
            <h3 className="font-bold text-gray-800 text-base">รายละเอียดคำตอบรายข้อ</h3>

            {questions?.map((q, idx) => {
              const isMcq = q.question_type === "mcq";
              const isCoding = q.question_type === "coding";
              const earnedScore = q.manual_score != null ? q.manual_score : q.auto_score;

              return (
                <div
                  key={q.id}
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                        {isCoding ? "Java Coding" : isMcq ? "ช้อยส์ / ปรนัย" : "ข้อเขียน"}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">
                        ได้ {earnedScore} / {q.points} คะแนน
                      </span>
                    </div>
                  </div>

                  {/* Prompt */}
                  <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">
                    {q.prompt}
                  </p>

                  {/* MCQ Options Display */}
                  {isMcq && (
                    <div className="space-y-1.5 pt-1">
                      {q.options?.map((opt, oIdx) => {
                        const optVal = typeof opt === "string" ? opt : opt.text;
                        const optId = typeof opt === "string" ? String(oIdx + 1) : opt.id || String(oIdx + 1);
                        const isSelected = q.student_answer === optId || q.student_answer === optVal;
                        const isCorrect = q.correct_option === optId || q.correct_option === optVal;

                        let style = "bg-gray-50 border-gray-200 text-gray-600";
                        if (isSelected && isCorrect) {
                          style = "bg-green-50 border-green-300 text-green-900 font-medium";
                        } else if (isSelected && !isCorrect) {
                          style = "bg-red-50 border-red-300 text-red-900 font-medium";
                        } else if (!isSelected && isCorrect) {
                          style = "bg-green-50/50 border-green-200 text-green-700 border-dashed";
                        }

                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${style}`}
                          >
                            <span>{optVal}</span>
                            {isSelected && (
                              <span className="font-bold">
                                {isCorrect ? "✓ คำตอบของคุณ (ถูกต้อง)" : "✗ คำตอบของคุณ (ไม่ถูกต้อง)"}
                              </span>
                            )}
                            {!isSelected && isCorrect && (
                              <span className="text-green-600 font-medium">★ เฉลยที่ถูกต้อง</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Java Code Display */}
                  {isCoding && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-gray-500">โค้ด Java ที่คุณส่ง:</p>
                      <div className="rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100 overflow-x-auto border border-slate-700">
                        <pre className="whitespace-pre">
                          {q.student_answer || "(ไม่ได้เขียนโค้ด)"}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Short Answer Display */}
                  {!isMcq && !isCoding && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-800 whitespace-pre-wrap">
                      <p className="font-semibold text-gray-500 mb-1">คำตอบของคุณ:</p>
                      {q.student_answer || "(ไม่ได้ระบุ)"}
                    </div>
                  )}

                  {/* Question Feedback */}
                  {q.feedback && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mt-2">
                      <p className="font-semibold mb-0.5">💬 ข้อเสนอแนะในข้อนี้:</p>
                      <p className="whitespace-pre-wrap text-amber-800">{q.feedback}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

