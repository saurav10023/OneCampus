// routes/recurringRule.routes.js
// Mount in the setup routes (or app.js) next to calendar-events:
//   router.use('/:setupId/rules', recurringRuleRouter);
// so the full path is /api/v1/setups/:setupId/rules
import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
// CHECK PATH and export style: use whatever the setup and calendar routes already import

import {
  createRule,
  listRules,
  getRule,
  updateRule,
  regenerateRule,
  getRuleDeleteImpactHandler,
  deleteRule,
} from '../controllers/recurringRule.controller.js';
import { loadOwnedSetup } from '../middlewares/setup.middleware.js';

// mergeParams so :setupId from the parent path is visible to loadOwnedSetup
const router = Router({ mergeParams: true });

// Every request is the owner's own: the setup is loaded and checked before any handler runs
router.use(verifyJWT, loadOwnedSetup);

router.route('/').get(listRules).post(createRule);

router.route('/:ruleId').get(getRule).patch(updateRule).delete(deleteRule);

router.route('/:ruleId/delete-impact').get(getRuleDeleteImpactHandler);
router.route('/:ruleId/regenerate').post(regenerateRule);

export default router;