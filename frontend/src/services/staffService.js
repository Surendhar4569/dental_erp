import api from './api';

export const staffService = {
  /**
   * Fetch paginated staff list with filtering and search
   */
  async getStaffList(params = {}) {
    const response = await api.get('/staff', { params });
    return response.data;
  },

  /**
   * Fetch single staff member details
   */
  async getStaffById(id) {
    const response = await api.get(`/staff/${id}`);
    return response.data;
  },

  /**
   * Create a new staff member (with optional login account)
   */
  async createStaff(data) {
    const response = await api.post('/staff', data);
    return response.data;
  },

  /**
   * Update existing staff details
   */
  async updateStaff(id, data) {
    const response = await api.put(`/staff/${id}`, data);
    return response.data;
  },

  /**
   * Deactivate staff member
   */
  async deactivateStaff(id) {
    const response = await api.patch(`/staff/${id}/deactivate`);
    return response.data;
  },

  /**
   * Get eligible doctors/dentists for current branch
   */
  async getEligibleDoctors() {
    const response = await api.get('/staff/doctors/eligible');
    return response.data;
  },

  /**
   * Get active clinic staff members not yet assigned to this branch
   */
  async getUnassignedStaffForBranch(branchId) {
    const response = await api.get(`/staff/branches/${branchId}/unassigned`);
    return response.data;
  },

  /**
   * Assign an existing staff member to an additional branch
   */
  async assignStaffToBranch(branchId, staffId) {
    const response = await api.post(`/staff/branches/${branchId}/assign`, { staffId });
    return response.data;
  },

  /**
   * Remove staff member from a branch
   */
  async removeStaffFromBranch(branchId, staffId) {
    const response = await api.delete(`/staff/branches/${branchId}/staff/${staffId}`);
    return response.data;
  },
};
