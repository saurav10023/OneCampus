// routes/admin.routes.js
import { Router } from 'express';
import {
  listUsers,
  searchUsers,
  getUserByUsername,
  resetUserPassword,
  setUserRole,
  setUserActiveStatus,
  forceLogoutUser,
  restoreDeletedUser,
  getUserStats,
} from '../controllers/admin.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/authorizeRoles.middleware.js';

const router = Router();

// Everything below is admin only
router.use(verifyJWT, authorizeRoles('admin'));

// Fixed paths must stay above /users/:username
router.route('/users/stats').get(getUserStats);
router.route('/users/search').get(searchUsers);

router.route('/users').get(listUsers);
router.route('/users/:username').get(getUserByUsername);

router.route('/users/:username/reset-password').post(resetUserPassword);
router.route('/users/:username/role').patch(setUserRole);
router.route('/users/:username/status').patch(setUserActiveStatus);
router.route('/users/:username/force-logout').post(forceLogoutUser);
router.route('/users/:username/restore').post(restoreDeletedUser);

export default router;