import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
// TODO: replace with your real setup-loader middleware (sets req.setup, 404 or 403 otherwise)

import { validateOverviewQuery, validateBunkQuery } from '../validators/attendance.validator.js';
import { getOverview, getSubjectAttendance, getBunkCheck } from '../controllers/attendance.controller.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import { syncOnRead } from '../middlewares/syncOnRead.middleware.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

// Bring a joined setup up to date before any read. Writes skip it, so marking a class is never delayed.
router.use(verifyJWT, loadOwnedSetup, (req, res, next) =>
  req.method === 'GET' ? syncOnRead(req, res, next) : next()
);

router.get('/', validateOverviewQuery, getOverview);
router.get('/bunk', validateBunkQuery, getBunkCheck); // fixed path before the :subjectId one
router.get('/subjects/:subjectId', getSubjectAttendance);

export default router;