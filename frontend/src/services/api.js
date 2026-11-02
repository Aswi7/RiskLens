import axios from 'axios'

// Create a configured Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8000'),
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to attach JWT token if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)
// Response interceptor to handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('risklens_user')
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register' &&
        window.location.pathname !== '/'
      ) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(error)
  }
)

// Lab Analysis API Service methods
export const uploadLabReport = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/lab-reports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  })
  return res.data
}

export const confirmLabReportById = async (reportId, payload) => {
  const res = await api.post(`/lab-reports/${reportId}/confirm`, payload)
  return res.data
}

export const listLabReports = async (page = 1, limit = 10) => {
  const res = await api.get(`/lab-reports?page=${page}&limit=${limit}`)
  return res.data
}

// Backwards-compatible aliases
export const extractLabReport = uploadLabReport
export const confirmLabReport = async (payload) => {
  const reportId = payload.id || 'draft'
  return confirmLabReportById(reportId, payload)
}
export const getLabReportsHistory = async (limit = 20) => {
  const data = await listLabReports(1, limit)
  return data.reports || []
}


export const predictRisk = async (payload) => {
  const res = await api.post('/predict', payload)
  return res.data
}

export const simulateWhatIf = async (changeableInputs) => {
  const res = await api.post('/what-if', changeableInputs)
  return res.data
}

export default api

