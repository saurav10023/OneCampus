import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { validateObjectIdParam } from '../validators/common.validator.js';
import { validateRatingBody } from '../validators/sharing.validator.js';
import { getMyCopies, rateCopy } from '../controllers/setupCopy.controller.js';

const router = Router();

router.use(verifyJWT);

router.get('/', getMyCopies);
router.put('/:copyId/rating', validateObjectIdParam('copyId'), validateRatingBody, rateCopy);

export default router;