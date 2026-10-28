import api from './client'

export const getGradingSettings = () => api.get('/settings/grading').then(r => r.data)
export const updateGradingSettings = (settings) => api.put('/settings/grading', { settings }).then(r => r.data)
export const getOllamaStatus = () => api.get('/settings/ollama-status').then(r => r.data)
