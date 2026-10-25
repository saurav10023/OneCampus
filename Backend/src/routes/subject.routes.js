import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
// TODO: replace with your real setup-loader middleware (sets req.setup, 404 or 403 otherwise)
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import {
  validateCreateSubject,
  validateUpdateSubject,
  validateBulkCreateSubjects,
  validateListQuery,
  validateCheckQuery,
  validateMergeQuery,
  validateMergeBody,
} from '../validators/subject.validator.js';
import {
  createSubject,
  bulkCreateSubjects,
  listSubjects,
  getSubject,
  checkSubjectAvailability,
  updateSubject,
  archiveSubject,
  restoreSubject,
  getSubjectDeleteImpact,
  deleteSubject,
  mergeSubject,
  previewMerge,
} from '../controllers/subject.controller.js';
import { syncOnRead } from '../middlewares/syncOnRead.middleware.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

// Bring a joined setup up to date before any read. Writes skip it, so marking a class is never delayed.
router.use(verifyJWT, loadOwnedSetup, (req, res, next) =>
  req.method === 'GET' ? syncOnRead(req, res, next) : next()
);

// Fixed paths first, so "bulk" and "check" are never read as a :subjectId
router.route('/').get(validateListQuery, listSubjects).post(validateCreateSubject, createSubject);
router.post('/bulk', validateBulkCreateSubjects, bulkCreateSubjects);
router.get('/check', validateCheckQuery, checkSubjectAvailability);

router
  .route('/:subjectId')
  .get(getSubject)
  .patch(validateUpdateSubject, updateSubject)
  .delete(deleteSubject);
router.get('/:subjectId/delete-impact', getSubjectDeleteImpact);
router.patch('/:subjectId/archive', archiveSubject);
router.patch('/:subjectId/restore', restoreSubject);
router.get('/:subjectId/merge-preview', validateMergeQuery, previewMerge);
router.post('/:subjectId/merge', validateMergeBody, mergeSubject);

export default router;