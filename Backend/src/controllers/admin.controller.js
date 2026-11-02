// controllers/admin.controller.js
// Every route here must use: verifyJWT + authorizeRoles("admin")
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ACCOUNT_DELETION_GRACE_DAYS, USER_ROLES } from "../utils/constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after this
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const isString = (value) => typeof value === "string";
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Query strings can arrive as objects (?role[$ne]=x), so only plain strings are used.
const readString = (value) => (isString(value) && value.trim() ? value.trim() : undefined);

const readBoolean = (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
};

const readPositiveInt = (value, fallback, max = Infinity) => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(n, max);
};

const getUsername = (req) => {
    const username = readString(req.params.username)?.toLowerCase();
    if (!username) throw new ApiError(400, "Username is required");
    return username;
};

// Fields safe to send to the admin UI (password and internals never leave the server).
const LIST_FIELDS =
    "fullName username mobile email college branch section rollNo avatar role isActive isDeleted deletedAt lastLoginAt createdAt";

// A CR is NOT stored in User.role. It is a ScheduleRole (per branch and section), so the
// admin views must read ScheduleRole too. The model is looked up by name at call time, which
// works because it is registered when the schedule-role routes load; no import path needed.
const getScheduleRole = () => mongoose.model("ScheduleRole");
const exactIgnoreCase = (text) => new RegExp(`^${escapeRegex(text)}$`, "i");

// Adds `scheduleRoles` (pending + active) to each user object.
const attachScheduleRoles = async (users) => {
    if (!users.length) return users;

    const rows = await getScheduleRole()
        .find({ userId: { $in: users.map((u) => u._id) }, isOpen: true })
        .select("userId role college branch section status")
        .lean();

    const byUser = new Map();
    for (const r of rows) {
        const key = String(r.userId);
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key).push({
            _id: r._id,
            role: r.role,
            college: r.college,
            branch: r.branch,
            section: r.section,
            status: r.status
        });
    }

    return users.map((u) => ({ ...u, scheduleRoles: byUser.get(String(u._id)) || [] }));
};

// Random temporary password: 12 chars, no look-alike characters (0/O, 1/l/I).
const generateTemporaryPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = crypto.randomBytes(12);
    let out = "";
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
};

// ---- LIST USERS (filters + search + pagination) ----
// GET /users?q=&role=&isActive=&isDeleted=&college=&branch=&section=&page=&limit=&sort=
// isDeleted defaults to "false"; pass isDeleted=true to see accounts waiting for deletion.
const listUsers = asyncHandler(async (req, res) => {
    const { q, role, isActive, isDeleted, college, branch, section, page, limit, sort } = req.query;

    const filter = {};

    const roleValue = readString(role);
    if (roleValue) {
        if (!USER_ROLES.includes(roleValue)) {
            throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
        }
        if (roleValue === "cr") {
            // CRs come from ScheduleRole, so include users with an active CR role there too.
            const crIds = await getScheduleRole().distinct("userId", {
                role: exactIgnoreCase("cr"),
                status: exactIgnoreCase("active"),
                isOpen: true
            });
            filter.$and = [{ $or: [{ role: "cr" }, { _id: { $in: crIds } }] }];
        } else {
            filter.role = roleValue;
        }
    }

    const active = readBoolean(isActive);
    if (active !== undefined) filter.isActive = active;

    filter.isDeleted = readBoolean(isDeleted) ?? false;

    for (const [key, value] of Object.entries({ college, branch, section })) {
        const text = readString(value);
        if (text) filter[key] = text;
    }

    const search = readString(q);
    if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            { username: pattern },
            { fullName: pattern },
            { mobile: pattern },
            { email: pattern },
            { rollNo: pattern }
        ];
    }

    const sortOptions = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        name: { fullName: 1 },
        lastLogin: { lastLoginAt: -1 }
    };
    const sortBy = sortOptions[readString(sort)] || sortOptions.newest;

    const pageNumber = readPositiveInt(page, 1);
    const pageSize = readPositiveInt(limit, DEFAULT_LIMIT, MAX_LIMIT);

    const [users, total] = await Promise.all([
        User.find(filter)
            .select(LIST_FIELDS)
            .sort(sortBy)
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .lean(),
        User.countDocuments(filter)
    ]);

    const usersWithRoles = await attachScheduleRoles(users);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                users: usersWithRoles,
                pagination: {
                    page: pageNumber,
                    limit: pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize) || 1
                }
            },
            "Users fetched successfully"
        )
    );
});

// ---- QUICK SEARCH (autocomplete / pick-a-user box) ----
// GET /users/search?q=ab   needs 2+ characters, returns at most 10 light records.
const searchUsers = asyncHandler(async (req, res) => {
    const search = readString(req.query.q);
    if (!search || search.length < 2) {
        throw new ApiError(400, "Search text must be at least 2 characters");
    }

    const pattern = new RegExp(escapeRegex(search), "i");

    const users = await User.find({
        isDeleted: false,
        $or: [{ username: pattern }, { fullName: pattern }, { mobile: pattern }, { rollNo: pattern }]
    })
        .select("fullName username mobile role branch section avatar isActive")
        .limit(10)
        .lean();

    return res
        .status(200)
        .json(new ApiResponse(200, { users, count: users.length }, "Search results fetched"));
});

// ---- GET ONE USER ----
// GET /users/:username   works for deleted accounts too, so admins can inspect before restoring.
const getUserByUsername = asyncHandler(async (req, res) => {
    const user = await User.findOne({ username: getUsername(req) })
        .select(`${LIST_FIELDS} activeSetupId updatedAt`)
        .lean();

    if (!user) throw new ApiError(404, "User not found");

    const [withRoles] = await attachScheduleRoles([user]);

    return res.status(200).json(new ApiResponse(200, withRoles, "User fetched successfully"));
});

// ---- RESET PASSWORD ----
// POST /users/:username/reset-password
// Body (optional): { "newPassword": "..." }. If omitted, a random temporary password is generated
// and returned ONCE in the response. Tell the user to change it after logging in.
// Old tokens stop working because passwordChangedAt is updated (verifyJWT rejects older tokens).
const resetUserPassword = asyncHandler(async (req, res) => {
    const target = await User.findOne({ username: getUsername(req) });
    if (!target) throw new ApiError(404, "User not found");

    if (target._id.equals(req.user._id)) {
        throw new ApiError(400, "Use the change password option for your own account");
    }
    if (target.role === "admin") {
        throw new ApiError(403, "You cannot reset another admin's password");
    }

    const supplied = req.body?.newPassword;
    let password;
    let generated = false;

    if (supplied === undefined || supplied === null || supplied === "") {
        password = generateTemporaryPassword();
        generated = true;
    } else {
        if (!isString(supplied)) throw new ApiError(400, "newPassword must be a string");
        if (supplied.length < MIN_PASSWORD_LENGTH) {
            throw new ApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (Buffer.byteLength(supplied, "utf8") > MAX_PASSWORD_BYTES) {
            throw new ApiError(400, `Password can be at most ${MAX_PASSWORD_BYTES} bytes`);
        }
        password = supplied;
    }

    target.password = password; // hashed by the pre-save hook
    target.passwordChangedAt = new Date();
    await target.save({ validateBeforeSave: false }); // password already checked above

    res.set("Cache-Control", "no-store");

    return res.status(200).json(
        new ApiResponse(
            200,
            generated
                ? { username: target.username, temporaryPassword: password }
                : { username: target.username },
            generated
                ? "Password reset. Share the temporary password with the user; it is not shown again."
                : "Password reset successfully"
        )
    );
});

// ---- SET ROLE DIRECTLY ----
// PATCH /users/:username/role   body: { "role": "cr" }
// Admin only, no request/approval flow. Cannot change your own role.
const setUserRole = asyncHandler(async (req, res) => {
    const newRole = req.body?.role;
    if (!isString(newRole) || !USER_ROLES.includes(newRole)) {
        throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
    }

    const target = await User.findOne({ username: getUsername(req), isDeleted: false });
    if (!target) throw new ApiError(404, "User not found");

    if (target._id.equals(req.user._id)) {
        throw new ApiError(403, "You cannot change your own role");
    }
    if (target.role === newRole) {
        throw new ApiError(400, `User already has the ${newRole} role`);
    }

    const updated = await User.findByIdAndUpdate(
        target._id,
        { role: newRole },
        { returnDocument: "after" }
    ).select(LIST_FIELDS);

    return res.status(200).json(new ApiResponse(200, updated, "User role updated successfully"));
});

// ---- ACTIVATE / DEACTIVATE ----
// PATCH /users/:username/status   body: { "isActive": false }
// Deactivating also logs the user out everywhere (passwordChangedAt is bumped).
const setUserActiveStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
        throw new ApiError(400, "isActive must be true or false");
    }

    const target = await User.findOne({ username: getUsername(req), isDeleted: false });
    if (!target) throw new ApiError(404, "User not found");

    if (target._id.equals(req.user._id)) {
        throw new ApiError(403, "You cannot change the status of your own account");
    }
    if (target.role === "admin") {
        throw new ApiError(403, "You cannot change the status of another admin");
    }
    if (target.isActive === isActive) {
        throw new ApiError(400, `User is already ${isActive ? "active" : "inactive"}`);
    }

    target.isActive = isActive;
    if (!isActive) target.passwordChangedAt = new Date();
    await target.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            { username: target.username, isActive: target.isActive },
            isActive ? "Account activated" : "Account deactivated and signed out everywhere"
        )
    );
});

// ---- FORCE LOGOUT (all devices) ----
// POST /users/:username/force-logout
// Useful for a lost phone or a shared device. Existing tokens are rejected by verifyJWT.
const forceLogoutUser = asyncHandler(async (req, res) => {
    const target = await User.findOne({ username: getUsername(req) });
    if (!target) throw new ApiError(404, "User not found");

    if (target.role === "admin" && !target._id.equals(req.user._id)) {
        throw new ApiError(403, "You cannot sign out another admin");
    }

    target.passwordChangedAt = new Date();
    await target.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, { username: target.username }, "User signed out from all devices"));
});

// ---- RESTORE A DELETED ACCOUNT ----
// POST /users/:username/restore
// Only inside the grace period; after it the permanent-deletion job owns the account.
const restoreDeletedUser = asyncHandler(async (req, res) => {
    const target = await User.findOne({ username: getUsername(req) });
    if (!target) throw new ApiError(404, "User not found");

    if (!target.isDeleted) {
        throw new ApiError(400, "This account is not scheduled for deletion");
    }

    const gracePeriodOver =
        !target.deletedAt ||
        Date.now() - target.deletedAt.getTime() >= ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;
    if (gracePeriodOver) {
        throw new ApiError(403, "The restore period has ended for this account");
    }

    target.isDeleted = false;
    target.deletedAt = null;
    await target.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, { username: target.username }, "Account restored successfully"));
});

// ---- DASHBOARD COUNTS ----
// GET /users/stats
const getUserStats = asyncHandler(async (req, res) => {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);

    const [total, active, inactive, pendingDeletion, newThisWeek, byRole] = await Promise.all([
        User.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDeleted: false, isActive: true }),
        User.countDocuments({ isDeleted: false, isActive: false }),
        User.countDocuments({ isDeleted: true }),
        User.countDocuments({ isDeleted: false, createdAt: { $gte: weekAgo } }),
        User.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ])
    ]);

    const roles = Object.fromEntries(USER_ROLES.map((r) => [r, 0]));
    for (const { _id, count } of byRole) roles[_id] = count;

    return res.status(200).json(
        new ApiResponse(
            200,
            { total, active, inactive, pendingDeletion, newThisWeek, roles },
            "User stats fetched successfully"
        )
    );
});

export {
    listUsers,
    searchUsers,
    getUserByUsername,
    resetUserPassword,
    setUserRole,
    setUserActiveStatus,
    forceLogoutUser,
    restoreDeletedUser,
    getUserStats
};