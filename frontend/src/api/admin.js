import api from './client'

export const getAdminStats = () => api.get('/admin/stats').then(r => r.data)
export const getTeachers = () => api.get('/admin/users').then(r => r.data)
export const createTeacher = (data) => api.post('/admin/users', data).then(r => r.data)
export const resetTeacherPassword = (id, password) => api.put(`/admin/users/${id}/reset-password`, { password }).then(r => r.data)
export const deleteTeacher = (id) => api.delete(`/admin/users/${id}`).then(r => r.data)
export const getAdminLogs = (limit = 100) => api.get('/logs', { params: { limit } }).then(r => r.data)
export const getAdminGradingSettings = () => api.get('/admin/settings/grading').then(r => r.data)
export const updateAdminGradingSettings = (settings) => api.put('/admin/settings/grading', { settings }).then(r => r.data)
export const downloadBackup = () => api.get('/admin/backup/db', { responseType: 'blob' }).then(r => r.data)
export const downloadUploadsBackup = () => api.get('/admin/backup/uploads', { responseType: 'blob' }).then(r => r.data)
