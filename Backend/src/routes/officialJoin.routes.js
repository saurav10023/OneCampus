import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { loadSetup } from '../middlewares/setup.middleware.js';
import {
  validateJoinPreviewBody,
  validateJoinBody,
  validateLeaveBody,
} from '../validators/officialJoin.validator.js';
import { status, schedules, preview, join, leave } from '../controllers/officialJoin.controller.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

// Student side: the caller's own setup only
router.use(verifyJWT, loadSetup);

router.get('/', status);
router.get('/schedules', schedules);
router.post('/join-preview', validateJoinPreviewBody, preview);
router.post('/join', validateJoinBody, join);
router.post('/leave', validateLeaveBody, leave);

export default router;