// middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    let decodedToken;
    try {
        decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
        throw new ApiError(401, "Invalid or expired token");
    }

    const user = await User.findById(decodedToken?._id).select("-password");

    // Deleted / inactive accounts cannot authenticate, even with an older valid token.
    if (!user || user.isDeleted || !user.isActive) {
        throw new ApiError(401, "Invalid access token");
    }

    // Token issued before the last password change -> session no longer valid.
    if (
        user.passwordChangedAt &&
        decodedToken.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
        throw new ApiError(401, "Session expired. Please log in again.");
    }

    req.user = user;
    next();
});