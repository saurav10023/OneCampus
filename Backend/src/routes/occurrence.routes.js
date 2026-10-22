import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';

import {
  validateListQuery,
  validateMarkBody,
  validateBulkMarkBody,
} from '../validators/occurrence.validator.js';
import {
  listOccurrences,
  getOccurrence,
  markOccurrence,
  bulkMarkOccurrences,
} from '../controllers/occurrence.controller.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

router.use(verifyJWT, loadOwnedSetup);

router.get('/', validateListQuery, listOccurrences);
router.patch('/status', validateBulkMarkBody, bulkMarkOccurrences); // fixed path before :occurrenceId
router.get('/:occurrenceId', getOccurrence);
router.patch('/:occurrenceId/status', validateMarkBody, markOccurrence);

export default router;