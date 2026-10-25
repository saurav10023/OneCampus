import { Router } from 'express';
import {
  registerUser, loginUser, logoutUser, getCurrentUser, updateCurrentUser,
  changePassword, requestAccountDeletion, adminDeleteUser, manageUserRole,
} from '../controllers/user.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/authorizeRoles.middleware.js';
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiting.middleware.js';
import { uploadAvatar } from '../middlewares/multer.middleware.js';

const router = Router();

// Public
router.route('/register').post(registerLimiter, registerUser);
router.route('/login').post(loginLimiter, loginUser);
router.route('/logout').post(logoutUser);

// Logged-in user (keep /me routes above the /:username routes)
router
  .route('/me')
  .get(verifyJWT, getCurrentUser)
  .patch(verifyJWT, uploadAvatar, updateCurrentUser)
  .delete(verifyJWT, requestAccountDeletion);
router.route('/me/password').patch(verifyJWT, changePassword);

// Moderator / admin
router.route('/:username/role').patch(verifyJWT, authorizeRoles('moderator', 'admin'), manageUserRole);

// Admin only
router.route('/:username').delete(verifyJWT, authorizeRoles('admin'), adminDeleteUser);

export default router;