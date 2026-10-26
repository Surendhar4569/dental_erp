import api from './api';

export const authService = {
  // Login with email and password
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  // Get current user profile using JWT token
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Logout current session and revoke token on server
  logout: async (reason = 'USER_LOGOUT') => {
    try {
      await api.post('/auth/logout', { reason });
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('dental_erp_token');
      localStorage.removeItem('dental_erp_user');
    }
  },

  // Check backend server and database health status
  checkHealth: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  // Get system roles
  getRoles: async () => {
    const response = await api.get('/auth/roles');
    return response.data;
  },
};
