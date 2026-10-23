import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
// TODO: replace with your real setup-loader middleware (sets req.setup, 404 or 403 otherwise)
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import {
  validateSetBody,
  validateChangeBody,
  validateMatchBody,
} from '../validators/extraClassAdjustment.validator.js';
import {
  listAdjustments,
  getAdjustment,
  setAdjustment,
  changeAdjustment,
  matchRecord,
  deleteAdjustment,
} from '../controllers/extraClassAdjustment.controller.js';

const router = Router({ mergeParams: true }); // so :setupId from the mount path is visible

router.use(verifyJWT, loadOwnedSetup);

router.get('/', listAdjustments);
router.post('/:subjectId/match', validateMatchBody, matchRecord);
router
  .route('/:subjectId')
  .get(getAdjustment)
  .put(validateSetBody, setAdjustment)
  .patch(validateChangeBody, changeAdjustment)
  .delete(deleteAdjustment);

export default router;