import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { validateScheduleIdParam } from '../validators/officialSchedule.validator.js';
import {
  validateActionIdParam,
  validateActionNoteBody,
  validateActionListQuery,
  validateImpactBody,
} from '../validators/scheduleAction.validator.js';
import { list, get, undo, redo, revert, impact } from '../controllers/scheduleAction.controller.js';

// Mount in app.js, before the schedule router:
//   app.use('/api/v1/official-schedules/:scheduleId/actions', scheduleActionRoutes);
const router = Router({ mergeParams: true }); // so :scheduleId from the mount path is visible

// Behind verifyJWT only: the services check the caller's ScheduleRole for this schedule
router.use(verifyJWT, validateScheduleIdParam);

router.get('/', validateActionListQuery, list);
// Before /:actionId, so "impact-preview" is not read as an id
router.post('/impact-preview', validateImpactBody, impact);
router.get('/:actionId', validateActionIdParam, get);
router.post('/:actionId/undo', validateActionIdParam, validateActionNoteBody, undo);
router.post('/:actionId/redo', validateActionIdParam, validateActionNoteBody, redo);
router.post('/:actionId/revert', validateActionIdParam, validateActionNoteBody, revert);

export default router;