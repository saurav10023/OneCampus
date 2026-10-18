// routes/user.routes.js
// Suggested paths only (route paths are still an open item in the spec).
// Mount in app.js:  app.use("/api/v1/users", userRouter);
import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    getCurrentUser,
    updateCurrentUser,
    changePassword,
    requestAccountDeletion,
    adminDeleteUser,
    manageUserRole
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/authorizeRoles.middleware.js";
import { loginLimiter } from "../middlewares/rateLimiting.middleware.js";

const router = Router();

// Public
router.route("/register").post(registerUser);
router.route("/login").post(loginLimiter, loginUser);
router.route("/logout").post(logoutUser); // only clears this device's cookie

// Logged-in user (keep /me routes above the /:username routes)
router.route("/me")
    .get(verifyJWT, getCurrentUser)
    .patch(verifyJWT, updateCurrentUser)
    .delete(verifyJWT, requestAccountDeletion);
router.route("/me/password").patch(verifyJWT, changePassword);

// Moderator / admin
router.route("/:username/role").patch(
    verifyJWT,
    authorizeRoles("moderator", "admin"),
    manageUserRole
);

// Admin only
router.route("/:username").delete(
    verifyJWT,
    authorizeRoles("admin"),
    adminDeleteUser
);

export default router;