import axios from 'axios'
import safeStorage from '../utils/storage'

const api = axios.create({ baseURL: '/api' })

// ใส่ token อัตโนมัติทุก request
api.interceptors.request.use(config => {
  const token = safeStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ถ้า 401 → logout
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      safeStorage.removeItem('token')
      safeStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
