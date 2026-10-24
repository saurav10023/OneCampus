// controllers/user.controller.js
import bcrypt from "bcrypt";
import { User, normalizeMobile } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    ACCOUNT_DELETION_GRACE_DAYS,
    SESSION_DAYS,
    USER_ROLES
} from "../utils/constants.js";

import fs from "fs";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

// The cookie is now only a fallback. The frontend sends the token in the Authorization header
// (the login response returns it). Used for both setting and clearing, so clearCookie matches.
// sameSite "none" needs secure, which only works over https, so local development uses "lax".
const baseCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/"
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
// Body (JSON), any ONE of these with the password:
//   { "identifier": "student_a" | "9876543210" | "+91 98765 43210", "password": "..." }
//   { "username": "student_a", "password": "..." }
//   { "mobile": "9876543210", "password": "..." }
//
// Safety:
//   - Only strings are accepted, so {"$ne": null} style injection never reaches the query.
//   - Inputs have length limits, so nobody can make the server hash a huge password.
//   - Unknown account, wrong password and over-long input all return the same 401, and the
//     unknown-account path does the same hashing work, so timing does not reveal accounts.
//   - Account status (inactive, deleted) is revealed only after the password is correct.
//   - The password is never logged or returned.

const MAX_IDENTIFIER_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 128;

// Created once, on first use. Compared against when the account does not exist.
let dummyHashPromise = null;
const getDummyHash = () => {
    dummyHashPromise ??= bcrypt.hash("not-a-real-password", 10);
    return dummyHashPromise;
};

// Turns the three possible fields into one safe query, or throws.
const resolveLoginQuery = ({ identifier, mobile, username }) => {
    const candidates = [
        ["identifier", identifier],
        ["mobile", mobile],
        ["username", username],
    ];

    // The first field that was actually filled in. Missing, null and blank text are skipped.
    const picked = candidates.find(
        ([, value]) => value !== undefined && value !== null && !(isString(value) && !value.trim())
    );
    if (!picked) {
        throw new ApiError(400, "Username or mobile number is required");
    }

    const [field, value] = picked;

    // Objects and arrays (for example {"$ne": null}) are refused before any query exists
    if (!isString(value)) {
        throw new ApiError(400, "Username or mobile number must be text");
    }

    const trimmed = value.trim();
    if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
        throw new ApiError(401, "Invalid credentials");
    }

    if (field === "mobile") {
        return { mobile: normalizeMobile(trimmed) };
    }
    if (field === "username") {
        return { username: trimmed.toLowerCase() };
    }

    // "identifier": a valid Indian mobile number means mobile, anything else is a username
    const asMobile = normalizeMobile(trimmed);
    if (/^[6-9]\d{9}$/.test(asMobile)) {
        return { mobile: asMobile };
    }
    return { username: trimmed.toLowerCase() };
};

const loginUser = asyncHandler(async (req, res) => {
    const body = req.body;

    // Tells "the server received no JSON" apart from "the password is missing"
    if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
        throw new ApiError(
            400,
            "No data received. Send a JSON body with the header Content-Type: application/json"
        );
    }

    const { identifier, mobile, username, password } = body;

    if (!isString(password) || !password) {
        throw new ApiError(400, "Password is required");
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        throw new ApiError(401, "Invalid credentials");
    }

    const query = resolveLoginQuery({ identifier, mobile, username });

    const user = await User.findOne(query).select("+password");

    // Unknown account: do the same hashing work as a real check, then give the same answer
    if (!user) {
        await bcrypt.compare(password, await getDummyHash());
        throw new ApiError(401, "Invalid credentials");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    // The password is correct from here on, so these messages cannot be used to find accounts
    if (!user.isActive) {
        throw new ApiError(403, "This account is not active. Please contact the administrator.");
    }

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
        accountRestored = true;
    }

    // One save for the restore (if any) and the login time
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const accessToken = user.generateAccessToken();
    const loggedInUser = await User.findById(user._id).select("-password");

    // The token goes in the body (the frontend sends it as a Bearer header) and in the cookie
    return res
        .status(200)
        .cookie("accessToken", accessToken, loginCookieOptions)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accountRestored, accessToken },
                accountRestored
                    ? "Account restored and logged in successfully"
                    : "Logged in successfully"
            )
        );
});

// ---- LOGOUT ----
// Clears this device's cookie only. The frontend deletes its stored token. Other devices stay logged in.
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
    const localFile = req.file?.path;
    let uploaded = null;

    try {
        const user = await User.findById(req.user._id).select("+avatarPublicId");
        if (!user) throw new ApiError(404, "User not found");

        let hasChanges = false;

        for (const field of ["fullName", "username", "mobile", "branch", "section"]) {
            if (updates[field] === undefined) continue;
            if (!isString(updates[field]) || !updates[field].trim()) {
                throw new ApiError(400, `${field} cannot be empty`);
            }
            user[field] = updates[field];
            hasChanges = true;
        }

        if (updates.rollNo !== undefined) {
            if (updates.rollNo !== null && !isString(updates.rollNo)) {
                throw new ApiError(400, "rollNo must be a string");
            }
            user.rollNo = (updates.rollNo && updates.rollNo.trim()) || null;
            hasChanges = true;
        }

        if (updates.email !== undefined) {
            if (updates.email !== null && !isString(updates.email)) {
                throw new ApiError(400, "email must be a string");
            }
            user.email = (updates.email && updates.email.trim()) || undefined;
            hasChanges = true;
        }

        // Avatar: a file replaces it; removeAvatar=true clears it.
        const oldPublicId = user.avatarPublicId;
        if (localFile) {
            uploaded = await uploadOnCloudinary(localFile);
            if (!uploaded) throw new ApiError(502, "Image upload failed. Try again");
            user.avatar = uploaded.secure_url;
            user.avatarPublicId = uploaded.public_id;
            hasChanges = true;
        } else if (String(updates.removeAvatar) === "true") {
            user.avatar = "";
            user.avatarPublicId = "";
            hasChanges = true;
        }

        if (!hasChanges) throw new ApiError(400, "No valid fields to update");

        try {
            await user.save();
        } catch (error) {
            if (uploaded) deleteFromCloudinary(uploaded.public_id); // don't leave an orphan
            throw toApiError(error);
        }

        // Delete the previous image only after the save succeeded.
        if (oldPublicId && oldPublicId !== user.avatarPublicId) {
            deleteFromCloudinary(oldPublicId);
        }

        return res.status(200).json(new ApiResponse(200, user, "Profile updated successfully"));
    } finally {
        // If we threw before the upload ran, the temp file is still on disk.
        if (localFile) fs.promises.unlink(localFile).catch(() => {});
    }
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
        .json(new ApiResponse(200, { accessToken }, "Password changed successfully"));
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
        { returnDocument: "after" }
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