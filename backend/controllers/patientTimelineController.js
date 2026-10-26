const patientTimelineService = require('../services/patientTimelineService');

/**
 * Controller for Phase 5: Patient Timeline & Visit-Wise Unified Records
 */
class PatientTimelineController {
  /**
   * GET /api/patients/:id/timeline
   * Retrieve chronological unified medical record timeline for a patient.
   */
  async getTimeline(req, res, next) {
    try {
      const { id } = req.params;
      const { clinicId, assignedBranchIds } = req.user;
      const {
        page = 1,
        limit = 20,
        category = 'all',
        startDate,
        endDate,
        visitId,
        branchId,
        search,
      } = req.query;

      const result = await patientTimelineService.getPatientTimeline(
        id,
        clinicId,
        {
          page,
          limit,
          category,
          startDate,
          endDate,
          visitId,
          branchId,
          search,
        },
        assignedBranchIds
      );

      return res.json({
        success: true,
        patient: result.patient,
        events: result.events,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/patients/:id/visits/:visitId/records
   * GET /api/patients/visits/:visitId/records
   * Retrieve all records tied to a specific clinical visit encounter.
   */
  async getVisitRecords(req, res, next) {
    try {
      const { visitId } = req.params;
      const { clinicId, assignedBranchIds } = req.user;

      const records = await patientTimelineService.getVisitEncounterRecords(
        visitId,
        clinicId,
        assignedBranchIds
      );

      return res.json({
        success: true,
        ...records,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PatientTimelineController();
