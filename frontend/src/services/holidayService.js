import api from './api';

export const holidayService = {
  // Get suggested Indian holidays for a given year
  getSuggestedHolidays: async (year) => {
    const response = await api.get('/holidays/suggestions', { params: { year } });
    return response.data;
  },

  // List holidays with optional filtering (year, branchId, doctorId, category)
  getHolidays: async (params = {}) => {
    const response = await api.get('/holidays', { params });
    return response.data;
  },

  // Get single holiday by ID
  getHolidayById: async (id) => {
    const response = await api.get(`/holidays/${id}`);
    return response.data;
  },

  // Create single holiday
  createHoliday: async (holidayData) => {
    const response = await api.post('/holidays', holidayData);
    return response.data;
  },

  // Create multiple holidays in batch
  createBatchHolidays: async (holidays) => {
    const response = await api.post('/holidays/batch', { holidays });
    return response.data;
  },

  // Update existing holiday
  updateHoliday: async (id, holidayData) => {
    const response = await api.put(`/holidays/${id}`, holidayData);
    return response.data;
  },

  // Deactivate (soft-delete) holiday
  deactivateHoliday: async (id) => {
    const response = await api.delete(`/holidays/${id}`);
    return response.data;
  },

  // Export holidays as CSV
  exportHolidaysCsv: async (params = {}) => {
    const response = await api.get('/holidays/export/csv', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // Import holidays from CSV text
  importHolidaysCsv: async (csvText, branchId = null) => {
    const response = await api.post('/holidays/import/csv', { csvText, branchId });
    return response.data;
  },
};
