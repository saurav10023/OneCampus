import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import {
  validateListQuery,
  validateMarkBody,
  validateBulkMarkBody,
  validateBulkClearBody,
  validateCreateClassBody,
  validateEditClassBody,
  validateDeleteClassBody,
  validateDayQuery,
  validateWeekQuery,
} from '../validators/occurrence.validator.js';
import {
  listOccurrences,
  getOccurrence,
  markOccurrence,
  bulkMarkOccurrences,
  clearOccurrenceMark,
  bulkClearOccurrences,
  createClass,
  editClass,
  deleteClass,
  getDay,
  getWeek,
} from '../controllers/occurrence.controller.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

router.use(verifyJWT, loadOwnedSetup);

// Fixed paths first, so "today", "week" and "status" are never read as an :occurrenceId
router.get('/today', validateDayQuery, getDay);
router.get('/week', validateWeekQuery, getWeek);
router
  .route('/status')
  .patch(validateBulkMarkBody, bulkMarkOccurrences) // mark many
  .delete(validateBulkClearBody, bulkClearOccurrences); // clear many (back to pending)

router.route('/').get(validateListQuery, listOccurrences).post(validateCreateClassBody, createClass);

router
  .route('/:occurrenceId')
  .get(getOccurrence)
  .patch(validateEditClassBody, editClass)
  .delete(validateDeleteClassBody, deleteClass);

router
  .route('/:occurrenceId/status')
  .patch(validateMarkBody, markOccurrence) // mark one
  .delete(clearOccurrenceMark); // clear one (back to pending)

export default router;