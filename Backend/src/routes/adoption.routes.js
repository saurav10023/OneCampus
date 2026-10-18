import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { validateObjectIdParam } from '../validators/common.validator.js';
import { validateRatingBody } from '../validators/sharing.validator.js';
import {
  getMyAdoptions,
  unlinkAdoption,
  rateAdoption,
} from '../controllers/sharedAdoption.controller.js';

const router = Router();

router.use(verifyJWT);

const withId = validateObjectIdParam('adoptionId');

router.get('/', getMyAdoptions);
router.patch('/:adoptionId/unlink', withId, unlinkAdoption);
router.put('/:adoptionId/rating', withId, validateRatingBody, rateAdoption);

export default router;