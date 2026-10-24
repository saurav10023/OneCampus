import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  validateRequestRoleBody,
  validateDecisionBody,
  validateRequestsQuery,
  validateRoleIdParam,
} from '../validators/scheduleRole.validator.js';
import {
  createRoleRequest,
  getMyRoles,
  getRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
  revokeActiveRole,
  withdrawOwnRole,
} from '../controllers/scheduleRole.controller.js';

// Mount in app.js, for example:  app.use('/api/v1/schedule-roles', scheduleRoleRoutes);
// No setup loader here: roles belong to the user, not to a setup.
const router = Router();

router.use(verifyJWT);

// Fixed paths first, so "mine" and "requests" are never read as a :roleId
router.get('/mine', getMyRoles);
router.get('/requests', validateRequestsQuery, getRoleRequests);

router.post('/', validateRequestRoleBody, createRoleRequest);

router.patch('/:roleId/approve', validateRoleIdParam, validateDecisionBody, approveRoleRequest);
router.patch('/:roleId/reject', validateRoleIdParam, validateDecisionBody, rejectRoleRequest);
router.patch('/:roleId/revoke', validateRoleIdParam, validateDecisionBody, revokeActiveRole);
router.patch('/:roleId/withdraw', validateRoleIdParam, withdrawOwnRole);

export default router;