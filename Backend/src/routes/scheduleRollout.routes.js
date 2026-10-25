import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { rollout } from '../controllers/scheduleRollout.controller.js';

const router = Router({ mergeParams: true }); // so :scheduleId from the mount path is visible

// Behind verifyJWT only: the service checks the caller's ScheduleRole for this schedule
router.use(verifyJWT);

router.get('/', rollout);

export default router;