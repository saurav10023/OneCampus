// controllers/user.controller.js
import { User, normalizeMobile } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    ACCOUNT_DELETION_GRACE_DAYS,
    SESSION_DAYS,
    USER_ROLES
} from "../utils/constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Used for both setting and clearing, so clearCookie always matches.
const baseCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
};

// maxAge is kept out of baseCookieOptions on purpose: Express 4's clearCookie
// would turn it into a future expiry and the cookie would not be cleared.
const loginCookieOptions = {
    ...baseCookieOptions,
    maxAge: SESSION_DAYS * DAY_MS
};

// Moderators may only move a user between these two roles (assign / remove CR).
const MODERATOR_ALLOWED_CHANGES = [
    ["student", "cr"],
    ["cr", "student"]
];

const isString = (value) => typeof value === "string";

// Turns Mongoose validation and duplicate-key errors into clean ApiErrors.
const toApiError = (error) => {
    if (error instanceof ApiError) return error;

    if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || "value";
        return new ApiError(409, `This ${field} is already in use`);
    }

    if (error?.name === "ValidationError") {
        const messages = Object.values(error.errors).map((e) => e.message);
        return new ApiError(400, messages[0] || "Validation failed", messages);
    }

    return error;
};

// ---- REGISTER ----
// Public. Role/status fields are never read from the body.
const registerUser = asyncHandler(async (req, res) => {
    const {
        fullName,
        username,
        mobile,
        password,
        college,
        branch,
        section,
        rollNo,
        email,
        avatar
    } = req.body || {};

    // typeof checks also block object payloads like { "$gt": "" }
    const requiredText = { fullName, username, mobile, branch, section };
    for (const [key, value] of Object.entries(requiredText)) {
        if (!isString(value) || !value.trim()) {
            throw new ApiError(400, `${key} is required`);
        }
    }
    if (!isString(password) || !password) {
        throw new ApiError(400, "password is required");
    }

    for (const [key, value] of Object.entries({ college, rollNo, email, avatar })) {
        if (value !== undefined && value !== null && !isString(value)) {
            throw new ApiError(400, `${key} must be a string`);
        }
    }

    const userData = {
        fullName,
        username,
        mobile,
        password,
        branch,
        section,
        role: "student",
        isActive: true,
        isDeleted: false
    };

    // Empty optional values are skipped so defaults / absent email stay intact.
    if (college?.trim()) userData.college = college;
    if (rollNo?.trim()) userData.rollNo = rollNo;
    if (email?.trim()) userData.email = email;
    if (avatar?.trim()) userData.avatar = avatar;

    let user;
    try {
        user = await User.create(userData);
    } catch (error) {
        throw toApiError(error);
    }

    const createdUser = await User.findById(user._id).select("-password");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while creating the account");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, createdUser, "Account created successfully"));
});

// ---- LOGIN ----
// Send either `username` or `mobile` (explicit, because a username can be all digits).
// Soft-deleted accounts are restored here if the 10-day grace period is still running.
const loginUser = asyncHandler(async (req, res) => {
    const { username, mobile, password } = req.body || {};

    if (!isString(password) || !password) {
        throw new ApiError(400, "Password is required");
    }

    let query;
    if (isString(mobile) && mobile.trim()) {
        query = { mobile: normalizeMobile(mobile) };
    } else if (isString(username) && username.trim()) {
        query = { username: username.trim().toLowerCase() };
    } else {
        throw new ApiError(400, "Username or mobile number is required");
    }

    const user = await User.findOne(query).select("+password");

    // Same generic error for unknown account and wrong password.
    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    // Status checks only happen after valid credentials so they don't leak
    // whether an account exists.
    let accountRestored = false;

    if (user.isDeleted) {
        const gracePeriodOver =
            !user.deletedAt ||
            Date.now() - user.deletedAt.getTime() >= ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;

        if (gracePeriodOver) {
            throw new ApiError(403, "This account has been deleted and can no longer be restored");
        }

        user.isDeleted = false;
        user.deletedAt = null;
        await user.save({ validateBeforeSave: false });
        accountRestored = true;
    }

    if (!user.isActive) {
        throw new ApiError(403, "This account is not active. Please contact the administrator.");
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const accessToken = user.generateAccessToken();
    const loggedInUser = await User.findById(user._id).select("-password");

    return res
        .status(200)
        .cookie("accessToken", accessToken, loginCookieOptions)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accountRestored },
                accountRestored
                    ? "Account restored and logged in successfully"
                    : "Logged in successfully"
            )
        );
});

// ---- LOGOUT ----
// Clears this device's cookie only. Other devices stay logged in.
const logoutUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .clearCookie("accessToken", baseCookieOptions)
        .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// ---- GET CURRENT USER ----
// verifyJWT has already attached req.user (password excluded, toJSON strips internals).
const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

// ---- UPDATE CURRENT USER ----
// Explicit allowlist only: fullName, username, mobile, email, branch, section, rollNo, avatar.
// Anything else in the body (role, isActive, password...) is ignored.
const updateCurrentUser = asyncHandler(async (req, res) => {
    const updates = req.body || {};

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    let hasChanges = false;

    // Required fields: cannot be blanked out.
    for (const field of ["fullName", "username", "mobile", "branch", "section"]) {
        if (updates[field] === undefined) continue;

        if (!isString(updates[field]) || !updates[field].trim()) {
            throw new ApiError(400, `${field} cannot be empty`);
        }
        user[field] = updates[field]; // setters trim / lowercase / normalize
        hasChanges = true;
    }

    // Optional: rollNo can be added, changed or removed.
    if (updates.rollNo !== undefined) {
        if (updates.rollNo !== null && !isString(updates.rollNo)) {
            throw new ApiError(400, "rollNo must be a string");
        }
        user.rollNo = (updates.rollNo && updates.rollNo.trim()) || null;
        hasChanges = true;
    }

    // Optional: empty value removes the email (stored as absent, not "").
    if (updates.email !== undefined) {
        if (updates.email !== null && !isString(updates.email)) {
            throw new ApiError(400, "email must be a string");
        }
        user.email = (updates.email && updates.email.trim()) || undefined;
        hasChanges = true;
    }

    if (updates.avatar !== undefined) {
        if (updates.avatar !== null && !isString(updates.avatar)) {
            throw new ApiError(400, "avatar must be a string");
        }
        user.avatar = (updates.avatar && updates.avatar.trim()) || "";
        hasChanges = true;
    }

    if (!hasChanges) {
        throw new ApiError(400, "No valid fields to update");
    }

    try {
        await user.save();
    } catch (error) {
        throw toApiError(error);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Profile updated successfully"));
});

// ---- CHANGE PASSWORD ----
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!isString(currentPassword) || !currentPassword || !isString(newPassword) || !newPassword) {
        throw new ApiError(400, "Current password and new password are required");
    }

    if (newPassword.length < 8) {
        throw new ApiError(400, "New password must be at least 8 characters");
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordValid = await user.isPasswordCorrect(currentPassword);

    if (!isPasswordValid) {
        throw new ApiError(400, "Current password is incorrect");
    }

    user.password = newPassword; // hashed by the pre-save hook
    user.passwordChangedAt = new Date(); // verifyJWT rejects tokens issued before this

    try {
        await user.save();
    } catch (error) {
        throw toApiError(error);
    }

    // All other devices are now logged out; keep this one logged in with a fresh token.
    const accessToken = user.generateAccessToken();

    return res
        .status(200)
        .cookie("accessToken", accessToken, loginCookieOptions)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// ---- REQUEST ACCOUNT DELETION (own account) ----
const requestAccountDeletion = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, {
        isDeleted: true,
        deletedAt: new Date()
    });

    return res
        .status(200)
        .clearCookie("accessToken", baseCookieOptions)
        .json(
            new ApiResponse(
                200,
                {},
                `Account scheduled for deletion. Log in within ${ACCOUNT_DELETION_GRACE_DAYS} days to restore it.`
            )
        );
});

// ---- ADMIN: DELETE USER ----
// Route must use verifyJWT + authorizeRoles("admin"). Target is addressed by username.
const adminDeleteUser = asyncHandler(async (req, res) => {
    const username = req.params.username?.trim().toLowerCase();

    const target = await User.findOne({ username });

    if (!target) {
        throw new ApiError(404, "User not found");
    }

    if (target._id.equals(req.user._id)) {
        throw new ApiError(400, "Use the account deletion option to delete your own account");
    }

    if (target.isDeleted) {
        throw new ApiError(409, "This account is already scheduled for deletion");
    }

    target.isDeleted = true;
    target.deletedAt = new Date();
    await target.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { username: target.username },
                `Account scheduled for deletion. The user can restore it by logging in within ${ACCOUNT_DELETION_GRACE_DAYS} days.`
            )
        );
});

// ---- MANAGE USER ROLE ----
// Route must use verifyJWT + authorizeRoles("moderator", "admin"); the rules are enforced again here.
const manageUserRole = asyncHandler(async (req, res) => {
    const username = req.params.username?.trim().toLowerCase();
    const { role: newRole } = req.body || {};

    if (!isString(newRole) || !USER_ROLES.includes(newRole)) {
        throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
    }

    const target = await User.findOne({ username, isDeleted: false });

    if (!target) {
        throw new ApiError(404, "User not found");
    }

    if (target._id.equals(req.user._id)) {
        throw new ApiError(403, "You cannot change your own role");
    }

    if (target.role === newRole) {
        throw new ApiError(400, `User already has the ${newRole} role`);
    }

    const actorRole = req.user.role;

    if (actorRole === "admin") {
        // Admins may assign or remove any role.
    } else if (actorRole === "moderator") {
        const isAllowed = MODERATOR_ALLOWED_CHANGES.some(
            ([from, to]) => from === target.role && to === newRole
        );

        if (!isAllowed) {
            throw new ApiError(403, "Moderators can only assign or remove the CR role");
        }
    } else {
        throw new ApiError(403, "Access denied");
    }

    const updatedUser = await User.findByIdAndUpdate(
        target._id,
        { role: newRole },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, "User role updated successfully"));
});

export {
    registerUser,
    loginUser,
    logoutUser,
    getCurrentUser,
    updateCurrentUser,
    changePassword,
    requestAccountDeletion,
    adminDeleteUser,
    manageUserRole
};