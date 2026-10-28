import api from './client'

export const getSubmission = (id) => api.get(`/submissions/${id}`).then(r => r.data)
export const getGrades = (submissionId) =>
  api.get(`/submissions/${submissionId}/grades`).then(r => r.data)
export const gradeSubmission = (submissionId) =>
  api.post(`/submissions/${submissionId}/grade`).then(r => r.data)
export const approveSubmission = (submissionId, data) =>
  api.put(`/submissions/${submissionId}/approve`, data).then(r => r.data)
export const getJobStatus = (jobId) =>
  api.get(`/jobs/${jobId}/status`).then(r => r.data)

export const getRubric = (id) => api.get(`/rubrics/${id}`).then(r => r.data)
export const getMySubmissions = () => api.get('/student/submissions').then(r => r.data)
export const updateRubric = (id, data) => api.put(`/rubrics/${id}`, data).then(r => r.data)
export const deleteRubric = (id) => api.delete(`/rubrics/${id}`).then(r => r.data)
export const generateRubricDraft = (task, count) =>
  api.post('/rubrics/generate', { task, count }).then(r => r.data)

// Appeals
export const getAppeal = (submissionId) =>
  api.get(`/submissions/${submissionId}/appeal`).then(r => r.data)
export const submitAppeal = (submissionId, reason) =>
  api.post(`/submissions/${submissionId}/appeal`, { reason }).then(r => r.data)
export const getAppeals = () => api.get('/appeals').then(r => r.data)
export const getAppealCount = () => api.get('/appeals/count').then(r => r.data)
export const getAssignmentPendingAppeals = (assignmentId) =>
  api.get(`/assignments/${assignmentId}/appeals`).then(r => r.data)
export const respondAppeal = (appealId, data) =>
  api.put(`/appeals/${appealId}`, data).then(r => r.data)

export const getSubmissionContent = (submissionId) =>
  api.get(`/submissions/${submissionId}/content`).then(r => r.data)

export const getSubmissionFile = (submissionId) =>
  api.get(`/submissions/${submissionId}/file`, { responseType: 'blob' }).then(r => r.data)

export const getSubmissionHistory = (submissionId) =>
  api.get(`/submissions/${submissionId}/history`).then(r => r.data)

export const getSubmissionNeighbors = (submissionId) =>
  api.get(`/submissions/${submissionId}/neighbors`).then(r => r.data)

export const bulkApprove = (assignmentId) =>
  api.post(`/assignments/${assignmentId}/bulk-approve`).then(r => r.data)

export const getSubmissionAudit = (submissionId) =>
  api.get(`/submissions/${submissionId}/audit`).then(r => r.data)

export const getPreviewPrompt = (submissionId) =>
  api.get(`/submissions/${submissionId}/preview-prompt`).then(r => r.data)

// Assignment Grading Settings
export const getAssignmentGradingSettings = (assignmentId) =>
  api.get(`/assignments/${assignmentId}/grading-settings`).then(r => r.data)

export const updateAssignmentGradingSettings = (assignmentId, settings) =>
  api.put(`/assignments/${assignmentId}/grading-settings`, settings).then(r => r.data)

export const deleteAssignmentGradingSettings = (assignmentId) =>
  api.delete(`/assignments/${assignmentId}/grading-settings`).then(r => r.data)
