import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import { syncOnRead } from '../middlewares/syncOnRead.middleware.js';
import { validateUpdatesQuery } from '../validators/officialSync.validator.js';
import { syncNow, updates } from '../controllers/officialSync.controller.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

// Student side: the caller's own setup only. Mounted at the same path as the join routes.
router.use(verifyJWT, loadOwnedSetup);

router.post('/sync', syncNow);
// The list syncs first, so it never misses something the CR just changed
router.get('/updates', syncOnRead, validateUpdatesQuery, updates);

export default router;