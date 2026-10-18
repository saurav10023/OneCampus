import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { validateObjectIdParam } from '../validators/common.validator.js';
import { validateListQuery } from '../validators/sharing.validator.js';
import {
  listPublications,
  getMyPublications,
  getPublicationById,
  refreshPublication,
  unpublishPublication,
} from '../controllers/sharedPublication.controller.js';
import { copyPublication } from '../controllers/setupCopy.controller.js';

const router = Router();

router.use(verifyJWT);

router.get('/', validateListQuery, listPublications);
// Must stay above /:publicationId or "mine" would be read as an id
router.get('/mine', getMyPublications);

const withId = validateObjectIdParam('publicationId');

router.get('/:publicationId', withId, getPublicationById);
router.put('/:publicationId/refresh', withId, refreshPublication);
router.patch('/:publicationId/unpublish', withId, unpublishPublication);
router.post('/:publicationId/copy', withId, copyPublication);

export default router;