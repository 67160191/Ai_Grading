import api from './client'

export const getCourses = (archived = false) => api.get('/courses', { params: { archived: archived ? 1 : 0 } }).then(r => r.data)
export const archiveCourse = (id) => api.patch(`/courses/${id}/archive`).then(r => r.data)
export const getCourse = (id) => api.get(`/courses/${id}`).then(r => r.data)
export const createCourse = (data) => api.post('/courses', data).then(r => r.data)
export const updateCourse = (id, data) => api.put(`/courses/${id}`, data).then(r => r.data)
export const deleteCourse = (id) => api.delete(`/courses/${id}`).then(r => r.data)
export const enrollCourse = (joinCode) => api.post('/courses/enroll', { join_code: joinCode }).then(r => r.data)
export const getCourseStudents = (id) => api.get(`/courses/${id}/students`).then(r => r.data)

export const getCourseRubrics = (courseId) =>
  api.get(`/courses/${courseId}/rubrics`).then(r => r.data)
export const createRubric = (courseId, data) =>
  api.post(`/courses/${courseId}/rubrics`, data).then(r => r.data)

export const getCourseAssignments = (courseId) =>
  api.get(`/courses/${courseId}/assignments`).then(r => r.data)
export const createAssignment = (courseId, data) =>
  api.post(`/courses/${courseId}/assignments`, data).then(r => r.data)

export const getCourseStats = (courseId) =>
  api.get(`/courses/${courseId}/stats`).then(r => r.data)

export const importStudents = (courseId, csv) =>
  api.post(`/courses/${courseId}/import-students`, { csv }).then(r => r.data)

export const removeStudent = (courseId, studentId) =>
  api.delete(`/courses/${courseId}/students/${studentId}`).then(r => r.data)

export const removeAllStudents = (courseId) =>
  api.delete(`/courses/${courseId}/students`).then(r => r.data)

export const enrollAllStudents = (courseId) =>
  api.post(`/courses/${courseId}/enroll-all`).then(r => r.data)

export const updateStudentGroup = (courseId, studentId, group_no) =>
  api.put(`/courses/${courseId}/students/${studentId}`, { group_no }).then(r => r.data)

export const resetStudentPassword = (courseId, studentId) =>
  api.put(`/courses/${courseId}/students/${studentId}/reset-password`).then(r => r.data)

export const duplicateCourse = (courseId, semester) =>
  api.post(`/courses/${courseId}/duplicate`, { semester }).then(r => r.data)

export const exportStudents = (courseId, format = 'csv') =>
  api.get(`/courses/${courseId}/students/export`, { params: { format }, responseType: 'blob' }).then(r => r.data)

export const exportGrades = (courseId, mode = 'latest', format = 'csv') =>
  api.get(`/courses/${courseId}/grades/export`, { params: { mode, format }, responseType: 'blob' }).then(r => r.data)

export const getTeacherSummary = () => api.get('/teacher/summary').then(r => r.data)

export const getCourseAnnouncements = (courseId) =>
  api.get(`/courses/${courseId}/announcements`).then((r) => r.data)

export const createAnnouncement = (courseId, data) =>
  api.post(`/courses/${courseId}/announcements`, data).then((r) => r.data)

export const deleteAnnouncement = (courseId, announcementId) =>
  api.delete(`/courses/${courseId}/announcements/${announcementId}`).then((r) => r.data)
