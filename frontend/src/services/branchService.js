import api from './api';

export const branchService = {
  // List branches accessible to the authenticated user
  getBranches: async (params = {}) => {
    const response = await api.get('/branches', { params });
    return response.data;
  },

  // Get single branch details
  getBranchById: async (id) => {
    const response = await api.get(`/branches/${id}`);
    return response.data;
  },

  // Create a new branch (Admin only)
  createBranch: async (branchData) => {
    const response = await api.post('/branches', branchData);
    return response.data;
  },

  // Update existing branch (Admin only)
  updateBranch: async (id, branchData) => {
    const response = await api.put(`/branches/${id}`, branchData);
    return response.data;
  },

  // Activate or deactivate a branch (Admin only)
  updateBranchStatus: async (id, isActive) => {
    const response = await api.patch(`/branches/${id}/status`, { is_active: isActive });
    return response.data;
  },

  // Get users assigned to a branch
  getBranchUsers: async (id, includeAvailable = false) => {
    const response = await api.get(`/branches/${id}/users`, {
      params: { available: includeAvailable },
    });
    return response.data;
  },

  // Assign a user to a branch (Admin only)
  assignUserToBranch: async (id, userId, isDefault = false) => {
    const response = await api.post(`/branches/${id}/users`, {
      userId,
      isDefault,
    });
    return response.data;
  },

  // Remove a user assignment from a branch (Admin only)
  removeUserFromBranch: async (id, userId) => {
    const response = await api.delete(`/branches/${id}/users/${userId}`);
    return response.data;
  },

  // Get real-time statistics for a branch
  getBranchStats: async (id) => {
    const response = await api.get(`/branches/${id}/stats`);
    return response.data;
  },
};
