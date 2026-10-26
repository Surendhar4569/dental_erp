import axios from 'axios';

// Create Centralized Axios Client
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request Interceptor: Attach JWT Bearer Token and active Branch ID if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dental_erp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const activeBranchId = localStorage.getItem('dental_erp_active_branch_id');
    if (activeBranchId) {
      config.headers['X-Branch-ID'] = activeBranchId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Global Error and Unauthorized handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token if invalid or expired
      localStorage.removeItem('dental_erp_token');
      localStorage.removeItem('dental_erp_user');
      localStorage.removeItem('dental_erp_active_branch_id');
      // If not already on login, dispatch custom event or reload
      if (window.location.pathname !== '/login') {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    } else if (error.response && error.response.status === 403) {
      // If forbidden due to inactive or unauthorized branch
      const msg = error.response.data?.message || '';
      if (msg.toLowerCase().includes('branch')) {
        window.dispatchEvent(new CustomEvent('branch:access_denied', { detail: { message: msg } }));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
