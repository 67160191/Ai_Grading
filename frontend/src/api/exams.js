import api from "./client";
import { triggerFileDownload } from "../utils/download";

export async function getCourseExams(courseId) {
  const res = await api.get(`/courses/${courseId}/exams`);
  return res.data;
}

export async function createExam(courseId, data) {
  const res = await api.post(`/courses/${courseId}/exams`, data);
  return res.data;
}

export async function getExam(id) {
  const res = await api.get(`/exams/${id}`);
  return res.data;
}

export async function updateExam(id, data) {
  const res = await api.put(`/exams/${id}`, data);
  return res.data;
}

export async function deleteExam(id) {
  const res = await api.delete(`/exams/${id}`);
  return res.data;
}

export async function publishExam(id, isPublished) {
  const res = await api.put(`/exams/${id}/publish`, { is_published: isPublished });
  return res.data;
}

export async function startExam(id) {
  const res = await api.post(`/exams/${id}/start`);
  return res.data;
}

export async function submitExam(id, data) {
  const res = await api.post(`/exams/${id}/submit`, data);
  return res.data;
}

export async function getExamSubmissions(id) {
  const res = await api.get(`/exams/${id}/submissions`);
  return res.data;
}

export async function getExamSubmission(submissionId) {
  const res = await api.get(`/exam-submissions/${submissionId}`);
  return res.data;
}

export async function gradeExamSubmission(submissionId, data) {
  const res = await api.put(`/exam-submissions/${submissionId}/grade`, data);
  return res.data;
}

export async function aiGradeJava(submissionId, questionId) {
  const res = await api.post(`/exam-submissions/${submissionId}/ai-grade-java`, {
    question_id: questionId,
  });
  return res.data;
}

export async function exportExamResults(id, filename, format = "csv") {
  const ext = format === "xls" ? "xls" : "csv";
  const defaultFilename = filename
    ? filename.endsWith(`.${ext}`)
      ? filename
      : `${filename.replace(/\.(csv|xls)$/, "")}.${ext}`
    : `exam_results.${ext}`;
  const res = await api.get(`/exams/${id}/export`, {
    params: { format: ext },
    responseType: "blob",
  });
  triggerFileDownload(res.data, defaultFilename);
}

export async function autosaveExam(id, data) {
  const res = await api.post(`/exams/${id}/autosave`, data);
  return res.data;
}

export async function batchAiGrade(id) {
  const res = await api.post(`/exams/${id}/batch-ai-grade`);
  return res.data;
}

export async function getExamSimilarity(id) {
  const res = await api.get(`/exams/${id}/similarity`);
  return res.data;
}

export async function getExamReview(id) {
  const res = await api.get(`/exams/${id}/review`);
  return res.data;
}

