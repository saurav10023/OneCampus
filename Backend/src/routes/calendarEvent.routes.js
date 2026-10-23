import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  validateCreateEvent,
  validateUpdateEvent,
  validateListQuery,
} from '../validators/calendarEvent.validator.js';
import { list, create, update, remove, confirm } from '../controllers/calendarEvent.controller.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

// No setup loader here: the controller checks that the setup belongs to the caller
router.use(verifyJWT);

router.route('/').get(validateListQuery, list).post(validateCreateEvent, create);
router.route('/:eventId').patch(validateUpdateEvent, update).delete(remove);
router.post('/:eventId/confirm', confirm);

export { router as calendarEventRoutes };
export default router;