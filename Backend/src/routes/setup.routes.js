import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';
import {
  validateCreateSetup,
  validateUpdateSetup,
} from '../validators/setup.validator.js';
import { validatePublishBody } from '../validators/sharing.validator.js';
import {
  createSetup,
  getMySetups,
  getSetupById,
  updateSetup,
  archiveSetup,
  setActiveSetup,
  getSetupDeleteImpact,
  deleteSetup,
} from '../controllers/setup.controller.js';
import { publishSetup } from '../controllers/sharedPublication.controller.js';

const router = Router();

router.use(verifyJWT);

router.route('/').post(validateCreateSetup, createSetup).get(getMySetups);

router
  .route('/:setupId')
  .get(loadOwnedSetup, getSetupById)
  .patch(loadOwnedSetup, validateUpdateSetup, updateSetup)
  .delete(loadOwnedSetup, deleteSetup);

router.patch('/:setupId/archive', loadOwnedSetup, archiveSetup);
router.patch('/:setupId/activate', loadOwnedSetup, setActiveSetup);
router.get('/:setupId/delete-impact', loadOwnedSetup, getSetupDeleteImpact);
router.post('/:setupId/publish', loadOwnedSetup, validatePublishBody, publishSetup);

export default router;