// middlewares/authorizeRoles.middleware.js
import { ApiError } from "../utils/ApiError.js";

// Must run after verifyJWT. Usage: authorizeRoles("moderator", "admin")
export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            throw new ApiError(403, "Access denied");
        }
        next();
    };
};