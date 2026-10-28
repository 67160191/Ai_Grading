import api from './client'
import { triggerFileDownload } from '../utils/download'

export const getAssignment = (id) => api.get(`/assignments/${id}`).then(r => r.data)
export const updateAssignment = (id, data) => api.put(`/assignments/${id}`, data).then(r => r.data)
export const deleteAssignment = (id) => api.delete(`/assignments/${id}`).then(r => r.data)

export const submitAssignment = (id, formData) =>
  api.post(`/assignments/${id}/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)

export const getAssignmentSubmissions = (id) =>
  api.get(`/assignments/${id}/submissions`).then(r => r.data)

export const getMySubmissions = (id) =>
  api.get(`/assignments/${id}/my-submissions`).then(r => r.data)

export const getAssignmentRubricOverride = (id) =>
  api.get(`/assignments/${id}/rubric-override`).then(r => r.data)
export const saveAssignmentRubricOverride = (id, criteria) =>
  api.put(`/assignments/${id}/rubric-override`, { criteria }).then(r => r.data)
export const generateOverrideDraft = (id, task, count) =>
  api.post(`/assignments/${id}/rubric-override/generate`, { task, count }).then(r => r.data)

export const getAssignmentConsistency = (id) =>
  api.get(`/assignments/${id}/consistency`).then(r => r.data)

export const getCalibrationExamples = (id) =>
  api.get(`/assignments/${id}/calibration-examples`).then(r => r.data)
export const saveCalibrationExamples = (id, examples) =>
  api.put(`/assignments/${id}/calibration-examples`, { examples }).then(r => r.data)

export const toggleAssignmentOpen = (id) =>
  api.patch(`/assignments/${id}/open`).then(r => r.data)

export const exportAssignment = async (id, filename, format = 'csv') => {
  const ext = format === 'xls' ? 'xls' : 'csv'
  const defaultFilename = filename ? (filename.endsWith(`.${ext}`) ? filename : `${filename.replace(/\.(csv|xls)$/, '')}.${ext}`) : `scores.${ext}`
  const res = await api.get(`/assignments/${id}/export`, {
    params: { format: ext },
    responseType: 'blob'
  })
  triggerFileDownload(res.data, defaultFilename)
}

export const exportAssignmentCSV = (id, filename) => exportAssignment(id, filename, 'csv')
