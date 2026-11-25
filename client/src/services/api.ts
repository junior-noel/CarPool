
import axios from 'axios'

// Backend URL from the Vite environment configuration.
// The fallback allows local development if the environment variable is missing.
const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Create one reusable Axios instance for all backend requests.
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach the saved JWT to requests when the user is authenticated.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }

    return config
  },
  (error) => Promise.reject(error),
)
