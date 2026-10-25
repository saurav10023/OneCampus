import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import {
  validateUpdateIdParam,
  validateRuleIdParam,
  validateSubjectIdParam,
  validateOptOutParams,
  validateAcceptBody,
  validateConfirmBody,
} from '../validators/officialUpdate.validator.js';
import {
  read,
  readAll,
  accept,
  dismiss,
  optOuts,
  restore,
  ruleDetach,
  ruleReattach,
  subjectDetach,
  subjectReattach,
} from '../controllers/officialUpdate.controller.js';

// Mount at the same path as officialSync.routes (the list itself is GET /updates there):
//   app.use('<same path as officialSync>', officialUpdateRoutes);
// Student side: the caller's own setup only.
const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

router.use(verifyJWT, loadOwnedSetup);

// Official updates list actions
router.post('/updates/read-all', readAll); // before /:updateId
router.post('/updates/:updateId/read', validateUpdateIdParam, read);
router.post('/updates/:updateId/accept', validateUpdateIdParam, validateAcceptBody, accept);
router.post('/updates/:updateId/dismiss', validateUpdateIdParam, dismiss);

// Official items the student hid
router.get('/opt-outs', optOuts);
router.delete('/opt-outs/:kind/:id', validateOptOutParams, restore);

// Keep my version / follow the CR again
router.post('/rules/:ruleId/detach', validateRuleIdParam, ruleDetach);
router.post('/rules/:ruleId/reattach', validateRuleIdParam, ruleReattach);
router.post('/subjects/:subjectId/detach', validateSubjectIdParam, subjectDetach);
router.post('/subjects/:subjectId/reattach', validateSubjectIdParam, validateConfirmBody, subjectReattach);

export default router;