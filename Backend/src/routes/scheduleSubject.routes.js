import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  validateCreateSubject,
  validateUpdateSubject,
  validateNoteBody,
  validateSubjectListQuery,
} from '../validators/scheduleSubject.validator.js';
import { list, get, create, update, withdraw, restore } from '../controllers/scheduleSubject.controller.js';

const router = Router({ mergeParams: true }); // so :scheduleId from the mount path is visible

// Behind verifyJWT only: the service checks the caller's ScheduleRole for this schedule
router.use(verifyJWT);

router.route('/').get(validateSubjectListQuery, list).post(validateCreateSubject, create);
router.route('/:subjectId').get(get).patch(validateUpdateSubject, update);
router.post('/:subjectId/withdraw', validateNoteBody, withdraw);
router.post('/:subjectId/restore', validateNoteBody, restore);

export default router;