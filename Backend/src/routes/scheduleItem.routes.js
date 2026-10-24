import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { validateScheduleIdParam } from '../validators/officialSchedule.validator.js';
import {
  validateCreateItem,
  validateUpdateItem,
  validateItemNoteBody,
  validateItemListQuery,
  validateItemIdParam,
} from '../validators/scheduleItem.validator.js';
import { list, get, create, update, withdraw, restore } from '../controllers/scheduleItem.controller.js';

// Mount in app.js, before the schedule router:
//   app.use('/api/v1/official-schedules/:scheduleId/items', scheduleItemRoutes);
const router = Router({ mergeParams: true }); // so :scheduleId from the mount path is visible

// Behind verifyJWT only: the service checks the caller's ScheduleRole for this schedule
router.use(verifyJWT, validateScheduleIdParam);

router.route('/').get(validateItemListQuery, list).post(validateCreateItem, create);
router
  .route('/:itemId')
  .get(validateItemIdParam, get)
  .patch(validateItemIdParam, validateUpdateItem, update);
router.post('/:itemId/withdraw', validateItemIdParam, validateItemNoteBody, withdraw);
router.post('/:itemId/restore', validateItemIdParam, validateItemNoteBody, restore);

export default router;