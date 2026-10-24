import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  validateCreateRule,
  validateUpdateRule,
  validateRuleNoteBody,
  validateRuleListQuery,
} from '../validators/scheduleRule.validator.js';
import { list, get, create, update, withdraw, restore } from '../controllers/scheduleRule.controller.js';

const router = Router({ mergeParams: true }); // so :scheduleId from the mount path is visible

// Behind verifyJWT only: the service checks the caller's ScheduleRole for this schedule
router.use(verifyJWT);

router.route('/').get(validateRuleListQuery, list).post(validateCreateRule, create);
router.route('/:ruleId').get(get).patch(validateUpdateRule, update);
router.post('/:ruleId/withdraw', validateRuleNoteBody, withdraw);
router.post('/:ruleId/restore', validateRuleNoteBody, restore);

export default router;