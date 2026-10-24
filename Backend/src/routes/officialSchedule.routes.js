import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  validateCreateScheduleBody,
  validateUpdateScheduleBody,
  validateNoteBody,
  validateScheduleListQuery,
  validateScheduleIdParam,
} from '../validators/officialSchedule.validator.js';
import {
  createDraftSchedule,
  getSchedules,
  getOneSchedule,
  editSchedule,
  publish,
  unpublish,
  archive,
} from '../controllers/officialSchedule.controller.js';

// Mount in app.js, for example:  app.use('/api/v1/official-schedules', officialScheduleRoutes);
// No setup loader here: a schedule belongs to a class, not to a student's setup. The service checks
// the caller's active ScheduleRole on every request.
const router = Router();

router.use(verifyJWT);

router.route('/').get(validateScheduleListQuery, getSchedules).post(validateCreateScheduleBody, createDraftSchedule);

router
  .route('/:scheduleId')
  .get(validateScheduleIdParam, getOneSchedule)
  .patch(validateScheduleIdParam, validateUpdateScheduleBody, editSchedule);

router.post('/:scheduleId/publish', validateScheduleIdParam, validateNoteBody, publish);
router.post('/:scheduleId/unpublish', validateScheduleIdParam, validateNoteBody, unpublish);
router.post('/:scheduleId/archive', validateScheduleIdParam, validateNoteBody, archive);

export default router;